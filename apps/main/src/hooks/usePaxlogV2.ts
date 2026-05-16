/**
 * usePaxlogV2Enabled — kill-switch for the Paxlog "Pajamas++" v2 UI.
 *
 * The v2 refonte is ACTIVE BY DEFAULT (per product decision). This hook
 * only exists as a backend-driven rollback lever: if the v2 surfaces a
 * regression in production, an admin can disable it WITHOUT a redeploy by
 * setting the entity-scoped setting `paxlog.v2_enabled` to false.
 *
 * Resolution order:
 *   1. Entity setting `paxlog.v2_enabled` (boolean) — explicit override
 *   2. Hardcoded fallback: true (v2 on)
 *
 * Crucially the fallback is SYNCHRONOUS-safe: while the settings query is
 * in flight (data === undefined) we resolve to `true`, so there is no
 * v1→v2 flash on first paint — the app renders v2 immediately and only
 * downgrades to v1 if an explicit `false` is fetched.
 *
 * Pattern mirrors usePageSize.ts (same settings API + React Query cache).
 */
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { SettingRead } from '@/types/api'

const SETTING_KEY = 'paxlog.v2_enabled'
const STALE_TIME = 5 * 60_000 // 5 minutes — same as usePageSize

async function fetchPaxlogV2Setting(): Promise<boolean | null> {
  try {
    const { data } = await api.get<SettingRead[]>('/api/v1/settings', {
      params: { scope: 'entity' },
    })
    const setting = data.find((s) => s.key === SETTING_KEY)
    if (!setting) return null
    // Settings store wraps scalars as { v: <value> }; accept both shapes.
    const raw = (setting.value as { v?: unknown })?.v ?? setting.value
    if (typeof raw === 'boolean') return raw
    if (typeof raw === 'string') return raw.toLowerCase() !== 'false' && raw !== '0'
    if (typeof raw === 'number') return raw !== 0
    return null
  } catch {
    // Network/permission failure → don't break the page, fall back to v2.
    return null
  }
}

/**
 * Returns true when the Paxlog v2 UI should render.
 * Defaults to true (v2 on) — including during the in-flight window — so
 * the v2 surfaces are the canonical experience and v1 is only a manual
 * backend rollback target.
 */
export function usePaxlogV2Enabled(): boolean {
  const { data } = useQuery({
    queryKey: ['settings', 'entity', SETTING_KEY],
    queryFn: fetchPaxlogV2Setting,
    staleTime: STALE_TIME,
  })
  // data === undefined (loading) OR null (unset) → v2 on.
  // Only an explicit stored `false` downgrades to v1.
  return data !== false
}
