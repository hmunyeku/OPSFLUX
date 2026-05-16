/**
 * WaitlistTab.v2.tsx — Pajamas++ refonte. Reprend l'API existante :
 *   - useAdsWaitlist, useDecideAdsPax, useUpdateAdsWaitlistPriority
 *   - AdsWaitlistItem (services/paxlogService.ts)
 *
 * Nouveauté visuelle : regroupement par AdS (par défaut) ou liste plate ;
 * édition de priorité en stepper inline ; bulk-bar pour actions groupées.
 */
import { useTranslation } from 'react-i18next'
import { useState, useCallback, useMemo } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useDecideAdsPax, useUpdateAdsWaitlistPriority, useAdsWaitlist } from '@/hooks/usePaxlog'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useToast } from '@/components/ui/Toast'
import { ThumbsUp, ThumbsDown, Clock, Shield, AlertTriangle, Minus, Plus, MoreHorizontal, ChevronDown } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import type { AdsWaitlistItem } from '@/services/paxlogService'
import { ADS_STATUS_LABELS_FALLBACK, formatDateTime, ADS_STATUS_BADGES } from '../shared'
import { PaxlogPageHeader, PaxlogStatRail, PaxlogToolbar, PaxlogBulkBar } from '../components/PaxlogShell'

type GroupingMode = 'by-ads' | 'flat'
type Filter = 'all' | 'high' | 'manual' | 'blocked' | 'old'

