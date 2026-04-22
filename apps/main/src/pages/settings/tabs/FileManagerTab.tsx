/**
 * FileManagerTab — Admin file browser with storage stats.
 *
 * Shows: storage statistics, file list with search/filter, recent uploads.
 * Accessible only to admins with core.settings.manage permission.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  HardDrive, FileText, Image, Film, FileArchive, File, Search,
  Download, Loader2, RefreshCw, Database,
} from 'lucide-react'
import api from '@/lib/api'
import { EmptyState } from '@/components/ui/EmptyState'
import { panelInputClass } from '@/components/layout/DynamicPanel'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

function getFileIcon(contentType: string) {
  if (contentType?.startsWith('image/')) return Image
  if (contentType?.startsWith('video/')) return Film
  if (contentType?.includes('pdf') || contentType?.includes('document')) return FileText
  if (contentType?.includes('zip') || contentType?.includes('archive')) return FileArchive
  return File
}

const OWNER_TYPE_LABELS: Record<string, string> = {
  user: 'Utilisateurs',
  tier: 'Entreprises',
  asset: 'Assets',
  entity: 'Entités',
  compliance_record: 'Conformité',
  compliance_rule: 'Règles',
  compliance_type: 'Types conformité',
  compliance_exemption: 'Exemptions',
  job_position: 'Fiches de poste',
  project: 'Projets',
  note: 'Notes',
  support_ticket: 'Tickets support',
  ar_field: 'Champs pétroliers',
  ar_site: 'Sites',
  ar_installation: 'Installations',
  ar_equipment: 'Équipements',
  ar_pipeline: 'Pipelines',
  announcement: 'Annonces',
}

export function FileManagerTab() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [page, setPage] = useState(1)

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['admin-file-stats'],
    queryFn: () => api.get('/api/v1/admin/files/stats').then(r => r.data),
  })

  const { data: files, isLoading: filesLoading } = useQuery({
    queryKey: ['admin-files-browse', filterType, search, page],
    queryFn: () => api.get('/api/v1/admin/files/browse', {
      params: { owner_type: filterType || undefined, search: search || undefined, page, page_size: 50 },
    }).then(r => r.data),
  })

  return (
    <div className="space-y-6">
      {/* Storage overview */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <HardDrive size={14} />
            Stockage
          </h3>
          <button onClick={() => refetchStats()} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={12} />
          </button>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
        ) : stats ? (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Fichiers</p>
                <p className="text-lg font-bold text-foreground">{stats.total_files}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Taille totale</p>
                <p className="text-lg font-bold text-foreground">{formatBytes(stats.total_bytes)}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Backend</p>
                <p className="text-lg font-bold text-foreground capitalize">{stats.storage_backend}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Limite</p>
                <p className="text-lg font-bold text-foreground">{stats.storage_config?.max_file_size_mb} Mo/fichier</p>
              </div>
            </div>

            {/* By owner type */}
            {stats.by_owner_type?.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">{t('settings.par_categorie')}</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {stats.by_owner_type.map((t: any) => (
                    <button
                      key={t.owner_type}
                      onClick={() => setFilterType(filterType === t.owner_type ? '' : t.owner_type)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                        filterType === t.owner_type ? 'border-primary bg-primary/5 text-primary' : 'border-border/60 hover:border-border'
                      }`}
                    >
                      <span className="font-medium">{OWNER_TYPE_LABELS[t.owner_type] || t.owner_type}</span>
                      <span className="text-muted-foreground">{t.count} · {formatBytes(t.bytes)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* File browser */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Database size={14} />
            Fichiers
          </h3>
          <div className="flex-1" />
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder={t('common.search')}
              className={`${panelInputClass} !pl-7 !h-8 !text-xs w-48`}
            />
          </div>
        </div>

        {filesLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
        ) : files?.items?.length > 0 ? (
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[1fr_100px_80px_80px_40px] gap-2 px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase border-b border-border">
              <span>Nom</span>
              <span>Type</span>
              <span>Taille</span>
              <span>Date</span>
              <span></span>
            </div>
            {files.items.map((file: any) => {
              const Icon = getFileIcon(file.content_type)
              return (
                <div key={file.id} className="grid grid-cols-[1fr_100px_80px_80px_40px] gap-2 px-3 py-2 text-xs hover:bg-muted/30 rounded transition-colors items-center">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={14} className="text-muted-foreground shrink-0" />
                    <span className="truncate font-medium">{file.original_name}</span>
                  </div>
                  <span className="text-muted-foreground truncate">{OWNER_TYPE_LABELS[file.owner_type] || file.owner_type}</span>
                  <span className="text-muted-foreground tabular-nums">{formatBytes(file.size_bytes)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {file.created_at ? new Date(file.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '—'}
                  </span>
                  <button
                    onClick={async () => {
                      const { default: apiClient } = await import('@/lib/api')
                      const r = await apiClient.get(`/api/v1/attachments/${file.id}/download`, { responseType: 'blob' })
                      const url = window.URL.createObjectURL(new Blob([r.data]))
                      const a = document.createElement('a'); a.href = url; a.download = file.original_name; a.click(); window.URL.revokeObjectURL(url)
                    }}
                    className="p-1 rounded hover:bg-muted text-muted-foreground"
                    title={t('shared.telecharger')}
                  >
                    <Download size={12} />
                  </button>
                </div>
              )
            })}

            {/* Pagination */}
            {files.total > 50 && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-border mt-2">
                <span className="text-xs text-muted-foreground">{files.total} fichiers au total</span>
                <div className="flex items-center gap-1">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gl-button-sm gl-button-default text-[10px]">{t('common.previous')}</button>
                  <span className="text-xs text-muted-foreground px-2">{page}/{Math.ceil(files.total / 50)}</span>
                  <button disabled={page * 50 >= files.total} onClick={() => setPage(p => p + 1)} className="gl-button-sm gl-button-default text-[10px]">Suivant</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon={HardDrive} title={t('shared.attachments.empty')} description={search ? 'Aucun résultat pour cette recherche.' : 'Aucun fichier uploadé.'} size="compact" />
        )}
      </div>
    </div>
  )
}
