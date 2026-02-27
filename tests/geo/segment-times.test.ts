import { describe, it, expect } from "vitest";
import {
  buildSegmentTimeTable,
  getSegmentTravelTime,
  buildAllSegmentTables,
} from "../../src/geo/segment-times.js";
import { makeTripHorarios } from "../fixtures/schedule-data.js";
import { TipoDia } from "../../src/types/horario.js";

describe("buildSegmentTimeTable", () => {
  it("builds table from a single trip", () => {
    const horarios = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 },
      { paradaId: 102, ordinal: 3, hora: 537 },
    ]);

    const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    expect(table).not.toBeNull();
    // 530→533 = 3 min = 180s
    expect(table!.segmentSeconds.get("1-2")).toBe(180);
    // 533→537 = 4 min = 240s
    expect(table!.segmentSeconds.get("2-3")).toBe(240);
  });

  it("averages deltas across multiple trips", () => {
    const trip1 = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 }, // 3 min
    ]);
    const trip2 = makeTripHorarios(5200, 2, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 600 },
      { paradaId: 101, ordinal: 2, hora: 605 }, // 5 min
    ]);
    const horarios = [...trip1, ...trip2];

    const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    expect(table).not.toBeNull();
    // Average of 3min (180s) and 5min (300s) = 4min = 240s
    expect(table!.segmentSeconds.get("1-2")).toBe(240);
  });

  it("enforces minimum 30s when hora values are equal", () => {
    const horarios = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 530 }, // same time
      { paradaId: 102, ordinal: 3, hora: 532 },
    ]);

    const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    expect(table).not.toBeNull();
    // 0 delta → clamped to 30s
    expect(table!.segmentSeconds.get("1-2")).toBe(30);
    // 530→532 = 2 min = 120s
    expect(table!.segmentSeconds.get("2-3")).toBe(120);
  });

  it("returns null for empty horarios", () => {
    const table = buildSegmentTimeTable([], 5200, TipoDia.HABIL);
    expect(table).toBeNull();
  });

  it("returns null for single stop trip", () => {
    const horarios = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
    ]);
    const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    expect(table).toBeNull();
  });

  it("filters by tipoDia correctly", () => {
    const weekday = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 },
    ]);
    const saturday = makeTripHorarios(5200, 2, TipoDia.SABADO, [
      { paradaId: 100, ordinal: 1, hora: 700 },
      { paradaId: 101, ordinal: 2, hora: 710 },
    ]);
    const horarios = [...weekday, ...saturday];

    const weekdayTable = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    const saturdayTable = buildSegmentTimeTable(horarios, 5200, TipoDia.SABADO);

    expect(weekdayTable!.segmentSeconds.get("1-2")).toBe(180); // 3 min
    expect(saturdayTable!.segmentSeconds.get("1-2")).toBe(600); // 10 min
  });

  it("builds ordinal↔stopId mappings", () => {
    const horarios = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 },
      { paradaId: 102, ordinal: 3, hora: 537 },
    ]);

    const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL);
    expect(table!.ordinalToStopId.get(1)).toBe(100);
    expect(table!.ordinalToStopId.get(2)).toBe(101);
    expect(table!.ordinalToStopId.get(3)).toBe(102);
    expect(table!.stopIdToOrdinal.get(100)).toBe(1);
    expect(table!.stopIdToOrdinal.get(101)).toBe(2);
    expect(table!.stopIdToOrdinal.get(102)).toBe(3);
  });
});

describe("getSegmentTravelTime", () => {
  const horarios = makeTripHorarios(5200, 1, TipoDia.HABIL, [
    { paradaId: 100, ordinal: 1, hora: 530 },
    { paradaId: 101, ordinal: 2, hora: 533 },
    { paradaId: 102, ordinal: 3, hora: 537 },
    { paradaId: 103, ordinal: 4, hora: 540 },
  ]);
  const table = buildSegmentTimeTable(horarios, 5200, TipoDia.HABIL)!;

  it("returns time for consecutive stops", () => {
    expect(getSegmentTravelTime(table, 1, 2)).toBe(180); // 3 min
  });

  it("sums time for non-consecutive stops", () => {
    // 1→2 (180s) + 2→3 (240s) + 3→4 (180s) = 600s = 10 min
    expect(getSegmentTravelTime(table, 1, 4)).toBe(600);
  });

  it("returns 0 for same ordinal", () => {
    expect(getSegmentTravelTime(table, 2, 2)).toBe(0);
  });

  it("returns null for missing ordinal", () => {
    expect(getSegmentTravelTime(table, 1, 99)).toBeNull();
  });

  it("returns null when fromOrdinal > toOrdinal", () => {
    expect(getSegmentTravelTime(table, 3, 1)).toBeNull();
  });
});

describe("buildAllSegmentTables", () => {
  it("builds tables for multiple variants", () => {
    const v1 = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 },
    ]);
    const v2 = makeTripHorarios(5201, 1, TipoDia.HABIL, [
      { paradaId: 200, ordinal: 1, hora: 600 },
      { paradaId: 201, ordinal: 2, hora: 608 },
    ]);
    const horarios = [...v1, ...v2];

    const tables = buildAllSegmentTables(horarios, [5200, 5201], TipoDia.HABIL);
    expect(tables.size).toBe(2);
    expect(tables.get(5200)!.segmentSeconds.get("1-2")).toBe(180);
    expect(tables.get(5201)!.segmentSeconds.get("1-2")).toBe(480);
  });

  it("skips variants with insufficient data", () => {
    const v1 = makeTripHorarios(5200, 1, TipoDia.HABIL, [
      { paradaId: 100, ordinal: 1, hora: 530 },
      { paradaId: 101, ordinal: 2, hora: 533 },
    ]);
    const horarios = [...v1];

    const tables = buildAllSegmentTables(horarios, [5200, 9999], TipoDia.HABIL);
    expect(tables.size).toBe(1);
    expect(tables.has(5200)).toBe(true);
    expect(tables.has(9999)).toBe(false);
  });
});
