/**
 * TrackingSocket — robust WebSocket client for live vehicle GPS stream.
 *
 * One instance per vehicle subscription. Lifecycle mirrors the React
 * component that owns it: `start()` in effect, `stop()` on cleanup.
 *
 * Reliability features
 * --------------------
 *  - Exponential backoff reconnect (1s, 2s, 4s, 8s, 16s cap)
 *  - Client-side heartbeat every 25s; watchdog that forces a reconnect
 *    if no pong/message seen for 60s (detects half-open connections)
 *  - Token refresh-aware: when a "4001 authentication_failed" close
 *    code comes in, triggers the axios interceptor flow via a dummy
 *    GET, then reconnects with the new token
 *  - AppState aware: pauses while the app is in background (saves
 *    battery), reconnects on foreground
 *  - NetInfo aware: waits for actual connectivity before reconnecting
 *  - Drops stale messages: each emission carries a monotonic
 *    `seq` so consumers can ignore out-of-order frames
 */

import { AppState, AppStateStatus } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { useAuthStore } from "../stores/auth";
import { api } from "./api";

export interface DriverPosition {
  vector_id: string;
  lat: number;
  lon: number;
  heading?: number;
  speed_knots?: number;
  accuracy_m?: number;
  recorded_at: string;
  device_id?: string;
  /** Monotonic counter assigned by the client — consumers can use
   * it to detect out-of-order frames after reconnects. */
  seq: number;
}

export type TrackingStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "closed";

export interface TrackingEvents {
  onPosition?: (p: DriverPosition) => void;
  onStatus?: (s: TrackingStatus, detail?: string) => void;
}

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;
const CLIENT_PING_INTERVAL_MS = 25_000;
const WATCHDOG_TIMEOUT_MS = 60_000;

export class TrackingSocket {
  private ws: WebSocket | null = null;
  private status: TrackingStatus = "idle";
  private events: TrackingEvents;
  private vectorId: string;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  private backoffMs = INITIAL_BACKOFF_MS;
  private seq = 0;
  private stopped = false;
  private isForeground = AppState.currentState === "active";
  private isOnline = true;
  private tokenRefreshAttempted = false;

  private appStateSub: { remove: () => void } | null = null;
  private netInfoSub: (() => void) | null = null;

  constructor(vectorId: string, events: TrackingEvents = {}) {
    this.vectorId = vectorId;
    this.events = events;
  }

  /** Start listening. Idempotent. */
  start(): void {
    if (!this.stopped && this.ws) return; // already running
    this.stopped = false;
    this.tokenRefreshAttempted = false;

    this.appStateSub = AppState.addEventListener(
      "change",
      this._onAppStateChange
    );
    this.netInfoSub = NetInfo.addEventListener(this._onNetInfoChange);

    this._connect();
  }

