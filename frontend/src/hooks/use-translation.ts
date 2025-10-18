"use client"

import { useState, useEffect } from "react"
import { useLanguageContext } from "@/contexts/language-context"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.opsflux.io"

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

interface TranslationCache {
  [cacheKey: string]: {
    [key: string]: string
  }
}

// Cache global des traductions
const translationsCache: TranslationCache = {}

/**
 * Hook pour gérer les traductions i18n
 * @param namespaceCode Code du namespace (ex: "core.common", "module.hse")
 * @param options Options supplémentaires
 * @returns Fonction de traduction et état de chargement
 */
export function useTranslation(
  namespaceCode: string = "core.common",
  options: { enableFallback?: boolean } = { enableFallback: true }
) {
  const { currentLanguage, languages } = useLanguageContext()
  const [translations, setTranslations] = useState<{ [key: string]: string }>({})
  const [fallbackTranslations, setFallbackTranslations] = useState<{ [key: string]: string }>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadTranslations = async () => {
      if (!currentLanguage) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)

        // 1. Charger les traductions de la langue courante
        const cacheKey = `${namespaceCode}-${currentLanguage.code}`

        if (translationsCache[cacheKey]) {
          setTranslations(translationsCache[cacheKey])
        } else {
          const url = `${API_URL}/api/v1/languages/translations/export?namespace_code=${namespaceCode}&language_code=${currentLanguage.code}`
          const response = await fetch(url, {
            headers: getAuthHeaders(),
            cache: "no-store",
          })

          if (response.ok) {
            const data = await response.json()
            const translationsDict = data.translations || {}
            translationsCache[cacheKey] = translationsDict
            setTranslations(translationsDict)
          } else {
            setTranslations({})
          }
        }

        // 2. Si le fallback est activé et que la langue courante n'est pas la langue par défaut,
        //    charger les traductions de la langue par défaut en fallback
        if (options.enableFallback) {
          const defaultLanguage = languages.find((l) => l.is_default)

          if (defaultLanguage && defaultLanguage.code !== currentLanguage.code) {
            const fallbackCacheKey = `${namespaceCode}-${defaultLanguage.code}`

            if (translationsCache[fallbackCacheKey]) {
              setFallbackTranslations(translationsCache[fallbackCacheKey])
            } else {
              const fallbackUrl = `${API_URL}/api/v1/languages/translations/export?namespace_code=${namespaceCode}&language_code=${defaultLanguage.code}`
              const fallbackResponse = await fetch(fallbackUrl, {
                headers: getAuthHeaders(),
                cache: "no-store",
              })

              if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json()
                const fallbackDict = fallbackData.translations || {}
                translationsCache[fallbackCacheKey] = fallbackDict
                setFallbackTranslations(fallbackDict)
              } else {
                setFallbackTranslations({})
              }
            }
          } else {
            setFallbackTranslations({})
          }
        }
      } catch {
        setTranslations({})
        setFallbackTranslations({})
      } finally {
        setIsLoading(false)
      }
    }

    loadTranslations()
  }, [namespaceCode, currentLanguage, languages, options.enableFallback])

  /**
   * Fonction de traduction avec fallback automatique et interpolation
   * 1. Cherche dans les traductions de la langue courante
   * 2. Si non trouvé, cherche dans les traductions de la langue par défaut
   * 3. Si non trouvé, utilise le fallback manuel fourni
   * 4. Sinon, retourne la clé elle-même
   *
   * Support de l'interpolation : t("key", { name: "John" }) remplace {name} dans le texte
   */
  const t = (key: string, params?: Record<string, unknown> | string): string => {
    // Si params est une string, c'est un fallback simple (compatibilité)
    if (typeof params === "string") {
      return translations[key] || fallbackTranslations[key] || params || key
    }

    // Récupérer la traduction
    let text = translations[key] || fallbackTranslations[key] || key

    // Appliquer l'interpolation si des paramètres sont fournis
    if (params && typeof params === "object") {
      Object.keys(params).forEach((paramKey) => {
        const regex = new RegExp(`\\{${paramKey}\\}`, "g")
        text = text.replace(regex, String(params[paramKey]))
      })
    }

    return text
  }

  return {
    t,
    translations,
    fallbackTranslations,
    isLoading,
    currentLanguage,
  }
}

/**
 * Hook pour récupérer les traductions d'un module spécifique
 * @param moduleCode Code du module (ex: "hse", "hr", "finance")
 * @returns Fonction de traduction et état de chargement
 */
export function useModuleTranslation(moduleCode: string) {
  return useTranslation(`module.${moduleCode}`, { enableFallback: true })
}
