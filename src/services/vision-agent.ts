/**
 * @fileoverview AI Vision Agent for Web Page Analysis and Automation
 * 
 * This service provides AI-powered vision analysis capabilities for understanding
 * web page layouts and guiding browser automation. It combines Cloudflare's vision
 * models with Llama-4's reasoning capabilities to create an intelligent automation
 * system that can adapt to different website designs and layouts.
 * 
 * Key Capabilities:
 * - Screenshot analysis using computer vision models
 * - Page layout understanding and element identification
 * - Action reasoning and decision making
 * - Structured data extraction from visual content
 * - Adaptive automation that works across different sites
 * - Context-aware interaction planning
 * 
 * Vision Analysis Pipeline:
 * 1. Capture page screenshot (full or targeted)
 * 2. Analyze visual content with AI vision models
 * 3. Generate textual description of page layout
 * 4. Use Llama-4 to reason about next actions
 * 5. Return structured action recommendations
 * 
 * Use Cases:
 * - Form field identification and interaction
 * - Button and link detection
 * - Content extraction and analysis
 * - UI state verification
 * - Accessibility analysis
 * - Dynamic content handling
 * 
 * The agent is designed to be resilient to UI changes by focusing on visual
 * understanding rather than hardcoded selectors or DOM structure assumptions.
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
 */

import type { Page } from '@cloudflare/puppeteer';
// Env is now globally available from worker-configuration.d.ts
import { AI_MODELS, MODEL_CONFIGS } from './model-config';

/**
 * Vision Analysis Result Interface
 * 
 * Represents the structured output from AI vision analysis, including
 * recommended actions, reasoning, and confidence metrics.
 */
export interface VisionAnalysis {
  /** The recommended action type based on visual analysis */
  action: 'type' | 'click' | 'wait' | 'navigate' | 'extract' | 'none';
  
  /** CSS selector for the target element (for type/click actions) */
  selector?: string;
  
  /** Text content to input or URL to navigate to */
  text?: string;
  
  /** AI's reasoning for the recommended action */
  reasoning: string;
  
  /** Confidence score (0.0 to 1.0) for the recommendation */
  confidence: number;
  
  /** Whether the goal has been successfully achieved */
  success?: boolean;
  
  /** Additional extracted data or context */
  data?: any;
}

/**
 * AI Vision Agent Class
 * 
 * Provides intelligent web page analysis and automation guidance using
 * computer vision and language models. The agent can understand page
 * layouts, identify interactive elements, and recommend appropriate actions.
 * 
 * @example
 * const visionAgent = new VisionAgent(env);
 * const analysis = await visionAgent.analyzePageForAction(page, "Find the login button");
 * if (analysis.action === 'click') {
 *   await page.click(analysis.selector);
 * }
 */
export class VisionAgent {
  /**
   * Initialize the Vision Agent
   * 
   * @param env - Cloudflare environment bindings containing AI models
   */
  constructor(private env: Env) {}

