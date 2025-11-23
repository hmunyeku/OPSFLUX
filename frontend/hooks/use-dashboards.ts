/**
 * Hook for dashboards data fetching
 */

import { useState, useEffect, useCallback } from "react"
import { dashboardsApi, Dashboard, DashboardWithWidgets } from "@/api/dashboards"

interface UseDashboardsResult {
  dashboards: Dashboard[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

interface UseDashboardsOptions {
  skip?: number
  limit?: number
  include_archived?: boolean
  menu_parent?: string
  search?: string
}

export function useDashboards(options: UseDashboardsOptions = {}): UseDashboardsResult {
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboards = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await dashboardsApi.list(options)
      setDashboards(response.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dashboards")
      setDashboards([])
    } finally {
      setIsLoading(false)
    }
  }, [options.skip, options.limit, options.include_archived, options.menu_parent, options.search])

  useEffect(() => {
    fetchDashboards()
  }, [fetchDashboards])

  return { dashboards, isLoading, error, refetch: fetchDashboards }
}

interface UseDashboardResult {
  dashboard: DashboardWithWidgets | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDashboard(id: string | null): UseDashboardResult {
  const [dashboard, setDashboard] = useState<DashboardWithWidgets | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDashboard = useCallback(async () => {
    if (!id) {
      setDashboard(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    try {
      const response = await dashboardsApi.get(id)
      setDashboard(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch dashboard")
      setDashboard(null)
    } finally {
      setIsLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  return { dashboard, isLoading, error, refetch: fetchDashboard }
}

// Dashboard mutations
export function useDashboardMutations() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createDashboard = useCallback(async (data: Parameters<typeof dashboardsApi.create>[0]) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await dashboardsApi.create(data)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create dashboard"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateDashboard = useCallback(async (id: string, data: Parameters<typeof dashboardsApi.update>[1]) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await dashboardsApi.update(id, data)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update dashboard"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const deleteDashboard = useCallback(async (id: string) => {
    setIsLoading(true)
    setError(null)
    try {
      await dashboardsApi.delete(id)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete dashboard"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const cloneDashboard = useCallback(async (id: string, name: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await dashboardsApi.clone(id, name)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clone dashboard"
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  const toggleFavorite = useCallback(async (id: string) => {
    try {
      const result = await dashboardsApi.toggleFavorite(id)
      return result.is_favorite
    } catch (err) {
      throw err
    }
  }, [])

  return {
    isLoading,
    error,
    createDashboard,
    updateDashboard,
    deleteDashboard,
    cloneDashboard,
    toggleFavorite,
  }
}
