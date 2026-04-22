/**
 * SearchPage — GitLab-style Advanced Search with scope tabs,
 * paginated results, and URL-based state persistence.
 *
 * URL params: ?q=keyword&scope=asset&page=1
 * Syncs with uiStore.globalSearch when landing from topbar.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search,
  MapPin,
  Building2,
  Users,
  User,
  FileText,
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wrench,
  Briefcase,
  Calendar,
  UserCheck,
  AlertTriangle,
  Ship,
  Package,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { useUIStore } from '@/stores/uiStore'
import type { SearchResult, SearchResponse } from '@/types/api'

// ── Scope definitions ──────────────────────────────────────────

interface ScopeDef {
  id: string
  labelKey: string
  icon: LucideIcon
}

const SCOPES: ScopeDef[] = [
  { id: 'all', labelKey: 'search.scope_all', icon: Search },
  { id: 'asset', labelKey: 'assets.title', icon: MapPin },
  { id: 'tier', labelKey: 'tiers.title', icon: Building2 },
  { id: 'user', labelKey: 'users.title', icon: Users },
  { id: 'moc', labelKey: 'search.scope_moc', icon: Wrench },
  { id: 'project', labelKey: 'search.scope_project', icon: Briefcase },
  { id: 'activity', labelKey: 'search.scope_activity', icon: Calendar },
  { id: 'ads', labelKey: 'search.scope_ads', icon: UserCheck },
  { id: 'incident', labelKey: 'search.scope_incident', icon: AlertTriangle },
  { id: 'voyage', labelKey: 'search.scope_voyage', icon: Ship },
  { id: 'cargo', labelKey: 'search.scope_cargo', icon: Package },
  { id: 'compliance', labelKey: 'search.scope_compliance', icon: ShieldCheck },
]

const PAGE_SIZE = 25

// ── Icon / color helpers per result type ────────────────────────

function iconForResultType(type: string): LucideIcon {
  switch (type) {
    case 'asset':      return MapPin
    case 'tier':       return Building2
    case 'user':       return User
    case 'document':   return FileText
    case 'workflow':   return GitBranch
    case 'moc':        return Wrench
    case 'project':    return Briefcase
    case 'activity':   return Calendar
    case 'ads':        return UserCheck
    case 'incident':   return AlertTriangle
    case 'voyage':     return Ship
    case 'cargo':      return Package
    case 'compliance': return ShieldCheck
    default:           return FileText
  }
}

function colorForResultType(type: string): string {
  switch (type) {
    case 'asset':      return 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    case 'tier':       return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    case 'user':       return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    case 'document':   return 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
    case 'workflow':   return 'bg-pink-500/15 text-pink-600 dark:text-pink-400'
    case 'moc':        return 'bg-orange-500/15 text-orange-600 dark:text-orange-400'
    case 'project':    return 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
    case 'activity':   return 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400'
    case 'ads':        return 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
    case 'incident':   return 'bg-red-500/15 text-red-600 dark:text-red-400'
    case 'voyage':     return 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
    case 'cargo':      return 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
    case 'compliance': return 'bg-lime-500/15 text-lime-600 dark:text-lime-400'
    default:           return 'bg-muted text-muted-foreground'
  }
}

const RESULT_TYPE_LABEL_KEYS: Record<string, string> = {
  asset: 'search.type_asset',
  tier: 'search.type_tier',
  user: 'search.type_user',
  document: 'search.type_document',
  workflow: 'search.type_workflow',
  moc: 'search.type_moc',
  project: 'search.type_project',
  activity: 'search.type_activity',
  ads: 'search.type_ads',
  incident: 'search.type_incident',
  voyage: 'search.type_voyage',
  cargo: 'search.type_cargo',
  compliance: 'search.type_compliance',
}

// ── SearchPage ──────────────────────────────────────────────────

export function SearchPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL state
  const urlQuery = searchParams.get('q') ?? ''
  const urlScope = searchParams.get('scope') ?? 'all'
  const urlPage = parseInt(searchParams.get('page') ?? '1', 10)

  // Local input state (debounced before URL push)
  const [inputValue, setInputValue] = useState(urlQuery)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Search results state
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Sync from uiStore globalSearch on mount (when landing from topbar)
  const globalSearch = useUIStore((s) => s.globalSearch)
  const setGlobalSearch = useUIStore((s) => s.setGlobalSearch)
  const didSyncRef = useRef(false)

  useEffect(() => {
    if (didSyncRef.current) return
    didSyncRef.current = true

    // If we arrived with a globalSearch value but no URL query, use globalSearch
    if (globalSearch && !urlQuery) {
      setInputValue(globalSearch)
      setSearchParams({ q: globalSearch, scope: urlScope, page: '1' }, { replace: true })
    }
    // Clear globalSearch after syncing so topbar resets
    if (globalSearch) {
      setGlobalSearch('')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep input in sync when URL changes externally (back/forward nav)
  useEffect(() => {
    setInputValue(urlQuery)
  }, [urlQuery])

  // Input ref for autofocus
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ── Debounced URL update from input ────────────────────────────

  const updateSearchParams = useCallback(
    (q: string) => {
      const params: Record<string, string> = { page: '1' }
      if (q) params.q = q
      if (urlScope !== 'all') params.scope = urlScope
      setSearchParams(params, { replace: true })
    },
    [urlScope, setSearchParams],
  )

  const handleInputChange = useCallback(
    (value: string) => {
      setInputValue(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => updateSearchParams(value), 300)
    },
    [updateSearchParams],
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ── Scope change ───────────────────────────────────────────────

  const handleScopeChange = useCallback(
    (scope: string) => {
      const params: Record<string, string> = { page: '1' }
      if (urlQuery) params.q = urlQuery
      if (scope !== 'all') params.scope = scope
      setSearchParams(params, { replace: true })
    },
    [urlQuery, setSearchParams],
  )

  // ── Pagination ─────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(totalResults / PAGE_SIZE))
  const currentPage = Math.min(urlPage, totalPages)

  const handlePageChange = useCallback(
    (page: number) => {
      const params: Record<string, string> = { page: String(page) }
      if (urlQuery) params.q = urlQuery
      if (urlScope !== 'all') params.scope = urlScope
      setSearchParams(params, { replace: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [urlQuery, urlScope, setSearchParams],
  )

  // ── API fetch ──────────────────────────────────────────────────

  useEffect(() => {
    if (!urlQuery || urlQuery.length < 2) {
      setResults([])
      setTotalResults(0)
      setHasSearched(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const fetchResults = async () => {
      try {
        const params: Record<string, string | number> = {
          q: urlQuery,
        }
        if (urlScope !== 'all') {
          params.types = urlScope
        }

        const res = await api.get<SearchResponse & { total?: number }>(
          '/api/v1/search',
          { params },
        )

        if (cancelled) return

        const data = res.data
        setResults(data.results ?? [])
        // The API may or may not return a total count.
        // If it does, use it; otherwise estimate from results length.
        setTotalResults(data.total ?? data.results?.length ?? 0)
        setHasSearched(true)
      } catch {
        if (!cancelled) {
          setResults([])
          setTotalResults(0)
          setHasSearched(true)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchResults()

    return () => {
      cancelled = true
    }
  }, [urlQuery, urlScope, currentPage])

  // ── Filter results by scope (client-side fallback) ─────────────

  const filteredResults = useMemo(() => {
    if (urlScope === 'all') return results
    return results.filter((r) => r.type === urlScope)
  }, [results, urlScope])

  // ── Pagination page numbers ────────────────────────────────────

  const pageNumbers = useMemo(() => {
    const pages: (number | 'ellipsis')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (currentPage > 3) pages.push('ellipsis')
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      for (let i = start; i <= end; i++) pages.push(i)
      if (currentPage < totalPages - 2) pages.push('ellipsis')
      pages.push(totalPages)
    }
    return pages
  }, [currentPage, totalPages])

  // ── Result item navigation ─────────────────────────────────────

  const handleResultClick = useCallback(
    (result: SearchResult) => {
      navigate(result.url)
    },
    [navigate],
  )

  // ── Render ─────────────────────────────────────────────────────

  const startItem = (currentPage - 1) * PAGE_SIZE + 1
  const endItem = Math.min(currentPage * PAGE_SIZE, totalResults)

  return (
    <div className="flex flex-col h-full">
      <PanelHeader icon={Search} title={t('search.title')} />

      <PanelContent className="bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          {/* ── Search input ────────────────────────────────── */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (debounceRef.current) clearTimeout(debounceRef.current)
                  updateSearchParams(inputValue)
                }
              }}
              placeholder={t('search.placeholder')}
              className="w-full h-10 px-4 pl-10 text-sm border border-border/60 rounded-lg bg-card focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-colors text-foreground placeholder:text-muted-foreground"
            />
            {isLoading && (
              <Loader2
                size={16}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
              />
            )}
          </div>

          {/* ── Scope tabs + results count ───────────────────── */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              {SCOPES.map((scope) => {
                const isActive = urlScope === scope.id
                const Icon = scope.icon
                return (
                  <button
                    key={scope.id}
                    onClick={() => handleScopeChange(scope.id)}
                    className={cn(
                      'gl-button-sm',
                      isActive ? 'gl-button-primary' : 'gl-button-default',
                    )}
                  >
                    <Icon size={13} />
                    {t(scope.labelKey)}
                  </button>
                )
              })}
            </div>

            {hasSearched && totalResults > 0 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t(totalResults === 1 ? 'search.results_count' : 'search.results_count_plural', { count: totalResults })}
              </span>
            )}
          </div>

          {/* ── Separator ────────────────────────────────────── */}
          {(hasSearched || urlQuery.length >= 2) && (
            <div className="border-t border-border/40" />
          )}

          {/* ── Results ──────────────────────────────────────── */}
          {isLoading && !hasSearched && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="text-muted-foreground animate-spin" />
            </div>
          )}

          {!isLoading && hasSearched && filteredResults.length === 0 && (
            <EmptyState
              variant="search"
              title={t('search.no_results')}
              description={
                urlQuery
                  ? t('search.no_results_for', { query: urlQuery })
                  : t('search.empty_description')
              }
            />
          )}

          {!urlQuery && !hasSearched && (
            <EmptyState
              variant="blank"
              icon={Search}
              title={t('search.advanced_title')}
              description={t('search.empty_description')}
            />
          )}

          {filteredResults.length > 0 && (
            <div className="rounded-lg border border-border/40 overflow-hidden bg-card">
              {filteredResults.map((result, idx) => {
                const Icon = iconForResultType(result.type)
                const colorClass = colorForResultType(result.type)
                const typeLabel = RESULT_TYPE_LABEL_KEYS[result.type]
                  ? t(RESULT_TYPE_LABEL_KEYS[result.type])
                  : result.type

                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    onClick={() => handleResultClick(result)}
                    className={cn(
                      'flex items-center gap-3 w-full text-left px-4 py-3 transition-colors',
                      'hover:bg-accent/50 cursor-pointer',
                      idx < filteredResults.length - 1 && 'border-b border-border/40',
                    )}
                  >
                    {/* Type icon with color badge */}
                    <div
                      className={cn(
                        'flex items-center justify-center w-8 h-8 rounded-md shrink-0',
                        colorClass,
                      )}
                    >
                      <Icon size={15} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">
                          {result.title}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded',
                            colorClass,
                          )}
                        >
                          {typeLabel}
                        </span>
                      </div>
                      {result.subtitle && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {result.subtitle}
                        </p>
                      )}
                    </div>

                    {/* Chevron */}
                    <ChevronRight
                      size={14}
                      className="text-muted-foreground/50 shrink-0"
                    />
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Pagination ───────────────────────────────────── */}
          {totalResults > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {t('search.showing', { start: startItem, end: endItem, total: totalResults })}
              </span>

              <div className="flex items-center gap-1">
                {/* Previous */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-md text-sm transition-colors',
                    currentPage <= 1
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                  aria-label={t('search.prev_page')}
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Page numbers */}
                {pageNumbers.map((page, idx) =>
                  page === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="flex items-center justify-center h-8 w-8 text-xs text-muted-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={cn(
                        'flex items-center justify-center h-8 w-8 rounded-md text-xs font-medium transition-colors',
                        page === currentPage
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {page}
                    </button>
                  ),
                )}

                {/* Next */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-md text-sm transition-colors',
                    currentPage >= totalPages
                      ? 'text-muted-foreground/30 cursor-not-allowed'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                  aria-label={t('search.next_page')}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </PanelContent>
    </div>
  )
}
