# LOOP-08B: Test Suite - Tools recorrido_linea, ubicacion_bus & como_llegar

## Task

Comprehensive tests for the remaining three tools, with special focus on como_llegar routing edge cases.

## Steps

1. Create `tests/fixtures/network-data.ts`:
   - A mini transport network for routing tests:
     - 4 lines (L1, L2, L3, L4)
     - 20 paradas forming a grid
     - L1 runs East-West (paradas P1→P5)
     - L2 runs North-South (paradas P6→P10)
     - L3 runs diagonal (P11→P15)
     - L4 circular (P16→P20→P16)
     - Transfer points: P3/P7 are within 200m (L1↔L2 transfer), P5/P12 within 150m (L1↔L3)
   - Each parada has realistic MVD coordinates
   - Each line has a schedule (every 15 min, 6:00-22:00)

2. Create `tests/tools/recorrido-linea.test.ts`:
   - **Happy path**: linea="181" → returns ordered list of paradas with names
   - **Output shape**: has linea, variante, empresa, origen, destino, paradas[], frecuencia
   - **Stop order**: paradas are in route order (first stop to last)
   - **Frequency calc**: frecuencia_promedio matches expected value
   - **Variant filter**: variante="A" → only variant A stops
   - **Edge — line not found**: linea="999" → clear "línea no encontrada" message
   - **Edge — line with no stops**: → shouldn't happen but graceful if it does
   - **Edge — many variants**: line has 5+ variants → lists all, or first if no filter
   - **Edge — line name format**: "D10" vs "d10" vs "D 10" → normalized

3. Create `tests/tools/ubicacion-bus.test.ts`:
   - **Happy path (GPS available)**: returns array of bus positions
   - **Output shape**: each has id_vehiculo, latitud, longitud, ultimo_reporte
   - **GPS unavailable**: returns clear message about using theoretical schedules
   - **Edge — line with no active buses**: valid line but 3AM → empty or message
   - **Edge — stale GPS data**: ultimo_reporte > 5 minutes ago → flagged or filtered
   - **Edge — coords sanity**: all returned coords within Montevideo bounding box

4. Create `tests/tools/como-llegar.test.ts` — THE BIG ONE:

   **Direct route tests (using network fixture):**
   - **Simple direct**: origin near P1, destination near P4 → L1 direct, ~3 stops
   - **Multiple directs**: origin near P3 where L1 and L2 both pass → shows both options
   - **Reverse direction**: origin near P5, dest near P1 → L1 in reverse (if line goes both ways)
   - **Output shape**: each option has duracion_total, tramos[], walk segments
   - **Walk segments**: includes walk from origin to stop AND from stop to destination
   - **Duration estimation**: total time is reasonable (walk + ride + walk)

   **Transfer route tests:**
   - **One transfer**: origin near P1, dest near P10 → L1 to P3, transfer, L2 to P10
   - **Transfer walk distance**: walk between transfer stops shown in output
   - **Multiple transfer options**: system finds the fastest transfer point
   - **max_transbordos=0**: only direct routes, no transfers even if available
   - **max_transbordos=2**: if needed, allows two transfers (P1 → L1 → transfer → L3 → transfer → L2)

   **Walk distance tests:**
   - **Origin far from stop**: origin 400m from nearest stop → includes 5 min walk
   - **max_caminata=100**: origin 400m away → no routes found (too far to walk)
   - **max_caminata=1000**: finds routes with longer walks
   - **Both ends walk**: walk to stop + walk from stop both included in total time

   **Sorting & ranking:**
   - **Sorted by duration**: fastest option first
   - **Direct preferred**: if direct and transfer have similar time, direct ranks higher

   **Edge cases — these are where routing breaks:**
   - **Edge — same origin and dest**: distance < 100m → "ya estás cerca, caminá"
   - **Edge — no route exists**: origin and dest in disconnected parts of network → clear "no se encontró ruta"
   - **Edge — origin = destination**: exact same coords → handle gracefully
   - **Edge — adjacent stops**: origin and dest are consecutive stops on same line → still returns valid route
   - **Edge — only walking**: dest is 200m away, within max_caminata → suggest walking only
   - **Edge — circular line**: dest is behind origin on circular line → finds correct direction
   - **Edge — very long route**: 30+ stops → still returns, duration is reasonable
   - **Edge — no buses at this hour**: route exists but no service now → show route with "próximo servicio a las..."
   - **Edge — missing input**: no origin → clear error
   - **Edge — same street different intersections**: "18 de Julio y Ejido" to "18 de Julio y Andes" → valid short route

5. Create `tests/tools/como-llegar-perf.test.ts`:
   - **Performance**: routing with full network data completes in < 2 seconds
   - **Large network**: 500 paradas, 20 lines → still responds in < 5 seconds
   - Timeout the test at 10 seconds as hard limit

## Acceptance Criteria

```bash
npm run test -- tests/tools/ --reporter=verbose
# At least 50 tests total across ALL tool test files (including 05B tests)
# 0 failures
npm run test -- tests/tools/ --reporter=verbose 2>&1 | grep "Tests" | grep -P "\d{2,} passed"

# Performance test specifically
npm run test -- como-llegar-perf --reporter=verbose 2>&1 | grep -v "FAIL"
```

## IMPORTANT

Fix ALL bugs found. Every failing test should result in a code fix, not a skipped test. Update the tool implementation files as needed. This is the quality gate before integration testing.

## On Completion

1. Mark LOOP-08B as done in PROGRESS.md
2. Git commit: `test: comprehensive routing and remaining tool tests (LOOP-08B)`
