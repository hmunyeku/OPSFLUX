/**
 * TagManager — Reusable polymorphic tag/category management component.
 *
 * Embeddable anywhere: tiers detail, asset detail, settings, etc.
 * Fetches and displays tags as a hierarchical tree for a given owner.
 * Supports:
 *   - Parent/child tag hierarchy (nested tree display)
 *   - Public/private visibility, color coding
 *   - Inline create with parent selector
 *   - Double-click to edit (name, color, visibility, parent)
 *   - Delete with inline confirmation
 *
 * Usage:
 *   <TagManager ownerType="tier" ownerId={tier.id} />
 *   <TagManager ownerType="asset" ownerId={asset.id} compact />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Loader2, Lock, Globe, Check, ChevronRight, ChevronDown, FolderTree } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useTagTree, useTags, useCreateTag, useUpdateTag, useDeleteTag } from '@/hooks/useSettings'
import { useAuthStore } from '@/stores/authStore'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { Tag, TagTree as TagTreeType } from '@/types/api'

const TAG_COLORS = [
  { value: '#6b7280', label: 'Gris' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#3b82f6', label: 'Bleu' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Rose' },
]

interface TagManagerProps {
  /** Object type: 'user', 'tier', 'asset', 'entity' */
  ownerType: string
  /** UUID of the owning object */
  ownerId: string | undefined
  /** Compact mode (for detail panels) */
  compact?: boolean
}

export function TagManager({ ownerType, ownerId, compact }: TagManagerProps) {
  const { toast } = useToast()
  const userId = useAuthStore((s) => s.user?.id)
  const { data: treeData, isLoading } = useTagTree(ownerType, ownerId)
  const { data: flatData } = useTags(ownerType, ownerId)
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3b82f6')
  const [visibility, setVisibility] = useState<'public' | 'private'>('public')
  const [parentId, setParentId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [editingTagId, setEditingTagId] = useState<string | null>(null)

  const tree: TagTreeType[] = treeData ?? []
  const flatTags: Tag[] = flatData ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !name.trim()) return
    try {
      await createTag.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        name: name.trim(),
        color,
        visibility,
        parent_id: parentId,
      })
      setName('')
      setParentId(null)
      setShowForm(false)
      toast({ title: 'Tag ajouté', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de créer le tag.', variant: 'error' })
    }
  }, [ownerId, ownerType, name, color, visibility, parentId, createTag, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteTag.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Tag supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de supprimer le tag.', variant: 'error' })
    }
  }, [deleteTag, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Tag tree display */}
      {!isLoading && tree.length > 0 && (
        <div className="space-y-1">
          {tree.map((node) => (
            <TagTreeNode
              key={node.id}
              node={node}
              depth={0}
              userId={userId}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
              editingTagId={editingTagId}
              setEditingTagId={setEditingTagId}
              onDelete={handleDelete}
              onUpdate={async (id, updates) => {
                try {
                  await updateTag.mutateAsync({ id, payload: updates })
                  setEditingTagId(null)
                  toast({ title: 'Tag modifié', variant: 'success' })
                } catch {
                  toast({ title: 'Erreur', variant: 'error' })
                }
              }}
              isUpdating={updateTag.isPending}
              flatTags={flatTags}
              compact={compact}
            />
          ))}
        </div>
      )}

      {!isLoading && !showForm && tree.length === 0 && !compact && (
        <EmptyState title="Aucun tag" size="compact" />
      )}

      {/* Add button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} />
          Ajouter un tag
        </button>
      )}

      {/* Inline create form */}
      {showForm && (
        <TagForm
          name={name}
          setName={setName}
          color={color}
          setColor={setColor}
          visibility={visibility}
          setVisibility={setVisibility}
          parentId={parentId}
          setParentId={setParentId}
          availableParents={flatTags}
          onSubmit={handleCreate}
          onCancel={() => { setShowForm(false); setName(''); setParentId(null) }}
          isPending={createTag.isPending}
          submitLabel="Ajouter"
        />
      )}
    </div>
  )
}

// ── Recursive tag tree node ─────────────────────────────────────

