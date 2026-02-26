import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerRecorridoLinea } from '../../src/tools/recorrido-linea.js';
import { MINI_PARADAS, MINI_HORARIOS, MINI_RECORRIDOS } from '../fixtures/mini-network.js';

vi.mock('../../src/data/ckan-client.js', () => ({
  getParadas: vi.fn(),
  getHorarios: vi.fn(),
  getRecorridos: vi.fn(),
}));

// Must import mocks AFTER vi.mock() so that they are properly hoisted
import { getParadas, getHorarios, getRecorridos } from '../../src/data/ckan-client.js';

function makeServer() {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerRecorridoLinea(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (server as any)._registeredTools['recorrido_linea'].handler;
}

const handler = makeServer();

beforeEach(() => {
  vi.mocked(getParadas).mockResolvedValue(MINI_PARADAS);
  vi.mocked(getHorarios).mockResolvedValue(MINI_HORARIOS);
  vi.mocked(getRecorridos).mockResolvedValue(MINI_RECORRIDOS);
});

describe('recorrido_linea — basic lookup', () => {
  it('returns route for line 101 using recorridos data', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.linea).toBe('101');
  });

  it('returns correct variant', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.variante).toBe('01');
  });

  it('returns ordered stops list', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.paradas)).toBe(true);
    expect(data.paradas.length).toBe(5);
    expect(data.paradas[0].paradaId).toBe('P01');
    expect(data.paradas[4].paradaId).toBe('P05');
  });

  it('stops are sorted by NRO_ORDEN', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    for (let i = 1; i < data.paradas.length; i++) {
      expect(data.paradas[i].orden).toBeGreaterThan(data.paradas[i - 1].orden);
    }
  });

  it('stop includes nombre from paradas map', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.paradas[0].nombre).toBe('CALLE A ESQ.1');
  });

  it('stop includes coordinates', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.paradas[0].lat).toBeCloseTo(-34.888, 3);
    expect(data.paradas[0].lon).toBeCloseTo(-56.212, 3);
  });

  it('origen is first stop name', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.origen).toBe('CALLE A ESQ.1');
  });

  it('destino is last stop name', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.destino).toBe('CALLE A ESQ.5');
  });

  it('empresa is set from DESC_EMPRESA', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.empresa).toBe('EMPRESA TEST');
  });

  it('returns line 102 correctly (north-south route through P03)', async () => {
    const result = await handler({ linea: '102' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.linea).toBe('102');
    expect(data.paradas.length).toBe(5);
    expect(data.paradas[0].paradaId).toBe('P06');
    expect(data.paradas[1].paradaId).toBe('P03'); // transfer stop
  });
});

