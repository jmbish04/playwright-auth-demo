/**
 * @file src/websocket-handler.ts
 * @description This file contains the primary logic for handling WebSocket messages.
 * The `WebSocketHandler` class is instantiated within the Durable Object (`WebSocketHandlerDO`)
 * to process incoming commands like initiating a scrape or creating site configurations.
 * It acts as the orchestrator, interacting with the D1 database and the modular services
 * (AuthService, VisionAgent, Llama4Service), and uses the Durable Object's `broadcast` method 
 * to send real-time updates to all connected clients.
 */

import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';
import type { SiteConfig, JobConfig, ExtractedAsset } from './types';
// Env is globally available from worker-configuration.d.ts
import { AuthService } from './services/auth-service';
import { VisionAgent } from './services/vision-agent';
import { Llama4Service } from './services/llama4-service';
import { jobPostingSchema } from './jobPostingSchema';
import { createSiteConfigMatcher, extractBaseUrl } from './utils/url-utils';
import { createR2AssetManager } from './utils/r2-utils';
import type { WebSocketHandlerDO } from './websocket-handler-do';

/**
 * @description A helper function to introduce a delay.
 * @param ms - The number of milliseconds to wait.
 * @returns A promise that resolves after the specified delay.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Define the structure of incoming and outgoing WebSocket messages for clarity.
interface WSMessage {
  type: string;
  data?: any;
}

interface WSResponse {
  type: string;
  data?: any;
  error?: string;
}

/**
 * @class WebSocketHandler
 * @description Provides the business logic for the WebSocket server. It processes messages
 * received by the Durable Object, performs actions such as database operations or starting
 * a scrape job, and sends responses back to clients via the Durable Object.
 */
export class WebSocketHandler {
  private do: WebSocketHandlerDO;
  private env: Env;

  /**
   * @constructor
   * @param {WebSocketHandlerDO} durableObject - The instance of the Durable Object that owns this handler.
   * @param {Env} env - The Cloudflare environment bindings.
   */
  constructor(durableObject: WebSocketHandlerDO, env: Env) {
    this.do = durableObject;
    this.env = env;
  }

