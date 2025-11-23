"use client"

import { useState, useEffect } from "react"

export type ServerStatus = "connected" | "connecting" | "disconnected"

// Get API URL - use proxy on localhost to avoid CORS
const getApiUrl = (): string => {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return ''; // Use Next.js proxy
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || '';
};

interface ServerStatusState {
  status: ServerStatus
  lastCheck: Date | null
  latency: number | null
}

/**
 * Hook pour surveiller l'état de la connexion au serveur backend
 * Vérifie périodiquement la disponibilité du serveur via un endpoint de health check
 */
export function useServerStatus() {
  const [state, setState] = useState<ServerStatusState>({
    status: "connecting",
    lastCheck: null,
    latency: null,
  })

  useEffect(() => {
    let intervalId: NodeJS.Timeout
    let isSubscribed = true

    const checkServerStatus = async () => {
      const startTime = Date.now()
      const apiUrl = getApiUrl()

      try {
        // Appeler l'endpoint health check public existant
        const response = await fetch(`${apiUrl}/api/v1/utils/health-check/`, {
          method: "GET",
          signal: AbortSignal.timeout(5000), // Timeout de 5 secondes
        })

        const latency = Date.now() - startTime

        // Si on reçoit une réponse OK (200), le serveur est accessible
        if (response.ok) {
          if (isSubscribed) {
            setState({
              status: "connected",
              lastCheck: new Date(),
              latency,
            })
          }
        } else {
          // Réponse HTTP mais pas 200 - considérer comme déconnecté
          throw new Error(`HTTP ${response.status}`)
        }
      } catch (error) {
        // Erreur réseau (timeout, DNS, connexion refusée, etc.) ou erreur HTTP
        if (isSubscribed) {
          setState({
            status: "disconnected",
            lastCheck: new Date(),
            latency: null,
          })
        }
      }
    }

    // Vérification initiale
    checkServerStatus()

    // Vérification périodique toutes les 30 secondes
    intervalId = setInterval(checkServerStatus, 30000)

    return () => {
      isSubscribed = false
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [])

  return state
}
