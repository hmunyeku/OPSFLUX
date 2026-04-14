/**
 * In-app notification service via WebSocket.
 *
 * Connects to /ws/notifications with JWT auth, receives real-time
 * notifications, and manages unread count.
 */

import { create } from "zustand";
import { useAuthStore } from "../stores/auth";

// ── Types ─────────────────────────────────────────────────────────────

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

interface NotificationState {
  connected: boolean;
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notif: AppNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
}

// ── Store ─────────────────────────────────────────────────────────────

export const useNotifications = create<NotificationState>((set, get) => ({
  connected: false,
  notifications: [],
  unreadCount: 0,

  addNotification: (notif) =>
    set((state) => ({
      notifications: [notif, ...state.notifications].slice(0, 100), // keep max 100
      unreadCount: state.unreadCount + (notif.read ? 0 : 1),
    })),

  markRead: (id) =>
    set((state) => {
      const notifs = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications: notifs,
        unreadCount: notifs.filter((n) => !n.read).length,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clear: () => set({ notifications: [], unreadCount: 0 }),
}));

// ── WebSocket Connection ──────────────────────────────────────────────

let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;

export function connectNotifications(): void {
  const { accessToken, baseUrl } = useAuthStore.getState();
  if (!accessToken || ws) return;

  const wsUrl = baseUrl
    .replace(/^http/, "ws")
    .replace(/\/$/, "");

  ws = new WebSocket(`${wsUrl}/ws/notifications?token=${accessToken}`);

  ws.onopen = () => {
    useNotifications.setState({ connected: true });

    // Keepalive ping every 25s
    pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "notification":
          useNotifications.getState().addNotification({
            id: msg.data.id,
            type: msg.data.notification_type ?? "info",
            title: msg.data.title ?? "",
            message: msg.data.message ?? "",
            data: msg.data,
            read: false,
            created_at: msg.data.created_at ?? new Date().toISOString(),
          });
          break;

        case "queued":
          // Batch of unread notifications on connect
          if (Array.isArray(msg.data)) {
            for (const item of msg.data) {
              useNotifications.getState().addNotification({
                id: item.id,
                type: item.notification_type ?? "info",
                title: item.title ?? "",
                message: item.message ?? "",
                data: item,
                read: false,
                created_at: item.created_at ?? new Date().toISOString(),
              });
            }
          }
          break;

        case "pong":
          // heartbeat response
          break;
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onclose = () => {
    cleanup();
    // Auto-reconnect after 5s
    reconnectTimeout = setTimeout(() => {
      if (useAuthStore.getState().isAuthenticated) {
        connectNotifications();
      }
    }, 5_000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function disconnectNotifications(): void {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  reconnectTimeout = null;
  cleanup();
  ws?.close();
  ws = null;
}

function cleanup() {
  useNotifications.setState({ connected: false });
  if (pingInterval) clearInterval(pingInterval);
  pingInterval = null;
}

/** Send mark_read to server via WebSocket. */
export function sendMarkRead(notificationId: string): void {
  useNotifications.getState().markRead(notificationId);
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "mark_read", data: { id: notificationId } }));
  }
}
