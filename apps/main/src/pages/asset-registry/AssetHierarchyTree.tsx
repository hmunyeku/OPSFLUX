/**
 * Asset Hierarchy Tree — visual tree of Field > Site > Installation > Equipment.
 *
 * Fetches the full hierarchy from the API and renders it as a collapsible tree.
 * Each node is clickable to open the corresponding detail panel.
 */
import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Landmark,
  Factory,
  Wrench,
  Search,
  Loader2,
  FolderTree,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchy } from '@/hooks/useAssetRegistry'
import { useUIStore } from '@/stores/uiStore'
import type {
  HierarchyFieldNode,
  HierarchySiteNode,
  HierarchyInstallationNode,
} from '@/types/assetRegistry'


// ── Status badge (same pattern as page / detail panels) ──────

const STATUS_COLORS: Record<string, string> = {
  OPERATIONAL: 'gl-badge-success',
  STANDBY: 'gl-badge-warning',
  UNDER_CONSTRUCTION: 'gl-badge-info',
  SUSPENDED: 'gl-badge-neutral',
  DECOMMISSIONED: 'gl-badge-danger',
  ABANDONED: 'gl-badge-danger',
}

function StatusDot({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] || 'gl-badge-neutral'
  return (
    <span className={cn('gl-badge text-[9px] leading-none px-1.5 py-0.5', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}


// ── Helpers ──────────────────────────────────────────────────

function matchesSearch(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

/** Check if any node in the field tree matches the search query. */
function fieldMatchesSearch(field: HierarchyFieldNode, query: string): boolean {
  if (!query) return true
  if (matchesSearch(field.code, query) || matchesSearch(field.name, query)) return true
  return field.sites.some((s) => siteMatchesSearch(s, query))
}

function siteMatchesSearch(site: HierarchySiteNode, query: string): boolean {
  if (!query) return true
  if (matchesSearch(site.code, query) || matchesSearch(site.name, query)) return true
  return site.installations.some((i) =>
    matchesSearch(i.code, query) || matchesSearch(i.name, query),
  )
}


// ── Installation Node ────────────────────────────────────────

function InstallationNode({
  inst,
  onSelect,
}: {
  inst: HierarchyInstallationNode
  onSelect: (module: string, id: string) => void
}) {
  return (
    <button
      type="button"
      className="gl-button gl-button-sm gl-button-default group flex w-full text-left"
      onClick={() => onSelect('ar-installation', inst.id)}
    >
      <Factory size={14} className="text-orange-500 shrink-0" />
      <span className="font-mono text-[11px] text-muted-foreground">{inst.code}</span>
      <span className="truncate text-foreground">{inst.name}</span>
      <StatusDot status={inst.status} />
      {inst.equipment_count > 0 && (
        <span className="ml-auto shrink-0 gl-badge gl-badge-neutral text-[9px] flex items-center gap-0.5">
          <Wrench size={10} />
          {inst.equipment_count}
        </span>
      )}
    </button>
  )
}


// ── Site Node ────────────────────────────────────────────────

function SiteNode({
  site,
  searchQuery,
  defaultExpanded,
  onSelect,
}: {
  site: HierarchySiteNode
  searchQuery: string
  defaultExpanded: boolean
  onSelect: (module: string, id: string) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const visibleInstallations = useMemo(() => {
    if (!searchQuery) return site.installations
    return site.installations.filter(
      (i) => matchesSearch(i.code, searchQuery) || matchesSearch(i.name, searchQuery),
    )
  }, [site.installations, searchQuery])

  const hasChildren = visibleInstallations.length > 0
  const isExpanded = expanded || !!searchQuery

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          className="gl-button gl-button-default"
          onClick={() => setExpanded((p) => !p)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-default group flex flex-1 text-left"
          onClick={() => onSelect('ar-site', site.id)}
        >
          <Landmark size={14} className="text-blue-500 shrink-0" />
          <span className="font-mono text-[11px] text-muted-foreground">{site.code}</span>
          <span className="truncate text-foreground">{site.name}</span>
          <StatusDot status={site.status} />
          {site.installation_count > 0 && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {site.installation_count} inst.
            </span>
          )}
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-5 pl-3 border-l border-border/60">
          {visibleInstallations.map((inst) => (
            <InstallationNode key={inst.id} inst={inst} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}


// ── Field Node ───────────────────────────────────────────────

function FieldNode({
  field,
  searchQuery,
  defaultExpanded,
  onSelect,
}: {
  field: HierarchyFieldNode
  searchQuery: string
  defaultExpanded: boolean
  onSelect: (module: string, id: string) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const visibleSites = useMemo(() => {
    if (!searchQuery) return field.sites
    return field.sites.filter((s) => siteMatchesSearch(s, searchQuery))
  }, [field.sites, searchQuery])

  const hasChildren = visibleSites.length > 0
  const isExpanded = expanded || !!searchQuery

  return (
    <div className="mb-1">
      <div className="flex items-center">
        <button
          type="button"
          className="gl-button gl-button-default"
          onClick={() => setExpanded((p) => !p)}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>
        <button
          type="button"
          className="gl-button gl-button-default group flex flex-1 text-left text-sm"
          onClick={() => onSelect('ar-field', field.id)}
        >
          <MapPin size={14} className="text-emerald-600 shrink-0" />
          <span className="font-mono text-[11px] text-muted-foreground">{field.code}</span>
          <span className="truncate text-foreground">{field.name}</span>
          <StatusDot status={field.status} />
          {field.site_count > 0 && (
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {field.site_count} sites
            </span>
          )}
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-5 pl-3 border-l border-border/60">
          {visibleSites.map((site) => (
            <SiteNode
              key={site.id}
              site={site}
              searchQuery={searchQuery}
              defaultExpanded={field.sites.length <= 3}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}


// ── Main Component ───────────────────────────────────────────

export function AssetHierarchyTree() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)

  const { data: hierarchy, isLoading } = useHierarchy()

  const filteredFields = useMemo(() => {
    if (!hierarchy) return []
    if (!searchQuery) return hierarchy
    return hierarchy.filter((f) => fieldMatchesSearch(f, searchQuery))
  }, [hierarchy, searchQuery])

  const handleSelect = useCallback(
    (module: string, id: string) => {
      openDynamicPanel({ type: 'detail', module, id })
    },
    [openDynamicPanel],
  )

  // Totals for summary bar
  const totals = useMemo(() => {
    if (!hierarchy) return { fields: 0, sites: 0, installations: 0, equipment: 0 }
    let sites = 0
    let installations = 0
    let equipment = 0
    for (const f of hierarchy) {
      sites += f.sites.length
      for (const s of f.sites) {
        installations += s.installations.length
        for (const i of s.installations) {
          equipment += i.equipment_count
        }
      }
    }
    return { fields: hierarchy.length, sites, installations, equipment }
  }, [hierarchy])

  return (
    <div className="flex flex-col h-full">
      {/* Search bar — matches DataTable toolbar style */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="gl-toolbar-search relative flex items-center">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('assets.search_hierarchy')}
            className="gl-form-input w-full pl-8 text-sm"
          />
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-4 py-2 border-b border-border shrink-0 flex items-center gap-3 text-[11px] text-muted-foreground bg-muted/30">
        <span className="flex items-center gap-1"><MapPin size={12} className="text-emerald-600" /> {totals.fields} {t('assets.fields')}</span>
        <span className="flex items-center gap-1"><Landmark size={12} className="text-blue-500" /> {totals.sites} {t('assets.sites')}</span>
        <span className="flex items-center gap-1"><Factory size={12} className="text-orange-500" /> {totals.installations} {t('assets.installations')}</span>
        <span className="flex items-center gap-1"><Wrench size={12} className="text-purple-500" /> {totals.equipment} {t('assets.equipment_tab')}</span>
      </div>

      {/* Tree content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {isLoading && (
          <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
            <Loader2 size={16} className="animate-spin" />
            {t('common.loading')}
          </div>
        )}

        {!isLoading && filteredFields.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground text-sm">
            <FolderTree size={24} />
            {searchQuery ? t('common.no_results') : t('assets.no_hierarchy_data')}
          </div>
        )}

        {!isLoading &&
          filteredFields.map((field) => (
            <FieldNode
              key={field.id}
              field={field}
              searchQuery={searchQuery}
              defaultExpanded={filteredFields.length <= 5}
              onSelect={handleSelect}
            />
          ))}
      </div>
    </div>
  )
}
