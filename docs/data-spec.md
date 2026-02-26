# STM Montevideo — Data Specification

## Overview

This document describes the structure of the STM (Sistema de Transporte Metropolitano)
datasets available on Montevideo's open data CKAN portal at
https://ckan.montevideo.gub.uy/api/3/action/

> **Note:** All datasets are resolved dynamically via CKAN `package_show` API —
> never hardcode resource IDs, as they change when datasets are updated.

---

## Datasets

### 1. Paradas (Bus Stops)

**CKAN Package ID:** `transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus`

**Resource:** `v_uptu_paradas` (CSV or Shapefile with CSV export)

**Coordinate System:** EPSG:32721 — WGS84, UTM Zone 21S projection

Montevideo coordinates in UTM 21S:
- Easting (X): ~570,000 – 592,000 m
- Northing (Y): ~6,128,000 – 6,148,000 m

After conversion to WGS84 (lat/lon):
- Latitude: ~-34.70 to -34.95
- Longitude: ~-56.00 to -56.40

**CSV Columns:**

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `COD_PARADA_STM` | string (numeric) | `"1234"` | Unique stop identifier |
| `DESC_PARADA_STM` | string | `"BV ESPAÑA ESQ.LIBERTAD"` | Stop name / street description |
| `X` | number | `580345.12` | Easting in UTM 21S (meters) |
| `Y` | number | `6135678.45` | Northing in UTM 21S (meters) |
| `COD_EMPRESA` | string | `"01"` | Bus company code |

**Sample rows (first 5):**
```
COD_PARADA_STM,DESC_PARADA_STM,X,Y,COD_EMPRESA
1234,BV ESPAÑA ESQ.LIBERTAD,580345.12,6135678.45,01
1235,BV ESPAÑA ESQ.GARIBALDI,580412.33,6135712.20,01
1236,BV ESPAÑA ESQ.ELLAURI,580480.56,6135744.11,01
1237,18 DE JULIO ESQ.EJIDO,577943.21,6133891.33,01
1238,18 DE JULIO ESQ.YI,578012.44,6133920.56,01
```

**Notes:**
- `COD_PARADA_STM` is stored as string to preserve leading zeros if any
- Coordinates MUST be converted to WGS84 for geographic calculations
- Encoding: UTF-8 (may have BOM in some exports)
- Stop names are UPPERCASE

---

### 2. Horarios por Parada (Schedules)

**CKAN Package ID:** `horarios-de-omnibus-urbanos-por-parada-stm`

**Resource files:**
- `uptu_pasada_variante.txt` — schedules for regular (non-circular) variants
- `uptu_pasada_circular.txt` — schedules for circular route variants

**Format:** CSV (comma-separated), plain text

**CSV Columns:**

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `COD_PARADA_STM` | string (numeric) | `"1234"` | Stop identifier (matches Paradas) |
| `COD_LINEA` | string | `"181"` | Line number — KEEP AS STRING, never parse to int |
| `DESC_LINEA` | string | `"SERVICIO 181 - TRES CRUCES"` | Line name/description |
| `COD_VARIANTE` | string | `"01"` | Variant code |
| `DESC_VARIANTE` | string | `"TRES CRUCES-3 DE FEBRERO"` | Variant description (origin-destination) |
| `TIPO_DIA` | string | `"L"` | Day type: L=weekday, S=Saturday, D=Sunday |
| `HORA` | number | `6` | Hour (0-25, values >23 indicate post-midnight) |
| `MINUTO` | number | `30` | Minute (0-59) |

**Day type values:**
- `L` — Laboral (weekdays: Monday–Friday)
- `S` — Sábado (Saturday)
- `D` — Domingo (Sunday and public holidays)

**Sample rows:**
```
COD_PARADA_STM,COD_LINEA,DESC_LINEA,COD_VARIANTE,DESC_VARIANTE,TIPO_DIA,HORA,MINUTO
1234,181,SERVICIO 181 - TRES CRUCES,01,TRES CRUCES-3 DE FEBRERO,L,5,30
1234,181,SERVICIO 181 - TRES CRUCES,01,TRES CRUCES-3 DE FEBRERO,L,5,45
1234,181,SERVICIO 181 - TRES CRUCES,01,TRES CRUCES-3 DE FEBRERO,L,6,0
1234,181,SERVICIO 181 - TRES CRUCES,01,TRES CRUCES-3 DE FEBRERO,S,6,30
1234,D10,SERVICIO D10 - ZONA NORTE,01,CENTRO-ZONA NORTE,L,6,0
```

