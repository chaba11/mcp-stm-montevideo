/**
 * OpenAPI 3.0 spec for the STM Montevideo REST API.
 * Served at GET /api/openapi.yaml
 */
import { stringify } from "yaml";

function buildSpec() {
  return {
    openapi: "3.1.0",
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
      { url: "https://stm.paltickets.uy", description: "Production" },
    ],
    paths: {
      "/api/paradas/buscar": {
        get: {
          operationId: "buscarParadas",
          summary: "Buscar paradas cercanas",
          description:
            "Busca paradas del STM cercanas a un punto en Montevideo. " +
            "Modos: lugar (comercio o institución), calle1+calle2 (intersección), " +
            "calle1 solo (calle o dirección con número), o latitud+longitud (coordenadas GPS).",
          parameters: [
            {
              name: "lugar",
              in: "query",
              schema: { type: "string" },
              description: "Nombre de un local, comercio, institución o punto de interés en Montevideo (ej: 'Hospital Maciel', 'Estadio Centenario', 'xmartlabs')",
              example: "Hospital Maciel",
            },
            { name: "calle1", in: "query", schema: { type: "string" }, description: "Nombre de la calle, avenida o dirección con número de puerta (ej: 'Bv España', 'Av Italia 1500')", example: "Bv España" },
            { name: "calle2", in: "query", schema: { type: "string" }, description: "Calle de intersección (usar junto con calle1)", example: "Libertad" },
            { name: "latitud", in: "query", schema: { type: "number" }, description: "Latitud WGS84", example: -34.9145 },
            { name: "longitud", in: "query", schema: { type: "number" }, description: "Longitud WGS84", example: -56.1505 },
            { name: "radio_metros", in: "query", schema: { type: "number", default: 300 }, description: "Radio de búsqueda en metros (por defecto: 300)", example: 300 },
          ],
          responses: {
            "200": {
              description:
                "Paradas encontradas. Si se usó `lugar`, la respuesta incluye el campo `lugar` con el nombre resuelto " +
                "y las paradas dentro del campo `paradas`. Para los demás modos, la respuesta es un array directo.",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      {
                        description: "Respuesta con lugar resuelto (cuando se usa el parámetro `lugar`)",
                        type: "object",
                        properties: {
                          lugar: { type: "string", description: "Nombre del lugar geocodificado", example: "Hospital Maciel" },
                          paradas: {
                            type: "array",
                            items: { $ref: "#/components/schemas/Parada" },
                          },
                        },
                      },
                      {
                        description: "Array directo de paradas (para búsquedas por calle o coordenadas)",
                        type: "array",
                        items: { $ref: "#/components/schemas/Parada" },
                      },
                    ],
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
          operationId: "proximosBuses",
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
                        fuente: { type: "string", enum: ["tiempo_real", "horario_planificado"], description: "Origen de los datos: tiempo real (API GPS) o horario planificado (CKAN)" },
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
          operationId: "recorridoLinea",
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
          operationId: "ubicacionBus",
          summary: "Ubicación en tiempo real",
          description: "Muestra la posición en tiempo real de los ómnibus de una línea (requiere credenciales API).",
          parameters: [
            { name: "linea", in: "path", required: true, schema: { type: "string" }, description: "Número de línea", example: "181" },
          ],
          responses: {
            "200": {
              description: "Posiciones de buses o mensaje de indisponibilidad",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      linea: { type: "string" },
                      mensaje: { type: "string", description: "Mensaje de estado si el GPS no está disponible" },
                      buses: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            latitud: { type: "number" },
                            longitud: { type: "number" },
                            velocidad: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/como-llegar": {
        post: {
          operationId: "comoLlegar",
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
          operationId: "healthCheck",
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
        Parada: {
          type: "object",
          properties: {
            parada_id: { type: "integer", description: "ID único de la parada", example: 1234 },
            nombre: { type: "string", description: "Nombre descriptivo (calle y esquina)", example: "BV ESPAÑA y LIBERTAD" },
            latitud: { type: "number", example: -34.9145 },
            longitud: { type: "number", example: -56.1505 },
            distancia_metros: { type: "number", description: "Distancia al punto de búsqueda en metros", example: 85 },
            lineas: { type: "array", items: { type: "string" }, description: "Líneas de ómnibus que pasan por esta parada", example: ["121", "181"] },
          },
        },
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
