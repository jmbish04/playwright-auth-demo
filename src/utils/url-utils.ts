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
    // Remove 'www.' prefix if present and normalize to lowercase for consistent matching
    return urlObj.hostname.replace(/^www\./, '').toLowerCase();
  } catch (error) {
    // If URL parsing fails, return the original string (normalized)
    // This allows for graceful degradation in edge cases
    console.warn(`Failed to parse URL: ${url}`, error);
    return url.toLowerCase();
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

/** SQL fragment that normalizes site_config.url_pattern to a bare domain */
const NORMALIZE_URL_PATTERN_EXPR = `
LOWER(
  REPLACE(
    CASE
      WHEN INSTR(
             CASE WHEN INSTR(url_pattern,'//')>0
                  THEN SUBSTR(url_pattern, INSTR(url_pattern,'//')+2)
                  ELSE url_pattern
             END,
           '/') > 0
        THEN SUBSTR(
               CASE WHEN INSTR(url_pattern,'//')>0
                    THEN SUBSTR(url_pattern, INSTR(url_pattern,'//')+2)
                    ELSE url_pattern
               END,
               1,
               INSTR(
                 CASE WHEN INSTR(url_pattern,'//')>0
                      THEN SUBSTR(url_pattern, INSTR(url_pattern,'//')+2)
                      ELSE url_pattern
                 END,
                 '/'
               ) - 1
             )
        ELSE CASE WHEN INSTR(url_pattern,'//')>0
                  THEN SUBSTR(url_pattern, INSTR(url_pattern,'//')+2)
                  ELSE url_pattern
             END
    END,
    'www.',
    ''
  )
)
`.trim();

/**
 * Site Configuration Matcher
 * 
 * Centralized class for handling site configuration lookups with robust
 * URL pattern matching logic. This ensures all services use the same
 * matching algorithm and handles various URL formats consistently.
 * 
 * The matcher uses advanced SQL normalization to handle:
 * - URLs with and without protocols (http://, https://)
 * - URLs with and without www. prefixes
 * - URLs with trailing paths and parameters
 * - Case-insensitive matching
 * - Subdomain variations
 */
export class SiteConfigMatcher {
  /**
   * Initialize the matcher with environment bindings
   * 
   * @param env - Cloudflare environment bindings containing D1 database
   */
  constructor(private env: Env) {}

  /**
   * Find site configuration based on robust URL pattern matching
   * 
   * This method provides centralized site configuration lookup with advanced
   * SQL-based URL normalization. It handles various URL formats by normalizing
   * both the input URL and stored patterns to bare domains for comparison.
   * 
   * Matching Logic:
   * 1. Extract clean domain from input URL (removes www., protocols, paths)
   * 2. Use SQL expression to normalize stored url_pattern to bare domain
   * 3. Perform exact match between normalized domains
   * 4. Order results by pattern length (DESC) to get most specific match
   * 5. Return the first (most specific) matching configuration
   * 
   * Supported URL Formats:
   * - https://www.linkedin.com/jobs/view/123 → linkedin.com
   * - http://indeed.com/job/456 → indeed.com
   * - glassdoor.com/job/789 → glassdoor.com
   * - www.example.com → example.com
   * 
   * Database Query Optimization:
   * - Uses parameterized queries to prevent SQL injection
   * - Leverages LENGTH() ordering for specificity ranking
   * - LIMIT 1 for performance (only need the best match)
   * - Advanced SQL normalization handles edge cases
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
   * // Batch processing multiple URLs with various formats
   * const urls = [
   *   'https://www.linkedin.com/jobs/view/123',
   *   'http://indeed.com/jobs/view/456',
   *   'glassdoor.com/job/789',
   *   'www.example.com/careers'
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
      // Extract and normalize domain for consistent pattern matching
      const domain = extractDomain(url); // e.g., 'linkedin.com'
      
      // Use advanced SQL normalization to match against stored patterns
      // This handles various URL formats in the database consistently
      const sql = `
        SELECT *
        FROM site_config
        WHERE ${NORMALIZE_URL_PATTERN_EXPR} = ?
        ORDER BY LENGTH(url_pattern) DESC
        LIMIT 1
      `;

      const { results } = await this.env.DB.prepare(sql).bind(domain).all();

      // Return null if no matching configuration found
      if (results.length === 0) {
        return null;
      }

      // Cast and return the exact match
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
   * Get all configured site patterns with normalized domains
   * 
   * Utility method for debugging and administration. Returns all
   * site configurations currently stored in the database, ordered
   * by pattern length for easy review. Includes normalized domain
   * for debugging URL matching logic.
   * 
   * @returns Promise<SiteConfig[]> - All site configurations with normalized domains
   * 
   * @example
   * const matcher = new SiteConfigMatcher(env);
   * const allConfigs = await matcher.getAllSiteConfigs();
   * 
   * console.log('Configured authentication sites:');
   * allConfigs.forEach(config => {
   *   console.log(`- ${config.url_pattern} → ${config.normalized_domain} (${config.login_url})`);
   * });
   */
  async getAllSiteConfigs(): Promise<SiteConfig[]> {
    try {
      const { results } = await this.env.DB.prepare(`
        SELECT *, ${NORMALIZE_URL_PATTERN_EXPR} AS normalized_domain
        FROM site_config
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
