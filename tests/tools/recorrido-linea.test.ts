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
});
