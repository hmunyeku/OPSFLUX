/**
 * Federated global search.
 *
 * Hits multiple resource endpoints in parallel — but only those the
 * caller has permission to read. The mobile app composes the result
 * itself rather than relying on a single backend search endpoint
 * (which only knows about assets/tiers/users).
 *
 * Pass an array of permission slugs the caller already holds so we
 * gate calls without a round-trip.
 */

import { api } from "./api";

export type SearchResultType =
  | "ads"
  | "cargo"
  | "voyage"
  | "user"
  | "tier"
  | "asset";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  reference: string | null;
  status: string | null;
  /** Raw payload — used by detail navigation when extra context is needed. */
  raw?: Record<string, unknown>;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query: string;
}

interface FederatedOpts {
  /**
   * Wildcard-aware permission checker (`hasAny` from the permissions
   * store). Lets the search respect grants like `paxlog.*`.
   */
  hasAny: (perms: string[]) => boolean;
  /** Per-type cap. Default 5. */
  perTypeLimit?: number;
}

const PERMS_BY_TYPE: Record<SearchResultType, string[]> = {
  ads: ["paxlog.ads.read", "paxlog.ads.manage"],
  cargo: ["packlog.cargo.read", "packlog.cargo.manage"],
  voyage: ["travelwiz.voyage.read", "travelwiz.voyage.manage"],
  user: ["user.read", "core.users.read"],
  tier: ["tier.read"],
  asset: ["asset.read"],
};

/**
 * Composite full-text search. Runs requests in parallel and silently
 * drops sections the user can't read or that fail (so a single broken
 * upstream never breaks the whole search).
 */
export async function globalSearch(
  query: string,
  opts: FederatedOpts
): Promise<SearchResponse> {
  const q = query.trim();
  if (q.length < 2) {
    return { results: [], total: 0, query };
  }
  const limit = opts.perTypeLimit ?? 5;
  const out: SearchResult[] = [];

  const sections: Promise<SearchResult[]>[] = [];

  if (opts.hasAny(PERMS_BY_TYPE.ads)) {
    sections.push(
      api
        .get("/api/v1/pax/ads", {
          params: { search: q, page_size: limit },
        })
        .then((res) => {
          const items = res.data?.items ?? [];
          return items.map(
            (a: any): SearchResult => ({
              id: String(a.id),
              type: "ads",
              title: a.reference ?? "ADS",
              subtitle: a.visit_purpose ?? null,
              reference: a.reference ?? null,
              status: a.status ?? null,
              raw: a,
            })
          );
        })
        .catch(() => [])
    );
  }

  if (opts.hasAny(PERMS_BY_TYPE.cargo)) {
    sections.push(
      api
        .get("/api/v1/packlog/cargo", {
          params: { search: q, page_size: limit },
        })
        .then((res) => {
          const items = res.data?.items ?? [];
          return items.map(
            (c: any): SearchResult => ({
              id: String(c.id),
              type: "cargo",
              title: c.reference ?? "Colis",
              subtitle: c.description ?? c.recipient_name ?? null,
              reference: c.tracking_code ?? c.reference ?? null,
              status: c.status ?? null,
              raw: c,
            })
          );
        })
        .catch(() => [])
    );
  }

  if (opts.hasAny(PERMS_BY_TYPE.voyage)) {
    sections.push(
      api
        .get("/api/v1/travelwiz/voyages", {
          params: { search: q, page_size: limit },
        })
        .then((res) => {
          const items = res.data?.items ?? [];
          return items.map(
            (v: any): SearchResult => ({
              id: String(v.id),
              type: "voyage",
              title: v.reference ?? v.name ?? "Voyage",
              subtitle: v.route_name ?? v.vessel_name ?? null,
              reference: v.reference ?? null,
              status: v.status ?? null,
              raw: v,
            })
          );
        })
        .catch(() => [])
    );
  }

  // Falls back to the legacy /api/v1/search endpoint for cross-cutting
  // resources (assets, tiers, users) — already permission-checked
  // server-side.
  const wantsLegacy =
    opts.hasAny(PERMS_BY_TYPE.asset) ||
    opts.hasAny(PERMS_BY_TYPE.tier) ||
    opts.hasAny(PERMS_BY_TYPE.user);
  if (wantsLegacy) {
    sections.push(
      api
        .get("/api/v1/search", { params: { q, limit: limit * 3 } })
        .then((res) => {
          const items = res.data?.results ?? [];
          return items.map((r: any): SearchResult => {
            // Legacy endpoint returns "asset" and other generic types —
            // map them straight through, dropping anything the user
            // can't read locally as a defense in depth.
            return {
              id: String(r.id),
              type: r.type as SearchResultType,
              title: r.title ?? "—",
              subtitle: r.subtitle ?? null,
              reference: r.reference ?? null,
              status: r.status ?? null,
              raw: r,
            };
          });
        })
        .catch(() => [])
    );
  }

  const sectionResults = await Promise.all(sections);
  for (const block of sectionResults) {
    for (const r of block) {
      // Drop any type the user lacks permission to view (defense in depth).
      const required = PERMS_BY_TYPE[r.type] ?? [];
      if (required.length > 0 && !opts.hasAny(required)) continue;
      out.push(r);
    }
  }

  return { results: out, total: out.length, query };
}
