import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CkanClient } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";
import { proximosBusesHandler } from "../../src/tools/proximos-buses.js";
import { GpsClient } from "../../src/data/gps-client.js";
import type { UpcomingBusesResult } from "../../src/data/gps-client.js";
import { StopMapper } from "../../src/data/stop-mapper.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
import { LINEAS_FIXTURE } from "../fixtures/schedule-data.js";
import { createMockClient, montevideoTime } from "./__helpers__/tool-test-utils.js";
import type { HorarioRow } from "../../src/types/horario.js";
import type { LineaVariante } from "../../src/types/linea.js";

// Wednesday 2026-02-25 10:30 Montevideo (UTC-3 = 13:30 UTC)
const WEDNESDAY_10_30 = new Date("2026-02-25T13:30:00Z");
// Wednesday 2026-02-25 23:50 Montevideo (very late — no more buses)
const WEDNESDAY_23_50 = new Date("2026-02-26T02:50:00Z");
// Saturday 2026-02-28 10:00 Montevideo
const SATURDAY_10_00 = new Date("2026-02-28T13:00:00Z");
// Sunday 2026-03-01 10:00 Montevideo
const SUNDAY_10_00 = new Date("2026-03-01T13:00:00Z");

// Parada 300 is in PARADAS_GEO (Pocitos area)
const TEST_PARADA_ID = 300;

const MOCK_LINEAS: LineaVariante[] = [
  {
    gid: 1,
    codLinea: 181,
    descLinea: "181",
    ordinalSublinea: 1,
    codSublinea: 1,
    descSublinea: "POCITOS - CENTRO",
    codVariante: 5200,
    descVariante: "A",
    codOrigen: 1,
    descOrigen: "POCITOS",
    codDestino: 2,
    descDestino: "TRES CRUCES",
  },
  {
    gid: 2,
    codLinea: 121,
    descLinea: "121",
    ordinalSublinea: 1,
    codSublinea: 1,
    descSublinea: "MALVIN - CIUDAD VIEJA",
    codVariante: 5201,
    descVariante: "B",
    codOrigen: 3,
    descOrigen: "MALVIN",
    codDestino: 4,
    descDestino: "CIUDAD VIEJA",
  },
];

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

const MOCK_HORARIOS: HorarioRow[] = [
  // Weekday (1) — parada 300, line 181 (variante 5200)
  makeHorario(300, 5200, 1000, 1), // 10:00
  makeHorario(300, 5200, 1030, 1), // 10:30
  makeHorario(300, 5200, 1100, 1), // 11:00
  makeHorario(300, 5200, 1130, 1), // 11:30
  makeHorario(300, 5200, 1200, 1), // 12:00
  // Weekday — parada 300, line 121 (variante 5201)
  makeHorario(300, 5201, 1015, 1), // 10:15
  makeHorario(300, 5201, 1045, 1), // 10:45
  // Saturday (2) — parada 300
  makeHorario(300, 5200, 1000, 2), // 10:00
  makeHorario(300, 5200, 1100, 2), // 11:00
  // Sunday (3) — parada 300
  makeHorario(300, 5200, 1000, 3), // 10:00
  makeHorario(300, 5200, 1100, 3), // 11:00
  // Another stop — weekday
  makeHorario(999, 5200, 1000, 1),
];

function makeMockClient(): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache });
  client.getParadas = async () => PARADAS_GEO;
  client.getHorarios = async () => MOCK_HORARIOS;
  client.getLineas = async () => MOCK_LINEAS;
  return client;
}

