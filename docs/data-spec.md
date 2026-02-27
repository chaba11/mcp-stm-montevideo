# STM Montevideo — CKAN Data Specification

Explored on: 2026-02-26
Source: https://ckan.montevideo.gub.uy/api/3/action/

---

## 1. Horarios por Parada (Schedule by Stop)

**CKAN Package ID:** `horarios-de-omnibus-urbanos-por-parada-stm`
**Package URL:** `https://ckan.montevideo.gub.uy/api/3/action/package_show?id=horarios-de-omnibus-urbanos-por-parada-stm`

### Resources

| Resource ID | Name | Format | URL |
|-------------|------|--------|-----|
| `e694f7f1-2358-42d7-b044-7591bf2d0d0a` | Horarios por parada | CSV ZIP | `https://datos-abiertos.montevideo.gub.uy/uptu_pasada_variante.zip` |
| `755c25f9-50de-4000-8eba-1fe0f735dca6` | Horarios variantes circulares | CSV ZIP | `https://datos-abiertos.montevideo.gub.uy/uptu_pasada_circular.zip` |

### Column Definitions — `uptu_pasada_variante.csv`

Delimiter: `;` (semicolon)
Encoding: UTF-8
File size: ~57 MB uncompressed, ~10 MB zipped

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `tipo_dia` | integer | Day type: 1=weekday, 2=Saturday, 3=Sunday | `1` |
| `cod_variante` | integer | Route variant code (links to paradas and lineas) | `52` |
| `frecuencia` | integer | Trip start time in format `hmm0` (e.g. 5000 = 05:00) | `5000` |
| `cod_ubic_parada` | integer | Stop ID (links to paradas shapefile `COD_UBIC_P`) | `4836` |
| `ordinal` | integer | Stop sequence within the route variant | `1` |
| `hora` | integer | Estimated arrival time in format `hmm` (e.g. 500 = 05:00, 1230 = 12:30) | `500` |
| `dia_anterior` | char(1) | N=same day, S=started previous day, *=special case | `N` |

### Time Format Notes

- `hora` field: integer in `hmm` format. No leading zero for hours < 10.
  - `500` = 05:00, `1235` = 12:35, `2359` = 23:59
  - Values > 2400 are possible for overnight trips (e.g. `2430` = 00:30 next day)
- `frecuencia` field: integer in `hmm0` format (hour * 1000 + minute * 10)
  - `5000` = 05:00, `12300` = 12:30
- Timezone: **America/Montevideo** (UTC-3, observes DST)
- Updated daily; always reflects the current day's schedule

### Column Definitions — `uptu_pasada_circular.csv`

| Column | Type | Description |
|--------|------|-------------|
| `tipo_dia` | integer | Same as above |
| `cod_circular` | integer | Circular variant code |
| `frecuencia` | integer | Same as above |
| `cod_ubic_parada` | integer | Stop ID |
| `cod_variante` | integer | Sub-variant within circular route |
| `parte` | integer | Part 1 or 2 of circular route |
| `ordinal` | integer | Stop sequence within variant |
| `hora` | integer | Estimated arrival time |
| `dia_anterior` | char(1) | Same as above |

---

## 2. Paradas / Stops

**CKAN Package ID:** `transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus`
**Package URL:** `https://ckan.montevideo.gub.uy/api/3/action/package_show?id=transporte-colectivo-paradas-puntos-de-control-y-recorridos-de-omnibus`

### Resources

| Resource ID | Name | Format | Direct URL |
|-------------|------|--------|------------|
| `f30c15b5-2638-4315-b6a1-4868f9e6e02d` | Paradas | Shapefile (ZIP) | `http://intgis.montevideo.gub.uy/sit/tmp/v_uptu_paradas.zip` |
| `0cb26b17-438a-46be-9d22-2eba6bcd59ba` | Puntos de control | Shapefile (ZIP) | `http://intgis.montevideo.gub.uy/sit/tmp/v_uptu_controles.zip` |
| `86a7457f-4c5b-4477-b804-9104865b42f0` | Recorridos circulares | Shapefile (ZIP) | `http://intgis.montevideo.gub.uy/sit/tmp/v_uptu_lsv.zip` |

