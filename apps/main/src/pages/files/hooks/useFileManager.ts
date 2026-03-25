/**
 * useFileManager — Core state + API calls for the file manager.
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

export interface FSItem {
  name: string
  isDirectory: boolean
  path: string
  updatedAt?: string
  size?: number
}

export type ViewMode = 'list' | 'grid'
export type SortField = 'name' | 'size' | 'date'
export type SortDir = 'asc' | 'desc'
export type FileFilter = '' | 'image' | 'document' | 'video' | 'audio' | 'archive'

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
const DOCUMENT_EXT = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'json', 'xml', 'yml', 'yaml', 'log', 'env', 'sh', 'py', 'js', 'ts', 'tsx', 'html', 'css']
const VIDEO_EXT = ['mp4', 'mov', 'avi', 'mkv', 'webm']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'flac', 'aac']
const ARCHIVE_EXT = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2']

function getFileCategory(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (DOCUMENT_EXT.includes(ext)) return 'document'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  if (ARCHIVE_EXT.includes(ext)) return 'archive'
  return 'other'
}

export function isPreviewable(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return [...IMAGE_EXT, 'pdf', ...VIDEO_EXT, ...AUDIO_EXT, 'txt', 'md', 'json', 'csv', 'xml', 'yml', 'yaml', 'log', 'env', 'sh', 'py', 'js', 'ts', 'tsx', 'html', 'css'].includes(ext)
}

export function getPreviewType(name: string): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'none' {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (VIDEO_EXT.includes(ext)) return 'video'
  if (AUDIO_EXT.includes(ext)) return 'audio'
  if (['txt', 'md', 'json', 'csv', 'xml', 'yml', 'yaml', 'log', 'env', 'sh', 'py', 'js', 'ts', 'tsx', 'html', 'css'].includes(ext)) return 'text'
  return 'none'
}

const VM_KEY = 'opsflux:fm-view-mode'

export function useFileManager() {
  const { toast } = useToast()
  const confirm = useConfirm()

  // Navigation
  const [currentPath, setCurrentPath] = useState('/')
  const [items, setItems] = useState<FSItem[]>([])
  const [allDirs, setAllDirs] = useState<FSItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']))

  // View
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem(VM_KEY) as ViewMode) || 'list')
  const [sortBy, setSortBy] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterType, setFilterType] = useState<FileFilter>('')
  const [search, setSearch] = useState('')

  // Preview + Dialogs
  const [previewItem, setPreviewItem] = useState<FSItem | null>(null)
  const [nameDialog, setNameDialog] = useState<{ mode: 'create' | 'rename'; item?: FSItem } | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FSItem } | null>(null)

  // Drag & drop
  const [isDragging, setIsDragging] = useState(false)

  // Mobile sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const apiBase = import.meta.env.VITE_API_URL || ''

  // ── Persist view mode ──
  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem(VM_KEY, mode)
  }, [])

  // ── Data loading ──
  const loadDir = useCallback(async (path: string) => {
    setLoading(true)
    setPreviewItem(null)
    try {
      const { data } = await api.get('/api/v1/admin/fs/list', { params: { path } })
      setItems(data)
      setCurrentPath(path)
      setSidebarOpen(false)
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

  const refresh = useCallback(() => { loadDir(currentPath); loadTree() }, [currentPath, loadDir, loadTree])

  const navigateUp = useCallback(() => {
    if (currentPath === '/') return
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/'
    loadDir(parent)
  }, [currentPath, loadDir])

  // ── Computed ──
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean)
    return [{ name: 'Racine', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))]
  }, [currentPath])

  const filteredItems = useMemo(() => {
    let result = [...items]

    // Sort: directories first, then by field
    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortBy) {
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'size': return ((a.size || 0) - (b.size || 0)) * dir
        case 'date': return ((new Date(a.updatedAt || 0)).getTime() - (new Date(b.updatedAt || 0)).getTime()) * dir
        default: return 0
      }
    })

    // Filter by type
    if (filterType) {
      result = result.filter(i => i.isDirectory || getFileCategory(i.name) === filterType)
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(i => i.name.toLowerCase().includes(q))
    }

    return result
  }, [items, sortBy, sortDir, filterType, search])

  const rootDirs = useMemo(() => allDirs.filter(d => d.path.split('/').filter(Boolean).length === 1), [allDirs])

  const getChildren = useCallback((parentPath: string) => {
    const depth = parentPath === '/' ? 1 : parentPath.split('/').filter(Boolean).length + 1
    return allDirs.filter(d => d.path.startsWith(parentPath === '/' ? '/' : parentPath + '/') && d.path.split('/').filter(Boolean).length === depth)
  }, [allDirs])

  // Stats
  const stats = useMemo(() => ({
    total: filteredItems.length,
    files: filteredItems.filter(i => !i.isDirectory).length,
    dirs: filteredItems.filter(i => i.isDirectory).length,
    totalSize: filteredItems.reduce((s, i) => s + (i.size || 0), 0),
  }), [filteredItems])

  // ── Sort toggle ──
  const toggleSort = useCallback((field: SortField) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }, [sortBy])

  // ── Tree toggle ──
  const toggleExpand = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const n = new Set(prev)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })
  }, [])

  // ── Actions ──
  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files) return
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
      refresh()
    }
  }, [currentPath, refresh, toast])

  const handleDelete = useCallback(async (item: FSItem) => {
    const ok = await confirm({
      title: 'Supprimer',
      message: `Supprimer "${item.name}" ?${item.isDirectory ? ' Le dossier et son contenu seront supprimés.' : ''}`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    try {
      await api.delete('/api/v1/admin/fs/delete', { params: { path: item.path } })
      toast({ title: `"${item.name}" supprimé`, variant: 'success' })
      if (previewItem?.path === item.path) setPreviewItem(null)
      refresh()
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de supprimer.', variant: 'error' })
    }
  }, [confirm, refresh, toast, previewItem])

  const handleBatchDelete = useCallback(async (paths: Set<string>) => {
    const count = paths.size
    if (count === 0) return
    const ok = await confirm({
      title: 'Supprimer',
      message: `Supprimer ${count} élément(s) ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    })
    if (!ok) return
    let deleted = 0
    for (const path of paths) {
      try {
        await api.delete('/api/v1/admin/fs/delete', { params: { path } })
        deleted++
      } catch { /* continue */ }
    }
    toast({ title: `${deleted}/${count} supprimé(s)`, variant: deleted === count ? 'success' : 'error' })
    setPreviewItem(null)
    refresh()
  }, [confirm, refresh, toast])

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      await api.post('/api/v1/admin/fs/mkdir', null, { params: { path: newPath } })
      toast({ title: `Dossier "${name}" créé`, variant: 'success' })
      refresh()
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de créer le dossier.', variant: 'error' })
    }
    setNameDialog(null)
  }, [currentPath, refresh, toast])

  const handleRename = useCallback(async (item: FSItem, newName: string) => {
    try {
      await api.post('/api/v1/admin/fs/rename', null, { params: { path: item.path, new_name: newName } })
      toast({ title: `Renommé en "${newName}"`, variant: 'success' })
      refresh()
    } catch (err: any) {
      toast({ title: 'Erreur', description: err?.response?.data?.detail || 'Impossible de renommer.', variant: 'error' })
    }
    setNameDialog(null)
  }, [refresh, toast])

  const copyPath = useCallback((item: FSItem) => {
    navigator.clipboard.writeText(item.path).then(() => {
      toast({ title: 'Chemin copié', variant: 'success' })
    })
    setContextMenu(null)
  }, [toast])

  const getDownloadUrl = useCallback((path: string) => {
    return `${apiBase}/api/v1/admin/fs/download?path=${encodeURIComponent(path)}`
  }, [apiBase])

  // ── Open item ──
  const openItem = useCallback((item: FSItem) => {
    if (item.isDirectory) {
      loadDir(item.path)
    } else {
      setPreviewItem(item)
    }
  }, [loadDir])

  return {
    // State
    currentPath, items: filteredItems, allDirs, loading,
    expandedDirs, viewMode, sortBy, sortDir, filterType, search,
    previewItem, nameDialog, contextMenu, isDragging, sidebarOpen,
    breadcrumbs, rootDirs, stats,

    // Setters
    setSearch, setFilterType, setPreviewItem, setNameDialog,
    setContextMenu, setIsDragging, setSidebarOpen,

    // Actions
    loadDir, refresh, navigateUp, changeViewMode, toggleSort, toggleExpand,
    handleUpload, handleDelete, handleBatchDelete, handleCreateFolder, handleRename,
    copyPath, getDownloadUrl, openItem, getChildren,
  }
}
