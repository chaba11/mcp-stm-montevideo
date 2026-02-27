import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CkanClient } from "../data/ckan-client.js";
import type { Parada } from "../types/parada.js";
import type { HorarioRow } from "../types/horario.js";
import type { LineaVariante } from "../types/linea.js";
import { TipoDia } from "../types/horario.js";

export interface RecorridoParada {
  parada_id: number;
  nombre: string;
  latitud: number;
  longitud: number;
  orden: number;
}

export interface RecorridoResult {
  linea: string;
  variante: string;
  origen: string;
  destino: string;
  frecuencia_promedio_minutos: number | null;
  paradas: RecorridoParada[];
}

export interface RecorridoLineaArgs {
  linea: string;
  variante?: string;
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

const INPUT_SCHEMA = {
  linea: z.string().describe("Número de línea de ómnibus (ej: 181, D10, L18)"),
  variante: z
    .string()
    .optional()
    .describe("Variante específica del recorrido (ej: A, B)"),
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/** Calculate average interval in minutes between consecutive trips */
function calcAverageFrequency(
  paradaId: number,
  codVariante: number,
  horarios: HorarioRow[]
): number | null {
  const trips = horarios
    .filter(
      (h) =>
        h.cod_ubic_parada === paradaId &&
        h.cod_variante === codVariante &&
        h.tipo_dia === TipoDia.HABIL
    )
    .map((h) => Math.floor(h.hora / 100) * 60 + (h.hora % 100))
    .sort((a, b) => a - b);

  if (trips.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < trips.length; i++) {
    const diff = trips[i] - trips[i - 1];
    if (diff > 0 && diff <= 120) intervals.push(diff); // ignore huge gaps
  }

  if (intervals.length === 0) return null;
  return Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);
}

/** Build ordered stop list for a single variant */
function buildVariantRoute(
  lv: LineaVariante,
  paradas: Parada[],
  horarios: HorarioRow[]
): RecorridoResult {
  // Get all paradas for this variant, ordered by ordinal
  const variantParadas = paradas
    .filter((p) => p.variante === lv.codVariante)
    .sort((a, b) => a.ordinal - b.ordinal);

  // De-duplicate by stop ID (keep lowest ordinal)
  const seen = new Set<number>();
  const unique = variantParadas.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });

  const paradaItems: RecorridoParada[] = unique.map((p, idx) => ({
    parada_id: p.id,
    nombre: `${p.calle}${p.esquina ? " y " + p.esquina : ""}`,
    latitud: p.lat,
    longitud: p.lng,
    orden: idx + 1,
  }));

  // Calculate frequency from first stop (most representative)
  const firstParadaId = unique[0]?.id;
  const freq =
    firstParadaId !== undefined
      ? calcAverageFrequency(firstParadaId, lv.codVariante, horarios)
      : null;

  return {
    linea: lv.descLinea,
    variante: lv.descVariante,
    origen: lv.descOrigen,
    destino: lv.descDestino,
    frecuencia_promedio_minutos: freq,
    paradas: paradaItems,
  };
}

/**
 * Core handler for recorrido_linea — exported for direct unit testing.
 */
export async function recorridoLineaHandler(
  args: RecorridoLineaArgs,
  client: CkanClient
): Promise<ToolResponse> {
  const { linea, variante } = args;

  if (!linea?.trim()) {
    return textResponse("Proporciona el número de línea (ej: 181, D10).");
  }

  let paradas, horarios, lineas;
  try {
    [paradas, horarios, lineas] = await Promise.all([
      client.getParadas(),
      client.getHorarios(),
      client.getLineas(),
    ]);
  } catch (err) {
    return textResponse(
      `Error al cargar los datos del STM: ${err instanceof Error ? err.message : "Error desconocido"}.`
    );
  }

  const lineaUpper = linea.trim().toUpperCase();
  const varianteUpper = variante?.trim().toUpperCase();

  // Find matching line variants
  let matchingVariants = lineas.filter(
    (lv) => lv.descLinea.trim().toUpperCase() === lineaUpper
  );

  if (matchingVariants.length === 0) {
    return textResponse(
      `No se encontró la línea "${linea}". Verifica el número de línea (ej: 181, D10, L18).`
    );
  }

  // Filter by variant if specified
  if (varianteUpper) {
    matchingVariants = matchingVariants.filter(
      (lv) => lv.descVariante.trim().toUpperCase() === varianteUpper
    );
    if (matchingVariants.length === 0) {
      return textResponse(
        `No se encontró la variante "${variante}" para la línea "${linea}".`
      );
    }
  }

  // Build route for each variant
  const results: RecorridoResult[] = matchingVariants.map((lv) =>
    buildVariantRoute(lv, paradas, horarios)
  );

  // Filter out variants with no stops
  const withStops = results.filter((r) => r.paradas.length > 0);
  if (withStops.length === 0) {
    return textResponse(
      `No se encontraron paradas para la línea "${linea}". Los datos pueden no estar disponibles.`
    );
  }

  return textResponse(JSON.stringify(withStops, null, 2));
}

export function registerRecorridoLinea(server: McpServer, client: CkanClient): void {
  server.registerTool(
    "recorrido_linea",
    {
      description:
        "Muestra el recorrido completo de una línea de ómnibus del STM con todas sus paradas. " +
        "Proporciona el número de línea (ej: 181, D10). " +
        "Opcionalmente filtra por variante (A o B).",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => recorridoLineaHandler(args as RecorridoLineaArgs, client)
  );
}
