import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getParadas, getHorarios, getRecorridos } from '../data/ckan-client.js';
import { geocodeIntersection } from '../geo/geocode.js';
import { findNearestParadas } from '../geo/distance.js';
import type { Parada } from '../types/parada.js';
import type { Horario } from '../types/horario.js';
import type { RecorridoRaw } from '../types/linea.js';

const ComoLlegarSchema = z.object({
  origen_calle1: z.string().describe('Calle o avenida de origen'),
  origen_calle2: z.string().optional().describe('Calle de intersección de origen (opcional)'),
  destino_calle1: z.string().describe('Calle o avenida de destino'),
  destino_calle2: z.string().optional().describe('Calle de intersección de destino (opcional)'),
  max_transbordos: z
    .number()
    .optional()
    .default(1)
    .describe('Máximo de transbordos (por defecto: 1)'),
  max_caminata_metros: z
    .number()
    .optional()
    .default(500)
    .describe('Máxima distancia caminando en metros (por defecto: 500)'),
});

interface RutaDirecta {
  tipo: 'directa';
  linea: string;
  variante: string;
  paradaOrigen: { id: string; nombre: string; distanciaOrigen: number };
  paradaDestino: { id: string; nombre: string; distanciaDestino: number };
  duracionEstimadaMin: number;
  caminataInicioMin: number;
  caminataFinalMin: number;
  paradas: number;
}

interface RutaTransbordo {
  tipo: 'transbordo';
  primerTramo: {
    linea: string;
    variante: string;
    paradaOrigen: { id: string; nombre: string; distanciaOrigen: number };
    paradaTransbordo: { id: string; nombre: string };
  };
  segundoTramo: {
    linea: string;
    variante: string;
    paradaTransbordo: { id: string; nombre: string };
    paradaDestino: { id: string; nombre: string; distanciaDestino: number };
  };
  duracionEstimadaMin: number;
  caminataInicioMin: number;
  caminataFinalMin: number;
}

/**
 * Build a map: paradaId → Set of line codes
 */
function buildLineasPorParadaMap(horarios: Horario[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const h of horarios) {
    if (!map.has(h.paradaId)) map.set(h.paradaId, new Set());
    map.get(h.paradaId)!.add(h.linea);
  }
  return map;
}

/**
 * Build a map: linea+variante → Set of paradaIds
 */
