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

/**
 * Strategy 1: Search paradas whose street names match both calle1 and calle2.
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
    const matches = paradas.filter((p) => {
      const calle = normalizeText(p.calle);
      const esquina = normalizeText(p.esquina);
      return calle.includes(norm1) || esquina.includes(norm1);
    });
    if (matches.length === 0) return null;
    const lat = matches.reduce((s, p) => s + p.lat, 0) / matches.length;
    const lon = matches.reduce((s, p) => s + p.lng, 0) / matches.length;
    return { lat, lon };
  }

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
