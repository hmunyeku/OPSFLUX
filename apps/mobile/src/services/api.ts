/**
 * API client for OpsFlux backend.
 *
 * Handles:
 *  - JWT auth header injection
 *  - Entity-scoped requests (X-Entity-Id header)
 *  - Auto-refresh on 401 (once) with request queue
 *  - Account blocked/suspended detection (403 with specific codes)
 *  - Maintenance mode detection (503)
 *  - App version header for server-side version checking
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";
import { useAppState } from "../stores/appState";

/** Current app version — must match app.config.ts. */
const APP_VERSION = "1.0.0";

/** Base URL — configurable via env or settings screen. HTTPS enforced. */
const DEFAULT_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://api.opsflux.io";

/** Refuse to use non-HTTPS URLs in production. */
function enforceHttps(url: string): string {
  if (!url) return DEFAULT_BASE_URL;
  if (__DEV__) return url; // allow http://localhost in dev
  if (!url.startsWith("https://")) {
    console.warn(`[Security] Rejected non-HTTPS URL: ${url}`);
    return DEFAULT_BASE_URL;
  }
  return url;
}

export const api = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15_000,
  headers: {
    "Content-Type": "application/json",
    "X-App-Version": APP_VERSION,
    "X-App-Platform": "mobile",
  },
});

// ── Automatic retry on network errors (1 retry after 2s) ─────────

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
  if (!config || config._retried) return Promise.reject(error);

  // Only retry on network errors (no response = network issue)
  if (error.response) return Promise.reject(error);

  config._retried = true;
  await new Promise((r) => setTimeout(r, 2000));
  return api(config);
});

/** Attach JWT access token + entity header to every request. */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const { accessToken, entityId } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (entityId) {
    config.headers["X-Entity-Id"] = entityId;
  }
  return config;
});

// ── Response interceptor: 401 refresh + 403 blocked + 503 maintenance ──

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  pendingQueue = [];
}

/** Error codes from the backend that mean the account is blocked. */
const ACCOUNT_BLOCK_CODES = [
  "account_blocked",
  "account_suspended",
  "account_deleted",
  "account_deactivated",
  "user_inactive",
];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const status = error.response?.status;
    const responseData = error.response?.data as any;
    const errorCode = responseData?.code ?? responseData?.error_code ?? "";
    const detail = responseData?.detail ?? "";

    // ── 403: Account blocked/suspended/deleted ────────────────────
    if (status === 403 && ACCOUNT_BLOCK_CODES.includes(errorCode)) {
      const reason = errorCode.replace("account_", "").replace("user_", "") as any;
      useAppState.getState().setAccountBlocked(reason || "blocked", detail);
      return Promise.reject(error);
    }

    // ── 403: Generic "account inactive" in detail string ──────────
    if (
      status === 403 &&
      (detail.includes("bloqué") ||
        detail.includes("blocked") ||
        detail.includes("suspended") ||
        detail.includes("désactivé") ||
        detail.includes("inactive"))
    ) {
      useAppState.getState().setAccountBlocked("blocked", detail);
      return Promise.reject(error);
    }

    // ── 426: Upgrade required (version too old) ───────────────────
    if (status === 426) {
      const requiredVersion = responseData?.min_version ?? "unknown";
      useAppState.getState().setUpdateRequired(true, requiredVersion, false);
      return Promise.reject(error);
    }

    // ── 503: Maintenance mode ─────────────────────────────────────
    if (status === 503) {
      useAppState.getState().setMaintenance(true, detail || "Maintenance en cours");
      return Promise.reject(error);
    }

    // ── 401: Token expired → try refresh ──────────────────────────
    if (status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(api(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { refreshToken } = useAuthStore.getState();
      if (!refreshToken) throw new Error("No refresh token");

      const { data } = await axios.post(
        `${api.defaults.baseURL}/api/v1/auth/refresh`,
        { refresh_token: refreshToken },
        { headers: { "X-App-Version": APP_VERSION } }
      );

      // Check if refresh response indicates account is blocked
      if (data.account_status && data.account_status !== "active") {
        useAppState.getState().setAccountBlocked(
          data.account_status as any,
          data.detail
        );
        processQueue(new Error("Account blocked"), null);
        return Promise.reject(error);
      }

      const newAccessToken: string = data.access_token;
      useAuthStore.getState().setTokens(newAccessToken, data.refresh_token);
      processQueue(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export function setBaseUrl(url: string) {
  api.defaults.baseURL = enforceHttps(url);
}

export { APP_VERSION };
