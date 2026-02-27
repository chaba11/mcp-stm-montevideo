import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDistance } from "geolib";
import type { CkanClient } from "../data/ckan-client.js";
import { findNearestParadas } from "../geo/distance.js";
import { geocodeIntersection } from "../geo/geocode.js";
import { fuzzySearchParadas } from "../geo/search.js";
import type { Parada } from "../types/parada.js";
import type { LineaVariante } from "../types/linea.js";

// --- Types ---

export interface TramoBase {
  tipo: "bus" | "caminata";
  duracion_min: number;
}

export interface TramoCaminata extends TramoBase {
  tipo: "caminata";
  distancia_metros: number;
}

export interface TramoBus extends TramoBase {
  tipo: "bus";
  linea: string;
  parada_subida: string;
  parada_subida_id: number;
  parada_bajada: string;
  parada_bajada_id: number;
  num_paradas: number;
}

export type Tramo = TramoCaminata | TramoBus;

export interface RouteOption {
  duracion_total_estimada_min: number;
  tramos: Tramo[];
}

export interface ComoLlegarArgs {
  origen_calle1: string;
  origen_calle2?: string;
  destino_calle1: string;
  destino_calle2?: string;
  max_transbordos?: number;
  max_caminata_metros?: number;
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

interface ParadaConDist extends Parada {
  distancia_metros: number;
}

// --- Constants ---
const WALK_SPEED_MPM = 80; // meters per minute
const MIN_PER_STOP = 2; // estimated minutes per bus stop
const DEFAULT_TRANSFER_RADIUS = 300; // meters

// --- Input Schema ---
const INPUT_SCHEMA = {
  origen_calle1: z.string().describe("Calle de origen (ej: Bv España, Av Italia)"),
  origen_calle2: z.string().optional().describe("Intersección de origen (ej: Libertad)"),
  destino_calle1: z.string().describe("Calle de destino (ej: 18 de Julio, Rivera)"),
  destino_calle2: z.string().optional().describe("Intersección de destino"),
  max_transbordos: z
    .number()
    .optional()
    .default(1)
    .describe("Máximo número de transbordos permitidos (por defecto: 1)"),
  max_caminata_metros: z
    .number()
    .optional()
    .default(500)
    .describe("Máxima distancia a caminar hasta/desde la parada (por defecto: 500m)"),
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

function paradaNombre(p: Parada): string {
  return `${p.calle}${p.esquina ? " y " + p.esquina : ""}`;
}

function walkDuration(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_SPEED_MPM));
}

// --- Geocode a location from street names ---
async function resolveLocation(
  calle1: string,
  calle2: string | undefined,
  paradas: Parada[]
): Promise<{ lat: number; lon: number } | null> {
  if (calle2) {
    return geocodeIntersection(calle1, calle2, paradas);
  }
  const matches = fuzzySearchParadas(calle1, paradas);
  if (matches.length === 0) return null;
  const top = matches[0];
  return { lat: top.lat, lon: top.lng };
}

// --- Build lookup maps ---
interface LookupMaps {
  variantesByParadaId: Map<number, Set<number>>;
  paradasByVariante: Map<number, Parada[]>;
  paradaForVariante: Map<string, Parada>; // `${id}:${variante}` → Parada
  lineasMap: Map<number, LineaVariante>;
}

function buildMaps(paradas: Parada[], lineas: LineaVariante[]): LookupMaps {
  const variantesByParadaId = new Map<number, Set<number>>();
  const paradasByVariante = new Map<number, Parada[]>();
  const paradaForVariante = new Map<string, Parada>();

  for (const p of paradas) {
    if (!variantesByParadaId.has(p.id)) variantesByParadaId.set(p.id, new Set());
    variantesByParadaId.get(p.id)!.add(p.variante);

    paradaForVariante.set(`${p.id}:${p.variante}`, p);

    if (!paradasByVariante.has(p.variante)) paradasByVariante.set(p.variante, []);
    paradasByVariante.get(p.variante)!.push(p);
  }

  // Sort each variant's stops by ordinal
  for (const stops of paradasByVariante.values()) {
    stops.sort((a, b) => a.ordinal - b.ordinal);
  }

  const lineasMap = new Map<number, LineaVariante>();
  for (const lv of lineas) lineasMap.set(lv.codVariante, lv);

  return { variantesByParadaId, paradasByVariante, paradaForVariante, lineasMap };
}

