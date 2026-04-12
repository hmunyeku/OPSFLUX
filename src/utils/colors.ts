/** OpsFlux brand colors — matching the web app palette. */

export const colors = {
  primary: "#1e3a5f",
  primaryLight: "#2a5080",
  primaryDark: "#0f2640",
  accent: "#f59e0b",
  accentLight: "#fbbf24",
  success: "#10b981",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  border: "#e2e8f0",
  textPrimary: "#1e293b",
  textSecondary: "#64748b",
  textMuted: "#94a3b8",
  textInverse: "#ffffff",
} as const;

export const statusColors: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#3b82f6",
  pending_validation: "#f59e0b",
  approved: "#10b981",
  rejected: "#ef4444",
  cancelled: "#6b7280",
  in_progress: "#8b5cf6",
  completed: "#059669",
  boarded: "#10b981",
  no_show: "#ef4444",
  offloaded: "#f59e0b",
  pending: "#94a3b8",
  // PackLog cargo statuses
  created: "#94a3b8",
  in_transit: "#3b82f6",
  delivered: "#10b981",
  received: "#059669",
  returned: "#f59e0b",
  // Compliance
  pass: "#10b981",
  fail: "#ef4444",
};
