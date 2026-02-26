import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getParadas, getHorarios } from '../data/ckan-client.js';
import { getProximosBuses, getTipoDia, formatTime } from '../data/schedule.js';
import { geocodeIntersection } from '../geo/geocode.js';
import { findNearestParadas } from '../geo/distance.js';

const ProximosBusesSchema = z.object({
  parada_id: z.string().optional().describe('ID de la parada STM'),
  calle1: z.string().optional().describe('Nombre de la primera calle (para buscar parada por intersección)'),
  calle2: z.string().optional().describe('Nombre de la segunda calle (intersección)'),
  linea: z.string().optional().describe('Filtrar por número de línea (ej: "181", "D10")'),
  cantidad: z
    .number()
    .optional()
    .default(5)
    .describe('Cantidad de próximos buses a mostrar (por defecto: 5)'),
});

/**
 * Register the proximos_buses MCP tool.
 */
export function registerProximosBuses(server: McpServer): void {
  server.tool(
    'proximos_buses',
    'Muestra los próximos buses que pasan por una parada del STM en Montevideo',
    ProximosBusesSchema.shape,
    async (args) => {
      const { linea, cantidad = 5 } = args;
      let { parada_id } = args;
      const { calle1, calle2 } = args;

      // Need either parada_id or street names
      if (!parada_id && !calle1) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: debes proporcionar parada_id o el nombre de una calle.',
            },
          ],
        };
      }

      const paradas = await getParadas();
      const horarios = await getHorarios();

      // Resolve parada_id from street names if not provided
      if (!parada_id && calle1) {
        const coords = await geocodeIntersection(calle1, calle2, paradas);
        if (!coords) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No se encontró ninguna parada cerca de "${calle1}${calle2 ? ` y ${calle2}` : ''}".`,
              },
            ],
          };
        }

        const nearestParadas = findNearestParadas(coords.lat, coords.lon, paradas, 300, 1);
        if (nearestParadas.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No se encontró ninguna parada cerca de "${calle1}${calle2 ? ` y ${calle2}` : ''}".`,
              },
            ],
          };
        }
        parada_id = nearestParadas[0].id;
      }

      const now = new Date();
      const tipoDia = getTipoDia(now);
      const diaDesc = tipoDia === 'L' ? 'día hábil' : tipoDia === 'S' ? 'sábado' : 'domingo';

      const proximosBuses = getProximosBuses(parada_id!, horarios, cantidad, linea, now);

      if (proximosBuses.length === 0) {
        // Check if the parada exists
        const paradaExiste = paradas.find((p) => p.id === parada_id);
        if (!paradaExiste) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Parada ${parada_id} no encontrada en la base de datos.`,
              },
            ],
          };
        }

        if (linea) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `La línea "${linea}" no pasa por la parada ${parada_id} en ${diaDesc}, o no hay más servicios hoy.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: `Sin servicio en la parada ${parada_id} para hoy (${diaDesc}). Verificá en la web de STM.`,
            },
          ],
        };
      }

      const parada = paradas.find((p) => p.id === parada_id);
      const paradaNombre = parada?.nombre ?? `Parada ${parada_id}`;

      const response = {
        parada_id: parada_id!,
        parada_nombre: paradaNombre,
        tipo_dia: diaDesc,
        proximos_buses: proximosBuses.map((b) => ({
          linea: b.linea,
          variante: b.variante,
          destino: b.destino,
          horario_estimado: b.horarioEstimado,
          minutos_restantes: b.minutosRestantes,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}
