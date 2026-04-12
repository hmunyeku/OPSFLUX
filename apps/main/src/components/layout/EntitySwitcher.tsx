/**
 * EntitySwitcher — compact combo in topbar for switching active entity.
 *
 * Behavior:
 * - 1 entity: shows entity name as text, non-interactive
 * - >1 entity: popover with searchable list
 * - "Toutes les entités" option if user has core.multi_entity permission
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, Search } from 'lucide-react'
import { useMyEntities, useSwitchEntity } from '@/hooks/useEntities'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'
import { EntityIcon } from '@/components/shared/EntityIcon'

export function EntitySwitcher() {
  const { data: entities, isLoading } = useMyEntities()
  const switchEntity = useSwitchEntity()
  const currentEntityId = useAuthStore((s) => s.currentEntityId)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const currentEntity = entities?.find((e) => e.id === currentEntityId)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Focus search when opening
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  if (isLoading) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground px-1.5">
        <EntityIcon size={12} />
        <span className="animate-pulse hidden sm:inline">…</span>
      </div>
    )
  }

  if (!entities || entities.length === 0) return null

  // Single entity — just show the name
  // On screens < sm we hide the textual code and only render the icon
  // to keep the topbar uncluttered. The icon already conveys the
  // entity (logo) and the user can long-press for the title.
  if (entities.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1.5" title={entities[0].name}>
        <EntityIcon logoUrl={entities[0].logo_url} country={entities[0].country} size={14} />
        <span className="truncate max-w-[120px] hidden sm:inline">{entities[0].code}</span>
      </div>
    )
  }

  // Multiple entities — interactive switcher
  const filtered = search
    ? entities.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.code.toLowerCase().includes(search.toLowerCase()),
      )
    : entities

  const handleSwitch = (entityId: string) => {
    if (entityId === currentEntityId) {
      setOpen(false)
      setSearch('')
      return
    }
    switchEntity.mutate(entityId, {
      onSuccess: () => {
        setOpen(false)
        setSearch('')
      },
    })
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors',
          'text-muted-foreground hover:bg-chrome-hover hover:text-foreground',
          open && 'bg-chrome-hover text-foreground',
        )}
        title={currentEntity?.name ?? 'Switch entity'}
        aria-label={currentEntity?.name ?? 'Switch entity'}
      >
        <EntityIcon logoUrl={currentEntity?.logo_url} country={currentEntity?.country} size={14} />
        {/* Code label hidden on < sm to free topbar space */}
        <span className="truncate max-w-[120px] hidden sm:inline">{currentEntity?.code ?? '—'}</span>
        <ChevronDown size={10} className={cn('transition-transform hidden sm:inline', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border bg-popover shadow-lg">
          {/* Search — show if >5 entities */}
          {entities.length > 5 && (
            <div className="p-2 border-b">
              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="gl-form-input h-7 w-full pl-7 text-xs"
                  placeholder="Rechercher…"
                />
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>
            )}
            {filtered.map((entity) => (
              <button
                key={entity.id}
                onClick={() => handleSwitch(entity.id)}
                disabled={switchEntity.isPending}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  'hover:bg-chrome-hover',
                  entity.id === currentEntityId && 'bg-primary/[0.08] font-medium',
                )}
              >
                <EntityIcon logoUrl={entity.logo_url} country={entity.country} size={16} />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{entity.name}</div>
                  <div className="truncate text-muted-foreground">{entity.code}{entity.country ? ` · ${entity.country}` : ''}</div>
                </div>
                {entity.id === currentEntityId && (
                  <Check size={12} className="shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
