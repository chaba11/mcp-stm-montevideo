import { parse } from 'csv-parse/sync';
import { cache } from './cache.js';
import type { Parada, ParadaRaw } from '../types/parada.js';
import type { Horario, HorarioRaw } from '../types/horario.js';
import type { RecorridoRaw } from '../types/linea.js';
import { utm21sToWgs84 } from '../geo/coordinates.js';

const CKAN_BASE = 'https://ckan.montevideo.gub.uy/api/3/action';

// CKAN Package IDs for STM datasets
const PACKAGE_PARADAS = 'transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus';
const PACKAGE_HORARIOS = 'horarios-de-omnibus-urbanos-por-parada-stm';

// Cache TTLs
const TTL_PARADAS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_HORARIOS = 60 * 60 * 1000; // 1 hour
const TTL_RECORRIDOS = 24 * 60 * 60 * 1000; // 24 hours
const TTL_PACKAGE_SHOW = 60 * 60 * 1000; // 1 hour

// Request timeout in ms
const FETCH_TIMEOUT = 30_000;

interface CkanResource {
  id: string;
  name: string;
  url: string;
  format: string;
}

interface CkanPackage {
  resources: CkanResource[];
}

/**
 * Fetch with timeout support.
 */
async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'mcp-stm-montevideo/0.1.0',
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get resource list for a CKAN package.
 * Results are cached to avoid repeated API calls.
 */
export async function getPackageResources(packageId: string): Promise<CkanResource[]> {
  const cacheKey = `ckan:package:${packageId}`;
  const cached = cache.get<CkanResource[]>(cacheKey);
  if (cached) return cached;

  const url = `${CKAN_BASE}/package_show?id=${encodeURIComponent(packageId)}`;
  let response: Response;
  try {
    response = await fetchWithTimeout(url);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`CKAN request timed out for package: ${packageId}`);
    }
    throw new Error(`Network error fetching CKAN package ${packageId}: ${String(err)}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`CKAN dataset not found: ${packageId}`);
    }
    throw new Error(`CKAN API error ${response.status} for package: ${packageId}`);
  }

  let data: { success: boolean; result: CkanPackage };
  try {
    data = (await response.json()) as { success: boolean; result: CkanPackage };
  } catch {
    throw new Error(`Invalid JSON response from CKAN for package: ${packageId}`);
  }

  if (!data.success || !data.result) {
    throw new Error(`CKAN returned unsuccessful response for package: ${packageId}`);
  }

  const resources = data.result.resources;
  if (!resources || resources.length === 0) {
    throw new Error(`No resources found for CKAN package: ${packageId}`);
  }

  cache.set(cacheKey, resources, TTL_PACKAGE_SHOW);
  return resources;
}

/**
 * Strip UTF-8 BOM from a string if present.
 */
function stripBom(str: string): string {
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str;
}

/**
 * Download and parse a CSV resource URL.
 */
export async function downloadCsv<T>(
  resourceUrl: string,
  parser: (row: Record<string, string>) => T | null
): Promise<T[]> {
  let response: Response;
  try {
    response = await fetchWithTimeout(resourceUrl);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`CSV download timed out: ${resourceUrl}`);
    }
    throw new Error(`Network error downloading CSV from ${resourceUrl}: ${String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} downloading CSV: ${resourceUrl}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  // Detect if server returned HTML (e.g., error page) instead of CSV
  if (contentType.includes('text/html')) {
    throw new Error(`Server returned HTML instead of CSV for: ${resourceUrl}`);
  }

  const rawText = await response.text();
  const text = stripBom(rawText);

  if (!text.trim()) {
    return [];
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(`CSV parse error for ${resourceUrl}: ${String(err)}`);
  }

  const results: T[] = [];
  for (const row of rows) {
    try {
      const parsed = parser(row);
      if (parsed !== null) {
        results.push(parsed);
      }
    } catch {
      // Skip malformed rows silently
    }
  }

  return results;
}

