/**
 * popupBroadcast — minimal cross-window React Query cache sync.
 *
 * When a panel is detached as a real OS window (`window.open(...)`)
 * the parent and the popup each have their own QueryClient
 * instance. Without this module, a mutation in the popup wouldn't
 * refresh the parent's lists.
 *
 * Approach: a single `BroadcastChannel('opsflux-cache')` on which
 * every window publishes:
 *   - query invalidations after mutations (`{ kind: 'invalidate', queryKey }`)
 *   - cache writes after mutations (`{ kind: 'set', queryKey, data }`)
 *
 * Each listening window applies the invalidation to its own
 * QueryClient. Same-origin cookies + localStorage keep auth shared
 * automatically — only the React Query cache needs explicit sync.
 *
 * NOT meant to be a complete cross-tab cache mirror — we just keep
 * lists fresh. For UI-state Zustand sync, see `popupZustand` (TBD).
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query'

const CHANNEL_NAME = 'opsflux-cache'

interface InvalidateMessage {
  kind: 'invalidate'
  queryKey: QueryKey
  /** Origin window id — so we don't loop our own broadcast back. */
  origin: string
}

interface SetMessage {
  kind: 'set'
  queryKey: QueryKey
  data: unknown
  origin: string
}

type Message = InvalidateMessage | SetMessage

// Per-window stable id so we can ignore our own messages.
const WINDOW_ID = `w-${Math.random().toString(36).slice(2, 10)}`

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      // Some browsers / WebViews don't support it — degrade silently.
      return null
    }
  }
  return channel
}

/**
 * Wire a QueryClient up to the broadcast channel.
 *
 * Call once per window at app boot (root + popup). Returns a
 * detach function for testing / HMR cleanup.
 */
export function wireQueryClientBroadcast(client: QueryClient): () => void {
  const ch = getChannel()
  if (!ch) return () => {}

  // ── Outgoing: forward local invalidations to other windows ──
  // We hook into the QueryCache's events; every time a query is
  // invalidated locally (via mutation onSuccess / explicit
  // invalidateQueries), tell the others.
  const queryCache = client.getQueryCache()
  const unsubscribe = queryCache.subscribe((event) => {
    if (event.type !== 'updated') return
    const action = (event.action as { type?: string } | undefined)
    // Only forward on user-driven invalidations to keep the channel
    // quiet during boot / structuralSharing comparisons.
    if (action?.type !== 'invalidate') return
    const msg: InvalidateMessage = {
      kind: 'invalidate',
      queryKey: event.query.queryKey,
      origin: WINDOW_ID,
    }
    try { ch.postMessage(msg) } catch { /* channel may be closed */ }
  })

  // ── Incoming: apply remote invalidations to our cache ──
  const onMessage = (e: MessageEvent<Message>) => {
    const msg = e.data
    if (!msg || msg.origin === WINDOW_ID) return
    if (msg.kind === 'invalidate') {
      // Use { exact: false } so a partial key matches all sub-trees,
      // mirroring the standard invalidateQueries semantics.
      void client.invalidateQueries({ queryKey: msg.queryKey })
    } else if (msg.kind === 'set') {
      client.setQueryData(msg.queryKey, msg.data)
    }
  }
  ch.addEventListener('message', onMessage)

  return () => {
    unsubscribe()
    ch.removeEventListener('message', onMessage)
  }
}

/** Manually broadcast a cache write to other windows. */
export function broadcastSet(queryKey: QueryKey, data: unknown): void {
  const ch = getChannel()
  if (!ch) return
  const msg: SetMessage = { kind: 'set', queryKey, data, origin: WINDOW_ID }
  try { ch.postMessage(msg) } catch { /* noop */ }
}

/** Read the per-window id (used for debug overlays). */
export function getWindowId(): string {
  return WINDOW_ID
}
