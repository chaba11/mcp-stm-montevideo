/**
 * REST API wrapper over the existing MCP tool handlers.
 * Reuses the same business logic — no duplication.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { swaggerUI } from "@hono/swagger-ui";
import { CkanClient } from "../data/ckan-client.js";
import { GpsClient } from "../data/gps-client.js";
import { StopMapper } from "../data/stop-mapper.js";
import { buscarParadaHandler } from "../tools/buscar-parada.js";
import { proximosBusesHandler } from "../tools/proximos-buses.js";
import { recorridoLineaHandler } from "../tools/recorrido-linea.js";
import { ubicacionBusHandler } from "../tools/ubicacion-bus.js";
import { comoLlegarHandler } from "../tools/como-llegar.js";
import { getOpenApiSpec } from "./openapi.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer } from "../server.js";

// Read package.json version at import time
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
  pkgVersion = pkg.version;
} catch {
  // fallback
}

const startTime = Date.now();

interface ErrorResponse {
  error: true;
  message: string;
  code: "BAD_REQUEST" | "NOT_FOUND" | "INTERNAL";
}

function errorJson(message: string, code: ErrorResponse["code"], status: number) {
  return { json: { error: true as const, message, code }, status };
}

/** Parse a tool text response into the JSON object it contains */
function parseToolResponse(result: { content: Array<{ type: string; text: string }> }): unknown {
  const text = result.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Trim a query param; treat empty strings as undefined */
function qstr(val: string | undefined): string | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Parse a numeric query param; returns undefined or the number. Throws string on bad input. */
function qnum(val: string | undefined, name: string): number | undefined {
  if (!val) return undefined;
  const trimmed = val.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number(trimmed);
  if (isNaN(n)) throw `Parámetro "${name}" debe ser un número válido, recibido: "${trimmed}"`;
  return n;
}

export function createRestApp(
  ckanClient?: CkanClient,
  gpsClient?: GpsClient
): Hono {
  const client = ckanClient ?? new CkanClient();
  const gps = gpsClient ?? new GpsClient({
    clientId: process.env.STM_CLIENT_ID,
    clientSecret: process.env.STM_CLIENT_SECRET,
  });
  const stopMapper = new StopMapper(gps);

  const app = new Hono();

  // CORS — expose Mcp-Session-Id for browser-based MCP clients (Claude.ai)
  app.use("*", cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Accept", "Authorization", "Mcp-Session-Id"],
    exposeHeaders: ["Mcp-Session-Id"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  }));

  // Request logging
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
  });

  // --- OAuth discovery (RFC 9728) ---
  // Claude Desktop and Claude.ai check these proactively.
  // Return valid metadata indicating this resource exists but has no auth servers.
  app.get("/.well-known/oauth-protected-resource", (c) => {
    return c.json({ resource: "https://stm.paltickets.uy/mcp" });
  });
  app.get("/.well-known/oauth-protected-resource/mcp", (c) => {
    return c.json({ resource: "https://stm.paltickets.uy/mcp" });
  });

  // --- Routes ---

  app.get("/privacy", (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Política de Privacidad — STM Montevideo API</title>
<style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#333}</style>
</head>
<body>
<h1>Política de Privacidad</h1>
<p><strong>STM Montevideo API</strong> es un servicio de consulta de datos públicos del Sistema de Transporte Metropolitano (STM) de Montevideo, Uruguay.</p>
<h2>Datos que recopilamos</h2>
<p>Este servicio <strong>no recopila, almacena ni procesa datos personales</strong> de los usuarios. Las consultas realizadas a la API son stateless y no se registran de forma persistente.</p>
<h2>Fuente de datos</h2>
<p>Todos los datos de transporte provienen de los datos abiertos de la Intendencia de Montevideo, disponibles públicamente en <a href="https://ckan.montevideo.gub.uy">ckan.montevideo.gub.uy</a>.</p>
<h2>Contacto</h2>
<p>Para consultas: <a href="https://github.com/chaba11/mcp-stm-montevideo">github.com/chaba11/mcp-stm-montevideo</a></p>
<p><small>Última actualización: marzo 2026</small></p>
</body>
</html>`);
  });

  app.get("/api/health", (c) => {
    return c.json({
      status: "ok",
      version: pkgVersion,
      uptime_seconds: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  // OpenAPI spec
  app.get("/api/openapi.yaml", (c) => {
    return c.body(getOpenApiSpec(), {
      headers: { "Content-Type": "text/yaml; charset=utf-8" },
    });
  });

  // Swagger UI
  app.get(
    "/api/docs",
    swaggerUI({ url: "/api/openapi.yaml" })
  );

  // buscar_parada
  app.get("/api/paradas/buscar", async (c) => {
    try {
      const calle1 = qstr(c.req.query("calle1"));
      const calle2 = qstr(c.req.query("calle2"));
      const latitud = qnum(c.req.query("latitud"), "latitud");
      const longitud = qnum(c.req.query("longitud"), "longitud");
      const radio_metros = qnum(c.req.query("radio_metros"), "radio_metros");

      if (latitud !== undefined && (latitud < -90 || latitud > 90)) {
        const e = errorJson("latitud debe estar entre -90 y 90", "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }
      if (longitud !== undefined && (longitud < -180 || longitud > 180)) {
        const e = errorJson("longitud debe estar entre -180 y 180", "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }
      if (radio_metros !== undefined && radio_metros <= 0) {
        const e = errorJson("radio_metros debe ser un número positivo", "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }

      if (!calle1 && latitud === undefined) {
        const e = errorJson(
          "Proporciona al menos calle1 o latitud+longitud para buscar paradas.",
          "BAD_REQUEST",
          400
        );
        return c.json(e.json, e.status);
      }

      const result = await buscarParadaHandler(
        { calle1, calle2, latitud, longitud, radio_metros },
        client
      );
      return c.json(parseToolResponse(result));
    } catch (err) {
      if (typeof err === "string") {
        const e = errorJson(err, "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }
      const e = errorJson(
        err instanceof Error ? err.message : "Error interno",
        "INTERNAL",
        500
      );
      return c.json(e.json, e.status);
    }
  });

  // proximos_buses
  app.get("/api/buses/proximos", async (c) => {
    try {
      const parada_id = qnum(c.req.query("parada_id"), "parada_id");
      const calle1 = qstr(c.req.query("calle1"));
      const calle2 = qstr(c.req.query("calle2"));
      const linea = qstr(c.req.query("linea"));
      const cantidad = qnum(c.req.query("cantidad"), "cantidad");

      if (cantidad !== undefined && cantidad <= 0) {
        const e = errorJson("cantidad debe ser un número positivo", "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }

      if (parada_id === undefined && !calle1) {
        const e = errorJson(
          "Proporciona parada_id o calle1 para consultar próximos buses.",
          "BAD_REQUEST",
          400
        );
        return c.json(e.json, e.status);
      }

      const result = await proximosBusesHandler(
        { parada_id, calle1, calle2, linea, cantidad },
        client,
        gps,
        undefined,
        stopMapper
      );
      return c.json(parseToolResponse(result));
    } catch (err) {
      if (typeof err === "string") {
        const e = errorJson(err, "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }
      const e = errorJson(
        err instanceof Error ? err.message : "Error interno",
        "INTERNAL",
        500
      );
      return c.json(e.json, e.status);
    }
  });

  // recorrido_linea
  app.get("/api/lineas/:numero/recorrido", async (c) => {
    try {
      const linea = c.req.param("numero");
      const variante = qstr(c.req.query("variante"));

      const result = await recorridoLineaHandler({ linea, variante }, client);
      const parsed = parseToolResponse(result);

      // If the tool returned a "not found" text message, return 404
      if (typeof parsed === "string" && parsed.includes("No se encontró la línea")) {
        const e = errorJson(parsed, "NOT_FOUND", 404);
        return c.json(e.json, e.status);
      }

      return c.json(parsed);
    } catch (err) {
      const e = errorJson(
        err instanceof Error ? err.message : "Error interno",
        "INTERNAL",
        500
      );
      return c.json(e.json, e.status);
    }
  });

  // ubicacion_bus
  app.get("/api/buses/:linea/ubicacion", async (c) => {
    try {
      const linea = c.req.param("linea");
      const result = await ubicacionBusHandler({ linea }, gps);
      return c.json(parseToolResponse(result));
    } catch (err) {
      const e = errorJson(
        err instanceof Error ? err.message : "Error interno",
        "INTERNAL",
        500
      );
      return c.json(e.json, e.status);
    }
  });

  // como_llegar
  app.post("/api/como-llegar", async (c) => {
    try {
      const body = await c.req.json().catch(() => null);

      if (!body || typeof body !== "object") {
        const e = errorJson("El cuerpo debe ser un JSON válido.", "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }

      const {
        origen_calle1,
        origen_calle2,
        destino_calle1,
        destino_calle2,
        max_transbordos,
        max_caminata_metros,
      } = body as Record<string, unknown>;

      if (!origen_calle1 || !destino_calle1) {
        const e = errorJson(
          "Proporciona origen_calle1 y destino_calle1 en el body.",
          "BAD_REQUEST",
          400
        );
        return c.json(e.json, e.status);
      }

      const result = await comoLlegarHandler(
        {
          origen_calle1: String(origen_calle1),
          origen_calle2: origen_calle2 ? String(origen_calle2) : undefined,
          destino_calle1: String(destino_calle1),
          destino_calle2: destino_calle2 ? String(destino_calle2) : undefined,
          max_transbordos: typeof max_transbordos === "number" ? max_transbordos : undefined,
          max_caminata_metros: typeof max_caminata_metros === "number" ? max_caminata_metros : undefined,
        },
        client
      );
      return c.json(parseToolResponse(result));
    } catch (err) {
      if (typeof err === "string") {
        const e = errorJson(err, "BAD_REQUEST", 400);
        return c.json(e.json, e.status);
      }
      const e = errorJson(
        err instanceof Error ? err.message : "Error interno",
        "INTERNAL",
        500
      );
      return c.json(e.json, e.status);
    }
  });

  // MCP over HTTP — stateless Streamable HTTP transport
  // Each request gets a fresh McpServer + transport (SDK requirement for stateless mode).
  // The shared `client` (CkanClient with 24h cache) is reused across requests.
  // POST only: GET would open an infinite SSE stream that times out behind Cloudflare (524).
  // Stateless servers SHOULD return 405 for GET/DELETE per MCP spec.
  app.post("/mcp", async (c) => {
    // The SDK requires Accept to literally contain both "application/json" and
    // "text/event-stream". Claude.ai may send Accept: */* or omit it entirely.
    // Force the exact value the SDK expects; enableJsonResponse ensures the
    // response is plain JSON regardless.
    const headers = new Headers(c.req.raw.headers);
    headers.set("accept", "application/json, text/event-stream");
    const patchedRequest = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      // @ts-expect-error duplex is needed for streaming bodies
      duplex: "half",
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no session tracking
      enableJsonResponse: true, // return JSON instead of SSE — required for Claude.ai
    });
    const mcpServer = createServer(client);
    await mcpServer.connect(transport);
    return transport.handleRequest(patchedRequest);
  });

  app.on(["GET", "DELETE"], "/mcp", (c) => {
    return c.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. Use POST." }, id: null },
      405,
      { Allow: "POST" }
    );
  });

  // 404 fallback
  app.notFound((c) => {
    return c.json(
      { error: true, message: `Ruta no encontrada: ${c.req.method} ${c.req.path}`, code: "NOT_FOUND" },
      404
    );
  });

  return app;
}
