import { describe, it, expect, vi } from "vitest";
import { ubicacionBusHandler } from "../../src/tools/ubicacion-bus.js";
import { GpsClient } from "../../src/data/gps-client.js";
import type { GpsResult } from "../../src/data/gps-client.js";

function makeGpsClient(result: GpsResult): GpsClient {
  const gps = new GpsClient();
  gps.fetchBusPositions = vi.fn().mockResolvedValue(result);
  return gps;
}

describe("ubicacion_bus handler", () => {
  it("returns unavailability message when GPS not available (stub)", async () => {
    const gps = new GpsClient(); // real stub
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("no disponible");
  });

  it("returns error when linea is empty", async () => {
    const gps = new GpsClient();
    const result = await ubicacionBusHandler({ linea: "" }, gps);
    expect(result.content[0].text).toContain("Proporciona");
  });

  it("returns positions when GPS available with data", async () => {
    const gps = makeGpsClient({
      available: true,
      positions: [
        {
          id_vehiculo: "BUS-123",
          latitud: -34.9145,
          longitud: -56.1505,
          velocidad: 30,
          destino: "TRES CRUCES",
          ultimo_reporte: "2026-02-25T13:30:00-03:00",
        },
      ],
    });
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id_vehiculo).toBe("BUS-123");
    expect(parsed[0].latitud).toBe(-34.9145);
  });

  it("returns no-vehicles message when GPS available but empty", async () => {
    const gps = makeGpsClient({ available: true, positions: [] });
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    expect(result.content[0].text).toContain("No se encontraron");
  });

  it("passes linea and variante to GPS client", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ available: false, message: "stub" });
    const gps = new GpsClient();
    gps.fetchBusPositions = fetchFn;
    await ubicacionBusHandler({ linea: "181", variante: "A" }, gps);
    expect(fetchFn).toHaveBeenCalledWith("181", "A");
  });

  it("result positions include required fields", async () => {
    const gps = makeGpsClient({
      available: true,
      positions: [
        {
          id_vehiculo: "VH-001",
          latitud: -34.9,
          longitud: -56.1,
          velocidad: 0,
          destino: "POCITOS",
          ultimo_reporte: "2026-02-25T10:00:00-03:00",
        },
        {
          id_vehiculo: "VH-002",
          latitud: -34.91,
          longitud: -56.15,
          velocidad: 45,
          destino: "CENTRO",
          ultimo_reporte: "2026-02-25T10:00:05-03:00",
        },
      ],
    });
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      id_vehiculo: string;
      latitud: number;
      longitud: number;
      velocidad: number;
      destino: string;
      ultimo_reporte: string;
    }>;
    expect(parsed.length).toBe(2);
    for (const p of parsed) {
      expect(typeof p.id_vehiculo).toBe("string");
      expect(typeof p.latitud).toBe("number");
      expect(typeof p.longitud).toBe("number");
      expect(typeof p.velocidad).toBe("number");
      expect(typeof p.destino).toBe("string");
      expect(typeof p.ultimo_reporte).toBe("string");
    }
  });

  it("stub GpsClient returns available=false without crashing", async () => {
    const gps = new GpsClient();
    const result = await gps.fetchBusPositions("D10");
    expect(result.available).toBe(false);
    expect(typeof result.message).toBe("string");
    expect(result.message!.length).toBeGreaterThan(0);
  });

  it("uses custom unavailability message when provided", async () => {
    const gps = makeGpsClient({
      available: false,
      message: "Servicio temporalmente fuera de línea",
    });
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    expect(result.content[0].text).toContain("Servicio temporalmente fuera de línea");
  });

  it("returned coordinates are within Montevideo bounding box when GPS available", async () => {
    const gps = makeGpsClient({
      available: true,
      positions: [
        { id_vehiculo: "BUS-1", latitud: -34.9, longitud: -56.15, velocidad: 30, destino: "CENTRO", ultimo_reporte: "2026-02-25T10:00:00-03:00" },
        { id_vehiculo: "BUS-2", latitud: -34.85, longitud: -56.2, velocidad: 20, destino: "NORTE", ultimo_reporte: "2026-02-25T10:00:00-03:00" },
      ],
    });
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    const parsed = JSON.parse(result.content[0].text) as Array<{
      latitud: number;
      longitud: number;
    }>;
    for (const p of parsed) {
      // Montevideo rough bounding box
      expect(p.latitud).toBeGreaterThan(-35.1);
      expect(p.latitud).toBeLessThan(-34.6);
      expect(p.longitud).toBeGreaterThan(-56.6);
      expect(p.longitud).toBeLessThan(-55.9);
    }
  });

  it("trims whitespace from linea before passing to GPS", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ available: false, message: "stub" });
    const gps = new GpsClient();
    gps.fetchBusPositions = fetchFn;
    await ubicacionBusHandler({ linea: "  181  " }, gps);
    expect(fetchFn).toHaveBeenCalledWith("181", undefined);
  });

  it("message includes suggestion to use proximos_buses when unavailable", async () => {
    const gps = new GpsClient(); // real stub
    const result = await ubicacionBusHandler({ linea: "181" }, gps);
    // The stub message should mention horarios or theoretical schedules
    expect(result.content[0].text.toLowerCase()).toMatch(/horario|schedule|te[ó|o]rico|ckan/i);
  });
});
