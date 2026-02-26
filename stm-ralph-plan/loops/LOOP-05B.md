# LOOP-05B: Test Suite - Tools buscar_parada & proximos_buses

## Task

Comprehensive tests for the two most important tools. These are user-facing — bad output means bad UX.

## Steps

1. Create `tests/fixtures/schedule-data.ts`:
   - Export realistic schedule data for testing:
     - Line 181: 3 variants, runs 5:30-23:30, every 10-15 min on weekdays
     - Line D10: 2 variants, runs 6:00-22:00, every 20 min
     - Include weekday, Saturday, and Sunday schedules
     - Include holidays (1 de mayo, etc.)
   - Export ~5 paradas that these lines serve

2. Create `tests/tools/buscar-parada.test.ts`:
   - **Happy path — intersection**: calle1="Bv España", calle2="Libertad" → at least 1 result
   - **Happy path — coords**: lat/lon of Tres Cruces → paradas near terminal
   - **Happy path — single street**: calle1="18 de Julio" → multiple paradas on that street
   - **Output shape**: each result has parada_id, nombre, latitud, longitud, distancia_metros, lineas[]
   - **Lines included**: result lineas[] lists actual lines that serve that stop
   - **Custom radius**: radio_metros=50 → fewer results than radio_metros=500
   - **Edge — no input**: no calle, no coords → clear error message, not crash
   - **Edge — both inputs**: calle AND coords provided → coords take priority (documented behavior)
   - **Edge — invalid coords**: lat=0, lon=0 (middle of ocean) → empty results, friendly message
   - **Edge — coords outside Uruguay**: lat=40.7, lon=-74.0 (NYC) → empty results
   - **Edge — very small radius**: radio_metros=1 → likely empty, no crash
   - **Edge — very large radius**: radio_metros=50000 → returns results, capped at reasonable maxResults
   - **Edge — unicode in street name**: "José Ellauri" with accent → works
   - **Edge — SQL injection attempt**: calle1="'; DROP TABLE--" → treated as literal string, no crash

3. Create `tests/tools/proximos-buses.test.ts`:
   - Use `vi.useFakeTimers()` to control "now" for all tests
   - Set timezone to America/Montevideo in test setup

   **Time-based tests (all with faked timers):**
   - **Monday 8:00**: proximos for line 181 → returns buses, first one within minutes
   - **Monday 23:50**: proximos → shows last buses tonight or "no more today, first tomorrow at..."
   - **Monday 00:30**: past midnight → treats as next day's schedule (or very late night service)
   - **Saturday 10:00**: weekend schedule → different frequencies than weekday
   - **Sunday 14:00**: sunday schedule
   - **Holiday (Jan 1)**: if holiday logic implemented, test reduced service
   
   **Filter tests:**
   - **Line filter**: linea="181" → only 181 results
   - **No line filter**: all lines through that stop
   - **Non-existent line**: linea="999" → empty results, friendly message
   - **Cantidad limit**: cantidad=3 → exactly 3 results
   - **Cantidad=1**: returns only the very next bus

   **Parada resolution tests:**
   - **By parada_id**: direct lookup, no geocoding needed
   - **By street names**: calle1+calle2 → resolves parada then gets schedule
   - **Both provided**: parada_id + calle1 → parada_id takes priority

   **Edge cases:**
   - **Edge — no parada found**: calle names that don't match anything → clear error
   - **Edge — parada with no service**: valid parada_id but no buses today → "sin servicio hoy"
   - **Edge — timezone DST**: Uruguay doesn't use DST currently, but verify timezone handling is explicit
   - **Edge — midnight rollover**: asking at 23:58, next bus is at 00:05 → correctly shows 7 min
   - **Edge — empty schedule**: parada exists but horarios data is empty → graceful message
   - **Edge — duplicate horarios**: same time appears twice in data → deduplicated in output
   - **Edge — line format variations**: "181" vs "0181" vs "181A" → normalized correctly

4. Create `tests/tools/__helpers__/tool-test-utils.ts`:
   - `createMockContext()` — returns a mock MCP tool execution context
   - `callTool(toolName, args)` — simulates a tool call and returns parsed result
   - `withFakeTime(dateString, fn)` — helper to run test at a specific time
   - `montevideoTime(hour, minute, dayOfWeek?)` — creates a Date in MVD timezone

## Acceptance Criteria

```bash
npm run test -- tests/tools/ --reporter=verbose
# At least 30 tests across both files
# 0 failures
npm run test -- tests/tools/ --reporter=verbose 2>&1 | grep "Tests" | grep -P "\d{2,} passed"
```

## IMPORTANT

If any test reveals a bug in the tool implementation (from LOOP-04 or LOOP-05), FIX IT in this loop. Don't just skip the test. The whole point is that tests drive the fixes.

## On Completion

1. Mark LOOP-05B as done in PROGRESS.md
2. Git commit: `test: comprehensive buscar_parada and proximos_buses tests (LOOP-05B)`
