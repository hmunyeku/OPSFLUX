"use client"

import { useState, useEffect } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {
      "Content-Type": "application/json",
    }
  }

  const token = localStorage.getItem("access_token")
  if (!token) {
    return {
      "Content-Type": "application/json",
    }
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  }
}

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
      const url = `${API_URL}/api/v1/languages/?is_active=true`
      const response = await fetch(url, {
        headers: getAuthHeaders(),
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch languages: ${response.statusText}`)
      }

      const result = await response.json()
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
      const response = await fetch(`${API_URL}/api/v1/languages/preferences/me`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch user preference: ${response.statusText}`)
      }

      const data = await response.json()
      setUserPreference(data)
      return data
    } catch (_err) {
      return null
    }
  }

  // Mettre à jour la préférence de langue
  const updateLanguagePreference = async (languageId: string) => {
    try {
      const url = `${API_URL}/api/v1/languages/preferences/me?language_id=${languageId}`

      const response = await fetch(url, {
        method: "PUT",
        headers: getAuthHeaders(),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || "Failed to update language preference")
      }

      const data = await response.json()
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
