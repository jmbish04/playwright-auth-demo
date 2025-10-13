# Job Posting Extractor API Documentation

## Overview

The Job Posting Extractor Worker provides AI-powered extraction of structured job posting data with support for authenticated scraping from major job sites.

**Base URL**: `https://your-worker.workers.dev`

## Authentication

The worker handles authentication automatically based on URL patterns configured in the D1 database. Supported sites include:

- LinkedIn (`linkedin.com/jobs/view`)
- Indeed (`indeed.com/viewjob`)
- Glassdoor (`glassdoor.com/job-listing`)

Credentials are stored as Cloudflare Worker secrets and retrieved automatically.

## Endpoints

### POST /extract-job

Extract structured job data from a URL with automatic authentication.

**Request Body:**
```json
{
  "url": "https://www.linkedin.com/jobs/view/1234567890",
  "options": {
    "includeScreenshot": true,
    "includeHtml": false,
    "customInstructions": "Focus on salary and benefits",
    "waitForAuth": true
  }
}
```

**Parameters:**
- `url` (required): The job posting URL to extract data from
- `options.includeScreenshot` (optional): Capture a screenshot of the page
- `options.includeHtml` (optional): Include raw HTML content
- `options.customInstructions` (optional): Custom instructions for the AI
- `options.waitForAuth` (optional): Wait for authentication to complete

**Response:**
```json
{
  "success": true,
  "data": {
    "jobTitle": "Senior Software Engineer",
    "companyName": "TechCorp",
    "location": "San Francisco, CA",
    "jobType": "Full-time",
    "seniorityLevel": "Senior level",
    "responsibilities": [
      "Design and develop scalable web applications",
      "Lead technical architecture decisions"
    ],
    "qualifications": [
      "5+ years of software development experience",
      "Strong knowledge of JavaScript and React"
    ],
    "skills": ["JavaScript", "React", "Node.js", "AWS"],
    "compensation": {
      "baseSalary": {
        "currency": "USD",
        "min": 120000,
        "max": 180000,
        "period": "year"
      },
      "benefitsSummary": "Health, dental, vision, 401k, unlimited PTO"
    },
    "application": {
      "applyUrl": "https://www.linkedin.com/jobs/view/1234567890",
      "isAcceptingApplications": true,
      "applicationPlatform": "LinkedIn"
    },
    "timeline": {
      "postedAt": "2024-01-15T10:30:00Z"
    },
    "source": {
      "sourcePlatform": "LinkedIn",
      "sourceUrl": "https://www.linkedin.com/jobs/view/1234567890",
      "scrapedAt": "2024-01-20T15:45:00Z"
    },
    "aiFlags": {
      "mentionsAI": false,
      "mentionsML": false,
      "mentionsGenAI": false
    }
  },
  "summary": "Senior Software Engineer role at TechCorp in San Francisco offering $120k-180k with strong focus on React and AWS technologies.",
  "assets": [
    {
      "id": 1,
      "name": "screenshot.png",
      "type": "screenshot",
      "r2_url": "https://pub-xxx.r2.dev/screenshots/job-screenshot.png",
      "created_at": "2024-01-20T15:45:00Z"
    }
  ],
  "processingTime": 12500
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Authentication failed",
  "processingTime": 5000
}
```

### POST /extract-text

Extract structured job data from plain text (no authentication required).

**Request Body:**
```
Software Engineer - Full Stack
Company: TechCorp
Location: San Francisco, CA
Salary: $120,000 - $180,000 per year

We're looking for a senior full stack developer...

Requirements:
- 5+ years of experience with JavaScript
- Experience with React and Node.js
- AWS knowledge preferred
```

**Response:**
Same structure as `/extract-job` but without authentication-related fields.

### GET /health

Health check endpoint.

**Response:**
```
OK
```

### GET /

API information endpoint.

**Response:**
```
Job Posting Extractor API - Use POST /extract-job with a URL
```

## Data Schema

The extracted job data follows a comprehensive schema with 50+ fields:

### Core Fields
- `jobTitle`: Job position title
- `companyName`: Hiring company name
- `location`: Primary job location
- `jobType`: Employment type (Full-time, Part-time, Contract, etc.)
- `seniorityLevel`: Experience level required

### Detailed Information
- `responsibilities`: Array of key job responsibilities
- `qualifications`: Array of required/preferred qualifications
- `skills`: Array of mentioned skills and technologies
- `compensation`: Detailed compensation information
- `application`: Application process details
- `timeline`: Important dates (posted, updated, closing)
- `source`: Metadata about data source

