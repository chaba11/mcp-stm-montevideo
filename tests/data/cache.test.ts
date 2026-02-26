import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Cache } from "../../src/data/cache.js";

describe("Cache", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Happy path ───────────────────────────────────────────────────────────────

  it("set/get returns correct value", () => {
    cache.set("key1", { foo: "bar" }, 10_000);
    expect(cache.get<{ foo: string }>("key1")).toEqual({ foo: "bar" });
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("TTL not expired: value persists before TTL", () => {
    cache.set("key", "value", 5_000);
    vi.advanceTimersByTime(4_999);
    expect(cache.get("key")).toBe("value");
  });

  it("TTL expiry: value disappears after TTL", () => {
    cache.set("key", "value", 1_000);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("key")).toBeUndefined();
  });

  it("has() returns true for existing non-expired key", () => {
    cache.set("key", 42, 10_000);
    expect(cache.has("key")).toBe(true);
  });

  it("has() returns false for missing key", () => {
    expect(cache.has("missing")).toBe(false);
  });

  it("has() returns false for expired key", () => {
    cache.set("key", "v", 500);
    vi.advanceTimersByTime(600);
    expect(cache.has("key")).toBe(false);
  });

  it("clear() removes all entries", () => {
    cache.set("a", 1, 10_000);
    cache.set("b", 2, 10_000);
    cache.clear();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("delete() removes a specific key", () => {
    cache.set("a", 1, 10_000);
    cache.set("b", 2, 10_000);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });

  it("overwrite: setting same key overwrites value and resets TTL", () => {
    cache.set("key", "first", 1_000);
    vi.advanceTimersByTime(800);
    cache.set("key", "second", 1_000); // reset TTL
    vi.advanceTimersByTime(800); // 800ms after reset (600ms into old TTL)
    expect(cache.get("key")).toBe("second");
  });

  it("size() counts only non-expired entries", () => {
    cache.set("a", 1, 1_000);
    cache.set("b", 2, 10_000);
    expect(cache.size()).toBe(2);
    vi.advanceTimersByTime(2_000);
    expect(cache.size()).toBe(1);
  });

  it("stores different types correctly", () => {
    cache.set("num", 42, 10_000);
    cache.set("arr", [1, 2, 3], 10_000);
    cache.set("obj", { nested: { deep: true } }, 10_000);
    expect(cache.get<number>("num")).toBe(42);
    expect(cache.get<number[]>("arr")).toEqual([1, 2, 3]);
    expect(cache.get<object>("obj")).toEqual({ nested: { deep: true } });
  });

  // ── Different TTLs ──────────────────────────────────────────────────────────

  it("two keys with different TTLs expire independently", () => {
    cache.set("short", "s", 1_000);
    cache.set("long", "l", 5_000);
    vi.advanceTimersByTime(2_000);
    expect(cache.get("short")).toBeUndefined();
    expect(cache.get("long")).toBe("l");
    vi.advanceTimersByTime(4_000);
    expect(cache.get("long")).toBeUndefined();
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it("edge: storing null value", () => {
    cache.set("nullKey", null, 10_000);
    // null is stored and returned as null (not undefined)
    expect(cache.get("nullKey")).toBeNull();
  });

  it("edge: storing false value", () => {
    cache.set("falseKey", false, 10_000);
    expect(cache.get("falseKey")).toBe(false);
  });

  it("edge: storing empty string", () => {
    cache.set("emptyStr", "", 10_000);
    expect(cache.get("emptyStr")).toBe("");
  });

  it("edge: storing zero", () => {
    cache.set("zero", 0, 10_000);
    expect(cache.get("zero")).toBe(0);
  });

  it("edge: zero TTL should expire immediately", () => {
    cache.set("key", "value", 0);
    vi.advanceTimersByTime(1);
    expect(cache.get("key")).toBeUndefined();
  });

  it("edge: negative TTL should treat as expired", () => {
    cache.set("key", "value", -1000);
    expect(cache.get("key")).toBeUndefined();
  });

  it("edge: very large TTL does not overflow", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    cache.set("key", "value", huge);
    expect(cache.get("key")).toBe("value");
  });

  it("edge: special characters in key (spaces, unicode, emojis)", () => {
    cache.set("key with spaces", "a", 10_000);
    cache.set("clave_española_ñú", "b", 10_000);
    cache.set("🚌🇺🇾", "c", 10_000);
    expect(cache.get("key with spaces")).toBe("a");
    expect(cache.get("clave_española_ñú")).toBe("b");
    expect(cache.get("🚌🇺🇾")).toBe("c");
  });

  it("edge: rapid concurrent get/set on same key", () => {
    for (let i = 0; i < 100; i++) {
      cache.set("key", i, 10_000);
      expect(cache.get("key")).toBe(i);
    }
  });

  it("edge: deleting a non-existent key does not throw", () => {
    expect(() => cache.delete("does-not-exist")).not.toThrow();
  });
});
