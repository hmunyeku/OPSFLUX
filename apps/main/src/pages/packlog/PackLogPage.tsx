import { Package, FileText } from 'lucide-react'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PanelHeader, ToolbarButton } from '@/components/layout/PanelHeader'
import { renderRegisteredPanel } from '@/components/layout/DetachedPanelRenderer'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { CargoTab, CargoWorkspaceProvider } from '@/pages/travelwiz/TravelWizPage'

export function PackLogPage() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const [searchParams, setSearchParams] = useSearchParams()

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'packlog'
  const canCreateRequest = hasPermission('packlog.cargo.create')
  const requestId = searchParams.get('request')
  const cargoId = searchParams.get('cargo')

  useEffect(() => {
    if (requestId && dynamicPanel?.module !== 'packlog') {
      openDynamicPanel({ type: 'detail', module: 'packlog', id: requestId, meta: { subtype: 'cargo-request' } })
      const next = new URLSearchParams(searchParams)
      next.delete('request')
      setSearchParams(next, { replace: true })
      return
    }
    if (cargoId && dynamicPanel?.module !== 'packlog') {
      openDynamicPanel({ type: 'detail', module: 'packlog', id: cargoId, meta: { subtype: 'cargo' } })
      const next = new URLSearchParams(searchParams)
      next.delete('cargo')
      setSearchParams(next, { replace: true })
    }
  }, [cargoId, dynamicPanel?.module, openDynamicPanel, requestId, searchParams, setSearchParams])

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

        {dynamicPanel?.module === 'packlog' && renderRegisteredPanel(dynamicPanel)}
      </div>
    </CargoWorkspaceProvider>
  )
}
