/**
 * Modal used by UsersPage for batch assignments (role / group / entity).
 *
 * Extracted from UsersPage.tsx to keep the main page under a reviewable
 * line count. Pure presentational — owner passes the item list and the
 * onSelect handler.
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface BatchAssignItem {
  id: string
  label: string
  sublabel?: string
  meta?: string
  badge?: string
  icon?: LucideIcon
  iconClassName?: string
}

export interface BatchAssignModalProps {
  title: string
  subtitle: string
  searchPlaceholder: string
  items: BatchAssignItem[]
  isPending: boolean
  onSelect: (id: string) => void
  onClose: () => void
}

export function BatchAssignModal({
  title,
  subtitle,
  searchPlaceholder,
  items,
  isPending,
  onSelect,
  onClose,
}: BatchAssignModalProps) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) ||
      i.sublabel?.toLowerCase().includes(q) ||
      i.badge?.toLowerCase().includes(q)
    )
  }, [items, search])

  return (
    <div className="gl-modal-backdrop" onClick={onClose}>
      <div className="gl-modal-card !bg-card !max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="gl-input w-full text-sm"
        />
        <div className="space-y-0.5 max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">{t('common.no_results')}</p>
          ) : filtered.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                disabled={isPending}
                className="w-full text-left px-3 py-2 rounded-md hover:bg-accent/50 flex items-center gap-2.5 transition-colors group"
              >
                {Icon && <Icon size={13} className={cn('shrink-0', item.iconClassName)} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
                    {item.badge && <span className="gl-badge gl-badge-neutral text-[9px] shrink-0">{item.badge}</span>}
                  </div>
                  {item.sublabel && <p className="text-[11px] text-muted-foreground truncate">{item.sublabel}</p>}
                </div>
                {item.meta && <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{item.meta}</span>}
              </button>
            )
          })}
        </div>
        <button onClick={onClose} className="gl-button-sm gl-button-default w-full text-xs">{t('common.cancel')}</button>
      </div>
    </div>
  )
}
