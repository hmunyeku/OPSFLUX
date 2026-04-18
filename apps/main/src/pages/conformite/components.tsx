/**
 * Shared components for the Conformite page: SearchableSelect, MultiSearchableSelect, VerificationOwnerSummary.
 */
import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useGlobalTierContact } from '@/hooks/useTiers'

export function SearchableSelect({ value, onChange, options, placeholder, disabled }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(panelInputClass, 'text-left flex items-center justify-between w-full', !value && 'text-muted-foreground')}
      >
        <span className="truncate">{selected?.label || placeholder || '— Sélectionner —'}</span>
        <svg className="w-3 h-3 shrink-0 ml-1" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 sm:max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          <div className="sticky top-0 bg-popover p-1.5 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className={cn(panelInputClass, 'h-8 sm:h-7 text-xs')}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
              className={cn('w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-accent active:bg-accent/80 transition-colors', o.value === value && 'bg-primary/5 text-primary font-medium')}
            >
              {o.group && <span className="text-muted-foreground mr-1">[{o.group}]</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MultiSearchableSelect({ values, onChange, options, placeholder, disabled }: {
  values: string[]
  onChange: (vs: string[]) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !values.includes(o.value) && o.label.toLowerCase().includes(search.toLowerCase())
  )
  const selectedItems = values.map(v => options.find(o => o.value === v)).filter(Boolean) as typeof options

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(panelInputClass, 'min-h-[32px] h-auto flex flex-wrap items-center gap-1 cursor-text py-1', disabled && 'opacity-50 pointer-events-none')}
        onClick={() => { if (!disabled) setOpen(true) }}
      >
        {selectedItems.map(item => (
          <span key={item.value} className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-[11px] font-medium px-1.5 py-0.5 rounded">
            <span className="truncate max-w-[150px]">{item.label}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(values.filter(v => v !== item.value)) }} className="hover:text-destructive">
              <X size={10} />
            </button>
          </span>
        ))}
        {selectedItems.length === 0 && <span className="text-muted-foreground text-xs">{placeholder || '— Sélectionner —'}</span>}
        <svg className="w-3 h-3 shrink-0 ml-auto text-muted-foreground" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          <div className="sticky top-0 bg-popover p-1.5 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className={cn(panelInputClass, 'h-8 sm:h-7 text-xs')}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange([...values, o.value]); setSearch('') }}
              className="w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-accent active:bg-accent/80 transition-colors"
            >
              {o.group && <span className="text-muted-foreground mr-1">[{o.group}]</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function VerificationOwnerSummary({
  ownerType,
  ownerId,
  ownerName,
  compact = false,
}: {
  ownerType: string | null | undefined
  ownerId: string | null | undefined
  ownerName: string | null | undefined
  compact?: boolean
}) {
  const { data: linkedContact } = useGlobalTierContact(ownerType === 'tier_contact' ? ownerId || undefined : undefined)
  const name = ownerName || 'Inconnu'
  const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
        {initials}
      </div>
      <div className="min-w-0">
        <div className="text-foreground truncate">{name}</div>
        {linkedContact && (
          <div className={cn('flex flex-wrap items-center gap-2 text-muted-foreground', compact ? 'text-[10px]' : 'text-[11px] mt-0.5')}>
            <CrossModuleLink
              module="tiers"
              id={linkedContact.tier_id}
              label={linkedContact.tier_name || linkedContact.tier_code || linkedContact.tier_id}
              showIcon={false}
              className="truncate"
            />
            {linkedContact.linked_user_id && (
              <CrossModuleLink
                module="users"
                id={linkedContact.linked_user_id}
                label={linkedContact.linked_user_email || linkedContact.linked_user_id}
                showIcon={false}
                className="truncate"
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
