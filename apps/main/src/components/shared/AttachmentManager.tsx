/**
 * AttachmentManager — Reusable polymorphic file attachment component.
 *
 * Embeddable anywhere: tiers detail, asset detail, notes, etc.
 * Fetches and displays file attachments for a given owner (owner_type + owner_id).
 * Supports upload, download, delete.
 *
 * Usage:
 *   <AttachmentManager ownerType="tier" ownerId={tier.id} />
 *   <AttachmentManager ownerType="asset" ownerId={asset.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Paperclip, Plus, Trash2, Download, Loader2,
  FileText, Image, FileArchive, Film, Music, File,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import type { FileAttachment } from '@/types/api'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

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

interface AttachmentManagerProps {
  /** Object type: 'user', 'tier', 'asset', 'entity' */
  ownerType: string
  /** UUID of the owning object */
  ownerId: string | undefined
  /** Compact mode (for detail panels) */
  compact?: boolean
  /** If true, opens the file picker on mount */
  initialShowForm?: boolean
  /** If true, hides upload and delete — only shows download links */
  readOnly?: boolean
}

export function AttachmentManager({ ownerType, ownerId, compact, initialShowForm, readOnly }: AttachmentManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useAttachments(ownerType, ownerId)
  const uploadAttachment = useUploadAttachment()
  const deleteAttachment = useDeleteAttachment()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Auto-open file picker when initialShowForm is true
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
        })
        toast({ title: `${file.name} ajouté`, variant: 'success' })
      } catch {
        toast({ title: 'Erreur', description: `Impossible d'ajouter ${file.name}.`, variant: 'error' })
      }
    }
  }, [ownerId, ownerType, uploadAttachment, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteAttachment.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Fichier supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer le fichier.', variant: 'error' })
    }
  }, [deleteAttachment, toast])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleUpload(e.dataTransfer.files)
  }, [handleUpload])

  if (!ownerId) return null

  return (
    <div className="space-y-3">
      {/* Hidden file input + Drop zone (hidden in readOnly mode) */}
      {!readOnly && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border/60 hover:border-border hover:bg-accent/30'
            }`}
          >
            {uploadAttachment.isPending ? (
              <Loader2 size={20} className="mx-auto animate-spin text-muted-foreground mb-1" />
            ) : (
              <Plus size={20} className="mx-auto text-muted-foreground mb-1" />
            )}
            <p className="text-xs text-muted-foreground">
              {compact ? 'Cliquez ou glissez pour ajouter' : 'Cliquez ou glissez-déposez des fichiers ici'}
            </p>
          </div>
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* File list */}
      {!isLoading && attachments.map((att) => {
        const FileIcon = getFileIcon(att.content_type)
        const isConfirming = confirmDeleteId === att.id

        return (
          <div key={att.id} className="border border-border/60 rounded-lg bg-card px-3 py-2.5">
            <div className="flex items-center gap-3">
              <FileIcon size={16} className="text-muted-foreground shrink-0" />

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{att.original_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatSize(att.size_bytes)} &middot; {new Date(att.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={`/api/v1/attachments/${att.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gl-button-sm gl-button-default"
                  title="Télécharger"
                >
                  <Download size={12} />
                </a>

                {!readOnly && (isConfirming ? (
                  <div className="flex items-center gap-1">
                    <button
                      className="gl-button-sm gl-button-danger"
                      onClick={() => handleDelete(att.id)}
                      disabled={deleteAttachment.isPending}
                    >
                      Oui
                    </button>
                    <button className="gl-button-sm gl-button-default" onClick={() => setConfirmDeleteId(null)}>
                      Non
                    </button>
                  </div>
                ) : (
                  <button
                    className="gl-button-sm gl-button-danger"
                    onClick={() => setConfirmDeleteId(att.id)}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                ))}
              </div>
            </div>
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
