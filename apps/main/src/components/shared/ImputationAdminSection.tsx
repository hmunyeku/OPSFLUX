import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, Plus, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
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

  const isBusy =
    referencesLoading ||
    templatesLoading ||
    assignmentsLoading ||
    createReference.isPending ||
    createTemplate.isPending ||
    createAssignment.isPending ||
    updateAssignment.isPending ||
    deleteAssignment.isPending

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border/60 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('settings.imputations.references_title')}</h4>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.imputations.references_description')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
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
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <input
            className={panelInputClass}
            value={referenceForm.code}
            onChange={(e) => setReferenceForm((s) => ({ ...s, code: e.target.value }))}
            placeholder={t('settings.imputations.reference_code')}
          />
          <input
            className={panelInputClass}
            value={referenceForm.name}
            onChange={(e) => setReferenceForm((s) => ({ ...s, name: e.target.value }))}
            placeholder={t('settings.imputations.reference_name')}
          />
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

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="gl-button gl-button-primary"
            onClick={handleCreateReference}
            disabled={!referenceForm.code.trim() || !referenceForm.name.trim() || createReference.isPending}
          >
            <Plus size={14} className="mr-1" />
            {t('settings.imputations.create_reference')}
          </button>
        </div>

        {referencesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-2">
            {(references ?? []).map((reference) => (
              <div key={reference.id} className="rounded-md border border-border/50 px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{reference.code} — {reference.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {reference.imputation_type} · OTP {reference.otp_policy} · {reference.active ? t('common.active') : t('common.inactive')}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="gl-button gl-button-secondary !px-2 !py-1"
                    onClick={() => updateReference.mutate({ id: reference.id, payload: { active: !reference.active } })}
                  >
                    {reference.active ? t('common.deactivate') : t('common.activate')}
                  </button>
                  <button
                    type="button"
                    className="gl-button gl-button-danger !px-2 !py-1"
                    onClick={() => deleteReference.mutate(reference.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border/60 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('settings.imputations.templates_title')}</h4>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.imputations.templates_description')}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
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
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <input
            className={panelInputClass}
            value={templateForm.code}
            onChange={(e) => setTemplateForm((s) => ({ ...s, code: e.target.value }))}
            placeholder={t('settings.imputations.template_code')}
          />
          <input
            className={panelInputClass}
            value={templateForm.name}
            onChange={(e) => setTemplateForm((s) => ({ ...s, name: e.target.value }))}
            placeholder={t('settings.imputations.template_name')}
          />
          <input
            className={panelInputClass}
            value={templateForm.rubrics}
            onChange={(e) => setTemplateForm((s) => ({ ...s, rubrics: e.target.value }))}
            placeholder={t('settings.imputations.template_rubrics')}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="gl-button gl-button-primary"
            onClick={handleCreateTemplate}
            disabled={!templateForm.code.trim() || !templateForm.name.trim() || createTemplate.isPending}
          >
            <Plus size={14} className="mr-1" />
            {t('settings.imputations.create_template')}
          </button>
        </div>

        {templatesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-2">
            {(templates ?? []).map((template) => (
              <div key={template.id} className="rounded-md border border-border/50 px-3 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{template.code} — {template.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{template.rubrics.join(', ') || '—'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="gl-button gl-button-secondary !px-2 !py-1"
                    onClick={() => updateTemplate.mutate({ id: template.id, payload: { active: !template.active } })}
                  >
                    {template.active ? t('common.deactivate') : t('common.activate')}
                  </button>
                  <button
                    type="button"
                    className="gl-button gl-button-danger !px-2 !py-1"
                    onClick={() => deleteTemplate.mutate(template.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border/60 p-4 space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{t('settings.imputations.assignments_title')}</h4>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.imputations.assignments_description')}</p>
        </div>
        <div className="flex justify-end">
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
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          <input
            className={panelInputClass}
            type="number"
            min="0"
            step="1"
            value={assignmentForm.priority}
            onChange={(e) => setAssignmentForm((s) => ({ ...s, priority: e.target.value }))}
            placeholder={t('settings.imputations.assignment_priority_placeholder')}
          />
          <input
            className={panelInputClass}
            type="date"
            value={assignmentForm.valid_from}
            onChange={(e) => setAssignmentForm((s) => ({ ...s, valid_from: e.target.value }))}
          />
          <input
            className={panelInputClass}
            type="date"
            value={assignmentForm.valid_to}
            onChange={(e) => setAssignmentForm((s) => ({ ...s, valid_to: e.target.value }))}
          />
          <input
            className={panelInputClass}
            value={assignmentForm.notes}
            onChange={(e) => setAssignmentForm((s) => ({ ...s, notes: e.target.value }))}
            placeholder={t('settings.imputations.assignment_notes')}
          />
          <select
            className={panelSelectClass}
            value={assignmentForm.active ? 'active' : 'inactive'}
            onChange={(e) => setAssignmentForm((s) => ({ ...s, active: e.target.value === 'active' }))}
          >
            <option value="active">{t('common.active')}</option>
            <option value="inactive">{t('common.inactive')}</option>
          </select>
        </div>

        <div className="flex justify-end gap-2">
          {editingAssignmentId && (
            <button
              type="button"
              className="gl-button gl-button-secondary"
              onClick={resetAssignmentForm}
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            type="button"
            className="gl-button gl-button-primary"
            onClick={handleSaveAssignment}
            disabled={
              !assignmentForm.imputation_reference_id ||
              !assignmentForm.target_id ||
              createAssignment.isPending ||
              updateAssignment.isPending
            }
          >
            <Plus size={14} className="mr-1" />
            {editingAssignmentId
              ? t('settings.imputations.update_assignment')
              : t('settings.imputations.create_assignment')}
          </button>
        </div>

        {assignmentsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('common.loading')}
          </div>
        ) : (
          <div className="space-y-2">
            {(assignments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('settings.imputations.no_assignments')}</p>
            ) : (
              assignments?.map((assignment) => (
                <div key={assignment.id} className="rounded-md border border-border/50 px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {assignment.target_type === 'user'
                        ? (userLabelById[assignment.target_id] ?? assignment.target_id)
                        : assignment.target_type === 'user_group'
                          ? (groupLabelById[assignment.target_id] ?? assignment.target_id)
                          : assignment.target_type === 'business_unit'
                            ? (businessUnitLabelById[assignment.target_id] ?? assignment.target_id)
                            : (projectLabelById[assignment.target_id] ?? assignment.target_id)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('settings.imputations.assignment_reference')} {referenceLabelById[assignment.imputation_reference_id] ?? assignment.imputation_reference_id} · {t('settings.imputations.assignment_priority')} {assignment.priority}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {assignment.valid_from || '—'} → {assignment.valid_to || '—'} · {assignment.active ? t('common.active') : t('common.inactive')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="gl-button gl-button-secondary !px-2 !py-1"
                      onClick={() => handleEditAssignment(assignment)}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="gl-button gl-button-danger !px-2 !py-1"
                      onClick={() => handleDeleteAssignment(assignment.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>

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
