import { getDistance } from 'geolib';
import type { Parada, ParadaConDistancia } from '../types/parada.js';

/**
 * Find paradas within a given radius, sorted by distance ascending.
 *
 * @param lat - Reference latitude (WGS84)
 * @param lon - Reference longitude (WGS84)
 * @param paradas - Array of all paradas to search
 * @param radioMetros - Maximum search radius in meters
 * @param maxResults - Maximum number of results to return
 * @param lineasPorParada - Optional map of paradaId → line codes
 * @returns Paradas within radius, sorted by distance (nearest first)
 */
export function findNearestParadas(
  lat: number,
  lon: number,
  paradas: Parada[],
  radioMetros: number,
  maxResults: number,
  lineasPorParada?: Map<string, string[]>
): ParadaConDistancia[] {
  if (!paradas || paradas.length === 0) return [];

  const reference = { latitude: lat, longitude: lon };

  const withDistances: ParadaConDistancia[] = [];

  for (const parada of paradas) {
    const distanciaMetros = getDistance(reference, {
      latitude: parada.lat,
      longitude: parada.lon,
    });

    if (distanciaMetros <= radioMetros) {
      withDistances.push({
        ...parada,
        distanciaMetros,
        lineas: lineasPorParada?.get(parada.id) ?? [],
      });
    }
  }

  // Sort by distance ascending
  withDistances.sort((a, b) => a.distanciaMetros - b.distanciaMetros);

  return withDistances.slice(0, maxResults);
}

/**
 * Build a map of paradaId → unique line codes from horarios data.
 */
export function buildLineasPorParada(
  horarios: Array<{ paradaId: string; linea: string }>
): Map<string, string[]> {
  const map = new Map<string, Set<string>>();

  for (const h of horarios) {
    if (!map.has(h.paradaId)) {
      map.set(h.paradaId, new Set());
    }
    map.get(h.paradaId)!.add(h.linea);
  }

  const result = new Map<string, string[]>();
  for (const [paradaId, lineasSet] of map.entries()) {
    result.set(paradaId, [...lineasSet].sort());
  }

  return result;
}
