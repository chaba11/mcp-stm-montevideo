# LOOP-03: Geo Utilities

## Task

Build geographic utilities for finding stops near addresses/coordinates.

## Steps

1. Create `src/geo/coordinates.ts`:
   - `utm21sToWgs84(easting: number, northing: number): { lat: number, lon: number }` — if paradas are in EPSG:32721
   - Only implement this if LOOP-01 data-spec confirmed coordinates are UTM. If already WGS84, skip.

2. Create `src/geo/distance.ts`:
   - `findNearestParadas(lat, lon, paradas[], radioMetros, maxResults)` — returns nearest N stops within radius, sorted by distance
   - Uses `geolib` for haversine distance
   - Returns parada objects with added `distancia_metros` field

3. Create `src/geo/geocode.ts`:
   - `geocodeIntersection(calle1: string, calle2: string): Promise<{lat, lon} | null>` — resolves a Montevideo street intersection to coordinates
   - Strategy 1: Search parada names for matching street names (many stops are named after streets)
   - Strategy 2: Use Nominatim API as fallback: `https://nominatim.openstreetmap.org/search?q=${calle1}+y+${calle2},+Montevideo,+Uruguay&format=json`
   - Add User-Agent header for Nominatim (required by their policy)
   - Handle "not found" gracefully

4. Create `src/geo/search.ts`:
   - `fuzzySearchParadas(query: string, paradas[]): Parada[]` — fuzzy text search on parada names
   - Simple: lowercase + normalize diacritics + includes matching. No need for heavy fuzzy lib.

5. Write tests in `tests/geo/`:
   - `distance.test.ts`: Known Montevideo coordinates → verify correct nearest stop
   - `geocode.test.ts`: Mock Nominatim response, verify parsing
   - `search.test.ts`: Search "españa" returns stops on Bv España

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose
# All tests pass, at least 5 new tests
npm run lint
```

## On Completion

1. Mark LOOP-03 as done in PROGRESS.md
2. Git commit: `feat: geo utilities - distance, geocoding, search (LOOP-03)`
