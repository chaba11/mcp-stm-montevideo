/**
 * Integration tests — hit the real CKAN API.
 * Skipped unless SKIP_INTEGRATION=false explicitly.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { CkanClient } from "../../src/data/ckan-client.js";

const SKIP = process.env["SKIP_INTEGRATION"] !== "false";

describe.skipIf(SKIP)("CKAN live integration", () => {
  let client: CkanClient;

  beforeAll(() => {
    client = new CkanClient();
  });

  it("downloads paradas and returns at least 100 records", async () => {
    const paradas = await client.getParadas();
    expect(paradas.length).toBeGreaterThanOrEqual(100);
  }, 60_000);

  it("paradas have valid Montevideo coordinates", async () => {
    const paradas = await client.getParadas();
    let invalidCount = 0;
    for (const p of paradas) {
      // Montevideo bounding box: lat -34.7 to -34.95, lon -56.0 to -56.4
      const validLat = p.lat >= -34.97 && p.lat <= -34.7;
      const validLon = p.lng >= -56.45 && p.lng <= -55.9;
      if (!validLat || !validLon) invalidCount++;
    }
    // Allow up to 1% invalid (data quality tolerance)
    const invalidRatio = invalidCount / paradas.length;
    expect(invalidRatio).toBeLessThan(0.01);
  }, 60_000);

  it("paradas have non-empty calle field", async () => {
    const paradas = await client.getParadas();
    const emptyCalle = paradas.filter((p) => !p.calle || p.calle.trim() === "");
    // Allow up to 5% with empty calle (some may be unnamed stops)
    expect(emptyCalle.length / paradas.length).toBeLessThan(0.05);
  }, 60_000);

  it("horarios have required columns", async () => {
    const horarios = await client.getHorarios();
    expect(horarios.length).toBeGreaterThan(0);
    const sample = horarios[0];
    expect(typeof sample.tipo_dia).toBe("number");
    expect(typeof sample.cod_variante).toBe("number");
    expect(typeof sample.cod_ubic_parada).toBe("number");
    expect(typeof sample.hora).toBe("number");
    expect(["N", "S", "*"]).toContain(sample.dia_anterior);
  }, 120_000);

  it("horarios tipo_dia values are 1, 2, or 3", async () => {
    const horarios = await client.getHorarios();
    const tipoDias = new Set(horarios.map((h) => h.tipo_dia));
    expect(tipoDias.has(1)).toBe(true); // weekday
    // Saturday and Sunday may or may not be present depending on schedule
    for (const td of tipoDias) {
      expect([1, 2, 3]).toContain(td);
    }
  }, 120_000);

  it("lineas returns line data with descLinea", async () => {
    const lineas = await client.getLineas();
    expect(lineas.length).toBeGreaterThan(0);
    const sample = lineas[0];
    expect(typeof sample.descLinea).toBe("string");
    expect(sample.descLinea.length).toBeGreaterThan(0);
    expect(typeof sample.codVariante).toBe("number");
  }, 60_000);

  it("caches are populated after first load", async () => {
    await client.getParadas(); // loads data
    // Second call should be faster (from cache) — just verify it works
    const start = Date.now();
    await client.getParadas();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100); // should be near-instant from cache
  }, 120_000);
});
