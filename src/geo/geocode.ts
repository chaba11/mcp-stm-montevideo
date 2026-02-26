import type { Parada } from '../types/parada.js';
import { searchParadasByIntersection, searchParadasByStreet, normalizeText } from './search.js';
import { isWithinMontevideo } from './coordinates.js';

// Montevideo bounding box for filtering Nominatim results
const MVD_BBOX = {
  minLat: -34.97,
  maxLat: -34.70,
  minLon: -56.45,
  maxLon: -55.95,
};

/** Nominatim result structure */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  boundingbox?: string[];
}

/**
 * Expand common street abbreviations to full forms for better matching.
 */
function expandAbbreviations(street: string): string[] {
  const normalized = normalizeText(street);
  const variants = new Set<string>([normalized]);

  const abbrevMap: Record<string, string[]> = {
    bv: ['bulevar', 'boulevard'],
    av: ['avenida'],
    gral: ['general'],
    dr: ['doctor'],
    ing: ['ingeniero'],
    prof: ['profesor'],
    cnel: ['coronel'],
    sgto: ['sargento'],
    tte: ['teniente'],
  };

  for (const [abbrev, full] of Object.entries(abbrevMap)) {
    if (normalized.startsWith(abbrev + ' ')) {
      for (const f of full) {
        variants.add(normalized.replace(abbrev + ' ', f + ' '));
      }
    }
    for (const f of full) {
      if (normalized.startsWith(f + ' ')) {
        variants.add(normalized.replace(f + ' ', abbrev + ' '));
      }
    }
  }

  return [...variants];
}

/**
 * Search parada names to find an approximate coordinate for a street intersection.
 * Returns the centroid of matching paradas.
 */
function geocodeFromParadas(
  calle1: string,
  calle2: string | undefined,
  paradas: Parada[]
): { lat: number; lon: number } | null {
  if (!paradas || paradas.length === 0) return null;

  // Try exact and abbreviated forms
  const variants1 = expandAbbreviations(calle1);
  const variants2 = calle2 ? expandAbbreviations(calle2) : undefined;

  let matches: Parada[] = [];

  for (const v1 of variants1) {
    if (variants2) {
      for (const v2 of variants2) {
        const found = searchParadasByIntersection(v1, v2, paradas);
        if (found.length > 0) {
          matches = found;
          break;
        }
      }
    } else {
      const found = searchParadasByStreet(v1, paradas);
      if (found.length > 0) {
        matches = found;
        break;
      }
    }
    if (matches.length > 0) break;
  }

  if (matches.length === 0) return null;

  // Return centroid of first few matches
  const sample = matches.slice(0, 5);
  const lat = sample.reduce((sum, p) => sum + p.lat, 0) / sample.length;
  const lon = sample.reduce((sum, p) => sum + p.lon, 0) / sample.length;

  return { lat, lon };
}

/**
 * Query Nominatim for a street intersection in Montevideo.
 */
async function geocodeFromNominatim(
  calle1: string,
  calle2: string | undefined
): Promise<{ lat: number; lon: number } | null> {
  const query = calle2
    ? `${calle1} y ${calle2}, Montevideo, Uruguay`
    : `${calle1}, Montevideo, Uruguay`;

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=uy`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'mcp-stm-montevideo/0.1.0 (transit info tool)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null; // Network error or timeout — fall back gracefully
  }

  if (response.status === 429) {
    return null; // Rate limited — fall back gracefully
  }

  if (!response.ok) {
    return null;
  }

  let results: NominatimResult[];
  try {
    results = (await response.json()) as NominatimResult[];
  } catch {
    return null;
  }

  if (!Array.isArray(results) || results.length === 0) return null;

  // Filter to results within Montevideo bounding box
  for (const result of results) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lon)) continue;

    // Check within Montevideo bounding box
    if (
      lat >= MVD_BBOX.minLat &&
      lat <= MVD_BBOX.maxLat &&
      lon >= MVD_BBOX.minLon &&
      lon <= MVD_BBOX.maxLon
    ) {
      return { lat, lon };
    }
  }

  return null;
}

/**
 * Geocode a street intersection or address in Montevideo.
 *
 * Strategy:
 * 1. Search parada names for matching street names (fast, no network)
 * 2. Fall back to Nominatim if parada search fails
 *
 * @param calle1 - Primary street name
 * @param calle2 - Secondary street name (intersection)
 * @param paradas - Loaded paradas for local search
 * @returns Coordinates or null if not found
 */
export async function geocodeIntersection(
  calle1: string,
  calle2: string | undefined,
  paradas: Parada[]
): Promise<{ lat: number; lon: number } | null> {
  if (!calle1 || !calle1.trim()) return null;

  // Strategy 1: Search parada names
  const fromParadas = geocodeFromParadas(calle1, calle2, paradas);
  if (fromParadas) return fromParadas;

  // Strategy 2: Nominatim fallback
  return geocodeFromNominatim(calle1, calle2);
}

/**
 * Check if coordinates are within the Montevideo metro area.
 */
export function isInMontevideo(lat: number, lon: number): boolean {
  return isWithinMontevideo(lat, lon);
}
