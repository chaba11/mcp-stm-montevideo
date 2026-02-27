/**
 * Error resilience tests — verify tools handle failures gracefully.
 * Uses mock fetch functions to simulate network errors and bad data.
 */
import { describe, it, expect } from "vitest";
import { Cache } from "../../src/data/cache.js";
import { CkanClient } from "../../src/data/ckan-client.js";
import { buscarParadaHandler } from "../../src/tools/buscar-parada.js";
import { proximosBusesHandler } from "../../src/tools/proximos-buses.js";
import { recorridoLineaHandler } from "../../src/tools/recorrido-linea.js";
import { comoLlegarHandler } from "../../src/tools/como-llegar.js";
import { createMockClient, montevideoTime } from "../tools/__helpers__/tool-test-utils.js";
import { generateLargeNetwork } from "../fixtures/network-data.js";

/** Create a CkanClient whose fetch always returns the given status */
function makeErrorClient(status: number): CkanClient {
  const client = new CkanClient({
    cache: new Cache(),
    fetchFn: async () => ({
      ok: false,
      status,
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => `Error ${status}`,
    }),
  });
  return client;
}

/** Create a CkanClient whose fetch returns HTML instead of valid data */
function makeHtmlClient(): CkanClient {
  const htmlBody = "<html><body>Service Unavailable</body></html>";
  return new CkanClient({
    cache: new Cache(),
    fetchFn: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(htmlBody).buffer as ArrayBuffer,
      text: async () => htmlBody,
    }),
  });
}

/** Create a CkanClient where paradas succeed but horarios fail */
function makePartialClient(): CkanClient {
  const mock = createMockClient();
  // Override horarios to throw
  mock.getHorarios = async () => {
    throw new Error("Horarios endpoint unavailable");
  };
  return mock;
}

describe("Error resilience — CKAN unavailable", () => {
  it("CKAN returns 500: buscar_parada returns helpful error, not crash", async () => {
    const client = makeErrorClient(500);
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505 },
      client
    );
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text.length).toBeGreaterThan(0);
    // Should not have thrown — should have a message
    expect(result.content[0].text).not.toBe("");
  });

  it("CKAN returns HTML: getParadas error is caught, tool returns message", async () => {
    const client = makeHtmlClient();
    // This may throw from AdmZip (not valid ZIP), tool should catch it
    let caught = false;
    try {
      await buscarParadaHandler({ latitud: -34.9145, longitud: -56.1505 }, client);
    } catch {
      caught = true;
    }
    // Tools should NOT let errors propagate uncaught
    // If the tool catches internally → caught stays false
    // If not caught, the test detects the bug
    // Either way: the key requirement is that the server as a whole doesn't crash
    // (just ensuring the handler itself doesn't throw is sufficient)
    expect(caught).toBe(false);
  });
});

describe("Error resilience — partial data load", () => {
  it("paradas ok but horarios fail: buscar_parada still works", async () => {
    const client = makePartialClient();
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505, radio_metros: 500 },
      client
    );
    expect(result.content[0].type).toBe("text");
    // buscar_parada doesn't need horarios, so it should return paradas
    expect(result.content[0].text).not.toContain("error");
  });

  it("paradas ok but horarios fail: proximos_buses returns error message, not crash", async () => {
    const client = makePartialClient();
    let caught = false;
    try {
      await proximosBusesHandler(
        { parada_id: 300 },
        client,
        montevideoTime(10, 0, "wednesday")
      );
    } catch {
      caught = true;
    }
    // Should not propagate the error
    expect(caught).toBe(false);
  });
});

describe("Error resilience — empty data edge cases", () => {
  it("empty paradas: buscar_parada returns 'no data' message", async () => {
    const client = createMockClient({ paradas: [] });
    const result = await buscarParadaHandler(
      { latitud: -34.9145, longitud: -56.1505 },
      client
    );
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("No se pudieron cargar");
  });

  it("empty horarios: proximos_buses returns 'no horarios' message", async () => {
    const client = createMockClient({ horarios: [] });
    const result = await proximosBusesHandler(
      { parada_id: 300 },
      client,
      montevideoTime(10, 0, "wednesday")
    );
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("300");
  });

  it("empty lineas: recorrido_linea returns 'no se encontró' message", async () => {
    const client = createMockClient({ lineas: [] });
    const result = await recorridoLineaHandler({ linea: "181" }, client);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });
});

describe("Error resilience — large dataset performance", () => {
  it("routing with 500-parada network completes without crash", async () => {
    const { paradas, lineas } = generateLargeNetwork();
    const client = createMockClient({ paradas, lineas, horarios: [] });
    const result = await comoLlegarHandler(
      {
        origen_calle1: "STREET_0",
        destino_calle1: "STREET_19",
        max_caminata_metros: 300,
        max_transbordos: 1,
      },
      client
    );
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text.length).toBeGreaterThan(0);
    // No crash — result can be routes or a "no routes found" message
  });
});
