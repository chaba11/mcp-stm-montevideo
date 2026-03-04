/**
 * Pre-fetch STM data from CKAN and save as static JSON files.
 * Run with: npm run build-stm-data
 *
 * This avoids runtime dependency on CKAN (which can timeout with 524 errors).
 * The JSON files are loaded by CkanClient at runtime if present.
 */
import { writeFileSync, mkdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CkanClient } from "../src/data/ckan-client.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dir, "../src/data");

function fileSizeKB(path: string): number {
  return Math.round(statSync(path).size / 1024);
}

async function main() {
  console.log("Fetching STM data from CKAN...\n");

  const client = new CkanClient();

  console.log("1/3 Fetching paradas...");
  const paradas = await client.getParadas();
  const paradasPath = join(DATA_DIR, "stm-paradas.json");
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(paradasPath, JSON.stringify(paradas), "utf-8");
  console.log(`  → ${paradas.length} paradas (${fileSizeKB(paradasPath)} KB)`);

  // Clear cache so getHorarios/getLineas don't reuse in-memory cache
  // (we want fresh data from CKAN for each dataset)
  client.clearCache();

  console.log("2/3 Fetching horarios...");
  const horarios = await client.getHorarios();
  const horariosPath = join(DATA_DIR, "stm-horarios.json");
  // Store as compact tuple format: [tipo_dia, cod_variante, frecuencia, cod_ubic_parada, ordinal, hora, dia_anterior]
  // This reduces file size ~75% (no repeated key names for 2M+ rows)
  const compactHorarios = horarios.map((h) => [
    h.tipo_dia,
    h.cod_variante,
    h.frecuencia,
    h.cod_ubic_parada,
    h.ordinal,
    h.hora,
    h.dia_anterior,
  ]);
  writeFileSync(horariosPath, JSON.stringify(compactHorarios), "utf-8");
  console.log(`  → ${horarios.length} horarios (${fileSizeKB(horariosPath)} KB)`);

  client.clearCache();

  console.log("3/3 Fetching lineas...");
  const lineas = await client.getLineas();
  const lineasPath = join(DATA_DIR, "stm-lineas.json");
  writeFileSync(lineasPath, JSON.stringify(lineas), "utf-8");
  console.log(`  → ${lineas.length} lineas (${fileSizeKB(lineasPath)} KB)`);

  console.log("\nDone! Run npm run build to include the data in the build.");
}

main().catch((err) => {
  console.error("Error fetching STM data:", err);
  process.exit(1);
});
