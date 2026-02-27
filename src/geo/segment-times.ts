/**
 * Extract inter-stop travel times from CKAN schedule data.
 * Averages across all trips in a day to smooth out 1-minute rounding.
 */
import type { HorarioRow, TipoDiaValue } from "../types/horario.js";
import { hmmToMinutes } from "../data/schedule.js";

export interface SegmentTimeTable {
  /** "fromOrd-toOrd" → average seconds between consecutive stops */
  segmentSeconds: Map<string, number>;
  /** ordinal → paradaId */
  ordinalToStopId: Map<number, number>;
  /** paradaId → ordinal */
  stopIdToOrdinal: Map<number, number>;
}

/** Minimum segment time in seconds (when schedule shows 0 delta) */
const MIN_SEGMENT_SECONDS = 30;

/**
 * Build a segment time table for a specific variant and day type.
 *
 * 1. Filter horarios by variant + tipoDia
 * 2. Group by frecuencia (= trip)
 * 3. Per trip: sort by ordinal, compute time deltas between consecutive stops
 * 4. Average deltas across all trips
 * 5. Build ordinal↔stopId mappings
 *
 * Returns null if insufficient data (< 2 stops or no trips).
 */
export function buildSegmentTimeTable(
  horarios: HorarioRow[],
  codVariante: number,
  tipoDia: TipoDiaValue
): SegmentTimeTable | null {
  // Filter
  const filtered = horarios.filter(
    (h) => h.cod_variante === codVariante && h.tipo_dia === tipoDia
  );
  if (filtered.length === 0) return null;

  // Group by frecuencia (trip)
  const trips = new Map<number, HorarioRow[]>();
  for (const h of filtered) {
    let arr = trips.get(h.frecuencia);
    if (!arr) {
      arr = [];
      trips.set(h.frecuencia, arr);
    }
    arr.push(h);
  }

  // For each trip, compute consecutive deltas
  // Key: "fromOrd-toOrd", values: array of delta-seconds across trips
  const deltaAccum = new Map<string, number[]>();
  const ordinalToStopId = new Map<number, number>();
  const stopIdToOrdinal = new Map<number, number>();

  for (const rows of trips.values()) {
    if (rows.length < 2) continue;
    rows.sort((a, b) => a.ordinal - b.ordinal);

    for (let i = 0; i < rows.length - 1; i++) {
      const from = rows[i];
      const to = rows[i + 1];
      const deltaMinutes = hmmToMinutes(to.hora) - hmmToMinutes(from.hora);
      const deltaSeconds = Math.max(deltaMinutes * 60, MIN_SEGMENT_SECONDS);

      const key = `${from.ordinal}-${to.ordinal}`;
      let arr = deltaAccum.get(key);
      if (!arr) {
        arr = [];
        deltaAccum.set(key, arr);
      }
      arr.push(deltaSeconds);
    }

    // Build ordinal↔stop mappings from this trip
    for (const row of rows) {
      ordinalToStopId.set(row.ordinal, row.cod_ubic_parada);
      stopIdToOrdinal.set(row.cod_ubic_parada, row.ordinal);
    }
  }

  if (deltaAccum.size === 0) return null;

  // Average deltas
  const segmentSeconds = new Map<string, number>();
  for (const [key, deltas] of deltaAccum) {
    const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    segmentSeconds.set(key, Math.round(avg));
  }

  return { segmentSeconds, ordinalToStopId, stopIdToOrdinal };
}

/**
 * Sum consecutive segment times from fromOrdinal to toOrdinal.
 * Returns null if any segment in the path is missing.
 */
export function getSegmentTravelTime(
  table: SegmentTimeTable,
  fromOrdinal: number,
  toOrdinal: number
): number | null {
  if (fromOrdinal === toOrdinal) return 0;
  if (fromOrdinal > toOrdinal) return null;

  // Both ordinals must exist in the table
  if (!table.ordinalToStopId.has(fromOrdinal) || !table.ordinalToStopId.has(toOrdinal)) {
    return null;
  }

  // Collect all ordinals in the table and sort them
  const ordinals = Array.from(table.ordinalToStopId.keys()).sort((a, b) => a - b);

  // Find ordinals in range [fromOrdinal, toOrdinal]
  const inRange = ordinals.filter((o) => o >= fromOrdinal && o <= toOrdinal);
  if (inRange.length < 2) return null;

  let total = 0;
  for (let i = 0; i < inRange.length - 1; i++) {
    const key = `${inRange[i]}-${inRange[i + 1]}`;
    const seg = table.segmentSeconds.get(key);
    if (seg === undefined) return null;
    total += seg;
  }

  return total;
}

/**
 * Build segment time tables for multiple variants at once.
 * Skips variants with insufficient data.
 */
export function buildAllSegmentTables(
  horarios: HorarioRow[],
  variantCodes: number[],
  tipoDia: TipoDiaValue
): Map<number, SegmentTimeTable> {
  const tables = new Map<number, SegmentTimeTable>();
  for (const code of variantCodes) {
    const table = buildSegmentTimeTable(horarios, code, tipoDia);
    if (table) {
      tables.set(code, table);
    }
  }
  return tables;
}
