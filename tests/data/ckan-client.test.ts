import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CkanClient, type FetchFn } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../fixtures");

// CKAN package_show mock response
function makePkgResponse(resources: { id: string; name: string; format: string; url: string }[]) {
  return JSON.stringify({ success: true, result: { resources } });
}

// Create a mock fetch that serves fixture files as binary
function makeMockFetch(responses: Record<string, { ok: boolean; status?: number; body?: string | Buffer }>): FetchFn {
  return async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    if (!key) throw new Error(`Unexpected fetch URL: ${url}`);
    const resp = responses[key];
    const body = resp.body ?? "";
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      async arrayBuffer() {
        const buf = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      },
      async text() {
        return typeof body === "string" ? body : body.toString("utf-8");
      },
    };
  };
}

describe("CkanClient", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
    vi.restoreAllMocks();
  });

  // ── getPackageResources ──────────────────────────────────────────────────────

  describe("getPackageResources", () => {
    it("returns resources for a valid package", async () => {
      const resources = [{ id: "abc", name: "Test", format: "CSV", url: "http://example.com/test.csv" }];
      const fetchFn = makeMockFetch({ "package_show": { ok: true, body: makePkgResponse(resources) } });
      const client = new CkanClient({ cache, fetchFn });

      const result = await client.getPackageResources("some-package");
      expect(result).toEqual(resources);
    });

    it("caches the result and does not refetch", async () => {
      const resources = [{ id: "r1", name: "R1", format: "CSV", url: "http://x.com/r1.csv" }];
      let fetchCount = 0;
      const fetchFn: FetchFn = async (url) => {
        fetchCount++;
        return makeMockFetch({ "package_show": { ok: true, body: makePkgResponse(resources) } })(url);
      };
      const client = new CkanClient({ cache, fetchFn });

      await client.getPackageResources("pkg");
      await client.getPackageResources("pkg");
      expect(fetchCount).toBe(1);
    });

    it("throws on HTTP error", async () => {
      const fetchFn = makeMockFetch({ "package_show": { ok: false, status: 404, body: "Not Found" } });
      const client = new CkanClient({ cache, fetchFn });

      await expect(client.getPackageResources("bad-package")).rejects.toThrow("HTTP 404");
    });

    it("throws when CKAN returns success=false", async () => {
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: JSON.stringify({ success: false }) },
      });
      const client = new CkanClient({ cache, fetchFn });

      await expect(client.getPackageResources("bad")).rejects.toThrow("success=false");
    });
  });

  // ── getHorarios ──────────────────────────────────────────────────────────────

  describe("getHorarios", () => {
    it("parses horarios CSV from ZIP fixture", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "abc", name: "Horarios", format: "CSV ZIP", url: "" }]);

      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "uptu_pasada_variante.zip": { ok: true, body: horarioZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      expect(horarios.length).toBeGreaterThan(0);

      const first = horarios[0];
      expect(first.tipo_dia).toBe(1);
      expect(first.cod_variante).toBe(52);
      expect(first.cod_ubic_parada).toBe(4836);
      expect(first.hora).toBe(500);
      expect(first.dia_anterior).toBe("N");
    });

    it("parses dia_anterior special values correctly", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "abc", name: "Horarios", format: "CSV ZIP", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "uptu_pasada_variante.zip": { ok: true, body: horarioZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      const special = horarios.find((h) => h.dia_anterior === "*");
      const prev = horarios.find((h) => h.dia_anterior === "S");
      expect(special).toBeDefined();
      expect(prev).toBeDefined();
    });

    it("returns cached result on second call", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "abc", name: "Horarios", format: "CSV ZIP", url: "" }]);
      let zipFetchCount = 0;
      const fetchFn: FetchFn = async (url) => {
        if (url.includes("uptu_pasada_variante.zip")) zipFetchCount++;
        return makeMockFetch({
          "package_show": { ok: true, body: pkgResp },
          "uptu_pasada_variante.zip": { ok: true, body: horarioZip },
        })(url);
      };
      const client = new CkanClient({ cache, fetchFn });

      await client.getHorarios();
      await client.getHorarios();
      expect(zipFetchCount).toBe(1);
    });

    it("throws on download failure", async () => {
      const pkgResp = makePkgResponse([{ id: "abc", name: "H", format: "CSV ZIP", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "uptu_pasada_variante.zip": { ok: false, status: 503, body: "" },
      });
      const client = new CkanClient({ cache, fetchFn });

      await expect(client.getHorarios()).rejects.toThrow("HTTP 503");
    });
  });

  // ── getParadas ───────────────────────────────────────────────────────────────

  describe("getParadas", () => {
    it("parses paradas DBF from ZIP fixture and converts coordinates", async () => {
      const paradasZip = readFileSync(join(fixturesDir, "paradas-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "x", name: "Paradas", format: "BIN", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "v_uptu_paradas.zip": { ok: true, body: paradasZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const paradas = await client.getParadas();
      expect(paradas.length).toBeGreaterThan(0);

      const p = paradas[0];
      expect(p.id).toBe(546);
      expect(p.linea).toBe("144");
      // Coordinates should be reasonable WGS84 values for Montevideo (~-34.87, -56.15)
      expect(p.lat).toBeGreaterThan(-36);
      expect(p.lat).toBeLessThan(-33);
      expect(p.lng).toBeGreaterThan(-58);
      expect(p.lng).toBeLessThan(-55);
      expect(typeof p.calle).toBe("string");
      expect(p.calle.length).toBeGreaterThan(0);
    });

    it("decodes Latin-1 street names correctly", async () => {
      const paradasZip = readFileSync(join(fixturesDir, "paradas-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "x", name: "Paradas", format: "BIN", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "v_uptu_paradas.zip": { ok: true, body: paradasZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const paradas = await client.getParadas();
      // The fixture has 'CORU\xd1A' (CORUÑA in Latin-1)
      const coruña = paradas.find((p) => p.calle.includes("CORU"));
      expect(coruña).toBeDefined();
      expect(coruña!.calle).toContain("CORUÑA");
    });
  });

  // ── getLineas ────────────────────────────────────────────────────────────────

  describe("getLineas", () => {
    it("parses lineas DBF from ZIP fixture", async () => {
      const lineasZip = readFileSync(join(fixturesDir, "lineas-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "l", name: "Lineas", format: "BIN", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "v_uptu_lsv_destinos.zip": { ok: true, body: lineasZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const lineas = await client.getLineas();
      expect(lineas.length).toBeGreaterThan(0);

      const l = lineas[0];
      expect(l.descLinea).toBe("402");
      expect(l.codVariante).toBe(8);
      expect(l.descVariante).toBe("A");
      expect(typeof l.descOrigen).toBe("string");
    });

    it("returns correct structure for all fields", async () => {
      const lineasZip = readFileSync(join(fixturesDir, "lineas-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "l", name: "Lineas", format: "BIN", url: "" }]);
      const fetchFn = makeMockFetch({
        "package_show": { ok: true, body: pkgResp },
        "v_uptu_lsv_destinos.zip": { ok: true, body: lineasZip },
      });
      const client = new CkanClient({ cache, fetchFn });

      const lineas = await client.getLineas();
      for (const l of lineas) {
        expect(typeof l.gid).toBe("number");
        expect(typeof l.codLinea).toBe("number");
        expect(typeof l.descLinea).toBe("string");
        expect(typeof l.codVariante).toBe("number");
        expect(typeof l.codOrigen).toBe("number");
        expect(typeof l.codDestino).toBe("number");
      }
    });
  });

  // ── clearCache ───────────────────────────────────────────────────────────────

  describe("clearCache", () => {
    it("forces refetch after cache is cleared", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const pkgResp = makePkgResponse([{ id: "abc", name: "Horarios", format: "CSV ZIP", url: "" }]);
      let zipFetchCount = 0;
      const fetchFn: FetchFn = async (url) => {
        if (url.includes("uptu_pasada_variante.zip")) zipFetchCount++;
        return makeMockFetch({
          "package_show": { ok: true, body: pkgResp },
          "uptu_pasada_variante.zip": { ok: true, body: horarioZip },
        })(url);
      };
      const client = new CkanClient({ cache, fetchFn });

      await client.getHorarios();
      client.clearCache();
      await client.getHorarios();
      expect(zipFetchCount).toBe(2);
    });
  });
});
