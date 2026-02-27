# Usar la API de STM con Gemini (ADK / Function Calling)

## Opción 1: Google ADK con OpenAPI

El spec OpenAPI de la API es compatible con Gemini ADK. Puedes importar directamente el YAML como herramienta.

## Opción 2: Llamadas directas con curl

### Buscar paradas

```bash
curl "http://localhost:3000/api/paradas/buscar?calle1=Bv+Espa%C3%B1a&calle2=Libertad"
```

### Próximos buses

```bash
curl "http://localhost:3000/api/buses/proximos?parada_id=1234&linea=181"
```

### Recorrido de una línea

```bash
curl "http://localhost:3000/api/lineas/181/recorrido"
```

### Ubicación en tiempo real

```bash
curl "http://localhost:3000/api/buses/181/ubicacion"
```

### Calcular ruta

```bash
curl -X POST http://localhost:3000/api/como-llegar \
  -H "Content-Type: application/json" \
  -d '{
    "origen_calle1": "Bv España",
    "origen_calle2": "Libertad",
    "destino_calle1": "18 de Julio",
    "destino_calle2": "Ejido"
  }'
```

### Estado del servicio

```bash
curl "http://localhost:3000/api/health"
```

## OpenAPI Spec

Disponible en: `GET /api/openapi.yaml`

Swagger UI interactivo: `GET /api/docs`
