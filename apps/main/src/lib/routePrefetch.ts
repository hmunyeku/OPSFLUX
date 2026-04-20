/**
 * routePrefetch — kick off the dynamic-import of a route's bundle
 * when the user hints they're about to navigate there (hover,
 * focus, touch-start).
 *
 * Vite splits each `React.lazy(() => import('@/pages/foo'))` into its
 * own chunk. Without prefetch, the chunk is only requested AFTER
 * the click, adding ~100-400ms on a typical page. With prefetch,
 * the bundle is cached by the time the user actually clicks.
 *
 * Cache: each module is fetched at most once per session. The
 * browser then serves it from memory cache on the real navigation.
 *
 * Usage:
 *   <button onMouseEnter={() => prefetchRoute('/projets')} onClick={...}>
 */

const PREFETCHED = new Set<string>()

/**
 * Registry of prefetch loaders — maps a URL prefix to the dynamic
 * import call. Mirrors the Suspense-lazy routes in App.tsx. Adding
 * a new module = add one line here.
 *
 * Returning the promise lets callers `await` the prefetch in tests.
 */
const LOADERS: Record<string, () => Promise<unknown>> = {
  '/home':         () => import('@/pages/home/HomePage'),
  '/dashboard':    () => import('@/pages/dashboard/DashboardPage'),
  '/search':       () => import('@/pages/search/SearchPage'),
  '/assets':       () => import('@/pages/asset-registry/AssetRegistryPage'),
  '/entities':     () => import('@/pages/entities/EntitiesPage'),
  '/users':        () => import('@/pages/users/UsersPage'),
  '/tiers':        () => import('@/pages/tiers/TiersPage'),
  '/conformite':   () => import('@/pages/conformite/ConformitePage'),
  '/projets':      () => import('@/pages/projets/ProjetsPage'),
  '/workflow':     () => import('@/pages/workflow/WorkflowPage'),
  '/paxlog':       () => import('@/pages/paxlog/PaxLogPage'),
  '/planner':      () => import('@/pages/planner/PlannerPage'),
  '/travelwiz':    () => import('@/pages/travelwiz/TravelWizPage'),
  '/packlog':      () => import('@/pages/packlog/PackLogPage'),
  '/imputations':  () => import('@/pages/imputations/ImputationsPage'),
  '/papyrus':      () => import('@/pages/papyrus/PapyrusPage'),
  '/pid-pfd':      () => import('@/pages/pid-pfd/PidPfdPage'),
  '/files':        () => import('@/pages/files/FileManagerPage'),
  '/support':      () => import('@/pages/support/SupportPage'),
  '/moc':          () => import('@/pages/moc/MOCPage'),
  '/settings':     () => import('@/pages/settings/SettingsPage'),
}

function matchPrefix(path: string): string | null {
  // /moc/123/edit → /moc ; /settings/users/x → /settings ; /home → /home
  const root = '/' + (path.replace(/^\//, '').split('/')[0] || '')
  return LOADERS[root] ? root : null
}

export function prefetchRoute(path: string): void {
  const key = matchPrefix(path)
  if (!key) return
  if (PREFETCHED.has(key)) return
  PREFETCHED.add(key)
  // Fire and forget — no await so hover remains instant
  LOADERS[key]().catch(() => {
    // Network hiccup — remove from cache so a second hover tries again
    PREFETCHED.delete(key)
  })
}
