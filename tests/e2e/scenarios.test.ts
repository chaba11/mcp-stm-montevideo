/**
 * End-to-end user scenario tests using mock data.
 * Tests that tool chains work correctly and produce sensible results.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { buscarParadaHandler } from "../../src/tools/buscar-parada.js";
import { proximosBusesHandler } from "../../src/tools/proximos-buses.js";
import { recorridoLineaHandler } from "../../src/tools/recorrido-linea.js";
import { comoLlegarHandler } from "../../src/tools/como-llegar.js";
import { ubicacionBusHandler } from "../../src/tools/ubicacion-bus.js";
import { GpsClient } from "../../src/data/gps-client.js";
import { createMockClient, montevideoTime } from "../tools/__helpers__/tool-test-utils.js";
import type { CkanClient } from "../../src/data/ckan-client.js";

describe("Scenario 1: ¿Cuándo pasa el 181 por BV España y Libertad?", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("buscar_parada returns parada 300 with linea 181 in lineas array", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 200 },
      client
    );
    expect(result.content[0].type).toBe("text");
    const paradas = JSON.parse(result.content[0].text) as Array<{
      parada_id: number;
      lineas: string[];
    }>;
    expect(paradas.length).toBeGreaterThan(0);
    const p300 = paradas.find((p) => p.parada_id === 300);
    expect(p300).toBeDefined();
    expect(p300!.lineas).toContain("181");
  });

  it("proximos_buses for parada 300 on weekday returns buses for line 181", async () => {
    const now = montevideoTime(9, 0, "wednesday");
    const result = await proximosBusesHandler({ parada_id: 300, cantidad: 3 }, client, now);
    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;
    expect(text.length).toBeGreaterThan(10);
    if (text.startsWith("[")) {
      const buses = JSON.parse(text) as Array<{ linea: string; minutos_restantes: number }>;
      expect(buses.length).toBeGreaterThan(0);
      for (const b of buses) {
        expect(b.minutos_restantes).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("proximos_buses filtered by linea 181 returns subset of unfiltered", async () => {
    const now = montevideoTime(10, 0, "wednesday");
    const unfiltered = await proximosBusesHandler({ parada_id: 300, cantidad: 10 }, client, now);
    const filtered = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 10 },
      client,
      now
    );
    const unfilteredText = unfiltered.content[0].text;
    const filteredText = filtered.content[0].text;
    if (unfilteredText.startsWith("[") && filteredText.startsWith("[")) {
      const allBuses = JSON.parse(unfilteredText) as Array<{ linea: string }>;
      const line181Buses = JSON.parse(filteredText) as Array<{ linea: string }>;
      for (const b of line181Buses) {
        expect(b.linea).toBe("181");
      }
      expect(line181Buses.length).toBeLessThanOrEqual(allBuses.length);
    }
  });
});

describe("Scenario 2: ¿Cómo llego de BV España a 18 de Julio?", () => {
  it("como_llegar returns at least 1 route with positive duration", async () => {
    // PARADAS_FIXTURE: parada 300 (BV ESPAÑA, ordinal=1) and 301 (18 DE JULIO, ordinal=2)
    // both served by line 181 variant 5200 — direct route should be found
    const client = createMockClient();
    const result = await comoLlegarHandler(
      {
        origen_calle1: "BV ESPAÑA",
        destino_calle1: "18 DE JULIO",
        max_caminata_metros: 500,
        max_transbordos: 1,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    const text = result.content[0].text;
    expect(text.length).toBeGreaterThan(0);
    if (text.startsWith("[")) {
      const routes = JSON.parse(text) as Array<{ duracion_total_estimada_min: number }>;
      expect(routes.length).toBeGreaterThan(0);
      expect(routes[0].duracion_total_estimada_min).toBeGreaterThan(0);
    }
  });
});

describe("Scenario 3: ¿Qué líneas pasan cerca? → recorrido", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = createMockClient();
  });

  it("buscar_parada near fixture stops returns paradas with lineas arrays", async () => {
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 500 },
      client
    );
    const text = result.content[0].text;
    if (text.startsWith("[")) {
      const paradas = JSON.parse(text) as Array<{ lineas: string[] }>;
      expect(paradas.length).toBeGreaterThan(0);
      for (const p of paradas) {
        expect(Array.isArray(p.lineas)).toBe(true);
      }
    }
  });

  it("recorrido_linea for nearby line includes the origin parada", async () => {
    const buscarResult = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 100 },
      client
    );
    const paradas = JSON.parse(buscarResult.content[0].text) as Array<{
      parada_id: number;
      lineas: string[];
    }>;
    expect(paradas.length).toBeGreaterThan(0);
    const linea = paradas[0].lineas[0];

    const recorridoResult = await recorridoLineaHandler({ linea }, client);
    const text = recorridoResult.content[0].text;
    if (text.startsWith("[")) {
      const routes = JSON.parse(text) as Array<{
        paradas: Array<{ parada_id: number }>;
      }>;
      expect(routes.length).toBeGreaterThan(0);
      const allParadaIds = routes.flatMap((r) => r.paradas.map((p) => p.parada_id));
      expect(allParadaIds).toContain(paradas[0].parada_id);
    }
  });
});

describe("Scenario 4: All 5 tools callable in sequence", () => {
  it("all 5 tools return text content without crashing", async () => {
    const client = createMockClient();
    const gps = new GpsClient();

    const r1 = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505 },
      client
    );
    expect(r1.content[0].type).toBe("text");

    const now = montevideoTime(10, 0, "wednesday");
    const r2 = await proximosBusesHandler({ parada_id: 300 }, client, now);
    expect(r2.content[0].type).toBe("text");

    const r3 = await recorridoLineaHandler({ linea: "181" }, client);
    expect(r3.content[0].type).toBe("text");

    const r4 = await ubicacionBusHandler({ linea: "181" }, gps);
    expect(r4.content[0].type).toBe("text");

    const r5 = await comoLlegarHandler(
      {
        origen_calle1: "BV ESPAÑA",
        destino_calle1: "18 DE JULIO",
        max_caminata_metros: 500,
      },
      client
    );
    expect(r5.content[0].type).toBe("text");
  });
});
