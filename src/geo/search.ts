import type { Parada } from '../types/parada.js';

/**
 * Normalize a string for fuzzy matching:
 * - Lowercase
 * - Replace accented characters with ASCII equivalents
 * - Collapse multiple spaces
 */
export function normalizeText(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    .normalize('NFD') // decompose accented chars
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy search on parada names using normalized text matching.
 * Matches paradas where the normalized name contains all words in the query.
 *
 * @param query - Search query (can include accented characters or not)
 * @param paradas - Array of paradas to search
 * @returns Matching paradas
 */
export function fuzzySearchParadas(query: string, paradas: Parada[]): Parada[] {
  if (!query || !query.trim()) return [];
  if (!paradas || paradas.length === 0) return [];

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  // Split query into words, escape regex special characters
  const words = normalizedQuery.split(' ').filter((w) => w.length > 0);

  return paradas.filter((parada) => {
    const normalizedName = normalizeText(parada.nombre);
    // All words must appear in the name
    return words.every((word) => normalizedName.includes(word));
  });
}

/**
 * Find paradas whose name contains a specific street name.
 * Street names like "Bv España" may appear as "BV ESPAÑA" in parada names.
 *
 * @param calle - Street name to search for
 * @param paradas - Array of paradas to search
 * @returns Paradas matching the street name
 */
export function searchParadasByStreet(calle: string, paradas: Parada[]): Parada[] {
  return fuzzySearchParadas(calle, paradas);
}

/**
 * Find paradas at or near a street intersection.
 * Matches paradas whose name contains parts of both street names.
 *
 * @param calle1 - First street name
 * @param calle2 - Second street name (optional)
 * @param paradas - Array of paradas to search
 * @returns Paradas matching the intersection
 */
export function searchParadasByIntersection(
  calle1: string,
  calle2: string | undefined,
  paradas: Parada[]
): Parada[] {
  if (!calle1) return [];

  if (!calle2) {
    return searchParadasByStreet(calle1, paradas);
  }

  const normalized1 = normalizeText(calle1);
  const normalized2 = normalizeText(calle2);

  return paradas.filter((parada) => {
    const normalizedName = normalizeText(parada.nombre);
    // Both streets must be mentioned in the parada name
    const match1 = normalizedName.includes(normalized1) || normalized1.includes(normalizedName.split(' ')[0]);
    const match2 = normalizedName.includes(normalized2);
    return normalizedName.includes(normalized1) && normalizedName.includes(normalized2) ||
      (match1 && match2);
  });
}
