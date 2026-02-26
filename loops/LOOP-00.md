# LOOP-00: Project Setup

## Task

Scaffold the `mcp-stm-montevideo` TypeScript project from scratch.

## Steps

1. Run `npm init -y` and set package name to `mcp-stm-montevideo`
2. Install dependencies:
   - `@modelcontextprotocol/sdk`
   - `geolib`
   - `csv-parse`
3. Install dev dependencies:
   - `typescript`
   - `tsup`
   - `vitest`
   - `eslint`
   - `@typescript-eslint/eslint-plugin`
   - `@typescript-eslint/parser`
   - `prettier`
4. Create `tsconfig.json` (target ES2022, module NodeNext, strict mode)
5. Create `tsup.config.ts` (entry: src/index.ts, format esm, shebang for bin)
6. Create `vitest.config.ts`
7. Create `.eslintrc.json` and `.prettierrc`
8. Create `src/index.ts` — minimal MCP server that starts and registers zero tools (just proves SDK works)
9. Create `src/server.ts` — server setup with name "stm-montevideo" and version from package.json
10. Add scripts to package.json: `build`, `dev`, `test`, `lint`, `start`
11. Add `bin` field to package.json pointing to `dist/index.js`
12. Create a single test `tests/server.test.ts` that imports the server module and asserts it exists
13. Create `.gitignore` (node_modules, dist, .env)
14. Run `git init` and make initial commit

## Acceptance Criteria

All of these must pass:

```bash
npm run build        # exits 0, dist/index.js exists
npm run test         # exits 0, at least 1 test passes
npm run lint         # exits 0
node dist/index.js --help 2>&1 || true  # doesn't crash immediately
```

## On Completion

1. Mark LOOP-00 as done in PROGRESS.md: `- [x] LOOP-00: Project setup`
2. Git commit with message: `feat: project scaffolding (LOOP-00)`
