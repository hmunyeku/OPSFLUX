"use client"

import { useEffect, useRef } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { usePreferencesContext } from "@/contexts/preferences-context"

/**
 * Composant qui synchronise l'état de la sidebar avec la préférence utilisateur
 * de manière bidirectionnelle :
 * - Au chargement : préférences → sidebar
 * - Lors des changements : sidebar → préférences
 */
export function SidebarSync() {
  const { open, setOpen, isMobile } = useSidebar()
  const { preferences, updatePreferences } = usePreferencesContext()
  const isInitialMount = useRef(true)

  // Synchronisation initiale : préférences → sidebar
  useEffect(() => {
    if (isInitialMount.current && preferences.sidebarCollapsed !== undefined) {
      // Sur mobile, la sidebar doit toujours être fermée par défaut
      // Sur desktop, on utilise la préférence
      if (!isMobile) {
        // sidebarCollapsed = true signifie que la sidebar doit être fermée (collapsed)
        // donc open = !sidebarCollapsed
        setOpen(!preferences.sidebarCollapsed)
      }
      isInitialMount.current = false
    }
  }, [preferences.sidebarCollapsed, setOpen, isMobile])

  // Synchronisation continue : sidebar → préférences
  useEffect(() => {
    // Ne pas synchroniser au premier montage (déjà fait ci-dessus)
    // Ne pas synchroniser sur mobile (la sidebar mobile est un overlay temporaire)
    if (!isInitialMount.current && !isMobile) {
      const newCollapsedState = !open
      // Mettre à jour uniquement si la valeur a changé
      if (preferences.sidebarCollapsed !== newCollapsedState) {
        updatePreferences({ sidebarCollapsed: newCollapsedState })
      }
    }
  }, [open, preferences.sidebarCollapsed, updatePreferences, isMobile])

  // Ce composant ne rend rien
  return null
}