> **Note:** The CKAN resource URLs use a JS redirect. Use the direct `/sit/tmp/` paths above.

### Column Definitions — `v_uptu_paradas.dbf` (42,178 records)

Coordinate system: **EPSG:32721** (WGS 84 / UTM zone 21S) — must convert to WGS84

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `COD_UBIC_P` | integer | Stop ID — matches `cod_ubic_parada` in horarios | `546` |
| `DESC_LINEA` | string(50) | Line name/number (text) | `"144"` |
| `COD_VARIAN` | integer | Variant code — matches `cod_variante` in horarios | `883` |
| `ORDINAL` | integer | Stop order within the variant | `44` |
| `CALLE` | string(36) | Street name (may have encoding issues, latin-1) | `"CORUÑA"` |
| `ESQUINA` | string(36) | Cross street / landmark | `"GRAL JULIO AMADEO ROLETTI"` |
| `COD_CALLE1` | integer | Primary street code | `2187` |
| `COD_CALLE2` | integer | Cross street code | `6120` |
| `X` | float | Easting coordinate (UTM 21S meters) | `577981.398` |
| `Y` | float | Northing coordinate (UTM 21S meters) | `6140774.574` |

> **Encoding Gotcha:** DBF text fields are in ISO-8859-1 (Latin-1). Special characters like `Ñ`, `É`, `Á` need decoding. Example: `"CORU\xc3\x91A"` → `"CORUÑA"`

### Column Definitions — `v_uptu_controles.dbf` (5,731 records)

| Column | Type | Description |
|--------|------|-------------|
| `COD_UBIC_C` | integer | Control point ID |
| `DESC_LINEA` | string(50) | Line name |
| `COD_VARIAN` | integer | Variant code |
| `ORDINAL` | integer | Order within variant |
| `DESC_UBIC_` | string(100) | Location description |
| `COD_CALLE1` | integer | Primary street code |
| `COD_CALLE2` | integer | Cross street code |
| `X` | float | Easting (UTM 21S) |
| `Y` | float | Northing (UTM 21S) |

---

## 3. Líneas / Routes

**CKAN Package ID:** `lineas-de-omnibus-origen-y-destino`

### Column Definitions — `v_uptu_lsv_destinos.dbf` (1,461 records)

| Column | Type | Description | Example |
|--------|------|-------------|---------|
| `GID` | integer | Internal GIS record ID | `16009406` |
| `COD_LINEA` | integer | Line code (numeric) | `1` |
| `DESC_LINEA` | string(50) | Line name (display number) | `"402"` |
| `ORDINAL_SU` | integer | Sub-line ordinal | `1` |
| `COD_SUBLIN` | integer | Sub-line code | `1` |
| `DESC_SUBLI` | string(50) | Sub-line description | `"CIUDAD VIEJA - MALVIN"` |
| `COD_VARIAN` | integer | Variant code (links to paradas and horarios) | `8` |
| `DESC_VARIA` | char(1) | Variant direction: A or B | `"A"` |
| `COD_VAR_01` | integer | Alternative variant code | |
| `COD_ORIGEN` | integer | Origin stop ID | `19` |
| `DESC_ORIGE` | string(100) | Origin description | `"PLAYA MALVÍN"` |
| `COD_DESTIN` | integer | Destination stop ID | `274` |
| `DESC_DESTI` | string(100) | Destination description | `"URUGUAY Y FLORIDA"` |

### Column Definitions — `v_uptu_lsv.dbf` (711 records)

| Column | Description |
|--------|-------------|
| `GID` | Internal GIS ID |
| `COD_LINEA` | Line code |
| `DESC_LINEA` | Line display name |
| `ORDINAL_SU` | Sub-line ordinal |
| `COD_SUBLIN` | Sub-line code |
| `DESC_SUBLI` | Sub-line description |
| `COD_VARIAN` | Variant code |
| `DESC_VARIA` | Variant direction (A/B) |

