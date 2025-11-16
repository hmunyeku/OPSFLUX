"use client"

import * as React from "react"

interface Filter {
  label: string
  value: string
  type: string
}

interface FilterContextType {
  filters: Filter[]
  addFilter: (filter: Filter) => void
  removeFilter: (index: number) => void
  clearFilters: () => void
}

const FilterContext = React.createContext<FilterContextType | undefined>(undefined)

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFilters] = React.useState<Filter[]>([])

  const addFilter = React.useCallback((filter: Filter) => {
    setFilters((prev) => {
      const exists = prev.some((f) => f.type === filter.type && f.value === filter.value)
      if (exists) return prev
      return [...prev, filter]
    })
  }, [])

  const removeFilter = React.useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearFilters = React.useCallback(() => {
    setFilters([])
  }, [])

  return (
    <FilterContext.Provider value={{ filters, addFilter, removeFilter, clearFilters }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  const context = React.useContext(FilterContext)
  if (!context) {
    throw new Error("useFilters must be used within FilterProvider")
  }
  return context
}
