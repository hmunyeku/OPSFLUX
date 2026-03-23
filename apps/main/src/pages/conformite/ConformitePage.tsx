/**
 * Conformite (Compliance) page — referentiel + enregistrements + exemptions.
 *
 * Onglets: Referentiel | Enregistrements | Exemptions | Fiches de poste | Regles | Transferts
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Plus, Loader2, Trash2, FileCheck, ClipboardList,
  Briefcase, GitBranch, Scale, ShieldOff, Check, X, ClipboardCheck, Search, Grid3X3, List,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import type { DataTablePagination, DataTableFilterDef } from '@/components/ui/DataTable/types'
import { cn } from '@/lib/utils'
import { normalizeNames } from '@/lib/normalize'
import { useDebounce } from '@/hooks/useDebounce'
import { usePageSize } from '@/hooks/usePageSize'
import { PanelHeader, PanelContent, ToolbarButton } from '@/components/layout/PanelHeader'
import {
  DynamicPanelShell,
  DynamicPanelField,
  FormGrid,
  FormSection,
  SectionColumns,
  InlineEditableRow,
  ReadOnlyRow,
  PanelActionButton,
  DangerConfirmButton,
  TagSelector,
  panelInputClass,
  PanelContentLayout,
  DetailFieldGrid,
} from '@/components/layout/DynamicPanel'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useToast } from '@/components/ui/Toast'
import {
  useComplianceTypes, useCreateComplianceType, useUpdateComplianceType, useDeleteComplianceType,
  useComplianceRecords,
  useComplianceRules, useCreateComplianceRule, useUpdateComplianceRule, useDeleteComplianceRule,
  useJobPositions, useCreateJobPosition, useUpdateJobPosition, useDeleteJobPosition,
  useTransfers,
  useExemptions, useCreateExemption, useApproveExemption, useRejectExemption, useDeleteExemption,
  usePendingVerifications, useVerifyRecord,
} from '@/hooks/useConformite'
import type {
  ComplianceType, ComplianceTypeCreate,
  ComplianceRecord,
  ComplianceRule, ComplianceRuleCreate,
  ComplianceExemption, ComplianceExemptionCreate,
  JobPosition, JobPositionCreate,
  TierContactTransfer,
} from '@/types/api'

// -- Constants ----------------------------------------------------------------

const FALLBACK_CATEGORY_OPTIONS = [
  { value: 'formation', label: 'Formation' },
  { value: 'certification', label: 'Certification' },
  { value: 'habilitation', label: 'Habilitation' },
  { value: 'audit', label: 'Audit' },
  { value: 'medical', label: 'Médical' },
  { value: 'epi', label: 'EPI' },
]

const STATUS_OPTIONS = [
  { value: 'valid', label: 'Valide' },
  { value: 'expired', label: 'Expire' },
  { value: 'pending', label: 'En attente' },
  { value: 'rejected', label: 'Rejete' },
]

const EXEMPTION_STATUS_OPTIONS = [
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuve' },
  { value: 'rejected', label: 'Rejete' },
  { value: 'expired', label: 'Expire' },
]

const RULE_TARGET_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'tier_type', label: 'Type de tiers' },
  { value: 'asset', label: 'Asset' },
  { value: 'department', label: 'Departement' },
  { value: 'job_position', label: 'Fiche de poste' },
]

type ConformiteTab = 'referentiel' | 'enregistrements' | 'verifications' | 'exemptions' | 'fiches' | 'regles' | 'transferts'

const TABS: { id: ConformiteTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'referentiel', label: 'Référentiel', icon: ClipboardList },
  { id: 'enregistrements', label: 'Enregistrements', icon: FileCheck },
  { id: 'verifications', label: 'Vérifications', icon: ClipboardCheck },
  { id: 'exemptions', label: 'Exemptions', icon: ShieldOff },
  { id: 'fiches', label: 'Fiches de poste', icon: Briefcase },
  { id: 'regles', label: 'Règles', icon: Scale },
  { id: 'transferts', label: 'Transferts', icon: GitBranch },
]

// -- Create Type Panel --------------------------------------------------------

function CreateTypePanel() {
  const { t } = useTranslation()
  const createType = useCreateComplianceType()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const dictCats = useDictionaryOptions('compliance_category')
  const CATEGORY_OPTIONS = dictCats.length > 0 ? dictCats : FALLBACK_CATEGORY_OPTIONS
  const [form, setForm] = useState<ComplianceTypeCreate>({
    category: 'formation',
    name: '',
    description: null,
    validity_days: null,
    is_mandatory: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createType.mutateAsync(normalizeNames(form))
      closeDynamicPanel()
      toast({ title: 'Type de conformite cree', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouveau type"
      subtitle="Conformite"
      icon={<ShieldCheck size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createType.isPending}
            onClick={() => (document.getElementById('create-ct-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createType.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-ct-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Categorie">
            <TagSelector
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
          </FormSection>

          <SectionColumns>
            {/* Column 1: Informations */}
            <div className="@container space-y-5">
              <FormSection title="Informations">
                <FormGrid>
                  <DynamicPanelField label="Code">
                    <span className="text-sm font-mono text-muted-foreground italic">Auto-genere a la creation</span>
                  </DynamicPanelField>
                  <DynamicPanelField label="Nom" required>
                    <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Formation HSE Niveau 1" />
                  </DynamicPanelField>
                  <DynamicPanelField label="Validite (jours)">
                    <input type="number" value={form.validity_days ?? ''} onChange={(e) => setForm({ ...form, validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="365 (vide = permanent)" />
                  </DynamicPanelField>
                </FormGrid>
              </FormSection>
            </div>

            {/* Column 2: Description + Options */}
            <div className="@container space-y-5">
              <FormSection title="Description">
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Description du type de conformite..."
                  rows={3}
                />
              </FormSection>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_mandatory} onChange={(e) => setForm({ ...form, is_mandatory: e.target.checked })} className="rounded border-border" />
                Obligatoire par defaut
              </label>
            </div>
          </SectionColumns>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Type Detail Panel --------------------------------------------------------

function TypeDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useComplianceTypes({ page: 1, page_size: 100 })
  const ct = data?.items.find((c) => c.id === id)
  const updateType = useUpdateComplianceType()
  const deleteType = useDeleteComplianceType()
  const { toast } = useToast()
  const dictCats = useDictionaryOptions('compliance_category')
  const CATEGORY_OPTIONS = dictCats.length > 0 ? dictCats : FALLBACK_CATEGORY_OPTIONS

  const handleSave = useCallback((field: string, value: string) => {
    updateType.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateType])

  const handleDelete = useCallback(async () => {
    await deleteType.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Type archive', variant: 'success' })
  }, [id, deleteType, closeDynamicPanel, toast])

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
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Categorie" value={<span className="gl-badge gl-badge-info">{CATEGORY_OPTIONS.find(o => o.value === ct.category)?.label ?? ct.category}</span>} />
            <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{ct.code || '—'}</span>} />
            <InlineEditableRow label="Nom" value={ct.name} onSave={(v) => handleSave('name', v)} />
            <ReadOnlyRow label="Validite" value={ct.validity_days ? `${ct.validity_days} jours` : 'Permanent'} />
            <ReadOnlyRow label="Obligatoire" value={ct.is_mandatory ? 'Oui' : 'Non'} />
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false}>
          <InlineEditableRow label="Description" value={ct.description || ''} onSave={(v) => handleSave('description', v)} />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Create Exemption Panel ---------------------------------------------------

