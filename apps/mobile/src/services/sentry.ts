/**
 * Sentry initialization — crash reporting + performance monitoring.
 *
 * Only active when EXPO_PUBLIC_SENTRY_DSN is set.
 * Uses lazy import so missing/unlinked native Sentry module doesn't crash the app.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const APP_ENV = process.env.APP_ENV ?? "development";

let SentryLib: any = null;
let initialized = false;

async function loadSentry(): Promise<any> {
  if (SentryLib !== null) return SentryLib;
  try {
    // Lazy import — only loads native module if available
    const mod = await import("@sentry/react-native");
    SentryLib = mod;
    return mod;
  } catch {
    SentryLib = false; // mark as unavailable
    return null;
  }
}

export async function initSentry(): Promise<void> {
  if (!DSN || initialized) return;
  const Sentry = await loadSentry();
  if (!Sentry) return;

  try {
    Sentry.init({
      dsn: DSN,
      environment: APP_ENV,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30_000,
      tracesSampleRate: APP_ENV === "production" ? 0.2 : 1.0,
      debug: APP_ENV === "development",
    });
    initialized = true;
  } catch (err) {
    // Sentry init itself failed — not fatal
    if (__DEV__) console.warn("[Sentry] init failed:", err);
  }
}

export async function setSentryUser(user: {
  id: string;
  email?: string;
  displayName?: string;
}): Promise<void> {
  if (!initialized) return;
  try {
    SentryLib?.setUser({
      id: user.id,
      email: user.email,
      username: user.displayName,
    });
  } catch {}
}

export async function clearSentryUser(): Promise<void> {
  if (!initialized) return;
  try {
    SentryLib?.setUser(null);
  } catch {}
}

export async function captureError(
  error: Error,
  context?: Record<string, unknown>
): Promise<void> {
  if (!initialized) {
    if (__DEV__) console.error("[captureError]", error, context);
    return;
  }
  try {
    if (context) SentryLib?.setContext("extra", context);
    SentryLib?.captureException(error);
  } catch {}
}

export async function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (!initialized) return;
  try {
    SentryLib?.addBreadcrumb({ category, message, data, level: "info" });
  } catch {}
}
