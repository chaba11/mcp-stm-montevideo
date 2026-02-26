# LOOP-10: Packaging + README + npm Prep

## Task

Prepare the project for npm publication and create comprehensive documentation.

## Steps

1. Update `package.json`:
   - Verify `name`: "mcp-stm-montevideo"
   - Set `version`: "0.1.0"
   - Add `description` (bilingual)
   - Add `keywords`: ["mcp", "uruguay", "montevideo", "stm", "transporte", "bus", "omnibus", "open-data"]
   - Add `repository`, `author`, `license` (MIT)
   - Verify `bin` points to `dist/index.js`
   - Add `files`: ["dist", "README.md", "LICENSE"]
   - Add `engines`: { "node": ">=20" }
   - Verify `type`: "module"

2. Create `LICENSE` (MIT)

3. Create `README.md` (bilingual ES/EN):
   - Project description with context about STM Montevideo
   - Quick install: `npx mcp-stm-montevideo`
   - Configuration for Claude Desktop:
     ```json
     {
       "mcpServers": {
         "stm-montevideo": {
           "command": "npx",
           "args": ["-y", "mcp-stm-montevideo"]
         }
       }
     }
     ```
   - Configuration for Cursor
   - Configuration for Claude Code (add to .mcp.json)
   - Available tools table with descriptions
   - Example conversations showing each tool in action:
     - "¿Cuándo pasa el próximo 181 por Bv España y Libertad?"
     - "¿Qué líneas pasan por Tres Cruces?"
     - "¿Cómo llego de Ciudad Vieja a Pocitos en bondi?"
   - Data sources attribution (Intendencia de Montevideo, CKAN)
   - Contributing section
   - License

4. Verify build output:
   - `dist/index.js` has shebang (`#!/usr/bin/env node`)
   - `dist/index.js` is executable
   - Dry run: `npm pack --dry-run` lists only expected files

5. Create `.npmignore` if needed (tests, docs, src, loops, etc.)

6. Create `.github/workflows/ci.yml` (basic):
   - Run on push to main and PRs
   - Node 20
   - `npm ci && npm run build && npm run test && npm run lint`

## Acceptance Criteria

```bash
npm run build
npm run test
npm run lint

# Package is valid
npm pack --dry-run 2>&1 | grep "mcp-stm-montevideo"

# README exists and has content
test -s README.md
grep -q "Claude Desktop" README.md
grep -q "buscar_parada" README.md

# LICENSE exists
test -s LICENSE

# Binary works
chmod +x dist/index.js
```

## On Completion

1. Mark LOOP-10 as done in PROGRESS.md
2. Git commit: `chore: packaging and documentation for npm (LOOP-10)`
3. Git tag: `v0.1.0`
