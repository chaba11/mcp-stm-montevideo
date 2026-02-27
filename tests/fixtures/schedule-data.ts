/**
 * Realistic schedule fixture data for testing.
 *
 * Line 181: 3 variants (5200=A, 5201=B, 5202=C), runs 5:30-23:30 weekdays every ~15 min
 * Line D10: 2 variants (5300=A, 5301=B), runs 6:00-22:00, every 20 min
 * Serves paradas: 300, 301, 302, 303, 304
 */
import type { HorarioRow, TipoDiaValue } from "../../src/types/horario.js";
import type { LineaVariante } from "../../src/types/linea.js";
import type { Parada } from "../../src/types/parada.js";

// --- Line variants ---
export const LINEAS_FIXTURE: LineaVariante[] = [
  // Line 181, variant A (5200)
  {
    gid: 1,
    codLinea: 181,
    descLinea: "181",
    ordinalSublinea: 1,
    codSublinea: 1,
    descSublinea: "POCITOS - TRES CRUCES",
    codVariante: 5200,
    descVariante: "A",
    codOrigen: 300,
    descOrigen: "POCITOS",
    codDestino: 302,
    descDestino: "TRES CRUCES",
  },
  // Line 181, variant B (5201)
  {
    gid: 2,
    codLinea: 181,
    descLinea: "181",
    ordinalSublinea: 1,
    codSublinea: 2,
    descSublinea: "TRES CRUCES - POCITOS",
    codVariante: 5201,
    descVariante: "B",
    codOrigen: 302,
    descOrigen: "TRES CRUCES",
    codDestino: 300,
    descDestino: "POCITOS",
  },
  // Line 181, variant C (5202)
  {
    gid: 3,
    codLinea: 181,
    descLinea: "181",
    ordinalSublinea: 2,
    codSublinea: 3,
    descSublinea: "MALVIN - CENTRO",
    codVariante: 5202,
    descVariante: "A",
    codOrigen: 303,
    descOrigen: "MALVIN",
    codDestino: 301,
    descDestino: "CENTRO",
  },
  // Line D10, variant A (5300)
  {
    gid: 4,
    codLinea: 10,
    descLinea: "D10",
    ordinalSublinea: 1,
    codSublinea: 1,
    descSublinea: "CIUDAD VIEJA - BUCEO",
    codVariante: 5300,
    descVariante: "A",
    codOrigen: 304,
    descOrigen: "CIUDAD VIEJA",
    codDestino: 303,
    descDestino: "BUCEO",
  },
  // Line D10, variant B (5301)
  {
    gid: 5,
    codLinea: 10,
    descLinea: "D10",
    ordinalSublinea: 1,
    codSublinea: 2,
    descSublinea: "BUCEO - CIUDAD VIEJA",
    codVariante: 5301,
    descVariante: "B",
    codOrigen: 303,
    descOrigen: "BUCEO",
    codDestino: 304,
    descDestino: "CIUDAD VIEJA",
  },
];

// --- Paradas ---
export const PARADAS_FIXTURE: Parada[] = [
  { id: 300, linea: "181", variante: 5200, ordinal: 1, calle: "BV ESPAÑA", esquina: "LIBERTAD", lat: -34.9145, lng: -56.1505 },
  { id: 301, linea: "181", variante: 5200, ordinal: 2, calle: "18 DE JULIO", esquina: "EJIDO", lat: -34.9060, lng: -56.1880 },
  { id: 302, linea: "181", variante: 5200, ordinal: 3, calle: "AV ITALIA", esquina: "GARIBALDI", lat: -34.8937, lng: -56.1675 },
  { id: 303, linea: "D10", variante: 5300, ordinal: 1, calle: "AV AGRACIADA", esquina: "CAPURRO", lat: -34.8870, lng: -56.1920 },
  { id: 304, linea: "D10", variante: 5300, ordinal: 2, calle: "COLONIA", esquina: "YAGUARON", lat: -34.9025, lng: -56.1815 },
];

