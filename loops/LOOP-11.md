# LOOP-11: REST API Wrapper + OpenAPI + Docker

## Context

The MCP server works for Claude natively, but Gemini (via ADK) and ChatGPT (via GPTs) need an OpenAPI-compatible REST API. This loop adds a REST layer on top of the existing tool logic, an OpenAPI spec, and Docker packaging.

## Steps

### 1. Install dependencies

```bash
npm install hono @hono/node-server @hono/swagger-ui yaml
npm install -D @types/node
```

Use Hono over Express — it's lighter, faster, and has built-in OpenAPI helpers.

### 2. Create `src/api/rest-server.ts`

Build a Hono app that reuses the SAME logic from `src/tools/`. Do NOT duplicate business logic — import the existing tool functions.

Routes:

| Method | Path | Tool reused | Query/Body params |
|--------|------|-------------|-------------------|
| GET | `/api/paradas/buscar` | buscar_parada | `?calle1=&calle2=&latitud=&longitud=&radio_metros=` |
| GET | `/api/buses/proximos` | proximos_buses | `?parada_id=&calle1=&calle2=&linea=&cantidad=` |
| GET | `/api/lineas/:numero/recorrido` | recorrido_linea | `?variante=` |
| GET | `/api/buses/:linea/ubicacion` | ubicacion_bus | — |
| POST | `/api/como-llegar` | como_llegar | JSON body with all routing params |
| GET | `/api/health` | — | Returns `{ status: "ok", version, uptime, cache_stats }` |

Requirements:
- Each route parses params, calls the existing tool function, returns JSON
- Consistent error format: `{ error: true, message: "..." , code: "NOT_FOUND" | "BAD_REQUEST" | "INTERNAL" }`
- CORS enabled (allow all origins for development)
- Request logging (method, path, status, duration_ms)
- `radio_metros`, `cantidad`, `latitud`, `longitud` parsed as numbers with validation
- Query params are trimmed and empty strings treated as undefined

### 3. Create `src/api/openapi.ts`

Generate `openapi.yaml` at build time OR serve it at `GET /api/openapi.yaml`.

OpenAPI 3.0 spec requirements:
- `info.title`: "STM Montevideo - API de transporte público"
- `info.description`: Context paragraph explaining STM, Montevideo, Uruguay. Written so an LLM (ChatGPT) understands the domain. In Spanish.
- All parameters with `description` in Spanish and `example` values using real Montevideo data:
  - calle1: "Bv España", calle2: "Libertad"
  - parada_id: a real parada ID from the data
  - linea: "181"
- Response schemas matching the actual tool output types
- `servers`: `[{ url: "http://localhost:3000", description: "Local" }]` with placeholder for production

### 4. Serve Swagger UI

- Mount Swagger UI at `GET /api/docs` using `@hono/swagger-ui`
- Points to the OpenAPI spec

### 5. Create `src/api/index.ts`

Entry point for REST mode:
```typescript
import { serve } from '@hono/node-server'
// ...
const port = parseInt(process.env.PORT || '3000')
serve({ fetch: app.fetch, port })
console.log(`STM API running on http://localhost:${port}`)
console.log(`Docs: http://localhost:${port}/api/docs`)
```

### 6. Update `tsup.config.ts`

Add second entry point:
```typescript
entry: ['src/index.ts', 'src/api/index.ts']
```

### 7. Update `package.json`

Add scripts:
```json
{
  "start:api": "node dist/api/index.js",
  "dev:api": "tsx watch src/api/index.ts"
}
```

### 8. Create `Dockerfile`

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
USER node
CMD ["node", "dist/api/index.js"]
```

### 9. Create `docker-compose.yml`

```yaml
services:
  stm-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
      - NODE_ENV=development
      - CACHE_TTL_SCHEDULES=3600
      - CACHE_TTL_STOPS=86400
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

### 10. Create `docs/chatgpt-gpt-setup.md`

Brief guide (in Spanish) on how to create a ChatGPT GPT using the OpenAPI spec:
- Go to chat.openai.com → Create a GPT
- Paste the OpenAPI spec in Actions
- Set the server URL to where the API is deployed
- Suggested GPT instructions: "Sos un asistente de transporte público de Montevideo..."

### 11. Create `docs/gemini-adk-setup.md`

Brief guide on using the REST API with Gemini via ADK or direct function calling:
- The same OpenAPI spec works
- Example curl commands for each endpoint

## Acceptance Criteria

```bash
# Build includes API entry point
npm run build
test -f dist/api/index.js

# OpenAPI spec is valid YAML
node -e "const y = require('yaml'); const fs = require('fs'); y.parse(fs.readFileSync('dist/openapi.yaml','utf8')); console.log('valid')" || \
node -e "
  import('file://' + process.cwd() + '/dist/api/index.js')
    .then(() => console.log('API module loads'))
    .catch(e => { console.error(e); process.exit(1) })
"

# Dockerfile builds
docker build -t stm-api-test . 2>/dev/null && echo "Docker OK" || echo "Docker build failed (OK if Docker not available)"

# Docs exist
test -f docs/chatgpt-gpt-setup.md && echo "ChatGPT guide exists"
test -f docs/gemini-adk-setup.md && echo "Gemini guide exists"

# All existing tests still pass
npm run test
npm run lint
```

## On Completion

1. Mark LOOP-11 as done in PROGRESS.md
2. Git commit: `feat: REST API wrapper, OpenAPI spec, Docker packaging (LOOP-11)`
