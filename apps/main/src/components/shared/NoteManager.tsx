/**
 * NoteManager — Reusable polymorphic notes/comments component.
 *
 * Embeddable anywhere: tiers detail, asset detail, settings, etc.
 * Fetches and displays notes for a given owner (owner_type + owner_id).
 * Supports public/private visibility, pinning, author attribution.
 * Notes are historizable — timestamped and attributed to authors.
 *
 * Usage:
 *   <NoteManager ownerType="tier" ownerId={tier.id} />
 *   <NoteManager ownerType="asset" ownerId={asset.id} />
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare, Trash2, Pencil, Loader2,
  Pin, Lock, Globe, Send, Check, X,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/useSettings'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { cn } from '@/lib/utils'
import type { Note } from '@/types/api'

function formatDate(dateStr: string, locale: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString(locale || undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const noteActionClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const noteDangerActionClass = 'inline-flex h-6 w-6 items-center justify-center rounded text-destructive transition-colors hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function cleanRichText(html: string): string {
  return html
    .replace(/<p>\s*(<br\s*\/?>)?\s*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .trim()
}

function isBlankRichText(html: string): boolean {
  return cleanRichText(html).length === 0
}

interface NoteManagerProps {
  /** Object type: 'user', 'tier', 'asset', 'entity' */
  ownerType: string
  /** UUID of the owning object */
  ownerId: string | undefined
  /** Compact mode (for detail panels) */
  compact?: boolean
  /** If true, focuses the note input on mount */
  initialShowForm?: boolean
}

export function NoteManager({ ownerType, ownerId, compact, initialShowForm }: NoteManagerProps) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const userId = useAuthStore((s) => s.user?.id)
  const { data, isLoading } = useNotes(ownerType, ownerId)
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()

  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const notes: Note[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || isBlankRichText(content)) return
    try {
      await createNote.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        content,
        visibility,
      })
      setContent('')
      toast({ title: t('shared.notes.added'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: t('shared.notes.error_add'), variant: 'error' })
    }
  }, [ownerId, ownerType, content, visibility, createNote, toast, t])

  const handleUpdate = useCallback(async (id: string) => {
    if (isBlankRichText(editContent)) return
    try {
      await updateNote.mutateAsync({ id, payload: { content: editContent } })
      setEditingId(null)
      setEditContent('')
      toast({ title: t('shared.notes.updated'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: t('shared.notes.error_edit'), variant: 'error' })
    }
  }, [editContent, updateNote, toast, t])

  const handleTogglePin = useCallback(async (note: Note) => {
    try {
      await updateNote.mutateAsync({ id: note.id, payload: { pinned: !note.pinned } })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [updateNote, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteNote.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: t('shared.notes.deleted'), variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: t('shared.notes.error_delete'), variant: 'error' })
    }
  }, [deleteNote, toast, t])

  if (!ownerId) return null

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {/* New note form */}
      <div className="overflow-hidden rounded-md border border-border/60 bg-card">
        <div
          data-initial-focus={initialShowForm ? 'true' : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreate()
          }}
        >
          <RichTextField
            value={content}
            onChange={setContent}
            placeholder={t('shared.notes.add')}
            rows={compact ? 3 : 4}
            compact
            className="rounded-none border-0"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 bg-accent/20 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/50 bg-background/60 px-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              title={visibility === 'public' ? t('shared.notes.visible_public') : t('shared.notes.visible_private')}
              type="button"
            >
              {visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
              {visibility === 'public' ? t('common.public') : t('shared.notes.private')}
            </button>
            <span className="hidden text-[10px] text-muted-foreground/60 sm:inline">
              {t('shared.notes.save_shortcut')}
            </span>
          </div>
          <button
            onClick={handleCreate}
            disabled={isBlankRichText(content) || createNote.isPending}
            className={cn(
              'inline-flex items-center justify-center rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              compact
                ? 'h-7 w-7 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                : 'h-8 gap-1.5 bg-primary px-2.5 text-primary-foreground hover:bg-primary/90',
            )}
            title={isBlankRichText(content) ? t('shared.notes.save_disabled') : t('shared.notes.save')}
            type="button"
          >
            {createNote.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <>
                <Send size={12} />
                {!compact && <span>{t('common.save')}</span>}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Notes list */}
      {!isLoading && notes.map((note) => {
        const isOwner = note.created_by === userId
        const isEditing = editingId === note.id
        const isConfirming = confirmDeleteId === note.id

        if (isEditing) {
          return (
            <div
              key={note.id}
              className="overflow-hidden rounded-md border border-primary/30 bg-card"
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingId(null)
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleUpdate(note.id)
              }}
            >
              <RichTextField
                value={editContent}
                onChange={setEditContent}
                rows={3}
                compact
                className="rounded-none border-0"
              />
              <div className="flex items-center justify-end gap-2 border-t border-border/40 px-3 py-2">
                <button onClick={() => setEditingId(null)} className="btn-sm btn-secondary">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => handleUpdate(note.id)}
                  disabled={isBlankRichText(editContent) || updateNote.isPending}
                  className="btn-sm btn-primary"
                >
                  {updateNote.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={note.id}
            className={`rounded-md border bg-card px-3 py-2.5 ${
              note.pinned ? 'border-primary/30 bg-primary/[0.03]' : 'border-border/60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <MessageSquare size={14} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  {/* Header: author + time + badges */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-foreground">
                      {note.author_name || t('common.user')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(note.created_at, i18n.language)}
                    </span>
                    {note.visibility === 'private' && (
                      <span className="chip flex items-center gap-0.5">
                        <Lock size={8} />
                        {t('shared.notes.private')}
                      </span>
                    )}
                    {note.pinned && (
                      <span className="chip chip-info flex items-center gap-0.5">
                        <Pin size={8} />
                        {t('shared.notes.pinned')}
                      </span>
                    )}
                  </div>
                  {/* Content */}
                  <RichTextDisplay value={note.content} className="text-foreground" empty="" />
                  {note.updated_at !== note.created_at && (
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                      {t('shared.notes.modified_at', { date: formatDate(note.updated_at, i18n.language) })}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions (only for owner) */}
              {isOwner && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    className={noteActionClass}
                    onClick={() => handleTogglePin(note)}
                    aria-label={note.pinned ? t('shared.notes.unpin') : t('shared.notes.pin')}
                    title={note.pinned ? t('shared.notes.unpin') : t('shared.notes.pin')}
                  >
                    <Pin size={13} className={note.pinned ? 'text-primary' : ''} />
                  </button>
                  <button
                    type="button"
                    className={noteActionClass}
                    onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                    aria-label={t('common.edit')}
                    title={t('common.edit')}
                  >
                    <Pencil size={13} />
                  </button>
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={noteDangerActionClass}
                        onClick={() => handleDelete(note.id)}
                        title={t('common.confirm_delete')}
                        aria-label={t('common.confirm_delete')}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        className={noteActionClass}
                        onClick={() => setConfirmDeleteId(null)}
                        title={t('common.cancel')}
                        aria-label={t('common.cancel')}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={noteDangerActionClass}
                      onClick={() => setConfirmDeleteId(note.id)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Empty state */}
      {!isLoading && notes.length === 0 && (
        compact ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
            <MessageSquare size={14} className="shrink-0" />
            <span>{t('shared.notes.empty_description')}</span>
          </div>
        ) : (
          <EmptyState icon={MessageSquare} title={t('shared.notes.empty')} description={t('shared.notes.empty_description')} size="compact" />
        )
      )}
    </div>
  )
}
