import { useState, useEffect } from 'react'
import { X, Download, Pencil, Trash2, Folder, FileText, Image, Film, FileArchive, File, Music } from 'lucide-react'
import api from '@/lib/api'
import type { FSItem } from '../hooks/useFileManager'
import { getPreviewType } from '../hooks/useFileManager'

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    setContent(null)
    setError(false)
    api.get(url, { responseType: 'text', params: {} })
      .then(({ data }) => setContent(typeof data === 'string' ? data : JSON.stringify(data, null, 2)))
      .catch(() => setError(true))
  }, [url])

  if (error) return <p className="text-xs text-muted-foreground p-3">Impossible de charger le fichier.</p>
  if (content === null) return <div className="p-3 text-xs text-muted-foreground animate-pulse">Chargement...</div>

  const lines = content.split('\n')
  return (
    <div className="overflow-auto text-[11px] font-mono leading-relaxed">
      <table className="w-full">
        <tbody>
          {lines.slice(0, 500).map((line, i) => (
            <tr key={i} className="hover:bg-muted/30">
              <td className="text-right text-muted-foreground/40 pr-3 pl-2 select-none w-10 align-top">{i + 1}</td>
              <td className="pr-3 whitespace-pre-wrap break-all">{line || '\u00A0'}</td>
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
  const previewType = getPreviewType(item.name)
  const downloadUrl = onDownload(item.path)
  const Icon = item.isDirectory ? Folder : getIcon(item.name)
  const ext = item.name.split('.').pop()?.toUpperCase() || ''

  return (
    <div className="w-80 shrink-0 border-l border-border flex flex-col bg-background overflow-hidden max-lg:fixed max-lg:inset-0 max-lg:w-full max-lg:z-[200]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Icon size={16} className="text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
          <span className="gl-badge gl-badge-neutral text-[8px]">{ext}</span>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0">
          <X size={14} />
        </button>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-muted/10">
        {previewType === 'image' && (
          <div className="p-3 flex items-center justify-center min-h-[200px]">
            <img src={downloadUrl} alt={item.name} className="max-w-full max-h-[60vh] object-contain rounded shadow-sm" />
          </div>
        )}
        {previewType === 'pdf' && (
          <iframe src={downloadUrl} className="w-full h-full min-h-[400px]" title={item.name} />
        )}
        {previewType === 'video' && (
          <div className="p-3">
            <video src={downloadUrl} controls className="w-full rounded" />
          </div>
        )}
        {previewType === 'audio' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <Music size={48} className="text-muted-foreground/30" />
            <audio src={downloadUrl} controls className="w-full" />
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

      {/* Metadata */}
      <div className="px-3 py-2 border-t border-border/50 space-y-1 text-[10px] text-muted-foreground shrink-0">
        <div className="flex justify-between"><span>Taille</span><span className="font-mono">{formatBytes(item.size || 0)}</span></div>
        <div className="flex justify-between"><span>Modifié</span><span>{formatDate(item.updatedAt)}</span></div>
        <div className="flex justify-between"><span>Chemin</span><span className="font-mono truncate max-w-[180px]" title={item.path}>{item.path}</span></div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border shrink-0">
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
    </div>
  )
}
