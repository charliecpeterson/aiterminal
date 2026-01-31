/**
 * Smart context ranking and filtering
 * Prevents dumping all context and selects most relevant items
 */

import type { ContextItem } from '../context/AIContext';
import type { ChatMessage } from '../context/AIContext';
import { createLogger } from '../utils/logger';

const log = createLogger('ContextRanker');

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
    conversationMemory: number;
  };
}

interface ScoringContext {
  recentMessageTopics?: string[];
  currentMessageId?: string;
  recentMessages?: ChatMessage[]; // For conversation memory tracking
  mode?: 'chat' | 'agent'; // AI mode for mode-specific scoring
}

interface RelevanceBreakdown {
  recency: number;
  queryMatch: number;
  typeRelevance: number;
  usagePenalty: number;
  timeDecay: number;
  conversationRelevance: number;
  conversationMemory: number;
  total: number;
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
        conversationMemory: breakdown.conversationMemory,
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
  conversationMemory: number;
} {
  let recency = 0;
  let queryMatch = 0;
  let typeRelevance = 0;
  let usagePenalty = 0;
  let timeDecay = 0;
  let conversationRelevance = 0;
  let conversationMemory = 0;

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

  // 2B. CONVERSATION MEMORY - Heavily penalize context already sent to AI
  // This is the KEY optimization - prevents redundant context from being re-sent
  if (item.lastUsedInMessageId && scoringContext?.recentMessages) {
    const messages = scoringContext.recentMessages;
    
    // Find how many messages ago this context was sent
    let messagesSinceUsed = 0;
    let foundUsage = false;
    
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === item.lastUsedInMessageId) {
        foundUsage = true;
        break;
      }
      if (messages[i].role === 'user' || messages[i].role === 'assistant') {
        messagesSinceUsed++;
      }
    }
    
    if (foundUsage) {
      // AI already saw this context recently in the conversation
      if (messagesSinceUsed === 0) {
        // Sent in the LAST message - AI definitely remembers
        conversationMemory = -50; // Very heavy penalty
      } else if (messagesSinceUsed <= 2) {
        // Sent 1-2 messages ago - AI likely remembers
        conversationMemory = -40;
      } else if (messagesSinceUsed <= 5) {
        // Sent 3-5 messages ago - AI probably remembers
        conversationMemory = -25;
      } else if (messagesSinceUsed <= 10) {
        // Sent 6-10 messages ago - AI might remember
        conversationMemory = -15;
      } else {
        // Sent >10 messages ago - AI might have forgotten
        conversationMemory = -5;
      }
      
      // Exception: If query is highly relevant (lots of term matches), reduce penalty
      // The user is asking specifically about this context, so resend it
      const queryRelevanceThreshold = 30;
      if (queryMatch > queryRelevanceThreshold) {
        conversationMemory = Math.floor(conversationMemory * 0.5); // Cut penalty in half
      }
      
      // Debug logging
      const displayName = item.metadata?.path || item.id.substring(0, 40);
      log.debug(`Conversation memory: context "${displayName}" was sent ${messagesSinceUsed} messages ago`, {
        itemId: item.id,
        messagesSinceUsed,
        penalty: conversationMemory,
        queryMatch,
        queryRelevanceOverride: queryMatch > queryRelevanceThreshold
      });
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

  // 8. MODE-SPECIFIC ADJUSTMENTS
  // Chat mode: Be more inclusive, boost recent context
  // Agent mode: Be more selective, agent can fetch files as needed
  let modeBonus = 0;
  if (scoringContext?.mode === 'chat') {
    // Chat mode: Front-load context
    // Boost recency bonus to include more recent context
    if (recency > 15) modeBonus += 5; // Boost already-relevant recent items
    // Reduce conversation memory penalty slightly (chat needs more context upfront)
    if (conversationMemory < 0) {
      conversationMemory = Math.floor(conversationMemory * 0.8); // Reduce penalty by 20%
    }
  } else if (scoringContext?.mode === 'agent') {
    // Agent mode: Just-in-time context
    // Boost query match to be even more selective (only send highly relevant)
    if (queryMatch > 25) modeBonus += 5; // Only boost items with strong query match
    // Keep conversation memory penalties strong (agent can fetch via tools)
  }

  const total = Math.min(100, Math.max(0, 
    recency + queryMatch + typeRelevance + usagePenalty + timeDecay + conversationRelevance + conversationMemory + modeBonus
  ));

  // Debug: Log significant conversation memory penalties
  if (conversationMemory < -20) {
    const displayName = item.metadata?.path || item.id.substring(0, 40);
    log.debug(`Heavy conversation memory penalty for "${displayName}"`, {
      itemId: item.id,
      finalScore: total,
      breakdown: {
        recency,
        queryMatch,
        typeRelevance,
        usagePenalty,
        timeDecay,
        conversationRelevance,
        conversationMemory
      }
    });
  }

  return {
    total,
    recency,
    queryMatch,
    typeRelevance,
    usagePenalty,
    timeDecay,
    conversationRelevance,
    conversationMemory,
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
