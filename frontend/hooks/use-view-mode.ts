"use client"

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { useUIPreferences, type ViewMode } from "@/lib/ui-preferences-context"

/**
 * Hook to manage view mode for a specific page
 * Automatically uses the current pathname as the key
 */
export function useViewMode(defaultMode: ViewMode = "list") {
  const pathname = usePathname()
  const { getPageViewMode, setPageViewMode } = useUIPreferences()

  const currentMode = getPageViewMode(pathname) || defaultMode

  const setViewMode = useCallback(
    async (mode: ViewMode) => {
      await setPageViewMode(pathname, mode)
    },
    [pathname, setPageViewMode]
  )

  return {
    viewMode: currentMode,
    setViewMode,
    isListView: currentMode === "list",
    isGridView: currentMode === "grid",
    isKanbanView: currentMode === "kanban",
    isTableView: currentMode === "table",
  }
}

/**
 * Hook to manage view mode for a specific page with a custom key
 * Useful when you want to share view mode across multiple pages
 */
export function useCustomViewMode(pageKey: string, defaultMode: ViewMode = "list") {
  const { getPageViewMode, setPageViewMode } = useUIPreferences()

  const currentMode = getPageViewMode(pageKey) || defaultMode

  const setViewMode = useCallback(
    async (mode: ViewMode) => {
      await setPageViewMode(pageKey, mode)
    },
    [pageKey, setPageViewMode]
  )

  return {
    viewMode: currentMode,
    setViewMode,
    isListView: currentMode === "list",
    isGridView: currentMode === "grid",
    isKanbanView: currentMode === "kanban",
    isTableView: currentMode === "table",
  }
}
