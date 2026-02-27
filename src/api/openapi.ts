/**
 * OpenAPI 3.0 spec for the STM Montevideo REST API.
 * Served at GET /api/openapi.yaml
 */
import { stringify } from "yaml";

function buildSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "STM Montevideo - API de transporte público",
      version: "0.1.0",
      description:
        "API REST para consultar el Sistema de Transporte Metropolitano (STM) de Montevideo, Uruguay. " +
        "Permite buscar paradas de ómnibus, consultar horarios de próximas llegadas, ver recorridos de líneas " +
        "y calcular rutas en transporte público. Los datos provienen de los datos abiertos de la Intendencia de Montevideo (CKAN). " +
        "Esta API puede ser utilizada por ChatGPT (GPTs con Actions), Gemini (ADK) o cualquier cliente HTTP.",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local development" },
    ],
    paths: {
      "/api/paradas/buscar": {
        get: {
          summary: "Buscar paradas cercanas",
          description: "Busca paradas del STM cercanas a una dirección, intersección o coordenadas GPS.",
          parameters: [
            { name: "calle1", in: "query", schema: { type: "string" }, description: "Nombre de la calle o avenida", example: "Bv España" },
            { name: "calle2", in: "query", schema: { type: "string" }, description: "Calle de intersección", example: "Libertad" },
            { name: "latitud", in: "query", schema: { type: "number" }, description: "Latitud WGS84", example: -34.9145 },
            { name: "longitud", in: "query", schema: { type: "number" }, description: "Longitud WGS84", example: -56.1505 },
            { name: "radio_metros", in: "query", schema: { type: "number", default: 300 }, description: "Radio de búsqueda en metros", example: 300 },
          ],
          responses: {
            "200": {
              description: "Lista de paradas encontradas",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        parada_id: { type: "integer", description: "ID único de la parada" },
                        nombre: { type: "string", description: "Nombre descriptivo (calle y esquina)" },
                        latitud: { type: "number" },
                        longitud: { type: "number" },
                        distancia_metros: { type: "number" },
                        lineas: { type: "array", items: { type: "string" }, description: "Líneas que pasan por esta parada" },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Parámetros inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/buses/proximos": {
        get: {
          summary: "Próximos buses en una parada",
          description: "Consulta los próximos ómnibus que pasan por una parada del STM.",
          parameters: [
            { name: "parada_id", in: "query", schema: { type: "integer" }, description: "ID de la parada (obtenido de buscar)", example: 1234 },
            { name: "calle1", in: "query", schema: { type: "string" }, description: "Calle para buscar parada automáticamente" },
            { name: "calle2", in: "query", schema: { type: "string" }, description: "Calle de intersección" },
            { name: "linea", in: "query", schema: { type: "string" }, description: "Filtrar por número de línea", example: "181" },
            { name: "cantidad", in: "query", schema: { type: "integer", default: 5 }, description: "Cantidad de próximos buses", example: 5 },
          ],
          responses: {
            "200": {
              description: "Lista de próximos buses",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        linea: { type: "string" },
                        variante: { type: "integer" },
                        destino: { type: "string" },
                        horario_estimado: { type: "string", description: "Formato HH:MM" },
                        minutos_restantes: { type: "integer" },
                        parada_nombre: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Parámetros inválidos", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/lineas/{numero}/recorrido": {
        get: {
          summary: "Recorrido de una línea",
          description: "Muestra el recorrido completo de una línea de ómnibus con todas sus paradas en orden.",
          parameters: [
            { name: "numero", in: "path", required: true, schema: { type: "string" }, description: "Número de línea", example: "181" },
            { name: "variante", in: "query", schema: { type: "string" }, description: "Variante del recorrido (ej: A, B)", example: "A" },
          ],
          responses: {
            "200": {
              description: "Recorrido de la línea con paradas en orden",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        linea: { type: "string" },
                        variante: { type: "string" },
                        origen: { type: "string" },
                        destino: { type: "string" },
                        frecuencia_promedio_minutos: { type: "number", nullable: true },
                        paradas: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              parada_id: { type: "integer" },
                              nombre: { type: "string" },
                              latitud: { type: "number" },
                              longitud: { type: "number" },
                              orden: { type: "integer" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": { description: "Línea no encontrada", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/buses/{linea}/ubicacion": {
        get: {
          summary: "Ubicación en tiempo real",
          description: "Muestra la posición en tiempo real de los ómnibus de una línea (requiere credenciales API).",
          parameters: [
            { name: "linea", in: "path", required: true, schema: { type: "string" }, description: "Número de línea", example: "181" },
          ],
          responses: {
            "200": {
              description: "Posiciones de buses o mensaje de indisponibilidad",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/como-llegar": {
        post: {
          summary: "Calcular ruta en transporte público",
          description: "Calcula la mejor ruta entre dos puntos usando el transporte público de Montevideo.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["origen_calle1", "destino_calle1"],
                  properties: {
                    origen_calle1: { type: "string", description: "Calle de origen", example: "Bv España" },
                    origen_calle2: { type: "string", description: "Intersección de origen", example: "Libertad" },
                    destino_calle1: { type: "string", description: "Calle de destino", example: "18 de Julio" },
                    destino_calle2: { type: "string", description: "Intersección de destino", example: "Ejido" },
                    max_transbordos: { type: "integer", default: 1, description: "Máximo número de transbordos" },
                    max_caminata_metros: { type: "integer", default: 500, description: "Máxima distancia a caminar" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Opciones de ruta ordenadas por duración",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        duracion_total_estimada_min: { type: "number" },
                        tramos: {
                          type: "array",
                          items: { type: "object" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": { description: "Cuerpo inválido", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/health": {
        get: {
          summary: "Estado del servicio",
          description: "Verifica que la API está funcionando.",
          responses: {
            "200": {
              description: "Servicio funcionando",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      version: { type: "string", example: "0.1.0" },
                      uptime_seconds: { type: "integer" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "boolean", example: true },
            message: { type: "string" },
            code: { type: "string", enum: ["BAD_REQUEST", "NOT_FOUND", "INTERNAL"] },
          },
        },
      },
    },
  };
}

let cachedYaml: string | undefined;

export function getOpenApiSpec(): string {
  if (!cachedYaml) {
    cachedYaml = stringify(buildSpec());
  }
  return cachedYaml;
}
