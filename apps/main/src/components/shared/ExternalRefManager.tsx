/**
 * ExternalRefManager — Reusable polymorphic external reference manager.
 *
 * Embeddable anywhere: users, tiers, assets, projects, etc.
 * Uses the generic /api/v1/references/external/{owner_type}/{owner_id} endpoints.
 *
 * Usage:
 *   <ExternalRefManager ownerType="user" ownerId={user.id} />
 */
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X, Loader2, Link2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { useExternalRefs, useCreateExternalRef, useDeleteExternalRef } from '@/hooks/useExternalRefs'
import { useToast } from '@/components/ui/Toast'
import { panelInputClass } from '@/components/layout/DynamicPanel'
import type { ExternalReference, ExternalReferenceCreate } from '@/types/api'

const SYSTEM_OPTIONS = [
  { value: 'SAP', label: 'SAP' },
  { value: 'Gouti', label: 'Gouti' },
  { value: 'Intranet', label: 'Intranet' },
  { value: 'Legacy', label: 'Legacy' },
  { value: 'Other', label: 'Autre' },
]

interface ExternalRefManagerProps {
  ownerType: string
  ownerId: string | undefined
  compact?: boolean
}

export function ExternalRefManager({ ownerType, ownerId, compact }: ExternalRefManagerProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { data, isLoading } = useExternalRefs(ownerType, ownerId)
  const createRef = useCreateExternalRef()
  const deleteRef = useDeleteExternalRef()

  const [showForm, setShowForm] = useState(false)
  const [system, setSystem] = useState(SYSTEM_OPTIONS[0].value)
  const [code, setCode] = useState('')
  const [label, setLabel] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const refs: ExternalReference[] = data ?? []

  const handleCreate = useCallback(async () => {
    if (!ownerId || !code.trim()) return
    const payload: ExternalReferenceCreate = { system, code: code.trim() }
    if (label.trim()) payload.label = label.trim()
    try {
      await createRef.mutateAsync({ ownerType, ownerId, payload })
      setCode('')
      setLabel('')
      setShowForm(false)
      toast({ title: 'Référence ajoutée', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [ownerId, ownerType, system, code, label, createRef, toast])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteRef.mutateAsync({ ownerType, ownerId: ownerId!, refId: id })
      setConfirmDeleteId(null)
      toast({ title: 'Référence supprimée', variant: 'success' })
    } catch {
      toast({ title: t('common.error'), variant: 'error' })
    }
  }, [ownerType, ownerId, deleteRef, toast])

  if (!ownerId) return null

  return (
    <div className="space-y-2">
      {isLoading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && refs.length > 0 && (
        <div className="space-y-1">
          {refs.map((ref) => {
            const isConfirming = confirmDeleteId === ref.id
            return (
              <div
                key={ref.id}
                className="flex items-center gap-2 text-sm group px-1 py-1 rounded hover:bg-accent/50 transition-colors"
              >
                <Link2 size={11} className="text-muted-foreground shrink-0" />
                <span className="gl-badge gl-badge-neutral text-[10px] shrink-0">{ref.system}</span>
                <span className="text-xs font-mono text-foreground truncate">{ref.code}</span>
                {ref.label && (
                  <span className="text-[10px] text-muted-foreground truncate">({ref.label})</span>
                )}
                {ref.url && (
                  <a
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary hover:underline shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Lien
                  </a>
                )}
                <div className="flex items-center gap-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  {!isConfirming ? (
                    <button
                      onClick={() => setConfirmDeleteId(ref.id)}
                      className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-destructive"
                      title="Supprimer"
                    >
                      <X size={10} />
                    </button>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px]">
                      <button onClick={() => handleDelete(ref.id)} className="px-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Oui</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="px-1 rounded bg-accent text-muted-foreground hover:bg-accent/80">Non</button>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && !showForm && refs.length === 0 && !compact && (
        <EmptyState icon={Link2} title={t('shared.aucune_reference')} description={t('tiers.ui.no_external_refs')} size="compact" />
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} /> Ajouter un identifiant
        </button>
      )}

      {showForm && (
        <div className="border border-border/60 rounded-lg bg-card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">{t('tiers.ui.system')}</label>
              <select value={system} onChange={(e) => setSystem(e.target.value)} className={`${panelInputClass} w-full`}>
                {SYSTEM_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-muted-foreground">Code *</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${panelInputClass} w-full`}
                placeholder="Ex: 12345"
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
                autoFocus
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground">{t('common.label')}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={`${panelInputClass} w-full`}
              placeholder="Ex: N° SAP Material"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => { setShowForm(false); setCode(''); setLabel('') }} className="gl-button-sm gl-button-default">Annuler</button>
            <button onClick={handleCreate} disabled={!code.trim() || createRef.isPending} className="gl-button-sm gl-button-confirm">
              {createRef.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Ajouter'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
