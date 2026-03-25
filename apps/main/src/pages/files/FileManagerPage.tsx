/**
 * FileManagerPage — OpsFlux file manager.
 *
 * Sidebar tree + file table + breadcrumbs + fixed status bar.
 * Permission-gated: requires admin.fs permission.
 * Modal dialogs for folder creation and rename (no window.prompt).
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  FolderOpen, Folder, FileText, Image, Film, FileArchive, File, Music,
  ChevronRight, Download, Trash2, Upload, FolderPlus, Loader2, RefreshCw,
  Search, ArrowLeft, HardDrive, Pencil,
} from 'lucide-react'
import api from '@/lib/api'
import { PanelHeader } from '@/components/layout/PanelHeader'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { usePermission } from '@/hooks/usePermission'

// ── Types ────────────────────────────────────────────────────

interface FSItem {
  name: string
  isDirectory: boolean
  path: string
  updatedAt?: string
  size?: number
}

// ── Helpers ──────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function getIcon(item: FSItem) {
  if (item.isDirectory) return Folder
  const ext = item.name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FileArchive
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'].includes(ext)) return FileText
  return File
}

// ── Inline Name Dialog ───────────────────────────────────────

function NameDialog({ title, defaultValue, onConfirm, onCancel }: {
  title: string
  defaultValue?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(defaultValue || '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="bg-background border border-border rounded-lg shadow-xl p-4 w-80 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <input
          ref={inputRef}
          className="gl-form-input w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
          placeholder="Nom..."
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="gl-button-sm gl-button-default">Annuler</button>
          <button onClick={handleSubmit} disabled={!value.trim()} className="gl-button-sm gl-button-confirm">Confirmer</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export default function FileManagerPage() {
  const { toast } = useToast()
  const confirm = useConfirm()
  const { hasPermission } = usePermission()
  const canManage = hasPermission('admin.fs') || hasPermission('core.settings.manage')

  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState<FSItem[]>([])
  const [allDirs, setAllDirs] = useState<FSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']))
  const [nameDialog, setNameDialog] = useState<{ mode: 'create' | 'rename'; item?: FSItem } | null>(null)
  const [, setSelectedItems] = useState<Set<string>>(new Set())

  const apiBase = import.meta.env.VITE_API_URL || ''

  // ── Data loading ──
  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setSelectedItems(new Set())
    try {
      const { data } = await api.get('/api/v1/admin/fs/list', { params: { path } })
      setItems(data)
      setCurrentPath(path)
    } catch (err: any) {
      toast({ title: 'Erreur de chargement', description: err?.response?.data?.detail || 'Impossible de lire le dossier.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  const loadTree = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/admin/fs/list-all')
      setAllDirs(data.filter((f: FSItem) => f.isDirectory))
    } catch (err: any) {
      console.warn('FileManager: loadTree failed', err?.message)
    }
  }, [])

  useEffect(() => { loadDir('/'); loadTree() }, [loadDir, loadTree])

  // ── Computed ──
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean)
    return [{ name: 'Racine', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))]
  }, [currentPath])

  const filteredItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    if (!search) return sorted
    const q = search.toLowerCase()
    return sorted.filter(i => i.name.toLowerCase().includes(q))
  }, [items, search])

  const rootDirs = useMemo(() => allDirs.filter(d => d.path.split('/').filter(Boolean).length === 1), [allDirs])

  const getChildren = useCallback((parentPath: string) => {
    const depth = parentPath === '/' ? 1 : parentPath.split('/').filter(Boolean).length + 1
    return allDirs.filter(d => d.path.startsWith(parentPath === '/' ? '/' : parentPath + '/') && d.path.split('/').filter(Boolean).length === depth)
  }, [allDirs])

  // Stats
  const fileCount = filteredItems.filter(i => !i.isDirectory).length
  const dirCount = filteredItems.filter(i => i.isDirectory).length
  const totalSize = filteredItems.reduce((s, i) => s + (i.size || 0), 0)

  // ── Actions ──
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || !canManage) return
    let successCount = 0
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      try {
        await api.post(`/api/v1/admin/fs/upload?path=${encodeURIComponent(currentPath)}`, formData)
        successCount++
      } catch (err: any) {
        toast({ title: `Erreur: ${file.name}`, description: err?.response?.data?.detail || 'Upload échoué', variant: 'error' })
      }
    }
    if (successCount > 0) {
      toast({ title: `${successCount} fichier(s) uploadé(s)`, variant: 'success' })
      loadDir(currentPath)
      loadTree()
    }
  }, [currentPath, loadDir, loadTree, toast, canManage])

  const handleDelete = useCallback(async (item: FSItem) => {
    if (!canManage) return
    const ok = await confirm({ title: 'Supprimer', message: `Supprimer "${item.name}" ?${item.isDirectory ? ' Le dossier et son contenu seront supprimés.' : ''}`, confirmLabel: 'Supprimer', variant: 'danger' })
    if (!ok) return
    try {
      await api.delete('/api/v1/admin/fs/delete', { params: { path: item.path } })
      toast({ title: `"${item.name}" supprimé`, variant: 'success' })
      loadDir(currentPath)
      loadTree()
    } catch (err: any) {
      toast({ title: 'Erreur de suppression', description: err?.response?.data?.detail || 'Impossible de supprimer.', variant: 'error' })
    }
  }, [confirm, currentPath, loadDir, loadTree, toast, canManage])

  const handleCreateFolder = useCallback(async (name: string) => {
    if (!canManage) return
    try {
      const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      await api.post('/api/v1/admin/fs/mkdir', null, { params: { path: newPath } })
      toast({ title: `Dossier "${name}" créé`, variant: 'success' })
      loadDir(currentPath)
      loadTree()
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de créer le dossier.', variant: 'error' })
    }
    setNameDialog(null)
  }, [currentPath, loadDir, loadTree, toast, canManage])

  const handleRename = useCallback(async (item: FSItem, newName: string) => {
    if (!canManage) return
    try {
      const parentDir = item.path.substring(0, item.path.lastIndexOf('/')) || '/'
      const newPath = parentDir === '/' ? `/${newName}` : `${parentDir}/${newName}`
      await api.post('/api/v1/admin/fs/rename', null, { params: { from: item.path, to: newPath } })
      toast({ title: `Renommé en "${newName}"`, variant: 'success' })
      loadDir(currentPath)
      loadTree()
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de renommer.', variant: 'error' })
    }
    setNameDialog(null)
  }, [currentPath, loadDir, loadTree, toast, canManage])

  // ── Permission gate ──
  if (!canManage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FolderOpen size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Accès non autorisé</p>
          <p className="text-xs mt-1">Vous n'avez pas la permission d'accéder au gestionnaire de fichiers.</p>
        </div>
      </div>
    )
  }

  // ── Sidebar tree item ──
  const TreeItem = ({ dir, depth = 0 }: { dir: FSItem; depth?: number }) => {
    const isExpanded = expandedDirs.has(dir.path)
    const isActive = currentPath === dir.path
    const children = getChildren(dir.path)
    const hasChildren = children.length > 0

    return (
      <div>
        <button
          onClick={() => {
            loadDir(dir.path)
            setExpandedDirs(prev => { const n = new Set(prev); if (n.has(dir.path)) n.delete(dir.path); else n.add(dir.path); return n })
          }}
          className={cn(
            'w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors text-left',
            isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren && <ChevronRight size={10} className={cn('shrink-0 transition-transform', isExpanded && 'rotate-90')} />}
          {!hasChildren && <span className="w-2.5" />}
          <Folder size={12} className="shrink-0" />
          <span className="truncate">{dir.name}</span>
        </button>
        {isExpanded && children.map(c => <TreeItem key={c.path} dir={c} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <PanelHeader icon={FolderOpen} title="Gestionnaire de fichiers" subtitle="Documents, pièces jointes et médias">
        <div className="flex items-center gap-1.5">
          <button onClick={() => loadDir(currentPath)} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Actualiser">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setNameDialog({ mode: 'create' })} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Nouveau dossier">
            <FolderPlus size={14} />
          </button>
          <label className="p-1.5 rounded hover:bg-accent text-muted-foreground cursor-pointer" title="Uploader">
            <Upload size={14} />
            <input type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
          </label>
        </div>
      </PanelHeader>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Sidebar tree */}
        <div className="w-48 shrink-0 border-r border-border overflow-y-auto py-2 bg-muted/20">
          <button
            onClick={() => loadDir('/')}
            className={cn(
              'w-full flex items-center gap-1.5 py-1 px-2 text-xs rounded transition-colors text-left',
              currentPath === '/' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <HardDrive size={12} />
            <span>Racine</span>
          </button>
          {rootDirs.map(d => <TreeItem key={d.path} dir={d} depth={1} />)}
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Breadcrumbs + search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            {currentPath !== '/' && (
              <button onClick={() => { const parent = currentPath.split('/').slice(0, -1).join('/') || '/'; loadDir(parent) }} className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
                <ArrowLeft size={14} />
              </button>
            )}
            <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
              {breadcrumbs.map((b, i) => (
                <span key={b.path} className="flex items-center gap-0.5 shrink-0">
                  {i > 0 && <ChevronRight size={10} className="text-muted-foreground" />}
                  <button onClick={() => loadDir(b.path)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">{b.name}</button>
                </span>
              ))}
            </div>
            <div className="relative shrink-0">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrer..." className={`${panelInputClass} !pl-7 !h-7 !text-xs w-36`} autoComplete="off" />
            </div>
          </div>

          {/* File table */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderOpen size={32} className="mb-2 opacity-30" />
                <p className="text-sm">{search ? 'Aucun résultat' : 'Dossier vide'}</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-[10px] font-semibold text-muted-foreground uppercase">
                    <th className="text-left px-3 py-1.5">Nom</th>
                    <th className="text-left px-3 py-1.5 w-28">Taille</th>
                    <th className="text-left px-3 py-1.5 w-40">Modifié</th>
                    <th className="w-24 px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const Icon = getIcon(item)
                    return (
                      <tr
                        key={item.path}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors group cursor-pointer"
                        onDoubleClick={() => item.isDirectory && loadDir(item.path)}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <div className={cn(
                              'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                              item.isDirectory ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-muted/50'
                            )}>
                              <Icon size={16} className={item.isDirectory ? 'text-amber-600' : 'text-muted-foreground'} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                              {!item.isDirectory && <p className="text-[10px] text-muted-foreground">{item.name.split('.').pop()?.toUpperCase()}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{item.isDirectory ? '—' : formatBytes(item.size || 0)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{formatDate(item.updatedAt)}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); setNameDialog({ mode: 'rename', item }) }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground"
                              title="Renommer"
                            >
                              <Pencil size={12} />
                            </button>
                            {!item.isDirectory && (
                              <a
                                href={`${apiBase}/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1 rounded hover:bg-muted text-muted-foreground"
                                title="Télécharger"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download size={12} />
                              </a>
                            )}
                            <button onClick={(e) => { e.stopPropagation(); handleDelete(item) }} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500" title="Supprimer">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Fixed status bar */}
          <div className="flex items-center gap-4 px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground shrink-0 bg-muted/20">
            <span>{filteredItems.length} élément{filteredItems.length !== 1 ? 's' : ''}</span>
            <span className="text-border">|</span>
            <span>{fileCount} fichier{fileCount !== 1 ? 's' : ''}</span>
            <span className="text-border">|</span>
            <span>{dirCount} dossier{dirCount !== 1 ? 's' : ''}</span>
            <span className="ml-auto font-mono tabular-nums">{formatBytes(totalSize)}</span>
            <span className="text-border">|</span>
            <span className="font-mono truncate max-w-[200px]" title={currentPath}>{currentPath}</span>
          </div>
        </div>
      </div>

      {/* Name dialog (create folder / rename) */}
      {nameDialog && (
        <NameDialog
          title={nameDialog.mode === 'create' ? 'Nouveau dossier' : `Renommer "${nameDialog.item?.name}"`}
          defaultValue={nameDialog.mode === 'rename' ? nameDialog.item?.name : ''}
          onCancel={() => setNameDialog(null)}
          onConfirm={(name) => {
            if (nameDialog.mode === 'create') handleCreateFolder(name)
            else if (nameDialog.item) handleRename(nameDialog.item, name)
          }}
        />
      )}
    </div>
  )
}