  /**
   * @method handleMessage
   * @description The main message router. It takes an incoming WebSocket message and calls the
   * appropriate handler method based on the message `type`.
   * @param {WSMessage} message - The parsed WebSocket message from a client.
   * @returns {Promise<void>}
   */
  public async handleMessage(message: WSMessage): Promise<void> {
    switch (message.type) {
      case 'create_site_config':
        await this.createSiteConfig(message.data);
        break;
      case 'initiate_scrape':
        await this.initiateScrape(message.data);
        break;
      case 'list_scrapes':
        await this.listScrapes();
        break;
      case 'get_scrape_status':
        await this.getScrapeStatus(message.data.scrapeId);
        break;
      default:
        this.sendError(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * @method createSiteConfig
   * @private
   * @description Handles the 'create_site_config' message. It inserts a new site configuration
   * into the D1 database for managing authentication on a new site.
   * @param {SiteConfig} data - The site configuration data from the client.
   * @returns {Promise<void>}
   */
  private async createSiteConfig(data: SiteConfig) {
    try {
      const result = await this.env.DB.prepare(
        `INSERT INTO site_config (url_pattern, username_secret_var, password_secret_var, login_url, login_agent_instructions)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(
        data.url_pattern,
        data.username_secret_var,
        data.password_secret_var,
        data.login_url,
        data.login_agent_instructions || null
      ).run();

      this.sendSuccess({
        message: 'Site config created',
        id: result.meta.last_row_id,
        reminder: `Remember to set secrets: wrangler secret put ${data.username_secret_var} and wrangler secret put ${data.password_secret_var}`
      });
    } catch (error) {
      this.sendError(`Failed to create site config: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @method initiateScrape
   * @private
   * @description Handles the 'initiate_scrape' message. It creates a new job configuration and a scrape job
   * in the database, determines if authentication is needed, and then starts the scraping process asynchronously.
   * @param {{ url: string; jobConfig?: Partial<JobConfig> }} data - The data required to start a scrape.
   * @returns {Promise<void>}
   */
  private async initiateScrape(data: { url: string; jobConfig?: Partial<JobConfig> }) {
    try {
      // 1. Create and save the job configuration.
      const jobConfig: JobConfig = {
        id: 0, // Placeholder, will be set by DB
        timestamp: new Date().toISOString(), // Placeholder
        starting_url: data.url,
        agent_instructions: data.jobConfig?.agent_instructions,
        collect_pdf: data.jobConfig?.collect_pdf ?? false,
        collect_json: data.jobConfig?.collect_json ?? true,
        collect_html: data.jobConfig?.collect_html ?? true,
        collect_screenshot: data.jobConfig?.collect_screenshot ?? true
      };

      const jobResult = await this.env.DB.prepare(
        `INSERT INTO job_config (starting_url, agent_instructions, collect_pdf, collect_json, collect_html, collect_screenshot)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        jobConfig.starting_url,
        jobConfig.agent_instructions || null,
        jobConfig.collect_pdf ? 1 : 0,
        jobConfig.collect_json ? 1 : 0,
        jobConfig.collect_html ? 1 : 0,
        jobConfig.collect_screenshot ? 1 : 0
      ).run();

      const jobConfigId = jobResult.meta.last_row_id as number;
      jobConfig.id = jobConfigId;

      // 2. Check if a site configuration matches the URL, indicating authentication is needed.
      const baseUrl = extractBaseUrl(data.url);
      const matcher = createSiteConfigMatcher(this.env);
      const siteConfigResult = await matcher.findSiteConfig(data.url);

      // 3. Create the main scrape job entry in the database.
      const scrapeResult = await this.env.DB.prepare(
        `INSERT INTO scrape_jobs (job_config_id, site_config_id, full_url, base_url, status)
         VALUES (?, ?, ?, ?, 'not_started')`
      ).bind(
        jobConfigId,
        siteConfigResult?.id || null,
        data.url,
        baseUrl
      ).run();

      const scrapeId = scrapeResult.meta.last_row_id as number;

      // 4. Send an immediate response to the client confirming the job has been initiated.
      this.sendSuccess({
        message: 'Scrape initiated',
        scrapeId,
        status: 'starting',
        authenticated: !!siteConfigResult
      });

      // 5. Start the actual scraping process in the background without blocking.
      this.startScraping(scrapeId, jobConfig, siteConfigResult);

    } catch (error) {
      this.sendError(`Failed to initiate scrape: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @method startScraping
   * @private
   * @description The asynchronous entry point for the scraping process using modular services.
   * It updates the job status, launches a browser, handles authentication via AuthService,
   * performs vision analysis via VisionAgent, extracts structured data via Llama4Service,
   * and saves assets to R2 storage. All progress is broadcast in real-time via WebSocket.
   * @param {number} scrapeId - The ID of the scrape job.
   * @param {JobConfig} jobConfig - The configuration for the job.
   * @param {SiteConfig | null} [siteConfig] - The site configuration if authentication is needed.
   * @returns {Promise<void>}
   */
  private async startScraping(
    scrapeId: number,
    jobConfig: JobConfig,
    siteConfig?: SiteConfig | null
  ) {
    let browser: Browser | null = null;
    try {
      // Update job status to in_progress
      await this.env.DB.prepare(
        `UPDATE scrape_jobs SET status = 'in_progress' WHERE id = ?`
      ).bind(scrapeId).run();

      this.sendStatusUpdate(scrapeId, 'in_progress', 'Scraping started - launching browser...');

      // Initialize services
      const authService = new AuthService(this.env);
      const visionAgent = new VisionAgent(this.env);
      const llama4Service = new Llama4Service(this.env);

      // Launch browser
      browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      this.sendStatusUpdate(scrapeId, 'in_progress', 'Browser launched successfully');

      // Handle authentication if site config is provided
      if (siteConfig) {
        this.sendStatusUpdate(scrapeId, 'in_progress', `Authentication required for ${siteConfig.url_pattern}`);
        const authSuccess = await authService.authenticate(page, siteConfig);
        if (!authSuccess) {
          throw new Error('Authentication failed');
        }
        this.sendStatusUpdate(scrapeId, 'in_progress', 'Authentication completed successfully');
      }

      // Navigate to target URL
      this.sendStatusUpdate(scrapeId, 'in_progress', `Navigating to job page: ${jobConfig.starting_url}`);
      await page.goto(jobConfig.starting_url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      this.sendStatusUpdate(scrapeId, 'in_progress', 'Page loaded - beginning AI analysis');

      // Perform vision analysis and data extraction
      const extractedData = await this.performDataExtraction(
        scrapeId, 
        page, 
        visionAgent, 
        llama4Service, 
        jobConfig.agent_instructions || "Extract all details about this job posting."
      );

      // Save extracted data as asset
      const assets = await this.saveExtractionAssets(scrapeId, extractedData, page, jobConfig);

      // Update job status to complete
      await this.env.DB.prepare(
        `UPDATE scrape_jobs SET status = 'complete' WHERE id = ?`
      ).bind(scrapeId).run();

      this.sendStatusUpdate(scrapeId, 'complete', `Scraping completed successfully. ${assets.length} assets collected.`, assets);

    } catch (error) {
      const errorMessage = `Scraping failed: ${error instanceof Error ? error.message : String(error)}`;
      
      // Update job status to error
      await this.env.DB.prepare(
        `UPDATE scrape_jobs SET status = 'error', error_message = ? WHERE id = ?`
      ).bind(errorMessage, scrapeId).run();

      this.sendStatusUpdate(scrapeId, 'error', errorMessage);
      
      // If we have a page, take a final screenshot for debugging
      if (browser) {
        try {
          const pages = await browser.pages();
          if (pages.length > 0) {
            const visionAgent = new VisionAgent(this.env);
            const debugAnalysis = await visionAgent.analyzePageForAction(
              pages[0], 
              `An error occurred: ${errorMessage}. What do I see on the page that might have caused this?`
            );
            this.sendVisionUpdate(scrapeId, debugAnalysis.reasoning, ''); // Use reasoning instead of description
          }
        } catch (debugError) {
          console.error('Failed to capture debug screenshot:', debugError);
        }
      }
    } finally {
      if (browser) {
        await browser.close();
        this.sendStatusUpdate(scrapeId, 'in_progress', 'Browser closed');
      }
    }
  }

  /**
   * @method performDataExtraction
   * @private
   * @description Orchestrates the AI-powered data extraction process using VisionAgent and Llama4Service.
   * Takes screenshots, analyzes the page content, and extracts structured job posting data.
   * @param {number} scrapeId - The ID of the scrape job for status updates.
   * @param {Page} page - The Puppeteer page instance.
   * @param {VisionAgent} visionAgent - The vision analysis service.
   * @param {Llama4Service} llama4Service - The Llama-4 extraction service.
   * @param {string} instructions - Instructions for the AI extraction process.
   * @returns {Promise<any>} The extracted and validated job posting data.
   */
  private async performDataExtraction(
    scrapeId: number,
    page: Page,
    visionAgent: VisionAgent,
    llama4Service: Llama4Service,
    instructions: string
  ): Promise<any> {
    this.sendStatusUpdate(scrapeId, 'in_progress', 'Starting AI vision analysis...');

    // Get page content for analysis
    const url = page.url();
    const title = await page.title();
    const htmlContent = await page.content();

    // Perform vision analysis
    const visionAnalysis = await visionAgent.analyzePageForAction(page, instructions);
    
    // Take a screenshot for the vision update (since analyzePageForAction doesn't return the screenshot URL)
    const screenshot = await page.screenshot({ fullPage: false });
    const screenshotAsset = await this.saveAsset(scrapeId, `vision-${Date.now()}.png`, 'vision-screenshot', screenshot);
    
    this.sendVisionUpdate(scrapeId, visionAnalysis.reasoning, screenshotAsset.r2_url);

    this.sendStatusUpdate(scrapeId, 'in_progress', 'Vision analysis complete - extracting structured data...');

    // Extract text content from the page for Llama-4 processing
    const textContent = await page.evaluate(() => {
      // Remove script and style elements
      const scripts = document.querySelectorAll('script, style, noscript');
      scripts.forEach(el => el.remove());
      
      // Get clean text content
      return document.body.innerText || document.textContent || '';
    });

    // Use Llama-4 to extract structured job posting data
    const extractedData = await llama4Service.extractJobPosting(textContent, {
      url,
      visionDescription: visionAnalysis.reasoning,
      htmlContent: htmlContent.substring(0, 10000) // Limit HTML content size
    });

    this.sendStatusUpdate(scrapeId, 'in_progress', 'Structured data extraction complete');

    return extractedData;
  }

  /**
   * @method saveExtractionAssets
   * @private
   * @description Saves the extracted data and optional assets (screenshots, HTML, etc.) to R2 storage
   * and records them in the D1 database.
   * @param {number} scrapeId - The ID of the scrape job.
   * @param {any} extractedData - The structured data extracted by Llama-4.
   * @param {Page} page - The Puppeteer page instance for capturing additional assets.
   * @param {JobConfig} jobConfig - The job configuration specifying which assets to collect.
   * @returns {Promise<ExtractedAsset[]>} Array of saved assets with their metadata.
   */
  private async saveExtractionAssets(
    scrapeId: number,
    extractedData: any,
    page: Page,
    jobConfig: JobConfig
  ): Promise<ExtractedAsset[]> {
    const assets: ExtractedAsset[] = [];

    // Always save the extracted JSON data
    this.sendStatusUpdate(scrapeId, 'in_progress', 'Saving extracted job data...');
    const jsonAsset = await this.saveAsset(
      scrapeId,
      'extracted-job-data.json',
      'json',
      JSON.stringify(extractedData, null, 2)
    );
    assets.push(jsonAsset);

    // Save screenshot if requested
    if (jobConfig.collect_screenshot) {
      this.sendStatusUpdate(scrapeId, 'in_progress', 'Capturing final screenshot...');
      const screenshot = await page.screenshot({ fullPage: true });
      const screenshotAsset = await this.saveAsset(
        scrapeId,
        'final-screenshot.png',
        'screenshot',
        screenshot
      );
      assets.push(screenshotAsset);
    }

    // Save HTML if requested
    if (jobConfig.collect_html) {
      this.sendStatusUpdate(scrapeId, 'in_progress', 'Saving HTML content...');
      const htmlContent = await page.content();
      const htmlAsset = await this.saveAsset(
        scrapeId,
        'page-content.html',
        'html',
        htmlContent
      );
      assets.push(htmlAsset);
    }

    // Save PDF if requested
    if (jobConfig.collect_pdf) {
      this.sendStatusUpdate(scrapeId, 'in_progress', 'Generating PDF...');
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      const pdfAsset = await this.saveAsset(
        scrapeId,
        'page-content.pdf',
        'pdf',
        pdf
      );
      assets.push(pdfAsset);
    }

    return assets;
  }

  /**
   * @method saveAsset
   * @private
   * @description Saves a single asset to R2 storage using the centralized R2AssetManager.
   * @param {number} scrapeId - The ID of the scrape job.
   * @param {string} filename - The filename for the asset.
   * @param {string} type - The type of asset (json, screenshot, html, pdf, etc.).
   * @param {string | Uint8Array} content - The content to save.
   * @returns {Promise<ExtractedAsset>} The saved asset metadata.
   */
  private async saveAsset(
    scrapeId: number,
    filename: string,
    type: string,
    content: string | Uint8Array
  ): Promise<ExtractedAsset> {
    const r2Manager = createR2AssetManager(this.env);
    return await r2Manager.saveAsset(scrapeId, filename, type, content);
  }

  /**
   * @method sendStatusUpdate
   * @description A public method used to send real-time status updates
   * to all connected clients during the scraping process.
   * @param {number} scrapeId - The ID of the relevant scrape job.
   * @param {string} status - The current status (e.g., 'in_progress', 'complete', 'error').
   * @param {string} message - A descriptive message about the current status.
   * @param {any[]} [assets] - An optional array of assets collected.
   */
  public sendStatusUpdate(scrapeId: number, status: string, message: string, assets?: any[]) {
    this.send({
      type: 'status_update',
      data: { scrapeId, status, message, assets }
    });
  }

  /**
   * @method listScrapes
   * @private
   * @description Fetches a list of the 50 most recent scrape jobs from the database and
   * sends them to the client.
   * @returns {Promise<void>}
   */
  private async listScrapes() {
    try {
      const result = await this.env.DB.prepare(
        `SELECT 
          sj.*,
          jc.starting_url,
          jc.agent_instructions,
          COUNT(ea.id) as asset_count
         FROM scrape_jobs sj
         LEFT JOIN job_config jc ON sj.job_config_id = jc.id
         LEFT JOIN extracted_assets ea ON sj.id = ea.scrape_id
         GROUP BY sj.id
         ORDER BY sj.timestamp DESC
         LIMIT 50`
      ).all();

      this.send({
        type: 'scrape_list',
        data: result.results
      });
    } catch (error) {
      this.sendError(`Failed to list scrapes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @method getScrapeStatus
   * @private
   * @description Fetches the detailed status and all associated assets for a single scrape job
   * from the database and sends the information to the client.
   * @param {number} scrapeId - The ID of the scrape job to retrieve.
   * @returns {Promise<void>}
   */
  private async getScrapeStatus(scrapeId: number) {
    try {
      const scrape = await this.env.DB.prepare(
        `SELECT 
          sj.*,
          jc.starting_url,
          jc.agent_instructions
         FROM scrape_jobs sj
         LEFT JOIN job_config jc ON sj.job_config_id = jc.id
         WHERE sj.id = ?`
      ).bind(scrapeId).first();

      if (!scrape) {
        this.sendError(`Scrape ${scrapeId} not found`);
        return;
      }

      const assets = await this.env.DB.prepare(
        `SELECT * FROM extracted_assets WHERE scrape_id = ?`
      ).bind(scrapeId).all();

      this.sendSuccess({
        scrape,
        assets: assets.results
      });
    } catch (error) {
      this.sendError(`Failed to get scrape status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * @method send
   * @private
   * @description A generic helper method to send a message to the Durable Object for broadcasting.
   * @param {WSResponse} message - The message object to be sent.
   */
  private send(message: WSResponse) {
    this.do.broadcast(message);
  }

  /**
   * @method sendSuccess
   * @private
   * @description A helper method to send a standardized success message.
   * @param {any} data - The payload for the success message.
   */
  private sendSuccess(data: any) {
    this.send({ type: 'success', data });
  }

  /**
   * @method sendError
   * @private
   * @description A helper method to send a standardized error message.
   * @param {string} error - The error message string.
   */
  private sendError(error: string) {
    this.send({ type: 'error', error });
  }

  /**
   * @method sendVisionUpdate
   * @description A public method used to send real-time updates from the
   * vision model, including the AI's description and a URL to the screenshot it analyzed.
   * @param {number} scrapeId - The ID of the relevant scrape job.
   * @param {string} description - The textual description from the vision model.
   * @param {string} imageUrl - The public R2 URL of the screenshot.
   */
  public sendVisionUpdate(scrapeId: number, description: string, imageUrl: string) {
    this.send({
      type: 'vision_update',
      data: { scrapeId, description, imageUrl }
    });
  }
}
