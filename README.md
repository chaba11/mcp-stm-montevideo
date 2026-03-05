# mcp-stm-montevideo

**ES:** Servidor MCP para el Sistema de Transporte Metropolitano (STM) de Montevideo, Uruguay. Permite que los LLMs respondan preguntas sobre horarios, recorridos y paradas del transporte público.

**EN:** MCP server for Montevideo's Metropolitan Transit System (STM). Lets LLMs answer questions about bus schedules, routes, and stops in real time.

**Landing:** [landing.stm.paltickets.uy](https://landing.stm.paltickets.uy) · **API:** [stm.paltickets.uy](https://stm.paltickets.uy)

---

## Instalación / Installation

```bash
npx mcp-stm-montevideo
```

Los datos se descargan automáticamente desde los datos abiertos de la Intendencia de Montevideo (CKAN). La primera ejecución tarda ~60s mientras descarga y cachea en disco (`~/.cache/mcp-stm-montevideo/`). Las ejecuciones siguientes cargan desde el caché en ~2s. El servidor pre-carga los datos al iniciar para que la primera consulta sea instantánea.

*Data downloads automatically from Montevideo's open data portal (CKAN). First run takes ~60s to download and cache to disk (`~/.cache/mcp-stm-montevideo/`). Subsequent runs load from disk cache in ~2s. The server warms up data on startup so the first query is instant.*

---

## Configuración / Configuration

### Claude Desktop

Agrega esto a `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) o `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "stm-montevideo": {
      "command": "npx",
      "args": ["-y", "mcp-stm-montevideo"]
    }
  }
}
```

### Cursor

En `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stm-montevideo": {
      "command": "npx",
      "args": ["-y", "mcp-stm-montevideo"]
    }
  }
}
```

### Claude Code

En `.mcp.json` en la raíz de tu proyecto:

```json
{
  "mcpServers": {
    "stm-montevideo": {
      "command": "npx",
      "args": ["-y", "mcp-stm-montevideo"]
    }
  }
}
```

---

## Herramientas disponibles / Available Tools

| Herramienta | Descripción |
|-------------|-------------|
| `buscar_parada` | Busca paradas cercanas a una dirección, intersección o coordenadas GPS |
| `proximos_buses` | Muestra los próximos ómnibus que pasan por una parada |
| `recorrido_linea` | Muestra el recorrido completo de una línea con todas sus paradas |
| `ubicacion_bus` | Posición en tiempo real de una línea (cuando esté disponible) |
| `como_llegar` | Calcula la mejor ruta en transporte público entre dos puntos |

---

## REST API

El servidor expone una API REST además del protocolo MCP. Base URL: `https://stm.paltickets.uy`

*The server exposes a REST API alongside the MCP protocol. Base URL: `https://stm.paltickets.uy`*

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/paradas/buscar` | GET | Buscar paradas cercanas / Search nearby stops |
| `/api/buses/proximos` | GET | Próximos ómnibus en una parada / Next buses at a stop |
| `/api/lineas/:numero/recorrido` | GET | Recorrido de una línea / Line route |
| `/api/buses/:linea/ubicacion` | GET | Ubicación GPS de una línea / Line GPS location |
| `/api/como-llegar` | POST | Calcular ruta entre dos puntos / Route between two points |
| `/api/health` | GET | Estado del servidor / Server health |
| `/api/docs` | GET | Swagger UI interactivo / Interactive Swagger UI |
| `/api/openapi.yaml` | GET | Especificación OpenAPI 3.1 / OpenAPI 3.1 spec |

---

## MCP remoto / Remote MCP

Endpoint: `https://stm.paltickets.uy/mcp` (Streamable HTTP, stateless)

Para usar el MCP remoto en Claude Desktop o Claude.ai, usa `"url"` en vez de `"command"`:

*To use remote MCP in Claude Desktop or Claude.ai, use `"url"` instead of `"command"`:*

```json
{
  "mcpServers": {
    "stm-montevideo": {
      "url": "https://stm.paltickets.uy/mcp"
    }
  }
}
```

---

## ChatGPT Actions

La API sirve como backend para GPTs de ChatGPT mediante Actions. Apunta a la especificación OpenAPI en `https://stm.paltickets.uy/api/openapi.yaml` al configurar el GPT.

*The API serves as a backend for ChatGPT GPTs via Actions. Point to the OpenAPI spec at `https://stm.paltickets.uy/api/openapi.yaml` when configuring the GPT.*

---

## Ejemplos de uso / Usage Examples

**¿Cuándo pasa el próximo 181?**
> "¿A qué hora pasa el próximo 181 por Bv España y Libertad?"

```
→ buscar_parada(calle1="Bv España", calle2="Libertad")
→ proximos_buses(parada_id=..., linea="181")
```

**¿Qué líneas pasan cerca?**
> "¿Qué líneas de ómnibus pasan cerca de Tres Cruces?"

```
→ buscar_parada(latitud=-34.893, longitud=-56.163, radio_metros=300)
```

**¿Cómo llego en bondi?**
> "¿Cómo llego de Ciudad Vieja a Pocitos en ómnibus?"

```
→ como_llegar(origen_calle1="Ciudad Vieja", destino_calle1="Pocitos")
```

**Ver el recorrido completo de una línea**
> "¿Cuáles son todas las paradas de la línea D10?"

```
→ recorrido_linea(linea="D10")
```

---

## Fuentes de datos / Data Sources

Los datos provienen de los **Datos Abiertos de la Intendencia de Montevideo**:

- [Portal CKAN](https://ckan.montevideo.gub.uy) — `datos-abiertos.montevideo.gub.uy`
- Dataset horarios: `horarios-de-omnibus-urbanos-por-parada-stm`
- Dataset paradas: coordenadas en EPSG:32721 (UTM Zone 21S), convertidas a WGS84
- Dataset recorridos y líneas: origen/destino de cada variante

Los datos se cachean en disco por 6 meses y en memoria por 1 mes. El caché en disco (`~/.cache/mcp-stm-montevideo/`) persiste entre reinicios del servidor, eliminando la descarga de ~60s en ejecuciones posteriores.

*Data is cached to disk for 6 months and in memory for 1 month. The disk cache (`~/.cache/mcp-stm-montevideo/`) persists across server restarts, eliminating the ~60s download on subsequent runs.*

---

## Desarrollo / Development

```bash
git clone https://github.com/chaba11/mcp-stm-montevideo
cd mcp-stm-montevideo
npm install
npm run build
npm run test
npm run lint
```

Para iniciar la REST API localmente:

*To start the REST API locally:*

```bash
npm run start:api     # producción
npm run dev:api       # desarrollo con hot reload
```

Para ejecutar los tests de integración con datos reales (requiere internet):

```bash
npm run test:integration
```

---

## Contribuir / Contributing

Los issues y pull requests son bienvenidos. Los bugs encontrados con datos reales son especialmente valiosos.

*Issues and pull requests welcome. Bugs found with real data are especially valuable.*

---

## Licencia / License

MIT © 2026 chaba11