function TagTreeNode({
  node,
  depth,
  userId,
  confirmDeleteId,
  setConfirmDeleteId,
  editingTagId,
  setEditingTagId,
  onDelete,
  onUpdate,
  isUpdating,
  flatTags,
  compact,
}: {
  node: TagTreeType
  depth: number
  userId: string | undefined
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
  editingTagId: string | null
  setEditingTagId: (id: string | null) => void
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: { name?: string; color?: string; visibility?: 'public' | 'private'; parent_id?: string | null }) => Promise<void>
  isUpdating: boolean
  flatTags: Tag[]
  compact?: boolean
}) {
  const [expanded, setExpanded] = useState(true)
  const isOwner = node.created_by === userId
  const isConfirming = confirmDeleteId === node.id
  const isEditing = editingTagId === node.id
  const hasChildren = node.children.length > 0

  if (isEditing && isOwner) {
    return (
      <div style={{ marginLeft: depth * 16 }}>
        <InlineTagEditor
          tag={node}
          flatTags={flatTags}
          onSave={async (updates) => onUpdate(node.id, updates)}
          onCancel={() => setEditingTagId(null)}
          isSaving={isUpdating}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Tag badge row */}
      <div className="flex items-center gap-1" style={{ marginLeft: depth * 16 }}>
        {/* Expand/collapse toggle for parents */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 rounded hover:bg-accent text-muted-foreground shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-[20px] shrink-0" /> /* spacer for alignment */
        )}

        {/* Tag badge */}
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium text-white transition-all cursor-default select-none"
          style={{ backgroundColor: node.color }}
          onDoubleClick={() => {
            if (isOwner) {
              setEditingTagId(node.id)
              setConfirmDeleteId(null)
            }
          }}
          title={isOwner ? 'Double-cliquez pour modifier' : undefined}
        >
          {node.visibility === 'private' && <Lock size={10} />}
          {hasChildren && <FolderTree size={10} className="opacity-70" />}
          {node.name}
          {isOwner && !isConfirming && (
            <button
              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(node.id) }}
              className="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
              title="Supprimer"
            >
              <X size={10} />
            </button>
          )}
          {isConfirming && (
            <span className="ml-1 flex items-center gap-0.5">
              <button
                onClick={() => onDelete(node.id)}
                className="text-[10px] bg-white/30 rounded px-1 hover:bg-white/50"
              >
                Oui
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="text-[10px] bg-white/20 rounded px-1 hover:bg-white/40"
              >
                Non
              </button>
            </span>
          )}
        </span>

        {/* Child count indicator */}
        {hasChildren && !compact && (
          <span className="text-[10px] text-muted-foreground">
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children (recursive) */}
      {hasChildren && expanded && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <TagTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              userId={userId}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
              editingTagId={editingTagId}
              setEditingTagId={setEditingTagId}
              onDelete={onDelete}
              onUpdate={onUpdate}
              isUpdating={isUpdating}
              flatTags={flatTags}
              compact={compact}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inline tag editor (shown on double-click) ──────────────────

function InlineTagEditor({
  tag,
  flatTags,
  onSave,
  onCancel,
  isSaving,
}: {
  tag: Tag
  flatTags: Tag[]
  onSave: (updates: { name?: string; color?: string; visibility?: 'public' | 'private'; parent_id?: string | null }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editName, setEditName] = useState(tag.name)
  const [editColor, setEditColor] = useState(tag.color)
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>(tag.visibility)
  const [editParentId, setEditParentId] = useState<string | null>(tag.parent_id)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter out the tag itself and its descendants from parent options
  const availableParents = flatTags.filter((t) => t.id !== tag.id)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSave = () => {
    const updates: { name?: string; color?: string; visibility?: 'public' | 'private'; parent_id?: string | null } = {}
    if (editName.trim() !== tag.name) updates.name = editName.trim()
    if (editColor !== tag.color) updates.color = editColor
    if (editVisibility !== tag.visibility) updates.visibility = editVisibility
    if (editParentId !== tag.parent_id) updates.parent_id = editParentId
    if (Object.keys(updates).length === 0) {
      onCancel()
      return
    }
    onSave(updates)
  }

  return (
    <div className="inline-flex flex-col gap-1.5 p-2 rounded-lg border border-primary/30 bg-card shadow-sm">
      {/* Name input */}
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') onCancel()
          }}
          className="w-24 px-1.5 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none focus:border-primary/50"
        />
        <button
          onClick={handleSave}
          disabled={!editName.trim() || isSaving}
          className="gl-button gl-button-confirm dark:hover:bg-green-900/30 text-green-600"
          title="Valider"
        >
          {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
        </button>
        <button onClick={onCancel} className="gl-button gl-button-default" title="Annuler">
          <X size={10} />
        </button>
      </div>

      {/* Parent selector */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground shrink-0">Parent:</span>
        <select
          value={editParentId ?? ''}
          onChange={(e) => setEditParentId(e.target.value || null)}
          className="flex-1 px-1 py-0.5 text-[10px] rounded border border-border/60 bg-card focus:outline-none focus:border-primary/50"
        >
          <option value="">Aucun (racine)</option>
          {availableParents.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Color palette */}
      <div className="flex items-center gap-1">
        {TAG_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setEditColor(c.value)}
            className="w-4 h-4 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c.value,
              borderColor: editColor === c.value ? 'var(--foreground)' : 'transparent',
            }}
            title={c.label}
          />
        ))}
      </div>

      {/* Visibility toggle */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditVisibility('public')}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            editVisibility === 'public'
              ? 'bg-primary/15 text-primary'
              : 'bg-accent text-muted-foreground'
          }`}
        >
          <Globe size={8} /> Public
        </button>
        <button
          onClick={() => setEditVisibility('private')}
          className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
            editVisibility === 'private'
              ? 'bg-primary/15 text-primary'
              : 'bg-accent text-muted-foreground'
          }`}
        >
          <Lock size={8} /> Prive
        </button>
      </div>
    </div>
  )
}

