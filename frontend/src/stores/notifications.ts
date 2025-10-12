/**
 * Store Zustand pour les notifications
 * Gère les messages toast et notifications in-app
 */

import { create } from 'zustand'

export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
  timestamp: Date
}

interface NotificationsState {
  notifications: Notification[]
  unreadCount: number

  // Actions
  addNotification: (
    notification: Omit<Notification, 'id' | 'timestamp'>
  ) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) =>
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: new Date(),
      }
      return {
        notifications: [newNotification, ...state.notifications],
        unreadCount: state.unreadCount + 1,
      }
    }),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () =>
    set({
      notifications: [],
      unreadCount: 0,
    }),

  markAsRead: (_id) =>
    set((state) => ({
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllAsRead: () =>
    set({
      unreadCount: 0,
    }),
}))
