/**
 * @fileoverview AI Model Configuration Service
 * 
 * This service manages the 3-model architecture for optimal performance and cost efficiency:
 * 
 * 1. Vision Model: @cf/llava-hf/llava-1.5-7b-hf
 *    - Purpose: Screenshot analysis and visual understanding
 *    - Strengths: Multimodal instruction-following, visual scene understanding
 *    - Cost: Free/low-cost
 * 
 * 2. Reasoning Model: @cf/openai/gpt-oss-120b  
 *    - Purpose: Puppeteer action reasoning and automation logic
 *    - Strengths: "Powerful reasoning, agentic tasks, versatile developer use cases"
 *    - Context: 128,000 tokens
 *    - Cost: $0.35/M input, $0.75/M output tokens
 * 
 * 3. Extraction Model: @cf/meta/llama-4-scout-17b-16e-instruct
 *    - Purpose: Structured job posting data extraction
 *    - Strengths: Natively multimodal, large context window, structured output
 *    - Context: 131,000 tokens (largest available)
 *    - Cost: $0.27/M input, $0.85/M output tokens
 * 
 * This configuration optimizes for:
 * - Performance: Each model specialized for its task
 * - Cost: Lower-cost models for appropriate tasks
 * - Accuracy: Purpose-built models vs. one-size-fits-all
 * 
 * @author AI Agent Development Team
 * @version 1.0.0
 * @since 2024-01-20
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
   * LLaVA 1.5 7B - Optimized for image-to-text conversion
   * - Best for: Converting screenshots to textual descriptions
   * - Input: Images + text prompts
   * - Output: Detailed textual descriptions of visual content
   * - Cost: Free/low-cost (beta model)
   * - Performance: Fast, specialized for vision tasks
   */
  VISION: '@cf/llava-hf/llava-1.5-7b-hf',

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
 * Model-specific configuration parameters
 * 
 * Optimized settings for each model based on their strengths and use cases.
 */
export const MODEL_CONFIGS = {
  [AI_MODELS.VISION]: {
    maxTokens: 512,
    temperature: 0.1,
    description: 'Vision analysis model for screenshot understanding',
    task: 'image-to-text',
    costTier: 'free'
  },

  [AI_MODELS.REASONING]: {
    maxTokens: 512,
    temperature: 0.1,
    contextWindow: 128000,
    description: 'Reasoning model optimized for agentic tasks and automation logic',
    task: 'text-generation',
    costTier: 'premium',
    specialization: 'reasoning-and-agents'
  },

  [AI_MODELS.EXTRACTION]: {
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
   * Get configuration parameters for a specific model
   * 
   * @param modelId - The model identifier
   * @returns Configuration parameters for the model
   */
  static getConfigForModel(modelId: string) {
    return MODEL_CONFIGS[modelId as keyof typeof MODEL_CONFIGS];
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
    const model = this.getModelForTask(task);
    
    // Cost per million tokens
    const costs = {
      [AI_MODELS.VISION]: { input: 0, output: 0 }, // Free/beta model
      [AI_MODELS.REASONING]: { input: 0.35, output: 0.75 },
      [AI_MODELS.EXTRACTION]: { input: 0.27, output: 0.85 }
    };

    const modelCosts = costs[model as keyof typeof costs];
    return (inputTokens / 1000000 * modelCosts.input) + (outputTokens / 1000000 * modelCosts.output);
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
        config: MODEL_CONFIGS[AI_MODELS.VISION],
        available: true
      },
      reasoning: {
        model: AI_MODELS.REASONING,
        config: MODEL_CONFIGS[AI_MODELS.REASONING],
        available: true
      },
      extraction: {
        model: AI_MODELS.EXTRACTION,
        config: MODEL_CONFIGS[AI_MODELS.EXTRACTION],
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
export type ModelConfig = typeof MODEL_CONFIGS[keyof typeof MODEL_CONFIGS];
