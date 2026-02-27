import { TipoDia } from "../types/horario.js";
import type { TipoDiaValue, HorarioRow } from "../types/horario.js";
import type { LineaVariante } from "../types/linea.js";

export interface NextBusDetails {
  linea: string;
  variante: number;
  destino: string;
  horario_estimado: string;
  minutos_restantes: number;
}

export interface GetNextBusesResult {
  buses: NextBusDetails[];
  isNextDay: boolean;
}

/** Format hmm integer (e.g. 500 = "05:00", 1235 = "12:35") */
export function formatHmm(hmm: number): string {
  const hours = Math.floor(hmm / 100);
  const minutes = hmm % 100;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Convert hmm integer to minutes since midnight */
export function hmmToMinutes(hmm: number): number {
  return Math.floor(hmm / 100) * 60 + (hmm % 100);
}

/** Get day type (1=weekday, 2=Saturday, 3=Sunday) in America/Montevideo */
export function getTipoDia(date: Date): TipoDiaValue {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Montevideo",
    weekday: "long",
  }).format(date);
  if (day === "Saturday") return TipoDia.SABADO;
  if (day === "Sunday") return TipoDia.DOMINGO;
  return TipoDia.HABIL;
}

/** Get tomorrow's day type for the "no more buses today" fallback */
function getNextTipoDia(date: Date): TipoDiaValue {
  const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return getTipoDia(tomorrow);
}

/** Get current minutes since midnight in America/Montevideo */
export function getCurrentMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Montevideo",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour * 60 + minute;
}

export interface GetNextBusesOptions {
  paradaId: number;
  linea?: string;
  count?: number;
  now?: Date;
}

/**
 * Returns the next scheduled buses for a stop, in Montevideo time.
 * Falls back to tomorrow's first buses if no more buses today.
 */
export function getNextBuses(
  options: GetNextBusesOptions,
  horarios: HorarioRow[],
  lineas: LineaVariante[]
): GetNextBusesResult {
  const { paradaId, linea, count = 5, now = new Date() } = options;

  const tipoDia = getTipoDia(now);
  const currentMinutes = getCurrentMinutes(now);

  // Build variant → line info lookup
  const variantInfo = new Map<number, LineaVariante>();
  for (const lv of lineas) {
    variantInfo.set(lv.codVariante, lv);
  }

  const lineaUpper = linea?.trim().toUpperCase();

  // Filter horarios for this stop
  const stopHorarios = horarios.filter((h) => h.cod_ubic_parada === paradaId);

  function matchesLinea(h: HorarioRow): boolean {
    if (!lineaUpper) return true;
    const lv = variantInfo.get(h.cod_variante);
    return lv?.descLinea.trim().toUpperCase() === lineaUpper;
  }

  function toDetails(h: HorarioRow, minutosRestantes: number): NextBusDetails {
    const lv = variantInfo.get(h.cod_variante);
    return {
      linea: lv?.descLinea ?? String(h.cod_variante),
      variante: h.cod_variante,
      destino: lv?.descDestino ?? "",
      horario_estimado: formatHmm(h.hora),
      minutos_restantes: minutosRestantes,
    };
  }

  // Today's buses after current time
  const todayBuses = stopHorarios
    .filter((h) => h.tipo_dia === tipoDia && matchesLinea(h))
    .filter((h) => hmmToMinutes(h.hora) > currentMinutes)
    .sort((a, b) => a.hora - b.hora)
    .slice(0, count)
    .map((h) => toDetails(h, hmmToMinutes(h.hora) - currentMinutes));

  if (todayBuses.length > 0) {
    return { buses: todayBuses, isNextDay: false };
  }

  // No more buses today — show first buses tomorrow
  const nextTipoDia = getNextTipoDia(now);
  const tomorrowBuses = stopHorarios
    .filter((h) => h.tipo_dia === nextTipoDia && matchesLinea(h))
    .sort((a, b) => a.hora - b.hora)
    .slice(0, count)
    .map((h) => toDetails(h, -1));

  return { buses: tomorrowBuses, isNextDay: true };
}
