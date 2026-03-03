/**
 * Fetch Montevideo OSM data from Overpass API and save as static JSON.
 * Run with: npm run build-geo-data
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dir, "../src/data/mvd-geocoder-data.json");

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const MVD_BBOX = "-35.1,-56.6,-34.6,-55.9";

interface OverpassElement {
  type: "node" | "way";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

async function fetchOverpass(query: string): Promise<OverpassResponse> {
  console.log("Fetching from Overpass API...");
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<OverpassResponse>;
}

function normalizeText(text: string): string {
  const ABBREVIATIONS: [RegExp, string][] = [
    [/\bbulevar\b/g, "bv"],
    [/\bavenida\b/g, "av"],
    [/\bgeneral\b/g, "gral"],
    [/\bdoctor\b/g, "dr"],
    [/\bprofesora?\b/g, "prof"],
  ];
  let normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of ABBREVIATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized;
}

async function fetchPOIs() {
  const query = `
[out:json][timeout:120][bbox:${MVD_BBOX}];
(
  node["name"]["amenity"];
  node["name"]["shop"];
  node["name"]["tourism"];
  node["name"]["office"];
  node["name"]["healthcare"];
  node["name"]["leisure"];
  way["name"]["amenity"];
  way["name"]["shop"];
  way["name"]["tourism"];
  way["name"]["office"];
);
out center;
  `.trim();

  const data = await fetchOverpass(query);
  console.log(`  POIs raw elements: ${data.elements.length}`);

  const pois: Array<{ n: string; t: string; la: number; lo: number }> = [];

  for (const el of data.elements) {
    const name = el.tags?.name;
    if (!name) continue;

    const type =
      el.tags?.amenity ??
      el.tags?.shop ??
      el.tags?.tourism ??
      el.tags?.office ??
      el.tags?.healthcare ??
      el.tags?.leisure ??
      "place";

    let lat: number | undefined;
    let lon: number | undefined;

    if (el.type === "node") {
      lat = el.lat;
      lon = el.lon;
    } else if (el.center) {
      lat = el.center.lat;
      lon = el.center.lon;
    }

    if (lat === undefined || lon === undefined) continue;

    pois.push({ n: name, t: type, la: lat, lo: lon });
  }

  console.log(`  POIs processed: ${pois.length}`);
  return pois;
}

async function fetchStreets() {
  const query = `
[out:json][timeout:180][bbox:${MVD_BBOX}];
way["highway"]["name"];
out geom;
  `.trim();

  const data = await fetchOverpass(query);
  console.log(`  Streets raw elements: ${data.elements.length}`);

  // Group nodes by normalized street name
  const streetMap = new Map<string, [number, number][]>();

  for (const el of data.elements) {
    const name = el.tags?.name;
    if (!name || !el.geometry || el.geometry.length < 2) continue;

    const normalized = normalizeText(name);
    if (!normalized) continue;

    const nodes: [number, number][] = el.geometry.map((g) => [
      Math.round(g.lat * 1e6) / 1e6,
      Math.round(g.lon * 1e6) / 1e6,
    ]);

    if (streetMap.has(normalized)) {
      streetMap.get(normalized)!.push(...nodes);
    } else {
      streetMap.set(normalized, nodes);
    }
  }

  const streets = Array.from(streetMap.entries()).map(([n, nodes]) => ({ n, nodes }));
  console.log(`  Streets processed: ${streets.length}`);
  return streets;
}

async function main() {
  console.log("Fetching Montevideo OSM data from Overpass API...");

  const [pois, streets] = await Promise.all([fetchPOIs(), fetchStreets()]);

  const result = {
    generatedAt: new Date().toISOString(),
    pois,
    streets,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(result), "utf8");

  const fileSizeKB = Math.round(JSON.stringify(result).length / 1024);
  console.log(`\nSaved to ${OUTPUT_PATH}`);
  console.log(`  POIs: ${pois.length}`);
  console.log(`  Streets: ${streets.length}`);
  console.log(`  File size: ${fileSizeKB} KB`);
  console.log("\nDone! Run npm run build to include the data in the build.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
