/**
 * usePWA — Hook to manage PWA lifecycle state.
 *
 * Returns:
 *   isUpdateAvailable: true if a new service worker is waiting to activate
 *   isOfflineReady:    true if app has been cached for offline use
 *   update():          activates the new service worker and reloads
 *   dismissUpdate():   dismisses the update notification
 *
 * Integrates with vite-plugin-pwa's `virtual:pwa-register` module.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

interface PWAState {
  isUpdateAvailable: boolean
  isOfflineReady: boolean
  install: () => Promise<void>
  update: () => void
  dismissUpdate: () => void
}

export function usePWA(): PWAState {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false)
  const [isOfflineReady, setIsOfflineReady] = useState(false)
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)

  // Register service worker on mount
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setIsUpdateAvailable(true)
      },
      onOfflineReady() {
        setIsOfflineReady(true)
      },
      onRegisteredSW(_swUrl, registration) {
        // Check for updates every 60 minutes
        if (registration) {
          setInterval(() => {
            registration.update()
          }, 60 * 60 * 1000)
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration error:', error)
      },
    })

    updateSWRef.current = updateSW
  }, [])

  const install = useCallback(async () => {
    return
  }, [])

  const update = useCallback(() => {
    if (updateSWRef.current) {
      updateSWRef.current(true)
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    setIsUpdateAvailable(false)
  }, [])

  return {
    isUpdateAvailable,
    isOfflineReady,
    install,
    update,
    dismissUpdate,
  }
}
