/**
 * @fileoverview Llama-4 Service for Advanced Language Model Operations
 * 
 * This service provides a comprehensive interface to Cloudflare's Llama-4 Scout model,
 * specializing in structured data extraction, reasoning, and content analysis. It serves
 * as the primary AI reasoning engine for the job posting extraction system.
 * 
 * Key Capabilities:
 * - Structured data extraction with schema validation
 * - Natural language reasoning and decision making
 * - Content analysis and summarization
 * - Multi-modal data processing (text + vision context)
 * - JSON schema-guided response generation
 * - Context-aware prompt engineering
 * 
 * Llama-4 Scout Model Features:
 * - 17 billion parameters with 16 experts (MoE architecture)
 * - 131,000 token context window
 * - Native multimodal capabilities (text + images)
 * - Function calling support
 * - Structured JSON output generation
 * - Industry-leading performance in text understanding
 * 
 * Service Architecture:
 * - Schema-driven extraction for consistent data structures
 * - Prompt templates optimized for specific tasks
 * - Error handling and validation at multiple levels
 * - Performance optimization through targeted prompting
 * - Extensible design for new use cases
 * 
 * Use Cases:
 * - Job posting data extraction and structuring
 * - Web automation action reasoning
 * - Content analysis and classification
 * - Data validation and quality assessment
 * - Human-readable summary generation
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { jobPostingSchema } from '../jobPostingSchema';
// Env is now globally available from worker-configuration.d.ts
import { AI_MODELS, MODEL_CONFIGS } from './model-config';

/**
 * Clean and parse JSON response that might be wrapped in markdown code blocks
 * 
 * AI models often return JSON wrapped in ```json...``` blocks. This function
 * extracts the JSON content and parses it safely.
 * 
 * @param response - Raw response string from AI model
 * @returns Parsed JSON object
 */
function parseAIJsonResponse(response: any): any {
  // Handle different response types
  let responseText: string;
  
  if (typeof response === 'string') {
    responseText = response;
  } else if (response && typeof response === 'object') {
    // If response is an object, try to extract the text content
    if (response.response && typeof response.response === 'string') {
      responseText = response.response;
    } else if (response.content && typeof response.content === 'string') {
      responseText = response.content;
    } else {
      // If it's already a parsed object, return it
      return response;
    }
  } else {
    throw new Error(`Invalid response type: ${typeof response}`);
  }

  try {
    // First, try parsing as-is
    return JSON.parse(responseText);
  } catch (error) {
    // If that fails, try to extract JSON from markdown code blocks
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Try to find JSON object without code blocks
    const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      return JSON.parse(jsonObjectMatch[0]);
    }
    
    // If all else fails, throw the original error
    throw new Error(`Failed to parse JSON response: ${responseText.substring(0, 200)}...`);
  }
}

/**
 * Llama-4 Service Class
 * 
 * Provides high-level interface to Llama-4 Scout model for various AI tasks
 * including structured data extraction, reasoning, and content analysis.
 * 
 * The service is designed to handle complex prompts and return structured
 * responses that can be validated against predefined schemas.
 * 
 * @example
 * const llama4 = new Llama4Service(env);
 * const jobData = await llama4.extractJobPosting(jobText);
 * const summary = await llama4.generateJobSummary(jobData);
 */
export class Llama4Service {
  /** Llama-4 Scout model identifier from centralized configuration */
  private readonly MODEL_NAME = AI_MODELS.EXTRACTION;

  /**
   * Initialize the Llama-4 Service
   * 
   * @param env - Cloudflare environment bindings containing AI model access
   */
  constructor(private env: Env) {}