// --- Phase A: Direct routes ---
function findDirectRoutes(
  nearOrigin: ParadaConDist[],
  nearDest: ParadaConDist[],
  maps: LookupMaps
): RouteOption[] {
  const { variantesByParadaId, paradasByVariante, lineasMap } = maps;
  const destById = new Map(nearDest.map((d) => [d.id, d]));
  const results: RouteOption[] = [];
  const seen = new Set<string>();

  for (const origStop of nearOrigin) {
    const variants = variantesByParadaId.get(origStop.id) ?? new Set();
    for (const codVariante of variants) {
      const variantStops = paradasByVariante.get(codVariante) ?? [];
      const origP = variantStops.find((p) => p.id === origStop.id);
      if (!origP) continue;

      for (const varStop of variantStops) {
        if (varStop.ordinal <= origP.ordinal) continue;
        const destStop = destById.get(varStop.id);
        if (!destStop) continue;

        const key = `${origStop.id}:${varStop.id}:${codVariante}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const lv = lineasMap.get(codVariante);
        const numParadas = varStop.ordinal - origP.ordinal;
        const walkToMin = walkDuration(origStop.distancia_metros);
        const rideMin = numParadas * MIN_PER_STOP;
        const walkFromMin = walkDuration(destStop.distancia_metros);

        results.push({
          duracion_total_estimada_min: walkToMin + rideMin + walkFromMin,
          tramos: [
            {
              tipo: "caminata",
              distancia_metros: Math.round(origStop.distancia_metros),
              duracion_min: walkToMin,
            },
            {
              tipo: "bus",
              linea: lv?.descLinea ?? String(codVariante),
              parada_subida: paradaNombre(origP),
              parada_subida_id: origP.id,
              parada_bajada: paradaNombre(varStop),
              parada_bajada_id: varStop.id,
              num_paradas: numParadas,
              duracion_min: rideMin,
            },
            {
              tipo: "caminata",
              distancia_metros: Math.round(destStop.distancia_metros),
              duracion_min: walkFromMin,
            },
          ],
        });
      }
    }
  }

  return results;
}

// --- Phase B: One-transfer routes ---
function findTransferRoutes(
  nearOrigin: ParadaConDist[],
  nearDest: ParadaConDist[],
  maps: LookupMaps
): RouteOption[] {
  const { variantesByParadaId, paradasByVariante, lineasMap } = maps;
  const results: RouteOption[] = [];
  const seen = new Set<string>();

  // For each origin stop and its variants, collect stops reachable after boarding
  type ReachableStop = {
    stop: Parada;
    codVariante: number;
    origStop: ParadaConDist;
    origOrdinal: number;
    numStopsFromOrig: number;
  };

  const reachableFromOrigin: ReachableStop[] = [];
  for (const origStop of nearOrigin) {
    const variants = variantesByParadaId.get(origStop.id) ?? new Set();
    for (const codVariante of variants) {
      const variantStops = paradasByVariante.get(codVariante) ?? [];
      const origP = variantStops.find((p) => p.id === origStop.id);
      if (!origP) continue;
      // Collect all stops after origin (up to 60 stops = ~30 min ride)
      for (const stop of variantStops) {
        if (stop.ordinal > origP.ordinal && stop.ordinal - origP.ordinal <= 60) {
          reachableFromOrigin.push({
            stop,
            codVariante,
            origStop,
            origOrdinal: origP.ordinal,
            numStopsFromOrig: stop.ordinal - origP.ordinal,
          });
        }
      }
    }
  }

  // For each dest stop and its variants, collect stops that can reach it
  type StopToDest = {
    stop: Parada;
    codVariante: number;
    destStop: ParadaConDist;
    destOrdinal: number;
    numStopsToDest: number;
  };

  const stopsReachingDest: StopToDest[] = [];
  for (const destStop of nearDest) {
    const variants = variantesByParadaId.get(destStop.id) ?? new Set();
    for (const codVariante of variants) {
      const variantStops = paradasByVariante.get(codVariante) ?? [];
      const destP = variantStops.find((p) => p.id === destStop.id);
      if (!destP) continue;
      // Collect all stops before dest (up to 60 stops)
      for (const stop of variantStops) {
        if (stop.ordinal < destP.ordinal && destP.ordinal - stop.ordinal <= 60) {
          stopsReachingDest.push({
            stop,
            codVariante,
            destStop,
            destOrdinal: destP.ordinal,
            numStopsToDest: destP.ordinal - stop.ordinal,
          });
        }
      }
    }
  }

  // Find transfer points: reachable stops near stops-reaching-dest
  for (const r of reachableFromOrigin) {
    for (const d of stopsReachingDest) {
      // Skip same variant (already handled in direct routes)
      if (r.codVariante === d.codVariante) continue;

      const dist = getDistance(
        { latitude: r.stop.lat, longitude: r.stop.lng },
        { latitude: d.stop.lat, longitude: d.stop.lng }
      );

      if (dist > DEFAULT_TRANSFER_RADIUS) continue;

      const key = `${r.origStop.id}:${r.codVariante}:${r.stop.id}→${d.stop.id}:${d.codVariante}:${d.destStop.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const lv1 = lineasMap.get(r.codVariante);
      const lv2 = lineasMap.get(d.codVariante);

      const walkToMin = walkDuration(r.origStop.distancia_metros);
      const ride1Min = r.numStopsFromOrig * MIN_PER_STOP;
      const transferWalkMin = walkDuration(dist);
      const ride2Min = d.numStopsToDest * MIN_PER_STOP;
      const walkFromMin = walkDuration(d.destStop.distancia_metros);

      const boardP = paradasByVariante
        .get(r.codVariante)
        ?.find((p) => p.id === r.origStop.id && p.ordinal === r.origOrdinal);
      const alightP1 = r.stop;
      const boardP2 = d.stop;
      const alightP2 = paradasByVariante
        .get(d.codVariante)
        ?.find((p) => p.id === d.destStop.id && p.ordinal === d.destOrdinal);

      if (!boardP || !alightP2) continue;

      results.push({
        duracion_total_estimada_min:
          walkToMin + ride1Min + transferWalkMin + ride2Min + walkFromMin,
        tramos: [
          {
            tipo: "caminata",
            distancia_metros: Math.round(r.origStop.distancia_metros),
            duracion_min: walkToMin,
          },
          {
            tipo: "bus",
            linea: lv1?.descLinea ?? String(r.codVariante),
            parada_subida: paradaNombre(boardP),
            parada_subida_id: boardP.id,
            parada_bajada: paradaNombre(alightP1),
            parada_bajada_id: alightP1.id,
            num_paradas: r.numStopsFromOrig,
            duracion_min: ride1Min,
          },
          {
            tipo: "caminata",
            distancia_metros: Math.round(dist),
            duracion_min: transferWalkMin,
          },
          {
            tipo: "bus",
            linea: lv2?.descLinea ?? String(d.codVariante),
            parada_subida: paradaNombre(boardP2),
            parada_subida_id: boardP2.id,
            parada_bajada: paradaNombre(alightP2),
            parada_bajada_id: alightP2.id,
            num_paradas: d.numStopsToDest,
            duracion_min: ride2Min,
          },
          {
            tipo: "caminata",
            distancia_metros: Math.round(d.destStop.distancia_metros),
            duracion_min: walkFromMin,
          },
        ],
      });
    }
  }

  return results;
}

/**
 * Core handler for como_llegar — exported for direct unit testing.
 */
export async function comoLlegarHandler(
  args: ComoLlegarArgs,
  client: CkanClient
): Promise<ToolResponse> {
  const {
    origen_calle1,
    origen_calle2,
    destino_calle1,
    destino_calle2,
    max_transbordos = 1,
    max_caminata_metros = 500,
  } = args;

  if (!origen_calle1?.trim() || !destino_calle1?.trim()) {
    return textResponse("Proporciona origen_calle1 y destino_calle1.");
  }

  let paradas, lineas;
  try {
    [paradas, lineas] = await Promise.all([
      client.getParadas(),
      client.getLineas(),
    ]);
  } catch (err) {
    return textResponse(
      `Error al cargar los datos del STM: ${err instanceof Error ? err.message : "Error desconocido"}.`
    );
  }

  const [originPoint, destPoint] = await Promise.all([
    resolveLocation(origen_calle1, origen_calle2, paradas),
    resolveLocation(destino_calle1, destino_calle2, paradas),
  ]);

  if (!originPoint) {
    return textResponse(
      `No se encontró el origen "${origen_calle1}${origen_calle2 ? " y " + origen_calle2 : ""}".`
    );
  }
  if (!destPoint) {
    return textResponse(
      `No se encontró el destino "${destino_calle1}${destino_calle2 ? " y " + destino_calle2 : ""}".`
    );
  }

  const nearOrigin = findNearestParadas(
    originPoint.lat,
    originPoint.lon,
    paradas,
    max_caminata_metros,
    20
  ) as ParadaConDist[];

  const nearDest = findNearestParadas(
    destPoint.lat,
    destPoint.lon,
    paradas,
    max_caminata_metros,
    20
  ) as ParadaConDist[];

  if (nearOrigin.length === 0) {
    return textResponse(
      `No hay paradas del STM dentro de ${max_caminata_metros}m del origen.`
    );
  }
  if (nearDest.length === 0) {
    return textResponse(
      `No hay paradas del STM dentro de ${max_caminata_metros}m del destino.`
    );
  }

  const maps = buildMaps(paradas, lineas);

  // Collect all route options
  let allRoutes: RouteOption[] = findDirectRoutes(nearOrigin, nearDest, maps);

  if (max_transbordos >= 1) {
    const transferRoutes = findTransferRoutes(nearOrigin, nearDest, maps);
    allRoutes = allRoutes.concat(transferRoutes);
  }

  if (allRoutes.length === 0) {
    return textResponse(
      `No se encontró una ruta en ómnibus entre "${origen_calle1}" y "${destino_calle1}". ` +
        "Prueba aumentando max_caminata_metros o max_transbordos."
    );
  }

  // Sort by duration and return top 3
  allRoutes.sort((a, b) => a.duracion_total_estimada_min - b.duracion_total_estimada_min);
  const top3 = allRoutes.slice(0, 3);

  return textResponse(JSON.stringify(top3, null, 2));
}

export function registerComoLlegar(server: McpServer, client: CkanClient): void {
  server.registerTool(
    "como_llegar",
    {
      description:
        "Calcula cómo llegar de un punto a otro en ómnibus del STM en Montevideo, incluyendo transbordos. " +
        "Proporciona las calles de origen y destino. " +
        "Estima tiempo de caminata (80m/min) y tiempo de viaje (~2 min/parada).",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => comoLlegarHandler(args as ComoLlegarArgs, client)
  );
}
