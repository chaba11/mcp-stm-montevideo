/**
 * GPS client for real-time bus positions.
 *
 * NOTE: No public, unauthenticated GPS API has been found for the STM Montevideo.
 * This is a stub implementation that returns unavailability status.
 * Replace fetchBusPositions() when a public API becomes available.
 * See docs/data-spec.md §6 for research notes.
 */

export interface BusPosition {
  id_vehiculo: string;
  latitud: number;
  longitud: number;
  velocidad: number;
  destino: string;
  ultimo_reporte: string; // ISO 8601
}

export interface GpsResult {
  available: boolean;
  message?: string;
  positions?: BusPosition[];
}

export interface GpsClientOptions {
  fetchFn?: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
}

export class GpsClient {
  constructor(_options: GpsClientOptions = {}) {
    // Reserved for future use when a public API becomes available
  }

  /**
   * Fetch real-time bus positions for a given line.
   * Currently returns unavailable — no public GPS API exists.
   */
  async fetchBusPositions(_linea: string, _variante?: string): Promise<GpsResult> {
    return {
      available: false,
      message:
        "GPS en tiempo real no disponible. " +
        "El STM Montevideo no expone una API pública de posiciones. " +
        "Usando horarios teóricos del CKAN.",
    };
  }
}

export const gpsClient = new GpsClient();
