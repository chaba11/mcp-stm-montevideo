import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getParadas, getHorarios, getRecorridos } from '../data/ckan-client.js';
import type { RecorridoCompleto } from '../types/linea.js';

const RecorridoLineaSchema = z.object({
  linea: z.string().describe('Número de línea (ej: "181", "D10")'),
  variante: z.string().optional().describe('Código de variante (opcional)'),
});

/**
 * Normalize line code for comparison (removes leading zeros for numeric lines).
 */
function normalizeLinea(linea: string): string {
  const trimmed = linea.trim();
  // If purely numeric, remove leading zeros
  if (/^\d+$/.test(trimmed)) {
    return String(parseInt(trimmed, 10));
  }
  return trimmed.toUpperCase();
}

/**
 * Calculate average frequency from horarios for a line+variant.
 */
function calcFrecuenciaPromedio(
  horarios: Array<{ linea: string; variante: string; tipoDia: string; hora: number; minuto: number }>,
  linea: string,
  variante: string
): number | undefined {
  const weekdayTimes = horarios
    .filter((h) => normalizeLinea(h.linea) === normalizeLinea(linea) && h.variante === variante && h.tipoDia === 'L')
    .map((h) => h.hora * 60 + h.minuto)
    .sort((a, b) => a - b);

  if (weekdayTimes.length < 2) return undefined;

  const gaps: number[] = [];
  for (let i = 1; i < weekdayTimes.length; i++) {
    const gap = weekdayTimes[i] - weekdayTimes[i - 1];
    if (gap > 0 && gap < 120) {
      // Ignore gaps > 2h (night service break)
      gaps.push(gap);
    }
  }

  if (gaps.length === 0) return undefined;

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.round(avgGap);
}

/**
 * Register the recorrido_linea MCP tool.
 */
export function registerRecorridoLinea(server: McpServer): void {
  server.tool(
    'recorrido_linea',
    'Muestra el recorrido completo de una línea de ómnibus STM con todas sus paradas en orden',
    RecorridoLineaSchema.shape,
    async (args) => {
      const { linea, variante: varianteFiltro } = args;

      if (!linea || !linea.trim()) {
        return {
          content: [
            { type: 'text' as const, text: 'Error: debes especificar el número de línea.' },
          ],
        };
      }

      const [paradasData, horariosData, recorridosData] = await Promise.all([
        getParadas(),
        getHorarios(),
        getRecorridos(),
      ]);

      const normalizedLinea = normalizeLinea(linea);

      // Build lookup map for paradas
      const paradasMap = new Map(paradasData.map((p) => [p.id, p]));

      // If recorridos data is available, use it
      if (recorridosData.length > 0) {
        // Filter recorridos for this line
        const lineaRecorridos = recorridosData.filter(
          (r) => normalizeLinea(r.COD_LINEA) === normalizedLinea
        );

        if (lineaRecorridos.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Línea "${linea}" no encontrada. Verificá el número de línea.`,
              },
            ],
          };
        }

        // Get unique variants
        const varianteSet = new Set(lineaRecorridos.map((r) => r.COD_VARIANTE));
        const variantes = varianteFiltro
          ? [...varianteSet].filter((v) => v === varianteFiltro)
          : [...varianteSet];

        if (variantes.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Variante "${varianteFiltro}" no encontrada para la línea "${linea}".`,
              },
            ],
          };
        }

        // Use first variant if multiple available
        const selectedVariante = variantes[0];
        const varianteRecorridos = lineaRecorridos
          .filter((r) => r.COD_VARIANTE === selectedVariante)
          .sort((a, b) => a.NRO_ORDEN - b.NRO_ORDEN);

        const firstRec = varianteRecorridos[0];
        const lastRec = varianteRecorridos[varianteRecorridos.length - 1];

        const firstParada = paradasMap.get(firstRec.COD_PARADA_STM);
        const lastParada = paradasMap.get(lastRec.COD_PARADA_STM);

        const frecuencia = calcFrecuenciaPromedio(horariosData, linea, selectedVariante);

        const recorrido: RecorridoCompleto = {
          linea: firstRec.COD_LINEA,
          variante: selectedVariante,
          empresa: firstRec.DESC_EMPRESA ?? firstRec.COD_EMPRESA ?? 'N/A',
          origen: firstParada?.nombre ?? firstRec.COD_PARADA_STM,
          destino: lastParada?.nombre ?? lastRec.COD_PARADA_STM,
          frecuenciaPromedioMin: frecuencia,
          paradas: varianteRecorridos.map((r) => {
            const p = paradasMap.get(r.COD_PARADA_STM);
            return {
              orden: r.NRO_ORDEN,
              paradaId: r.COD_PARADA_STM,
              nombre: p?.nombre ?? r.COD_PARADA_STM,
              lat: p?.lat ?? 0,
              lon: p?.lon ?? 0,
            };
          }),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(recorrido, null, 2) }],
        };
      }

      // Fallback: build route from horarios data (stop sequence from schedule)
      const lineaHorarios = horariosData.filter(
        (h) => normalizeLinea(h.linea) === normalizedLinea
      );

      if (lineaHorarios.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Línea "${linea}" no encontrada. Verificá el número de línea.`,
            },
          ],
        };
      }

      // Get unique stops for this line (from horarios — order may not be guaranteed)
      const variantesFromHorarios = [...new Set(lineaHorarios.map((h) => h.variante))];
      const selectedVar = varianteFiltro ?? variantesFromHorarios[0];

      const varianteHorarios = lineaHorarios.filter((h) => h.variante === selectedVar);
      const paradaIds = [...new Set(varianteHorarios.map((h) => h.paradaId))];

      const frecuencia = calcFrecuenciaPromedio(horariosData, linea, selectedVar);
      const firstHorario = lineaHorarios[0];

      const recorrido: RecorridoCompleto = {
        linea: firstHorario.linea,
        variante: selectedVar,
        empresa: 'N/A',
        origen: firstHorario.descVariante.split('-')[0]?.trim() ?? 'ORIGEN',
        destino:
          firstHorario.descVariante.split('-')[1]?.trim() ?? firstHorario.descVariante,
        frecuenciaPromedioMin: frecuencia,
        paradas: paradaIds.map((id, idx) => {
          const p = paradasMap.get(id);
          return {
            orden: idx + 1,
            paradaId: id,
            nombre: p?.nombre ?? id,
            lat: p?.lat ?? 0,
            lon: p?.lon ?? 0,
          };
        }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(recorrido, null, 2) }],
      };
    }
  );
}
