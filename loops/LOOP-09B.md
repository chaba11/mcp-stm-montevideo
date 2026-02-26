# LOOP-09B: Test Suite - MCP Protocol & End-to-End Edge Cases

## Task

Test the MCP server at the protocol level and run end-to-end scenarios that span multiple tools.

## Steps

1. Create `tests/mcp/protocol.test.ts` — MCP protocol compliance:
   - **tools/list**: returns all 5 tools with correct names
   - **tools/list schemas**: each tool has complete inputSchema with descriptions
   - **tools/call valid**: calling buscar_parada with valid args → valid JSON response
   - **tools/call unknown tool**: calling "nonexistent_tool" → MCP error response (not crash)
   - **tools/call missing args**: calling proximos_buses with no args → error with helpful message
   - **tools/call wrong types**: passing string where number expected → error with type info
   - **tools/call extra args**: passing unknown extra fields → ignored, no crash
   - **tools/call null args**: passing null for optional fields → treated as absent
   - **Concurrent calls**: 5 simultaneous tool calls → all resolve correctly
   - **Server lifecycle**: server starts, handles request, can handle another request
   - **Edge — empty request body**: → valid JSON-RPC error
   - **Edge — malformed JSON**: → parse error
   - **Edge — wrong JSON-RPC version**: → error
   - **Edge — missing method**: → method not found error

2. Create `tests/e2e/scenarios.test.ts` — real-world user scenarios:
   
   **Scenario 1: "¿Cuándo pasa el 181 por Bv España y Libertad?"**
   - Call buscar_parada(calle1="Bv España", calle2="Libertad")
   - Take first result's parada_id
   - Call proximos_buses(parada_id=..., linea="181")
   - Verify: response has horarios, minutos_restantes makes sense
   
   **Scenario 2: "¿Cómo llego de Tres Cruces a Ciudad Vieja?"**
   - Call como_llegar(origen_calle1="Tres Cruces", destino_calle1="Ciudad Vieja")
   - Verify: at least one route option returned
   - Verify: total duration is between 10-60 minutes (sanity check)
   
   **Scenario 3: "¿Qué líneas pasan cerca de mi casa?"**
   - Call buscar_parada(latitud=-34.91, longitud=-56.16)
   - Verify: results have lineas arrays populated
   - Call recorrido_linea for one of those lines
   - Verify: recorrido includes the parada from step 1
   
   **Scenario 4: Sequential queries (user refining)**
   - buscar_parada(calle1="Pocitos") → gets paradas
   - proximos_buses(parada_id from above) → gets all buses
   - proximos_buses(parada_id from above, linea="specific") → filtered
   - Verify: filtered is subset of unfiltered

3. Create `tests/e2e/error-resilience.test.ts`:
   - **CKAN down**: Mock CKAN to return 500 → all tools return helpful error, not crash
   - **CKAN slow**: Mock 10s delay → tools timeout gracefully with message
   - **CKAN returns HTML**: Mock returns HTML error page instead of CSV → detected and handled
   - **Partial data load**: paradas load OK but horarios fail → buscar_parada works, proximos_buses reports error
   - **Stale cache + network error**: cached data exists but expired, CKAN is down → use stale data with warning
   - **Memory pressure**: load very large dataset (100k rows) → doesn't OOM, handles gracefully

4. Create `tests/e2e/data-quality.test.ts`:
   - **No duplicate paradas**: same parada_id doesn't appear twice
   - **Valid coordinates**: all paradas have lat/lon within Montevideo bbox
   - **Valid times**: all horarios have parseable time values
   - **Line consistency**: every line in horarios appears in at least one parada
   - **Parada consistency**: every parada in horarios exists in paradas dataset
   - **No orphan data**: no horarios referencing nonexistent paradas

## Acceptance Criteria

```bash
npm run test -- tests/mcp/ tests/e2e/ --reporter=verbose
# At least 25 tests in these files
# 0 failures

# Full test suite (everything)
npm run test -- --reporter=verbose
# 0 failures across ALL test files
# Total test count should be >= 80

npm run lint
```

## IMPORTANT

If e2e tests reveal issues with how tools chain together, fix the tools. If data quality tests find bad data handling, add sanitization to the CKAN client.

Every bug fixed here should get a corresponding unit test added to the relevant test file (regression test).

## On Completion

1. Mark LOOP-09B as done in PROGRESS.md
2. Git commit: `test: MCP protocol, e2e scenarios, and error resilience tests (LOOP-09B)`
