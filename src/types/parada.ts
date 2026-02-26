/**
 * A bus stop (parada) as stored in the CKAN shapefile v_uptu_paradas.
 * Coordinates are in EPSG:32721 (UTM Zone 21S). Convert to WGS84 before use.
 */
export interface ParadaRaw {
  /** Stop ID — matches cod_ubic_parada in horarios */
  COD_UBIC_P: number;
  /** Line name/number (e.g. "181", "402") */
  DESC_LINEA: string;
  /** Route variant code — matches cod_variante in horarios */
  COD_VARIAN: number;
  /** Stop ordinal within this variant */
  ORDINAL: number;
  /** Primary street name */
  CALLE: string;
  /** Cross street or landmark */
  ESQUINA: string;
  /** Primary street code */
  COD_CALLE1: number;
  /** Cross street code */
  COD_CALLE2: number;
  /** Easting coordinate in UTM Zone 21S (meters) */
  X: number;
  /** Northing coordinate in UTM Zone 21S (meters) */
  Y: number;
}

/**
 * A bus stop with WGS84 coordinates, ready for geo calculations.
 */
export interface Parada {
  /** Unique stop ID */
  id: number;
  /** Line name (e.g. "181") */
  linea: string;
  /** Route variant code */
  variante: number;
  /** Stop sequence within route */
  ordinal: number;
  /** Primary street name (decoded from Latin-1) */
  calle: string;
  /** Cross street name (decoded from Latin-1) */
  esquina: string;
  /** WGS84 latitude */
  lat: number;
  /** WGS84 longitude */
  lng: number;
}

/**
 * Control point (punto de control) as stored in v_uptu_controles.
 */
export interface PuntoControl {
  /** Control point ID */
  id: number;
  /** Line name */
  linea: string;
  /** Variant code */
  variante: number;
  /** Ordinal within variant */
  ordinal: number;
  /** Location description */
  descripcion: string;
  /** WGS84 latitude */
  lat: number;
  /** WGS84 longitude */
  lng: number;
}
