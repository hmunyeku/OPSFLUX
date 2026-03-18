/**
 * React Query hooks for dashboard.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dashboardService } from '@/services/dashboardService'
import type { DashboardWidget } from '@/services/dashboardService'

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 60_000,
  })
}

export function useDashboardTabs() {
  return useQuery({
    queryKey: ['dashboard', 'tabs'],
    queryFn: () => dashboardService.getTabs(),
    staleTime: 30_000,
  })
}

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

export function useCreateDashboardTab() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { name: string; widgets?: DashboardWidget[] }) =>
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
