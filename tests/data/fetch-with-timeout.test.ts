import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout, FetchTimeoutError } from "../../src/data/fetch-with-timeout.js";

describe("FetchTimeoutError", () => {
  it("has correct name and message", () => {
    const err = new FetchTimeoutError("https://example.com/api", 15000);
    expect(err.name).toBe("FetchTimeoutError");
    expect(err.message).toContain("https://example.com/api");
    expect(err.message).toContain("15s");
  });

  it("is an instance of Error", () => {
    const err = new FetchTimeoutError("http://x.com", 5000);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("withTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves when promise resolves before timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1000, "http://x.com");
    expect(result).toBe("ok");
  });

  it("rejects with original error when promise rejects before timeout", async () => {
    const err = new Error("network failure");
    await expect(withTimeout(Promise.reject(err), 1000, "http://x.com")).rejects.toThrow(
      "network failure",
    );
  });

  it("rejects with FetchTimeoutError when promise takes too long", async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise(() => {});
    const promise = withTimeout(neverResolves, 5000, "http://slow.com/data");

    vi.advanceTimersByTime(5000);

    await expect(promise).rejects.toThrow(FetchTimeoutError);
    await expect(promise).rejects.toThrow("http://slow.com/data");
  });

  it("clears timeout when promise resolves quickly", async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");

    const promise = withTimeout(Promise.resolve(42), 10000, "http://x.com");
    await promise;

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
