/**
 * useFileKeyboard — Keyboard navigation for file manager.
 */
import { useCallback, useEffect, useRef } from 'react'
import type { FSItem } from './useFileManager'

interface KeyboardActions {
  items: FSItem[]
  focusedIndex: number
  setFocusedIndex: (i: number) => void
  openItem: (item: FSItem) => void
  toggleSelect: (path: string, index: number, event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void
  selectAll: () => void
  clearSelection: () => void
  handleDelete: (item: FSItem) => void
  setNameDialog: (d: { mode: 'rename'; item: FSItem } | null) => void
  navigateUp: () => void
  setPreviewItem: (item: FSItem | null) => void
  setContextMenu: (v: null) => void
}

export function useFileKeyboard(actions: KeyboardActions) {
  const containerRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const { items, focusedIndex, setFocusedIndex, openItem, toggleSelect, selectAll, clearSelection, handleDelete, setNameDialog, navigateUp, setPreviewItem, setContextMenu } = actions

    if (!items.length) return

    // Don't intercept if typing in input
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(Math.min(focusedIndex + 1, items.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(Math.max(focusedIndex - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (items[focusedIndex]) openItem(items[focusedIndex])
        break
      case ' ':
        e.preventDefault()
        if (items[focusedIndex]) toggleSelect(items[focusedIndex].path, focusedIndex, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey })
        break
      case 'Delete':
        if (items[focusedIndex]) handleDelete(items[focusedIndex])
        break
      case 'F2':
        e.preventDefault()
        if (items[focusedIndex]) setNameDialog({ mode: 'rename', item: items[focusedIndex] })
        break
      case 'a':
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); selectAll() }
        break
      case 'Escape':
        setPreviewItem(null)
        setContextMenu(null)
        clearSelection()
        break
      case 'Backspace':
        e.preventDefault()
        navigateUp()
        break
    }
  }, [actions])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: KeyboardEvent) => handleKeyDown(e)
    el.addEventListener('keydown', handler)
    return () => el.removeEventListener('keydown', handler)
  }, [handleKeyDown])

  return containerRef
}
