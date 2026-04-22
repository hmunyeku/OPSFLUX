import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/stores/uiStore'
import { useModifyAvm, useSubmitAvm, useApproveAvm, useCompleteAvm, useCancelAvm, useAvmPdf, useUpdateAvmPreparationTask, useUpdateAvmVisaFollowup, useUpdateAvmAllowanceRequest, useAvm } from '@/hooks/usePaxlog'
import { usePermission } from '@/hooks/usePermission'
import { useDictionaryLabels, useDictionaryOptions } from '@/hooks/useDictionary'
import { useUsers } from '@/hooks/useUsers'
import { useState, useEffect } from 'react'
import type { MissionPreparationTaskUpdate, MissionVisaFollowupUpdate, MissionAllowanceRequestUpdate, MissionNoticeModifyRequest, MissionProgramRead } from '@/services/paxlogService'
import { DynamicPanelShell, PanelActionButton, FormGrid, FormSection, DynamicPanelField, panelInputClass, ReadOnlyRow } from '@/components/layout/DynamicPanel'
import { Briefcase, Loader2, Download, Send, CheckCircle2, FileCheck2, XCircle, RefreshCw, X, Link2, Info, ClipboardCheck, Users, BookOpen } from 'lucide-react'
import { PanelContent } from '@/components/layout/PanelHeader'
import { TabBar } from '@/components/ui/Tabs'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { cn } from '@/lib/utils'
import { ADS_STATUS_LABELS_FALLBACK, AVM_STATUS_LABELS_FALLBACK, StatusBadge, AVM_STATUS_BADGES, formatDateShort, ADS_STATUS_BADGES, formatDate, CompletenessBar } from '../shared'

