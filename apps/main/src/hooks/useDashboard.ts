/**
 * React Query hooks for the Dashboard module.
 * Tabs, widget catalog, widget data, CRUD operations.
 */
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboardService'
import type { DashboardWidget } from '@/services/dashboardService'

// ── Stats ──

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 60_000,
  })
}

// ── Tabs ──

export function useDashboardTabs(module?: string) {
  return useQuery({
    queryKey: ['dashboard', 'tabs', module],
    queryFn: () => dashboardService.getTabs(module),
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
    description: 'Tableau croise dynamique interactif (pivot, graphiques, filtres)',
    permissions: [],
    default_config: { plugin: 'Datagrid' },
    source_module: 'Analyse',
    roles: [],
  },
]

export function useWidgetCatalog() {
  return useQuery({
    queryKey: ['dashboard', 'widget-catalog'],
    queryFn: async () => {
      const remote = await dashboardService.getWidgetCatalog()
      // Merge built-in entries that don't conflict with remote types
      const remoteTypes = new Set(remote.map((e) => e.type))
      const builtins = BUILTIN_CATALOG_ENTRIES.filter((e) => !remoteTypes.has(e.type))
      return [...remote, ...builtins]
    },
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
  return useQuery({
    queryKey: ['dashboard', 'widget-data', widgetId, widgetType, config, filters],
    queryFn: () =>
      dashboardService.getWidgetData({
        widget_id: widgetId!,
        widget_type: widgetType!,
        config: config!,
        filters,
      }),
    enabled: !!widgetId && !!widgetType && !!config,
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
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardService.getActivity(),
    staleTime: 30_000,
  })
}

export function useDashboardPending() {
  return useQuery({
    queryKey: ['dashboard', 'pending'],
    queryFn: () => dashboardService.getPending(),
    staleTime: 30_000,
  })
}

// ── Dashboard CRUD ──

export function useDashboards() {
  return useQuery({
    queryKey: ['dashboard', 'dashboards'],
    queryFn: () => dashboardService.listDashboards(),
  })
}

export function useDashboard(id: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'dashboards', id],
    queryFn: () => dashboardService.getDashboard(id!),
    enabled: !!id,
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
  return useQuery({
    queryKey: ['dashboard', 'home'],
    queryFn: () => dashboardService.getHomeDashboard(),
  })
}
