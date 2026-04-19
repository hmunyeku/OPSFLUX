/**
 * Centralised route constants.
 *
 * Use `ROUTES.xxx` instead of string literals when calling `navigate()`,
 * building `<Link to=...>`, or composing URLs with query strings. Refactoring
 * a path then becomes a single-file change instead of a codebase sweep.
 *
 * Pattern:
 *   - Static routes → string constants:        `ROUTES.dashboard`
 *   - Dynamic routes → builder functions:      `ROUTES.tv(token)`
 *   - Sub-routes are flat on purpose (no nesting) to keep call sites short.
 */

export const ROUTES = {
  // ── Public / auth ────────────────────────────────────────────────────────
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  verifyEmail: '/verify-email',
  privacy: '/privacy',
  captainPortal: '/captain-portal',

  // ── App shell ────────────────────────────────────────────────────────────
  dashboard: '/dashboard',
  search: '/search',

  // ── Modules (core) ──────────────────────────────────────────────────────
  users: '/users',
  entities: '/entities',
  settings: '/settings',
  files: '/files',
  workflow: '/workflow',
  imputations: '/imputations',
  support: '/support',

  // ── Modules (feature) ───────────────────────────────────────────────────
  assets: '/assets',
  assetsLegacy: '/assets-legacy',
  tiers: '/tiers',
  conformite: '/conformite',
  projets: '/projets',
  planner: '/planner',
  travelwiz: '/travelwiz',
  paxlog: '/paxlog',
  packlog: '/packlog',
  papyrus: '/papyrus',
  pidPfd: '/pid-pfd',
  moc: '/moc',

  // ── Dynamic ──────────────────────────────────────────────────────────────
  tv: (token: string) => `/tv/${token}`,
  paxlogAdsBoarding: (token: string) => `/paxlog/ads-boarding/${token}`,
  settingsTab: (tab: string) => `/settings/${tab}`,
} as const

export type RouteName = keyof typeof ROUTES
