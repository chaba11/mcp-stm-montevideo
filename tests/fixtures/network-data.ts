/**
 * Mini transport network for routing tests.
 *
 * Layout (Montevideo-area WGS84 coords):
 *
 *   L1 East-West:  P1→P2→P3→P4→P5   (lat≈-34.900, lon -56.18 to -56.14)
 *   L2 North-South: P6→P7→P8→P9→P10  (lon≈-56.160, lat -34.88 to -34.93)
 *   L3 Diagonal:   P11→P12→P13→P14→P15
 *   L4 Circular:   P16→P17→P18→P19→P20
 *
 * Transfer points:
 *   P3 (-34.900, -56.160) ↔ P7 (-34.9018, -56.160)  ~200m  [L1 ↔ L2]
 *   P5 (-34.900, -56.140) ↔ P12 (-34.9013, -56.140) ~145m  [L1 ↔ L3]
 */
import type { Parada } from "../../src/types/parada.js";
import type { LineaVariante } from "../../src/types/linea.js";
import type { HorarioRow } from "../../src/types/horario.js";

// --- Paradas ---
export const PARADAS_NETWORK: Parada[] = [
  // L1 East-West (variant 6100)
  { id: 1, linea: "L1", variante: 6100, ordinal: 1, calle: "LINEA 1", esquina: "P1", lat: -34.900, lng: -56.180 },
  { id: 2, linea: "L1", variante: 6100, ordinal: 2, calle: "LINEA 1", esquina: "P2", lat: -34.900, lng: -56.170 },
  { id: 3, linea: "L1", variante: 6100, ordinal: 3, calle: "LINEA 1", esquina: "P3", lat: -34.900, lng: -56.160 },
  { id: 4, linea: "L1", variante: 6100, ordinal: 4, calle: "LINEA 1", esquina: "P4", lat: -34.900, lng: -56.150 },
  { id: 5, linea: "L1", variante: 6100, ordinal: 5, calle: "LINEA 1", esquina: "P5", lat: -34.900, lng: -56.140 },

  // L2 North-South (variant 6200)
  { id: 6, linea: "L2", variante: 6200, ordinal: 1, calle: "LINEA 2", esquina: "P6", lat: -34.880, lng: -56.160 },
  { id: 7, linea: "L2", variante: 6200, ordinal: 2, calle: "LINEA 2", esquina: "P7", lat: -34.9018, lng: -56.160 },
  { id: 8, linea: "L2", variante: 6200, ordinal: 3, calle: "LINEA 2", esquina: "P8", lat: -34.910, lng: -56.160 },
  { id: 9, linea: "L2", variante: 6200, ordinal: 4, calle: "LINEA 2", esquina: "P9", lat: -34.920, lng: -56.160 },
  { id: 10, linea: "L2", variante: 6200, ordinal: 5, calle: "LINEA 2", esquina: "P10", lat: -34.930, lng: -56.160 },

  // L3 Diagonal (variant 6300)
  { id: 11, linea: "L3", variante: 6300, ordinal: 1, calle: "LINEA 3", esquina: "P11", lat: -34.885, lng: -56.155 },
  { id: 12, linea: "L3", variante: 6300, ordinal: 2, calle: "LINEA 3", esquina: "P12", lat: -34.9013, lng: -56.140 },
  { id: 13, linea: "L3", variante: 6300, ordinal: 3, calle: "LINEA 3", esquina: "P13", lat: -34.910, lng: -56.135 },
  { id: 14, linea: "L3", variante: 6300, ordinal: 4, calle: "LINEA 3", esquina: "P14", lat: -34.920, lng: -56.130 },
  { id: 15, linea: "L3", variante: 6300, ordinal: 5, calle: "LINEA 3", esquina: "P15", lat: -34.930, lng: -56.125 },

  // L4 Circular (variant 6400)
  { id: 16, linea: "L4", variante: 6400, ordinal: 1, calle: "LINEA 4", esquina: "P16", lat: -34.895, lng: -56.170 },
  { id: 17, linea: "L4", variante: 6400, ordinal: 2, calle: "LINEA 4", esquina: "P17", lat: -34.900, lng: -56.165 },
  { id: 18, linea: "L4", variante: 6400, ordinal: 3, calle: "LINEA 4", esquina: "P18", lat: -34.905, lng: -56.165 },
  { id: 19, linea: "L4", variante: 6400, ordinal: 4, calle: "LINEA 4", esquina: "P19", lat: -34.910, lng: -56.170 },
  { id: 20, linea: "L4", variante: 6400, ordinal: 5, calle: "LINEA 4", esquina: "P20", lat: -34.908, lng: -56.175 },
];

