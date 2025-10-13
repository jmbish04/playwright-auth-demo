# Job Posting Extractor Worker

A modular Cloudflare Worker that extracts structured data from job postings using AI vision, Puppeteer automation, and Llama-4 for structured responses. Supports authentication to job sites like LinkedIn, Indeed, and Glassdoor.

## Features

- **AI-Powered Authentication**: Automatically logs into job sites using vision-guided Puppeteer automation
- **Structured Data Extraction**: Uses Llama-4 Scout to extract comprehensive job posting data
- **Vision Analysis**: Leverages Cloudflare's vision models to understand page layouts
- **Multi-Site Support**: Configurable authentication for LinkedIn, Indeed, Glassdoor, and more
- **Comprehensive Schema**: Extracts 50+ fields including compensation, skills, company info, and more
- **Asset Collection**: Optional screenshot and HTML capture with R2 storage

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main Worker   │────│  Auth Service    │────│  Vision Agent   │
│   (index.ts)    │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Llama4 Service  │    │   D1 Database    │    │  Browser API    │
│                 │    │  (Site Configs)  │    │   (Puppeteer)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Setup

### 1. Install Dependencies

```bash
npm install @cloudflare/puppeteer puppeteer zod zod-to-json-schema
```

### 2. Configure Wrangler

Update your `wrangler.toml` with the required bindings:

```toml
name = "job-extractor-worker"
main = "src/index.ts"
compatibility_date = "2024-05-30"

[ai]
binding = "AI"

[browser]
binding = "BROWSER"

[[d1_databases]]
binding = "DB"
database_name = "job-extractor-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "job-extractor-assets"
```

### 3. Create D1 Database

```bash
wrangler d1 create job-extractor-db
wrangler d1 execute job-extractor-db --file=./migrations/0001_initial_schema.sql
wrangler d1 execute job-extractor-db --file=./migrations/0002_linkedin_config.sql
```

### 4. Create R2 Bucket

```bash
wrangler r2 bucket create job-extractor-assets
```

### 5. Set Authentication Secrets

```bash
wrangler secret put LINKEDIN_USERNAME
wrangler secret put LINKEDIN_PASSWORD
wrangler secret put INDEED_USERNAME
wrangler secret put INDEED_PASSWORD
wrangler secret put GLASSDOOR_USERNAME
wrangler secret put GLASSDOOR_PASSWORD
```

## API Usage

### Extract Job from URL (with Authentication)

```bash
curl -X POST https://your-worker.workers.dev/extract-job \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/jobs/view/1234567890",
    "options": {
      "includeScreenshot": true,
      "includeHtml": false,
      "customInstructions": "Focus on extracting salary and benefits information"
    }
  }'
```

### Extract Job from Text (No Authentication)

```bash
curl -X POST https://your-worker.workers.dev/extract-text \
  -H "Content-Type: text/plain" \
  -d "Software Engineer - Full Stack
       Company: TechCorp
       Location: San Francisco, CA
       Salary: $120,000 - $180,000
       ..."
```

## Response Format

```json
{
  "success": true,
  "data": {
    "jobTitle": "Senior Software Engineer",
    "companyName": "TechCorp",
    "location": "San Francisco, CA",
    "jobType": "Full-time",
    "compensation": {
      "baseSalary": {
        "currency": "USD",
        "min": 120000,
        "max": 180000,
        "period": "year"
      }
    },
    "skills": ["JavaScript", "React", "Node.js", "AWS"],
    "responsibilities": [
      "Design and develop scalable web applications",
      "Collaborate with cross-functional teams"
    ],
    "qualifications": [
      "5+ years of software development experience",
      "Strong knowledge of JavaScript and React"
    ]
  },
  "summary": "Senior Software Engineer role at TechCorp in San Francisco...",
  "assets": [
    {
      "name": "screenshot.png",
      "type": "screenshot",
      "r2_url": "https://pub-xxx.r2.dev/screenshots/job-screenshot.png"
    }
  ],
  "processingTime": 12500
}
```

## Site Configuration

The worker automatically detects which sites require authentication based on URL patterns stored in D1:

```sql
INSERT INTO site_config (
    url_pattern,
    username_secret_var,
    password_secret_var,
    login_url,
    login_agent_instructions
) VALUES (
    'linkedin.com/jobs/view',
    'LINKEDIN_USERNAME',
    'LINKEDIN_PASSWORD',
    'https://www.linkedin.com/login',
    'Navigate to LinkedIn login page, enter credentials, and handle any 2FA or security challenges.'
);
```

## Supported Job Schema

The worker extracts comprehensive job data including:

- **Core Info**: Title, company, location, job type
- **Compensation**: Salary ranges, bonuses, equity, benefits
- **Requirements**: Skills, qualifications, experience level
- **Company Details**: Industry, size, website, commitments
- **Application Info**: Apply URL, instructions, requirements
- **Timeline**: Posted date, closing date, updates
- **Contacts**: Recruiter information
- **Metrics**: Applicant counts, competition data
- **AI Flags**: Mentions of AI/ML technologies
- **Governance**: Security clearance, compliance requirements

## Authentication Flow

1. **URL Analysis**: Check if URL matches configured site patterns
2. **Login Navigation**: Navigate to the site's login page
3. **Vision Analysis**: AI analyzes the page to identify form fields
4. **Credential Entry**: Automatically fills username and password
5. **Challenge Handling**: Detects and handles 2FA, CAPTCHAs, security checks
6. **Verification**: Confirms successful authentication
7. **Job Navigation**: Proceeds to the target job posting

## Error Handling

The worker handles various scenarios:

- **Authentication Failures**: Returns 401 with detailed error messages
- **Site Changes**: Vision-based approach adapts to UI changes
- **Rate Limiting**: Implements delays and retry logic
- **Network Issues**: Timeout handling and graceful degradation
- **Schema Validation**: Zod validation ensures data quality

## Development

### Local Testing

```bash
wrangler dev --local
```

### Deploy

```bash
wrangler deploy
```

### View Logs

```bash
wrangler tail
```

## Security Considerations

- Credentials are stored as Wrangler secrets, never in code
- Browser sessions are isolated and cleaned up after each request
- Rate limiting prevents abuse
- User agents and delays mimic human behavior
- No persistent storage of authentication tokens

## Limitations

- 2FA requires manual intervention (30-second timeout)
- Some CAPTCHAs may require external solving services
- Rate limits vary by site
- JavaScript-heavy sites may need additional wait times

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see LICENSE file for details.
