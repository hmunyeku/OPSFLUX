"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useLanguages, type Language, type UserLanguagePreference } from "@/hooks/use-languages"

interface LanguageContextType {
  languages: Language[]
  currentLanguage: Language | null
  userPreference: UserLanguagePreference | null
  isLoading: boolean
  error: string | null
  changeLanguage: (languageId: string) => Promise<void>
  loadLanguages: () => Promise<Language[]>
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const {
    languages,
    currentLanguage,
    userPreference,
    isLoading,
    error,
    updateLanguagePreference,
    loadLanguages,
  } = useLanguages()

  const changeLanguage = async (languageId: string) => {
    console.log("🔧 LanguageContext: changeLanguage called with", languageId)
    try {
      await updateLanguagePreference(languageId)
      console.log("✅ LanguageContext: Language preference updated")
      // Recharger les langues pour synchroniser
      await loadLanguages()
    } catch (error) {
      console.error("❌ LanguageContext: Error updating language", error)
      throw error
    }
  }

  return (
    <LanguageContext.Provider
      value={{
        languages,
        currentLanguage,
        userPreference,
        isLoading,
        error,
        changeLanguage,
        loadLanguages,
      }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguageContext() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguageContext must be used within a LanguageProvider")
  }
  return context
}
