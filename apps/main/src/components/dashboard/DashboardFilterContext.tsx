/**
 * DashboardFilterContext — PowerBI-style cross-filtering for dashboard widgets.
 *
 * Provides a shared filter state across all widgets on a dashboard tab.
 * Widgets can:
 *   - Read active filters via useFilters()
 *   - Add/remove filters via setFilter() / removeFilter() / clearFilters()
 *   - React to filter changes to re-fetch their data
 *
 * Filter shape: { field: string, value: unknown, source?: string }
 * source = widget ID that initiated the filter (for highlighting the source)
 */
import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'

export interface DashboardFilter {
  field: string
  value: unknown
  /** Widget ID that set this filter (for visual feedback) */
  source?: string
  /** Human-readable label for the filter pill */
  label?: string
}

interface DashboardFilterContextValue {
  /** All active filters */
  filters: DashboardFilter[]
  /** Active filters as a plain object for passing to API */
  filterParams: Record<string, unknown>
  /** Set or replace a filter for a given field */
  setFilter: (filter: DashboardFilter) => void
  /** Remove filter for a given field */
  removeFilter: (field: string) => void
  /** Clear all filters */
  clearFilters: () => void
  /** Toggle a filter — if same field+value exists, remove it; otherwise set it */
  toggleFilter: (filter: DashboardFilter) => void
  /** Check if a specific field+value combination is active */
  isFilterActive: (field: string, value?: unknown) => boolean
}

const FilterContext = createContext<DashboardFilterContextValue | null>(null)

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilter[]>([])

  const setFilter = useCallback((filter: DashboardFilter) => {
    setFilters((prev) => {
      const idx = prev.findIndex((f) => f.field === filter.field)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = filter
        return updated
      }
      return [...prev, filter]
    })
  }, [])

  const removeFilter = useCallback((field: string) => {
    setFilters((prev) => prev.filter((f) => f.field !== field))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters([])
  }, [])

  const toggleFilter = useCallback((filter: DashboardFilter) => {
    setFilters((prev) => {
      const existing = prev.find((f) => f.field === filter.field && f.value === filter.value)
      if (existing) {
        return prev.filter((f) => f !== existing)
      }
      // Replace same-field filter or add new
      const idx = prev.findIndex((f) => f.field === filter.field)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = filter
        return updated
      }
      return [...prev, filter]
    })
  }, [])

  const isFilterActive = useCallback(
    (field: string, value?: unknown) => {
      if (value === undefined) return filters.some((f) => f.field === field)
      return filters.some((f) => f.field === field && f.value === value)
    },
    [filters],
  )

  const filterParams = useMemo(() => {
    const params: Record<string, unknown> = {}
    for (const f of filters) {
      params[f.field] = f.value
    }
    return params
  }, [filters])

  const value = useMemo<DashboardFilterContextValue>(
    () => ({ filters, filterParams, setFilter, removeFilter, clearFilters, toggleFilter, isFilterActive }),
    [filters, filterParams, setFilter, removeFilter, clearFilters, toggleFilter, isFilterActive],
  )

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

/** Hook to access dashboard filters from any widget */
export function useDashboardFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) {
    // Return a no-op stub when used outside of a DashboardFilterProvider
    // (e.g., ModuleDashboard or standalone widgets)
    return {
      filters: [] as DashboardFilter[],
      filterParams: {} as Record<string, unknown>,
      setFilter: () => {},
      removeFilter: () => {},
      clearFilters: () => {},
      toggleFilter: () => {},
      isFilterActive: () => false,
    } as DashboardFilterContextValue
  }
  return ctx
}
