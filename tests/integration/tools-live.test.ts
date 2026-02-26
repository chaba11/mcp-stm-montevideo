/**
 * Live integration tests for MCP tools with real STM data.
 *
 * These tests require network access to CKAN and Nominatim.
 * They are skipped when SKIP_LIVE_TESTS=1 or no network is available.
 */

import { describe, it, expect } from 'vitest';
import { getProximosBuses, getTipoDia } from '../../src/data/schedule.js';
import { findNearestParadas } from '../../src/geo/distance.js';

const SKIP = process.env.SKIP_LIVE_TESTS === '1';

let networkOk = false;
try {
  const res = await fetch('https://datos-abiertos.montevideo.gub.uy', {
    signal: AbortSignal.timeout(5000),
  });
  networkOk = res.ok || res.status < 500;
} catch {
  networkOk = false;
}

const skipTest = SKIP || !networkOk;

describe.skipIf(skipTest)('tools-live — buscar_parada data quality', () => {
  it('finds stops near 18 de Julio y Ejido (city centre)', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const { geocodeIntersection } = await import('../../src/geo/geocode.js');
    const paradas = await getParadas();
    const coords = await geocodeIntersection('18 de Julio', 'Ejido', paradas);
    expect(coords).not.toBeNull();
    if (coords) {
      const nearby = findNearestParadas(coords.lat, coords.lon, paradas, 400, 10);
      expect(nearby.length).toBeGreaterThan(0);
      expect(nearby[0].distanciaMetros).toBeLessThan(400);
    }
  });

  it('all nearby stops have valid coordinates', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const paradas = await getParadas();
    const nearby = findNearestParadas(-34.9060, -56.1880, paradas, 300, 20);
    for (const p of nearby) {
      expect(p.lat).toBeGreaterThan(-35.1);
      expect(p.lat).toBeLessThan(-34.6);
      expect(p.lon).toBeGreaterThan(-56.5);
      expect(p.lon).toBeLessThan(-55.9);
      expect(p.distanciaMetros).toBeGreaterThanOrEqual(0);
    }
  });
});

describe.skipIf(skipTest)('tools-live — proximos_buses data quality', () => {
  it('finds next buses for a known stop', async () => {
    const { getParadas, getHorarios } = await import('../../src/data/ckan-client.js');
    const [paradas, horarios] = await Promise.all([getParadas(), getHorarios()]);
    // Find a stop that has schedule data
    const paradaIds = new Set(horarios.map((h) => h.paradaId));
    const paradaId = [...paradaIds][0];
    if (!paradaId) return;

    const results = getProximosBuses(paradaId, horarios, 5, undefined, new Date());
    // Results may be empty if no buses today at this time, but should not throw
    expect(Array.isArray(results)).toBe(true);
  });

  it('getTipoDia returns valid type for today', () => {
    const tipo = getTipoDia(new Date());
    expect(['L', 'S', 'D']).toContain(tipo);
  });

  it('proximos_buses results have required fields', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    const paradaIds = new Set(horarios.map((h) => h.paradaId));
    const paradaId = [...paradaIds][0];
    if (!paradaId) return;

    const results = getProximosBuses(paradaId, horarios, 3, undefined, new Date());
    for (const r of results) {
      expect(r).toHaveProperty('linea');
      expect(r).toHaveProperty('horario');
      expect(r).toHaveProperty('minutosRestantes');
      expect(r.minutosRestantes).toBeGreaterThanOrEqual(0);
    }
  });
});

describe.skipIf(skipTest)('tools-live — recorrido_linea data quality', () => {
  it('getLineas returns known Montevideo lines', async () => {
    const { getLineas } = await import('../../src/data/ckan-client.js');
    const lineas = await getLineas();
    expect(lineas.length).toBeGreaterThan(0);
  });

  it('line objects have codigo and descripcion', async () => {
    const { getLineas } = await import('../../src/data/ckan-client.js');
    const lineas = await getLineas();
    if (lineas.length > 0) {
      expect(lineas[0]).toHaveProperty('codigo');
      expect(lineas[0]).toHaveProperty('descripcion');
    }
  });
});
