import type { FetchFn } from "../../src/data/ckan-client.js";

export interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

function makeResponse(ok: boolean, status: number, body: string | Buffer) {
  return {
    ok,
    status,
    async arrayBuffer(): Promise<ArrayBuffer> {
      const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    },
    async text(): Promise<string> {
      return typeof body === "string" ? body : body.toString("utf-8");
    },
  };
}

type UrlHandler = (url: string) => ReturnType<typeof makeResponse>;

function buildFetch(handlers: UrlHandler[]): FetchFn {
  return async (url: string) => {
    for (const handler of handlers) {
      const result = handler(url);
      if (result) return result;
    }
    throw new Error(`Unhandled fetch URL: ${url}`);
  };
}

/** Mock a CKAN package_show response */
export function mockCkanResponse(packageId: string, resources: CkanResource[]): UrlHandler {
  return (url) => {
    if (!url.includes("package_show") || !url.includes(packageId)) return null as never;
    const body = JSON.stringify({ success: true, result: { resources } });
    return makeResponse(true, 200, body);
  };
}

/** Mock any package_show response (for tests that don't care about the package) */
export function mockAnyPackageResponse(resources: CkanResource[]): UrlHandler {
  return (url) => {
    if (!url.includes("package_show")) return null as never;
    const body = JSON.stringify({ success: true, result: { resources } });
    return makeResponse(true, 200, body);
  };
}

/** Mock a CSV download at the given URL substring */
export function mockCsvDownload(urlSubstring: string, csvContent: string | Buffer): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    return makeResponse(true, 200, csvContent);
  };
}

/** Mock a binary file download (e.g., ZIP) */
export function mockBinaryDownload(urlSubstring: string, content: Buffer): UrlHandler {
  return mockCsvDownload(urlSubstring, content);
}

/** Simulate a network error for a URL */
export function mockNetworkError(urlSubstring: string): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    throw new Error("Network error: connection refused");
  };
}

/** Simulate an HTTP 500 error */
export function mockServerError(urlSubstring: string): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    return makeResponse(false, 500, "Internal Server Error");
  };
}

/** Simulate a 404 not found */
export function mockNotFound(urlSubstring: string): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    return makeResponse(false, 404, "Not Found");
  };
}

/** Mock a generar_zip2.php response that returns HTML with a form redirect */
export function mockGenerarZipResponse(urlSubstring: string, actionPath: string): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    // Matches real generar_zip2.php output: unquoted action, spaces around =
    const html = `<!-- Generador de archivos descargables -->\nPor favor aguarde...<b>Listo</b><br><body onload='cargar()'>Descargando...<form name=formito action = '${actionPath}'></form></body>`;
    return makeResponse(true, 200, html);
  };
}

/** Mock a generar_zip2.php response with invalid HTML (no form action) */
export function mockGenerarZipBadHtml(urlSubstring: string): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    return makeResponse(true, 200, "<html><body>Error generating file</body></html>");
  };
}

/** Simulate a slow/timeout response */
export function mockTimeout(urlSubstring: string, delayMs: number): UrlHandler {
  return (url) => {
    if (!url.includes(urlSubstring)) return null as never;
    const timedOut = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${delayMs}ms`)), delayMs)
    );
    return {
      ok: false,
      status: 0,
      arrayBuffer: () => timedOut,
      text: () => timedOut,
    };
  };
}

/** Compose multiple handlers into a single FetchFn */
export function composeFetch(...handlers: UrlHandler[]): FetchFn {
  return buildFetch(handlers);
}
