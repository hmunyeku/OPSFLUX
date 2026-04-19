/**
 * DataTable — Column header context menu.
 *
 * Right-click (or click the kebab icon) on a column header to:
 *  - Pin left / Pin right / Unpin
 *  - Hide column
 *  - Reset column width
 *
 * Follows GitLab Pajamas design (compact, 11px text).
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PinOff, EyeOff, RotateCcw,
  ArrowLeftToLine, ArrowRightToLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ColumnHeaderMenuProps {
  columnId: string
  columnLabel: string
  isPinned: false | 'left' | 'right'
  canPin: boolean
  canHide: boolean
  canResize: boolean
  onPinLeft: () => void
  onPinRight: () => void
  onUnpin: () => void
  onHide: () => void
  onResetWidth: () => void
}

interface MenuPosition {
  x: number
  y: number
}

export function useColumnHeaderMenu() {
  const [menu, setMenu] = useState<{
    position: MenuPosition
    props: ColumnHeaderMenuProps
  } | null>(null)

  const openMenu = useCallback((e: React.MouseEvent, props: ColumnHeaderMenuProps) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({
      position: { x: e.clientX, y: e.clientY },
      props,
    })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  return { menu, openMenu, closeMenu }
}

export function ColumnHeaderMenuPortal({
  position,
  props,
  onClose,
}: {
  position: MenuPosition
  props: ColumnHeaderMenuProps
  onClose: () => void
}) {
  const { t } = useTranslation()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
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

  // Adjust position if menu overflows viewport
  useEffect(() => {
    if (!menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let adjustedX = position.x
    let adjustedY = position.y

    if (rect.right > vw) adjustedX = vw - rect.width - 8
    if (rect.bottom > vh) adjustedY = vh - rect.height - 8
    if (adjustedX < 0) adjustedX = 8
    if (adjustedY < 0) adjustedY = 8

    if (adjustedX !== position.x || adjustedY !== position.y) {
      menuRef.current.style.left = `${adjustedX}px`
      menuRef.current.style.top = `${adjustedY}px`
    }
  }, [position])

  const handleAction = (action: () => void) => {
    action()
    onClose()
  }

  const { isPinned, canPin, canHide, canResize } = props

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[180px] rounded-md border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50 mb-0.5 truncate max-w-[220px]">
        {props.columnLabel}
      </p>

      {/* Pin actions */}
      {canPin && (
        <>
          {isPinned ? (
            <MenuItem
              icon={<PinOff size={12} />}
              label={t('ui.liberer_la_colonne')}
              onClick={() => handleAction(props.onUnpin)}
            />
          ) : (
            <>
              <MenuItem
                icon={<ArrowLeftToLine size={12} />}
                label={t('ui.figer_a_gauche')}
                onClick={() => handleAction(props.onPinLeft)}
              />
              <MenuItem
                icon={<ArrowRightToLine size={12} />}
                label={t('ui.figer_a_droite')}
                onClick={() => handleAction(props.onPinRight)}
              />
            </>
          )}

          {isPinned === 'left' && (
            <MenuItem
              icon={<ArrowRightToLine size={12} />}
              label={t('ui.figer_a_droite')}
              onClick={() => handleAction(() => {
                props.onUnpin()
                props.onPinRight()
              })}
            />
          )}
          {isPinned === 'right' && (
            <MenuItem
              icon={<ArrowLeftToLine size={12} />}
              label={t('ui.figer_a_gauche')}
              onClick={() => handleAction(() => {
                props.onUnpin()
                props.onPinLeft()
              })}
            />
          )}
        </>
      )}

      {/* Hide */}
      {canHide && (
        <MenuItem
          icon={<EyeOff size={12} />}
          label={t('ui.masquer_la_colonne')}
          onClick={() => handleAction(props.onHide)}
        />
      )}

      {/* Reset width */}
      {canResize && (
        <MenuItem
          icon={<RotateCcw size={12} />}
          label={t('ui.reinitialiser_la_largeur')}
          onClick={() => handleAction(props.onResetWidth)}
        />
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent text-left transition-colors',
        danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground',
      )}
    >
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  )
}
