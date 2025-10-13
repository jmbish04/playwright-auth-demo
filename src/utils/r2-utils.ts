/**
 * @file src/utils/r2-utils.ts
 * @description Utility functions for R2 storage operations and URL generation.
 * Provides centralized configuration for R2 bucket access and public URL generation.
 * 
 * Based on Cloudflare R2 documentation:
 * https://developers.cloudflare.com/r2/buckets/public-buckets/
 */

// Env is now globally available from worker-configuration.d.ts

/**
 * Storage Environment Interface
 * 
 * Defines the required environment variable for R2 storage operations.
 */
export interface StorageEnv {
  BUCKET_PUBLIC_BASE_URL: string;
}

/**
 * Get the full public URL for an R2 object
 * 
 * Ensures no trailing slash on the base URL and proper encoding of the object key.
 * This is a type-safe utility that handles URL construction robustly.
 * 
 * @param env - Environment bindings containing BUCKET_PUBLIC_BASE_URL
 * @param r2_object_key - The R2 object key to generate URL for
 * @returns Promise<string> - The full public URL for the R2 object
 * @throws Error if BUCKET_PUBLIC_BASE_URL is not configured
 * 
 * @example
 * const url = await getR2ObjectUrl(env, 'scrape-123/screenshot.png');
 * // Returns: 'https://pub-93e75376cf0541329e11138f54c72d62.r2.dev/scrape-123/screenshot.png'
 * 
 * @example
 * const url = await getR2ObjectUrl(env, 'emails/2025/summary.pdf');
 * // Returns: 'https://pub-93e75376cf0541329e11138f54c72d62.r2.dev/emails/2025/summary.pdf'
 */
export async function getR2ObjectUrl(
  env: StorageEnv,
  r2_object_key: string
): Promise<string> {
  if (!env.BUCKET_PUBLIC_BASE_URL) {
    throw new Error('Missing BUCKET_PUBLIC_BASE_URL in environment.');
  }

  // Remove any trailing slash (e.g., after .dev)
  const baseUrl = env.BUCKET_PUBLIC_BASE_URL.replace(/\/+$/, '');

  // Encode key safely (avoid accidental double slashes)
  const safeKey = encodeURIComponent(r2_object_key).replace(/%2F/g, '/');

  return `${baseUrl}/${safeKey}`;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use getR2ObjectUrl instead
 */
export function generateR2Url(env: Env, key: string): string {
  const baseUrl = env.BUCKET_PUBLIC_BASE_URL?.replace(/\/+$/, '') || 'https://fallback-bucket.r2.dev';
  const safeKey = encodeURIComponent(key).replace(/%2F/g, '/');
  return `${baseUrl}/${safeKey}`;
}

/**
 * Generate a timestamped R2 key for organizing assets
 * 
 * Creates a structured key with timestamp and scrape ID for better organization.
 * This helps with asset management and prevents naming conflicts.
 * 
 * @param scrapeId - The ID of the scrape job
 * @param filename - The original filename
 * @returns A structured R2 key
 * 
 * @example
 * const key = generateR2Key(123, 'screenshot.png');
 * // Returns: 'scrape-123/2024-01-20T10-30-45-123Z-screenshot.png'
 */
export function generateR2Key(scrapeId: number, filename: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `scrape-${scrapeId}/${timestamp}-${filename}`;
}

/**
 * R2 Asset Manager
 * 
 * Centralized class for handling R2 storage operations with proper
 * URL generation and metadata management.
 */
export class R2AssetManager {
  constructor(private env: Env) {}

  /**
   * Save an asset to R2 and return its metadata
   * 
   * Handles the complete asset saving process including:
   * - Generating a unique R2 key
   * - Uploading to R2 storage
   * - Creating the public URL
   * - Saving metadata to D1 database
   * 
   * @param scrapeId - The ID of the scrape job
   * @param filename - The filename for the asset
   * @param type - The type of asset (json, screenshot, html, pdf, etc.)
   * @param content - The content to save
   * @returns Promise with asset metadata including public URL
   * 
   * @example
   * const manager = new R2AssetManager(env);
   * const asset = await manager.saveAsset(123, 'data.json', 'json', jsonData);
   * console.log(`Asset saved: ${asset.r2_url}`);
   */
  async saveAsset(
    scrapeId: number,
    filename: string,
    type: string,
    content: string | Buffer | Uint8Array
  ) {
    // Generate unique R2 key
    const r2Key = generateR2Key(scrapeId, filename);

    // Save to R2
    await this.env.R2_BUCKET.put(r2Key, content);

    // Generate public URL using the improved type-safe function
    const r2Url = await getR2ObjectUrl(this.env, r2Key);

    // Save metadata to D1
    const result = await this.env.DB.prepare(
      `INSERT INTO extracted_assets (scrape_id, name, type, r2_key, r2_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      scrapeId,
      filename,
      type,
      r2Key,
      r2Url,
      new Date().toISOString()
    ).run();

    return {
      id: result.meta.last_row_id as number,
      scrape_id: scrapeId,
      name: filename,
      type,
      r2_key: r2Key,
      r2_url: r2Url,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Get a signed URL for temporary access to a private asset
   * 
   * For assets that should not be publicly accessible, this method
   * can generate temporary signed URLs. Note: This requires additional
   * configuration and is not implemented in the basic setup.
   * 
   * @param key - The R2 object key
   * @param expiresIn - Expiration time in seconds
   * @returns Promise with signed URL (placeholder implementation)
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    // This is a placeholder - signed URLs require additional R2 configuration
    // For now, return the public URL
    console.warn('Signed URLs not implemented - returning public URL');
    return await getR2ObjectUrl(this.env, key);
  }

  /**
   * Delete an asset from R2 storage
   * 
   * Removes the asset from R2 and optionally updates the database record.
   * 
   * @param key - The R2 object key to delete
   * @param updateDatabase - Whether to update the database record
   * @returns Promise indicating success
   */
  async deleteAsset(key: string, updateDatabase: boolean = true): Promise<boolean> {
    try {
      // Delete from R2
      await this.env.R2_BUCKET.delete(key);

      // Optionally update database to mark as deleted
      if (updateDatabase) {
        await this.env.DB.prepare(
          `UPDATE extracted_assets SET deleted_at = ? WHERE r2_key = ?`
        ).bind(new Date().toISOString(), key).run();
      }

      return true;
    } catch (error) {
      console.error('Failed to delete R2 asset:', error);
      return false;
    }
  }
}

/**
 * Create an R2 asset manager instance
 * 
 * Factory function for creating R2AssetManager instances.
 * 
 * @param env - Cloudflare environment bindings
 * @returns R2AssetManager instance
 */
export function createR2AssetManager(env: Env): R2AssetManager {
  return new R2AssetManager(env);
}
