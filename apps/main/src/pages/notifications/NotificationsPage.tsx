/**
 * NotificationsPage — thin entry point that opens the
 * NotificationsPanel as the standard right-side DynamicPanel and
 * redirects the URL back to the Home, so the user can deep-link to
 * /notifications without ending up on a stale full-screen page.
 *
 * The actual UI lives in NotificationsPanel.tsx and is registered as
 * a global panel renderer so any module/page can host it.
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/stores/uiStore'

// Side-effect import: registers the panel renderer for `notifications`
// so openDynamicPanel({ module: 'notifications', type: 'detail' })
// mounts the right component anywhere in the app.
import './NotificationsPanelRegister'

export function NotificationsPage() {
  const navigate = useNavigate()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  useEffect(() => {
    openDynamicPanel({
      type: 'detail',
      module: 'notifications',
      id: 'journal',
      meta: { subtype: 'journal' },
    })
    // Send the user back to the Home so the URL doesn't stay pinned to
    // /notifications (avoids back-button confusion when the panel is
    // closed). The panel itself is independent of the URL.
    navigate('/', { replace: true })
  }, [openDynamicPanel, navigate])

  return null
}
