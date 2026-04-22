/**
 * AttachmentManager — Reusable polymorphic file attachment component.
 *
 * Embeddable anywhere: tiers detail, asset detail, notes, support tickets, etc.
 * Fetches and displays file attachments for a given owner (owner_type + owner_id).
 * Supports upload, download, delete.
 * Inline previews for images, videos, audio, and PDF.
 *
 * Usage:
 *   <AttachmentManager ownerType="tier" ownerId={tier.id} />
 *   <AttachmentManager ownerType="support_ticket" ownerId={ticket.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Paperclip, Plus, Trash2, Download, Loader2,
  FileText, Image, FileArchive, Film, Music, File, Eye, EyeOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useSettings'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useToast } from '@/components/ui/Toast'
import api from '@/lib/api'
import type { FileAttachment } from '@/types/api'
import { formatDate } from '@/lib/i18n'

/** Download a file via authenticated API call → blob → save as link click */
async function downloadFile(attachmentId: string, filename: string) {
  try {
    const response = await api.get(`/api/v1/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    })
    const blob = new Blob([response.data])
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch {
    // Fallback: open in new tab (may fail if not authenticated)
    window.open(`/api/v1/attachments/${attachmentId}/download`, '_blank')
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']
const PDF_TYPES = ['application/pdf']

function getFileIcon(contentType: string) {
  if (contentType.startsWith('image/')) return Image
  if (contentType.startsWith('video/')) return Film
  if (contentType.startsWith('audio/')) return Music
  if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('text'))
    return FileText
  if (contentType.includes('zip') || contentType.includes('archive') || contentType.includes('compressed'))
    return FileArchive
  return File
}

/** Strip params like ";codecs=vp9" from content-type for matching */
function baseContentType(ct: string): string {
  return ct.split(';')[0].trim()
}

function canPreview(contentType: string): boolean {
  const base = baseContentType(contentType)
  return IMAGE_TYPES.includes(base) || VIDEO_TYPES.includes(base) ||
    AUDIO_TYPES.includes(base) || PDF_TYPES.includes(base)
}

/** Authenticated media component — fetches via API and renders as blob URL */
function AuthMediaPreview({ src, contentType, name }: { src: string; contentType: string; name: string }) {
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

  if (error) return <p className="text-xs text-muted-foreground p-2">Impossible de charger l'aperçu.</p>
  if (!blobUrl) return <div className="flex items-center justify-center py-6"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>

  const base = baseContentType(contentType)
  if (IMAGE_TYPES.includes(base)) {
    return <img src={blobUrl} alt={name} className="max-w-full max-h-[300px] object-contain rounded" />
  }
  if (VIDEO_TYPES.includes(base)) {
    return <video src={blobUrl} controls className="w-full max-h-[300px] rounded" />
  }
  if (AUDIO_TYPES.includes(base)) {
    return <audio src={blobUrl} controls className="w-full" />
  }
  if (PDF_TYPES.includes(base)) {
    return <iframe src={blobUrl} className="w-full h-[400px] rounded border-0" title={name} />
  }
  return null
}

interface AttachmentManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
  initialShowForm?: boolean
  readOnly?: boolean
  /** When set, uploads are tagged with a category drawn from this dictionary
   *  (e.g. 'moc_attachment_type'). Displays a dropdown above the dropzone
   *  and a filter tab-bar, plus a badge on each attached file.
   */
  categoryDictionary?: string
}

export function AttachmentManager({
  ownerType,
  ownerId,
  compact,
  initialShowForm,
  readOnly,
  categoryDictionary,
}: AttachmentManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const categoryOptions = useDictionaryOptions(categoryDictionary ?? '')
  const [uploadCategory, setUploadCategory] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const { data, isLoading } = useAttachments(
    ownerType,
    ownerId,
    categoryFilter || undefined,
  )
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [expandedPreviews, setExpandedPreviews] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (initialShowForm) {
      setTimeout(() => fileInputRef.current?.click(), 100)
    }
  }, [initialShowForm])

  const attachments: FileAttachment[] = data ?? []

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files || !ownerId) return
    for (const file of Array.from(files)) {
      try {
        await uploadAttachment.mutateAsync({
          ownerType,
          ownerId,
          file,
          category: uploadCategory || undefined,
        })
        toast({ title: `${file.name} ajouté`, variant: 'success' })
      } catch {
        toast({ title: t('common.error'), description: `Impossible d'ajouter ${file.name}.`, variant: 'error' })
      }
    }
  }, [ownerId, ownerType, uploadAttachment, toast, uploadCategory])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAttachment.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Fichier supprimé', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: 'Impossible de supprimer le fichier.', variant: 'error' })
    }
  }, [deleteAttachment, toast])

  const togglePreview = useCallback((id: string) => {
    setExpandedPreviews(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback(() => { setIsDragging(false) }, [])
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleUpload(e.dataTransfer.files) }, [handleUpload])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {/* Category filter pills (when dictionary provided) */}
      {categoryDictionary && categoryOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('')}
            className={cn(
              'rounded px-2 py-0.5 text-[10px] transition-colors',
              categoryFilter === ''
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            Tous
          </button>
          {categoryOptions.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setCategoryFilter(o.value)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] transition-colors',
                categoryFilter === o.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {/* Upload zone */}
      {!readOnly && (
        <>
          {categoryDictionary && categoryOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground shrink-0">
                Type :
              </label>
              <select
                className="gl-form-input h-7 text-xs flex-1"
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value)}
              >
                <option value="">— non catégorisé —</option>
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-all',
              isDragging ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-border hover:bg-accent/30',
            )}
          >
            {uploadAttachment.isPending
              ? <Loader2 size={18} className="mx-auto animate-spin text-muted-foreground mb-1" />
              : <Plus size={18} className="mx-auto text-muted-foreground mb-1" />
            }
            <p className="text-xs text-muted-foreground">
              {compact ? 'Ajouter un fichier' : 'Cliquez ou glissez-déposez des fichiers'}
            </p>
          </div>
        </>
      )}

      {/* Loading */}
      {isLoading && <div className="flex items-center justify-center py-4"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>}

      {/* File list */}
      {!isLoading && attachments.map((att) => {
        const FileIcon = getFileIcon(att.content_type)
        const isConfirming = confirmDeleteId === att.id
        const hasPreview = canPreview(att.content_type)
        const isExpanded = expandedPreviews.has(att.id)

        return (
          <div key={att.id} className="border border-border/60 rounded-lg bg-card overflow-hidden">
            {/* File info row */}
            <div className="flex items-center gap-2.5 px-3 py-2">
              <FileIcon size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{att.original_name}</p>
                  {att.category && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-foreground shrink-0">
                      {categoryOptions.find((o) => o.value === att.category)?.label ?? att.category}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-muted-foreground">
                  {formatSize(att.size_bytes)} · {formatDate(att.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {hasPreview && (
                  <button
                    onClick={() => togglePreview(att.id)}
                    className={cn('p-1 rounded transition-colors', isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}
                    title={isExpanded ? 'Masquer l\'aperçu' : 'Aperçu'}
                  >
                    {isExpanded ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                )}
                <button
                  onClick={() => downloadFile(att.id, att.original_name)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Télécharger"
                >
                  <Download size={11} />
                </button>
                {!readOnly && (isConfirming ? (
                  <div className="flex items-center gap-0.5">
                    <button className="gl-button gl-button-danger text-[9px]" onClick={() => handleDelete(att.id)} disabled={deleteAttachment.isPending}>Oui</button>
                    <button className="gl-button gl-button-default text-[9px]" onClick={() => setConfirmDeleteId(null)}>Non</button>
                  </div>
                ) : (
                  <button className="gl-button gl-button-danger" onClick={() => setConfirmDeleteId(att.id)} title="Supprimer">
                    <Trash2 size={11} />
                  </button>
                ))}
              </div>
            </div>

            {/* Inline preview */}
            {isExpanded && hasPreview && (
              <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-muted/10">
                <AuthMediaPreview
                  src={`/api/v1/attachments/${att.id}/download`}
                  contentType={att.content_type}
                  name={att.original_name}
                />
              </div>
            )}

            {/* Image thumbnail — only when explicitly expanded */}
          </div>
        )
      })}

      {/* Empty state */}
      {!isLoading && attachments.length === 0 && (
        <EmptyState icon={Paperclip} title="Aucun fichier" description="Aucun fichier joint." size="compact" />
      )}
    </div>
  )
}
