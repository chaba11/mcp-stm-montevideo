import { vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

export function readFixture(filename: string): string {
  return readFileSync(join(FIXTURES_DIR, filename), 'utf-8');
}

export function readFixtureBinary(filename: string): Buffer {
  return readFileSync(join(FIXTURES_DIR, filename));
}

interface MockResponseConfig {
  status?: number;
  body?: string | Buffer;
  contentType?: string;
  delay?: number;
}

function createMockResponse(config: MockResponseConfig): Response {
  const { status = 200, body = '', contentType = 'text/plain' } = config;
  const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => (name === 'content-type' ? contentType : null),
    },
    text: async () => bodyStr,
    json: async () => JSON.parse(bodyStr),
  } as unknown as Response;
}

/**
 * Mock a CKAN package_show response.
 */
export function mockCkanPackageShow(
  packageId: string,
  resources: Array<{ id: string; name: string; url: string; format?: string }>
): void {
  const responseBody = JSON.stringify({
    success: true,
    result: {
      id: packageId,
      resources: resources.map((r) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        format: r.format ?? 'CSV',
      })),
    },
  });

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('package_show')) {
        return createMockResponse({ body: responseBody, contentType: 'application/json' });
      }
      throw new Error(`Unexpected fetch call to: ${url}`);
    })
  );
}

/**
 * Mock fetch to return CSV content for a given URL.
 */
export function mockCsvDownload(csvUrl: string, csvContent: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url === csvUrl) {
        return createMockResponse({ body: csvContent, contentType: 'text/plain' });
      }
      throw new Error(`Unexpected fetch call to: ${url}`);
    })
  );
}

/**
 * Mock both CKAN package_show and a CSV download in sequence.
 */
export function mockCkanAndCsv(
  packageId: string,
  resources: Array<{ id: string; name: string; url: string; format?: string }>,
  csvResponses: Record<string, string>
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('package_show') && url.includes(encodeURIComponent(packageId))) {
        return createMockResponse({
          body: JSON.stringify({
            success: true,
            result: {
              id: packageId,
              resources: resources.map((r) => ({
                id: r.id,
                name: r.name,
                url: r.url,
                format: r.format ?? 'CSV',
              })),
            },
          }),
          contentType: 'application/json',
        });
      }
      for (const [csvUrl, content] of Object.entries(csvResponses)) {
        if (url === csvUrl) {
          return createMockResponse({ body: content, contentType: 'text/plain' });
        }
      }
      throw new Error(`Unexpected fetch call to: ${url}`);
    })
  );
}

/**
 * Mock a network error for all requests.
 */
export function mockNetworkError(errorMessage = 'Network error'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error(errorMessage))
  );
}

/**
 * Mock a timeout (AbortError).
 */
export function mockTimeout(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
  );
}

/**
 * Mock an HTTP error response.
 */
export function mockHttpError(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(createMockResponse({ status }))
  );
}

/**
 * Mock a response that returns HTML (simulates CKAN returning an error page).
 */
export function mockHtmlResponse(html = '<html><body>Error</body></html>'): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      createMockResponse({ body: html, contentType: 'text/html; charset=utf-8' })
    )
  );
}
