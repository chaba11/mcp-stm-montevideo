You are building an MCP server called `mcp-stm-montevideo` from scratch. This server exposes Montevideo's public transit data (STM) so that LLMs can answer questions like "¿cuándo pasa el próximo 181 por Bv España y Libertad?"

## Project context

- **Stack**: Node.js 20+, TypeScript, `@modelcontextprotocol/sdk`, `tsup`, `vitest`, `geolib`, `csv-parse`
- **Data source**: CKAN open data portal at `https://ckan.montevideo.gub.uy/api/3/action/`
- **Key datasets**: STM bus schedules per stop, stop locations with coordinates, route data
- **Coordinates**: may be EPSG:32721 (UTM 21S) — convert to WGS84 if so
- **Timezone**: `America/Montevideo` for all time calculations
- **Package name**: `mcp-stm-montevideo`
- **Language**: Code and comments in English, README bilingual (ES/EN), tool descriptions in Spanish

## 5 MCP Tools to build

1. `buscar_parada` — Find STM stops near an address, intersection, or coordinates
2. `proximos_buses` — Next buses arriving at a stop (the star feature)
3. `recorrido_linea` — Full route of a bus line with all its stops
4. `ubicacion_bus` — Real-time GPS bus positions (stub if API not public)
5. `como_llegar` — Route planning between two points with transfers

## Execution plan

Work through these 16 tasks IN ORDER. For each task:
1. Do ALL the steps described
2. Run the acceptance criteria commands
3. If anything fails, fix it and re-run until all criteria pass
4. Git commit with the specified message
5. Move to the next task

If at any point you need to understand the data structures, query the CKAN API directly. Do not guess data formats — verify them.

---

### TASK 0: Project scaffolding
- `npm init -y`, set name to `mcp-stm-montevideo`
- Install deps: `@modelcontextprotocol/sdk geolib csv-parse`
- Install dev deps: `typescript tsup vitest eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier`
- Create `tsconfig.json` (ES2022, NodeNext, strict), `tsup.config.ts` (entry src/index.ts, esm, shebang), `vitest.config.ts`
- Create minimal `src/index.ts` and `src/server.ts` — MCP server that starts with zero tools
- Create `tests/server.test.ts` — smoke test that imports server module
- Add scripts: build, dev, test, lint, start. Add bin field. Add `.gitignore`
- `git init`, initial commit
- **Verify**: `npm run build && npm run test && npm run lint` all exit 0
- **Commit**: `feat: project scaffolding (TASK-00)`

### TASK 1: CKAN data exploration
- Query `https://ckan.montevideo.gub.uy/api/3/action/package_search?q=STM` and `package_search?q=omnibus+paradas`
- For each relevant dataset, call `package_show` to get resource URLs
- Download first 20 rows of each CSV, inspect column names, types, sample values, encoding
- Specifically document: horarios por parada (columns, time format, parada ID), paradas (coordinate system!), recorridos
- Write findings to `docs/data-spec.md`
- Create TypeScript types in `src/types/`: `parada.ts`, `linea.ts`, `horario.ts`
- **Verify**: `docs/data-spec.md` exists with content, types compile with `npx tsc --noEmit`
- **Commit**: `docs: CKAN data exploration and type definitions (TASK-01)`

### TASK 2: CKAN client + cache
- Create `src/data/cache.ts`: in-memory cache with configurable TTL per key
- Create `src/data/ckan-client.ts`: downloads and parses STM datasets from CKAN. Resolves resource URLs dynamically via `package_show` (never hardcode resource_id). Methods: `getParadas()` (cached 24h), `getHorarios()` (cached 1h), `getLineas()`
- Handle: HTTP errors, CSV parse errors, empty datasets, encoding issues (BOM, Latin-1)
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: CKAN client with cache layer (TASK-02)`

### TASK 2B: Tests — cache & CKAN client (target: 20+ tests)
Create comprehensive tests with fixtures. Hunt for edge cases:
- Cache: set/get, TTL expiry, overwrite resets TTL, zero TTL, concurrent access, special chars in keys
- CKAN: valid CSV parsing, empty CSV (headers only), malformed CSV (missing columns), BOM marker stripping, ñ/á/é encoding preserved, extra whitespace trimmed, "0181" preserved as string not number, network error → graceful message, timeout → clear error, 404 dataset → clear error, empty resources → clear error, cache prevents duplicate network calls
- Create mock helpers in `tests/helpers/mock-fetch.ts`
- Create fixture CSVs in `tests/fixtures/`
- **If any test reveals a bug, FIX the code in this task**
- **Verify**: `npm run test -- tests/data/ --reporter=verbose` → 20+ tests, 0 failures
- **Commit**: `test: comprehensive cache and CKAN client tests (TASK-02B)`

### TASK 3: Geo utilities
- Create `src/geo/coordinates.ts`: UTM to WGS84 conversion if needed (check data-spec.md)
- Create `src/geo/distance.ts`: `findNearestParadas(lat, lon, paradas, radioMetros, maxResults)` using `geolib`
- Create `src/geo/geocode.ts`: resolve street intersections to coords. Strategy: (1) search parada names, (2) Nominatim fallback with User-Agent
- Create `src/geo/search.ts`: fuzzy text search on parada names (normalize diacritics + lowercase)
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: geo utilities (TASK-03)`

