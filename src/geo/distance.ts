import type { Parada } from "../types/parada.js";
import { getCandidates, type SpatialGrid } from "./spatial-grid.js";

/**
 * Fast flat-earth distance approximation in meters.
 * Accurate to <0.3% error at Montevideo's latitude (~-34.9°).
 */
export function fastDistMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dlat = (lat2 - lat1) * 111320;
  const dlon = (lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180);
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

export interface ParadaConDistancia extends Parada {
  distancia_metros: number;
}

/**
 * Returns up to `maxResults` stops within `radioMetros` of the given point,
 * sorted by ascending distance.
 */
export function findNearestParadas(
  lat: number,
  lon: number,
  paradas: Parada[],
  radioMetros: number,
  maxResults: number = 5
): ParadaConDistancia[] {
  const results: ParadaConDistancia[] = [];

  for (const parada of paradas) {
    const distancia = fastDistMeters(lat, lon, parada.lat, parada.lng);
    if (distancia <= radioMetros) {
      results.push({ ...parada, distancia_metros: distancia });
    }
  }

  results.sort((a, b) => a.distancia_metros - b.distancia_metros);
  return results.slice(0, maxResults);
}

/**
 * Like findNearestParadas but uses a spatial grid to avoid scanning all paradas.
 * ~100 getDistance calls instead of 42K.
 */
export function findNearestParadasIndexed(
  lat: number,
  lon: number,
  paradas: Parada[],
  grid: SpatialGrid,
  radioMetros: number,
  maxResults: number = 5
): ParadaConDistancia[] {
  const candidates = getCandidates(grid, lat, lon);
  const results: ParadaConDistancia[] = [];

  for (const c of candidates) {
    const parada = paradas[c.index];
    const distancia = fastDistMeters(lat, lon, c.lat, c.lng);
    if (distancia <= radioMetros) {
      results.push({ ...parada, distancia_metros: distancia });
    }
  }

  results.sort((a, b) => a.distancia_metros - b.distancia_metros);
  return results.slice(0, maxResults);
}
