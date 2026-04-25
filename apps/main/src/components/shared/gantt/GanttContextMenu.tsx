/**
 * GanttContextMenu — Right-click context menu for Gantt bars and rows.
 *
 * Shows contextual actions: edit, delete, add dependency, indent/outdent,
 * add task below, add milestone, copy, etc.
 */
import { useEffect, useRef } from 'react'
import {
  Pencil, Trash2, Link2, Plus, Diamond,
  IndentIncrease, IndentDecrease,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ContextMenuAction {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  disabled?: boolean
  danger?: boolean
  separator?: boolean
  onClick: () => void
}

interface GanttContextMenuProps {
  x: number
  y: number
  actions: ContextMenuAction[]
  onClose: () => void
}

export function GanttContextMenu({ x, y, actions, onClose }: GanttContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on click outside or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Keep menu in viewport
  const menuW = 220
  const menuH = actions.length * 32 + 8
  const left = x + menuW > window.innerWidth ? x - menuW : x
  const top = y + menuH > window.innerHeight ? Math.max(8, y - menuH) : y

  return (
    <div
      ref={menuRef}
      className="fixed z-[200] bg-popover border border-border rounded-lg shadow-xl py-1 overflow-hidden"
      style={{ left, top, width: menuW }}
    >
      {actions.map((action) => {
        if (action.separator) {
          return <div key={action.id} className="h-px bg-border my-1" />
        }
        return (
          <button
            key={action.id}
            disabled={action.disabled}
            onClick={() => { action.onClick(); onClose() }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors',
              action.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent',
              action.danger && !action.disabled && 'text-destructive hover:bg-destructive/10',
            )}
          >
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {action.icon}
            </span>
            <span className="flex-1">{action.label}</span>
            {action.shortcut && (
              <span className="text-[10px] text-muted-foreground/50">{action.shortcut}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Build standard context menu actions for a Gantt bar */
export function buildBarContextActions(opts: {
  barId: string
  isSummary?: boolean
  isMilestone?: boolean
  onEdit?: () => void
  onDelete?: () => void
  onAddTaskBelow?: () => void
  onAddMilestone?: () => void
  onAddDependency?: () => void
  onIndent?: () => void
  onOutdent?: () => void
}): ContextMenuAction[] {
  const actions: ContextMenuAction[] = []

  if (opts.onEdit) {
    actions.push({
      id: 'edit', label: 'Modifier', icon: <Pencil size={13} />, shortcut: 'Entrée',
      onClick: opts.onEdit,
    })
  }

  if (opts.onAddTaskBelow) {
    actions.push({
      id: 'add-task', label: 'Ajouter une tâche', icon: <Plus size={13} />, shortcut: 'Ins',
      onClick: opts.onAddTaskBelow,
    })
  }

  if (opts.onAddMilestone) {
    actions.push({
      id: 'add-milestone', label: 'Ajouter un jalon', icon: <Diamond size={13} />,
      onClick: opts.onAddMilestone,
    })
  }

  if (opts.onAddDependency) {
    actions.push({
      id: 'add-dep', label: 'Ajouter une dépendance', icon: <Link2 size={13} />,
      onClick: opts.onAddDependency,
    })
  }

  if (opts.onIndent || opts.onOutdent) {
    actions.push({ id: 'sep-1', label: '', separator: true, onClick: () => {} })
  }

  if (opts.onIndent) {
    actions.push({
      id: 'indent', label: 'Indenter', icon: <IndentIncrease size={13} />, shortcut: 'Tab',
      onClick: opts.onIndent, disabled: opts.isSummary,
    })
  }

  if (opts.onOutdent) {
    actions.push({
      id: 'outdent', label: 'Désindenter', icon: <IndentDecrease size={13} />, shortcut: 'Shift+Tab',
      onClick: opts.onOutdent, disabled: opts.isSummary,
    })
  }

  if (opts.onDelete) {
    actions.push({ id: 'sep-2', label: '', separator: true, onClick: () => {} })
    actions.push({
      id: 'delete', label: 'Supprimer', icon: <Trash2 size={13} />, shortcut: 'Suppr',
      danger: true, onClick: opts.onDelete, disabled: opts.isSummary,
    })
  }

  return actions
}