// ── Shared tag form (create mode) ──────────────────────────────

function TagForm({
  name,
  setName,
  color,
  setColor,
  visibility,
  setVisibility,
  parentId,
  setParentId,
  availableParents,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
}: {
  name: string
  setName: (v: string) => void
  color: string
  setColor: (v: string) => void
  visibility: 'public' | 'private'
  setVisibility: (v: 'public' | 'private') => void
  parentId: string | null
  setParentId: (v: string | null) => void
  availableParents: Tag[]
  onSubmit: () => void
  onCancel: () => void
  isPending: boolean
  submitLabel: string
}) {
  return (
    <div className="border border-border/60 rounded-lg bg-card p-3 space-y-3">
      <input
        type="text"
        className={panelInputClass}
        placeholder="Nom du tag"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
        autoFocus
      />

      {/* Parent selector */}
      {availableParents.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Parent:</span>
          <select
            value={parentId ?? ''}
            onChange={(e) => setParentId(e.target.value || null)}
            className="flex-1 px-2 py-1 text-xs rounded border border-border/60 bg-card focus:outline-none focus:border-primary/50"
          >
            <option value="">Aucun (racine)</option>
            {availableParents.map((t) => (
              <option key={t.id} value={t.id}>
                {t.parent_id ? '  ↳ ' : ''}{t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Color picker */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Couleur:</span>
        {TAG_COLORS.map((c) => (
          <button
            key={c.value}
            onClick={() => setColor(c.value)}
            className="w-5 h-5 rounded-full border-2 transition-all"
            style={{
              backgroundColor: c.value,
              borderColor: color === c.value ? 'var(--foreground)' : 'transparent',
            }}
            title={c.label}
          />
        ))}
      </div>

      {/* Visibility */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setVisibility('public')}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            visibility === 'public'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-accent text-muted-foreground border border-border/50'
          }`}
        >
          <Globe size={10} />
          Public
        </button>
        <button
          onClick={() => setVisibility('private')}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
            visibility === 'private'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-accent text-muted-foreground border border-border/50'
          }`}
        >
          <Lock size={10} />
          Prive
        </button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button onClick={onCancel} className="gl-button-sm gl-button-default">
          Annuler
        </button>
        <button
          onClick={onSubmit}
          disabled={!name.trim() || isPending}
          className="gl-button-sm gl-button-confirm"
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : submitLabel}
        </button>
      </div>
    </div>
  )
}
