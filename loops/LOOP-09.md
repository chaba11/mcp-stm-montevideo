# LOOP-09: Integration Tests with Real Data

## Task

Create integration tests that hit the real CKAN API and validate the full pipeline end-to-end.

## Steps

1. Create `tests/integration/` directory

2. Create `tests/integration/ckan-live.test.ts`:
   - Skip if env `SKIP_INTEGRATION=true` (for CI)
   - Test: Download paradas from CKAN → verify at least 100 paradas returned
   - Test: Download horarios → verify data has expected columns
   - Test: Paradas have valid coordinates (within Montevideo bounding box: lat -34.7 to -34.95, lon -56.0 to -56.4)

3. Create `tests/integration/tools-live.test.ts`:
   - Test: `buscar_parada` with calle1="18 de Julio", calle2="Ejido" → returns at least 1 parada
   - Test: `buscar_parada` with calle1="Bv España", calle2="Libertad" → returns results
   - Test: `proximos_buses` for parada near "Tres Cruces" → returns buses
   - Test: `recorrido_linea` for linea "181" → returns paradas in order
   - Test: `como_llegar` from "Tres Cruces" to "Ciudad Vieja" → returns at least 1 option

4. Create `tests/integration/mcp-protocol.test.ts`:
   - Spawn the MCP server as a child process
   - Send `tools/list` via stdin → verify all 5 tools are listed
   - Send a `tools/call` for `buscar_parada` → verify valid JSON response
   - Kill the process cleanly

5. Add npm script: `"test:integration": "SKIP_INTEGRATION=false vitest run tests/integration/"`

6. Fix any bugs discovered during integration testing. This is expected — the previous loops used mocked data. Real data will likely surface edge cases.

## Acceptance Criteria

```bash
npm run build
npm run test                # unit tests still pass
npm run test:integration    # integration tests pass (requires internet)
npm run lint
```

## On Completion

1. Mark LOOP-09 as done in PROGRESS.md
2. Git commit: `test: integration tests with live CKAN data (LOOP-09)`
