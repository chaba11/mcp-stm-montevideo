import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CkanClient } from "../data/ckan-client.js";
import { getNextBuses } from "../data/schedule.js";
import { findNearestParadas } from "../geo/distance.js";
import { geocodeIntersection } from "../geo/geocode.js";
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
  paradas: Parada[]
): Promise<{ id: number; nombre: string } | null> {
  if (calle2) {
    const point = await geocodeIntersection(calle1, calle2, paradas);
    if (!point) return null;
    const nearest = findNearestParadas(point.lat, point.lon, paradas, 500, 1);
    if (nearest.length === 0) return null;
    const p = nearest[0];
    return { id: p.id, nombre: `${p.calle}${p.esquina ? " y " + p.esquina : ""}` };
  }

  const matches = fuzzySearchParadas(calle1, paradas);
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
  now?: Date
): Promise<ToolResponse> {
  const { parada_id, calle1, calle2, linea, cantidad = 5 } = args;

  let paradaId: number;
  let paradaNombre: string;

  if (parada_id !== undefined) {
    paradaId = parada_id;
    paradaNombre = `Parada ${paradaId}`;
  } else if (calle1) {
    const paradas = await client.getParadas();
    const resolved = await resolveParadaId(calle1, calle2, paradas);
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

  const [horarios, lineas] = await Promise.all([
    client.getHorarios(),
    client.getLineas(),
  ]);

  const result = getNextBuses(
    { paradaId, linea, count: cantidad, now },
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
  }));

  if (result.isNextDay) {
    return textResponse(
      `No hay más buses hoy para la parada ${paradaId}. Primeros buses de mañana:\n` +
        JSON.stringify(output, null, 2)
    );
  }

  return textResponse(JSON.stringify(output, null, 2));
}

export function registerProximosBuses(server: McpServer, client: CkanClient): void {
  server.registerTool(
    "proximos_buses",
    {
      description:
        "Consulta los próximos ómnibus que pasan por una parada del STM en Montevideo. " +
        "Proporciona parada_id (obtenido de buscar_parada) o una dirección (calle1 y opcionalmente calle2). " +
        "Opcionalmente filtra por número de línea.",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => proximosBusesHandler(args as ProximosBusesArgs, client)
  );
}
