/**
 * Shared components for the Conformite page: SearchableSelect, MultiSearchableSelect, VerificationOwnerSummary.
 */
import React, { useState, useEffect } from 'react'
import { X, User, Building2, Mail, Briefcase, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useGlobalTierContact } from '@/hooks/useTiers'
import { useUser } from '@/hooks/useUsers'

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

/**
 * ComplianceOwnerCell — compact table cell showing avatar + full name for
 * the owner of a compliance record. Resolves tier_contact / user via hooks
 * (React Query dedupes + caches, so repeated owners share a single fetch).
 *
 * Falls back to a muted label (ownerType) when the owner can't be resolved.
 */
export function ComplianceOwnerCell({
  ownerType,
  ownerId,
}: {
  ownerType: string | null | undefined
  ownerId: string | null | undefined
}) {
  const isTierContact = ownerType === 'tier_contact'
  const isUser = ownerType === 'user'
  const { data: contact } = useGlobalTierContact(isTierContact ? ownerId || undefined : undefined)
  const { data: user } = useUser(isUser ? ownerId || '' : '')

  const fullName = isTierContact && contact
    ? `${contact.first_name} ${contact.last_name}`.trim()
    : isUser && user
      ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email
      : null

  const photoUrl = isTierContact && contact ? contact.photo_url : null
  const initials = fullName
    ? fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  // Entity/company affinity shown next to the name when available:
  // - tier_contact → the tier name/code (the company the contact is attached to)
  // - user         → no company on User model, fall back to just the name
  const tierLabel = isTierContact && contact ? (contact.tier_name || contact.tier_code) : null

  if (!ownerId) return <span className="text-muted-foreground/40">—</span>

  return (
    <div className="flex items-center gap-2 min-w-0">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
      ) : (
        <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
          {initials}
        </div>
      )}
      <div className="flex flex-col min-w-0 leading-tight">
        <span className="text-xs text-foreground truncate">
          {fullName || <span className="text-muted-foreground">{ownerType}</span>}
        </span>
        {tierLabel && (
          <span className="text-[10px] text-muted-foreground truncate">{tierLabel}</span>
        )}
      </div>
    </div>
  )
}

/**
 * ComplianceOwnerCard — rich panel card for the owner of a compliance record
 * or verification. Resolves tier_contact (via useGlobalTierContact) and
 * user (via useUser) into a proper identity card: avatar, full name, role,
 * email, and navigation links to the owner's profile / tier fiche.
 *
 * Use in ComplianceRecordDetailPanel and VerificationDetailPanel to give
 * verifiers immediate context about whose compliance they're reviewing.
 */
export function ComplianceOwnerCard({
  ownerType,
  ownerId,
}: {
  ownerType: string | null | undefined
  ownerId: string | null | undefined
}) {
  const isTierContact = ownerType === 'tier_contact'
  const isUser = ownerType === 'user'
  const { data: contact } = useGlobalTierContact(isTierContact ? ownerId || undefined : undefined)
  const { data: user } = useUser(isUser ? ownerId || '' : '')

  // Resolve identity from whichever source matches the owner_type.
  const fullName = isTierContact && contact
    ? `${contact.first_name} ${contact.last_name}`.trim()
    : isUser && user
      ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || user.email
      : null

  const subtitle = isTierContact && contact
    ? contact.position || contact.department || null
    : isUser && user
      ? user.email
      : null

  const photoUrl = isTierContact && contact ? contact.photo_url : null
  const email = isTierContact && contact ? contact.email : isUser && user ? user.email : null
  const initials = fullName
    ? fullName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  if (!ownerId) return <span className="text-muted-foreground">—</span>

  return (
    <div className="rounded-lg border border-border bg-background-subtle/50 p-3">
      <div className="flex items-start gap-3">
        {photoUrl ? (
          <img src={photoUrl} alt={fullName || 'avatar'} className="h-10 w-10 rounded-full object-cover shrink-0" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isUser ? <User size={12} className="text-muted-foreground shrink-0" /> : <Building2 size={12} className="text-muted-foreground shrink-0" />}
            <span className="text-sm font-semibold text-foreground truncate">
              {fullName || <span className="font-mono text-xs text-muted-foreground">{ownerId}</span>}
            </span>
          </div>
          {subtitle && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Briefcase size={11} className="shrink-0" />
              <span className="truncate">{subtitle}</span>
            </div>
          )}
          {email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Mail size={11} className="shrink-0" />
              <a href={`mailto:${email}`} className="truncate hover:text-primary">{email}</a>
            </div>
          )}
          {/* Navigation links */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {isTierContact && contact && (
              <CrossModuleLink
                module="tiers"
                id={contact.tier_id}
                label={contact.tier_name || contact.tier_code || 'Voir le tiers'}
                className="text-xs"
              />
            )}
            {isTierContact && contact?.linked_user_id && (
              <CrossModuleLink
                module="users"
                id={contact.linked_user_id}
                label={contact.linked_user_email || 'Compte utilisateur'}
                className="text-xs"
              />
            )}
            {isUser && user && (
              <CrossModuleLink
                module="users"
                id={user.id}
                label="Voir le profil"
                className="text-xs"
              />
            )}
            {!isTierContact && !isUser && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ExternalLink size={10} />
                {ownerType} · <span className="font-mono">{ownerId.slice(0, 8)}…</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