function buildParadasPorLinea(
  horarios: Horario[],
  recorridos: RecorridoRaw[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  // From recorridos (ordered)
  for (const r of recorridos) {
    const key = `${r.COD_LINEA}:${r.COD_VARIANTE}`;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(r.COD_PARADA_STM);
  }

  // Supplement from horarios if recorridos empty
  if (recorridos.length === 0) {
    for (const h of horarios) {
      const key = `${h.linea}:${h.variante}`;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(h.paradaId);
    }
  }

  return map;
}

const WALK_SPEED_MPM = 80; // meters per minute walking
const BUS_TIME_PER_STOP = 2; // estimated minutes per stop

/**
 * Find direct routes between origin stops and destination stops.
 */
function findDirectRoutes(
  origenParadas: Parada[],
  destinoParadas: Parada[],
  lineasPorParada: Map<string, Set<string>>,
  paradasPorLinea: Map<string, Set<string>>,
  maxCaminataMetros: number
): RutaDirecta[] {
  const routes: RutaDirecta[] = [];

  for (const origen of origenParadas) {
    const lineasOrigen = lineasPorParada.get(origen.id) ?? new Set();

    for (const destino of destinoParadas) {
      const lineasDestino = lineasPorParada.get(destino.id) ?? new Set();

      // Find common lines
      for (const linea of lineasOrigen) {
        if (!lineasDestino.has(linea)) continue;

        // Find all line+variant combos that serve both stops
        for (const [key, paradaSet] of paradasPorLinea.entries()) {
          if (!key.startsWith(linea + ':')) continue;
          if (!paradaSet.has(origen.id) || !paradaSet.has(destino.id)) continue;

          const variante = key.split(':')[1];

          // Count stops between origin and destination (approximate)
          const paradasArray = [...paradaSet];
          const origenIdx = paradasArray.indexOf(origen.id);
          const destinoIdx = paradasArray.indexOf(destino.id);
          const numParadas = Math.abs(destinoIdx - origenIdx) || 1;

          const caminataInicio = origen.distanciaMetros
            ? Math.ceil(origen.distanciaMetros / WALK_SPEED_MPM)
            : 0;
          const caminataFinal = destino.distanciaMetros
            ? Math.ceil(destino.distanciaMetros / WALK_SPEED_MPM)
            : 0;

          routes.push({
            tipo: 'directa',
            linea,
            variante,
            paradaOrigen: {
              id: origen.id,
              nombre: origen.nombre,
              distanciaOrigen: origen.distanciaMetros ?? 0,
            },
            paradaDestino: {
              id: destino.id,
              nombre: destino.nombre,
              distanciaDestino: destino.distanciaMetros ?? 0,
            },
            duracionEstimadaMin: caminataInicio + numParadas * BUS_TIME_PER_STOP + caminataFinal,
            caminataInicioMin: caminataInicio,
            caminataFinalMin: caminataFinal,
            paradas: numParadas,
          });
        }
      }
    }
  }

  // Deduplicate by linea
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.linea}:${r.variante}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Find 1-transfer routes.
 */
function findTransbordoRoutes(
  origenParadas: Parada[],
  destinoParadas: Parada[],
  allParadas: Parada[],
  lineasPorParada: Map<string, Set<string>>,
  paradasPorLinea: Map<string, Set<string>>,
  maxCaminataMetros: number
): RutaTransbordo[] {
  const routes: RutaTransbordo[] = [];
  const seen = new Set<string>();

  for (const origen of origenParadas) {
    const lineasOrigen = lineasPorParada.get(origen.id) ?? new Set();

    for (const destino of destinoParadas) {
      const lineasDestino = lineasPorParada.get(destino.id) ?? new Set();

      // Find transfer stops: stops served by lines from origin AND lines to destination
      for (const lineaA of lineasOrigen) {
        for (const lineaB of lineasDestino) {
          if (lineaA === lineaB) continue; // direct route, not transfer

          // Find stops served by both lineaA and lineaB
          const paradasLineaA = new Set<string>();
          const paradasLineaB = new Set<string>();

          for (const [key, paradasSet] of paradasPorLinea.entries()) {
            if (key.startsWith(lineaA + ':')) {
              for (const p of paradasSet) paradasLineaA.add(p);
            }
            if (key.startsWith(lineaB + ':')) {
              for (const p of paradasSet) paradasLineaB.add(p);
            }
          }

          // Intersection = transfer stops
          for (const transferParadaId of paradasLineaA) {
            if (!paradasLineaB.has(transferParadaId)) continue;
            if (!lineasPorParada.get(transferParadaId)?.has(lineaA)) continue;
            if (!lineasPorParada.get(transferParadaId)?.has(lineaB)) continue;

            const transferParada = allParadas.find((p) => p.id === transferParadaId);
            if (!transferParada) continue;

            const dedupeKey = `${lineaA}:${lineaB}:${transferParadaId}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            // Find the variant keys
            const varKeyA = [...paradasPorLinea.keys()].find(
              (k) => k.startsWith(lineaA + ':') && paradasPorLinea.get(k)?.has(origen.id) && paradasPorLinea.get(k)?.has(transferParadaId)
            );
            const varKeyB = [...paradasPorLinea.keys()].find(
              (k) => k.startsWith(lineaB + ':') && paradasPorLinea.get(k)?.has(transferParadaId) && paradasPorLinea.get(k)?.has(destino.id)
            );

            const varianteA = varKeyA?.split(':')[1] ?? '01';
            const varianteB = varKeyB?.split(':')[1] ?? '01';

            const caminataInicio = origen.distanciaMetros
              ? Math.ceil(origen.distanciaMetros / WALK_SPEED_MPM)
              : 0;
            const caminataFinal = destino.distanciaMetros
              ? Math.ceil(destino.distanciaMetros / WALK_SPEED_MPM)
              : 0;

            const estimatedDuration = caminataInicio + 15 + 5 + 15 + caminataFinal; // approximate

            routes.push({
              tipo: 'transbordo',
              primerTramo: {
                linea: lineaA,
                variante: varianteA,
                paradaOrigen: {
                  id: origen.id,
                  nombre: origen.nombre,
                  distanciaOrigen: origen.distanciaMetros ?? 0,
                },
                paradaTransbordo: {
                  id: transferParada.id,
                  nombre: transferParada.nombre,
                },
              },
              segundoTramo: {
                linea: lineaB,
                variante: varianteB,
                paradaTransbordo: {
                  id: transferParada.id,
                  nombre: transferParada.nombre,
                },
                paradaDestino: {
                  id: destino.id,
                  nombre: destino.nombre,
                  distanciaDestino: destino.distanciaMetros ?? 0,
                },
              },
              duracionEstimadaMin: estimatedDuration,
              caminataInicioMin: caminataInicio,
              caminataFinalMin: caminataFinal,
            });

            if (routes.length >= 5) return routes; // limit results
          }
        }
      }
    }
  }

  return routes;
}

/**
 * Register the como_llegar MCP tool.
 */
export function registerComoLlegar(server: McpServer): void {
  server.tool(
    'como_llegar',
    'Planifica una ruta de transporte público STM entre dos puntos de Montevideo, con o sin transbordos',
    ComoLlegarSchema.shape,
    async (args) => {
      const {
        origen_calle1,
        origen_calle2,
        destino_calle1,
        destino_calle2,
        max_transbordos = 1,
        max_caminata_metros = 500,
      } = args;

      const [paradas, horarios, recorridos] = await Promise.all([
        getParadas(),
        getHorarios(),
        getRecorridos(),
      ]);

      // Geocode origin and destination
      const [origenCoords, destinoCoords] = await Promise.all([
        geocodeIntersection(origen_calle1, origen_calle2, paradas),
        geocodeIntersection(destino_calle1, destino_calle2, paradas),
      ]);

      if (!origenCoords) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No se encontró el origen: "${origen_calle1}${origen_calle2 ? ` y ${origen_calle2}` : ''}".`,
            },
          ],
        };
      }

      if (!destinoCoords) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No se encontró el destino: "${destino_calle1}${destino_calle2 ? ` y ${destino_calle2}` : ''}".`,
            },
          ],
        };
      }

      // Check if origin and destination are very close
      const { getDistance } = await import('geolib');
      const distanciaTotal = getDistance(
        { latitude: origenCoords.lat, longitude: origenCoords.lon },
        { latitude: destinoCoords.lat, longitude: destinoCoords.lon }
      );

      if (distanciaTotal < 200) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                mensaje: `Ya estás cerca del destino (${distanciaTotal}m). Podés ir caminando.`,
                distancia_metros: distanciaTotal,
              }, null, 2),
            },
          ],
        };
      }

      // Find nearby stops at origin and destination
      const origenParadas = findNearestParadas(
        origenCoords.lat,
        origenCoords.lon,
        paradas,
        max_caminata_metros,
        5
      );
      const destinoParadas = findNearestParadas(
        destinoCoords.lat,
        destinoCoords.lon,
        paradas,
        max_caminata_metros,
        5
      );

      if (origenParadas.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No hay paradas de ómnibus a menos de ${max_caminata_metros}m del origen.`,
            },
          ],
        };
      }

      if (destinoParadas.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No hay paradas de ómnibus a menos de ${max_caminata_metros}m del destino.`,
            },
          ],
        };
      }

      const lineasPorParada = buildLineasPorParadaMap(horarios);
      const paradasPorLinea = buildParadasPorLinea(horarios, recorridos);

      // Find direct routes
      const directas = findDirectRoutes(
        origenParadas,
        destinoParadas,
        lineasPorParada,
        paradasPorLinea,
        max_caminata_metros
      );

      // Find transfer routes if allowed
      const transbordos =
        max_transbordos > 0 && directas.length === 0
          ? findTransbordoRoutes(
              origenParadas,
              destinoParadas,
              paradas,
              lineasPorParada,
              paradasPorLinea,
              max_caminata_metros
            )
          : [];

      const allRoutes = [
        ...directas.slice(0, 3),
        ...transbordos.slice(0, 2),
      ].sort((a, b) => a.duracionEstimadaMin - b.duracionEstimadaMin);

      if (allRoutes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                mensaje: `No se encontró ruta de ómnibus entre "${origen_calle1}${origen_calle2 ? ` y ${origen_calle2}` : ''}" y "${destino_calle1}${destino_calle2 ? ` y ${destino_calle2}` : ''}". Intentá con max_caminata_metros mayor.`,
                sugerencia: 'Podría ser necesario combinar varios ómnibus o la distancia caminando es mayor a la configurada.',
              }, null, 2),
            },
          ],
        };
      }

      const response = {
        origen: `${origen_calle1}${origen_calle2 ? ` y ${origen_calle2}` : ''}`,
        destino: `${destino_calle1}${destino_calle2 ? ` y ${destino_calle2}` : ''}`,
        opciones: allRoutes,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}
