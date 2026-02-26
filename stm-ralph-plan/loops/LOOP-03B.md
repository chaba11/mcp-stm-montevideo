# LOOP-03B: Test Suite - Geo Utilities

## Task

Comprehensive tests for all geographic functions. These are critical — wrong distance calculations mean users get sent to the wrong stop.

## Steps

1. Create `tests/fixtures/paradas-geo.ts`:
   - Export a set of ~15 known paradas with real Montevideo coordinates:
     - Tres Cruces area (lat: -34.8937, lon: -56.1675 approx)
     - Ciudad Vieja (lat: -34.9065, lon: -56.2005 approx)
     - Pocitos (lat: -34.9145, lon: -56.1505 approx)
     - Parque Rodó (lat: -34.9120, lon: -56.1680 approx)
     - Centro (18 de Julio y Ejido) (lat: -34.9060, lon: -56.1880 approx)
   - Each with a realistic parada_id and street name

2. Create `tests/geo/distance.test.ts`:
   - **Happy path**: findNearestParadas for Tres Cruces coords → returns Tres Cruces stops first
   - **Radius filter**: radius 100m → fewer results than radius 500m
   - **Max results**: maxResults=3 → exactly 3 results
   - **Sort order**: results sorted by distance ascending
   - **Distance accuracy**: distance between two known points is within 5% of Google Maps distance
   - **Edge — exact match**: coords exactly on a parada → distance is 0 (or near 0)
   - **Edge — no stops in radius**: radius 1m in middle of nowhere → empty array
   - **Edge — all stops in radius**: very large radius → returns all stops up to maxResults
   - **Edge — negative coordinates**: Montevideo has negative lat AND lon — verify signs handled
   - **Edge — precision**: coords with 4 vs 6 decimal places → both work correctly
   - **Edge — empty paradas array**: no paradas loaded → empty array, no crash
   - **Edge — duplicate coordinates**: two paradas at same location → both returned

3. Create `tests/geo/geocode.test.ts`:
   - **Happy path**: "Bv España" + "Libertad" → returns coordinates in Montevideo
   - **Common streets**: "18 de Julio" + "Ejido" → valid Montevideo coords
   - **Abbreviations**: "Av" vs "Avenida", "Bv" vs "Bulevar", "Gral" vs "General" → all resolve
   - **Case insensitive**: "bv españa" = "Bv España" = "BV ESPAÑA"
   - **Accents**: "España" = "Espana" (diacritics-insensitive matching)
   - **Edge — street not found**: "Calle Inventada" + "No Existe" → returns null, no crash
   - **Edge — single street**: only calle1, no calle2 → searches parada names containing that street
   - **Edge — Nominatim rate limit**: mock 429 response → graceful fallback to parada name search
   - **Edge — Nominatim returns wrong city**: filter results to Montevideo bounding box
   - **Edge — ambiguous**: "Rivera" (is it a street or city?) → prefer Montevideo results
   - **Edge — empty string**: calle1="" → returns null
   - **Edge — numbers in street**: "Ruta 1" or "21 de Setiembre" → handled correctly

4. Create `tests/geo/search.test.ts`:
   - **Happy path**: "españa" matches "Bv España y Libertad"
   - **Partial match**: "tres" matches "Terminal Tres Cruces"
   - **Diacritics**: "espana" matches "España", "jose" matches "José"
   - **Multiple words**: "18 julio" matches "18 de Julio"
   - **Edge — empty query**: returns empty array
   - **Edge — no matches**: "xyzzyspoon" → empty array
   - **Edge — very long query**: 500 char string → doesn't crash, returns empty
   - **Edge — special chars**: query with parentheses, brackets → no regex crash

## Acceptance Criteria

```bash
npm run test -- tests/geo/ --reporter=verbose
# At least 25 tests
# 0 failures
npm run test -- tests/geo/ --reporter=verbose 2>&1 | grep "Tests" | grep -P "\d{2,} passed"
```

## On Completion

1. Mark LOOP-03B as done in PROGRESS.md
2. Git commit: `test: comprehensive geo utilities tests (LOOP-03B)`