/**
 * Find a resource by name substring (case-insensitive).
 */
function findResource(resources: CkanResource[], namePart: string): CkanResource | undefined {
  return resources.find((r) => r.name.toLowerCase().includes(namePart.toLowerCase()));
}

/**
 * Parse a raw parada row from CSV.
 */
function parseParadaRow(row: Record<string, string>): Parada | null {
  const id = (row['COD_PARADA_STM'] ?? '').trim();
  const nombre = (row['DESC_PARADA_STM'] ?? '').trim();
  const xStr = (row['X'] ?? '').trim();
  const yStr = (row['Y'] ?? '').trim();

  if (!id || !nombre || !xStr || !yStr) return null;

  const x = parseFloat(xStr);
  const y = parseFloat(yStr);

  if (isNaN(x) || isNaN(y)) return null;

  // Check if coordinates look like UTM (large numbers) or already WGS84
  const isUtm = Math.abs(x) > 1000 || Math.abs(y) > 1000;

  let lat: number;
  let lon: number;

  if (isUtm) {
    const wgs84 = utm21sToWgs84(x, y);
    lat = wgs84.lat;
    lon = wgs84.lon;
  } else {
    // Already WGS84: X=lon, Y=lat (some datasets use this convention)
    lon = x;
    lat = y;
  }

  // Validate Montevideo bounding box
  if (lat < -35.5 || lat > -34.0 || lon < -57.0 || lon > -55.0) return null;

  const raw = row as unknown as ParadaRaw;
  return {
    id,
    nombre,
    lat,
    lon,
    empresa: raw.COD_EMPRESA,
  };
}

/**
 * Parse a raw horario row from CSV.
 */
function parseHorarioRow(row: Record<string, string>): Horario | null {
  const paradaId = (row['COD_PARADA_STM'] ?? '').trim();
  const linea = (row['COD_LINEA'] ?? '').trim();
  const descLinea = (row['DESC_LINEA'] ?? '').trim();
  const variante = (row['COD_VARIANTE'] ?? '').trim();
  const descVariante = (row['DESC_VARIANTE'] ?? '').trim();
  const tipoDia = (row['TIPO_DIA'] ?? '').trim() as 'L' | 'S' | 'D';
  const horaStr = (row['HORA'] ?? '').trim();
  const minutoStr = (row['MINUTO'] ?? '').trim();

  if (!paradaId || !linea || !tipoDia || !horaStr || !minutoStr) return null;
  if (!['L', 'S', 'D'].includes(tipoDia)) return null;

  const hora = parseInt(horaStr, 10);
  const minuto = parseInt(minutoStr, 10);

  if (isNaN(hora) || isNaN(minuto)) return null;
  if (hora < 0 || hora > 30) return null; // sanity check
  if (minuto < 0 || minuto > 59) return null;

  return {
    paradaId,
    linea,
    descLinea,
    variante,
    descVariante,
    tipoDia,
    hora,
    minuto,
  };
}

/**
 * Parse a raw recorrido row from CSV.
 */
function parseRecorridoRow(row: Record<string, string>): RecorridoRaw | null {
  const codLinea = (row['COD_LINEA'] ?? '').trim();
  const codParada = (row['COD_PARADA_STM'] ?? '').trim();
  const nroOrdenStr = (row['NRO_ORDEN'] ?? '').trim();

  if (!codLinea || !codParada || !nroOrdenStr) return null;

  const nroOrden = parseInt(nroOrdenStr, 10);
  if (isNaN(nroOrden)) return null;

  return {
    COD_LINEA: codLinea,
    DESC_LINEA: (row['DESC_LINEA'] ?? '').trim(),
    COD_VARIANTE: (row['COD_VARIANTE'] ?? '').trim(),
    DESC_VARIANTE: (row['DESC_VARIANTE'] ?? '').trim(),
    NRO_ORDEN: nroOrden,
    COD_PARADA_STM: codParada,
    COD_EMPRESA: row['COD_EMPRESA'],
    DESC_EMPRESA: row['DESC_EMPRESA'],
  };
}

