/**
 * In-memory cache with per-key TTL.
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Store a value with a TTL in milliseconds.
   * Setting TTL <= 0 causes the entry to be considered immediately expired.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : 0;
    this.store.set(key, { value, expiresAt });
  }

  /**
   * Retrieve a value. Returns undefined if not found or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Remove all entries from the cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Return the number of entries (including potentially expired ones).
   */
  size(): number {
    return this.store.size;
  }
}

/** Singleton cache instance for the application */
export const cache = new Cache();
