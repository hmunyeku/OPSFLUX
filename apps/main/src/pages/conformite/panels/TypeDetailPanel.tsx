import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Trash2, Loader2, Info, Paperclip, Building2, Plus, X, CalendarDays } from 'lucide-react'
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
  const [centerStart, setCenterStart] = useState('')
  const [centerEnd, setCenterEnd] = useState('')
  const [expandedCenterId, setExpandedCenterId] = useState<string | null>(null)
  // Issuer creation form is collapsed by default — the previous layout kept all
  // 5 fields permanently visible above the list which made the empty state look
  // like a half-filled form and pushed the primary "+ Ajouter" action to the
  // bottom-right of the grid, far from the section heading.
  const [showAddCenterForm, setShowAddCenterForm] = useState(false)
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
      payload: {
        tier_id: selectedCenterId,
        accreditation_starts_at: centerStart || null,
        accreditation_ends_at: centerEnd || null,
        notes: centerNotes.trim() || null,
      },
    })
    setSelectedCenterId('')
    setCenterNotes('')
    setCenterStart('')
    setCenterEnd('')
    setShowAddCenterForm(false) // Collapse the form back after a successful add.
    toast({ title: t('conformite.types_panel.center_added'), variant: 'success' })
  }, [addAuthorizedCenter, centerEnd, centerNotes, centerStart, id, selectedCenterId, toast, t])

  const cancelAddCenter = useCallback(() => {
    setSelectedCenterId('')
    setCenterNotes('')
    setCenterStart('')
    setCenterEnd('')
    setShowAddCenterForm(false)
  }, [])

  const formatAccreditationPeriod = useCallback((start?: string | null, end?: string | null) => {
    if (!start && !end) return t('conformite.types_panel.accreditation_period_missing')
    if (start && end) return t('conformite.types_panel.accreditation_period_range', { start, end })
    if (start) return t('conformite.types_panel.accreditation_period_from', { start })
    return t('conformite.types_panel.accreditation_period_until', { end })
  }, [t])

  const isCenterAccreditationCurrent = useCallback((start?: string | null, end?: string | null) => {
    const today = new Date().toISOString().slice(0, 10)
    return (!start || start <= today) && (!end || end >= today)
  }, [])

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
          { id: 'fiche', label: t('conformite.types_panel.tabs.information'), icon: Info },
          { id: 'emetteurs', label: t('conformite.types_panel.tabs.issuers'), icon: Building2, badge: authorizedCenters?.filter((c) => c.active).length || undefined },
          { id: 'documents', label: t('conformite.types_panel.tabs.documents'), icon: Paperclip },
        ]}
        activeId={detailTab}
        onTabChange={(id) => setDetailTab(id as typeof detailTab)}
      />
      {detailTab === 'fiche' && (
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <DetailFieldGrid>
              <ReadOnlyRow label={t('conformite.types_panel.fields.category')} value={<span className="chip chip-info">{categoryLabels[ct.category] ?? ct.category}</span>} />
              <ReadOnlyRow label={t('common.code_field')} value={<span className="text-sm font-mono font-medium text-foreground">{ct.code || '—'}</span>} />
              <InlineEditableRow label={t('conformite.types_panel.fields.name')} value={ct.name} onSave={(v) => handleSave('name', v)} />
              {/* SUP-0025 fix: Validité et Obligatoire étaient en lecture seule.
                  Ces champs sont métier-importants — un référentiel mal configuré
                  bloque toute la chaîne de conformité — donc rendre éditable
                  in-place via InlineEditableRow / InlineEditableSelect. */}
              <InlineEditableRow
                label={t('conformite.types_panel.fields.validity_days')}
                value={ct.validity_days != null ? String(ct.validity_days) : ''}
                displayValue={ct.validity_days ? t('conformite.types_panel.validity_days_value', { count: ct.validity_days }) : t('conformite.types_panel.permanent')}
                onSave={handleSaveValidity}
              />
              <InlineEditableSelect
                label={t('conformite.types_panel.fields.mandatory')}
                value={ct.is_mandatory ? 'true' : 'false'}
                displayValue={ct.is_mandatory ? t('common.yes') : t('common.no')}
                options={[
                  { value: 'true', label: t('common.yes') },
                  { value: 'false', label: t('common.no') },
                ]}
                onSave={(v) => handleSaveBool('is_mandatory', v)}
              />
            </DetailFieldGrid>
          </FormSection>
          {/* Source & vérification externe — édition inline du raccordement au provider externe (RiseUp, etc.). */}
          <FormSection title="Source & vérification externe">
            <DetailFieldGrid>
              <InlineEditableSelect
                label="Source"
                value={ct.compliance_source || 'opsflux'}
                displayValue={
                  ct.compliance_source === 'external'
                    ? 'Externe (provider tiers)'
                    : ct.compliance_source === 'both'
                    ? 'Mixte (interne + externe)'
                    : 'OpsFlux (interne)'
                }
                options={[
                  { value: 'opsflux', label: 'OpsFlux (interne)' },
                  { value: 'external', label: 'Externe (provider tiers)' },
                  { value: 'both', label: 'Mixte (interne + externe)' },
                ]}
                onSave={(v) => {
                  // When going back to internal-only, drop the external provider/mapping to stay coherent.
                  if (v === 'opsflux') {
                    updateType.mutate({ id, payload: { compliance_source: 'opsflux', external_provider: null, external_mapping: null } })
                  } else {
                    handleSave('compliance_source', v)
                  }
                }}
              />
              {ct.compliance_source !== 'opsflux' && (
                <InlineEditableSelect
                  label="Provider externe"
                  value={ct.external_provider || ''}
                  displayValue={ct.external_provider === 'riseup' ? 'RiseUp (LMS)' : '—'}
                  options={[
                    { value: 'riseup', label: 'RiseUp (LMS)' },
                  ]}
                  onSave={(v) => handleSave('external_provider', v || null)}
                />
              )}
              {ct.compliance_source !== 'opsflux' && ct.external_provider === 'riseup' && (
                <InlineEditableRow
                  label="Mapping RiseUp (cert id)"
                  value={ct.external_mapping?.riseup_cert_id ?? ''}
                  displayValue={
                    ct.external_mapping?.riseup_cert_id
                      ? `riseup_cert_id = ${ct.external_mapping.riseup_cert_id}`
                      : '— non mappé'
                  }
                  onSave={(v) => {
                    const next = (v || '').trim()
                    updateType.mutate({
                      id,
                      payload: { external_mapping: next ? { riseup_cert_id: next } : null },
                    })
                  }}
                />
              )}
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
          <FormSection
            title={t('conformite.types_panel.centers_title')}
            /* `headerExtra` is the canonical FormSection slot for right-aligned
               header actions — using it keeps spacing/typography consistent with
               other sections (vs an ad-hoc div above the section). */
            headerExtra={
              !showAddCenterForm ? (
                <button
                  type="button"
                  onClick={() => setShowAddCenterForm(true)}
                  className="btn btn-primary btn-sm"
                >
                  <Plus size={12} />
                  {t('conformite.types_panel.add_center') || t('common.add')}
                </button>
              ) : undefined
            }
          >
            <div className="@container space-y-3">
              {/* Collapsible add-center form — hidden by default to keep the section header clean.
                  Replaces the always-visible 5-field grid that pushed the primary action to the bottom. */}
              {showAddCenterForm && (
                <div className="rounded-md border border-border bg-background-subtle p-3 space-y-2">
                  <div className="grid grid-cols-1 gap-2 @[760px]:grid-cols-[minmax(0,1.2fr)_minmax(120px,.6fr)_minmax(120px,.6fr)_minmax(0,1fr)]">
                    <select
                      value={selectedCenterId}
                      onChange={(e) => setSelectedCenterId(e.target.value)}
                      className={panelInputClass}
                      autoFocus
                    >
                      <option value="">{t('conformite.types_panel.select_center_placeholder')}</option>
                      {(availableCenters?.items ?? []).map((center) => (
                        <option key={center.id} value={center.id}>
                          {center.name}{center.authorization_center_code ? ` · ${center.authorization_center_code}` : ''}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={centerStart}
                      onChange={(e) => setCenterStart(e.target.value)}
                      className={panelInputClass}
                      aria-label={t('conformite.types_panel.accreditation_starts_at')}
                    />
                    <input
                      type="date"
                      value={centerEnd}
                      onChange={(e) => setCenterEnd(e.target.value)}
                      className={panelInputClass}
                      aria-label={t('conformite.types_panel.accreditation_ends_at')}
                    />
                    <input
                      value={centerNotes}
                      onChange={(e) => setCenterNotes(e.target.value)}
                      className={panelInputClass}
                      placeholder={t('conformite.types_panel.center_notes_placeholder')}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={cancelAddCenter} className="btn btn-ghost btn-sm">
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCenter}
                      disabled={!selectedCenterId || addAuthorizedCenter.isPending}
                      className="btn btn-primary btn-sm"
                    >
                      {addAuthorizedCenter.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      {t('conformite.types_panel.confirm_add_center') || t('common.confirm') || t('common.add')}
                    </button>
                  </div>
                </div>
              )}

              {authorizedCenters?.length ? (
                <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                  {authorizedCenters.map((center) => (
                    <div key={center.id} className={cn('space-y-2 px-3 py-2 text-xs', !center.active && 'opacity-60')}>
                      <div className="grid gap-2 @[760px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] @[760px]:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-muted-foreground shrink-0" />
                          <span className="truncate font-medium text-foreground">{center.tier_name}</span>
                          {!center.active && <span className="chip text-[10px]">{t('conformite.types_panel.inactive')}</span>}
                          {center.active && !isCenterAccreditationCurrent(center.accreditation_starts_at, center.accreditation_ends_at) && (
                              <span className="chip chip-danger text-[10px]">{t('conformite.types_panel.accreditation_not_current')}</span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {center.tier_code || '—'}{center.authorization_center_code ? ` · ${center.authorization_center_code}` : ''}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                          <CalendarDays size={11} />
                          {t('conformite.types_panel.accreditation_period')}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <input
                            type="date"
                            value={center.accreditation_starts_at || ''}
                            onChange={(e) => updateAuthorizedCenter.mutate({ typeId: id, linkId: center.id, payload: { accreditation_starts_at: e.target.value || null } })}
                            className={cn(panelInputClass, 'h-8 text-[11px]')}
                            aria-label={t('conformite.types_panel.accreditation_starts_at')}
                          />
                          <input
                            type="date"
                            value={center.accreditation_ends_at || ''}
                            onChange={(e) => updateAuthorizedCenter.mutate({ typeId: id, linkId: center.id, payload: { accreditation_ends_at: e.target.value || null } })}
                            className={cn(panelInputClass, 'h-8 text-[11px]')}
                            aria-label={t('conformite.types_panel.accreditation_ends_at')}
                          />
                        </div>
                      </div>
                      <div className="min-w-0 text-[11px] text-muted-foreground">
                        <div className="truncate">{center.notes || t('conformite.types_panel.no_specific_condition')}</div>
                        <div className="truncate">{formatAccreditationPeriod(center.accreditation_starts_at, center.accreditation_ends_at)}</div>
                        {center.certificate_verification_url && (
                          <div className="truncate text-primary">{center.certificate_verification_url}</div>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className={cn('p-1 rounded hover:bg-muted text-muted-foreground', expandedCenterId === center.id && 'text-primary bg-primary/10')}
                          title={t('conformite.types_panel.accreditation_proofs')}
                          onClick={() => setExpandedCenterId(expandedCenterId === center.id ? null : center.id)}
                        >
                          <Paperclip size={12} />
                        </button>
                        {!center.active && (
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                            title={t('conformite.types_panel.reactivate')}
                            onClick={() => updateAuthorizedCenter.mutate({ typeId: id, linkId: center.id, payload: { active: true } })}
                          >
                            <Plus size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                          title={t('conformite.types_panel.remove')}
                          onClick={() => removeAuthorizedCenter.mutate({ typeId: id, linkId: center.id })}
                        >
                          <X size={12} />
                        </button>
                      </div>
                      </div>
                      {expandedCenterId === center.id && (
                        <div className="rounded-md border border-dashed border-border bg-muted/20 p-2">
                          <AttachmentManager ownerType="compliance_authorized_center" ownerId={center.id} compact />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('conformite.types_panel.no_centers')}
                </p>
              )}
            </div>
          </FormSection>
        </PanelContentLayout>
      )}
    </DynamicPanelShell>
  )
}