/**
 * Get all STM bus stops (paradas). Cached for 24 hours.
 */
export async function getParadas(): Promise<Parada[]> {
  const cacheKey = 'stm:paradas';
  const cached = cache.get<Parada[]>(cacheKey);
  if (cached) return cached;

  const resources = await getPackageResources(PACKAGE_PARADAS);

  // Find paradas resource (CSV or shapefile CSV export)
  const resource =
    findResource(resources, 'parada') ??
    findResource(resources, 'v_uptu_parada') ??
    resources.find((r) => r.format?.toLowerCase().includes('csv'));

  if (!resource) {
    throw new Error('Could not find paradas CSV resource in CKAN package');
  }

  const paradas = await downloadCsv<Parada>(resource.url, parseParadaRow);

  if (paradas.length === 0) {
    throw new Error('No paradas loaded from CKAN — empty dataset');
  }

  cache.set(cacheKey, paradas, TTL_PARADAS);
  return paradas;
}

/**
 * Get all STM bus schedules (horarios). Cached for 1 hour.
 * Loads both regular and circular variant files.
 */
export async function getHorarios(): Promise<Horario[]> {
  const cacheKey = 'stm:horarios';
  const cached = cache.get<Horario[]>(cacheKey);
  if (cached) return cached;

  const resources = await getPackageResources(PACKAGE_HORARIOS);

  // Find horario resources (regular + circular)
  const varianteResource =
    findResource(resources, 'variante') ??
    findResource(resources, 'pasada') ??
    resources.find((r) => r.format?.toLowerCase().includes('csv') || r.url?.endsWith('.txt'));

  if (!varianteResource) {
    throw new Error('Could not find horarios CSV resource in CKAN package');
  }

  const horarios: Horario[] = [];

  // Load regular variants
  const regularHorarios = await downloadCsv<Horario>(varianteResource.url, parseHorarioRow);
  horarios.push(...regularHorarios);

  // Try to load circular variants if available
  const circularResource = findResource(resources, 'circular');
  if (circularResource && circularResource.url !== varianteResource.url) {
    try {
      const circularHorarios = await downloadCsv<Horario>(circularResource.url, parseHorarioRow);
      horarios.push(...circularHorarios);
    } catch (err) {
      // Non-fatal: circular data is supplementary
      console.error('Warning: failed to load circular horarios:', String(err));
    }
  }

  if (horarios.length === 0) {
    throw new Error('No horarios loaded from CKAN — empty dataset');
  }

  cache.set(cacheKey, horarios, TTL_HORARIOS);
  return horarios;
}

/**
 * Get all STM route sequences (recorridos). Cached for 24 hours.
 */
export async function getRecorridos(): Promise<RecorridoRaw[]> {
  const cacheKey = 'stm:recorridos';
  const cached = cache.get<RecorridoRaw[]>(cacheKey);
  if (cached) return cached;

  const resources = await getPackageResources(PACKAGE_PARADAS);

  // Find recorrido resource
  const resource =
    findResource(resources, 'recorrido') ?? findResource(resources, 'v_uptu_recorrido');

  if (!resource) {
    // Recorridos may not be available as a separate CSV
    // Return empty array as a graceful fallback
    console.error('Warning: recorridos CSV resource not found, returning empty');
    return [];
  }

  const recorridos = await downloadCsv<RecorridoRaw>(resource.url, parseRecorridoRow);

  cache.set(cacheKey, recorridos, TTL_RECORRIDOS);
  return recorridos;
}

/**
 * Get unique line codes from horarios data.
 */
export async function getLineas(): Promise<string[]> {
  const cacheKey = 'stm:lineas';
  const cached = cache.get<string[]>(cacheKey);
  if (cached) return cached;

  const horarios = await getHorarios();
  const lineas = [...new Set(horarios.map((h) => h.linea))].sort();

  cache.set(cacheKey, lineas, TTL_HORARIOS);
  return lineas;
}
