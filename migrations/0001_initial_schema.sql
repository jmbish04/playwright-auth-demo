-- Site configuration table
CREATE TABLE IF NOT EXISTS site_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_pattern TEXT NOT NULL UNIQUE,
    username_secret_var TEXT NOT NULL,
    password_secret_var TEXT NOT NULL,
    login_url TEXT NOT NULL,
    login_agent_instructions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Job configuration table  
CREATE TABLE IF NOT EXISTS job_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    agent_instructions TEXT,
    starting_url TEXT NOT NULL,
    collect_pdf BOOLEAN DEFAULT 0,
    collect_json BOOLEAN DEFAULT 1,
    collect_html BOOLEAN DEFAULT 1,
    collect_screenshot BOOLEAN DEFAULT 1
);

-- Scrape jobs table
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_config_id INTEGER NOT NULL,
    site_config_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    full_url TEXT NOT NULL,
    base_url TEXT NOT NULL,
    status TEXT CHECK(status IN ('not_started', 'in_progress', 'complete', 'error')) DEFAULT 'not_started',
    log_details TEXT,
    completed_at DATETIME,
    FOREIGN KEY (job_config_id) REFERENCES job_config(id),
    FOREIGN KEY (site_config_id) REFERENCES site_config(id)
);

-- Extracted assets table
CREATE TABLE IF NOT EXISTS extracted_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scrape_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    r2_key TEXT NOT NULL UNIQUE,
    r2_url TEXT NOT NULL,
    md5_hash TEXT,
    filesize INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (scrape_id) REFERENCES scrape_jobs(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_timestamp ON scrape_jobs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_extracted_assets_scrape_id ON extracted_assets(scrape_id);
CREATE INDEX IF NOT EXISTS idx_site_config_url_pattern ON site_config(url_pattern);
