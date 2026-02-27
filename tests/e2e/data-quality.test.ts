/**
 * Data quality tests — verify fixture data is consistent and well-formed.
 * Also verifies data integrity rules that the CKAN client should enforce.
 */
import { describe, it, expect } from "vitest";
import {
  PARADAS_FIXTURE,
  HORARIOS_FIXTURE,
  LINEAS_FIXTURE,
} from "../fixtures/schedule-data.js";
import { PARADAS_NETWORK, LINEAS_NETWORK } from "../fixtures/network-data.js";

// Montevideo bounding box (generous tolerance)
const MVD_LAT_MIN = -34.97;
const MVD_LAT_MAX = -34.70;
const MVD_LON_MIN = -56.45;
const MVD_LON_MAX = -55.90;

function isValidHmm(hmm: number): boolean {
  if (typeof hmm !== "number" || isNaN(hmm)) return false;
  const h = Math.floor(hmm / 100);
  const m = hmm % 100;
  return h >= 0 && h <= 29 && m >= 0 && m <= 59; // allow >24h for late night (dia_anterior)
}

describe("Data quality — PARADAS_FIXTURE", () => {
  it("no duplicate parada IDs", () => {
    // Each unique (id, variante) parada should appear at most once
    // But the same stop can appear multiple times for different lines
    // The key constraint: same (id) should have consistent coordinates
    const coordsByParadaId = new Map<number, { lat: number; lng: number }>();
    for (const p of PARADAS_FIXTURE) {
      const existing = coordsByParadaId.get(p.id);
      if (existing) {
        // Same parada_id must have the same coordinates
        expect(existing.lat).toBeCloseTo(p.lat, 5);
        expect(existing.lng).toBeCloseTo(p.lng, 5);
      } else {
        coordsByParadaId.set(p.id, { lat: p.lat, lng: p.lng });
      }
    }
    // Ensure we actually have some paradas
    expect(coordsByParadaId.size).toBeGreaterThan(0);
  });

  it("all paradas have valid Montevideo coordinates", () => {
    let invalidCount = 0;
    for (const p of PARADAS_FIXTURE) {
      const validLat = p.lat >= MVD_LAT_MIN && p.lat <= MVD_LAT_MAX;
      const validLon = p.lng >= MVD_LON_MIN && p.lng <= MVD_LON_MAX;
      if (!validLat || !validLon) invalidCount++;
    }
    expect(invalidCount).toBe(0);
  });

  it("all paradas have non-empty calle field", () => {
    for (const p of PARADAS_FIXTURE) {
      expect(p.calle.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("Data quality — HORARIOS_FIXTURE", () => {
  it("all horario times are valid hmm format (0-2959)", () => {
    let invalidCount = 0;
    for (const h of HORARIOS_FIXTURE) {
      if (!isValidHmm(h.hora)) invalidCount++;
    }
    expect(invalidCount).toBe(0);
  });

  it("every cod_variante in horarios exists in LINEAS_FIXTURE", () => {
    const validVariantes = new Set(LINEAS_FIXTURE.map((l) => l.codVariante));
    const unknownVariantes = new Set<number>();
    for (const h of HORARIOS_FIXTURE) {
      if (!validVariantes.has(h.cod_variante)) {
        unknownVariantes.add(h.cod_variante);
      }
    }
    expect(unknownVariantes.size).toBe(0);
  });

  it("every cod_ubic_parada in horarios exists in PARADAS_FIXTURE", () => {
    const validParadaIds = new Set(PARADAS_FIXTURE.map((p) => p.id));
    const orphanParadas = new Set<number>();
    for (const h of HORARIOS_FIXTURE) {
      if (!validParadaIds.has(h.cod_ubic_parada)) {
        orphanParadas.add(h.cod_ubic_parada);
      }
    }
    expect(orphanParadas.size).toBe(0);
  });

  it("dia_anterior values are only N, S, or *", () => {
    for (const h of HORARIOS_FIXTURE) {
      expect(["N", "S", "*"]).toContain(h.dia_anterior);
    }
  });

  it("tipo_dia values are only 1, 2, or 3", () => {
    for (const h of HORARIOS_FIXTURE) {
      expect([1, 2, 3]).toContain(h.tipo_dia);
    }
  });
});

describe("Data quality — PARADAS_NETWORK", () => {
  it("no duplicate (id, variante) pairs in PARADAS_NETWORK", () => {
    const seen = new Set<string>();
    for (const p of PARADAS_NETWORK) {
      const key = `${p.id}:${p.variante}`;
      expect(seen.has(key), `Duplicate parada: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it("all LINEAS_NETWORK variants reference a parada in PARADAS_NETWORK", () => {
    const paradaVariantes = new Set(PARADAS_NETWORK.map((p) => p.variante));
    for (const l of LINEAS_NETWORK) {
      expect(paradaVariantes.has(l.codVariante)).toBe(true);
    }
  });
});