### TASK 3B: Tests — geo utilities (target: 25+ tests)
- Use real Montevideo coordinates as fixtures (Tres Cruces, Ciudad Vieja, Pocitos, Centro, Parque Rodó)
- Distance: correct nearest stop, radius filtering, sort order, distance accuracy within 5%, exact match → distance ~0, no stops in radius → empty, negative coords (MVD is negative lat AND lon), empty paradas → no crash
- Geocode: "Bv España"+"Libertad" → MVD coords, abbreviations (Av/Avenida, Bv/Bulevar), case insensitive, accent insensitive ("Espana"="España"), not found → null, Nominatim 429 → fallback, results outside MVD bbox → filtered, numbers in street ("21 de Setiembre")
- Search: partial match, diacritics, multiple words, empty query → empty, special chars → no regex crash
- **Fix all bugs found**
- **Verify**: `npm run test -- tests/geo/ --reporter=verbose` → 25+ tests, 0 failures
- **Commit**: `test: comprehensive geo utilities tests (TASK-03B)`

### TASK 4: Tool buscar_parada
- Create `src/tools/buscar-parada.ts`: MCP tool that finds stops near an address/coords
- Input: calle1?, calle2?, latitud?, longitud?, radio_metros? (default 300)
- Output: `[{ parada_id, nombre, latitud, longitud, distancia_metros, lineas[] }]`
- Register in `src/server.ts` with proper MCP tool registration
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: MCP tool buscar_parada (TASK-04)`

### TASK 5: Tool proximos_buses
- Create `src/data/schedule.ts`: schedule filtering logic (day type, timezone, next departures)
- Create `src/tools/proximos-buses.ts`: MCP tool for next buses at a stop
- Input: parada_id?, calle1?, calle2?, linea?, cantidad? (default 5)
- Output: `[{ linea, variante, destino, horario_estimado, minutos_restantes }]`
- Handle: weekday/saturday/sunday, timezone America/Montevideo, midnight rollover, "no more buses today" message
- Register in server
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: MCP tool proximos_buses (TASK-05)`

### TASK 5B: Tests — buscar_parada & proximos_buses (target: 30+ tests)
- buscar_parada: intersection lookup, coords lookup, single street, custom radius, no input → error, invalid coords, coords outside Uruguay, unicode street names, SQL-injection-like strings → no crash
- proximos_buses: use `vi.useFakeTimers()` for ALL time tests. Test: Monday 8AM, Monday 23:50 (last buses), Saturday, Sunday, line filter, non-existent line, cantidad=1, auto-resolve parada from streets, midnight rollover (23:58 asking about 00:05 = 7min), empty schedule, duplicate horarios → deduplicated, line format "181"/"0181"
- Create test helpers: `createMockContext()`, `withFakeTime(date, fn)`
- **Fix all bugs found**
- **Verify**: `npm run test -- tests/tools/ --reporter=verbose` → 30+ tests, 0 failures
- **Commit**: `test: comprehensive buscar_parada and proximos_buses tests (TASK-05B)`

### TASK 6: Tool recorrido_linea
- Create `src/tools/recorrido-linea.ts`: full route of a line with ordered stops
- Input: linea (required), variante?
- Output: `{ linea, variante, empresa, origen, destino, frecuencia_promedio_min, paradas[] }`
- Register in server
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: MCP tool recorrido_linea (TASK-06)`

### TASK 7: Tool ubicacion_bus
- Research real-time GPS API: check CKAN, comomemuevo.uy, network requests. Spend MAX 15 minutes.
- If found: implement `src/data/gps-client.ts` with 30s cache
- If NOT found: implement stub returning `{ available: false, message: "GPS en tiempo real no disponible..." }`
- Create `src/tools/ubicacion-bus.ts`, register in server
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: MCP tool ubicacion_bus (TASK-07)`

