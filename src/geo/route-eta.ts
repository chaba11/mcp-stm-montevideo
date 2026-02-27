/**
 * Pure function to estimate ETAs from GPS bus positions along a route.
 * Used as fallback when the upcomingbuses endpoint returns empty.
 */
import { getDistance } from "geolib";
import type { BusPosition } from "../data/gps-client.js";
import type { Parada } from "../types/parada.js";

export interface GpsEstimatedBus {
  id_vehiculo: string;
  linea: string;
  destino: string;
  eta_segundos: number;
  distancia_metros: number;
}

/** Default speed when bus is stopped or moving very slowly */
const DEFAULT_SPEED_KMH = 20;
/** Minimum speed to trust the reported value */
const MIN_SPEED_KMH = 5;
/** Ignore buses that haven't reported in over 10 minutes */
const STALE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Estimate ETAs for buses approaching a target stop, using GPS positions
 * and the ordered sequence of stops along each route variant.
 *
 * @param targetParadaId - The CKAN stop ID we want ETAs for
 * @param busPositions - Current GPS positions of active buses
 * @param routeParadas - All stops for the relevant line(s), with ordinal + variante
 * @param lineaName - Line name for the output
 * @param now - Current time (defaults to Date.now())
 * @returns Estimated arrivals sorted by ETA ascending
 */
export function estimateEtaFromPositions(
  targetParadaId: number,
  busPositions: BusPosition[],
  routeParadas: Parada[],
  lineaName: string,
  now?: Date
): GpsEstimatedBus[] {
  if (busPositions.length === 0 || routeParadas.length === 0) {
    return [];
  }

  const currentTime = now ?? new Date();
  const results: GpsEstimatedBus[] = [];

  // Group paradas by variante, sorted by ordinal
  const paradasByVariante = new Map<number, Parada[]>();
  for (const p of routeParadas) {
    let arr = paradasByVariante.get(p.variante);
    if (!arr) {
      arr = [];
      paradasByVariante.set(p.variante, arr);
    }
    arr.push(p);
  }
  for (const arr of paradasByVariante.values()) {
    arr.sort((a, b) => a.ordinal - b.ordinal);
  }

  for (const bus of busPositions) {
    // Skip stale data
    const reportTime = new Date(bus.ultimo_reporte).getTime();
    if (currentTime.getTime() - reportTime > STALE_THRESHOLD_MS) {
      continue;
    }

    // Determine which variants to try for this bus.
    // When cod_variante matches a known route variant, use it directly.
    // Otherwise (unknown=0, or GPS variant not in CKAN data), try all variants.
    let candidateVariants: number[];
    if (bus.cod_variante !== 0 && paradasByVariante.has(bus.cod_variante)) {
      candidateVariants = [bus.cod_variante];
    } else {
      // cod_variante=0 (unknown) or GPS variant not in CKAN paradas — try all
      candidateVariants = Array.from(paradasByVariante.keys());
    }

    let bestEta: { etaSeconds: number; totalDistance: number; destino: string } | null = null;

    for (const variantId of candidateVariants) {
      const variantParadas = paradasByVariante.get(variantId)!;

      // Find the target stop in this variant
      const targetIdx = variantParadas.findIndex((p) => p.id === targetParadaId);
      if (targetIdx === -1) {
        continue;
      }

      // Find the closest stop to the bus's current position
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < variantParadas.length; i++) {
        const d = getDistance(
          { latitude: bus.latitud, longitude: bus.longitud },
          { latitude: variantParadas[i].lat, longitude: variantParadas[i].lng }
        );
        if (d < closestDist) {
          closestDist = d;
          closestIdx = i;
        }
      }

      // Skip if bus already passed the target stop
      if (closestIdx >= targetIdx) {
        continue;
      }

      // Sum distances along the route from the bus's closest stop to the target
      let totalDistance = closestDist; // distance from bus to closest stop
      for (let i = closestIdx; i < targetIdx; i++) {
        totalDistance += getDistance(
          { latitude: variantParadas[i].lat, longitude: variantParadas[i].lng },
          { latitude: variantParadas[i + 1].lat, longitude: variantParadas[i + 1].lng }
        );
      }

      // Calculate ETA: distance / speed
      const speedKmh = bus.velocidad >= MIN_SPEED_KMH ? bus.velocidad : DEFAULT_SPEED_KMH;
      const speedMs = (speedKmh * 1000) / 3600; // convert km/h to m/s
      const etaSeconds = Math.round(totalDistance / speedMs);

      // Keep the variant with the shortest ETA (closest match)
      if (!bestEta || etaSeconds < bestEta.etaSeconds) {
        bestEta = { etaSeconds, totalDistance, destino: bus.destino };
      }
    }

    if (bestEta) {
      results.push({
        id_vehiculo: bus.id_vehiculo,
        linea: lineaName,
        destino: bestEta.destino,
        eta_segundos: bestEta.etaSeconds,
        distancia_metros: Math.round(bestEta.totalDistance),
      });
    }
  }

  // Sort by ETA ascending
  results.sort((a, b) => a.eta_segundos - b.eta_segundos);
  return results;
}
