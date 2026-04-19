/**
 * LegalIdentifierManager — Polymorphic manager for legal/fiscal identifiers.
 *
 * Uses dictionary-driven types (category=legal_identifier_type) with per-country metadata.
 * Supports: entity, tier, user, or any owner_type.
 * Double-click to edit inline.
 *
 * Usage:
 *   <LegalIdentifierManager ownerType="tier" ownerId={tier.id} country="CM" />
 *   <LegalIdentifierManager ownerType="entity" ownerId={entity.id} />
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Loader2, FileText, Check, AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  useLegalIdentifiers, useCreateLegalIdentifier,
  useUpdateLegalIdentifier, useDeleteLegalIdentifier,
} from '@/hooks/useUserSubModels'
import { useDictionary, type DictionaryEntry } from '@/hooks/useDictionary'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { LegalIdentifier } from '@/types/api'

interface LegalIdentifierManagerProps {
  ownerType: string
  ownerId: string | undefined
  /** Country code (ISO 2) to filter available identifier types */
  country?: string | null
  compact?: boolean
}

function useIdentifierTypes(country?: string | null) {
  const { data: allTypes } = useDictionary('legal_identifier_type')

  // Filter by country: show types for this country + generic (*) types
  const types = (allTypes ?? []).filter((t) => {
    const meta = t.metadata_json as { country?: string } | null
    if (!meta?.country) return true
    if (meta.country === '*') return true
    if (!country) return true // no country filter → show all
    return meta.country === country
  })

  return types
}

function getTypeLabel(types: DictionaryEntry[], code: string): string {
  return types.find((t) => t.code === code)?.label ?? code
}

function isRequired(types: DictionaryEntry[], code: string): boolean {
  const entry = types.find((t) => t.code === code)
  const meta = entry?.metadata_json as { required?: boolean } | null
  return meta?.required === true
}

export function LegalIdentifierManager({ ownerType, ownerId, country, compact }: LegalIdentifierManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data, isLoading } = useLegalIdentifiers(ownerType, ownerId)
  const createIdent = useCreateLegalIdentifier()
  const updateIdent = useUpdateLegalIdentifier()
  const deleteIdent = useDeleteLegalIdentifier()
  const types = useIdentifierTypes(country)

  const [showForm, setShowForm] = useState(false)
  const [type, setType] = useState('')
  const [value, setValue] = useState('')
  const [identCountry, setIdentCountry] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const identifiers: LegalIdentifier[] = data ?? []

  // Set default type when types load
  useEffect(() => {
    if (types.length > 0 && !type) setType(types[0].code)
  }, [types, type])

  const resetForm = useCallback(() => {
    setType(types.length > 0 ? types[0].code : '')
    setValue('')
    setIdentCountry('')
    setIssuedAt('')
    setExpiresAt('')
  }, [types])

  const handleCreate = useCallback(async () => {
    if (!ownerId || !value.trim()) return
    try {
      await createIdent.mutateAsync({
        ownerType,
        ownerId,
        payload: {
          type,
          value: value.trim(),
          country: identCountry.trim() || undefined,
          issued_at: issuedAt || undefined,
          expires_at: expiresAt || undefined,
        },
      })
      resetForm()
      setShowForm(false)
      toast({ title: 'Identifiant ajouté', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, type, value, identCountry, issuedAt, expiresAt, createIdent, toast, resetForm])

  const handleDelete = useCallback(async (identId: string) => {
    if (!ownerId) return
    try {
      await deleteIdent.mutateAsync({ ownerType, ownerId, identId })
      setConfirmDeleteId(null)
      toast({ title: 'Identifiant supprimé', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [ownerId, ownerType, deleteIdent, toast])

  if (!ownerId) return null

  // Check for missing required identifiers
  const existingTypes = new Set(identifiers.map((i) => i.type))
  const missingRequired = types.filter((t) => isRequired(types, t.code) && !existingTypes.has(t.code))

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Missing required identifiers warning — deduped by label */}
      {!isLoading && missingRequired.length > 0 && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-2 py-1.5">
          <AlertCircle size={10} className="shrink-0 mt-0.5" />
          <span>Obligatoire : {Array.from(new Set(missingRequired.map((t) => t.label))).join(', ')}</span>
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
                  ownerType={ownerType}
                  ownerId={ownerId}
                  types={types}
                  onSave={async (updates) => {
                    try {
                      await updateIdent.mutateAsync({ ownerType, ownerId, identId: ident.id, payload: updates })
                      setEditingId(null)
                      toast({ title: 'Identifiant modifié', variant: 'success' })
                    } catch {
                      toast({ title: 'Erreur', variant: 'error' })
                    }
                  }}
                  onCancel={() => setEditingId(null)}
                  isSaving={updateIdent.isPending}
                />
              )
            }

            const typeLabel = getTypeLabel(types, ident.type)
            const required = isRequired(types, ident.type)
            const isConfirming = confirmDeleteId === ident.id

            return (
              <div
                key={ident.id}
                className="flex items-center gap-2 text-sm group"
                onDoubleClick={() => setEditingId(ident.id)}
                title={t('projets.double_cliquez_pour_modifier')}
              >
                <FileText size={12} className="text-muted-foreground shrink-0" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase min-w-[60px] shrink-0">
                  {typeLabel}
                  {required && <span className="text-amber-500 ml-0.5">*</span>}
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
        <EmptyState icon={FileText} title={t('shared.identifiers.empty')} size="compact" />
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
              {types.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}{isRequired(types, t.code) ? ' *' : ''}
                </option>
              ))}
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
              value={identCountry}
              onChange={(e) => setIdentCountry(e.target.value)}
            />
            <input
              type="text"
              className={`${panelInputClass} flex-1`}
              placeholder={t('shared.date_emission_yyyy_mm_dd')}
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
  ownerType: _ownerType,
  ownerId: _ownerId,
  types,
  onSave,
  onCancel,
  isSaving,
}: {
  identifier: LegalIdentifier
  ownerType: string
  ownerId: string
  types: DictionaryEntry[]
  onSave: (updates: { type?: string; value?: string; country?: string | null; issued_at?: string | null; expires_at?: string | null }) => Promise<void>
  onCancel: () => void
  isSaving: boolean
}) {
  const { t } = useTranslation()
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
          {types.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
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
          placeholder={t('shared.emission')}
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
