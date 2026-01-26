/**
 * Context Formatting Cache
 * 
 * Caches formatted context to avoid redundant processing on every AI request.
 * Invalidates cache when context items change.
 */

import type { ContextItem } from '../context/AIContext';
import type { RankedContext } from './contextRanker';

interface CacheEntry {
  contextFingerprint: string;
  query: string;
  ranked: RankedContext[];
  formatted: string[];
  timestamp: number;
  tokenCount: number;
}

const CACHE_MAX_AGE_MS = 30000; // 30 seconds
const CACHE_MAX_SIZE = 10;

const cache: CacheEntry[] = [];

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
 * Get cached formatted context if available
 */
export function getCachedContext(
  contextItems: ContextItem[],
  query: string
): { ranked: RankedContext[]; formatted: string[]; tokenCount: number } | null {
  const fingerprint = generateContextFingerprint(contextItems);
  
  // Find matching cache entry
  const entry = cache.find(
    e => e.contextFingerprint === fingerprint && e.query === query
  );
  
  if (!entry) return null;
  
  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_MAX_AGE_MS) {
    // Remove expired entry
    const index = cache.indexOf(entry);
    if (index > -1) cache.splice(index, 1);
    return null;
  }
  
  console.log('[Context Cache] Hit', {
    fingerprint,
    itemCount: contextItems.length,
    age: Date.now() - entry.timestamp,
  });
  
  return {
    ranked: entry.ranked,
    formatted: entry.formatted,
    tokenCount: entry.tokenCount,
  };
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
  
  // Remove any existing entry for this fingerprint+query
  const existingIndex = cache.findIndex(
    e => e.contextFingerprint === fingerprint && e.query === query
  );
  if (existingIndex > -1) {
    cache.splice(existingIndex, 1);
  }
  
  // Add new entry
  cache.unshift({
    contextFingerprint: fingerprint,
    query,
    ranked,
    formatted,
    timestamp: Date.now(),
    tokenCount,
  });
  
  // Evict oldest entries if cache is full
  while (cache.length > CACHE_MAX_SIZE) {
    cache.pop();
  }
  
  console.log('[Context Cache] Set', {
    fingerprint,
    itemCount: contextItems.length,
    formattedCount: formatted.length,
    tokenCount,
  });
}

/**
 * Invalidate all cache entries
 */
export function invalidateContextCache(): void {
  cache.length = 0;
  console.log('[Context Cache] Invalidated');
}

/**
 * Get cache statistics
 */
export function getContextCacheStats(): {
  entries: number;
  oldestAge: number;
  newestAge: number;
} {
  if (cache.length === 0) {
    return { entries: 0, oldestAge: 0, newestAge: 0 };
  }
  
  const now = Date.now();
  const ages = cache.map(e => now - e.timestamp);
  
  return {
    entries: cache.length,
    oldestAge: Math.max(...ages),
    newestAge: Math.min(...ages),
  };
}
