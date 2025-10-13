"use client"

import { useEffect } from "react"
import { useSidebar } from "@/components/ui/sidebar"
import { usePreferencesContext } from "@/contexts/preferences-context"

/**
 * Composant qui synchronise l'état de la sidebar avec la préférence utilisateur
 * au chargement de l'application
 */
export function SidebarSync() {
  const { setOpen } = useSidebar()
  const { preferences } = usePreferencesContext()

  useEffect(() => {
    // Synchroniser l'état de la sidebar avec la préférence utilisateur
    // sidebarCollapsed = true signifie que la sidebar doit être fermée (collapsed)
    // donc open = !sidebarCollapsed
    if (preferences.sidebarCollapsed !== undefined) {
      setOpen(!preferences.sidebarCollapsed)
    }
  }, [preferences.sidebarCollapsed, setOpen])

  // Ce composant ne rend rien
  return null
}
