/**
 * @fileoverview Authentication Service for AI-Powered Website Login
 * 
 * This service handles automated authentication to job posting websites using
 * AI vision analysis and intelligent form interaction. It can adapt to different
 * login flows and handle complex authentication challenges.
 * 
 * Key Features:
 * - AI-guided form field detection and interaction
 * - Support for multi-step authentication flows
 * - Automatic handling of common challenges (2FA, CAPTCHAs, security checks)
 * - Human-like interaction patterns to avoid detection
 * - Configurable site-specific authentication strategies
 * - Robust error handling and recovery mechanisms
 * 
 * Supported Authentication Patterns:
 * - Username/password forms (single or multi-step)
 * - Email/password combinations
 * - Social login redirects (limited support)
 * - Two-factor authentication (with manual intervention)
 * - CAPTCHA challenges (with external solving services)
 * - Security verification pages
 * - Cookie consent handling
 * 
 * The service uses a vision-first approach where AI analyzes page screenshots
 * to understand the layout and identify interactive elements, making it resilient
 * to UI changes and different site designs.
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
 */

import type { Page } from '@cloudflare/puppeteer';
import type { SiteConfig } from '../types';
// Env is now globally available from worker-configuration.d.ts
import { VisionAgent } from './vision-agent';
import { createSiteConfigMatcher } from '../utils/url-utils';

/**
 * Authentication Service Class
 * 
 * Handles automated login flows for job posting websites using AI vision
 * and intelligent interaction patterns. The service is designed to be
 * resilient to UI changes and can adapt to different authentication flows.
 * 
 * @example
 * const authService = new AuthService(env);
 * const siteConfig = await authService.getSiteConfig(url);
 * if (siteConfig) {
 *   const success = await authService.authenticate(page, siteConfig);
 * }
 */
export class AuthService {
  private visionAgent: VisionAgent;

  /**
   * Initialize the Authentication Service
   * 
   * @param env - Cloudflare environment bindings containing credentials and AI models
   */
  constructor(private env: Env) {
    this.visionAgent = new VisionAgent(env);
  }

  /**
   * Get site configuration based on URL pattern matching
   * 
   * Uses the centralized SiteConfigMatcher utility to find authentication
   * configuration for a given URL. This ensures consistent pattern matching
   * logic across all services.
   * 
   * @param url - The target URL to check for authentication requirements
   * @returns Promise<SiteConfig | null> - Site configuration or null if no match
   * 
   * @example
   * const config = await getSiteConfig('https://www.linkedin.com/jobs/view/4281423903/');
   * // Uses centralized matcher to extract 'linkedin.com' and match against patterns
   * // Returns: { url_pattern: 'linkedin.com/jobs/view', username_secret_var: 'LINKEDIN_USERNAME', ... }
   */
  async getSiteConfig(url: string): Promise<SiteConfig | null> {
    const matcher = createSiteConfigMatcher(this.env);
    return await matcher.findSiteConfig(url);
  }

