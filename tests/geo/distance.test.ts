import { describe, it, expect } from "vitest";
import { findNearestParadas } from "../../src/geo/distance.js";
import type { Parada } from "../../src/types/parada.js";

// Montevideo: approximate real coordinates
// Bulevar España y Libertad ~ -34.9045, -56.1738
const BV_ESPANA_LAT = -34.9045;
const BV_ESPANA_LON = -56.1738;

function makeParada(id: number, lat: number, lng: number, calle = "TEST"): Parada {
  return { id, linea: "181", variante: 52, ordinal: 1, calle, esquina: "CRUCE", lat, lng };
}

const PARADAS: Parada[] = [
  makeParada(1, -34.9045, -56.1738, "BV ESPANA"),   // exact match ~0m
  makeParada(2, -34.9050, -56.1740, "BV ESPANA"),   // ~60m away
  makeParada(3, -34.9200, -56.1738, "AV ITALIA"),   // ~1700m away
  makeParada(4, -34.9000, -56.1600, "RAMBLA"),      // ~1400m away
  makeParada(5, -34.9500, -56.2000, "POCITOS"),     // ~6000m away
];

describe("findNearestParadas", () => {
  it("finds stops within radius, sorted by distance", () => {
    const results = findNearestParadas(BV_ESPANA_LAT, BV_ESPANA_LON, PARADAS, 200);
    expect(results.length).toBe(2);
    expect(results[0].id).toBe(1); // closest
    expect(results[1].id).toBe(2);
    expect(results[0].distancia_metros).toBeLessThanOrEqual(results[1].distancia_metros);
  });

  it("respects maxResults limit", () => {
    const results = findNearestParadas(BV_ESPANA_LAT, BV_ESPANA_LON, PARADAS, 10_000, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array when no stops within radius", () => {
    // Use a location far from all fixtures (middle of Río de la Plata)
    const results = findNearestParadas(-34.5, -56.5, PARADAS, 1);
    expect(results).toEqual([]);
  });

  it("includes distancia_metros field in results", () => {
    const results = findNearestParadas(BV_ESPANA_LAT, BV_ESPANA_LON, PARADAS, 500);
    for (const r of results) {
      expect(typeof r.distancia_metros).toBe("number");
      expect(r.distancia_metros).toBeGreaterThanOrEqual(0);
    }
  });

  it("handles empty paradas array", () => {
    const results = findNearestParadas(BV_ESPANA_LAT, BV_ESPANA_LON, [], 1000);
    expect(results).toEqual([]);
  });

  it("closest stop has smallest distancia_metros", () => {
    const results = findNearestParadas(BV_ESPANA_LAT, BV_ESPANA_LON, PARADAS, 5_000);
    if (results.length > 1) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].distancia_metros).toBeLessThanOrEqual(results[i].distancia_metros);
      }
    }
  });
});
