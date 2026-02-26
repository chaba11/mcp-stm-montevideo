# LOOP-01: CKAN Data Exploration

## Task

Explore the CKAN API of Montevideo to discover and document the exact structure of STM datasets. This is a research loop — the output is a data spec document, not application code.

## Steps

1. Query `https://ckan.montevideo.gub.uy/api/3/action/package_search?q=STM` to find all STM-related datasets
2. For each relevant dataset, call `package_show` to get resource URLs
3. Download the first 20 rows of each CSV resource and inspect:
   - Column names
   - Data types
   - Sample values
   - Encoding (UTF-8?)
4. Specifically find and document:
   - **Horarios por parada**: column names, parada ID format, time format, line number format
   - **Paradas/stops**: column names, coordinate system (EPSG:32721 or WGS84?), what info is in each parada
   - **Recorridos/routes**: how routes are represented, what links a route to its stops
   - **Lineas/lines**: list of all line numbers, variants, companies
5. Write findings to `docs/data-spec.md` with:
   - Dataset name, CKAN package ID, resource URL pattern
   - Column definitions with types and examples
   - Relationships between datasets (what field links paradas to horarios, etc.)
   - Any gotchas (encoding, coordinate system, missing data, large file sizes)
6. Create TypeScript type definitions in `src/types/` based on discovered structures:
   - `src/types/parada.ts`
   - `src/types/linea.ts`
   - `src/types/horario.ts`

## Acceptance Criteria

```bash
# docs/data-spec.md exists and has content about at least 3 datasets
test -s docs/data-spec.md

# Type files exist and compile
npx tsc --noEmit src/types/parada.ts src/types/linea.ts src/types/horario.ts

# Build still works
npm run build
```

## On Completion

1. Mark LOOP-01 as done in PROGRESS.md
2. Git commit: `docs: CKAN data exploration and type definitions (LOOP-01)`