---

## 4. Dataset Relationships

```
horarios (uptu_pasada_variante.csv)
  │
  ├─ cod_ubic_parada ──────────→ paradas (v_uptu_paradas.dbf).COD_UBIC_P
  │                               (gives street name, location coords)
  │
  └─ cod_variante ─────────────→ lineas (v_uptu_lsv_destinos.dbf).COD_VARIAN
                                  (gives line name, origin, destination)
                               → paradas.COD_VARIAN
                                  (gives all stops on this variant)
```

**Key linking fields:**
- `horarios.cod_ubic_parada` = `paradas.COD_UBIC_P` (stop lookup)
- `horarios.cod_variante` = `paradas.COD_VARIAN` = `lineas.COD_VARIAN` (route lookup)
- `lineas.DESC_LINEA` = human-readable line number (e.g. "181", "402")

---

## 5. Gotchas & Notes

### Coordinate Conversion
- All coordinates are in **EPSG:32721** (UTM Zone 21S, WGS 84)
- Must convert to WGS84 (lat/lng) for geo calculations
- Use `proj4` or `geolib` — or the formula for UTM to lat/lng
- Approximate conversion: subtract 500000 from X (false easting), subtract 10000000 from Y (false northing for southern hemisphere)

### Encoding
- DBF files use **ISO-8859-1** (Latin-1) encoding
- CSV files (`uptu_pasada_variante.csv`) appear to be ASCII-safe (no accented chars in data fields)

### Time Arithmetic
- `hora` format is `hmm` (integer): divide by 100 for hours, mod 100 for minutes
- Values can exceed 2359 for overnight services (treat as next-day times)
- Always use America/Montevideo timezone

### File Sizes
- `uptu_pasada_variante.zip` ≈ 10 MB (57 MB uncompressed) — do not load fully into memory
- Stream or sample the CSV; cache by parada ID

### URL Stability
- Direct resource file URLs (e.g. `datos-abiertos.montevideo.gub.uy/uptu_pasada_variante.zip`) are stable
- Shapefile URLs via `intgis.montevideo.gub.uy/sit/tmp/` are **ephemeral** — the ZIPs are generated on demand by `generar_zip2.php` and periodically cleaned from `/sit/tmp/`, causing 404s if hardcoded
- URLs are resolved dynamically via CKAN `package_show` → resource URL → (if `generar_zip2.php`) fetch HTML → parse `<form action='...'>` → final ZIP URL

### Data Freshness
- Horarios CSV: updated daily at ~04:00 local time
- Shapefiles: updated less frequently (weekly/monthly)

---

## 6. Real-time GPS

**Research Date:** 2026-02-26

### Findings

The Intendencia de Montevideo (IM) operates a real-time bus GPS tracking system used by the "Cómo Ir" and "ComoMeMuevo" apps. However, **no public, unauthenticated API endpoint has been identified**.

Known facts:
- The app `comomemuevo.uy` and mobile apps access real-time positions via a proprietary API
- The API appears to require OAuth or similar authentication (session cookies from the IM portal)
- The CKAN open data catalog (`ckan.montevideo.gub.uy`) does not expose a real-time GPS resource
- The `montevidata.montevideo.gub.uy` portal shows live positions in the browser but uses authenticated websocket/SSE connections
- No public REST endpoint documentation has been found

### Current Implementation

The `ubicacion_bus` tool uses a **stub implementation** that returns an availability flag set to `false`. When a public GPS API becomes available, replace the `GpsClient.fetchBusPositions()` implementation.

### Potential Future Integration

- Watch for changes in `https://datos-abiertos.montevideo.gub.uy` for new real-time datasets
- The IM may publish a public API in the future as part of their open data initiative
- Third-party datasets (e.g., OpenStreetMap, Transitland) may provide GTFS-RT feeds
