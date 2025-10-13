import type { ThemeName } from '@/config/themes'

export interface UserPreferences {
  // Apparence
  colorTheme: ThemeName
  darkMode: 'light' | 'dark' | 'system'
  sidebarCollapsed: boolean

  // Langue et région
  language: 'en' | 'fr'
  timezone: string
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat: '12h' | '24h'

  // Notifications
  emailNotifications: boolean
  pushNotifications: boolean
  notificationSound: boolean

  // Autres
  itemsPerPage: 10 | 25 | 50 | 100
}

export const defaultPreferences: UserPreferences = {
  colorTheme: 'amethyst-haze',
  darkMode: 'system',
  sidebarCollapsed: false,
  language: 'fr',
  timezone: 'Europe/Paris',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  emailNotifications: true,
  pushNotifications: true,
  notificationSound: true,
  itemsPerPage: 25,
}
