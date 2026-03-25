/**
 * useFileSelection — Multi-select with Shift/Ctrl/Cmd support.
 */
import { useState, useCallback, useRef } from 'react'
import type { FSItem } from './useFileManager'

export function useFileSelection(items: FSItem[]) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef(-1)

  const toggleSelect = useCallback((path: string, index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (event.shiftKey && lastClickedIndex.current >= 0) {
        const start = Math.min(lastClickedIndex.current, index)
        const end = Math.max(lastClickedIndex.current, index)
        for (let i = start; i <= end; i++) {
          if (items[i]) next.add(items[i].path)
        }
      } else if (event.ctrlKey || event.metaKey) {
        if (next.has(path)) next.delete(path)
        else next.add(path)
      } else {
        next.clear()
        next.add(path)
      }
      lastClickedIndex.current = index
      return next
    })
  }, [items])

  const selectAll = useCallback(() => {
    setSelectedItems(new Set(items.map(i => i.path)))
  }, [items])

  const clearSelection = useCallback(() => {
    setSelectedItems(new Set())
    lastClickedIndex.current = -1
  }, [])

  const isSelected = useCallback((path: string) => selectedItems.has(path), [selectedItems])

  return { selectedItems, toggleSelect, selectAll, clearSelection, isSelected }
}
