# LOOP-07: Tool ubicacion_bus

## Task

Implement `ubicacion_bus` — real-time GPS location of buses for a given line.

## Steps

1. Research the real-time GPS API:
   - The app "Cómo Ir" and comomemuevo.uy use a real-time bus tracking API from IM
   - Check if `https://ckan.montevideo.gub.uy` has a real-time resource
   - Try known endpoints:
     - `https://www.montevideo.gub.uy/buses/` variations
     - Look in network requests of `https://montevidata.montevideo.gub.uy/movilidad/flota-e-infraestructura-de-transporte`
     - The CKAN dataset may have a URL pointing to the live API
   - Document findings in `docs/data-spec.md` under a new "Real-time GPS" section

2. Create `src/data/gps-client.ts`:
   - If API found: implement client to fetch bus positions
   - If API NOT found or requires auth: implement a stub that returns `{ available: false, message: "GPS en tiempo real no disponible. Usando horarios teóricos." }`
   - Cache GPS data for 30 seconds max

3. Create `src/tools/ubicacion-bus.ts`:
   - Tool name: `ubicacion_bus`
   - Description: "Muestra la ubicación en tiempo real de los ómnibus de una línea del STM"
   - Input: `linea` (requerido), `variante` (opcional)
   - Output: Array of `{ id_vehiculo, latitud, longitud, velocidad, destino, ultimo_reporte }` or unavailability message

4. Register in `src/server.ts`

5. Tests:
   - Test with mocked GPS response
   - Test unavailability fallback
   - Test cache behavior (same data within 30s)

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
npm run lint
```

## IMPORTANT

Do NOT block on finding the GPS API. If after 15 minutes of research you can't find a public endpoint, implement the stub version and move on. The tool is still useful as a placeholder that will be filled in later.

## On Completion

1. Mark LOOP-07 as done in PROGRESS.md
2. Git commit: `feat: MCP tool ubicacion_bus (LOOP-07)`
