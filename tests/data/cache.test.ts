import { describe, it, expect, vi, beforeEach } from "vitest";
import { Cache } from "../../src/data/cache.js";

describe("Cache", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
  });

  it("stores and retrieves a value", () => {
    cache.set("key1", { foo: "bar" }, 10_000);
    expect(cache.get<{ foo: string }>("key1")).toEqual({ foo: "bar" });
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("returns undefined after TTL expires", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    cache.set("key", "value", 1000);
    expect(cache.get("key")).toBe("value");

    // Advance time past TTL
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);
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
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    cache.set("key", "v", 500);
    vi.spyOn(Date, "now").mockReturnValue(now + 1000);
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

  it("size() counts only non-expired entries", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 10_000);
    expect(cache.size()).toBe(2);
    vi.spyOn(Date, "now").mockReturnValue(now + 2000);
    expect(cache.size()).toBe(1);
  });

  it("overwrites existing key with new value and TTL", () => {
    cache.set("key", "first", 10_000);
    cache.set("key", "second", 10_000);
    expect(cache.get("key")).toBe("second");
  });

  it("stores different types correctly", () => {
    cache.set("num", 42, 10_000);
    cache.set("arr", [1, 2, 3], 10_000);
    cache.set("obj", { nested: { deep: true } }, 10_000);
    expect(cache.get<number>("num")).toBe(42);
    expect(cache.get<number[]>("arr")).toEqual([1, 2, 3]);
    expect(cache.get<object>("obj")).toEqual({ nested: { deep: true } });
  });
});
