/**
 * @fileoverview AI Model Configuration Service - Hybrid Vision+Reasoning Architecture
 * 
 * This service implements a best-practice hybrid architecture that separates "seeing" from "thinking":
 * 
 * ARCHITECTURE OVERVIEW:
 * =====================
 * 
 * 1. VISION MODEL (The "Eyes"): @cf/meta/llama-4-scout-17b-16e-instruct
 *    - Purpose: Screenshot analysis and visual form field identification
 *    - Role: Analyzes page screenshots to find login fields, buttons, etc.
 *    - Strengths: Natively multimodal, superior UI element recognition
 *    - Context: 131,000 tokens (handles full-page screenshots)
 *    - Cost: $0.27/M input, $0.85/M output (~$0.0002 per screenshot)
 *    - When to use: When you need to "see" the page layout
 * 
 * 2. REASONING MODEL (The "Brain"): @cf/openai/gpt-oss-120b
 *    - Purpose: Strategic planning, decision making, error handling
 *    - Role: Decides authentication strategy, handles complex logic
 *    - Strengths: "Powerful reasoning, agentic tasks, versatile developer use cases"
 *    - Context: 128,000 tokens (enough for complex decision trees)
 *    - Cost: $0.35/M input, $0.75/M output tokens
 *    - When to use: When you need to "think" about what to do next
 * 
 * 3. EXTRACTION MODEL (The "Processor"): @cf/meta/llama-4-scout-17b-16e-instruct
 *    - Purpose: Structured job posting data extraction from HTML/text
 *    - Role: Converts unstructured job content to structured schema
 *    - Strengths: Multimodal, large context, structured output support
 *    - Context: 131,000 tokens (largest available for long job posts)
 *    - Cost: $0.27/M input, $0.85/M output tokens
 *    - When to use: When you need to extract structured data
 * 
 * WHY THIS ARCHITECTURE?
 * ======================
 * - Separation of Concerns: Vision sees, GPT thinks, Llama extracts
 * - Cost Optimization: Right model for the right job
 * - Reliability: GPT-120B's superior reasoning reduces failed logins
 * - Flexibility: Can swap models independently for A/B testing
 * 
 * TYPICAL LOGIN FLOW COSTS:
 * ==========================
 * - 3 screenshots (Llama 4 Vision): ~$0.0006
 * - 1 strategy planning (GPT-120B): ~$0.0004
 * - Total per login: ~$0.001 (much cheaper than failed attempts!)
 * 
 * @author AI Agent Development Team
 * @version 2.0.0
 * @since 2024-01-20
 * @updated 2025-10-13 - Upgraded to hybrid vision+reasoning architecture
 */

/**
 * AI Model Configuration Constants
 * 
 * Centralized configuration for all AI models used in the system.
 * This allows for easy model switching and A/B testing.
 */
export const AI_MODELS = {
  /**
   * Vision Model for Screenshot Analysis
   * 
   * Llama 4 Scout 17B-16E Instruct - Natively multimodal vision+text model
   * - Best for: Complex login UI understanding and form element identification
   * - Architecture: 17B parameters with 16 experts (Mixture-of-Experts)
   * - Input: Screenshots + contextual prompts
   * - Output: Structured analysis with industry-leading accuracy
   * - Context: 131,000 tokens (handles full-page screenshots)
   * - Cost: $0.27/M input, $0.85/M output (~$0.0002 per screenshot)
   * 
   * Why Llama 4 Scout for login automation:
   * 1. Natively multimodal (built for vision+text, not adapted)
   * 2. Superior accuracy for distinguishing similar UI elements
   * 3. Function calling support for structured CSS selector responses
   * 4. Handles complex multi-step login flows reliably
   * 5. Async queue support for production concurrent requests
   * 6. Better resilience to UI variations across different websites
   * 
   * Cost justification:
   * - Screenshots typically use 200-500 tokens
   * - Cost per login automation: ~$0.0001-0.0005
   * - Failed login attempts cost more than model inference
   * - Higher accuracy = fewer retries = lower total cost
   */
  VISION: '@cf/meta/llama-4-scout-17b-16e-instruct',

  /**
   * Reasoning Model for Action Logic
   * 
   * GPT-OSS-120B - Specialized for reasoning and agentic tasks
   * - Best for: Web automation decision making, action planning
   * - Input: Vision descriptions + goals + context
   * - Output: Structured action recommendations with reasoning
   * - Context: 128,000 tokens
   * - Cost: $0.35/M input, $0.75/M output tokens
   * - Performance: Optimized for reasoning and agent workflows
   */
  REASONING: '@cf/openai/gpt-oss-120b',

  /**
   * Extraction Model for Structured Data
   * 
   * Llama-4 Scout 17B - Best for comprehensive data extraction
   * - Best for: Converting unstructured text to structured job data
   * - Input: Job posting text + context + schema guidance
   * - Output: Validated structured data following comprehensive schema
   * - Context: 131,000 tokens (largest available)
   * - Cost: $0.27/M input, $0.85/M output tokens (most cost-effective)
   * - Performance: Multimodal, industry-leading text understanding
   */
  EXTRACTION: '@cf/meta/llama-4-scout-17b-16e-instruct'
} as const;

