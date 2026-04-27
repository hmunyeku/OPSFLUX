/**
 * Registers the `notifications` module renderer with the global
 * DetachedPanelRenderer / DynamicPanel system so any caller can do:
 *
 *     openDynamicPanel({
 *       type: 'detail',
 *       module: 'notifications',
 *       id: 'journal',
 *       meta: { subtype: 'journal' },
 *     })
 *
 * and get the proper NotificationsPanel mounted in the right dock.
 *
 * Imported as a side-effect module by NotificationBell + the legacy
 * /notifications route entry, so the registration runs the moment the
 * notifications surface is needed (no race with App.tsx route loading).
 */
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { NotificationsPanel } from './NotificationsPanel'

registerPanelRenderer('notifications', (view) => {
  if (view.type === 'detail') return <NotificationsPanel />
  return null
})
