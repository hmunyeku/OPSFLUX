/**
 * usePWA — Hook to manage PWA lifecycle state.
 *
 * Strategy: AUTO-APPLY updates with no user prompt.
 *   - registerSW { immediate: true, onNeedRefresh: auto-call updateSW(true) }
 *   - listen to navigator.serviceWorker.controllerchange → window.location.reload()
 *     once, so the user sees the new version immediately after a deploy
 *     instead of a stale "previous bundle" flash.
 *   - The workbox config precaches only JS/CSS/SVG (not HTML) so
 *     index.html is always fetched from the network, guaranteeing the
 *     correct current JS chunk hashes are referenced.
 *
 * Returns:
 *   isUpdateAvailable: kept for backwards compat — always false now
 *   isOfflineReady:    true once the app has been cached for offline use
 *   update/dismissUpdate: no-op (auto-applied)
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
  const reloadingRef = useRef(false)

  // Register service worker on mount
  useEffect(() => {
    // Listen for the controllerchange event fired when a new SW takes
    // over. Reload ONCE so the page picks up the fresh JS chunks.
    const onControllerChange = () => {
      if (reloadingRef.current) return
      reloadingRef.current = true
      window.location.reload()
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    }

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Auto-apply: tell workbox to skipWaiting + reload. The
        // controllerchange listener above will trigger the actual
        // window.reload() once the new SW has claimed the clients.
        // We also set the flag so any consumer of isUpdateAvailable
        // knows an update is in flight.
        setIsUpdateAvailable(true)
        updateSW(true).catch((err) => {
          console.error('[PWA] Auto-update failed:', err)
        })
      },
      onOfflineReady() {
        setIsOfflineReady(true)
      },
      onRegisteredSW(_swUrl, registration) {
        // Check for updates every 15 minutes (more aggressive than the
        // previous 60 minutes so fresh deploys propagate faster).
        if (registration) {
          setInterval(() => {
            registration.update()
          }, 15 * 60 * 1000)
        }
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration error:', error)
      },
    })

    updateSWRef.current = updateSW

    return () => {
      if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      }
    }
  }, [])

  const install = useCallback(async () => {
    return
  }, [])

  // Kept for backwards compat with any consumer that might still call it
  // manually — auto-apply already handles the common path.
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
