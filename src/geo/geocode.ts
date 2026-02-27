import type { Parada } from "../types/parada.js";
import { normalizeText } from "./search.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "mcp-stm-montevideo/1.0 (github.com/chaba11/mcp-stm-montevideo)";

// Montevideo bounding box (roughly): lat -35.0 to -34.7, lon -56.4 to -55.9
const MVD_BBOX = { minLat: -35.1, maxLat: -34.6, minLon: -56.6, maxLon: -55.9 };

export interface GeoPoint {
  lat: number;
  lon: number;
}

export type NominatimResult = Array<{
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}>;

export type FetchFn = typeof fetch;

function isInMontevideo(lat: number, lon: number): boolean {
  return (
    lat >= MVD_BBOX.minLat &&
    lat <= MVD_BBOX.maxLat &&
    lon >= MVD_BBOX.minLon &&
    lon <= MVD_BBOX.maxLon
  );
}

/** Check if all tokens from the query appear in the target string. */
function allTokensMatch(query: string, target: string): boolean {
  const tokens = query.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => target.includes(t));
}

/** Compute Levenshtein edit distance between two strings. */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

/**
 * Like allTokensMatch but allows 1-edit-distance tolerance for tokens ≥ 4 chars.
 * Handles encoding corruption (e.g. "espana" matching corrupted "espaa")
 * and minor typos.
 */
export function allTokensFuzzyMatch(query: string, target: string): boolean {
  const queryTokens = query.split(" ").filter(Boolean);
  if (queryTokens.length === 0) return false;
  const targetWords = target.split(" ").filter(Boolean);
  if (targetWords.length === 0) return false;
  return queryTokens.every((token) => {
    if (target.includes(token)) return true;
    if (token.length <= 3) return false; // exact match only for short tokens
    return targetWords.some((word) => levenshteinDistance(token, word) <= 1);
  });
}

function centroid(paradas: Parada[]): GeoPoint {
  const lat = paradas.reduce((s, p) => s + p.lat, 0) / paradas.length;
  const lon = paradas.reduce((s, p) => s + p.lng, 0) / paradas.length;
  return { lat, lon };
}

/**
 * Strategy 1: Search paradas whose street names match both calle1 and calle2.
 * Uses token-based matching so "bv artigas" matches "bv gral artigas".
 * Falls back to fuzzy (edit-distance) matching when exact match finds nothing.
 * Returns the centroid of matched stops.
 */
export function geocodeFromParadas(
  calle1: string,
  calle2: string,
  paradas: Parada[]
): GeoPoint | null {
  if (!calle1.trim()) return null;

  const norm1 = normalizeText(calle1);

  // If calle2 is empty, search by calle1 alone
  if (!calle2.trim()) {
    const exactMatches = paradas.filter((p) => {
      const calle = normalizeText(p.calle);
      const esquina = normalizeText(p.esquina);
      return allTokensMatch(norm1, calle) || allTokensMatch(norm1, esquina);
    });
    if (exactMatches.length > 0) return centroid(exactMatches);

    // Fuzzy fallback: tolerates encoding artifacts and typos
    const fuzzyMatches = paradas.filter((p) => {
      const calle = normalizeText(p.calle);
      const esquina = normalizeText(p.esquina);
      return allTokensFuzzyMatch(norm1, calle) || allTokensFuzzyMatch(norm1, esquina);
    });
    return fuzzyMatches.length > 0 ? centroid(fuzzyMatches) : null;
  }

  const norm2 = normalizeText(calle2);

  const exactMatches = paradas.filter((p) => {
    const calle = normalizeText(p.calle);
    const esquina = normalizeText(p.esquina);
    return (
      (allTokensMatch(norm1, calle) && allTokensMatch(norm2, esquina)) ||
      (allTokensMatch(norm2, calle) && allTokensMatch(norm1, esquina))
    );
  });
  if (exactMatches.length > 0) return centroid(exactMatches);

  // Fuzzy fallback for intersection search
  const fuzzyMatches = paradas.filter((p) => {
    const calle = normalizeText(p.calle);
    const esquina = normalizeText(p.esquina);
    return (
      (allTokensFuzzyMatch(norm1, calle) && allTokensFuzzyMatch(norm2, esquina)) ||
      (allTokensFuzzyMatch(norm2, calle) && allTokensFuzzyMatch(norm1, esquina))
    );
  });
  return fuzzyMatches.length > 0 ? centroid(fuzzyMatches) : null;
}

/**
 * Strategy 2: Use Nominatim (OpenStreetMap) API.
 * Always include a proper User-Agent header per Nominatim usage policy.
 * Filters results to Montevideo bounding box.
 */
export async function geocodeFromNominatim(
  calle1: string,
  calle2: string,
  fetchFn: FetchFn = fetch
): Promise<GeoPoint | null> {
  const query = calle2.trim()
    ? `${calle1} y ${calle2}, Montevideo, Uruguay`
    : `${calle1}, Montevideo, Uruguay`;

  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=uy`;

  const res = await fetchFn(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "es",
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim error: HTTP ${res.status}`);
  }

  const results = (await res.json()) as NominatimResult;
  if (!results || results.length === 0) return null;

  // Filter to Montevideo bounding box to avoid wrong-city results
  const mvdResults = results.filter((r) =>
    isInMontevideo(parseFloat(r.lat), parseFloat(r.lon))
  );

  const best = mvdResults.length > 0 ? mvdResults[0] : results[0];

  return {
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon),
  };
}

/**
 * Geocode a Montevideo street intersection.
 * Tries paradas first, falls back to Nominatim.
 */
export async function geocodeIntersection(
  calle1: string,
  calle2: string,
  paradas: Parada[],
  fetchFn: FetchFn = fetch
): Promise<GeoPoint | null> {
  if (!calle1.trim()) return null;

  const fromParadas = geocodeFromParadas(calle1, calle2, paradas);
  if (fromParadas) return fromParadas;

  return geocodeFromNominatim(calle1, calle2, fetchFn);
}
