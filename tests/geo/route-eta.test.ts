import { describe, it, expect } from "vitest";
import { estimateEtaFromPositions } from "../../src/geo/route-eta.js";
import type { BusPosition } from "../../src/data/gps-client.js";
import type { Parada } from "../../src/types/parada.js";

// A simple route: 5 stops roughly 500m apart along a line
const ROUTE_PARADAS: Parada[] = [
  { id: 1, linea: "181", variante: 100, ordinal: 1, calle: "A", esquina: "", lat: -34.900, lng: -56.150 },
  { id: 2, linea: "181", variante: 100, ordinal: 2, calle: "B", esquina: "", lat: -34.904, lng: -56.150 },
  { id: 3, linea: "181", variante: 100, ordinal: 3, calle: "C", esquina: "", lat: -34.908, lng: -56.150 },
  { id: 4, linea: "181", variante: 100, ordinal: 4, calle: "D", esquina: "", lat: -34.912, lng: -56.150 },
  { id: 5, linea: "181", variante: 100, ordinal: 5, calle: "E", esquina: "", lat: -34.916, lng: -56.150 },
];

const NOW = new Date("2026-02-25T13:00:00Z"); // 10:00 Montevideo
const FRESH_TIMESTAMP = new Date(NOW.getTime() - 60_000).toISOString(); // 1 min ago
const STALE_TIMESTAMP = new Date(NOW.getTime() - 15 * 60_000).toISOString(); // 15 min ago

function makeBus(overrides: Partial<BusPosition> = {}): BusPosition {
  return {
    id_vehiculo: "BUS-1",
    latitud: -34.901, // near stop 1
    longitud: -56.150,
    velocidad: 30, // 30 km/h
    cod_variante: 100,
    destino: "CENTRO",
    ultimo_reporte: FRESH_TIMESTAMP,
    ...overrides,
  };
}

