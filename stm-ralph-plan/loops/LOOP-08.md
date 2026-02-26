# LOOP-08: Tool como_llegar

## Task

Implement `como_llegar` — route planning between two points using STM buses.

## Steps

1. Create `src/tools/como-llegar.ts`:
   - Tool name: `como_llegar`
   - Description: "Calcula cómo llegar de un punto a otro en ómnibus del STM en Montevideo, incluyendo transbordos"
   - Input schema:
     ```
     origen_calle1: string (requerido) — "Calle de origen"
     origen_calle2: string (opcional) — "Intersección de origen"
     destino_calle1: string (requerido) — "Calle de destino"
     destino_calle2: string (opcional) — "Intersección de destino"
     max_transbordos: number (opcional, default 1)
     max_caminata_metros: number (opcional, default 500)
     ```
   - Output per option:
     ```
     { duracion_total_estimada_min, tramos: [{ tipo: 'bus'|'caminata', linea?, parada_subida?, parada_bajada?,
       distancia_metros?, duracion_min }] }
     ```

2. Routing algorithm (keep it simple):
   - Phase A — DIRECT routes:
     a. Find paradas near origin (within max_caminata_metros)
     b. Find paradas near destination
     c. For each origin parada, get set of lines
     d. For each destination parada, get set of lines
     e. Intersect: lines that serve both origin AND destination area = direct routes
     f. For each direct route, calculate: walk to stop + ride time + walk from stop
   - Phase B — ONE TRANSFER routes (only if max_transbordos >= 1):
     a. For lines from origin paradas, get ALL their stops
     b. For lines to destination paradas, get ALL their stops
     c. Find transfer points: stops where an origin-line stop is within 300m of a destination-line stop
     d. Build route: walk → bus1 → walk to transfer → bus2 → walk
   - Estimate ride time: ~2 min per stop (rough average for Montevideo urban buses)
   - Estimate walk time: 80 meters per minute
   - Sort results by total estimated duration

3. Register in `src/server.ts`

4. Tests in `tests/tools/como-llegar.test.ts`:
   - Test direct route found
   - Test transfer route
   - Test no route found
   - Use fixture data representing a small subset of the network

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
npm run lint
```

## On Completion

1. Mark LOOP-08 as done in PROGRESS.md
2. Git commit: `feat: MCP tool como_llegar with routing (LOOP-08)`
