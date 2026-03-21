/**
 * PWAUpdater — Renders toast notifications for PWA lifecycle events.
 *
 * Shows:
 *   - "Mise a jour disponible" with a refresh button when new SW is waiting
 *   - "Application prete pour le mode hors ligne" when SW finishes caching
 *
 * Must be rendered inside ToastProvider.
 */
import { useEffect, useRef } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { useToast } from '@/components/ui/Toast'

export function PWAUpdater() {
  const { isUpdateAvailable, isOfflineReady, update } = usePWA()
  const { toast } = useToast()
  const shownUpdateRef = useRef(false)
  const shownOfflineRef = useRef(false)

  // Show update available toast
  useEffect(() => {
    if (isUpdateAvailable && !shownUpdateRef.current) {
      shownUpdateRef.current = true
      toast({
        title: 'Mise à jour disponible',
        description: 'Une nouvelle version est disponible. Cliquez pour rafraîchir.',
        variant: 'default',
        duration: 0, // persistent until dismissed
      })
      // Auto-update after a short delay to let user see the toast
      setTimeout(() => {
        update()
      }, 3000)
    }
  }, [isUpdateAvailable, toast, update])

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
