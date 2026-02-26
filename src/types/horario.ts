/**
 * Day type constants for STM schedules.
 */
export const TipoDia = {
  HABIL: 1,
  SABADO: 2,
  DOMINGO: 3,
} as const;

export type TipoDiaValue = (typeof TipoDia)[keyof typeof TipoDia];

/**
 * Raw row from uptu_pasada_variante.csv.
 * Delimiter is semicolon (;). Encoding is UTF-8.
 * Time fields use special integer formats (see docs/data-spec.md).
 */
export interface HorarioRow {
  /** Day type: 1=weekday, 2=Saturday, 3=Sunday */
  tipo_dia: TipoDiaValue;
  /** Route variant code */
  cod_variante: number;
  /** Trip start time in hmm0 format (e.g. 5000 = 05:00, 12300 = 12:30) */
  frecuencia: number;
  /** Stop ID (matches paradas.COD_UBIC_P) */
  cod_ubic_parada: number;
  /** Stop sequence within variant */
  ordinal: number;
  /** Estimated arrival time in hmm format (e.g. 500 = 05:00, 1235 = 12:35) */
  hora: number;
  /** N=same day, S=started previous day, *=special/next day */
  dia_anterior: "N" | "S" | "*";
}

/**
 * Parsed scheduled arrival with proper Date objects.
 */
export interface HorarioParsed {
  /** Route variant code */
  variante: number;
  /** Day type */
  tipoDia: TipoDiaValue;
  /** Stop ID */
  paradaId: number;
  /** Stop ordinal */
  ordinal: number;
  /** Estimated arrival as HH:MM string in America/Montevideo timezone */
  hora: string;
  /** Raw hora integer for sorting */
  horaInt: number;
  /** Whether the trip started the previous day */
  diaAnterior: boolean;
}

/**
 * Raw row from uptu_pasada_circular.csv.
 */
export interface HorarioCircularRow {
  tipo_dia: TipoDiaValue;
  cod_circular: number;
  frecuencia: number;
  cod_ubic_parada: number;
  cod_variante: number;
  parte: number;
  ordinal: number;
  hora: number;
  dia_anterior: "N" | "S" | "*";
}
