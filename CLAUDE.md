# MCP STM Montevideo

## Qué es este proyecto

Un MCP server en TypeScript que expone datos del Sistema de Transporte Metropolitano (STM) de Montevideo, Uruguay. Permite que LLMs respondan preguntas como "¿cuándo pasa el próximo 181 por Bv España y Libertad?"

## Stack

- Runtime: Node.js 20+ con TypeScript
- MCP SDK: `@modelcontextprotocol/sdk`
- Build: `tsup`
- Test: `vitest`
- Geo: `geolib`
- Package name: `mcp-stm-montevideo`

## Fuentes de datos

- CKAN Montevideo: `https://ckan.montevideo.gub.uy/api/3/action/`
- Dataset horarios por parada: `horarios-de-omnibus-urbanos-por-parada-stm`
- Dataset paradas: buscar en CKAN el que tenga ubicación de paradas con coordenadas
- Dataset recorridos: buscar en CKAN
- Las coordenadas pueden estar en EPSG:32721 (UTM 21S) — convertir a WGS84
- Timezone: America/Montevideo para todos los cálculos

## Reglas de desarrollo

- Todo el código en `src/`
- Tests en `tests/` con vitest
- Nunca hardcodear URLs de recursos CKAN (los resource_id cambian). Usar `package_show` para resolver dinámicamente.
- Cache en memoria con TTL: 1h para horarios, 24h para paradas estáticas
- Manejo de errores robusto: si CKAN no responde, devolver mensaje claro al usuario
- Código y comments en inglés, README bilingüe (es/en)
- Cada tool del MCP debe tener inputSchema completo con descriptions en español

## Cómo verificar

```bash
npm run build && npm run test && npm run lint
```

## Filosofía de testing

- Cada módulo feature (LOOP-XX) va seguido de un loop de tests (LOOP-XXB)
- Los test loops buscan edge cases activamente: datos vacíos, encoding, timezone, errores de red, tipos incorrectos
- Si un test descubre un bug → ARREGLAR el código en el mismo loop, no skipear el test
- Cada bug arreglado por un test → agregar un test de regresión al unit test correspondiente
- Target: 120+ tests al final del proyecto
- Tests de performance para routing: < 2s con red completa, < 5s con 500 paradas

## Estado actual del proyecto

Revisar `PROGRESS.md` para saber qué loops se completaron.
