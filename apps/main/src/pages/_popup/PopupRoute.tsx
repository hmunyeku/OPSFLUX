/**
 * PopupRoute — minimal app shell rendered inside a real `window.open`
 * popup window. Lets the user drag a DynamicPanel to a separate
 * browser window (typically a second monitor) while staying in sync
 * with the parent.
 *
 * Sync guarantees (POC scope):
 *   ✅ Auth (cookies + localStorage same-origin)
 *   ✅ React Query cache (BroadcastChannel via `wireQueryClientBroadcast`)
 *   ✅ Theme (localStorage `theme` is shared)
 *   ✅ i18n language (localStorage `language` is shared, reload on change)
 *   ⚠️  Zustand UI store NOT synced — popup has its own dynamicPanel
 *      state, derived from URL params instead of the parent store.
 *   ⚠️  Closing the parent does not auto-close the popup (heartbeat TBD).
 *
 * URL contract:
 *   /_popup/:id?module=...&type=...&entity_id=...&meta=<urlencoded JSON>
 *
 *   The popup builds its own DynamicPanelView from these params and
 *   feeds it through `renderRegisteredPanel`. The corresponding page
 *   module is dynamic-imported so its panel renderers register
 *   themselves before the panel mounts (renderers register as a
 *   side-effect of the page module being loaded).
 */
import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import type { DynamicPanelView } from '@/stores/uiStore'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { useTranslation } from 'react-i18next'

// Dynamic-import the page module that owns the panel renderer for
// the requested module name. Each entry returns a Promise that
// resolves when the module is loaded — its `usePanelRenderer` /
// `registerPanelRenderer` side-effects then take effect.
//
// Adding a new module here is the only registration point — it
// keeps the popup bundle small (one module loaded per popup, not
// the whole app).
const MODULE_LOADERS: Record<string, () => Promise<unknown>> = {
  planner: () => import('@/pages/planner/PlannerPage'),
  projets: () => import('@/pages/projets/ProjetsPage'),
  paxlog: () => import('@/pages/paxlog/PaxLogPage'),
  packlog: () => import('@/pages/packlog/PackLogPage'),
  moc: () => import('@/pages/moc/MOCPage'),
  travelwiz: () => import('@/pages/travelwiz/TravelWizPage'),
  papyrus: () => import('@/pages/papyrus/PapyrusCorePage'),
  notifications: () => import('@/pages/notifications/NotificationsPanelRegister'),
  tiers: () => import('@/pages/tiers/TiersPage'),
  conformite: () => import('@/pages/conformite/ConformitePage'),
  entities: () => import('@/pages/entities/EntitiesPage'),
  settings: () => import('@/pages/settings/SettingsPage'),
  support: () => import('@/pages/support/SupportPage'),
  'asset-registry': () => import('@/pages/asset-registry/DetailPanels'),
  'pid-pfd': () => import('@/pages/pid-pfd/PidPfdPage'),
}

