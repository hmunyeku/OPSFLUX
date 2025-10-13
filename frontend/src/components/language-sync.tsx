"use client"

import { useEffect } from "react"
import { usePreferencesContext } from "@/contexts/preferences-context"

/**
 * Composant qui synchronise la langue de l'application avec la préférence utilisateur
 * au chargement de l'application
 */
export function LanguageSync() {
  const { preferences } = usePreferencesContext()

  useEffect(() => {
    // Synchroniser la langue avec la préférence utilisateur
    if (preferences.language) {
      // Mettre à jour le document HTML lang attribute
      document.documentElement.lang = preferences.language

      // Si vous avez une gestion de i18n, mettez à jour la langue ici
      // Par exemple: i18n.changeLanguage(preferences.language)
    }
  }, [preferences.language])

  // Ce composant ne rend rien
  return null
}
