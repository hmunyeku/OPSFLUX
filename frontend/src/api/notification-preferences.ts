/**
 * API Client pour les préférences de notifications
 */

import { apiClient } from './client'

export interface NotificationPreferences {
  user_id: string
  notification_type: 'all' | 'mentions' | 'none'
  mobile_enabled: boolean
  communication_emails: boolean
  social_emails: boolean
  marketing_emails: boolean
  security_emails: boolean
  created_at: string
  updated_at: string
}

export interface NotificationPreferencesUpdate {
  notification_type?: 'all' | 'mentions' | 'none'
  mobile_enabled?: boolean
  communication_emails?: boolean
  social_emails?: boolean
  marketing_emails?: boolean
  security_emails?: boolean
}

/**
 * Récupère les préférences de notifications de l'utilisateur
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const response = await apiClient.get<NotificationPreferences>('/notifications/preferences')
  return response.data
}

/**
 * Met à jour les préférences de notifications
 */
export async function updateNotificationPreferences(
  preferences: NotificationPreferencesUpdate
): Promise<NotificationPreferences> {
  const response = await apiClient.put<NotificationPreferences>(
    '/notifications/preferences',
    preferences
  )
  return response.data
}

/**
 * Réinitialise les préférences aux valeurs par défaut
 */
export async function resetNotificationPreferences(): Promise<{ message: string }> {
  const response = await apiClient.delete<{ message: string }>('/notifications/preferences')
  return response.data
}
