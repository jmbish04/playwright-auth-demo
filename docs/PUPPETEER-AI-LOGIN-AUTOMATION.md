# Puppeteer + Workers AI Login Automation Guide

## Overview

This comprehensive guide explains how to build an AI-powered login automation system using Cloudflare's **Browser Rendering API** (Puppeteer) combined with **Workers AI** vision models. This approach can automatically log in to virtually any website by using AI to understand page layouts, identify form fields, and interact with login forms intelligently.

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Architecture](#architecture)
3. [Setup & Configuration](#setup--configuration)
4. [Implementation Guide](#implementation-guide)
5. [AI Vision Integration](#ai-vision-integration)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Example Code](#example-code)

---

## Core Concepts

### Why AI-Powered Login Automation?

Traditional web scraping and automation approaches rely on **CSS selectors** or **XPath**, which break when websites update their UI. AI-powered automation is more resilient because:

1. **Visual Understanding**: AI "sees" the page like a human would
2. **Adaptive**: Works even when HTML structure changes
3. **Context-Aware**: Understands form fields by labels and context
4. **Self-Healing**: Can adjust to layout changes without code updates

### Key Technologies

- **@cloudflare/puppeteer**: Cloudflare's fork of Puppeteer for browser automation
- **Workers AI**: Serverless AI models including vision and reasoning models
- **Llama 4 Scout 17B Vision**: For visual page understanding and element detection
- **GPT-OSS 120B/20B**: For strategic planning, reasoning, and flow control
- **Browser Rendering API**: Headless browser environment

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloudflare Worker                        │
│                                                              │
│  ┌──────────────┐      ┌──────────────┐     ┌────────────┐│
│  │   Request    │─────▶│ Auth Service │────▶│ Orchestrator│
│  │   Handler    │      │              │     │ (GPT-120B) ││
│  └──────────────┘      └──────────────┘     └────────────┘│
│                               │                     │       │
│                               │                     ▼       │
│                               │              ┌────────────┐│
│                               │              │  Vision AI ││
│                               │              │ (Llama 4)  ││
│                               │              └────────────┘│
│                               │                     │       │
│                               ▼                     ▼       │
│                        ┌──────────────┐     ┌────────────┐│
│                        │  Puppeteer   │◀────│  Strategy  ││
│                        │   Browser    │     │  Execution ││
│                        └──────────────┘     └────────────┘│
│                               │                             │
│                               ▼                             │
│                        ┌──────────────┐                    │
│                        │  Target Site │                    │
│                        │  (LinkedIn,  │                    │
│                        │   Indeed,    │                    │
│                        │   etc.)      │                    │
│                        └──────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

1. **Auth Service**: Orchestrates the login flow
2. **AI Orchestrator (GPT-120B)**: Strategic planning, flow control, and error handling
3. **Vision Agent (Llama 4 Scout)**: Analyzes screenshots to find form elements
4. **Puppeteer Browser**: Performs actual browser interactions
5. **Workers AI**: Provides both vision and reasoning capabilities

---

## Setup & Configuration

### 1. Install Dependencies

```bash
npm install @cloudflare/puppeteer zod zod-to-json-schema
```

### 2. Configure wrangler.toml

```toml
name = "login-automation-worker"
main = "src/index.ts"
compatibility_date = "2024-05-30"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"

[browser]
binding = "BROWSER"

[[d1_databases]]
binding = "DB"
database_name = "login-configs"
database_id = "your-database-id"
```

### 3. Set Up Environment Variables

Store credentials securely using Wrangler secrets:

```bash
# LinkedIn credentials
wrangler secret put LINKEDIN_USERNAME
wrangler secret put LINKEDIN_PASSWORD

# Indeed credentials
wrangler secret put INDEED_USERNAME
wrangler secret put INDEED_PASSWORD

# Add more as needed for other sites
wrangler secret put GLASSDOOR_USERNAME
wrangler secret put GLASSDOOR_PASSWORD
```

### 4. Create Site Configuration Database

```sql
-- migrations/0001_site_configs.sql
CREATE TABLE IF NOT EXISTS site_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_pattern TEXT NOT NULL UNIQUE,
    username_secret_var TEXT NOT NULL,
    password_secret_var TEXT NOT NULL,
    login_url TEXT NOT NULL,
    login_agent_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert LinkedIn configuration
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'linkedin.com',
    'LINKEDIN_USERNAME',
    'LINKEDIN_PASSWORD',
    'https://www.linkedin.com/login',
    'Navigate to LinkedIn login page. Find the username/email input field and password field. Fill them in, then click the sign-in button. Watch for any security challenges or 2FA prompts.'
);

-- Insert Indeed configuration
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'indeed.com',
    'INDEED_USERNAME',
    'INDEED_PASSWORD',
    'https://secure.indeed.com/auth',
    'Navigate to Indeed login page. Locate the email input field and password field. Enter credentials and submit the form. Handle any email verification if prompted.'
);
```

Run migrations:
```bash
wrangler d1 migrations apply DB --local
wrangler d1 migrations apply DB --remote
```

---

## Implementation Guide

### Step 1: Create the AI Orchestrator (Strategic Planning)

The AI Orchestrator uses GPT-OSS for high-level reasoning, planning, and error handling:

```typescript
import type { Page } from '@cloudflare/puppeteer';

export interface AuthStrategy {
  approach: 'single-step' | 'multi-step' | 'oauth' | 'sso';
  steps: AuthStep[];
  challenges: string[];
  fallbackStrategy?: string;
}

export interface AuthStep {
  action: 'navigate' | 'fill_field' | 'click' | 'wait' | 'verify';
  fieldType?: 'username' | 'password' | 'submit' | 'continue';
  requiresVision: boolean;
  objective: string;
  verifyProgress?: boolean;
}

export interface PageState {
  url: string;
  title: string;
  hasLoginForm: boolean;
  errorMessages: string[];
}

export class AIOrchestrator {
  constructor(private env: Env) {}

  /**
   * Use GPT-120B for strategic planning and flow control
   */
  async planAuthenticationStrategy(
    siteConfig: SiteConfig,
    currentState: PageState
  ): Promise<AuthStrategy> {
    const prompt = `You are an expert at web authentication automation.

Site: ${siteConfig.url_pattern}
Current URL: ${currentState.url}
Page Title: ${currentState.title}
Has Login Form: ${currentState.hasLoginForm}
Custom Instructions: ${siteConfig.login_agent_instructions || 'None'}

Analyze this login flow and provide a comprehensive strategy.

Consider:
1. Is this single-step (username+password together) or multi-step (email first, then password)?
2. What challenges might we face? (CAPTCHA, 2FA, email verification, security questions)
3. What's the optimal sequence of actions?
4. How should we verify success at each step?
5. What's the fallback if the primary approach fails?

Respond in JSON format:
{
  "approach": "single-step" | "multi-step" | "oauth" | "sso",
  "steps": [
    {
      "action": "navigate" | "fill_field" | "click" | "wait" | "verify",
      "fieldType": "username" | "password" | "submit",
      "requiresVision": true/false,
      "objective": "description of what to do",
      "verifyProgress": true/false
    }
  ],
  "challenges": ["list of potential issues"],
  "fallbackStrategy": "description of backup plan"
}`;

    const response = await this.env.AI.run(
      '@cf/openai/gpt-oss-120b',
      {
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing web authentication flows. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    );

    try {
      return JSON.parse(response.response);
    } catch (error) {
      console.error('Failed to parse strategy:', response.response);
      // Return default single-step strategy
      return {
        approach: 'single-step',
        steps: [
          {
            action: 'fill_field',
            fieldType: 'username',
            requiresVision: true,
            objective: 'Find and fill username field',
            verifyProgress: false
          },
          {
            action: 'fill_field',
            fieldType: 'password',
            requiresVision: true,
            objective: 'Find and fill password field',
            verifyProgress: false
          },
          {
            action: 'click',
            fieldType: 'submit',
            requiresVision: true,
            objective: 'Find and click submit button',
            verifyProgress: true
          }
        ],
        challenges: ['Unknown - using default strategy'],
        fallbackStrategy: 'Try common CSS selectors'
      };
    }
  }

  /**
   * Use GPT-20B for quick HTML analysis without screenshots
   */
  async analyzePageHTML(page: Page, objective: string): Promise<{
    action: string;
    selector?: string;
    reasoning: string;
    confidence: number;
  }> {
    const html = await page.content();
    const url = page.url();

    const prompt = `Analyze this HTML to accomplish the objective.

Objective: ${objective}
Current URL: ${url}

HTML (first 5000 chars):
${html.slice(0, 5000)}

Determine the next action. Consider:
1. Can you find the target element in the HTML?
2. What's the best CSS selector to use?
3. Should we wait for something to load?
4. Is there an error message or success indicator?

Respond in JSON:
{
  "action": "fill_field" | "click_button" | "wait_for_element" | "verify_success" | "handle_error" | "need_vision",
  "selector": "CSS selector if applicable",
  "reasoning": "explanation of decision",
  "confidence": 0-100
}`;

    const response = await this.env.AI.run(
      '@cf/openai/gpt-oss-20b',
      {
        messages: [
          {
            role: 'system',
            content: 'You are an expert at HTML analysis. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    );

    try {
      return JSON.parse(response.response);
    } catch (error) {
      console.error('Failed to parse HTML analysis:', response.response);
      return {
        action: 'need_vision',
        reasoning: 'Could not analyze HTML, need visual inspection',
        confidence: 0
      };
    }
  }

  /**
   * Evaluate if we should continue with current strategy or adjust
   */
  async evaluateProgress(
    currentState: PageState,
    strategy: AuthStrategy,
    completedSteps: number
  ): Promise<{ continue: boolean; reasoning: string; adjustments?: string }> {
    const prompt = `Evaluate authentication progress.

Strategy: ${strategy.approach}
Completed Steps: ${completedSteps} of ${strategy.steps.length}
Current URL: ${currentState.url}
Current Page Title: ${currentState.title}
Error Messages: ${currentState.errorMessages.join(', ') || 'None'}

Should we:
1. Continue with the current strategy?
2. Abort due to failure?
3. Adjust the strategy?

Respond in JSON:
{
  "continue": true/false,
  "reasoning": "explanation",
  "adjustments": "suggested changes if needed"
}`;

    const response = await this.env.AI.run(
      '@cf/openai/gpt-oss-120b',
      {
        messages: [
          {
            role: 'system',
            content: 'You are an expert at evaluating authentication flows.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      }
    );

    try {
      return JSON.parse(response.response);
    } catch (error) {
      return {
        continue: true,
        reasoning: 'Default: continue with strategy'
      };
    }
  }
}
```

### Step 2: Create the Vision Agent (Visual Analysis)

The Vision Agent uses Llama 4 Scout for analyzing page screenshots:

```typescript
import type { Page } from '@cloudflare/puppeteer';

export class VisionAgent {
  constructor(private env: Env) {}

  /**
   * Analyze a page screenshot to understand layout and detect forms
   * Uses Llama 4 Scout 17B - natively multimodal with 16 experts
   */
  async analyzePage(page: Page, prompt: string): Promise<string> {
    // Take a screenshot of the current page
    const screenshot = await page.screenshot({ fullPage: true });
    const screenshotBase64 = screenshot.toString('base64');

    // Use Llama 4 Scout for superior vision understanding
    const response = await this.env.AI.run(
      '@cf/meta/llama-4-scout-17b-16e-instruct',
      {
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        image: `data:image/png;base64,${screenshotBase64}`
      }
    );

    return response.description || response.response || '';
  }

  /**
   * Detect if page requires authentication
   */
  async analyzePageForAuthentication(page: Page, targetUrl: string): Promise<{
    requiresAuth: boolean;
    reasoning: string;
    loginFormDetected: boolean;
  }> {
    const prompt = `Analyze this webpage and determine:
1. Does this page show a login form or authentication screen?
2. Is this a job posting page that might be behind a login wall?
3. Do you see any "Sign in", "Log in", or authentication buttons?

Target URL: ${targetUrl}

Respond in JSON format:
{
  "requiresAuth": true/false,
  "reasoning": "explanation",
  "loginFormDetected": true/false
}`;

    const analysis = await this.analyzePage(page, prompt);
    
    try {
      return JSON.parse(analysis);
    } catch {
      // Fallback if AI doesn't return valid JSON
      return {
        requiresAuth: analysis.toLowerCase().includes('login') || 
                      analysis.toLowerCase().includes('sign in'),
        reasoning: analysis,
        loginFormDetected: false
      };
    }
  }

  /**
   * Find username/email input field using AI vision
   */
  async findUsernameField(page: Page): Promise<string | null> {
    const prompt = `Look at this login page and identify the USERNAME or EMAIL input field.
    
Provide the CSS selector or a unique identifier for this field. Consider:
- Input fields labeled "Email", "Username", "Email or Phone"
- Input fields with type="email" or type="text"
- The first input field in a login form
- Input with placeholder text about email/username

Respond with ONLY the CSS selector, nothing else. Examples:
- #username
- input[name="email"]
- input[type="email"]
- #session_key`;

    const analysis = await this.analyzePage(page, prompt);
    return analysis.trim();
  }

  /**
   * Find password input field using AI vision
   */
  async findPasswordField(page: Page): Promise<string | null> {
    const prompt = `Look at this page and identify the PASSWORD input field.
    
Provide the CSS selector for the password field. Consider:
- Input fields labeled "Password"
- Input fields with type="password"
- The second input field in a login form

Respond with ONLY the CSS selector, nothing else. Examples:
- #password
- input[name="password"]
- input[type="password"]
- #session_password`;

    const analysis = await this.analyzePage(page, prompt);
    return analysis.trim();
  }

  /**
   * Find login submit button using AI vision
   */
  async findSubmitButton(page: Page): Promise<string | null> {
    const prompt = `Look at this page and identify the LOGIN or SIGN IN button.
    
Provide the CSS selector for the submit button. Consider:
- Button with text "Sign in", "Log in", "Continue", "Submit"
- Input with type="submit"
- Button elements with specific classes

Respond with ONLY the CSS selector, nothing else. Examples:
- button[type="submit"]
- button.login-button
- input[type="submit"]
- .btn-primary`;

    const analysis = await this.analyzePage(page, prompt);
    return analysis.trim();
  }
}
```

### Step 3: Create the Authentication Service (Hybrid Approach)

The Auth Service coordinates between the AI Orchestrator and Vision Agent:

```typescript
import type { Page } from '@cloudflare/puppeteer';
import { VisionAgent } from './vision-agent';
import { AIOrchestrator } from './ai-orchestrator';

export interface SiteConfig {
  url_pattern: string;
  username_secret_var: string;
  password_secret_var: string;
  login_url: string;
  login_agent_instructions?: string;
}

export class AuthService {
  private visionAgent: VisionAgent;
  private orchestrator: AIOrchestrator;

  constructor(private env: Env) {
    this.visionAgent = new VisionAgent(env);
    this.orchestrator = new AIOrchestrator(env);
  }

  /**
   * Get current page state for AI analysis
   */
  private async getPageState(page: Page): Promise<PageState> {
    const [url, title, html] = await Promise.all([
      page.url(),
      page.title(),
      page.content()
    ]);

    // Simple checks for login form presence
    const hasLoginForm = html.includes('type="password"') || 
                        html.toLowerCase().includes('login') ||
                        html.toLowerCase().includes('sign in');

    // Extract any error messages
    const errorMessages: string[] = [];
    const errorPatterns = [
      /error[^<]{0,100}/gi,
      /invalid[^<]{0,100}/gi,
      /incorrect[^<]{0,100}/gi
    ];
    
    for (const pattern of errorPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        errorMessages.push(...matches.slice(0, 3));
      }
    }

    return { url, title, hasLoginForm, errorMessages };
  }

  /**
   * Get site configuration from database
   */
  async getSiteConfig(url: string): Promise<SiteConfig | null> {
    const hostname = new URL(url).hostname.replace('www.', '');
    
    const result = await this.env.DB.prepare(
      'SELECT * FROM site_config WHERE ? LIKE "%" || url_pattern || "%"'
    ).bind(hostname).first<SiteConfig>();

    return result;
  }

  /**
   * Main authentication method - Hybrid AI approach
   */
  async authenticate(page: Page, config: SiteConfig): Promise<boolean> {
    try {
      console.log(`Starting authentication for ${config.url_pattern}`);

      // Step 1: Navigate to login page
      console.log(`Navigating to login URL: ${config.login_url}`);
      await page.goto(config.login_url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await this.delay(2000);

      // Step 2: Get current page state
      const currentState = await this.getPageState(page);

      // Step 3: Use GPT-120B to plan authentication strategy
      console.log('GPT-120B: Planning authentication strategy...');
      const strategy = await this.orchestrator.planAuthenticationStrategy(
        config,
        currentState
      );

      console.log(`Strategy: ${strategy.approach}`);
      console.log(`Steps: ${strategy.steps.length}`);
      console.log(`Challenges: ${strategy.challenges.join(', ')}`);

      // Get credentials
      const username = this.env[config.username_secret_var];
      const password = this.env[config.password_secret_var];

      if (!username || !password) {
        throw new Error(`Credentials not found for ${config.url_pattern}`);
      }

      // Step 4: Execute strategy step by step
      for (let i = 0; i < strategy.steps.length; i++) {
        const step = strategy.steps[i];
        console.log(`\nExecuting step ${i + 1}/${strategy.steps.length}: ${step.objective}`);

        if (step.action === 'fill_field') {
          await this.executeFillField(page, step, username, password);
        } else if (step.action === 'click') {
          await this.executeClick(page, step);
        } else if (step.action === 'wait') {
          await this.delay(2000);
        }

        // Verify progress if needed
        if (step.verifyProgress) {
          const newState = await this.getPageState(page);
          const evaluation = await this.orchestrator.evaluateProgress(
            newState,
            strategy,
            i + 1
          );

          console.log(`Progress evaluation: ${evaluation.reasoning}`);

          if (!evaluation.continue) {
            console.error('Authentication flow aborted:', evaluation.reasoning);
            return false;
          }

          if (evaluation.adjustments) {
            console.log('Strategy adjustment suggested:', evaluation.adjustments);
          }
        }
      }

      // Step 5: Final verification
      await this.delay(3000);
      const finalState = await this.getPageState(page);
      
      // Check if we're still on login page (authentication failed)
      if (finalState.url.includes('/login') || finalState.url.includes('/auth')) {
        console.error('Still on login page after authentication');
        return false;
      }

      console.log('Authentication appears successful');
      return true;

    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Execute fill field step using hybrid approach
   */
  private async executeFillField(
    page: Page,
    step: AuthStep,
    username: string,
    password: string
  ): Promise<void> {
    const value = step.fieldType === 'username' ? username : password;

    if (step.requiresVision) {
      // Use Vision AI to find the field
      console.log(`Vision AI: Finding ${step.fieldType} field...`);
      const selector = await this.visionAgent.findFormField(
        page,
        step.fieldType as 'username' | 'password' | 'submit'
      );
      console.log(`Found selector: ${selector}`);
      
      await page.waitForSelector(selector, { timeout: 10000 });
      await this.typeHumanLike(page, selector, value);
    } else {
      // Use GPT to analyze HTML and find field
      console.log(`GPT-20B: Analyzing HTML for ${step.fieldType} field...`);
      const analysis = await this.orchestrator.analyzePageHTML(page, step.objective);
      
      if (analysis.action === 'need_vision') {
        // Fall back to vision
        console.log('Falling back to vision AI...');
        const selector = await this.visionAgent.findFormField(
          page,
          step.fieldType as 'username' | 'password' | 'submit'
        );
        await page.waitForSelector(selector, { timeout: 10000 });
        await this.typeHumanLike(page, selector, value);
      } else if (analysis.selector) {
        console.log(`Found selector: ${analysis.selector} (confidence: ${analysis.confidence}%)`);
        await page.waitForSelector(analysis.selector, { timeout: 10000 });
        await this.typeHumanLike(page, analysis.selector, value);
      }
    }

    await this.delay(1000);
  }

  /**
   * Execute click step using hybrid approach
   */
  private async executeClick(page: Page, step: AuthStep): Promise<void> {
    if (step.requiresVision) {
      // Use Vision AI to find the button
      console.log(`Vision AI: Finding ${step.fieldType || 'submit'} button...`);
      const selector = await this.visionAgent.findFormField(
        page,
        step.fieldType as 'username' | 'password' | 'submit' || 'submit'
      );
      console.log(`Found selector: ${selector}`);
      
      await page.click(selector);
    } else {
      // Use GPT to analyze HTML and find button
      console.log(`GPT-20B: Analyzing HTML for button...`);
      const analysis = await this.orchestrator.analyzePageHTML(page, step.objective);
      
      if (analysis.action === 'need_vision') {
        // Fall back to vision
        console.log('Falling back to vision AI...');
        const selector = await this.visionAgent.findFormField(page, 'submit');
        await page.click(selector);
      } else if (analysis.selector) {
        console.log(`Found selector: ${analysis.selector} (confidence: ${analysis.confidence}%)`);
        await page.click(analysis.selector);
      }
    }

    console.log('Clicked, waiting for navigation...');
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      this.delay(30000)
    ]);
  }

  /**
   * Type text with human-like delays between keystrokes
   */
  private async typeHumanLike(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector); // Focus the field first
    
    for (const char of text) {
      await page.keyboard.type(char);
      // Random delay between 50-150ms to simulate human typing
      await this.delay(50 + Math.random() * 100);
    }
  }

  /**
   * Helper to create delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 4: Update the Vision Agent with Specific Methods

```typescript
import type { Page } from '@cloudflare/puppeteer';
import { VisionAgent } from './vision-agent';

export interface SiteConfig {
  url_pattern: string;
  username_secret_var: string;
  password_secret_var: string;
  login_url: string;
  login_agent_instructions?: string;
}

export class AuthService {
  private visionAgent: VisionAgent;

  constructor(private env: Env) {
    this.visionAgent = new VisionAgent(env);
  }

  /**
   * Get site configuration from database
   */
  async getSiteConfig(url: string): Promise<SiteConfig | null> {
    const hostname = new URL(url).hostname.replace('www.', '');
    
    const result = await this.env.DB.prepare(
      'SELECT * FROM site_config WHERE ? LIKE "%" || url_pattern || "%"'
    ).bind(hostname).first<SiteConfig>();

    return result;
  }

  /**
   * Main authentication method - AI-guided login
   */
  async authenticate(page: Page, config: SiteConfig): Promise<boolean> {
    try {
      console.log(`Starting authentication for ${config.url_pattern}`);

      // Step 1: Navigate to login page
      console.log(`Navigating to login URL: ${config.login_url}`);
      await page.goto(config.login_url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      // Wait for page to stabilize
      await this.delay(2000);

      // Step 2: Get credentials from environment
      const username = this.env[config.username_secret_var];
      const password = this.env[config.password_secret_var];

      if (!username || !password) {
        throw new Error(`Credentials not found for ${config.url_pattern}`);
      }

      // Step 3: Use AI to find username field
      console.log('AI analyzing page to find username field...');
      const usernameSelector = await this.visionAgent.findUsernameField(page);
      
      if (!usernameSelector) {
        throw new Error('Could not find username field');
      }

      console.log(`Found username field: ${usernameSelector}`);

      // Step 4: Fill username field with human-like typing
      await page.waitForSelector(usernameSelector, { timeout: 10000 });
      await this.typeHumanLike(page, usernameSelector, username);
      await this.delay(1000);

      // Step 5: Use AI to find password field
      console.log('AI analyzing page to find password field...');
      const passwordSelector = await this.visionAgent.findPasswordField(page);
      
      if (!passwordSelector) {
        throw new Error('Could not find password field');
      }

      console.log(`Found password field: ${passwordSelector}`);

      // Step 6: Fill password field with human-like typing
      await page.waitForSelector(passwordSelector, { timeout: 10000 });
      await this.typeHumanLike(page, passwordSelector, password);
      await this.delay(1000);

      // Step 7: Use AI to find submit button
      console.log('AI analyzing page to find submit button...');
      const submitSelector = await this.visionAgent.findSubmitButton(page);
      
      if (!submitSelector) {
        throw new Error('Could not find submit button');
      }

      console.log(`Found submit button: ${submitSelector}`);

      // Step 8: Click submit button
      await page.click(submitSelector);
      console.log('Clicked submit button, waiting for navigation...');

      // Wait for navigation or authentication to complete
      await Promise.race([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        this.delay(30000)
      ]);

      // Step 9: Verify successful authentication
      const currentUrl = page.url();
      console.log(`Post-login URL: ${currentUrl}`);

      // Check if we're still on the login page (authentication failed)
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        // Take a screenshot to see what went wrong
        const screenshot = await page.screenshot({ fullPage: true });
        console.error('Still on login page after submit, authentication may have failed');
        return false;
      }

      console.log('Authentication appears successful');
      return true;

    } catch (error) {
      console.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Type text with human-like delays between keystrokes
   */
  private async typeHumanLike(page: Page, selector: string, text: string): Promise<void> {
    await page.click(selector); // Focus the field first
    
    for (const char of text) {
      await page.keyboard.type(char);
      // Random delay between 50-150ms to simulate human typing
      await this.delay(50 + Math.random() * 100);
    }
  }

  /**
   * Helper to create delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### Step 3: Create the Main Worker

```typescript
import puppeteer from '@cloudflare/puppeteer';
import type { Browser } from '@cloudflare/puppeteer';
import { AuthService } from './services/auth-service';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Handle login automation request
    if (url.pathname === '/login' && request.method === 'POST') {
      return await handleLogin(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let browser: Browser | null = null;

  try {
    // Parse request
    const { targetUrl } = await request.json() as { targetUrl: string };

    if (!targetUrl) {
      return new Response('targetUrl is required', { status: 400 });
    }

    console.log(`Processing login for: ${targetUrl}`);

    // Initialize services
    const authService = new AuthService(env);

    // Launch browser
    console.log('Launching browser...');
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to target URL first to check if authentication is needed
    console.log(`Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if site requires authentication
    const siteConfig = await authService.getSiteConfig(targetUrl);

    if (!siteConfig) {
      return Response.json({
        success: false,
        error: 'No authentication configuration found for this site'
      }, { status: 404 });
    }

    // Perform authentication
    console.log('Starting authentication...');
    const authSuccess = await authService.authenticate(page, siteConfig);

    if (!authSuccess) {
      return Response.json({
        success: false,
        error: 'Authentication failed'
      }, { status: 401 });
    }

    // Navigate back to target URL after successful login
    console.log('Authentication successful, navigating to target page...');
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get page content or screenshot as proof
    const content = await page.content();
    const screenshot = await page.screenshot({ fullPage: true });

    return Response.json({
      success: true,
      message: 'Successfully authenticated and accessed page',
      currentUrl: page.url(),
      hasContent: content.length > 0
    });

  } catch (error) {
    console.error('Login automation error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
```

---

## AI Vision Integration

### Model Selection Strategy

This implementation uses a **hybrid approach** with two types of AI models:

#### **Vision Models** (Llama 4 Scout 17B)
- **Purpose**: Visual understanding of screenshots
- **Model**: `@cf/meta/llama-4-scout-17b-16e-instruct`
- **When to use**: Finding form elements, analyzing page layout, visual verification
- **Strengths**:
  - Native multimodal architecture (17B parameters with 16 experts)
  - Industry-leading vision understanding
  - Better at distinguishing similar elements
  - Function calling support for structured responses
- **Cost**: $0.27 input / $0.85 output per M tokens
- **Context Window**: 131K tokens

#### **Reasoning Models** (GPT-OSS)
Two GPT models for different reasoning tasks:

**1. GPT-OSS-120B** (Strategic Planning)
- **Model**: `@cf/openai/gpt-oss-120b`
- **When to use**: 
  - Planning authentication strategies
  - Complex flow control decisions
  - Error recovery logic
  - Progress evaluation
- **Strengths**: Superior reasoning for complex decisions
- **Cost**: $0.35 input / $0.75 output per M tokens
- **Context Window**: 128K tokens

**2. GPT-OSS-20B** (Quick Analysis)
- **Model**: `@cf/openai/gpt-oss-20b`
- **When to use**:
  - Quick HTML analysis
  - Simple boolean decisions
  - Fast field identification
  - Low-latency responses
- **Strengths**: Faster inference, lower cost
- **Cost**: $0.20 input / $0.30 output per M tokens
- **Context Window**: 128K tokens

### When to Use Each Model

| Task | Recommended Model | Why |
|------|------------------|-----|
| **Planning auth strategy** | GPT-OSS-120B | Needs deep reasoning about flow types |
| **Analyzing screenshots** | Llama 4 Scout Vision | Native multimodal, sees page layout |
| **HTML-based field detection** | GPT-OSS-20B | Fast text analysis without screenshot |
| **Error recovery decisions** | GPT-OSS-120B | Complex reasoning about what went wrong |
| **Progress evaluation** | GPT-OSS-120B | Strategic decision making |
| **Quick selector validation** | GPT-OSS-20B | Simple parsing task |
| **Visual verification** | Llama 4 Scout Vision | Needs to "see" success indicators |

### Cost Analysis

**Typical login flow costs:**

**Vision-Only Approach (Old):**
- 3 screenshots @ Llama 3.2: ~$0.00015 per login

**Hybrid Approach (Recommended):**
- 1 strategy planning (GPT-120B): ~$0.00035
- 2 HTML analysis (GPT-20B): ~$0.00040  
- 3 screenshots (Llama 4 Scout): ~$0.00024
- **Total: ~$0.00099 per login**

The 6x cost increase provides:
- ✅ Much more reliable authentication
- ✅ Adaptive strategies for different sites
- ✅ Better error handling and recovery
- ✅ Self-healing capabilities
- ✅ Reduced failed login attempts

### Understanding Vision Models

### Understanding Vision Models

**Llama 4 Scout 17B** is recommended for login automation because:

1. **Native Multimodal**: Built from the ground up for vision+text, not adapted
2. **Mixture of Experts**: 17B parameters with 16 experts for superior performance
3. **Context Understanding**: Better at interpreting page layouts and form fields
4. **Structured Output**: Function calling support for consistent JSON responses
5. **Fast Inference**: Optimized for real-time automation tasks
6. **Large Context**: 131K tokens handles complex pages with many elements

**Alternative Vision Models** (if needed):

- **Llama 3.2 11B Vision** (`@cf/meta/llama-3.2-11b-vision-instruct`)
  - Budget option: $0.049 input / $0.68 output
  - Good for simple login forms
  - Adequate performance for standard use cases

- **Mistral Small 3.1 24B** (`@cf/mistralai/mistral-small-3.1-24b-instruct`)
  - Most powerful: 24B parameters
  - State-of-the-art vision understanding
  - Better pricing: $0.35 input / $0.56 output
  - Excellent for complex multi-step auth

### Understanding Reasoning Models

**GPT-OSS models** excel at strategic thinking and flow control:

1. **Superior Reasoning**: Better at multi-step planning than vision models
2. **No Vision Needed**: Can analyze HTML directly, saving costs
3. **Faster for Text**: Lower latency when screenshots aren't required
4. **Structured Thinking**: Excellent at breaking down complex problems
5. **Error Analysis**: Better at understanding what went wrong

**When NOT to use vision models alone:**
- ❌ Strategic planning (use GPT-120B)
- ❌ HTML analysis (use GPT-20B first, vision as fallback)
- ❌ Error interpretation (use GPT-120B)
- ❌ Flow control decisions (use GPT-120B)

### Vision Prompting Best Practices

1. **Be Specific**: Tell the AI exactly what you're looking for
2. **Provide Context**: Mention this is a login page
3. **Request Format**: Specify the output format (CSS selector, JSON, etc.)
4. **Include Examples**: Show what kind of response you expect

Good prompt example:
```typescript
const prompt = `You are analyzing a login page screenshot.

Task: Find the USERNAME or EMAIL input field.

Look for:
- Input labeled "Email", "Username", or "Email/Phone"
- <input type="email"> or <input type="text">
- The first input field in the login form
- Placeholder text mentioning email or username

Respond with ONLY a CSS selector that can be used with page.querySelector().

Examples of good selectors:
- #username
- input[name="email"]
- input[type="email"]
- .login-email-field

Just provide the selector, nothing else.`;
```

### Handling Vision Model Responses

AI responses may not always be perfect. Implement fallbacks:

```typescript
async function findFieldWithFallback(
  page: Page,
  visionAgent: VisionAgent,
  fieldType: 'username' | 'password' | 'submit'
): Promise<string> {
  // Try AI vision first
  let selector: string | null = null;
  
  switch (fieldType) {
    case 'username':
      selector = await visionAgent.findUsernameField(page);
      break;
    case 'password':
      selector = await visionAgent.findPasswordField(page);
      break;
    case 'submit':
      selector = await visionAgent.findSubmitButton(page);
      break;
  }

  // Validate selector works
  if (selector) {
    try {
      const element = await page.$(selector);
      if (element) {
        return selector;
      }
    } catch {
      // Selector didn't work, try fallbacks
    }
  }

  // Fallback selectors based on common patterns
  const fallbacks = {
    username: [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="email"]',
      '#username',
      '#email',
      'input[autocomplete="username"]'
    ],
    password: [
      'input[name="password"]',
      'input[type="password"]',
      '#password'
    ],
    submit: [
      'button[type="submit"]',
      'input[type="submit"]',
      'button.login-button',
      'button.submit',
      '.btn-primary'
    ]
  };

  // Try fallbacks
  for (const fallback of fallbacks[fieldType]) {
    try {
      const element = await page.$(fallback);
      if (element) {
        console.log(`Using fallback selector: ${fallback}`);
        return fallback;
      }
    } catch {
      continue;
    }
  }

  throw new Error(`Could not find ${fieldType} field with AI or fallbacks`);
}
```

---

## Best Practices

### 1. Security

**Never hardcode credentials:**
```typescript
// ❌ BAD - Never do this
const username = 'myemail@example.com';
const password = 'mypassword123';

// ✅ GOOD - Use Wrangler secrets
const username = env.LINKEDIN_USERNAME;
const password = env.LINKEDIN_PASSWORD;
```

**Store credentials as Wrangler secrets:**
```bash
wrangler secret put LINKEDIN_USERNAME
wrangler secret put LINKEDIN_PASSWORD
```

### 2. Human-Like Behavior

Avoid detection by mimicking human behavior:

```typescript
class HumanBehavior {
  /**
   * Type with random delays like a human
   */
  static async typeHumanLike(page: Page, selector: string, text: string) {
    await page.click(selector);
    
    for (const char of text) {
      await page.keyboard.type(char);
      // Random delay between 50-200ms
      const delay = 50 + Math.random() * 150;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  /**
   * Move mouse naturally before clicking
   */
  static async clickNaturally(page: Page, selector: string) {
    const element = await page.$(selector);
    if (!element) throw new Error('Element not found');

    const box = await element.boundingBox();
    if (!box) throw new Error('Element has no bounding box');

    // Move to element position
    await page.mouse.move(
      box.x + box.width / 2,
      box.y + box.height / 2,
      { steps: 10 } // Gradual movement
    );

    // Small random delay before click
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /**
   * Scroll page naturally
   */
  static async scrollNaturally(page: Page) {
    await page.evaluate(() => {
      window.scrollBy({
        top: 300 + Math.random() * 200,
        behavior: 'smooth'
      });
    });
    
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
  }
}
```

### 3. Error Handling

Always handle errors gracefully:

```typescript
async function robustAuthentication(page: Page, config: SiteConfig): Promise<boolean> {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      attempt++;
      console.log(`Authentication attempt ${attempt}/${maxRetries}`);

      const success = await authService.authenticate(page, config);
      
      if (success) {
        return true;
      }

      // Take screenshot on failure for debugging
      const screenshot = await page.screenshot({ fullPage: true });
      console.error(`Attempt ${attempt} failed, screenshot captured`);
      
      // Wait before retry
      await new Promise(r => setTimeout(r, 2000 * attempt));

    } catch (error) {
      console.error(`Attempt ${attempt} error:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }

  return false;
}
```

### 4. Performance Optimization

```typescript
// Reuse browser sessions when possible
let globalBrowser: Browser | null = null;

async function getBrowser(env: Env): Promise<Browser> {
  if (!globalBrowser) {
    globalBrowser = await puppeteer.launch(env.BROWSER);
  }
  return globalBrowser;
}

// Use session persistence for frequently accessed sites
const sessions = await puppeteer.sessions(env.BROWSER);
if (sessions.length > 0) {
  // Reuse existing session
  const sessionId = sessions[0].sessionId;
  browser = await puppeteer.connect(env.BROWSER, sessionId);
} else {
  // Launch new session
  browser = await puppeteer.launch(env.BROWSER);
}
```

### 5. Debugging and Logging

```typescript
class AuthLogger {
  static async logStep(
    step: string,
    page: Page,
    additionalInfo?: any
  ) {
    console.log(`[${new Date().toISOString()}] ${step}`);
    
    if (additionalInfo) {
      console.log('Additional info:', JSON.stringify(additionalInfo, null, 2));
    }

    // Capture screenshot for debugging
    const screenshot = await page.screenshot({ fullPage: false });
    const screenshotBase64 = screenshot.toString('base64');
    
    // In production, you might want to store these in R2 for later review
    console.log(`Screenshot size: ${screenshot.length} bytes`);
  }
}

// Usage:
await AuthLogger.logStep('Navigated to login page', page, { url: page.url() });
await AuthLogger.logStep('Filled username', page, { field: usernameSelector });
await AuthLogger.logStep('Clicked submit', page);
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. "Could not find username field"

**Problem**: AI cannot identify the correct input field.

**Solutions**:
- Check if the page has loaded completely
- Try different prompts with more context
- Implement fallback selectors
- Take screenshot and analyze manually

```typescript
// Add delay before AI analysis
await page.waitForTimeout(5000);

// Try multiple analysis attempts
let selector = null;
for (let i = 0; i < 3; i++) {
  selector = await visionAgent.findUsernameField(page);
  if (selector) break;
  await page.waitForTimeout(2000);
}
```

#### 2. "Authentication appears to succeed but actually failed"

**Problem**: Page navigates away from login, but authentication cookies weren't set.

**Solutions**:
- Verify authentication by checking for user-specific elements
- Look for "logged in" indicators
- Check cookies

```typescript
async function verifyAuthentication(page: Page): Promise<boolean> {
  // Method 1: Check for user menu or profile link
  const userMenu = await page.$('[data-test="user-menu"]');
  if (userMenu) return true;

  // Method 2: Check cookies
  const cookies = await page.cookies();
  const hasAuthCookie = cookies.some(c => 
    c.name.includes('session') || 
    c.name.includes('auth') ||
    c.name.includes('token')
  );
  if (hasAuthCookie) return true;

  // Method 3: Check current URL
  const url = page.url();
  if (url.includes('/feed') || url.includes('/home') || url.includes('/dashboard')) {
    return true;
  }

  return false;
}
```

#### 3. "Workers AI timeout or rate limit"

**Problem**: Too many AI requests causing timeouts.

**Solutions**:
- Cache AI responses for similar pages
- Use fallback selectors first
- Implement exponential backoff

```typescript
const aiCache = new Map<string, string>();

async function findFieldWithCache(
  page: Page,
  fieldType: string,
  finder: () => Promise<string>
): Promise<string> {
  const url = page.url();
  const cacheKey = `${url}:${fieldType}`;

  // Check cache first
  if (aiCache.has(cacheKey)) {
    return aiCache.get(cacheKey)!;
  }

  // Call AI
  const result = await finder();
  
  // Cache result
  aiCache.set(cacheKey, result);
  
  return result;
}
```

#### 4. "Bot detection / CAPTCHA"

**Problem**: Site detects automation and shows CAPTCHA.

**Solutions**:
- Use more realistic user agents
- Add random delays
- Rotate IP addresses (not built-in to Workers)
- Handle CAPTCHA with external service

```typescript
async function handleCaptcha(page: Page): Promise<boolean> {
  // Detect CAPTCHA
  const captcha = await page.$('iframe[src*="recaptcha"]');
  
  if (captcha) {
    console.warn('CAPTCHA detected - manual intervention needed');
    
    // Option 1: Wait for manual solve (not practical in production)
    // await page.waitForTimeout(30000);
    
    // Option 2: Use CAPTCHA solving service (2captcha, Anti-Captcha, etc.)
    // const solution = await solveCaptcha(page);
    // await applyCaptchaSolution(page, solution);
    
    return false;
  }
  
  return true;
}
```

---

## Example Code

### Complete Example: LinkedIn Login Automation (Hybrid AI)

```typescript
import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';
import { AuthService } from './services/auth-service';
import { AIOrchestrator } from './services/ai-orchestrator';
import { VisionAgent } from './services/vision-agent';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/login-linkedin' && request.method === 'POST') {
      return await loginToLinkedIn(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;

async function loginToLinkedIn(request: Request, env: Env): Promise<Response> {
  let browser: Browser | null = null;

  try {
    const { targetJobUrl } = await request.json() as { targetJobUrl: string };

    // Launch browser
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Initialize services
    const authService = new AuthService(env);
    const orchestrator = new AIOrchestrator(env);
    const visionAgent = new VisionAgent(env);

    // Navigate to LinkedIn login
    console.log('Navigating to LinkedIn login...');
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2000);

    // Get credentials
    const username = env.LINKEDIN_USERNAME;
    const password = env.LINKEDIN_PASSWORD;

    if (!username || !password) {
      throw new Error('LinkedIn credentials not configured');
    }

    // Step 1: Get page state and plan strategy
    const currentState = {
      url: page.url(),
      title: await page.title(),
      hasLoginForm: true,
      errorMessages: []
    };

    console.log('GPT-120B: Planning LinkedIn authentication strategy...');
    const strategy = await orchestrator.planAuthenticationStrategy(
      {
        url_pattern: 'linkedin.com',
        username_secret_var: 'LINKEDIN_USERNAME',
        password_secret_var: 'LINKEDIN_PASSWORD',
        login_url: 'https://www.linkedin.com/login',
        login_agent_instructions: 'LinkedIn uses a single-step login with username and password on the same page.'
      },
      currentState
    );

    console.log(`Strategy: ${strategy.approach}`);
    console.log(`Steps planned: ${strategy.steps.length}`);

    // Step 2: Execute each step in the strategy
    for (let i = 0; i < strategy.steps.length; i++) {
      const step = strategy.steps[i];
      console.log(`\nStep ${i + 1}/${strategy.steps.length}: ${step.objective}`);

      if (step.fieldType === 'username') {
        // Try GPT HTML analysis first for speed
        console.log('GPT-20B: Analyzing HTML for username field...');
        const htmlAnalysis = await orchestrator.analyzePageHTML(
          page,
          'Find the email/username input field'
        );

        let usernameSelector: string;

        if (htmlAnalysis.confidence > 70 && htmlAnalysis.selector) {
          console.log(`Using HTML-based selector: ${htmlAnalysis.selector} (${htmlAnalysis.confidence}% confident)`);
          usernameSelector = htmlAnalysis.selector;
        } else {
          // Fall back to vision
          console.log('Falling back to Llama 4 Scout vision...');
          const screenshot = await page.screenshot({ fullPage: true });
          const prompt = `Find the EMAIL or USERNAME input field on this LinkedIn login page.
Return ONLY a CSS selector. Common options:
- #username
- input[name="session_key"]
- input[autocomplete="username"]`;

          const visionResponse = await env.AI.run(
            '@cf/meta/llama-4-scout-17b-16e-instruct',
            {
              messages: [{ role: 'user', content: prompt }],
              image: `data:image/png;base64,${screenshot.toString('base64')}`
            }
          );

          usernameSelector = visionResponse.response?.trim() || '#username';
          console.log(`Vision found: ${usernameSelector}`);
        }

        // Fill username with human-like typing
        await page.waitForSelector(usernameSelector, { timeout: 10000 });
        await page.click(usernameSelector);
        
        for (const char of username) {
          await page.keyboard.type(char);
          await page.waitForTimeout(50 + Math.random() * 100);
        }

        console.log('Username filled');
        await page.waitForTimeout(1000);
      }

      if (step.fieldType === 'password') {
        // Use vision for password field (more reliable)
        console.log('Llama 4 Scout: Finding password field...');
        const screenshot = await page.screenshot({ fullPage: true });
        const prompt = `Find the PASSWORD input field on this page.
Return ONLY a CSS selector. Common options:
- #password
- input[name="session_password"]
- input[type="password"]`;

        const visionResponse = await env.AI.run(
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          {
            messages: [{ role: 'user', content: prompt }],
            image: `data:image/png;base64,${screenshot.toString('base64')}`
          }
        );

        const passwordSelector = visionResponse.response?.trim() || '#password';
        console.log(`Password selector: ${passwordSelector}`);

        // Fill password
        await page.waitForSelector(passwordSelector, { timeout: 10000 });
        await page.click(passwordSelector);
        
        for (const char of password) {
          await page.keyboard.type(char);
          await page.waitForTimeout(50 + Math.random() * 100);
        }

        console.log('Password filled');
        await page.waitForTimeout(1000);
      }

      if (step.fieldType === 'submit') {
        // Use vision for submit button
        console.log('Llama 4 Scout: Finding submit button...');
        const screenshot = await page.screenshot({ fullPage: true });
        const prompt = `Find the SIGN IN or LOGIN button on this page.
Return ONLY a CSS selector. Common options:
- button[type="submit"]
- button.btn__primary--large
- .sign-in-form__submit-btn`;

        const visionResponse = await env.AI.run(
          '@cf/meta/llama-4-scout-17b-16e-instruct',
          {
            messages: [{ role: 'user', content: prompt }],
            image: `data:image/png;base64,${screenshot.toString('base64')}`
          }
        );

        const submitSelector = visionResponse.response?.trim() || 'button[type="submit"]';
        console.log(`Submit selector: ${submitSelector}`);

        // Click submit
        await page.click(submitSelector);
        console.log('Clicked submit, waiting for navigation...');

        // Wait for login to complete
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
          page.waitForTimeout(30000)
        ]);
      }

      // Verify progress if required
      if (step.verifyProgress) {
        const newState = {
          url: page.url(),
          title: await page.title(),
          hasLoginForm: page.url().includes('/login'),
          errorMessages: []
        };

        console.log('GPT-120B: Evaluating authentication progress...');
        const evaluation = await orchestrator.evaluateProgress(
          newState,
          strategy,
          i + 1
        );

        console.log(`Evaluation: ${evaluation.reasoning}`);

        if (!evaluation.continue) {
          throw new Error(`Authentication failed: ${evaluation.reasoning}`);
        }
      }
    }

    const currentUrl = page.url();
    console.log(`After login URL: ${currentUrl}`);

    // Verify we're not still on login page
    if (currentUrl.includes('/login')) {
      return Response.json({
        success: false,
        error: 'Still on login page - authentication may have failed'
      }, { status: 401 });
    }

    // Navigate to target job if provided
    if (targetJobUrl) {
      console.log(`Navigating to job: ${targetJobUrl}`);
      await page.goto(targetJobUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForTimeout(3000);
    }

    // Get page content
    const finalUrl = page.url();
    const title = await page.title();

    return Response.json({
      success: true,
      message: 'Successfully logged in to LinkedIn using hybrid AI approach',
      finalUrl,
      pageTitle: title,
      strategy: strategy.approach,
      stepsExecuted: strategy.steps.length
    });

  } catch (error) {
    console.error('LinkedIn login error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
```

```typescript
import puppeteer from '@cloudflare/puppeteer';
import type { Browser, Page } from '@cloudflare/puppeteer';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/login-linkedin' && request.method === 'POST') {
      return await loginToLinkedIn(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;

async function loginToLinkedIn(request: Request, env: Env): Promise<Response> {
  let browser: Browser | null = null;

  try {
    const { targetJobUrl } = await request.json() as { targetJobUrl: string };

    // Launch browser
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    // Set realistic user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to LinkedIn login
    console.log('Navigating to LinkedIn login...');
    await page.goto('https://www.linkedin.com/login', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForTimeout(2000);

    // Get credentials
    const username = env.LINKEDIN_USERNAME;
    const password = env.LINKEDIN_PASSWORD;

    if (!username || !password) {
      throw new Error('LinkedIn credentials not configured');
    }

    // Use AI to find username field
    console.log('AI analyzing page for username field...');
    const screenshot1 = await page.screenshot({ fullPage: true });
    const usernamePrompt = `Look at this LinkedIn login page.
Find the EMAIL or USERNAME input field.
Respond with ONLY a CSS selector. Common ones:
- #username
- input[name="session_key"]
- input[autocomplete="username"]`;

    const usernameAnalysis = await env.AI.run(
      '@cf/meta/llama-3.2-11b-vision-instruct',
      {
        messages: [{ role: 'user', content: usernamePrompt }],
        image: `data:image/png;base64,${screenshot1.toString('base64')}`
      }
    );

    let usernameSelector = usernameAnalysis.response?.trim() || '#username';
    console.log(`Username selector: ${usernameSelector}`);

    // Fill username with human-like typing
    await page.waitForSelector(usernameSelector, { timeout: 10000 });
    await page.click(usernameSelector);
    
    for (const char of username) {
      await page.keyboard.type(char);
      await page.waitForTimeout(50 + Math.random() * 100);
    }

    await page.waitForTimeout(1000);

    // Find password field
    console.log('AI analyzing page for password field...');
    const screenshot2 = await page.screenshot({ fullPage: true });
    const passwordPrompt = `Look at this page.
Find the PASSWORD input field.
Respond with ONLY a CSS selector. Common ones:
- #password
- input[name="session_password"]
- input[type="password"]`;

    const passwordAnalysis = await env.AI.run(
      '@cf/meta/llama-3.2-11b-vision-instruct',
      {
        messages: [{ role: 'user', content: passwordPrompt }],
        image: `data:image/png;base64,${screenshot2.toString('base64')}`
      }
    );

    let passwordSelector = passwordAnalysis.response?.trim() || '#password';
    console.log(`Password selector: ${passwordSelector}`);

    // Fill password
    await page.waitForSelector(passwordSelector, { timeout: 10000 });
    await page.click(passwordSelector);
    
    for (const char of password) {
      await page.keyboard.type(char);
      await page.waitForTimeout(50 + Math.random() * 100);
    }

    await page.waitForTimeout(1000);

    // Find and click submit button
    console.log('AI analyzing page for submit button...');
    const screenshot3 = await page.screenshot({ fullPage: true });
    const submitPrompt = `Look at this page.
Find the SIGN IN or LOGIN button.
Respond with ONLY a CSS selector. Common ones:
- button[type="submit"]
- button.btn__primary--large
- button[data-litms-control-urn*="login-submit"]`;

    const submitAnalysis = await env.AI.run(
      '@cf/meta/llama-3.2-11b-vision-instruct',
      {
        messages: [{ role: 'user', content: submitPrompt }],
        image: `data:image/png;base64,${screenshot3.toString('base64')}`
      }
    );

    let submitSelector = submitAnalysis.response?.trim() || 'button[type="submit"]';
    console.log(`Submit selector: ${submitSelector}`);

    // Click submit
    await page.click(submitSelector);
    console.log('Clicked submit, waiting for navigation...');

    // Wait for login to complete
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
      page.waitForTimeout(30000)
    ]);

    const currentUrl = page.url();
    console.log(`After login URL: ${currentUrl}`);

    // Verify we're not still on login page
    if (currentUrl.includes('/login')) {
      return Response.json({
        success: false,
        error: 'Still on login page - authentication may have failed'
      }, { status: 401 });
    }

    // Navigate to target job
    if (targetJobUrl) {
      console.log(`Navigating to job: ${targetJobUrl}`);
      await page.goto(targetJobUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await page.waitForTimeout(3000);
    }

    // Get page content
    const finalUrl = page.url();
    const title = await page.title();

    return Response.json({
      success: true,
      message: 'Successfully logged in to LinkedIn',
      finalUrl,
      pageTitle: title
    });

  } catch (error) {
    console.error('LinkedIn login error:', error);
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
```

---

## Advanced Topics

### Multi-Step Authentication

Some sites require multiple steps (e.g., email first, then password):

```typescript
async function multiStepAuthentication(
  page: Page,
  username: string,
  password: string
): Promise<boolean> {
  // Step 1: Enter email
  const emailSelector = await findUsernameField(page);
  await typeHumanLike(page, emailSelector, username);
  await page.click('button[type="submit"]'); // "Next" button
  
  // Wait for second step
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Step 2: Enter password
  const passwordSelector = await findPasswordField(page);
  await typeHumanLike(page, passwordSelector, password);
  await page.click('button[type="submit"]'); // "Sign in" button

  // Wait for completion
  await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
  
  return true;
}
```

### Cookie Persistence

Store cookies for faster subsequent logins:

```typescript
import { KVNamespace } from '@cloudflare/workers-types';

async function saveCookies(page: Page, key: string, kv: KVNamespace) {
  const cookies = await page.cookies();
  await kv.put(key, JSON.stringify(cookies), {
    expirationTtl: 86400 // 24 hours
  });
}

async function loadCookies(page: Page, key: string, kv: KVNamespace) {
  const stored = await kv.get(key);
  if (stored) {
    const cookies = JSON.parse(stored);
    await page.setCookie(...cookies);
    return true;
  }
  return false;
}

// Usage:
const cookieKey = `linkedin:${username}`;
const hasCookies = await loadCookies(page, cookieKey, env.COOKIES_KV);

if (hasCookies) {
  // Try navigating directly without login
  await page.goto(targetUrl);
  const isAuthenticated = await verifyAuthentication(page);
  
  if (isAuthenticated) {
    console.log('Used cached cookies successfully');
    return true;
  }
}

// Fall back to full login flow
const success = await authenticate(page, config);
if (success) {
  await saveCookies(page, cookieKey, env.COOKIES_KV);
}
```

---

## Conclusion

This hybrid AI-powered login automation approach using Puppeteer, GPT-OSS, and Llama 4 Scout provides:

✅ **Intelligence**: GPT-120B plans optimal strategies for different sites  
✅ **Precision**: Llama 4 Scout's native multimodal vision finds elements accurately  
✅ **Efficiency**: GPT-20B handles HTML analysis without screenshots  
✅ **Resilience**: Adapts to UI changes automatically  
✅ **Flexibility**: Works with any login form through adaptive strategies  
✅ **Scalability**: Serverless architecture handles concurrent logins  
✅ **Security**: Credentials stored as encrypted secrets  
✅ **Observability**: Rich logging and debugging capabilities  

### Architecture Benefits

**Separation of Concerns:**
- 🧠 **GPT-120B**: Strategic "brain" for planning and decisions
- 👁️ **Llama 4 Scout**: Visual "eyes" for seeing page elements  
- ⚡ **GPT-20B**: Fast "reflexes" for quick HTML analysis

**Cost-Effective:**
- Vision only when needed (screenshots are expensive)
- Fast HTML analysis first (saves vision API calls)
- Strategic planning prevents failed attempts (saves retry costs)

**Robust Error Handling:**
- GPT-120B understands why authentication failed
- Adaptive strategies for different scenarios
- Self-healing through progress evaluation  

### Next Steps

1. **Implement the hybrid architecture** with GPT-OSS and Llama 4 Scout
2. **Test with multiple sites** to refine prompts for both vision and reasoning
3. **Optimize model selection** - use HTML analysis first, vision as fallback
4. **Implement cookie caching** for better performance and cost savings
5. **Add retry logic** with GPT-120B analyzing failures
6. **Monitor AI costs** and adjust model selection based on success rates
7. **Fine-tune prompts** for better structured outputs from both models
8. **Implement rate limiting** to avoid detection and manage costs

### Resources

- [Cloudflare Puppeteer Docs](https://developers.cloudflare.com/browser-rendering/platform/puppeteer/)
- [Workers AI Models](https://developers.cloudflare.com/workers-ai/models/)
- [Llama Vision Tutorial](https://developers.cloudflare.com/workers-ai/guides/tutorials/llama-vision-tutorial/)
- [Browser Rendering API](https://developers.cloudflare.com/browser-rendering/)

---

**Last Updated**: October 2025  
**Version**: 2.0.0 - Hybrid AI Architecture (GPT-OSS + Llama 4 Scout)  
**Architecture**: Separation of concerns with reasoning (GPT) and vision (Llama) models
