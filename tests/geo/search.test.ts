import { describe, it, expect } from "vitest";
import { fuzzySearchParadas, normalizeText } from "../../src/geo/search.js";
import type { Parada } from "../../src/types/parada.js";

function makeParada(id: number, calle: string, esquina: string, linea = "181"): Parada {
  return { id, linea, variante: 52, ordinal: 1, calle, esquina, lat: -34.9, lng: -56.1 };
}

const PARADAS: Parada[] = [
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

  it("removes diacritics", () => {
    expect(normalizeText("España")).toBe("espana");
    expect(normalizeText("CORUÑA")).toBe("coruna");
    expect(normalizeText("PEÑAROL")).toBe("penarol");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hola  ")).toBe("hola");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("A  B  C")).toBe("a b c");
  });
});

describe("fuzzySearchParadas", () => {
  it("finds stops on BV ESPAÑA by query 'españa'", () => {
    const results = fuzzySearchParadas("españa", PARADAS);
    const ids = results.map((r) => r.id);
    // Stops 1, 2, 5 all have ESPAÑA
    expect(ids).toContain(1);
    expect(ids).toContain(2);
    expect(ids).toContain(5);
  });

  it("returns empty array for empty query", () => {
    expect(fuzzySearchParadas("", PARADAS)).toEqual([]);
  });

  it("returns empty array for empty paradas list", () => {
    expect(fuzzySearchParadas("españa", [])).toEqual([]);
  });

  it("returns empty array when no matches", () => {
    const results = fuzzySearchParadas("XXXX_NONEXISTENT", PARADAS);
    expect(results).toEqual([]);
  });

  it("results have score field, sorted descending", () => {
    const results = fuzzySearchParadas("españa", PARADAS);
    expect(results.every((r) => typeof r.score === "number")).toBe(true);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("finds stop by linea number", () => {
    const results = fuzzySearchParadas("181", PARADAS);
    expect(results.length).toBeGreaterThan(0);
  });

  it("search is case insensitive", () => {
    const upper = fuzzySearchParadas("ESPAÑA", PARADAS);
    const lower = fuzzySearchParadas("españa", PARADAS);
    expect(upper.map((r) => r.id).sort()).toEqual(lower.map((r) => r.id).sort());
  });

  it("finds stops by partial match on esquina", () => {
    const results = fuzzySearchParadas("libertad", PARADAS);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(1); // BV ESPAÑA / LIBERTAD
    expect(ids).toContain(5); // LIBERTAD / BV ESPAÑA
  });

  it("finds 18 DE JULIO with number query", () => {
    const results = fuzzySearchParadas("18 de julio", PARADAS);
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(6);
    expect(ids).toContain(7);
  });
});
