/** PackLog API calls — cargo scanning, tracking, reception. */

import { api } from "./api";
import type {
  CargoRead,
  CargoTrackingRead,
  CargoComplianceCheck,
  CargoReceiptConfirm,
  PackageElement,
  PaginatedResponse,
} from "../types/api";

/** List cargo items for the current entity. */
export async function listCargo(params?: {
  search?: string;
  status?: string;
  cargo_type?: string;
  scope?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<CargoRead>> {
  const { data } = await api.get<PaginatedResponse<CargoRead>>(
    "/api/v1/packlog/cargo",
    { params }
  );
  return data;
}

/** Get a single cargo by ID. */
export async function getCargo(cargoId: string): Promise<CargoRead> {
  const { data } = await api.get<CargoRead>(
    `/api/v1/packlog/cargo/${cargoId}`
  );
  return data;
}

/** Public tracking by tracking code (no auth required). */
export async function getPublicCargoTracking(
  trackingCode: string
): Promise<CargoTrackingRead> {
  const { data } = await api.get<CargoTrackingRead>(
    `/api/v1/packlog/public/cargo/${encodeURIComponent(trackingCode)}`
  );
  return data;
}

/** Run compliance check for a cargo. */
export async function getCargoComplianceCheck(
  cargoId: string
): Promise<CargoComplianceCheck> {
  const { data } = await api.get<CargoComplianceCheck>(
    `/api/v1/packlog/cargo/${cargoId}/compliance-check`
  );
  return data;
}

/** List package elements for a cargo. */
export async function listPackageElements(
  cargoId: string
): Promise<PackageElement[]> {
  const { data } = await api.get<PackageElement[]>(
    `/api/v1/packlog/cargo/${cargoId}/elements`
  );
  return data;
}

/** Confirm reception of a cargo. */
export async function receiveCargo(
  cargoId: string,
  body: CargoReceiptConfirm
): Promise<CargoRead> {
  const { data } = await api.post<CargoRead>(
    `/api/v1/packlog/cargo/${cargoId}/receive`,
    body
  );
  return data;
}

/** Authenticated resolve: tracking_code → full CargoRead (with id). */
export async function getCargoByTrackingCode(
  trackingCode: string
): Promise<CargoRead> {
  const { data } = await api.get<CargoRead>(
    `/api/v1/packlog/cargo/by-tracking/${encodeURIComponent(trackingCode)}`
  );
  return data;
}

// ── Scan (GPS-stamped) ─────────────────────────────────────────────────────

export interface ScanMatchedLocation {
  id: string;
  name: string;
  code: string | null;
  distance_m: number;
  is_origin: boolean;
  is_destination: boolean;
}

export interface CargoScanRequest {
  lat: number;
  lon: number;
  accuracy_m?: number | null;
  scanned_at?: string | null;
  device_id?: string | null;
  note?: string | null;
}

export interface CargoScanResult {
  scan_event_id: string;
  cargo: CargoRead;
  scan: {
    lat: number;
    lon: number;
    accuracy_m: number | null;
    scanned_at: string;
  };
  matched_installation: ScanMatchedLocation | null;
  nearby_installations: ScanMatchedLocation[];
  radius_m: number;
  status_current: string;
  status_suggestion: string | null;
  status_suggestion_reason: string | null;
  can_update_status: boolean;
}

/** Record a GPS-stamped scan and get the location + status suggestion. */
export async function scanCargo(
  cargoId: string,
  payload: CargoScanRequest
): Promise<CargoScanResult> {
  const { data } = await api.post<CargoScanResult>(
    `/api/v1/packlog/cargo/${cargoId}/scan`,
    payload
  );
  return data;
}

export interface CargoScanConfirmRequest {
  scan_event_id: string;
  confirmed_asset_id?: string | null;
  new_status?: string | null;
  note?: string | null;
}

/** Apply the operator's confirmation (optional status change). */
export async function confirmCargoScan(
  cargoId: string,
  body: CargoScanConfirmRequest
): Promise<CargoRead> {
  const { data } = await api.post<CargoRead>(
    `/api/v1/packlog/cargo/${cargoId}/scan/confirm`,
    body
  );
  return data;
}

/** Build the URL to download the cargo label PDF. */
export function cargoLabelPdfPath(cargoId: string, language: string = "fr"): string {
  return `/api/v1/packlog/cargo/${cargoId}/label.pdf?language=${language}`;
}
