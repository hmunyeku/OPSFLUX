/**
 * Lookup cache — pre-fetches and caches lookup data for offline use.
 *
 * Called during bootstrap to download reference data (assets, users, tiers, projects)
 * so that lookup fields work offline.
 *
 * Cache strategy:
 *  - Fetches first page (page_size=200) of each lookup source
 *  - Stored in AsyncStorage with 24h TTL
 *  - FieldLookup falls back to this cache when offline
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

const LOOKUP_CACHE_PREFIX = "@opsflux:lookup:";
const LOOKUP_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedLookup {
  items: unknown[];
  cachedAt: number;
}

/** Pre-fetch lookup data for a set of endpoints. */
export async function prefetchLookups(
  endpoints: string[]
): Promise<void> {
  const unique = [...new Set(endpoints)];

  await Promise.allSettled(
    unique.map(async (endpoint) => {
      try {
        // Check if we already have a fresh cache
        const existing = await getCachedLookup(endpoint);
        if (existing) return; // still fresh

        const { data } = await api.get(endpoint, {
          params: { page_size: 200 },
        });
        const items = Array.isArray(data) ? data : data?.items ?? [];
        await setCachedLookup(endpoint, items);
      } catch {
        // Non-critical — lookup will just search live
      }
    })
  );
}

/** Get cached lookup items for an endpoint. Returns null if stale/missing. */
export async function getCachedLookup(
  endpoint: string
): Promise<unknown[] | null> {
  try {
    const key = `${LOOKUP_CACHE_PREFIX}${endpoint}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;

    const cached: CachedLookup = JSON.parse(raw);
    if (Date.now() - cached.cachedAt > LOOKUP_TTL) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return cached.items;
  } catch {
    return null;
  }
}

/** Store lookup items in cache. */
async function setCachedLookup(
  endpoint: string,
  items: unknown[]
): Promise<void> {
  const key = `${LOOKUP_CACHE_PREFIX}${endpoint}`;
  const cached: CachedLookup = { items, cachedAt: Date.now() };
  await AsyncStorage.setItem(key, JSON.stringify(cached));
}

/** Clear all lookup caches. */
export async function clearLookupCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const lookupKeys = keys.filter((k) => k.startsWith(LOOKUP_CACHE_PREFIX));
  if (lookupKeys.length) await AsyncStorage.multiRemove(lookupKeys);
}

/**
 * Extract all unique lookup endpoints from form definitions.
 * Used to know what to prefetch.
 */
export function extractLookupEndpoints(
  forms: Array<{ fields: Record<string, { lookup_source?: { endpoint?: string } }> }>
): string[] {
  const endpoints: string[] = [];
  for (const form of forms) {
    for (const field of Object.values(form.fields)) {
      if (field.lookup_source?.endpoint) {
        endpoints.push(field.lookup_source.endpoint);
      }
    }
  }
  return [...new Set(endpoints)];
}
