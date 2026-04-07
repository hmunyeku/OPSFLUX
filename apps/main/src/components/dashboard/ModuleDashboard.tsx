/**
 * ModuleDashboard — Reusable dashboard component scoped to a module.
 *
 * Each module (PaxLog, Projets, TravelWiz, Assets, Planner, Conformite)
 * embeds this component to display its own editable dashboard with
 * module-contextual widgets. Admins can customize via the editor.
 *
 * Props:
 *   module   — module slug (e.g. "paxlog", "projets", "travelwiz")
 *   title    — display title for the dashboard section
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
}

export function ModuleDashboard({ module, title, className }: ModuleDashboardProps) {
  const { t } = useTranslation()
  const { hasPermission } = usePermission()
  const canEdit = hasPermission('dashboard.customize') || hasPermission('dashboard.admin')

  const { data: tabsData } = useDashboardTabs(module)
  const { data: catalog } = useWidgetCatalog()
  const createTab = useCreateDashboardTab()

  const [editMode, setEditMode] = useState(false)
  const editorRef = useRef<DashboardEditorHandle>(null)

  // Get the first mandatory tab for this module, or personal tab
  const tab = tabsData?.mandatory?.[0] || tabsData?.personal?.[0] || null
  const widgets: DashboardWidget[] = tab?.widgets || []

  // Create a personal module tab if none exists
  const handleCreateModuleTab = useCallback(async () => {
    if (tab) return // already has a tab
    try {
      await createTab.mutateAsync({ name: `${title || module}` })
    } catch { /* ignore */ }
  }, [tab, createTab, title, module])

  // Filter catalog to module-relevant widgets
  const moduleCatalog = (catalog || []).filter(
    (w) => !w.source_module || w.source_module === module || w.source_module === 'core'
  )

  if (!tab && !canEdit) {
    // No dashboard configured and user can't edit — show nothing
    return null
  }

  if (!tab && canEdit) {
    // No dashboard tab for this module — offer to create one
    return (
      <div className={cn('rounded-lg border border-dashed border-border p-6 text-center', className)}>
        <p className="text-sm text-muted-foreground mb-3">
          Aucun dashboard configure pour ce module.
        </p>
        <button
          onClick={handleCreateModuleTab}
          disabled={createTab.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Creer le dashboard {title || module}
        </button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between h-8 mb-2">
        {title && <span className="text-sm font-semibold text-foreground">{title}</span>}
        <div className="flex items-center gap-1 ml-auto">
          {canEdit && editMode && (
            <>
              <button
                onClick={() => editorRef.current?.undo()}
                disabled={!editorRef.current?.canUndo}
                className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Annuler"
              >
                <Undo2 className="h-3 w-3" />
              </button>
              <button
                onClick={() => editorRef.current?.redo()}
                disabled={!editorRef.current?.canRedo}
                className="h-6 px-1.5 rounded text-xs text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Refaire"
              >
                <Redo2 className="h-3 w-3" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
            </>
          )}
          {canEdit && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs text-muted-foreground hover:bg-muted"
            >
              <Settings2 className="h-3 w-3" />
              {t('dashboard.edit_dashboard')}
            </button>
          )}
          {canEdit && editMode && (
            <>
              <button
                onClick={() => { editorRef.current?.flushSave(); setEditMode(false) }}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Check className="h-3 w-3" />
                Enregistrer
              </button>
              <button
                onClick={() => { editorRef.current?.discardChanges(); setEditMode(false) }}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
                Annuler
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {editMode && tab ? (
        <DashboardEditorLayout
          ref={editorRef}
          tabId={tab.id}
          initialWidgets={widgets}
          catalog={moduleCatalog}
          onExitEdit={() => setEditMode(false)}
        />
      ) : (
        <DashboardGrid
          widgets={widgets}
          mode="view"
        />
      )}
    </div>
  )
}
