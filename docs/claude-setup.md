# Configurar MCP STM Montevideo con Claude

Claude es el cliente principal para este servidor MCP. Esta guía cubre la configuración en Claude Desktop, Claude Code y Cursor.

---

## Claude Desktop

1. Abrí el archivo de configuración:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Agregá la entrada del servidor:

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

3. Reiniciá Claude Desktop completamente (cerrar y volver a abrir).

4. Verificá que aparezca el ícono de herramientas (🔨) en el campo de texto. Hacé clic para confirmar que las 5 herramientas están disponibles.

### Con credenciales GPS (opcional)

Si tenés credenciales de la API GPS del STM, podés agregar variables de entorno para ubicación en tiempo real:

```json
{
  "mcpServers": {
    "stm-montevideo": {
      "command": "npx",
      "args": ["-y", "mcp-stm-montevideo"],
      "env": {
        "STM_CLIENT_ID": "tu-client-id",
        "STM_CLIENT_SECRET": "tu-client-secret"
      }
    }
  }
}
```

---

## Claude Code

### Proyecto local (desarrollo)

El repositorio incluye un archivo `.mcp.json` en la raíz. Cuando abrís el proyecto con Claude Code, el servidor se descubre automáticamente.

Para que funcione, asegurate de tener el build compilado:

```bash
npm install && npm run build
```

### Instalación global

Para usar el servidor desde cualquier proyecto:

```bash
claude mcp add stm-montevideo -- npx -y mcp-stm-montevideo
```

O agregá manualmente a tu configuración global (`~/.claude.json`):

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

---

## Cursor

Creá el archivo `.cursor/mcp.json` en la raíz de tu proyecto:

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

---

## Prompts de ejemplo

Una vez configurado, probá con estos mensajes:

| Prompt | Herramientas que usa |
|--------|---------------------|
| "¿Cuándo pasa el 181 por Bv España y Libertad?" | `buscar_parada` → `proximos_buses` |
| "¿Qué líneas pasan cerca de Tres Cruces?" | `buscar_parada` (con coordenadas) |
| "¿Cómo llego de Tres Cruces a Ciudad Vieja?" | `como_llegar` |
| "¿Cuáles son las paradas del D10?" | `recorrido_linea` |
| "¿Dónde está el 183 ahora?" | `ubicacion_bus` (requiere credenciales GPS) |

---

## Troubleshooting

### El servidor no arranca

- **Node.js 20+** es requerido. Verificá con `node --version`.
- Si usás `npx`, puede tardar unos segundos la primera vez mientras se descarga el paquete. Las siguientes ejecuciones usan el cache de npm.
- Probá ejecutar manualmente: `npx -y mcp-stm-montevideo`. Deberías ver que el proceso queda corriendo (sin output — es normal, usa stdio).

### "Tool not found" o no aparecen herramientas

- En Claude Desktop: reiniciá completamente la aplicación después de editar el config.
- Verificá que el JSON sea válido (un error de sintaxis hace que se ignore todo el archivo).
- Revisá los logs de Claude Desktop:
  - **macOS**: `~/Library/Logs/Claude/mcp*.log`
  - **Windows**: `%APPDATA%\Claude\logs\mcp*.log`

### Errores de CKAN / datos no disponibles

- El servidor necesita acceso a internet para consultar `ckan.montevideo.gub.uy`.
- Si CKAN está caído, el servidor devuelve un mensaje descriptivo en vez de un error técnico.
- Los datos se cachean en memoria (1h horarios, 24h paradas). Un reinicio del servidor limpia el cache.

### Cache de npx desactualizado

Si instalaste una versión anterior y querés forzar la última:

```bash
npx -y mcp-stm-montevideo@latest
```

O limpiá el cache:

```bash
npm cache clean --force
```
