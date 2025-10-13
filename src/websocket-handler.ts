import type { Env, WSMessage, WSResponse, SiteConfig, JobConfig } from './types';
import { AIScraper } from './scraper';

export class WebSocketHandler {
  private ws: WebSocket;
  private env: Env;

  constructor(ws: WebSocket, env: Env) {
    this.ws = ws;
    this.env = env;
    this.setupHandlers();
  }

  private setupHandlers() {
    this.ws.addEventListener('message', async (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data as string);
        await this.handleMessage(message);
      } catch (error) {
        this.sendError(`Invalid message: ${error.message}`);
      }
    });
  }

  private async handleMessage(message: WSMessage) {
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
      this.sendError(`Failed to create site config: ${error.message}`);
    }
  }

  private async initiateScrape(data: { url: string; jobConfig?: Partial<JobConfig> }) {
    try {
      // Create job config
      const jobConfig: JobConfig = {
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

      const jobConfigId = jobResult.meta.last_row_id;

      // Extract base URL
      const urlObj = new URL(data.url);
      const baseUrl = urlObj.hostname;

      // Check if we have a matching site config
      const siteConfigResult = await this.env.DB.prepare(
        `SELECT * FROM site_config WHERE ? LIKE url_pattern ORDER BY LENGTH(url_pattern) DESC LIMIT 1`
      ).bind(data.url).first();

      // Create scrape job
      const scrapeResult = await this.env.DB.prepare(
        `INSERT INTO scrape_jobs (job_config_id, site_config_id, full_url, base_url, status)
         VALUES (?, ?, ?, ?, 'not_started')`
      ).bind(
        jobConfigId,
        siteConfigResult?.id || null,
        data.url,
        baseUrl
      ).run();

      const scrapeId = scrapeResult.meta.last_row_id;

      // Send immediate response
      this.sendSuccess({
        message: 'Scrape initiated',
        scrapeId,
        status: 'starting',
        authenticated: !!siteConfigResult
      });

      // Start scraping asynchronously
      this.startScraping(scrapeId, jobConfigId, data.url, jobConfig, siteConfigResult as any);

    } catch (error) {
      this.sendError(`Failed to initiate scrape: ${error.message}`);
    }
  }

  private async startScraping(
    scrapeId: number,
    jobConfigId: number,
    url: string,
    jobConfig: JobConfig,
    siteConfig?: SiteConfig
  ) {
    try {
      // Update status to in_progress
      await this.env.DB.prepare(
        `UPDATE scrape_jobs SET status = 'in_progress' WHERE id = ?`
      ).bind(scrapeId).run();

      this.sendStatusUpdate(scrapeId, 'in_progress', 'Scraping started');

      // Perform scraping
      const scraper = new AIScraper(this.env, scrapeId);
      const assets = await scraper.scrape(url, jobConfig, siteConfig);

      this.sendStatusUpdate(scrapeId, 'complete', `Scraping complete. ${assets.length} assets collected.`, assets);

    } catch (error) {
      this.sendStatusUpdate(scrapeId, 'error', `Scraping failed: ${error.message}`);
    }
  }

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
      this.sendError(`Failed to list scrapes: ${error.message}`);
    }
  }

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
      this.sendError(`Failed to get scrape status: ${error.message}`);
    }
  }

  private send(message: WSResponse) {
    this.ws.send(JSON.stringify(message));
  }

  private sendSuccess(data: any) {
    this.send({ type: 'success', data });
  }

  private sendError(error: string) {
    this.send({ type: 'error', error });
  }

  private sendStatusUpdate(scrapeId: number, status: string, message: string, assets?: any[]) {
    this.send({
      type: 'status_update',
      data: { scrapeId, status, message, assets }
    });
  }
}
