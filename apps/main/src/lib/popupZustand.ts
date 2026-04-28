/**
 * popupZustand — minimal cross-window Zustand state sync.
 *
 * Companion of `popupBroadcast` (which syncs the React Query cache).
 * When a panel is detached as a real OS window (`window.open(...)`),
 * the parent and the popup each have their own Zustand store
 * instance — so toggling a UI flag in one window leaves the other
 * stale.
 *
 * Approach: a `BroadcastChannel('opsflux-store')` on which every
 * window publishes whitelisted state slices when they change, and
 * applies the same patches when received from a peer.
 *
 * Whitelist (not full mirror):
 *   We only sync UI ergonomics that benefit from being in lock-step
 *   across windows — search bar value, AI panel tab, dock side,
 *   etc. We deliberately DO NOT sync `dynamicPanel` /
 *   `detachedPanels` — those are per-window by design (the popup
 *   has its own panel, the parent has its own list of detached
 *   modals).
 *
 * Usage:
 *   import { syncedKeys, broadcastZustandPatch, attachZustandSync }
 *     from '@/lib/popupZustand'
 *   // In the store creator:
 *   const store = create<UIState>(...)
 *   attachZustandSync(store)
 */

const CHANNEL_NAME = 'opsflux-store'

interface PatchMessage {
  kind: 'patch'
  patch: Record<string, unknown>
  origin: string
}

const WINDOW_ID = `w-${Math.random().toString(36).slice(2, 10)}`
let applyingRemote = false
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null
  if (typeof BroadcastChannel === 'undefined') return null
  if (!channel) {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME)
    } catch {
      return null
    }
  }
  return channel
}

/**
 * Whitelisted keys to sync across windows.
 *
 * Anything NOT listed here stays per-window. Order matters
 * for nothing (we just iterate). Keep this list short — every
 * extra key is one more broadcast on every state change.
 */
export const SYNCED_KEYS = [
  'sidebarExpanded',
  'aiPanelOpen',
  'assistantTab',
  'dynamicPanelMode',
  'dynamicPanelDockSide',
  'globalSearch',
  'mobileSidebarOpen',
] as const

export type SyncedKey = (typeof SYNCED_KEYS)[number]

interface MinimalStore<S> {
  getState: () => S
  setState: (
    partial: Partial<S> | ((s: S) => Partial<S>),
    replace?: false,
  ) => void
  subscribe: (listener: (state: S, prev: S) => void) => () => void
}

/**
 * Attach broadcast sync to a Zustand store.
 *
 * Returns an unsubscribe function for HMR / tests.
 */
export function attachZustandSync<S>(
  store: MinimalStore<S>,
): () => void {
  const ch = getChannel()
  if (!ch) return () => {}

  // ── Outgoing: forward local changes on whitelisted keys ──
  const unsubscribe = store.subscribe((state, prev) => {
    if (applyingRemote) return
    const patch: Record<string, unknown> = {}
    let dirty = false
    for (const key of SYNCED_KEYS) {
      const s = state as unknown as Record<string, unknown>
      const p = prev as unknown as Record<string, unknown>
      if (s[key] !== p[key]) {
        patch[key] = s[key]
        dirty = true
      }
    }
    if (!dirty) return
    const msg: PatchMessage = { kind: 'patch', patch, origin: WINDOW_ID }
    try { ch.postMessage(msg) } catch { /* noop */ }
  })

  // ── Incoming: apply remote patches ──
  const onMessage = (e: MessageEvent<PatchMessage>) => {
    const msg = e.data
    if (!msg || msg.origin === WINDOW_ID || msg.kind !== 'patch') return
    applyingRemote = true
    try {
      store.setState(msg.patch as Partial<S>)
    } finally {
      Promise.resolve().then(() => { applyingRemote = false })
    }
  }
  ch.addEventListener('message', onMessage)

  return () => {
    unsubscribe()
    ch.removeEventListener('message', onMessage)
  }
}

export function getZustandWindowId(): string {
  return WINDOW_ID
}
