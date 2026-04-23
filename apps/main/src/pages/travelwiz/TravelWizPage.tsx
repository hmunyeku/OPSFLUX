/**
 * TravelWiz page — Dashboard, Voyages, Manifestes PAX, Cargo, Vecteurs.
 *
 * Static Panel: tab bar + DataTable per tab.
 * Dynamic Panel: create/detail forms per entity.
 */
import { useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plane, Ship, Package, FileText, Plus, LayoutDashboard,
  Repeat, CloudSun, Route, Map as MapIcon,
} from 'lucide-react'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { PageNavBar } from '@/components/ui/Tabs'
import { useUIStore } from '@/stores/uiStore'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { usePermission } from '@/hooks/usePermission'
import { ModuleDashboard } from '@/components/dashboard/ModuleDashboard'
import { CreateArticlePanel } from '@/pages/packlog/PackLogArticlePanels'

import type { TravelWizTab } from './shared'
import { VoyagesTab } from './tabs/VoyagesTab'
import { ManifestesTab } from './tabs/ManifestesTab'
import { CargoTab } from './tabs/CargoTab'
import { VecteursTab } from './tabs/VecteursTab'
import { RotationsTab } from './tabs/RotationsTab'
import { FleetMapTab } from './tabs/FleetMapTab'
import { PickupTab } from './tabs/PickupTab'
import { WeatherTab } from './tabs/WeatherTab'
import { CreateVoyagePanel } from './panels/VoyageCreatePanel'
import { CreateRotationPanel } from './panels/RotationCreatePanel'
import { CreateVectorPanel } from './panels/VectorCreatePanel'
import { VoyageDetailPanel } from './panels/VoyageDetailPanel'
import { VectorDetailPanel } from './panels/VectorDetailPanel'
import { RotationDetailPanel } from './panels/RotationDetailPanel'

import { useOpenDetailFromPath } from '@/hooks/useOpenDetailFromPath'
// Re-exports kept for backward compatibility with any external consumer.
export { CargoTab } from './tabs/CargoTab'
export { CreateCargoRequestPanel, CreateCargoPanel, CargoRequestDetailPanel } from './panels/CargoRequestPanels'

// ── Tab definitions ───────────────────────────────────────────

const TABS: { id: TravelWizTab; labelKey: string; icon: typeof Plane }[] = [
  { id: 'dashboard', labelKey: 'travelwiz.tabs.dashboard', icon: LayoutDashboard },
  { id: 'voyages', labelKey: 'travelwiz.tabs.voyages', icon: Plane },
  { id: 'manifests', labelKey: 'travelwiz.tabs.manifests_pax', icon: FileText },
  { id: 'vectors', labelKey: 'travelwiz.tabs.vectors', icon: Ship },
  { id: 'rotations', labelKey: 'travelwiz.tabs.rotations', icon: Repeat },
  { id: 'cargo', labelKey: 'travelwiz.tabs.cargo', icon: Package },
  { id: 'fleet_map', labelKey: 'travelwiz.tabs.fleet_map', icon: MapIcon },
  { id: 'pickup', labelKey: 'travelwiz.tabs.pickup', icon: Route },
  { id: 'weather', labelKey: 'travelwiz.tabs.weather', icon: CloudSun },
]

const VALID_TW_TABS = new Set<TravelWizTab>(['dashboard', 'voyages', 'manifests', 'vectors', 'rotations', 'cargo', 'fleet_map', 'pickup', 'weather'])

