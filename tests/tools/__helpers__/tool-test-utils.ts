/**
 * Shared test utilities for MCP tool tests.
 */
import { CkanClient } from "../../../src/data/ckan-client.js";
import { Cache } from "../../../src/data/cache.js";
import { PARADAS_FIXTURE, HORARIOS_FIXTURE, LINEAS_FIXTURE } from "../../fixtures/schedule-data.js";
import type { Parada } from "../../../src/types/parada.js";
import type { HorarioRow } from "../../../src/types/horario.js";
import type { LineaVariante } from "../../../src/types/linea.js";

export interface MockClientOptions {
  paradas?: Parada[];
  horarios?: HorarioRow[];
  lineas?: LineaVariante[];
}

/** Create a CkanClient with all data methods overridden by fixtures. */
export function createMockClient(options: MockClientOptions = {}): CkanClient {
  const cache = new Cache();
  const client = new CkanClient({ cache, skipLocalFiles: true });
  client.getParadas = async () => options.paradas ?? PARADAS_FIXTURE;
  client.getHorarios = async () => options.horarios ?? HORARIOS_FIXTURE;
  client.getLineas = async () => options.lineas ?? LINEAS_FIXTURE;
  return client;
}

/**
 * Create a Date in America/Montevideo at the given hour:minute on a specific weekday.
 * Uses known reference dates:
 *   Monday    = 2026-02-23
 *   Tuesday   = 2026-02-24
 *   Wednesday = 2026-02-25
 *   Thursday  = 2026-02-26
 *   Friday    = 2026-02-27
 *   Saturday  = 2026-02-28
 *   Sunday    = 2026-03-01
 */
export function montevideoTime(
  hour: number,
  minute: number,
  day: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday" = "wednesday"
): Date {
  const dates: Record<string, string> = {
    monday: "2026-02-23",
    tuesday: "2026-02-24",
    wednesday: "2026-02-25",
    thursday: "2026-02-26",
    friday: "2026-02-27",
    saturday: "2026-02-28",
    sunday: "2026-03-01",
  };
  const dateStr = dates[day];
  // Montevideo is UTC-3
  const paddedHour = String(hour).padStart(2, "0");
  const paddedMin = String(minute).padStart(2, "0");
  return new Date(`${dateStr}T${paddedHour}:${paddedMin}:00-03:00`);
}
