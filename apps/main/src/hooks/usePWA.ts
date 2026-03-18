/**
 * usePWA — Hook to manage PWA lifecycle state.
 *
 * Returns:
 *   isInstallable:     true if the app can be installed (beforeinstallprompt fired)
 *   isUpdateAvailable: true if a new service worker is waiting to activate
 *   isOfflineReady:    true if app has been cached for offline use
 *   install():         triggers the PWA install prompt
 *   update():          activates the new service worker and reloads
 *   dismissUpdate():   dismisses the update notification
 *
 * Integrates with vite-plugin-pwa's `virtual:pwa-register` module.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { registerSW } from 'virtual:pwa-register'

interface PWAState {
  isInstallable: boolean
  isUpdateAvailable: boolean
  isOfflineReady: boolean
  install: () => Promise<void>
  update: () => void
  dismissUpdate: () => void
}

// ── Module-level state to share across hook instances ──────────

let deferredPrompt: BeforeInstallPromptEvent | null = null

// BeforeInstallPromptEvent is not in standard TS lib — declare it
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

export function usePWA(): PWAState {
  const [isInstallable, setIsInstallable] = useState(false)
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

  // Listen for beforeinstallprompt (PWA install available)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt = e as BeforeInstallPromptEvent
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // Check if already installed (display-mode: standalone)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  // Listen for appinstalled
  useEffect(() => {
    const handler = () => {
      setIsInstallable(false)
      deferredPrompt = null
    }
    window.addEventListener('appinstalled', handler)
    return () => window.removeEventListener('appinstalled', handler)
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstallable(false)
    }
    deferredPrompt = null
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
    isInstallable,
    isUpdateAvailable,
    isOfflineReady,
    install,
    update,
    dismissUpdate,
  }
}
