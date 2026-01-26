/**
 * Smart context ranking and filtering
 * Prevents dumping all context and selects most relevant items
 */

import type { ContextItem } from '../context/AIContext';

export interface RankedContext {
  item: ContextItem;
  relevanceScore: number;
  reason: string;
  breakdown?: {
    recency: number;
    queryMatch: number;
    typeRelevance: number;
    usagePenalty: number;
    timeDecay: number;
    conversationRelevance: number;
  };
}

interface ScoringContext {
  recentMessageTopics?: string[];
  currentMessageId?: string;
}

interface RelevanceBreakdown {
  recency: number;
  queryMatch: number;
  typeRelevance: number;
  usagePenalty: number;
  timeDecay: number;
  conversationRelevance: number;
}

/**
 * Rank context items by relevance to the user's query
 */
export function rankContextByRelevance(
  contextItems: ContextItem[],
  userQuery: string,
  maxTokens: number = 8000,
  scoringContext?: ScoringContext
): RankedContext[] {
  const queryLower = userQuery.toLowerCase();
  const queryTerms = extractKeyTerms(queryLower);
  const now = Date.now();
  
  const ranked: RankedContext[] = contextItems.map(item => {
    const breakdown = calculateRelevanceScoreWithBreakdown(item, queryLower, queryTerms, now, scoringContext);
    const score = breakdown.total;
    const reason = explainRelevance(item, score, breakdown);
    
    return {
      item,
      relevanceScore: score,
      reason,
      breakdown: {
        recency: breakdown.recency,
        queryMatch: breakdown.queryMatch,
        typeRelevance: breakdown.typeRelevance,
        usagePenalty: breakdown.usagePenalty,
        timeDecay: breakdown.timeDecay,
        conversationRelevance: breakdown.conversationRelevance,
      },
    };
  });

  // Sort by relevance
  ranked.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Filter by token budget
  const filtered = filterByTokenBudget(ranked, maxTokens);

  return filtered;
}

/**
 * Calculate relevance score with detailed breakdown for a context item (0-100)
 */
function calculateRelevanceScoreWithBreakdown(
  item: ContextItem,
  queryLower: string,
  queryTerms: string[],
  now: number,
  scoringContext?: ScoringContext
): {
  total: number;
  recency: number;
  queryMatch: number;
  typeRelevance: number;
  usagePenalty: number;
  timeDecay: number;
  conversationRelevance: number;
} {
  let recency = 0;
  let queryMatch = 0;
  let typeRelevance = 0;
  let usagePenalty = 0;
  let timeDecay = 0;
  let conversationRelevance = 0;

  const content = item.content.toLowerCase();
  const metadata = item.metadata;

  // 1. TIME DECAY - Context gets stale over time
  const ageMs = now - item.timestamp;
  const ageMinutes = ageMs / (1000 * 60);
  const ageHours = ageMinutes / 60;
  
  if (ageMinutes < 5) {
    recency = 25;
    timeDecay = 0;
  } else if (ageMinutes < 30) {
    recency = 15;
    timeDecay = -5;
  } else if (ageHours < 1) {
    recency = 8;
    timeDecay = -10;
  } else if (ageHours < 3) {
    recency = 3;
    timeDecay = -15;
  } else {
    recency = 0;
    timeDecay = -25; // Very old context heavily penalized
  }

  // 2. USAGE PENALTY - Recently used context gets lower priority
  if (item.lastUsedTimestamp) {
    const timeSinceLastUse = now - item.lastUsedTimestamp;
    const minutesSinceLastUse = timeSinceLastUse / (1000 * 60);
    
    if (minutesSinceLastUse < 2) {
      usagePenalty = -30; // Just used, probably not needed again immediately
    } else if (minutesSinceLastUse < 5) {
      usagePenalty = -20;
    } else if (minutesSinceLastUse < 15) {
      usagePenalty = -10;
    }
    
    // Heavy usage penalty (sent many times already)
    const usageCount = item.usageCount || 0;
    if (usageCount > 5) {
      usagePenalty -= 15;
    } else if (usageCount > 3) {
      usagePenalty -= 10;
    } else if (usageCount > 1) {
      usagePenalty -= 5;
    }
  }

  // 3. TYPE RELEVANCE based on query
  if (queryLower.includes('error') || queryLower.includes('fail') || queryLower.includes('fix')) {
    if (metadata?.exitCode && metadata.exitCode !== 0) typeRelevance += 35;
    if (item.type === 'output' || item.type === 'command_output') typeRelevance += 20;
  }

  if (queryLower.includes('file') || queryLower.includes('code')) {
    if (item.type === 'file') typeRelevance += 25;
  }

  if (queryLower.includes('command') || queryLower.includes('ran')) {
    if (item.type === 'command' || metadata?.command) typeRelevance += 25;
  }

  // 4. QUERY TERM MATCHING
  let termMatches = 0;
  for (const term of queryTerms) {
    if (content.includes(term)) {
      termMatches++;
      queryMatch += 12;
    }
    if (metadata?.command?.toLowerCase().includes(term)) {
      termMatches++;
      queryMatch += 18;
    }
    if (metadata?.path?.toLowerCase().includes(term)) {
      termMatches++;
      queryMatch += 12;
    }
  }

  // Boost if multiple terms match
  if (termMatches > 1) {
    queryMatch += termMatches * 8;
  }

  // 5. CONVERSATION RELEVANCE - based on recent topics
  if (scoringContext?.recentMessageTopics) {
    for (const topic of scoringContext.recentMessageTopics) {
      if (content.includes(topic.toLowerCase())) {
        conversationRelevance += 10;
      }
      if (metadata?.command?.toLowerCase().includes(topic.toLowerCase())) {
        conversationRelevance += 15;
      }
    }
  }

  // 6. SPECIAL BOOSTS
  // Explicit inclusion boost
  if (item.metadata?.includeMode === 'always') {
    conversationRelevance += 50;
  }

  // Error context is usually important
  if (content.includes('error') || content.includes('fail')) {
    typeRelevance += 15;
  }

  // 7. SIZE PENALTY for very large items (prefer concise context)
  const contentLength = item.content.length;
  if (contentLength > 10000) timeDecay -= 10;
  else if (contentLength > 5000) timeDecay -= 5;

  const total = Math.min(100, Math.max(0, 
    recency + queryMatch + typeRelevance + usagePenalty + timeDecay + conversationRelevance
  ));

  return {
    total,
    recency,
    queryMatch,
    typeRelevance,
    usagePenalty,
    timeDecay,
    conversationRelevance,
  };
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
function explainRelevance(_item: ContextItem, score: number, breakdown?: RelevanceBreakdown): string {
  const parts: string[] = [];
  
  if (score >= 70) parts.push('Highly relevant');
  else if (score >= 50) parts.push('Relevant');
  else if (score >= 30) parts.push('Possibly relevant');
  else parts.push('Low relevance');
  
  if (breakdown) {
    const details: string[] = [];
    if (breakdown.recency > 15) details.push('recent');
    if (breakdown.queryMatch > 20) details.push('matches query');
    if (breakdown.usagePenalty < -15) details.push('recently used');
    if (breakdown.timeDecay < -15) details.push('stale');
    if (breakdown.conversationRelevance > 15) details.push('conversation-related');
    
    if (details.length > 0) {
      parts.push(`(${details.join(', ')})`);
    }
  }
  
  return parts.join(' ');
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
