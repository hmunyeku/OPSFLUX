/**
 * Conformite (Compliance) page — referentiel + enregistrements + exemptions.
 *
 * Onglets: Referentiel | Enregistrements | Exemptions | Fiches de poste | Regles | Transferts
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ShieldCheck, Plus, Loader2, Trash2, FileCheck, ClipboardList,
  Briefcase, GitBranch, Scale, ShieldOff, Check, X, ClipboardCheck, Grid3X3, List,
  Download, Paperclip, LayoutDashboard,
} from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { DataTableToolbar } from '@/components/ui/DataTable/Toolbar'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { ConditionBuilder } from '@/components/shared/ConditionBuilder'
import { TabBar, SubTabBar } from '@/components/ui/Tabs'
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
import { ComplianceDashboard } from './ComplianceDashboard'
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
  useRuleHistory,
  useJobPositions, useCreateJobPosition, useUpdateJobPosition, useDeleteJobPosition,
  useTransfers,
  useExemptions, useCreateExemption, useApproveExemption, useRejectExemption, useDeleteExemption,
  usePendingVerifications, useVerifyRecord, useVerificationHistory,
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

type ConformiteTab = 'dashboard' | 'referentiel' | 'enregistrements' | 'verifications' | 'exemptions' | 'fiches' | 'regles' | 'transferts'

const TABS: { id: ConformiteTab; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'fiches', label: 'Fiches de poste', icon: Briefcase },
  { id: 'referentiel', label: 'Référentiel', icon: ClipboardList },
  { id: 'regles', label: 'Règles', icon: Scale },
  { id: 'exemptions', label: 'Exemptions', icon: ShieldOff },
  { id: 'enregistrements', label: 'Enregistrements', icon: FileCheck },
  { id: 'verifications', label: 'Vérifications', icon: ClipboardCheck },
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

        <FormSection title="Pièces jointes" collapsible defaultExpanded={false}>
          <AttachmentManager ownerType="compliance_type" ownerId={ct.id} compact />
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

        <FormSection title="Pièces jointes" collapsible defaultExpanded={false}>
          <AttachmentManager ownerType="compliance_exemption" ownerId={exemption.id} compact />
        </FormSection>
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

const PRIORITY_LABELS: Record<string, string> = { high: 'Haute', normal: 'Normale', low: 'Basse' }
const PRIORITY_COLORS: Record<string, string> = { high: 'bg-red-600', normal: 'bg-zinc-500', low: 'bg-sky-500' }

function JobPositionDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { hasPermission } = usePermission()
  const canReadRules = hasPermission('conformite.read')
  const { data } = useJobPositions({ page: 1, page_size: 100 })
  const jp = data?.items.find((j) => j.id === id)
  const updateJP = useUpdateJobPosition()
  const deleteJP = useDeleteJobPosition()
  const { toast } = useToast()

  // Rules linked to this job position + global rules
  const { data: allRules } = useComplianceRules(undefined)
  const { data: typesData } = useComplianceTypes({ page: 1, page_size: 200 })

  const handleSave = useCallback((field: string, value: string) => {
    updateJP.mutate({ id, payload: normalizeNames({ [field]: value }) })
  }, [id, updateJP])

  const handleDelete = useCallback(async () => {
    await deleteJP.mutateAsync(id)
    closeDynamicPanel()
    toast({ title: 'Fiche de poste archivee', variant: 'success' })
  }, [id, deleteJP, closeDynamicPanel, toast])

  // Helper to resolve a type from its ID
  const typesMap = useMemo(() => {
    const m = new Map<string, ComplianceType>()
    for (const ct of typesData?.items ?? []) m.set(ct.id, ct)
    return m
  }, [typesData?.items])

  if (!jp) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Briefcase size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  // Rules targeting this specific job position OR targeting 'all'
  const linkedRules = allRules?.filter(
    r => r.active && (
      (r.target_type === 'job_position' && (r.target_value === jp.code || r.target_value === jp.id)) ||
      r.target_type === 'all'
    )
  ) ?? []

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

        <FormSection title={`Exigences de conformité (${linkedRules.length})`} collapsible defaultExpanded>
          {linkedRules.length > 0 ? (
            <div className="space-y-1.5">
              {linkedRules.map(r => {
                const ct = typesMap.get(r.compliance_type_id)
                const validityDays = r.override_validity_days ?? ct?.validity_days
                const isClickable = canReadRules
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-center gap-2 text-xs py-1.5 px-2.5 bg-muted/30 rounded border border-border/50',
                      isClickable && 'cursor-pointer hover:bg-primary/5 hover:border-primary/30 transition-colors',
                    )}
                    onClick={isClickable ? () => openDynamicPanel({ type: 'edit', module: 'conformite', id: r.id, meta: { subtype: 'rule' }, data: { rule: r } }) : undefined}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                  >
                    <Scale size={10} className="text-muted-foreground shrink-0" />
                    <span className={cn('flex-1 font-medium truncate', isClickable ? 'text-primary' : 'text-foreground')}>
                      {ct ? ct.name : r.description || r.compliance_type_id}
                    </span>
                    {ct && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0 ${CATEGORY_COLORS_MAP[ct.category] ?? 'bg-zinc-500'}`}>
                        {CATEGORY_FULL_LABELS[ct.category] ?? ct.category}
                      </span>
                    )}
                    {validityDays != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0 whitespace-nowrap">{validityDays}j</span>
                    )}
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white shrink-0 ${PRIORITY_COLORS[r.priority] ?? 'bg-zinc-500'}`}>
                      {PRIORITY_LABELS[r.priority] ?? r.priority}
                    </span>
                    {r.target_type === 'all' && (
                      <span className="text-[10px] text-muted-foreground italic shrink-0">(global)</span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aucune exigence de conformité définie pour ce poste.</p>
          )}
        </FormSection>

        <FormSection title="Pièces jointes" collapsible defaultExpanded={false}>
          <AttachmentManager ownerType="job_position" ownerId={jp.id} compact />
        </FormSection>
      </PanelContentLayout>
    </DynamicPanelShell>
  )
}

// -- Main Page ----------------------------------------------------------------

export function ConformitePage() {
  useTranslation() // loaded for future i18n
  const [activeTab, setActiveTab] = useState<ConformiteTab>('dashboard')
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
  // @ts-expect-error — ruleColumns kept for future DataTable integration
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
      case 'dashboard':
        return <div className="p-6"><ComplianceDashboard /></div>
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
            onEditRule={(rule) => openDynamicPanel({ type: 'edit', module: 'conformite', id: rule.id, meta: { subtype: 'rule' }, data: { rule } })}
            onCreateRulePanel={(prefill) => openDynamicPanel({ type: 'create', module: 'conformite', meta: { subtype: 'rule', prefill_type_id: prefill.type_id, prefill_target_type: prefill.target_type, prefill_target_value: prefill.target_value || '' } })}
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

        <TabBar
          items={TABS.filter((tab) => {
            if (tab.id === 'dashboard') return hasPermission('conformite.record.read')
            if (tab.id === 'verifications') return canVerify
            if (tab.id === 'exemptions') return canCreateExemption || canApproveExemption || hasPermission('conformite.exemption.read')
            if (tab.id === 'referentiel') return hasPermission('conformite.type.read')
            if (tab.id === 'enregistrements') return hasPermission('conformite.record.read')
            if (tab.id === 'fiches') return hasPermission('conformite.jobposition.read')
            if (tab.id === 'regles') return hasPermission('conformite.rule.read')
            if (tab.id === 'transferts') return hasPermission('conformite.transfer.read')
            return true
          })}
          activeId={activeTab}
          onTabChange={handleTabChange}
        />

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
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'create' && dynamicPanel.meta?.subtype === 'rule' && <CreateRulePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'edit' && dynamicPanel.meta?.subtype === 'rule' && <EditRulePanel />}
      {dynamicPanel?.module === 'conformite' && dynamicPanel.type === 'detail' && dynamicPanel.meta?.subtype === 'verification' && <VerificationDetailPanel id={dynamicPanel.id} recordType={dynamicPanel.meta?.record_type as string || ''} />}
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

const CATEGORY_ORDER: string[] = ['formation', 'certification', 'habilitation', 'medical', 'epi', 'audit']

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
  onEditRule,
  onCreateRulePanel,
}: {
  rules: ComplianceRule[]
  types: ComplianceType[]
  jobPositions: JobPosition[] | undefined
  isLoading: boolean
  onCreateRule: (payload: { compliance_type_id: string; target_type: string; target_value?: string }) => void
  onDeleteRule: (id: string) => void
  onEditRule?: (rule: ComplianceRule) => void
  onCreateRulePanel?: (prefill: { type_id: string; target_type: string; target_value?: string }) => void
}) {
  const [searchFilter, setSearchFilter] = useState('')
  const [activeRuleFilters, setActiveRuleFilters] = useState<Record<string, unknown>>({})
  const selectedCategory = (activeRuleFilters.category as string) || 'all'
  const [activeTargetTab, setActiveTargetTab] = useState<TargetTab>('job_position')
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const [exportOpen, setExportOpen] = useState(false)
  const [hoveredCol, setHoveredCol] = useState<string | null>(null)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)
  const [listGroupBy, setListGroupBy] = useState<'target_type' | 'category' | 'applicability' | 'none'>('target_type')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const handleRuleFilterChange = useCallback((filterId: string, value: unknown) => {
    setActiveRuleFilters(prev => {
      const next = { ...prev }
      if (value === undefined || value === null) delete next[filterId]
      else next[filterId] = value
      return next
    })
  }, [])

  // Available categories (only those with at least 1 type)
  const availableCategories = useMemo(() => {
    const cats = new Set<string>(types.filter(t => t.active).map(t => t.category))
    return CATEGORY_ORDER.filter(c => cats.has(c))
  }, [types])

  // Visual query search filter definitions
  const ruleFilterDefs = useMemo<DataTableFilterDef[]>(() => [
    { id: 'category', label: 'Catégorie', type: 'select', options: availableCategories.map(cat => ({ value: cat, label: CATEGORY_FULL_LABELS[cat] ?? cat })) },
    { id: 'target_type', label: 'Cible', type: 'select', options: RULE_TARGET_OPTIONS.map(o => ({ value: o.value, label: o.label })) },
    { id: 'applicability', label: 'Applicabilité', type: 'select', options: [{ value: 'permanent', label: 'Permanente' }, { value: 'contextual', label: 'Contextuelle' }] },
    { id: 'priority', label: 'Priorité', type: 'select', options: [{ value: 'normal', label: 'Normale' }, { value: 'high', label: 'Haute' }, { value: 'low', label: 'Basse' }] },
  ], [availableCategories])

  // Filtered types by selected category
  const filteredTypes = useMemo(() => {
    return types
      .filter(t => t.active && (selectedCategory === 'all' || t.category === selectedCategory))
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [types, selectedCategory])

  // Build rule lookup: "typeId::targetType::targetValue" → ComplianceRule
  // Multi-target rules (comma-separated) get an entry per target value
  const ruleMap = useMemo(() => {
    const map = new Map<string, ComplianceRule>()
    for (const r of rules) {
      if (r.target_type === 'all') {
        map.set(`${r.compliance_type_id}::all::__all__`, r)
      } else if (r.target_value?.includes(',')) {
        for (const v of r.target_value.split(',')) {
          map.set(`${r.compliance_type_id}::${r.target_type}::${v.trim()}`, r)
        }
      } else {
        map.set(`${r.compliance_type_id}::${r.target_type}::${r.target_value}`, r)
      }
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
    if (existing && onEditRule) {
      // Click on existing rule → open edit panel
      onEditRule(existing)
    } else if (existing) {
      // Fallback: toggle delete if no edit handler
      onDeleteRule(existing.id)
    } else if (onCreateRulePanel) {
      // Click on empty cell → open create panel pre-filled
      onCreateRulePanel({ type_id: typeId, target_type: targetType, target_value: targetValue })
    } else {
      onCreateRule({ compliance_type_id: typeId, target_type: targetType, target_value: targetValue })
    }
  }, [ruleMap, onCreateRule, onDeleteRule, onEditRule, onCreateRulePanel, activeTargetTab])

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
  }

  // List view — apply visual query filters + text search
  const filteredRulesForList = useMemo(() => {
    let filtered = rules

    // Token-based filters from visual query bar
    const catFilter = activeRuleFilters.category as string | undefined
    if (catFilter) {
      const typeIds = new Set(types.filter(t => t.category === catFilter).map(t => t.id))
      filtered = filtered.filter(r => typeIds.has(r.compliance_type_id))
    } else if (selectedCategory !== 'all') {
      // Fallback to legacy dropdown (used by matrix view)
      const typeIds = new Set(types.filter(t => t.category === selectedCategory).map(t => t.id))
      filtered = filtered.filter(r => typeIds.has(r.compliance_type_id))
    }
    const targetFilter = activeRuleFilters.target_type as string | undefined
    if (targetFilter) filtered = filtered.filter(r => r.target_type === targetFilter)
    const appFilter = activeRuleFilters.applicability as string | undefined
    if (appFilter) filtered = filtered.filter(r => r.applicability === appFilter)
    const prioFilter = activeRuleFilters.priority as string | undefined
    if (prioFilter) filtered = filtered.filter(r => r.priority === prioFilter)

    // Text search
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
  }, [rules, types, selectedCategory, searchFilter, jobPositions, activeRuleFilters])

  return (
    <div className="p-2 sm:p-4 space-y-3 sm:space-y-4">
      {/* ── Toolbar — visual query search ── */}
      <DataTableToolbar
        searchValue={searchFilter}
        onSearchChange={setSearchFilter}
        searchPlaceholder="Rechercher par type, poste, description..."
        filters={ruleFilterDefs}
        activeFilters={activeRuleFilters}
        onFilterChange={handleRuleFilterChange}
        currentViewMode="table"
        onViewModeChange={() => {}}
        toolbarRight={
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-accent rounded-lg p-0.5">
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
            <button
              onClick={() => setExportOpen(true)}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Exporter les règles"
            >
              <Download size={14} />
            </button>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap hidden sm:inline">
              {filteredRulesForList.length}/{rules.length} règle(s)
            </span>
          </div>
        }
      />

      {viewMode === 'list' ? (
        /* ── List view with grouping ── */
        <div className="space-y-2">
          {/* Grouping selector */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs overflow-x-auto scrollbar-none">
            <span className="text-muted-foreground shrink-0">Grouper par :</span>
            {([['target_type', 'Cible'], ['category', 'Catégorie'], ['applicability', 'Applicabilité'], ['none', 'Aucun']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => { setListGroupBy(val); setCollapsedGroups(new Set()) }}
                className={cn('px-2 py-1 sm:py-0.5 rounded text-xs transition-colors whitespace-nowrap', listGroupBy === val ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Grouped table */}
          {(() => {
            // Build groups
            const groupedRules = new Map<string, typeof filteredRulesForList>()
            for (const rule of filteredRulesForList) {
              const ct = types.find(t => t.id === rule.compliance_type_id)
              let groupKey: string
              if (listGroupBy === 'target_type') {
                groupKey = RULE_TARGET_OPTIONS.find(o => o.value === rule.target_type)?.label ?? rule.target_type
              } else if (listGroupBy === 'category') {
                groupKey = CATEGORY_FULL_LABELS[ct?.category ?? ''] ?? ct?.category ?? 'Autre'
              } else if (listGroupBy === 'applicability') {
                groupKey = rule.applicability === 'contextual' ? 'Contextuelle' : 'Permanente'
              } else {
                groupKey = '__all__'
              }
              if (!groupedRules.has(groupKey)) groupedRules.set(groupKey, [])
              groupedRules.get(groupKey)!.push(rule)
            }

            const groups = listGroupBy === 'none' ? [['__all__', filteredRulesForList] as const] : [...groupedRules.entries()].sort((a, b) => a[0].localeCompare(b[0]))

            const toggleGroup = (key: string) => {
              setCollapsedGroups(prev => {
                const next = new Set(prev)
                next.has(key) ? next.delete(key) : next.add(key)
                return next
              })
            }

            return groups.map(([groupKey, groupRules]) => (
              <div key={groupKey} className="border border-border rounded-lg overflow-hidden">
                {listGroupBy !== 'none' && (
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="w-full flex items-center gap-2 px-3 py-2 bg-accent/50 border-b border-border text-xs font-semibold text-foreground hover:bg-accent/70 transition-colors"
                  >
                    <svg className={cn('w-3 h-3 transition-transform', collapsedGroups.has(groupKey) ? '' : 'rotate-90')} viewBox="0 0 12 12"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
                    {groupKey}
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">({groupRules.length})</span>
                  </button>
                )}
                {!collapsedGroups.has(groupKey) && (
                  <>
                    {/* Desktop: table layout */}
                    <table className="text-xs w-full hidden sm:table">
                      <thead>
                        <tr className="bg-muted/30 border-b border-border/50">
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Type</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Catégorie</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Cible</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Valeur</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Priorité</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Applic.</th>
                          <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {groupRules.map(rule => {
                          const ct = types.find(t => t.id === rule.compliance_type_id)
                          const jpNames = rule.target_type === 'job_position' && rule.target_value
                            ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean).map((p: any) => p.name)
                            : []
                          return (
                            <tr
                              key={rule.id}
                              className="hover:bg-accent/30 transition-colors cursor-pointer group"
                              onClick={() => onEditRule?.(rule)}
                            >
                              <td className="px-3 py-2 font-medium text-foreground">{ct ? `${ct.code} — ${ct.name}` : '?'}</td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${CATEGORY_COLORS_MAP[ct?.category ?? ''] ?? 'bg-zinc-500'}`}>
                                  {CATEGORY_FULL_LABELS[ct?.category ?? ''] ?? ct?.category}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {RULE_TARGET_OPTIONS.find(o => o.value === rule.target_type)?.label ?? rule.target_type}
                              </td>
                              <td className="px-3 py-2 text-foreground">
                                {rule.target_type === 'all' ? '—' : jpNames.length > 0 ? jpNames.join(', ') : rule.target_value ?? '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${PRIORITY_COLORS[rule.priority] ?? 'bg-zinc-500'}`}>
                                  {PRIORITY_LABELS[rule.priority] ?? rule.priority}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={cn('text-[10px] font-medium', rule.applicability === 'contextual' ? 'text-blue-500' : 'text-emerald-600')}>
                                  {rule.applicability === 'contextual' ? 'Contextuelle' : 'Permanente'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{rule.description || '—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {/* Mobile: card layout */}
                    <div className="sm:hidden divide-y divide-border/30">
                      {groupRules.map(rule => {
                        const ct = types.find(t => t.id === rule.compliance_type_id)
                        const jpNames = rule.target_type === 'job_position' && rule.target_value
                          ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean).map((p: any) => p.name)
                          : []
                        return (
                          <div
                            key={rule.id}
                            className="p-3 active:bg-accent/30 transition-colors cursor-pointer"
                            onClick={() => onEditRule?.(rule)}
                          >
                            <div className="flex items-start gap-2 mb-1.5">
                              <span className="text-xs font-medium text-foreground flex-1 leading-snug">
                                {ct ? `${ct.code} — ${ct.name}` : '?'}
                              </span>
                              <span className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold text-white ${PRIORITY_COLORS[rule.priority] ?? 'bg-zinc-500'}`}>
                                {PRIORITY_LABELS[rule.priority] ?? rule.priority}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                              <span className={`inline-block px-1.5 py-0.5 rounded font-semibold text-white ${CATEGORY_COLORS_MAP[ct?.category ?? ''] ?? 'bg-zinc-500'}`}>
                                {CATEGORY_FULL_LABELS[ct?.category ?? ''] ?? ct?.category}
                              </span>
                              <span className="text-muted-foreground">
                                {RULE_TARGET_OPTIONS.find(o => o.value === rule.target_type)?.label ?? rule.target_type}
                                {rule.target_type !== 'all' && (
                                  <> : <span className="text-foreground">{jpNames.length > 0 ? jpNames.join(', ') : rule.target_value ?? '—'}</span></>
                                )}
                              </span>
                              <span className={cn('font-medium', rule.applicability === 'contextual' ? 'text-blue-500' : 'text-emerald-600')}>
                                {rule.applicability === 'contextual' ? 'Contextuelle' : 'Permanente'}
                              </span>
                            </div>
                            {rule.description && (
                              <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{rule.description}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            ))
          })()}
          {filteredRulesForList.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs border border-border rounded-lg">Aucune règle trouvée.</div>
          )}
        </div>
      ) : (
        /* ── Matrix view ── */
        <>
          {/* Target type tabs */}
          <SubTabBar
            items={TARGET_TABS.map(t => ({ ...t, icon: Scale }))}
            activeId={activeTargetTab}
            onTabChange={setActiveTargetTab}
            counts={tabCounts}
          />

          {/* Matrix table */}
          {filteredTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              Aucun référentiel dans cette catégorie.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-auto max-h-[calc(100vh-340px)] -mx-2 sm:mx-0 touch-pan-x touch-pan-y">
              <table className="text-xs w-full border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-chrome">
                    <th className="sticky left-0 z-30 bg-chrome border-b border-r border-border px-2 sm:px-3 py-2 text-left font-semibold text-muted-foreground min-w-[120px] sm:min-w-[200px]">
                      {activeTargetTab === 'all' ? 'Portée' : activeTargetTab === 'job_position' ? 'Fiche de poste' : activeTargetTab === 'department' ? 'Département' : 'Asset'}
                    </th>
                    {filteredTypes.map(t => (
                      <th
                        key={t.id}
                        className={cn(
                          'border-b border-r border-border px-1 py-2 text-center font-medium min-w-[50px] max-w-[70px] cursor-help transition-colors',
                          hoveredCol === t.id ? 'bg-primary/10 text-primary' : 'text-foreground',
                        )}
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
                      <td className={cn(
                        'sticky left-0 z-10 border-r border-border px-2 sm:px-3 py-2 transition-colors min-w-[120px] sm:min-w-[200px]',
                        hoveredRow === row.id ? 'bg-primary/10' : idx % 2 === 0 ? 'bg-card' : 'bg-accent/40',
                      )}>
                        <span className={cn('font-medium text-[11px] sm:text-xs', hoveredRow === row.id ? 'text-primary' : 'text-foreground')}>{row.label}</span>
                        {row.sub && <span className="text-muted-foreground ml-1 sm:ml-1.5 text-[9px] sm:text-[10px] hidden sm:inline">{row.sub}</span>}
                      </td>
                      {filteredTypes.map(t => {
                        const key = activeTargetTab === 'all'
                          ? `${t.id}::all::__all__`
                          : `${t.id}::${activeTargetTab}::${row.id}`
                        const rule = ruleMap.get(key)
                        return (
                          <td
                            key={t.id}
                            className={cn(
                              'border-r border-border/30 text-center cursor-pointer transition-colors min-w-[40px] sm:min-w-[50px] py-1 sm:py-0',
                              (hoveredCol === t.id || hoveredRow === row.id) ? 'bg-primary/5' : '',
                              'hover:bg-primary/10 active:bg-primary/15',
                            )}
                            onMouseEnter={() => { setHoveredCol(t.id); setHoveredRow(row.id) }}
                            onMouseLeave={() => { setHoveredCol(null); setHoveredRow(null) }}
                            onClick={() => handleCellClick(t.id, row.id === '__all__' ? '__all__' : row.id)}
                            title={rule
                              ? `${t.name} (${t.category})\nValidité: ${rule.override_validity_days ?? t.validity_days ?? '∞'}j${rule.grace_period_days ? ` · Grâce: ${rule.grace_period_days}j` : ''}${rule.renewal_reminder_days ? ` · Rappel: ${rule.renewal_reminder_days}j` : ''}\nPriorité: ${rule.priority === 'high' ? 'Haute' : rule.priority === 'low' ? 'Basse' : 'Normale'}${rule.effective_from ? `\nDepuis: ${new Date(rule.effective_from).toLocaleDateString('fr-FR')}` : ''}\nCliquer pour modifier`
                              : `Cliquer pour ajouter une règle ${t.name}`
                            }
                          >
                            {rule ? (
                              <Check size={14} className={cn('mx-auto', rule.applicability === 'contextual' ? 'text-blue-500 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400')} />
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

      {/* Export wizard */}
      <ExportWizard
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        data={filteredRulesForList.map(rule => {
          const ct = types.find(t => t.id === rule.compliance_type_id)
          const jpVals = rule.target_type === 'job_position' && rule.target_value
            ? rule.target_value.split(',').map(v => jobPositions?.find(p => p.id === v.trim())).filter(Boolean)
            : []
          return {
            type_code: ct?.code ?? '',
            type_name: ct?.name ?? '',
            category: CATEGORY_FULL_LABELS[ct?.category ?? ''] ?? ct?.category ?? '',
            target_type: RULE_TARGET_OPTIONS.find(o => o.value === rule.target_type)?.label ?? rule.target_type,
            target_value_display: rule.target_type === 'all' ? 'Tous' : jpVals.length > 0 ? jpVals.map((p: any) => `${p.code} - ${p.name}`).join(', ') : rule.target_value ?? '',
            priority: PRIORITY_LABELS[rule.priority] ?? rule.priority,
            applicability: rule.applicability === 'contextual' ? 'Contextuelle' : 'Permanente',
            description: rule.description ?? '',
            effective_from: rule.effective_from ?? '',
            effective_to: rule.effective_to ?? '',
          }
        })}
        columns={[
          { id: 'type_code', header: 'Code Type' },
          { id: 'type_name', header: 'Nom Type' },
          { id: 'category', header: 'Categorie' },
          { id: 'target_type', header: 'Cible' },
          { id: 'target_value_display', header: 'Valeur Cible' },
          { id: 'priority', header: 'Priorite' },
          { id: 'applicability', header: 'Applicabilite' },
          { id: 'description', header: 'Description' },
          { id: 'effective_from', header: 'Depuis' },
          { id: 'effective_to', header: "Jusqu'a" },
        ]}
        filenamePrefix="conformite-regles"
      />
    </div>
  )
}

// ── Searchable Select (local) ────────────────────────────────────────────

function SearchableSelect({ value, onChange, options, placeholder, disabled }: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
  const selected = options.find(o => o.value === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(panelInputClass, 'text-left flex items-center justify-between w-full', !value && 'text-muted-foreground')}
      >
        <span className="truncate">{selected?.label || placeholder || '— Sélectionner —'}</span>
        <svg className="w-3 h-3 shrink-0 ml-1" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 sm:max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          <div className="sticky top-0 bg-popover p-1.5 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className={cn(panelInputClass, 'h-8 sm:h-7 text-xs')}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); setSearch('') }}
              className={cn('w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-accent active:bg-accent/80 transition-colors', o.value === value && 'bg-primary/5 text-primary font-medium')}
            >
              {o.group && <span className="text-muted-foreground mr-1">[{o.group}]</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi Searchable Select (local) ─────────────────────────────────────

function MultiSearchableSelect({ values, onChange, options, placeholder, disabled }: {
  values: string[]
  onChange: (vs: string[]) => void
  options: { value: string; label: string; group?: string }[]
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !values.includes(o.value) && o.label.toLowerCase().includes(search.toLowerCase())
  )
  const selectedItems = values.map(v => options.find(o => o.value === v)).filter(Boolean) as typeof options

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(panelInputClass, 'min-h-[32px] h-auto flex flex-wrap items-center gap-1 cursor-text py-1', disabled && 'opacity-50 pointer-events-none')}
        onClick={() => { if (!disabled) setOpen(true) }}
      >
        {selectedItems.map(item => (
          <span key={item.value} className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-[11px] font-medium px-1.5 py-0.5 rounded">
            <span className="truncate max-w-[150px]">{item.label}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onChange(values.filter(v => v !== item.value)) }} className="hover:text-destructive">
              <X size={10} />
            </button>
          </span>
        ))}
        {selectedItems.length === 0 && <span className="text-muted-foreground text-xs">{placeholder || '— Sélectionner —'}</span>}
        <svg className="w-3 h-3 shrink-0 ml-auto text-muted-foreground" viewBox="0 0 12 12"><path d="M3 5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-md border border-border bg-popover shadow-md">
          <div className="sticky top-0 bg-popover p-1.5 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              className={cn(panelInputClass, 'h-8 sm:h-7 text-xs')}
              autoFocus
            />
          </div>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Aucun résultat</div>}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange([...values, o.value]); setSearch('') }}
              className="w-full text-left px-3 py-2 sm:py-1.5 text-xs hover:bg-accent active:bg-accent/80 transition-colors"
            >
              {o.group && <span className="text-muted-foreground mr-1">[{o.group}]</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Rule Form Fields (shared between Create and Edit) ────────────────────

function RuleFormFields({ form, setForm, typesData, jpData, typeReadOnly }: {
  form: Record<string, any>
  setForm: (f: Record<string, any>) => void
  typesData: any
  jpData: any
  typeReadOnly?: boolean
}) {
  const typeOptions = useMemo(() =>
    (typesData?.items ?? []).map((t: any) => ({ value: t.id, label: `${t.code} — ${t.name}`, group: t.category })),
  [typesData])

  const jpOptions = useMemo(() =>
    (jpData?.items ?? []).map((jp: any) => ({ value: jp.id, label: `${jp.code} — ${jp.name}`, group: jp.department })),
  [jpData])

  const ct = typesData?.items?.find((t: any) => t.id === form.compliance_type_id)

  return (
    <PanelContentLayout>
      <FormSection title="Général">
        <FormGrid>
          <DynamicPanelField label="Type de conformité" required span="full">
            {typeReadOnly ? (
              <div className={cn(panelInputClass, 'bg-accent/30 cursor-default')}>
                {ct ? `[${ct.category}] ${ct.code} — ${ct.name}` : '—'}
              </div>
            ) : (
              <SearchableSelect
                value={form.compliance_type_id}
                onChange={(v) => setForm({ ...form, compliance_type_id: v })}
                options={typeOptions}
                placeholder="Rechercher un type..."
              />
            )}
          </DynamicPanelField>
          <DynamicPanelField label="Cible" required>
            <TagSelector
              options={RULE_TARGET_OPTIONS}
              value={form.target_type}
              onChange={(v: string) => setForm({ ...form, target_type: v, target_value: '' })}
            />
          </DynamicPanelField>
          {form.target_type === 'job_position' && (
            <DynamicPanelField label="Fiche(s) de poste" span="full">
              <MultiSearchableSelect
                values={(form.target_value || '').split(',').filter(Boolean)}
                onChange={(vs) => setForm({ ...form, target_value: vs.join(',') })}
                options={jpOptions}
                placeholder="Rechercher et ajouter des postes..."
              />
            </DynamicPanelField>
          )}
          {(form.target_type === 'asset' || form.target_type === 'tier_type' || form.target_type === 'department') && (
            <DynamicPanelField label="Valeur">
              <input type="text" value={form.target_value} onChange={(e) => setForm({ ...form, target_value: e.target.value })} className={panelInputClass} placeholder={form.target_type === 'department' ? 'Nom du département...' : 'Valeur...'} />
            </DynamicPanelField>
          )}
          <DynamicPanelField label="Description" span="full">
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${panelInputClass} min-h-[48px] resize-y`} placeholder="Description de la règle..." rows={2} />
          </DynamicPanelField>
          <DynamicPanelField label="Priorité">
            <TagSelector
              options={[{ value: 'normal', label: 'Normale' }, { value: 'high', label: 'Haute' }, { value: 'low', label: 'Basse' }]}
              value={form.priority}
              onChange={(v: string) => setForm({ ...form, priority: v })}
            />
          </DynamicPanelField>
          <DynamicPanelField label="Applicabilité">
            <TagSelector
              options={[{ value: 'permanent', label: 'Permanente' }, { value: 'contextual', label: 'Contextuelle' }]}
              value={form.applicability ?? 'permanent'}
              onChange={(v: string) => setForm({ ...form, applicability: v })}
            />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title="Validité & Rappels" defaultExpanded={false}>
        <FormGrid>
          <DynamicPanelField label="Entrée en vigueur">
            <input type="date" value={form.effective_from ?? ''} onChange={(e) => setForm({ ...form, effective_from: e.target.value || null })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Fin de validité">
            <input type="date" value={form.effective_to ?? ''} onChange={(e) => setForm({ ...form, effective_to: e.target.value || null })} className={panelInputClass} />
          </DynamicPanelField>
          <DynamicPanelField label="Validité override (jours)">
            <input type="number" value={form.override_validity_days ?? ''} onChange={(e) => setForm({ ...form, override_validity_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="Vide = utilise la valeur du type" />
          </DynamicPanelField>
          <DynamicPanelField label="Période de grâce (jours)">
            <input type="number" value={form.grace_period_days ?? ''} onChange={(e) => setForm({ ...form, grace_period_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="0" />
          </DynamicPanelField>
          <DynamicPanelField label="Rappel renouvellement (jours avant)">
            <input type="number" value={form.renewal_reminder_days ?? ''} onChange={(e) => setForm({ ...form, renewal_reminder_days: e.target.value ? Number(e.target.value) : null })} className={panelInputClass} placeholder="60" />
          </DynamicPanelField>
        </FormGrid>
      </FormSection>

      <FormSection title="Conditions d'application" defaultExpanded={false} collapsible>
        <ConditionBuilder
          value={form.condition_json}
          onChange={(v) => setForm({ ...form, condition_json: v })}
        />
      </FormSection>
    </PanelContentLayout>
  )
}

// ── Edit Rule Panel ──────────────────────────────────────────────────────

function EditRulePanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const updateRule = useUpdateComplianceRule()
  const deleteRule = useDeleteComplianceRule()
  const { hasPermission } = usePermission()
  const canUpdate = hasPermission('conformite.rule.update')
  const canDelete = hasPermission('conformite.rule.delete')
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })
  const rule = dynamicPanel?.data?.rule as ComplianceRule | undefined
  const { data: historyData } = useRuleHistory(rule?.id)

  const [form, setForm] = useState<Record<string, any>>({
    target_type: rule?.target_type ?? 'all',
    target_value: rule?.target_value ?? '',
    description: rule?.description ?? '',
    priority: rule?.priority ?? 'normal',
    applicability: rule?.applicability ?? 'permanent',
    effective_from: rule?.effective_from ?? null,
    effective_to: rule?.effective_to ?? null,
    override_validity_days: rule?.override_validity_days ?? null,
    grace_period_days: rule?.grace_period_days ?? null,
    renewal_reminder_days: rule?.renewal_reminder_days ?? null,
    condition_json: rule?.condition_json ?? null,
    compliance_type_id: rule?.compliance_type_id ?? '',
  })
  const [changeReason, setChangeReason] = useState('')

  if (!rule) return null

  const handleSave = async () => {
    if (!changeReason.trim()) {
      toast({ title: 'Veuillez indiquer la raison de la modification', variant: 'error' })
      return
    }
    try {
      await updateRule.mutateAsync({
        id: rule.id,
        payload: {
          target_type: form.target_type,
          target_value: form.target_value || undefined,
          description: form.description || undefined,
          priority: form.priority,
          applicability: form.applicability,
          effective_from: form.effective_from || undefined,
          effective_to: form.effective_to || undefined,
          override_validity_days: form.override_validity_days,
          grace_period_days: form.grace_period_days,
          renewal_reminder_days: form.renewal_reminder_days,
          condition_json: form.condition_json,
          change_reason: changeReason,
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
    <DynamicPanelShell
      title="Modifier la règle"
      subtitle={`v${rule.version ?? 1}`}
      icon={<Scale size={14} className="text-primary" />}
      actions={
        <>
          {canDelete && (
            <DangerConfirmButton icon={<Trash2 size={12} />} onConfirm={handleDelete} confirmLabel="Supprimer ?">
              Supprimer
            </DangerConfirmButton>
          )}
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          {canUpdate && (
            <PanelActionButton variant="primary" disabled={updateRule.isPending || !changeReason.trim()} onClick={handleSave}>
              {updateRule.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Enregistrer'}
            </PanelActionButton>
          )}
        </>
      }
    >
      <RuleFormFields form={form} setForm={canUpdate ? setForm : () => {}} typesData={typesData} jpData={jpData} typeReadOnly />

      {/* Change reason (required) */}
      {canUpdate && (
        <div className="px-4 pb-2">
          <FormSection title="Modification">
            <DynamicPanelField label="Raison de la modification" required>
              <input type="text" value={changeReason} onChange={(e) => setChangeReason(e.target.value)} className={panelInputClass} placeholder="Ex: Mise à jour durée de validité..." />
            </DynamicPanelField>
          </FormSection>
        </div>
      )}

      {/* Attachments */}
      <div className="px-4 pb-2">
        <FormSection title="Pièces jointes" defaultExpanded={false} collapsible>
          <AttachmentManager ownerType="compliance_rule" ownerId={rule.id} compact />
        </FormSection>
      </div>

      {/* History timeline */}
      <div className="px-4 pb-4">
        <FormSection title="Historique" defaultExpanded={false}>
          {!historyData || historyData.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Aucun historique disponible.</p>
          ) : (
            <div className="border-l-2 border-border ml-2 space-y-0">
              {historyData.map((h: any, i: number) => (
                <div key={i} className="relative pl-5 py-2">
                  <div className="absolute left-[-5px] top-3 w-2 h-2 rounded-full bg-primary" />
                  <div className="text-xs">
                    <span className="font-medium text-foreground">v{h.version}</span>
                    <span className="text-muted-foreground ml-1.5">
                      {h.action === 'created' ? 'Création' : h.action === 'updated' ? 'Modification' : h.action === 'archived' ? 'Archivé' : h.action}
                    </span>
                    <span className="text-muted-foreground ml-1.5">· {new Date(h.changed_at).toLocaleDateString('fr-FR')}</span>
                  </div>
                  {h.change_reason && <p className="text-xs text-muted-foreground mt-0.5 italic">{h.change_reason}</p>}
                </div>
              ))}
            </div>
          )}
        </FormSection>
      </div>

    </DynamicPanelShell>
  )
}

// ── Create Rule Panel ────────────────────────────────────────────────────

function CreateRulePanel() {
  const dynamicPanel = useUIStore((s) => s.dynamicPanel)
  const createRule = useCreateComplianceRule()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { toast } = useToast()
  const { data: typesData } = useComplianceTypes({ page_size: 200 })
  const { data: jpData } = useJobPositions({ page_size: 200 })

  // Pre-fill from matrix click context
  const preType = dynamicPanel?.meta?.prefill_type_id ?? ''
  const preTarget = dynamicPanel?.meta?.prefill_target_type ?? 'job_position'
  const preTargetValue = dynamicPanel?.meta?.prefill_target_value ?? ''

  const [form, setForm] = useState<Record<string, any>>({
    compliance_type_id: preType,
    target_type: preTarget,
    target_value: preTargetValue,
    description: '',
    priority: 'normal',
    applicability: 'permanent',
    effective_from: null,
    effective_to: null,
    override_validity_days: null,
    grace_period_days: null,
    renewal_reminder_days: null,
    condition_json: null,
  })

  const handleCreate = async () => {
    if (!form.compliance_type_id) return
    try {
      await createRule.mutateAsync({
        compliance_type_id: form.compliance_type_id,
        target_type: form.target_type,
        target_value: form.target_value || undefined,
        description: form.description || undefined,
        priority: form.priority,
        applicability: form.applicability,
        effective_from: form.effective_from || undefined,
        effective_to: form.effective_to || undefined,
        override_validity_days: form.override_validity_days,
        grace_period_days: form.grace_period_days,
        renewal_reminder_days: form.renewal_reminder_days,
        condition_json: form.condition_json,
      })
      toast({ title: 'Règle créée', variant: 'success' })
      closeDynamicPanel()
    } catch {
      toast({ title: 'Erreur', variant: 'error' })
    }
  }

  return (
    <DynamicPanelShell
      title="Nouvelle règle"
      subtitle="Conformité"
      icon={<Scale size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>Annuler</PanelActionButton>
          <PanelActionButton variant="primary" disabled={!form.compliance_type_id || createRule.isPending} onClick={handleCreate}>
            {createRule.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Créer'}
          </PanelActionButton>
        </>
      }
    >
      <RuleFormFields form={form} setForm={setForm} typesData={typesData} jpData={jpData} />
      <div className="px-4 pb-2">
        <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
          <Paperclip size={11} /> Les pièces jointes pourront être ajoutées après la création de la règle.
        </p>
      </div>
    </DynamicPanelShell>
  )
}

// ── Verifications Tab ────────────────────────────────────────────────────

const VERIFICATION_STATUS_OPTIONS = [
  { value: 'pending', label: 'En attente' },
  { value: 'verified', label: 'Vérifié' },
  { value: 'rejected', label: 'Rejeté' },
]

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
  const { data: pendingData, isLoading: pendingLoading } = usePendingVerifications()
  const { data: historyData, isLoading: historyLoading } = useVerificationHistory(1, 200)
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [verSearch, setVerSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const { openDynamicPanel } = useUIStore()

  // Merge pending + history into a unified list
  const allItems = useMemo(() => {
    const pending = (pendingData?.items ?? []).map((item) => ({
      ...item,
      verification_status: 'pending' as string,
      verified_by_name: null as string | null,
      verified_at: null as string | null,
      verification_notes: null as string | null,
    }))
    const history = (historyData?.items ?? []).map((item) => ({
      ...item,
      submitted_at: item.verified_at || '',
      attachment_count: 0,
    }))
    // Deduplicate by id (pending takes priority)
    const seen = new Set<string>()
    const merged: typeof pending = []
    for (const item of pending) { seen.add(item.id); merged.push(item) }
    for (const item of history) { if (!seen.has(item.id)) merged.push(item as any) }
    return merged
  }, [pendingData, historyData])

  // Filter by status
  const filteredItems = useMemo(() => {
    if (!statusFilter) return allItems
    return allItems.filter((i) => i.verification_status === statusFilter)
  }, [allItems, statusFilter])

  const isLoading = pendingLoading || historyLoading

  const handleVerify = async (recordType: string, recordId: string) => {
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'verify' })
      toast({ title: 'Verifie', variant: 'success' })
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }

  const handleReject = async (recordType: string, recordId: string) => {
    if (!rejectReason.trim()) return
    try {
      await verifyRecord.mutateAsync({ recordType, recordId, action: 'reject', rejectionReason: rejectReason })
      toast({ title: 'Rejete', variant: 'success' })
      setRejectingId(null); setRejectReason('')
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const verFilters: DataTableFilterDef[] = useMemo(() => [
    { id: 'verification_status', label: 'Statut', type: 'select', options: VERIFICATION_STATUS_OPTIONS },
  ], [])

  const verColumns: ColumnDef<Record<string, any>>[] = useMemo(() => [
    {
      accessorKey: 'owner_name',
      header: 'Personne',
      size: 160,
      cell: ({ row }) => {
        const name = row.original.owner_name || 'Inconnu'
        const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
        return (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">{initials}</div>
            <span className="truncate">{name}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'record_type',
      header: 'Type',
      size: 120,
      cell: ({ row }) => (
        <span className="gl-badge gl-badge-neutral text-[9px]">{RECORD_TYPE_LABELS[row.original.record_type] || row.original.record_type}</span>
      ),
    },
    { accessorKey: 'description', header: 'Description', size: 220 },
    {
      accessorKey: 'verification_status',
      header: 'Statut',
      size: 100,
      cell: ({ row }) => {
        const s = row.original.verification_status
        const cls = s === 'pending' ? 'gl-badge-warning' : s === 'verified' ? 'gl-badge-success' : 'gl-badge-danger'
        const label = s === 'pending' ? 'En attente' : s === 'verified' ? 'Vérifié' : 'Rejeté'
        return <span className={cn('gl-badge text-[9px]', cls)}>{label}</span>
      },
    },
    {
      accessorKey: 'issuer',
      header: 'Emetteur',
      size: 130,
      cell: ({ row }) => <span className="truncate">{(row.original as any).issuer as string || '—'}</span>,
    },
    {
      accessorKey: 'submitted_at',
      header: 'Date',
      size: 100,
      cell: ({ row }) => fmtDate((row.original as any).issued_at as string || row.original.submitted_at),
    },
    {
      accessorKey: 'expires_at',
      header: 'Expiration',
      size: 100,
      cell: ({ row }) => {
        const exp = (row.original as any).expires_at as string | null
        if (!exp) return <span className="text-muted-foreground">—</span>
        const d = new Date(exp)
        const now = new Date()
        const days = Math.ceil((d.getTime() - now.getTime()) / 86400000)
        const color = days < 0 ? 'text-red-500' : days < 30 ? 'text-orange-500' : 'text-foreground'
        return <span className={color}>{fmtDate(exp)}</span>
      },
    },
    {
      accessorKey: 'verified_by_name',
      header: 'Par',
      size: 120,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.verified_by_name || '—'}</span>,
    },
    {
      id: 'actions',
      header: '',
      size: 70,
      cell: ({ row }) => {
        const item = row.original
        if (item.verification_status !== 'pending') return null
        const isRejecting = rejectingId === item.id
        if (isRejecting) {
          return (
            <div className="flex items-center gap-1">
              <input
                type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motif..." className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background w-24" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleReject(item.record_type, item.id) }}
              />
              <button onClick={() => handleReject(item.record_type, item.id)} disabled={!rejectReason.trim()} className="p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Check size={11} /></button>
              <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="p-0.5 rounded text-muted-foreground hover:bg-muted"><X size={11} /></button>
            </div>
          )
        }
        return (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); handleVerify(item.record_type, item.id) }} className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" title="Verifier"><Check size={13} /></button>
            <button onClick={(e) => { e.stopPropagation(); setRejectingId(item.id) }} className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Rejeter"><X size={13} /></button>
          </div>
        )
      },
    },
  ], [rejectingId, rejectReason])

  const verPagination: DataTablePagination = {
    page: 1,
    pageSize: filteredItems.length || 50,
    total: filteredItems.length,
    pages: 1,
  }

  return (
    <DataTable<Record<string, any>>
      columns={verColumns}
      data={filteredItems}
      isLoading={isLoading}
      pagination={verPagination}
      searchValue={verSearch}
      onSearchChange={setVerSearch}
      searchPlaceholder="Rechercher par personne, type, description..."
      filters={verFilters}
      activeFilters={{ verification_status: statusFilter || undefined } as Record<string, unknown>}
      onFilterChange={(id, value) => { if (id === 'verification_status') setStatusFilter(value as string || '') }}
      onRowClick={(row) => {
        if (row.verification_status === 'pending') {
          openDynamicPanel({
            type: 'detail', module: 'conformite', id: row.id,
            meta: { subtype: 'verification', record_type: row.record_type },
          })
        }
      }}
      emptyIcon={ClipboardCheck}
      emptyTitle={statusFilter === 'pending' ? 'Aucune verification en attente' : 'Aucun resultat'}
      columnResizing
      columnVisibility
      storageKey="conformite-verifications"
    />
  )
}

// -- Verification Detail Panel ------------------------------------------------

function VerificationHistorySection({ ownerId, recordType, currentId }: { ownerId: string; recordType: string; currentId: string }) {
  const { data } = useVerificationHistory(1, 10, { owner_id: ownerId, record_type: recordType })
  const items = (data?.items ?? []).filter((i) => i.id !== currentId)

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  if (items.length === 0) return null

  return (
    <FormSection title="Historique">
      <div className="space-y-1.5">
        {items.map((h) => (
          <div key={h.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/30 text-xs">
            <span className={cn(
              'h-2 w-2 rounded-full shrink-0',
              h.verification_status === 'verified' ? 'bg-emerald-500' : 'bg-red-400',
            )} />
            <span className="flex-1 min-w-0 truncate text-foreground">{h.description}</span>
            <span className="text-muted-foreground tabular-nums shrink-0">{fmtDate(h.verified_at)}</span>
            <span className="text-muted-foreground shrink-0">{h.verified_by_name || '—'}</span>
          </div>
        ))}
      </div>
    </FormSection>
  )
}

function VerificationDetailPanel({ id, recordType: _recordType }: { id: string; recordType: string }) {
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const { data } = usePendingVerifications()
  const verifyRecord = useVerifyRecord()
  const { toast } = useToast()
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)

  const items = data?.items ?? []
  const item = items.find((i) => i.id === id)
  const currentIdx = items.findIndex((i) => i.id === id)

  const { openDynamicPanel } = useUIStore()

  const goTo = (idx: number) => {
    const target = items[idx]
    if (target) {
      openDynamicPanel({
        type: 'detail', module: 'conformite', id: target.id,
        meta: { subtype: 'verification', record_type: target.record_type },
      })
    }
  }

  const fmtDate = (d: string | null | undefined) => {
    if (!d) return '—'
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) }
    catch { return '—' }
  }

  const handleVerify = async () => {
    if (!item) return
    try {
      await verifyRecord.mutateAsync({ recordType: item.record_type, recordId: item.id, action: 'verify' })
      toast({ title: 'Document verifie', variant: 'success' })
      // Navigate to next or close
      if (currentIdx < items.length - 1) goTo(currentIdx + 1)
      else closeDynamicPanel()
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }

  const handleReject = async () => {
    if (!item || !rejectReason.trim()) return
    try {
      await verifyRecord.mutateAsync({ recordType: item.record_type, recordId: item.id, action: 'reject', rejectionReason: rejectReason })
      toast({ title: 'Document rejete', variant: 'success' })
      setShowReject(false); setRejectReason('')
      if (currentIdx < items.length - 1) goTo(currentIdx + 1)
      else closeDynamicPanel()
    } catch { toast({ title: 'Erreur', variant: 'error' }) }
  }

  if (!item) {
    return (
      <DynamicPanelShell title="Verification" onClose={closeDynamicPanel}>
        <p className="text-sm text-muted-foreground p-4">Document non trouve ou deja traite.</p>
      </DynamicPanelShell>
    )
  }

  return (
    <DynamicPanelShell
      title={`${RECORD_TYPE_LABELS[item.record_type] || item.record_type}`}
      subtitle={item.owner_name || 'Inconnu'}
      onClose={closeDynamicPanel}
      headerRight={
        <div className="flex items-center gap-1">
          {/* Navigation prev/next */}
          <span className="text-[10px] text-muted-foreground tabular-nums mr-1">{currentIdx + 1}/{items.length}</span>
          <button onClick={() => goTo(currentIdx - 1)} disabled={currentIdx <= 0} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={() => goTo(currentIdx + 1)} disabled={currentIdx >= items.length - 1} className="p-1 rounded hover:bg-muted disabled:opacity-30 text-muted-foreground">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <div className="w-px h-4 bg-border/60 mx-1" />
          {/* Action buttons */}
          <button onClick={handleVerify} disabled={verifyRecord.isPending} className="gl-button-sm gl-button-confirm">
            {verifyRecord.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Verifier
          </button>
          <button onClick={() => setShowReject(true)} className="gl-button-sm gl-button-danger">
            <X size={11} /> Rejeter
          </button>
        </div>
      }
    >
      <PanelContentLayout>
        {/* ── Record info ── */}
        <DetailFieldGrid>
          <ReadOnlyRow label="Personne" value={item.owner_name || 'Inconnu'} />
          <ReadOnlyRow label="Type" value={RECORD_TYPE_LABELS[item.record_type] || item.record_type} />
          <ReadOnlyRow label="Description" value={item.description} />
          <ReadOnlyRow label="Emetteur" value={(item as any).issuer || '—'} />
          <ReadOnlyRow label="Reference" value={(item as any).reference_number || '—'} />
          <ReadOnlyRow label="Date emission" value={fmtDate((item as any).issued_at)} />
          <ReadOnlyRow label="Expiration" value={fmtDate((item as any).expires_at)} />
          <ReadOnlyRow label="Soumis le" value={fmtDate(item.submitted_at)} />
        </DetailFieldGrid>

        {/* ── Attachments ── */}
        <FormSection title="Pieces jointes">
          <AttachmentManager ownerType={item.record_type} ownerId={item.id} compact readOnly />
        </FormSection>

        {/* ── Historique ── */}
        {item.owner_id && (
          <VerificationHistorySection ownerId={item.owner_id} recordType={item.record_type} currentId={item.id} />
        )}

        {/* ── Reject form (shown inline when reject button clicked) ── */}
        {showReject && (
          <div className="border border-red-200 dark:border-red-800/40 rounded-lg p-3 bg-red-50/50 dark:bg-red-900/10 space-y-2">
            <label className="gl-label text-red-600">Motif du rejet</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Expliquez pourquoi ce document est rejete..."
              className="gl-form-input min-h-[60px]"
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button onClick={() => { setShowReject(false); setRejectReason('') }} className="gl-button-sm gl-button-default">Annuler</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || verifyRecord.isPending} className="gl-button-sm gl-button-danger">
                {verifyRecord.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        )}
      </PanelContentLayout>
    </DynamicPanelShell>
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
  if (view.type === 'detail' && 'id' in view && view.meta?.subtype === 'verification') return <VerificationDetailPanel id={view.id} recordType={view.meta?.record_type as string || ''} />
  return null
})
