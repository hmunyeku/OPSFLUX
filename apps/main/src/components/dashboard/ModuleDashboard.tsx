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
import { useState, useCallback, useRef } from 'react'
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
import type { DashboardWidget } from '@/services/dashboardService'

interface ModuleDashboardProps {
  module: string
  title?: string
  className?: string
  /** Render prop: receives toolbar JSX that the parent can place in its tab bar */
  children?: (toolbar: React.ReactNode) => React.ReactNode
}

export function ModuleDashboard({ module, title, className, children }: ModuleDashboardProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('dashboard.customize') || hasPermission('dashboard.admin')

  const { data: tabsData } = useDashboardTabs(module)
  const { data: catalog } = useWidgetCatalog()
  const createTab = useCreateDashboardTab()

  const [editMode, setEditMode] = useState(false)
  const editorRef = useRef<DashboardEditorHandle>(null)

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

  // ── No tab state ──
  if (!tab && !canEdit) return null

  if (!tab && canEdit) {
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-6 text-center', className)}>
        <p className="text-sm text-muted-foreground mb-3">Aucun dashboard configure pour ce module.</p>
        <button onClick={handleCreateModuleTab} disabled={createTab.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" />
          Creer le dashboard {title || module}
        </button>
      </div>
    )
  }

  // ── Render ──
  const content = (
    <div className={cn('flex flex-col flex-1 min-h-0 relative', className)}>
      {/* Floating toolbar — overlays top-right of grid area */}
      {!editMode && toolbarJsx && (
        <div className="absolute top-2 right-4 z-10">{toolbarJsx}</div>
      )}
      {editMode && tab ? (
        <DashboardEditorLayout
          ref={editorRef}
          tabId={tab.id}
          initialWidgets={widgets}
          catalog={moduleCatalog}
          onExitEdit={() => setEditMode(false)}
        />
      ) : (
        <div className="p-4 pt-2">
          <DashboardGrid widgets={widgets} mode="view" />
        </div>
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
