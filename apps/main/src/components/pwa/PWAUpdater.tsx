/**
 * PWAUpdater — Side-effect component for PWA lifecycle.
 *
 * Since commit 5169038+ we AUTO-APPLY updates silently:
 *   - usePWA registers the SW with auto-reload on controllerchange
 *   - workbox precaches only JS/CSS/SVG (index.html comes from network)
 *   - the old "Mise à jour disponible" toast is no longer shown because
 *     the page auto-reloads before the user could have clicked it.
 *
 * We still mount the hook here so registerSW runs on app start.
 * Offline-ready toast kept because it's informational and non-disruptive.
 */
import { useEffect, useRef } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { useToast } from '@/components/ui/Toast'

export function PWAUpdater() {
  const { isOfflineReady } = usePWA()
  const { toast } = useToast()
  const shownOfflineRef = useRef(false)

  // Show offline ready toast
  useEffect(() => {
    if (isOfflineReady && !shownOfflineRef.current) {
      shownOfflineRef.current = true
      toast({
        title: 'Application prête pour le mode hors ligne',
        description: 'Le contenu a été mis en cache pour une utilisation hors ligne.',
        variant: 'success',
      })
    }
  }, [isOfflineReady, toast])

  // This component renders nothing visible — it's a side-effect component
  return null
}
