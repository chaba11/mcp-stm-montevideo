import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { Cache } from "./cache.js";
import { parseDbf } from "./dbf-parser.js";
import { utm21SToWgs84 } from "./utm-converter.js";
import type { Parada } from "../types/parada.js";
import type { HorarioRow } from "../types/horario.js";
import type { LineaVariante } from "../types/linea.js";

const CKAN_BASE = "https://ckan.montevideo.gub.uy/api/3/action";

const TTL_24H = 24 * 60 * 60 * 1000;

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
}

interface CkanResource {
  id: string;
  name: string;
  format: string;
  url: string;
}

export class CkanClient {
  private cache: Cache;
  private fetchFn: FetchFn;

  constructor(options: CkanClientOptions = {}) {
    this.cache = options.cache ?? new Cache();
    this.fetchFn = options.fetchFn ?? (fetch as FetchFn);
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
    const res = await this.fetchFn(url);

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
    const res = await this.fetchFn(url);
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
    const resources = await this.getPackageResources(packageId);
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
      return url;
    }

    // generar_zip2.php generates a ZIP on demand and returns HTML with a form redirect
    const res = await this.fetchFn(url);
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

    return new URL(match[1], url).href;
  }

  /**
   * Returns all stops with WGS84 coordinates.
   * Cached for 24 hours.
   */
  async getParadas(): Promise<Parada[]> {
    const cacheKey = "paradas";
    const cached = this.cache.get<Parada[]>(cacheKey);
    if (cached) return cached;

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
    return paradas;
  }

  /**
   * Returns scheduled bus times by stop.
   * Cached for 1 hour.
   */
  async getHorarios(): Promise<HorarioRow[]> {
    const cacheKey = "horarios";
    const cached = this.cache.get<HorarioRow[]>(cacheKey);
    if (cached) return cached;

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
    return rows;
  }

  /**
   * Returns all line variants with origin/destination info.
   * Cached for 24 hours.
   */
  async getLineas(): Promise<LineaVariante[]> {
    const cacheKey = "lineas";
    const cached = this.cache.get<LineaVariante[]>(cacheKey);
    if (cached) return cached;

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
    return lineas;
  }

  /** Invalidate all caches (useful for testing) */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance for production use
export const ckanClient = new CkanClient();
