/**
 * @file src/utils/url-utils.ts
 * @description Centralized URL utilities for pattern matching and domain extraction.
 * This module provides consistent URL processing across the application, ensuring
 * that URL pattern matching behaves identically in all services and handlers.
 * 
 * Key Features:
 * - Domain extraction with www. prefix removal
 * - Centralized site configuration lookup
 * - Consistent URL normalization
 * - Database query optimization for pattern matching
 */

import type { SiteConfig } from '../types';
// Env is globally available from worker-configuration.d.ts

/**
 * Extract the clean domain from a URL for pattern matching
 * 
 * This function normalizes URLs by extracting just the domain portion
 * and removing common prefixes like 'www.' to improve pattern matching
 * reliability across different URL formats.
 * 
 * @param url - The full URL to process
 * @returns The cleaned domain string
 * 
 * @example
 * extractDomain('https://www.linkedin.com/jobs/view/4281423903/')
 * // Returns: 'linkedin.com'
 * 
 * @example
 * extractDomain('https://indeed.com/jobs/view/123456')
 * // Returns: 'indeed.com'
 * 
 * @example
 * extractDomain('https://glassdoor.com/job/senior-engineer')
 * // Returns: 'glassdoor.com'
 */
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove 'www.' prefix if present for consistent matching
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    // If URL parsing fails, return the original string
    // This allows for graceful degradation in edge cases
    console.warn(`Failed to parse URL: ${url}`, error);
    return url;
  }
}

/**
 * Extract the base URL (protocol + hostname) from a full URL
 * 
 * Useful for storing normalized base URLs in the database
 * while preserving the original protocol and hostname structure.
 * 
 * @param url - The full URL to process
 * @returns The base URL (protocol + hostname)
 * 
 * @example
 * extractBaseUrl('https://www.linkedin.com/jobs/view/4281423903/')
 * // Returns: 'https://www.linkedin.com'
 */
export function extractBaseUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return `${urlObj.protocol}//${urlObj.hostname}`;
  } catch (error) {
    console.warn(`Failed to parse URL for base extraction: ${url}`, error);
    return url;
  }
}

/**
 * Site Configuration Matcher
 * 
 * Centralized class for handling site configuration lookups with consistent
 * URL pattern matching logic. This ensures all services use the same
 * matching algorithm and database query optimization.
 */
export class SiteConfigMatcher {
  /**
   * Initialize the matcher with environment bindings
   * 
   * @param env - Cloudflare environment bindings containing D1 database
   */
  constructor(private env: Env) {}

  /**
   * Find site configuration based on URL pattern matching
   * 
   * This method provides centralized site configuration lookup with optimized
   * database queries. It extracts the domain from the provided URL and matches
   * it against stored patterns in the site_config table.
   * 
   * Matching Logic:
   * 1. Extract clean domain from URL (removes www., preserves subdomain structure)
   * 2. Query database using LIKE pattern matching with wildcards
   * 3. Order results by pattern length (DESC) to get most specific match
   * 4. Return the first (most specific) matching configuration
   * 
   * Database Query Optimization:
   * - Uses parameterized queries to prevent SQL injection
   * - Leverages LENGTH() ordering for specificity ranking
   * - LIMIT 1 for performance (only need the best match)
   * 
   * @param url - The target URL to find configuration for
   * @returns Promise<SiteConfig | null> - Matching configuration or null
   * 
   * @example
   * const matcher = new SiteConfigMatcher(env);
   * const config = await matcher.findSiteConfig('https://www.linkedin.com/jobs/view/4281423903/');
   * 
   * if (config) {
   *   console.log(`Authentication required for: ${config.url_pattern}`);
   *   console.log(`Username secret: ${config.username_secret_var}`);
   *   console.log(`Password secret: ${config.password_secret_var}`);
   *   console.log(`Login URL: ${config.login_url}`);
   * }
   * 
   * @example
   * // Batch processing multiple URLs
   * const urls = [
   *   'https://linkedin.com/jobs/view/123',
   *   'https://indeed.com/jobs/view/456',
   *   'https://glassdoor.com/job/789'
   * ];
   * 
   * for (const url of urls) {
   *   const config = await matcher.findSiteConfig(url);
   *   if (config) {
   *     console.log(`${url} requires authentication`);
   *   }
   * }
   */
  async findSiteConfig(url: string): Promise<SiteConfig | null> {
    try {
      // Extract domain for consistent pattern matching
      const domain = extractDomain(url);
      
      // Query D1 database with optimized pattern matching
      // The LIKE operator with concatenated wildcards allows flexible matching
      // while the LENGTH ordering ensures most specific patterns are prioritized
      const { results } = await this.env.DB.prepare(`
        SELECT * FROM site_config 
        WHERE ? LIKE '%' || url_pattern || '%' 
        ORDER BY LENGTH(url_pattern) DESC 
        LIMIT 1
      `).bind(domain).all();

      // Return null if no matching configuration found
      if (results.length === 0) {
        return null;
      }

      // Cast and return the most specific match
      return results[0] as unknown as SiteConfig;
      
    } catch (error) {
      // Log database errors but don't throw to allow graceful degradation
      console.error('Failed to query site configuration:', error);
      return null;
    }
  }

  /**
   * Check if a URL requires authentication
   * 
   * Convenience method that returns a boolean indicating whether
   * the provided URL has a matching site configuration (and thus
   * requires authentication).
   * 
   * @param url - The URL to check
   * @returns Promise<boolean> - True if authentication is required
   * 
   * @example
   * const matcher = new SiteConfigMatcher(env);
   * const requiresAuth = await matcher.requiresAuthentication('https://linkedin.com/jobs/view/123');
   * 
   * if (requiresAuth) {
   *   console.log('This URL requires login credentials');
   * } else {
   *   console.log('This URL can be accessed without authentication');
   * }
   */
  async requiresAuthentication(url: string): Promise<boolean> {
    const config = await this.findSiteConfig(url);
    return config !== null;
  }

  /**
   * Get all configured site patterns
   * 
   * Utility method for debugging and administration. Returns all
   * site configurations currently stored in the database, ordered
   * by pattern length for easy review.
   * 
   * @returns Promise<SiteConfig[]> - All site configurations
   * 
   * @example
   * const matcher = new SiteConfigMatcher(env);
   * const allConfigs = await matcher.getAllSiteConfigs();
   * 
   * console.log('Configured authentication sites:');
   * allConfigs.forEach(config => {
   *   console.log(`- ${config.url_pattern} (${config.login_url})`);
   * });
   */
  async getAllSiteConfigs(): Promise<SiteConfig[]> {
    try {
      const { results } = await this.env.DB.prepare(`
        SELECT * FROM site_config 
        ORDER BY LENGTH(url_pattern) DESC
      `).all();

      return results as unknown as SiteConfig[];
      
    } catch (error) {
      console.error('Failed to fetch site configurations:', error);
      return [];
    }
  }
}

/**
 * Create a site configuration matcher instance
 * 
 * Factory function for creating SiteConfigMatcher instances.
 * Provides a convenient way to get a matcher without directly
 * instantiating the class.
 * 
 * @param env - Cloudflare environment bindings
 * @returns SiteConfigMatcher instance
 * 
 * @example
 * const matcher = createSiteConfigMatcher(env);
 * const config = await matcher.findSiteConfig(url);
 */
export function createSiteConfigMatcher(env: Env): SiteConfigMatcher {
  return new SiteConfigMatcher(env);
}
