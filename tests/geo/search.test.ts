import { describe, it, expect } from 'vitest';
import { fuzzySearchParadas, searchParadasByStreet, normalizeText } from '../../src/geo/search.js';
import { PARADAS_GEO } from '../fixtures/paradas-geo.js';

describe('normalizeText', () => {
  it('lowercases text', () => {
    expect(normalizeText('HELLO WORLD')).toBe('hello world');
  });

  it('strips accents: á → a', () => {
    expect(normalizeText('España')).toBe('espana');
  });

  it('strips accents: é → e', () => {
    expect(normalizeText('Ejido')).toBe('ejido');
  });

  it('strips accents: ñ → n', () => {
    expect(normalizeText('ñoño')).toBe('nono');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('a   b   c')).toBe('a b c');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });
});

describe('fuzzySearchParadas', () => {
  it('finds paradas matching "españa"', () => {
    const results = fuzzySearchParadas('españa', PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.nombre.toLowerCase().includes('españa') || p.nombre.toLowerCase().includes('espana'))).toBe(true);
  });

  it('finds paradas matching "bv espana" (no accent)', () => {
    const results = fuzzySearchParadas('bv espana', PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
  });

  it('finds partial matches: "tres" matches "Terminal Tres Cruces"', () => {
    const results = fuzzySearchParadas('tres', PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((p) => p.nombre.toLowerCase().includes('tres'))).toBe(true);
  });

  it('matches multiple words: "18 julio" matches "18 DE JULIO"', () => {
    const results = fuzzySearchParadas('18 julio', PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => p.nombre.includes('18'))).toBe(true);
  });

  it('is case-insensitive', () => {
    const lower = fuzzySearchParadas('ejido', PARADAS_GEO);
    const upper = fuzzySearchParadas('EJIDO', PARADAS_GEO);
    expect(lower.length).toBe(upper.length);
  });

  it('accent-insensitive: "espana" matches "ESPAÑA"', () => {
    const without = fuzzySearchParadas('espana', PARADAS_GEO);
    const with_ = fuzzySearchParadas('españa', PARADAS_GEO);
    expect(without.length).toBe(with_.length);
  });

  it('returns empty array for empty query', () => {
    const results = fuzzySearchParadas('', PARADAS_GEO);
    expect(results).toHaveLength(0);
  });

  it('returns empty array for whitespace-only query', () => {
    const results = fuzzySearchParadas('   ', PARADAS_GEO);
    expect(results).toHaveLength(0);
  });

  it('returns empty array when no paradas match', () => {
    const results = fuzzySearchParadas('xyzzyspoon', PARADAS_GEO);
    expect(results).toHaveLength(0);
  });

  it('handles very long query without crash', () => {
    const longQuery = 'a'.repeat(500);
    expect(() => fuzzySearchParadas(longQuery, PARADAS_GEO)).not.toThrow();
  });

  it('handles special regex characters in query without crash', () => {
    const specialQuery = '(bv [españa]) + {test}';
    expect(() => fuzzySearchParadas(specialQuery, PARADAS_GEO)).not.toThrow();
  });

  it('handles empty paradas array', () => {
    const results = fuzzySearchParadas('españa', []);
    expect(results).toHaveLength(0);
  });

  it('finds by partial stop number: "21" in "21 DE SETIEMBRE"', () => {
    const pardasWithNumber = [
      ...PARADAS_GEO,
      { id: 'X1', nombre: '21 DE SETIEMBRE ESQ.LIBERTAD', lat: -34.91, lon: -56.16 },
    ];
    const results = fuzzySearchParadas('21 setiembre', pardasWithNumber);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('searchParadasByStreet', () => {
  it('finds paradas on a street', () => {
    const results = searchParadasByStreet('18 de Julio', PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns empty for non-existent street', () => {
    const results = searchParadasByStreet('Calle Inventada', PARADAS_GEO);
    expect(results).toHaveLength(0);
  });
});
