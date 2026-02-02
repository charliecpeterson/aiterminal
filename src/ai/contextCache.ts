/**
 * Context Formatting Cache
 * 
 * Caches formatted context to avoid redundant processing on every AI request.
 * Invalidates cache when context items change.
 */

import type { ContextItem } from '../context/AIContext';
import type { RankedContext } from './contextRanker';
import { LRUCache } from '../utils/cache';
import { createLogger } from '../utils/logger';

const log = createLogger('ContextCache');

interface CacheValue {
  ranked: RankedContext[];
  formatted: string[];
  tokenCount: number;
}

const CACHE_MAX_AGE_MS = 30000; // 30 seconds
const CACHE_MAX_SIZE = 10;

// Use LRUCache with composite key (fingerprint:query)
const cache = new LRUCache<string, CacheValue>({
  maxSize: CACHE_MAX_SIZE,
  maxAgeMs: CACHE_MAX_AGE_MS,
  onEvict: (key, _value, reason) => {
    log.debug('Cache entry evicted', { key: key.substring(0, 50), reason });
  },
});

/**
 * Generate a fingerprint for the current context state
 */
export function generateContextFingerprint(items: ContextItem[]): string {
  if (items.length === 0) return 'empty';
  
  // Create a hash based on IDs and timestamps
  // This detects when items are added, removed, or modified
  const ids = items.map(item => item.id).sort().join(',');
  const timestamps = items.map(item => item.timestamp).join(',');
  
  return `${ids}:${timestamps}`;
}

/**
 * Generate cache key from fingerprint and query
 */
function getCacheKey(fingerprint: string, query: string): string {
  return `${fingerprint}||${query}`;
}

/**
 * Get cached formatted context if available
 */
export function getCachedContext(
  contextItems: ContextItem[],
  query: string
): { ranked: RankedContext[]; formatted: string[]; tokenCount: number } | null {
  const fingerprint = generateContextFingerprint(contextItems);
  const key = getCacheKey(fingerprint, query);
  
  const entry = cache.get(key);
  
  if (!entry) return null;
  
  log.debug('Cache hit', {
    fingerprint: fingerprint.substring(0, 50),
    itemCount: contextItems.length,
  });
  
  return entry;
}

/**
 * Cache formatted context for reuse
 */
export function setCachedContext(
  contextItems: ContextItem[],
  query: string,
  ranked: RankedContext[],
  formatted: string[],
  tokenCount: number
): void {
  const fingerprint = generateContextFingerprint(contextItems);
  const key = getCacheKey(fingerprint, query);
  
  cache.set(key, { ranked, formatted, tokenCount });
  
  log.debug('Cache set', {
    fingerprint: fingerprint.substring(0, 50),
    itemCount: contextItems.length,
    formattedCount: formatted.length,
    tokenCount,
  });
}

/**
 * Invalidate all cache entries
 */
export function invalidateContextCache(): void {
  cache.clear();
  log.debug('Cache invalidated');
}

/**
 * Get cache statistics
 */
export function getContextCacheStats(): {
  entries: number;
  oldestAge: number;
  newestAge: number;
} {
  const stats = cache.getStats();
  return {
    entries: stats.size,
    oldestAge: stats.oldestAgeMs,
    newestAge: stats.newestAgeMs,
  };
}