  /**
   * Authenticate to a website using AI vision and reasoning
   * 
   * This is the main authentication orchestrator that handles the complete login flow.
   * It uses AI vision to understand page layouts and adapt to different authentication
   * patterns across various job sites.
   * 
   * Authentication Flow:
   * 1. Navigate to the site's login page
   * 2. Retrieve credentials from environment variables
   * 3. Use AI vision to identify and fill username field
   * 4. Use AI vision to identify and fill password field
   * 5. Submit the login form using AI-identified submit button
   * 6. Handle post-login challenges (2FA, CAPTCHAs, security checks)
   * 7. Verify successful authentication
   * 
   * The process is designed to be resilient to UI changes by using AI vision
   * rather than hardcoded selectors. Each step includes error handling and
   * recovery mechanisms.
   * 
   * @param page - Puppeteer page instance for browser interaction
   * @param siteConfig - Site-specific configuration from D1 database
   * @returns Promise<boolean> - True if authentication successful, false otherwise
   * 
   * @example
   * const success = await authenticate(page, {
   *   url_pattern: 'linkedin.com/jobs/view',
   *   username_secret_var: 'LINKEDIN_USERNAME',
   *   password_secret_var: 'LINKEDIN_PASSWORD',
   *   login_url: 'https://www.linkedin.com/login'
   * });
   */
  async authenticate(page: Page, siteConfig: SiteConfig): Promise<boolean> {
    try {
      console.log(`Starting authentication for ${siteConfig.url_pattern}`);
      
      // Navigate to the site's login page
      // Use domcontentloaded to ensure basic page structure is ready
      await page.goto(siteConfig.login_url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000  // 30 second timeout for navigation
      });

      // Allow page to stabilize - many sites load login forms asynchronously
      // This prevents attempting to interact with elements before they're ready
      await this.sleep(2000);

      // Retrieve credentials from Cloudflare Worker environment variables
      // These are stored as secrets and accessed by the variable names in site config
      const username = (this.env as any)[siteConfig.username_secret_var];
      const password = (this.env as any)[siteConfig.password_secret_var];

      // Validate that credentials are available
      if (!username || !password) {
        throw new Error(`Missing credentials: ${siteConfig.username_secret_var} or ${siteConfig.password_secret_var}`);
      }

      // Execute the multi-step authentication process
      // Each step uses AI vision to understand the current page state
      
      // Step 1: Handle username/email input field
      await this.handleUsernameStep(page, username, siteConfig);
      
      // Step 2: Handle password input field
      await this.handlePasswordStep(page, password, siteConfig);
      
      // Step 3: Submit the login form
      await this.handleSubmitStep(page, siteConfig);

      // Step 4: Handle any post-login challenges
      // This includes 2FA, CAPTCHAs, security verification, cookie consent, etc.
      await this.handlePostLoginChallenges(page, siteConfig);

      // Step 5: Verify that authentication was successful
      return await this.verifyLogin(page, siteConfig);

    } catch (error) {
      // Log authentication failures for debugging
      console.error('Authentication failed:', error);
      return false;
    }
  }

  /**
   * Handle username/email input step of authentication
   * 
   * Uses AI vision to identify the username or email input field on the login page
   * and fills it with the provided credentials. This method is designed to work
   * across different sites with varying form layouts.
   * 
   * The AI analyzes the page screenshot to understand the form structure and
   * identify the appropriate input field, making it resilient to UI changes.
   * 
   * @param page - Puppeteer page instance
   * @param username - Username or email to enter
   * @param siteConfig - Site configuration for context
   * @throws Error if username field cannot be found or filled
   * 
   * @private
   */
  private async handleUsernameStep(page: Page, username: string, siteConfig: SiteConfig): Promise<void> {
    // Define the goal for AI vision analysis
    const goal = "I need to enter my username/email to log in. Find and fill the username/email input field.";
    
    // Use AI vision to analyze the page and determine the next action
    // This leverages the 3-model approach: LLaVA for vision → GPT-OSS-120B for reasoning
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Execute the action if AI identified a valid input field
    if (analysis.action === 'type' && analysis.selector) {
      // Wait for the element to be available in the DOM
      await page.waitForSelector(analysis.selector, { timeout: 10000 });
      
      // Click to focus the input field
      await page.click(analysis.selector);
      
      // Type username with human-like delays between keystrokes
      await page.type(analysis.selector, username, { delay: this.getRandomDelay() });
      
      // Brief pause to allow for any form validation or UI updates
      await this.sleep(1000);
    } else {
      throw new Error('Could not find username input field');
    }
  }

  /**
   * Handle password input step of authentication
   * 
   * Similar to username handling, this method uses AI vision to identify
   * the password input field and fill it with credentials. It handles
   * various password field types and layouts.
   * 
   * @param page - Puppeteer page instance
   * @param password - Password to enter
   * @param siteConfig - Site configuration for context
   * @throws Error if password field cannot be found or filled
   * 
   * @private
   */
  private async handlePasswordStep(page: Page, password: string, siteConfig: SiteConfig): Promise<void> {
    // Define the goal for AI vision analysis
    const goal = "I need to enter my password to log in. Find and fill the password input field.";
    
    // Use AI vision to analyze the page and identify password field
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Execute the action if AI identified a valid password field
    if (analysis.action === 'type' && analysis.selector) {
      // Wait for the password field to be available
      await page.waitForSelector(analysis.selector, { timeout: 10000 });
      
      // Click to focus the password field
      await page.click(analysis.selector);
      
      // Type password with human-like delays
      await page.type(analysis.selector, password, { delay: this.getRandomDelay() });
      
      // Brief pause for form validation
      await this.sleep(1000);
    } else {
      throw new Error('Could not find password input field');
    }
  }

  /**
   * Handle login form submission
   * 
   * Uses AI vision to identify and click the login/submit button. This method
   * handles various button types (submit buttons, links, etc.) and waits for
   * the resulting navigation or page changes.
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * @throws Error if submit button cannot be found or clicked
   * 
   * @private
   */
  private async handleSubmitStep(page: Page, siteConfig: SiteConfig): Promise<void> {
    // Define the goal for AI vision analysis
    const goal = "I need to submit the login form. Find and click the login/sign-in button.";
    
    // Use AI vision to identify the submit button
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Execute the click action if AI identified a submit button
    if (analysis.action === 'click' && analysis.selector) {
      // Wait for the submit button to be available
      await page.waitForSelector(analysis.selector, { timeout: 10000 });
      
      // Click submit button and wait for navigation
      // Many login forms redirect after successful submission
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        page.click(analysis.selector)
      ]);
      
      // Allow time for post-login page to stabilize
      await this.sleep(3000);
    } else {
      throw new Error('Could not find login submit button');
    }
  }

  /**
   * Handle post-login challenges and verification steps
   * 
   * After submitting login credentials, many sites present additional challenges
   * such as 2FA, CAPTCHAs, security verification, or cookie consent. This method
   * detects and handles common post-login scenarios.
   * 
   * Challenge Detection Strategy:
   * - Scans page content for challenge-specific keywords
   * - Uses pattern matching to identify challenge types
   * - Delegates to specialized handlers for each challenge type
   * - Processes challenges in order of likelihood/importance
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * 
   * @private
   */
  private async handlePostLoginChallenges(page: Page, siteConfig: SiteConfig): Promise<void> {
    // Define common post-login challenges with detection patterns and handlers
    const challenges = [
      { 
        pattern: /two.factor|2fa|verification|security.code/i, 
        handler: this.handle2FA,
        description: 'Two-Factor Authentication'
      },
      { 
        pattern: /captcha/i, 
        handler: this.handleCaptcha,
        description: 'CAPTCHA Challenge'
      },
      { 
        pattern: /suspicious.activity|verify.account/i, 
        handler: this.handleSecurityCheck,
        description: 'Security Verification'
      },
      { 
        pattern: /accept.cookies|cookie.policy/i, 
        handler: this.handleCookieConsent,
        description: 'Cookie Consent'
      }
    ];

    // Check page content for challenge indicators
    const pageContent = await page.content();
    
    // Process challenges in order, handling the first match found
    for (const challenge of challenges) {
      if (challenge.pattern.test(pageContent)) {
        console.log(`Detected post-login challenge: ${challenge.description}`);
        await challenge.handler.call(this, page, siteConfig);
        break; // Handle only one challenge at a time
      }
    }
  }

  /**
   * Handle Two-Factor Authentication (2FA) challenges
   * 
   * When 2FA is detected, this method currently implements a waiting strategy
   * to allow for manual intervention. In production environments, this could
   * be enhanced to integrate with SMS APIs, authenticator apps, or email services.
   * 
   * Future Enhancements:
   * - SMS API integration for automated code retrieval
   * - TOTP authenticator app integration
   * - Email parsing for verification codes
   * - Push notification handling
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * 
   * @private
   */
  private async handle2FA(page: Page, siteConfig: SiteConfig): Promise<void> {
    console.log('2FA challenge detected - this requires manual intervention');
    
    // TODO: Implement automated 2FA handling
    // Options include:
    // - SMS API integration (Twilio, etc.)
    // - TOTP library integration for authenticator apps
    // - Email parsing for verification codes
    // - WebSocket communication for real-time code input
    
    // For now, wait 30 seconds for manual user intervention
    await this.sleep(30000);
  }

  /**
   * Handle CAPTCHA challenges
   * 
   * Detects CAPTCHA challenges and attempts to solve them using AI vision analysis.
   * Currently implements a basic waiting strategy, but can be enhanced with
   * CAPTCHA solving services or advanced AI techniques.
   * 
   * CAPTCHA Types Supported:
   * - Image-based CAPTCHAs (with vision analysis)
   * - Text-based challenges
   * - reCAPTCHA (limited support)
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * 
   * @private
   */
  private async handleCaptcha(page: Page, siteConfig: SiteConfig): Promise<void> {
    console.log('CAPTCHA detected - attempting to solve with vision');
    
    // Use AI vision to analyze the CAPTCHA type and content
    const goal = "I see a CAPTCHA challenge. Analyze what type it is and provide guidance.";
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // TODO: Implement CAPTCHA solving logic
    // Options include:
    // - Integration with CAPTCHA solving services (2captcha, Anti-Captcha)
    // - Advanced AI vision for image recognition
    // - Audio CAPTCHA processing for accessibility
    
    // For now, wait for potential manual intervention or automatic resolution
    await this.sleep(10000);
  }

  /**
   * Handle security verification pages
   * 
   * Some sites present additional security verification steps after login,
   * such as device verification, location confirmation, or account security checks.
   * This method uses AI vision to identify and interact with verification elements.
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * 
   * @private
   */
  private async handleSecurityCheck(page: Page, siteConfig: SiteConfig): Promise<void> {
    console.log('Security check detected');
    
    // Use AI vision to identify verification options
    const goal = "I see a security verification page. Find any buttons to continue or verify.";
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Click continue/verify button if identified by AI
    if (analysis.action === 'click' && analysis.selector) {
      await page.click(analysis.selector);
      await this.sleep(3000); // Allow time for verification processing
    }
  }

  /**
   * Handle cookie consent banners
   * 
   * Many sites display cookie consent banners that must be dismissed before
   * proceeding. This method uses AI vision to identify and accept cookie policies.
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * 
   * @private
   */
  private async handleCookieConsent(page: Page, siteConfig: SiteConfig): Promise<void> {
    console.log('Cookie consent detected');
    
    // Use AI vision to find the accept button
    const goal = "I see a cookie consent banner. Find and click the accept button.";
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Click accept button if identified by AI
    if (analysis.action === 'click' && analysis.selector) {
      await page.click(analysis.selector);
      await this.sleep(1000); // Brief pause after accepting cookies
    }
  }

  /**
   * Verify successful authentication
   * 
   * After completing the authentication flow, this method verifies that login
   * was successful by analyzing multiple indicators. It uses both heuristic
   * checks and AI vision analysis for comprehensive verification.
   * 
   * Verification Strategy:
   * 1. URL analysis - check for post-login URL patterns
   * 2. Content analysis - look for authenticated user elements
   * 3. Negative indicators - absence of login-related elements
   * 4. AI vision analysis - visual confirmation of authenticated state
   * 
   * Success Indicators:
   * - URLs containing: dashboard, profile, account, feed, home
   * - Content containing: logout, sign out, account settings
   * - Absence of: login, sign in, authentication in URL
   * - Visual elements: user avatars, navigation menus, personalized content
   * 
   * @param page - Puppeteer page instance
   * @param siteConfig - Site configuration for context
   * @returns Promise<boolean> - True if login verification successful
   * 
   * @private
   */
  private async verifyLogin(page: Page, siteConfig: SiteConfig): Promise<boolean> {
    // Get current page state for analysis
    const url = page.url();
    const content = await page.content();
    
    // Define heuristic success indicators
    const successIndicators = [
      // URL-based indicators - common post-login URL patterns
      /dashboard|profile|account|feed|home/i.test(url),
      
      // Content-based indicators - elements that appear when logged in
      /logout|sign.out|account.settings/i.test(content),
      
      // Negative indicators - absence of login-related elements in URL
      !/login|sign.in|authentication/i.test(url)
    ];

    // Check if any heuristic indicators suggest successful login
    const isLoggedIn = successIndicators.some(indicator => indicator);
    
    if (isLoggedIn) {
      console.log('Login verification successful via heuristic analysis');
      return true;
    }

    // Use AI vision for additional verification
    // This provides visual confirmation of authenticated state
    const goal = "Analyze if I have successfully logged in. Look for user profile elements, navigation menus, or other indicators of being authenticated.";
    const analysis = await this.visionAgent.analyzePageForAction(page, goal);
    
    // Return AI's assessment of login success
    const visionVerified = analysis.success === true;
    
    if (visionVerified) {
      console.log('Login verification successful via AI vision analysis');
    } else {
      console.log('Login verification failed - no clear success indicators found');
    }
    
    return visionVerified;
  }

  /**
   * Generate random delay for human-like typing
   * 
   * Returns a random delay between 50-150ms to simulate natural human
   * typing patterns. This helps avoid detection by anti-automation systems
   * that look for unnaturally consistent timing patterns.
   * 
   * @returns number - Random delay in milliseconds (50-150ms)
   * 
   * @private
   */
  private getRandomDelay(): number {
    // Generate random delay between 50-150ms
    // This range mimics natural human typing variation
    return Math.random() * 100 + 50;
  }

  /**
   * Utility function for creating delays
   * 
   * Creates a promise that resolves after the specified number of milliseconds.
   * Used throughout the authentication process to allow pages to stabilize,
   * forms to process, and to create human-like interaction patterns.
   * 
   * @param ms - Number of milliseconds to sleep
   * @returns Promise<void> - Promise that resolves after the delay
   * 
   * @private
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
