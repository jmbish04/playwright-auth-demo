export interface Env {
  BROWSER: Fetcher;
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  WEBSOCKET_HANDLER_DO: DurableObjectNamespace;
  
  // Secrets (set via wrangler secret put)
  [key: string]: any;
}

export interface SiteConfig {
  id?: number;
  url_pattern: string;
  username_secret_var: string;
  password_secret_var: string;
  login_url: string;
  login_agent_instructions?: string;
  created_at?: string;
  updated_at?: string;
}

export interface JobConfig {
  id?: number;
  timestamp?: string;
  agent_instructions?: string;
  starting_url: string;
  collect_pdf?: boolean;
  collect_json?: boolean;
  collect_html?: boolean;
  collect_screenshot?: boolean;
}

export interface ScrapeJob {
  id?: number;
  job_config_id: number;
  site_config_id?: number;
  timestamp?: string;
  full_url: string;
  base_url: string;
  status: 'not_started' | 'in_progress' | 'complete' | 'error';
  log_details?: string;
  completed_at?: string;
}

export interface ExtractedAsset {
  id?: number;
  scrape_id: number;
  name: string;
  type: string;
  r2_key: string;
  r2_url: string;
  md5_hash?: string;
  filesize?: number;
  created_at?: string;
}

export interface WSMessage {
  type: 'create_site_config' | 'initiate_scrape' | 'list_scrapes' | 'get_scrape_status';
  data?: any;
}

export interface WSResponse {
  type: 'success' | 'error' | 'status_update' | 'scrape_list';
  data?: any;
  error?: string;
}
