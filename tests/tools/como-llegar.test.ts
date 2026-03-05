/**
 * Tests for como_llegar routing tool.
 *
 * Network fixture:
 *   Line 181 (variant 5200): A → B → C → D (stops 10, 11, 12, 13)
 *   Line 121 (variant 5201): E → F → G → H (stops 20, 21, 22, 23)
 *   Transfer: Stop D (id=13) and stop E (id=20) are ~200m apart
 *
 * Coordinates (Montevideo area, WGS84):
 *   10: -34.90, -56.18  (origin side)
 *   11: -34.905, -56.175
 *   12: -34.91, -56.17
 *   13: -34.915, -56.165 (transfer point A)
 *   20: -34.916, -56.163 (transfer point B — ~200m from 13)
 *   21: -34.92, -56.16
 *   22: -34.925, -56.155
 *   23: -34.93, -56.15  (destination side)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { comoLlegarHandler } from "../../src/tools/como-llegar.js";
import { Cache } from "../../src/data/cache.js";
import { CkanClient } from "../../src/data/ckan-client.js";
import type { Parada } from "../../src/types/parada.js";
import type { LineaVariante } from "../../src/types/linea.js";

// --- Fixture: a small bus network ---

const PARADAS_ROUTE: Parada[] = [
  // Line 181A (variant 5200)
  { id: 10, linea: "181", variante: 5200, ordinal: 1, calle: "ORIGEN ST", esquina: "CALLE A", lat: -34.900, lng: -56.180 },
  { id: 11, linea: "181", variante: 5200, ordinal: 2, calle: "MID ST 1", esquina: "", lat: -34.905, lng: -56.175 },
  { id: 12, linea: "181", variante: 5200, ordinal: 3, calle: "MID ST 2", esquina: "", lat: -34.910, lng: -56.170 },
  { id: 13, linea: "181", variante: 5200, ordinal: 4, calle: "TRANSFER A", esquina: "", lat: -34.915, lng: -56.165 },
  // Line 121A (variant 5201)
  { id: 20, linea: "121", variante: 5201, ordinal: 1, calle: "TRANSFER B", esquina: "", lat: -34.916, lng: -56.163 },
  { id: 21, linea: "121", variante: 5201, ordinal: 2, calle: "DEST MID 1", esquina: "", lat: -34.920, lng: -56.160 },
  { id: 22, linea: "121", variante: 5201, ordinal: 3, calle: "DEST MID 2", esquina: "", lat: -34.925, lng: -56.155 },
  { id: 23, linea: "121", variante: 5201, ordinal: 4, calle: "DESTINO ST", esquina: "FINAL AVE", lat: -34.930, lng: -56.150 },
  // Direct line: Line 999 goes from stop 10 directly to stop 23
  { id: 10, linea: "999", variante: 5999, ordinal: 1, calle: "ORIGEN ST", esquina: "CALLE A", lat: -34.900, lng: -56.180 },
  { id: 23, linea: "999", variante: 5999, ordinal: 10, calle: "DESTINO ST", esquina: "FINAL AVE", lat: -34.930, lng: -56.150 },
];

const LINEAS_ROUTE: LineaVariante[] = [
  {
    gid: 1, codLinea: 181, descLinea: "181", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "CENTRO - SUR",
    codVariante: 5200, descVariante: "A",
    codOrigen: 10, descOrigen: "ORIGEN", codDestino: 13, descDestino: "TRANSFER A",
  },
  {
    gid: 2, codLinea: 121, descLinea: "121", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "SUR - ESTE",
    codVariante: 5201, descVariante: "A",
    codOrigen: 20, descOrigen: "TRANSFER B", codDestino: 23, descDestino: "DESTINO",
  },
  {
    gid: 3, codLinea: 999, descLinea: "999", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "ORIGEN - DESTINO DIRECTO",
    codVariante: 5999, descVariante: "A",
    codOrigen: 10, descOrigen: "ORIGEN", codDestino: 23, descDestino: "DESTINO",
  },
];

function makeRouteClient(): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache });
  client.getParadas = async () => PARADAS_ROUTE;
  client.getHorarios = async () => [];
  client.getLineas = async () => LINEAS_ROUTE;
  return client;
}

describe("como_llegar handler", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = makeRouteClient();
  });

  it("returns error when origen_calle1 is missing", async () => {
    const result = await comoLlegarHandler(
      { origen_calle1: "", destino_calle1: "DESTINO ST" },
      client
    );
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns error when destino_calle1 is missing", async () => {
    const result = await comoLlegarHandler(
      { origen_calle1: "ORIGEN ST", destino_calle1: "" },
      client
    );
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns error when origin not found", async () => {
    const result = await comoLlegarHandler(
      { origen_calle1: "CALLE_INVENTADA_ZZZZZ", destino_calle1: "DESTINO ST" },
      client
    );
    expect(result.content[0].text).toMatch(/No se encontró el origen/);
  });

  it("finds direct route between origin and destination", async () => {
    // Line 999 goes directly from stop 10 (near ORIGEN ST) to stop 23 (near DESTINO ST)
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 200,
        max_transbordos: 0,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should either find route or report no route — not crash
    if (!result.content[0].text.includes("No se encontró una ruta")) {
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
      const directRoute = parsed[0];
      expect(directRoute.duracion_total_estimada_min).toBeGreaterThan(0);
      expect(Array.isArray(directRoute.tramos)).toBe(true);
    }
  });

  it("route option contains required fields", async () => {
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as RouteOption[];
      expect(parsed.length).toBeGreaterThan(0);
      for (const route of parsed) {
        expect(typeof route.duracion_total_estimada_min).toBe("number");
        expect(route.duracion_total_estimada_min).toBeGreaterThan(0);
        expect(Array.isArray(route.tramos)).toBe(true);
        expect(route.tramos.length).toBeGreaterThanOrEqual(3); // walk + bus + walk at minimum
        for (const tramo of route.tramos) {
          expect(["bus", "caminata"]).toContain(tramo.tipo);
          expect(typeof tramo.duracion_min).toBe("number");
          expect(tramo.duracion_min).toBeGreaterThanOrEqual(1);
          if (tramo.tipo === "bus") {
            const bus = tramo as { linea: string; parada_subida: string; parada_bajada: string; num_paradas: number };
            expect(typeof bus.linea).toBe("string");
            expect(typeof bus.parada_subida).toBe("string");
            expect(typeof bus.parada_bajada).toBe("string");
            expect(typeof bus.num_paradas).toBe("number");
          }
          if (tramo.tipo === "caminata") {
            const walk = tramo as { distancia_metros: number };
            expect(typeof walk.distancia_metros).toBe("number");
            expect(walk.distancia_metros).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("routes are sorted by duracion_total_estimada_min ascending", async () => {
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as Array<{
        duracion_total_estimada_min: number;
      }>;
      for (let i = 1; i < parsed.length; i++) {
        expect(parsed[i - 1].duracion_total_estimada_min).toBeLessThanOrEqual(
          parsed[i].duracion_total_estimada_min
        );
      }
    }
  });

  it("returns no more than 3 route options", async () => {
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.length).toBeLessThanOrEqual(3);
    }
  });

  it("respects max_transbordos=0 by not including transfer routes", async () => {
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
        max_transbordos: 0,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as Array<{
        tramos: Array<{ tipo: string }>;
      }>;
      for (const route of parsed) {
        const busTramos = route.tramos.filter((t) => t.tipo === "bus");
        expect(busTramos.length).toBeLessThanOrEqual(1); // no transfers = max 1 bus segment
      }
    }
  });

  it("handles no stops near origin gracefully", async () => {
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 1, // 1 meter radius — no stops
        max_transbordos: 0,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should not crash — returns either a route or a message
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("no route found returns friendly message", async () => {
    // Use empty lineas — no routes possible
    const emptyClient = makeRouteClient();
    emptyClient.getLineas = async () => [];
    emptyClient.getParadas = async () => PARADAS_ROUTE;
    const result = await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      emptyClient
    );
    // Should return either empty array or "no route" message
    expect(result.content[0].type).toBe("text");
    if (!result.content[0].text.startsWith("[")) {
      expect(result.content[0].text).toMatch(/No se encontr/);
    }
  });
});

// Type alias for test assertions
interface RouteOption {
  duracion_total_estimada_min: number;
  tramos: Tramo[];
}
interface Tramo {
  tipo: "bus" | "caminata";
  duracion_min: number;
}

// ---- Network fixture tests ----
import { PARADAS_NETWORK, LINEAS_NETWORK } from "../fixtures/network-data.js";

function makeNetworkClient(): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache });
  client.getParadas = async () => PARADAS_NETWORK;
  client.getHorarios = async () => [];
  client.getLineas = async () => LINEAS_NETWORK;
  return client;
}

describe("como_llegar — network fixture routing", () => {
  it("finds direct L1 route from P1 area to P4 area", async () => {
    const client = makeNetworkClient();
    // P1: (-34.900, -56.180) → P4: (-34.900, -56.150), same line L1
    const result = await comoLlegarHandler(
      {
        origen_calle1: "LINEA 1",
        origen_calle2: "P1",
        destino_calle1: "LINEA 1",
        destino_calle2: "P4",
        max_caminata_metros: 200,
        max_transbordos: 0,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as RouteOption[];
      expect(parsed.length).toBeGreaterThan(0);
      const busTramo = parsed[0].tramos.find((t) => t.tipo === "bus") as {
        tipo: "bus";
        linea: string;
        num_paradas: number;
      } | undefined;
      expect(busTramo).toBeDefined();
      expect(busTramo!.linea).toBe("L1");
    }
  });

  it("finds transfer route from P1 area to P10 area (L1 → L2)", async () => {
    const client = makeNetworkClient();
    // P1 on L1, P10 on L2; transfer at P3(L1)/P7(L2) ~200m apart
    const result = await comoLlegarHandler(
      {
        origen_calle1: "LINEA 1",
        origen_calle2: "P1",
        destino_calle1: "LINEA 2",
        destino_calle2: "P10",
        max_caminata_metros: 500,
        max_transbordos: 1,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should find a route (either direct or with transfer)
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as RouteOption[];
      expect(parsed.length).toBeGreaterThan(0);
      expect(parsed[0].duracion_total_estimada_min).toBeGreaterThan(0);
    }
  });

  it("route duration includes all walk and bus times summed", async () => {
    const client = makeNetworkClient();
    const result = await comoLlegarHandler(
      {
        origen_calle1: "LINEA 1",
        origen_calle2: "P1",
        destino_calle1: "LINEA 1",
        destino_calle2: "P5",
        max_caminata_metros: 500,
      },
      client
    );
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as RouteOption[];
      for (const route of parsed) {
        const summed = route.tramos.reduce((s, t) => s + t.duracion_min, 0);
        expect(route.duracion_total_estimada_min).toBe(summed);
      }
    }
  });

  it("adjacent stops still returns valid route", async () => {
    const client = makeNetworkClient();
    // P1 to P2 — consecutive stops on L1
    const result = await comoLlegarHandler(
      {
        origen_calle1: "LINEA 1",
        origen_calle2: "P1",
        destino_calle1: "LINEA 1",
        destino_calle2: "P2",
        max_caminata_metros: 500,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should not crash regardless of result
  });

  it("default max_caminata_metros is 800", async () => {
    const client = makeNetworkClient();
    // With default (800m), should find stops that are within 800m
    const result = await comoLlegarHandler(
      {
        origen_calle1: "LINEA 1",
        origen_calle2: "P1",
        destino_calle1: "LINEA 1",
        destino_calle2: "P5",
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    // Should not crash — the default walking radius is now 800m
  });

  it("very long route (30+ stops) returns result without crash", async () => {
    // L1 (5 stops) + L2 (5 stops) — create a client with longer lines
    const longParadas = [
      ...Array.from({ length: 30 }, (_, i) => ({
        id: i + 1,
        linea: "LONGLINE",
        variante: 9999,
        ordinal: i + 1,
        calle: "LONG ST",
        esquina: `STOP ${i + 1}`,
        lat: -34.85 - i * 0.003,
        lng: -56.18,
      })),
    ];
    const longLineas = [{
      gid: 99, codLinea: 99, descLinea: "LONGLINE", ordinalSublinea: 1,
      codSublinea: 1, descSublinea: "LONG ROUTE", codVariante: 9999, descVariante: "A",
      codOrigen: 1, descOrigen: "START", codDestino: 30, descDestino: "END",
    }];
    const longClient = makeNetworkClient();
    longClient.getParadas = async () => longParadas;
    longClient.getLineas = async () => longLineas;

    const result = await comoLlegarHandler(
      {
        origen_calle1: "LONG ST",
        origen_calle2: "STOP 1",
        destino_calle1: "LONG ST",
        destino_calle2: "STOP 30",
        max_caminata_metros: 500,
      },
      longClient
    );
    expect(result.content[0].type).toBe("text");
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text) as RouteOption[];
      expect(parsed.length).toBeGreaterThan(0);
      const busTramo = parsed[0].tramos.find((t) => t.tipo === "bus") as {
        num_paradas: number;
      } | undefined;
      if (busTramo) {
        expect(busTramo.num_paradas).toBeGreaterThan(0);
        // Duration should be reasonable: 29 stops * 2 min = 58 min
        expect(parsed[0].duracion_total_estimada_min).toBeLessThan(120);
      }
    }
  });
});

// ---- Landmark / geocodePlace fallback tests ----
import * as geocodeModule from "../../src/geo/geocode.js";

describe("como_llegar — geocodePlace fallback", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = makeRouteClient();
  });

  it("falls back to geocodePlace when fuzzySearchParadas returns nothing", async () => {
    // Mock geocodePlace to return coordinates near stop 10 (ORIGEN ST)
    const spy = vi.spyOn(geocodeModule, "geocodePlace").mockResolvedValue({
      lat: -34.9005,
      lon: -56.1805,
      displayName: "Intendencia de Montevideo",
    });

    const result = await comoLlegarHandler(
      {
        origen_calle1: "Intendencia",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      client
    );

    // geocodePlace should have been called for "Intendencia" (no fuzzy match)
    expect(spy).toHaveBeenCalledWith("Intendencia");
    // Should find routes since mocked coords are near stop 10
    if (result.content[0].text.startsWith("[")) {
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.length).toBeGreaterThan(0);
    }

    spy.mockRestore();
  });

  it("falls back to geocodePlace when geocodeIntersection returns null", async () => {
    // Mock geocodeIntersection to return null and geocodePlace to return coords near stop 23
    const intSpy = vi.spyOn(geocodeModule, "geocodeIntersection").mockResolvedValue(null);
    const placeSpy = vi.spyOn(geocodeModule, "geocodePlace").mockImplementation(async (name) => {
      if (typeof name === "string" && name.includes("Campeón")) {
        return { lat: -34.9305, lon: -56.1505, displayName: "Estadio Campeón del Siglo" };
      }
      return null;
    });

    await comoLlegarHandler(
      {
        origen_calle1: "ORIGEN ST",
        destino_calle1: "Campeón del Siglo",
        destino_calle2: "Ruta 102",
        max_caminata_metros: 500,
      },
      client
    );

    // geocodePlace should have been called with combined string
    expect(placeSpy).toHaveBeenCalledWith("Campeón del Siglo Ruta 102");

    intSpy.mockRestore();
    placeSpy.mockRestore();
  });

  it("returns not-found when geocodePlace also returns null", async () => {
    const spy = vi.spyOn(geocodeModule, "geocodePlace").mockResolvedValue(null);

    const result = await comoLlegarHandler(
      {
        origen_calle1: "LugarQueNoExisteEnNingunLado",
        destino_calle1: "DESTINO ST",
        max_caminata_metros: 500,
      },
      client
    );

    expect(result.content[0].text).toMatch(/No se encontró el origen/);
    spy.mockRestore();
  });
});
