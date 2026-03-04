import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Cache } from "./cache.js";
import { parseDbf } from "./dbf-parser.js";
import { readDiskCache, writeDiskCache } from "./disk-cache.js";
import { withTimeout } from "./fetch-with-timeout.js";
import { utm21SToWgs84 } from "./utm-converter.js";
import type { Parada } from "../types/parada.js";
import type { HorarioRow } from "../types/horario.js";
import type { LineaVariante } from "../types/linea.js";

const CKAN_BASE = "https://ckan.montevideo.gub.uy/api/3/action";

const TTL_24H = 24 * 60 * 60 * 1000;
const DISK_TTL_6M = 180 * 24 * 60 * 60 * 1000; // 6 months — CKAN dataset last updated 2023

// Timeouts
const METADATA_TIMEOUT_MS = 15_000; // 15s for package_show
const ZIP_GENERATION_TIMEOUT_MS = 90_000; // 90s for generar_zip2 (generates on demand)
const DOWNLOAD_TIMEOUT_MS = 60_000; // 60s for ZIP downloads

const HORARIOS_PACKAGE = "horarios-de-omnibus-urbanos-por-parada-stm";
const PARADAS_PACKAGE =
  "transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus";
const LINEAS_PACKAGE = "lineas-de-omnibus-origen-y-destino";

// Patterns to match the correct resource URL within each CKAN package
const HORARIOS_RESOURCE_PATTERN = "uptu_pasada_variante";
const PARADAS_RESOURCE_PATTERN = "v_uptu_paradas";
const LINEAS_RESOURCE_PATTERN = "v_uptu_lsv_destinos";

export type FetchFn = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> }>;

export interface CkanClientOptions {
  cache?: Cache;
  fetchFn?: FetchFn;
  /** Skip loading from local JSON files (used in tests with mock fetch) */
  skipLocalFiles?: boolean;
  /** Skip loading from disk cache (used in tests) */
  skipDiskCache?: boolean;
}

interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

/** Find a pre-fetched STM JSON file, checking dev and dist locations. */
function findStmDataPath(filename: string): string | null {
  const dir = dirname(fileURLToPath(import.meta.url));
  // Dev (vitest/tsx): src/data/ckan-client.ts → data at src/data/
  const devPath = join(dir, filename);
  if (existsSync(devPath)) return devPath;
  // Bundle (dist/index.js): data at dist/data/
  const distPath = join(dir, "data", filename);
  if (existsSync(distPath)) return distPath;
  return null;
}

/** Load a pre-fetched JSON file, returning null if not found. */
function loadLocalJson<T>(filename: string): T | null {
  const path = findStmDataPath(filename);
  if (!path) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as T;
}

/** Convert compact tuple format to HorarioRow objects. Handles both tuple and object formats. */
function hydrateHorarioTuples(data: unknown[]): HorarioRow[] {
  if (data.length === 0) return [];
  if (Array.isArray(data[0])) {
    return (data as unknown[][]).map((t) => ({
      tipo_dia: t[0] as number,
      cod_variante: t[1] as number,
      frecuencia: t[2] as number,
      cod_ubic_parada: t[3] as number,
      ordinal: t[4] as number,
      hora: t[5] as number,
      dia_anterior: t[6] as string,
    } as HorarioRow));
  }
  return data as unknown as HorarioRow[];
}

/** Convert HorarioRow objects to compact tuple format for disk storage. */
function compactHorarioRows(rows: HorarioRow[]): unknown[][] {
  return rows.map((r) => [
    r.tipo_dia, r.cod_variante, r.frecuencia,
    r.cod_ubic_parada, r.ordinal, r.hora, r.dia_anterior,
  ]);
}

export class CkanClient {
  private cache: Cache;
  private fetchFn: FetchFn;
  private skipLocalFiles: boolean;
  private skipDiskCache: boolean;
  /** In-flight fetch deduplication: if a dataset is already being fetched, reuse the same Promise */
  private inflight = new Map<string, Promise<unknown>>();

  constructor(options: CkanClientOptions = {}) {
    this.cache = options.cache ?? new Cache();
    this.fetchFn = options.fetchFn ?? (fetch as FetchFn);
    this.skipLocalFiles = options.skipLocalFiles ?? false;
    this.skipDiskCache = options.skipDiskCache ?? this.skipLocalFiles;
  }

  /**
   * Get all resources for a CKAN package by ID.
   * Never hardcodes resource IDs — always resolves dynamically.
   */
  async getPackageResources(packageId: string): Promise<CkanResource[]> {
    const cacheKey = `pkg:${packageId}`;
    const cached = this.cache.get<CkanResource[]>(cacheKey);
    if (cached) return cached;

    const url = `${CKAN_BASE}/package_show?id=${encodeURIComponent(packageId)}`;
    const res = await withTimeout(this.fetchFn(url), METADATA_TIMEOUT_MS, url);

    if (!res.ok) {
      throw new Error(`CKAN package_show failed for "${packageId}": HTTP ${res.status}`);
    }

    const data = JSON.parse(await res.text()) as {
      success: boolean;
      result: { resources: CkanResource[] };
    };

    if (!data.success) {
      throw new Error(`CKAN returned success=false for package "${packageId}"`);
    }

    const resources = data.result.resources;
    this.cache.set(cacheKey, resources, TTL_24H);
    return resources;
  }