export function PopupRoute() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const [moduleReady, setModuleReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const moduleName = params.get('module') ?? ''
  const type = (params.get('type') ?? 'detail') as DynamicPanelView['type']
  const entityId = params.get('entity_id') ?? ''
  const metaRaw = params.get('meta')
  const meta = useMemo<Record<string, unknown> | undefined>(() => {
    if (!metaRaw) return undefined
    try {
      return JSON.parse(decodeURIComponent(metaRaw))
    } catch {
      return undefined
    }
  }, [metaRaw])

  // Build a synthetic DynamicPanelView from the URL — same shape as
  // the parent's `useUIStore.dynamicPanel` so the registered
  // renderer doesn't know it's inside a popup.
  const view = useMemo<DynamicPanelView | null>(() => {
    if (!moduleName) return null
    if (type === 'create') {
      return { type: 'create', module: moduleName, meta, data: undefined }
    }
    if (!entityId) return null
    return type === 'edit'
      ? { type: 'edit', module: moduleName, id: entityId, meta, data: undefined }
      : { type: 'detail', module: moduleName, id: entityId, meta, data: undefined }
  }, [moduleName, type, entityId, meta])

  // Dynamic-import the page module so its renderers register.
  useEffect(() => {
    if (!moduleName) return
    const loader = MODULE_LOADERS[moduleName]
    if (!loader) {
      setLoadError(`Module « ${moduleName} » non supporté en mode fenêtre détachée.`)
      return
    }
    let cancelled = false
    void loader()
      .then(() => { if (!cancelled) setModuleReady(true) })
      .catch((err) => {
        if (cancelled) return
        setLoadError(`Échec du chargement du module : ${String(err?.message ?? err)}`)
      })
    return () => { cancelled = true }
  }, [moduleName])

  // Title sync — show the panel module + entity in the OS window's
  // title bar so the user can identify the popup at a glance when
  // it's parked on another monitor.
  useEffect(() => {
    const base = moduleName ? moduleName.charAt(0).toUpperCase() + moduleName.slice(1) : 'OpsFlux'
    document.title = `${base} · ${type} · OpsFlux`
  }, [moduleName, type])

  // Heartbeat to the opener — tells the parent the popup is still
  // alive so it can show a "detached" indicator on the original
  // panel slot. POC: just emits "popup-ready"; parent ignores for
  // now.
  useEffect(() => {
    if (!window.opener || window.opener.closed) return
    try {
      ;(window.opener as Window).postMessage(
        { kind: 'opsflux-popup-ready', popupId: id, module: moduleName, type, entityId },
        window.location.origin,
      )
    } catch {
      // Cross-origin or closed opener — ignore.
    }
  }, [id, moduleName, type, entityId])

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center gap-3">
        <ExternalLink size={28} className="text-muted-foreground/50" />
        <h1 className="text-base font-semibold">{t('popup.load_error_title', 'Impossible de charger le panneau')}</h1>
        <p className="text-sm text-muted-foreground max-w-md">{loadError}</p>
        <button
          type="button"
          onClick={() => window.close()}
          className="gl-button gl-button-default mt-2"
        >
          {t('common.close', 'Fermer')}
        </button>
      </div>
    )
  }

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        {t('popup.invalid_url', 'Paramètres de fenêtre détachée invalides.')}
      </div>
    )
  }

  if (!moduleReady) {
    // Light placeholder — the heavy SkeletonDetailPanel is rendered
    // by the panel itself once it mounts.
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* No sidebar, no topbar — the popup is a focus surface. The
          rendered panel uses the standard DynamicPanelShell, which
          provides its own header (title, actions, close button).
          We feed it `inline` mode so it fills the popup viewport
          without extra chrome. */}
      <PanelHost view={view} />
    </div>
  )
}

/**
 * Host the registered renderer in inline mode so the panel fills
 * the popup's viewport. The renderer reads from `useUIStore` for
 * the current panel — but the popup's store is empty. We provide
 * the view directly via a render prop pattern.
 *
 * In practice most renderers don't read the store directly — they
 * receive the view via props from the registry helper. The
 * `DynamicPanelShell` they render uses the store for its actions
 * (close button) — we override `onClose` so it closes the popup.
 */
function PanelHost({ view }: { view: DynamicPanelView }) {
  // Bridge the popup's view to the global store so any consumer
  // that reads `useUIStore.dynamicPanel` (most panels do) gets the
  // expected shape. The popup's store is otherwise empty.
  useEffect(() => {
    // Lazy-import to avoid circular deps with the store at module
    // top.
    void import('@/stores/uiStore').then(({ useUIStore }) => {
      useUIStore.setState({ dynamicPanel: view, dynamicPanelMode: 'full' })
    })
  }, [view])

  // ── Window-close on panel close ──
  // The panel's close button calls store.closeDynamicPanel; the
  // popup intercepts that and closes the OS window instead so the
  // user never sees the popup with an empty body.
  useEffect(() => {
    void import('@/stores/uiStore').then(({ useUIStore }) => {
      const originalClose = useUIStore.getState().closeDynamicPanel
      useUIStore.setState({
        closeDynamicPanel: () => {
          originalClose()
          // Defer so any transition the panel runs (toast, etc.)
          // has a chance to fire before the window goes away.
          setTimeout(() => window.close(), 50)
        },
      })
    })
  }, [])

  const rendered = renderRegisteredPanel(view)
  if (!rendered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-muted-foreground">
        Module « {view.module} » non disponible.
      </div>
    )
  }
  return <>{rendered}</>
}

export default PopupRoute
