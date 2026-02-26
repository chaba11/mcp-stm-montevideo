import type { Parada } from "../../src/types/parada.js";

/**
 * ~15 paradas with approximate real WGS84 coordinates for Montevideo neighborhoods.
 * Used in LOOP-03B geo tests.
 */
export const PARADAS_GEO: Parada[] = [
  // Tres Cruces
  { id: 100, linea: "181", variante: 52, ordinal: 1, calle: "BULEVAR ARTIGAS", esquina: "AV ITALIA", lat: -34.8937, lng: -56.1675 },
  { id: 101, linea: "181", variante: 52, ordinal: 2, calle: "AV ITALIA", esquina: "BULEVAR ARTIGAS", lat: -34.8940, lng: -56.1680 },
  { id: 102, linea: "405", variante: 24, ordinal: 1, calle: "BULEVAR ARTIGAS", esquina: "JOSE ENRIQUE RODO", lat: -34.8945, lng: -56.1670 },

  // Ciudad Vieja
  { id: 200, linea: "402", variante: 8, ordinal: 1, calle: "SARANDÍ", esquina: "JUAN CARLOS GÓMEZ", lat: -34.9065, lng: -56.2005 },
  { id: 201, linea: "402", variante: 8, ordinal: 2, calle: "25 DE MAYO", esquina: "ITUZAINGÓ", lat: -34.9070, lng: -56.2010 },
  { id: 202, linea: "G", variante: 99, ordinal: 1, calle: "RINCÓN", esquina: "BACACAY", lat: -34.9060, lng: -56.2000 },

  // Pocitos
  { id: 300, linea: "121", variante: 60, ordinal: 1, calle: "BV ESPAÑA", esquina: "LIBERTAD", lat: -34.9145, lng: -56.1505 },
  { id: 301, linea: "121", variante: 60, ordinal: 2, calle: "LIBERTAD", esquina: "BV ESPAÑA", lat: -34.9150, lng: -56.1510 },
  { id: 302, linea: "121", variante: 60, ordinal: 3, calle: "BV ESPAÑA", esquina: "ELLAURI", lat: -34.9148, lng: -56.1550 },

  // Parque Rodó
  { id: 400, linea: "405", variante: 24, ordinal: 5, calle: "RAMBLA GANDHI", esquina: "JOSE ENRIQUE RODO", lat: -34.9120, lng: -56.1680 },
  { id: 401, linea: "405", variante: 24, ordinal: 6, calle: "JOSE ENRIQUE RODO", esquina: "21 DE SETIEMBRE", lat: -34.9115, lng: -56.1685 },

  // Centro (18 de Julio)
  { id: 500, linea: "D1", variante: 10, ordinal: 1, calle: "18 DE JULIO", esquina: "EJIDO", lat: -34.9060, lng: -56.1880 },
  { id: 501, linea: "D1", variante: 10, ordinal: 2, calle: "EJIDO", esquina: "18 DE JULIO", lat: -34.9062, lng: -56.1883 },
  { id: 502, linea: "D1", variante: 10, ordinal: 3, calle: "18 DE JULIO", esquina: "RÍO NEGRO", lat: -34.9058, lng: -56.1870 },

  // Tres Cruces duplicate coords (for edge case test)
  { id: 103, linea: "199", variante: 77, ordinal: 1, calle: "BULEVAR ARTIGAS", esquina: "AV ITALIA", lat: -34.8937, lng: -56.1675 },
];
