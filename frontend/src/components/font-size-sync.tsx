"use client"

import { useEffect } from "react"
import { usePreferencesContext } from "@/contexts/preferences-context"

/**
 * Composant qui applique la taille de police globalement selon les préférences
 */
export function FontSizeSync() {
  const { preferences } = usePreferencesContext()

  useEffect(() => {
    // Appliquer la taille de police au body
    const body = document.body

    // Supprimer les anciennes classes de taille de police
    body.classList.remove("text-sm", "text-base", "text-lg")

    // Appliquer la nouvelle classe selon la préférence
    switch (preferences.fontSize) {
      case "small":
        body.classList.add("text-sm")
        break
      case "normal":
        body.classList.add("text-base")
        break
      case "large":
        body.classList.add("text-lg")
        break
    }
  }, [preferences.fontSize])

  return null
}
