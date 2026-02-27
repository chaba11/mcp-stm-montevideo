/**
 * GPS client for real-time bus positions.
 * Uses the Montevideo public transport REST API with OAuth2 client credentials.
 *
 * Required env vars: STM_CLIENT_ID, STM_CLIENT_SECRET
 * API docs: https://api.montevideo.gub.uy/apidocs/publictransport
 */

export interface BusPosition {
  id_vehiculo: string;
  latitud: number;
  longitud: number;
  velocidad: number;
  destino: string;
  ultimo_reporte: string; // ISO 8601
}

export interface GpsResult {
  available: boolean;
  message?: string;
  positions?: BusPosition[];
}

export type GpsFetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface GpsClientOptions {
  clientId?: string;
  clientSecret?: string;
  fetchFn?: GpsFetchFn;
}

export interface UpcomingBus {
  linea: string;
  destino: string;
  eta_segundos: number;
  distancia_metros: number;
}

export interface UpcomingBusesResult {
  available: boolean;
  message?: string;
  buses?: UpcomingBus[];
}

export interface GpsBusstop {
  busstopId: number;
  street1: string;
  street2: string;
  location: { type: string; coordinates: [number, number] }; // [lng, lat]
}

interface VehicleItem {
  id: number;
  timestamp: string;
  location: { type: string; coordinates: [number, number] }; // [lng, lat]
  destination?: string;
  subline?: string;
  line?: string;
  vehicleIdentificationNumber?: string;
}

interface UpcomingBusApiItem {
  line?: string;
  destination?: string;
  eta?: number; // seconds
  distance?: number; // meters
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const TOKEN_URL = "https://mvdapi-auth.montevideo.gub.uy/token";
const API_BASE = "https://api.montevideo.gub.uy/api/transportepublico";

export class GpsClient {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly fetchFn: GpsFetchFn;
  private cachedToken: string | undefined;
  private tokenExpiry: number = 0;

  constructor(options: GpsClientOptions = {}) {
    this.clientId = options.clientId ?? process.env.STM_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.STM_CLIENT_SECRET;
    this.fetchFn = options.fetchFn ?? (fetch as unknown as GpsFetchFn);
  }

  private async fetchToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiry) {
      return this.cachedToken;
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId!,
      client_secret: this.clientSecret!,
    }).toString();

    const response = await this.fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      throw new Error(`Token request failed: HTTP ${response.status}`);
    }

    const data = (await response.json()) as TokenResponse;
    this.cachedToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60_000;
    return this.cachedToken;
  }

  async fetchBusPositions(linea: string, variante?: string): Promise<GpsResult> {
    if (!this.clientId || !this.clientSecret) {
      return {
        available: false,
        message:
          "GPS en tiempo real no disponible. " +
          "Configura STM_CLIENT_ID y STM_CLIENT_SECRET para acceder a posiciones en tiempo real. " +
          "Usando horarios teóricos del CKAN.",
      };
    }

    try {
      const token = await this.fetchToken();
      const url = `${API_BASE}/buses?lines=${encodeURIComponent(linea)}`;

      const response = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`API request failed: HTTP ${response.status}`);
      }

      const vehicles = (await response.json()) as VehicleItem[];
      const filtered = variante ? vehicles.filter((v) => v.subline === variante) : vehicles;

      const positions: BusPosition[] = filtered.map((v) => ({
        id_vehiculo: v.vehicleIdentificationNumber ?? String(v.id),
        latitud: v.location.coordinates[1],
        longitud: v.location.coordinates[0],
        velocidad: 0,
        destino: v.destination ?? v.subline ?? "",
        ultimo_reporte: v.timestamp,
      }));

      return { available: true, positions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        available: false,
        message: `Error al consultar GPS en tiempo real: ${message}`,
      };
    }
  }

  async fetchBusstops(): Promise<GpsBusstop[]> {
    const token = await this.fetchToken();
    const url = `${API_BASE}/buses/busstops`;
    const response = await this.fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`API request failed: HTTP ${response.status}`);
    }
    return (await response.json()) as GpsBusstop[];
  }

  async fetchUpcomingBuses(
    paradaId: number,
    lines: string[],
    amountPerLine?: number
  ): Promise<UpcomingBusesResult> {
    if (!this.clientId || !this.clientSecret) {
      return {
        available: false,
        message:
          "ETA en tiempo real no disponible. " +
          "Configura STM_CLIENT_ID y STM_CLIENT_SECRET para acceder a ETAs en tiempo real.",
      };
    }

    try {
      const token = await this.fetchToken();
      const amount = amountPerLine ?? 3;
      const url =
        `${API_BASE}/buses/busstops/${paradaId}/upcomingbuses` +
        `?lines=${encodeURIComponent(lines.join(","))}&amountperline=${amount}`;

      const response = await this.fetchFn(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error(`API request failed: HTTP ${response.status}`);
      }

      const data = (await response.json()) as UpcomingBusApiItem[];

      const buses: UpcomingBus[] = data.map((item) => ({
        linea: item.line ?? "",
        destino: item.destination ?? "",
        eta_segundos: item.eta ?? 0,
        distancia_metros: item.distance ?? 0,
      }));

      return { available: true, buses };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        available: false,
        message: `Error al consultar ETA en tiempo real: ${message}`,
      };
    }
  }
}

export const gpsClient = new GpsClient();
