/**
 * STM bus line (route) as stored in the CKAN recorridos dataset.
 * Each row represents a stop at a specific position in a route variant.
 */
export interface RecorridoRaw {
  /** Line code, e.g. "181", "D10" */
  COD_LINEA: string;
  /** Line description */
  DESC_LINEA: string;
  /** Variant code */
  COD_VARIANTE: string;
  /** Variant description (origin-destination) */
  DESC_VARIANTE: string;
  /** Stop order within the route (1-based) */
  NRO_ORDEN: number;
  /** Stop identifier (matches Parada.id) */
  COD_PARADA_STM: string;
  /** Bus company code */
  COD_EMPRESA?: string;
  /** Bus company name */
  DESC_EMPRESA?: string;
}

/**
 * A bus line variant with its ordered list of stops.
 */
export interface LineaVariante {
  /** Variant code */
  variante: string;
  /** Variant description (origin-destination) */
  descripcion: string;
  /** Ordered list of stop IDs */
  paradas: string[];
}

/**
 * A complete bus line with all its variants.
 */
export interface Linea {
  /** Line code (string, e.g. "181", "D10") */
  codigo: string;
  /** Line description */
  descripcion: string;
  /** Bus company name */
  empresa: string;
  /** Available variants */
  variantes: LineaVariante[];
}

/**
 * Full route information for a line variant, with enriched stop data.
 */
export interface RecorridoCompleto {
  /** Line code */
  linea: string;
  /** Variant code */
  variante: string;
  /** Bus company name */
  empresa: string;
  /** Origin stop description */
  origen: string;
  /** Destination stop description */
  destino: string;
  /** Average frequency in minutes (estimated from schedule data) */
  frecuenciaPromedioMin?: number;
  /** Ordered list of stops with coordinates */
  paradas: Array<{
    orden: number;
    paradaId: string;
    nombre: string;
    lat: number;
    lon: number;
  }>;
}
