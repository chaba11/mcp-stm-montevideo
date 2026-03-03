# Deployment

## Infrastructure

- **Platform**: [Coolify](https://coolify.io/) (self-hosted)
- **Server**: localhost (`167.62.69.63`) — home server
- **Proxy**: Traefik (managed by Coolify)
- **DNS**: Cloudflare — all records are CNAMEs to `chaba.tplinkdns.com` (dynamic DNS)

## Coolify Resources

| Resource        | UUID                             |
|-----------------|----------------------------------|
| Server          | `eckg8o4ckw0kwo48gk4ks4gk`      |
| Project         | `oo0ksw88ws0gwgw848kw4cco`      |
| Environment     | `ic8co4w0g04gccc40owscs8g` (production) |
| Application     | `h0cok0c8wwocgo0gco0coc00`      |

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

## DNS (Cloudflare)

| Type  | Name | Value                  | Proxy   |
|-------|------|------------------------|---------|
| CNAME | stm  | chaba.tplinkdns.com    | Proxied |

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

Push to `main` and trigger a deploy from Coolify, or use the Coolify API:

```bash
# Via Coolify MCP tool
mcp__coolify__deploy(tag_or_uuid: "h0cok0c8wwocgo0gco0coc00")
```
