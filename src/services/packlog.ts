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