### TASK 8: Tool como_llegar
- Create `src/tools/como-llegar.ts`: route planning with transfers
- Input: origen_calle1, origen_calle2?, destino_calle1, destino_calle2?, max_transbordos? (default 1), max_caminata_metros? (default 500)
- Algorithm: (A) find direct routes (lines serving both origin and destination areas), (B) find 1-transfer routes via transfer points. Estimate: 2 min/stop, 80m/min walking. Sort by total duration.
- Register in server
- **Verify**: `npm run build && npm run test` exit 0
- **Commit**: `feat: MCP tool como_llegar with routing (TASK-08)`

### TASK 8B: Tests — routing & remaining tools (target: 100+ cumulative)
- Create mini transport network fixture (4 lines, 20 stops in grid, known transfer points)
- recorrido_linea: valid line, line not found, variant filter, line name normalization
- ubicacion_bus: GPS available mock, GPS unavailable fallback, stale data
- como_llegar — DIRECT: simple route, multiple options, reverse direction, duration sanity
- como_llegar — TRANSFERS: one transfer via known point, max_transbordos=0 blocks transfers, transfer walk distance shown
- como_llegar — WALKING: origin far from stop, max_caminata filter, destination walkable
- como_llegar — EDGE CASES: same origin/dest → "ya estás cerca", no route → clear message, origin=destination, adjacent stops, circular line, 30+ stops route, no buses at this hour
- como_llegar — PERFORMANCE: full network < 2s, 500 stops < 5s (with timeout at 10s)
- **Fix all bugs**
- **Verify**: `npm run test --reporter=verbose` → 100+ total tests, 0 failures
- **Commit**: `test: comprehensive routing and remaining tool tests (TASK-08B)`

### TASK 9: Integration tests with real data
- `tests/integration/ckan-live.test.ts`: download real data, verify structure, coords within MVD bbox
- `tests/integration/tools-live.test.ts`: buscar_parada "18 de Julio"+"Ejido", proximos_buses near Tres Cruces, recorrido for "181", como_llegar Tres Cruces → Ciudad Vieja
- `tests/integration/mcp-protocol.test.ts`: spawn server as child process, send tools/list, verify 5 tools, send a tools/call
- Add `"test:integration"` script
- Fix any bugs found with real data
- **Verify**: `npm run test && npm run test:integration` both pass
- **Commit**: `test: integration tests with live CKAN data (TASK-09)`

### TASK 9B: Tests — MCP protocol & e2e (target: 120+ total)
- MCP protocol: tools/list returns 5 tools, schemas complete, unknown tool → error, missing args → error, wrong types → error, extra args ignored, null optional args OK, concurrent calls, empty request body, malformed JSON, wrong JSON-RPC version
- e2e scenarios: (1) buscar_parada→proximos_buses chain, (2) como_llegar full scenario, (3) buscar_parada→recorrido_linea chain, (4) sequential refinement queries
- Error resilience: CKAN down → helpful error, CKAN slow → timeout, HTML instead of CSV → detected, partial data (paradas OK but horarios fail), stale cache fallback when network down
- Data quality: no duplicate paradas, valid coords, valid times, line consistency
- **Fix all bugs, add regression tests**
- **Verify**: `npm run test --reporter=verbose` → 120+ total, 0 failures
- **Commit**: `test: MCP protocol, e2e scenarios, and error resilience (TASK-09B)`

### TASK 10: Packaging + README + npm prep
- Update package.json: version 0.1.0, description, keywords, repository, author, license MIT, bin, files, engines
- Create LICENSE (MIT)
- Create README.md (bilingual): description, `npx mcp-stm-montevideo`, config for Claude Desktop + Cursor + Claude Code, tool table, example conversations, data attribution, contributing, license
- Verify dist/index.js has shebang, `npm pack --dry-run` looks correct
- Create `.github/workflows/ci.yml`
- **Verify**: `npm run build && npm run test && npm run lint && npm pack --dry-run`
- **Commit**: `chore: packaging and documentation for npm (TASK-10)`
- **Tag**: `git tag v0.1.0`

---

## Rules

- **Do not skip tasks or reorder them**
- **Do not move to the next task until acceptance criteria pass**
- **If a test finds a bug, fix the bug in the same task — never skip a test**
- **Always use `America/Montevideo` timezone**
- **Never hardcode CKAN resource_id — always resolve via package_show**
- **Keep CKAN requests minimal — cache aggressively**

Start now with TASK 0. Work through all 16 tasks sequentially. Go.
