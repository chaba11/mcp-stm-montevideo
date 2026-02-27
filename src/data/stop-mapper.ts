/**
 * Maps CKAN stop IDs (cod_ubic_parada) to GPS API busstopIds.
 * The two systems use different ID spaces but both have lat/lng,
 * so we match by nearest-neighbor within a distance tolerance.
 */
import { getDistance } from "geolib";
import { Cache } from "./cache.js";
import type { GpsClient, GpsBusstop } from "./gps-client.js";

const TTL_24H = 24 * 60 * 60 * 1000;
const DEFAULT_TOLERANCE_METERS = 150;

export interface StopMapperOptions {
  cache?: Cache;
  toleranceMeters?: number;
}

export class StopMapper {
  private readonly gps: GpsClient;
  private readonly cache: Cache;
  private readonly toleranceMeters: number;

  constructor(gps: GpsClient, options: StopMapperOptions = {}) {
    this.gps = gps;
    this.cache = options.cache ?? new Cache();
    this.toleranceMeters = options.toleranceMeters ?? DEFAULT_TOLERANCE_METERS;
  }

  /** Fetch and cache the full list of GPS busstops (24h TTL). */
  async getGpsBusstops(): Promise<GpsBusstop[]> {
    const cached = this.cache.get<GpsBusstop[]>("gps_busstops");
    if (cached) return cached;

    const busstops = await this.gps.fetchBusstops();
    this.cache.set("gps_busstops", busstops, TTL_24H);
    return busstops;
  }

  /**
   * Find the GPS busstopId closest to the given CKAN stop coordinates.
   * Returns null if no GPS busstop is within the tolerance distance.
   */
  async resolveGpsBusstopId(
    ckanId: number,
    lat: number,
    lng: number
  ): Promise<number | null> {
    const cacheKey = `gps_mapping_${ckanId}`;
    const cached = this.cache.get<number | null>(cacheKey);
    if (cached !== undefined) return cached;

    let busstops: GpsBusstop[];
    try {
      busstops = await this.getGpsBusstops();
    } catch {
      // GPS busstops endpoint failed — cannot resolve
      const result = null;
      this.cache.set(cacheKey, result, TTL_24H);
      return result;
    }

    let bestId: number | null = null;
    let bestDistance = Infinity;

    for (const stop of busstops) {
      const [stopLng, stopLat] = stop.location.coordinates;
      const distance = getDistance(
        { latitude: lat, longitude: lng },
        { latitude: stopLat, longitude: stopLng }
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = stop.busstopId;
      }
    }

    const result = bestDistance <= this.toleranceMeters ? bestId : null;
    this.cache.set(cacheKey, result, TTL_24H);
    return result;
  }

  /** Clear all cached data. */
  clearCache(): void {
    this.cache.clear();
  }
}
