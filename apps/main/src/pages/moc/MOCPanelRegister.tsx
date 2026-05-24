import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { MOCDetailPanel } from './panels/MOCDetailPanel'
import { MOCCreatePanel } from './panels/MOCCreatePanel'

registerPanelRenderer('moc', (view) => {
  if (view.type === 'create') return <MOCCreatePanel />
  if (view.type === 'detail' && 'id' in view) {
    return <MOCDetailPanel id={view.id} initialTab={view.meta?.tab === 'validation' ? 'validation' : undefined} />
  }
  return null
})
