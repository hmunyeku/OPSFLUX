/**
 * useProjectFilter — shared hook for project filtering across views.
 *
 * Reads/writes the project selection from DB-backed user preferences
 * under the key 'view_project_selection'. This selection is shared
 * between Gantt, Kanban, Dashboard, and Spreadsheet views so the user
 * sees the same projects everywhere after selecting them once.
 *
 * Returns:
 * - selection: the current ProjectSelection
 * - filteredProjectIds: Set<string> of selected project IDs (empty = all)
 * - isFiltered: whether a selection is active
 * - setSelection: update the selection
 * - filterButton: React element for the toolbar button
 */
import { useCallback, useMemo } from 'react'
import { useUserPreferences } from './useUserPreferences'
import type { ProjectSelection } from '@/components/shared/ProjectSelectorModal'

const PREF_KEY = 'view_project_selection'

export function useProjectFilter() {
  const { getPref, setPref } = useUserPreferences()

  const selection: ProjectSelection = getPref(PREF_KEY, { mode: 'all', projectIds: [] } as ProjectSelection)

  const setSelection = useCallback((sel: ProjectSelection) => {
    setPref(PREF_KEY, sel)
  }, [setPref])

  const filteredProjectIds = useMemo(() => {
    if (selection.mode === 'all' || selection.projectIds.length === 0) return null
    return new Set(selection.projectIds)
  }, [selection])

  const isFiltered = selection.mode === 'selected' && selection.projectIds.length > 0

  return { selection, setSelection, filteredProjectIds, isFiltered }
}
