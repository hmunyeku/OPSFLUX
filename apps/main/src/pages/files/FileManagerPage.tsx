/**
 * FileManagerPage — Full-page file manager using SVAR React FileManager.
 *
 * Connected to backend filesystem API (/api/v1/admin/fs/*).
 * Shows all files in the static/ directory (avatars, attachments, exports, etc.).
 * Admin only (core.settings.manage permission).
 */
import { useState, useCallback, useEffect } from 'react'
import { Filemanager } from '@svar-ui/react-filemanager'
import '@svar-ui/react-filemanager/all.css'
import { FolderOpen } from 'lucide-react'
import api from '@/lib/api'
import { PanelHeader, PanelContent } from '@/components/layout/PanelHeader'
import { useToast } from '@/components/ui/Toast'

interface SVARFile {
  id: string
  size: number
  date: Date
  type: 'file' | 'folder'
}

export default function FileManagerPage() {
  const { toast } = useToast()
  const [files, setFiles] = useState<SVARFile[]>([])

  const loadAllFiles = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/admin/fs/list-all')
      // Transform backend format to SVAR format
      const svarFiles: SVARFile[] = data.map((f: any) => ({
        id: f.path,
        size: f.size || 0,
        date: f.updatedAt ? new Date(f.updatedAt) : new Date(),
        type: f.isDirectory ? 'folder' : 'file',
      }))
      setFiles(svarFiles)
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les fichiers.', variant: 'error' })
    }
  }, [toast])

  useEffect(() => {
    loadAllFiles()
  }, [loadAllFiles])

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <PanelHeader icon={FolderOpen} title="Gestionnaire de fichiers" subtitle="Documents, pièces jointes et médias" />

      <PanelContent>
        <div style={{ height: 'calc(100vh - 100px)' }}>
          <Filemanager data={files} />
        </div>
      </PanelContent>
    </div>
  )
}
