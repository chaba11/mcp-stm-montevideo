import * as z from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GpsClient } from "../data/gps-client.js";

export interface UbicacionBusArgs {
  linea: string;
  variante?: string;
}

export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
}

const INPUT_SCHEMA = {
  linea: z.string().describe("Número de línea (ej: 181, D10)"),
  variante: z.string().optional().describe("Variante específica (ej: A, B)"),
};

function textResponse(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/**
 * Core handler for ubicacion_bus — exported for direct unit testing.
 */
export async function ubicacionBusHandler(
  args: UbicacionBusArgs,
  gps: GpsClient
): Promise<ToolResponse> {
  const { linea, variante } = args;

  if (!linea?.trim()) {
    return textResponse("Proporciona el número de línea (ej: 181, D10).");
  }

  const result = await gps.fetchBusPositions(linea.trim(), variante?.trim());

  if (!result.available) {
    return textResponse(
      result.message ??
        "GPS en tiempo real no disponible. Usa proximos_buses para ver los horarios teóricos."
    );
  }

  if (!result.positions || result.positions.length === 0) {
    return textResponse(
      `No se encontraron vehículos activos para la línea "${linea}"${variante ? ` variante ${variante}` : ""}.`
    );
  }

  return textResponse(JSON.stringify(result.positions, null, 2));
}

export function registerUbicacionBus(server: McpServer, gps: GpsClient): void {
  server.registerTool(
    "ubicacion_bus",
    {
      description:
        "Muestra la ubicación en tiempo real de los ómnibus de una línea del STM. " +
        "Nota: la API GPS pública aún no está disponible — se muestra el estado actual del servicio.",
      inputSchema: INPUT_SCHEMA,
    },
    (args) => ubicacionBusHandler(args as UbicacionBusArgs, gps)
  );
}
