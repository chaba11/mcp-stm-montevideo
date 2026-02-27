/**
 * Pure function to estimate ETAs from GPS bus positions along a route.
 * Used as fallback when the upcomingbuses endpoint returns empty.
 *
 * Primary: uses CKAN schedule segment times (when horarios provided).
 * Fallback: distance-based with road factor + dwell time.
 */
import { getDistance } from "geolib";
import type { BusPosition } from "../data/gps-client.js";
import type { HorarioRow } from "../types/horario.js";
import type { Parada } from "../types/parada.js";
import { getTipoDia } from "../data/schedule.js";
import {
  buildAllSegmentTables,
  getSegmentTravelTime,
  type SegmentTimeTable,
} from "./segment-times.js";

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
/** Haversine-to-road distance multiplier for Montevideo urban streets */
const ROAD_DISTANCE_FACTOR = 1.35;
/** Average dwell time per intermediate stop in seconds */
const DWELL_TIME_PER_STOP_S = 25;

/**
 * Estimate ETAs for buses approaching a target stop, using GPS positions
 * and the ordered sequence of stops along each route variant.
 *
 * When `horarios` is provided, uses CKAN schedule-derived segment times
 * as the primary ETA source. Falls back to distance-based calculation
 * when schedule lookup fails or horarios is omitted.
 *
 * @param targetParadaId - The CKAN stop ID we want ETAs for
 * @param busPositions - Current GPS positions of active buses
 * @param routeParadas - All stops for the relevant line(s), with ordinal + variante
 * @param lineaName - Line name for the output
 * @param now - Current time (defaults to Date.now())
 * @param horarios - Optional CKAN schedule data for schedule-based ETA
 * @returns Estimated arrivals sorted by ETA ascending
 */
export function estimateEtaFromPositions(
  targetParadaId: number,
  busPositions: BusPosition[],
  routeParadas: Parada[],
  lineaName: string,
  now?: Date,
  horarios?: HorarioRow[]
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

  // Build segment time tables from schedule data (once, outside the bus loop)
  let segmentTables: Map<number, SegmentTimeTable> | null = null;
  if (horarios && horarios.length > 0) {
    const tipoDia = getTipoDia(currentTime);
    const variantCodes = Array.from(paradasByVariante.keys());
    segmentTables = buildAllSegmentTables(horarios, variantCodes, tipoDia);
    if (segmentTables.size === 0) segmentTables = null;
  }

  for (const bus of busPositions) {
    // Skip buses with invalid or stale timestamps
    const reportTime = new Date(bus.ultimo_reporte).getTime();
    if (isNaN(reportTime)) {
      continue;
    }
    const reportAgeMs = currentTime.getTime() - reportTime;
    if (reportAgeMs > STALE_THRESHOLD_MS) {
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

      // Sum haversine distances along route (used for distancia_metros and fallback)
      let totalDistance = closestDist; // distance from bus to closest stop
      for (let i = closestIdx; i < targetIdx; i++) {
        totalDistance += getDistance(
          { latitude: variantParadas[i].lat, longitude: variantParadas[i].lng },
          { latitude: variantParadas[i + 1].lat, longitude: variantParadas[i + 1].lng }
        );
      }

      const reportAgeSeconds = Math.max(0, Math.round(reportAgeMs / 1000));
      let etaSeconds: number | null = null;

      // PRIMARY: schedule-based ETA using segment times
      const table = segmentTables?.get(variantId);
      if (table) {
        const closestOrdinal = variantParadas[closestIdx].ordinal;
        const targetOrdinal = variantParadas[targetIdx].ordinal;
        const segmentTime = getSegmentTravelTime(table, closestOrdinal, targetOrdinal);

        if (segmentTime !== null) {
          // Partial segment adjustment: if bus is between stops, subtract a fraction
          // of the first segment time proportionally to how far along it is.
          let adjustment = 0;
          if (closestIdx + 1 < variantParadas.length) {
            const distToNext = getDistance(
              { latitude: variantParadas[closestIdx].lat, longitude: variantParadas[closestIdx].lng },
              { latitude: variantParadas[closestIdx + 1].lat, longitude: variantParadas[closestIdx + 1].lng }
            );
            if (distToNext > 0) {
              const fraction = closestDist / distToNext;
              const firstSegOrd = variantParadas[closestIdx].ordinal;
              const nextSegOrd = variantParadas[closestIdx + 1].ordinal;
              const firstSegTime = getSegmentTravelTime(table, firstSegOrd, nextSegOrd);
              if (firstSegTime !== null) {
                adjustment = fraction * firstSegTime;
              }
            }
          }

          etaSeconds = Math.max(0, Math.round(segmentTime - adjustment - reportAgeSeconds));
        }
      }

      // FALLBACK: distance-based with road factor + dwell time
      if (etaSeconds === null) {
        const roadDistance = totalDistance * ROAD_DISTANCE_FACTOR;
        const stopsInBetween = targetIdx - closestIdx - 1;
        const dwellTotal = Math.max(0, stopsInBetween) * DWELL_TIME_PER_STOP_S;
        const speedKmh = bus.velocidad >= MIN_SPEED_KMH ? bus.velocidad : DEFAULT_SPEED_KMH;
        const speedMs = (speedKmh * 1000) / 3600;
        etaSeconds = Math.max(0, Math.round(roadDistance / speedMs + dwellTotal - reportAgeSeconds));
      }

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
