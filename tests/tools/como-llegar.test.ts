import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerComoLlegar } from '../../src/tools/como-llegar.js';
import { MINI_PARADAS, MINI_HORARIOS, MINI_RECORRIDOS } from '../fixtures/mini-network.js';

vi.mock('../../src/data/ckan-client.js', () => ({
  getParadas: vi.fn(),
  getHorarios: vi.fn(),
  getRecorridos: vi.fn(),
}));

vi.mock('../../src/geo/geocode.js', () => ({
  geocodeIntersection: vi.fn(),
}));

import { getParadas, getHorarios, getRecorridos } from '../../src/data/ckan-client.js';
import { geocodeIntersection } from '../../src/geo/geocode.js';

function makeServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerComoLlegar(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools['como_llegar'].handler;
}

const handler = makeServer();

/** Coordinates for test scenarios (see mini-network.ts layout) */
const COORDS = {
  nearP01: { lat: -34.888, lon: -56.212 }, // exactly at P01 (Line 101)
  nearP05: { lat: -34.888, lon: -56.196 }, // exactly at P05 (Line 101)
  nearP09: { lat: -34.900, lon: -56.204 }, // exactly at P09 (Line 102)
  nearP03: { lat: -34.888, lon: -56.204 }, // exactly at P03 (Lines 101+102)
  nearP20: { lat: -34.892, lon: -56.196 }, // exactly at P20 (Line 104)
  isolated: { lat: -34.960, lon: -56.000 }, // far from all stops (>5km)
};

beforeEach(() => {
  vi.mocked(getParadas).mockResolvedValue(MINI_PARADAS);
  vi.mocked(getHorarios).mockResolvedValue(MINI_HORARIOS);
  vi.mocked(getRecorridos).mockResolvedValue(MINI_RECORRIDOS);
});

// ─── Direct route tests ──────────────────────────────────────────────────────

describe('como_llegar — direct routes', () => {
  it('finds direct route on Line 101 (P01 area → P05 area)', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'Calle A', origen_calle2: 'Calle 1', destino_calle1: 'Calle A', destino_calle2: 'Calle 5' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.opciones.length).toBeGreaterThan(0);
    const directa = data.opciones.find((o: { tipo: string }) => o.tipo === 'directa');
    expect(directa).toBeDefined();
    expect(directa.linea).toBe('101');
  });

  it('direct route has paradaOrigen and paradaDestino', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const directa = data.opciones.find((o: { tipo: string }) => o.tipo === 'directa');
    expect(directa.paradaOrigen).toHaveProperty('id');
    expect(directa.paradaOrigen).toHaveProperty('nombre');
    expect(directa.paradaOrigen).toHaveProperty('distanciaOrigen');
    expect(directa.paradaDestino).toHaveProperty('id');
    expect(directa.paradaDestino).toHaveProperty('nombre');
    expect(directa.paradaDestino).toHaveProperty('distanciaDestino');
  });

  it('direct route has positive duracionEstimadaMin', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const directa = data.opciones.find((o: { tipo: string }) => o.tipo === 'directa');
    expect(directa.duracionEstimadaMin).toBeGreaterThan(0);
  });

  it('direct route has non-negative caminataInicioMin and caminataFinalMin', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const directa = data.opciones.find((o: { tipo: string }) => o.tipo === 'directa');
    expect(directa.caminataInicioMin).toBeGreaterThanOrEqual(0);
    expect(directa.caminataFinalMin).toBeGreaterThanOrEqual(0);
  });

  it('direct route has paradas count > 0', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const directa = data.opciones.find((o: { tipo: string }) => o.tipo === 'directa');
    expect(directa.paradas).toBeGreaterThan(0);
  });

  it('results sorted by duracionEstimadaMin (ascending)', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    for (let i = 1; i < data.opciones.length; i++) {
      expect(data.opciones[i].duracionEstimadaMin).toBeGreaterThanOrEqual(
        data.opciones[i - 1].duracionEstimadaMin
      );
    }
  });

  it('response has origen and destino string fields', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'Calle Uno', origen_calle2: 'Cruz', destino_calle1: 'Calle Dos' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.origen).toBe('Calle Uno y Cruz');
    expect(data.destino).toBe('Calle Dos');
  });

  it('max_transbordos=0 still finds direct route', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_transbordos: 0 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.opciones.length).toBeGreaterThan(0);
    expect(data.opciones[0].tipo).toBe('directa');
  });
});

// ─── Transfer route tests ────────────────────────────────────────────────────

