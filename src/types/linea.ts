/**
 * A bus line variant as stored in v_uptu_lsv_destinos.dbf.
 * One line (e.g. "402") can have multiple sub-lines and variants (A/B directions).
 */
export interface LineaVariante {
  /** Internal GIS record ID */
  gid: number;
  /** Numeric line code */
  codLinea: number;
  /** Human-readable line name/number (e.g. "402", "181") */
  descLinea: string;
  /** Sub-line ordinal */
  ordinalSublinea: number;
  /** Sub-line code */
  codSublinea: number;
  /** Sub-line description (e.g. "CIUDAD VIEJA - MALVIN") */
  descSublinea: string;
  /** Variant code — matches cod_variante in horarios and COD_VARIAN in paradas */
  codVariante: number;
  /** Variant direction: "A" or "B" */
  descVariante: "A" | "B" | string;
  /** Origin stop ID */
  codOrigen: number;
  /** Origin description (e.g. "PLAYA MALVÍN") */
  descOrigen: string;
  /** Destination stop ID */
  codDestino: number;
  /** Destination description */
  descDestino: string;
}

/**
 * Simplified line info for display/search.
 */
export interface LineaInfo {
  /** Human-readable line number (e.g. "181", "402") */
  numero: string;
  /** All variants for this line */
  variantes: LineaVariante[];
}
