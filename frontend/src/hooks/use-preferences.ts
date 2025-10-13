"use client"

import { useState, useEffect } from 'react'
import { defaultPreferences, type UserPreferences } from '@/types/preferences'

const PREFERENCES_KEY = 'user-preferences'

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PREFERENCES_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as UserPreferences
        setPreferences({ ...defaultPreferences, ...parsed })
      }
    } catch {
      // Silent fail - use default preferences
    } finally {
      setIsLoaded(true)
    }
  }, [])

  // Save preferences to localStorage
  const updatePreferences = (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const newPreferences = { ...prev, ...updates }
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPreferences))
      } catch {
        // Silent fail
      }
      return newPreferences
    })
  }

  // Reset to default preferences
  const resetPreferences = () => {
    setPreferences(defaultPreferences)
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(defaultPreferences))
    } catch {
      // Silent fail
    }
  }

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    isLoaded,
  }
}
