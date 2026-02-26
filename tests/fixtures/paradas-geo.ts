import type { Parada } from '../../src/types/parada.js';

/**
 * Known Montevideo paradas with real WGS84 coordinates.
 * Used for geo utility testing.
 */
export const PARADAS_GEO: Parada[] = [
  // Tres Cruces terminal area
  {
    id: 'TC001',
    nombre: 'TERMINAL TRES CRUCES - BULEVAR ARTIGAS',
    lat: -34.8937,
    lon: -56.1675,
    empresa: '01',
  },
  {
    id: 'TC002',
    nombre: 'BV ARTIGAS ESQ.GALICIA - TRES CRUCES',
    lat: -34.8945,
    lon: -56.1680,
    empresa: '01',
  },
  {
    id: 'TC003',
    nombre: 'AV ITALIA ESQ.BV ARTIGAS',
    lat: -34.8930,
    lon: -56.1660,
    empresa: '01',
  },

  // Ciudad Vieja
  {
    id: 'CV001',
    nombre: 'PLAZA INDEPENDENCIA - CIUDAD VIEJA',
    lat: -34.9058,
    lon: -56.1981,
    empresa: '01',
  },
  {
    id: 'CV002',
    nombre: 'RAMBLA 25 DE AGOSTO ESQ.YACARE - CIUDAD VIEJA',
    lat: -34.9065,
    lon: -56.2005,
    empresa: '01',
  },
  {
    id: 'CV003',
    nombre: 'SARANDI ESQ.25 DE MAYO - CIUDAD VIEJA',
    lat: -34.9050,
    lon: -56.1960,
    empresa: '01',
  },

  // Pocitos
  {
    id: 'PO001',
    nombre: 'RAMBLA REP.DEL PERU ESQ.SOLANO GARCIA - POCITOS',
    lat: -34.9145,
    lon: -56.1505,
    empresa: '02',
  },
  {
    id: 'PO002',
    nombre: 'AV 26 DE MARZO ESQ.FRANCISCO VIDAL - POCITOS',
    lat: -34.9140,
    lon: -56.1520,
    empresa: '02',
  },
  {
    id: 'PO003',
    nombre: 'BULEVAR ESPAÑA ESQ.LIBERTAD',
    lat: -34.9080,
    lon: -56.1850,
    empresa: '01',
  },

  // Centro (18 de Julio)
  {
    id: 'CE001',
    nombre: '18 DE JULIO ESQ.EJIDO - CENTRO',
    lat: -34.9060,
    lon: -56.1880,
    empresa: '01',
  },
  {
    id: 'CE002',
    nombre: '18 DE JULIO ESQ.YI',
    lat: -34.9063,
    lon: -56.1920,
    empresa: '01',
  },
  {
    id: 'CE003',
    nombre: '18 DE JULIO ESQ.CONVENCION',
    lat: -34.9058,
    lon: -56.1840,
    empresa: '01',
  },

  // Parque Rodó
  {
    id: 'PR001',
    nombre: 'AV DEL LIBERTADOR ESQ.PARQUE RODO',
    lat: -34.9120,
    lon: -56.1680,
    empresa: '03',
  },
  {
    id: 'PR002',
    nombre: 'BV ESPAÑA ESQ.PABLO ZUFRIATEGUI - PARQUE RODO',
    lat: -34.9115,
    lon: -56.1720,
    empresa: '03',
  },

  // Agraciada
  {
    id: 'AG001',
    nombre: 'AV AGRACIADA ESQ.PAYSANDU',
    lat: -34.8980,
    lon: -56.1950,
    empresa: '01',
  },
];

/** Known distance between TC001 and TC002: approximately 100m */
export const DISTANCE_TC001_TO_TC002_APPROX = 100;

/** Center of Tres Cruces terminal */
export const TRES_CRUCES_CENTER = { lat: -34.8937, lon: -56.1675 };

/** Center of Ciudad Vieja */
export const CIUDAD_VIEJA_CENTER = { lat: -34.9058, lon: -56.1981 };

/** Center of Pocitos */
export const POCITOS_CENTER = { lat: -34.9145, lon: -56.1505 };

/** Center of Centro (18 de Julio) */
export const CENTRO_CENTER = { lat: -34.9060, lon: -56.1880 };

/** A point in the middle of the Rio de la Plata (no stops nearby) */
export const MIDDLE_OF_RIO = { lat: -34.90, lon: -56.80 };

/** NYC coordinates (far from Montevideo) */
export const NEW_YORK = { lat: 40.7128, lon: -74.006 };
