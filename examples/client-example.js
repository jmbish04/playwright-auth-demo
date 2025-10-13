/**
 * Example client for the Job Posting Extractor Worker
 * Demonstrates how to use the API to extract job data from various sources
 */

class JobExtractorClient {
  constructor(workerUrl) {
    this.workerUrl = workerUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Extract job data from a URL (with authentication if needed)
   */
  async extractFromUrl(url, options = {}) {
    const response = await fetch(`${this.workerUrl}/extract-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        options: {
          includeScreenshot: options.includeScreenshot || false,
          includeHtml: options.includeHtml || false,
          customInstructions: options.customInstructions,
          waitForAuth: options.waitForAuth || true,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * Extract job data from plain text
   */
  async extractFromText(jobText) {
    const response = await fetch(`${this.workerUrl}/extract-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: jobText
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  /**
   * Check if the worker is healthy
   */
  async healthCheck() {
    const response = await fetch(`${this.workerUrl}/health`);
    return response.ok;
  }
}

// Example usage
async function examples() {
  const client = new JobExtractorClient('https://your-worker.workers.dev');

  try {
    // Example 1: Extract from LinkedIn job (requires authentication)
    console.log('Extracting LinkedIn job...');
    const linkedinResult = await client.extractFromUrl(
      'https://www.linkedin.com/jobs/view/1234567890',
      {
        includeScreenshot: true,
        customInstructions: 'Pay special attention to salary and benefits information'
      }
    );
    console.log('LinkedIn job extracted:', linkedinResult.data.jobTitle);
    console.log('Summary:', linkedinResult.summary);

    // Example 2: Extract from Indeed job
    console.log('\nExtracting Indeed job...');
    const indeedResult = await client.extractFromUrl(
      'https://www.indeed.com/viewjob?jk=abcd1234',
      {
        includeScreenshot: false,
        includeHtml: true
      }
    );
    console.log('Indeed job extracted:', indeedResult.data.jobTitle);

    // Example 3: Extract from plain text
    console.log('\nExtracting from text...');
    const textJob = `
      Senior Full Stack Developer
      Company: TechStartup Inc.
      Location: Remote (US)
      Salary: $130,000 - $170,000 per year
      
      We're looking for a senior full stack developer to join our growing team.
      
      Requirements:
      - 5+ years of experience with JavaScript, React, and Node.js
      - Experience with AWS and Docker
      - Strong communication skills
      
      Responsibilities:
      - Build and maintain web applications
      - Collaborate with product and design teams
      - Mentor junior developers
      
      Benefits:
      - Health, dental, and vision insurance
      - 401k with company match
      - Unlimited PTO
      - $2000 learning budget
    `;

    const textResult = await client.extractFromText(textJob);
    console.log('Text job extracted:', textResult.jobTitle);
    console.log('Salary range:', textResult.compensation?.baseSalary);

    // Example 4: Batch processing multiple URLs
    console.log('\nBatch processing multiple jobs...');
    const urls = [
      'https://www.linkedin.com/jobs/view/1111111111',
      'https://www.indeed.com/viewjob?jk=bbbb2222',
      'https://www.glassdoor.com/job-listing/cccc3333'
    ];

    const batchResults = await Promise.allSettled(
      urls.map(url => client.extractFromUrl(url, { includeScreenshot: false }))
    );

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`Job ${index + 1}: ${result.value.data.jobTitle} at ${result.value.data.companyName}`);
      } else {
        console.log(`Job ${index + 1} failed: ${result.reason.message}`);
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Advanced usage examples
async function advancedExamples() {
  const client = new JobExtractorClient('https://your-worker.workers.dev');

  // Example: Extract with custom focus on AI/ML roles
  const aiJobResult = await client.extractFromUrl(
    'https://www.linkedin.com/jobs/view/ai-engineer-role',
    {
      customInstructions: `
        This is an AI/ML engineering role. Pay special attention to:
        - Machine learning frameworks and tools mentioned
        - AI model types and applications
        - Data science requirements
        - GPU/compute requirements
        - Research vs. production focus
      `
    }
  );

  console.log('AI Flags:', aiJobResult.data.aiFlags);
  console.log('Skills:', aiJobResult.data.skills);

  // Example: Extract with focus on compensation
  const compensationFocusResult = await client.extractFromUrl(
    'https://www.glassdoor.com/job-listing/high-paying-role',
    {
      customInstructions: `
        Focus on extracting all compensation-related information:
        - Base salary ranges
        - Bonus structures
        - Equity/stock options
        - Benefits packages
        - Perks and additional compensation
      `
    }
  );

  console.log('Compensation details:', compensationFocusResult.data.compensation);
}

// Utility functions
function formatJobSummary(jobData) {
  return `
📋 ${jobData.jobTitle} at ${jobData.companyName}
📍 ${jobData.location}
💼 ${jobData.jobType} | ${jobData.seniorityLevel || 'Not specified'}
💰 ${formatSalary(jobData.compensation?.baseSalary)}
🛠️ Skills: ${jobData.skills?.slice(0, 5).join(', ')}${jobData.skills?.length > 5 ? '...' : ''}
  `;
}

function formatSalary(salary) {
  if (!salary) return 'Not specified';
  
  const { currency = 'USD', min, max, period = 'year' } = salary;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  if (min && max) {
    return `${formatter.format(min)} - ${formatter.format(max)} per ${period}`;
  } else if (min) {
    return `${formatter.format(min)}+ per ${period}`;
  } else if (max) {
    return `Up to ${formatter.format(max)} per ${period}`;
  }
  
  return 'Not specified';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JobExtractorClient, formatJobSummary, formatSalary };
}

// Run examples if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  examples().catch(console.error);
}
