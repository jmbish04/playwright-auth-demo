/**
 * @fileoverview Job Posting Extractor Worker - Main Entry Point
 * 
 * This is the main Cloudflare Worker that orchestrates AI-powered job posting data extraction
 * from authenticated websites. It combines Puppeteer browser automation, AI vision analysis,
 * and Llama-4 language model capabilities to extract structured job data.
 * 
 * Key Features:
 * - Automatic authentication to job sites (LinkedIn, Indeed, Glassdoor)
 * - AI-powered vision analysis for understanding page layouts
 * - Structured data extraction using Llama-4 Scout model
 * - Comprehensive job posting schema with 50+ fields
 * - Asset collection (screenshots, HTML) with R2 storage
 * - Modular architecture for easy extension
 * 
 * Architecture:
 * - AuthService: Handles automated login flows using AI vision
 * - VisionAgent: Analyzes page layouts and guides automation
 * - Llama4Service: Extracts structured data using advanced language models
 * - D1 Database: Stores site configurations and job tracking
 * - R2 Storage: Stores collected assets (screenshots, HTML, etc.)
 * 
 * API Endpoints:
 * - POST /extract-job: Extract from URL with authentication
 * - POST /extract-text: Extract from plain text (no auth required)
 * - GET /health: Health check endpoint
 * - GET /: API information
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
 */

import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';
import type { JobExtractionRequest, JobExtractionResponse, SiteConfig } from './types';
// Env is globally available from worker-configuration.d.ts
import { AuthService } from './services/auth-service';
import { VisionAgent } from './services/vision-agent';
import { Llama4Service } from './services/llama4-service';
import { createWebSocketLogger, PerformanceTimer } from './services/websocket-logger';
import { jobPostingSchema } from './jobPostingSchema';

// Export Durable Object classes for compatibility
export { WebSocketHandlerDO } from './websocket-handler-do';

/**
 * Main Cloudflare Worker export handler
 * 
 * This is the entry point for all HTTP requests to the worker. It implements a simple
 * routing system and delegates to specialized handlers for different endpoints.
 * 
 * The worker follows RESTful principles:
 * - POST endpoints for data processing operations
 * - GET endpoints for status and information
 * - Proper HTTP status codes and error handling
 * - CORS support for web applications
 * 
 * Error Handling Strategy:
 * - All errors are caught at the top level
 * - Detailed error messages in development
 * - Structured error responses with appropriate HTTP status codes
 * - Request/response logging for debugging
 */