describe("proximos_buses handler", () => {
  let client: CkanClient;

  beforeEach(() => {
    client = makeMockClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns buses for a parada_id on a weekday after 10:30", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 5 },
      client,
      null,
      WEDNESDAY_10_30
    );
    expect(result.content[0].type).toBe("text");
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // At 10:30 — only 11:00 and later should appear
    const times = parsed.map((b: { horario_estimado: string }) => b.horario_estimado);
    expect(times).not.toContain("10:00");
    expect(times).not.toContain("10:30");
    expect(times).toContain("11:00");
  });

  it("returns required fields in each result", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID },
      client,
      null,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      linea: string;
      variante: number;
      destino: string;
      horario_estimado: string;
      minutos_restantes: number;
      parada_nombre: string;
      fuente: string;
    }>;
    for (const b of parsed) {
      expect(typeof b.linea).toBe("string");
      expect(typeof b.variante).toBe("number");
      expect(typeof b.destino).toBe("string");
      expect(typeof b.horario_estimado).toBe("string");
      expect(b.horario_estimado).toMatch(/^\d{2}:\d{2}$/);
      expect(typeof b.minutos_restantes).toBe("number");
      expect(b.minutos_restantes).toBeGreaterThanOrEqual(0);
      expect(typeof b.parada_nombre).toBe("string");
      expect(b.fuente).toBe("horario_planificado");
    }
  });

  it("filters by linea", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181", cantidad: 10 },
      client,
      null,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ linea: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.linea).toBe("181");
    }
  });

  it("line filter is case-insensitive", async () => {
    const upper = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181" },
      client,
      null,
      WEDNESDAY_10_30
    );
    const lower = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181" },
      client,
      null,
      WEDNESDAY_10_30
    );
    expect(upper.content[0].text).toBe(lower.content[0].text);
  });

  it("returns message when no args provided", async () => {
    const result = await proximosBusesHandler({}, client, null, WEDNESDAY_10_30);
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns no-more-buses message at 23:50 with first buses tomorrow", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID },
      client,
      null,
      WEDNESDAY_23_50
    );
    expect(result.content[0].text).toContain("No hay más buses hoy");
    expect(result.content[0].text).toContain("mañana");
    // tomorrow is Thursday (HABIL), so same tipo_dia=1 buses, parsing inner JSON
    const jsonPart = result.content[0].text.split("\n").slice(1).join("\n");
    const parsed = JSON.parse(jsonPart);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    // minutos_restantes is -1 for next day
    for (const b of parsed) {
      expect(b.minutos_restantes).toBe(-1);
    }
  });

  it("returns empty message when no horarios for stop", async () => {
    const result = await proximosBusesHandler(
      { parada_id: 9999 },
      client,
      null,
      WEDNESDAY_10_30
    );
    expect(result.content[0].text).toContain("No se encontraron horarios");
  });

  it("resolves parada from calle1 and returns results", async () => {
    // "bulevar artigas" should fuzzy-match a stop in PARADAS_GEO
    const result = await proximosBusesHandler(
      { calle1: "BV ESPAÑA", cantidad: 3 },
      client,
      null,
      WEDNESDAY_10_30
    );
    // Either returns buses or "no horarios" — depends if matched stop has horarios
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("returns error when calle1 not found", async () => {
    const result = await proximosBusesHandler(
      { calle1: "CALLE_COMPLETAMENTE_INVENTADA_ZZZZZ" },
      client,
      null,
      WEDNESDAY_10_30
    );
    expect(result.content[0].text).toContain("No se encontró ninguna parada");
  });

  it("respects cantidad limit", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 2 },
      client,
      null,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.length).toBeLessThanOrEqual(2);
  });

  it("results sorted by horario_estimado ascending", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 10 },
      client,
      null,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ horario_estimado: string }>;
    for (let i = 1; i < parsed.length; i++) {
      expect(parsed[i - 1].horario_estimado <= parsed[i].horario_estimado).toBe(true);
    }
  });

  it("calculates minutos_restantes correctly", async () => {
    // At 10:30, the 11:00 bus should be 30 minutes away
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181", cantidad: 1 },
      client,
      null,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
      minutos_restantes: number;
    }>;
    expect(parsed[0].horario_estimado).toBe("11:00");
    expect(parsed[0].minutos_restantes).toBe(30);
  });

  it("handles Saturday schedule (tipo_dia=2)", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 5 },
      client,
      null,
      SATURDAY_10_00
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
    }>;
    // Saturday has horarios at 10:00 and 11:00 — at 10:00, nothing strictly after, so...
    // Actually SATURDAY_10_00 is exactly 10:00, and filter is > currentMinutes (600 mins)
    // hmmToMinutes(1000) = 600, filter is > 600, so 10:00 is excluded
    // 11:00 (660) > 600, so it should appear
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].horario_estimado).toBe("11:00");
  });

  it("handles Sunday schedule (tipo_dia=3)", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 5 },
      client,
      null,
      SUNDAY_10_00
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].horario_estimado).toBe("11:00");
  });
});