// --- Helper to build horarios ---
function makeHorario(
  parada: number,
  variante: number,
  hora: number,
  tipoDia: 1 | 2 | 3
): HorarioRow {
  return {
    tipo_dia: tipoDia,
    cod_variante: variante,
    frecuencia: 0,
    cod_ubic_parada: parada,
    ordinal: 1,
    hora,
    dia_anterior: "N",
  };
}

/** Generate times from startHmm every intervalMin for count entries */
function generateTimes(startHmm: number, intervalMin: number, count: number): number[] {
  const times: number[] = [];
  let h = Math.floor(startHmm / 100);
  let m = startHmm % 100;
  for (let i = 0; i < count; i++) {
    times.push(h * 100 + m);
    m += intervalMin;
    while (m >= 60) {
      m -= 60;
      h++;
    }
  }
  return times;
}

// Line 181 variant A (5200) — runs 5:30-23:30, every 15 min weekday
const LINE_181_A_WEEKDAY_TIMES = generateTimes(530, 15, 73); // 73 trips
// Line 181 variant A (5200) — Saturday every 20 min 6:00-23:00
const LINE_181_A_SAT_TIMES = generateTimes(600, 20, 51);
// Line 181 variant A (5200) — Sunday every 30 min 7:00-22:00
const LINE_181_A_SUN_TIMES = generateTimes(700, 30, 31);

// Line 181 variant B (5201) — offset by 7 min from A
const LINE_181_B_WEEKDAY_TIMES = generateTimes(537, 15, 73);
const LINE_181_B_SAT_TIMES = generateTimes(607, 20, 51);
const LINE_181_B_SUN_TIMES = generateTimes(707, 30, 31);

// Line D10 variant A (5300) — every 20 min, 6:00-22:00
const LINE_D10_A_WEEKDAY_TIMES = generateTimes(600, 20, 49);
const LINE_D10_A_SAT_TIMES = generateTimes(700, 25, 37);

// Build horarios for parada 300 (served by 181A, 181B on weekday)
function buildHorarios(): HorarioRow[] {
  const rows: HorarioRow[] = [];

  // Parada 300 — 181 A weekday
  for (const t of LINE_181_A_WEEKDAY_TIMES) rows.push(makeHorario(300, 5200, t, 1));
  // Parada 300 — 181 A Saturday
  for (const t of LINE_181_A_SAT_TIMES) rows.push(makeHorario(300, 5200, t, 2));
  // Parada 300 — 181 A Sunday
  for (const t of LINE_181_A_SUN_TIMES) rows.push(makeHorario(300, 5200, t, 3));

  // Parada 300 — 181 B weekday
  for (const t of LINE_181_B_WEEKDAY_TIMES) rows.push(makeHorario(300, 5201, t, 1));
  // Parada 300 — 181 B Saturday
  for (const t of LINE_181_B_SAT_TIMES) rows.push(makeHorario(300, 5201, t, 2));
  // Parada 300 — 181 B Sunday
  for (const t of LINE_181_B_SUN_TIMES) rows.push(makeHorario(300, 5201, t, 3));

  // Parada 301 — 181 A weekday
  for (const t of LINE_181_A_WEEKDAY_TIMES) rows.push(makeHorario(301, 5200, t, 1));

  // Parada 302 — D10 A weekday
  for (const t of LINE_D10_A_WEEKDAY_TIMES) rows.push(makeHorario(302, 5300, t, 1));
  // Parada 302 — D10 A Saturday
  for (const t of LINE_D10_A_SAT_TIMES) rows.push(makeHorario(302, 5300, t, 2));

  return rows;
}

export const HORARIOS_FIXTURE: HorarioRow[] = buildHorarios();

/**
 * Helper to build a set of HorarioRows representing a single trip.
 * Useful for testing segment time calculations.
 */
export function makeTripHorarios(
  codVariante: number,
  frecuencia: number,
  tipoDia: TipoDiaValue,
  stops: Array<{ paradaId: number; ordinal: number; hora: number }>
): HorarioRow[] {
  return stops.map((s) => ({
    tipo_dia: tipoDia,
    cod_variante: codVariante,
    frecuencia,
    cod_ubic_parada: s.paradaId,
    ordinal: s.ordinal,
    hora: s.hora,
    dia_anterior: "N" as const,
  }));
}
