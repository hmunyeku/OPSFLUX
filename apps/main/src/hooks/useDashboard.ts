/**
 * React Query hooks for the Dashboard module.
 * Tabs, widget catalog, widget data, CRUD operations.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboardService'
import type { DashboardWidget } from '@/services/dashboardService'
import { useAuthStore } from '@/stores/authStore'

// ── Stats ──

export function useDashboardStats() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'stats'],
    queryFn: () => dashboardService.getStats(),
    enabled: Boolean(currentEntityId),
    staleTime: 60_000,
  })
}

// ── Tabs ──

export function useDashboardTabs(module?: string) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'tabs', module],
    queryFn: () => dashboardService.getTabs(module),
    enabled: Boolean(currentEntityId),
    staleTime: 30_000,
  })
}

export function useCreateDashboardTab() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; widgets?: DashboardWidget[]; icon?: string }) =>
      dashboardService.createPersonalTab(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'tabs'] })
    },
  })
}

export function useUpdateDashboardTab() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name?: string; widgets?: DashboardWidget[]; tab_order?: number }) =>
      dashboardService.updatePersonalTab(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'tabs'] })
    },
  })
}

export function useDeleteDashboardTab() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dashboardService.deletePersonalTab(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'tabs'] })
    },
  })
}

// ── Widget Catalog ──

import type { WidgetCatalogEntry } from '@/services/dashboardService'

/** Built-in widget catalog entries always available client-side. */
const BUILTIN_CATALOG_ENTRIES: WidgetCatalogEntry[] = [
  {
    id: 'builtin:perspective',
    type: 'perspective',
    title: 'Analyse dynamique',
    description: 'Tableau croisé dynamique interactif (pivot, graphiques, filtres)',
    permissions: [],
    default_config: { plugin: 'Datagrid' },
    source_module: 'Analyse',
    roles: [],
  },
  {
    id: 'builtin:clock',
    type: 'clock',
    title: 'Horloge',
    description: 'Horloge temps réel avec date, phase lunaire et saison. Mode numérique ou analogique.',
    permissions: [],
    default_config: {
      mode: 'digital',
      show_date: true,
      show_seconds: true,
      show_moon: true,
      show_season: true,
      locale: 'fr',
    },
    source_module: 'core',
    roles: [],
  },
  {
    id: 'builtin:quick_access',
    type: 'quick_access',
    title: 'Accès rapide',
    description: 'Grille de raccourcis, favoris, marque-pages et actions fréquentes',
    permissions: [],
    default_config: {
      columns: 4,
      items: [
        { label: 'Tableau de bord', path: '/dashboard', icon: 'dashboard', color: '#1e40af' },
        { label: 'Projets', path: '/projets', icon: 'projets', color: '#047857' },
        { label: 'PaxLog', path: '/paxlog', icon: 'users', color: '#b45309' },
        { label: 'TravelWiz', path: '/travelwiz', icon: 'travelwiz', color: '#0891b2' },
        { label: 'Assets', path: '/assets', icon: 'assets', color: '#7c3aed' },
        { label: 'Tiers', path: '/tiers', icon: 'tiers', color: '#dc2626' },
        { label: 'Conformité', path: '/conformite', icon: 'conformite', color: '#374151' },
        { label: 'Recherche', path: '/search', icon: 'search', color: '#0f172a' },
      ],
    },
    source_module: 'core',
    roles: [],
  },
  {
    id: 'builtin:group',
    type: 'group',
    title: 'Groupe KPI',
    description: 'Conteneur pour regrouper plusieurs mini-KPIs dans une seule carte (2x2, 3x1, 1x4)',
    permissions: [],
    default_config: {
      layout: '2x2',
      children: [
        { title: 'KPI 1', value: 0, format: 'number' },
        { title: 'KPI 2', value: 0, format: 'number' },
        { title: 'KPI 3', value: 0, format: 'number' },
        { title: 'KPI 4', value: 0, format: 'number' },
      ],
    },
    source_module: 'core',
    roles: [],
  },
]

export function useWidgetCatalog() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'widget-catalog'],
    queryFn: async () => {
      const remote = await dashboardService.getWidgetCatalog()
      // Merge built-in entries that don't conflict with remote types
      const remoteTypes = new Set(remote.map((e) => e.type))
      const builtins = BUILTIN_CATALOG_ENTRIES.filter((e) => !remoteTypes.has(e.type))
      return [...remote, ...builtins]
    },
    enabled: Boolean(currentEntityId),
    staleTime: 5 * 60_000, // catalog rarely changes
  })
}

// ── Widget Data ──

export function useWidgetData(
  widgetId: string | undefined,
  widgetType: string | undefined,
  config: Record<string, unknown> | undefined,
  filters?: Record<string, unknown>,
) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'widget-data', widgetId, widgetType, config, filters],
    queryFn: () =>
      dashboardService.getWidgetData({
        widget_id: widgetId!,
        widget_type: widgetType!,
        config: config!,
        filters,
      }),
    enabled: Boolean(currentEntityId) && !!widgetId && !!widgetType && !!config,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useExecuteSQL() {
  return useMutation({
    mutationFn: ({ query, params }: { query: string; params?: Record<string, unknown> }) =>
      dashboardService.executeWidgetSQL(query, params),
  })
}

// ── Activity / Pending ──

export function useDashboardActivity() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'activity'],
    queryFn: () => dashboardService.getActivity(),
    enabled: Boolean(currentEntityId),
    staleTime: 30_000,
  })
}

export function useDashboardPending() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'pending'],
    queryFn: () => dashboardService.getPending(),
    enabled: Boolean(currentEntityId),
    staleTime: 30_000,
  })
}

// ── Dashboard CRUD ──

export function useDashboards() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'dashboards'],
    queryFn: () => dashboardService.listDashboards(),
    enabled: Boolean(currentEntityId),
  })
}

export function useDashboard(id: string | undefined) {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'dashboards', id],
    queryFn: () => dashboardService.getDashboard(id!),
    enabled: Boolean(currentEntityId) && !!id,
  })
}

export function useCreateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dashboardService.createDashboard,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'dashboards'] })
    },
  })
}

export function useUpdateDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }: { id: string } & Partial<Record<string, unknown>>) =>
      dashboardService.updateDashboard(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'dashboards'] })
    },
  })
}

export function useDeleteDashboard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => dashboardService.deleteDashboard(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'dashboards'] })
    },
  })
}

// ── Home Dashboard ──

export function useHomeDashboard() {
  const currentEntityId = useAuthStore((state) => state.currentEntityId)
  return useQuery({
    queryKey: ['dashboard', currentEntityId, 'home'],
    queryFn: () => dashboardService.getHomeDashboard(),
    enabled: Boolean(currentEntityId),
  })
}
