/**
 * Type definitions for the AI Query Routing System
 * 
 * The routing system automatically classifies queries by complexity
 * and routes them to appropriate models with optimized parameters.
 */

/**
 * Query complexity tiers
 */
export type RoutingTier = 'simple' | 'moderate' | 'complex';

/**
 * Detected query types that influence routing decisions
 */
export type QueryType = 'factual' | 'code' | 'debug' | 'creative' | 'explanation' | 'complex';

/**
 * A single scoring factor used in complexity calculation
 */
export interface ScoringFactor {
  name: string;
  value: number;
  weight: number;
  description?: string;
}

/**
 * Alternative tier consideration for transparency
 */
export interface TierAlternative {
  tier: RoutingTier;
  score: number;
  reason: string;
}

/**
 * Detailed reasoning behind a routing decision
 */
export interface RoutingReasoning {
  /** Detected type of query */
  queryType: QueryType;
  /** Raw complexity score (0-100) */
  score: number;
  /** Individual scoring factors that contributed to the score */
  factors: ScoringFactor[];
  /** Alternative tiers that were considered */
  alternatives: TierAlternative[];
}

/**
 * Complete routing decision including model, parameters, and reasoning
 */
export interface RoutingDecision {
  /** Selected complexity tier */
  tier: RoutingTier;
  /** Numeric complexity level (1-3) */
  complexity: 1 | 2 | 3;
  /** Model to use for this request */
  model: string;
  /** Token budget for context */
  contextBudget: number;
  /** Temperature setting for generation */
  temperature: number;
  /** Whether fallback was used (tier model not available) */
  fallbackUsed: boolean;
  /** Original tier before fallback (if fallbackUsed is true) */
  originalTier?: RoutingTier;
  /** Detailed reasoning for transparency */
  reasoning: RoutingReasoning;
}

/**
 * Prompt enhancement result
 */
export interface PromptEnhancement {
  /** Original user prompt */
  original: string;
  /** Enhanced prompt (may be same as original if no enhancement needed) */
  enhanced: string;
  /** Whether enhancement was applied */
  wasEnhanced: boolean;
  /** Reason for enhancement */
  reason?: string;
  /** Pattern that triggered enhancement */
  pattern?: 'vague_reference' | 'missing_context' | 'ambiguous_query' | 'beginner_expansion';
}

/**
 * Auto-routing configuration in settings
 */
export interface AutoRoutingSettings {
  /** Enable automatic model routing */
  enabled: boolean;

  // Model tiers
  /** Model for simple queries (factual, quick answers) */
  simple_model: string;
  /** Model for moderate queries (code generation, explanations) */
  moderate_model: string;
  /** Model for complex queries (debugging, architecture) */
  complex_model: string;

  // Budget tiers (optional, uses defaults if not specified)
  /** Context token budget for simple tier */
  simple_budget?: number;
  /** Context token budget for moderate tier */
  moderate_budget?: number;
  /** Context token budget for complex tier */
  complex_budget?: number;

  // Prompt enhancement
  /** Enable automatic prompt enhancement for vague queries */
  enable_prompt_enhancement: boolean;

  // UI/Export preferences
  /** Show routing info in chat UI */
  show_routing_info: boolean;
  /** Detail level for exports */
  export_routing_detail: 'minimal' | 'standard' | 'detailed';
}

/**
 * Default values for auto-routing settings
 */
export const DEFAULT_AUTO_ROUTING: AutoRoutingSettings = {
  enabled: true,
  simple_model: 'gpt-4o-mini',
  moderate_model: 'gpt-4.1',
  complex_model: 'gpt-4.1', // Use gpt-4.1 as safe default
  simple_budget: 4000,
  moderate_budget: 8000,
  complex_budget: 12000,
  enable_prompt_enhancement: true,
  show_routing_info: true,
  export_routing_detail: 'standard',
};

/**
 * Temperature presets by query type
 */
export const TEMPERATURE_PRESETS: Record<QueryType, number> = {
  factual: 0.2,      // Deterministic answers
  code: 0.4,         // Balanced for code
  debug: 0.2,        // Precision for debugging
  explanation: 0.6,  // Some variation for explanations
  creative: 0.8,     // More creative
  complex: 0.5,      // Balanced for complex reasoning
};

/**
 * Complexity tier thresholds
 */
export const TIER_THRESHOLDS = {
  simple: { min: 0, max: 35 },
  moderate: { min: 36, max: 69 },
  complex: { min: 70, max: 100 },
} as const;
