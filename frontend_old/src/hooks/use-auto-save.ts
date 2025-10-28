/**
 * Hook pour auto-save avec tag "Modifié" et bouton annuler
 */

import { useState, useEffect, useRef, useCallback } from 'react'

export interface UseAutoSaveOptions<T> {
  /**
   * Fonction appelée pour sauvegarder les données
   */
  onSave: (data: T) => Promise<void>

  /**
   * Délai en secondes avant auto-save (défaut: 3)
   */
  delay?: number

  /**
   * Callback appelé quand une erreur survient
   */
  onError?: (error: Error) => void

  /**
   * Callback appelé quand la sauvegarde réussit
   */
  onSuccess?: () => void
}

export interface UseAutoSaveReturn {
  /**
   * Indique si des modifications sont en attente
   */
  isModified: boolean

  /**
   * Indique si une sauvegarde est en cours
   */
  isSaving: boolean

  /**
   * Temps restant avant auto-save (en secondes)
   */
  timeRemaining: number

  /**
   * Déclenche une modification (démarre le timer)
   */
  triggerChange: () => void

  /**
   * Annule la modification en cours
   */
  cancelChange: () => void

  /**
   * Force la sauvegarde immédiate
   */
  forceSave: () => Promise<void>
}

export function useAutoSave<T>(
  data: T,
  options: UseAutoSaveOptions<T>
): UseAutoSaveReturn {
  const { onSave, delay = 3, onError, onSuccess } = options

  const [isModified, setIsModified] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(0)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const savedDataRef = useRef<T>(data)
  const pendingDataRef = useRef<T>(data)

  // Nettoyer les timers
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  // Sauvegarder les données
  const performSave = useCallback(async () => {
    clearTimers()
    setIsSaving(true)

    try {
      await onSave(pendingDataRef.current)
      savedDataRef.current = pendingDataRef.current
      setIsModified(false)
      setTimeRemaining(0)
      onSuccess?.()
    } catch (error) {
      onError?.(error as Error)
    } finally {
      setIsSaving(false)
    }
  }, [onSave, onError, onSuccess, clearTimers])

  // Déclencher une modification
  const triggerChange = useCallback(() => {
    pendingDataRef.current = data
    setIsModified(true)
    setTimeRemaining(delay)
    clearTimers()

    // Timer pour auto-save
    timerRef.current = setTimeout(() => {
      performSave()
    }, delay * 1000)

    // Countdown pour affichage
    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev - 1
        if (next <= 0) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current)
            countdownRef.current = null
          }
        }
        return Math.max(0, next)
      })
    }, 1000)
  }, [data, delay, clearTimers, performSave])

  // Annuler la modification
  const cancelChange = useCallback(() => {
    clearTimers()
    pendingDataRef.current = savedDataRef.current
    setIsModified(false)
    setTimeRemaining(0)
  }, [clearTimers])

  // Forcer la sauvegarde
  const forceSave = useCallback(async () => {
    if (isModified && !isSaving) {
      await performSave()
    }
  }, [isModified, isSaving, performSave])

  // Nettoyer au démontage
  useEffect(() => {
    return () => {
      clearTimers()
    }
  }, [clearTimers])

  return {
    isModified,
    isSaving,
    timeRemaining,
    triggerChange,
    cancelChange,
    forceSave,
  }
}
