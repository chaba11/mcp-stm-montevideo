# LOOP-11B: Tests — REST API & OpenAPI

## Task

Comprehensive tests for the REST API layer. Verify every endpoint, error handling, and OpenAPI spec validity.

## Steps

1. Create `tests/api/routes.test.ts`:

   **Happy path — each endpoint:**
   - GET `/api/paradas/buscar?calle1=Bv+España&calle2=Libertad` → 200, array of paradas
   - GET `/api/buses/proximos?parada_id=MOCK_ID` → 200, array of buses
   - GET `/api/lineas/181/recorrido` → 200, recorrido object
   - GET `/api/buses/181/ubicacion` → 200, positions or unavailable message
   - POST `/api/como-llegar` with JSON body → 200, route options
   - GET `/api/health` → 200, `{ status: "ok" }` with version and uptime

   **Response format:**
   - All responses are JSON with Content-Type application/json
   - Success responses don't have `error` field
   - Error responses have `{ error: true, message, code }`

   **Parameter handling:**
   - Query params with extra whitespace → trimmed
   - Empty string params → treated as absent
   - `radio_metros=abc` (non-numeric) → 400 BAD_REQUEST
   - `cantidad=-5` (negative) → 400 BAD_REQUEST
   - `latitud=999` (out of range) → 400 BAD_REQUEST

   **Error cases:**
   - GET `/api/paradas/buscar` with no params → 400 with helpful message
   - GET `/api/buses/proximos` with no parada_id and no calle → 400
   - GET `/api/lineas/999/recorrido` (non-existent) → 404
   - POST `/api/como-llegar` with empty body → 400
   - POST `/api/como-llegar` with missing destino → 400
   - GET `/api/nonexistent` → 404

   **Edge cases:**
   - URL-encoded special chars: `calle1=18+de+Julio` → decoded correctly
   - Unicode in query: `calle1=José+Ellauri` → works
   - Very long query string (2000+ chars) → doesn't crash
   - Concurrent requests (10 simultaneous) → all resolve

2. Create `tests/api/openapi.test.ts`:
   - OpenAPI spec loads and parses as valid YAML
   - Has `info.title` and `info.description`
   - All 6 paths are defined
   - Each path has parameter descriptions
   - Each path has example values
   - Response schemas are defined for each endpoint
   - Server URL is present

3. Create `tests/api/cors.test.ts`:
   - OPTIONS request gets CORS headers
   - GET request includes Access-Control-Allow-Origin
   - POST request includes CORS headers

4. Create `tests/api/integration.test.ts`:
   - Full flow: search parada via API → use parada_id to get proximos → verify chain works
   - Health endpoint returns valid uptime (number > 0)

## Acceptance Criteria

```bash
npm run test -- tests/api/ --reporter=verbose
# At least 25 tests
# 0 failures

# Full suite still passes
npm run test --reporter=verbose
npm run lint
```

## IMPORTANT

If API tests reveal issues with param parsing, error handling, or response format, fix the API code. The REST layer must be solid — external consumers (ChatGPT GPTs, Gemini) have no way to debug bad responses.

## On Completion

1. Mark LOOP-11B as done in PROGRESS.md
2. Git commit: `test: REST API endpoint and OpenAPI tests (LOOP-11B)`
