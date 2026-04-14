/** TravelWiz API calls — captain portal, voyages, manifests. */

import { api } from "./api";

// ── Types ─────────────────────────────────────────────────────────────

export interface CaptainAuthResult {
  valid: boolean;
  voyage_id: string;
  entity_id: string;
  voyage_code: string;
  vessel_name: string;
  scheduled_departure: string;
  session_token: string;
  session_expires_at: string;
}

export interface CaptainManifest {
  voyage: {
    id: string;
    code: string;
    status: string;
    vessel_name: string;
    scheduled_departure: string;
    scheduled_arrival: string;
    actual_departure: string | null;
    actual_arrival: string | null;
  };
  passengers: CaptainManifestPassenger[];
  cargo: CaptainManifestCargo[];
}

export interface CaptainManifestPassenger {
  id: string;
  name: string;
  company: string | null;
  boarding_status: string;
  priority_score: number;
  standby: boolean;
  declared_weight_kg: number | null;
}

export interface CaptainManifestCargo {
  id: string;
  reference: string;
  designation: string;
  weight_kg: number | null;
  status: string;
  hazmat: boolean;
  zone_name: string | null;
}

export interface CaptainLogCreate {
  log_type: string;
  content: string;
  coordinates_lat?: number;
  coordinates_lon?: number;
}

export interface CaptainLogRead {
  id: string;
  log_type: string;
  content: string;
  coordinates_lat: number | null;
  coordinates_lon: number | null;
  created_at: string;
  created_by_name: string | null;
}

// ── API Calls ─────────────────────────────────────────────────────────

/** Captain portal auth via 6-digit trip code. */
export async function captainAuthenticate(
  accessCode: string
): Promise<CaptainAuthResult> {
  const { data } = await api.post<CaptainAuthResult>(
    "/api/v1/travelwiz/captain/authenticate",
    null,
    { params: { access_code: accessCode } }
  );
  return data;
}

/** Get manifest for captain portal. */
export async function getCaptainManifest(
  voyageId: string,
  sessionToken: string
): Promise<CaptainManifest> {
  const { data } = await api.get<CaptainManifest>(
    `/api/v1/travelwiz/captain/${voyageId}/manifest`,
    { headers: { "X-Captain-Session": sessionToken } }
  );
  return data;
}

/** Post a captain event (departure, arrival, incident, etc.). */
export async function postCaptainEvent(
  voyageId: string,
  sessionToken: string,
  body: { event_type: string; notes?: string; coordinates_lat?: number; coordinates_lon?: number }
): Promise<void> {
  await api.post(
    `/api/v1/travelwiz/captain/${voyageId}/event`,
    body,
    { headers: { "X-Captain-Session": sessionToken } }
  );
}

/** Create captain log entry (requires normal auth, not captain session). */
export async function createCaptainLog(
  voyageId: string,
  body: CaptainLogCreate
): Promise<CaptainLogRead> {
  const { data } = await api.post<CaptainLogRead>(
    `/api/v1/travelwiz/voyages/${voyageId}/logs`,
    body
  );
  return data;
}

/** List captain logs for a voyage. */
export async function listCaptainLogs(
  voyageId: string
): Promise<CaptainLogRead[]> {
  const { data } = await api.get<CaptainLogRead[]>(
    `/api/v1/travelwiz/voyages/${voyageId}/logs`
  );
  return data;
}
