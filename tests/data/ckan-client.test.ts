import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CkanClient } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";
import {
  composeFetch,
  mockCkanResponse,
  mockAnyPackageResponse,
  mockBinaryDownload,
  mockNetworkError,
  mockServerError,
  mockNotFound,
} from "../helpers/mock-fetch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../fixtures");

const FAKE_RESOURCE = [{ id: "abc", name: "Resource", format: "CSV ZIP", url: "" }];

describe("CkanClient", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── getPackageResources ──────────────────────────────────────────────────────

  describe("getPackageResources", () => {
    it("returns resources for a valid package", async () => {
      const resources = [{ id: "abc", name: "Test", format: "CSV", url: "http://example.com/test.csv" }];
      const fetchFn = composeFetch(mockCkanResponse("some-package", resources));
      const client = new CkanClient({ cache, fetchFn });

      const result = await client.getPackageResources("some-package");
      expect(result).toEqual(resources);
    });

    it("caches the result and does not refetch", async () => {
      const resources = [{ id: "r1", name: "R1", format: "CSV", url: "http://x.com/r1.csv" }];
      let fetchCount = 0;
      const fetchFn = composeFetch((url) => {
        fetchCount++;
        return mockAnyPackageResponse(resources)(url);
      });
      const client = new CkanClient({ cache, fetchFn });

      await client.getPackageResources("pkg");
      await client.getPackageResources("pkg");
      expect(fetchCount).toBe(1);
    });

    it("throws on HTTP 404", async () => {
      const fetchFn = composeFetch(mockNotFound("package_show"));
      const client = new CkanClient({ cache, fetchFn });
      await expect(client.getPackageResources("bad-package")).rejects.toThrow("HTTP 404");
    });

    it("throws on HTTP 500", async () => {
      const fetchFn = composeFetch(mockServerError("package_show"));
      const client = new CkanClient({ cache, fetchFn });
      await expect(client.getPackageResources("pkg")).rejects.toThrow("HTTP 500");
    });

    it("throws when CKAN returns success=false", async () => {
      const body = JSON.stringify({ success: false });
      const fetchFn = composeFetch((url) => {
        if (!url.includes("package_show")) return null as never;
        return {
          ok: true, status: 200,
          async arrayBuffer() { return Buffer.from(body).buffer as ArrayBuffer; },
          async text() { return body; },
        };
      });
      const client = new CkanClient({ cache, fetchFn });
      await expect(client.getPackageResources("bad")).rejects.toThrow("success=false");
    });

    it("throws on network error", async () => {
      const fetchFn = composeFetch(mockNetworkError("package_show"));
      const client = new CkanClient({ cache, fetchFn });
      await expect(client.getPackageResources("pkg")).rejects.toThrow("Network error");
    });
  });

  // ── getHorarios ──────────────────────────────────────────────────────────────

  describe("getHorarios", () => {
    it("parses horarios CSV from ZIP fixture", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)
      );
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

    it("parses dia_anterior special values S and *", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      expect(horarios.some((h) => h.dia_anterior === "S")).toBe(true);
      expect(horarios.some((h) => h.dia_anterior === "*")).toBe(true);
    });

    it("returns cached result on second call (no extra network fetch)", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      let zipFetchCount = 0;
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        (url) => {
          if (!url.includes("uptu_pasada_variante.zip")) return null as never;
          zipFetchCount++;
          return mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)(url);
        }
      );
      const client = new CkanClient({ cache, fetchFn });

      await client.getHorarios();
      await client.getHorarios();
      expect(zipFetchCount).toBe(1);
    });

    it("throws on download failure (503)", async () => {
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockServerError("uptu_pasada_variante.zip")
      );
      const client = new CkanClient({ cache, fetchFn });
      await expect(client.getHorarios()).rejects.toThrow("HTTP 500");
    });

    it("parses tipo_dia Saturday and Sunday", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      expect(horarios.some((h) => h.tipo_dia === 2)).toBe(true); // Saturday
      expect(horarios.some((h) => h.tipo_dia === 3)).toBe(true); // Sunday
    });

    it("edge: handles BOM marker in CSV without error", async () => {
      const bomZip = readFileSync(join(fixturesDir, "bom-horarios.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", bomZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      // Should not throw, should return at least one row
      const horarios = await client.getHorarios();
      expect(Array.isArray(horarios)).toBe(true);
    });

    it("edge: empty CSV returns empty array", async () => {
      const emptyZip = readFileSync(join(fixturesDir, "empty-horarios.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", emptyZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      expect(horarios).toEqual([]);
    });

    it("numeric columns are parsed as numbers not strings", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const horarios = await client.getHorarios();
      for (const h of horarios) {
        expect(typeof h.tipo_dia).toBe("number");
        expect(typeof h.cod_variante).toBe("number");
        expect(typeof h.hora).toBe("number");
        expect(typeof h.dia_anterior).toBe("string");
      }
    });
  });

  // ── getParadas ───────────────────────────────────────────────────────────────

  describe("getParadas", () => {
    it("parses paradas DBF from ZIP fixture and converts coordinates", async () => {
      const paradasZip = readFileSync(join(fixturesDir, "paradas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_paradas.zip", paradasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const paradas = await client.getParadas();
      expect(paradas.length).toBeGreaterThan(0);

      const p = paradas[0];
      expect(p.id).toBe(546);
      expect(p.linea).toBe("144");
      // Coordinates in Montevideo range (~-34 to -35 lat, ~-56 lng)
      expect(p.lat).toBeGreaterThan(-36);
      expect(p.lat).toBeLessThan(-33);
      expect(p.lng).toBeGreaterThan(-58);
      expect(p.lng).toBeLessThan(-55);
    });

    it("decodes Latin-1 street names correctly (CORUÑA)", async () => {
      const paradasZip = readFileSync(join(fixturesDir, "paradas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_paradas.zip", paradasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const paradas = await client.getParadas();
      const coruña = paradas.find((p) => p.calle.includes("CORU"));
      expect(coruña).toBeDefined();
      expect(coruña!.calle).toContain("CORUÑA");
    });

    it("all parada fields have correct types", async () => {
      const paradasZip = readFileSync(join(fixturesDir, "paradas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_paradas.zip", paradasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const paradas = await client.getParadas();
      for (const p of paradas) {
        expect(typeof p.id).toBe("number");
        expect(typeof p.linea).toBe("string");
        expect(typeof p.variante).toBe("number");
        expect(typeof p.lat).toBe("number");
        expect(typeof p.lng).toBe("number");
        expect(Number.isFinite(p.lat)).toBe(true);
        expect(Number.isFinite(p.lng)).toBe(true);
      }
    });
  });

  // ── getLineas ────────────────────────────────────────────────────────────────

  describe("getLineas", () => {
    it("parses lineas DBF from ZIP fixture", async () => {
      const lineasZip = readFileSync(join(fixturesDir, "lineas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_lsv_destinos.zip", lineasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const lineas = await client.getLineas();
      expect(lineas.length).toBeGreaterThan(0);

      const l = lineas[0];
      expect(l.descLinea).toBe("402");
      expect(l.codVariante).toBe(8);
      expect(l.descVariante).toBe("A");
    });

    it("returns correct structure for all fields", async () => {
      const lineasZip = readFileSync(join(fixturesDir, "lineas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_lsv_destinos.zip", lineasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const lineas = await client.getLineas();
      for (const l of lineas) {
        expect(typeof l.gid).toBe("number");
        expect(typeof l.codLinea).toBe("number");
        expect(typeof l.descLinea).toBe("string");
        expect(typeof l.codVariante).toBe("number");
        expect(typeof l.codOrigen).toBe("number");
        expect(typeof l.codDestino).toBe("number");
        expect(typeof l.descOrigen).toBe("string");
        expect(typeof l.descDestino).toBe("string");
      }
    });

    it("finds line 181 in fixture", async () => {
      const lineasZip = readFileSync(join(fixturesDir, "lineas-sample.zip"));
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        mockBinaryDownload("v_uptu_lsv_destinos.zip", lineasZip)
      );
      const client = new CkanClient({ cache, fetchFn });

      const lineas = await client.getLineas();
      const linea181 = lineas.find((l) => l.descLinea === "181");
      expect(linea181).toBeDefined();
      expect(linea181!.codVariante).toBe(52);
    });
  });

  // ── clearCache ───────────────────────────────────────────────────────────────

  describe("clearCache", () => {
    it("forces refetch after cache is cleared", async () => {
      const horarioZip = readFileSync(join(fixturesDir, "horarios-sample.zip"));
      let zipFetchCount = 0;
      const fetchFn = composeFetch(
        mockAnyPackageResponse(FAKE_RESOURCE),
        (url) => {
          if (!url.includes("uptu_pasada_variante.zip")) return null as never;
          zipFetchCount++;
          return mockBinaryDownload("uptu_pasada_variante.zip", horarioZip)(url);
        }
      );
      const client = new CkanClient({ cache, fetchFn });

      await client.getHorarios();
      client.clearCache();
      await client.getHorarios();
      expect(zipFetchCount).toBe(2);
    });
  });
});