  /**
   * Download a binary file and return as Buffer.
   */
  private async downloadBinary(url: string): Promise<Buffer> {
    const res = await withTimeout(this.fetchFn(url), DOWNLOAD_TIMEOUT_MS, url);
    if (!res.ok) {
      throw new Error(`Download failed for ${url}: HTTP ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  }

  /**
   * Download a ZIP and extract a file by name pattern.
   */
  private async downloadAndExtract(url: string, filePattern: RegExp): Promise<Buffer> {
    const zipBuffer = await this.downloadBinary(url);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    const entry = entries.find((e) => filePattern.test(e.entryName));
    if (!entry) {
      throw new Error(
        `No file matching ${filePattern} found in ZIP from ${url}. Files: ${entries.map((e) => e.entryName).join(", ")}`
      );
    }
    return entry.getData();
  }

  /**
   * Resolve the actual download URL for a CKAN resource.
   *
   * Some resources point directly to .zip files (e.g. datos-abiertos.montevideo.gub.uy).
   * Others use generar_zip2.php which generates the ZIP on demand and returns HTML
   * with a <form action='/sit/tmp/X.zip'> redirect. The ZIP in /sit/tmp/ is ephemeral
   * and may be cleaned up by the server, causing 404s if hardcoded.
   */
  private async resolveDownloadUrl(packageId: string, resourcePattern: string): Promise<string> {
    // Check if we have a cached resolved URL (avoids re-triggering generar_zip2)
    const resolvedCacheKey = `resolved:${packageId}:${resourcePattern}`;
    const cachedUrl = this.cache.get<string>(resolvedCacheKey);
    if (cachedUrl) return cachedUrl;

    const resources = await this.getPackageResources(packageId);

    // Prefer direct .zip URLs over generar_zip2 (avoids on-demand ZIP generation)
    const directResource = resources.find(
      (r) => r.url.includes(resourcePattern) && r.url.endsWith(".zip") && !r.url.includes("generar_zip2"),
    );
    if (directResource) {
      this.cache.set(resolvedCacheKey, directResource.url, TTL_24H);
      return directResource.url;
    }

    const resource = resources.find(
      (r) => r.url.includes(resourcePattern) && (r.url.endsWith(".zip") || r.url.includes("generar_zip2")),
    );
    if (!resource) {
      throw new Error(
        `No resource matching "${resourcePattern}" found in package "${packageId}". ` +
          `Available: ${resources.map((r) => r.url).join(", ")}`,
      );
    }

    const url = resource.url;

    // Direct download URLs can be used as-is
    if (!url.includes("generar_zip2")) {
      this.cache.set(resolvedCacheKey, url, TTL_24H);
      return url;
    }

    // generar_zip2.php generates a ZIP on demand — use longer timeout
    const res = await withTimeout(this.fetchFn(url), ZIP_GENERATION_TIMEOUT_MS, url);
    if (!res.ok) {
      throw new Error(`Failed to trigger ZIP generation at ${url}: HTTP ${res.status}`);
    }

    const html = await res.text();
    // Real HTML: action = '/sit/tmp/X.zip' (spaces around =, quotes optional)
    const match = html.match(/action\s*=\s*['"]?([^\s'"<>]+)['"]?/);
    if (!match) {
      throw new Error(
        `Could not parse download URL from generar_zip2 response at ${url}. ` +
          `Expected HTML with <form action='...'>`,
      );
    }

    const resolvedUrl = new URL(match[1], url).href;
    // Cache the resolved URL for 1h (the /sit/tmp/ ZIPs are ephemeral but last a while)
    this.cache.set(resolvedCacheKey, resolvedUrl, 60 * 60 * 1000);
    return resolvedUrl;
  }

  /**
   * Returns all stops with WGS84 coordinates.
   * Cached for 24 hours.
   */
  async getParadas(): Promise<Parada[]> {
    const cacheKey = "paradas";
    const cached = this.cache.get<Parada[]>(cacheKey);
    if (cached) return cached;

    if (!this.skipLocalFiles) {
      const local = loadLocalJson<Parada[]>("stm-paradas.json");
      if (local) {
        this.cache.set(cacheKey, local, TTL_24H);
        return local;
      }
    }

    if (!this.skipDiskCache) {
      const diskData = readDiskCache<Parada[]>("stm-paradas.json", DISK_TTL_6M);
      if (diskData) {
        this.cache.set(cacheKey, diskData, TTL_24H);
        return diskData;
      }
    }

    return this.dedupFetch(cacheKey, async () => {
      const downloadUrl = await this.resolveDownloadUrl(PARADAS_PACKAGE, PARADAS_RESOURCE_PATTERN);
      const dbfBuffer = await this.downloadAndExtract(downloadUrl, /\.dbf$/i);
      const records = parseDbf(dbfBuffer);

      const paradas: Parada[] = records.map((r) => {
        const coords = utm21SToWgs84(r["X"] as number, r["Y"] as number);
        return {
          id: r["COD_UBIC_P"] as number,
          linea: (r["DESC_LINEA"] as string).trim(),
          variante: r["COD_VARIAN"] as number,
          ordinal: r["ORDINAL"] as number,
          calle: (r["CALLE"] as string).trim(),
          esquina: (r["ESQUINA"] as string).trim(),
          lat: coords.lat,
          lng: coords.lng,
        };
      });

      this.cache.set(cacheKey, paradas, TTL_24H);
      writeDiskCache("stm-paradas.json", paradas);
      return paradas;
    });
  }

  /**
   * Returns scheduled bus times by stop.
   * Cached for 1 hour.
   */
  async getHorarios(): Promise<HorarioRow[]> {
    const cacheKey = "horarios";
    const cached = this.cache.get<HorarioRow[]>(cacheKey);
    if (cached) return cached;

    if (!this.skipLocalFiles) {
      const local = loadLocalJson<unknown[]>("stm-horarios.json");
      if (local) {
        const rows = hydrateHorarioTuples(local);
        this.cache.set(cacheKey, rows, TTL_24H);
        return rows;
      }
    }

    if (!this.skipDiskCache) {
      const diskData = readDiskCache<unknown[]>("stm-horarios.json", DISK_TTL_6M);
      if (diskData) {
        const rows = hydrateHorarioTuples(diskData);
        this.cache.set(cacheKey, rows, TTL_24H);
        return rows;
      }
    }

    return this.dedupFetch(cacheKey, async () => {
      const downloadUrl = await this.resolveDownloadUrl(HORARIOS_PACKAGE, HORARIOS_RESOURCE_PATTERN);
      const csvBuffer = await this.downloadAndExtract(downloadUrl, /\.csv$/i);
      const csvText = csvBuffer.toString("utf-8");

      const rows = parse(csvText, {
        delimiter: ";",
        columns: true,
        skip_empty_lines: true,
        cast: (value, context) => {
          if (context.column === "dia_anterior") return value;
          const num = parseInt(value, 10);
          return isNaN(num) ? value : num;
        },
      }) as HorarioRow[];

      this.cache.set(cacheKey, rows, TTL_24H);
      writeDiskCache("stm-horarios.json", compactHorarioRows(rows));
      return rows;
    });
  }

  /**
   * Returns all line variants with origin/destination info.
   * Cached for 24 hours.
   */
  async getLineas(): Promise<LineaVariante[]> {
    const cacheKey = "lineas";
    const cached = this.cache.get<LineaVariante[]>(cacheKey);
    if (cached) return cached;

    if (!this.skipLocalFiles) {
      const local = loadLocalJson<LineaVariante[]>("stm-lineas.json");
      if (local) {
        this.cache.set(cacheKey, local, TTL_24H);
        return local;
      }
    }

    if (!this.skipDiskCache) {
      const diskData = readDiskCache<LineaVariante[]>("stm-lineas.json", DISK_TTL_6M);
      if (diskData) {
        this.cache.set(cacheKey, diskData, TTL_24H);
        return diskData;
      }
    }

    return this.dedupFetch(cacheKey, async () => {
      const downloadUrl = await this.resolveDownloadUrl(LINEAS_PACKAGE, LINEAS_RESOURCE_PATTERN);
      const dbfBuffer = await this.downloadAndExtract(downloadUrl, /\.dbf$/i);
      const records = parseDbf(dbfBuffer);

      const lineas: LineaVariante[] = records.map((r) => ({
        gid: r["GID"] as number,
        codLinea: r["COD_LINEA"] as number,
        descLinea: (r["DESC_LINEA"] as string).trim(),
        ordinalSublinea: r["ORDINAL_SU"] as number,
        codSublinea: r["COD_SUBLIN"] as number,
        descSublinea: (r["DESC_SUBLI"] as string).trim(),
        codVariante: r["COD_VARIAN"] as number,
        descVariante: (r["DESC_VARIA"] as string).trim(),
        codOrigen: r["COD_ORIGEN"] as number,
        descOrigen: (r["DESC_ORIGE"] as string).trim(),
        codDestino: r["COD_DESTIN"] as number,
        descDestino: (r["DESC_DESTI"] as string).trim(),
      }));

      this.cache.set(cacheKey, lineas, TTL_24H);
      writeDiskCache("stm-lineas.json", lineas);
      return lineas;
    });
  }

  /**
   * Deduplicate concurrent fetches for the same key.
   * If a fetch is already in-flight, reuse that Promise instead of starting a new one.
   * This prevents the warmup + first tool call from hitting CKAN twice.
   */
  private async dedupFetch<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  /** Invalidate all caches (useful for testing) */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance for production use
export const ckanClient = new CkanClient();
