/**
 * Geographic coordinate conversions for Montevideo STM data.
 *
 * The STM CKAN dataset uses UTM Zone 21S (EPSG:32721) coordinates.
 * This module converts them to WGS84 (EPSG:4326) decimal degrees.
 *
 * UTM Zone 21S parameters:
 * - Central meridian: -57° (zone 21)
 * - Southern hemisphere (S)
 * - WGS84 datum
 * - False easting: 500,000 m
 * - False northing: 10,000,000 m (southern hemisphere)
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// WGS84 ellipsoid parameters
const A = 6378137.0; // semi-major axis (m)
const F = 1 / 298.257223563; // flattening
const B = A * (1 - F); // semi-minor axis
const E_SQ = 1 - (B * B) / (A * A); // eccentricity squared
const E_PRIME_SQ = (A * A - B * B) / (B * B);

// UTM Zone 21S parameters
const K0 = 0.9996; // scale factor
const FALSE_EASTING = 500000; // m
const FALSE_NORTHING = 10000000; // m (southern hemisphere)
const CENTRAL_MERIDIAN = -57 * DEG_TO_RAD; // zone 21 center

/**
 * Convert UTM Zone 21S (EPSG:32721) coordinates to WGS84 lat/lon.
 *
 * @param easting - X coordinate in meters (e.g., 580345)
 * @param northing - Y coordinate in meters (e.g., 6135678)
 * @returns WGS84 { lat, lon } in decimal degrees
 */
export function utm21sToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  const x = easting - FALSE_EASTING;
  const y = northing - FALSE_NORTHING; // subtract false northing for southern hemisphere

  const mu =
    y /
    (K0 *
      A *
      (1 -
        E_SQ / 4 -
        (3 * E_SQ * E_SQ) / 64 -
        (5 * E_SQ * E_SQ * E_SQ) / 256));

  const e1 = (1 - Math.sqrt(1 - E_SQ)) / (1 + Math.sqrt(1 - E_SQ));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);

  const n1 = A / Math.sqrt(1 - E_SQ * Math.sin(phi1) * Math.sin(phi1));
  const t1 = Math.tan(phi1) * Math.tan(phi1);
  const c1 = E_PRIME_SQ * Math.cos(phi1) * Math.cos(phi1);
  const r1 = (A * (1 - E_SQ)) / Math.pow(1 - E_SQ * Math.sin(phi1) * Math.sin(phi1), 1.5);
  const d = x / (n1 * K0);

  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      (d * d * (0.5 -
        (d * d * (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * E_PRIME_SQ)) / 24 +
        (d * d * d * d * (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * E_PRIME_SQ - 3 * c1 * c1)) / 720));

  const lon =
    CENTRAL_MERIDIAN +
    (d -
      (d * d * d * (1 + 2 * t1 + c1)) / 6 +
      (d * d * d * d * d * (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * E_PRIME_SQ + 24 * t1 * t1)) /
        120) /
      Math.cos(phi1);

  return {
    lat: lat * RAD_TO_DEG,
    lon: lon * RAD_TO_DEG,
  };
}

/**
 * Validate that coordinates are within the Montevideo metropolitan area bounding box.
 * Lat: -34.70 to -34.97, Lon: -55.95 to -56.45
 */
export function isWithinMontevideo(lat: number, lon: number): boolean {
  return lat >= -34.97 && lat <= -34.70 && lon >= -56.45 && lon <= -55.95;
}
