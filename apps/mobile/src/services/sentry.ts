/**
 * Sentry initialization — crash reporting + performance monitoring.
 *
 * Wraps @sentry/react-native with OpsFlux-specific configuration.
 * Only active when EXPO_PUBLIC_SENTRY_DSN is set.
 */

import * as Sentry from "@sentry/react-native";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const APP_ENV = process.env.APP_ENV ?? "development";

export function initSentry(): void {
  if (!DSN) return;

  Sentry.init({
    dsn: DSN,
    environment: APP_ENV,
    enableAutoSessionTracking: true,
    sessionTrackingIntervalMillis: 30_000,
    tracesSampleRate: APP_ENV === "production" ? 0.2 : 1.0,
    enableNativeFramesTracking: true,
    attachScreenshot: true,
    debug: APP_ENV === "development",
  });
}

/** Set the authenticated user context for Sentry. */
export function setSentryUser(user: {
  id: string;
  email?: string;
  displayName?: string;
}): void {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.displayName,
  });
}

/** Clear user context on logout. */
export function clearSentryUser(): void {
  Sentry.setUser(null);
}

/** Capture a handled exception with extra context. */
export function captureError(
  error: Error,
  context?: Record<string, unknown>
): void {
  if (context) {
    Sentry.setContext("extra", context);
  }
  Sentry.captureException(error);
}

/** Add a breadcrumb for navigation/action tracking. */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): void {
  Sentry.addBreadcrumb({
    category,
    message,
    data,
    level: "info",
  });
}

export { Sentry };
