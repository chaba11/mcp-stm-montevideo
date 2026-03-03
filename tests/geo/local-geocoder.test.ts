import { describe, it, expect, beforeEach } from "vitest";
import { LocalGeocoder, _resetLocalGeocoderSingleton } from "../../src/geo/local-geocoder.js";

// Minimal fixture data — no network required
const FIXTURE_POIS = [
  { n: "Xmartlabs", t: "office", la: -34.9062, lo: -56.1876 },
  { n: "Hospital Maciel", t: "hospital", la: -34.9050, lo: -56.2000 },
  { n: "Estadio Centenario", t: "stadium", la: -34.8933, lo: -56.1536 },
  { n: "McDonald's Pocitos", t: "fast_food", la: -34.9140, lo: -56.1520 },
  { n: "Supermercado Ta-Ta Carrasco", t: "supermarket", la: -34.8900, lo: -56.0800 },
  { n: "Universidad de la República", t: "university", la: -34.9148, lo: -56.1650 },
  { n: "Aeropuerto Internacional de Carrasco", t: "aerodrome", la: -34.8384, lo: -56.0284 },
  // POI with encoding variation
  { n: "Cafe del Centro", t: "cafe", la: -34.9060, lo: -56.1880 },
];

// Street geometry: two intersecting streets near Pocitos
// BV ESPAÑA runs roughly E-W, LIBERTAD runs N-S, they intersect near -34.914, -56.151
const FIXTURE_STREETS = [
  {
    n: "bv espana",
    nodes: [
      [-34.9138, -56.1480] as [number, number],
      [-34.9139, -56.1500] as [number, number],
      [-34.9140, -56.1510] as [number, number], // ← intersection area
      [-34.9141, -56.1530] as [number, number],
      [-34.9142, -56.1550] as [number, number],
    ],
  },
  {
    n: "libertad",
    nodes: [
      [-34.9100, -56.1510] as [number, number], // ← intersection area
      [-34.9120, -56.1510] as [number, number],
      [-34.9140, -56.1510] as [number, number], // ← matches bv espana[2]
      [-34.9160, -56.1510] as [number, number],
      [-34.9180, -56.1510] as [number, number],
    ],
  },
  {
    n: "av italia",
    nodes: [
      [-34.9060, -56.1870] as [number, number],
      [-34.9062, -56.1876] as [number, number],
      [-34.9065, -56.1885] as [number, number],
    ],
  },
  {
    n: "jackson",
    nodes: [
      [-34.9050, -56.1876] as [number, number], // ← near av italia[1]
      [-34.9062, -56.1876] as [number, number], // ← exact match with av italia[1]
      [-34.9080, -56.1876] as [number, number],
    ],
  },
  // Street far from all others — won't intersect
  {
    n: "rambla",
    nodes: [
      [-34.9200, -56.1000] as [number, number],
      [-34.9210, -56.0900] as [number, number],
    ],
  },
];

const FIXTURE_DATA = {
  generatedAt: "2026-03-01T00:00:00.000Z",
  pois: FIXTURE_POIS,
  streets: FIXTURE_STREETS,
};

function makeGeocoder() {
  return new LocalGeocoder(FIXTURE_DATA);
}

function makeEmptyGeocoder() {
  return new LocalGeocoder(null);
}

// ─── searchPlace ────────────────────────────────────────────────────────────

describe("LocalGeocoder.searchPlace", () => {
  it("finds exact match: 'Xmartlabs'", () => {
    const result = makeGeocoder().searchPlace("Xmartlabs");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-34.9062, 3);
    expect(result!.lon).toBeCloseTo(-56.1876, 3);
    expect(result!.displayName).toBe("Xmartlabs");
  });

  it("case insensitive: 'xmartlabs' finds 'Xmartlabs'", () => {
    const result = makeGeocoder().searchPlace("xmartlabs");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Xmartlabs");
  });

  it("diacritics insensitive: 'cafe del centro' finds 'Cafe del Centro'", () => {
    const result = makeGeocoder().searchPlace("café del centro");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Cafe del Centro");
  });

  it("partial match: 'Hospital' finds 'Hospital Maciel'", () => {
    const result = makeGeocoder().searchPlace("Hospital");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Hospital Maciel");
  });

  it("multi-token match: 'Hospital Maciel' exact", () => {
    const result = makeGeocoder().searchPlace("Hospital Maciel");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Hospital Maciel");
  });

  it("fuzzy match: 'Estadio Centenaro' (typo) finds 'Estadio Centenario'", () => {
    const result = makeGeocoder().searchPlace("Estadio Centenaro");
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Estadio Centenario");
  });

  it("abbreviation expansion: 'Universidad Republica' finds 'Universidad de la República'", () => {
    const result = makeGeocoder().searchPlace("Universidad Republica");
    // "universidad" and "republica" should both match
    expect(result).not.toBeNull();
    expect(result!.displayName).toBe("Universidad de la República");
  });

  it("returns null for completely unknown place", () => {
    const result = makeGeocoder().searchPlace("XYZ_INVENTADO_9999_ZZZZZ");
    expect(result).toBeNull();
  });

  it("returns null for empty query", () => {
    const result = makeGeocoder().searchPlace("");
    expect(result).toBeNull();
  });

  it("returns null when data is null (graceful degradation)", () => {
    const result = makeEmptyGeocoder().searchPlace("xmartlabs");
    expect(result).toBeNull();
  });

  it("returns GeoPlace with lat, lon, displayName fields", () => {
    const result = makeGeocoder().searchPlace("Estadio Centenario");
    expect(result).not.toBeNull();
    expect(typeof result!.lat).toBe("number");
    expect(typeof result!.lon).toBe("number");
    expect(typeof result!.displayName).toBe("string");
    expect(result!.displayName.length).toBeGreaterThan(0);
  });

  it("corrupted encoding: 'Mcdonalds Pocitos' finds 'McDonald's Pocitos'", () => {
    // McDonald's → normalization strips apostrophe-related chars
    const result = makeGeocoder().searchPlace("Mcdonalds Pocitos");
    expect(result).not.toBeNull();
  });
});

