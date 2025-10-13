# Playwright Auth Demo Agent

## Worker Information

- **Worker Name:** `playwright-auth-demo`
- **Worker URL:** `https://playwright-auth-demo.hacolby.workers.dev`
- **Repository:** `/Volumes/Projects/workers/playwright-auth-demo`

## Overview

This is an AI-powered web scraping agent built on Cloudflare Workers that combines:

- **Playwright Browser Automation** - For realistic web interaction
- **AI Vision Analysis** - To understand page layouts and content
- **Authentication Support** - Automated login to protected sites
- **Job Data Extraction** - Structured extraction from job posting sites

## Key Features

### API Endpoints

- `POST /extract-job` - Extract job data from URL with authentication
- `POST /extract-text` - Extract job data from plain text
- `GET /health` - Health check endpoint
- `GET /openapi.json` - API documentation (served via ASSETS binding)

### Static Assets

- Static files served via Cloudflare ASSETS binding
- OpenAPI specification available at `/openapi.json`
- Real-time monitoring interface at root URL

### Database & Storage

- **D1 Database** - Site configurations and job tracking
- **R2 Bucket** - Asset storage (screenshots, HTML)
- **AI Models** - Vision analysis and data extraction

## Architecture

The agent uses a "See, Think, Act" loop:

1. **See** - AI vision analysis of page screenshots
2. **Think** - AI reasoning to determine next actions
3. **Act** - Execute browser actions via Playwright

## Deployment

```bash
# Build, migrate database, and deploy
npm run deploy

# Individual commands
npm run build           # TypeScript compilation
npm run migrate:remote  # Apply D1 migrations
npm run migrate:local   # Apply local D1 migrations
```

## Configuration

- **Worker Name:** `playwright-auth-demo` (in wrangler.toml)
- **Database:** `playwright-auth-demo` (D1)
- **Bucket:** `playwright-auth-demo` (R2)
- **Assets Directory:** `./public`