**Important notes:**
- `COD_LINEA` MUST be preserved as string: "181" ≠ 181 (line "021" ≠ "21")
- `HORA` can exceed 23 (e.g., 24, 25) for post-midnight service
- Dataset is large (~5M rows) — cache aggressively (1 hour TTL)
- Two files: regular variants + circular variants (must load both)

---

### 3. Recorridos (Route Sequences)

**CKAN Package ID:** `transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus`

**Resource:** Route shapefile / CSV with stop sequences

**CSV Columns:**

| Column | Type | Example | Description |
|--------|------|---------|-------------|
| `COD_LINEA` | string | `"181"` | Line number |
| `DESC_LINEA` | string | `"SERVICIO 181 - TRES CRUCES"` | Line description |
| `COD_VARIANTE` | string | `"01"` | Variant code |
| `DESC_VARIANTE` | string | `"TRES CRUCES-3 DE FEBRERO"` | Origin-destination |
| `NRO_ORDEN` | number | `1` | Stop order within route (1-based) |
| `COD_PARADA_STM` | string | `"1234"` | Stop identifier |
| `COD_EMPRESA` | string | `"01"` | Bus company code |
| `DESC_EMPRESA` | string | `"CUTCSA"` | Bus company name |

**Notes:**
- Multiple variants per line represent different directions/branches
- `NRO_ORDEN` defines the sequence of stops for a given line+variant

---

## Key Relationships

```
Paradas (stops)
    COD_PARADA_STM ─────────────────────── Horarios (schedules)
                                               COD_LINEA + COD_VARIANTE ─── Recorridos (routes)
                                                                                  NRO_ORDEN (stop sequence)
```

**To answer "¿cuándo pasa el próximo 181 por Bv España y Libertad?":**
1. Find paradas near "Bv España y Libertad" → `COD_PARADA_STM`
2. Look up horarios for that parada where `COD_LINEA = "181"`
3. Filter by current `TIPO_DIA`, find next `HORA`+`MINUTO` after now

---

## Coordinate Conversion

Raw data uses UTM Zone 21S (EPSG:32721). Must convert to WGS84 (EPSG:4326) for geographic queries.

Conversion formula (simplified, proj library recommended):
- Zone 21S central meridian: -57°
- Use standard UTM-to-lat/lon projection

Montevideo WGS84 bounding box:
- Lat: -34.70 to -34.95
- Lon: -56.00 to -56.40

---

## API Access Pattern

```typescript
// Always resolve resource URLs dynamically:
const result = await fetch(
  'https://ckan.montevideo.gub.uy/api/3/action/package_show?id=horarios-de-omnibus-urbanos-por-parada-stm'
);
const pkg = await result.json();
const resourceUrl = pkg.result.resources[0].url;
// Then download resourceUrl as CSV
```

---

## Encoding

- Files are UTF-8 encoded
- Some older exports may include a UTF-8 BOM (`0xEF 0xBB 0xBF`) — strip before parsing
- Street names use Spanish characters: ñ, á, é, í, ó, ú, ü, Á, É, etc.
- Stop names are typically UPPERCASE

---

## Data Freshness

| Dataset | Update frequency | Recommended cache TTL |
|---------|-----------------|----------------------|
| Paradas | Monthly | 24 hours |
| Horarios | Daily | 1 hour |
| Recorridos | Monthly | 24 hours |

---

## Known Issues / Gotchas

1. **Line numbers as strings**: "181" and "0181" may both appear; normalize carefully
2. **Post-midnight hours**: `HORA=24` means 00:xx of next calendar day
3. **Large files**: horarios CSV can be 5+ MB; always stream-parse, cache result
4. **Two horarios files**: must load both `uptu_pasada_variante` and `uptu_pasada_circular`
5. **Coordinate conversion required**: raw X/Y are UTM, must convert to WGS84 lat/lon
6. **CKAN resource URLs change**: never hardcode; always resolve via `package_show`
