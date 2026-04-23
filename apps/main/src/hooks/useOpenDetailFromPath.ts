/**
 * useOpenDetailFromPath — open a detail panel based on the current
 * URL when the page mounts.
 *
 * Triggered by deep links coming from global search results or
 * notification links. The search API emits URLs like:
 *   /moc/{uuid}
 *   /projets/{uuid}
 *   /planner/activity/{uuid}
 *   /paxlog/ads/{uuid}
 *   /paxlog/incidents/{uuid}
 *   /travelwiz/voyages/{uuid}
 *   /packlog/cargo-requests/{uuid}
 *   /conformite/records/{uuid}
 *
 * The hook watches `pathname`, extracts the trailing UUID, and calls
 * `openDynamicPanel({ type: 'detail', module, id })`. The page's
 * own dispatcher (e.g. PaxLogPage, MOCPage) renders the matching
 * detail panel.
 *
 * Usage inside a module page:
 *   useOpenDetailFromPath({
 *     matchers: [
 *       { prefix: '/moc/', module: 'moc' },
 *     ],
 *   })
 *
 * Multiple matchers let one page (paxlog) cover several sub-routes
 * (/paxlog/ads/..., /paxlog/incidents/..., etc.) with different
 * `meta.subtype` values.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export interface DetailMatcher {
  /** Path prefix — e.g. '/moc/', '/paxlog/ads/'. Match is exact-prefix. */
  prefix: string
  /** Module id passed to openDynamicPanel. */
  module: string
  /** Optional meta appended to openDynamicPanel (e.g. subtype). */
  meta?: Record<string, unknown>
}

export interface UseOpenDetailFromPathOptions {
  matchers: DetailMatcher[]
  /** Default: true. Set false to temporarily disable (e.g. in wizards). */
  enabled?: boolean
}

export function useOpenDetailFromPath({
  matchers,
  enabled = true,
}: UseOpenDetailFromPathOptions): void {
  const { pathname } = useLocation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const lastHandledRef = useRef<string | null>(null)
  // Stabilise `matchers` by its serialised form: callers typically
  // pass a fresh array literal every render (inline), which would
  // re-run the effect every frame and fight with manual panel close.
  // Serialising is cheap here (handful of short strings) and lets the
  // effect dep change only when the shape actually changes.
  const matchersKey = JSON.stringify(matchers)
  const stableMatchers = useMemo(
    () => matchers,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [matchersKey],
  )

  useEffect(() => {
    if (!enabled) return
    // Guard: only act once per pathname so manually closing the
    // panel doesn't trigger a reopen on the next re-render.
    if (lastHandledRef.current === pathname) return

    for (const m of stableMatchers) {
      if (!pathname.startsWith(m.prefix)) continue
      const tail = pathname.slice(m.prefix.length)
      // Tail can be the bare UUID or UUID/… (nested segments). Match
      // the first UUID anywhere — it's always the primary key here.
      const match = tail.match(UUID_RE)
      if (!match) continue
      lastHandledRef.current = pathname
      openDynamicPanel({
        type: 'detail',
        module: m.module,
        id: match[0],
        ...(m.meta ? { meta: m.meta } : {}),
      })
      return
    }
  }, [pathname, enabled, stableMatchers, openDynamicPanel])
}
