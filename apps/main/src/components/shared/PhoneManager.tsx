/**
 * PhoneManager — Reusable polymorphic phone management component.
 *
 * Embeddable anywhere: tiers, contacts, users, assets, entities.
 * Supports multiple phones with labels, country code, default flag.
 * Double-click to edit inline.
 *
 * Usage:
 *   <PhoneManager ownerType="tier" ownerId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Loader2, Phone as PhoneIcon, Star, Check } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { usePhones, useCreatePhone, useUpdatePhone, useDeletePhone } from '@/hooks/useSettings'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { Phone } from '@/types/api'

const PHONE_LABELS = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'office', label: 'Bureau' },
  { value: 'home', label: 'Domicile' },
  { value: 'fax', label: 'Fax' },
  { value: 'other', label: 'Autre' },
]

interface PhoneManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

export function PhoneManager({ ownerType, ownerId, compact }: PhoneManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = usePhones(ownerType, ownerId)
  const createPhone = useCreatePhone()
  const updatePhone = useUpdatePhone()
  const deletePhone = useDeletePhone()

  const [showForm, setShowForm] = useState(false)
  const [number, setNumber] = useState('')
  const [label, setLabel] = useState('mobile')
  const [countryCode, setCountryCode] = useState('+33')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const phones: Phone[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !number.trim()) return
    try {
      await createPhone.mutateAsync({
        owner_type: ownerType,
        owner_id: ownerId,
        number: number.trim(),
        label,
        country_code: countryCode || undefined,
        is_default: phones.length === 0,
      })
      setNumber('')
      setShowForm(false)
      toast({ title: 'Téléphone ajouté', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, number, label, countryCode, phones.length, createPhone, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deletePhone.mutateAsync(id)
      setConfirmDeleteId(null)
      toast({ title: 'Téléphone supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [deletePhone, toast])

  const handleSetDefault = useCallback(async (id: string) => {
    try {
      await updatePhone.mutateAsync({ id, payload: { is_default: true } })
      toast({ title: 'Numéro par défaut défini', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [updatePhone, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && phones.length > 0 && (
        <div className="space-y-1">
          {phones.map((phone) => {
            if (editingId === phone.id) {
              return (
                <InlinePhoneEditor
                  key={phone.id}
                  phone={phone}
                  onSave={async (updates) => {
                    try {
                      await updatePhone.mutateAsync({ id: phone.id, payload: updates })
                      setEditingId(null)
                      toast({ title: 'Téléphone modifié', variant: 'success' })
                    } catch {
                      toast({ title: 'Erreur', variant: 'error' })
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updatePhone.isPending}
                />
              )
            }

            const isConfirming = confirmDeleteId === phone.id
            return (
              <div
                key={phone.id}
                className="flex items-center gap-2 text-sm group"
                onDoubleClick={() => setEditingId(phone.id)}
                title="Double-cliquez pour modifier"
              >
                <PhoneIcon size={12} className="text-muted-foreground shrink-0" />
                <span className="text-[10px] font-medium text-muted-foreground uppercase w-12 shrink-0">
                  {PHONE_LABELS.find((l) => l.value === phone.label)?.label ?? phone.label}
                </span>
                <span className="text-foreground font-mono text-xs">
                  {phone.country_code ? `${phone.country_code} ` : ''}{phone.number}
                </span>
                {phone.is_default && (
                  <Star size={10} className="text-yellow-500 fill-yellow-500 shrink-0" />
                )}
                <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!phone.is_default && (
                    <button
                      onClick={() => handleSetDefault(phone.id)}
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground"
                      title="Définir par défaut"
                    >
                      <Star size={10} />
                    </button>
                  )}
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(phone.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(phone.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && phones.length === 0 && !compact && (
        <EmptyState icon={PhoneIcon} title="Aucun téléphone" size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un téléphone
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`${panelInputClass} w-16`}
              placeholder="+33"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            />
            <input
              type="tel"
              className={`${panelInputClass} flex-1`}
              placeholder="6 12 34 56 78"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
          <select className="gl-form-select text-xs" value={label} onChange={(e) => setLabel(e.target.value)}>
            {PHONE_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setNumber('') }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!number.trim() || createPhone.isPending} className="gl-button-sm gl-button-confirm">
              {createPhone.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InlinePhoneEditor({
  phone,
  onSave,
  onCancel,
  isSaving,
}: {
  phone: Phone
  onSave: (updates: { number?: string; label?: string; country_code?: string | null }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editNumber, setEditNumber] = useState(phone.number)
  const [editLabel, setEditLabel] = useState(phone.label)
  const [editCode, setEditCode] = useState(phone.country_code ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    const updates: Record<string, string | null | undefined> = {}
    if (editNumber.trim() !== phone.number) updates.number = editNumber.trim()
    if (editLabel !== phone.label) updates.label = editLabel
    if ((editCode || null) !== phone.country_code) updates.country_code = editCode || null
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="flex items-center gap-1.5 p-1.5 rounded-lg border border-primary/30 bg-card">
      <input
        type="text"
        value={editCode}
        onChange={(e) => setEditCode(e.target.value)}
        className="w-12 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
        placeholder="+33"
      />
      <input
        ref={inputRef}
        type="tel"
        value={editNumber}
        onChange={(e) => setEditNumber(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
        className="flex-1 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
      />
      <select value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-card">
        {PHONE_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <button onClick={handleSave} disabled={isSaving} className="p-0.5 rounded hover:bg-green-100 text-green-600">
        {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
      </button>
      <button onClick={onCancel} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
        <X size={10} />
      </button>
    </div>
  )
}