  /**
   * Analyze a page and determine the next action to take
   * 
   * This is the primary method for AI-guided web automation. It captures a screenshot
   * of the current page, analyzes it with computer vision, and uses AI reasoning to
   * determine the best next action to achieve a specified goal.
   * 
   * Analysis Process:
   * 1. Capture viewport screenshot for visual analysis
   * 2. Extract page context (URL, title) for additional context
   * 3. Use vision model to generate textual description of page layout
   * 4. Apply Llama-4 reasoning to determine optimal next action
   * 5. Return structured action recommendation with confidence score
   * 
   * The method is designed to work across different websites and UI patterns
   * by focusing on visual understanding rather than hardcoded assumptions.
   * 
   * @param page - Puppeteer page instance to analyze
   * @param goal - Natural language description of what you want to achieve
   * @returns Promise<VisionAnalysis> - Structured action recommendation
   * 
   * @example
   * // Find and interact with login form
   * const analysis = await analyzePageForAction(page, "Find the username input field");
   * if (analysis.action === 'type' && analysis.selector) {
   *   await page.type(analysis.selector, username);
   * }
   * 
   * @example
   * // Navigate through multi-step process
   * const analysis = await analyzePageForAction(page, "Click the submit button to proceed");
   * if (analysis.action === 'click') {
   *   await page.click(analysis.selector);
   * }
   */
  async analyzePageForAction(page: Page, goal: string): Promise<VisionAnalysis> {
    try {
      // Capture viewport screenshot for vision analysis
      // Using viewport (not full page) for faster processing and focus on visible content
      const screenshot = await page.screenshot({ 
        fullPage: false,  // Focus on visible viewport for better performance
        type: 'png'       // PNG format for better quality with vision models
      });

      // Extract page context for additional reasoning context
      const url = page.url();
      const title = await page.title();
      
      // Step 1: Analyze screenshot with computer vision model
      // This generates a textual description of what's visible on the page
      const visionDescription = await this.getVisionDescription(screenshot, goal);
      
      // Step 2: Use Llama-4 to reason about the next action
      // Combines vision analysis with goal to determine best action
      const analysis = await this.getActionReasoning(visionDescription, goal, url, title);
      
      return analysis;

    } catch (error) {
      // Handle analysis failures gracefully
      console.error('Vision analysis failed:', error instanceof Error ? error.message : String(error));
      return {
        action: 'none',
        reasoning: `Vision analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0
      };
    }
  }

  /**
   * Extract structured data from a job posting page
   * 
   * This method specializes in extracting comprehensive job posting information
   * by combining visual analysis with HTML content parsing. It's designed to
   * work across different job sites and extract standardized data structures.
   * 
   * Extraction Process:
   * 1. Capture full-page screenshot for complete visual context
   * 2. Extract HTML content for text-based analysis
   * 3. Use vision model to identify and describe job posting elements
   * 4. Apply Llama-4 to extract structured data following job schema
   * 5. Return comprehensive job posting data object
   * 
   * The method combines visual understanding (for layout and formatting cues)
   * with text analysis (for detailed content extraction) to achieve high
   * accuracy across different job site designs.
   * 
   * @param page - Puppeteer page instance containing job posting
   * @returns Promise<any> - Structured job posting data object
   * 
   * @example
   * const jobData = await extractJobData(page);
   * console.log(jobData.jobTitle);     // "Senior Software Engineer"
   * console.log(jobData.companyName);  // "TechCorp Inc."
   * console.log(jobData.compensation); // { baseSalary: { min: 120000, max: 180000 } }
   * 
   * @throws Error if extraction fails or page content cannot be analyzed
   */
  async extractJobData(page: Page): Promise<any> {
    try {
      // Capture full-page screenshot for comprehensive visual analysis
      // Full page capture ensures we don't miss job details below the fold
      const screenshot = await page.screenshot({ 
        fullPage: true,  // Capture entire page content, not just viewport
        type: 'png'      // PNG for high quality vision analysis
      });

      // Extract additional context for multi-modal analysis
      const content = await page.content();  // HTML content for text extraction
      const url = page.url();                // Source URL for platform identification
      const title = await page.title();      // Page title for additional context

      // Step 1: Analyze screenshot with computer vision
      // Focus on identifying job posting structure and visual elements
      const visionDescription = await this.getVisionDescription(
        screenshot, 
        "Analyze this job posting page and describe all visible job details including title, company, location, salary, requirements, and any other relevant information."
      );

      // Step 2: Extract structured data using multi-modal approach
      // Combines vision analysis with HTML content for comprehensive extraction
      const jobData = await this.extractStructuredJobData(visionDescription, content, url, title);
      
      return jobData;

    } catch (error) {
      console.error('Job data extraction failed:', error);
      throw error;
    }
  }

  /**
   * Generate textual description of screenshot using computer vision
   * 
   * This method uses Cloudflare's LLaVA vision model to analyze screenshots
   * and generate detailed textual descriptions. The descriptions are then
   * used by language models for reasoning and decision making.
   * 
   * Vision Model Details:
   * - Model: @cf/llava-hf/llava-1.5-7b-hf (LLaVA 1.5 7B parameters)
   * - Input: Screenshot buffer + text prompt
   * - Output: Detailed textual description of visual content
   * - Token limit: 512 tokens for efficient processing
   * 
   * The method handles various types of visual content including:
   * - Form elements and input fields
   * - Buttons and interactive elements
   * - Text content and layouts
   * - Images and visual indicators
   * - Navigation elements and menus
   * 
   * @param screenshot - Screenshot buffer to analyze
   * @param prompt - Specific prompt to guide the vision analysis
   * @returns Promise<string> - Textual description of the screenshot
   * 
   * @private
   */
  private async getVisionDescription(screenshot: Buffer, prompt: string): Promise<string> {
    try {
      // Use optimized vision model from configuration
      const visionConfig = MODEL_CONFIGS[AI_MODELS.VISION];
      const response = await this.env.AI.run(AI_MODELS.VISION as any, {
        image: Array.from(new Uint8Array(screenshot)),  // Convert buffer to Uint8Array for AI model
        prompt: prompt,                          // Guide the vision analysis with specific prompt
        max_tokens: visionConfig.maxTokens       // Use configured token limit
      });

      // Extract description from response, with fallback for missing data
      return (response as any).description || "Could not analyze the image.";
    } catch (error) {
      // Handle vision model failures gracefully
      console.error('Vision model failed:', error instanceof Error ? error.message : String(error));
      return "Vision analysis unavailable.";
    }
  }

  /**
   * Generate action reasoning using Llama-4 based on vision analysis
   * 
   * This method takes the textual description from vision analysis and uses
   * Llama-4's reasoning capabilities to determine the best next action. It
   * considers the goal, page context, and visual analysis to make intelligent
   * automation decisions.
   * 
   * Reasoning Process:
   * 1. Combine vision description with goal and context
   * 2. Use Llama-4 to analyze the situation and determine best action
   * 3. Generate specific CSS selectors for interaction
   * 4. Provide confidence scores and reasoning explanations
   * 5. Return structured action recommendation
   * 
   * Supported Action Types:
   * - 'type': Enter text into input fields
   * - 'click': Click buttons, links, or interactive elements
   * - 'wait': Wait for page loading or dynamic content
   * - 'navigate': Navigate to different URLs
   * - 'extract': Extract data from current page
   * - 'none': Goal achieved or no action needed
   * 
   * @param visionDescription - Textual description from vision analysis
   * @param goal - The objective to achieve
   * @param url - Current page URL for context
   * @param title - Current page title for context
   * @returns Promise<VisionAnalysis> - Structured action recommendation
   * 
   * @private
   */
  /**
   * Generate action reasoning using GPT-OSS-120B optimized for agentic tasks
   * 
   * This method uses GPT-OSS-120B which is specifically designed for "powerful reasoning,
   * agentic tasks, and versatile developer use cases" - making it ideal for web automation
   * decision making based on vision analysis.
   * 
   * @param visionDescription - Textual description from LLaVA vision analysis
   * @param goal - The objective to achieve
   * @param url - Current page URL for context
   * @param title - Current page title for context
   * @returns Promise<VisionAnalysis> - Structured action recommendation
   * 
   * @private
   */
  private async getActionReasoning(
    visionDescription: string, 
    goal: string, 
    url: string, 
    title: string
  ): Promise<VisionAnalysis> {
    const prompt = `
You are an expert web automation agent specialized in browser automation and Puppeteer actions.

CONTEXT:
- Current URL: ${url}
- Page Title: ${title}
- Goal: ${goal}
- Vision Analysis: ${visionDescription}

Based on this information, determine the single best next action for browser automation. Respond with a JSON object only.

For typing text into an input field:
{
  "action": "type",
  "selector": "CSS selector for the input element",
  "text": "text to type (leave empty, will be provided separately)",
  "reasoning": "why this action was chosen",
  "confidence": 0.95
}

For clicking an element:
{
  "action": "click", 
  "selector": "CSS selector for the element to click",
  "reasoning": "why this action was chosen",
  "confidence": 0.90
}

For waiting (when page is loading or needs time):
{
  "action": "wait",
  "reasoning": "why waiting is needed",
  "confidence": 0.80
}

For navigation (when current page is wrong):
{
  "action": "navigate",
  "text": "URL to navigate to",
  "reasoning": "why navigation is needed", 
  "confidence": 0.85
}

For successful completion:
{
  "action": "none",
  "success": true,
  "reasoning": "goal has been achieved",
  "confidence": 0.95
}

IMPORTANT: 
- Use specific CSS selectors (prefer ID, name, or unique class names)
- Common selectors: input[type="email"], input[type="password"], button[type="submit"]
- For LinkedIn: input[name="session_key"], input[name="session_password"], button[data-id="sign-in-form__submit-btn"]
- Confidence should be 0.0-1.0 based on how certain you are
- Only return the JSON object, no other text
`;

    try {
      // Use optimized reasoning model from configuration
      const reasoningConfig = MODEL_CONFIGS[AI_MODELS.REASONING];
      const response = await this.env.AI.run(AI_MODELS.REASONING as any, {
        messages: [
          {
            role: 'system',
            content: 'You are an expert web automation agent specialized in browser automation and Puppeteer actions. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: reasoningConfig.maxTokens,
        temperature: reasoningConfig.temperature
      });

      const analysis = JSON.parse((response as any).response);
      
      // Validate and set defaults
      return {
        action: analysis.action || 'none',
        selector: analysis.selector,
        text: analysis.text,
        reasoning: analysis.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, analysis.confidence || 0.5)),
        success: analysis.success
      };

    } catch (error) {
      console.error('Action reasoning failed:', error);
      return {
        action: 'none',
        reasoning: `Reasoning failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0
      };
    }
  }

