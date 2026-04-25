import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Download, Pencil, Trash2, Folder, FileText, Image, Film, FileArchive, File, Music, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { DynamicPanelShell } from '@/components/layout/DynamicPanel'
import type { FSItem } from '../hooks/useFileManager'
import { getPreviewType } from '../hooks/useFileManager'

/** Fetches media via authenticated API and renders as blob URL. */
function AuthMedia({ src, alt, type }: { src: string; alt: string; type: 'image' | 'video' | 'audio' }) {
  const { t } = useTranslation()
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let revoke: string | null = null
    setError(false)
    setBlobUrl(null)
    api.get(src, { responseType: 'blob' })
      .then(({ data }) => {
        const url = URL.createObjectURL(data)
        revoke = url
        setBlobUrl(url)
      })
      .catch(() => setError(true))
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [src])

  if (error) return <p className="text-xs text-muted-foreground p-3">{t('files.impossible_de_charger_le_fichier')}</p>
  if (!blobUrl) return <div className="flex items-center justify-center py-12"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>

  if (type === 'image') return <img src={blobUrl} alt={alt} className="max-w-full max-h-[60vh] object-contain rounded shadow-sm" />
  if (type === 'video') return <video src={blobUrl} controls className="w-full rounded" />
  if (type === 'audio') return <audio src={blobUrl} controls className="w-full" />
  return null
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return Image
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return Film
  if (['mp3', 'wav', 'ogg'].includes(ext)) return Music
  if (['zip', 'tar', 'gz', 'rar', '7z'].includes(ext)) return FileArchive
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'].includes(ext)) return FileText
  return File
}

interface FilePreviewPanelProps {
  item: FSItem
  apiBase: string
  onClose: () => void
  onDownload: (path: string) => string
  onRename: (item: FSItem) => void
  onDelete: (item: FSItem) => void
}

function TextPreview({ url }: { url: string }) {
  const { t } = useTranslation()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setContent(null)
    setError(false)
    api.get(url, { responseType: 'text', params: {} })
      .then(({ data }) => setContent(typeof data === 'string' ? data : JSON.stringify(data, null, 2)))
      .catch(() => setError(true))
  }, [url])

  if (error) return <p className="text-xs text-muted-foreground p-3">{t('files.impossible_de_charger_le_fichier')}</p>
  if (content === null) return <div className="p-3 text-xs text-muted-foreground animate-pulse">Chargement...</div>

  const lines = content.split('\n')
  return (
    <div className="overflow-auto text-[11px] font-mono leading-relaxed">
      <table className="w-full">
        <tbody>
          {lines.slice(0, 500).map((line, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="text-right text-muted-foreground/40 pr-3 pl-2 select-none w-10 align-top">{i + 1}</td>
              <td className="pr-3 whitespace-pre-wrap break-all">{line || ' '}</td>
            </tr>
          ))}
          {lines.length > 500 && (
            <tr><td colSpan={2} className="text-center text-muted-foreground py-2">... {lines.length - 500} lignes supplémentaires</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function FilePreviewPanel({ item, onClose, onDownload, onRename, onDelete }: FilePreviewPanelProps) {
  const { t } = useTranslation()
  const previewType = getPreviewType(item.name)
  const downloadUrl = onDownload(item.path)
  const Icon = item.isDirectory ? Folder : getIcon(item.name)
  const ext = item.name.split('.').pop()?.toUpperCase() || ''

  return (
    <DynamicPanelShell
      inline
      onClose={onClose}
      title={item.name}
      subtitle={ext}
      icon={<Icon size={14} className="text-muted-foreground" />}
      inlineWidth={320}
      className="max-lg:fixed max-lg:inset-0 max-lg:w-full max-lg:z-[200]"
    >
      <div className="flex flex-col h-full">
        {/* Actions — top position per design system */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border shrink-0">
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="gl-button-sm gl-button-confirm flex-1 justify-center" onClick={(e) => e.stopPropagation()}>
            <Download size={11} /> Télécharger
          </a>
          <button onClick={() => onRename(item)} className="gl-button-sm gl-button-default">
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete(item)} className="gl-button-sm gl-button-danger">
            <Trash2 size={11} />
          </button>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto bg-muted/10">
          {previewType === 'image' && (
            <div className="p-3 flex items-center justify-center min-h-[200px]">
              <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="image" />
            </div>
          )}
          {previewType === 'pdf' && (
            <iframe src={downloadUrl} className="w-full h-full min-h-[400px]" title={item.name} />
          )}
          {previewType === 'video' && (
            <div className="p-3">
              <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="video" />
            </div>
          )}
          {previewType === 'audio' && (
            <div className="p-6 flex flex-col items-center gap-4">
              <Music size={48} className="text-muted-foreground/30" />
              <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="audio" />
            </div>
          )}
          {previewType === 'text' && (
            <TextPreview url={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} />
          )}
          {previewType === 'none' && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Icon size={48} className="mb-3 opacity-30" />
              <p className="text-xs">Aperçu non disponible</p>
              <p className="text-[10px] mt-1">Téléchargez le fichier pour le consulter</p>
            </div>
          )}
        </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-muted/10">
        {previewType === 'image' && (
          <div className="p-3 flex items-center justify-center min-h-[200px]">
            <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="image" />
          </div>
        )}
        {previewType === 'pdf' && (
          <iframe src={downloadUrl} className="w-full h-full min-h-[400px]" title={item.name} />
        )}
        {previewType === 'video' && (
          <div className="p-3">
            <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="video" />
          </div>
        )}
        {previewType === 'audio' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Music size={48} className="text-muted-foreground/30" />
            <AuthMedia src={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} alt={item.name} type="audio" />
          </div>
        )}
        {previewType === 'text' && (
          <TextPreview url={`/api/v1/admin/fs/download?path=${encodeURIComponent(item.path)}`} />
        )}
        {previewType === 'none' && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Icon size={48} className="mb-3 opacity-30" />
            <p className="text-xs">{t('files.apercu_non_disponible')}</p>
            <p className="text-[10px] mt-1">{t('files.telechargez_le_fichier_pour_le_consulter')}</p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="px-3 py-2 border-t border-border/50 space-y-1 text-[10px] text-muted-foreground shrink-0">
        <div className="flex justify-between"><span>Taille</span><span className="font-mono">{formatBytes(item.size || 0)}</span></div>
        <div className="flex justify-between"><span>{t('projets.toast.modified')}</span><span>{formatDate(item.updatedAt)}</span></div>
        <div className="flex justify-between"><span>Chemin</span><span className="font-mono truncate max-w-[180px]" title={item.path}>{item.path}</span></div>
      </div>
    </div>
  )
}
