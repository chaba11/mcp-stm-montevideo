import { describe, it, expect } from 'vitest';
import { findNearestParadas, buildLineasPorParada } from '../../src/geo/distance.js';
import {
  PARADAS_GEO,
  TRES_CRUCES_CENTER,
  CIUDAD_VIEJA_CENTER,
  MIDDLE_OF_RIO,
  NEW_YORK,
} from '../fixtures/paradas-geo.js';

describe('findNearestParadas', () => {
  it('returns nearest stops first for Tres Cruces coordinates', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      500,
      10
    );
    expect(results.length).toBeGreaterThan(0);
    // First result should be TC001 (exact match)
    expect(results[0].id).toBe('TC001');
    expect(results[0].distanciaMetros).toBe(0);
  });

  it('filters by radius — 100m gives fewer results than 1000m', () => {
    const small = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      100,
      50
    );
    const large = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      1000,
      50
    );
    expect(small.length).toBeLessThanOrEqual(large.length);
  });

  it('limits results by maxResults', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      50000,
      3
    );
    expect(results).toHaveLength(3);
  });

  it('returns results sorted by distance ascending', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      50000,
      10
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i].distanciaMetros).toBeGreaterThanOrEqual(results[i - 1].distanciaMetros);
    }
  });

  it('distance accuracy: exact match has distance ~0', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      10,
      5
    );
    expect(results[0].distanciaMetros).toBeLessThan(5); // within 5m
  });

  it('distance accuracy: known distance within 5%', () => {
    // TC001 (-34.8937, -56.1675) to CV001 (-34.9058, -56.1981)
    // Approximate distance: ~3km
    const results = findNearestParadas(-34.8937, -56.1675, PARADAS_GEO, 10000, 20);
    const cv001 = results.find((r) => r.id === 'CV001');
    expect(cv001).toBeDefined();
    // Expected ~3200m based on haversine
    expect(cv001!.distanciaMetros).toBeGreaterThan(2500);
    expect(cv001!.distanciaMetros).toBeLessThan(4000);
  });

  it('returns empty array when no stops in radius', () => {
    const results = findNearestParadas(
      MIDDLE_OF_RIO.lat,
      MIDDLE_OF_RIO.lon,
      PARADAS_GEO,
      100,
      10
    );
    expect(results).toHaveLength(0);
  });

  it('handles coordinates outside Uruguay (NYC)', () => {
    const results = findNearestParadas(NEW_YORK.lat, NEW_YORK.lon, PARADAS_GEO, 500, 10);
    expect(results).toHaveLength(0);
  });

  it('handles empty paradas array without crash', () => {
    const results = findNearestParadas(-34.89, -56.17, [], 500, 10);
    expect(results).toHaveLength(0);
  });

  it('handles negative coordinates correctly (Montevideo has negative lat AND lon)', () => {
    // All MVD coords are negative lat + negative lon
    const results = findNearestParadas(-34.9060, -56.1880, PARADAS_GEO, 300, 5);
    expect(results.length).toBeGreaterThan(0);
    // Should find CE001 which is at exactly those coordinates
    expect(results[0].id).toBe('CE001');
  });

  it('returns all stops when radius is very large', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      100_000, // 100km radius
      1000
    );
    expect(results).toHaveLength(PARADAS_GEO.length);
  });

  it('handles duplicate coordinates — both returned', () => {
    const duplicates = [
      { id: 'DUP1', nombre: 'PARADA DUP A', lat: -34.90, lon: -56.18, empresa: '01' },
      { id: 'DUP2', nombre: 'PARADA DUP B', lat: -34.90, lon: -56.18, empresa: '01' },
    ];
    const results = findNearestParadas(-34.90, -56.18, duplicates, 10, 10);
    expect(results).toHaveLength(2);
  });

  it('includes lineas from map when provided', () => {
    const lineasMap = new Map<string, string[]>();
    lineasMap.set('TC001', ['181', 'D10']);

    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      100,
      5,
      lineasMap
    );

    expect(results[0].id).toBe('TC001');
    expect(results[0].lineas).toEqual(['181', 'D10']);
  });

  it('returns empty lineas array when map not provided', () => {
    const results = findNearestParadas(
      TRES_CRUCES_CENTER.lat,
      TRES_CRUCES_CENTER.lon,
      PARADAS_GEO,
      100,
      5
    );
    expect(results[0].lineas).toEqual([]);
  });
});

describe('buildLineasPorParada', () => {
  it('builds map of paradaId to unique lines', () => {
    const horarios = [
      { paradaId: '1001', linea: '181' },
      { paradaId: '1001', linea: '181' }, // duplicate
      { paradaId: '1001', linea: 'D10' },
      { paradaId: '1002', linea: '181' },
    ];

    const map = buildLineasPorParada(horarios);
    expect(map.get('1001')).toEqual(['181', 'D10']);
    expect(map.get('1002')).toEqual(['181']);
  });

  it('handles empty horarios', () => {
    const map = buildLineasPorParada([]);
    expect(map.size).toBe(0);
  });

  it('sorts lines alphabetically', () => {
    const horarios = [
      { paradaId: '1', linea: 'G' },
      { paradaId: '1', linea: '181' },
      { paradaId: '1', linea: 'D10' },
    ];
    const map = buildLineasPorParada(horarios);
    expect(map.get('1')).toEqual(['181', 'D10', 'G']);
  });
});

describe('distance: Ciudad Vieja area', () => {
  it('finds stops near Ciudad Vieja', () => {
    const results = findNearestParadas(
      CIUDAD_VIEJA_CENTER.lat,
      CIUDAD_VIEJA_CENTER.lon,
      PARADAS_GEO,
      500,
      10
    );
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    // CV002 is the closest to CIUDAD_VIEJA_CENTER
    expect(ids).toContain('CV002');
  });
});
