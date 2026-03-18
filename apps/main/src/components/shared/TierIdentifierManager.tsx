/**
 * TierIdentifierManager — Manages multiple legal/fiscal identifiers per company.
 *
 * Supports: SIRET, RCCM, NIU, TVA intracommunautaire, NIF, NINEA, etc.
 * Each identifier has: type, value, country, issued_at, expires_at.
 * Double-click to edit inline.
 *
 * Usage:
 *   <TierIdentifierManager tierId={tier.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { Plus, X, Loader2, FileText, Check } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useTierIdentifiers, useCreateTierIdentifier,
  useUpdateTierIdentifier, useDeleteTierIdentifier,
} from '@/hooks/useTiers'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { TierIdentifier } from '@/types/api'

const IDENTIFIER_TYPES = [
  { value: 'siret', label: 'SIRET' },
  { value: 'siren', label: 'SIREN' },
  { value: 'rccm', label: 'RCCM' },
  { value: 'niu', label: 'NIU' },
  { value: 'nif', label: 'NIF' },
  { value: 'ninea', label: 'NINEA' },
  { value: 'tva_intra', label: 'TVA Intracommunautaire' },
  { value: 'cnps', label: 'CNPS' },
  { value: 'patente', label: 'Patente' },
  { value: 'other', label: 'Autre' },
]

interface TierIdentifierManagerProps {
  tierId: string | undefined
  compact?: boolean
}

export function TierIdentifierManager({ tierId, compact }: TierIdentifierManagerProps) {
  const { toast } = useToast()
  const { data, isLoading } = useTierIdentifiers(tierId)
  const createIdent = useCreateTierIdentifier()
  const updateIdent = useUpdateTierIdentifier()
  const deleteIdent = useDeleteTierIdentifier()

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('siret')
  const [value, setValue] = useState('')
  const [country, setCountry] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const identifiers: TierIdentifier[] = data ?? []

  const resetForm = useCallback(() => {
    setType('siret')
    setValue('')
    setCountry('')
    setIssuedAt('')
    setExpiresAt('')
  }, [])

  const handleCreate = useCallback(async () => {
    if (!tierId || !value.trim()) return
    try {
      await createIdent.mutateAsync({
        tierId,
        payload: {
          type,
          value: value.trim(),
          country: country.trim() || undefined,
          issued_at: issuedAt || undefined,
          expires_at: expiresAt || undefined,
        },
      })
      resetForm()
      setShowForm(false)
      toast({ title: 'Identifiant ajoute', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tierId, type, value, country, issuedAt, expiresAt, createIdent, toast, resetForm])

  const handleDelete = useCallback(async (identId: string) => {
    if (!tierId) return
    try {
      await deleteIdent.mutateAsync({ tierId, identId })
      setConfirmDeleteId(null)
      toast({ title: 'Identifiant supprime', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [tierId, deleteIdent, toast])

  if (!tierId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && identifiers.length > 0 && (
        <div className="space-y-1">
          {identifiers.map((ident) => {
            if (editingId === ident.id) {
              return (
                <InlineIdentifierEditor
                  key={ident.id}
                  identifier={ident}
                  tierId={tierId}
                  onSave={async (updates) => {
                    try {
                      await updateIdent.mutateAsync({ tierId, identId: ident.id, payload: updates })
                      setEditingId(null)
                      toast({ title: 'Identifiant modifie', variant: 'success' })
                    } catch {
                      toast({ title: 'Erreur', variant: 'error' })
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateIdent.isPending}
                />
              )
            }

            const typeLabel = IDENTIFIER_TYPES.find((t) => t.value === ident.type)?.label ?? ident.type
            const isConfirming = confirmDeleteId === ident.id

            return (
              <div
                key={ident.id}
                className="flex items-center gap-2 text-sm group"
                onDoubleClick={() => setEditingId(ident.id)}
                title="Double-cliquez pour modifier"
              >
                <FileText size={12} className="text-muted-foreground shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase min-w-[60px] shrink-0">
                  {typeLabel}
                </span>
                <span className="text-foreground font-mono text-xs truncate">
                  {ident.value}
                </span>
                {ident.country && (
                  <span className="text-[10px] text-muted-foreground/60 shrink-0">({ident.country})</span>
                )}
                {ident.expires_at && (
                  <span className="text-[9px] text-muted-foreground/50 shrink-0">exp. {ident.expires_at}</span>
                )}
                <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(ident.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(ident.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && identifiers.length === 0 && !compact && (
        <EmptyState icon={FileText} title="Aucun identifiant legal" size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => { setShowForm(true); resetForm() }}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un identifiant
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              className="gl-form-select text-xs flex-shrink-0"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {IDENTIFIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input
              type="text"
              className={`${panelInputClass} flex-1`}
              placeholder="Valeur (ex: RC/DLA/2024/B/1234)"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className={`${panelInputClass} flex-1`}
              placeholder="Pays (optionnel)"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
            <input
              type="text"
              className={`${panelInputClass} flex-1`}
              placeholder="Date emission (YYYY-MM-DD)"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
            />
            <input
              type="text"
              className={`${panelInputClass} flex-1`}
              placeholder="Date expiration (YYYY-MM-DD)"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); resetForm() }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!value.trim() || createIdent.isPending} className="gl-button-sm gl-button-confirm">
              {createIdent.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InlineIdentifierEditor({
  identifier,
  tierId: _tierId,
  onSave,
  onCancel,
  isSaving,
}: {
  identifier: TierIdentifier
  tierId: string
  onSave: (updates: { type?: string; value?: string; country?: string | null; issued_at?: string | null; expires_at?: string | null }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const [editType, setEditType] = useState(identifier.type)
  const [editValue, setEditValue] = useState(identifier.value)
  const [editCountry, setEditCountry] = useState(identifier.country ?? '')
  const [editIssued, setEditIssued] = useState(identifier.issued_at ?? '')
  const [editExpires, setEditExpires] = useState(identifier.expires_at ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSave = () => {
    const updates: Record<string, string | null | undefined> = {}
    if (editType !== identifier.type) updates.type = editType
    if (editValue.trim() !== identifier.value) updates.value = editValue.trim()
    if ((editCountry || null) !== identifier.country) updates.country = editCountry || null
    if ((editIssued || null) !== identifier.issued_at) updates.issued_at = editIssued || null
    if ((editExpires || null) !== identifier.expires_at) updates.expires_at = editExpires || null
    if (Object.keys(updates).length === 0) { onCancel(); return }
    onSave(updates)
  }

  return (
    <div className="p-2 rounded-lg border border-primary/30 bg-card space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select value={editType} onChange={(e) => setEditType(e.target.value)} className="text-[10px] px-1 py-0.5 rounded border border-border/60 bg-card">
          {IDENTIFIER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onCancel() }}
          className="flex-1 px-1 py-0.5 text-xs rounded border border-border/60 bg-card focus:outline-none"
          placeholder="Valeur"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={editCountry}
          onChange={(e) => setEditCountry(e.target.value)}
          className="flex-1 px-1 py-0.5 text-[10px] rounded border border-border/60 bg-card focus:outline-none"
          placeholder="Pays"
        />
        <input
          type="text"
          value={editIssued}
          onChange={(e) => setEditIssued(e.target.value)}
          className="flex-1 px-1 py-0.5 text-[10px] rounded border border-border/60 bg-card focus:outline-none"
          placeholder="Emission"
        />
        <input
          type="text"
          value={editExpires}
          onChange={(e) => setEditExpires(e.target.value)}
          className="flex-1 px-1 py-0.5 text-[10px] rounded border border-border/60 bg-card focus:outline-none"
          placeholder="Expiration"
        />
        <button onClick={handleSave} disabled={isSaving} className="p-0.5 rounded hover:bg-green-100 text-green-600">
          {isSaving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
        </button>
        <button onClick={onCancel} className="p-0.5 rounded hover:bg-accent text-muted-foreground">
          <X size={10} />
        </button>
      </div>
    </div>
  )
}
