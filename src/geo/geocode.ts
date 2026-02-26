import type { Parada } from "../types/parada.js";
import { normalizeText } from "./search.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "mcp-stm-montevideo/1.0 (github.com/chaba11/mcp-stm-montevideo)";

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

/**
 * Strategy 1: Search paradas whose street names match both calle1 and calle2.
 * Returns the centroid of matched stops.
 */
export function geocodeFromParadas(
  calle1: string,
  calle2: string,
  paradas: Parada[]
): GeoPoint | null {
  const norm1 = normalizeText(calle1);
  const norm2 = normalizeText(calle2);

  const matches = paradas.filter((p) => {
    const calle = normalizeText(p.calle);
    const esquina = normalizeText(p.esquina);
    return (
      (calle.includes(norm1) && esquina.includes(norm2)) ||
      (calle.includes(norm2) && esquina.includes(norm1))
    );
  });

  if (matches.length === 0) return null;

  const lat = matches.reduce((sum, p) => sum + p.lat, 0) / matches.length;
  const lon = matches.reduce((sum, p) => sum + p.lng, 0) / matches.length;
  return { lat, lon };
}

/**
 * Strategy 2: Use Nominatim (OpenStreetMap) API.
 * Always include a proper User-Agent header per Nominatim usage policy.
 */
export async function geocodeFromNominatim(
  calle1: string,
  calle2: string,
  fetchFn: FetchFn = fetch
): Promise<GeoPoint | null> {
  const query = `${calle1} y ${calle2}, Montevideo, Uruguay`;
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=uy`;

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

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
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
  const fromParadas = geocodeFromParadas(calle1, calle2, paradas);
  if (fromParadas) return fromParadas;

  return geocodeFromNominatim(calle1, calle2, fetchFn);
}
