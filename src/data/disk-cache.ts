import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface DiskCacheMeta {
  savedAt: number;
}

/**
 * Returns the disk cache directory, creating it if needed.
 * Respects XDG_CACHE_HOME on Linux.
 */
export function getCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  const dir = join(base, "mcp-stm-montevideo");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Write data to the disk cache with a metadata sidecar file.
 * Silently fails on any I/O error.
 */
export function writeDiskCache(filename: string, data: unknown): void {
  try {
    const dir = getCacheDir();
    const dataPath = join(dir, filename);
    const metaPath = join(dir, filename.replace(/\.json$/, ".meta.json"));
    writeFileSync(dataPath, JSON.stringify(data), "utf-8");
    const meta: DiskCacheMeta = { savedAt: Date.now() };
    writeFileSync(metaPath, JSON.stringify(meta), "utf-8");
  } catch {
    // Silently fall through — disk cache is best-effort
  }
}

/**
 * Read data from the disk cache if it exists and hasn't expired.
 * Returns null if missing, expired, or unreadable.
 */
export function readDiskCache<T>(filename: string, ttlMs: number): T | null {
  try {
    const dir = getCacheDir();
    const dataPath = join(dir, filename);
    const metaPath = join(dir, filename.replace(/\.json$/, ".meta.json"));

    if (!existsSync(dataPath) || !existsSync(metaPath)) return null;

    const metaRaw = readFileSync(metaPath, "utf-8");
    const meta = JSON.parse(metaRaw) as DiskCacheMeta;

    if (meta.savedAt + ttlMs < Date.now()) return null;

    const dataRaw = readFileSync(dataPath, "utf-8");
    return JSON.parse(dataRaw) as T;
  } catch {
    return null;
  }
}
