# LOOP-02B: Test Suite - Cache & CKAN Client

## Task

Build a comprehensive test suite for the cache and CKAN client modules. Hunt for edge cases aggressively.

## Steps

1. Create `tests/data/cache.test.ts`:
   - **Happy path**: set/get returns correct value
   - **TTL expiry**: value disappears after TTL (use `vi.advanceTimersByTime`)
   - **TTL not expired**: value persists before TTL
   - **Clear**: removes all entries
   - **Overwrite**: setting same key overwrites value and resets TTL
   - **Different TTLs**: two keys with different TTLs expire independently
   - **Edge — undefined value**: storing `undefined` vs `null` vs empty string
   - **Edge — zero TTL**: TTL of 0ms should expire immediately
   - **Edge — negative TTL**: should not crash, treat as expired
   - **Edge — very large TTL**: should not overflow
   - **Edge — concurrent access**: multiple rapid get/set on same key
   - **Edge — special characters in key**: keys with spaces, unicode, emojis

2. Create `tests/data/ckan-client.test.ts`:
   - Create fixtures in `tests/fixtures/`:
     - `paradas-sample.csv` — 10 real rows from the paradas dataset
     - `horarios-sample.csv` — 20 real rows from horarios dataset
     - `malformed.csv` — CSV with missing columns, extra commas, empty rows, BOM marker
     - `empty.csv` — valid CSV with headers but zero data rows
     - `encoding-latin1.csv` — CSV with Latin-1 encoded characters (ñ, á, etc.)
   - **Happy path**: parse valid CSV → correct typed objects
   - **Column mapping**: verify each CSV column maps to the right TypeScript field
   - **Edge — empty CSV**: headers only, no rows → returns empty array, no crash
   - **Edge — malformed CSV**: missing columns → skip bad rows, log warning, don't crash
   - **Edge — BOM marker**: UTF-8 BOM (0xEF 0xBB 0xBF) at start of file → strip it
   - **Edge — encoding**: ñ, á, é, í, ó, ú, ü characters in street names → preserved correctly
   - **Edge — extra whitespace**: values with leading/trailing spaces → trimmed
   - **Edge — numeric strings**: "0181" as line number → preserved as string, not parsed to 181
   - **Edge — network error**: CKAN API returns 500 → graceful error with message
   - **Edge — timeout**: CKAN API takes >10s → timeout with clear error
   - **Edge — 404 dataset**: package_show for non-existent dataset → clear error
   - **Edge — empty resource list**: dataset exists but has 0 resources → clear error
   - **Edge — resource URL changed**: URL from package_show returns 404 → retry with fresh package_show
   - **Cache integration**: second call within TTL doesn't hit network (verify with mock)
   - **Cache miss**: call after TTL expires hits network again

3. Create `tests/helpers/mock-fetch.ts`:
   - Helper to mock `fetch`/`undici` for all network tests
   - `mockCkanResponse(packageId, resources[])` — mocks package_show
   - `mockCsvDownload(url, csvContent)` — mocks CSV download
   - `mockNetworkError(url)` — simulates network failure
   - `mockTimeout(url, delayMs)` — simulates slow response

## Acceptance Criteria

```bash
npm run test -- tests/data/ --reporter=verbose
# At least 20 tests total
# 0 failures
npm run test -- tests/data/ --reporter=verbose 2>&1 | grep "Tests" | grep -P "\d{2,} passed"
```

## On Completion

1. Mark LOOP-02B as done in PROGRESS.md
2. Git commit: `test: comprehensive cache and CKAN client tests (LOOP-02B)`
