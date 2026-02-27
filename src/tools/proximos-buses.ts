import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CkanClient } from "../data/ckan-client.js";
import type { GpsClient } from "../data/gps-client.js";
import type { StopMapper } from "../data/stop-mapper.js";
import { getNextBuses } from "../data/schedule.js";
import { findNearestParadas } from "../geo/distance.js";
import { geocodeIntersection } from "../geo/geocode.js";
import { estimateEtaFromPositions } from "../geo/route-eta.js";
import { fuzzySearchParadas } from "../geo/search.js";
import type { Parada } from "../types/parada.js";

export interface ProximosBusesArgs {
  parada_id?: number;
  calle1?: string;
  calle2?: string;
  linea?: string;
  cantidad?: number;
}

export interface ProximoBusResult {
  linea: string;
  variante: number;
  destino: string;
  horario_estimado: string;
  minutos_restantes: number;
  parada_nombre: string;
  fuente: "tiempo_real" | "gps_estimado" | "horario_planificado";
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

const INPUT_SCHEMA = {
  parada_id: z
    .number()
    .optional()
    .describe("ID de la parada obtenido de buscar_parada"),
  calle1: z
    .string()
    .optional()
    .describe("Calle o avenida para buscar la parada automáticamente"),
  calle2: z.string().optional().describe("Calle de intersección"),
  linea: z
    .string()
    .optional()
    .describe("Número de línea a filtrar (ej: 181, D10)"),
  cantidad: z
    .number()
    .optional()
    .default(5)
    .describe("Cantidad de próximos buses a mostrar (por defecto: 5)"),
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

async function resolveParadaId(
  calle1: string,
  calle2: string | undefined,
  paradas: Parada[],
  linea?: string
): Promise<{ id: number; nombre: string } | null> {
  // When a line is known, prefer stops on that line for better precision.
  // This also helps when encoding corruption breaks intersection search on the full dataset,
  // since the smaller filtered set may match differently.
  const lineParadas = linea ? paradas.filter((p) => p.linea === linea) : [];
  const primaryPool = lineParadas.length > 0 ? lineParadas : paradas;

  if (calle2) {
    // Try against line-specific stops first, then fall back to all stops
    const point =
      (await geocodeIntersection(calle1, calle2, primaryPool)) ??
      (lineParadas.length > 0 ? await geocodeIntersection(calle1, calle2, paradas) : null);
    if (!point) return null;
    const nearest = findNearestParadas(point.lat, point.lon, primaryPool, 500, 1);
    if (nearest.length === 0) return null;
    const p = nearest[0];
    return { id: p.id, nombre: `${p.calle}${p.esquina ? " y " + p.esquina : ""}` };
  }

  const matches = fuzzySearchParadas(calle1, primaryPool);
  if (matches.length === 0) return null;
  const best = matches[0];
  return { id: best.id, nombre: `${best.calle}${best.esquina ? " y " + best.esquina : ""}` };
}

/**
 * Core handler for proximos_buses — exported for direct unit testing.
 */
export async function proximosBusesHandler(
  args: ProximosBusesArgs,
  client: CkanClient,
  gps?: GpsClient | null,
  now?: Date,
  stopMapper?: StopMapper | null
): Promise<ToolResponse> {
  const { parada_id, calle1, calle2, linea, cantidad = 5 } = args;
  const currentTime = now ?? new Date();

  let paradaId: number;
  let paradaNombre: string;

  if (parada_id !== undefined) {
    paradaId = parada_id;
    paradaNombre = `Parada ${paradaId}`;
  } else if (calle1) {
    const paradas = await client.getParadas();
    const resolved = await resolveParadaId(calle1, calle2, paradas, linea);
    if (!resolved) {
      return textResponse(
        `No se encontró ninguna parada en "${calle1}${calle2 ? " y " + calle2 : ""}".`
      );
    }
    paradaId = resolved.id;
    paradaNombre = resolved.nombre;
  } else {
    return textResponse(
      "Proporciona un parada_id o una dirección (calle1 y opcionalmente calle2)."
    );
  }

  // Always load CKAN data (needed for fallback and to determine lines)
  let horarios, lineas;
  try {
    [horarios, lineas] = await Promise.all([
      client.getHorarios(),
      client.getLineas(),
    ]);
  } catch (err) {
    return textResponse(
      `Error al cargar los horarios del STM: ${err instanceof Error ? err.message : "Error desconocido"}.`
    );
  }

  // Try real-time ETA first if GPS client is available
  if (gps) {
    try {
      // Determine which lines to query
      let queryLines: string[];
      if (linea) {
        queryLines = [linea];
      } else {
        // Extract unique lines serving this stop from CKAN horarios
        const variantesAtStop = new Set(
          horarios
            .filter((h) => h.cod_ubic_parada === paradaId)
            .map((h) => h.cod_variante)
        );
        const lineNames = new Set<string>();
        for (const l of lineas) {
          if (variantesAtStop.has(l.codVariante)) {
            lineNames.add(l.descLinea);
          }
        }
        queryLines = Array.from(lineNames);
      }

      if (queryLines.length > 0) {
        // Resolve the GPS busstopId if a mapper is available.
        // If mapper can't find a match, skip fetchUpcomingBuses but still try position-based ETA.
        let gpsBusstopId: number | null = paradaId;
        if (stopMapper) {
          const paradas = await client.getParadas();
          const parada = paradas.find((p) => p.id === paradaId);
          if (parada) {
            gpsBusstopId = await stopMapper.resolveGpsBusstopId(paradaId, parada.lat, parada.lng);
          }
        }

        if (gpsBusstopId !== null) {
          const rtResult = await gps.fetchUpcomingBuses(gpsBusstopId, queryLines, cantidad);
          if (rtResult.available && rtResult.buses && rtResult.buses.length > 0) {
            const output: ProximoBusResult[] = rtResult.buses
              .slice(0, cantidad)
              .map((b) => {
                const arrival = new Date(currentTime.getTime() + b.eta_segundos * 1000);
                // Convert arrival to Montevideo time for display
                const mvdTime = new Date(arrival.toLocaleString("en-US", { timeZone: "America/Montevideo" }));
                const mvdHH = String(mvdTime.getHours()).padStart(2, "0");
                const mvdMM = String(mvdTime.getMinutes()).padStart(2, "0");
                return {
                  linea: b.linea,
                  variante: 0,
                  destino: b.destino,
                  horario_estimado: `${mvdHH}:${mvdMM}`,
                  minutos_restantes: Math.round(b.eta_segundos / 60),
                  parada_nombre: paradaNombre,
                  fuente: "tiempo_real" as const,
                };
              });
            return textResponse(JSON.stringify(output, null, 2));
          }
        }

        // upcomingBuses empty or skipped — try GPS position-based ETA estimation
        const paradas = await client.getParadas();
        const gpsLines = queryLines.slice(0, 5); // limit parallel calls
        const positionResults = await Promise.all(
          gpsLines.map((l) => gps.fetchBusPositions(l).catch(() => null))
        );

        const allPositions = positionResults.flatMap((r) =>
          r && r.available && r.positions ? r.positions : []
        );

        if (allPositions.length > 0) {
          // Collect route paradas for all CKAN variants of the queried lines.
          // GPS lineVariantId may not match CKAN codVariante exactly,
          // so we include all variants — estimateEtaFromPositions handles the matching.
          const lineVariantes = new Set(
            lineas
              .filter((l) => gpsLines.includes(l.descLinea))
              .map((l) => l.codVariante)
          );
          const routeParadas = paradas.filter((p) => lineVariantes.has(p.variante));

          // Each fetchBusPositions(line) already returns only buses for that line,
          // so no further variant filtering needed here.
          const allEstimates = gpsLines.flatMap((lineName) =>
            estimateEtaFromPositions(
              paradaId,
              allPositions,
              routeParadas,
              lineName,
              currentTime,
              horarios
            )
          );

          if (allEstimates.length > 0) {
            allEstimates.sort((a, b) => a.eta_segundos - b.eta_segundos);
            const output: ProximoBusResult[] = allEstimates
              .slice(0, cantidad)
              .map((est) => {
                const arrival = new Date(currentTime.getTime() + est.eta_segundos * 1000);
                const mvdTime = new Date(arrival.toLocaleString("en-US", { timeZone: "America/Montevideo" }));
                const mvdHH = String(mvdTime.getHours()).padStart(2, "0");
                const mvdMM = String(mvdTime.getMinutes()).padStart(2, "0");
                return {
                  linea: est.linea,
                  variante: 0,
                  destino: est.destino,
                  horario_estimado: `${mvdHH}:${mvdMM}`,
                  minutos_restantes: Math.round(est.eta_segundos / 60),
                  parada_nombre: paradaNombre,
                  fuente: "gps_estimado" as const,
                };
              });
            return textResponse(JSON.stringify(output, null, 2));
          }
        }
      }
    } catch {
      // Real-time failed — fall through to static schedule
    }
  }

  // Static schedule fallback
  const result = getNextBuses(
    { paradaId, linea, count: cantidad, now: currentTime },
    horarios,
    lineas
  );

  if (result.buses.length === 0) {
    return textResponse(
      `No se encontraron horarios para la parada ${paradaId}${linea ? ` (línea ${linea})` : ""}.`
    );
  }

  const output: ProximoBusResult[] = result.buses.map((b) => ({
    linea: b.linea,
    variante: b.variante,
    destino: b.destino,
    horario_estimado: b.horario_estimado,
    minutos_restantes: b.minutos_restantes,
    parada_nombre: paradaNombre,
    fuente: "horario_planificado" as const,
  }));

  if (result.isNextDay) {
    return textResponse(
      `No hay más buses hoy para la parada ${paradaId}. Primeros buses de mañana:\n` +
        JSON.stringify(output, null, 2)
    );
  }

  return textResponse(JSON.stringify(output, null, 2));
}

export function registerProximosBuses(
  server: McpServer,
  client: CkanClient,
  gps?: GpsClient,
  stopMapper?: StopMapper | null
): void {
  server.registerTool(
    "proximos_buses",
    {
      description:
        "Consulta los próximos ómnibus que pasan por una parada del STM en Montevideo. " +
        "Proporciona parada_id (obtenido de buscar_parada) o una dirección (calle1 y opcionalmente calle2). " +
        "Opcionalmente filtra por número de línea. " +
        "Si hay credenciales API disponibles, usa datos en tiempo real; sino, usa horarios planificados.",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => proximosBusesHandler(args as ProximosBusesArgs, client, gps, undefined, stopMapper)
  );
}
