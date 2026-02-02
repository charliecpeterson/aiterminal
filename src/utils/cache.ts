/**
 * Generic LRU (Least Recently Used) Cache Utility
 * 
 * Consolidates cache patterns used throughout the codebase:
 * - TTL-based expiration
 * - Max size with LRU eviction
 * - Optional eviction callbacks
 * 
 * @example
 * const cache = new LRUCache<string, User>({ maxSize: 100, maxAgeMs: 60000 });
 * cache.set('user:1', { name: 'Alice' });
 * const user = cache.get('user:1'); // Returns User or undefined
 */

export interface LRUCacheOptions<K, V> {
  /** Maximum number of entries in the cache */
  maxSize: number;
  /** Maximum age of entries in milliseconds (0 = no expiration) */
  maxAgeMs: number;
  /** Optional callback when an entry is evicted */
  onEvict?: (key: K, value: V, reason: 'expired' | 'size' | 'manual') => void;
}

interface CacheEntry<V> {
  value: V;
  timestamp: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, CacheEntry<V>>;
  private readonly maxSize: number;
  private readonly maxAgeMs: number;
  private readonly onEvict?: LRUCacheOptions<K, V>['onEvict'];

  constructor(options: LRUCacheOptions<K, V>) {
    this.cache = new Map();
    this.maxSize = options.maxSize;
    this.maxAgeMs = options.maxAgeMs;
    this.onEvict = options.onEvict;
  }

  /**
   * Get a value from the cache.
   * Returns undefined if not found or expired.
   * Accessing an entry moves it to the front (most recently used).
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (this.maxAgeMs > 0 && Date.now() - entry.timestamp > this.maxAgeMs) {
      this.delete(key, 'expired');
      return undefined;
    }

    // Move to front (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in the cache.
   * If the cache is at max capacity, evicts the least recently used entry.
   */
  set(key: K, value: V): void {
    // Remove existing entry if present (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey, 'size');
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.maxAgeMs > 0 && Date.now() - entry.timestamp > this.maxAgeMs) {
      this.delete(key, 'expired');
      return false;
    }
    
    return true;
  }

  /**
   * Delete an entry from the cache.
   */
  delete(key: K, reason: 'expired' | 'size' | 'manual' = 'manual'): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.onEvict?.(key, entry.value, reason);
    return true;
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache.entries()) {
        this.onEvict(key, entry.value, 'manual');
      }
    }
    this.cache.clear();
  }

  /**
   * Get the number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxSize: number; oldestAgeMs: number; newestAgeMs: number } {
    const now = Date.now();
    let oldestAgeMs = 0;
    let newestAgeMs = Infinity;

    for (const entry of this.cache.values()) {
      const age = now - entry.timestamp;
      if (age > oldestAgeMs) oldestAgeMs = age;
      if (age < newestAgeMs) newestAgeMs = age;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      oldestAgeMs: this.cache.size > 0 ? oldestAgeMs : 0,
      newestAgeMs: this.cache.size > 0 ? newestAgeMs : 0,
    };
  }

  /**
   * Iterate over all non-expired entries.
   * Note: Does not affect LRU ordering.
   */
  *entries(): IterableIterator<[K, V]> {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (this.maxAgeMs > 0 && now - entry.timestamp > this.maxAgeMs) {
        continue; // Skip expired entries
      }
      yield [key, entry.value];
    }
  }

  /**
   * Remove all expired entries.
   * Call periodically if you have a long-lived cache with TTL.
   */
  prune(): number {
    if (this.maxAgeMs === 0) return 0;
    
    const now = Date.now();
    let pruned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAgeMs) {
        this.delete(key, 'expired');
        pruned++;
      }
    }
    
    return pruned;
  }
}

/**
 * Simple TTL cache for single values (like the conversation summary cache).
 * Useful when you only need to cache one value with expiration.
 */
export class SingleValueCache<V> {
  private value: V | undefined;
  private timestamp: number = 0;
  private readonly maxAgeMs: number;

  constructor(maxAgeMs: number) {
    this.maxAgeMs = maxAgeMs;
  }

  get(): V | undefined {
    if (!this.value) return undefined;
    
    if (this.maxAgeMs > 0 && Date.now() - this.timestamp > this.maxAgeMs) {
      this.value = undefined;
      return undefined;
    }
    
    return this.value;
  }

  set(value: V): void {
    this.value = value;
    this.timestamp = Date.now();
  }

  clear(): void {
    this.value = undefined;
    this.timestamp = 0;
  }

  isValid(): boolean {
    if (!this.value) return false;
    if (this.maxAgeMs > 0 && Date.now() - this.timestamp > this.maxAgeMs) {
      return false;
    }
    return true;
  }

  getAge(): number {
    return this.value ? Date.now() - this.timestamp : 0;
  }
}
