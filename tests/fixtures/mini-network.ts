/**
 * Mini transport network for routing tests.
 *
 * 4 lines, 20 stops in Montevideo coordinate range.
 * Transfer points: P03 (Line 101 ↔ 102), P14 (Line 103 ↔ 104).
 *
 * Layout (0.004° spacing ≈ 364m E–W, 444m N–S):
 *
 *   P01─P02─P03─P04─P05       Line 101 (east-west, lat=-34.888)
 *           |                   Line 102 goes N–S through P03
 *          P06                 (north of P03)
 *          P07
 *          P08
 *          P09                 (south terminus of Line 102)
 *
 *   P10─P11─P12─P13─P14       Line 103 (east-west, lat=-34.916)
 *                   |          Line 104 goes N–S through P14
 *                  P15
 *                  P16
 *                  P17
 *                  P18
 *                  P19
 *                  P20         (north terminus of Line 104)
 */

import type { Parada } from '../../src/types/parada.js';
import type { Horario } from '../../src/types/horario.js';
import type { RecorridoRaw } from '../../src/types/linea.js';

// ─── 20 stops ───────────────────────────────────────────────────────────────

export const MINI_PARADAS: Parada[] = [
  // Line 101 stops (east-west, lat=-34.888)
  { id: 'P01', nombre: 'CALLE A ESQ.1', lat: -34.888, lon: -56.212, empresa: '01' },
  { id: 'P02', nombre: 'CALLE A ESQ.2', lat: -34.888, lon: -56.208, empresa: '01' },
  { id: 'P03', nombre: 'CALLE A ESQ.3', lat: -34.888, lon: -56.204, empresa: '01' }, // transfer 101/102
  { id: 'P04', nombre: 'CALLE A ESQ.4', lat: -34.888, lon: -56.200, empresa: '01' },
  { id: 'P05', nombre: 'CALLE A ESQ.5', lat: -34.888, lon: -56.196, empresa: '01' },

  // Line 102 stops (north-south through P03, lon=-56.204)
  { id: 'P06', nombre: 'CALLE B ESQ.1', lat: -34.884, lon: -56.204, empresa: '01' }, // north terminus
  // P03 is shared (already above)
  { id: 'P07', nombre: 'CALLE B ESQ.3', lat: -34.892, lon: -56.204, empresa: '01' },
  { id: 'P08', nombre: 'CALLE B ESQ.4', lat: -34.896, lon: -56.204, empresa: '01' },
  { id: 'P09', nombre: 'CALLE B ESQ.5', lat: -34.900, lon: -56.204, empresa: '01' }, // south terminus

  // Line 103 stops (east-west, lat=-34.916)
  { id: 'P10', nombre: 'CALLE C ESQ.1', lat: -34.916, lon: -56.212, empresa: '02' },
  { id: 'P11', nombre: 'CALLE C ESQ.2', lat: -34.916, lon: -56.208, empresa: '02' },
  { id: 'P12', nombre: 'CALLE C ESQ.3', lat: -34.916, lon: -56.204, empresa: '02' },
  { id: 'P13', nombre: 'CALLE C ESQ.4', lat: -34.916, lon: -56.200, empresa: '02' },
  { id: 'P14', nombre: 'CALLE C ESQ.5', lat: -34.916, lon: -56.196, empresa: '02' }, // transfer 103/104

  // Line 104 stops (north-south through P14, lon=-56.196)
  { id: 'P15', nombre: 'CALLE D ESQ.2', lat: -34.912, lon: -56.196, empresa: '02' },
  { id: 'P16', nombre: 'CALLE D ESQ.3', lat: -34.908, lon: -56.196, empresa: '02' },
  { id: 'P17', nombre: 'CALLE D ESQ.4', lat: -34.904, lon: -56.196, empresa: '02' },
  { id: 'P18', nombre: 'CALLE D ESQ.5', lat: -34.900, lon: -56.196, empresa: '02' },
  { id: 'P19', nombre: 'CALLE D ESQ.6', lat: -34.896, lon: -56.196, empresa: '02' },
  { id: 'P20', nombre: 'CALLE D ESQ.7', lat: -34.892, lon: -56.196, empresa: '02' }, // north terminus
];

// ─── Horarios (one per stop per line, weekday only — enough to build maps) ──

function h(
  paradaId: string,
  linea: string,
  variante: string,
  descVariante: string,
  hora: number,
  minuto: number
): Horario {
  return {
    paradaId,
    linea,
    descLinea: `LINEA ${linea}`,
    variante,
    descVariante,
    tipoDia: 'L',
    hora,
    minuto,
  };
}