  /**
   * Extract structured job posting data using Llama-4 with comprehensive schema validation
   * 
   * This is the primary method for converting unstructured job posting text into
   * a standardized, validated data structure. It uses Llama-4's advanced language
   * understanding to extract 50+ fields of job information with high accuracy.
   * 
   * Extraction Process:
   * 1. Generate JSON schema from Zod definition for guided output
   * 2. Construct comprehensive prompt with job text and context
   * 3. Use Llama-4 with JSON schema guidance for structured extraction
   * 4. Validate extracted data against Zod schema
   * 5. Return type-safe, validated job posting object
   * 
   * Extracted Information Includes:
   * - Core job details (title, company, location, type)
   * - Comprehensive compensation data (salary, bonuses, equity, benefits)
   * - Skills and qualifications (required/preferred)
   * - Company information and culture details
   * - Application process and requirements
   * - Timeline information (posted date, deadlines)
   * - AI/ML technology mentions and flags
   * - Security clearance and compliance requirements
   * 
   * The method supports multi-modal input by accepting additional context
   * from vision analysis and HTML content for enhanced accuracy.
   * 
   * @param jobPostingText - Raw job posting text to extract data from
   * @param additionalContext - Optional context for enhanced extraction
   * @param additionalContext.url - Source URL for platform identification
   * @param additionalContext.visionDescription - AI vision analysis of the page
   * @param additionalContext.htmlContent - Raw HTML content for additional context
   * @returns Promise<JobPostingData> - Validated, structured job posting data
   * 
   * @example
   * const jobData = await extractJobPosting(
   *   "Software Engineer at TechCorp, $120k-180k, San Francisco...",
   *   {
   *     url: "https://linkedin.com/jobs/view/123",
   *     visionDescription: "Job posting with salary highlighted in blue box"
   *   }
   * );
   * 
   * @throws Error if extraction fails or data doesn't validate against schema
   */
  async extractJobPosting(
    jobPostingText: string,
    additionalContext?: {
      url?: string;
      visionDescription?: string;
      htmlContent?: string;
    }
  ): Promise<z.infer<typeof jobPostingSchema>> {
    // Generate JSON schema from Zod and sanitize for Llama-4
    let jsonSchema = zodToJsonSchema(jobPostingSchema, {
      target: 'jsonSchema7',
      errorMessages: true,
    });
    jsonSchema = this.sanitizeSchemaForLlama4(jsonSchema);
    // Remove top-level meta fields that can cause grammar errors
    if (jsonSchema && typeof jsonSchema === 'object') {
      delete (jsonSchema as any).$schema;
      delete (jsonSchema as any).$id;
    }

    const contextInfo = additionalContext ? `
ADDITIONAL CONTEXT:
- Source URL: ${additionalContext.url || 'Not provided'}
- Vision Analysis: ${additionalContext.visionDescription || 'Not provided'}
- HTML Content Preview: ${additionalContext.htmlContent?.substring(0, 1000) || 'Not provided'}...
` : '';

    const messages = [
      {
        role: 'system',
        content: `You are a world-class AI assistant specialized in extracting detailed, structured information from job postings. You must strictly follow the provided JSON schema and analyze the entire text provided, including implicit details, to populate the schema as completely as possible.

CRITICAL INSTRUCTIONS:
- Extract ALL available information from the job posting
- Use the exact field names from the schema
- For missing information, omit the field entirely (don't use null or empty strings)
- ALWAYS return arrays for: responsibilities, qualifications, skills (even if empty: [])
- ALWAYS return objects for: aiFlags (use boolean flags like {"mentionsAI": false})
- Parse salary/compensation information carefully
- Identify the source platform (LinkedIn, Indeed, Glassdoor, etc.)
- Extract contact information if available
- Look for application instructions and requirements
- Return ONLY valid JSON that matches the schema - no markdown, no explanations

REQUIRED FIELDS (must be provided):
- jobTitle: string (extract from text or infer from context)
- companyName: string (extract company name or use "Unknown" if not found)
- location: string (extract location or use "Remote/Not specified")
- jobType: string (use "Full-time" as default)
- responsibilities: array of strings
- qualifications: array of strings  
- skills: array of strings
- aiFlags: object with boolean flags`
      },
      {
        role: 'user',
        content: `Please extract the structured data from the following job posting based on the provided JSON schema:

${contextInfo}

JOB POSTING TEXT:
---
${jobPostingText}
---

Extract all available information and return it as a JSON object following the schema.`
      }
    ];

    try {
      // Use optimized extraction model configuration
      const extractionConfig = MODEL_CONFIGS.extraction;
      const response = await this.env.AI.run(this.MODEL_NAME as any, {
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: jsonSchema
        },
        max_tokens: extractionConfig.maxTokens,
        temperature: extractionConfig.temperature,
        top_p: 0.9
      });

      // Parse and validate the response
      const extractedData = parseAIJsonResponse(response.response);
      
      // Post-process the data to handle AI model inconsistencies
      const processedData = this.postProcessExtractedData(extractedData);
      
      // Validate against the Zod schema
      const validatedData = jobPostingSchema.parse(processedData);
      
      return validatedData;

    } catch (error) {
      console.error('Llama-4 job extraction failed:', error);
      
      if (error instanceof z.ZodError) {
        throw new Error(`Schema validation failed: ${JSON.stringify(error.issues, null, 2)}`);
      }
      
      throw new Error(`Job extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a simplified JSON schema compatible with Llama-4
   * 
   * @private
   * @returns Simplified JSON schema for job posting extraction
   */
  private createLlama4CompatibleSchema(): any {
    return {
      type: 'object',
      properties: {
        jobTitle: {
          type: 'string',
          description: 'The title of the job position'
        },
        companyName: {
          type: 'string',
          description: 'The name of the company hiring'
        },
        location: {
          type: 'string',
          description: 'Primary location string'
        },
        jobType: {
          type: 'string',
          description: 'The type of employment (e.g., Full-time, Part-time, Contract)',
          enum: ['Full-time', 'Part-time', 'Contract', 'Temporary', 'Internship', 'Freelance']
        },
        responsibilities: {
          type: 'array',
          items: { type: 'string' },
          description: 'A list of the key responsibilities for the role'
        },
        qualifications: {
          type: 'array',
          items: { type: 'string' },
          description: 'A list of required or preferred qualifications'
        },
        skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'A list of key skills or technologies mentioned in the posting'
        },
        aiFlags: {
          type: 'object',
          properties: {
            mentionsAI: { type: 'boolean' },
            mentionsML: { type: 'boolean' },
            mentionsGenAI: { type: 'boolean' },
            mentionsRAG: { type: 'boolean' },
            mentionsLLM: { type: 'boolean' },
            mentionsAnalytics: { type: 'boolean' },
            mentionsSalesforce: { type: 'boolean' }
          },
          description: 'AI-related technology flags'
        },
        compensation: {
          type: 'object',
          properties: {
            salary: {
              type: 'object',
              properties: {
                currency: { type: 'string' },
                min: { type: 'number' },
                max: { type: 'number' },
                period: { 
                  type: 'string',
                  enum: ['hour', 'day', 'week', 'month', 'year', 'one-time']
                }
              }
            }
          },
          description: 'Compensation information'
        }
      },
      required: ['jobTitle', 'companyName', 'location', 'jobType', 'responsibilities', 'qualifications', 'skills', 'aiFlags']
    };
  }

  /**
   * Sanitize JSON schema to remove formats unsupported by Llama-4
   * 
   * @private
   * @param schema - JSON schema object
   * @returns Sanitized schema compatible with Llama-4
   */
  private sanitizeSchemaForLlama4(schema: any): any {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    const sanitized = { ...schema };

    // Remove unsupported formats
    if (sanitized.format === 'uri' || sanitized.format === 'email' || sanitized.format === 'date-time') {
      delete sanitized.format;
    }

    // Fix enum format - ensure it's an array or remove complex enums
    if (sanitized.enum && !Array.isArray(sanitized.enum)) {
      if (typeof sanitized.enum === 'string') {
        sanitized.enum = [sanitized.enum];
      } else {
        delete sanitized.enum;
      }
    }

    // Normalize enum values: must be an array of primitives only
    if (Array.isArray(sanitized.enum)) {
      sanitized.enum = sanitized.enum.filter((v: any) => (
        ['string', 'number', 'boolean'].includes(typeof v)
      ));
      if (sanitized.enum.length === 0) delete sanitized.enum;
    }

    // Remove oneOf/anyOf/allOf which can be complex
    if (sanitized.oneOf || sanitized.anyOf || sanitized.allOf) {
      delete sanitized.oneOf;
      delete sanitized.anyOf;
      delete sanitized.allOf;
      // Fallback to string type
      if (!sanitized.type) {
        sanitized.type = 'string';
      }
    }

    // Fix required field - must be an array, not an object
    if (sanitized.required && typeof sanitized.required === 'object' && !Array.isArray(sanitized.required)) {
      // Convert object with numeric keys to array
      const requiredArray = Object.values(sanitized.required).filter(v => typeof v === 'string');
      sanitized.required = requiredArray.length > 0 ? requiredArray : undefined;
    }

    // Remove $ref references which can cause issues
    if (sanitized.$ref) {
      delete sanitized.$ref;
      // Fallback to string type if no type specified
      if (!sanitized.type) {
        sanitized.type = 'string';
      }
    }

    // Recursively sanitize nested objects and arrays
    for (const key in sanitized) {
      const val = sanitized[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          sanitized[key] = val.map((item: any) => this.sanitizeSchemaForLlama4(item));
        } else {
          sanitized[key] = this.sanitizeSchemaForLlama4(val);
        }
      }
    }

    return sanitized;
  }

  /**
   * Post-process extracted data to handle AI model inconsistencies
   * 
   * @private
   * @param data - Raw extracted data from AI model
   * @returns Processed data that conforms to expected schema
   */
  private postProcessExtractedData(data: any): any {
    const processed = { ...data };

    // Ensure required string fields have fallback values
    if (!processed.jobTitle) {
      processed.jobTitle = "Software Engineer"; // Default fallback
    }
    if (!processed.companyName) {
      processed.companyName = "Unknown Company";
    }
    if (!processed.location) {
      processed.location = "Remote/Not specified";
    }
    if (!processed.jobType) {
      processed.jobType = "Full-time";
    }

    // Ensure array fields are arrays
    if (!Array.isArray(processed.responsibilities)) {
      processed.responsibilities = [];
    }
    if (!Array.isArray(processed.qualifications)) {
      // If it's an object, try to extract values
      if (typeof processed.qualifications === 'object' && processed.qualifications !== null) {
        processed.qualifications = Object.values(processed.qualifications).filter(v => typeof v === 'string');
      } else {
        processed.qualifications = [];
      }
    }
    if (!Array.isArray(processed.skills)) {
      processed.skills = [];
    }

    // Handle aiFlags - convert array to object if needed
    if (Array.isArray(processed.aiFlags)) {
      const flagsObject: any = {
        mentionsAI: false,
        mentionsML: false,
        mentionsGenAI: false,
        mentionsRAG: false,
        mentionsLLM: false,
        mentionsAnalytics: false,
        mentionsSalesforce: false
      };
      
      // Check if any of the array items mention AI technologies
      const flagsArray = processed.aiFlags as string[];
      flagsArray.forEach((item: string) => {
        const itemLower = item.toLowerCase();
        if (itemLower.includes('ai') || itemLower.includes('artificial intelligence')) {
          flagsObject.mentionsAI = true;
        }
        if (itemLower.includes('ml') || itemLower.includes('machine learning')) {
          flagsObject.mentionsML = true;
        }
        if (itemLower.includes('genai') || itemLower.includes('generative')) {
          flagsObject.mentionsGenAI = true;
        }
        if (itemLower.includes('rag') || itemLower.includes('retrieval')) {
          flagsObject.mentionsRAG = true;
        }
        if (itemLower.includes('llm') || itemLower.includes('language model')) {
          flagsObject.mentionsLLM = true;
        }
        if (itemLower.includes('analytics') || itemLower.includes('data analysis')) {
          flagsObject.mentionsAnalytics = true;
        }
        if (itemLower.includes('salesforce')) {
          flagsObject.mentionsSalesforce = true;
        }
      });
      
      processed.aiFlags = flagsObject;
    } else if (!processed.aiFlags || typeof processed.aiFlags !== 'object') {
      // Default aiFlags object
      processed.aiFlags = {
        mentionsAI: false,
        mentionsML: false,
        mentionsGenAI: false,
        mentionsRAG: false,
        mentionsLLM: false,
        mentionsAnalytics: false,
        mentionsSalesforce: false
      };
    }

    return processed;
  }

  /**
   * Generate reasoning for web automation actions
   */
  async generateActionReasoning(
    context: {
      goal: string;
      visionDescription: string;
      url: string;
      title: string;
      previousActions?: string[];
    }
  ): Promise<{
    action: 'type' | 'click' | 'wait' | 'navigate' | 'extract' | 'none';
    selector?: string;
    text?: string;
    reasoning: string;
    confidence: number;
    success?: boolean;
  }> {
    const messages = [
      {
        role: 'system',
        content: `You are a web automation expert. Analyze webpage information and determine the next action to achieve a goal. Always respond with valid JSON only.

Available actions:
- "type": Enter text into an input field
- "click": Click on an element  
- "wait": Wait for page to load or stabilize
- "navigate": Go to a different URL
- "extract": Extract data from the page
- "none": Goal is complete or no action needed

Response format:
{
  "action": "action_type",
  "selector": "CSS selector (for type/click actions)",
  "text": "text content (for type/navigate actions)", 
  "reasoning": "explanation of why this action was chosen",
  "confidence": 0.95,
  "success": true/false (for completion)
}`
      },
      {
        role: 'user',
        content: `
CONTEXT:
- Goal: ${context.goal}
- Current URL: ${context.url}
- Page Title: ${context.title}
- Vision Analysis: ${context.visionDescription}
- Previous Actions: ${context.previousActions?.join(', ') || 'None'}

Determine the next action to achieve the goal. Respond with JSON only.`
      }
    ];

    try {
      const response = await this.env.AI.run(this.MODEL_NAME as any, {
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 512,
        temperature: 0.1
      });

      const result = parseAIJsonResponse(response.response);
      
      return {
        action: result.action || 'none',
        selector: result.selector,
        text: result.text,
        reasoning: result.reasoning || 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
        success: result.success
      };

    } catch (error) {
      console.error('Action reasoning failed:', error instanceof Error ? error.message : String(error));
      return {
        action: 'none',
        reasoning: `Reasoning failed: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0
      };
    }
  }

  /**
   * Analyze page content for specific information
   */
  async analyzePageContent(
    content: string,
    analysisGoal: string,
    schema?: z.ZodSchema
  ): Promise<any> {
    const schemaInstruction = schema 
      ? `Follow this JSON schema: ${JSON.stringify(zodToJsonSchema(schema))}`
      : 'Return your analysis as a structured JSON object.';

    const messages = [
      {
        role: 'system',
        content: `You are an expert content analyzer. Analyze the provided content and extract relevant information based on the goal. ${schemaInstruction} Always respond with valid JSON only.`
      },
      {
        role: 'user',
        content: `
ANALYSIS GOAL: ${analysisGoal}

CONTENT TO ANALYZE:
---
${content}
---

Analyze the content and return structured information as JSON.`
      }
    ];

    try {
      const response = await this.env.AI.run(this.MODEL_NAME as any, {
        messages,
        response_format: { type: 'json_object' },
        max_tokens: 2048,
        temperature: 0.1
      });

      const result = parseAIJsonResponse(response.response);
      
      if (schema) {
        return schema.parse(result);
      }
      
      return result;

    } catch (error) {
      console.error('Content analysis failed:', error instanceof Error ? error.message : String(error));
      throw new Error(`Content analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate human-readable summary of extracted job data
   */
  async generateJobSummary(jobData: z.infer<typeof jobPostingSchema>): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: 'You are an expert at creating concise, informative summaries of job postings. Create a human-readable summary that highlights the most important aspects of the role.'
      },
      {
        role: 'user',
        content: `Create a concise summary of this job posting:

${JSON.stringify(jobData, null, 2)}

Focus on: job title, company, location, key requirements, compensation (if available), and what makes this role interesting. Keep it under 200 words.`
      }
    ];

    try {
      const response = await this.env.AI.run(this.MODEL_NAME as any, {
        messages,
        max_tokens: 512,
        temperature: 0.3
      });

      return response.response;

    } catch (error) {
      console.error('Summary generation failed:', error);
      return 'Summary generation failed.';
    }
  }
}
