# Deployment

## Infrastructure

- **Platform**: [Coolify](https://coolify.io/) (self-hosted)
- **Proxy**: Traefik (managed by Coolify)
- **DNS**: Cloudflare

## Application Config

- **Name**: `stm-api`
- **Source**: Public git — `https://github.com/chaba11/mcp-stm-montevideo.git` (branch: `main`)
- **Build pack**: Dockerfile (multi-stage, `node:20-alpine`)
- **Port**: `3000`
- **Domain**: `https://stm.paltickets.uy`
- **Health check**: `GET /api/health` (port 3000, every 30s)

## Environment Variables

| Variable            | Value           | Description                        |
|---------------------|-----------------|------------------------------------|
| `PORT`              | `3000`          | HTTP server port                   |
| `NODE_ENV`          | `production`    | Runtime environment                |
| `STM_CLIENT_ID`     | *(secret)*      | STM GPS real-time API credential   |
| `STM_CLIENT_SECRET` | *(secret)*      | STM GPS real-time API credential   |

## Endpoints

| Endpoint          | Description          |
|-------------------|----------------------|
| `/api/health`     | Health check         |
| `/api/docs`       | Swagger UI (OpenAPI) |

## Dockerfile Notes

- Uses `npm ci --include=dev` in the builder stage because Coolify injects env vars as build-time ARGs, and `NODE_ENV=production` would skip devDependencies (tsup, typescript) needed for compilation.
- Runtime stage copies only `dist/`, `node_modules/`, and `package.json` — no source code in production image.
- Runs as non-root `node` user.

## Redeploying

Push to `main` and trigger a deploy from Coolify.
