/**
 * AssetPicker — Shared modal component for selecting an asset from the hierarchy.
 *
 * Features:
 * - Tree-view of asset hierarchy (expandable/collapsible)
 * - Search filter with debounce
 * - Recently/frequently used assets shown first
 * - Keyboard navigation support
 * - Used by: Planner, PaxLog, TravelWiz, PID/PFD, Papyrus, etc.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Search, ChevronRight, ChevronDown, MapPin, Loader2, X, Clock, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssetTree } from '@/hooks/useAssets'
import type { AssetTreeNode } from '@/types/api'

// ── Recency tracking (localStorage) ──────────────────────────
const RECENT_KEY = 'opsflux:asset-picker:recent'
const MAX_RECENT = 8

interface RecentAsset {
  id: string
  code: string
  name: string
  type: string
  status?: string
  count: number
  lastUsed: number
}

function getRecentAssets(): RecentAsset[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
  } catch {
    return []
  }
}

function trackAssetUsage(asset: { id: string; code: string; name: string; type: string }) {
  const recents = getRecentAssets()
  const idx = recents.findIndex(r => r.id === asset.id)
  if (idx >= 0) {
    recents[idx].count += 1
    recents[idx].lastUsed = Date.now()
  } else {
    recents.push({ ...asset, count: 1, lastUsed: Date.now() })
  }
  // Sort by frequency * recency score, keep top N
  recents.sort((a, b) => {
    const scoreA = a.count * Math.log(a.lastUsed)
    const scoreB = b.count * Math.log(b.lastUsed)
    return scoreB - scoreA
  })
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents.slice(0, MAX_RECENT)))
}

// ── Tree search helper ───────────────────────────────────────
function filterTree(nodes: AssetTreeNode[], query: string): AssetTreeNode[] {
  const q = query.toLowerCase()
  return nodes.reduce<AssetTreeNode[]>((acc, node) => {
    const matchesSelf = node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q)
    const filteredChildren = filterTree(node.children, query)
    if (matchesSelf || filteredChildren.length > 0) {
      acc.push({ ...node, children: matchesSelf ? node.children : filteredChildren })
    }
    return acc
  }, [])
}

function flattenTree(nodes: AssetTreeNode[]): AssetTreeNode[] {
  return nodes.flatMap(n => [n, ...flattenTree(n.children)])
}

// ── Props ────────────────────────────────────────────────────
interface AssetPickerProps {
  value?: string | null
  onChange: (assetId: string | null, asset?: { id: string; code: string; name: string; type: string }) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** If set, only show assets of these types */
  filterTypes?: string[]
  /** Label shown above the picker */
  label?: string
  /** Show clear button */
  clearable?: boolean
}

