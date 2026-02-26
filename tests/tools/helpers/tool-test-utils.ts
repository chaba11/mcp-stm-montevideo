import { vi } from 'vitest';
import type { Parada } from '../../../src/types/parada.js';
import type { Horario } from '../../../src/types/horario.js';

/**
 * Create a mock Parada for testing.
 */
export function makeParada(overrides: Partial<Parada> & { id: string }): Parada {
  return {
    id: overrides.id,
    nombre: overrides.nombre ?? `PARADA ${overrides.id}`,
    lat: overrides.lat ?? -34.9060,
    lon: overrides.lon ?? -56.1880,
    empresa: overrides.empresa ?? '01',
  };
}

/**
 * Create a mock Horario entry for testing.
 */
export function makeHorario(overrides: Partial<Horario> & { paradaId: string; linea: string; hora: number; minuto: number }): Horario {
  return {
    paradaId: overrides.paradaId,
    linea: overrides.linea,
    descLinea: overrides.descLinea ?? `SERVICIO ${overrides.linea}`,
    variante: overrides.variante ?? '01',
    descVariante: overrides.descVariante ?? 'ORIGEN-DESTINO',
    tipoDia: overrides.tipoDia ?? 'L',
    hora: overrides.hora,
    minuto: overrides.minuto,
  };
}

/**
 * Create a full set of realistic schedule data for testing.
 * Line 181: runs 5:30-23:45, every 15 min on weekdays
 */
export function makeScheduleData(): { paradas: Parada[]; horarios: Horario[] } {
  const paradas: Parada[] = [
    makeParada({ id: '1001', nombre: 'BV ESPAÑA ESQ.LIBERTAD', lat: -34.9080, lon: -56.1850 }),
    makeParada({ id: '1004', nombre: '18 DE JULIO ESQ.EJIDO', lat: -34.9060, lon: -56.1880 }),
    makeParada({ id: '1007', nombre: 'TERMINAL TRES CRUCES', lat: -34.8937, lon: -56.1675 }),
    makeParada({ id: '2001', nombre: 'AV AGRACIADA ESQ.PAYSANDU', lat: -34.8980, lon: -56.1950 }),
  ];

  const horarios: Horario[] = [];

  // Generate line 181 schedule for stop 1001
  const line181times = [
    { hora: 5, minuto: 30 }, { hora: 5, minuto: 45 },
    { hora: 6, minuto: 0 }, { hora: 6, minuto: 15 }, { hora: 6, minuto: 30 }, { hora: 6, minuto: 45 },
    { hora: 7, minuto: 0 }, { hora: 7, minuto: 15 }, { hora: 7, minuto: 30 }, { hora: 7, minuto: 45 },
    { hora: 8, minuto: 0 }, { hora: 8, minuto: 15 },
    { hora: 12, minuto: 0 }, { hora: 12, minuto: 15 },
    { hora: 17, minuto: 0 }, { hora: 17, minuto: 15 },
    { hora: 23, minuto: 30 }, { hora: 23, minuto: 45 },
    { hora: 24, minuto: 0 }, // post-midnight
  ];

  for (const t of line181times) {
    horarios.push(makeHorario({
      paradaId: '1001', linea: '181', variante: '01',
      descVariante: 'TRES CRUCES-3 DE FEBRERO', tipoDia: 'L',
      hora: t.hora, minuto: t.minuto,
    }));
  }

  // Saturday schedule (fewer buses)
  const satTimes = [
    { hora: 6, minuto: 30 }, { hora: 7, minuto: 0 }, { hora: 7, minuto: 30 },
    { hora: 8, minuto: 0 }, { hora: 12, minuto: 0 }, { hora: 17, minuto: 0 },
    { hora: 22, minuto: 0 },
  ];
  for (const t of satTimes) {
    horarios.push(makeHorario({
      paradaId: '1001', linea: '181', variante: '01',
      descVariante: 'TRES CRUCES-3 DE FEBRERO', tipoDia: 'S',
      hora: t.hora, minuto: t.minuto,
    }));
  }

  // Sunday schedule
  const sunTimes = [
    { hora: 8, minuto: 0 }, { hora: 9, minuto: 0 }, { hora: 12, minuto: 0 },
    { hora: 18, minuto: 0 }, { hora: 21, minuto: 0 },
  ];
  for (const t of sunTimes) {
    horarios.push(makeHorario({
      paradaId: '1001', linea: '181', variante: '01',
      descVariante: 'TRES CRUCES-3 DE FEBRERO', tipoDia: 'D',
      hora: t.hora, minuto: t.minuto,
    }));
  }

  // Line D10 for stop 1001
  const d10Times = [
    { hora: 6, minuto: 0 }, { hora: 6, minuto: 20 }, { hora: 6, minuto: 40 },
    { hora: 7, minuto: 0 }, { hora: 7, minuto: 20 },
    { hora: 12, minuto: 0 }, { hora: 17, minuto: 0 }, { hora: 22, minuto: 0 },
  ];
  for (const t of d10Times) {
    horarios.push(makeHorario({
      paradaId: '1001', linea: 'D10', variante: '01',
      descVariante: 'CENTRO-ZONA NORTE', tipoDia: 'L',
      hora: t.hora, minuto: t.minuto,
    }));
  }

  // Stop 1004 — different stop
  horarios.push(makeHorario({ paradaId: '1004', linea: '181', tipoDia: 'L', hora: 8, minuto: 5 }));
  horarios.push(makeHorario({ paradaId: '1004', linea: '181', tipoDia: 'L', hora: 8, minuto: 20 }));

  return { paradas, horarios };
}

/**
 * Helper to run a test at a specific time in Montevideo timezone.
 * Note: Uses vi.setSystemTime, must be called inside vi.useFakeTimers() context.
 *
 * @param isoDateMvd - ISO date string in Montevideo time, e.g. "2024-11-25T08:00:00"
 */
export function setMontevdeoTime(isoDateMvd: string): void {
  // Uruguay is UTC-3 (no DST)
  // So MVD 08:00 = UTC 11:00
  const utcOffset = 3 * 60 * 60 * 1000; // UTC-3
  const mvdDate = new Date(isoDateMvd + '.000Z');
  const utcDate = new Date(mvdDate.getTime() + utcOffset);
  vi.setSystemTime(utcDate);
}
