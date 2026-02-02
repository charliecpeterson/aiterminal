/**
 * Token Estimation Utilities
 * 
 * Centralized token counting and estimation logic for LLM interactions.
 * Uses ~4 characters per token as a rough approximation for English text,
 * which is consistent with GPT/Claude tokenization patterns.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Average characters per token for English text */
export const CHARS_PER_TOKEN = 4;

/** Token budget defaults by complexity tier */
export const TOKEN_BUDGETS = {
  simple: 4000,
  moderate: 8000,
  complex: 12000,
} as const;

/** Response token limits (must match src-tauri/src/models.rs) */
export const RESPONSE_TOKENS = {
  default: 4096,
  min: 256,
  max: 128000, // Claude 3.5 Sonnet max
} as const;

/** Tool result size limits */
export const TOOL_RESULT_MAX_CHARS = 8000; // ~2000 tokens

// ============================================================================
// ESTIMATION FUNCTIONS
// ============================================================================

/**
 * Estimate token count from text.
 * Uses ~4 characters per token as a rough approximation.
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count (rounded up)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate character count from tokens.
 * Inverse of estimateTokens().
 * 
 * @param tokens - Number of tokens
 * @returns Estimated character count
 */
export function estimateChars(tokens: number): number {
  return tokens * CHARS_PER_TOKEN;
}

/**
 * Format token count with human-readable suffix.
 * 
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "1.5k" or "500")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Calculate total tokens in an array of text items.
 * 
 * @param items - Array of text strings
 * @returns Total estimated token count
 */
export function calculateTotalTokens(items: string[]): number {
  return items.reduce((sum, text) => sum + estimateTokens(text), 0);
}

/**
 * Check if content fits within a token budget.
 * 
 * @param text - Text to check
 * @param budget - Maximum token budget
 * @returns True if text fits within budget
 */
export function fitsInBudget(text: string, budget: number): boolean {
  return estimateTokens(text) <= budget;
}

/**
 * Truncate text to fit within a token budget.
 * 
 * @param text - Text to truncate
 * @param maxTokens - Maximum token budget
 * @param suffix - Suffix to append when truncating (default: '...')
 * @returns Truncated text that fits within budget
 */
export function truncateToTokenBudget(
  text: string, 
  maxTokens: number,
  suffix: string = '...'
): string {
  const maxChars = estimateChars(maxTokens);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - suffix.length) + suffix;
}

/**
 * Split text into chunks that fit within a token budget.
 * Useful for processing large documents.
 * 
 * @param text - Text to split
 * @param maxTokensPerChunk - Maximum tokens per chunk
 * @returns Array of text chunks
 */
export function splitIntoChunks(text: string, maxTokensPerChunk: number): string[] {
  const maxChars = estimateChars(maxTokensPerChunk);
  const chunks: string[] = [];
  
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.slice(i, i + maxChars));
  }
  
  return chunks;
}
