/**
 * AttachmentManager — Reusable polymorphic file attachment component.
 *
 * Embeddable anywhere: tiers detail, asset detail, notes, support tickets, etc.
 * Fetches and displays file attachments for a given owner (owner_type + owner_id).
 * Supports upload, download, delete.
 * Inline previews for browser-readable files, with a safe open/download
 * fallback for formats that need a native application.
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
  Check, X, ExternalLink, FileSpreadsheet,
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

async function openFileInNewTab(attachmentId: string, filename: string) {
  try {
    const response = await api.get(`/api/v1/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    })
    const blob = new Blob([response.data], {
      type: response.headers?.['content-type'] || response.data?.type || 'application/octet-stream',
    })
    const url = window.URL.createObjectURL(blob)
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      await downloadFile(attachmentId, filename)
      window.URL.revokeObjectURL(url)
      return
    }
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
  } catch {
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
const SPREADSHEET_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]
const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'md', 'markdown', 'csv', 'json', 'xml', 'yaml', 'yml', 'sql',
  'ini', 'conf', 'cfg', 'env', 'tsv', 'html', 'htm', 'css', 'js', 'ts',
])
const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx', 'csv', 'tsv'])

function getFileExtension(name: string): string {
  const clean = name.split('?')[0].split('#')[0]
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1).toLowerCase() : ''
}

function getFileIcon(contentType: string, name = '') {
  const ext = getFileExtension(name)
  if (contentType.startsWith('image/')) return Image
  if (contentType.startsWith('video/')) return Film
  if (contentType.startsWith('audio/')) return Music
  if (SPREADSHEET_TYPES.includes(baseContentType(contentType)) || SPREADSHEET_EXTENSIONS.has(ext)) return FileSpreadsheet
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

function canPreview(_contentType: string): boolean {
  return true
}

function isTextLike(contentType: string, name: string): boolean {
  const base = baseContentType(contentType)
  const ext = getFileExtension(name)
  return base.startsWith('text/') ||
    base.includes('json') ||
    base.includes('xml') ||
    TEXT_EXTENSIONS.has(ext)
}

function isSpreadsheetLike(contentType: string, name: string): boolean {
  const base = baseContentType(contentType)
  const ext = getFileExtension(name)
  return SPREADSHEET_TYPES.includes(base) || SPREADSHEET_EXTENSIONS.has(ext)
}

const attachmentActionClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const attachmentActiveActionClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const attachmentDangerActionClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Authenticated media component — fetches via API and renders as blob URL */
function AuthFilePreview({
  attachmentId,
  src,
  contentType,
  name,
  sizeBytes,
}: {
  attachmentId: string
  src: string
  contentType: string
  name: string
  sizeBytes: number
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [textPreview, setTextPreview] = useState<string | null>(null)
  const [tablePreview, setTablePreview] = useState<{ headers: string[]; rows: unknown[][]; sheet?: string } | null>(null)
  const [error, setError] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    let revoke: string | null = null
    let cancelled = false
    setError(false)
    setBlobUrl(null)
    setTextPreview(null)
    setTablePreview(null)
    api.get(src, { responseType: 'blob' })
      .then(async ({ data }) => {
        if (cancelled) return
        const blob = data as Blob
        const url = URL.createObjectURL(blob)
        revoke = url
        setBlobUrl(url)
        const base = baseContentType(contentType)
        const ext = getFileExtension(name)

        if (isSpreadsheetLike(contentType, name)) {
          if (ext === 'csv' || ext === 'tsv' || base === 'text/csv') {
            const Papa = await import('papaparse')
            const text = await blob.text()
            if (cancelled) return
            const parsed = Papa.parse<string[]>(text, {
              delimiter: ext === 'tsv' ? '\t' : undefined,
              preview: 51,
              skipEmptyLines: true,
            })
            const rows = (parsed.data || []).filter((row) => row.length > 0)
            setTablePreview({
              headers: rows[0]?.map((cell, idx) => String(cell || `Col. ${idx + 1}`)) ?? [],
              rows: rows.slice(1, 51),
            })
            return
          }
          if (ext === 'xls' || ext === 'xlsx') {
            const XLSX = await import('xlsx')
            const workbook = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
            if (cancelled) return
            const firstSheetName = workbook.SheetNames[0]
            const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined
            const matrix = sheet ? XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false }) : []
            const rows = matrix.filter((row) => Array.isArray(row) && row.length > 0)
            setTablePreview({
              sheet: firstSheetName,
              headers: (rows[0] || []).slice(0, 12).map((cell, idx) => String(cell || `Col. ${idx + 1}`)),
              rows: rows.slice(1, 51).map((row) => row.slice(0, 12)),
            })
            return
          }
        }

        if (isTextLike(contentType, name)) {
          const raw = await blob.text()
          if (cancelled) return
          const formatted = base.includes('json') || ext === 'json'
            ? (() => {
              try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
            })()
            : raw
          setTextPreview(formatted.length > 120_000
            ? `${formatted.slice(0, 120_000)}\n\n${t('attachments.preview.truncated', '... aperçu tronqué ...')}`
            : formatted)
        }
      })
      .catch(() => setError(true))
    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [contentType, name, src, t])

  if (error) {
    return (
      <p className="p-2 text-xs text-muted-foreground">
        {t('attachments.preview.loadError', "Impossible de charger l'aperçu.")}
      </p>
    )
  }
  if (!blobUrl) return <div className="flex items-center justify-center py-6"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>

  const base = baseContentType(contentType)
  if (IMAGE_TYPES.includes(base)) {
    return <img src={blobUrl} alt={name} className="max-h-[360px] max-w-full rounded object-contain" />
  }
  if (VIDEO_TYPES.includes(base)) {
    return <video src={blobUrl} controls className="max-h-[360px] w-full rounded" />
  }
  if (AUDIO_TYPES.includes(base)) {
    return <audio src={blobUrl} controls className="w-full" />
  }
  if (PDF_TYPES.includes(base)) {
    return <iframe src={blobUrl} className="h-[460px] w-full rounded border-0" title={name} />
  }
  if (tablePreview) {
    return (
      <div className="space-y-2">
        {tablePreview.sheet && (
          <p className="text-[10px] text-muted-foreground">
            {t('attachments.preview.sheet', 'Feuille')} : {tablePreview.sheet}
          </p>
        )}
        <div className="max-h-[360px] overflow-auto rounded border border-border/50">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                {tablePreview.headers.map((header, idx) => (
                  <th key={`${header}-${idx}`} className="border-b border-border/50 px-2 py-1 text-left font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tablePreview.rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="odd:bg-muted/20">
                  {tablePreview.headers.map((_, colIdx) => (
                    <td key={colIdx} className="border-b border-border/30 px-2 py-1 align-top">
                      {String(row[colIdx] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }
  if (textPreview !== null) {
    return (
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded border border-border/50 bg-background p-3 text-[11px] leading-relaxed text-foreground">
        {textPreview || t('attachments.preview.emptyText', 'Fichier texte vide.')}
      </pre>
    )
  }
  return (
    <div className="rounded border border-border/50 bg-background p-3">
      <div className="flex items-start gap-3">
        <FileText size={20} className="mt-0.5 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('attachments.preview.unsupported', 'Aperçu détaillé non disponible dans le navigateur pour ce format.')}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {contentType || 'application/octet-stream'} · {formatSize(sizeBytes)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-foreground hover:bg-muted"
          onClick={() => openFileInNewTab(attachmentId, name)}
        >
          <ExternalLink size={13} /> {t('attachments.preview.open', 'Ouvrir')}
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded border border-border px-2 text-xs font-medium text-foreground hover:bg-muted"
          onClick={() => downloadFile(attachmentId, name)}
        >
          <Download size={13} /> {t('attachments.preview.download', 'Télécharger')}
        </button>
      </div>
    </div>
  )
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
  /** Category values to hide from the dropdown, filter bar, and list view.
   *  Used e.g. by MOC to hide `inline_image` (those rows are managed by
   *  the rich-text editor itself, not by the attachments panel).
   */
  hiddenCategories?: string[]
}

export function AttachmentManager({
  ownerType,
  ownerId,
  compact,
  initialShowForm,
  readOnly,
  categoryDictionary,
  hiddenCategories,
}: AttachmentManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const rawCategoryOptions = useDictionaryOptions(categoryDictionary ?? '')
  const categoryOptions = hiddenCategories?.length
    ? rawCategoryOptions.filter((o) => !hiddenCategories.includes(o.value))
    : rawCategoryOptions
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

  const attachments: FileAttachment[] = (data ?? []).filter((a) =>
    !hiddenCategories?.length || !a.category || !hiddenCategories.includes(a.category),
  )

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
        const FileIcon = getFileIcon(att.content_type, att.original_name)
        const isConfirming = confirmDeleteId === att.id
        const hasPreview = canPreview(att.content_type)
        const isExpanded = expandedPreviews.has(att.id)
        const categoryLabel = att.category
          ? categoryDictionary
            ? categoryOptions.find((o) => o.value === att.category)?.label
            : att.category
          : null

        return (
          <div key={att.id} className="border border-border/60 rounded-lg bg-card overflow-hidden">
            {/* File info row */}
            <div className="flex items-center gap-2.5 px-3 py-2">
              <FileIcon size={14} className="text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-foreground truncate">{att.original_name}</p>
                  {categoryLabel && (
                    <span className="rounded bg-accent px-1.5 py-0.5 text-[9px] font-medium text-accent-foreground shrink-0">
                      {categoryLabel}
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
                    type="button"
                    onClick={() => togglePreview(att.id)}
                    aria-label={isExpanded ? 'Masquer l aperçu' : 'Aperçu'}
                    className={isExpanded ? attachmentActiveActionClass : attachmentActionClass}
                    title={isExpanded ? 'Masquer l\'aperçu' : 'Aperçu'}
                  >
                    {isExpanded ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadFile(att.id, att.original_name)}
                  aria-label="Télécharger"
                  className={attachmentActionClass}
                  title="Télécharger"
                >
                  <Download size={13} />
                </button>
                {!readOnly && (isConfirming ? (
                  <div className="flex items-center gap-0.5">
                    <button type="button" className={attachmentDangerActionClass} onClick={() => handleDelete(att.id)} disabled={deleteAttachment.isPending} title="Confirmer la suppression" aria-label="Confirmer la suppression"><Check size={13} /></button>
                    <button type="button" className={attachmentActionClass} onClick={() => setConfirmDeleteId(null)} title="Annuler" aria-label="Annuler"><X size={13} /></button>
                  </div>
                ) : (
                  <button type="button" className={attachmentDangerActionClass} onClick={() => setConfirmDeleteId(att.id)} title="Supprimer" aria-label="Supprimer">
                    <Trash2 size={13} />
                  </button>
                ))}
              </div>
            </div>

            {/* Inline preview */}
            {isExpanded && hasPreview && (
              <div className="px-3 pb-3 pt-1 border-t border-border/30 bg-muted/10">
                <AuthFilePreview
                  attachmentId={att.id}
                  src={`/api/v1/attachments/${att.id}/download`}
                  contentType={att.content_type}
                  name={att.original_name}
                  sizeBytes={att.size_bytes}
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
