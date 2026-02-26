/**
 * STM bus stop (parada) as stored in the CKAN dataset.
 * Raw data has UTM Zone 21S (EPSG:32721) coordinates.
 */
export interface ParadaRaw {
  /** Unique stop identifier, stored as string to preserve any leading zeros */
  COD_PARADA_STM: string;
  /** Stop description / street name, e.g. "BV ESPAÑA ESQ.LIBERTAD" */
  DESC_PARADA_STM: string;
  /** Easting in UTM Zone 21S meters, e.g. 580345.12 */
  X: number;
  /** Northing in UTM Zone 21S meters, e.g. 6135678.45 */
  Y: number;
  /** Bus company code, e.g. "01" */
  COD_EMPRESA?: string;
}

/**
 * STM bus stop with WGS84 coordinates (after conversion from UTM).
 * This is the primary type used throughout the application.
 */
export interface Parada {
  /** Unique stop identifier */
  id: string;
  /** Stop description / street name */
  nombre: string;
  /** WGS84 latitude (decimal degrees, negative in southern hemisphere) */
  lat: number;
  /** WGS84 longitude (decimal degrees, negative west of meridian) */
  lon: number;
  /** Bus company code */
  empresa?: string;
}

/**
 * Parada with additional distance information, returned by search tools.
 */
export interface ParadaConDistancia extends Parada {
  /** Distance from query point in meters */
  distanciaMetros: number;
  /** List of line codes that serve this stop */
  lineas: string[];
}
