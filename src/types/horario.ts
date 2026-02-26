/**
 * STM bus schedule entry as stored in the CKAN dataset.
 * Each row represents a single bus passing through a stop at a given time.
 */
export interface HorarioRaw {
  /** Stop identifier (matches Parada.COD_PARADA_STM) */
  COD_PARADA_STM: string;
  /** Bus line code, stored as string: "181", "D10", "G", "0181" */
  COD_LINEA: string;
  /** Line description, e.g. "SERVICIO 181 - TRES CRUCES" */
  DESC_LINEA: string;
  /** Variant code, e.g. "01" */
  COD_VARIANTE: string;
  /** Variant description, e.g. "TRES CRUCES-3 DE FEBRERO" */
  DESC_VARIANTE: string;
  /**
   * Day type:
   * - "L" = Laboral (Monday–Friday)
   * - "S" = Sábado (Saturday)
   * - "D" = Domingo (Sunday + public holidays)
   */
  TIPO_DIA: 'L' | 'S' | 'D';
  /**
   * Hour of arrival (0–25). Values > 23 indicate post-midnight service
   * (e.g., HORA=24 means 00:xx of the following calendar day)
   */
  HORA: number;
  /** Minute of arrival (0–59) */
  MINUTO: number;
}

/**
 * Normalized schedule entry for use in the application.
 */
export interface Horario {
  /** Stop identifier */
  paradaId: string;
  /** Bus line code (preserved as string) */
  linea: string;
  /** Line description */
  descLinea: string;
  /** Variant code */
  variante: string;
  /** Variant description (origin-destination) */
  descVariante: string;
  /** Day type */
  tipoDia: 'L' | 'S' | 'D';
  /** Hour (0-25, values >23 are post-midnight) */
  hora: number;
  /** Minute */
  minuto: number;
}

/**
 * Day type for schedule lookup based on current day of week.
 */
export type TipoDia = 'L' | 'S' | 'D';

/**
 * Next bus result for a specific line at a stop.
 */
export interface ProximoBus {
  /** Line code */
  linea: string;
  /** Variant code */
  variante: string;
  /** Destination description */
  destino: string;
  /** Estimated arrival time in HH:MM format (America/Montevideo) */
  horarioEstimado: string;
  /** Minutes until arrival (may be negative if passed, but should be filtered out) */
  minutosRestantes: number;
}
