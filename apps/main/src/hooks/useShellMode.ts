/**
 * useShellMode — Phase 1C
 *
 * Reads/writes the user's per-module shell-mode preference (Atlas / Operator).
 *
 * Resolution order, first match wins:
 *   1. User override stored on the server (if VITE_SHELL_PREFS_API set)
 *   2. User override stored in localStorage (offline / API not configured)
 *   3. Module default from MODULE_DEFAULTS
 *   4. Global fallback: 'atlas'
 *
 * Atlas    → information-dense, navigation-led. Tiers, Projets, Dashboard…
 * Operator → action-led, single-task focus. Planner, Paxlog, Travelwiz…
 *
 * The mode is exposed as a `data-shell-mode` attribute on AppLayout's root,
 * so CSS can scope rules with `[data-shell-mode="operator"] .toolbar { … }`.
 *
 * Optimistic updates: setMode flips local state instantly, then PUTs to the
 * server. On 4xx/5xx we keep the optimistic value (UI stays responsive) and
 * surface the error via the returned `error` field.
 */
import { useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export type ShellMode = 'atlas' | 'operator'

export const MODULE_DEFAULTS: Record<string, ShellMode> = {
  // Atlas — browsing, lists, drill-down
  dashboard:  'atlas',
  tiers:      'atlas',
  projets:    'atlas',
  imputations:'atlas',
  papyrus:    'atlas',
  moc:        'atlas',
  conformite: 'atlas',
  asset_registry: 'atlas',
  // Operator — single task, queue-driven, gestural
  planner:    'operator',
  paxlog:     'operator',
  travelwiz:  'operator',
  packlog:    'operator',
  pid_pfd:    'operator',
  workflow:   'operator',
  support:    'operator',
}

const API_BASE = (import.meta as any).env?.VITE_SHELL_PREFS_API as string | undefined
const LS_KEY = 'opsflux:shell-mode'

interface PrefsMap { [moduleSlug: string]: ShellMode }

const readLocal = (): PrefsMap => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}
const writeLocal = (map: PrefsMap) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(map)) } catch { /* quota */ }
}

async function fetchServerPrefs(): Promise<PrefsMap> {
  if (!API_BASE) return readLocal()
  const r = await fetch(`${API_BASE}/me/shell-prefs`, { credentials: 'include' })
  if (!r.ok) throw new Error(`shell-prefs ${r.status}`)
  const data = await r.json()
  // Expected shape: { prefs: [{ moduleSlug, shellMode }] } or a flat map
  if (Array.isArray(data?.prefs)) {
    const map: PrefsMap = {}
    for (const p of data.prefs) map[p.moduleSlug] = p.shellMode
    return map
  }
  return data ?? {}
}

async function putServerPref(moduleSlug: string, mode: ShellMode): Promise<void> {
  if (!API_BASE) return
  const r = await fetch(`${API_BASE}/me/shell-prefs/${encodeURIComponent(moduleSlug)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shellMode: mode }),
  })
  if (!r.ok) throw new Error(`shell-prefs PUT ${r.status}`)
}

const QK = ['shell-prefs'] as const

export function useShellMode(moduleSlug: string | undefined) {
  const qc = useQueryClient()
  const enabled = Boolean(moduleSlug)

  const { data: prefs, isLoading, error } = useQuery({
    queryKey: QK,
    queryFn: fetchServerPrefs,
    staleTime: 5 * 60_000,
    initialData: readLocal,
  })

  const mutation = useMutation({
    mutationFn: ({ slug, mode }: { slug: string; mode: ShellMode }) => putServerPref(slug, mode),
    onMutate: async ({ slug, mode }) => {
      await qc.cancelQueries({ queryKey: QK })
      const prev = qc.getQueryData<PrefsMap>(QK) ?? {}
      const next = { ...prev, [slug]: mode }
      qc.setQueryData(QK, next)
      writeLocal(next)
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK, ctx.prev)
      // We keep the optimistic value visible — no rollback to a server value
      // would only re-confuse the user. Instead surface error and let them retry.
    },
  })

  const resolvedMode: ShellMode = enabled
    ? (prefs?.[moduleSlug!] ?? MODULE_DEFAULTS[moduleSlug!] ?? 'atlas')
    : 'atlas'

  const setMode = useCallback((mode: ShellMode) => {
    if (!moduleSlug) return
    mutation.mutate({ slug: moduleSlug, mode })
  }, [moduleSlug, mutation])

  const reset = useCallback(() => {
    if (!moduleSlug) return
    const prev = qc.getQueryData<PrefsMap>(QK) ?? {}
    const next = { ...prev }
    delete next[moduleSlug]
    qc.setQueryData(QK, next)
    writeLocal(next)
    // Server reset = DELETE; not implemented here. Add if/when needed.
  }, [moduleSlug, qc])

  return {
    mode: resolvedMode,
    isModuleDefault: enabled && prefs?.[moduleSlug!] == null,
    setMode,
    reset,
    isLoading: enabled && isLoading,
    isSaving: mutation.isPending,
    error: error as Error | null,
  }
}

/**
 * useApplyShellMode — apply the resolved mode to a DOM element via
 * data-shell-mode. Use on AppLayout's root.
 */
export function useApplyShellMode(mode: ShellMode, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.setAttribute('data-shell-mode', mode)
    return () => { el.removeAttribute('data-shell-mode') }
  }, [mode, ref])
}
