/**
 * Live integration tests against the real CKAN API.
 *
 * These tests are skipped by default. To run them:
 *   npm run test:integration
 *
 * Set SKIP_LIVE_TESTS=1 to skip even when running the integration suite.
 * They require network access to datos-abiertos.montevideo.gub.uy.
 */

import { describe, it, expect } from 'vitest';

const SKIP = process.env.SKIP_LIVE_TESTS === '1';

// Attempt a quick network probe and skip gracefully if unavailable.
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

describe.skipIf(skipTest)('CKAN live — paradas dataset', () => {
  it('getParadas returns non-empty array', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const paradas = await getParadas();
    expect(paradas.length).toBeGreaterThan(100);
  });

  it('getParadas entries have required fields', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const paradas = await getParadas();
    const sample = paradas[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('nombre');
    expect(sample).toHaveProperty('lat');
    expect(sample).toHaveProperty('lon');
  });

  it('all paradas have valid WGS84 coordinates in MVD bbox', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const paradas = await getParadas();
    for (const p of paradas) {
      expect(p.lat).toBeGreaterThan(-35.1);
      expect(p.lat).toBeLessThan(-34.6);
      expect(p.lon).toBeGreaterThan(-56.5);
      expect(p.lon).toBeLessThan(-55.9);
    }
  });

  it('getParadas is cached on second call', async () => {
    const { getParadas } = await import('../../src/data/ckan-client.js');
    const t0 = Date.now();
    await getParadas();
    const t1 = Date.now();
    await getParadas();
    const t2 = Date.now();
    // Second call should be much faster (cached)
    expect(t2 - t1).toBeLessThan(t1 - t0);
  });
});

describe.skipIf(skipTest)('CKAN live — horarios dataset', () => {
  it('getHorarios returns non-empty array', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    expect(horarios.length).toBeGreaterThan(1000);
  });

  it('horario entries have required fields', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    const sample = horarios[0];
    expect(sample).toHaveProperty('paradaId');
    expect(sample).toHaveProperty('linea');
    expect(sample).toHaveProperty('variante');
    expect(sample).toHaveProperty('tipoDia');
    expect(sample).toHaveProperty('hora');
    expect(sample).toHaveProperty('minuto');
  });

  it('tipoDia values are only L, S, or D', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    const validTypes = new Set(['L', 'S', 'D']);
    for (const h of horarios.slice(0, 1000)) {
      expect(validTypes.has(h.tipoDia)).toBe(true);
    }
  });

  it('hora values are in range 0-30 (includes post-midnight)', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    for (const h of horarios.slice(0, 1000)) {
      expect(h.hora).toBeGreaterThanOrEqual(0);
      expect(h.hora).toBeLessThanOrEqual(30);
    }
  });

  it('line 181 has entries (known Montevideo line)', async () => {
    const { getHorarios } = await import('../../src/data/ckan-client.js');
    const horarios = await getHorarios();
    const linea181 = horarios.filter((h) => h.linea === '181' || h.linea === '0181');
    expect(linea181.length).toBeGreaterThan(0);
  });
});

describe.skipIf(skipTest)('CKAN live — recorridos dataset', () => {
  it('getRecorridos returns data or empty array gracefully', async () => {
    const { getRecorridos } = await import('../../src/data/ckan-client.js');
    const recorridos = await getRecorridos();
    expect(Array.isArray(recorridos)).toBe(true);
  });

  it('if recorridos non-empty, entries have required fields', async () => {
    const { getRecorridos } = await import('../../src/data/ckan-client.js');
    const recorridos = await getRecorridos();
    if (recorridos.length > 0) {
      const sample = recorridos[0];
      expect(sample).toHaveProperty('COD_LINEA');
      expect(sample).toHaveProperty('COD_VARIANTE');
      expect(sample).toHaveProperty('NRO_ORDEN');
      expect(sample).toHaveProperty('COD_PARADA_STM');
    }
  });
});
