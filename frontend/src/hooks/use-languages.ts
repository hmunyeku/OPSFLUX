"use client"

import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api-client"

export interface Language {
  id: string
  code: string
  name: string
  native_name: string
  flag_emoji: string | null
  direction: string
  is_active: boolean
  is_default: boolean
  display_order: number
  translation_progress: number
  created_at: string
  updated_at: string
}

export interface UserLanguagePreference {
  id: string
  user_id: string
  language_id: string
  fallback_language_id: string | null
}

export function useLanguages() {
  const [languages, setLanguages] = useState<Language[]>([])
  const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null)
  const [userPreference, setUserPreference] = useState<UserLanguagePreference | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Charger les langues disponibles
  const loadLanguages = async () => {
    try {
      const response = await apiClient.get("/api/v1/languages/", {
        params: { is_active: true }
      })

      const result = response.data as { data?: Language[] }
      const langs = result.data || []
      setLanguages(langs)
      return langs
    } catch (_err) {
      setError("Impossible de charger les langues")
      return []
    }
  }

  // Charger la préférence de langue de l'utilisateur
  const loadUserPreference = async () => {
    try {
      const response = await apiClient.get("/api/v1/languages/preferences/me")
      const data = response.data as UserLanguagePreference
      setUserPreference(data)
      return data
    } catch (_err) {
      return null
    }
  }

  // Mettre à jour la préférence de langue
  const updateLanguagePreference = async (languageId: string) => {
    try {
      const response = await apiClient.put("/api/v1/languages/preferences/me", null, {
        params: { language_id: languageId }
      })

      const data = response.data as UserLanguagePreference
      setUserPreference(data)

      // Mettre à jour la langue courante
      const lang = languages.find((l) => l.id === languageId)
      if (lang) {
        setCurrentLanguage(lang)
      }

      return data
    } catch (err) {
      setError("Impossible de mettre à jour la langue")
      throw err
    }
  }

  // Initialisation
  useEffect(() => {
    // Ne s'exécute que côté client
    if (typeof window === "undefined") {
      setIsLoading(false)
      return
    }

    const init = async () => {
      setIsLoading(true)
      const langs: Language[] = await loadLanguages()
      const pref = await loadUserPreference()

      if (pref && langs.length > 0) {
        const lang = langs.find((l: Language) => l.id === pref.language_id)
        if (lang) {
          setCurrentLanguage(lang)
        }
      } else if (langs.length > 0) {
        // Pas de préférence, utiliser la langue par défaut
        const defaultLang = langs.find((l: Language) => l.is_default)
        if (defaultLang) {
          setCurrentLanguage(defaultLang)
        }
      }

      setIsLoading(false)
    }

    init()
  }, [])

  return {
    languages,
    currentLanguage,
    userPreference,
    isLoading,
    error,
    updateLanguagePreference,
    loadLanguages,
  }
}
