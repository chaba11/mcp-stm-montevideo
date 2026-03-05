import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CkanClient } from "../data/ckan-client.js";
import { findNearestParadasIndexed, fastDistMeters } from "../geo/distance.js";
import { getDataIndexes } from "../data/data-indexes.js";
import { buildSpatialGrid, getCandidates } from "../geo/spatial-grid.js";
import { geocodeIntersection, geocodePlace } from "../geo/geocode.js";
import { fuzzySearchParadas } from "../geo/search.js";
import type { Parada } from "../types/parada.js";

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
const TRANSFER_PENALTY_MIN = 5; // extra wait time per transfer

// --- Input Schema ---
const INPUT_SCHEMA = {
  origen_calle1: z.string().describe("Calle o lugar de origen (ej: Bv España, Intendencia, Estadio Centenario)"),
  origen_calle2: z.string().optional().describe("Intersección de origen (ej: Libertad)"),
  destino_calle1: z.string().describe("Calle o lugar de destino (ej: 18 de Julio, Campeón del Siglo, Tres Cruces)"),
  destino_calle2: z.string().optional().describe("Intersección de destino"),
  max_transbordos: z
    .number()
    .optional()
    .default(1)
    .describe("Máximo número de transbordos permitidos (por defecto: 1)"),
  max_caminata_metros: z
    .number()
    .optional()
    .default(800)
    .describe("Máxima distancia a caminar hasta/desde la parada (por defecto: 800m)"),
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
    const intersection = await geocodeIntersection(calle1, calle2, paradas);
    if (intersection) return intersection;
  }
  // Try fuzzy stop name search
  const matches = fuzzySearchParadas(calle1, paradas);
  if (matches.length > 0) return { lat: matches[0].lat, lon: matches[0].lng };
  // Fallback: geocode as place/landmark (LocalGeocoder + Nominatim)
  const place = await geocodePlace(calle2 ? `${calle1} ${calle2}` : calle1);
  if (place) return { lat: place.lat, lon: place.lon };
  return null;
}

// LookupMaps type re-exported from data-indexes
import type { LookupMaps } from "../data/data-indexes.js";

// --- Phase A: Direct routes ---
function findDirectRoutes(
  nearOrigin: ParadaConDist[],
  nearDest: ParadaConDist[],
  maps: LookupMaps
): RouteOption[] {
  const { variantesByParadaId, paradasByVariante, paradaForVariante, lineasMap } = maps;
  const destById = new Map(nearDest.map((d) => [d.id, d]));
  const results: RouteOption[] = [];
  const seen = new Set<string>();

  for (const origStop of nearOrigin) {
    const variants = variantesByParadaId.get(origStop.id) ?? new Set();
    for (const codVariante of variants) {
      const variantStops = paradasByVariante.get(codVariante) ?? [];
      const origP = paradaForVariante.get(`${origStop.id}:${codVariante}`);
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
  const { variantesByParadaId, paradasByVariante, paradaForVariante, lineasMap } = maps;
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
      const origP = paradaForVariante.get(`${origStop.id}:${codVariante}`);
      if (!origP) continue;
      // Collect all stops after origin (up to 40 stops = ~80 min ride)
      for (const stop of variantStops) {
        if (stop.ordinal > origP.ordinal && stop.ordinal - origP.ordinal <= 40) {
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
      const destP = paradaForVariante.get(`${destStop.id}:${codVariante}`);
      if (!destP) continue;
      // Collect all stops before dest (up to 40 stops)
      for (const stop of variantStops) {
        if (stop.ordinal < destP.ordinal && destP.ordinal - stop.ordinal <= 40) {
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

  // Deduplicate reachableFromOrigin: keep shortest ride per (stop.id, codVariante)
  const reachDedup = new Map<string, ReachableStop>();
  for (const r of reachableFromOrigin) {
    const key = `${r.stop.id}:${r.codVariante}`;
    const existing = reachDedup.get(key);
    if (!existing || r.numStopsFromOrig < existing.numStopsFromOrig) {
      reachDedup.set(key, r);
    }
  }
  const dedupedReachable = Array.from(reachDedup.values());
  // Sort by numStopsFromOrig ascending to find short transfers first
  dedupedReachable.sort((a, b) => a.numStopsFromOrig - b.numStopsFromOrig);

  // Deduplicate stopsReachingDest: keep shortest ride per (stop.id, codVariante)
  const destDedup = new Map<string, StopToDest>();
  for (const d of stopsReachingDest) {
    const key = `${d.stop.id}:${d.codVariante}`;
    const existing = destDedup.get(key);
    if (!existing || d.numStopsToDest < existing.numStopsToDest) {
      destDedup.set(key, d);
    }
  }
  const dedupedDest = Array.from(destDedup.values());

  // Build spatial grid over destination-reachable stops for O(1) proximity lookup
  const destGrid = buildSpatialGrid(
    dedupedDest.map((d) => ({ lat: d.stop.lat, lng: d.stop.lng })),
    0.003 // ~330m cells, matching 300m transfer radius
  );

  // Find transfer points: reachable stops near stops-reaching-dest
  for (const r of dedupedReachable) {
    if (results.length >= 50) break; // early termination
    const candidates = getCandidates(destGrid, r.stop.lat, r.stop.lng);
    for (const c of candidates) {
      const d = dedupedDest[c.index];
      // Skip same variant (already handled in direct routes)
      if (r.codVariante === d.codVariante) continue;

      const dist = fastDistMeters(r.stop.lat, r.stop.lng, d.stop.lat, d.stop.lng);

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

      const boardP = paradaForVariante.get(`${r.origStop.id}:${r.codVariante}`);
      const alightP1 = r.stop;
      const boardP2 = d.stop;
      const alightP2 = paradaForVariante.get(`${d.destStop.id}:${d.codVariante}`);

      if (!boardP || !alightP2) continue;

      results.push({
        duracion_total_estimada_min:
          walkToMin + ride1Min + transferWalkMin + TRANSFER_PENALTY_MIN + ride2Min + walkFromMin,
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
    max_caminata_metros = 800,
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

  const indexes = getDataIndexes();
  const grid = indexes.getParadasGrid(paradas);

  const nearOrigin = findNearestParadasIndexed(
    originPoint.lat,
    originPoint.lon,
    paradas,
    grid,
    max_caminata_metros,
    20
  ) as ParadaConDist[];

  const nearDest = findNearestParadasIndexed(
    destPoint.lat,
    destPoint.lon,
    paradas,
    grid,
    max_caminata_metros,
    30
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

  const maps = indexes.getLookupMaps(paradas, lineas);

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

  // Sort by duration, preferring fewer transfers when within 5 min
  allRoutes.sort((a, b) => {
    const durDiff = a.duracion_total_estimada_min - b.duracion_total_estimada_min;
    if (Math.abs(durDiff) <= 5) {
      const aTransfers = a.tramos.filter((t) => t.tipo === "bus").length - 1;
      const bTransfers = b.tramos.filter((t) => t.tipo === "bus").length - 1;
      if (aTransfers !== bTransfers) return aTransfers - bTransfers;
    }
    return durDiff;
  });
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