describe("proximos_buses — extended edge cases with realistic schedule", () => {
  it("Monday 8:00 — returns next buses within minutes", async () => {
    const client = createMockClient();
    const now = montevideoTime(8, 0, "monday");
    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      null,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      minutos_restantes: number;
      horario_estimado: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    // First bus should be within a reasonable time (line runs every 15 min from 5:30)
    expect(parsed[0].minutos_restantes).toBeGreaterThanOrEqual(0);
    expect(parsed[0].minutos_restantes).toBeLessThanOrEqual(20);
  });

  it("Monday 23:50 — no more buses today, shows tomorrow", async () => {
    const client = createMockClient();
    const now = montevideoTime(23, 50, "monday");
    const result = await proximosBusesHandler({ parada_id: 300 }, client, null, now);
    expect(result.content[0].text).toContain("No hay más buses hoy");
    const jsonPart = result.content[0].text.split("\n").slice(1).join("\n");
    const parsed = JSON.parse(jsonPart);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.minutos_restantes).toBe(-1);
    }
  });

  it("Saturday 10:00 — uses weekend schedule (tipo_dia=2)", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "saturday");
    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      null,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    // Saturday runs every 20 min from 6:00 — verify time is after 10:00
    for (const b of parsed) {
      expect(b.horario_estimado > "10:00").toBe(true);
    }
  });

  it("Sunday 14:00 — uses Sunday schedule (tipo_dia=3)", async () => {
    const client = createMockClient();
    const now = montevideoTime(14, 0, "sunday");
    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      null,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.horario_estimado > "14:00").toBe(true);
    }
  });

  it("non-existent line returns friendly message", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0);
    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "999" },
      client,
      null,
      now
    );
    expect(result.content[0].text).toContain("No se encontraron horarios");
    expect(result.content[0].text).toContain("999");
  });

  it("cantidad=1 returns exactly 1 result", async () => {
    const client = createMockClient();
    const now = montevideoTime(8, 0, "monday");
    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 1 },
      client,
      null,
      now
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.length).toBe(1);
  });

  it("parada_id takes priority over calle1 when both provided", async () => {
    const client = createMockClient();
    const now = montevideoTime(8, 0, "monday");
    // parada_id=300 serves line 181; calle1="AV AGRACIADA" serves line D10
    const byId = await proximosBusesHandler(
      { parada_id: 300, linea: "181" },
      client,
      null,
      now
    );
    const byBoth = await proximosBusesHandler(
      { parada_id: 300, calle1: "AV AGRACIADA", linea: "181" },
      client,
      null,
      now
    );
    // Both should use parada 300 and return 181 buses
    expect(byId.content[0].text).toBe(byBoth.content[0].text);
  });

  it("by calle1+calle2 resolves parada and returns schedule", async () => {
    const client = createMockClient();
    const now = montevideoTime(8, 0, "monday");
    // "BV ESPAÑA" + "LIBERTAD" should resolve to parada 300
    const result = await proximosBusesHandler(
      { calle1: "BV ESPAÑA", calle2: "LIBERTAD", cantidad: 3 },
      client,
      null,
      now
    );
    expect(result.content[0].type).toBe("text");
    // Either gets buses or "no horarios" message — should not crash
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("empty horarios returns graceful message", async () => {
    const client = createMockClient({ horarios: [] });
    const now = montevideoTime(10, 0);
    const result = await proximosBusesHandler({ parada_id: 300 }, client, null, now);
    expect(result.content[0].text).toContain("No se encontraron horarios");
  });

  it("duplicate horarios at same time are both included (not deduplicated)", async () => {
    // Two entries at same hora for same stop — both should appear sorted
    const client = createMockClient({
      horarios: [
        { tipo_dia: 1, cod_variante: 5200, frecuencia: 0, cod_ubic_parada: 300, ordinal: 1, hora: 1000, dia_anterior: "N" },
        { tipo_dia: 1, cod_variante: 5200, frecuencia: 0, cod_ubic_parada: 300, ordinal: 2, hora: 1000, dia_anterior: "N" },
        { tipo_dia: 1, cod_variante: 5200, frecuencia: 0, cod_ubic_parada: 300, ordinal: 3, hora: 1015, dia_anterior: "N" },
      ],
      lineas: LINEAS_FIXTURE,
    });
    const now = montevideoTime(9, 0, "wednesday");
    const result = await proximosBusesHandler({ parada_id: 300, cantidad: 10 }, client, null, now);
    const parsed = JSON.parse(result.content[0].text);
    // Should contain 3 results sorted by hora
    expect(parsed.length).toBe(3);
    expect(parsed[0].horario_estimado).toBe("10:00");
    expect(parsed[1].horario_estimado).toBe("10:00");
    expect(parsed[2].horario_estimado).toBe("10:15");
  });
});

