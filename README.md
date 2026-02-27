# mcp-stm-montevideo

**ES:** Servidor MCP para el Sistema de Transporte Metropolitano (STM) de Montevideo, Uruguay. Permite que los LLMs respondan preguntas sobre horarios, recorridos y paradas del transporte público.

**EN:** MCP server for Montevideo's Metropolitan Transit System (STM). Lets LLMs answer questions about bus schedules, routes, and stops in real time.

---

## Instalación / Installation

```bash
npx mcp-stm-montevideo
```

Los datos se descargan automáticamente desde los datos abiertos de la Intendencia de Montevideo (CKAN) y se cachean en memoria.

*Data is downloaded automatically from Montevideo's open data portal (CKAN) and cached in memory.*

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

Los datos se actualizan automáticamente (cache de 1h para horarios, 24h para paradas y líneas).

*Data comes from Montevideo's open data portal (Intendencia de Montevideo). Schedules cached for 1h, stops and routes for 24h.*

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