// --- Line Variants ---
export const LINEAS_NETWORK: LineaVariante[] = [
  {
    gid: 1, codLinea: 1, descLinea: "L1", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "ESTE-OESTE",
    codVariante: 6100, descVariante: "A",
    codOrigen: 1, descOrigen: "P1 OESTE", codDestino: 5, descDestino: "P5 ESTE",
  },
  {
    gid: 2, codLinea: 2, descLinea: "L2", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "NORTE-SUR",
    codVariante: 6200, descVariante: "A",
    codOrigen: 6, descOrigen: "P6 NORTE", codDestino: 10, descDestino: "P10 SUR",
  },
  {
    gid: 3, codLinea: 3, descLinea: "L3", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "DIAGONAL",
    codVariante: 6300, descVariante: "A",
    codOrigen: 11, descOrigen: "P11", codDestino: 15, descDestino: "P15",
  },
  {
    gid: 4, codLinea: 4, descLinea: "L4", ordinalSublinea: 1,
    codSublinea: 1, descSublinea: "CIRCULAR",
    codVariante: 6400, descVariante: "A",
    codOrigen: 16, descOrigen: "P16", codDestino: 20, descDestino: "P20",
  },
];

// --- Generate schedule: every 15 min, 6:00-22:00 weekdays ---
function generateSchedule(
  paradaId: number,
  codVariante: number,
  baseHour: number,
  baseMin: number
): HorarioRow[] {
  const rows: HorarioRow[] = [];
  let h = baseHour;
  let m = baseMin;
  while (h < 22 || (h === 22 && m === 0)) {
    rows.push({
      tipo_dia: 1,
      cod_variante: codVariante,
      frecuencia: 0,
      cod_ubic_parada: paradaId,
      ordinal: 1,
      hora: h * 100 + m,
      dia_anterior: "N",
    });
    m += 15;
    if (m >= 60) { m -= 60; h++; }
  }
  return rows;
}

export const HORARIOS_NETWORK: HorarioRow[] = [
  // L1 schedule for each stop
  ...generateSchedule(1, 6100, 6, 0),
  ...generateSchedule(2, 6100, 6, 2),
  ...generateSchedule(3, 6100, 6, 4),
  ...generateSchedule(4, 6100, 6, 6),
  ...generateSchedule(5, 6100, 6, 8),
  // L2 schedule
  ...generateSchedule(6, 6200, 6, 0),
  ...generateSchedule(7, 6200, 6, 3),
  ...generateSchedule(8, 6200, 6, 6),
  ...generateSchedule(9, 6200, 6, 9),
  ...generateSchedule(10, 6200, 6, 12),
  // L3 schedule
  ...generateSchedule(11, 6300, 6, 0),
  ...generateSchedule(12, 6300, 6, 3),
  ...generateSchedule(13, 6300, 6, 6),
  ...generateSchedule(14, 6300, 6, 9),
  ...generateSchedule(15, 6300, 6, 12),
];

/**
 * Generate a large network for performance tests.
 * 500 paradas across 20 lines.
 */
export function generateLargeNetwork(): {
  paradas: Parada[];
  lineas: LineaVariante[];
  horarios: HorarioRow[];
} {
  const paradas: Parada[] = [];
  const lineas: LineaVariante[] = [];
  const horarios: HorarioRow[] = [];

  const NUM_LINES = 20;
  const STOPS_PER_LINE = 25; // 20 * 25 = 500 paradas

  for (let line = 0; line < NUM_LINES; line++) {
    const codVariante = 7000 + line;
    const lineCode = `LN${line + 1}`;
    const baseLat = -34.85 - line * 0.005;
    const baseLng = -56.20;

    lineas.push({
      gid: 100 + line,
      codLinea: 100 + line,
      descLinea: lineCode,
      ordinalSublinea: 1,
      codSublinea: 1,
      descSublinea: `LINE ${line + 1}`,
      codVariante,
      descVariante: "A",
      codOrigen: line * STOPS_PER_LINE + 1,
      descOrigen: `ORIGIN ${line}`,
      codDestino: (line + 1) * STOPS_PER_LINE,
      descDestino: `DEST ${line}`,
    });

    for (let stop = 0; stop < STOPS_PER_LINE; stop++) {
      const id = line * STOPS_PER_LINE + stop + 1;
      const lat = baseLat;
      const lng = baseLng + stop * 0.003;
      paradas.push({
        id,
        linea: lineCode,
        variante: codVariante,
        ordinal: stop + 1,
        calle: `LINE ${line + 1} ST`,
        esquina: `STOP ${stop + 1}`,
        lat,
        lng,
      });
      // Add a few schedule entries per stop
      for (let t = 600; t <= 2200; t += 15) {
        const h = Math.floor(t / 100);
        const m = t % 100;
        if (m < 60) {
          horarios.push({
            tipo_dia: 1,
            cod_variante: codVariante,
            frecuencia: 0,
            cod_ubic_parada: id,
            ordinal: stop + 1,
            hora: h * 100 + m,
            dia_anterior: "N",
          });
        }
      }
    }
  }

  return { paradas, lineas, horarios };
}
