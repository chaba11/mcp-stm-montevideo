# LOOP-05: Tool proximos_buses

## Task

Implement the star tool: `proximos_buses` — tells users when the next bus arrives.

## Steps

1. Create `src/data/schedule.ts` — schedule logic extracted from raw data:
   - `getNextBuses(paradaId, linea?, count?)` — filters horarios for a specific stop, optional line filter
   - Must handle:
     - Current time in America/Montevideo timezone
     - Day type: weekday (lunes-viernes), saturday, sunday/holiday
     - Filter future departures only (after current time)
     - Calculate `minutos_restantes` from now
   - Returns sorted array by departure time

2. Create `src/tools/proximos-buses.ts`:
   - Tool name: `proximos_buses`
   - Description: "Consulta los próximos ómnibus que pasan por una parada del STM en Montevideo"
   - Input schema:
     ```
     parada_id: string (opcional) — "ID de la parada obtenido de buscar_parada"
     calle1: string (opcional) — "Calle para buscar parada automáticamente"
     calle2: string (opcional) — "Intersección"
     linea: string (opcional) — "Número de línea, ej: 181, D10"
     cantidad: number (opcional, default 5) — "Cantidad de próximos buses"
     ```
   - Logic:
     a. If no parada_id → resolve from calle1/calle2 using buscar_parada logic
     b. Get schedule for that stop
     c. Filter by linea if provided
     d. Return top N results
   - Output per bus:
     ```
     { linea, variante, destino, horario_estimado, minutos_restantes, parada_nombre }
     ```
   - If no more buses today, say so and show first buses tomorrow

3. Register in `src/server.ts`

4. Tests in `tests/tools/proximos-buses.test.ts`:
   - Mock current time (use vitest `vi.useFakeTimers`)
   - Test weekday schedule filtering
   - Test line filtering
   - Test "no more buses today" edge case
   - Test auto-resolve parada from street names

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
# All tests pass
# proximos_buses tests specifically pass:
npm run test -- proximos-buses --reporter=verbose 2>&1 | grep -v "FAIL"

npm run lint
```

## On Completion

1. Mark LOOP-05 as done in PROGRESS.md
2. Git commit: `feat: MCP tool proximos_buses (LOOP-05)`
