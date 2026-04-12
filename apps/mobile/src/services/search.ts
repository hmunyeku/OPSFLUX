/** Global search — queries /api/v1/search for ADS, colis, missions, etc. */

import { api } from "./api";

export interface SearchResult {
  id: string;
  type: "ads" | "cargo" | "mission_notice" | "user" | "tier" | "project" | "voyage";
  title: string;
  subtitle: string | null;
  reference: string | null;
  status: string | null;
  url: string | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

export async function globalSearch(query: string): Promise<SearchResponse> {
  const { data } = await api.get<SearchResponse>("/api/v1/search", {
    params: { q: query, limit: 30 },
  });
  return data;
}
