/**
 * Performance tests for como_llegar routing.
 * These tests ensure routing remains fast even with large networks.
 */
import { describe, it, expect } from "vitest";
import { comoLlegarHandler } from "../../src/tools/como-llegar.js";
import { Cache } from "../../src/data/cache.js";
import { CkanClient } from "../../src/data/ckan-client.js";
import { PARADAS_NETWORK, LINEAS_NETWORK, generateLargeNetwork } from "../fixtures/network-data.js";

function makeClientWithData(
  paradas: Awaited<ReturnType<CkanClient["getParadas"]>>,
  lineas: Awaited<ReturnType<CkanClient["getLineas"]>>
): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache });
  client.getParadas = async () => paradas;
  client.getHorarios = async () => [];
  client.getLineas = async () => lineas;
  return client;
}

describe("como_llegar — performance", () => {
  it(
    "routing with network fixture (20 paradas) completes in < 2000ms",
    async () => {
      const client = makeClientWithData(PARADAS_NETWORK, LINEAS_NETWORK);
      const start = Date.now();
      await comoLlegarHandler(
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
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(2000);
    },
    10000
  );

  it(
    "routing with large network (500 paradas, 20 lines) completes in < 5000ms",
    async () => {
      const { paradas, lineas } = generateLargeNetwork();
      expect(paradas.length).toBeGreaterThanOrEqual(500);

      const client = makeClientWithData(paradas, lineas);
      const start = Date.now();

      // Route between first and last stop of different lines
      const firstStop = paradas[0];
      const lastStop = paradas[paradas.length - 1];

      await comoLlegarHandler(
        {
          origen_calle1: firstStop.calle,
          origen_calle2: firstStop.esquina,
          destino_calle1: lastStop.calle,
          destino_calle2: lastStop.esquina,
          max_caminata_metros: 500,
          max_transbordos: 1,
        },
        client
      );
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    },
    10000
  );

  it(
    "repeated routing calls (5x) complete in < 5000ms total",
    async () => {
      const client = makeClientWithData(PARADAS_NETWORK, LINEAS_NETWORK);
      const start = Date.now();
      for (let i = 0; i < 5; i++) {
        await comoLlegarHandler(
          {
            origen_calle1: "LINEA 1",
            origen_calle2: "P1",
            destino_calle1: "LINEA 1",
            destino_calle2: "P5",
            max_caminata_metros: 500,
          },
          client
        );
      }
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    },
    10000
  );
});
