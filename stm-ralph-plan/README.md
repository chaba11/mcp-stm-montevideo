# Ralph Loop Plan — MCP STM Montevideo

## Qué es esto

Un plan para construir `mcp-stm-montevideo` de forma 100% autónoma usando Claude Code con ralph loops. Cada loop es una tarea atómica con criterios de aceptación verificables.

## Setup inicial

```bash
# 1. Crear el directorio del proyecto
mkdir mcp-stm-montevideo && cd mcp-stm-montevideo

# 2. Copiar los archivos del plan al proyecto
cp /ruta/a/este/plan/CLAUDE.md .
cp /ruta/a/este/plan/PROGRESS.md .
cp -r /ruta/a/este/plan/loops/ .
cp /ruta/a/este/plan/run-loops.sh .
chmod +x run-loops.sh

# 3. Git init
git init
```

## Opción A: Full auto (correr todo de una)

```bash
./run-loops.sh
```

Esto corre los 11 loops en secuencia. Si uno falla, reintenta hasta 3 veces. Si sigue fallando, para y te dice cuál arreglar.

Para retomar desde un loop específico:

```bash
./run-loops.sh 5  # arranca desde LOOP-05
```

## Opción B: Un loop a la vez (recomendado la primera vez)

Más control. Correr cada loop manualmente:

```bash
# Correr un loop específico
cat loops/LOOP-00.md | claude --dangerously-skip-permissions

# Verificar que pasó
grep "LOOP-00" PROGRESS.md

# Siguiente
cat loops/LOOP-01.md | claude --dangerously-skip-permissions
```

## Opción C: Con el Ralph Wiggum plugin de Claude Code

Si tenés el plugin instalado:

```bash
claude

# Dentro de Claude Code:
> Read CLAUDE.md and PROGRESS.md, then execute the next incomplete loop from the loops/ directory. 
> Follow the task steps exactly, run the acceptance criteria, and mark it done in PROGRESS.md.
> When complete, output: <promise>COMPLETE</promise>
```

## Los 16 loops

| Loop | Qué hace | Tests |
|------|----------|-------|
| LOOP-00 | Scaffolding del proyecto TypeScript + MCP SDK | 1 smoke |
| LOOP-01 | Explorar datasets del CKAN de Montevideo | — |
| LOOP-02 | Cliente CKAN + sistema de cache | — |
| **LOOP-02B** | **Tests cache & CKAN client: edge cases, encoding, errors** | **20+** |
| LOOP-03 | Utilidades geográficas (distancia, geocoding) | — |
| **LOOP-03B** | **Tests geo: coords, diacríticos, abbreviations, ambiguity** | **25+** |
| LOOP-04 | Tool `buscar_parada` | — |
| LOOP-05 | Tool `proximos_buses` (feature estrella) | — |
| **LOOP-05B** | **Tests tools: timezone, midnight rollover, schedule edge cases** | **30+** |
| LOOP-06 | Tool `recorrido_linea` | — |
| LOOP-07 | Tool `ubicacion_bus` (GPS tiempo real) | — |
| LOOP-08 | Tool `como_llegar` (routing con transbordos) | — |
| **LOOP-08B** | **Tests routing: transfers, circular lines, perf benchmarks** | **50+ cumul** |
| LOOP-09 | Tests de integración con datos reales | live data |
| **LOOP-09B** | **Tests MCP protocol, e2e scenarios, error resilience** | **80+ cumul** |
| LOOP-10 | Packaging npm + README + CI | final |

**Target final: 120+ tests** cubriendo unit, integration, e2e, protocol, y performance.

**Total estimado: ~5-6 horas de tokens de Claude** (algo más que sin tests, pero con mucha más confianza).

## Principios ralph aplicados

1. **Un task por loop**: Cada loop hace UNA cosa. No se mezclan concerns.
2. **Contexto fresco**: Cada loop arranca leyendo CLAUDE.md y PROGRESS.md. No arrastra contexto viejo.
3. **Verificación automática**: Cada loop tiene `Acceptance Criteria` con comandos bash que verifican el resultado.
4. **Falla → reintenta**: Si no pasa los criterios, el runner reintenta con contexto limpio.
5. **Progreso persistente**: PROGRESS.md + git commits aseguran que el trabajo no se pierde entre loops.
6. **Minimal allocation**: CLAUDE.md es corto a propósito. Los detalles están en el loop task y en los archivos del proyecto (que Claude Code lee del filesystem).
7. **Tests como gate**: Cada módulo feature va seguido de un loop de tests (B-loops). Los tests buscan edge cases y si encuentran bugs, los arreglan. No se avanza si los tests no pasan.
8. **Bug = regresión**: Todo bug encontrado por un test genera un fix + un test de regresión permanente.

## Después de completar

```bash
# Verificar que todo funciona
npm run build && npm run test && npm run lint

# Test manual del MCP server
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js

# Publicar a npm
npm publish

# Probar con Claude Desktop
# Agregar a ~/Library/Application Support/Claude/claude_desktop_config.json:
# {
#   "mcpServers": {
#     "stm-montevideo": {
#       "command": "npx",
#       "args": ["-y", "mcp-stm-montevideo"]
#     }
#   }
# }
```

## Tips

- **LOOP-01 es clave**: Si la exploración de datos no sale bien, todos los loops siguientes van a tener problemas. Revisá `docs/data-spec.md` antes de seguir.
- **LOOP-07 puede quedar stub**: La API de GPS en tiempo real de la IM puede no ser pública. No te trabes ahí.
- **LOOP-09 es donde se rompe todo**: Los integration tests con datos reales siempre descubren edge cases. Está bien que este loop tarde más.
- **Costo estimado**: ~$15-30 USD en tokens de Claude (Sonnet) para los 16 loops completos. Los B-loops (tests) gastan más tokens que los feature loops porque generan más código.