export function TravelWizPage() {
  useOpenDetailFromPath({ matchers: [{ prefix: '/travelwiz/voyages/', module: 'travelwiz', meta: { subtype: 'voyage' } }, { prefix: '/travelwiz/vectors/', module: 'travelwiz', meta: { subtype: 'vector' } }, { prefix: '/travelwiz/rotations/', module: 'travelwiz', meta: { subtype: 'rotation' } }] })
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TravelWizTab | null
  const [activeTab, setActiveTabRaw] = useState<TravelWizTab>(
    tabFromUrl && VALID_TW_TABS.has(tabFromUrl) ? tabFromUrl : 'dashboard',
  )
  const setActiveTab = useCallback((tab: TravelWizTab) => {
    setActiveTabRaw(tab)
    setSearchParams(tab === 'dashboard' ? {} : { tab }, { replace: true })
  }, [setSearchParams])
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'travelwiz'

  const { hasPermission } = usePermission()
  const canCreate =
    activeTab === 'voyages' ? hasPermission('travelwiz.voyage.create')
      : activeTab === 'vectors' ? hasPermission('travelwiz.vector.create')
        // travelwiz.rotation.create is not a registered perm. Rotations
        // are the nominal parents of voyages, so we gate on the same
        // voyage.create perm.
        : activeTab === 'rotations' ? hasPermission('travelwiz.voyage.create')
          : false

  const handleCreate = useCallback(() => {
    if (activeTab === 'voyages') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'voyage' } })
    else if (activeTab === 'vectors') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'vector' } })
    else if (activeTab === 'rotations') openDynamicPanel({ type: 'create', module: 'travelwiz', meta: { subtype: 'rotation' } })
  }, [activeTab, openDynamicPanel])

  const createLabel =
    activeTab === 'voyages' ? 'Nouveau voyage'
      : activeTab === 'vectors' ? 'Nouveau vecteur'
        : activeTab === 'rotations' ? 'Nouvelle rotation'
          : ''

  const showCreate = ['voyages', 'vectors', 'rotations'].includes(activeTab)

  return (
    <div className="flex h-full">
      {!isFullPanel && (
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <PanelHeader icon={Plane} title="TravelWiz" subtitle="Transport et logistique">
            {showCreate && canCreate && <ToolbarButton icon={Plus} label={createLabel} variant="primary" onClick={handleCreate} />}
          </PanelHeader>

          <PageNavBar
            items={TABS.map((tab) => ({ id: tab.id, icon: tab.icon, label: t(tab.labelKey) }))}
            activeId={activeTab}
            onTabChange={setActiveTab}
            rightSlot={activeTab === 'dashboard' ? <div id="dash-toolbar-travelwiz" /> : null}
          />

          {activeTab === 'dashboard' && <div className="flex-1 overflow-y-auto"><div className="space-y-4 p-4"><ModuleDashboard module="travelwiz" toolbarPortalId="dash-toolbar-travelwiz" /></div></div>}
          {activeTab === 'voyages' && <VoyagesTab />}
          {activeTab === 'manifests' && <ManifestesTab />}
          {activeTab === 'vectors' && <VecteursTab />}
          {activeTab === 'rotations' && <RotationsTab />}
          {activeTab === 'cargo' && <CargoTab />}
          {activeTab === 'fleet_map' && <FleetMapTab />}
          {activeTab === 'pickup' && <PickupTab />}
          {activeTab === 'weather' && <WeatherTab />}
        </div>
      )}

      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'voyage' && <CreateVoyagePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rotation' && <CreateRotationPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'vector' && <CreateVectorPanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'article' && <CreateArticlePanel />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'voyage' && <VoyageDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'rotation' && <RotationDetailPanel id={(dynamicPanel as { id: string }).id} />}
      {dynamicPanel?.module === 'travelwiz' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'vector' && <VectorDetailPanel id={(dynamicPanel as { id: string }).id} />}
    </div>
  )
}

registerPanelRenderer('travelwiz', (view) => {
  if (view.type === 'create') {
    if (view.meta?.subtype === 'voyage') return <CreateVoyagePanel />
    if (view.meta?.subtype === 'vector') return <CreateVectorPanel />
  }
  if (view.type === 'detail' && 'id' in view) {
    if (view.meta?.subtype === 'voyage') return <VoyageDetailPanel id={view.id} />
    if (view.meta?.subtype === 'vector') return <VectorDetailPanel id={view.id} />
  }
  return null
})
