import type { Horario, TipoDia, ProximoBus } from '../types/horario.js';

const TIMEZONE = 'America/Montevideo';

/**
 * Get the current date/time in Montevideo timezone.
 */
export function getNowInMontevideo(now?: Date): Date {
  return now ?? new Date();
}

/**
 * Determine the day type (L/S/D) for a given date in Montevideo timezone.
 * Uruguay does not observe DST, but we still use the timezone for correctness.
 */
export function getTipoDia(date: Date): TipoDia {
  // Get day of week in Montevideo timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
  });
  const dayName = formatter.format(date).toLowerCase();

  if (dayName === 'saturday') return 'S';
  if (dayName === 'sunday') return 'D';
  return 'L';
}

/**
 * Get the current hour and minute in Montevideo timezone.
 */
export function getCurrentTimeInMontevideo(date: Date): { hora: number; minuto: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const hora = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minuto = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);

  return { hora, minuto };
}

/**
 * Convert hora + minuto to total minutes from midnight.
 * Values > 23 hours are treated as next-day service.
 */
function toMinutes(hora: number, minuto: number): number {
  return hora * 60 + minuto;
}

/**
 * Format minutes from midnight as HH:MM string.
 */
export function formatTime(hora: number, minuto: number): string {
  const h = hora % 24; // normalize post-midnight
  return `${h.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;
}

/**
 * Get the next N buses for a stop, optionally filtered by line.
 *
 * @param paradaId - Stop ID
 * @param horarios - All schedule entries
 * @param cantidad - Max number of results
 * @param lineaFiltro - Optional line filter (exact match or normalized)
 * @param now - Current date/time (defaults to now in Montevideo)
 * @returns Array of next buses with timing information
 */
export function getProximosBuses(
  paradaId: string,
  horarios: Horario[],
  cantidad: number = 5,
  lineaFiltro?: string,
  now?: Date
): ProximoBus[] {
  const currentDate = getNowInMontevideo(now);
  const tipoDia = getTipoDia(currentDate);
  const { hora: horaActual, minuto: minutoActual } = getCurrentTimeInMontevideo(currentDate);

  const minutosActuales = toMinutes(horaActual, minutoActual);

  // Filter horarios for this stop, day type, and optional line
  let filtered = horarios.filter((h) => {
    if (h.paradaId !== paradaId) return false;
    if (h.tipoDia !== tipoDia) return false;
    if (lineaFiltro) {
      // Normalize: "181" == "0181" by removing leading zeros? Actually preserve them.
      // But allow matching "181" against "0181"
      const normalizedFilter = lineaFiltro.trim();
      const normalizedLinea = h.linea.trim();
      if (normalizedFilter !== normalizedLinea) {
        // Try removing leading zeros from both
        const filterNoZeros = normalizedFilter.replace(/^0+/, '');
        const lineaNoZeros = normalizedLinea.replace(/^0+/, '');
        if (filterNoZeros !== lineaNoZeros) return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    return [];
  }

  // Remove duplicates (same line+variante+hora+minuto)
  const seen = new Set<string>();
  filtered = filtered.filter((h) => {
    const key = `${h.linea}:${h.variante}:${h.hora}:${h.minuto}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Calculate minutes until each bus
  // Handle midnight rollover: if bus hour is past midnight (>23), add 24h offset
  const withTimings = filtered.map((h) => {
    const busMinutos = toMinutes(h.hora, h.minuto);
    let minutosRestantes: number;

    if (busMinutos >= minutosActuales) {
      // Bus is later today
      minutosRestantes = busMinutos - minutosActuales;
    } else if (h.hora >= 24) {
      // Post-midnight service (hora >= 24 means next calendar day)
      // These are services from the current schedule day (yesterday's service)
      minutosRestantes = (h.hora - 24) * 60 + h.minuto + (24 * 60 - minutosActuales);
    } else {
      // Bus has already passed today — skip or calculate for tomorrow
      // Consider it "next occurrence" only if it's within the next 2h window
      // (handles midnight rollover: 23:58 asking about 00:05)
      minutosRestantes = busMinutos + 24 * 60 - minutosActuales;
    }

    return { ...h, minutosRestantes, busMinutos };
  });

  // Filter out buses that have already passed (more than 2 hours ago accounting for rollover)
  // For practical purposes: only show buses within the next 3 hours
  const upcomingBuses = withTimings
    .filter((h) => h.minutosRestantes >= 0 && h.minutosRestantes <= 3 * 60)
    .sort((a, b) => a.minutosRestantes - b.minutosRestantes)
    .slice(0, cantidad);

  // If no buses in the next 3h window, check for "last buses" or "no more today"
  if (upcomingBuses.length === 0) {
    // Return the next N from the full sorted list (may be "tomorrow")
    const allFuture = withTimings
      .filter((h) => h.minutosRestantes >= 0)
      .sort((a, b) => a.minutosRestantes - b.minutosRestantes)
      .slice(0, cantidad);

    return allFuture.map((h) => ({
      linea: h.linea,
      variante: h.variante,
      destino: h.descVariante,
      horarioEstimado: formatTime(h.hora, h.minuto),
      minutosRestantes: h.minutosRestantes,
    }));
  }

  return upcomingBuses.map((h) => ({
    linea: h.linea,
    variante: h.variante,
    destino: h.descVariante,
    horarioEstimado: formatTime(h.hora, h.minuto),
    minutosRestantes: h.minutosRestantes,
  }));
}
