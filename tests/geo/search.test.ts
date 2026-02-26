import { describe, it, expect } from "vitest";
import { fuzzySearchParadas, normalizeText } from "../../src/geo/search.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
import type { Parada } from "../../src/types/parada.js";

function makeParada(id: number, calle: string, esquina: string, linea = "181"): Parada {
  return { id, linea, variante: 52, ordinal: 1, calle, esquina, lat: -34.9, lng: -56.1 };
}

const PARADAS_BASIC: Parada[] = [
  makeParada(1, "BV ESPAÑA", "LIBERTAD"),
  makeParada(2, "BV ESPAÑA", "COLONIA"),
  makeParada(3, "AV ITALIA", "GARIBALDI"),
  makeParada(4, "GARIBALDI", "AV ITALIA"),
  makeParada(5, "LIBERTAD", "BV ESPAÑA"),
  makeParada(6, "18 DE JULIO", "EJIDO"),
  makeParada(7, "EJIDO", "18 DE JULIO"),
];

describe("normalizeText", () => {
  it("lowercases text", () => {
    expect(normalizeText("ESPAÑA")).toBe("espana");
  });

  it("removes diacritics: á, é, í, ó, ú, ñ, ü", () => {
    expect(normalizeText("España")).toBe("espana");
    expect(normalizeText("CORUÑA")).toBe("coruna");
    expect(normalizeText("PEÑAROL")).toBe("penarol");
    expect(normalizeText("josé")).toBe("jose");
    expect(normalizeText("río")).toBe("rio");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hola  ")).toBe("hola");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("A  B  C")).toBe("a b c");
  });

  it("expands 'bulevar' to 'bv'", () => {
    expect(normalizeText("bulevar españa")).toBe("bv espana");
  });

  it("expands 'avenida' to 'av'", () => {
    expect(normalizeText("avenida italia")).toBe("av italia");
  });

  it("expands 'general' to 'gral'", () => {
    expect(normalizeText("general flores")).toBe("gral flores");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });
});

describe("fuzzySearchParadas", () => {
  it("happy path: 'españa' matches stops on BV ESPAÑA", () => {
    const results = fuzzySearchParadas("españa", PARADAS_BASIC);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(5);
  });

  it("partial match: 'garibaldi' matches AV ITALIA/GARIBALDI", () => {
    const results = fuzzySearchParadas("garibaldi", PARADAS_BASIC);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.calle.includes("GARIBALDI") || r.esquina.includes("GARIBALDI"))).toBe(true);
  });

  it("diacritics: 'espana' matches stops with 'ESPAÑA'", () => {
    const results = fuzzySearchParadas("espana", PARADAS_BASIC);
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.id)).toContain(1);
  });

  it("diacritics: 'jose' matches 'JOSÉ ENRIQUE RODO'", () => {
    const results = fuzzySearchParadas("jose enrique rodo", PARADAS_GEO);
    expect(results.length).toBeGreaterThan(0);
  });

  it("multiple words: '18 julio' matches '18 DE JULIO'", () => {
    const results = fuzzySearchParadas("18 julio", PARADAS_BASIC);
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.id)).toContain(6);
  });

  it("abbreviation: 'bulevar españa' matches stops with 'BV ESPAÑA'", () => {
    const results = fuzzySearchParadas("bulevar españa", PARADAS_BASIC);
    expect(results.length).toBeGreaterThan(0);
  });

  it("results are sorted by score descending", () => {
    const results = fuzzySearchParadas("españa", PARADAS_BASIC);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("search is case insensitive", () => {
    const upper = fuzzySearchParadas("ESPAÑA", PARADAS_BASIC);
    const lower = fuzzySearchParadas("españa", PARADAS_BASIC);
    expect(upper.map((r) => r.id).sort()).toEqual(lower.map((r) => r.id).sort());
  });

  it("finds stop by partial match on esquina", () => {
    const results = fuzzySearchParadas("libertad", PARADAS_BASIC);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(1); // BV ESPAÑA / LIBERTAD
    expect(ids).toContain(5); // LIBERTAD / BV ESPAÑA
  });

  it("edge: empty query returns empty array", () => {
    expect(fuzzySearchParadas("", PARADAS_BASIC)).toEqual([]);
  });

  it("edge: no matches returns empty array", () => {
    const results = fuzzySearchParadas("xyzzyspoon_nonexistent_street", PARADAS_BASIC);
    expect(results).toEqual([]);
  });

  it("edge: empty paradas list returns empty array", () => {
    expect(fuzzySearchParadas("españa", [])).toEqual([]);
  });

  it("edge: very long query (500 chars) doesn't crash", () => {
    const longQuery = "a".repeat(500);
    expect(() => fuzzySearchParadas(longQuery, PARADAS_BASIC)).not.toThrow();
  });

  it("edge: query with special chars (parentheses, brackets) doesn't crash", () => {
    expect(() => fuzzySearchParadas("(18 de julio) [ejido]", PARADAS_BASIC)).not.toThrow();
  });

  it("whitespace-only query returns empty array", () => {
    const results = fuzzySearchParadas("   ", PARADAS_BASIC);
    expect(results).toEqual([]);
  });
});
