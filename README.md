# mcp-stm-montevideo

MCP (Model Context Protocol) server for Montevideo's public transit system (STM).
Enables LLMs to answer questions about bus schedules, stops, and routes using
open data from the Intendencia de Montevideo.

> **Servidor MCP para el Sistema de Transporte Metropolitano (STM) de Montevideo.**
> Permite a los LLMs responder preguntas sobre horarios, paradas y recorridos de
> ómnibus usando los datos abiertos de la IMM.

---

## Tools / Herramientas

| Tool | Description |
|---|---|
| `buscar_parada` | Find nearby bus stops by address, intersection, or coordinates |
| `proximos_buses` | Next bus departures at a stop |
| `recorrido_linea` | Full route of a bus line (ordered stop list) |
| `ubicacion_bus` | Real-time GPS position (stub — not publicly available) |
| `como_llegar` | Route planning from A to B (direct + 1-transfer routes) |

---

## Requirements / Requisitos

- **Node.js** >= 20
- Network access to [datos-abiertos.montevideo.gub.uy](https://datos-abiertos.montevideo.gub.uy)

---

## Installation / Instalación

```bash
npm install -g mcp-stm-montevideo
```

Or use directly with `npx`:

```bash
npx mcp-stm-montevideo
```

---

## Usage with Claude Desktop / Uso con Claude Desktop

Add to your `claude_desktop_config.json`:

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

Then you can ask Claude:
- *"¿Cuándo pasa el próximo 181 por Bulevar España y Libertad?"*
- *"¿Cómo llego desde 18 de Julio y Ejido hasta el Aeropuerto?"*
- *"¿Cuáles son las paradas más cercanas a Tres Cruces?"*

---

## Development / Desarrollo

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run integration tests (requires network access)
npm run test:integration

# Start the server (stdio transport)
npm start

# Watch mode
npm run dev
```

---

## Data Sources / Fuentes de datos

All data is fetched at runtime from the **IMM open data portal** (CKAN):

- **Paradas** (bus stops): UTM Zone 21S coordinates, converted to WGS84
- **Horarios** (schedules): weekday / Saturday / Sunday departure times
- **Recorridos** (routes): ordered stop sequences per line variant

Data is cached in memory (paradas: 24 h, horarios: 1 h, recorridos: 24 h).

---

## Architecture / Arquitectura

```
src/
├── index.ts          # Entry point (StdioServerTransport)
├── server.ts         # McpServer factory, tool registration
├── data/
│   ├── cache.ts      # In-memory TTL cache
│   ├── ckan-client.ts# CKAN dataset downloader + CSV parser
│   └── schedule.ts   # Schedule filtering (day type, next buses)
├── geo/
│   ├── coordinates.ts# UTM 21S → WGS84 conversion
│   ├── distance.ts   # Nearest-stop finder (geolib)
│   ├── geocode.ts    # Intersection geocoding (parada names + Nominatim)
│   └── search.ts     # Fuzzy text search with diacritic normalization
└── tools/
    ├── buscar-parada.ts
    ├── proximos-buses.ts
    ├── recorrido-linea.ts
    ├── ubicacion-bus.ts
    └── como-llegar.ts
```

---

## Limitations / Limitaciones

- **Real-time GPS** (`ubicacion_bus`) is not available via the public API.
  Use the [official STM app](https://www.montevideo.gub.uy/app/montevideo) for live tracking.
- Route planning (`como_llegar`) uses estimated times (2 min/stop, 80 m/min walking).
  Actual journey times may vary.
- Schedule data reflects the CKAN snapshot; delays and cancellations are not reflected.

---

## License / Licencia

MIT — see [LICENSE](./LICENSE).
