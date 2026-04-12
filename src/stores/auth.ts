/**
 * Auth store — persisted via expo-secure-store.
 *
 * Holds JWT tokens, current user info, and selected entity.
 */

import { create } from "zustand";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  entityId: string | null;
  userId: string | null;
  userDisplayName: string | null;
  baseUrl: string;
  isAuthenticated: boolean;

  setTokens: (access: string, refresh: string) => void;
  setEntity: (entityId: string) => void;
  setUser: (userId: string, displayName: string) => void;
  setBaseUrl: (url: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  entityId: null,
  userId: null,
  userDisplayName: null,
  baseUrl: "https://api.opsflux.com",
  isAuthenticated: false,

  setTokens: (access, refresh) =>
    set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),

  setEntity: (entityId) => set({ entityId }),

  setUser: (userId, displayName) =>
    set({ userId, userDisplayName: displayName }),

  setBaseUrl: (url) => set({ baseUrl: url }),

  logout: () =>
    set({
      accessToken: null,
      refreshToken: null,
      entityId: null,
      userId: null,
      userDisplayName: null,
      isAuthenticated: false,
    }),
}));
