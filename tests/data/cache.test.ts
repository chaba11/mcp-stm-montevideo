import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Cache } from '../../src/data/cache.js';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('set/get', () => {
    it('stores and retrieves a string value', () => {
      cache.set('key1', 'hello', 60_000);
      expect(cache.get<string>('key1')).toBe('hello');
    });

    it('stores and retrieves an object', () => {
      const obj = { a: 1, b: 'two' };
      cache.set('obj', obj, 60_000);
      expect(cache.get<typeof obj>('obj')).toEqual(obj);
    });

    it('returns undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('stores null explicitly', () => {
      cache.set('nullKey', null, 60_000);
      expect(cache.get('nullKey')).toBeNull();
    });

    it('stores empty string', () => {
      cache.set('emptyStr', '', 60_000);
      expect(cache.get<string>('emptyStr')).toBe('');
    });

    it('stores arrays', () => {
      cache.set('arr', [1, 2, 3], 60_000);
      expect(cache.get<number[]>('arr')).toEqual([1, 2, 3]);
    });
  });

  describe('TTL expiry', () => {
    it('returns value before TTL expires', () => {
      cache.set('k', 'val', 5_000);
      vi.advanceTimersByTime(4_999);
      expect(cache.get<string>('k')).toBe('val');
    });

    it('returns undefined after TTL expires', () => {
      cache.set('k', 'val', 5_000);
      vi.advanceTimersByTime(5_001);
      expect(cache.get<string>('k')).toBeUndefined();
    });

    it('expires exactly at TTL boundary', () => {
      cache.set('k', 'val', 1_000);
      vi.advanceTimersByTime(1_001);
      expect(cache.get<string>('k')).toBeUndefined();
    });

    it('zero TTL expires immediately', () => {
      cache.set('k', 'val', 0);
      expect(cache.get<string>('k')).toBeUndefined();
    });

    it('negative TTL expires immediately', () => {
      cache.set('k', 'val', -1000);
      expect(cache.get<string>('k')).toBeUndefined();
    });

    it('different keys have independent TTLs', () => {
      cache.set('fast', 'a', 1_000);
      cache.set('slow', 'b', 10_000);
      vi.advanceTimersByTime(2_000);
      expect(cache.get<string>('fast')).toBeUndefined();
      expect(cache.get<string>('slow')).toBe('b');
    });
  });

  describe('overwrite', () => {
    it('overwriting resets the value', () => {
      cache.set('k', 'old', 60_000);
      cache.set('k', 'new', 60_000);
      expect(cache.get<string>('k')).toBe('new');
    });

    it('overwriting resets the TTL', () => {
      cache.set('k', 'first', 2_000);
      vi.advanceTimersByTime(1_500);
      // Override with fresh TTL
      cache.set('k', 'second', 2_000);
      vi.advanceTimersByTime(1_500); // 3s total, but only 1.5s since re-set
      expect(cache.get<string>('k')).toBe('second');
    });
  });

  describe('has()', () => {
    it('returns true for existing non-expired key', () => {
      cache.set('k', 'v', 60_000);
      expect(cache.has('k')).toBe(true);
    });

    it('returns false for missing key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('returns false after expiry', () => {
      cache.set('k', 'v', 1_000);
      vi.advanceTimersByTime(1_001);
      expect(cache.has('k')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all entries', () => {
      cache.set('k1', 'v1', 60_000);
      cache.set('k2', 'v2', 60_000);
      cache.clear();
      expect(cache.get('k1')).toBeUndefined();
      expect(cache.get('k2')).toBeUndefined();
    });

    it('cache is usable after clear', () => {
      cache.set('k', 'v', 60_000);
      cache.clear();
      cache.set('k', 'new', 60_000);
      expect(cache.get('k')).toBe('new');
    });
  });

  describe('edge cases', () => {
    it('handles keys with spaces', () => {
      cache.set('key with spaces', 'val', 60_000);
      expect(cache.get<string>('key with spaces')).toBe('val');
    });

    it('handles keys with special characters', () => {
      cache.set('key:with:colons/and/slashes', 'val', 60_000);
      expect(cache.get<string>('key:with:colons/and/slashes')).toBe('val');
    });

    it('handles keys with unicode', () => {
      cache.set('clave:ñ:á:é', 'valor', 60_000);
      expect(cache.get<string>('clave:ñ:á:é')).toBe('valor');
    });

    it('handles concurrent rapid set/get on same key', () => {
      // Simulate many rapid operations
      for (let i = 0; i < 100; i++) {
        cache.set('k', i, 60_000);
        expect(cache.get<number>('k')).toBe(i);
      }
    });

    it('very large TTL does not overflow', () => {
      cache.set('k', 'val', Number.MAX_SAFE_INTEGER);
      expect(cache.get<string>('k')).toBe('val');
    });
  });
});
