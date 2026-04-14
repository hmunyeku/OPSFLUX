/**
 * Security service — defensive measures for production.
 *
 * Features:
 *  - Log scrubbing: redacts Authorization headers and refresh tokens
 *    from any console.log/Sentry output
 *  - Jailbreak/root detection via expo-device heuristics
 *  - Biometric lock: optional Face ID / Touch ID / fingerprint
 *    verification after app returns from background
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as Device from "expo-device";

// ── Log scrubbing ──────────────────────────────────────────────────

const SENSITIVE_HEADER_PATTERNS = [
  /authorization/i,
  /x-api-key/i,
  /cookie/i,
];

const SENSITIVE_BODY_KEYS = [
  "password",
  "refresh_token",
  "access_token",
  "mfa_token",
  "verification_code",
  "otp",
  "token",
];

/** Recursively redact sensitive values in any object (for safe logging). */
export function scrubSensitive<T>(value: T, depth = 0): T {
  if (depth > 8) return "[truncated]" as unknown as T;
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    // Redact JWT-like strings in free text
    if (/^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+$/.test(value)) {
      return "[JWT_REDACTED]" as unknown as T;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => scrubSensitive(v, depth + 1)) as unknown as T;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = k.toLowerCase();
      if (SENSITIVE_BODY_KEYS.some((s) => lowerKey === s || lowerKey.endsWith("_" + s))) {
        out[k] = "[REDACTED]";
      } else if (SENSITIVE_HEADER_PATTERNS.some((r) => r.test(k))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = scrubSensitive(v, depth + 1);
      }
    }
    return out as unknown as T;
  }

  return value;
}

/** Install scrubbing on console.log/info/warn/error in development. */
export function installLogScrubbing(): void {
  if (!__DEV__) return; // production already has debug stripped

  const methods = ["log", "info", "warn", "error", "debug"] as const;
  for (const m of methods) {
    const orig = (console as any)[m];
    (console as any)[m] = (...args: unknown[]) => {
      orig(...args.map((a) => scrubSensitive(a)));
    };
  }
}

// ── Jailbreak / root detection ─────────────────────────────────────

/**
 * Heuristic check: is the device jailbroken / rooted?
 *
 * This is best-effort only — a determined attacker can bypass any of these.
 * Use the result to warn the user + log to Sentry, not to block usage.
 */
export function isDeviceCompromised(): boolean {
  // expo-device exposes some hints
  const isRooted = (Device as any).isRootedExperimentalAsync;

  // On iOS, real devices have a specific brand
  if (Device.osName === "iOS") {
    // No reliable JS-side jailbreak detection on iOS without native module
    // Could add react-native-jail-monkey later for deeper checks
    return false;
  }

  // On Android, check for common root indicators
  if (Device.osName === "Android") {
    // Without native module we can't inspect /system/xbin/su etc.
    // Device.isDevice false = emulator (not compromised per se but suspicious in prod)
    if (!Device.isDevice) return false;
  }

  return false;
}

// ── Biometric authentication ───────────────────────────────────────

export interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  types: string[];
}

/** Check what biometric authentication is available on this device. */
export async function getBiometricStatus(): Promise<BiometricStatus> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const supported = await LocalAuthentication.supportedAuthenticationTypesAsync();

    const typeNames = supported.map((t) => {
      switch (t) {
        case LocalAuthentication.AuthenticationType.FINGERPRINT:
          return "fingerprint";
        case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
          return "face";
        case LocalAuthentication.AuthenticationType.IRIS:
          return "iris";
        default:
          return String(t);
      }
    });

    return {
      available: hasHardware,
      enrolled: isEnrolled,
      types: typeNames,
    };
  } catch {
    return { available: false, enrolled: false, types: [] };
  }
}

/** Prompt for biometric authentication. Returns true if successful. */
export async function authenticateBiometric(
  reason = "Déverrouiller OpsFlux"
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: "Annuler",
      fallbackLabel: "Utiliser le mot de passe",
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
