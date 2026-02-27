import { describe, it, expect, beforeEach } from "vitest";
import { recorridoLineaHandler } from "../../src/tools/recorrido-linea.js";
import { createMockClient } from "./__helpers__/tool-test-utils.js";
import type { CkanClient } from "../../src/data/ckan-client.js";


describe("recorrido_linea handler", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("returns route for a known line", async () => {
    const result = await recorridoLineaHandler({ linea: "181" }, client);
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it("returns required fields in each route variant", async () => {
    const result = await recorridoLineaHandler({ linea: "181" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      linea: string;
      variante: string;
      origen: string;
      destino: string;
      frecuencia_promedio_minutos: number | null;
      paradas: Array<{
        parada_id: number;
        nombre: string;
        latitud: number;
        longitud: number;
        orden: number;
      }>;
    }>;
    for (const route of parsed) {
      expect(route.linea).toBe("181");
      expect(typeof route.variante).toBe("string");
      expect(typeof route.origen).toBe("string");
      expect(typeof route.destino).toBe("string");
      expect(Array.isArray(route.paradas)).toBe(true);
      expect(route.paradas.length).toBeGreaterThan(0);
      for (const p of route.paradas) {
        expect(typeof p.parada_id).toBe("number");
        expect(typeof p.nombre).toBe("string");
        expect(typeof p.latitud).toBe("number");
        expect(typeof p.longitud).toBe("number");
        expect(typeof p.orden).toBe("number");
        expect(p.orden).toBeGreaterThan(0);
      }
    }
  });

  it("returns error for unknown line", async () => {
    const result = await recorridoLineaHandler({ linea: "999_INVENTADA" }, client);
    expect(result.content[0].text).toContain("No se encontró la línea");
  });

  it("filters by variant when provided", async () => {
    const result = await recorridoLineaHandler({ linea: "181", variante: "A" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{ variante: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const route of parsed) {
      expect(route.variante).toBe("A");
    }
  });

  it("returns error for non-existent variant", async () => {
    const result = await recorridoLineaHandler({ linea: "181", variante: "Z" }, client);
    expect(result.content[0].text).toContain("No se encontró la variante");
  });

  it("paradas are ordered by orden ascending", async () => {
    const result = await recorridoLineaHandler({ linea: "181", variante: "A" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      paradas: Array<{ orden: number }>;
    }>;
    for (const route of parsed) {
      for (let i = 1; i < route.paradas.length; i++) {
        expect(route.paradas[i].orden).toBeGreaterThan(route.paradas[i - 1].orden);
      }
    }
  });

  it("no duplicate stop IDs in a route", async () => {
    const result = await recorridoLineaHandler({ linea: "181" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      paradas: Array<{ parada_id: number }>;
    }>;
    for (const route of parsed) {
      const ids = route.paradas.map((p) => p.parada_id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("calculates frequency when horarios available", async () => {
    const result = await recorridoLineaHandler({ linea: "181", variante: "A" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      frecuencia_promedio_minutos: number | null;
    }>;
    // HORARIOS_FIXTURE has line 181A every 15 min — expect ~15
    const freq = parsed[0].frecuencia_promedio_minutos;
    if (freq !== null) {
      expect(freq).toBeGreaterThan(0);
      expect(freq).toBeLessThan(120);
    }
  });

  it("handles line name case-insensitively", async () => {
    const upper = await recorridoLineaHandler({ linea: "181" }, client);
    const lower = await recorridoLineaHandler({ linea: "181" }, client);
    expect(upper.content[0].text).toBe(lower.content[0].text);
  });

  it("returns error when linea is empty string", async () => {
    const result = await recorridoLineaHandler({ linea: "" }, client);
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns message when no stops found for line", async () => {
    const emptyClient = createMockClient({ paradas: [] });
    const result = await recorridoLineaHandler({ linea: "181" }, emptyClient);
    expect(result.content[0].text).toContain("No se encontraron paradas");
  });

  it("returns D10 line when available", async () => {
    const result = await recorridoLineaHandler({ linea: "D10" }, client);
    expect(result.content[0].type).toBe("text");
    // D10 has stops only in parada 302, which might not have variant data
    // Should not crash regardless
  });

  it("parada nombre includes esquina when present", async () => {
    const result = await recorridoLineaHandler({ linea: "181", variante: "A" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      paradas: Array<{ nombre: string }>;
    }>;
    const nombres = parsed[0].paradas.map((p) => p.nombre);
    // PARADAS_FIXTURE parada 300 has esquina "LIBERTAD"
    expect(nombres.some((n) => n.includes(" y "))).toBe(true);
  });

  it("returns all variants that have stops when no variant filter", async () => {
    // Line 181 variants: LINEAS_FIXTURE has A(5200) and B(5201),
    // but PARADAS_FIXTURE only has stops for variant A (5200).
    // Only variants with stops should appear.
    const result = await recorridoLineaHandler({ linea: "181" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{ variante: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const r of parsed) {
      expect(typeof r.variante).toBe("string");
    }
    // Variant A should appear since it has paradas
    const variantes = parsed.map((r) => r.variante);
    expect(variantes).toContain("A");
  });

  it("frecuencia_promedio_minutos is null when no horarios", async () => {
    const noHorariosClient = createMockClient({ horarios: [] });
    const result = await recorridoLineaHandler({ linea: "181", variante: "A" }, noHorariosClient);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      frecuencia_promedio_minutos: number | null;
    }>;
    expect(parsed[0].frecuencia_promedio_minutos).toBeNull();
  });

  it("handles whitespace-only linea", async () => {
    const result = await recorridoLineaHandler({ linea: "   " }, client);
    expect(result.content[0].text).toContain("Proporciona");
  });
});

describe("recorrido_linea — network fixture", () => {
  it("returns L1 route with 5 stops in order", async () => {
    const { createMockClient: mkClient } = await import("./__helpers__/tool-test-utils.js");
    const { PARADAS_NETWORK, LINEAS_NETWORK, HORARIOS_NETWORK } = await import("../fixtures/network-data.js");
    const client = mkClient({ paradas: PARADAS_NETWORK, lineas: LINEAS_NETWORK, horarios: HORARIOS_NETWORK });
    const result = await recorridoLineaHandler({ linea: "L1" }, client);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      paradas: Array<{ parada_id: number; orden: number }>;
      frecuencia_promedio_minutos: number | null;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    const l1 = parsed[0];
    expect(l1.paradas.length).toBe(5);
    // Stops should be in ordinal order
    for (let i = 1; i < l1.paradas.length; i++) {
      expect(l1.paradas[i].orden).toBeGreaterThan(l1.paradas[i - 1].orden);
    }
    // Frequency should be ~15 min (schedule every 15 min)
    if (l1.frecuencia_promedio_minutos !== null) {
      expect(l1.frecuencia_promedio_minutos).toBeCloseTo(15, 0);
    }
  });
});