describe("estimateEtaFromPositions", () => {
  it("calculates ETA for a bus 3 stops before the target", () => {
    // Bus near stop 1, target is stop 4
    const bus = makeBus({ latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(1);
    expect(result[0].linea).toBe("181");
    expect(result[0].id_vehiculo).toBe("BUS-1");
    expect(result[0].eta_segundos).toBeGreaterThan(0);
    expect(result[0].distancia_metros).toBeGreaterThan(0);
    // ~1.3km at 30km/h should be roughly 150-160 seconds
    expect(result[0].eta_segundos).toBeGreaterThan(100);
    expect(result[0].eta_segundos).toBeLessThan(300);
  });

  it("excludes bus that already passed the target stop", () => {
    // Bus near stop 5, target is stop 3 → bus is past the target
    const bus = makeBus({ latitud: -34.916, longitud: -56.150 });
    const result = estimateEtaFromPositions(3, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(0);
  });

  it("uses default 20 km/h when speed is 0", () => {
    const bus = makeBus({ velocidad: 0, latitud: -34.901 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(1);
    // At default 20 km/h (~5.56 m/s), ~1.3km should take ~234s
    // This is slower than 30 km/h, so ETA should be larger
    const fastBus = makeBus({ velocidad: 30, latitud: -34.901 });
    const fastResult = estimateEtaFromPositions(4, [fastBus], ROUTE_PARADAS, "181", NOW);
    expect(result[0].eta_segundos).toBeGreaterThan(fastResult[0].eta_segundos);
  });

  it("uses default speed when speed is below MIN_SPEED_KMH (5)", () => {
    const bus = makeBus({ velocidad: 3, latitud: -34.901 });
    const zeroSpeedBus = makeBus({ velocidad: 0, latitud: -34.901 });

    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);
    const zeroResult = estimateEtaFromPositions(4, [zeroSpeedBus], ROUTE_PARADAS, "181", NOW);

    // Both should use default 20 km/h → same ETA
    expect(result[0].eta_segundos).toBe(zeroResult[0].eta_segundos);
  });

  it("excludes stale data (>10 minutes old)", () => {
    const bus = makeBus({ ultimo_reporte: STALE_TIMESTAMP });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(0);
  });

  it("falls back to all variants when cod_variante does not match any route", () => {
    const bus = makeBus({ cod_variante: 999 }); // no matching paradas for this exact variant
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    // Should still find a match by trying all available variants
    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
  });

  it("sorts multiple buses by ETA ascending", () => {
    const closeBus = makeBus({
      id_vehiculo: "CLOSE",
      latitud: -34.909, // near stop 3
    });
    const farBus = makeBus({
      id_vehiculo: "FAR",
      latitud: -34.901, // near stop 1
    });

    const result = estimateEtaFromPositions(5, [farBus, closeBus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(2);
    expect(result[0].id_vehiculo).toBe("CLOSE");
    expect(result[1].id_vehiculo).toBe("FAR");
    expect(result[0].eta_segundos).toBeLessThan(result[1].eta_segundos);
  });

  it("returns empty array for empty bus positions", () => {
    const result = estimateEtaFromPositions(4, [], ROUTE_PARADAS, "181", NOW);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty route paradas", () => {
    const bus = makeBus();
    const result = estimateEtaFromPositions(4, [bus], [], "181", NOW);
    expect(result).toEqual([]);
  });

  it("returns empty when target stop is not in the variant", () => {
    const bus = makeBus();
    // Stop 999 doesn't exist in ROUTE_PARADAS
    const result = estimateEtaFromPositions(999, [bus], ROUTE_PARADAS, "181", NOW);
    expect(result).toEqual([]);
  });

  it("handles multiple variants — only matches bus to its own variant", () => {
    const variantBParadas: Parada[] = [
      { id: 10, linea: "181", variante: 200, ordinal: 1, calle: "X", esquina: "", lat: -34.920, lng: -56.160 },
      { id: 4, linea: "181", variante: 200, ordinal: 2, calle: "Y", esquina: "", lat: -34.924, lng: -56.160 },
    ];
    const allParadas = [...ROUTE_PARADAS, ...variantBParadas];

    // Bus is on variant 200, near stop 10
    const bus = makeBus({ cod_variante: 200, latitud: -34.921, longitud: -56.160 });
    // Target is stop 4 which exists in BOTH variants
    const result = estimateEtaFromPositions(4, [bus], allParadas, "181", NOW);

    expect(result.length).toBe(1);
    // Should use variant 200's route (2 stops), not variant 100's
    expect(result[0].distancia_metros).toBeLessThan(1000);
  });

  it("cod_variante=0 tries all variants and picks best match", () => {
    // Bus with unknown variant near stop 1 of variant 100
    const bus = makeBus({ cod_variante: 0, latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    // Should still get an ETA by matching against variant 100
    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
  });

  it("cod_variante=0 with multiple variants picks shortest ETA", () => {
    // Variant 200: bus is closer to target
    const variantBParadas: Parada[] = [
      { id: 10, linea: "181", variante: 200, ordinal: 1, calle: "X", esquina: "", lat: -34.910, lng: -56.150 },
      { id: 4, linea: "181", variante: 200, ordinal: 2, calle: "D", esquina: "", lat: -34.912, lng: -56.150 },
    ];
    const allParadas = [...ROUTE_PARADAS, ...variantBParadas];

    // Bus with unknown variant — position near stop 3 of variant 100 and stop 10 of variant 200
    const bus = makeBus({ cod_variante: 0, latitud: -34.909, longitud: -56.150 });
    // Target stop 4 exists in both variants
    const result = estimateEtaFromPositions(4, [bus], allParadas, "181", NOW);

    expect(result.length).toBe(1);
    // Should pick the shortest ETA (variant 200 is closer)
    expect(result[0].distancia_metros).toBeLessThan(1000);
  });
});
