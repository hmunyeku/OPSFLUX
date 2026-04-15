/** PaxLog API calls — ADS boarding scan and passenger management. */

import { api } from "./api";
import { fetchWithOfflineFallback } from "./offline";
import type {
  AdsBoardingContext,
  AdsBoardingPassenger,
  AdsSummary,
  PaginatedResponse,
} from "../types/api";

/**
 * List ADS for the current entity.
 *
 * Offline-aware: when the device is offline and we have a cached
 * response, returns the cached list so the user can still browse
 * items loaded during the last online session.
 */
export async function listAds(params?: {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
  scope?: string;
}): Promise<PaginatedResponse<AdsSummary>> {
  const result = await fetchWithOfflineFallback<PaginatedResponse<AdsSummary>>(
    "/api/v1/pax/ads",
    params as Record<string, unknown> | undefined
  );
  return result.data;
}

/** Resolve a boarding QR token into a full boarding context. */
export async function getAdsBoardingScanContext(
  token: string
): Promise<AdsBoardingContext> {
  const { data } = await api.get<AdsBoardingContext>(
    `/api/v1/pax/ads/boarding/scan/${encodeURIComponent(token)}`
  );
  return data;
}

/** Update boarding status for a passenger from an ADS QR scan. */
export async function updateAdsBoardingPassenger(
  token: string,
  passengerId: string,
  boardingStatus: "pending" | "boarded" | "no_show" | "offloaded"
): Promise<AdsBoardingPassenger> {
  const { data } = await api.post<AdsBoardingPassenger>(
    `/api/v1/pax/ads/boarding/scan/${encodeURIComponent(token)}/passengers/${passengerId}`,
    { boarding_status: boardingStatus }
  );
  return data;
}