### Advanced Fields
- `organization`: Detailed company information
- `locationDetail`: Structured location data with remote/hybrid flags
- `employment`: Employment classification details
- `contacts`: Recruiter/hiring manager contact information
- `insightsMetrics`: Analytics data (applicant counts, etc.)
- `aiFlags`: AI/ML technology mentions
- `governance`: Security clearance and compliance requirements
- `interviewPrep`: Derived guidance for interview preparation

## Error Handling

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request (missing URL or invalid request)
- `401`: Authentication Failed
- `404`: Not Found (invalid endpoint)
- `405`: Method Not Allowed
- `500`: Internal Server Error

### Error Types
- **Authentication Errors**: Failed login, 2FA required, CAPTCHA
- **Scraping Errors**: Page load timeout, element not found
- **Processing Errors**: AI model failures, schema validation errors
- **Rate Limiting**: Too many requests from same IP

## Rate Limits

- **Per IP**: 100 requests per hour
- **Per URL**: 10 requests per hour (to respect site policies)
- **Concurrent**: Maximum 5 concurrent requests per IP

## Authentication Flow

1. **URL Analysis**: Check if URL matches configured site patterns
2. **Site Configuration**: Retrieve login URL and credentials from D1
3. **Browser Launch**: Start Puppeteer browser instance
4. **Login Navigation**: Navigate to site's login page
5. **Vision Analysis**: AI analyzes page layout to identify form fields
6. **Credential Entry**: Automatically fill username and password
7. **Challenge Handling**: Handle 2FA, CAPTCHAs, security checks
8. **Verification**: Confirm successful authentication
9. **Job Navigation**: Navigate to target job posting
10. **Data Extraction**: Extract structured job data using AI

## Supported Sites

| Site | URL Pattern | Authentication | Notes |
|------|-------------|----------------|-------|
| LinkedIn | `linkedin.com/jobs/view` | Required | May require 2FA |
| Indeed | `indeed.com/viewjob` | Optional | Some jobs public |
| Glassdoor | `glassdoor.com/job-listing` | Required | CAPTCHA common |
| AngelList | `angel.co/jobs` | Optional | Startup focus |
| Stack Overflow | `stackoverflow.com/jobs` | Optional | Tech focus |

## Best Practices

### Request Optimization
- Use `includeScreenshot: false` for faster processing
- Provide specific `customInstructions` for better extraction
- Batch similar requests to reduce authentication overhead

### Error Handling
- Implement retry logic with exponential backoff
- Handle authentication failures gracefully
- Monitor rate limits and adjust request frequency

### Data Quality
- Validate extracted data against your requirements
- Use the `confidence` scores in responses
- Cross-reference with multiple sources when possible

## Examples

### JavaScript/Node.js
```javascript
const response = await fetch('https://your-worker.workers.dev/extract-job', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://www.linkedin.com/jobs/view/1234567890',
    options: { includeScreenshot: true }
  })
});

const result = await response.json();
console.log(result.data.jobTitle);
```

### Python
```python
import requests

response = requests.post(
    'https://your-worker.workers.dev/extract-job',
    json={
        'url': 'https://www.linkedin.com/jobs/view/1234567890',
        'options': {'includeScreenshot': True}
    }
)

result = response.json()
print(result['data']['jobTitle'])
```

### cURL
```bash
curl -X POST https://your-worker.workers.dev/extract-job \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/jobs/view/1234567890",
    "options": {"includeScreenshot": true}
  }'
```

## Monitoring and Debugging

### Logs
View real-time logs with:
```bash
wrangler tail
```

### Metrics
- Processing time per request
- Authentication success rates
- Error rates by site
- Token usage for AI models

### Debugging
- Use `customInstructions` to guide AI behavior
- Enable `includeScreenshot` to see what the AI sees
- Check authentication status in response metadata

## Security

- All credentials stored as encrypted Wrangler secrets
- Browser sessions isolated per request
- No persistent storage of authentication tokens
- Rate limiting prevents abuse
- CORS headers configured for web usage

## Limitations

- 2FA requires manual intervention (30-second timeout)
- Some CAPTCHAs may require external solving services
- JavaScript-heavy sites may need additional wait times
- Rate limits vary by target site
- Processing time varies by site complexity (5-30 seconds)

## Support

For issues and questions:
1. Check the logs with `wrangler tail`
2. Verify site configuration in D1 database
3. Test authentication credentials manually
4. Review rate limiting and quotas
5. Submit issues with detailed error messages