// ─── searchIntersection ─────────────────────────────────────────────────────

describe("LocalGeocoder.searchIntersection", () => {
  it("finds BV ESPAÑA y LIBERTAD intersection", () => {
    const result = makeGeocoder().searchIntersection("BV ESPAÑA", "LIBERTAD");
    expect(result).not.toBeNull();
    // Intersection is near -34.914, -56.151
    expect(result!.lat).toBeCloseTo(-34.914, 2);
    expect(result!.lon).toBeCloseTo(-56.151, 2);
  });

  it("symmetric: street order doesn't matter (LIBERTAD y BV ESPAÑA)", () => {
    const r1 = makeGeocoder().searchIntersection("BV ESPAÑA", "LIBERTAD");
    const r2 = makeGeocoder().searchIntersection("LIBERTAD", "BV ESPAÑA");
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1!.lat).toBeCloseTo(r2!.lat, 4);
    expect(r1!.lon).toBeCloseTo(r2!.lon, 4);
  });

  it("case insensitive: 'bv españa' y 'libertad' finds intersection", () => {
    const result = makeGeocoder().searchIntersection("bv españa", "libertad");
    expect(result).not.toBeNull();
  });

  it("diacritics insensitive: 'bv espana' matches 'bv espana'", () => {
    const result = makeGeocoder().searchIntersection("bv espana", "libertad");
    expect(result).not.toBeNull();
  });

  it("abbreviation: 'bulevar españa' matches normalized 'bv espana'", () => {
    const result = makeGeocoder().searchIntersection("bulevar españa", "libertad");
    expect(result).not.toBeNull();
  });

  it("returns null when first street not found in data", () => {
    const result = makeGeocoder().searchIntersection("CALLE_INVENTADA_ZZZZ", "LIBERTAD");
    expect(result).toBeNull();
  });

  it("returns null when second street not found in data", () => {
    const result = makeGeocoder().searchIntersection("BV ESPAÑA", "CALLE_INVENTADA_ZZZZ");
    expect(result).toBeNull();
  });

  it("returns null when streets don't intersect (too far apart)", () => {
    // Rambla is far from Av Italia
    const result = makeGeocoder().searchIntersection("RAMBLA", "AV ITALIA");
    expect(result).toBeNull();
  });

  it("returns null for empty street names", () => {
    expect(makeGeocoder().searchIntersection("", "LIBERTAD")).toBeNull();
    expect(makeGeocoder().searchIntersection("BV ESPAÑA", "")).toBeNull();
  });

  it("returns null when data is null (graceful degradation)", () => {
    const result = makeEmptyGeocoder().searchIntersection("BV ESPAÑA", "LIBERTAD");
    expect(result).toBeNull();
  });

  it("returns GeoPoint with lat and lon fields", () => {
    const result = makeGeocoder().searchIntersection("AV ITALIA", "JACKSON");
    expect(result).not.toBeNull();
    expect(typeof result!.lat).toBe("number");
    expect(typeof result!.lon).toBe("number");
  });

  it("finds AV ITALIA y JACKSON intersection", () => {
    const result = makeGeocoder().searchIntersection("AV ITALIA", "JACKSON");
    expect(result).not.toBeNull();
    // jackson[1] and av italia[1] share (-34.9062, -56.1876) → midpoint is same
    expect(result!.lat).toBeCloseTo(-34.9062, 3);
    expect(result!.lon).toBeCloseTo(-56.1876, 3);
  });
});

// ─── singleton ──────────────────────────────────────────────────────────────

describe("LocalGeocoder singleton (getLocalGeocoder)", () => {
  beforeEach(() => {
    _resetLocalGeocoderSingleton();
  });

  it("getLocalGeocoder returns a LocalGeocoder instance", async () => {
    const { getLocalGeocoder } = await import("../../src/geo/local-geocoder.js");
    const g = getLocalGeocoder();
    expect(g).toBeInstanceOf(LocalGeocoder);
  });

  it("getLocalGeocoder returns the same instance on repeated calls", async () => {
    const { getLocalGeocoder } = await import("../../src/geo/local-geocoder.js");
    const g1 = getLocalGeocoder();
    const g2 = getLocalGeocoder();
    expect(g1).toBe(g2);
  });

  it("_resetLocalGeocoderSingleton causes a fresh load on next call", async () => {
    const { getLocalGeocoder } = await import("../../src/geo/local-geocoder.js");
    const g1 = getLocalGeocoder();
    _resetLocalGeocoderSingleton();
    const g2 = getLocalGeocoder();
    expect(g1).not.toBe(g2);
  });
});
