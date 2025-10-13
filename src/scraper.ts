import { launch } from '@cloudflare/playwright';
import type { Env, SiteConfig, JobConfig, ExtractedAsset } from './types';

export class AIScraper {
  constructor(
    private env: Env,
    private jobId: number
  ) {}

  async scrape(
    url: string,
    jobConfig: JobConfig,
    siteConfig?: SiteConfig
  ): Promise<ExtractedAsset[]> {
    const assets: ExtractedAsset[] = [];
    const logs: string[] = [];
    
    try {
      logs.push(`Starting scrape of ${url}`);
      
      // Launch browser with keep_alive for session reuse
      const browser = await launch(this.env.BROWSER, { 
        keep_alive: 600000 // 10 minutes
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      
      // Handle authentication if site config exists
      if (siteConfig) {
        logs.push(`Authenticating with credentials from secrets`);
        await this.authenticate(page, siteConfig, logs);
      }
      
      // Navigate to target URL
      logs.push(`Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle' });
      
      // Use AI to understand and extract content
      if (jobConfig.agent_instructions || jobConfig.collect_json) {
        logs.push(`Using AI to extract structured data`);
        const jsonData = await this.extractWithAI(page, jobConfig.agent_instructions, logs);
        if (jsonData) {
          const asset = await this.saveAsset(
            this.jobId,
            'extracted-data.json',
            'json',
            JSON.stringify(jsonData, null, 2)
          );
          assets.push(asset);
        }
      }
      
      // Collect HTML if requested
      if (jobConfig.collect_html) {
        logs.push(`Collecting HTML`);
        const html = await page.content();
        const asset = await this.saveAsset(
          this.jobId,
          'page.html',
          'html',
          html
        );
        assets.push(asset);
      }
      
      // Collect screenshot if requested
      if (jobConfig.collect_screenshot) {
        logs.push(`Taking screenshot`);
        const screenshot = await page.screenshot({ fullPage: true });
        const asset = await this.saveAsset(
          this.jobId,
          'screenshot.png',
          'screenshot',
          screenshot
        );
        assets.push(asset);
      }
      
      // Collect PDF if requested
      if (jobConfig.collect_pdf) {
        logs.push(`Generating PDF`);
        const pdf = await page.pdf({ format: 'A4' });
        const asset = await this.saveAsset(
          this.jobId,
          'page.pdf',
          'pdf',
          pdf
        );
        assets.push(asset);
      }
      
      await browser.close();
      
      // Update job status
      await this.updateJobStatus('complete', logs.join('\n'));
      
      return assets;
    } catch (error) {
      logs.push(`Error: ${error.message}`);
      await this.updateJobStatus('error', logs.join('\n'));
      throw error;
    }
  }

  private async authenticate(
    page: any,
    siteConfig: SiteConfig,
    logs: string[]
  ): Promise<void> {
    try {
      // Get credentials from environment secrets
      const username = this.env[siteConfig.username_secret_var];
      const password = this.env[siteConfig.password_secret_var];
      
      if (!username || !password) {
        throw new Error(`Credentials not found. Set secrets: ${siteConfig.username_secret_var}, ${siteConfig.password_secret_var}`);
      }
      
      logs.push(`Navigating to login URL: ${siteConfig.login_url}`);
      await page.goto(siteConfig.login_url);
      
      // Use AI to intelligently fill login form
      if (siteConfig.login_agent_instructions) {
        logs.push(`Using AI instructions for login`);
        const htmlContent = await page.content();
        const aiInstructions = `${siteConfig.login_agent_instructions}\n\nUsername: ${username}\nPassword: ${password}`;
        
        // Use Workers AI to analyze page and determine login steps
        const aiResponse = await this.env.AI.run(this.env.AI_MODEL, {
          messages: [
            {
              role: 'system',
              content: 'You are a web automation assistant. Analyze the provided HTML and generate a JSON array of Playwright commands to perform a login. The available actions are "fill", "click", and "waitForNavigation". Use the provided credentials.'
            },
            {
              role: 'user',
              content: `HTML: ${htmlContent.substring(0, 8000)}\n\nTask: ${aiInstructions}\n\nProvide Playwright commands as a JSON array with objects containing "action", "selector", and optional "value".`
            }
          ]
        });
        
        logs.push(`AI Response: ${JSON.stringify(aiResponse)}`);

        const responseText = aiResponse.response || JSON.stringify(aiResponse);
        const commands = JSON.parse(responseText);

        for (const command of commands) {
          logs.push(`Executing AI command: ${command.action} on ${command.selector}`);
          switch (command.action) {
            case 'fill':
              if (!command.selector || !command.value) throw new Error('Invalid "fill" command from AI');
              await page.fill(command.selector, command.value);
              break;
            case 'click':
              if (!command.selector) throw new Error('Invalid "click" command from AI');
              await page.click(command.selector);
              break;
            case 'waitForNavigation':
              await page.waitForNavigation({ waitUntil: 'networkidle' });
              break;
            default:
              logs.push(`Unknown AI command: ${command.action}`);
          }
        }
      } else {
        // Default login behavior - find common patterns
        logs.push(`Using default login pattern detection`);
        const usernameSelector = 'input[type="email"], input[type="text"], input[name*="user"], input[name*="email"], input[id*="user"]';
        const passwordSelector = 'input[type="password"]';
        const submitSelector = 'button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")';
        
        await page.fill(usernameSelector, username);
        await page.fill(passwordSelector, password);
        await page.click(submitSelector);
        await page.waitForNavigation();
      }
      
      logs.push(`Authentication successful`);
    } catch (error) {
      logs.push(`Authentication failed: ${error.message}`);
      throw error;
    }
  }

  private async extractWithAI(
    page: any,
    instructions: string | undefined,
    logs: string[]
  ): Promise<any> {
    const content = await page.content();
    const textContent = await page.evaluate(() => document.body.innerText);
    
    const prompt = instructions || 'Extract all relevant structured data from this page as JSON';
    
    const aiResponse = await this.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        {
          role: 'system',
          content: 'You are a data extraction assistant. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: `${prompt}\n\nPage text content (first 8000 chars):\n${textContent.substring(0, 8000)}`
        }
      ]
    });
    
    try {
      // Parse AI response
      const responseText = aiResponse.response || JSON.stringify(aiResponse);
      logs.push(`AI extracted data: ${responseText.substring(0, 200)}...`);
      
      // Try to parse as JSON
      return JSON.parse(responseText);
    } catch (error) {
      logs.push(`Failed to parse AI response as JSON: ${error.message}`);
      return { raw_response: aiResponse };
    }
  }

  private async saveAsset(
    scrapeId: number,
    name: string,
    type: string,
    content: string | Uint8Array
  ): Promise<ExtractedAsset> {
    const timestamp = Date.now();
    const r2Key = `scrapes/${scrapeId}/${timestamp}-${name}`;
    
    // Upload to R2
    const contentBuffer = typeof content === 'string' 
      ? new TextEncoder().encode(content)
      : content;
    
    await this.env.R2_BUCKET.put(r2Key, contentBuffer);
    
    // Calculate MD5 hash
    const hashBuffer = await crypto.subtle.digest('MD5', contentBuffer);
    const md5Hash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const r2Url = `https://scraper-assets.example.com/${r2Key}`;
    
    // Save to database
    const result = await this.env.DB.prepare(
      `INSERT INTO extracted_assets (scrape_id, name, type, r2_key, r2_url, md5_hash, filesize)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      scrapeId,
      name,
      type,
      r2Key,
      r2Url,
      md5Hash,
      contentBuffer.byteLength
    ).run();
    
    return {
      id: result.meta.last_row_id,
      scrape_id: scrapeId,
      name,
      type,
      r2_key: r2Key,
      r2_url: r2Url,
      md5_hash: md5Hash,
      filesize: contentBuffer.byteLength
    };
  }

  private async updateJobStatus(status: string, logs: string): Promise<void> {
    const completedAt = status === 'complete' || status === 'error' 
      ? new Date().toISOString() 
      : null;
    
    await this.env.DB.prepare(
      `UPDATE scrape_jobs 
       SET status = ?, log_details = ?, completed_at = ?
       WHERE id = ?`
    ).bind(status, logs, completedAt, this.jobId).run();
  }
}
