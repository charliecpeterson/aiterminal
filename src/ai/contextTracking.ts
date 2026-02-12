/**
 * Context usage tracking
 * Tracks when context items are used in messages to improve relevance scoring
 */

import type { ContextItem, ChatMessage } from '../context/AIContext';

/**
 * Mark context items as used in a message
 */
export function markContextAsUsed(
  contextItems: ContextItem[],
  usedContextIds: string[],
  messageId: string,
  timestamp: number
): ContextItem[] {
  const usedSet = new Set(usedContextIds);
  return contextItems.map(item => {
    if (usedSet.has(item.id)) {
      return {
        ...item,
        lastUsedInMessageId: messageId,
        lastUsedTimestamp: timestamp,
        usageCount: (item.usageCount || 0) + 1,
      };
    }
    return item;
  });
}

/**
 * Extract topics from recent messages for conversation relevance
 */
export function extractRecentTopics(messages: ChatMessage[], limit: number = 3): string[] {
  const topics = new Set<string>();
  
  // Look at last N messages
  const recentMessages = messages.slice(-limit);
  
  for (const msg of recentMessages) {
    if (msg.role === 'user') {
      // Extract key terms from user queries
      const words = msg.content.toLowerCase().split(/\s+/);
      const keyWords = words.filter((w: string) => 
        w.length > 4 && !isStopWord(w)
      );
      keyWords.forEach((w: string) => topics.add(w));
    }
  }
  
  return Array.from(topics).slice(0, 10);
}

const STOP_WORDS = new Set([
  'about', 'after', 'before', 'could', 'should', 'would',
  'there', 'their', 'these', 'those', 'which', 'while',
  'please', 'thanks', 'hello'
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

/**
 * Get stale context items (older than threshold and not recently used)
 */
export function getStaleContext(
  contextItems: ContextItem[],
  ageThresholdMinutes: number = 180 // 3 hours
): ContextItem[] {
  const now = Date.now();
  const threshold = ageThresholdMinutes * 60 * 1000;
  
  return contextItems.filter(item => {
    const age = now - item.timestamp;
    const timeSinceLastUse = item.lastUsedTimestamp 
      ? now - item.lastUsedTimestamp 
      : age;
    
    // Stale if old AND not recently used
    return age > threshold && timeSinceLastUse > (30 * 60 * 1000);
  });
}