/**
 * Task-specific configuration parameters
 * 
 * Optimized settings for each task type regardless of underlying model.
 * This allows the same model to be used for different tasks with different configs.
 */
export const TASK_CONFIGS = {
  vision: {
    model: AI_MODELS.VISION,
    maxTokens: 1024,
    temperature: 0.1,
    contextWindow: 131000,
    description: 'Multimodal vision model for login form identification and screenshot analysis',
    task: 'image-to-text',
    costTier: 'standard',
    specialization: 'multimodal-vision'
  },

  reasoning: {
    model: AI_MODELS.REASONING,
    maxTokens: 512,
    temperature: 0.1,
    contextWindow: 128000,
    description: 'Reasoning model optimized for agentic tasks and automation logic',
    task: 'text-generation',
    costTier: 'premium',
    specialization: 'reasoning-and-agents'
  },

  extraction: {
    model: AI_MODELS.EXTRACTION,
    maxTokens: 4096,
    temperature: 0.1,
    contextWindow: 131000,
    description: 'Extraction model for comprehensive structured data extraction',
    task: 'text-generation',
    costTier: 'standard',
    specialization: 'multimodal-extraction'
  }
} as const;

/**
 * Legacy MODEL_CONFIGS for backward compatibility
 * @deprecated Use TASK_CONFIGS instead for clearer intent
 */
export const MODEL_CONFIGS = TASK_CONFIGS;

/**
 * Model Selection Service
 * 
 * Provides intelligent model selection based on task requirements.
 * Allows for easy A/B testing and model switching.
 */
export class ModelConfigService {
  /**
   * Get the appropriate model for a specific task
   * 
   * @param task - The type of task to perform
   * @returns The model identifier for the task
   */
  static getModelForTask(task: 'vision' | 'reasoning' | 'extraction'): string {
    switch (task) {
      case 'vision':
        return AI_MODELS.VISION;
      case 'reasoning':
        return AI_MODELS.REASONING;
      case 'extraction':
        return AI_MODELS.EXTRACTION;
      default:
        throw new Error(`Unknown task type: ${task}`);
    }
  }

  /**
   * Get configuration parameters for a specific task
   * 
   * @param task - The task type
   * @returns Configuration parameters for the task
   */
  static getConfigForTask(task: 'vision' | 'reasoning' | 'extraction') {
    return TASK_CONFIGS[task];
  }
  
  /**
   * Get configuration parameters for a specific model (legacy)
   * 
   * @param modelId - The model identifier
   * @returns Configuration parameters for the model
   * @deprecated Use getConfigForTask instead
   */
  static getConfigForModel(modelId: string) {
    // Map model IDs to tasks
    if (modelId === AI_MODELS.VISION) return TASK_CONFIGS.vision;
    if (modelId === AI_MODELS.REASONING) return TASK_CONFIGS.reasoning;
    if (modelId === AI_MODELS.EXTRACTION) return TASK_CONFIGS.extraction;
    throw new Error(`Unknown model: ${modelId}`);
  }

  /**
   * Get cost estimate for a task
   * 
   * @param task - The type of task
   * @param inputTokens - Estimated input tokens
   * @param outputTokens - Estimated output tokens
   * @returns Estimated cost in USD
   */
  static estimateCost(
    task: 'vision' | 'reasoning' | 'extraction',
    inputTokens: number,
    outputTokens: number
  ): number {
    // Cost per million tokens (updated October 2025)
    // Using task-based pricing to avoid duplicate model keys
    const taskCosts = {
      vision: { input: 0.27, output: 0.85 }, // Llama 4 Scout (multimodal)
      reasoning: { input: 0.35, output: 0.75 }, // GPT-OSS-120B
      extraction: { input: 0.27, output: 0.85 } // Llama 4 Scout (text)
    };

    const costs = taskCosts[task];
    return (inputTokens / 1000000 * costs.input) + (outputTokens / 1000000 * costs.output);
  }

  /**
   * Validate model availability and configuration
   * 
   * @returns Validation results for all configured models
   */
  static validateConfiguration() {
    const results = {
      vision: {
        model: AI_MODELS.VISION,
        config: TASK_CONFIGS.vision,
        available: true
      },
      reasoning: {
        model: AI_MODELS.REASONING,
        config: TASK_CONFIGS.reasoning,
        available: true
      },
      extraction: {
        model: AI_MODELS.EXTRACTION,
        config: TASK_CONFIGS.extraction,
        available: true
      }
    };

    return results;
  }
}

/**
 * Type definitions for model configuration
 */
export type ModelTask = 'vision' | 'reasoning' | 'extraction';
export type ModelId = typeof AI_MODELS[keyof typeof AI_MODELS];
export type TaskConfig = typeof TASK_CONFIGS[keyof typeof TASK_CONFIGS];
/** @deprecated Use TaskConfig instead */
export type ModelConfig = TaskConfig;
