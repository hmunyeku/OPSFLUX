/**
 * ModuleDashboard — Reusable dashboard component scoped to a module.
 *
 * Each module embeds this component to display its own editable dashboard.
 * The toolbar (Modifier, Save, Cancel, Undo, Redo) is rendered via the
 * `toolbarSlot` render prop so the parent can place it in its own tab bar.
 *
 * Usage:
 *   <ModuleDashboard module="projets">
 *     {(toolbar) => (
 *       <div className="flex items-center">
 *         <TabBar ... />
 *         {toolbar}
 *       </div>
 *     )}
 *   </ModuleDashboard>
 *
 * Or without children — toolbar renders inline above the grid.
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Settings2, Check, X, Plus, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import {
  useDashboardTabs,
  useWidgetCatalog,
  useCreateDashboardTab,
} from '@/hooks/useDashboard'
import { DashboardGrid } from './DashboardGrid'
import { DashboardEditorLayout } from './DashboardEditorLayout'
import type { DashboardEditorHandle } from './DashboardEditorLayout'
import { DashboardFilterProvider } from './DashboardFilterContext'
import { DashboardFilterBar } from './DashboardFilterBar'
import type { DashboardWidget } from '@/services/dashboardService'

interface ModuleDashboardProps {
  module: string
  title?: string
  className?: string
  /** Render prop: receives toolbar JSX that the parent can place in its tab bar */
  children?: (toolbar: React.ReactNode) => React.ReactNode
  /**
   * Optional DOM id of an element where the dashboard's edit toolbar
   * (Modifier / Save / Cancel / Undo / Redo) should be portalled. Use
   * this so the toolbar lives in the host page's tab bar (via
   * `<TabBar rightSlot={<div id="..." />} />`) instead of floating
   * above the dashboard grid. When the target element exists, the
   * legacy floating toolbar is suppressed.
   */
  toolbarPortalId?: string
}

export function ModuleDashboard({ module, title, className, children, toolbarPortalId }: ModuleDashboardProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('dashboard.customize') || hasPermission('dashboard.admin')

  const { data: tabsData, isLoading: tabsLoading } = useDashboardTabs(module)
  const { data: catalog } = useWidgetCatalog()
  const createTab = useCreateDashboardTab()

  const [editMode, setEditMode] = useState(false)
  const editorRef = useRef<DashboardEditorHandle>(null)

  // Resolve the toolbar portal target lazily — the target div is
  // mounted by the host page (typically inside `<TabBar rightSlot>`)
  // so it may not exist on first render. We retry once after mount
  // to catch the case where the page renders the slot AFTER the
  // dashboard mounts.
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!toolbarPortalId) {
      setPortalEl(null)
      return
    }
    const el = document.getElementById(toolbarPortalId)
    setPortalEl(el)
    if (!el) {
      // Slot wasn't mounted yet — retry on next frame
      const id = requestAnimationFrame(() => {
        setPortalEl(document.getElementById(toolbarPortalId))
      })
      return () => cancelAnimationFrame(id)
    }
  }, [toolbarPortalId])

  const tab = tabsData?.mandatory?.[0] || tabsData?.personal?.[0] || null
  const widgets: DashboardWidget[] = Array.isArray(tab?.widgets) ? tab.widgets : []

  const handleCreateModuleTab = useCallback(async () => {
    if (tab) return
    try {
      await createTab.mutateAsync({ name: `${title || module}` })
    } catch { /* ignore */ }
  }, [tab, createTab, title, module])

  const moduleCatalog = (catalog || []).filter(
    (w) => !w.source_module || w.source_module === module || w.source_module === 'core'
  )

  // ── Toolbar JSX (can be placed by parent or rendered inline) ──
  const toolbarJsx = canEdit ? (
    <div className="flex items-center gap-1 ml-auto shrink-0">
      {editMode && (
        <>
          <button onClick={() => editorRef.current?.undo()} disabled={!editorRef.current?.canUndo}
            className="h-7 px-1.5 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" title="Annuler">
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => editorRef.current?.redo()} disabled={!editorRef.current?.canRedo}
            className="h-7 px-1.5 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" title="Refaire">
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button onClick={() => { editorRef.current?.flushSave(); setEditMode(false) }}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90">
            <Check className="h-3.5 w-3.5" />
            {t('dashboard.save_dashboard')}
          </button>
          <button onClick={() => { editorRef.current?.discardChanges(); setEditMode(false) }}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium hover:bg-muted text-muted-foreground">
            <X className="h-3.5 w-3.5" />
            Annuler
          </button>
        </>
      )}
      {!editMode && (
        <button onClick={() => setEditMode(true)}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors hover:bg-muted text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          {t('dashboard.edit_dashboard')}
        </button>
      )}
    </div>
  ) : null

  // ── No tab state — wait for data before deciding ──
  if (tabsLoading) return null

  if (!tab && !canEdit) return null

  if (!tab && canEdit) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-6 text-center', className)}>
        <p className="text-sm text-muted-foreground mb-3">{t('dashboard.no_module_dashboard')}</p>
        <button onClick={handleCreateModuleTab} disabled={createTab.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          {t('dashboard.create_module_dashboard', { module: title || module })}
        </button>
      </div>
    )
  }

  // When the host page provides a portal slot for the toolbar (via
  // `toolbarPortalId`), we send the edit toolbar there instead of
  // floating it over the grid. This is what makes the "Modifier"
  // button live inside the page's TabBar rightSlot rather than on
  // top of the dashboard.
  const usePortalToolbar = !!toolbarPortalId
  const portalledToolbar = usePortalToolbar && portalEl && toolbarJsx
    ? createPortal(toolbarJsx, portalEl)
    : null

  // ── Render ──
  const content = (
    <div className={cn('flex flex-col flex-1 min-h-0 relative', className)}>
      {/* Legacy floating toolbar — only when no portal target was
          requested. Pages that opt into the new tab-bar slot will see
          {portalledToolbar} render the toolbar inside the slot div. */}
      {!usePortalToolbar && !editMode && toolbarJsx && (
        <div className="absolute top-2 right-4 z-10">{toolbarJsx}</div>
      )}
      {portalledToolbar}
      {editMode && tab ? (
        <DashboardEditorLayout
          ref={editorRef}
          tabId={tab.id}
          initialWidgets={widgets}
          catalog={moduleCatalog}
          onExitEdit={() => setEditMode(false)}
        />
      ) : (
        <DashboardFilterProvider>
          <DashboardFilterBar />
          <div className="px-5 py-4">
            <DashboardGrid widgets={widgets} mode="view" />
          </div>
        </DashboardFilterProvider>
      )}
    </div>
  )

  // If parent provides a render prop, pass toolbar for external placement
  if (children) {
    return (
      <>
        {children(toolbarJsx)}
        {content}
      </>
    )
  }

  // Default: no separate toolbar bar — it floats inside content
  return (
    <div className={cn('flex flex-col', className)}>
      {content}
    </div>
  )
}