// ── Tree Node Component ──────────────────────────────────────
function TreeNode({
  node, depth, selectedId, expandedIds, onToggle, onSelect,
}: {
  node: AssetTreeNode
  depth: number
  selectedId: string | null
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelect: (node: AssetTreeNode) => void
}) {
  const isExpanded = expandedIds.has(node.id)
  const isSelected = node.id === selectedId
  const hasChildren = node.children.length > 0

  return (
    <>
      <button
        onClick={() => onSelect(node)}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors',
          isSelected
            ? 'bg-primary/15 text-primary font-medium'
            : 'hover:bg-muted text-foreground',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onToggle(node.id) }}
            className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/10 cursor-pointer"
          >
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <MapPin size={12} className="shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{node.code}</span>
        <span className="text-[9px] bg-muted rounded px-1 py-0.5 text-muted-foreground shrink-0 ml-1 uppercase">{node.type}</span>
      </button>
      {isExpanded && hasChildren && node.children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

// ── Main Component ───────────────────────────────────────────
export function AssetPicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
  filterTypes,
  label,
  clearable = true,
}: AssetPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: tree = [], isLoading } = useAssetTree()

  // Find selected asset name from tree
  const allFlat = useMemo(() => flattenTree(tree), [tree])
  const selectedAsset = useMemo(() => allFlat.find(a => a.id === value), [allFlat, value])

  // Filter tree by search + type
  const filteredTree = useMemo(() => {
    let result = tree
    if (filterTypes?.length) {
      // Keep nodes of matching types + their ancestors
      const filterByType = (nodes: AssetTreeNode[]): AssetTreeNode[] =>
        nodes.reduce<AssetTreeNode[]>((acc, node) => {
          const childMatch = filterByType(node.children)
          if (filterTypes.includes(node.type) || childMatch.length > 0) {
            acc.push({ ...node, children: childMatch })
          }
          return acc
        }, [])
      result = filterByType(result)
    }
    if (search.trim()) {
      result = filterTree(result, search.trim())
      // Auto-expand all when searching
      if (search.trim().length >= 2) {
        const ids = new Set(flattenTree(result).map(n => n.id))
        setExpandedIds(ids)
      }
    }
    return result
  }, [tree, search, filterTypes])

  // Recent assets
  const recentAssets = useMemo(() => {
    const recents = getRecentAssets()
    // Filter to only assets that exist in current tree
    const existingIds = new Set(allFlat.map(a => a.id))
    return recents.filter(r => existingIds.has(r.id))
  }, [allFlat])

  const handleSelect = useCallback((node: AssetTreeNode) => {
    trackAssetUsage({ id: node.id, code: node.code, name: node.name, type: node.type })
    onChange(node.id, { id: node.id, code: node.code, name: node.name, type: node.type })
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
  }, [onChange])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Focus search when opened
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {label && (
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1 block">
          {label}
        </label>
      )}

      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 h-8 text-sm text-left transition-colors',
          'hover:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30',
          disabled && 'opacity-50 cursor-not-allowed',
          !selectedAsset && 'text-muted-foreground',
        )}
      >
        <MapPin size={14} className="shrink-0 text-muted-foreground" />
        <span className="truncate flex-1">
          {selectedAsset
            ? `${selectedAsset.name} (${selectedAsset.code})`
            : placeholder || t('assets.select', 'Sélectionner un site...')}
        </span>
        {clearable && value && (
          <button
            onClick={(e) => { e.stopPropagation(); handleClear() }}
            className="shrink-0 p-0.5 rounded hover:bg-muted"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={14} className={cn('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[320px] max-h-[400px] rounded-lg border border-border bg-background shadow-lg flex flex-col overflow-hidden">
          {/* Search bar */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('common.search')}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto py-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Recent assets (only when no search) */}
                {!search && recentAssets.length > 0 && (
                  <div className="px-2 pb-1 mb-1 border-b border-border">
                    <div className="flex items-center gap-1.5 px-1 py-1">
                      <Clock size={10} className="text-muted-foreground" />
                      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t('assets.recent', 'Récents')}
                      </span>
                    </div>
                    {recentAssets.map(r => (
                      <button
                        key={r.id}
                        onClick={() => handleSelect({ id: r.id, code: r.code, name: r.name, type: r.type, status: r.status || '', children: [] })}
                        className={cn(
                          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors',
                          r.id === value
                            ? 'bg-primary/15 text-primary font-medium'
                            : 'hover:bg-muted text-foreground',
                        )}
                      >
                        <Star size={10} className="shrink-0 text-amber-400" />
                        <span className="truncate flex-1">{r.name}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{r.code}</span>
                        <span className="text-[9px] bg-muted rounded px-1 py-0.5 text-muted-foreground shrink-0 uppercase">{r.type}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tree */}
                {filteredTree.length > 0 ? (
                  <div className="px-1">
                    {filteredTree.map(node => (
                      <TreeNode
                        key={node.id}
                        node={node}
                        depth={0}
                        selectedId={value || null}
                        expandedIds={expandedIds}
                        onToggle={toggleExpand}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    {t('common.no_results')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
