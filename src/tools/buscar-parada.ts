import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getParadas, getHorarios } from '../data/ckan-client.js';
import { findNearestParadas, buildLineasPorParada } from '../geo/distance.js';
import { geocodeIntersection, isInMontevideo } from '../geo/geocode.js';
import { fuzzySearchParadas } from '../geo/search.js';

const BuscarParadaSchema = z.object({
  calle1: z.string().optional().describe('Nombre de la calle o avenida'),
  calle2: z.string().optional().describe('Calle de intersección (opcional)'),
  latitud: z.number().optional().describe('Latitud WGS84'),
  longitud: z.number().optional().describe('Longitud WGS84'),
  radio_metros: z
    .number()
    .optional()
    .default(300)
    .describe('Radio de búsqueda en metros (por defecto: 300)'),
});

/**
 * Register the buscar_parada MCP tool.
 */
export function registerBuscarParada(server: McpServer): void {
  server.tool(
    'buscar_parada',
    'Busca paradas del STM cercanas a una dirección, intersección o coordenadas en Montevideo',
    BuscarParadaSchema.shape,
    async (args) => {
      const { calle1, calle2, radio_metros = 300 } = args;
      let { latitud, longitud } = args;

      // Cap radius at a reasonable value to avoid returning too many results
      const radio = Math.min(radio_metros, 5000);
      const MAX_RESULTS = 20;

      // Validate input: need either coords or at least one street name
      if (!latitud && !longitud && !calle1) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: debes proporcionar latitud/longitud o al menos el nombre de una calle.',
            },
          ],
        };
      }

      const paradas = await getParadas();
      const horarios = await getHorarios();
      const lineasMap = buildLineasPorParada(horarios);

      // Resolve coordinates
      if (!latitud || !longitud) {
        if (calle1) {
          const coords = await geocodeIntersection(calle1, calle2, paradas);
          if (!coords) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `No se encontró ninguna parada cerca de "${calle1}${calle2 ? ` y ${calle2}` : ''}". Intentá con otro nombre de calle.`,
                },
              ],
            };
          }
          latitud = coords.lat;
          longitud = coords.lon;
        }
      }

      // Validate coordinates are in Montevideo area
      if (latitud !== undefined && longitud !== undefined) {
        if (!isInMontevideo(latitud, longitud)) {
          // If outside MVD, might be that user provided calle but coords from fuzzy search are off
          // Try a direct fuzzy search as fallback
          if (calle1) {
            const directMatches = fuzzySearchParadas(calle1, paradas).slice(0, MAX_RESULTS);
            if (directMatches.length > 0) {
              const results = directMatches.map((p) => ({
                parada_id: p.id,
                nombre: p.nombre,
                latitud: p.lat,
                longitud: p.lon,
                distancia_metros: 0,
                lineas: lineasMap.get(p.id) ?? [],
              }));
              return {
                content: [
                  { type: 'text' as const, text: JSON.stringify(results, null, 2) },
                ],
              };
            }
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `Las coordenadas proporcionadas (${latitud}, ${longitud}) están fuera del área de Montevideo.`,
              },
            ],
          };
        }
      }

      if (latitud === undefined || longitud === undefined) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No se pudo determinar la ubicación. Por favor proporciona coordenadas o nombre de calle válidos.',
            },
          ],
        };
      }

      const nearestParadas = findNearestParadas(
        latitud,
        longitud,
        paradas,
        radio,
        MAX_RESULTS,
        lineasMap
      );

      if (nearestParadas.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No se encontraron paradas en un radio de ${radio}m. Intentá con un radio mayor.`,
            },
          ],
        };
      }

      const results = nearestParadas.map((p) => ({
        parada_id: p.id,
        nombre: p.nombre,
        latitud: p.lat,
        longitud: p.lon,
        distancia_metros: p.distanciaMetros,
        lineas: p.lineas,
      }));

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );
}
