/**
 * OpeningHoursManager — Reusable polymorphic opening hours management component.
 *
 * Embeddable anywhere: tiers, entities, assets, sites.
 * Shows a week grid (Mon-Sun) with open/close time slots.
 * Each day can have multiple time slots or be marked as closed.
 * Double-click to edit inline.
 *
 * Usage:
 *   <OpeningHoursManager ownerType="tier" ownerId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Loader2, Check, Clock } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useOpeningHours, useCreateOpeningHour, useUpdateOpeningHour, useDeleteOpeningHour } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import type { OpeningHourRead } from '@/services/settingsService'

const DAY_LABELS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
] as const

// ── OpeningHoursManager (main) ────────────────────────────────────

interface OpeningHoursManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

export function OpeningHoursManager({ ownerType, ownerId, compact }: OpeningHoursManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data, isLoading } = useOpeningHours(ownerType, ownerId)
  const createHour = useCreateOpeningHour()
  const updateHour = useUpdateOpeningHour()
  const deleteHour = useDeleteOpeningHour()

  const [showForm, setShowForm] = useState(false)
  const [formDay, setFormDay] = useState(1)
  const [formOpen, setFormOpen] = useState('08:00')
  const [formClose, setFormClose] = useState('18:00')
  const [formClosed, setFormClosed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const items: OpeningHourRead[] = data ?? []

  // Group by day_of_week, sorted
  const byDay = useMemo(() => {
    const map = new Map<number, OpeningHourRead[]>()
    for (const item of items) {
      const existing = map.get(item.day_of_week) ?? []
      existing.push(item)
      map.set(item.day_of_week, existing)
    }
    return map
  }, [items])

  const handleCreate = useCallback(async () => {
    if (!ownerId) return
    try {
      await createHour.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        day_of_week: formDay,
        open_time: formClosed ? null : formOpen,
        close_time: formClosed ? null : formClose,
        is_closed: formClosed,
      })
      setShowForm(false)
      toast({ title: 'Horaire ajouté', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [ownerId, ownerType, formDay, formOpen, formClose, formClosed, createHour, toast])

  const handleDelete = useCallback(async (id: string) => {
    if (!ownerId) return
    try {
      await deleteHour.mutateAsync({ id, ownerType, ownerId })
      setConfirmDeleteId(null)
      toast({ title: 'Horaire supprimé', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [ownerId, ownerType, deleteHour, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="space-y-1">
          {DAY_LABELS.map((day) => {
            const slots = byDay.get(day.value)
            if (!slots || slots.length === 0) return null

            return (
              <div key={day.value} className="flex items-start gap-2 text-sm">
                <span className="text-[10px] font-medium text-muted-foreground uppercase w-16 shrink-0 pt-0.5">
                  {day.label}
                </span>
                <div className="flex-1 space-y-0.5">
                  {slots.map((slot) => {
                    if (editingId === slot.id) {
                      return (
                        <InlineHourEditor
                          key={slot.id}
                          hour={slot}
                          onSave={async (updates) => {
                            try {
                              await updateHour.mutateAsync({ id: slot.id, payload: updates })
                              setEditingId(null)
                              toast({ title: 'Horaire modifié', variant: 'success' })
                            } catch {
                              toast({ title: t('common.error'), variant: 'error' })
                            }
                          }}
                          onCancel={() => setEditingId(null)}
                          isSaving={updateHour.isPending}
                        />
                      )
                    }

                    const isConfirming = confirmDeleteId === slot.id
                    return (
                      <div
                        key={slot.id}
                        className="flex items-center gap-2 group"
                        onDoubleClick={() => setEditingId(slot.id)}
                        title="Double-cliquez pour modifier"
                      >
                        <Clock size={10} className="text-muted-foreground shrink-0" />
                        {slot.is_closed ? (
                          <span className="text-xs text-muted-foreground italic">Fermé</span>
                        ) : (
                          <span className="text-foreground text-xs font-mono">
                            {slot.open_time ?? '—'} – {slot.close_time ?? '—'}
                          </span>
                        )}
                        {slot.label && (
                          <span className="text-[10px] text-muted-foreground">({slot.label})</span>
                        )}
                        <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {!isConfirming ? (
                            <button
                              onClick={() => setConfirmDeleteId(slot.id)}
                              className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                              title="Supprimer"
                            >
                              <X size={10} />
                            </button>
                          ) : (
                            <span className="flex items-center gap-0.5 text-[10px]">
                              <button onClick={() => handleDelete(slot.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                              <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && items.length === 0 && !compact && (
        <EmptyState icon={Clock} title="Aucun horaire" size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un horaire
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <select className="gl-form-select text-xs" value={formDay} onChange={(e) => setFormDay(Number(e.target.value))}>
            {DAY_LABELS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={formClosed}
              onChange={(e) => setFormClosed(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-muted-foreground">Fermé ce jour</span>
          </label>
          {!formClosed && (
            <div className="flex items-center gap-2">
              <input
                type="time"
                className="gl-form-input text-xs flex-1"
                value={formOpen}
                onChange={(e) => setFormOpen(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <input
                type="time"
                className="gl-form-input text-xs flex-1"
                value={formClose}
                onChange={(e) => setFormClose(e.target.value)}
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={createHour.isPending} className="gl-button-sm gl-button-confirm">
              {createHour.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── InlineHourEditor ──────────────────────────────────────────────

function InlineHourEditor({
  hour,
  onSave,
  onCancel,
  isSaving,
}: {
  hour: OpeningHourRead
  onSave: (updates: { open_time?: string | null; close_time?: string | null; is_closed?: boolean }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editOpen, setEditOpen] = useState(hour.open_time ?? '08:00')
  const [editClose, setEditClose] = useState(hour.close_time ?? '18:00')
  const [editClosed, setEditClosed] = useState(hour.is_closed)
  const openRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editClosed) openRef.current?.focus() }, [editClosed])

  const handleSave = () => {
    const updates: Record<string, string | boolean | null> = {}
    if (editClosed !== hour.is_closed) updates.is_closed = editClosed
    if (editClosed) {
      if (hour.open_time !== null) updates.open_time = null
      if (hour.close_time !== null) updates.close_time = null
    } else {
      if (editOpen !== hour.open_time) updates.open_time = editOpen
      if (editClose !== hour.close_time) updates.close_time = editClose
    }
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-primary/30 bg-card">
      <label className="flex items-center gap-1 text-[10px]">
        <input
          type="checkbox"
          checked={editClosed}
          onChange={(e) => setEditClosed(e.target.checked)}
          className="rounded border-border"
        />
        <span className="text-muted-foreground">Fermé</span>
      </label>
      {!editClosed && (
        <>
          <input
            ref={openRef}
            type="time"
            value={editOpen}
            onChange={(e) => setEditOpen(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
            className="px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <input
            type="time"
            value={editClose}
            onChange={(e) => setEditClose(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
            className="px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
          />
        </>
      )}
      <button onClick={handleSave} disabled={isSaving} className="gl-button gl-button-confirm text-green-600">
        {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
      </button>
      <button onClick={onCancel} className="gl-button gl-button-default">
        <X size={10} />
      </button>
    </div>
  )
}