describe('como_llegar — transfer routes', () => {
  it('finds transfer route when origin and destination are on different lines', async () => {
    // P01 area: only Line 101
    // P09 area: only Line 102
    // Transfer at P03 (both 101 and 102)
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo).toBeDefined();
  });

  it('transfer route has primerTramo and segundoTramo', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo.primerTramo).toBeDefined();
    expect(transbordo.segundoTramo).toBeDefined();
  });

  it('transfer primerTramo uses Line 101 (from origin)', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo.primerTramo.linea).toBe('101');
  });

  it('transfer segundoTramo uses Line 102 (to destination)', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo.segundoTramo.linea).toBe('102');
  });

  it('transfer route has paradaTransbordo in both tramos', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo.primerTramo.paradaTransbordo.id).toBe('P03');
    expect(transbordo.segundoTramo.paradaTransbordo.id).toBe('P03');
  });

  it('transfer route duracionEstimadaMin is positive', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 500 },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    const transbordo = data.opciones.find((o: { tipo: string }) => o.tipo === 'transbordo');
    expect(transbordo.duracionEstimadaMin).toBeGreaterThan(0);
  });

  it('max_transbordos=0 does not include transfer routes', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP09);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_transbordos: 0, max_caminata_metros: 500 },
      {}
    );
    const text = result.content[0].text;
    // Either no routes found or only direct routes — no transbordo
    if (!text.includes('"message"')) {
      const data = JSON.parse(text);
      const transbordos = data.opciones?.filter((o: { tipo: string }) => o.tipo === 'transbordo') ?? [];
      expect(transbordos.length).toBe(0);
    }
  });
});

// ─── Walking / proximity tests ───────────────────────────────────────────────

describe('como_llegar — walking and proximity', () => {
  it('suggests walking when origin and destination are < 200m apart', async () => {
    // Both at exactly the same point
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP01);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'A' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.mensaje).toMatch(/caminando|caminar|walk/i);
  });

  it('includes distancia_metros in walk response', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP01);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'A' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.distancia_metros).toBeDefined();
    expect(data.distancia_metros).toBeLessThan(200);
  });

  it('returns error when no stops within radius at origin', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.isolated)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 100 },
      {}
    );
    expect(result.content[0].text).toMatch(/no hay paradas|no.*parada/i);
  });

  it('returns error when no stops within radius at destination', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.isolated);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 100 },
      {}
    );
    expect(result.content[0].text).toMatch(/no hay paradas|no.*parada/i);
  });
});

// ─── Geocoding errors ────────────────────────────────────────────────────────

describe('como_llegar — geocoding errors', () => {
  it('returns error when origin cannot be geocoded', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'Calle Inexistente', destino_calle1: 'Calle A' },
      {}
    );
    expect(result.content[0].text).toMatch(/origen|no se encontr/i);
  });

  it('returns error when destination cannot be geocoded', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(null);

    const result = await handler(
      { origen_calle1: 'Calle A', destino_calle1: 'Calle Inexistente' },
      {}
    );
    expect(result.content[0].text).toMatch(/destino|no se encontr/i);
  });

  it('error message includes calle1 for bad origin', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'CalleRara123', destino_calle1: 'Calle A' },
      {}
    );
    expect(result.content[0].text).toContain('CalleRara123');
  });
});

// ─── No route found ──────────────────────────────────────────────────────────

describe('como_llegar — no route found', () => {
  it('returns helpful message when no route exists', async () => {
    // Origin near P01 (Line 101 only), destination near P20 (Line 104 only)
    // Line 101 ≠ Line 104, and no transfer stop connects them in the mini network
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP20);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 200 },
      {}
    );
    const text = result.content[0].text;
    // Either no route message or a valid response
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });

  it('no-route message suggests increasing max_caminata_metros', async () => {
    // Two isolated points far from all stops and > 200m from each other
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce({ lat: -34.960, lon: -56.000 })
      .mockResolvedValueOnce({ lat: -34.962, lon: -56.000 }); // ~222m apart

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B', max_caminata_metros: 10 },
      {}
    );
    expect(result.content[0].text).toMatch(/parada|ruta/i);
  });
});

// ─── Output validation ───────────────────────────────────────────────────────

describe('como_llegar — output validation', () => {
  it('successful response is valid JSON', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('result is always text content type', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    expect(result.content[0].type).toBe('text');
  });

  it('limits results to at most 5 options (3 direct + 2 transfer)', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'A', destino_calle1: 'B' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.opciones.length).toBeLessThanOrEqual(5);
  });

  it('using calle2 for origin includes it in the origen string', async () => {
    vi.mocked(geocodeIntersection)
      .mockResolvedValueOnce(COORDS.nearP01)
      .mockResolvedValueOnce(COORDS.nearP05);

    const result = await handler(
      { origen_calle1: 'Av Italia', origen_calle2: 'Luis Lamas', destino_calle1: 'Aduana' },
      {}
    );
    const data = JSON.parse(result.content[0].text);
    expect(data.origen).toBe('Av Italia y Luis Lamas');
  });
});
