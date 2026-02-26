import { getDistance } from "geolib";
import type { Parada } from "../types/parada.js";

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
    const distancia = getDistance(
      { latitude: lat, longitude: lon },
      { latitude: parada.lat, longitude: parada.lng }
    );
    if (distancia <= radioMetros) {
      results.push({ ...parada, distancia_metros: distancia });
    }
  }

  results.sort((a, b) => a.distancia_metros - b.distancia_metros);
  return results.slice(0, maxResults);
}
