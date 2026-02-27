import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CkanClient } from "../data/ckan-client.js";
import { findNearestParadas } from "../geo/distance.js";
import { fuzzySearchParadas } from "../geo/search.js";
import { geocodeIntersection } from "../geo/geocode.js";
import type { Parada } from "../types/parada.js";

export interface ParadaResult {
  parada_id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  distancia_metros: number;
  lineas: string[];
}

export interface BuscarParadaArgs {
  calle1?: string;
  calle2?: string;
  latitud?: number;
  longitud?: number;
  radio_metros?: number;
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

const INPUT_SCHEMA = {
  calle1: z
    .string()
    .optional()
    .describe("Nombre de la calle o avenida (por ejemplo: Bv España, Av Italia)"),
  calle2: z
    .string()
    .optional()
    .describe("Calle de intersección (por ejemplo: Libertad, Garibaldi)"),
  latitud: z.number().optional().describe("Latitud WGS84 (por ejemplo: -34.9045)"),
  longitud: z.number().optional().describe("Longitud WGS84 (por ejemplo: -56.1738)"),
  radio_metros: z
    .number()
    .optional()
    .default(300)
    .describe("Radio de búsqueda en metros (por defecto: 300)"),
};

function buildLineasByParada(paradas: Parada[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const p of paradas) {
    if (!map.has(p.id)) map.set(p.id, new Set());
    if (p.linea.trim()) map.get(p.id)!.add(p.linea.trim());
  }
  return map;
}

function getLineasForParada(paradaId: number, lineasByParada: Map<number, Set<string>>): string[] {
  const lineas = lineasByParada.get(paradaId);
  if (!lineas) return [];
  return Array.from(lineas).sort();
}

function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/**
 * Core handler logic for buscar_parada — exported for direct unit testing.
 */
export async function buscarParadaHandler(
  args: BuscarParadaArgs,
  client: CkanClient
): Promise<ToolResponse> {
  const { calle1, calle2, latitud, longitud, radio_metros = 300 } = args;

  let paradas;
  try {
    paradas = await client.getParadas();
  } catch (err) {
    return textResponse(
      `Error al cargar los datos del STM: ${err instanceof Error ? err.message : "Error desconocido"}.`
    );
  }
  if (paradas.length === 0) {
    return textResponse("No se pudieron cargar los datos de paradas del STM.");
  }

  const lineasByParada = buildLineasByParada(paradas);

  let centerLat: number;
  let centerLon: number;
  let candidateIds: Set<number> | null = null;

  if (latitud !== undefined && longitud !== undefined) {
    centerLat = latitud;
    centerLon = longitud;
  } else if (calle1) {
    if (calle2) {
      const point = await geocodeIntersection(calle1, calle2, paradas);
      if (!point) {
        return textResponse(
          `No se encontró la intersección de "${calle1}" con "${calle2}" en Montevideo.`
        );
      }
      centerLat = point.lat;
      centerLon = point.lon;
    } else {
      const matches = fuzzySearchParadas(calle1, paradas);
      if (matches.length === 0) {
        return textResponse(`No se encontraron paradas con el nombre "${calle1}".`);
      }
      const topScore = matches[0].score;
      const topMatches = matches.filter((m) => m.score >= topScore * 0.6);
      centerLat = topMatches.reduce((s, m) => s + m.lat, 0) / topMatches.length;
      centerLon = topMatches.reduce((s, m) => s + m.lng, 0) / topMatches.length;
      candidateIds = new Set(topMatches.map((m) => m.id));
    }
  } else {
    return textResponse(
      "Proporciona una dirección (calle1 y opcionalmente calle2) o coordenadas (latitud y longitud)."
    );
  }

  let nearest = findNearestParadas(centerLat, centerLon, paradas, radio_metros, 10);

  if (candidateIds !== null) {
    nearest = nearest.filter((p) => candidateIds!.has(p.id));
    if (nearest.length === 0) {
      const fuzzyMatches = fuzzySearchParadas(calle1!, paradas).slice(0, 5);
      nearest = fuzzyMatches.map((m) => ({ ...m, distancia_metros: 0 }));
    }
  }

  if (nearest.length === 0) {
    return textResponse(
      `No se encontraron paradas dentro de ${radio_metros}m del punto indicado.`
    );
  }

  // De-duplicate by stop ID
  const seen = new Set<number>();
  const unique = nearest.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const results: ParadaResult[] = unique.map((p) => ({
    parada_id: p.id,
    nombre: `${p.calle}${p.esquina ? " y " + p.esquina : ""}`,
    latitud: p.lat,
    longitud: p.lng,
    distancia_metros: p.distancia_metros,
    lineas: getLineasForParada(p.id, lineasByParada),
  }));

  return textResponse(JSON.stringify(results, null, 2));
}

export function registerBuscarParada(server: McpServer, client: CkanClient): void {
  server.registerTool(
    "buscar_parada",
    {
      description:
        "Busca paradas del STM cercanas a una dirección, intersección o coordenadas en Montevideo. " +
        "Proporciona calle1+calle2 para una intersección, o latitud+longitud para coordenadas exactas. " +
        "Si solo se proporciona calle1, realiza una búsqueda difusa por nombre de calle.",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => buscarParadaHandler(args as BuscarParadaArgs, client)
  );
}