function CreateExemptionPanel() {
  const { t } = useTranslation()
  const createExemption = useCreateExemption()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()

  // Load compliance records for the select dropdown
  const { data: recordsData } = useComplianceRecords({ page: 1, page_size: 200 })

  const [form, setForm] = useState<ComplianceExemptionCreate>({
    compliance_record_id: '',
    reason: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    conditions: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.compliance_record_id) {
      toast({ title: 'Selectionnez un enregistrement de conformite', variant: 'error' })
      return
    }
    try {
      await createExemption.mutateAsync(form)
      closeDynamicPanel()
      toast({ title: 'Exemption creee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur lors de la creation', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouvelle exemption"
      subtitle="Derogation de conformite"
      icon={<ShieldOff size={14} className="text-amber-500" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createExemption.isPending}
            onClick={() => (document.getElementById('create-exemption-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createExemption.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-exemption-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Enregistrement de conformite">
            <DynamicPanelField label="Enregistrement" required>
              <select
                required
                value={form.compliance_record_id}
                onChange={(e) => setForm({ ...form, compliance_record_id: e.target.value })}
                className={panelInputClass}
              >
                <option value="">-- Selectionnez --</option>
                {recordsData?.items.map((rec) => (
                  <option key={rec.id} value={rec.id}>
                    {rec.type_name || rec.compliance_type_id.slice(0, 8)} - {rec.owner_type} ({rec.status})
                  </option>
                ))}
              </select>
            </DynamicPanelField>
          </FormSection>

          <FormSection title="Motif">
            <DynamicPanelField label="Raison de l'exemption" required>
              <textarea
                required
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className={`${panelInputClass} min-h-[80px] resize-y`}
                placeholder="Certification expiree mais mission critique en cours..."
                rows={3}
              />
            </DynamicPanelField>
          </FormSection>

          <FormSection title="Periode">
            <DateRangePicker
              startDate={form.start_date || null}
              endDate={form.end_date || null}
              onStartChange={(v) => setForm({ ...form, start_date: v })}
              onEndChange={(v) => setForm({ ...form, end_date: v })}
              required
            />
          </FormSection>

          <FormSection title="Conditions">
            <textarea
              value={form.conditions ?? ''}
              onChange={(e) => setForm({ ...form, conditions: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Conditions sous lesquelles l'exemption est valide (optionnel)..."
              rows={2}
            />
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Exemption Detail Panel ---------------------------------------------------

function ExemptionDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useExemptions({ page: 1, page_size: 200 })
  const exemption = data?.items.find((ex) => ex.id === id)
  const approveExemption = useApproveExemption()
  const rejectExemption = useRejectExemption()
  const deleteExemption = useDeleteExemption()
  const { toast } = useToast()
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  const handleApprove = useCallback(async () => {
    try {
      await approveExemption.mutateAsync(id)
      toast({ title: 'Exemption approuvee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [id, approveExemption, toast])

  const handleReject = useCallback(async () => {
    if (!rejectReason.trim()) {
      toast({ title: 'Veuillez saisir un motif de rejet', variant: 'error' })
      return
    }
    try {
      await rejectExemption.mutateAsync({ id, reason: rejectReason })
      setShowRejectForm(false)
      toast({ title: 'Exemption rejetee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }, [id, rejectReason, rejectExemption, toast])

  const handleDelete = useCallback(async () => {
    await deleteExemption.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Exemption archivee', variant: 'success' })
  }, [id, deleteExemption, closeDynamicPanel, toast])

  if (!exemption) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ShieldOff size={14} className="text-amber-500" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const statusBadge = (() => {
    const s = exemption.status
    const cls = s === 'approved' ? 'gl-badge-success' : s === 'rejected' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
    const label = EXEMPTION_STATUS_OPTIONS.find(o => o.value === s)?.label ?? s
    return <span className={cn('gl-badge', cls)}>{label}</span>
  })()

  return (
    <DynamicPanelShell
      title="Exemption"
      subtitle={exemption.record_type_name || 'Detail'}
      icon={<ShieldOff size={14} className="text-amber-500" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Statut" value={statusBadge} />
            <ReadOnlyRow label="Type de conformite" value={exemption.record_type_name || '--'} />
            <ReadOnlyRow label="Categorie" value={exemption.record_type_category ? <span className="gl-badge gl-badge-neutral">{exemption.record_type_category}</span> : '--'} />
            <ReadOnlyRow label="Proprietaire" value={exemption.owner_name || '--'} />
            <ReadOnlyRow label="Date de debut" value={new Date(exemption.start_date).toLocaleDateString('fr-FR')} />
            <ReadOnlyRow label="Date de fin" value={new Date(exemption.end_date).toLocaleDateString('fr-FR')} />
            <ReadOnlyRow label="Approuve par" value={exemption.approver_name || '--'} />
            <ReadOnlyRow label="Cree par" value={exemption.creator_name || '--'} />
            <ReadOnlyRow label="Cree le" value={new Date(exemption.created_at).toLocaleDateString('fr-FR')} />
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Motif" collapsible defaultExpanded>
          <p className="text-sm text-foreground whitespace-pre-wrap">{exemption.reason}</p>
        </FormSection>

        {exemption.conditions && (
          <FormSection title="Conditions" collapsible defaultExpanded>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{exemption.conditions}</p>
          </FormSection>
        )}

        {exemption.rejection_reason && (
          <FormSection title="Motif du rejet" collapsible defaultExpanded>
            <p className="text-sm text-red-600 whitespace-pre-wrap">{exemption.rejection_reason}</p>
          </FormSection>
        )}

        {exemption.status === 'pending' && (
          <FormSection title="Actions" collapsible defaultExpanded>
            <div className="flex gap-2">
              <PanelActionButton
                variant="primary"
                onClick={handleApprove}
                disabled={approveExemption.isPending}
              >
                {approveExemption.isPending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                <span className="ml-1">Approuver</span>
              </PanelActionButton>
              <PanelActionButton
                onClick={() => setShowRejectForm(!showRejectForm)}
              >
                <X size={12} />
                <span className="ml-1">Rejeter</span>
              </PanelActionButton>
            </div>
            {showRejectForm && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className={`${panelInputClass} min-h-[60px] resize-y`}
                  placeholder="Motif du rejet..."
                  rows={2}
                />
                <PanelActionButton
                  onClick={handleReject}
                  disabled={rejectExemption.isPending || !rejectReason.trim()}
                >
                  {rejectExemption.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer le rejet'}
                </PanelActionButton>
              </div>
            )}
          </FormSection>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Create Job Position Panel ------------------------------------------------

function CreateJobPositionPanel() {
  const { t } = useTranslation()
  const createJP = useCreateJobPosition()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const [form, setForm] = useState<JobPositionCreate>({
    name: '',
    description: null,
    department: null,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createJP.mutateAsync(normalizeNames(form))
      closeDynamicPanel()
      toast({ title: 'Fiche de poste creee', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouvelle fiche de poste"
      subtitle="Conformite HSE"
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createJP.isPending}
            onClick={() => (document.getElementById('create-jp-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createJP.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-jp-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title="Informations">
            <FormGrid>
              <DynamicPanelField label="Code">
                <span className="text-sm font-mono text-muted-foreground italic">Auto-genere a la creation</span>
              </DynamicPanelField>
              <DynamicPanelField label="Intitule du poste" required>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={panelInputClass} placeholder="Operateur de production" />
              </DynamicPanelField>
              <DynamicPanelField label="Departement">
                <input type="text" value={form.department ?? ''} onChange={(e) => setForm({ ...form, department: e.target.value || null })} className={panelInputClass} placeholder="Production, HSE, Maintenance..." />
              </DynamicPanelField>
            </FormGrid>
          </FormSection>

          <FormSection title="Description">
            <textarea
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value || null })}
              className={`${panelInputClass} min-h-[60px] resize-y`}
              placeholder="Description du poste et exigences HSE..."
              rows={3}
            />
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

// -- Job Position Detail Panel ------------------------------------------------

function JobPositionDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = useJobPositions({ page: 1, page_size: 100 })
  const jp = data?.items.find((j) => j.id === id)
  const updateJP = useUpdateJobPosition()
  const deleteJP = useDeleteJobPosition()
  const { toast } = useToast()

  // Rules linked to this job position
  const { data: allRules } = useComplianceRules(undefined)

  const handleSave = useCallback((field: string, value: string) => {
    updateJP.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateJP])

  const handleDelete = useCallback(async () => {
    await deleteJP.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Fiche de poste archivee', variant: 'success' })
  }, [id, deleteJP, closeDynamicPanel, toast])

  if (!jp) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Briefcase size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  const linkedRules = allRules?.filter(r => r.target_type === 'job_position' && r.target_value === jp.code) ?? []

  return (
    <DynamicPanelShell
      title={jp.code}
      subtitle={jp.name}
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
          {t('common.delete')}
        </DangerConfirmButton>
      }
    >
      <PanelContentLayout>
        <FormSection title="Informations" collapsible defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{jp.code || '—'}</span>} />
            <InlineEditableRow label="Intitule" value={jp.name} onSave={(v) => handleSave('name', v)} />
            <InlineEditableRow label="Departement" value={jp.department || ''} onSave={(v) => handleSave('department', v)} />
          </DetailFieldGrid>
        </FormSection>

        <FormSection title="Description" collapsible defaultExpanded={false}>
          <InlineEditableRow label="Description" value={jp.description || ''} onSave={(v) => handleSave('description', v)} />
        </FormSection>

        <FormSection title={`Exigences de conformite (${linkedRules.length})`} collapsible defaultExpanded>
          {linkedRules.length > 0 ? (
            <div className="space-y-1">
              {linkedRules.map(r => (
                <div key={r.id} className="flex items-center gap-2 text-xs py-1 px-2 bg-muted/30 rounded">
                  <Scale size={10} className="text-muted-foreground" />
                  <span className="flex-1">{r.description || r.compliance_type_id}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune regle de conformite liee a ce poste. Ajoutez des regles dans l&apos;onglet Regles.</p>
          )}
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

export function ConformitePage() {
  useTranslation() // loaded for future i18n
  const [activeTab, setActiveTab] = useState<ConformiteTab>('referentiel')
  const [page, setPage] = useState(1)
  const { pageSize, setPageSize } = usePageSize()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>({})

  // Dictionary-driven category options (with fallback)
  const dictCategoryOptions = useDictionaryOptions('compliance_category')
  const CATEGORY_OPTIONS = dictCategoryOptions.length > 0 ? dictCategoryOptions : FALLBACK_CATEGORY_OPTIONS

  const { hasPermission } = usePermission()
  const canImport = hasPermission('conformite.import')
  const canExport = hasPermission('conformite.export') || hasPermission('conformite.record.read')
  // Granular permission checks for toolbar buttons, tab visibility, inline actions
  const canCreateType = hasPermission('conformite.type.create')
  const canCreateRule = hasPermission('conformite.rule.create')
  const canDeleteRule = hasPermission('conformite.rule.delete')
  const canCreateJP = hasPermission('conformite.jobposition.create')
  const canCreateExemption = hasPermission('conformite.exemption.create')
  const canApproveExemption = hasPermission('conformite.exemption.approve')
  const canVerify = hasPermission('conformite.verify')

  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const panelMode = useUIStore((s) => s.dynamicPanelMode)
  const setNavItems = useUIStore((s) => s.setDynamicPanelNavItems)

  useEffect(() => { setPage(1) }, [debouncedSearch, activeFilters, activeTab])

  const handleTabChange = useCallback((tab: ConformiteTab) => {
    setActiveTab(tab)
    setSearch('')
    setActiveFilters({})
    setPage(1)
  }, [])

  // Data
  const categoryFilter = typeof activeFilters.category === 'string' ? activeFilters.category : undefined
  const statusFilter = typeof activeFilters.status === 'string' ? activeFilters.status : undefined
  const departmentFilter = typeof activeFilters.department === 'string' ? activeFilters.department : undefined

  const { data: typesData, isLoading: typesLoading } = useComplianceTypes({
    page: activeTab === 'referentiel' ? page : 1,
    page_size: activeTab === 'referentiel' ? pageSize : (activeTab === 'regles' ? 200 : 1),
    category: activeTab === 'referentiel' ? categoryFilter : undefined,
    search: activeTab === 'referentiel' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: recordsData, isLoading: recordsLoading } = useComplianceRecords({
    page: activeTab === 'enregistrements' ? page : 1,
    page_size: activeTab === 'enregistrements' ? pageSize : 1,
    status: activeTab === 'enregistrements' ? statusFilter : undefined,
    category: activeTab === 'enregistrements' ? categoryFilter : undefined,
    search: activeTab === 'enregistrements' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: exemptionsData, isLoading: exemptionsLoading } = useExemptions({
    page: activeTab === 'exemptions' ? page : 1,
    page_size: activeTab === 'exemptions' ? pageSize : 1,
    status: activeTab === 'exemptions' ? statusFilter : undefined,
    search: activeTab === 'exemptions' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: jpData, isLoading: jpLoading } = useJobPositions({
    page: activeTab === 'fiches' ? page : 1,
    page_size: activeTab === 'fiches' ? pageSize : 1,
    department: activeTab === 'fiches' ? departmentFilter : undefined,
    search: activeTab === 'fiches' ? (debouncedSearch || undefined) : undefined,
  })

  const { data: rulesData, isLoading: rulesLoading } = useComplianceRules(undefined)
  const { data: jobPositionsData } = useJobPositions({ page_size: 200 })

  const { data: transfersData, isLoading: transfersLoading } = useTransfers({
    page: activeTab === 'transferts' ? page : 1,
    page_size: activeTab === 'transferts' ? pageSize : 1,
  })

  const createRule = useCreateComplianceRule()
  const updateRule = useUpdateComplianceRule()
  const deleteRule = useDeleteComplianceRule()

  useEffect(() => {
    if (activeTab === 'referentiel' && typesData?.items) setNavItems(typesData.items.map(i => i.id))
    else if (activeTab === 'enregistrements' && recordsData?.items) setNavItems(recordsData.items.map(i => i.id))
    else if (activeTab === 'exemptions' && exemptionsData?.items) setNavItems(exemptionsData.items.map(i => i.id))
    else if (activeTab === 'fiches' && jpData?.items) setNavItems(jpData.items.map(i => i.id))
    return () => setNavItems([])
  }, [activeTab, typesData?.items, recordsData?.items, exemptionsData?.items, jpData?.items, setNavItems])

  // Filters
  const typeFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Categorie', type: 'select', options: CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const recordFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Categorie', type: 'select', options: CATEGORY_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'status', label: 'Statut', type: 'select', options: STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const exemptionFilters = useMemo<DataTableFilterDef[]>(() => [
    { id: 'status', label: 'Statut', type: 'select', options: EXEMPTION_STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
  ], [])

  const handleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // Columns
  const typeColumns = useMemo<ColumnDef<ComplianceType, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 100, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: 'name', header: 'Nom', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    { accessorKey: 'category', header: 'Categorie', size: 120, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{CATEGORY_OPTIONS.find(o => o.value === row.original.category)?.label ?? row.original.category}</span> },
    { accessorKey: 'validity_days', header: 'Validite', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.validity_days ? `${row.original.validity_days}j` : 'Permanent'}</span> },
    { accessorKey: 'is_mandatory', header: 'Obligatoire', size: 90, cell: ({ row }) => row.original.is_mandatory ? <span className="gl-badge gl-badge-warning">Oui</span> : <span className="text-muted-foreground/40">--</span> },
  ], [])

  const recordColumns = useMemo<ColumnDef<ComplianceRecord, unknown>[]>(() => [
    { accessorKey: 'type_name', header: 'Type', cell: ({ row }) => <span className="text-foreground font-medium">{row.original.type_name || '--'}</span> },
    { accessorKey: 'type_category', header: 'Categorie', size: 110, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{row.original.type_category || '--'}</span> },
    { accessorKey: 'owner_type', header: 'Objet', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.owner_type}</span> },
    { accessorKey: 'status', header: 'Statut', size: 90, cell: ({ row }) => {
      const s = row.original.status
      const cls = s === 'valid' ? 'gl-badge-success' : s === 'expired' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
      return <span className={cn('gl-badge', cls)}>{STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
    }},
    { accessorKey: 'expires_at', header: 'Expiration', size: 110, cell: ({ row }) => row.original.expires_at ? <span className="text-muted-foreground text-xs">{new Date(row.original.expires_at).toLocaleDateString('fr-FR')}</span> : <span className="text-muted-foreground/40">--</span> },
    { accessorKey: 'issuer', header: 'Emetteur', size: 120, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.issuer || '--'}</span> },
  ], [])

  // Exemption columns
  const exemptionColumns = useMemo<ColumnDef<ComplianceExemption, unknown>[]>(() => [
    { accessorKey: 'record_type_name', header: 'Type', cell: ({ row }) => <span className="text-foreground font-medium">{row.original.record_type_name || '--'}</span> },
    { accessorKey: 'owner_name', header: 'Proprietaire', size: 150, cell: ({ row }) => <span className="text-foreground text-xs">{row.original.owner_name || '--'}</span> },
    { accessorKey: 'status', header: 'Statut', size: 100, cell: ({ row }) => {
      const s = row.original.status
      const cls = s === 'approved' ? 'gl-badge-success' : s === 'rejected' ? 'gl-badge-danger' : s === 'pending' ? 'gl-badge-warning' : 'gl-badge-neutral'
      return <span className={cn('gl-badge', cls)}>{EXEMPTION_STATUS_OPTIONS.find(o => o.value === s)?.label ?? s}</span>
    }},
    { accessorKey: 'reason', header: 'Motif', cell: ({ row }) => <span className="text-muted-foreground text-xs truncate max-w-[200px] block">{row.original.reason}</span> },
    { accessorKey: 'start_date', header: 'Debut', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.start_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'end_date', header: 'Fin', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.end_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'approver_name', header: 'Approuve par', size: 130, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.approver_name || '--'}</span> },
    { accessorKey: 'created_at', header: 'Cree le', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span> },
  ], [])

  // Job Position columns
  const jpColumns = useMemo<ColumnDef<JobPosition, unknown>[]>(() => [
    { accessorKey: 'code', header: 'Code', size: 100, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { accessorKey: 'name', header: 'Intitule', cell: ({ row }) => <span className="text-foreground">{row.original.name}</span> },
    { accessorKey: 'department', header: 'Departement', size: 140, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.department || '--'}</span> },
    { accessorKey: 'created_at', header: 'Cree le', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs">{new Date(row.original.created_at).toLocaleDateString('fr-FR')}</span> },
  ], [])

  // Rules columns (flat list -- not paginated)
  const ruleColumns = useMemo<ColumnDef<ComplianceRule, unknown>[]>(() => [
    { accessorKey: 'compliance_type_id', header: 'Type', size: 200, cell: ({ row }) => {
      const ct = typesData?.items.find(t => t.id === row.original.compliance_type_id)
      return <span className="text-foreground font-medium">{ct ? `${ct.code} — ${ct.name}` : row.original.compliance_type_id.slice(0, 8)}</span>
    }},
    { accessorKey: 'target_type', header: 'Cible', size: 130, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{RULE_TARGET_OPTIONS.find(o => o.value === row.original.target_type)?.label ?? row.original.target_type}</span> },
    { accessorKey: 'target_value', header: 'Valeur', size: 200, cell: ({ row }) => {
      const val = row.original.target_value
      if (!val) return <span className="text-muted-foreground text-xs">N/A</span>
      if (row.original.target_type === 'job_position') {
        const jp = jobPositionsData?.items?.find((p: JobPosition) => p.id === val)
        return <span className="text-foreground text-xs">{jp ? `${jp.code} — ${jp.name}` : val.slice(0, 8)}</span>
      }
      return <span className="text-muted-foreground text-xs">{val}</span>
    }},
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.description || '--'}</span> },
    { id: 'actions', header: '', size: 50, cell: ({ row }) => canDeleteRule ? (
      <button onClick={(e) => { e.stopPropagation(); deleteRule.mutate({ id: row.original.id }) }} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 size={12} />
      </button>
    ) : null},
  ], [typesData?.items, jobPositionsData?.items, deleteRule, canDeleteRule])

  // Transfer columns
  const transferColumns = useMemo<ColumnDef<TierContactTransfer, unknown>[]>(() => [
    { accessorKey: 'contact_name', header: 'Employe', cell: ({ row }) => <span className="text-foreground font-medium">{row.original.contact_name || '--'}</span> },
    { accessorKey: 'from_tier_name', header: 'De', size: 180, cell: ({ row }) => row.original.from_tier_id
        ? <CrossModuleLink module="tiers" id={row.original.from_tier_id} label={row.original.from_tier_name || row.original.from_tier_id} showIcon={false} className="text-xs" />
        : <span className="text-muted-foreground text-xs">{row.original.from_tier_name || '--'}</span>,
    },
    { accessorKey: 'to_tier_name', header: 'Vers', size: 180, cell: ({ row }) => row.original.to_tier_id
        ? <CrossModuleLink module="tiers" id={row.original.to_tier_id} label={row.original.to_tier_name || row.original.to_tier_id} showIcon={false} className="text-xs" />
        : <span className="text-foreground text-xs">{row.original.to_tier_name || '--'}</span>,
    },
    { accessorKey: 'transfer_date', header: 'Date', size: 100, cell: ({ row }) => <span className="text-muted-foreground text-xs tabular-nums">{new Date(row.original.transfer_date).toLocaleDateString('fr-FR')}</span> },
    { accessorKey: 'reason', header: 'Motif', cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.reason || '--'}</span> },
  ], [])

  const typesPagination: DataTablePagination | undefined = typesData ? { page: typesData.page, pageSize, total: typesData.total, pages: typesData.pages } : undefined
  const recordsPagination: DataTablePagination | undefined = recordsData ? { page: recordsData.page, pageSize, total: recordsData.total, pages: recordsData.pages } : undefined
  const exemptionsPagination: DataTablePagination | undefined = exemptionsData ? { page: exemptionsData.page, pageSize, total: exemptionsData.total, pages: exemptionsData.pages } : undefined
  const jpPagination: DataTablePagination | undefined = jpData ? { page: jpData.page, pageSize, total: jpData.total, pages: jpData.pages } : undefined
  const transfersPagination: DataTablePagination | undefined = transfersData ? { page: transfersData.page, pageSize, total: transfersData.total, pages: transfersData.pages } : undefined

  const isFullPanel = panelMode === 'full' && dynamicPanel !== null && dynamicPanel.module === 'conformite'

  // Toolbar action button per tab (permission-gated)
  const toolbarAction = useMemo(() => {
    if (activeTab === 'referentiel' && canCreateType) return <ToolbarButton icon={Plus} label="Nouveau type" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite' })} />
    if (activeTab === 'fiches' && canCreateJP) return <ToolbarButton icon={Plus} label="Nouvelle fiche" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'job-position' } })} />
    if (activeTab === 'exemptions' && canCreateExemption) return <ToolbarButton icon={Plus} label="Nouvelle exemption" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'exemption' } })} />
    if (activeTab === 'regles' && canCreateRule) return <ToolbarButton icon={Plus} label="Nouvelle règle" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'rule' } })} />
    return null
  }, [activeTab, openDynamicPanel, canCreateType, canCreateJP, canCreateExemption, canCreateRule])

  // Render active tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'referentiel':
        return (
          <DataTable<ComplianceType>
            columns={typeColumns}
            data={typesData?.items ?? []}
            isLoading={typesLoading}
            pagination={typesPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par code ou nom..."
            filters={typeFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id })}
            emptyIcon={ShieldCheck}
            emptyTitle="Aucun type de conformite"
            columnResizing
            columnVisibility
            storageKey="conformite-types"
          />
        )
      case 'enregistrements':
        return (
          <DataTable<ComplianceRecord>
            columns={recordColumns}
            data={recordsData?.items ?? []}
            isLoading={recordsLoading}
            pagination={recordsPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par type, emetteur..."
            filters={recordFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            importExport={(canExport || canImport) ? {
              exportFormats: canExport ? ['csv', 'xlsx'] : undefined,
              advancedExport: true,
              importWizardTarget: canImport ? 'compliance_record' : undefined,
              filenamePrefix: 'conformite',
            } : undefined}
            emptyIcon={FileCheck}
            emptyTitle="Aucun enregistrement"
            columnResizing
            columnVisibility
            storageKey="conformite-records"
          />
        )
      case 'verifications':
        return <VerificationsTab />
      case 'exemptions':
        return (
          <DataTable<ComplianceExemption>
            columns={exemptionColumns}
            data={exemptionsData?.items ?? []}
            isLoading={exemptionsLoading}
            pagination={exemptionsPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par motif..."
            filters={exemptionFilters}
            activeFilters={activeFilters}
            onFilterChange={handleFilterChange}
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id, meta: { subtype: 'exemption' } })}
            emptyIcon={ShieldOff}
            emptyTitle="Aucune exemption"
            columnResizing
            columnVisibility
            storageKey="conformite-exemptions"
          />
        )
      case 'fiches':
        return (
          <DataTable<JobPosition>
            columns={jpColumns}
            data={jpData?.items ?? []}
            isLoading={jpLoading}
            pagination={jpPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Rechercher par code ou intitule..."
            onRowClick={(row) => openDynamicPanel({ type: 'detail', module: 'conformite', id: row.id, meta: { subtype: 'job-position' } })}
            emptyIcon={Briefcase}
            emptyTitle="Aucune fiche de poste"
            columnResizing
            columnVisibility
            storageKey="conformite-fiches"
          />
        )
      case 'regles':
        return (
          <RulesMatrixView
            rules={rulesData ?? []}
            types={typesData?.items ?? []}
            jobPositions={jobPositionsData?.items ?? []}
            isLoading={rulesLoading}
            onCreateRule={(payload) => createRule.mutate(payload as ComplianceRuleCreate)}
            onDeleteRule={(id) => deleteRule.mutate({ id })}
          />
        )
      case 'transferts':
        return (
          <DataTable<TierContactTransfer>
            columns={transferColumns}
            data={transfersData?.items ?? []}
            isLoading={transfersLoading}
            pagination={transfersPagination}
            onPaginationChange={(p, size) => { if (size !== pageSize) { setPageSize(size); setPage(1) } else setPage(p) }}
            emptyIcon={GitBranch}
            emptyTitle="Aucun transfert d'employe"
            columnResizing
            storageKey="conformite-transferts"
          />
        )
    }
  }

  return (
    <div className="flex h-full">
      {!isFullPanel && <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <PanelHeader icon={ShieldCheck} title="Conformite" subtitle="Formations, certifications, habilitations, audits">
          {toolbarAction}
        </PanelHeader>

        <div className="flex items-center gap-1 px-4 border-b border-border shrink-0 overflow-x-auto">
          {TABS.filter((tab) => {
            if (tab.id === 'verifications') return canVerify
            if (tab.id === 'exemptions') return canCreateExemption || canApproveExemption || hasPermission('conformite.exemption.read')
            return true
          }).map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)} className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}>
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <PanelContent>
          {renderTabContent()}
        </PanelContent>
      </div>}

      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && !dynamicPanel.meta?.subtype && <CreateTypePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && !dynamicPanel.meta?.subtype && <TypeDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'job-position' && <CreateJobPositionPanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'job-position' && <JobPositionDetailPanel id={dynamicPanel.id} />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'exemption' && <CreateExemptionPanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'exemption' && <ExemptionDetailPanel id={dynamicPanel.id} />}
    </div>
  )
}

// ── Rules Cross-Matrix ────────────────────────────────────────────────────

const CATEGORY_COLORS_MAP: Record<string, string> = {
  formation: 'bg-blue-600',
  certification: 'bg-emerald-600',
  habilitation: 'bg-violet-600',
  audit: 'bg-amber-600',
  medical: 'bg-rose-600',
  epi: 'bg-cyan-600',
}

const CATEGORY_FULL_LABELS: Record<string, string> = {
  formation: 'Formations',
  certification: 'Certifications',
  habilitation: 'Habilitations',
  audit: 'Audits',
  medical: 'Médical',
  epi: 'EPI',
}

const CATEGORY_ORDER = ['formation', 'certification', 'habilitation', 'medical', 'epi', 'audit']

type TargetTab = 'job_position' | 'department' | 'asset' | 'all'

const TARGET_TABS: { id: TargetTab; label: string }[] = [
  { id: 'job_position', label: 'Par poste' },
  { id: 'all', label: 'Globales' },
  { id: 'department', label: 'Par département' },
  { id: 'asset', label: 'Par asset' },
]

function RulesMatrixView({
  rules,
  types,
  jobPositions,
  isLoading,
  onCreateRule,
  onDeleteRule,
}: {
  rules: ComplianceRule[]
  types: ComplianceType[]
  jobPositions: JobPosition[] | undefined
  isLoading: boolean
  onCreateRule: (payload: { compliance_type_id: string; target_type: string; target_value?: string }) => void
  onDeleteRule: (id: string) => void
}) {
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [activeTargetTab, setActiveTargetTab] = useState<TargetTab>('job_position')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')

  // Available categories (only those with at least 1 type)
  const availableCategories = useMemo(() => {
    const cats = new Set(types.filter(t => t.active).map(t => t.category))
    return CATEGORY_ORDER.filter(c => cats.has(c))
  }, [types])

  // Filtered types by selected category
  const filteredTypes = useMemo(() => {
    return types
      .filter(t => t.active && (selectedCategory === 'all' || t.category === selectedCategory))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [types, selectedCategory])

  // Build rule lookup: "typeId::targetType::targetValue" → ComplianceRule
  const ruleMap = useMemo(() => {
    const map = new Map<string, ComplianceRule>()
    for (const r of rules) {
      const key = r.target_type === 'all'
        ? `${r.compliance_type_id}::all::__all__`
        : `${r.compliance_type_id}::${r.target_type}::${r.target_value}`
      map.set(key, r)
    }
    return map
  }, [rules])

  // Rows depend on active target tab
  const rows = useMemo(() => {
    if (activeTargetTab === 'all') return [{ id: '__all__', label: 'Tous les employés', sub: '' }]
    if (activeTargetTab === 'job_position') {
      const allJps = jobPositions ?? []
      const filtered = searchFilter
        ? allJps.filter(jp =>
            jp.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
            jp.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
            (jp.department ?? '').toLowerCase().includes(searchFilter.toLowerCase())
          )
        : allJps
      return filtered.map(jp => ({ id: jp.id, label: `${jp.code}`, sub: `${jp.name}${jp.department ? ` (${jp.department})` : ''}` }))
    }
    // For department/asset: extract unique values from existing rules
    const vals = new Set<string>()
    for (const r of rules) {
      if (r.target_type === activeTargetTab && r.target_value) vals.add(r.target_value)
    }
    const items = Array.from(vals).sort()
    const filtered = searchFilter
      ? items.filter(v => v.toLowerCase().includes(searchFilter.toLowerCase()))
      : items
    return filtered.map(v => ({ id: v, label: v, sub: '' }))
  }, [activeTargetTab, jobPositions, rules, searchFilter])

  // Count rules per target tab
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { job_position: 0, all: 0, department: 0, asset: 0 }
    for (const r of rules) {
      if (r.target_type in counts) counts[r.target_type]++
    }
    return counts
  }, [rules])

  const handleCellClick = useCallback((typeId: string, rowId: string) => {
    const targetType = activeTargetTab === 'all' ? 'all' : activeTargetTab
    const targetValue = activeTargetTab === 'all' ? undefined : rowId
    const key = activeTargetTab === 'all'
      ? `${typeId}::all::__all__`
      : `${typeId}::${activeTargetTab}::${rowId}`
    const existing = ruleMap.get(key)
    if (existing) {
      onDeleteRule(existing.id)
    } else {
      onCreateRule({ compliance_type_id: typeId, target_type: targetType, target_value: targetValue })
    }
  }, [ruleMap, onCreateRule, onDeleteRule, activeTargetTab])

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
  }

  // List view (DataTable-like)
  const filteredRulesForList = useMemo(() => {
    let filtered = rules
    if (selectedCategory !== 'all') {
      const typeIds = new Set(types.filter(t => t.category === selectedCategory).map(t => t.id))
      filtered = filtered.filter(r => typeIds.has(r.compliance_type_id))
    }
    if (activeTargetTab !== 'job_position' || activeTargetTab !== 'job_position') {
      // No additional filtering needed for list — show all target types
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase()
      filtered = filtered.filter(r => {
        const ct = types.find(t => t.id === r.compliance_type_id)
        const jp = r.target_type === 'job_position' && r.target_value ? jobPositions?.find(p => p.id === r.target_value) : null
        return (ct?.code.toLowerCase().includes(q) || ct?.name.toLowerCase().includes(q) ||
          r.target_value?.toLowerCase().includes(q) || jp?.name.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q))
      })
    }
    return filtered
  }, [rules, types, selectedCategory, searchFilter, jobPositions, activeTargetTab])

  return (
    <div className="p-4 space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Category dropdown */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="gl-form-input text-xs h-8 w-auto pr-8"
        >
          <option value="all">Toutes les catégories</option>
          {availableCategories.map(cat => (
            <option key={cat} value={cat}>{CATEGORY_FULL_LABELS[cat] ?? cat}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Rechercher..."
            className="gl-form-input text-xs w-full pl-8 h-8"
          />
          {searchFilter && (
            <button onClick={() => setSearchFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-accent rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setViewMode('matrix')}
            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'matrix' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Vue matrice"
          >
            <Grid3X3 size={14} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
            title="Vue liste"
          >
            <List size={14} />
          </button>
        </div>

        {/* Summary */}
        <span className="text-[11px] text-muted-foreground">
          {rules.length} règle(s)
        </span>
      </div>

      {viewMode === 'list' ? (
        /* ── List view ── */
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-accent/60 border-b border-border">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Catégorie</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Cible</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Valeur</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredRulesForList.map(rule => {
                const ct = types.find(t => t.id === rule.compliance_type_id)
                const jp = rule.target_type === 'job_position' && rule.target_value
                  ? jobPositions?.find(p => p.id === rule.target_value) : null
                return (
                  <tr key={rule.id} className="hover:bg-accent/30 transition-colors group">
                    <td className="px-3 py-2 font-medium text-foreground">{ct?.code ?? '?'}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${CATEGORY_COLORS_MAP[ct?.category ?? ''] ?? 'bg-zinc-500'}`}>
                        {CATEGORY_FULL_LABELS[ct?.category ?? ''] ?? ct?.category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {RULE_TARGET_OPTIONS.find(o => o.value === rule.target_type)?.label ?? rule.target_type}
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      {rule.target_type === 'all' ? '—' : jp ? `${jp.code} — ${jp.name}` : rule.target_value ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{rule.description || '—'}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => onDeleteRule(rule.id)}
                        className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredRulesForList.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Aucune règle trouvée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Matrix view ── */
        <>
          {/* Target type tabs */}
          <div className="flex items-center gap-1 border-b border-border pb-0">
            {TARGET_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTargetTab(tab.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-t-lg border border-b-0 transition-colors -mb-px',
                  activeTargetTab === tab.id
                    ? 'bg-background border-border text-foreground'
                    : 'bg-transparent border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50',
                )}
              >
                {tab.label}
                {tabCounts[tab.id] > 0 && (
                  <span className="ml-1.5 text-[10px] bg-primary/15 text-primary rounded-full px-1.5">{tabCounts[tab.id]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Matrix table */}
          {filteredTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Aucun référentiel dans cette catégorie.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-auto max-h-[calc(100vh-340px)]">
              <table className="text-xs w-full border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-chrome">
                    <th className="sticky left-0 z-30 bg-chrome border-b border-r border-border px-3 py-2 text-left font-semibold text-muted-foreground min-w-[200px]">
                      {activeTargetTab === 'all' ? 'Portée' : activeTargetTab === 'job_position' ? 'Fiche de poste' : activeTargetTab === 'department' ? 'Département' : 'Asset'}
                    </th>
                    {filteredTypes.map(t => (
                      <th
                        key={t.id}
                        className={`border-b border-r border-border px-1 py-2 text-center font-medium text-foreground min-w-[50px] max-w-[70px] cursor-help ${selectedCategory === 'all' ? '' : ''}`}
                        title={`${t.name}\n${CATEGORY_FULL_LABELS[t.category]} · ${t.validity_days ? `${t.validity_days}j` : 'Permanent'}${t.is_mandatory ? ' · Obligatoire' : ''}`}
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          {selectedCategory === 'all' && (
                            <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS_MAP[t.category] ?? 'bg-zinc-500'}`} title={CATEGORY_FULL_LABELS[t.category]} />
                          )}
                          <span className="text-[9px] leading-tight block truncate px-0.5">{t.code}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-card' : 'bg-accent/20'}>
                      <td className={`sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-card' : 'bg-accent/40'} border-r border-border px-3 py-2`}>
                        <span className="font-medium text-foreground">{row.label}</span>
                        {row.sub && <span className="text-muted-foreground ml-1.5 text-[10px]">{row.sub}</span>}
                      </td>
                      {filteredTypes.map(t => {
                        const key = activeTargetTab === 'all'
                          ? `${t.id}::all::__all__`
                          : `${t.id}::${activeTargetTab}::${row.id}`
                        const rule = ruleMap.get(key)
                        return (
                          <td
                            key={t.id}
                            className="border-r border-border/30 text-center cursor-pointer hover:bg-primary/10 transition-colors"
                            onClick={() => handleCellClick(t.id, row.id === '__all__' ? '__all__' : row.id)}
                            title={rule ? `Cliquer pour supprimer` : `Cliquer pour ajouter`}
                          >
                            {rule ? (
                              <Check size={14} className="mx-auto text-emerald-600 dark:text-emerald-400" />
                            ) : null}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={filteredTypes.length + 1} className="text-center py-8 text-muted-foreground text-xs">
                        {searchFilter ? 'Aucun résultat.' : activeTargetTab === 'job_position' ? 'Aucune fiche de poste.' : 'Aucune entrée. Ajoutez des règles via le bouton "+ Nouvelle règle".'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Edit Rule Panel ──────────────────────────────────────────────────────

function EditRulePanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const updateRule = useUpdateComplianceRule()
  const deleteRule = useDeleteComplianceRule()
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })
  const rule = dynamicPanel?.meta?.rule as ComplianceRule | undefined

  const [form, setForm] = useState({
    target_type: rule?.target_type ?? 'all',
    target_value: rule?.target_value ?? '',
    description: rule?.description ?? '',
  })

  if (!rule) return null

  const ct = typesData?.items?.find(t => t.id === rule.compliance_type_id)

  const handleSave = async () => {
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: {
          target_type: form.target_type,
          target_value: form.target_value || undefined,
          description: form.description || undefined,
        },
      })
      toast({ title: 'Règle mise à jour', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  const handleDelete = async () => {
    try {
      await deleteRule.mutateAsync({ id: rule.id })
      toast({ title: 'Règle supprimée', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell title="Modifier la règle" icon={<Scale size={14} className="text-primary" />}>
      <div className="p-4 space-y-4">
        {/* Read-only type info */}
        <div>
          <label className="gl-label">Type de référentiel</label>
          <div className="gl-form-input bg-accent/30 text-foreground text-sm cursor-default">
            {ct ? `[${ct.category}] ${ct.code} — ${ct.name}` : rule.compliance_type_id.slice(0, 8)}
          </div>
        </div>

        <div>
          <label className="gl-label">Cible *</label>
          <select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value, target_value: '' })} className="gl-form-input">
            {RULE_TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {form.target_type === 'job_position' && (
          <div>
            <label className="gl-label">Fiche de poste</label>
            <select value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className="gl-form-input">
              <option value="">— Tous les postes —</option>
              {jpData?.items?.map(jp => <option key={jp.id} value={jp.id}>{jp.code} — {jp.name}</option>)}
            </select>
          </div>
        )}

        {(form.target_type === 'asset' || form.target_type === 'tier_type' || form.target_type === 'department') && (
          <div>
            <label className="gl-label">Valeur</label>
            <input type="text" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className="gl-form-input" />
          </div>
        )}

        <div>
          <label className="gl-label">Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="gl-form-input" placeholder="Description de la règle..." />
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={handleSave} disabled={updateRule.isPending} className="gl-button gl-button-confirm">
            {updateRule.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Enregistrer
          </button>
          <button onClick={closeDynamicPanel} className="gl-button gl-button-default">Annuler</button>
          <button onClick={handleDelete} disabled={deleteRule.isPending} className="gl-button gl-button-default text-red-600 dark:text-red-400 ml-auto">
            <Trash2 size={12} />
            Supprimer
          </button>
        </div>
      </div>
    </DynamicPanelShell>
  )
}

// ── Create Rule Panel ────────────────────────────────────────────────────

function CreateRulePanel() {
  const createRule = useCreateComplianceRule()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })
  const [form, setForm] = useState({ compliance_type_id: '', target_type: 'job_position', target_value: '', description: '' })

  const handleCreate = async () => {
    if (!form.compliance_type_id) return
    try {
      await createRule.mutateAsync({
        compliance_type_id: form.compliance_type_id,
        target_type: form.target_type,
        target_value: form.target_value || undefined,
        description: form.description || undefined,
      })
      toast({ title: 'Règle créée', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell title="Nouvelle règle" icon={<Scale size={14} className="text-primary" />}>
      <div className="p-4 space-y-4">
        <div>
          <label className="gl-label">Type de référentiel *</label>
          <select value={form.compliance_type_id} onChange={(e) => setForm({ ...form, compliance_type_id: e.target.value })} className="gl-form-input">
            <option value="">— Sélectionner —</option>
            {typesData?.items?.map(t => <option key={t.id} value={t.id}>[{t.category}] {t.code} — {t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="gl-label">Cible *</label>
          <select value={form.target_type} onChange={(e) => setForm({ ...form, target_type: e.target.value, target_value: '' })} className="gl-form-input">
            {RULE_TARGET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {form.target_type === 'job_position' && (
          <div>
            <label className="gl-label">Fiche de poste</label>
            <select value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className="gl-form-input">
              <option value="">— Tous les postes —</option>
              {jpData?.items?.map(jp => <option key={jp.id} value={jp.id}>{jp.code} — {jp.name}</option>)}
            </select>
          </div>
        )}
        {(form.target_type === 'asset' || form.target_type === 'tier_type' || form.target_type === 'department') && (
          <div>
            <label className="gl-label">Valeur</label>
            <input type="text" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className="gl-form-input" placeholder={form.target_type === 'asset' ? 'ID de l\'asset...' : form.target_type === 'department' ? 'Nom du département...' : 'Type de tiers...'} />
          </div>
        )}
        <div>
          <label className="gl-label">Description</label>
          <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="gl-form-input" placeholder="Description de la règle..." />
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={handleCreate} disabled={!form.compliance_type_id || createRule.isPending} className="gl-button gl-button-confirm">
            {createRule.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}Créer la règle
          </button>
          <button onClick={closeDynamicPanel} className="gl-button gl-button-default">Annuler</button>
        </div>
      </div>
    </DynamicPanelShell>
  )
}

// ── Verifications Tab ────────────────────────────────────────────────────

const RECORD_TYPE_LABELS: Record<string, string> = {
  compliance_record: 'Référentiel',
  passport: 'Passeport',
  visa: 'Visa',
  social_security: 'Sécu sociale',
  vaccine: 'Vaccin',
  driving_license: 'Permis',
  medical_check: 'Visite médicale',
}

function VerificationsTab() {
  const { data, isLoading } = usePendingVerifications()
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const handleVerify = async (recordType: string, recordId: string) => {
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'verify' })
      toast({ title: 'Vérifié', description: 'L\'enregistrement a été validé.', variant: 'success' })
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  const handleReject = async (recordType: string, recordId: string) => {
    if (!rejectReason.trim()) return
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'reject', rejectionReason: rejectReason })
      toast({ title: 'Rejeté', description: 'L\'enregistrement a été rejeté.', variant: 'success' })
      setRejectingId(null)
      setRejectReason('')
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  if (isLoading) return <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ClipboardCheck size={32} className="mb-3 text-green-500/50" />
        <p className="text-sm font-medium">Aucune vérification en attente</p>
        <p className="text-xs mt-1">Tous les enregistrements sont vérifiés ou en cours de saisie.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">{items.length} enregistrement{items.length > 1 ? 's' : ''} en attente de vérification</p>
      {items.map((item) => (
        <div key={`${item.record_type}-${item.id}`} className="border border-border rounded-lg p-3 hover:bg-muted/20 transition-colors">
          <div className="flex items-center gap-2">
            <span className="gl-badge gl-badge-warning text-[9px] shrink-0">{RECORD_TYPE_LABELS[item.record_type] || item.record_type}</span>
            <span className="text-sm font-medium flex-1 truncate">{item.description}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {new Date(item.submitted_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          </div>
          {item.owner_name && (
            <p className="text-xs text-muted-foreground mt-1">Soumis par : <span className="text-foreground font-medium">{item.owner_name}</span></p>
          )}

          {rejectingId === item.id ? (
            <div className="mt-2 space-y-1.5">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motif du rejet..."
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                autoFocus
              />
              <div className="flex gap-1.5 justify-end">
                <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="px-2 py-0.5 text-[10px] rounded border border-border hover:bg-muted text-muted-foreground">Annuler</button>
                <button onClick={() => handleReject(item.record_type, item.id)} disabled={!rejectReason.trim() || verifyRecord.isPending} className="px-2 py-0.5 text-[10px] rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40">
                  {verifyRecord.isPending ? <Loader2 size={10} className="animate-spin inline mr-1" /> : null}Rejeter
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5 mt-2 justify-end">
              <button onClick={() => setRejectingId(item.id)} className="gl-button-sm gl-button-danger flex items-center gap-1 text-[10px]">
                <X size={10} /> Rejeter
              </button>
              <button onClick={() => handleVerify(item.record_type, item.id)} disabled={verifyRecord.isPending} className="gl-button-sm gl-button-confirm flex items-center gap-1 text-[10px]">
                {verifyRecord.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Vérifier & Valider
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

registerPanelRenderer('conformite', (view) => {
  if (view.type === 'create' && !view.meta?.subtype) return <CreateTypePanel />
  if (view.type === 'detail' && 'id' in view && !view.meta?.subtype) return <TypeDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'job-position') return <CreateJobPositionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'job-position') return <JobPositionDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'rule') return <CreateRulePanel />
  if (view.type === 'edit' && view.meta?.subtype === 'rule') return <EditRulePanel />
  if (view.type === 'create' && view.meta?.subtype === 'exemption') return <CreateExemptionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'exemption') return <ExemptionDetailPanel id={view.id} />
  return null
})
