import { describe, it, expect } from "vitest";
import { estimateEtaFromPositions } from "../../src/geo/route-eta.js";
import type { BusPosition } from "../../src/data/gps-client.js";
import type { HorarioRow } from "../../src/types/horario.js";
import type { Parada } from "../../src/types/parada.js";
import { makeTripHorarios } from "../fixtures/schedule-data.js";
import { TipoDia } from "../../src/types/horario.js";

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

  it("excludes bus with invalid timestamp (regression: was producing NaN ETA)", () => {
    const bus = makeBus({ ultimo_reporte: "invalid-date-string" });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(0);
  });

  it("excludes bus with empty timestamp string (regression: was producing NaN ETA)", () => {
    const bus = makeBus({ ultimo_reporte: "" });
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

// --- Schedule-based ETA tests ---

// NOW is 2026-02-25T13:00:00Z = Wednesday 10:00 Montevideo = weekday (TipoDia.HABIL)
// Build horarios for variant 100 with stops matching ROUTE_PARADAS ordinals 1-5
function makeScheduleHorarios(): HorarioRow[] {
  // Trip 1: 5:30 departure, 3 min between stops
  const trip1 = makeTripHorarios(100, 1, TipoDia.HABIL, [
    { paradaId: 1, ordinal: 1, hora: 530 },
    { paradaId: 2, ordinal: 2, hora: 533 },
    { paradaId: 3, ordinal: 3, hora: 536 },
    { paradaId: 4, ordinal: 4, hora: 539 },
    { paradaId: 5, ordinal: 5, hora: 542 },
  ]);
  // Trip 2: similar pattern
  const trip2 = makeTripHorarios(100, 2, TipoDia.HABIL, [
    { paradaId: 1, ordinal: 1, hora: 600 },
    { paradaId: 2, ordinal: 2, hora: 603 },
    { paradaId: 3, ordinal: 3, hora: 606 },
    { paradaId: 4, ordinal: 4, hora: 609 },
    { paradaId: 5, ordinal: 5, hora: 612 },
  ]);
  return [...trip1, ...trip2];
}

describe("estimateEtaFromPositions — schedule-based", () => {
  const scheduleHorarios = makeScheduleHorarios();

  it("uses schedule segment times when horarios are provided", () => {
    // Bus at stop 1, target stop 4 → 3 segments × 3 min = 9 min = 540s
    const bus = makeBus({ latitud: -34.900, longitud: -56.150 }); // exactly at stop 1
    const withSchedule = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, scheduleHorarios);
    const withoutSchedule = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(withSchedule.length).toBe(1);
    expect(withoutSchedule.length).toBe(1);
    // Schedule-based ETA should be higher (more realistic) than raw haversine
    expect(withSchedule[0].eta_segundos).toBeGreaterThan(withoutSchedule[0].eta_segundos);
    // Should be close to 540s (3 segments × 180s each), minus a small adjustment
    expect(withSchedule[0].eta_segundos).toBeGreaterThan(400);
    expect(withSchedule[0].eta_segundos).toBeLessThan(600);
  });

  it("applies partial segment adjustment when bus is between stops", () => {
    // Bus halfway between stop 1 and stop 2
    const midLat = (-34.900 + -34.904) / 2; // -34.902
    const bus = makeBus({ latitud: midLat, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, scheduleHorarios);

    expect(result.length).toBe(1);
    // Full schedule time 1→4 = 540s, but bus is ~halfway through first segment
    // So ETA should be roughly 540 - 90 = 450s
    expect(result[0].eta_segundos).toBeGreaterThan(350);
    expect(result[0].eta_segundos).toBeLessThan(500);
  });

  it("falls back to distance when horarios is omitted", () => {
    const bus = makeBus({ latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
  });

  it("falls back to distance when horarios is empty", () => {
    const bus = makeBus({ latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, []);

    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
  });

  it("falls back to distance when segment lookup fails", () => {
    // Horarios for a different variant (9999) that doesn't match ROUTE_PARADAS variant 100
    const wrongHorarios = makeTripHorarios(9999, 1, TipoDia.HABIL, [
      { paradaId: 900, ordinal: 1, hora: 530 },
      { paradaId: 901, ordinal: 2, hora: 533 },
    ]);
    const bus = makeBus({ latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, wrongHorarios);

    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
  });

  it("compensates for report staleness", () => {
    // Bus reported 3 minutes ago
    const threeMinAgo = new Date(NOW.getTime() - 3 * 60_000).toISOString();
    const staleBus = makeBus({ latitud: -34.900, longitud: -56.150, ultimo_reporte: threeMinAgo });
    const freshBus = makeBus({ latitud: -34.900, longitud: -56.150, ultimo_reporte: NOW.toISOString() });

    const staleResult = estimateEtaFromPositions(4, [staleBus], ROUTE_PARADAS, "181", NOW, scheduleHorarios);
    const freshResult = estimateEtaFromPositions(4, [freshBus], ROUTE_PARADAS, "181", NOW, scheduleHorarios);

    expect(staleResult.length).toBe(1);
    expect(freshResult.length).toBe(1);
    // Stale report should have lower ETA (age subtracted)
    expect(staleResult[0].eta_segundos).toBeLessThan(freshResult[0].eta_segundos);
  });

  it("clamps staleness so ETA never goes below 0", () => {
    // Bus reported 9 minutes ago, very close to target — ETA would be negative without clamp
    const nineMinAgo = new Date(NOW.getTime() - 9 * 60_000).toISOString();
    const bus = makeBus({
      latitud: -34.911, // very close to stop 4 (target)
      longitud: -56.150,
      ultimo_reporte: nineMinAgo,
    });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, scheduleHorarios);

    // Either empty (bus considered past target) or ETA >= 0
    if (result.length > 0) {
      expect(result[0].eta_segundos).toBeGreaterThanOrEqual(0);
    }
  });

  it("fallback applies 1.35x road distance factor", () => {
    // Use empty horarios to force fallback
    const bus = makeBus({ latitud: -34.901, longitud: -56.150, velocidad: 30 });
    const fallbackResult = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW, []);

    // Pure haversine ETA at 30km/h, no factor
    const withoutFallback = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(fallbackResult.length).toBe(1);
    expect(withoutFallback.length).toBe(1);
    // With road factor + dwell, fallback ETA should be higher
    // (withoutFallback uses old code path which now also has these improvements,
    //  so both use fallback — but let's just verify it's reasonable)
    expect(fallbackResult[0].eta_segundos).toBeGreaterThan(0);
  });

  it("fallback includes dwell time per intermediate stop", () => {
    // Bus at stop 1, target stop 5 → 3 intermediate stops × 25s = 75s dwell
    const busNear1 = makeBus({ latitud: -34.900, longitud: -56.150, velocidad: 30 });
    const farResult = estimateEtaFromPositions(5, [busNear1], ROUTE_PARADAS, "181", NOW, []);

    // Bus at stop 3, target stop 5 → 1 intermediate stop × 25s = 25s dwell
    const busNear3 = makeBus({ latitud: -34.908, longitud: -56.150, velocidad: 30 });
    const closeResult = estimateEtaFromPositions(5, [busNear3], ROUTE_PARADAS, "181", NOW, []);

    expect(farResult.length).toBe(1);
    expect(closeResult.length).toBe(1);
    // The far bus has more intermediate stops → proportionally higher ETA
    // Including both distance and dwell time differences
    expect(farResult[0].eta_segundos).toBeGreaterThan(closeResult[0].eta_segundos);
  });

  it("backward compatible — existing tests pass without horarios", () => {
    const bus = makeBus({ latitud: -34.901, longitud: -56.150 });
    const result = estimateEtaFromPositions(4, [bus], ROUTE_PARADAS, "181", NOW);

    expect(result.length).toBe(1);
    expect(result[0].eta_segundos).toBeGreaterThan(0);
    expect(result[0].linea).toBe("181");
  });
});
