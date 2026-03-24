/**
 * FileManagerPage — Full-page file manager using @jfvilas/react-file-manager.
 *
 * Connected to backend filesystem API (/api/v1/admin/fs/*).
 * Shows all files in the static/ directory (avatars, attachments, exports, etc.).
 * Admin only (core.settings.manage permission).
 */
import { useState, useCallback, useEffect } from 'react'
import { FileManager } from '@jfvilas/react-file-manager'
import '@jfvilas/react-file-manager/dist/style.css'
import { FolderOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { useToast } from '@/components/ui/Toast'

interface FSItem {
  name: string
  isDirectory: boolean
  path: string
  updatedAt?: string
  size?: number
}

// Map i18n language code to jfvilas locale format
const LANG_MAP: Record<string, string> = {
  fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', de: 'de-DE', it: 'it-IT', ar: 'ar-SA', zh: 'zh-CN',
}

export default function FileManagerPage() {
  const { toast } = useToast()
  const { i18n } = useTranslation()
  const [files, setFiles] = useState<FSItem[]>([])
  const [currentPath, setCurrentPath] = useState('/')
  const fmLang = LANG_MAP[i18n.language] || 'en-US'

  const apiBase = import.meta.env.VITE_API_URL || ''
  const token = localStorage.getItem('access_token') || ''

  const loadFiles = useCallback(async (path: string) => {
    try {
      const { data } = await api.get('/api/v1/admin/fs/list', { params: { path } })
      setFiles(data)
      setCurrentPath(path)
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les fichiers.', variant: 'error' })
    }
  }, [toast])

  useEffect(() => {
    loadFiles('/')
  }, [loadFiles])

  const handleFolderChange = useCallback((folder: any) => {
    const path = folder?.path || '/'
    loadFiles(path)
  }, [loadFiles])

  const handleFileUploaded = useCallback(() => {
    loadFiles(currentPath)
    toast({ title: 'Fichier uploadé', variant: 'success' })
  }, [currentPath, loadFiles, toast])

  const handleDelete = useCallback(async (items: any[]) => {
    for (const item of items) {
      try {
        await api.delete('/api/v1/admin/fs/delete', { params: { path: item.path } })
      } catch {
        toast({ title: 'Erreur', description: `Impossible de supprimer ${item.name}`, variant: 'error' })
      }
    }
    loadFiles(currentPath)
    toast({ title: `${items.length} élément(s) supprimé(s)`, variant: 'success' })
  }, [currentPath, loadFiles, toast])

  const handleCreateFolder = useCallback(async (name: string) => {
    try {
      const newPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`
      await api.post('/api/v1/admin/fs/mkdir', null, { params: { path: newPath } })
      loadFiles(currentPath)
      toast({ title: 'Dossier créé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [currentPath, loadFiles, toast])

  const handleRename = useCallback(async (item: any, newName: string) => {
    try {
      await api.post('/api/v1/admin/fs/rename', null, { params: { path: item.path, new_name: newName } })
      loadFiles(currentPath)
      toast({ title: 'Renommé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [currentPath, loadFiles, toast])

  const handleRefresh = useCallback(() => {
    loadFiles(currentPath)
  }, [currentPath, loadFiles])

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <PanelHeader icon={FolderOpen} title="Gestionnaire de fichiers" subtitle="Documents, pièces jointes et médias" />

      <PanelContent>
        <div className="fm-wrapper" style={{ height: 'calc(100vh - 100px)' }}>
          <FileManager
            files={files}
            fileUploadConfig={{
              url: `${apiBase}/api/v1/admin/fs/upload?path=${encodeURIComponent(currentPath)}`,
              headers: { Authorization: `Bearer ${token}` },
            }}
            fileDownloadConfig={{
              url: `${apiBase}/api/v1/admin/fs/download`,
              headers: { Authorization: `Bearer ${token}` },
            }}
            onFileUploaded={handleFileUploaded}
            onDelete={handleDelete}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
            onRefresh={handleRefresh}
            onFolderChange={handleFolderChange}
            language={fmLang}
            height="100%"
            width="100%"
            layout="list"
            primaryColor="hsl(221, 83%, 53%)"
          />
        </div>
      </PanelContent>
    </div>
  )
}