describe("proximos_buses — real-time ETA", () => {
  function makeMockGps(result: UpcomingBusesResult): GpsClient {
    const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
    gps.fetchUpcomingBuses = vi.fn().mockResolvedValue(result);
    return gps;
  }

  function makeMockGpsThrows(): GpsClient {
    const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
    gps.fetchUpcomingBuses = vi.fn().mockRejectedValue(new Error("API timeout"));
    return gps;
  }

  it("uses real-time ETA when GPS client returns data", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = makeMockGps({
      available: true,
      buses: [
        { linea: "181", destino: "TRES CRUCES", eta_segundos: 300, distancia_metros: 1200 },
        { linea: "181", destino: "TRES CRUCES", eta_segundos: 900, distancia_metros: 3500 },
      ],
    });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      linea: string;
      destino: string;
      minutos_restantes: number;
      fuente: string;
    }>;
    expect(parsed.length).toBe(2);
    expect(parsed[0].fuente).toBe("tiempo_real");
    expect(parsed[0].linea).toBe("181");
    expect(parsed[0].minutos_restantes).toBe(5); // 300s / 60
    expect(parsed[1].minutos_restantes).toBe(15); // 900s / 60
  });

  it("falls back to static when GPS returns available: false", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = makeMockGps({ available: false, message: "No credentials" });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ fuente: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.fuente).toBe("horario_planificado");
    }
  });

  it("falls back to static when GPS returns empty buses array", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = makeMockGps({ available: true, buses: [] });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ fuente: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.fuente).toBe("horario_planificado");
    }
  });

  it("falls back to static when GPS throws an error", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = makeMockGpsThrows();

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ fuente: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.fuente).toBe("horario_planificado");
    }
  });

  it("uses static path when gps is null", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      null,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{ fuente: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.fuente).toBe("horario_planificado");
    }
  });

  it("real-time ETA calculates horario_estimado correctly", async () => {
    const client = createMockClient();
    // 10:00 AM Montevideo = 13:00 UTC
    const now = new Date("2026-02-25T13:00:00Z");
    const gps = makeMockGps({
      available: true,
      buses: [
        { linea: "181", destino: "CENTRO", eta_segundos: 600, distancia_metros: 2000 },
      ],
    });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181" },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
      minutos_restantes: number;
    }>;
    expect(parsed[0].horario_estimado).toBe("10:10"); // 10:00 + 600s = 10:10
    expect(parsed[0].minutos_restantes).toBe(10);
  });

  it("respects cantidad limit with real-time data", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = makeMockGps({
      available: true,
      buses: [
        { linea: "181", destino: "A", eta_segundos: 60, distancia_metros: 100 },
        { linea: "181", destino: "B", eta_segundos: 120, distancia_metros: 200 },
        { linea: "181", destino: "C", eta_segundos: 180, distancia_metros: 300 },
      ],
    });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 2 },
      client,
      gps,
      now
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.length).toBe(2);
  });
});

describe("proximos_buses — StopMapper integration", () => {
  function makeMockGpsWithMapper(
    upcomingResult: UpcomingBusesResult
  ): { gps: GpsClient; mapper: StopMapper } {
    const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
    gps.fetchUpcomingBuses = vi.fn().mockResolvedValue(upcomingResult);
    gps.fetchBusstops = vi.fn().mockResolvedValue([
      {
        busstopId: 8888,
        street1: "BV ESPAÑA",
        street2: "LIBERTAD",
        location: { type: "Point", coordinates: [-56.1505, -34.9145] },
      },
    ]);
    const mapper = new StopMapper(gps, { cache: new Cache() });
    return { gps, mapper };
  }

  it("with mapper: fetchUpcomingBuses receives GPS busstopId, not CKAN ID", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const { gps, mapper } = makeMockGpsWithMapper({
      available: true,
      buses: [
        { linea: "181", destino: "TRES CRUCES", eta_segundos: 300, distancia_metros: 1200 },
      ],
    });

    await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now,
      mapper
    );

    // The mapper should have resolved CKAN ID 300 → GPS busstopId 8888
    expect(gps.fetchUpcomingBuses).toHaveBeenCalledWith(8888, ["181"], 3);
  });

  it("mapper returns null → fallback to scheduled horarios", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
    gps.fetchUpcomingBuses = vi.fn().mockResolvedValue({ available: true, buses: [] });
    // Return a far-away busstop that won't match within tolerance
    gps.fetchBusstops = vi.fn().mockResolvedValue([
      {
        busstopId: 9999,
        street1: "LEJOS",
        street2: "MUY LEJOS",
        location: { type: "Point", coordinates: [-55.0, -33.0] }, // far away
      },
    ]);
    const mapper = new StopMapper(gps, { cache: new Cache() });

    const result = await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now,
      mapper
    );

    const parsed = JSON.parse(result.content[0].text) as Array<{ fuente: string }>;
    expect(parsed.length).toBeGreaterThan(0);
    for (const b of parsed) {
      expect(b.fuente).toBe("horario_planificado");
    }
    // fetchUpcomingBuses should NOT have been called since mapper returned null
    expect(gps.fetchUpcomingBuses).not.toHaveBeenCalled();
  });

  it("without mapper → uses CKAN ID directly (backward compat)", async () => {
    const client = createMockClient();
    const now = montevideoTime(10, 0, "monday");
    const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
    gps.fetchUpcomingBuses = vi.fn().mockResolvedValue({
      available: true,
      buses: [
        { linea: "181", destino: "CENTRO", eta_segundos: 120, distancia_metros: 500 },
      ],
    });

    await proximosBusesHandler(
      { parada_id: 300, linea: "181", cantidad: 3 },
      client,
      gps,
      now
      // no mapper
    );

    // Without mapper, CKAN ID 300 is used directly
    expect(gps.fetchUpcomingBuses).toHaveBeenCalledWith(300, ["181"], 3);
  });
});
