/**
 * Smart context ranking and filtering
 * Prevents dumping all context and selects most relevant items
 */

import type { ContextItem } from '../context/AIContext';

export interface RankedContext {
  item: ContextItem;
  relevanceScore: number;
  reason: string;
}

/**
 * Rank context items by relevance to the user's query
 */
export function rankContextByRelevance(
  contextItems: ContextItem[],
  userQuery: string,
  maxTokens: number = 8000
): RankedContext[] {
  const queryLower = userQuery.toLowerCase();
  const queryTerms = extractKeyTerms(queryLower);
  
  const ranked: RankedContext[] = contextItems.map(item => {
    const score = calculateRelevanceScore(item, queryLower, queryTerms);
    const reason = explainRelevance(item, score);
    
    return {
      item,
      relevanceScore: score,
      reason,
    };
  });

  // Sort by relevance
  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Filter by token budget
  const filtered = filterByTokenBudget(ranked, maxTokens);

  return filtered;
}

/**
 * Calculate relevance score for a context item (0-100)
 */
function calculateRelevanceScore(
  item: ContextItem,
  queryLower: string,
  queryTerms: string[]
): number {
  let score = 0;
  const content = item.content.toLowerCase();
  const metadata = item.metadata;

  // Recency boost (newer = better)
  const ageMs = Date.now() - item.timestamp;
  const ageMinutes = ageMs / (1000 * 60);
  if (ageMinutes < 5) score += 20;
  else if (ageMinutes < 30) score += 10;
  else if (ageMinutes < 60) score += 5;

  // Type relevance
  if (queryLower.includes('error') || queryLower.includes('fail') || queryLower.includes('fix')) {
    if (metadata?.exitCode && metadata.exitCode !== 0) score += 30;
    if (item.type === 'output' || item.type === 'command_output') score += 15;
  }

  if (queryLower.includes('file') || queryLower.includes('code')) {
    if (item.type === 'file') score += 20;
  }

  if (queryLower.includes('command') || queryLower.includes('ran')) {
    if (item.type === 'command' || metadata?.command) score += 20;
  }

  // Term matching
  let termMatches = 0;
  for (const term of queryTerms) {
    if (content.includes(term)) {
      termMatches++;
      score += 10;
    }
    if (metadata?.command?.toLowerCase().includes(term)) {
      termMatches++;
      score += 15;
    }
    if (metadata?.path?.toLowerCase().includes(term)) {
      termMatches++;
      score += 10;
    }
  }

  // Boost if multiple terms match
  if (termMatches > 1) {
    score += termMatches * 5;
  }

  // Explicit inclusion boost
  if (item.metadata?.includeMode === 'always') {
    score += 50;
  }

  // Size penalty for very large items (prefer concise context)
  const contentLength = item.content.length;
  if (contentLength > 10000) score -= 10;
  else if (contentLength > 5000) score -= 5;

  // Error context is usually important
  if (content.includes('error') || content.includes('fail')) {
    score += 15;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Extract key terms from query
 */
function extractKeyTerms(query: string): string[] {
  // Remove common words
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'is',
    'this', 'that', 'what', 'why', 'how', 'can', 'should', 'would', 'could',
    'my', 'me', 'i', 'you'
  ]);

  return query
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 10); // Limit to 10 terms
}

/**
 * Explain why a context item is relevant
 */
function explainRelevance(item: ContextItem, score: number): string {
  if (score >= 70) return 'Highly relevant';
  if (score >= 50) return 'Relevant';
  if (score >= 30) return 'Possibly relevant';
  return 'Low relevance';
}

/**
 * Filter ranked context to fit within token budget
 */
function filterByTokenBudget(
  ranked: RankedContext[],
  maxTokens: number
): RankedContext[] {
  const result: RankedContext[] = [];
  let tokenCount = 0;

  for (const item of ranked) {
    // Rough token estimation: ~4 chars per token
    const estimatedTokens = Math.ceil(item.item.content.length / 4);
    
    if (tokenCount + estimatedTokens > maxTokens) {
      // Try to include at least one item
      if (result.length === 0) {
        // Truncate this item to fit
        result.push(item);
      }
      break;
    }

    result.push(item);
    tokenCount += estimatedTokens;
  }

  return result;
}

/**
 * Deduplicate similar context items
 */
export function deduplicateContext(items: ContextItem[]): ContextItem[] {
  const seen = new Set<string>();
  const result: ContextItem[] = [];

  for (const item of items) {
    // Create fingerprint based on content
    const fingerprint = createFingerprint(item);
    
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint);
      result.push(item);
    }
  }

  return result;
}

/**
 * Create a fingerprint for deduplication
 */
function createFingerprint(item: ContextItem): string {
  // For commands, use the command text
  if (item.metadata?.command) {
    return `cmd:${item.metadata.command}`;
  }
  
  // For files, use path
  if (item.type === 'file' && item.metadata?.path) {
    return `file:${item.metadata.path}`;
  }
  
  // For other content, use first 200 chars as fingerprint
  const contentHash = item.content.substring(0, 200).trim();
  return `${item.type}:${contentHash}`;
}

/**
 * Format ranked context with relevance indicators
 */
export function formatRankedContext(ranked: RankedContext[]): string[] {
  return ranked.map((r, index) => {
    const item = r.item;
    const header = `[Context ${index + 1}/${ranked.length}] Type: ${item.type}`;
    const relevance = r.relevanceScore >= 70 ? ' 🔥' : r.relevanceScore >= 50 ? ' ⭐' : '';
    
    const parts = [header + relevance];
    
    if (item.metadata?.command) {
      parts.push(`Command: ${item.metadata.command}`);
    }
    
    if (item.metadata?.path) {
      parts.push(`Path: ${item.metadata.path}`);
    }
    
    if (item.metadata?.exitCode !== undefined) {
      parts.push(`Exit Code: ${item.metadata.exitCode}`);
    }
    
    // Add content
    const content = item.hasSecrets && item.redactedContent 
      ? item.redactedContent 
      : item.content;
    
    parts.push(`Content:\n${content}`);
    
    return parts.join('\n');
  });
}