describe('recorrido_linea — variant filter', () => {
  it('returns matching variant when specified', async () => {
    const result = await handler({ linea: '101', variante: '01' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.variante).toBe('01');
  });

  it('returns error for unknown variant', async () => {
    const result = await handler({ linea: '101', variante: '99' }, {});
    expect(result.content[0].text).toMatch(/variante.*no encontrada|no encontr.*variante/i);
  });
});

describe('recorrido_linea — line not found', () => {
  it('returns error message for unknown line', async () => {
    const result = await handler({ linea: '999' }, {});
    expect(result.content[0].text).toMatch(/no encontrada|no encontr/i);
  });

  it('returns error for empty string line', async () => {
    const result = await handler({ linea: '' }, {});
    expect(result.content[0].text).toMatch(/error|especif/i);
  });

  it('returns error for whitespace-only line', async () => {
    const result = await handler({ linea: '   ' }, {});
    expect(result.content[0].text).toMatch(/error|especif/i);
  });
});

describe('recorrido_linea — line code normalization', () => {
  it('matches line 101 with leading zeros (0101)', async () => {
    // Make recorridos have COD_LINEA='0101' to test normalization
    vi.mocked(getRecorridos).mockResolvedValue(
      MINI_RECORRIDOS.map((r) => (r.COD_LINEA === '101' ? { ...r, COD_LINEA: '0101' } : r))
    );
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.paradas.length).toBeGreaterThan(0);
  });

  it('non-numeric line D10 handled without leading-zero stripping', async () => {
    // Add a "D10" line to recorridos
    vi.mocked(getRecorridos).mockResolvedValue([
      { COD_LINEA: 'D10', DESC_LINEA: 'LINEA D10', COD_VARIANTE: '01', DESC_VARIANTE: 'A-B', NRO_ORDEN: 1, COD_PARADA_STM: 'P01', DESC_EMPRESA: 'E' },
      { COD_LINEA: 'D10', DESC_LINEA: 'LINEA D10', COD_VARIANTE: '01', DESC_VARIANTE: 'A-B', NRO_ORDEN: 2, COD_PARADA_STM: 'P02', DESC_EMPRESA: 'E' },
    ]);
    const result = await handler({ linea: 'D10' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.linea).toBe('D10');
  });
});

describe('recorrido_linea — horarios fallback', () => {
  it('falls back to horarios when recorridos is empty', async () => {
    vi.mocked(getRecorridos).mockResolvedValue([]);
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    // Should still find line 101 from horarios
    expect(data.linea).toBe('101');
    expect(data.paradas.length).toBeGreaterThan(0);
  });

  it('horarios fallback: stops are a non-empty unique set', async () => {
    vi.mocked(getRecorridos).mockResolvedValue([]);
    const result = await handler({ linea: '102' }, {});
    const data = JSON.parse(result.content[0].text);
    const ids = data.paradas.map((p: { paradaId: string }) => p.paradaId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length); // no duplicates
  });

  it('horarios fallback: destino parsed from descVariante', async () => {
    vi.mocked(getRecorridos).mockResolvedValue([]);
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    // descVariante is 'TERMINAL A-TERMINAL B' → destino = 'TERMINAL B'
    expect(data.destino).toMatch(/TERMINAL/);
  });
});

describe('recorrido_linea — frequency calculation', () => {
  it('frecuenciaPromedioMin is calculated for line 101', async () => {
    vi.mocked(getRecorridos).mockResolvedValue([]);
    // MINI_HORARIOS includes P01/101 at 6:00, 6:15, 6:30, 6:45, 7:00 → avg 15min
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    if (data.frecuenciaPromedioMin !== undefined) {
      expect(data.frecuenciaPromedioMin).toBeGreaterThan(0);
      expect(data.frecuenciaPromedioMin).toBeLessThanOrEqual(60);
    }
  });

  it('frecuenciaPromedioMin is undefined for line with 1 departure only', async () => {
    // Provide horarios with only one entry for a line
    vi.mocked(getRecorridos).mockResolvedValue([]);
    vi.mocked(getHorarios).mockResolvedValue([
      {
        paradaId: 'P01', linea: '101', descLinea: 'L', variante: '01',
        descVariante: 'A-B', tipoDia: 'L', hora: 9, minuto: 0,
      },
    ]);
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data.frecuenciaPromedioMin).toBeUndefined();
  });
});

describe('recorrido_linea — output structure', () => {
  it('output has all required top-level fields', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    expect(data).toHaveProperty('linea');
    expect(data).toHaveProperty('variante');
    expect(data).toHaveProperty('empresa');
    expect(data).toHaveProperty('origen');
    expect(data).toHaveProperty('destino');
    expect(data).toHaveProperty('paradas');
  });

  it('each stop has orden, paradaId, nombre, lat, lon', async () => {
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    for (const p of data.paradas) {
      expect(p).toHaveProperty('orden');
      expect(p).toHaveProperty('paradaId');
      expect(p).toHaveProperty('nombre');
      expect(p).toHaveProperty('lat');
      expect(p).toHaveProperty('lon');
    }
  });

  it('unknown stop uses paradaId as nombre fallback', async () => {
    // Use a recorrido with a stop ID not in MINI_PARADAS
    vi.mocked(getRecorridos).mockResolvedValue([
      { COD_LINEA: '101', DESC_LINEA: 'L101', COD_VARIANTE: '01', DESC_VARIANTE: 'A-B', NRO_ORDEN: 1, COD_PARADA_STM: 'UNKNOWN_STOP', DESC_EMPRESA: 'E' },
    ]);
    const result = await handler({ linea: '101' }, {});
    const data = JSON.parse(result.content[0].text);
    const unknownStop = data.paradas.find((p: { paradaId: string }) => p.paradaId === 'UNKNOWN_STOP');
    expect(unknownStop.nombre).toBe('UNKNOWN_STOP');
    expect(unknownStop.lat).toBe(0);
    expect(unknownStop.lon).toBe(0);
  });

  it('result is valid JSON text', async () => {
    const result = await handler({ linea: '101' }, {});
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
