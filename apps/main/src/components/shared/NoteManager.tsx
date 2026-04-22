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
  Pin, Lock, Globe, Send,
} from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from '@/hooks/useSettings'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'
import type { Note } from '@/types/api'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const { t } = useTranslation()
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
    if (!ownerId || !content.trim()) return
    try {
      await createNote.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        content: content.trim(),
        visibility,
      })
      setContent('')
      toast({ title: 'Note ajoutée', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: 'Impossible d\'ajouter la note.', variant: 'error' })
    }
  }, [ownerId, ownerType, content, visibility, createNote, toast])

  const handleUpdate = useCallback(async (id: string) => {
    if (!editContent.trim()) return
    try {
      await updateNote.mutateAsync({ id, payload: { content: editContent.trim() } })
      setEditingId(null)
      setEditContent('')
      toast({ title: 'Note modifiée', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: 'Impossible de modifier la note.', variant: 'error' })
    }
  }, [editContent, updateNote, toast])

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
      toast({ title: 'Note supprimée', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), description: 'Impossible de supprimer la note.', variant: 'error' })
    }
  }, [deleteNote, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-3">
      {/* New note form */}
      <div className="border border-border/60 rounded-lg bg-card overflow-hidden">
        <textarea
          className="w-full px-3 py-2.5 text-sm bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground/60"
          placeholder={t('shared.notes.add')}
          rows={compact ? 2 : 3}
          autoFocus={initialShowForm}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCreate()
          }}
        />
        {content.trim() && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/40 bg-accent/30">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVisibility(visibility === 'public' ? 'private' : 'public')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors bg-accent text-muted-foreground border border-border/50 hover:border-border"
                title={visibility === 'public' ? 'Visible par tous' : 'Visible par vous seul'}
              >
                {visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
                {visibility === 'public' ? 'Public' : 'Privé'}
              </button>
              <span className="text-[10px] text-muted-foreground/60">
                Ctrl+Enter pour envoyer
              </span>
            </div>
            <button
              onClick={handleCreate}
              disabled={!content.trim() || createNote.isPending}
              className="gl-button-sm gl-button-confirm"
            >
              {createNote.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <>
                  <Send size={12} />
                  Envoyer
                </>
              )}
            </button>
          </div>
        )}
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
            <div key={note.id} className="border border-primary/30 rounded-lg bg-card overflow-hidden">
              <textarea
                className="w-full px-3 py-2.5 text-sm bg-transparent border-0 outline-none resize-none"
                rows={3}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40">
                <button onClick={() => setEditingId(null)} className="gl-button-sm gl-button-default">
                  Annuler
                </button>
                <button
                  onClick={() => handleUpdate(note.id)}
                  disabled={!editContent.trim() || updateNote.isPending}
                  className="gl-button-sm gl-button-confirm"
                >
                  {updateNote.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </div>
          )
        }

        return (
          <div
            key={note.id}
            className={`border rounded-lg bg-card px-4 py-3 ${
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
                      {note.author_name || 'Utilisateur'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(note.created_at)}
                    </span>
                    {note.visibility === 'private' && (
                      <span className="gl-badge gl-badge-neutral flex items-center gap-0.5">
                        <Lock size={8} />
                        Privé
                      </span>
                    )}
                    {note.pinned && (
                      <span className="gl-badge gl-badge-info flex items-center gap-0.5">
                        <Pin size={8} />
                        Épinglé
                      </span>
                    )}
                  </div>
                  {/* Content */}
                  <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  {note.updated_at !== note.created_at && (
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                      modifié {formatDate(note.updated_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions (only for owner) */}
              {isOwner && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="gl-button-sm gl-button-default"
                    onClick={() => handleTogglePin(note)}
                    title={note.pinned ? 'Désépingler' : 'Épingler'}
                  >
                    <Pin size={12} className={note.pinned ? 'text-primary' : ''} />
                  </button>
                  <button
                    className="gl-button-sm gl-button-default"
                    onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                    title="Modifier"
                  >
                    <Pencil size={12} />
                  </button>
                  {isConfirming ? (
                    <div className="flex items-center gap-1">
                      <button className="gl-button-sm gl-button-danger" onClick={() => handleDelete(note.id)}>
                        Oui
                      </button>
                      <button className="gl-button-sm gl-button-default" onClick={() => setConfirmDeleteId(null)}>
                        Non
                      </button>
                    </div>
                  ) : (
                    <button
                      className="gl-button-sm gl-button-danger"
                      onClick={() => setConfirmDeleteId(note.id)}
                      title="Supprimer"
                    >
                      <Trash2 size={12} />
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
        <EmptyState icon={MessageSquare} title="Aucune note" description={t('shared.notes.empty_description')} size="compact" />
      )}
    </div>
  )
}
