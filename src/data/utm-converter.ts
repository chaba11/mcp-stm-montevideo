/**
 * UTM Zone 21S to WGS84 coordinate converter.
 * Uses the standard Transverse Mercator inverse projection.
 * Reference: US Army Corps of Engineers, USACE
 */

const a = 6378137.0; // WGS84 semi-major axis (meters)
const f = 1 / 298.257223563; // WGS84 flattening
const k0 = 0.9996; // UTM scale factor

const e2 = 2 * f - f * f; // first eccentricity squared
const e2_ = e2 / (1 - e2); // second eccentricity squared

/**
 * Convert UTM Zone 21S coordinates to WGS84 lat/lng.
 * @param x Easting in meters
 * @param y Northing in meters
 */
export function utm21SToWgs84(x: number, y: number): { lat: number; lng: number } {
  // Remove false easting and southing
  const E = x - 500_000;
  const N = y - 10_000_000; // southern hemisphere false northing

  // Central meridian for zone 21: (21 * 6 - 183) = -57°
  const lambda0 = -57 * (Math.PI / 180);

  const M = N / k0;
  const mu =
    M /
    (a *
      (1 -
        e2 / 4 -
        (3 * e2 * e2) / 64 -
        (5 * e2 * e2 * e2) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) *
      Math.sin(4 * mu) +
    ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = e2_ * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = E / (N1 * k0);

  const latRad =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D * D / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e2_) * D * D * D * D) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e2_ - 3 * C1 * C1) *
          D * D * D * D * D * D) /
          720);

  const lonRad =
    lambda0 +
    (D -
      ((1 + 2 * T1 + C1) * D * D * D) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e2_ + 24 * T1 * T1) *
        D * D * D * D * D) /
        120) /
      cosPhi1;

  return {
    lat: latRad * (180 / Math.PI),
    lng: lonRad * (180 / Math.PI),
  };
}
