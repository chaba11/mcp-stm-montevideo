import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const UbicacionBusSchema = z.object({
  linea: z.string().optional().describe('Número de línea de ómnibus (ej: "181", "D10")'),
  variante: z.string().optional().describe('Variante de la línea (opcional)'),
});

/**
 * Register the ubicacion_bus MCP tool.
 *
 * NOTE: The STM Montevideo real-time GPS API is not publicly available.
 * This tool returns a stub response indicating the unavailability.
 * If a public API becomes available, implement src/data/gps-client.ts.
 */
export function registerUbicacionBus(server: McpServer): void {
  server.tool(
    'ubicacion_bus',
    'Consulta la ubicación GPS en tiempo real de los buses STM (actualmente no disponible públicamente)',
    UbicacionBusSchema.shape,
    async (_args) => {
      const response = {
        available: false,
        message:
          'GPS en tiempo real no disponible para el STM Montevideo. ' +
          'Los datos de GPS en tiempo real no están expuestos en la API pública de datos abiertos. ' +
          'Para seguimiento en tiempo real, consultá la app oficial de STM o el sitio web de la IMM.',
        alternativas: [
          'App STM Montevideo (Android/iOS)',
          'https://www.montevideo.gub.uy/app/montevideo',
          'Usar proximos_buses para horarios estimados basados en frecuencia programada',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    }
  );
}
