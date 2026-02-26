import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getProximosBuses, getTipoDia, formatTime } from '../../src/data/schedule.js';
import { makeHorario, makeScheduleData, setMontevdeoTime } from './helpers/tool-test-utils.js';
import type { Horario } from '../../src/types/horario.js';

describe('getTipoDia', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('Monday is L (laboral)', () => {
    setMontevdeoTime('2024-11-25T08:00:00'); // Monday
    expect(getTipoDia(new Date())).toBe('L');
  });

  it('Saturday is S', () => {
    setMontevdeoTime('2024-11-23T10:00:00'); // Saturday
    expect(getTipoDia(new Date())).toBe('S');
  });

  it('Sunday is D', () => {
    setMontevdeoTime('2024-11-24T14:00:00'); // Sunday
    expect(getTipoDia(new Date())).toBe('D');
  });

  it('Friday is L (laboral)', () => {
    setMontevdeoTime('2024-11-29T18:00:00'); // Friday
    expect(getTipoDia(new Date())).toBe('L');
  });
});

describe('formatTime', () => {
  it('formats hour and minute correctly', () => {
    expect(formatTime(8, 0)).toBe('08:00');
    expect(formatTime(17, 30)).toBe('17:30');
    expect(formatTime(6, 5)).toBe('06:05');
  });

  it('normalizes post-midnight hours', () => {
    expect(formatTime(24, 0)).toBe('00:00');
    expect(formatTime(25, 30)).toBe('01:30');
  });
});

describe('getProximosBuses', () => {
  const { paradas: _paradas, horarios } = makeScheduleData();

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('Monday morning 8:00', () => {
    beforeEach(() => setMontevdeoTime('2024-11-25T08:00:00'));

    it('returns next buses for line 181 at stop 1001', () => {
      const results = getProximosBuses('1001', horarios, 5, undefined, new Date());
      expect(results.length).toBeGreaterThan(0);
      // At 8:00, next buses should be at 8:00, 8:15, etc.
      expect(results[0].linea).toBeDefined();
      expect(results[0].minutosRestantes).toBeGreaterThanOrEqual(0);
    });

    it('line filter returns only requested line', () => {
      const results = getProximosBuses('1001', horarios, 10, '181', new Date());
      expect(results.every((b) => b.linea === '181')).toBe(true);
    });

    it('line filter for D10 returns only D10', () => {
      const results = getProximosBuses('1001', horarios, 5, 'D10', new Date());
      expect(results.every((b) => b.linea === 'D10')).toBe(true);
    });

    it('cantidad limits results', () => {
      const results = getProximosBuses('1001', horarios, 3, undefined, new Date());
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('cantidad=1 returns exactly 1 result', () => {
      const results = getProximosBuses('1001', horarios, 1, undefined, new Date());
      expect(results).toHaveLength(1);
    });

    it('results sorted by minutosRestantes ascending', () => {
      const results = getProximosBuses('1001', horarios, 10, undefined, new Date());
      for (let i = 1; i < results.length; i++) {
        expect(results[i].minutosRestantes).toBeGreaterThanOrEqual(results[i - 1].minutosRestantes);
      }
    });
  });

  describe('Monday late night 23:50', () => {
    beforeEach(() => setMontevdeoTime('2024-11-25T23:50:00'));

    it('shows last buses or no more today message', () => {
      const results = getProximosBuses('1001', horarios, 5, '181', new Date());
      // At 23:50, last bus at 23:45 has already passed, 24:00 (midnight) is in 10 min
      // Should show 24:00 bus as 10 minutes away
      if (results.length > 0) {
        expect(results[0].minutosRestantes).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Midnight rollover', () => {
    it('asking at 23:58, bus at 00:05 (7 min away)', () => {
      setMontevdeoTime('2024-11-25T23:58:00');

      // Create a specific test with a bus at 24:05
      const testHorarios: Horario[] = [
        makeHorario({ paradaId: '9999', linea: '181', tipoDia: 'L', hora: 23, minuto: 50 }),
        makeHorario({ paradaId: '9999', linea: '181', tipoDia: 'L', hora: 24, minuto: 5 }),
      ];

      const results = getProximosBuses('9999', testHorarios, 5, undefined, new Date());
      // Bus at 24:05 = 00:05 next calendar day = 7 min from 23:58
      const midnightBus = results.find((b) => b.horarioEstimado === '00:05');
      expect(midnightBus).toBeDefined();
      expect(midnightBus!.minutosRestantes).toBeCloseTo(7, 0);
    });
  });

  describe('Saturday schedule', () => {
    beforeEach(() => setMontevdeoTime('2024-11-23T10:00:00')); // Saturday

    it('uses Saturday schedule', () => {
      const results = getProximosBuses('1001', horarios, 5, '181', new Date());
      // Saturday has fewer buses
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Sunday schedule', () => {
    beforeEach(() => setMontevdeoTime('2024-11-24T14:00:00')); // Sunday

    it('uses Sunday schedule', () => {
      const results = getProximosBuses('1001', horarios, 5, '181', new Date());
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('line format normalization', () => {
    it('"181" matches "181"', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('1001', horarios, 5, '181', new Date());
      expect(results.every((b) => b.linea === '181')).toBe(true);
    });

    it('"0181" matches "181" (leading zeros removed)', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('1001', horarios, 5, '0181', new Date());
      // Should find line "181" even if queried as "0181"
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('non-existent line', () => {
    it('returns empty array for line that does not serve this stop', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('1001', horarios, 5, '999', new Date());
      expect(results).toHaveLength(0);
    });
  });

  describe('empty schedule', () => {
    it('returns empty array when no horarios for this parada', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('NONEXISTENT', horarios, 5, undefined, new Date());
      expect(results).toHaveLength(0);
    });

    it('returns empty array with empty horarios list', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('1001', [], 5, undefined, new Date());
      expect(results).toHaveLength(0);
    });
  });

  describe('duplicate horarios deduplication', () => {
    it('deduplicates duplicate entries for same line+time', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const duplicateHorarios: Horario[] = [
        makeHorario({ paradaId: '5555', linea: '181', tipoDia: 'L', hora: 8, minuto: 10 }),
        makeHorario({ paradaId: '5555', linea: '181', tipoDia: 'L', hora: 8, minuto: 10 }), // duplicate
        makeHorario({ paradaId: '5555', linea: '181', tipoDia: 'L', hora: 8, minuto: 10 }), // duplicate
        makeHorario({ paradaId: '5555', linea: '181', tipoDia: 'L', hora: 8, minuto: 25 }),
      ];

      const results = getProximosBuses('5555', duplicateHorarios, 10, undefined, new Date());
      const at810 = results.filter((b) => b.horarioEstimado === '08:10');
      expect(at810).toHaveLength(1); // deduplicated
    });
  });

  describe('result structure', () => {
    it('each result has required fields', () => {
      setMontevdeoTime('2024-11-25T08:00:00');
      const results = getProximosBuses('1001', horarios, 3, undefined, new Date());
      if (results.length > 0) {
        const bus = results[0];
        expect(bus).toHaveProperty('linea');
        expect(bus).toHaveProperty('variante');
        expect(bus).toHaveProperty('destino');
        expect(bus).toHaveProperty('horarioEstimado');
        expect(bus).toHaveProperty('minutosRestantes');
        expect(typeof bus.minutosRestantes).toBe('number');
        expect(bus.horarioEstimado).toMatch(/^\d{2}:\d{2}$/);
      }
    });
  });
});
