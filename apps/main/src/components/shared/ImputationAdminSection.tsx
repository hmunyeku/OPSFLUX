import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { useToast } from '@/components/ui/Toast'
import { DataTable } from '@/components/ui/DataTable/DataTable'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ExportWizard } from '@/components/shared/ExportWizard'
import { ImportWizard } from '@/components/shared/ImportWizard'
import { useProjects } from '@/hooks/useProjets'
import { useGroups } from '@/hooks/useRbac'
import { useUsers } from '@/hooks/useUsers'
import {
  useBusinessUnits,
  useCreateImputationAssignment,
  useCostCenters,
  useCreateImputationOtpTemplate,
  useCreateImputationReference,
  useDeleteImputationAssignment,
  useDeleteImputationOtpTemplate,
  useDeleteImputationReference,
  useImputationAssignments,
  useImputationOtpTemplates,
  useImputationReferences,
  useUpdateImputationAssignment,
  useUpdateImputationOtpTemplate,
  useUpdateImputationReference,
} from '@/hooks/useSettings'

const panelInputClass = 'gl-form-input text-sm'
const panelSelectClass = 'gl-form-select text-sm'

export function ImputationAdminSection() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: references, isLoading: referencesLoading } = useImputationReferences()
  const { data: templates, isLoading: templatesLoading } = useImputationOtpTemplates()
  const { data: assignments, isLoading: assignmentsLoading } = useImputationAssignments()
  const { data: projectsData } = useProjects({ page_size: 200 })
  const { data: usersData } = useUsers({ page: 1, page_size: 200, active: true })
  const { data: groupsData } = useGroups({ page: 1, page_size: 200 })
  const { data: businessUnitsData } = useBusinessUnits({ page: 1, page_size: 200 })
  const { data: costCentersData } = useCostCenters({ page_size: 200 })
  const createAssignment = useCreateImputationAssignment()
  const createReference = useCreateImputationReference()
  const updateAssignment = useUpdateImputationAssignment()
  const updateReference = useUpdateImputationReference()
  const deleteAssignment = useDeleteImputationAssignment()
  const deleteReference = useDeleteImputationReference()
  const createTemplate = useCreateImputationOtpTemplate()
  const updateTemplate = useUpdateImputationOtpTemplate()
  const deleteTemplate = useDeleteImputationOtpTemplate()

  const [referenceForm, setReferenceForm] = useState({
    code: '',
    name: '',
    imputation_type: 'OPEX',
    otp_policy: 'forbidden',
    otp_template_id: '',
    default_project_id: '',
    default_cost_center_id: '',
  })
  const [templateForm, setTemplateForm] = useState({
    code: '',
    name: '',
    rubrics: '',
  })
  const [assignmentForm, setAssignmentForm] = useState({
    imputation_reference_id: '',
    target_type: 'business_unit',
    target_id: '',
    priority: '100',
    valid_from: '',
    valid_to: '',
    notes: '',
    active: true,
  })
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null)
  const [showReferenceImport, setShowReferenceImport] = useState(false)
  const [showTemplateImport, setShowTemplateImport] = useState(false)
  const [showAssignmentImport, setShowAssignmentImport] = useState(false)
  const [referenceExportOpen, setReferenceExportOpen] = useState(false)
  const [templateExportOpen, setTemplateExportOpen] = useState(false)
  const [assignmentExportOpen, setAssignmentExportOpen] = useState(false)
  const [showReferenceForm, setShowReferenceForm] = useState(false)
  const [showTemplateForm, setShowTemplateForm] = useState(false)
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)

  const projectOptions = useMemo(
    () => (projectsData?.items ?? []).map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
    [projectsData],
  )
  const userOptions = useMemo(
    () => (usersData?.items ?? []).map((user) => ({ value: user.id, label: `${user.first_name} ${user.last_name} — ${user.email}` })),
    [usersData],
  )
  const groupOptions = useMemo(
    () => (groupsData?.items ?? []).map((group) => ({ value: group.id, label: group.name })),
    [groupsData],
  )
  const businessUnitOptions = useMemo(
    () => (businessUnitsData?.items ?? []).map((bu) => ({ value: bu.id, label: `${bu.code} — ${bu.name}` })),
    [businessUnitsData],
  )
  const costCenterOptions = useMemo(
    () => (costCentersData?.items ?? []).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    [costCentersData],
  )
  const templateLabelById = useMemo(
    () => Object.fromEntries((templates ?? []).map((template) => [template.id, `${template.code} — ${template.name}`])),
    [templates],
  )
  const projectLabelById = useMemo(
    () => Object.fromEntries(projectOptions.map((project) => [project.value, project.label])),
    [projectOptions],
  )
  const costCenterLabelById = useMemo(
    () => Object.fromEntries(costCenterOptions.map((costCenter) => [costCenter.value, costCenter.label])),
    [costCenterOptions],
  )
  const referenceLabelById = useMemo(
    () => Object.fromEntries((references ?? []).map((reference) => [reference.id, `${reference.code} — ${reference.name}`])),
    [references],
  )
  const userLabelById = useMemo(
    () => Object.fromEntries(userOptions.map((user) => [user.value, user.label])),
    [userOptions],
  )
  const groupLabelById = useMemo(
    () => Object.fromEntries(groupOptions.map((group) => [group.value, group.label])),
    [groupOptions],
  )
  const businessUnitLabelById = useMemo(
    () => Object.fromEntries(businessUnitOptions.map((bu) => [bu.value, bu.label])),
    [businessUnitOptions],
  )
  const referenceExportData = useMemo(
    () =>
      (references ?? []).map((reference) => ({
        code: reference.code,
        name: reference.name,
        description: reference.description ?? '',
        imputation_type: reference.imputation_type,
        otp_policy: reference.otp_policy,
        otp_template: reference.otp_template_id ? (templateLabelById[reference.otp_template_id] ?? reference.otp_template_id) : '',
        default_project: reference.default_project_id ? (projectLabelById[reference.default_project_id] ?? reference.default_project_id) : '',
        default_cost_center: reference.default_cost_center_id ? (costCenterLabelById[reference.default_cost_center_id] ?? reference.default_cost_center_id) : '',
        valid_from: reference.valid_from ?? '',
        valid_to: reference.valid_to ?? '',
        active: reference.active ? t('common.active') : t('common.inactive'),
      })),
    [references, t, templateLabelById, projectLabelById, costCenterLabelById],
  )
  const templateExportData = useMemo(
    () =>
      (templates ?? []).map((template) => ({
        code: template.code,
        name: template.name,
        description: template.description ?? '',
        rubrics: template.rubrics.join(', '),
        active: template.active ? t('common.active') : t('common.inactive'),
      })),
    [templates, t],
  )
  const assignmentExportData = useMemo(
    () =>
      (assignments ?? []).map((assignment) => ({
        target_type: assignment.target_type,
        target_id:
          assignment.target_type === 'user'
            ? (userLabelById[assignment.target_id] ?? assignment.target_id)
            : assignment.target_type === 'user_group'
              ? (groupLabelById[assignment.target_id] ?? assignment.target_id)
              : assignment.target_type === 'business_unit'
                ? (businessUnitLabelById[assignment.target_id] ?? assignment.target_id)
                : (projectLabelById[assignment.target_id] ?? assignment.target_id),
        imputation_reference_id: assignment.imputation_reference_id,
        priority: assignment.priority,
        valid_from: assignment.valid_from ?? '',
        valid_to: assignment.valid_to ?? '',
        active: assignment.active ? t('common.active') : t('common.inactive'),
        notes: assignment.notes ?? '',
      })),
    [assignments, t, userLabelById, groupLabelById, businessUnitLabelById, projectLabelById],
  )

  const handleCreateReference = () => {
    createReference.mutate(
      {
        code: referenceForm.code.trim(),
        name: referenceForm.name.trim(),
        imputation_type: referenceForm.imputation_type as 'OPEX' | 'SOPEX' | 'CAPEX' | 'OTHER',
        otp_policy: referenceForm.otp_policy as 'forbidden' | 'required' | 'optional',
        otp_template_id: referenceForm.otp_template_id || null,
        default_project_id: referenceForm.default_project_id || null,
        default_cost_center_id: referenceForm.default_cost_center_id || null,
      },
      {
        onSuccess: () => {
          setReferenceForm({
            code: '',
            name: '',
            imputation_type: 'OPEX',
            otp_policy: 'forbidden',
            otp_template_id: '',
            default_project_id: '',
            default_cost_center_id: '',
          })
          setShowReferenceForm(false)
          toast({ title: t('settings.imputations.reference_created'), variant: 'success' })
        },
        onError: (error: unknown) => {
          const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast({
            title: t('settings.imputations.error_title'),
            description: detail || t('settings.imputations.reference_create_error'),
            variant: 'error',
          })
        },
      },
    )
  }

  const handleCreateTemplate = () => {
    createTemplate.mutate(
      {
        code: templateForm.code.trim(),
        name: templateForm.name.trim(),
        rubrics: templateForm.rubrics
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      },
      {
        onSuccess: () => {
          setTemplateForm({ code: '', name: '', rubrics: '' })
          setShowTemplateForm(false)
          toast({ title: t('settings.imputations.template_created'), variant: 'success' })
        },
        onError: (error: unknown) => {
          const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
          toast({
            title: t('settings.imputations.error_title'),
            description: detail || t('settings.imputations.template_create_error'),
            variant: 'error',
          })
        },
      },
    )
  }

  const assignmentTargetOptions =
    assignmentForm.target_type === 'user'
      ? userOptions
      : assignmentForm.target_type === 'user_group'
        ? groupOptions
        : assignmentForm.target_type === 'business_unit'
          ? businessUnitOptions
          : projectOptions

  const resetAssignmentForm = () => {
    setAssignmentForm({
      imputation_reference_id: '',
      target_type: 'business_unit',
      target_id: '',
      priority: '100',
      valid_from: '',
      valid_to: '',
      notes: '',
      active: true,
    })
    setEditingAssignmentId(null)
    setShowAssignmentForm(false)
  }

  const handleSaveAssignment = () => {
    const payload = {
      imputation_reference_id: assignmentForm.imputation_reference_id,
      target_type: assignmentForm.target_type as 'user' | 'user_group' | 'business_unit' | 'project',
      target_id: assignmentForm.target_id,
      priority: Number.parseInt(assignmentForm.priority, 10) || 100,
      valid_from: assignmentForm.valid_from || null,
      valid_to: assignmentForm.valid_to || null,
      notes: assignmentForm.notes.trim() || null,
      active: assignmentForm.active,
    }

    const onSuccess = () => {
      resetAssignmentForm()
      toast({
        title: editingAssignmentId
          ? t('settings.imputations.assignment_updated')
          : t('settings.imputations.assignment_created'),
        variant: 'success',
      })
    }
    const onError = (error: unknown) => {
      const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({
        title: t('settings.imputations.error_title'),
        description: detail || t('settings.imputations.assignment_save_error'),
        variant: 'error',
      })
    }

    if (editingAssignmentId) {
      updateAssignment.mutate({ id: editingAssignmentId, payload }, { onSuccess, onError })
      return
    }

    createAssignment.mutate(payload, { onSuccess, onError })
  }

  const handleEditAssignment = (assignment: NonNullable<typeof assignments>[number]) => {
    setEditingAssignmentId(assignment.id)
    setAssignmentForm({
      imputation_reference_id: assignment.imputation_reference_id,
      target_type: assignment.target_type,
      target_id: assignment.target_id,
      priority: String(assignment.priority),
      valid_from: assignment.valid_from ?? '',
      valid_to: assignment.valid_to ?? '',
      notes: assignment.notes ?? '',
      active: assignment.active,
    })
    setShowAssignmentForm(true)
  }

  const handleDeleteAssignment = (assignmentId: string) => {
    deleteAssignment.mutate(assignmentId, {
      onError: (error: unknown) => {
        const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        toast({
          title: t('settings.imputations.error_title'),
          description: detail || t('settings.imputations.assignment_delete_error'),
          variant: 'error',
        })
      },
    })
  }

  const resolveTargetLabel = (targetType: string, targetId: string) => {
    switch (targetType) {
      case 'user':
        return userLabelById[targetId] ?? targetId
      case 'user_group':
        return groupLabelById[targetId] ?? targetId
      case 'business_unit':
        return businessUnitLabelById[targetId] ?? targetId
      default:
        return projectLabelById[targetId] ?? targetId
    }
  }

  const isBusy =
    referencesLoading ||
    templatesLoading ||
    assignmentsLoading ||
    createReference.isPending ||
    createTemplate.isPending ||
    createAssignment.isPending ||
    updateAssignment.isPending ||
    deleteAssignment.isPending

  // ── Column definitions ──────────────────────────────────────

  type ReferenceRow = NonNullable<typeof references>[number]
  type TemplateRow = NonNullable<typeof templates>[number]
  type AssignmentRow = NonNullable<typeof assignments>[number]

  const referenceColumns = useMemo<ColumnDef<ReferenceRow, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('settings.imputations.reference_code'),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
        size: 120,
      },
      {
        accessorKey: 'name',
        header: t('settings.imputations.reference_name'),
        size: 200,
      },
      {
        accessorKey: 'imputation_type',
        header: t('settings.imputations.reference_type'),
        cell: ({ getValue }) => {
          const type = getValue<string>()
          const variant =
            type === 'CAPEX' ? 'gl-badge gl-badge-success' :
            type === 'OPEX' ? 'gl-badge gl-badge-neutral' :
            'gl-badge gl-badge-neutral'
          return <span className={variant}>{type}</span>
        },
        size: 100,
      },
      {
        accessorKey: 'otp_policy',
        header: t('settings.imputations.otp_policy'),
        cell: ({ getValue }) => <span className="text-xs">{getValue<string>()}</span>,
        size: 100,
      },
      {
        accessorKey: 'active',
        header: t('common.status'),
        cell: ({ getValue }) => {
          const active = getValue<boolean>()
          return (
            <span className={active ? 'gl-badge gl-badge-success' : 'gl-badge gl-badge-neutral'}>
              {active ? t('common.active') : t('common.inactive')}
            </span>
          )
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-secondary"
              onClick={() => updateReference.mutate({ id: row.original.id, payload: { active: !row.original.active } })}
            >
              {row.original.active ? t('common.deactivate') : t('common.activate')}
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-danger"
              onClick={() => deleteReference.mutate(row.original.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
        size: 160,
      },
    ],
    [t, updateReference, deleteReference],
  )

  const templateColumns = useMemo<ColumnDef<TemplateRow, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('settings.imputations.template_code'),
        cell: ({ getValue }) => <span className="font-mono text-xs">{getValue<string>()}</span>,
        size: 120,
      },
      {
        accessorKey: 'name',
        header: t('settings.imputations.template_name'),
        size: 200,
      },
      {
        accessorKey: 'rubrics',
        header: t('settings.imputations.template_rubrics'),
        cell: ({ getValue }) => {
          const rubrics = getValue<string[]>()
          const text = rubrics.join(', ')
          return <span className="text-xs truncate max-w-[200px] block" title={text}>{text || '—'}</span>
        },
        size: 200,
      },
      {
        accessorKey: 'active',
        header: t('common.status'),
        cell: ({ getValue }) => {
          const active = getValue<boolean>()
          return (
            <span className={active ? 'gl-badge gl-badge-success' : 'gl-badge gl-badge-neutral'}>
              {active ? t('common.active') : t('common.inactive')}
            </span>
          )
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-secondary"
              onClick={() => updateTemplate.mutate({ id: row.original.id, payload: { active: !row.original.active } })}
            >
              {row.original.active ? t('common.deactivate') : t('common.activate')}
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-danger"
              onClick={() => deleteTemplate.mutate(row.original.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
        size: 160,
      },
    ],
    [t, updateTemplate, deleteTemplate],
  )

  const assignmentColumns = useMemo<ColumnDef<AssignmentRow, unknown>[]>(
    () => [
      {
        id: 'target',
        header: t('settings.imputations.assignment_target_id'),
        cell: ({ row }) => (
          <span className="text-sm">{resolveTargetLabel(row.original.target_type, row.original.target_id)}</span>
        ),
        size: 220,
      },
      {
        accessorKey: 'target_type',
        header: t('settings.imputations.assignment_target_type'),
        cell: ({ getValue }) => {
          const type = getValue<string>()
          return <span className="gl-badge gl-badge-neutral">{type}</span>
        },
        size: 120,
      },
      {
        accessorKey: 'imputation_reference_id',
        header: t('settings.imputations.assignment_reference'),
        cell: ({ getValue }) => {
          const refId = getValue<string>()
          return <span className="text-xs">{referenceLabelById[refId] ?? refId}</span>
        },
        size: 200,
      },
      {
        accessorKey: 'priority',
        header: t('settings.imputations.assignment_priority'),
        size: 80,
      },
      {
        id: 'period',
        header: t('settings.imputations.valid_from'),
        cell: ({ row }) => (
          <span className="text-xs">
            {row.original.valid_from || '—'} → {row.original.valid_to || '—'}
          </span>
        ),
        size: 180,
      },
      {
        accessorKey: 'active',
        header: t('common.status'),
        cell: ({ getValue }) => {
          const active = getValue<boolean>()
          return (
            <span className={active ? 'gl-badge gl-badge-success' : 'gl-badge gl-badge-neutral'}>
              {active ? t('common.active') : t('common.inactive')}
            </span>
          )
        },
        size: 100,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-secondary"
              onClick={() => handleEditAssignment(row.original)}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="gl-button gl-button-sm gl-button-danger"
              onClick={() => handleDeleteAssignment(row.original.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ),
        size: 120,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, referenceLabelById, userLabelById, groupLabelById, businessUnitLabelById, projectLabelById],
  )

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── References Section ──────────────────────────────── */}
      <CollapsibleSection
        id="imputation-references"
        title={t('settings.imputations.references_title')}
        description={t('settings.imputations.references_description')}
        defaultExpanded
      >
        {/* Toolbar */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setShowReferenceImport(true)}
          >
            <Upload size={14} className="mr-1" />
            {t('settings.imputations.import_references')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setReferenceExportOpen(true)}
            disabled={(references?.length ?? 0) === 0}
          >
            <Download size={14} className="mr-1" />
            {t('settings.imputations.export_references')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-confirm"
            onClick={() => setShowReferenceForm((v) => !v)}
          >
            {showReferenceForm ? <X size={14} className="mr-1" /> : <Plus size={14} className="mr-1" />}
            {showReferenceForm ? t('common.cancel') : t('settings.imputations.create_reference')}
          </button>
        </div>

        {/* Collapsible create form */}
        {showReferenceForm && (
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 mb-4 space-y-3">
            <h4 className="text-sm font-semibold">{t('settings.imputations.create_reference')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.reference_code')}</label>
                <input
                  className={panelInputClass}
                  value={referenceForm.code}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, code: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.reference_name')}</label>
                <input
                  className={panelInputClass}
                  value={referenceForm.name}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.reference_type')}</label>
                <select
                  className={panelSelectClass}
                  value={referenceForm.imputation_type}
                  onChange={(e) => setReferenceForm((s) => ({
                    ...s,
                    imputation_type: e.target.value,
                    otp_policy: e.target.value === 'CAPEX' ? s.otp_policy : 'forbidden',
                    otp_template_id: e.target.value === 'CAPEX' ? s.otp_template_id : '',
                  }))}
                >
                  {['OPEX', 'SOPEX', 'CAPEX', 'OTHER'].map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.otp_policy')}</label>
                <select
                  className={panelSelectClass}
                  value={referenceForm.otp_policy}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, otp_policy: e.target.value }))}
                  disabled={referenceForm.imputation_type !== 'CAPEX'}
                >
                  <option value="forbidden">{t('settings.imputations.otp_forbidden')}</option>
                  <option value="optional">{t('settings.imputations.otp_optional')}</option>
                  <option value="required">{t('settings.imputations.otp_required')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.template_code')}</label>
                <select
                  className={panelSelectClass}
                  value={referenceForm.otp_template_id}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, otp_template_id: e.target.value }))}
                  disabled={referenceForm.imputation_type !== 'CAPEX'}
                >
                  <option value="">{t('settings.imputations.no_otp_template')}</option>
                  {(templates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>{template.code} — {template.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.default_project')}</label>
                <select
                  className={panelSelectClass}
                  value={referenceForm.default_project_id}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, default_project_id: e.target.value }))}
                >
                  <option value="">{t('settings.imputations.no_default_project')}</option>
                  {projectOptions.map((project) => (
                    <option key={project.value} value={project.value}>{project.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.default_cost_center')}</label>
                <select
                  className={panelSelectClass}
                  value={referenceForm.default_cost_center_id}
                  onChange={(e) => setReferenceForm((s) => ({ ...s, default_cost_center_id: e.target.value }))}
                >
                  <option value="">{t('settings.imputations.no_default_cost_center')}</option>
                  {costCenterOptions.map((costCenter) => (
                    <option key={costCenter.value} value={costCenter.value}>{costCenter.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="gl-button gl-button-confirm"
                onClick={handleCreateReference}
                disabled={!referenceForm.code.trim() || !referenceForm.name.trim() || createReference.isPending}
              >
                {createReference.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                <Plus size={14} className="mr-1" />
                {t('settings.imputations.create_reference')}
              </button>
              <button
                type="button"
                className="gl-button gl-button-secondary"
                onClick={() => setShowReferenceForm(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* DataTable */}
        <DataTable
          columns={referenceColumns}
          data={references ?? []}
          isLoading={referencesLoading}
          storageKey="imputation-references-table"
          emptyTitle={t('settings.imputations.no_references')}
          compact
        />
      </CollapsibleSection>

      {/* ── Templates Section ──────────────────────────────── */}
      <CollapsibleSection
        id="imputation-templates"
        title={t('settings.imputations.templates_title')}
        description={t('settings.imputations.templates_description')}
        defaultExpanded
      >
        {/* Toolbar */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setShowTemplateImport(true)}
          >
            <Upload size={14} className="mr-1" />
            {t('settings.imputations.import_templates')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setTemplateExportOpen(true)}
            disabled={(templates?.length ?? 0) === 0}
          >
            <Download size={14} className="mr-1" />
            {t('settings.imputations.export_templates')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-confirm"
            onClick={() => setShowTemplateForm((v) => !v)}
          >
            {showTemplateForm ? <X size={14} className="mr-1" /> : <Plus size={14} className="mr-1" />}
            {showTemplateForm ? t('common.cancel') : t('settings.imputations.create_template')}
          </button>
        </div>

        {/* Collapsible create form */}
        {showTemplateForm && (
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 mb-4 space-y-3">
            <h4 className="text-sm font-semibold">{t('settings.imputations.create_template')}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.template_code')}</label>
                <input
                  className={panelInputClass}
                  value={templateForm.code}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, code: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.template_name')}</label>
                <input
                  className={panelInputClass}
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.template_rubrics')}</label>
                <input
                  className={panelInputClass}
                  value={templateForm.rubrics}
                  onChange={(e) => setTemplateForm((s) => ({ ...s, rubrics: e.target.value }))}
                  placeholder={t('settings.imputations.template_rubrics')}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="gl-button gl-button-confirm"
                onClick={handleCreateTemplate}
                disabled={!templateForm.code.trim() || !templateForm.name.trim() || createTemplate.isPending}
              >
                {createTemplate.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                <Plus size={14} className="mr-1" />
                {t('settings.imputations.create_template')}
              </button>
              <button
                type="button"
                className="gl-button gl-button-secondary"
                onClick={() => setShowTemplateForm(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* DataTable */}
        <DataTable
          columns={templateColumns}
          data={templates ?? []}
          isLoading={templatesLoading}
          storageKey="imputation-templates-table"
          emptyTitle={t('settings.imputations.no_templates')}
          compact
        />
      </CollapsibleSection>

      {/* ── Assignments Section ─────────────────────────────── */}
      <CollapsibleSection
        id="imputation-assignments"
        title={t('settings.imputations.assignments_title')}
        description={t('settings.imputations.assignments_description')}
        defaultExpanded
      >
        {/* Toolbar */}
        <div className="flex justify-end gap-2 mb-4">
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setShowAssignmentImport(true)}
          >
            <Upload size={14} className="mr-1" />
            {t('settings.imputations.import_assignments')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-secondary"
            onClick={() => setAssignmentExportOpen(true)}
            disabled={(assignments?.length ?? 0) === 0}
          >
            <Download size={14} className="mr-1" />
            {t('settings.imputations.export_assignments')}
          </button>
          <button
            type="button"
            className="gl-button gl-button-confirm"
            onClick={() => {
              if (showAssignmentForm && !editingAssignmentId) {
                setShowAssignmentForm(false)
              } else {
                resetAssignmentForm()
                setShowAssignmentForm(true)
              }
            }}
          >
            {showAssignmentForm && !editingAssignmentId ? <X size={14} className="mr-1" /> : <Plus size={14} className="mr-1" />}
            {showAssignmentForm && !editingAssignmentId ? t('common.cancel') : t('settings.imputations.create_assignment')}
          </button>
        </div>

        {/* Collapsible create/edit form */}
        {showAssignmentForm && (
          <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 mb-4 space-y-3">
            <h4 className="text-sm font-semibold">
              {editingAssignmentId
                ? t('settings.imputations.update_assignment')
                : t('settings.imputations.create_assignment')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.assignment_reference')}</label>
                <select
                  className={panelSelectClass}
                  value={assignmentForm.imputation_reference_id}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, imputation_reference_id: e.target.value }))}
                >
                  <option value="">{t('settings.imputations.assignment_reference_placeholder')}</option>
                  {(references ?? []).map((reference) => (
                    <option key={reference.id} value={reference.id}>{reference.code} — {reference.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.assignment_target_type')}</label>
                <select
                  className={panelSelectClass}
                  value={assignmentForm.target_type}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, target_type: e.target.value, target_id: '' }))}
                >
                  <option value="user">{t('settings.imputations.assignment_target_user')}</option>
                  <option value="user_group">{t('settings.imputations.assignment_target_group')}</option>
                  <option value="business_unit">{t('settings.imputations.assignment_target_bu')}</option>
                  <option value="project">{t('settings.imputations.assignment_target_project')}</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.assignment_target_id')}</label>
                <select
                  className={panelSelectClass}
                  value={assignmentForm.target_id}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, target_id: e.target.value }))}
                >
                  <option value="">{t('settings.imputations.assignment_target_placeholder')}</option>
                  {assignmentTargetOptions.map((target) => (
                    <option key={target.value} value={target.value}>{target.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.assignment_priority')}</label>
                <input
                  className={panelInputClass}
                  type="number"
                  min="0"
                  step="1"
                  value={assignmentForm.priority}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, priority: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.valid_from')}</label>
                <input
                  className={panelInputClass}
                  type="date"
                  value={assignmentForm.valid_from}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, valid_from: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('settings.imputations.valid_to')}</label>
                <input
                  className={panelInputClass}
                  type="date"
                  value={assignmentForm.valid_to}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, valid_to: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common.notes')}</label>
                <input
                  className={panelInputClass}
                  value={assignmentForm.notes}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, notes: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{t('common.status')}</label>
                <select
                  className={panelSelectClass}
                  value={assignmentForm.active ? 'active' : 'inactive'}
                  onChange={(e) => setAssignmentForm((s) => ({ ...s, active: e.target.value === 'active' }))}
                >
                  <option value="active">{t('common.active')}</option>
                  <option value="inactive">{t('common.inactive')}</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="gl-button gl-button-confirm"
                onClick={handleSaveAssignment}
                disabled={
                  !assignmentForm.imputation_reference_id ||
                  !assignmentForm.target_id ||
                  createAssignment.isPending ||
                  updateAssignment.isPending
                }
              >
                {(createAssignment.isPending || updateAssignment.isPending) && <Loader2 size={14} className="mr-1 animate-spin" />}
                <Plus size={14} className="mr-1" />
                {editingAssignmentId
                  ? t('settings.imputations.update_assignment')
                  : t('settings.imputations.create_assignment')}
              </button>
              <button
                type="button"
                className="gl-button gl-button-secondary"
                onClick={resetAssignmentForm}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {/* DataTable */}
        <DataTable
          columns={assignmentColumns}
          data={assignments ?? []}
          isLoading={assignmentsLoading}
          storageKey="imputation-assignments-table"
          emptyTitle={t('settings.imputations.no_assignments')}
          compact
        />
      </CollapsibleSection>

      {isBusy && <div className="text-xs text-muted-foreground">{t('settings.imputations.sync_hint')}</div>}

      <ImportWizard
        open={showReferenceImport}
        onClose={() => setShowReferenceImport(false)}
        targetObject="imputation_reference"
        onImportComplete={() => {
          qc.invalidateQueries({ queryKey: ['imputation-references'] })
          setShowReferenceImport(false)
        }}
      />

      <ImportWizard
        open={showTemplateImport}
        onClose={() => setShowTemplateImport(false)}
        targetObject="imputation_otp_template"
        onImportComplete={() => {
          qc.invalidateQueries({ queryKey: ['imputation-otp-templates'] })
          qc.invalidateQueries({ queryKey: ['imputation-references'] })
          setShowTemplateImport(false)
        }}
      />

      <ImportWizard
        open={showAssignmentImport}
        onClose={() => setShowAssignmentImport(false)}
        targetObject="imputation_assignment"
        onImportComplete={() => {
          qc.invalidateQueries({ queryKey: ['imputation-assignments'] })
          setShowAssignmentImport(false)
        }}
      />

      <ExportWizard
        open={referenceExportOpen}
        onClose={() => setReferenceExportOpen(false)}
        data={referenceExportData}
        columns={[
          { id: 'code', header: t('settings.imputations.reference_code') },
          { id: 'name', header: t('settings.imputations.reference_name') },
          { id: 'description', header: t('common.description') },
          { id: 'imputation_type', header: t('settings.imputations.reference_type') },
          { id: 'otp_policy', header: t('settings.imputations.otp_policy') },
          { id: 'otp_template', header: t('settings.imputations.template_code') },
          { id: 'default_project', header: t('settings.imputations.default_project') },
          { id: 'default_cost_center', header: t('settings.imputations.default_cost_center') },
          { id: 'valid_from', header: t('settings.imputations.valid_from') },
          { id: 'valid_to', header: t('settings.imputations.valid_to') },
          { id: 'active', header: t('common.status') },
        ]}
        filenamePrefix="imputation-references"
      />

      <ExportWizard
        open={templateExportOpen}
        onClose={() => setTemplateExportOpen(false)}
        data={templateExportData}
        columns={[
          { id: 'code', header: t('settings.imputations.template_code') },
          { id: 'name', header: t('settings.imputations.template_name') },
          { id: 'description', header: t('common.description') },
          { id: 'rubrics', header: t('settings.imputations.template_rubrics') },
          { id: 'active', header: t('common.status') },
        ]}
        filenamePrefix="imputation-otp-templates"
      />

      <ExportWizard
        open={assignmentExportOpen}
        onClose={() => setAssignmentExportOpen(false)}
        data={assignmentExportData.map((assignment) => ({
          ...assignment,
          imputation_reference: referenceLabelById[assignment.imputation_reference_id] ?? assignment.imputation_reference_id,
        }))}
        columns={[
          { id: 'target_type', header: t('settings.imputations.assignment_target_type') },
          { id: 'target_id', header: t('settings.imputations.assignment_target_id') },
          { id: 'imputation_reference', header: t('settings.imputations.assignment_reference') },
          { id: 'priority', header: t('settings.imputations.assignment_priority') },
          { id: 'valid_from', header: t('settings.imputations.valid_from') },
          { id: 'valid_to', header: t('settings.imputations.valid_to') },
          { id: 'active', header: t('common.status') },
          { id: 'notes', header: t('common.notes') },
        ]}
        filenamePrefix="imputation-assignments"
      />
    </div>
  )
}
