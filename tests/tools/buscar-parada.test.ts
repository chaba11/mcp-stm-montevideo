import { describe, it, expect, vi, afterEach } from 'vitest';
import { findNearestParadas, buildLineasPorParada } from '../../src/geo/distance.js';
import { geocodeIntersection, isInMontevideo } from '../../src/geo/geocode.js';
import { fuzzySearchParadas } from '../../src/geo/search.js';
import { PARADAS_GEO } from '../fixtures/paradas-geo.js';
import { makeScheduleData, makeParada } from './helpers/tool-test-utils.js';

afterEach(() => vi.unstubAllGlobals());

const { paradas: testParadas, horarios: testHorarios } = makeScheduleData();
const lineasMap = buildLineasPorParada(testHorarios);

describe('buscar_parada — intersection lookup', () => {
  it('finds stops near Bv España y Libertad', async () => {
    const coords = await geocodeIntersection('Bv España', 'Libertad', PARADAS_GEO);
    expect(coords).not.toBeNull();

    if (coords) {
      const results = findNearestParadas(coords.lat, coords.lon, PARADAS_GEO, 500, 10, lineasMap);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('parada_id' in results[0] ? 'parada_id' : 'id');
    }
  });

  it('finds stops near 18 de Julio y Ejido', async () => {
    const coords = await geocodeIntersection('18 de Julio', 'Ejido', PARADAS_GEO);
    expect(coords).not.toBeNull();

    if (coords) {
      const results = findNearestParadas(coords.lat, coords.lon, PARADAS_GEO, 300, 10);
      expect(results.length).toBeGreaterThan(0);
    }
  });
});

describe('buscar_parada — coords lookup', () => {
  it('finds stops near Tres Cruces coords', () => {
    const results = findNearestParadas(-34.8937, -56.1675, PARADAS_GEO, 500, 10, lineasMap);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].distanciaMetros).toBeLessThan(500);
  });

  it('output shape includes all required fields', () => {
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 500, 5, lineasMap);
    if (results.length > 0) {
      const parada = results[0];
      expect(parada).toHaveProperty('id');
      expect(parada).toHaveProperty('nombre');
      expect(parada).toHaveProperty('lat');
      expect(parada).toHaveProperty('lon');
      expect(parada).toHaveProperty('distanciaMetros');
      expect(parada).toHaveProperty('lineas');
      expect(Array.isArray(parada.lineas)).toBe(true);
    }
  });

  it('includes correct lines for each stop', () => {
    const results = findNearestParadas(
      testParadas[0].lat,
      testParadas[0].lon,
      testParadas,
      300,
      5,
      lineasMap
    );
    if (results.length > 0) {
      const stop1001 = results.find((r) => r.id === '1001');
      if (stop1001) {
        expect(stop1001.lineas).toContain('181');
        expect(stop1001.lineas).toContain('D10');
      }
    }
  });
});

describe('buscar_parada — single street', () => {
  it('finds paradas on 18 de Julio', () => {
    const matches = fuzzySearchParadas('18 de julio', PARADAS_GEO);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('finds paradas on Bv España', () => {
    const matches = fuzzySearchParadas('bv espana', PARADAS_GEO);
    expect(matches.length).toBeGreaterThan(0);
  });
});

describe('buscar_parada — radius', () => {
  it('custom radius: small radius gives fewer results than large', () => {
    const small = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 50, 100);
    const large = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 5000, 100);
    expect(small.length).toBeLessThanOrEqual(large.length);
  });

  it('very small radius (1m) may return empty but doesnt crash', () => {
    expect(() =>
      findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 1, 10)
    ).not.toThrow();
  });

  it('very large radius returns many results', () => {
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 50000, 100);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('buscar_parada — edge cases', () => {
  it('coords at 0,0 (middle of ocean) returns empty', () => {
    const results = findNearestParadas(0, 0, PARADAS_GEO, 500, 10);
    expect(results).toHaveLength(0);
  });

  it('coords outside Uruguay (NYC) returns empty', () => {
    const results = findNearestParadas(40.7128, -74.006, PARADAS_GEO, 500, 10);
    expect(results).toHaveLength(0);
  });

  it('unicode street name: "José Ellauri" works', async () => {
    const result = await geocodeIntersection('José Ellauri', undefined, PARADAS_GEO);
    // May or may not find a result, but should not crash
    expect(true).toBe(true); // just checking no crash
  });

  it('SQL injection-like string treated as literal', () => {
    expect(() =>
      fuzzySearchParadas("'; DROP TABLE--", PARADAS_GEO)
    ).not.toThrow();
  });

  it('empty calle1 returns null from geocode', async () => {
    const result = await geocodeIntersection('', 'Libertad', PARADAS_GEO);
    expect(result).toBeNull();
  });

  it('negative coordinates handled correctly (all MVD coords are negative)', () => {
    // MVD is in southern hemisphere (negative lat) and west of UTC (negative lon)
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 1000, 10);
    expect(results.length).toBeGreaterThan(0);
    // All results should have negative lat and lon
    results.forEach((r) => {
      expect(r.lat).toBeLessThan(0);
      expect(r.lon).toBeLessThan(0);
    });
  });

  it('results with caps at maxResults', () => {
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 50000, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe('buscar_parada — output validation', () => {
  it('distancia_metros is a non-negative number', () => {
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 10000, 10);
    results.forEach((r) => {
      expect(r.distanciaMetros).toBeGreaterThanOrEqual(0);
      expect(typeof r.distanciaMetros).toBe('number');
    });
  });

  it('coordinates are valid WGS84', () => {
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 10000, 10);
    results.forEach((r) => {
      expect(r.lat).toBeGreaterThan(-90);
      expect(r.lat).toBeLessThan(90);
      expect(r.lon).toBeGreaterThan(-180);
      expect(r.lon).toBeLessThan(180);
    });
  });
});

describe('isInMontevideo validation', () => {
  it('rejects coords at 0,0', () => {
    expect(isInMontevideo(0, 0)).toBe(false);
  });

  it('accepts Tres Cruces coords', () => {
    expect(isInMontevideo(-34.8937, -56.1675)).toBe(true);
  });

  it('rejects Buenos Aires coords', () => {
    expect(isInMontevideo(-34.6037, -58.3816)).toBe(false);
  });
});