export const MINI_HORARIOS: Horario[] = [
  // Line 101 — stops P01–P05
  h('P01', '101', '01', 'TERMINAL A-TERMINAL B', 6, 0),
  h('P02', '101', '01', 'TERMINAL A-TERMINAL B', 6, 5),
  h('P03', '101', '01', 'TERMINAL A-TERMINAL B', 6, 10), // P03 also served by 102
  h('P04', '101', '01', 'TERMINAL A-TERMINAL B', 6, 15),
  h('P05', '101', '01', 'TERMINAL A-TERMINAL B', 6, 20),
  // Additional departures for frequency calculation
  h('P01', '101', '01', 'TERMINAL A-TERMINAL B', 6, 15),
  h('P01', '101', '01', 'TERMINAL A-TERMINAL B', 6, 30),
  h('P01', '101', '01', 'TERMINAL A-TERMINAL B', 6, 45),
  h('P01', '101', '01', 'TERMINAL A-TERMINAL B', 7, 0),

  // Line 102 — stops P06, P03, P07–P09
  h('P06', '102', '01', 'NORTE-SUR', 6, 0),
  h('P03', '102', '01', 'NORTE-SUR', 6, 5), // P03 also served by 101
  h('P07', '102', '01', 'NORTE-SUR', 6, 10),
  h('P08', '102', '01', 'NORTE-SUR', 6, 15),
  h('P09', '102', '01', 'NORTE-SUR', 6, 20),

  // Line 103 — stops P10–P14
  h('P10', '103', '01', 'OESTE-ESTE', 7, 0),
  h('P11', '103', '01', 'OESTE-ESTE', 7, 5),
  h('P12', '103', '01', 'OESTE-ESTE', 7, 10),
  h('P13', '103', '01', 'OESTE-ESTE', 7, 15),
  h('P14', '103', '01', 'OESTE-ESTE', 7, 20), // P14 also served by 104

  // Line 104 — stops P15–P20, P14
  h('P14', '104', '01', 'SUR-NORTE', 8, 0), // P14 also served by 103
  h('P15', '104', '01', 'SUR-NORTE', 8, 5),
  h('P16', '104', '01', 'SUR-NORTE', 8, 10),
  h('P17', '104', '01', 'SUR-NORTE', 8, 15),
  h('P18', '104', '01', 'SUR-NORTE', 8, 20),
  h('P19', '104', '01', 'SUR-NORTE', 8, 25),
  h('P20', '104', '01', 'SUR-NORTE', 8, 30),
];

// ─── Recorridos (ordered stop sequence for each line) ────────────────────────

function r(
  COD_LINEA: string,
  COD_VARIANTE: string,
  NRO_ORDEN: number,
  COD_PARADA_STM: string,
  DESC_EMPRESA = 'EMPRESA TEST'
): RecorridoRaw {
  return {
    COD_LINEA,
    DESC_LINEA: `LINEA ${COD_LINEA}`,
    COD_VARIANTE,
    DESC_VARIANTE: 'TERMINAL A-TERMINAL B',
    NRO_ORDEN,
    COD_PARADA_STM,
    COD_EMPRESA: '01',
    DESC_EMPRESA,
  };
}

export const MINI_RECORRIDOS: RecorridoRaw[] = [
  // Line 101, variant 01: P01 → P05
  r('101', '01', 1, 'P01'),
  r('101', '01', 2, 'P02'),
  r('101', '01', 3, 'P03'),
  r('101', '01', 4, 'P04'),
  r('101', '01', 5, 'P05'),

  // Line 102, variant 01: P06 → P09 (through P03)
  r('102', '01', 1, 'P06'),
  r('102', '01', 2, 'P03'),
  r('102', '01', 3, 'P07'),
  r('102', '01', 4, 'P08'),
  r('102', '01', 5, 'P09'),

  // Line 103, variant 01: P10 → P14
  r('103', '01', 1, 'P10', 'EMPRESA TEST 2'),
  r('103', '01', 2, 'P11', 'EMPRESA TEST 2'),
  r('103', '01', 3, 'P12', 'EMPRESA TEST 2'),
  r('103', '01', 4, 'P13', 'EMPRESA TEST 2'),
  r('103', '01', 5, 'P14', 'EMPRESA TEST 2'),

  // Line 104, variant 01: P14 → P20 (south to north)
  r('104', '01', 1, 'P14', 'EMPRESA TEST 2'),
  r('104', '01', 2, 'P15', 'EMPRESA TEST 2'),
  r('104', '01', 3, 'P16', 'EMPRESA TEST 2'),
  r('104', '01', 4, 'P17', 'EMPRESA TEST 2'),
  r('104', '01', 5, 'P18', 'EMPRESA TEST 2'),
  r('104', '01', 6, 'P19', 'EMPRESA TEST 2'),
  r('104', '01', 7, 'P20', 'EMPRESA TEST 2'),
];
