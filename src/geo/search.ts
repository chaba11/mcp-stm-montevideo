import type { Parada } from "../types/parada.js";

// Common Spanish abbreviations used in Montevideo street names
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bbulevar\b/g, "bv"],
  [/\bavenida\b/g, "av"],
  [/\bgeneral\b/g, "gral"],
  [/\bdoctor\b/g, "dr"],
  [/\bprofesora?\b/g, "prof"],
];

/**
 * Normalize text for fuzzy matching:
 * - lowercase
 * - remove diacritics (á→a, ñ→n, etc.)
 * - expand/contract common abbreviations
 * - collapse multiple spaces
 */
export function normalizeText(text: string): string {
  let normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/[^\x00-\x7f]/g, "") // strip remaining non-ASCII (e.g. encoding artifacts)
    .replace(/[^a-z0-9 ]/g, "") // strip punctuation (dots, hyphens, etc.)
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized;
}

export interface ParadaSearchResult extends Parada {
  /** Score for ranking: higher = better match */
  score: number;
}

/**
 * Fuzzy text search on parada street names.
 * Matches on calle, esquina, or linea fields.
 * Returns results sorted by relevance score (descending).
 */
export function fuzzySearchParadas(query: string, paradas: Parada[]): ParadaSearchResult[] {
  if (!query || paradas.length === 0) return [];

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const terms = normalizedQuery.split(" ").filter(Boolean);

  const results: ParadaSearchResult[] = [];

  for (const parada of paradas) {
    const calle = normalizeText(parada.calle);
    const esquina = normalizeText(parada.esquina);
    const linea = normalizeText(parada.linea);
    const combined = `${calle} ${esquina} ${linea}`;

    let score = 0;

    // Exact phrase match in calle/esquina gets highest score
    if (calle.includes(normalizedQuery)) score += 10;
    if (esquina.includes(normalizedQuery)) score += 8;
    if (linea === normalizedQuery) score += 6;

    // Each matching term adds points
    for (const term of terms) {
      if (calle.includes(term)) score += 3;
      if (esquina.includes(term)) score += 2;
      if (combined.includes(term)) score += 1;
    }

    if (score > 0) {
      results.push({ ...parada, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