export default {
  /**
   * Main fetch handler for all incoming HTTP requests
   * 
   * @param request - The incoming HTTP request object
   * @param env - Cloudflare environment bindings (AI, DB, R2, etc.)
   * @returns Promise<Response> - HTTP response with job data or error
   * 
   * @example
   * // Extract job from URL
   * POST /extract-job
   * {
   *   "url": "https://www.linkedin.com/jobs/view/1234567890",
   *   "options": { "includeScreenshot": true }
   * }
   * 
   * @example
   * // Extract job from text
   * POST /extract-text
   * "Software Engineer at TechCorp, $120k-180k..."
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight requests for web applications
    // This allows the API to be called from browsers with proper CORS headers
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Parse the request URL to determine routing
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // WebSocket upgrade handling
      if (path === '/ws') {
        return await handleWebSocketUpgrade(request, env);
      }

      // API routes - handle these before checking static assets
      if (path.startsWith('/api/') || path === '/extract-job' || path === '/extract-text' || path === '/health') {
        switch (path) {
          case '/extract-job':
            // Handle URL-based job extraction with authentication
            return await handleJobExtraction(request, env);
          
          case '/extract-text':
            // Handle text-based job extraction (no authentication required)
            return await handleTextExtraction(request, env);
          
          case '/health':
            // Simple health check endpoint for monitoring
            return new Response('OK', { status: 200 });
          
          default:
            // Handle other API routes here in the future
            return new Response('API endpoint not found', { status: 404 });
        }
      }
      
      // For non-API routes, try to serve static assets first
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        // If we get a successful response from assets, return it
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (error) {
        // Asset fetch failed, continue to fallback
      }
      
      // Fallback for root path when no static asset matches
      if (path === '/') {
        return new Response('Job Posting Extractor API - Use POST /extract-job with a URL', { status: 200 });
      }
      
      // 404 for unknown paths
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      // Top-level error handling - catches any unhandled errors
      console.error('Request handling error:', error);
      return new Response(`Internal Server Error: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

/**
 * Handle job extraction from a URL with automatic authentication
 * 
 * This is the main handler for URL-based job extraction. It orchestrates the entire
 * process from authentication through data extraction and response formatting.
 * 
 * Process Flow:
 * 1. Validate request and extract parameters
 * 2. Initialize AI services (Auth, Vision, Llama-4)
 * 3. Check if site requires authentication via D1 lookup
 * 4. Launch Puppeteer browser with realistic settings
 * 5. Authenticate to site if required (AI-guided)
 * 6. Navigate to target job posting URL
 * 7. Extract structured data using AI vision + Llama-4
 * 8. Generate human-readable summary
 * 9. Collect optional assets (screenshots, HTML)
 * 10. Return structured response with timing metrics
 * 
 * @param request - HTTP request containing job URL and options
 * @param env - Cloudflare environment bindings
 * @returns Promise<Response> - Structured job data or error response
 * 
 * @example
 * Request body:
 * {
 *   "url": "https://www.linkedin.com/jobs/view/1234567890",
 *   "options": {
 *     "includeScreenshot": true,
 *     "customInstructions": "Focus on salary details"
 *   }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": { jobTitle: "...", companyName: "...", ... },
 *   "summary": "Human-readable job summary",
 *   "assets": [{ screenshot URLs }],
 *   "processingTime": 12500
 * }
 */
async function handleJobExtraction(request: Request, env: Env): Promise<Response> {
  // Validate HTTP method - only POST requests are accepted
  if (request.method !== 'POST') {
    return new Response('Expected a POST request', { status: 405 });
  }

  // Start timing for performance metrics
  const startTime = Date.now();
  let browser: Browser | null = null;

  // Create WebSocket logger for real-time updates
  const sessionId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createWebSocketLogger(env, sessionId);
  const overallTimer = new PerformanceTimer(logger, 'Job Extraction');

  try {
    logger.info('system', 'Starting job extraction process', { sessionId });

    // Parse and validate request body
    const requestData: JobExtractionRequest = await request.json();
    
    if (!requestData.url) {
      logger.error('system', 'URL is required in request body');
      return new Response('URL is required', { status: 400 });
    }

    logger.info('system', `Processing URL: ${requestData.url}`, { url: requestData.url });

    // Initialize AI services - each service handles a specific aspect of the extraction
    const authService = new AuthService(env);      // Handles automated login flows
    const visionAgent = new VisionAgent(env);      // Analyzes page layouts with AI vision
    const llama4Service = new Llama4Service(env);  // Extracts structured data with Llama-4

    logger.info('system', 'AI services initialized', { 
      services: ['AuthService', 'VisionAgent', 'Llama4Service'] 
    });

    // Check if the target URL requires authentication by querying D1 database
    // This lookup matches URL patterns to site configurations
    logger.info('system', 'Checking for site authentication configuration');
    const siteConfig = await authService.getSiteConfig(requestData.url);
    
    if (siteConfig) {
      logger.info('system', `Found authentication configuration for ${siteConfig.url_pattern}`, { siteConfig });
    } else {
      logger.info('system', 'No authentication required for this site');
    }
    
    // Launch Puppeteer browser with Cloudflare's Browser Rendering API
    logger.info('puppeteer', 'Launching browser instance');
    const browserTimer = new PerformanceTimer(logger, 'Browser Launch');
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    browserTimer.end();

    // Configure browser to appear human-like and avoid detection
    // Use realistic user agent and viewport dimensions
    logger.puppeteerAction('setUserAgent', undefined, { 
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    logger.puppeteerAction('setViewport', undefined, { width: 1920, height: 1080 });
    await page.setViewport({ width: 1920, height: 1080 });

    let authResult = null;
    
    // Perform authentication if site configuration was found
    if (siteConfig) {
      logger.info('system', `Authentication required for ${siteConfig.url_pattern}`);
      
      // Use AI-guided authentication - the AuthService uses vision analysis
      // to understand login forms and automatically fill credentials
      const authTimer = new PerformanceTimer(logger, 'Authentication');
      logger.info('system', 'Starting AI-guided authentication process');
      
      const authSuccess = await authService.authenticate(page, siteConfig);
      authTimer.end({ success: authSuccess });
      
      if (!authSuccess) {
        logger.error('system', 'Authentication failed');
        overallTimer.end({ success: false, error: 'Authentication failed' });
        
        // Authentication failed - return 401 with timing metrics
        return Response.json({
          success: false,
          error: 'Authentication failed',
          processingTime: Date.now() - startTime
        } as JobExtractionResponse, { status: 401 });
      }
      
      logger.success('system', 'Authentication completed successfully');
      authResult = { success: true, message: 'Authentication successful' };
    }

    // Navigate to the target job posting URL
    logger.info('puppeteer', `Navigating to target URL: ${requestData.url}`);
    const navTimer = new PerformanceTimer(logger, 'Page Navigation');
    
    await page.goto(requestData.url, { 
      waitUntil: 'domcontentloaded',  // Wait for DOM to be ready
      timeout: 30000                  // 30 second timeout
    });
    navTimer.end({ url: requestData.url });

    // Allow page to fully stabilize - important for dynamic content
    // Many job sites load content asynchronously after initial page load
    logger.info('puppeteer', 'Waiting for page to stabilize (3 seconds)');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take initial screenshot for AI analysis
    logger.info('puppeteer', 'Capturing page screenshot for AI analysis');
    const screenshotTimer = new PerformanceTimer(logger, 'Screenshot Capture');
    const screenshot = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshot.toString('base64');
    screenshotTimer.end({ size: screenshot.length });
    
    // Broadcast screenshot to WebSocket clients
    logger.screenshot('Page loaded and ready for analysis', screenshotBase64, {
      url: requestData.url,
      timestamp: new Date().toISOString()
    });

    // Extract job data using AI vision analysis
    logger.info('ai', 'Starting AI vision analysis of the page');
    const visionTimer = new PerformanceTimer(logger, 'Vision Analysis');
    const jobData = await visionAgent.extractJobData(page);
    visionTimer.end({ extractedFields: Object.keys(jobData || {}).length });
    
    logger.aiThought('Vision analysis completed', 'Extracted initial job data structure from page layout and visual elements', jobData);
    
    // Get additional context for more accurate extraction
    logger.info('extraction', 'Gathering additional page context');
    const htmlContent = await page.content();
    const pageTitle = await page.title();
    
    logger.info('extraction', 'Page context gathered', {
      title: pageTitle,
      htmlLength: htmlContent.length,
      url: requestData.url
    });
    
    // Use Llama-4 for comprehensive structured data extraction
    // This combines vision analysis with HTML content for maximum accuracy
    logger.info('ai', 'Starting Llama-4 structured data extraction');
    const extractionTimer = new PerformanceTimer(logger, 'Llama-4 Extraction');
    
    const structuredData = await llama4Service.extractJobPosting(
      JSON.stringify(jobData),
      {
        url: requestData.url,
        visionDescription: 'Extracted via vision agent',
        htmlContent: htmlContent
      }
    );
    extractionTimer.end({ success: !!structuredData });
    
    logger.aiThought('Structured data extraction completed', 'Combined vision analysis with HTML content to create comprehensive job posting data', {
      jobTitle: structuredData.jobTitle,
      companyName: structuredData.companyName,
      location: structuredData.location
    });

    // Generate human-readable summary using Llama-4
    logger.info('ai', 'Generating human-readable job summary');
    const summaryTimer = new PerformanceTimer(logger, 'Summary Generation');
    const summary = await llama4Service.generateJobSummary(structuredData);
    summaryTimer.end({ summaryLength: summary?.length || 0 });

    // Collect optional assets based on request parameters
    const assets = [];
    
    if (requestData.options?.includeScreenshot) {
      logger.info('system', 'Including screenshot in response assets');
      // Use the screenshot we already captured
      // TODO: In production, save screenshot to R2 bucket and return actual URL
      // For now, return placeholder data structure
      assets.push({
        id: 1,
        scrape_id: 1,
        name: 'screenshot.png',
        type: 'screenshot',
        r2_key: 'screenshots/job-screenshot.png',
        r2_url: 'https://example.com/screenshot.png',
        created_at: new Date().toISOString()
      });
    }

    // Complete the overall timing
    const totalTime = overallTimer.end({ 
      success: true, 
      jobTitle: structuredData.jobTitle,
      companyName: structuredData.companyName 
    });

    logger.success('system', 'Job extraction completed successfully', {
      processingTime: totalTime,
      jobTitle: structuredData.jobTitle,
      companyName: structuredData.companyName,
      location: structuredData.location
    });

    // Construct successful response with all extracted data
    const response: JobExtractionResponse = {
      success: true,
      data: structuredData,      // Structured job data following comprehensive schema
      summary,                   // Human-readable summary
      assets,                    // Optional assets (screenshots, etc.)
      processingTime: Date.now() - startTime  // Performance metrics
    };

    return Response.json(response, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',  // Allow CORS for web applications
      },
    });

  } catch (error) {
    // Comprehensive error handling with detailed logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('system', 'Job extraction failed', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined 
    });
    
    overallTimer.end({ success: false, error: errorMessage });
    
    const response: JobExtractionResponse = {
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime
    };

    return Response.json(response, { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } finally {
    // Always clean up browser resources to prevent memory leaks
    // This is critical in a serverless environment
    if (browser) {
      logger.info('system', 'Cleaning up browser resources');
      await browser.close();
      logger.debug('system', 'Browser closed successfully');
    }
  }
}

/**
 * Handle text-based job extraction without authentication
 * 
 * This handler processes plain text job postings and extracts structured data
 * using Llama-4. It's useful for processing job descriptions that have already
 * been copied from websites or received through other channels.
 * 
 * This endpoint is simpler than URL-based extraction because it:
 * - Doesn't require browser automation
 * - Doesn't need authentication
 * - Processes text directly with AI models
 * - Has faster response times
 * - Uses fewer resources
 * 
 * Use Cases:
 * - Processing job descriptions from emails
 * - Bulk processing of text-based job data
 * - Testing extraction logic without web scraping
 * - Processing jobs from sites not yet configured for authentication
 * 
 * @param request - HTTP request containing plain text job posting
 * @param env - Cloudflare environment bindings (primarily AI binding)
 * @returns Promise<Response> - Structured job data or error response
 * 
 * @example
 * Request body (plain text):
 * "Software Engineer - Full Stack
 *  Company: TechCorp
 *  Location: San Francisco, CA
 *  Salary: $120,000 - $180,000 per year
 *  
 *  We're looking for a senior developer..."
 * 
 * Response:
 * {
 *   "jobTitle": "Software Engineer - Full Stack",
 *   "companyName": "TechCorp",
 *   "location": "San Francisco, CA",
 *   "compensation": { ... },
 *   ...
 * }
 */
async function handleTextExtraction(request: Request, env: Env): Promise<Response> {
  // Validate HTTP method - only POST requests are accepted
  if (request.method !== 'POST') {
    return new Response('Expected a POST request', { status: 405 });
  }

  // Create WebSocket logger for real-time updates
  const sessionId = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const logger = createWebSocketLogger(env, sessionId);
  const overallTimer = new PerformanceTimer(logger, 'Text Extraction');

  try {
    logger.info('system', 'Starting text-based job extraction', { sessionId });

    // Extract plain text from request body
    const jobPostingText = await request.text();
    
    // Validate that text content was provided
    if (!jobPostingText || jobPostingText.trim().length === 0) {
      logger.error('system', 'Request body cannot be empty');
      return new Response('Request body cannot be empty', { status: 400 });
    }

    logger.info('extraction', 'Processing job posting text', { 
      textLength: jobPostingText.length,
      preview: jobPostingText.substring(0, 200) + '...'
    });

    // Initialize Llama-4 service for structured data extraction
    const llama4Service = new Llama4Service(env);
    logger.info('system', 'Llama-4 service initialized');
    
    // Extract structured data directly from text using Llama-4
    logger.info('ai', 'Starting Llama-4 text extraction');
    const extractionTimer = new PerformanceTimer(logger, 'Llama-4 Text Extraction');
    // This bypasses the need for browser automation and vision analysis
    const extractedData = await llama4Service.extractJobPosting(jobPostingText);
    extractionTimer.end({ success: !!extractedData });

    logger.aiThought('Text extraction completed', 'Successfully extracted structured data from plain text job posting', {
      jobTitle: extractedData.jobTitle,
      companyName: extractedData.companyName,
      location: extractedData.location
    });

    const totalTime = overallTimer.end({ 
      success: true, 
      jobTitle: extractedData.jobTitle,
      companyName: extractedData.companyName 
    });

    logger.success('system', 'Text extraction completed successfully', {
      processingTime: totalTime,
      jobTitle: extractedData.jobTitle,
      companyName: extractedData.companyName
    });

    // Return structured data with CORS headers for web compatibility
    return Response.json(extractedData, {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',  // Allow cross-origin requests
      },
    });

  } catch (error) {
    // Handle extraction errors with detailed logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error('system', 'Text extraction failed', { 
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined 
    });
    
    overallTimer.end({ success: false, error: errorMessage });
    
    // Return user-friendly error message
    return new Response(`Error extracting job posting data: ${errorMessage}`, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

/**
 * Handle WebSocket upgrade requests
 * 
 * This function handles WebSocket connection requests by forwarding them to the
 * WebSocketHandlerDO Durable Object. The Durable Object manages all WebSocket
 * connections and provides real-time updates during scraping operations.
 * 
 * @param request - The WebSocket upgrade request
 * @param env - Cloudflare environment bindings
 * @returns Promise<Response> - WebSocket upgrade response
 */
async function handleWebSocketUpgrade(request: Request, env: Env): Promise<Response> {
  try {
    // Get the Durable Object instance for WebSocket handling
    // Using a fixed ID ensures all connections go to the same instance
    const id = env.WEBSOCKET_HANDLER_DO.idFromName('websocket-handler');
    const durableObject = env.WEBSOCKET_HANDLER_DO.get(id);
    
    // Forward the request to the Durable Object
    return await durableObject.fetch(request);
  } catch (error) {
    console.error('WebSocket upgrade failed:', error);
    return new Response('WebSocket upgrade failed', { status: 500 });
  }
}

