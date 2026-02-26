# LOOP-02: CKAN Client + Cache

## Task

Build the data access layer: a CKAN client that downloads, parses, and caches STM datasets.

## Steps

1. Create `src/data/cache.ts`:
   - In-memory cache with configurable TTL per key
   - Methods: `get<T>(key)`, `set<T>(key, value, ttlMs)`, `has(key)`, `clear()`
   - Write tests in `tests/data/cache.test.ts` (at least 3 tests: set/get, TTL expiry, clear)

2. Create `src/data/ckan-client.ts`:
   - `getPackageResources(packageId: string)` — calls CKAN `package_show`, returns resource URLs
   - `downloadCsv<T>(resourceUrl: string, parser: (row: Record<string, string>) => T)` — downloads and parses CSV
   - `getParadas()` — returns parsed array of `Parada[]` (cached 24h)
   - `getHorarios()` — returns parsed array of `Horario[]` (cached 1h)
   - `getLineas()` — returns parsed list of unique lines with their variants
   - Use the type definitions from LOOP-01 and the data spec in `docs/data-spec.md`
   - Resolve resource URLs dynamically via `package_show` (never hardcode resource_id)
   - Handle HTTP errors, CSV parse errors, and empty datasets gracefully

3. Write tests in `tests/data/ckan-client.test.ts`:
   - Unit tests with mocked HTTP responses (create fixtures from real data samples in `tests/fixtures/`)
   - Save small CSV samples (5-10 rows) as fixture files
   - Test that parsing produces correct typed objects
   - Test error handling (network error, malformed CSV, empty response)

## Acceptance Criteria

```bash
npm run build
npm run test -- --reporter=verbose 2>&1 | grep -E "PASS|FAIL"
# All tests pass
# At least 6 tests total (3 cache + 3 ckan-client)
npm run test -- --reporter=verbose 2>&1 | grep "Tests" | grep -v "0 passed"
```

## On Completion

1. Mark LOOP-02 as done in PROGRESS.md
2. Git commit: `feat: CKAN client with cache layer (LOOP-02)`
