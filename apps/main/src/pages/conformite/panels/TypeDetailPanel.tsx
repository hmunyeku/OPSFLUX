import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Trash2, Loader2, Info, Paperclip, Building2, Plus, X } from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import {
  DynamicPanelShell,
  FormSection,
  InlineEditableRow,
  InlineEditableSelect,
  ReadOnlyRow,
  PanelContentLayout,
  DetailFieldGrid,
  panelInputClass,
} from '@/components/layout/DynamicPanel'
import { cn } from '@/lib/utils'
import type { ActionItem } from '@/components/layout/DynamicPanel'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { useUIStore } from '@/stores/uiStore'
import { useToast } from '@/components/ui/Toast'
import { normalizeNames } from '@/lib/normalize'
import {
  useComplianceTypes, useUpdateComplianceType, useDeleteComplianceType,
  useAuthorizationCenters, useTypeAuthorizedCenters, useAddTypeAuthorizedCenter,
  useUpdateTypeAuthorizedCenter, useRemoveTypeAuthorizedCenter,
} from '@/hooks/useConformite'
import { useConformiteDictionaryState } from '../shared'

export function TypeDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useComplianceTypes({ page: 1, page_size: 100 })
  const ct = data?.items.find((c) => c.id === id)
  const updateType = useUpdateComplianceType()
  const deleteType = useDeleteComplianceType()
  const { toast } = useToast()
  const { categoryLabels } = useConformiteDictionaryState()
  const [detailTab, setDetailTab] = useState<'fiche' | 'emetteurs' | 'documents'>('fiche')
  const [selectedCenterId, setSelectedCenterId] = useState('')
  const [centerNotes, setCenterNotes] = useState('')
  const { data: availableCenters } = useAuthorizationCenters({ page_size: 200 })
  const { data: authorizedCenters } = useTypeAuthorizedCenters(id)
  const addAuthorizedCenter = useAddTypeAuthorizedCenter()
  const updateAuthorizedCenter = useUpdateTypeAuthorizedCenter()
  const removeAuthorizedCenter = useRemoveTypeAuthorizedCenter()

  const handleSave = useCallback((field: string, value: string | boolean | number | null) => {
    updateType.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateType])

  // Coerce the inline-select string value back to bool for the
  // `is_mandatory` field — InlineEditableSelect only emits strings.
  const handleSaveBool = useCallback((field: string, value: string) => {
    updateType.mutate({ id, payload: normalizeNames({ [field]: value === 'true' }) })
  }, [id, updateType])

  // Validity (number of days) — same coercion to int. Null when emptied.
  const handleSaveValidity = useCallback((value: string) => {
    const trimmed = (value || '').trim()
    const n = trimmed === '' ? null : Number(trimmed)
    updateType.mutate({ id, payload: normalizeNames({ validity_days: n }) })
  }, [id, updateType])

  const handleDelete = useCallback(async () => {
    await deleteType.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: t('conformite.toast.type_archived'), variant: 'success' })
  }, [id, deleteType, closeDynamicPanel, toast, t])

  const handleAddCenter = useCallback(async () => {
    if (!selectedCenterId) return
    await addAuthorizedCenter.mutateAsync({
      typeId: id,
      payload: { tier_id: selectedCenterId, notes: centerNotes.trim() || null },
    })
    setSelectedCenterId('')
    setCenterNotes('')
    toast({ title: 'Centre habilité associé', variant: 'success' })
  }, [addAuthorizedCenter, centerNotes, id, selectedCenterId, toast])

  const actionItems = useMemo<ActionItem[]>(() => [
    {
      id: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      variant: 'danger',
      priority: 20,
      onClick: handleDelete,
    },
  ], [t, handleDelete])

  if (!ct) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ShieldCheck size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={ct.code}
      subtitle={ct.name}
      icon={<ShieldCheck size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <TabBar
        items={[
          { id: 'fiche', label: 'Informations', icon: Info },
          { id: 'emetteurs', label: 'Émetteurs', icon: Building2, badge: authorizedCenters?.filter((c) => c.active).length || undefined },
          { id: 'documents', label: 'Documents', icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      {detailTab === 'fiche' && (
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <DetailFieldGrid>
              <ReadOnlyRow label="Catégorie" value={<span className="chip chip-info">{categoryLabels[ct.category] ?? ct.category}</span>} />
              <ReadOnlyRow label={t('common.code_field')} value={<span className="text-sm font-mono font-medium text-foreground">{ct.code || '—'}</span>} />
              <InlineEditableRow label="Nom" value={ct.name} onSave={(v) => handleSave('name', v)} />
              {/* SUP-0025 fix: Validité et Obligatoire étaient en lecture seule.
                  Ces champs sont métier-importants — un référentiel mal configuré
                  bloque toute la chaîne de conformité — donc rendre éditable
                  in-place via InlineEditableRow / InlineEditableSelect. */}
              <InlineEditableRow
                label="Validité (jours)"
                value={ct.validity_days != null ? String(ct.validity_days) : ''}
                displayValue={ct.validity_days ? `${ct.validity_days} jours` : 'Permanent'}
                onSave={handleSaveValidity}
              />
              <InlineEditableSelect
                label="Obligatoire"
                value={ct.is_mandatory ? 'true' : 'false'}
                displayValue={ct.is_mandatory ? 'Oui' : 'Non'}
                options={[
                  { value: 'true', label: 'Oui' },
                  { value: 'false', label: 'Non' },
                ]}
                onSave={(v) => handleSaveBool('is_mandatory', v)}
              />
            </DetailFieldGrid>
          </FormSection>
          <FormSection title={t('common.description')}>
            {/* Full-width — FormSection labels this block already,
                the inner label row was cramping multiline content. */}
            <textarea
              defaultValue={ct.description || ''}
              onBlur={(e) => {
                const next = e.target.value.trim()
                if (next !== (ct.description || '').trim()) {
                  handleSave('description', next)
                }
              }}
              rows={5}
              className={cn(panelInputClass, 'w-full min-h-[120px] text-sm leading-relaxed whitespace-pre-wrap')}
              placeholder={t('common.description') as string}
            />
          </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'documents' && (
        <PanelContentLayout>
          <FormSection title={t('common.attachments')}>
            <AttachmentManager ownerType="compliance_type" ownerId={ct.id} compact />
          </FormSection>
        </PanelContentLayout>
      )}
      {detailTab === 'emetteurs' && (
        <PanelContentLayout>
          <FormSection title="Centres habilités">
            <div className="@container space-y-3">
              <div className="grid grid-cols-1 gap-2 @[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <select
                  value={selectedCenterId}
                  onChange={(e) => setSelectedCenterId(e.target.value)}
                  className={panelInputClass}
                >
                  <option value="">Sélectionner un tiers centre d'habilitation...</option>
                  {(availableCenters?.items ?? []).map((center) => (
                    <option key={center.id} value={center.id}>
                      {center.name}{center.authorization_center_code ? ` · ${center.authorization_center_code}` : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={centerNotes}
                  onChange={(e) => setCenterNotes(e.target.value)}
                  className={panelInputClass}
                  placeholder="Condition, portée ou remarque..."
                />
                <button
                  type="button"
                  onClick={handleAddCenter}
                  disabled={!selectedCenterId || addAuthorizedCenter.isPending}
                  className="btn btn-primary btn-sm"
                >
                  {addAuthorizedCenter.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Ajouter
                </button>
              </div>

              {authorizedCenters?.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                  {authorizedCenters.map((center) => (
                    <div key={center.id} className={cn('grid gap-2 px-3 py-2 text-xs @[640px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] @[640px]:items-center', !center.active && 'opacity-60')}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-muted-foreground shrink-0" />
                          <span className="truncate font-medium text-foreground">{center.tier_name}</span>
                          {!center.active && <span className="chip text-[10px]">Inactif</span>}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {center.tier_code || '—'}{center.authorization_center_code ? ` · ${center.authorization_center_code}` : ''}
                        </div>
                      </div>
                      <div className="min-w-0 text-[11px] text-muted-foreground">
                        <div className="truncate">{center.notes || 'Aucune condition spécifique'}</div>
                        {center.certificate_verification_url && (
                          <div className="truncate text-primary">{center.certificate_verification_url}</div>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        {!center.active && (
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            title="Réactiver"
                            onClick={() => updateAuthorizedCenter.mutate({ typeId: id, linkId: center.id, payload: { active: true } })}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title="Retirer"
                          onClick={() => removeAuthorizedCenter.mutate({ typeId: id, linkId: center.id })}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aucun centre habilité configuré. Le champ émetteur restera en saisie libre pour ce référentiel.
                </p>
              )}
            </div>
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}

