/**
 * Secure storage for auth tokens — persists across app kills.
 *
 * Uses expo-secure-store (Keychain on iOS, EncryptedSharedPrefs on Android).
 */

import * as SecureStore from "expo-secure-store";
import { useAuthStore } from "../stores/auth";

const KEYS = {
  accessToken: "opsflux_access_token",
  refreshToken: "opsflux_refresh_token",
  entityId: "opsflux_entity_id",
  userId: "opsflux_user_id",
  displayName: "opsflux_display_name",
  baseUrl: "opsflux_base_url",
};

/** Save current auth state to secure storage. */
export async function persistAuth(): Promise<void> {
  const state = useAuthStore.getState();
  if (state.accessToken) await SecureStore.setItemAsync(KEYS.accessToken, state.accessToken);
  if (state.refreshToken) await SecureStore.setItemAsync(KEYS.refreshToken, state.refreshToken);
  if (state.entityId) await SecureStore.setItemAsync(KEYS.entityId, state.entityId);
  if (state.userId) await SecureStore.setItemAsync(KEYS.userId, state.userId);
  if (state.userDisplayName) await SecureStore.setItemAsync(KEYS.displayName, state.userDisplayName);
  if (state.baseUrl) await SecureStore.setItemAsync(KEYS.baseUrl, state.baseUrl);
}

/** Restore auth from secure storage (called on app launch). */
export async function restoreAuth(): Promise<boolean> {
  try {
    const accessToken = await SecureStore.getItemAsync(KEYS.accessToken);
    const refreshToken = await SecureStore.getItemAsync(KEYS.refreshToken);

    if (!accessToken || !refreshToken) return false;

    const entityId = await SecureStore.getItemAsync(KEYS.entityId);
    const userId = await SecureStore.getItemAsync(KEYS.userId);
    const displayName = await SecureStore.getItemAsync(KEYS.displayName);
    const baseUrl = await SecureStore.getItemAsync(KEYS.baseUrl);

    const store = useAuthStore.getState();
    store.setTokens(accessToken, refreshToken);
    if (entityId) store.setEntity(entityId);
    if (userId && displayName) store.setUser(userId, displayName);
    if (baseUrl) store.setBaseUrl(baseUrl);

    return true;
  } catch {
    return false;
  }
}

/** Clear all stored auth data (on logout). */
export async function clearPersistedAuth(): Promise<void> {
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key))
  );
}
