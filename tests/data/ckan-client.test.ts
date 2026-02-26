import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf-8');
}

function fixtureBinary(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

// Mock helpers
function mockFetch(
  handler: (url: string) => Promise<{
    ok: boolean;
    status: number;
    headers: { get: (n: string) => string | null };
    text: () => Promise<string>;
    json: () => Promise<unknown>;
  }>
) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(handler));
}

function makePackageResponse(packageId: string, resources: Array<{ name: string; url: string; format?: string }>) {
  return JSON.stringify({
    success: true,
    result: {
      id: packageId,
      resources: resources.map((r, i) => ({ id: `res-${i}`, name: r.name, url: r.url, format: r.format ?? 'CSV' })),
    },
  });
}

function makeResponse(body: string, status = 200, contentType = 'text/plain') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => (n === 'content-type' ? contentType : null) },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

// We need to import after mocks are set up for some tests
// Import the modules under test
import { downloadCsv, getPackageResources } from '../../src/data/ckan-client.js';
import { cache } from '../../src/data/cache.js';

describe('CKAN client', () => {
  beforeEach(() => {
    cache.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('getPackageResources', () => {
    it('returns resource list for valid package', async () => {
      const packageJson = makePackageResponse('test-pkg', [
        { name: 'paradas CSV', url: 'https://example.com/paradas.csv' },
      ]);
      mockFetch(async (url) => {
        if (url.includes('package_show')) return makeResponse(packageJson, 200, 'application/json');
        throw new Error(`Unexpected: ${url}`);
      });

      const resources = await getPackageResources('test-pkg');
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('paradas CSV');
      expect(resources[0].url).toBe('https://example.com/paradas.csv');
    });

    it('caches results — second call does not hit network', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeResponse(
          makePackageResponse('cached-pkg', [{ name: 'r', url: 'https://example.com/r.csv' }]),
          200,
          'application/json'
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await getPackageResources('cached-pkg');
      await getPackageResources('cached-pkg');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws on 404 dataset', async () => {
      mockFetch(async () => makeResponse('Not Found', 404));
      await expect(getPackageResources('nonexistent-pkg')).rejects.toThrow(/not found/i);
    });

    it('throws on other HTTP errors', async () => {
      mockFetch(async () => makeResponse('Server Error', 500));
      await expect(getPackageResources('error-pkg')).rejects.toThrow(/500/);
    });

    it('throws on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      await expect(getPackageResources('net-error-pkg')).rejects.toThrow(/Network error|ECONNREFUSED/);
    });

    it('throws on timeout (AbortError)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      );
      await expect(getPackageResources('timeout-pkg')).rejects.toThrow(/timed out/i);
    });

    it('throws when package has no resources', async () => {
      mockFetch(async () =>
        makeResponse(
          JSON.stringify({ success: true, result: { id: 'empty-pkg', resources: [] } }),
          200,
          'application/json'
        )
      );
      await expect(getPackageResources('empty-pkg')).rejects.toThrow(/No resources/i);
    });

    it('throws when CKAN returns unsuccessful response', async () => {
      mockFetch(async () =>
        makeResponse(
          JSON.stringify({ success: false, error: { message: 'Not found' } }),
          200,
          'application/json'
        )
      );
      await expect(getPackageResources('fail-pkg')).rejects.toThrow();
    });
  });

  describe('downloadCsv', () => {
    it('parses valid CSV and returns typed objects', async () => {
      const csv = fixture('paradas-sample.csv');
      mockFetch(async () => makeResponse(csv));

      const results = await downloadCsv<{ id: string; nombre: string }>(
        'https://example.com/paradas.csv',
        (row) => ({
          id: row['COD_PARADA_STM'],
          nombre: row['DESC_PARADA_STM'],
        })
      );

      expect(results).toHaveLength(10);
      expect(results[0].id).toBe('1001');
      expect(results[0].nombre).toBe('BV ESPAÑA ESQ.LIBERTAD');
    });

    it('strips UTF-8 BOM marker', async () => {
      const csv = fixtureBinary('bom.csv').toString('utf-8');
      mockFetch(async () => makeResponse(csv));

      const results = await downloadCsv<{ id: string }>(
        'https://example.com/bom.csv',
        (row) => ({ id: row['COD_PARADA_STM'] })
      );

      // BOM should be stripped so first column header is correct
      expect(results[0].id).toBe('1001');
    });

    it('returns empty array for CSV with headers only', async () => {
      const csv = fixture('empty.csv');
      mockFetch(async () => makeResponse(csv));

      const results = await downloadCsv('https://example.com/empty.csv', (row) => row);
      expect(results).toHaveLength(0);
    });

    it('skips malformed rows but returns valid ones', async () => {
      const csv = fixture('malformed.csv');
      mockFetch(async () => makeResponse(csv));

      // Parser that requires id to be non-empty
      const results = await downloadCsv<{ id: string }>(
        'https://example.com/malformed.csv',
        (row) => {
          if (!row['COD_PARADA_STM']) return null;
          return { id: row['COD_PARADA_STM'] };
        }
      );

      // Only rows with valid IDs should be included
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.id !== '')).toBe(true);
    });

    it('preserves Spanish characters (ñ, á, é)', async () => {
      const csvWithAccents =
        'COD_PARADA_STM,DESC_PARADA_STM,X,Y\n2001,JOSÉ ELLAURI ESQ.ÑOÑO,580000.00,6135000.00\n';
      mockFetch(async () => makeResponse(csvWithAccents));

      const results = await downloadCsv<{ nombre: string }>(
        'https://example.com/accents.csv',
        (row) => ({ nombre: row['DESC_PARADA_STM'] })
      );

      expect(results[0].nombre).toBe('JOSÉ ELLAURI ESQ.ÑOÑO');
    });

    it('trims extra whitespace from values', async () => {
      const csvWithSpaces =
        'COD_PARADA_STM,DESC_PARADA_STM,X,Y\n  1001  ,  BV ESPAÑA  ,580000.00,6135000.00\n';
      mockFetch(async () => makeResponse(csvWithSpaces));

      const results = await downloadCsv<{ id: string; nombre: string }>(
        'https://example.com/spaces.csv',
        (row) => ({ id: row['COD_PARADA_STM'], nombre: row['DESC_PARADA_STM'] })
      );

      expect(results[0].id).toBe('1001');
      expect(results[0].nombre).toBe('BV ESPAÑA');
    });

    it('preserves "0181" as string, not number', async () => {
      const csv =
        'COD_PARADA_STM,COD_LINEA,DESC_LINEA,COD_VARIANTE,DESC_VARIANTE,TIPO_DIA,HORA,MINUTO\n1001,0181,SERVICIO 0181,01,DESC,L,6,0\n';
      mockFetch(async () => makeResponse(csv));

      const results = await downloadCsv<{ linea: string }>(
        'https://example.com/linea.csv',
        (row) => ({ linea: row['COD_LINEA'] })
      );

      expect(results[0].linea).toBe('0181');
      expect(results[0].linea).not.toBe('181');
    });

    it('throws on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      await expect(
        downloadCsv('https://example.com/fail.csv', (r) => r)
      ).rejects.toThrow(/Network error|ECONNREFUSED/);
    });

    it('throws on timeout', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
      );
      await expect(
        downloadCsv('https://example.com/slow.csv', (r) => r)
      ).rejects.toThrow(/timed out/i);
    });

    it('throws on HTTP error', async () => {
      mockFetch(async () => makeResponse('Not Found', 404));
      await expect(
        downloadCsv('https://example.com/404.csv', (r) => r)
      ).rejects.toThrow(/404/);
    });

    it('throws when server returns HTML instead of CSV', async () => {
      mockFetch(async () =>
        makeResponse('<html><body>Error page</body></html>', 200, 'text/html; charset=utf-8')
      );
      await expect(
        downloadCsv('https://example.com/html-error.csv', (r) => r)
      ).rejects.toThrow(/HTML/i);
    });

    it('returns empty array for completely empty response', async () => {
      mockFetch(async () => makeResponse(''));
      const results = await downloadCsv('https://example.com/empty.csv', (r) => r);
      expect(results).toHaveLength(0);
    });
  });

  describe('cache integration', () => {
    it('cache prevents duplicate network calls for package_show', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeResponse(
          makePackageResponse('dup-test', [{ name: 'r', url: 'https://x.com/r.csv' }]),
          200,
          'application/json'
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await getPackageResources('dup-test');
      await getPackageResources('dup-test');
      await getPackageResources('dup-test');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('cache miss after TTL hits network again', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        makeResponse(
          makePackageResponse('ttl-test', [{ name: 'r', url: 'https://x.com/r.csv' }]),
          200,
          'application/json'
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      await getPackageResources('ttl-test');
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Advance past cache TTL (1 hour)
      vi.advanceTimersByTime(61 * 60 * 1000);

      await getPackageResources('ttl-test');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
