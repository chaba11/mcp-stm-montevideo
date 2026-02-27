import { describe, it, expect, vi, beforeEach } from "vitest";
import { StopMapper } from "../../src/data/stop-mapper.js";
import { GpsClient } from "../../src/data/gps-client.js";
import type { GpsBusstop } from "../../src/data/gps-client.js";
import { Cache } from "../../src/data/cache.js";

// GPS busstop at the same location as CKAN parada 300 (BV ESPAÑA y LIBERTAD)
const GPS_STOP_EXACT: GpsBusstop = {
  busstopId: 7001,
  street1: "BV ESPAÑA",
  street2: "LIBERTAD",
  location: { type: "Point", coordinates: [-56.1505, -34.9145] }, // [lng, lat]
};

// GPS busstop ~50m away from parada 300
const GPS_STOP_NEAR: GpsBusstop = {
  busstopId: 7002,
  street1: "BV ESPAÑA",
  street2: "GUAYAQUI",
  location: { type: "Point", coordinates: [-56.1510, -34.9148] },
};

// GPS busstop far away (Ciudad Vieja area, ~3km from parada 300)
const GPS_STOP_FAR: GpsBusstop = {
  busstopId: 7003,
  street1: "25 DE MAYO",
  street2: "MISIONES",
  location: { type: "Point", coordinates: [-56.2050, -34.9080] },
};

function makeMockGps(busstops: GpsBusstop[]): GpsClient {
  const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
  gps.fetchBusstops = vi.fn().mockResolvedValue(busstops);
  return gps;
}

function makeMockGpsThrows(): GpsClient {
  const gps = new GpsClient({ clientId: "test", clientSecret: "test" });
  gps.fetchBusstops = vi.fn().mockRejectedValue(new Error("Network timeout"));
  return gps;
}

function makeMockGpsNoCredentials(): GpsClient {
  // No clientId/clientSecret — simulates no credentials
  return new GpsClient({});
}

describe("StopMapper", () => {
  let cache: Cache;

  beforeEach(() => {
    cache = new Cache();
  });

  it("returns exact match by coordinates", async () => {
    const gps = makeMockGps([GPS_STOP_EXACT, GPS_STOP_FAR]);
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBe(7001);
  });

  it("returns closest match within tolerance", async () => {
    const gps = makeMockGps([GPS_STOP_NEAR, GPS_STOP_FAR]);
    const mapper = new StopMapper(gps, { cache });

    // Parada 300 coords, GPS_STOP_NEAR is ~50m away (within 150m default tolerance)
    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBe(7002);
  });

  it("returns null when no GPS busstop within tolerance", async () => {
    const gps = makeMockGps([GPS_STOP_FAR]);
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBeNull();
  });

  it("picks the closest when multiple GPS stops exist", async () => {
    const gps = makeMockGps([GPS_STOP_FAR, GPS_STOP_NEAR, GPS_STOP_EXACT]);
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBe(7001); // exact match is closest
  });

  it("caches the busstops list (no re-fetch)", async () => {
    const gps = makeMockGps([GPS_STOP_EXACT]);
    const mapper = new StopMapper(gps, { cache });

    await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    await mapper.resolveGpsBusstopId(301, -34.9060, -56.1880);

    // fetchBusstops should only be called once despite two resolves
    expect(gps.fetchBusstops).toHaveBeenCalledTimes(1);
  });

  it("caches individual mapping results", async () => {
    const gps = makeMockGps([GPS_STOP_EXACT]);
    const mapper = new StopMapper(gps, { cache });

    const first = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    const second = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);

    expect(first).toBe(second);
    // busstops only fetched once
    expect(gps.fetchBusstops).toHaveBeenCalledTimes(1);
  });

  it("returns null gracefully when fetchBusstops fails", async () => {
    const gps = makeMockGpsThrows();
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBeNull();
  });

  it("returns null when no GPS credentials (fetchBusstops will fail)", async () => {
    const gps = makeMockGpsNoCredentials();
    // fetchBusstops requires a token, which will fail without credentials
    // Override to simulate the failure
    gps.fetchBusstops = vi.fn().mockRejectedValue(new Error("Token request failed"));
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBeNull();
  });

  it("respects custom tolerance", async () => {
    const gps = makeMockGps([GPS_STOP_NEAR]); // ~50m away
    // Set tolerance to 10m — GPS_STOP_NEAR at ~50m should be rejected
    const mapper = new StopMapper(gps, { cache, toleranceMeters: 10 });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBeNull();
  });

  it("clearCache resets all cached data", async () => {
    const gps = makeMockGps([GPS_STOP_EXACT]);
    const mapper = new StopMapper(gps, { cache });

    await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(gps.fetchBusstops).toHaveBeenCalledTimes(1);

    mapper.clearCache();

    await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    // After clearing cache, busstops should be re-fetched
    expect(gps.fetchBusstops).toHaveBeenCalledTimes(2);
  });

  it("getGpsBusstops returns the full list", async () => {
    const all = [GPS_STOP_EXACT, GPS_STOP_NEAR, GPS_STOP_FAR];
    const gps = makeMockGps(all);
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.getGpsBusstops();
    expect(result).toHaveLength(3);
    expect(result[0].busstopId).toBe(7001);
  });

  it("handles empty busstops list gracefully", async () => {
    const gps = makeMockGps([]);
    const mapper = new StopMapper(gps, { cache });

    const result = await mapper.resolveGpsBusstopId(300, -34.9145, -56.1505);
    expect(result).toBeNull();
  });
});
