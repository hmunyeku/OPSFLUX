/**
 * Projets (Project Management) page — inspired by Gouti.
 *
 * This file composes the page shell, tab bar, and panel router.
 * Each tab and panel lives in its own file:
 *  - tabs/DashboardTab.tsx
 *  - tabs/ProjectsListTab.tsx
 *  - tabs/SpreadsheetTab.tsx
 *  - tabs/KanbanTab.tsx
 *  - panels/CreateProjectPanel.tsx
 *  - panels/ProjectDetailPanel.tsx
 *  - panels/GoutiImportModal.tsx (hosts the GoutiSyncToolbar split-button)
 *  - TaskDetailPanel.tsx (untouched)
 *  - shared.tsx (constants, types, small helpers)
 */
import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  FolderKanban, Plus, Sheet, CalendarRange, Layers, LayoutDashboard,
} from 'lucide-react'
import { PageNavBar } from '@/components/ui/Tabs'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { ProjectGanttWrapper } from './ProjectGanttWrapper'
import { TaskDetailPanel } from './TaskDetailPanel'
import type { ViewTab } from './shared'
import { DashboardView } from './tabs/DashboardTab'
import { ProjectsListView } from './tabs/ProjectsListTab'
import { SpreadsheetView } from './tabs/SpreadsheetTab'
import { KanbanView } from './tabs/KanbanTab'
import { CreateProjectPanel } from './panels/CreateProjectPanel'
import { ProjectDetailPanel } from './panels/ProjectDetailPanel'
import { GoutiSyncToolbar } from './panels/GoutiImportModal'

import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
// Re-export DashboardView for backward compatibility (previously exported
// from this file by the legacy dashboard migration path).
export { DashboardView }

// -- View Tabs ----------------------------------------------------------------

const PROJETS_TABS: { id: ViewTab; labelKey: string; icon: typeof FolderKanban }[] = [
  { id: 'dashboard', labelKey: 'projets.tabs.dashboard', icon: LayoutDashboard },
  { id: 'projets', labelKey: 'projets.tabs.projets', icon: FolderKanban },
  { id: 'tableur', labelKey: 'projets.tabs.tableur', icon: Sheet },
  { id: 'kanban', labelKey: 'projets.tabs.kanban', icon: Layers },
  { id: 'planning', labelKey: 'projets.tabs.planning', icon: CalendarRange },
]

const VALID_VIEW_TABS = new Set<ViewTab>(['dashboard', 'projets', 'tableur', 'kanban', 'planning'])

export function ProjetsPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/projets/', module: 'projets' }] })
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as ViewTab | null
  const [viewTab, setViewTabRaw] = useState<ViewTab>(
    tabFromUrl && VALID_VIEW_TABS.has(tabFromUrl) ? tabFromUrl : 'dashboard',
  )
  const setViewTab = useCallback((tab: ViewTab) => {
    setViewTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'projets'

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={FolderKanban} title={t('projets.title')} subtitle={t('projets.subtitle')}>
          {viewTab !== 'dashboard' && <GoutiSyncToolbar />}
          {viewTab !== 'dashboard' && <ToolbarButton icon={Plus} label={t('projets.create')} variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'projets' })} />}
        </PanelHeader>

        {/* Tab bar — sits below the title bar; rightSlot hosts the
            dashboard "Modifier" toolbar via portal when on the dashboard tab. */}
        <PageNavBar
          items={PROJETS_TABS.map((tab) => ({ id: tab.id, icon: tab.icon, label: t(tab.labelKey) }))}
          activeId={viewTab}
          onTabChange={setViewTab}
          rightSlot={viewTab === 'dashboard' ? <div id="dash-toolbar-projets" /> : null}
        />

        <PanelContent scroll={viewTab === 'dashboard'}>
          {viewTab === 'projets' && <ProjectsListView />}
          {viewTab === 'tableur' && <SpreadsheetView />}
          {viewTab === 'kanban' && <KanbanView />}
          {viewTab === 'planning' && <ProjectGanttWrapper />}
          {viewTab === 'dashboard' && <div className="space-y-4 p-4"><ModuleDashboard module="projets" toolbarPortalId="dash-toolbar-projets" /></div>}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'create' && <CreateProjectPanel />}
      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'detail' && <ProjectDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'projets' && dynamicPanel.type === 'task-detail' && 'id' in dynamicPanel && (
        <TaskDetailPanel projectId={String(dynamicPanel.meta?.projectId ?? '')} taskId={dynamicPanel.id} />
      )}
    </div>
  )
}

registerPanelRenderer('projets', (view) => {
  if (view.type === 'create') return <CreateProjectPanel />
  if (view.type === 'detail' && 'id' in view) return <ProjectDetailPanel id={view.id} />
  if (view.type === 'task-detail' && 'id' in view && view.meta?.projectId) {
    return <TaskDetailPanel projectId={view.meta.projectId as string} taskId={view.id} />
  }
  return null
})
