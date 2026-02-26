# LOOP-06: Tool recorrido_linea

## Task

Implement `recorrido_linea` — shows the full route of a bus line with all its stops.

## Steps

1. Create `src/tools/recorrido-linea.ts`:
   - Tool name: `recorrido_linea`
   - Description: "Muestra el recorrido completo de una línea de ómnibus del STM con todas sus paradas"
   - Input schema:
     ```
     linea: string (requerido) — "Número de línea, ej: 181, D10, L18"
     variante: string (opcional) — "Variante específica del recorrido"
     ```
   - Logic:
     a. Find all paradas served by this line (from horarios data)
     b. Order stops by sequence if available, or by time of first departure
     c. Get line metadata: empresa, origen, destino
     d. Calculate average frequency (time between consecutive buses)
   - Output:
     ```
     { linea, variante, empresa, origen, destino, frecuencia_promedio_minutos,
       paradas: [{ parada_id, nombre, latitud, longitud, orden }] }
     ```

2. Register in `src/server.ts`

3. Tests in `tests/tools/recorrido-linea.test.ts`:
   - Test with mocked data for a known line
   - Test line not found
   - Test variant filtering

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
npm run lint
```

## On Completion

1. Mark LOOP-06 as done in PROGRESS.md
2. Git commit: `feat: MCP tool recorrido_linea (LOOP-06)`
