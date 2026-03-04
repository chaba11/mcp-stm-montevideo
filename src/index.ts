import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const { server, client } = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Non-blocking warmup: preload all STM datasets so first tool call is fast
  console.error("Warming up STM data...");
  Promise.all([
    client.getParadas(),
    client.getHorarios(),
    client.getLineas(),
  ])
    .then(([p, h, l]) =>
      console.error(`Warmup complete: ${p.length} paradas, ${h.length} horarios, ${l.length} lineas`),
    )
    .catch((err) =>
      console.error("Warmup failed (will retry on first request):", err instanceof Error ? err.message : err),
    );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
