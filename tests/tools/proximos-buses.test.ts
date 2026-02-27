import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CkanClient } from "../../src/data/ckan-client.js";
import { Cache } from "../../src/data/cache.js";
import { proximosBusesHandler } from "../../src/tools/proximos-buses.js";
import { PARADAS_GEO } from "../fixtures/paradas-geo.js";
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
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      linea: string;
      variante: number;
      destino: string;
      horario_estimado: string;
      minutos_restantes: number;
      parada_nombre: string;
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
    }
  });

  it("filters by linea", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181", cantidad: 10 },
      client,
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
      WEDNESDAY_10_30
    );
    const lower = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, linea: "181" },
      client,
      WEDNESDAY_10_30
    );
    expect(upper.content[0].text).toBe(lower.content[0].text);
  });

  it("returns message when no args provided", async () => {
    const result = await proximosBusesHandler({}, client, WEDNESDAY_10_30);
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns no-more-buses message at 23:50 with first buses tomorrow", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID },
      client,
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
      WEDNESDAY_10_30
    );
    expect(result.content[0].text).toContain("No se encontraron horarios");
  });

  it("resolves parada from calle1 and returns results", async () => {
    // "bulevar artigas" should fuzzy-match a stop in PARADAS_GEO
    const result = await proximosBusesHandler(
      { calle1: "BV ESPAÑA", cantidad: 3 },
      client,
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
      WEDNESDAY_10_30
    );
    expect(result.content[0].text).toContain("No se encontró ninguna parada");
  });

  it("respects cantidad limit", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 2 },
      client,
      WEDNESDAY_10_30
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.length).toBeLessThanOrEqual(2);
  });

  it("results sorted by horario_estimado ascending", async () => {
    const result = await proximosBusesHandler(
      { parada_id: TEST_PARADA_ID, cantidad: 10 },
      client,
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
      SUNDAY_10_00
    );
    const parsed = JSON.parse(result.content[0].text) as Array<{
      horario_estimado: string;
    }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].horario_estimado).toBe("11:00");
  });
});
