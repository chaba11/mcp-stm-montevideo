# MCP STM Montevideo

![Node](https://img.shields.io/badge/node.js-20+-green)
![TypeScript](https://img.shields.io/badge/typescript-blue)
![MCP](https://img.shields.io/badge/MCP-server-purple)

MCP server exposing Montevideo public transportation data (STM) as tools for AI assistants.

This project allows AI agents and LLM-based applications to query public transport information such as bus routes, stops, arrivals, and connections in Montevideo through the Model Context Protocol (MCP).

The goal is to make city infrastructure data accessible through conversational interfaces.

---

## Features

- Exposes Montevideo STM transport data as MCP tools
- Supports natural language queries about routes, stops, arrivals, and trip planning
- Designed for AI assistants such as Claude Desktop, Cursor, and other MCP clients
- Includes a REST API layer in addition to MCP
- Built with Node.js and TypeScript
- Integrates public STM datasets into a developer-friendly interface

---

## Example

**User query**

```text
How do I go from Facultad de Ingenieria to Plaza Independencia?
```

**Assistant response**

```text
Take a bus from the stops near Bv. Espana and continue toward Ciudad Vieja.
Get off near Plaza Independencia.
```

---

## Architecture

The server exposes STM transport data through MCP tools that AI assistants can call while answering user requests.

```text
AI Assistant
     |
     v
MCP Client
     |
     v
MCP STM Montevideo Server
     |
     v
STM Transport Data
```

---

## Installation

Clone the repository:

```bash
git clone https://github.com/chaba11/mcp-stm-montevideo
cd mcp-stm-montevideo
```

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

Run the MCP server:

```bash
npm run start
```

Run the REST API locally:

```bash
npm run dev:api
```

---

## Example MCP Tools

Example tools exposed by the server:

- `buscar_parada`
- `proximos_buses`
- `recorrido_linea`
- `ubicacion_bus`
- `como_llegar`

These tools allow AI assistants to retrieve structured transportation data and generate natural language responses for users.

---

## Use Cases

- AI assistants answering public transport questions
- Conversational city navigation tools
- Smart travel assistants
- Urban mobility integrations for LLM applications
- MCP and API-based transit experiences

---

## Tech Stack

- Node.js
- TypeScript
- MCP (Model Context Protocol)
- Hono
- OpenAPI / Swagger
- Public STM transport data

---

## Why this project

As AI assistants become more common, exposing real-world systems through MCP servers enables natural language interaction with infrastructure and public services.

This project explores how public transportation systems can integrate with the AI tooling ecosystem in a practical, developer-friendly way.

---

## Links

- GitHub: [github.com/chaba11/mcp-stm-montevideo](https://github.com/chaba11/mcp-stm-montevideo)
- Live API: [stm.paltickets.uy](https://stm.paltickets.uy)
- API Docs: [stm.paltickets.uy/api/docs](https://stm.paltickets.uy/api/docs)

---

## Author

**Santiago Chabert**  
Montevideo, Uruguay

Full-stack developer focused on Node.js, TypeScript, cloud infrastructure, and AI tooling.