  /** Stop listening and release all resources. */
  stop(): void {
    this.stopped = true;
    this._clearTimers();
    this.appStateSub?.remove();
    this.appStateSub = null;
    if (this.netInfoSub) {
      this.netInfoSub();
      this.netInfoSub = null;
    }
    if (this.ws) {
      try {
        this.ws.close(1000, "client_stopped");
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this._setStatus("closed");
  }

  // ── internals ─────────────────────────────────────────────────

  private _setStatus(s: TrackingStatus, detail?: string) {
    this.status = s;
    this.events.onStatus?.(s, detail);
  }

  private _connect() {
    if (this.stopped) return;
    if (!this.isForeground || !this.isOnline) {
      // Wait for foreground AND online — no point connecting otherwise
      this._setStatus("reconnecting");
      return;
    }

    const { accessToken, baseUrl } = useAuthStore.getState();
    if (!accessToken) {
      this._setStatus("unauthorized", "no_token");
      return;
    }

    const wsBase = baseUrl.replace(/^http/i, "ws").replace(/\/$/, "");
    const url = `${wsBase}/ws/tracking/${this.vectorId}?token=${encodeURIComponent(accessToken)}`;

    this._setStatus("connecting");

    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.backoffMs = INITIAL_BACKOFF_MS;
      this._setStatus("connected");
      this._startPingLoop();
      this._resetWatchdog();
    };

    this.ws.onmessage = (event) => {
      this._resetWatchdog();
      let msg: any;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      switch (msg.type) {
        case "position":
        case "snapshot": {
          const data = msg.data;
          if (!data || typeof data.lat !== "number" || typeof data.lon !== "number") {
            return;
          }
          this.seq += 1;
          this.events.onPosition?.({
            vector_id: data.vector_id ?? this.vectorId,
            lat: data.lat,
            lon: data.lon,
            heading: typeof data.heading === "number" ? data.heading : undefined,
            speed_knots:
              typeof data.speed_knots === "number" ? data.speed_knots : undefined,
            accuracy_m:
              typeof data.accuracy_m === "number" ? data.accuracy_m : undefined,
            recorded_at: data.recorded_at ?? new Date().toISOString(),
            device_id: data.device_id,
            seq: this.seq,
          });
          break;
        }
        case "ping":
          // Server keepalive — reply pong
          this._send({ type: "pong" });
          break;
        case "pong":
          // Server ack for our ping
          break;
        case "error":
          // Non-fatal server-emitted error (e.g. unknown message type)
          break;
      }
    };

    this.ws.onerror = () => {
      // onclose will follow — let it handle reconnect
    };

    this.ws.onclose = (event) => {
      this._clearTimers();
      this.ws = null;

      if (this.stopped) {
        this._setStatus("closed");
        return;
      }

      // Custom close codes from the backend
      if (event.code === 4001) {
        // Token expired/invalid — try one refresh then reconnect
        this._setStatus("unauthorized", event.reason);
        this._attemptTokenRefresh();
        return;
      }
      if (event.code === 4003) {
        // Not authorized for this vector — stop reconnecting
        this._setStatus("forbidden", event.reason);
        this.stop();
        return;
      }
      if (event.code === 4004) {
        this._setStatus("not_found", event.reason);
        this.stop();
        return;
      }

      // Network / server closed — retry with backoff
      this._scheduleReconnect();
    };
  }

  private async _attemptTokenRefresh() {
    if (this.tokenRefreshAttempted) {
      // Already tried once this session — give up
      this.stop();
      return;
    }
    this.tokenRefreshAttempted = true;
    try {
      // The axios 401 interceptor performs the refresh; a dummy auth-
      // gated GET triggers it if the access token is stale.
      await api.get("/api/v1/auth/me");
      // On success, the store now holds a fresh access token.
      this._scheduleReconnect(500); // fast reconnect
    } catch {
      // Refresh failed — user is effectively logged out
      this.stop();
    }
  }

  private _scheduleReconnect(delayMs?: number) {
    if (this.stopped) return;
    this._clearTimers();
    this._setStatus("reconnecting");

    const wait = delayMs ?? this.backoffMs;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      // Bump backoff for next time (up to cap)
      this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
      this._connect();
    }, wait);
  }

  private _startPingLoop() {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      this._send({ type: "ping" });
    }, CLIENT_PING_INTERVAL_MS);
  }

  private _resetWatchdog() {
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.watchdogTimer = setTimeout(() => {
      // No traffic for WATCHDOG_TIMEOUT_MS — force reconnect
      try {
        this.ws?.close(4000, "watchdog_timeout");
      } catch {
        /* noop */
      }
    }, WATCHDOG_TIMEOUT_MS);
  }

  private _clearTimers() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.watchdogTimer) clearTimeout(this.watchdogTimer);
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.watchdogTimer = null;
  }

  private _send(obj: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {
        /* noop — onclose will handle reconnect */
      }
    }
  }

  private _onAppStateChange = (next: AppStateStatus) => {
    const wasForeground = this.isForeground;
    this.isForeground = next === "active";
    if (!wasForeground && this.isForeground && !this.ws) {
      // Came back to foreground — reconnect immediately
      this.backoffMs = INITIAL_BACKOFF_MS;
      this._connect();
    } else if (wasForeground && !this.isForeground && this.ws) {
      // Going to background — close cleanly to save battery; reconnect
      // happens on next foreground event.
      try {
        this.ws.close(1000, "background");
      } catch {
        /* noop */
      }
    }
  };

  private _onNetInfoChange = (state: NetInfoState) => {
    const wasOnline = this.isOnline;
    this.isOnline = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (!wasOnline && this.isOnline && !this.ws) {
      // Network came back — reconnect fast
      this.backoffMs = INITIAL_BACKOFF_MS;
      this._connect();
    }
  };
}
