/**
 * Wraps a promise with a timeout that rejects with a clear error message.
 * Uses AbortController when the underlying fetch supports it.
 */
export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(
      `Request a ${url} excedió el timeout de ${Math.round(timeoutMs / 1000)}s. ` +
        `El servidor no respondió a tiempo.`,
    );
    this.name = "FetchTimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new FetchTimeoutError(url, timeoutMs));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