  private async extractStructuredJobData(
    visionDescription: string,
    htmlContent: string,
    url: string,
    title: string
  ): Promise<any> {
    const prompt = `
You are an expert at extracting structured job posting data. Analyze the provided information and extract comprehensive job details.

CONTEXT:
- URL: ${url}
- Page Title: ${title}
- Vision Analysis: ${visionDescription}
- HTML Content: ${htmlContent.substring(0, 8000)}...

Extract all available job posting information and return it as a structured JSON object following this schema:

{
  "jobTitle": "string - the job title",
  "companyName": "string - company name", 
  "location": "string - job location",
  "jobType": "Full-time|Part-time|Contract|Temporary|Internship|Freelance",
  "seniorityLevel": "string - seniority level if mentioned",
  "responsibilities": ["array of key responsibilities"],
  "qualifications": ["array of required/preferred qualifications"],
  "skills": ["array of mentioned skills/technologies"],
  "compensation": {
    "baseSalary": {
      "currency": "USD",
      "min": 0,
      "max": 0,
      "period": "year|month|hour"
    }
  },
  "application": {
    "applyUrl": "string - application URL if found",
    "isAcceptingApplications": true
  },
  "timeline": {
    "postedAt": "ISO date string if found"
  },
  "source": {
    "sourcePlatform": "LinkedIn|Indeed|Glassdoor|etc",
    "sourceUrl": "${url}",
    "scrapedAt": "${new Date().toISOString()}"
  },
  "descriptionTextRaw": "string - raw job description text"
}

IMPORTANT:
- Extract as much information as possible
- Use null for missing fields rather than empty strings
- Be accurate with salary/compensation parsing
- Include all skills and technologies mentioned
- Return valid JSON only
`;

    try {
      const response = await this.env.AI.run('@cf/meta/llama-4-scout-17b-16e-instruct', {
        messages: [
          {
            role: 'system', 
            content: 'You are a job posting data extraction expert. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0.1
      });

      return JSON.parse(response.response);

    } catch (error) {
      console.error('Job data extraction failed:', error);
      throw new Error(`Failed to extract job data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
