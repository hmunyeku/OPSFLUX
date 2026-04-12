/** PaxLog API calls — ADS boarding scan and passenger management. */

import { api } from "./api";
import type {
  AdsBoardingContext,
  AdsBoardingPassenger,
  AdsSummary,
  PaginatedResponse,
} from "../types/api";

/** List ADS for the current entity. */
export async function listAds(params?: {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<AdsSummary>> {
  const { data } = await api.get<PaginatedResponse<AdsSummary>>(
    "/api/v1/paxlog/ads",
    { params }
  );
  return data;
}

/** Resolve a boarding QR token into a full boarding context. */
export async function getAdsBoardingScanContext(
  token: string
): Promise<AdsBoardingContext> {
  const { data } = await api.get<AdsBoardingContext>(
    `/api/v1/paxlog/ads/boarding/scan/${encodeURIComponent(token)}`
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
    `/api/v1/paxlog/ads/boarding/scan/${encodeURIComponent(token)}/passengers/${passengerId}`,
    { boarding_status: boardingStatus }
  );
  return data;
}
