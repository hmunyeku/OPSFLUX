/**
 * DetachedPanelRenderer — Centralized registry for rendering detached panels.
 *
 * Each page module registers its panel content renderer via registerPanelRenderer().
 * When a panel is detached from DynamicPanelShell, it continues to render
 * the same content in a floating modal, even if the user navigates away.
 *
 * The DetachedPanelsPortal component renders all active detached panels
 * as floating, draggable, resizable modals via portal to document.body.
 */
import { useEffect } from 'react'
import type { DynamicPanelView } from '@/stores/uiStore'
import { DetachedPanelsContainer } from './DynamicPanel'

// ── Registry ────────────────────────────────────────────────
type PanelRenderer = (view: DynamicPanelView) => React.ReactNode | null

const renderers = new Map<string, PanelRenderer>()

/** Register a panel renderer for a given module name. Call from within your page component. */
export function registerPanelRenderer(module: string, renderer: PanelRenderer) {
  renderers.set(module, renderer)
}

/** Unregister (for cleanup when page unmounts — optional). */
export function unregisterPanelRenderer(module: string) {
  renderers.delete(module)
}

/**
 * Hook: register a panel renderer.
 * Renderers are NOT unregistered on unmount so that detached/pinned panels
 * can continue to render their content even after the user navigates away
 * from the source page. Renderers are idempotent — re-registering the same
 * module simply updates the function reference.
 */
export function usePanelRenderer(module: string, renderer: PanelRenderer) {
  useEffect(() => {
    registerPanelRenderer(module, renderer)
    // Intentionally no cleanup — renderers persist across navigation
    // so pinned/detached panels keep working on other pages.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module])
}

// ── Portal component ────────────────────────────────────────

export function DetachedPanelsPortal() {
  return (
    <DetachedPanelsContainer>
      {(panel) => {
        const renderer = renderers.get(panel.view.module)
        if (!renderer) {
          return (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Module « {panel.view.module} » non disponible.
            </div>
          )
        }
        return renderer(panel.view)
      }}
    </DetachedPanelsContainer>
  )
}
