/**
 * API client for OpsFlux backend.
 *
 * Handles JWT auth, token refresh, and entity-scoped requests.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";

/** Base URL — configurable via env or settings screen. */
const DEFAULT_BASE_URL = "https://api.opsflux.com";

export const api = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
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

/** Auto-refresh on 401 (once), then retry the original request. */
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

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status !== 401 || originalRequest._retry) {
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

      const { data } = await axios.post(`${api.defaults.baseURL}/api/v1/auth/refresh`, {
        refresh_token: refreshToken,
      });
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
  api.defaults.baseURL = url;
}