export function AvmDetailPanel({ id }: { id?: string }) {
  const { t } = useTranslation()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const modifyAvmMut = useModifyAvm()
  const submitAvmMut = useSubmitAvm()
  const approveAvmMut = useApproveAvm()
  const completeAvmMut = useCompleteAvm()
  const cancelAvmMut = useCancelAvm()
  const downloadAvmPdf = useAvmPdf()
  const updatePreparationTaskMut = useUpdateAvmPreparationTask()
  const updateVisaFollowupMut = useUpdateAvmVisaFollowup()
  const updateAllowanceRequestMut = useUpdateAvmAllowanceRequest()
  const { hasPermission } = usePermission()
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)
  const avmStatusLabels = useDictionaryLabels('pax_avm_status', AVM_STATUS_LABELS_FALLBACK)
  const missionTypeLabels = useDictionaryLabels('mission_type')
  const missionActivityTypeLabels = useDictionaryLabels('mission_activity_type')
  const preparationTaskTypeLabels = useDictionaryLabels('pax_preparation_task_type')
  const visaStatusLabels = useDictionaryLabels('pax_mission_visa_status')
  const allowanceStatusLabels = useDictionaryLabels('pax_mission_allowance_status')
  const visaTypeOptions = useDictionaryOptions('visa_type')
  const currencyOptions = useDictionaryOptions('currency')

  const { data: avm, isLoading, isError, error } = useAvm(id || '')
  const { data: avmUsers } = useUsers({ page: 1, page_size: 200, active: true })
  const [showModifyForm, setShowModifyForm] = useState(false)
  // Tabbed navigation — mirrors AdsDetailPanel. Segments the previous
  // single-scroll 14-section layout into 4 logical pages.
  type AvmDetailTab = 'informations' | 'preparation' | 'programmes' | 'historique'
  const [detailTab, setDetailTab] = useState<AvmDetailTab>('informations')
  const [taskDrafts, setTaskDrafts] = useState<Record<string, MissionPreparationTaskUpdate>>({})
  const [visaDrafts, setVisaDrafts] = useState<Record<string, MissionVisaFollowupUpdate>>({})
  const [allowanceDrafts, setAllowanceDrafts] = useState<Record<string, MissionAllowanceRequestUpdate>>({})
  const [modifyForm, setModifyForm] = useState<MissionNoticeModifyRequest>({
    title: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
    mission_type: undefined,
    pax_quota: 0,
    reason: '',
  })

  useEffect(() => {
    if (!avm) return
    setTaskDrafts(
      Object.fromEntries(
        avm.preparation_tasks.map((task) => [
          task.id,
          {
            status: task.status,
            assigned_to_user_id: task.assigned_to_user_id,
            due_date: task.due_date,
            notes: task.notes || '',
          },
        ]),
      ),
    )
    setVisaDrafts(
      Object.fromEntries(
        avm.visa_followups.map((item) => [
          item.id,
          {
            status: item.status,
            visa_type: item.visa_type || '',
            country: item.country || '',
            notes: item.notes || '',
          },
        ]),
      ),
    )
    setAllowanceDrafts(
      Object.fromEntries(
        avm.allowance_requests.map((item) => [
          item.id,
          {
            status: item.status,
            amount: item.amount ?? null,
            currency: item.currency || '',
            payment_reference: item.payment_reference || '',
            notes: item.notes || '',
          },
        ]),
      ),
    )
  }, [avm])

  if (!id || isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent><div className="flex items-center justify-center p-8"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div></PanelContent>
      </DynamicPanelShell>
    )
  }
  if (isError || !avm) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.avm_detail.not_found_title')} icon={<Briefcase size={14} className="text-primary" />}>
        <PanelContent>
          <div className="p-4 space-y-2">
            <p className="text-sm text-muted-foreground">{t('paxlog.avm_detail.not_found_message')}</p>
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        </PanelContent>
      </DynamicPanelShell>
    )
  }

  const generatedAdsCount = avm.programs.filter((program) => !!program.generated_ads_id).length
  const generatedAdsReviewCount = avm.programs.filter((program) => program.generated_ads_status === 'requires_review').length
  const generatedAdsActiveCount = avm.programs.filter((program) => program.generated_ads_status && !['completed', 'cancelled', 'rejected'].includes(program.generated_ads_status)).length
  const programsWithSiteCount = avm.programs.filter((program) => !!program.site_asset_id).length
  const programsMissingGeneratedAdsCount = avm.programs.filter((program) => !!program.site_asset_id && !program.generated_ads_id).length
  const programsWithDatesCount = avm.programs.filter((program) => !!program.planned_start_date && !!program.planned_end_date).length
  const preparationBlockingTasks = avm.preparation_tasks.filter((task) => task.task_type !== 'ads_creation' && ['pending', 'in_progress', 'blocked'].includes(task.status))
  const avmReadinessChecklist = [
    { label: t('paxlog.avm_detail.checklist.scope'), done: avm.title.trim().length > 0 && !!avm.mission_type },
    { label: t('paxlog.avm_detail.checklist.window'), done: !!avm.planned_start_date && !!avm.planned_end_date },
    { label: t('paxlog.avm_detail.checklist.program'), done: avm.programs.length > 0 },
    { label: t('paxlog.avm_detail.checklist.sites'), done: avm.programs.length > 0 && programsWithSiteCount === avm.programs.length },
    { label: t('paxlog.avm_detail.checklist.detailed_dates'), done: avm.programs.length > 0 && programsWithDatesCount === avm.programs.length },
  ]
  const avmReadyToSubmit = avmReadinessChecklist.every((item) => item.done)
  const nextAction =
    avm.status === 'draft'
      ? (avmReadyToSubmit
        ? t('paxlog.avm_detail.next_action.draft_ready')
        : t('paxlog.avm_detail.next_action.draft_missing'))
      : avm.status === 'in_preparation'
        ? t('paxlog.avm_detail.next_action.in_preparation')
        : avm.status === 'active'
          ? t('paxlog.avm_detail.next_action.active')
          : avm.status === 'ready'
            ? t('paxlog.avm_detail.next_action.ready')
            : avm.status === 'completed'
              ? t('paxlog.avm_detail.next_action.completed')
              : t('paxlog.avm_detail.next_action.cancelled')

  const canSubmit = avm.status === 'draft' && hasPermission('paxlog.avm.submit')
  const canApprove = avm.status === 'ready' && hasPermission('paxlog.avm.approve') && avm.ready_for_approval
  const canComplete = avm.status === 'active' && hasPermission('paxlog.avm.complete') && generatedAdsActiveCount === 0 && programsMissingGeneratedAdsCount === 0
  const canCancel = !['completed', 'cancelled'].includes(avm.status) && hasPermission('paxlog.avm.cancel')
  const canRequestChange = ['active', 'in_preparation', 'ready'].includes(avm.status) && hasPermission('paxlog.avm.update')
  const canManagePreparation = ['in_preparation', 'ready', 'active'].includes(avm.status) && hasPermission('paxlog.avm.update')
  const avmUsersItems = avmUsers?.items ?? []
  const openModifyForm = () => {
    setModifyForm({
      title: avm.title,
      description: avm.description || '',
      planned_start_date: avm.planned_start_date || '',
      planned_end_date: avm.planned_end_date || '',
      mission_type: avm.mission_type,
      pax_quota: avm.pax_quota,
      requires_badge: avm.requires_badge,
      requires_epi: avm.requires_epi,
      requires_visa: avm.requires_visa,
      eligible_displacement_allowance: avm.eligible_displacement_allowance,
      reason: '',
    })
    setShowModifyForm(true)
  }

  return (
    <DynamicPanelShell
      title={avm.reference}
      subtitle={avm.title}
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton variant="default" disabled={downloadAvmPdf.isPending} onClick={() => downloadAvmPdf.mutate(avm.id)}>
            {downloadAvmPdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Download size={12} /> PDF</>}
          </PanelActionButton>
          {canSubmit && (
            <PanelActionButton
              variant="primary"
              disabled={submitAvmMut.isPending}
              onClick={() => submitAvmMut.mutate(avm.id)}
            >
              {submitAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> {t('common.submit')}</>}
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton
              variant="primary"
              disabled={approveAvmMut.isPending}
              onClick={() => approveAvmMut.mutate(avm.id)}
            >
              {approveAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.validate')}</>}
            </PanelActionButton>
          )}
          {canComplete && (
            <PanelActionButton
              variant="primary"
              disabled={completeAvmMut.isPending}
              onClick={() => completeAvmMut.mutate(avm.id)}
            >
              {completeAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><FileCheck2 size={12} /> {t('common.complete')}</>}
            </PanelActionButton>
          )}
          {canCancel && (
            <PanelActionButton
              onClick={() => cancelAvmMut.mutate({ id: avm.id })}
              disabled={cancelAvmMut.isPending}
            >
              {cancelAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><XCircle size={12} /> {t('common.cancel')}</>}
            </PanelActionButton>
          )}
          {canRequestChange && (
            <PanelActionButton onClick={openModifyForm}>
              <RefreshCw size={12} /> {t('paxlog.avm_detail.actions.modify')}
            </PanelActionButton>
          )}
        </>
      }
    >
      <div className="p-4 space-y-5">
        <TabBar<AvmDetailTab>
          items={(() => {
            const lbl = (k: string, fb: string) => { const r = t(k); return r === k ? fb : r }
            return [
              { id: 'informations', label: lbl('paxlog.avm_detail.tabs.informations', 'Informations'), icon: Info },
              { id: 'preparation', label: lbl('paxlog.avm_detail.tabs.preparation', 'Préparation'), icon: ClipboardCheck },
              { id: 'programmes', label: lbl('paxlog.avm_detail.tabs.programs', 'Programmes'), icon: Users, badge: avm.programs?.length || undefined },
              { id: 'historique', label: lbl('paxlog.avm_detail.tabs.history', 'Historique'), icon: BookOpen },
            ]
          })()}
          activeId={detailTab}
          onTabChange={setDetailTab}
        />

        {detailTab === 'informations' && (<>
        {showModifyForm && (
          <FormSection collapsible id="avm-modify" title={t('paxlog.avm_detail.modify.title')} defaultExpanded>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t('paxlog.avm_detail.modify.help')}</p>
              <FormGrid className="@\[900px\]:grid-cols-2">
                <DynamicPanelField label={t('common.title')}>
                  <input
                    value={modifyForm.title || ''}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, title: e.target.value }))}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.mission_type')}>
                  <select
                    value={modifyForm.mission_type || ''}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, mission_type: e.target.value as MissionNoticeModifyRequest['mission_type'] }))}
                    className={panelInputClass}
                  >
                    <option value="">{t('common.select')}</option>
                    {Object.entries(missionTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.avm_detail.fields.planned_dates')}>
                  <DateRangePicker
                    startDate={modifyForm.planned_start_date || null}
                    endDate={modifyForm.planned_end_date || null}
                    onStartChange={(v) => setModifyForm((prev) => ({ ...prev, planned_start_date: v || '' }))}
                    onEndChange={(v) => setModifyForm((prev) => ({ ...prev, planned_end_date: v || '' }))}
                    startLabel={t('paxlog.create_avm.window.start')}
                    endLabel={t('paxlog.create_avm.window.end')}
                  />
                </DynamicPanelField>
                <DynamicPanelField label={t('paxlog.avm_detail.fields.planned_pax')}>
                  <input
                    type="number"
                    min={0}
                    value={modifyForm.pax_quota ?? 0}
                    onChange={(e) => setModifyForm((prev) => ({ ...prev, pax_quota: Number(e.target.value || 0) }))}
                    className={panelInputClass}
                  />
                </DynamicPanelField>
              </FormGrid>
              <DynamicPanelField label={t('common.description')}>
                <textarea
                  value={modifyForm.description || ''}
                  onChange={(e) => setModifyForm((prev) => ({ ...prev, description: e.target.value }))}
                  className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                />
              </DynamicPanelField>
              <DynamicPanelField label={t('paxlog.avm_detail.modify.reason')}>
                <textarea
                  value={modifyForm.reason}
                  onChange={(e) => setModifyForm((prev) => ({ ...prev, reason: e.target.value }))}
                  className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                  placeholder={t('paxlog.avm_detail.modify.reason_placeholder')}
                />
              </DynamicPanelField>
              {modifyAvmMut.error && (
                <p className="text-xs text-danger">
                  {((modifyAvmMut.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail) || t('common.error')}
                </p>
              )}
              <div className="flex items-center gap-2">
                <PanelActionButton
                  variant="primary"
                  disabled={modifyAvmMut.isPending || !modifyForm.reason.trim()}
                  onClick={() =>
                    modifyAvmMut.mutate(
                      { id: avm.id, payload: modifyForm },
                      { onSuccess: () => setShowModifyForm(false) },
                    )
                  }
                >
                  {modifyAvmMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><RefreshCw size={12} /> {t('paxlog.avm_detail.modify.submit')}</>}
                </PanelActionButton>
                <PanelActionButton onClick={() => setShowModifyForm(false)}>
                  <X size={12} /> {t('common.close')}
                </PanelActionButton>
              </div>
            </div>
          </FormSection>
        )}
        <FormSection collapsible id="avm-requester-readiness" title={t('paxlog.avm_detail.readiness.title', { status: avmReadyToSubmit ? t('paxlog.avm_detail.readiness.ready') : t('paxlog.avm_detail.readiness.to_complete') })} defaultExpanded>
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {avmReadinessChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.program_lines')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.programs.length}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.generated_ads')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{generatedAdsCount}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.open_preparation')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.open_preparation_tasks}</p>
              </div>
              <div className="rounded-md border border-border bg-card px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.avm_detail.kpis.planned_pax')}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{avm.pax_quota}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{nextAction}</p>
          </div>
        </FormSection>

        {generatedAdsReviewCount > 0 && (
          <FormSection collapsible id="avm-impact-warning" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100">
              {t('paxlog.avm_detail.operational_impacts.generated_ads_review', { count: generatedAdsReviewCount })}
            </div>
          </FormSection>
        )}

        {avm.status === 'active' && (generatedAdsActiveCount > 0 || programsMissingGeneratedAdsCount > 0) && (
          <FormSection collapsible id="avm-completion-blockers" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-100 space-y-1.5">
              {generatedAdsActiveCount > 0 && (
                <p>{t('paxlog.avm_detail.operational_impacts.completion_blockers_active_ads', { count: generatedAdsActiveCount })}</p>
              )}
              {programsMissingGeneratedAdsCount > 0 && (
                <p>{t('paxlog.avm_detail.operational_impacts.completion_blockers_missing_ads', { count: programsMissingGeneratedAdsCount })}</p>
              )}
            </div>
          </FormSection>
        )}

        {['in_preparation', 'ready'].includes(avm.status) && preparationBlockingTasks.length > 0 && (
          <FormSection collapsible id="avm-preparation-blockers" title={t('paxlog.avm_detail.sections.operational_impacts')} defaultExpanded>
            <div className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-700/50 dark:bg-red-950/20 dark:text-red-100 space-y-1.5">
              <p>{t('paxlog.avm_detail.operational_impacts.preparation_blockers', { count: preparationBlockingTasks.length })}</p>
              <p className="text-red-800/90 dark:text-red-100/90">
                {t('paxlog.avm_detail.operational_impacts.preparation_blockers_list', { tasks: preparationBlockingTasks.map((task) => task.title).join(', ') })}
              </p>
            </div>
          </FormSection>
        )}

        {(avm.last_linked_ads_set_to_review || 0) > 0 && (
          <FormSection collapsible id="avm-last-impact" title={t('paxlog.avm_detail.sections.last_changes')} defaultExpanded>
            <div className="space-y-2 rounded-md border border-border bg-card px-3 py-2 text-xs">
              <p className="text-foreground">
                {t('paxlog.avm_detail.operational_impacts.last_modification_review_count', { count: avm.last_linked_ads_set_to_review || 0 })}
              </p>
              {(avm.last_linked_ads_references || []).length > 0 && (
                <p className="text-muted-foreground">
                  {t('paxlog.avm_detail.operational_impacts.impacted_ads', { refs: (avm.last_linked_ads_references || []).join(', ') })}
                </p>
              )}
            </div>
          </FormSection>
        )}

        {/* Info section */}
        <FormSection collapsible id="avm-info" title={t('paxlog.avm_detail.sections.information')} defaultExpanded>
          <div className="space-y-2">
            <ReadOnlyRow label={t('paxlog.reference')} value={avm.reference} />
            <ReadOnlyRow label={t('common.title')} value={avm.title} />
            <ReadOnlyRow label={t('common.status')} value={<StatusBadge status={avm.status} labels={avmStatusLabels} badges={AVM_STATUS_BADGES} />} />
            <ReadOnlyRow label={t('paxlog.mission_type')} value={missionTypeLabels[avm.mission_type] || avm.mission_type} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.creator')} value={avm.creator_name || '—'} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.planned_dates')} value={`${formatDateShort(avm.planned_start_date)} — ${formatDateShort(avm.planned_end_date)}`} />
            {avm.description && <ReadOnlyRow label={t('common.description')} value={avm.description} />}
            {avm.cancellation_reason && <ReadOnlyRow label={t('paxlog.avm_detail.fields.cancellation_reason')} value={avm.cancellation_reason} />}
            {avm.last_modification_reason && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modification_reason')} value={avm.last_modification_reason} />}
            {avm.last_modified_by_name && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modified_by')} value={avm.last_modified_by_name} />}
            {avm.last_modified_at && <ReadOnlyRow label={t('paxlog.avm_detail.fields.last_modified_at')} value={formatDate(avm.last_modified_at)} />}
          </div>
        </FormSection>

        {!!avm.last_modification_changes && Object.keys(avm.last_modification_changes).length > 0 && (
          <FormSection collapsible id="avm-last-changes" title={t('paxlog.avm_detail.sections.last_changes')} defaultExpanded>
            <div className="space-y-2">
              {(avm.last_modified_fields || []).map((field) => {
                const change = avm.last_modification_changes?.[field]
                return (
                  <div key={field} className="rounded-md border border-border bg-card px-3 py-2 text-xs">
                    <p className="font-medium text-foreground">{field}</p>
                    <p className="mt-1 text-muted-foreground">
                      {t('paxlog.avm_detail.change.before')}: {String(change?.before ?? '—')}
                    </p>
                    <p className="text-muted-foreground">
                      {t('paxlog.avm_detail.change.after')}: {String(change?.after ?? '—')}
                    </p>
                  </div>
                )
              })}
            </div>
          </FormSection>
        )}

        {/* Indicators */}
        <FormSection collapsible id="avm-indicators" title={t('paxlog.avm_detail.sections.preparation_indicators')} defaultExpanded>
          <div className="space-y-1">
            {[
              { flag: avm.requires_visa, label: t('paxlog.requires_visa') },
              { flag: avm.requires_badge, label: t('paxlog.requires_badge') },
              { flag: avm.requires_epi, label: t('paxlog.requires_epi') },
              { flag: avm.eligible_displacement_allowance, label: t('paxlog.displacement_allowance') },
            ].map((ind) => (
              <div key={ind.label} className="flex items-center gap-2 text-xs">
                <span className={cn('w-4 h-4 rounded flex items-center justify-center text-[10px]', ind.flag ? 'bg-green-100 dark:bg-green-900/30 text-green-700' : 'bg-muted text-muted-foreground')}>
                  {ind.flag ? '✓' : '–'}
                </span>
                <span className={ind.flag ? 'text-foreground' : 'text-muted-foreground'}>{ind.label}</span>
              </div>
            ))}
          </div>
          {(avm.global_attachments_config.length > 0 || avm.per_pax_attachments_config.length > 0) && (
            <div className="mt-3 space-y-2 rounded-md border border-border bg-card px-3 py-3 text-xs">
              {avm.global_attachments_config.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{t('paxlog.avm_detail.fields.global_documents')}</p>
                  <div className="flex flex-wrap gap-2">
                    {avm.global_attachments_config.map((item) => (
                      <span key={item} className="gl-badge gl-badge-neutral">{item}</span>
                    ))}
                  </div>
                </div>
              )}
              {avm.per_pax_attachments_config.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{t('paxlog.avm_detail.fields.per_pax_documents')}</p>
                  <div className="flex flex-wrap gap-2">
                    {avm.per_pax_attachments_config.map((item) => (
                      <span key={item} className="gl-badge gl-badge-neutral">{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </FormSection>
        </>)}

        {detailTab === 'preparation' && (<>
        {/* Preparation checklist */}
        <FormSection collapsible id="avm-preparation" title={t('paxlog.avm_detail.sections.preparation_tasks', { progress: avm.preparation_progress })} defaultExpanded>
          <div className="mb-2">
            <CompletenessBar value={avm.preparation_progress} />
          </div>
          {avm.preparation_tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('paxlog.avm_detail.empty.preparation_tasks')}</p>
          ) : (
            <div className="space-y-2">
              {avm.preparation_tasks.map((task) => {
                const taskStatusColors: Record<string, string> = {
                  pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700',
                  in_progress: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700',
                  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700',
                  cancelled: 'bg-muted text-muted-foreground',
                  blocked: 'bg-red-100 dark:bg-red-900/30 text-red-700',
                  na: 'bg-muted text-muted-foreground',
                }
                const draft = taskDrafts[task.id] ?? {
                  status: task.status,
                  assigned_to_user_id: task.assigned_to_user_id,
                  due_date: task.due_date,
                  notes: task.notes || '',
                }
                const currentAssignedUser = avmUsersItems.find((user) => user.id === (draft.assigned_to_user_id || ''))
                const assignedLabel = currentAssignedUser
                  ? `${currentAssignedUser.first_name} ${currentAssignedUser.last_name}`.trim()
                  : task.assigned_to_user_name
                const hasTaskChanges =
                  draft.status !== task.status ||
                  (draft.assigned_to_user_id || null) !== (task.assigned_to_user_id || null) ||
                  (draft.due_date || null) !== (task.due_date || null) ||
                  (draft.notes || '') !== (task.notes || '')
                return (
                  <div key={task.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={cn('w-2 h-2 rounded-full shrink-0', task.status === 'completed' ? 'bg-green-500' : task.status === 'pending' ? 'bg-amber-500' : task.status === 'in_progress' ? 'bg-blue-500' : 'bg-muted-foreground')} />
                      <span className={cn('flex-1', task.status === 'cancelled' ? 'line-through text-muted-foreground' : 'text-foreground')}>{task.title}</span>
                      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', taskStatusColors[task.status] || 'bg-muted text-muted-foreground')}>
                        {t(`paxlog.avm_detail.preparation.status.${task.status}`)}
                      </span>
                      {task.auto_generated && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          {t('paxlog.avm_detail.preparation.auto_generated')}
                        </span>
                      )}
                    </div>
                    <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.preparation.meta.task_type', { type: preparationTaskTypeLabels[task.task_type] || task.task_type })}</div>
                      <div>{t('paxlog.avm_detail.preparation.meta.assignee', { assignee: assignedLabel || t('common.unassigned') })}</div>
                      <div>{t('paxlog.avm_detail.preparation.meta.due_date', { date: formatDateShort(task.due_date) })}</div>
                    </div>
                    {!!task.linked_ads_id && (
                      <div className="text-[11px]">
                        <button
                          className="text-primary hover:underline inline-flex items-center gap-1"
                          onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: task.linked_ads_id!, meta: { subtype: 'ads' } })}
                        >
                          <Link2 size={10} />
                          {task.linked_ads_reference || t('paxlog.avm_detail.preparation.linked_ads')}
                        </button>
                      </div>
                    )}
                    {!!task.notes && !canManagePreparation && (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{task.notes}</p>
                    )}
                    {canManagePreparation && (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-2">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || task.status}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, status: e.target.value as MissionPreparationTaskUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['pending', 'in_progress', 'completed', 'blocked', 'na', 'cancelled'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>
                                  {t(`paxlog.avm_detail.preparation.status.${statusOption}`)}
                                </option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.preparation.fields.assignee')}>
                            <select
                              value={draft.assigned_to_user_id || ''}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, assigned_to_user_id: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.unassigned')}</option>
                              {avmUsersItems.map((user) => (
                                <option key={user.id} value={user.id}>
                                  {`${user.first_name} ${user.last_name}`.trim() || user.email}
                                </option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('common.due_date')}>
                            <input
                              type="date"
                              value={draft.due_date || ''}
                              onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, due_date: e.target.value || null } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                            placeholder={t('paxlog.avm_detail.preparation.placeholders.notes')}
                          />
                        </DynamicPanelField>
                        <div className="flex items-center gap-2">
                          <PanelActionButton
                            variant="primary"
                            disabled={updatePreparationTaskMut.isPending || !hasTaskChanges}
                            onClick={() => updatePreparationTaskMut.mutate({ avmId: avm.id, taskId: task.id, payload: draft })}
                          >
                            {updatePreparationTaskMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                          </PanelActionButton>
                          <PanelActionButton
                            onClick={() => setTaskDrafts((prev) => ({ ...prev, [task.id]: { status: task.status, assigned_to_user_id: task.assigned_to_user_id, due_date: task.due_date, notes: task.notes || '' } }))}
                            disabled={updatePreparationTaskMut.isPending || !hasTaskChanges}
                          >
                            <RefreshCw size={12} /> {t('common.reset')}
                          </PanelActionButton>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </FormSection>

        {avm.visa_followups.length > 0 && (
          <FormSection collapsible id="avm-visa-followups" title={t('paxlog.avm_detail.sections.visa_followups')} defaultExpanded>
            <div className="space-y-2">
              {avm.visa_followups.map((item) => {
                const draft = visaDrafts[item.id] ?? {
                  status: item.status,
                  visa_type: item.visa_type || '',
                  country: item.country || '',
                  notes: item.notes || '',
                }
                const hasChanges =
                  draft.status !== item.status ||
                  (draft.visa_type || '') !== (item.visa_type || '') ||
                  (draft.country || '') !== (item.country || '') ||
                  (draft.notes || '') !== (item.notes || '')
                return (
                  <div key={item.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{item.pax_name || '—'}</p>
                        {item.company_name && <p className="text-muted-foreground">{item.company_name}</p>}
                      </div>
                      <span className="gl-badge gl-badge-neutral">{visaStatusLabels[item.status] || item.status}</span>
                    </div>
                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.followups.visa_type')}: {item.visa_type || '—'}</div>
                      <div>{t('paxlog.avm_detail.followups.country')}: {item.country || '—'}</div>
                      <div>{t('common.status')}: {visaStatusLabels[item.status] || item.status}</div>
                    </div>
                    {canManagePreparation ? (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-3">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || item.status}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, status: e.target.value as MissionVisaFollowupUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['to_initiate', 'submitted', 'in_review', 'obtained', 'refused'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>{visaStatusLabels[statusOption] || statusOption}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.visa_type')}>
                            <select
                              value={draft.visa_type || ''}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, visa_type: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.select')}</option>
                              {visaTypeOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.country')}>
                            <input
                              value={draft.country || ''}
                              onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, country: e.target.value } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setVisaDrafts((prev) => ({ ...prev, [item.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                          />
                        </DynamicPanelField>
                        <PanelActionButton
                          variant="primary"
                          disabled={updateVisaFollowupMut.isPending || !hasChanges}
                          onClick={() => updateVisaFollowupMut.mutate({ avmId: avm.id, followupId: item.id, payload: draft })}
                        >
                          {updateVisaFollowupMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                        </PanelActionButton>
                      </div>
                    ) : (
                      item.notes ? <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.notes}</p> : null
                    )}
                  </div>
                )
              })}
            </div>
          </FormSection>
        )}

        {avm.allowance_requests.length > 0 && (
          <FormSection collapsible id="avm-allowance-requests" title={t('paxlog.avm_detail.sections.allowance_requests')} defaultExpanded>
            <div className="space-y-2">
              {avm.allowance_requests.map((item) => {
                const draft = allowanceDrafts[item.id] ?? {
                  status: item.status,
                  amount: item.amount ?? null,
                  currency: item.currency || '',
                  payment_reference: item.payment_reference || '',
                  notes: item.notes || '',
                }
                const hasChanges =
                  draft.status !== item.status ||
                  (draft.amount ?? null) !== (item.amount ?? null) ||
                  (draft.currency || '') !== (item.currency || '') ||
                  (draft.payment_reference || '') !== (item.payment_reference || '') ||
                  (draft.notes || '') !== (item.notes || '')
                return (
                  <div key={item.id} className="rounded border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{item.pax_name || '—'}</p>
                        {item.company_name && <p className="text-muted-foreground">{item.company_name}</p>}
                      </div>
                      <span className="gl-badge gl-badge-neutral">{allowanceStatusLabels[item.status] || item.status}</span>
                    </div>
                    <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-3">
                      <div>{t('paxlog.avm_detail.followups.amount')}: {item.amount != null ? `${item.amount} ${item.currency || ''}`.trim() : '—'}</div>
                      <div>{t('paxlog.avm_detail.followups.payment_reference')}: {item.payment_reference || '—'}</div>
                      <div>{t('common.status')}: {allowanceStatusLabels[item.status] || item.status}</div>
                    </div>
                    {canManagePreparation ? (
                      <div className="space-y-2 border-t border-border pt-2">
                        <FormGrid className="@\[900px\]:grid-cols-4">
                          <DynamicPanelField label={t('common.status')}>
                            <select
                              value={draft.status || item.status}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, status: e.target.value as MissionAllowanceRequestUpdate['status'] } }))}
                              className={panelInputClass}
                            >
                              {(['draft', 'submitted', 'approved', 'paid'] as const).map((statusOption) => (
                                <option key={statusOption} value={statusOption}>{allowanceStatusLabels[statusOption] || statusOption}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.amount')}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft.amount ?? ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, amount: e.target.value === '' ? null : Number(e.target.value) } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.currency')}>
                            <select
                              value={draft.currency || ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, currency: e.target.value || null } }))}
                              className={panelInputClass}
                            >
                              <option value="">{t('common.select')}</option>
                              {currencyOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </DynamicPanelField>
                          <DynamicPanelField label={t('paxlog.avm_detail.followups.payment_reference')}>
                            <input
                              value={draft.payment_reference || ''}
                              onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, payment_reference: e.target.value } }))}
                              className={panelInputClass}
                            />
                          </DynamicPanelField>
                        </FormGrid>
                        <DynamicPanelField label={t('common.notes')}>
                          <textarea
                            value={draft.notes || ''}
                            onChange={(e) => setAllowanceDrafts((prev) => ({ ...prev, [item.id]: { ...draft, notes: e.target.value } }))}
                            className={cn(panelInputClass, 'min-h-[64px] resize-y')}
                          />
                        </DynamicPanelField>
                        <PanelActionButton
                          variant="primary"
                          disabled={updateAllowanceRequestMut.isPending || !hasChanges}
                          onClick={() => updateAllowanceRequestMut.mutate({ avmId: avm.id, requestId: item.id, payload: draft })}
                        >
                          {updateAllowanceRequestMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={12} /> {t('common.save')}</>}
                        </PanelActionButton>
                      </div>
                    ) : (
                      item.notes ? <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{item.notes}</p> : null
                    )}
                  </div>
                )
              })}
            </div>
          </FormSection>
        )}
        </>)}

        {detailTab === 'programmes' && (<>
        {/* Program lines */}
        <FormSection collapsible id="avm-programs" title={t('paxlog.avm_detail.sections.program', { count: avm.programs.length })} defaultExpanded>
          {avm.programs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{t('paxlog.avm_detail.empty.program')}</p>
          ) : (
            <div className="space-y-2">
              {avm.programs.map((prog: MissionProgramRead, idx: number) => (
                <div key={prog.id} className="rounded border border-border p-2.5 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1.5 py-0.5">{idx + 1}</span>
                    <span className="text-xs font-medium text-foreground flex-1 truncate">{prog.activity_description}</span>
                    <span className="text-[10px] text-muted-foreground">{missionActivityTypeLabels[prog.activity_type] || prog.activity_type}</span>
                  </div>
                  {prog.site_name && <div className="text-[11px] text-muted-foreground">{t('paxlog.avm_detail.program.site', { site: prog.site_name })}</div>}
                  {!prog.site_name && <div className="text-[11px] text-amber-700 dark:text-amber-300">{t('paxlog.avm_detail.program.site_missing')}</div>}
                  {(prog.planned_start_date || prog.planned_end_date) && (
                    <div className="text-[11px] text-muted-foreground tabular-nums">{formatDateShort(prog.planned_start_date)} — {formatDateShort(prog.planned_end_date)}</div>
                  )}
                  {!prog.planned_start_date && !prog.planned_end_date && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300">{t('paxlog.avm_detail.program.dates_missing')}</div>
                  )}
                  {(prog.pax_entries?.length || 0) > 0 && <div className="text-[11px] text-muted-foreground">{t('paxlog.avm_detail.program.pax_count', { count: prog.pax_entries.length })}</div>}
                  {prog.generated_ads_id && (
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        onClick={() => openDynamicPanel({ type: 'detail', module: 'paxlog', id: prog.generated_ads_id!, meta: { subtype: 'ads' } })}
                      >
                        <Link2 size={10} /> {prog.generated_ads_reference || t('paxlog.avm_detail.program.generated_ads')}
                      </button>
                      {prog.generated_ads_status && (
                        <StatusBadge status={prog.generated_ads_status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </FormSection>
        </>)}

        {detailTab === 'historique' && (<>
        {/* Metadata */}
        <FormSection collapsible id="avm-metadata" title={t('paxlog.avm_detail.sections.metadata')}>
          <div className="space-y-1">
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.created_at')} value={formatDate(avm.created_at)} />
            <ReadOnlyRow label={t('paxlog.avm_detail.fields.updated_at')} value={formatDate(avm.updated_at)} />
          </div>
        </FormSection>
        </>)}
      </div>
    </DynamicPanelShell>
  )
}


// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════

