/**
 * Query Router - Intelligent Model Selection
 * 
 * Classifies queries by complexity and routes them to appropriate models
 * with optimized parameters for cost and performance.
 * 
 * Scoring Algorithm:
 *   Score = baseScore + lengthFactor(20) + contextComplexity(25) + keywordMatching(30) + errorPresence(25)
 * 
 * Tier Mapping:
 *   0-35:  Simple (Tier 1)  - factual questions, quick answers
 *   36-69: Moderate (Tier 2) - code generation, explanations
 *   70-100: Complex (Tier 3) - debugging, architecture, multi-step reasoning
 */

import type { ContextItem } from '../context/AIContext';
import type { AiSettings } from '../context/SettingsContext';
import type {
  RoutingDecision,
  RoutingTier,
  QueryType,
  ScoringFactor,
  TierAlternative,
  AutoRoutingSettings,
} from '../types/routing';
import {
  DEFAULT_AUTO_ROUTING,
  TEMPERATURE_PRESETS,
  TIER_THRESHOLDS,
} from '../types/routing';
import { createLogger } from '../utils/logger';

const log = createLogger('QueryRouter');

// Keywords that indicate different query types
const QUERY_PATTERNS = {
  simple: [
    /^what (is|are|does|do)\b/i,
    /^how (do|does) .{1,30}\?$/i,  // Short "how do I X?" questions
    /^(explain|describe) .{1,40}$/i,  // Short explanations
    /^list\b/i,
    /^show me\b/i,
    /\bdefine\b/i,
  ],
  code: [
    /\b(write|create|implement|build|make)\b.*\b(function|class|component|hook|script|code)\b/i,
    /\b(refactor|optimize|improve)\b.*\b(code|function|class)\b/i,
    /\badd (a |an )?(feature|functionality|method)\b/i,
    /\bconvert\b.*\bto\b/i,
  ],
  debug: [
    /\b(fix|debug|solve|resolve)\b/i,
    /\berror\b/i,
    /\bfail(ed|ing|s)?\b/i,
    /\bbug\b/i,
    /\bnot working\b/i,
    /\bbroken\b/i,
    /\bcrash(es|ed|ing)?\b/i,
    /\bissue\b/i,
    /\bproblem\b/i,
  ],
  creative: [
    /\b(design|architect|plan|brainstorm)\b/i,
    /\bsuggestions?\b/i,
    /\bideas?\b/i,
    /\balternatives?\b/i,
    /\bbest (way|approach|practice)\b/i,
  ],
  complex: [
    /\b(analyze|compare|evaluate|assess)\b/i,
    /\barchitecture\b/i,
    /\bstrategy\b/i,
    /\btrade-?offs?\b/i,
    /\bperformance\b/i,
    /\bsecurity\b/i,
    /\bscalability\b/i,
    /\bwhy (doesn't|does|is|are|do)\b/i,
    /\bexplain (how|why|the)\b.*\b(works?|happen)/i,
  ],
};

/**
 * Detect the primary query type based on patterns
 */
function detectQueryType(prompt: string, contextItems: ContextItem[]): QueryType {
  // Check for debug patterns first (highest priority if errors present)
  const hasErrors = contextItems.some(item => 
    item.metadata?.exitCode !== undefined && item.metadata.exitCode !== 0
  );
  
  if (hasErrors || QUERY_PATTERNS.debug.some(p => p.test(prompt))) {
    return 'debug';
  }
  
  // Check other patterns in priority order
  if (QUERY_PATTERNS.complex.some(p => p.test(prompt))) {
    return 'complex';
  }
  
  if (QUERY_PATTERNS.code.some(p => p.test(prompt))) {
    return 'code';
  }
  
  if (QUERY_PATTERNS.creative.some(p => p.test(prompt))) {
    return 'creative';
  }
  
  if (QUERY_PATTERNS.simple.some(p => p.test(prompt))) {
    return 'factual';
  }
  
  // Default to explanation for medium-length queries
  return 'explanation';
}

/**
 * Calculate complexity score (0-100)
 */
function calculateComplexityScore(
  prompt: string,
  contextItems: ContextItem[]
): { score: number; factors: ScoringFactor[] } {
  const factors: ScoringFactor[] = [];
  
  // 1. Length factor (0-20 points)
  // Short queries tend to be simpler
  const wordCount = prompt.split(/\s+/).length;
  let lengthScore: number;
  if (wordCount <= 5) {
    lengthScore = 5;
  } else if (wordCount <= 15) {
    lengthScore = 10;
  } else if (wordCount <= 30) {
    lengthScore = 15;
  } else {
    lengthScore = 20;
  }
  factors.push({
    name: 'prompt_length',
    value: lengthScore,
    weight: 1,
    description: `${wordCount} words`,
  });
  
  // 2. Context complexity (0-25 points)
  // More context items and error outputs indicate complexity
  const contextCount = contextItems.length;
  const hasFiles = contextItems.some(item => item.type === 'file');
  const hasErrors = contextItems.some(item => 
    item.metadata?.exitCode !== undefined && item.metadata.exitCode !== 0
  );
  const largeContext = contextItems.some(item => (item.content?.length ?? 0) > 5000);
  
  let contextScore = Math.min(contextCount * 3, 10); // 0-10 for count
  if (hasFiles) contextScore += 5;
  if (hasErrors) contextScore += 10;
  if (largeContext) contextScore += 5;
  contextScore = Math.min(contextScore, 25);
  
  factors.push({
    name: 'context_complexity',
    value: contextScore,
    weight: 1,
    description: `${contextCount} items${hasErrors ? ', has errors' : ''}${hasFiles ? ', has files' : ''}`,
  });
  
  // 3. Keyword matching (0-30 points)
  // Debug/complex keywords add points, simple keywords subtract
  let keywordScore = 15; // Start at midpoint
  
  const queryType = detectQueryType(prompt, contextItems);
  switch (queryType) {
    case 'debug':
      keywordScore = 28;
      break;
    case 'complex':
      keywordScore = 25;
      break;
    case 'creative':
      keywordScore = 20;
      break;
    case 'code':
      keywordScore = 18;
      break;
    case 'explanation':
      keywordScore = 12;
      break;
    case 'factual':
      keywordScore = 5;
      break;
  }
  
  factors.push({
    name: 'keyword_matching',
    value: keywordScore,
    weight: 1,
    description: `Query type: ${queryType}`,
  });
  
  // 4. Error presence bonus (0-25 points)
  // Explicit error indicators
  let errorScore = 0;
  if (hasErrors) {
    errorScore = 25;
  } else if (/\b(error|exception|fail|crash|bug)\b/i.test(prompt)) {
    errorScore = 15;
  }
  
  factors.push({
    name: 'error_presence',
    value: errorScore,
    weight: 1,
    description: hasErrors ? 'Exit code != 0' : 'No explicit errors',
  });
  
  // Calculate total score
  const totalScore = factors.reduce((sum, f) => sum + f.value * f.weight, 0);
  
  // Clamp to 0-100
  const finalScore = Math.min(100, Math.max(0, totalScore));
  
  return { score: finalScore, factors };
}

/**
 * Map score to tier
 */
function scoreToTier(score: number): RoutingTier {
  if (score <= TIER_THRESHOLDS.simple.max) {
    return 'simple';
  }
  if (score <= TIER_THRESHOLDS.moderate.max) {
    return 'moderate';
  }
  return 'complex';
}

/**
 * Get context budget for tier and mode
 */
function getContextBudget(
  tier: RoutingTier,
  mode: 'chat' | 'agent',
  settings: AiSettings
): number {
  const autoRouting = settings.auto_routing;
  
  // If auto-routing has specific budgets, use them
  if (autoRouting) {
    switch (tier) {
      case 'simple':
        return autoRouting.simple_budget ?? DEFAULT_AUTO_ROUTING.simple_budget!;
      case 'moderate':
        return autoRouting.moderate_budget ?? DEFAULT_AUTO_ROUTING.moderate_budget!;
      case 'complex':
        return autoRouting.complex_budget ?? DEFAULT_AUTO_ROUTING.complex_budget!;
    }
  }
  
  // Fall back to mode-specific defaults
  const modeDefault = mode === 'chat'
    ? (settings.context_token_budget_chat ?? 12000)
    : (settings.context_token_budget_agent ?? 6000);
  
  // Apply tier multipliers to mode default
  switch (tier) {
    case 'simple':
      return Math.round(modeDefault * 0.5); // 50% of default
    case 'moderate':
      return Math.round(modeDefault * 0.8); // 80% of default
    case 'complex':
      return modeDefault; // Full budget
  }
}

/**
 * Get temperature for query type
 */
function getTemperature(queryType: QueryType): number {
  return TEMPERATURE_PRESETS[queryType] ?? 0.7;
}

/**
 * Get model for tier with fallback chain
 */
function getModelForTier(
  tier: RoutingTier,
  settings: AiSettings
): { model: string; fallbackUsed: boolean; originalTier?: RoutingTier } {
  const autoRouting = settings.auto_routing;
  const mainModel = settings.model;
  
  if (!autoRouting?.enabled) {
    return { model: mainModel, fallbackUsed: false };
  }
  
  // Get the tier-specific model
  let model: string | undefined;
  switch (tier) {
    case 'simple':
      model = autoRouting.simple_model;
      break;
    case 'moderate':
      model = autoRouting.moderate_model;
      break;
    case 'complex':
      model = autoRouting.complex_model;
      break;
  }
  
  // If model is configured and not empty, use it
  if (model && model.trim()) {
    return { model, fallbackUsed: false };
  }
  
  // Fallback chain: try next tier down, then main model
  const fallbackChain: RoutingTier[] = 
    tier === 'complex' ? ['moderate', 'simple'] :
    tier === 'moderate' ? ['simple'] :
    [];
  
  for (const fallbackTier of fallbackChain) {
    let fallbackModel: string | undefined;
    switch (fallbackTier) {
      case 'simple':
        fallbackModel = autoRouting.simple_model;
        break;
      case 'moderate':
        fallbackModel = autoRouting.moderate_model;
        break;
    }
    
    if (fallbackModel && fallbackModel.trim()) {
      log.info(`Tier ${tier} model not configured, falling back to ${fallbackTier}`, {
        originalTier: tier,
        fallbackTier,
        model: fallbackModel,
      });
      return { model: fallbackModel, fallbackUsed: true, originalTier: tier };
    }
  }
  
  // Ultimate fallback: use main configured model
  log.info(`No tier models configured, falling back to main model`, {
    originalTier: tier,
    model: mainModel,
  });
  return { model: mainModel, fallbackUsed: true, originalTier: tier };
}

/**
 * Generate alternative tier considerations for transparency
 */
function generateAlternatives(
  score: number,
  selectedTier: RoutingTier
): TierAlternative[] {
  const alternatives: TierAlternative[] = [];
  
  // Check how close we are to tier boundaries
  if (selectedTier === 'simple' && score > 25) {
    alternatives.push({
      tier: 'moderate',
      score: TIER_THRESHOLDS.moderate.min,
      reason: `Close to moderate tier (score ${score} vs threshold ${TIER_THRESHOLDS.moderate.min})`,
    });
  }
  
  if (selectedTier === 'moderate') {
    if (score < 45) {
      alternatives.push({
        tier: 'simple',
        score: TIER_THRESHOLDS.simple.max,
        reason: `Could use simple tier for cost savings (score ${score})`,
      });
    }
    if (score > 60) {
      alternatives.push({
        tier: 'complex',
        score: TIER_THRESHOLDS.complex.min,
        reason: `Close to complex tier (score ${score} vs threshold ${TIER_THRESHOLDS.complex.min})`,
      });
    }
  }
  
  if (selectedTier === 'complex' && score < 80) {
    alternatives.push({
      tier: 'moderate',
      score: TIER_THRESHOLDS.moderate.max,
      reason: `Moderate tier might suffice (score ${score})`,
    });
  }
  
  return alternatives;
}

/**
 * Main routing function - classify query and return routing decision
 */
export function classifyAndRoute(
  prompt: string,
  contextItems: ContextItem[],
  settings: AiSettings,
  mode: 'chat' | 'agent'
): RoutingDecision {
  // Calculate complexity score
  const { score, factors } = calculateComplexityScore(prompt, contextItems);
  
  // Determine tier
  const tier = scoreToTier(score);
  
  // Detect query type
  const queryType = detectQueryType(prompt, contextItems);
  
  // Get model with fallback
  const { model, fallbackUsed, originalTier } = getModelForTier(tier, settings);
  
  // Get context budget
  const contextBudget = getContextBudget(tier, mode, settings);
  
  // Get temperature
  const temperature = getTemperature(queryType);
  
  // Generate alternatives for transparency
  const alternatives = generateAlternatives(score, tier);
  
  const decision: RoutingDecision = {
    tier,
    complexity: tier === 'simple' ? 1 : tier === 'moderate' ? 2 : 3,
    model,
    contextBudget,
    temperature,
    fallbackUsed,
    originalTier: fallbackUsed ? originalTier : undefined,
    reasoning: {
      queryType,
      score,
      factors,
      alternatives,
    },
  };
  
  log.debug('Routing decision', {
    tier,
    score,
    model,
    queryType,
    contextBudget,
    factors: factors.map(f => `${f.name}:${f.value}`).join(', '),
  });
  
  return decision;
}

/**
 * Check if auto-routing is enabled
 */
export function isAutoRoutingEnabled(settings: AiSettings): boolean {
  return settings.auto_routing?.enabled !== false;
}

/**
 * Get effective auto-routing settings with defaults
 */
export function getAutoRoutingSettings(settings: AiSettings): AutoRoutingSettings {
  if (!settings.auto_routing) {
    return {
      ...DEFAULT_AUTO_ROUTING,
      // Use main model as default for all tiers (backwards compatible)
      simple_model: settings.model,
      moderate_model: settings.model,
      complex_model: settings.model,
    };
  }
  
  return {
    enabled: settings.auto_routing.enabled ?? DEFAULT_AUTO_ROUTING.enabled,
    simple_model: settings.auto_routing.simple_model || settings.model,
    moderate_model: settings.auto_routing.moderate_model || settings.model,
    complex_model: settings.auto_routing.complex_model || settings.model,
    simple_budget: settings.auto_routing.simple_budget ?? DEFAULT_AUTO_ROUTING.simple_budget,
    moderate_budget: settings.auto_routing.moderate_budget ?? DEFAULT_AUTO_ROUTING.moderate_budget,
    complex_budget: settings.auto_routing.complex_budget ?? DEFAULT_AUTO_ROUTING.complex_budget,
    enable_prompt_enhancement: settings.auto_routing.enable_prompt_enhancement ?? DEFAULT_AUTO_ROUTING.enable_prompt_enhancement,
    show_routing_info: settings.auto_routing.show_routing_info ?? DEFAULT_AUTO_ROUTING.show_routing_info,
    export_routing_detail: settings.auto_routing.export_routing_detail ?? DEFAULT_AUTO_ROUTING.export_routing_detail,
  };
}

// Export for testing
export { calculateComplexityScore, detectQueryType, scoreToTier };
