/** Mission Notice API calls — create and manage mission requests. */

import { api } from "./api";
import type { PaginatedResponse } from "../types/api";

// ── Types ─────────────────────────────────────────────────────────────

export interface MissionNoticeCreate {
  title: string;
  description?: string;
  planned_start_date?: string;
  planned_end_date?: string;
  mission_type?: "standard" | "vip" | "regulatory" | "emergency";
  requires_badge?: boolean;
  requires_epi?: boolean;
  requires_visa?: boolean;
  eligible_displacement_allowance?: boolean;
  pax_quota?: number;
}

export interface MissionNoticeSummary {
  id: string;
  reference: string;
  title: string;
  status: string;
  mission_type: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  created_at: string;
}

export interface MissionNoticeRead extends MissionNoticeSummary {
  entity_id: string;
  description: string | null;
  created_by: string;
  requires_badge: boolean;
  requires_epi: boolean;
  requires_visa: boolean;
  eligible_displacement_allowance: boolean;
  pax_quota: number;
}

// ── API Calls ─────────────────────────────────────────────────────────

export async function listMissionNotices(params?: {
  search?: string;
  status?: string;
  page?: number;
  page_size?: number;
}): Promise<PaginatedResponse<MissionNoticeSummary>> {
  const { data } = await api.get<PaginatedResponse<MissionNoticeSummary>>(
    "/api/v1/paxlog/mission-notices",
    { params }
  );
  return data;
}

export async function getMissionNotice(
  id: string
): Promise<MissionNoticeRead> {
  const { data } = await api.get<MissionNoticeRead>(
    `/api/v1/paxlog/mission-notices/${id}`
  );
  return data;
}

export async function createMissionNotice(
  body: MissionNoticeCreate
): Promise<MissionNoticeRead> {
  const { data } = await api.post<MissionNoticeRead>(
    "/api/v1/paxlog/mission-notices",
    body
  );
  return data;
}
