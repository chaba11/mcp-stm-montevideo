# LOOP-04: Tool buscar_parada

## Task

Implement the first MCP tool: `buscar_parada`. Register it in the server.

## Steps

1. Create `src/tools/buscar-parada.ts`:
   - Tool name: `buscar_parada`
   - Description (español): "Busca paradas del STM cercanas a una dirección, intersección o coordenadas en Montevideo"
   - Input schema:
     ```
     calle1: string (opcional) — "Nombre de la calle o avenida"
     calle2: string (opcional) — "Calle de intersección"
     latitud: number (opcional) — "Latitud WGS84"
     longitud: number (opcional) — "Longitud WGS84"
     radio_metros: number (opcional, default 300) — "Radio de búsqueda en metros"
     ```
   - Must accept EITHER (calle1 + optional calle2) OR (latitud + longitud)
   - Logic:
     a. If lat/lon provided → use directly
     b. If calle1+calle2 → geocode intersection
     c. If only calle1 → fuzzy search parada names
     d. Find nearest paradas within radius
     e. For each parada, list which lines pass through it (from horarios data)
   - Output: JSON array of `{ parada_id, nombre, latitud, longitud, distancia_metros, lineas: string[] }`

2. Register the tool in `src/server.ts`:
   - Import the tool handler
   - Register with `server.setRequestHandler` for `tools/list` and `tools/call`

3. Update `src/index.ts` to properly start the server with stdio transport

4. Write tests in `tests/tools/buscar-parada.test.ts`:
   - Test with mocked paradas data
   - Test intersection lookup
   - Test lat/lon lookup
   - Test "no results" case

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
# All tests pass including new tool tests

# MCP server starts and lists the tool
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | timeout 5 node dist/index.js 2>/dev/null | grep "buscar_parada" || echo "Tool registered check: verify manually"

npm run lint
```

## On Completion

1. Mark LOOP-04 as done in PROGRESS.md
2. Git commit: `feat: MCP tool buscar_parada (LOOP-04)`