export function WaitlistTabV2({ openDetail }: { openDetail: (id: string) => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [grouping, setGrouping] = useState<GroupingMode>('by-ads')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState(0)
  const [collapsedAds, setCollapsedAds] = useState<Set<string>>(new Set())
  const debouncedSearch = useDebounce(search, 300)

  const decideAdsPax = useDecideAdsPax()
  const updatePrio = useUpdateAdsWaitlistPriority()
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const { toast } = useToast()

  const { data, isLoading } = useAdsWaitlist({ page: 1, page_size: 200, search: debouncedSearch || undefined })
  const items = data?.items ?? []

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filter === 'high' && (it.priority_score ?? 0) < 80) return false
      if (filter === 'manual' && it.priority_source !== 'manual_override') return false
      if (filter === 'blocked' && it.ads_status !== 'pending_arbitration') return false
      if (filter === 'old') {
        if (!it.submitted_at) return false
        const days = (Date.now() - new Date(it.submitted_at).getTime()) / (1000 * 60 * 60 * 24)
        if (days < 5) return false
      }
      return true
    })
  }, [items, filter])

  const stats = useMemo(() => {
    const high = items.filter((i) => (i.priority_score ?? 0) >= 80).length
    const manual = items.filter((i) => i.priority_source === 'manual_override').length
    const remaining = items.reduce((s, i) => s + (i.remaining_capacity ?? 0), 0)
    const old = items.filter((i) => {
      if (!i.submitted_at) return false
      return (Date.now() - new Date(i.submitted_at).getTime()) / 86400000 >= 5
    }).length
    return { total: items.length, high, manual, remaining, old }
  }, [items])

  // Group by ADS reference
  const grouped = useMemo(() => {
    if (grouping !== 'by-ads') return null
    const map = new Map<string, { ref: string; items: AdsWaitlistItem[]; cap?: number; rem?: number; status: string; title: string }>()
    filtered.forEach((it) => {
      const k = it.ads_id
      const ex = map.get(k)
      if (ex) ex.items.push(it)
      else map.set(k, {
        ref: it.ads_reference,
        items: [it],
        cap: it.capacity_limit ?? undefined,
        rem: it.remaining_capacity ?? undefined,
        status: it.ads_status,
        title: it.planner_activity_title || '',
      })
    })
    return Array.from(map.entries()).map(([k, v]) => ({ adsId: k, ...v }))
  }, [filtered, grouping])

  const toggleAds = (adsId: string) => {
    const n = new Set(collapsedAds)
    n.has(adsId) ? n.delete(adsId) : n.add(adsId)
    setCollapsedAds(n)
  }
  const toggleSelect = (id: string) => {
    const n = new Set(selected)
    n.has(id) ? n.delete(id) : n.add(id)
    setSelected(n)
  }
  const startEdit = useCallback((row: AdsWaitlistItem) => {
    setEditingId(row.ads_pax_id)
    setEditValue(row.priority_score ?? 0)
  }, [])
  const commitEdit = useCallback((row: AdsWaitlistItem) => {
    if (!Number.isFinite(editValue) || editValue < 0) return
    updatePrio.mutate(
      { entryId: row.ads_pax_id, payload: { priority_score: editValue, reason: t('paxlog.waitlist.actions.priority_reason') } },
      { onSuccess: () => { setEditingId(null); toast({ title: t('paxlog.waitlist.toasts.priority_updated'), variant: 'success' }) } },
    )
  }, [editValue, updatePrio, t, toast])
  const handleDecision = (row: AdsWaitlistItem, action: 'approve' | 'reject') => {
    decideAdsPax.mutate({ adsId: row.ads_id, entryId: row.ads_pax_id, payload: { action, reason: '' } })
  }

  return (
    <>
      <PaxlogPageHeader
        title={t('paxlog.tabs.waitlist', "Liste d'attente")}
        count={stats.total}
        subtitle={
          <span>
            sur <strong>{grouped?.length ?? 0}</strong> AdS · <strong style={{ color: 'hsl(var(--destructive))' }}>{stats.old}</strong> demandes &gt; 5 jours
          </span>
        }
      />

      <PaxlogStatRail items={[
        { id: 'total',  label: t('paxlog.waitlist.kpi.total', 'En attente'), value: stats.total, icon: Clock, tone: 'warning' },
        { id: 'high',   label: t('paxlog.waitlist.kpi.high', 'Prio ≥ 80'), value: stats.high, icon: Shield, tone: stats.high > 0 ? 'danger' : undefined,
          onClick: () => setFilter(filter === 'high' ? 'all' : 'high'), active: filter === 'high' },
        { id: 'manual', label: t('paxlog.waitlist.kpi.manual', 'Manuel'), value: stats.manual, icon: Shield,
          onClick: () => setFilter(filter === 'manual' ? 'all' : 'manual'), active: filter === 'manual' },
        { id: 'cap',    label: t('paxlog.waitlist.kpi.remaining_capacity', 'Places libres'), value: stats.remaining, icon: Shield,
          tone: stats.remaining === 0 ? 'danger' : undefined },
        { id: 'old',    label: t('paxlog.waitlist.kpi.old', '> 5 jours'), value: stats.old, icon: AlertTriangle,
          tone: stats.old > 0 ? 'danger' : undefined,
          onClick: () => setFilter(filter === 'old' ? 'all' : 'old'), active: filter === 'old' },
      ]} />

      <PaxlogToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('paxlog.waitlist.search', 'AdS, projet, passager, société…')}
        segmented={[
          { id: 'by-ads', label: t('paxlog.waitlist.group.by_ads', 'Par AdS'), active: grouping === 'by-ads', onClick: () => setGrouping('by-ads') },
          { id: 'flat',   label: t('paxlog.waitlist.group.flat', 'Liste plate'),  active: grouping === 'flat',   onClick: () => setGrouping('flat') },
        ]}
        chips={[
          { id: 'all', label: t('common.all'), count: stats.total, active: filter === 'all', onClick: () => setFilter('all') },
        ]}
      />

      <PaxlogBulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button className="btn-xs btn-secondary">{t('paxlog.waitlist.actions.set_priority', 'Modifier priorité')}</button>
        <button className="btn-xs btn-success" onClick={() => {
          selected.forEach((id) => {
            const row = items.find((i) => i.ads_pax_id === id)
            if (row) handleDecision(row, 'approve')
          })
          setSelected(new Set())
        }}><ThumbsUp size={11} /> {t('common.approve')}</button>
        <button className="btn-xs btn-danger" onClick={() => {
          selected.forEach((id) => {
            const row = items.find((i) => i.ads_pax_id === id)
            if (row) handleDecision(row, 'reject')
          })
          setSelected(new Set())
        }}><ThumbsDown size={11} /> {t('common.reject')}</button>
      </PaxlogBulkBar>

      <PanelContent>
        {isLoading && <div className="p-4 text-xs text-muted-foreground">{t('common.loading')}</div>}

        {grouping === 'by-ads' && grouped?.map((g) => {
          const isCollapsed = collapsedAds.has(g.adsId)
          const over = (g.cap ?? 0) > 0 && g.items.length > (g.cap ?? 0)
          return (
            <article key={g.adsId} className={`paxlog-ads-group ${over ? 'is-over' : ''}`}>
              <header className="paxlog-ads-group__head" onClick={() => toggleAds(g.adsId)}>
                <button className="paxlog-ads-group__toggle" aria-label="Toggle">
                  <ChevronDown size={13} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none' }} />
                </button>
                <div className="paxlog-ads-group__id">
                  <span className="paxlog-ads-group__ref">{g.ref}</span>
                  <span className="paxlog-ads-group__title">{g.title}</span>
                  <span className={`chip ${ADS_STATUS_BADGES[g.status] || ''}`}>{adsStatusLabels[g.status] || g.status}</span>
                </div>
                <div className="paxlog-ads-group__cap">
                  <span className="paxlog-cap-num">{g.items.length}/{g.cap ?? '—'}</span>
                  {over && <span className="paxlog-cap-warn">+{g.items.length - (g.cap ?? 0)}</span>}
                </div>
                <button className="btn-xs btn-secondary" onClick={(e) => { e.stopPropagation(); openDetail(g.adsId) }}>
                  {t('common.open', 'Ouvrir')} →
                </button>
              </header>

              {!isCollapsed && (
                <table className="paxlog-pax-tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 24 }}></th>
                      <th style={{ width: 70 }}>{t('paxlog.waitlist.columns.priority', 'Prio')}</th>
                      <th>{t('paxlog.waitlist.columns.pax', 'Passager')}</th>
                      <th>{t('paxlog.columns.company', 'Société')}</th>
                      <th>{t('paxlog.waitlist.columns.submitted_at')}</th>
                      <th>{t('common.status')}</th>
                      <th style={{ width: 96, textAlign: 'right' }}>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0)).map((row) => {
                      const isEditing = editingId === row.ads_pax_id
                      const isSel = selected.has(row.ads_pax_id)
                      const score = row.priority_score ?? 0
                      const lvl = score >= 80 ? 'high' : score >= 40 ? 'med' : 'low'
                      return (
                        <tr key={row.ads_pax_id} data-selected={isSel ? 'true' : undefined}>
                          <td><input type="checkbox" checked={isSel} onChange={() => toggleSelect(row.ads_pax_id)} /></td>
                          <td>
                            {isEditing ? (
                              <span className="paxlog-prio-edit">
                                <button onClick={() => setEditValue(Math.max(0, editValue - 5))}><Minus size={11} /></button>
                                <input value={editValue} onChange={(e) => setEditValue(Number(e.target.value))} onBlur={() => commitEdit(row)} autoFocus />
                                <button onClick={() => setEditValue(Math.min(100, editValue + 5))}><Plus size={11} /></button>
                              </span>
                            ) : (
                              <span className={`paxlog-prio paxlog-prio--${lvl}`} onClick={() => startEdit(row)}
                                data-manual={row.priority_source === 'manual_override' ? 'true' : undefined}
                                title={row.priority_source === 'manual_override' ? t('paxlog.waitlist.sources.manual_override') : ''}>
                                {score}
                              </span>
                            )}
                          </td>
                          <td>
                            <strong>{row.pax_last_name} {row.pax_first_name}</strong>
                          </td>
                          <td className="muted text-xs">{row.pax_company_name || '—'}</td>
                          <td className="muted text-xs tabular-nums">{formatDateTime(row.submitted_at)}</td>
                          <td><span className="chip chip-warn">{t('paxlog.waitlist.pending', 'En attente')}</span></td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="inline-flex gap-1">
                              <button className="btn-xs btn-success" onClick={() => handleDecision(row, 'approve')} aria-label={t('common.approve')}><ThumbsUp size={11} /></button>
                              <button className="btn-xs btn-danger" onClick={() => handleDecision(row, 'reject')} aria-label={t('common.reject')}><ThumbsDown size={11} /></button>
                              <button className="btn-xs btn-secondary" aria-label={t('common.more', 'Plus')}><MoreHorizontal size={11} /></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </article>
          )
        })}

        {grouping === 'flat' && (
          <div className="p-3 text-xs text-muted-foreground">
            {t('paxlog.waitlist.flat_hint', 'Pour la vue plate, voir l\'écran ADS Detail Panel v2.html.')}
          </div>
        )}
      </PanelContent>
    </>
  )
}
