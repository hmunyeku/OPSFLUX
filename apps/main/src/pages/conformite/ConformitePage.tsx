/**
 * Conformite (Compliance) page — referentiel + enregistrements + exemptions.
 *
 * Onglets: Referentiel | Enregistrements | Exemptions | Fiches de poste | Regles | Transferts
 */
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Plus, Loader2, Trash2, FileCheck, ClipboardList,
  Briefcase, GitBranch, Scale, ShieldOff, Check, X,
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
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { registerPanelRenderer } from '@/components/layout/DetachedPanelRenderer'
import { useToast } from '@/components/ui/Toast'
import {
  useComplianceTypes, useCreateComplianceType, useUpdateComplianceType, useDeleteComplianceType,
  useComplianceRecords,
  useComplianceRules, useDeleteComplianceRule,
  useJobPositions, useCreateJobPosition, useUpdateJobPosition, useDeleteJobPosition,
  useTransfers,
  useExemptions, useCreateExemption, useApproveExemption, useRejectExemption, useDeleteExemption,
} from '@/hooks/useConformite'
import type {
  ComplianceType, ComplianceTypeCreate,
  ComplianceRecord,
  ComplianceRule,
  ComplianceExemption, ComplianceExemptionCreate,
  JobPosition, JobPositionCreate,
  TierContactTransfer,
} from '@/types/api'

// -- Constants ----------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: 'formation', label: 'Formation' },
  { value: 'certification', label: 'Certification' },
  { value: 'habilitation', label: 'Habilitation' },
  { value: 'audit', label: 'Audit' },
  { value: 'medical', label: 'Medical' },
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

type ConformiteTab = 'referentiel' | 'enregistrements' | 'exemptions' | 'fiches' | 'regles' | 'transferts'

const TABS: { id: ConformiteTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'referentiel', label: 'Referentiel', icon: ClipboardList },
  { id: 'enregistrements', label: 'Enregistrements', icon: FileCheck },
  { id: 'exemptions', label: 'Exemptions', icon: ShieldOff },
  { id: 'fiches', label: 'Fiches de poste', icon: Briefcase },
  { id: 'regles', label: 'Regles', icon: Scale },
  { id: 'transferts', label: 'Transferts', icon: GitBranch },
]

// -- Create Type Panel --------------------------------------------------------

function CreateTypePanel() {
  const { t } = useTranslation()
  const createType = useCreateComplianceType()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
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
            <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{ct.code || '\u2014'}</span>} />
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
            <ReadOnlyRow label="Code" value={<span className="text-sm font-mono font-medium text-foreground">{jp.code || '\u2014'}</span>} />
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

  const { hasPermission } = usePermission()
  const canImport = hasPermission('conformite.import')
  const canExport = hasPermission('conformite.export') || hasPermission('conformite.record.read')

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
    page_size: activeTab === 'referentiel' ? pageSize : 1,
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

  const { data: transfersData, isLoading: transfersLoading } = useTransfers({
    page: activeTab === 'transferts' ? page : 1,
    page_size: activeTab === 'transferts' ? pageSize : 1,
  })

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
      return <span className="text-foreground font-medium">{ct ? `${ct.code} \u2014 ${ct.name}` : row.original.compliance_type_id.slice(0, 8)}</span>
    }},
    { accessorKey: 'target_type', header: 'Cible', size: 130, cell: ({ row }) => <span className="gl-badge gl-badge-neutral">{RULE_TARGET_OPTIONS.find(o => o.value === row.original.target_type)?.label ?? row.original.target_type}</span> },
    { accessorKey: 'target_value', header: 'Valeur', size: 150, cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.target_value || 'N/A'}</span> },
    { accessorKey: 'description', header: 'Description', cell: ({ row }) => <span className="text-muted-foreground text-xs">{row.original.description || '--'}</span> },
    { id: 'actions', header: '', size: 50, cell: ({ row }) => (
      <button onClick={(e) => { e.stopPropagation(); deleteRule.mutate(row.original.id) }} className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
        <Trash2 size={12} />
      </button>
    )},
  ], [typesData?.items, deleteRule])

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

  // Toolbar action button per tab
  const toolbarAction = useMemo(() => {
    if (activeTab === 'referentiel') return <ToolbarButton icon={Plus} label="Nouveau type" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite' })} />
    if (activeTab === 'fiches') return <ToolbarButton icon={Plus} label="Nouvelle fiche" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'job-position' } })} />
    if (activeTab === 'exemptions') return <ToolbarButton icon={Plus} label="Nouvelle exemption" variant="primary" onClick={() => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'exemption' } })} />
    return null
  }, [activeTab, openDynamicPanel])

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
          <DataTable<ComplianceRule>
            columns={ruleColumns}
            data={rulesData ?? []}
            isLoading={rulesLoading}
            emptyIcon={Scale}
            emptyTitle="Aucune regle de conformite"
            columnResizing
            storageKey="conformite-regles"
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
          {TABS.map((tab) => {
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

registerPanelRenderer('conformite', (view) => {
  if (view.type === 'create' && !view.meta?.subtype) return <CreateTypePanel />
  if (view.type === 'detail' && 'id' in view && !view.meta?.subtype) return <TypeDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'job-position') return <CreateJobPositionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'job-position') return <JobPositionDetailPanel id={view.id} />
  if (view.type === 'create' && view.meta?.subtype === 'exemption') return <CreateExemptionPanel />
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'exemption') return <ExemptionDetailPanel id={view.id} />
  return null
})
