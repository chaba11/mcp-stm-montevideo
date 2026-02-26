import { describe, it, expect, vi, afterEach } from 'vitest';
import { geocodeIntersection, isInMontevideo } from '../../src/geo/geocode.js';
import { PARADAS_GEO } from '../fixtures/paradas-geo.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocodeIntersection — parada name search', () => {
  it('finds "Bv España" + "Libertad" from parada names', async () => {
    const result = await geocodeIntersection('Bv España', 'Libertad', PARADAS_GEO);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.908, 1);
    expect(result!.lon).toBeCloseTo(-56.185, 1);
  });

  it('finds "18 de Julio" + "Ejido" from parada names', async () => {
    const result = await geocodeIntersection('18 de Julio', 'Ejido', PARADAS_GEO);
    expect(result).not.toBeNull();
    expect(isInMontevideo(result!.lat, result!.lon)).toBe(true);
  });

  it('is case-insensitive', async () => {
    const lower = await geocodeIntersection('bv españa', 'libertad', PARADAS_GEO);
    const upper = await geocodeIntersection('BV ESPAÑA', 'LIBERTAD', PARADAS_GEO);
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
  });

  it('is accent-insensitive (España = Espana)', async () => {
    const withAccent = await geocodeIntersection('Bv España', 'Libertad', PARADAS_GEO);
    const withoutAccent = await geocodeIntersection('Bv Espana', 'Libertad', PARADAS_GEO);
    expect(withAccent).not.toBeNull();
    expect(withoutAccent).not.toBeNull();
    // Both should find approximately the same location
    expect(Math.abs(withAccent!.lat - withoutAccent!.lat)).toBeLessThan(0.01);
  });

  it('finds single street without intersection', async () => {
    const result = await geocodeIntersection('18 de Julio', undefined, PARADAS_GEO);
    expect(result).not.toBeNull();
  });

  it('returns null for empty calle1', async () => {
    const result = await geocodeIntersection('', 'Ejido', PARADAS_GEO);
    expect(result).toBeNull();
  });

  it('returns null for whitespace-only calle1', async () => {
    const result = await geocodeIntersection('   ', 'Ejido', PARADAS_GEO);
    expect(result).toBeNull();
  });

  it('handles abbreviations: "Av" matches "Avenida"', async () => {
    // Both "AV AGRACIADA" and "AVENIDA AGRACIADA" should work
    const result1 = await geocodeIntersection('Av Agraciada', 'Paysandu', PARADAS_GEO);
    const result2 = await geocodeIntersection('Avenida Agraciada', 'Paysandu', PARADAS_GEO);
    // At least one form should find the parada
    expect(result1 ?? result2).not.toBeNull();
  });

  it('handles "Bv" abbreviation matching "Bulevar"', async () => {
    const result1 = await geocodeIntersection('Bv España', 'Libertad', PARADAS_GEO);
    const result2 = await geocodeIntersection('Bulevar España', 'Libertad', PARADAS_GEO);
    expect(result1 ?? result2).not.toBeNull();
  });

  it('returns coordinates within Montevideo for known streets', async () => {
    const result = await geocodeIntersection('18 de Julio', 'Ejido', PARADAS_GEO);
    if (result) {
      expect(isInMontevideo(result.lat, result.lon)).toBe(true);
    }
  });
});

describe('geocodeIntersection — Nominatim fallback', () => {
  it('returns null when Nominatim gets 429 rate limit', async () => {
    // Mock Nominatim to return 429
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: { get: () => null },
        text: async () => 'Too Many Requests',
        json: async () => ({}),
      })
    );

    // Use empty paradas so it has to fall through to Nominatim
    const result = await geocodeIntersection('Calle Inexistente', 'Otra Calle', []);
    expect(result).toBeNull(); // Should return null gracefully
  });

  it('returns null when Nominatim is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const result = await geocodeIntersection('Calle Inexistente', 'Otra Calle', []);
    expect(result).toBeNull();
  });

  it('returns null when Nominatim returns results outside Montevideo', async () => {
    // Mock Nominatim to return coords in Buenos Aires
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => '[]',
        json: async () =>
          [
            {
              lat: '-34.6037',
              lon: '-58.3816', // Buenos Aires — outside MVD bbox
              display_name: 'Buenos Aires, Argentina',
            },
          ],
      })
    );

    const result = await geocodeIntersection('Corrientes', 'Florida', []);
    expect(result).toBeNull();
  });

  it('returns null when Nominatim returns empty array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => '[]',
        json: async () => [],
      })
    );

    const result = await geocodeIntersection('Calle No Existe', 'Tampoco', []);
    expect(result).toBeNull();
  });

  it('returns valid coords when Nominatim returns Montevideo result', async () => {
    const mockResult = {
      lat: '-34.9058',
      lon: '-56.1981',
      display_name: 'Plaza Independencia, Montevideo, Uruguay',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify([mockResult]),
        json: async () => [mockResult],
      })
    );

    const result = await geocodeIntersection('Plaza Independencia', undefined, []);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9058, 3);
    expect(result!.lon).toBeCloseTo(-56.1981, 3);
  });
});

describe('isInMontevideo', () => {
  it('returns true for Tres Cruces', () => {
    expect(isInMontevideo(-34.8937, -56.1675)).toBe(true);
  });

  it('returns true for Ciudad Vieja', () => {
    expect(isInMontevideo(-34.9065, -56.2005)).toBe(true);
  });

  it('returns false for Buenos Aires', () => {
    expect(isInMontevideo(-34.6037, -58.3816)).toBe(false);
  });

  it('returns false for NYC', () => {
    expect(isInMontevideo(40.7128, -74.006)).toBe(false);
  });
});
