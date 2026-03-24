/**
 * FileManagerPage — Full-page file manager for admins.
 *
 * Features:
 * - Storage stats dashboard (total files, size, by category)
 * - File browser with search, filter by owner_type, pagination
 * - Download links via API
 * - Sidebar showing recently uploaded files
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  HardDrive, FileText, Image, Film, FileArchive, File, Search,
  Download, Loader2, RefreshCw, FolderOpen,
} from 'lucide-react'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
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
}

const OWNER_TYPE_COLORS: Record<string, string> = {
  user: 'bg-blue-50 text-blue-600 border-blue-200',
  tier: 'bg-purple-50 text-purple-600 border-purple-200',
  asset: 'bg-amber-50 text-amber-600 border-amber-200',
  compliance_record: 'bg-green-50 text-green-600 border-green-200',
  compliance_rule: 'bg-indigo-50 text-indigo-600 border-indigo-200',
  project: 'bg-pink-50 text-pink-600 border-pink-200',
}

export default function FileManagerPage() {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [page, setPage] = useState(1)
  const [showStats, setShowStats] = useState(true)

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

  const apiBase = import.meta.env.VITE_API_URL || ''

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <PanelHeader icon={FolderOpen} title="Gestionnaire de fichiers" subtitle="Documents, pièces jointes et médias">
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStats(!showStats)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Statistiques">
            <HardDrive size={14} />
          </button>
          <button onClick={() => refetchStats()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title="Actualiser">
            <RefreshCw size={14} />
          </button>
        </div>
      </PanelHeader>

      <PanelContent>
        <div className="space-y-4 p-4">
          {/* Stats cards */}
          {showStats && !statsLoading && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Fichiers</p>
                <p className="text-2xl font-bold text-foreground">{stats.total_files}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Espace utilisé</p>
                <p className="text-2xl font-bold text-foreground">{formatBytes(stats.total_bytes)}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Backend</p>
                <p className="text-2xl font-bold text-foreground capitalize">{stats.storage_backend}</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-card">
                <p className="text-[10px] text-muted-foreground uppercase font-medium">Limite</p>
                <p className="text-2xl font-bold text-foreground">{stats.storage_config?.max_file_size_mb} Mo</p>
              </div>
            </div>
          )}

          {/* Category filter chips */}
          {stats?.by_owner_type?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => { setFilterType(''); setPage(1) }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  !filterType ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                Tous ({stats.total_files})
              </button>
              {stats.by_owner_type.map((t: any) => (
                <button
                  key={t.owner_type}
                  onClick={() => { setFilterType(filterType === t.owner_type ? '' : t.owner_type); setPage(1) }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filterType === t.owner_type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {OWNER_TYPE_LABELS[t.owner_type] || t.owner_type} ({t.count})
                </button>
              ))}
            </div>
          )}

          {/* Search bar */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder="Rechercher par nom de fichier..."
                className={`${panelInputClass} !pl-8 !h-9`}
              />
            </div>
            {filterType && (
              <span className="text-xs text-muted-foreground">
                Filtre : <span className="font-medium text-foreground">{OWNER_TYPE_LABELS[filterType] || filterType}</span>
                <button onClick={() => setFilterType('')} className="ml-1 text-primary hover:text-primary/80">x</button>
              </span>
            )}
          </div>

          {/* File table */}
          {filesLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
          ) : files?.items?.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_120px_80px_100px_40px] gap-2 px-4 py-2 bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase border-b border-border">
                <span>Nom</span>
                <span>Catégorie</span>
                <span>Taille</span>
                <span>Date</span>
                <span></span>
              </div>

              {/* Rows */}
              {files.items.map((file: any) => {
                const Icon = getFileIcon(file.content_type)
                const colorClass = OWNER_TYPE_COLORS[file.owner_type] || 'bg-gray-50 text-gray-600 border-gray-200'
                return (
                  <div key={file.id} className="grid grid-cols-[1fr_120px_80px_100px_40px] gap-2 px-4 py-2.5 text-xs border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors items-center">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0">
                        <Icon size={16} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{file.original_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{file.content_type}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border self-center ${colorClass}`}>
                      {OWNER_TYPE_LABELS[file.owner_type] || file.owner_type}
                    </span>
                    <span className="text-muted-foreground tabular-nums">{formatBytes(file.size_bytes)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {file.created_at ? new Date(file.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                    </span>
                    <a
                      href={`${apiBase}/api/v1/attachments/${file.id}/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Télécharger"
                    >
                      <Download size={14} />
                    </a>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState icon={FolderOpen} title="Aucun fichier" description={search ? 'Aucun résultat pour cette recherche.' : 'Aucun fichier uploadé.'} />
          )}

          {/* Pagination */}
          {files && files.total > 50 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{files.total} fichiers</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="gl-button-sm gl-button-default text-xs">Précédent</button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {Math.ceil(files.total / 50)}</span>
                <button disabled={page * 50 >= files.total} onClick={() => setPage(p => p + 1)} className="gl-button-sm gl-button-default text-xs">Suivant</button>
              </div>
            </div>
          )}
        </div>
      </PanelContent>
    </div>
  )
}
