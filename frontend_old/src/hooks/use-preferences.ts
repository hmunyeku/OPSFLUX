"use client"

import { useState, useEffect } from 'react'
import { defaultPreferences, type UserPreferences } from '@/types/preferences'
import {
  getAllUserPreferences,
  bulkUpdateUserPreferences,
  resetUserPreferences as apiResetUserPreferences,
} from '@/api/user-preferences'

const PREFERENCES_KEY = 'user-preferences'

export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Load preferences from database on mount (with localStorage fallback)
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // Try to load from API first
        const dbPreferences = await getAllUserPreferences()

        // Convert API format to UserPreferences format
        const converted: Partial<UserPreferences> = {}
        for (const [key, data] of Object.entries(dbPreferences)) {
          if (key in defaultPreferences) {
            converted[key as keyof UserPreferences] = data.value as never
          }
        }

        // Merge with defaults (defaults for any missing keys)
        const merged = { ...defaultPreferences, ...converted }
        setPreferences(merged)

        // Also save to localStorage for offline access
        try {
          localStorage.setItem(PREFERENCES_KEY, JSON.stringify(merged))
        } catch {
          // Silent fail on localStorage
        }
      } catch (_error) {
        // Fallback to localStorage if API fails (not authenticated, offline, etc.)
        try {
          const stored = localStorage.getItem(PREFERENCES_KEY)
          if (stored) {
            const parsed = JSON.parse(stored) as UserPreferences
            setPreferences({ ...defaultPreferences, ...parsed })
          }
        } catch {
          // Use defaults if both API and localStorage fail
          setPreferences(defaultPreferences)
        }
      } finally {
        setIsLoaded(true)
      }
    }

    loadPreferences()
  }, [])

  // Save preferences to both database and localStorage
  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const newPreferences = { ...prev, ...updates }

      // Optimistically update localStorage immediately
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPreferences))
      } catch {
        // Silent fail
      }

      // Sync to database in background (don't block UI)
      if (!isSyncing) {
        setIsSyncing(true)
        syncToDatabase(updates).finally(() => setIsSyncing(false))
      }

      return newPreferences
    })
  }

  // Sync preferences to database
  const syncToDatabase = async (updates: Partial<UserPreferences>) => {
    try {
      // Convert UserPreferences format to API format
      const preferencesPayload: Record<string, { value: unknown; type: string }> = {}

      for (const [key, value] of Object.entries(updates)) {
        // Determine type based on value
        let type = 'json'
        if (typeof value === 'string') type = 'string'
        else if (typeof value === 'number') type = 'number'
        else if (typeof value === 'boolean') type = 'boolean'

        preferencesPayload[key] = { value, type }
      }

      await bulkUpdateUserPreferences({
        preferences: preferencesPayload,
        module_id: null, // null for CORE UI preferences
      })
    } catch (_error) {
      // Failed to sync preferences to database - silent fail for better UX
      // Error is intentionally not logged to avoid console noise
    }
  }

  // Reset to default preferences
  const resetPreferences = async () => {
    setPreferences(defaultPreferences)

    // Update localStorage
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(defaultPreferences))
    } catch {
      // Silent fail
    }

    // Reset in database
    try {
      await apiResetUserPreferences(null) // null for CORE UI preferences
    } catch (_error) {
      // Failed to reset preferences in database - silent fail for better UX
      // Error is intentionally not logged to avoid console noise
    }
  }

  return {
    preferences,
    updatePreferences,
    resetPreferences,
    isLoaded,
    isSyncing,
  }
}
