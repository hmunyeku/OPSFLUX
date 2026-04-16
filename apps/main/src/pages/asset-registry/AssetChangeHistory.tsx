/**
 * Asset Change History — timeline view of field-level changes for an AR entity.
 *
 * Used inside each DetailPanel "Historique" tab, and also as a compact
 * "Recent changes" widget in the dashboard.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, ChevronLeft, ChevronRight, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAssetChangeLog, useRecentAssetChanges } from '@/hooks/useAssetRegistry'
import type { AssetChangeLogEntry } from '@/types/assetRegistry'

// ── Helpers ─────────────────────────────────────────────────

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Creation', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
  update: { label: 'Modification', color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40' },
  archive: { label: 'Archivage', color: 'text-red-600 bg-red-50 dark:bg-red-950/40' },
}

const ENTITY_TYPE_LABELS: Record<string, string> = {
  ar_field: 'Champ',
  ar_site: 'Site',
  ar_installation: 'Installation',
  ar_equipment: 'Equipement',
  ar_pipeline: 'Pipeline',
}

function formatFieldName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "A l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `Il y a ${diffD}j`
  return formatDate(iso)
}

// ── Single change row ────────────────────────────────────────

function ChangeRow({ entry }: { entry: AssetChangeLogEntry }) {
  const changeInfo = CHANGE_TYPE_LABELS[entry.change_type] || CHANGE_TYPE_LABELS.update

  return (
    <div className="flex gap-3 py-2.5 px-3 rounded-md hover:bg-accent/40 transition-colors group">
      {/* Timeline dot */}
      <div className="flex flex-col items-center pt-1 shrink-0">
        <div className={cn('h-2 w-2 rounded-full', entry.change_type === 'archive' ? 'bg-red-500' : entry.change_type === 'create' ? 'bg-emerald-500' : 'bg-blue-500')} />
        <div className="flex-1 w-px bg-border mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', changeInfo.color)}>
            {changeInfo.label}
          </span>
          <span className="text-xs font-medium text-foreground">
            {formatFieldName(entry.field_name)}
          </span>
        </div>

        {/* Old -> New value */}
        {entry.change_type === 'update' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="truncate max-w-[120px] line-through opacity-60" title={entry.old_value ?? ''}>
              {entry.old_value ?? '(vide)'}
            </span>
            <ArrowRight size={10} className="shrink-0" />
            <span className="truncate max-w-[120px] font-medium text-foreground" title={entry.new_value ?? ''}>
              {entry.new_value ?? '(vide)'}
            </span>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{entry.changed_by_name || 'Utilisateur'}</span>
          <span className="opacity-40">|</span>
          <span>{formatDate(entry.changed_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Entity Change Log (for DetailPanel tab) ──────────────────

export function AssetEntityChangeLog({
  entityType,
  entityId,
}: {
  entityType: string
  entityId: string
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const { data, isLoading } = useAssetChangeLog(entityType, entityId, page, 15)

  const items = data?.items ?? []
  const totalPages = data?.pages ?? 0

  return (
    <div className="py-2 px-1">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground/50">
          <History size={32} strokeWidth={1.5} />
          <span className="text-sm">{t('assets.no_changes')}</span>
        </div>
      ) : (
        <>
          <div className="space-y-0.5">
            {items.map((entry) => (
              <ChangeRow key={entry.id} entry={entry} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3 mt-2 border-t border-border">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Recent Changes Widget (for Dashboard) ────────────────────

export function RecentAssetChanges() {
  const { t } = useTranslation()
  const { data: items, isLoading } = useRecentAssetChanges(10)

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <History size={14} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{t('assets.recent_changes')}</h3>
      </div>
      <div className="p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">{t('assets.no_changes')}</p>
        ) : (
          <div className="space-y-0.5 max-h-[380px] overflow-y-auto">
            {items.map((entry) => (
              <div key={entry.id} className="flex gap-2.5 py-2 px-2 rounded-md hover:bg-accent/40 transition-colors">
                {/* Dot */}
                <div className="pt-1.5 shrink-0">
                  <div className={cn('h-2 w-2 rounded-full', entry.change_type === 'archive' ? 'bg-red-500' : entry.change_type === 'create' ? 'bg-emerald-500' : 'bg-blue-500')} />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-medium text-foreground truncate">{entry.entity_code}</span>
                    <span className="text-muted-foreground">
                      {ENTITY_TYPE_LABELS[entry.entity_type] || entry.entity_type}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    <span className="font-medium">{formatFieldName(entry.field_name)}</span>
                    {entry.change_type === 'update' && entry.new_value && (
                      <span className="ml-1 text-foreground">= {entry.new_value}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                    {entry.changed_by_name || 'Utilisateur'} &middot; {formatRelative(entry.changed_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
