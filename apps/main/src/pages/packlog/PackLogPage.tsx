import { Package, FileText } from 'lucide-react'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { CargoTab, CargoWorkspaceProvider } from '@/pages/travelwiz/TravelWizPage'

export function PackLogPage() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'packlog'
  const canCreateRequest = hasPermission('packlog.cargo.create') || hasPermission('travelwiz.cargo.create')

  return (
    <CargoWorkspaceProvider module="packlog" label="PackLog">
      <div className="flex h-full">
        {!isFullPanel && (
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <PanelHeader icon={Package} title="PackLog" subtitle="Colis et logistique">
              {canCreateRequest && (
                <ToolbarButton
                  icon={FileText}
                  label="Nouvelle demande"
                  onClick={() => openDynamicPanel({ type: 'create', module: 'packlog', meta: { subtype: 'cargo-request' } })}
                />
              )}
            </PanelHeader>
            <CargoTab />
          </div>
        )}
      </div>
    </CargoWorkspaceProvider>
  )
}
