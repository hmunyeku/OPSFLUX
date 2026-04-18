import { useTranslation } from 'react-i18next'
import { useCreateAvm } from '@/hooks/usePaxlog'
import { useUIStore } from '@/stores/uiStore'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import { useState } from 'react'
import { DynamicPanelShell, PanelActionButton, PanelContentLayout, FormSection, FormGrid, DynamicPanelField, panelInputClass } from '@/components/layout/DynamicPanel'
import { Briefcase, Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DateRangePicker } from '@/components/shared/DateRangePicker'
import { AssetPicker } from '@/components/shared/AssetPicker'
import { ProjectPicker } from '@/components/shared/ProjectPicker'

export function CreateAvmPanel() {
  const { t } = useTranslation()
  const createAvm = useCreateAvm()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const missionTypeOptions = useDictionaryOptions('mission_type')
  const missionActivityTypeOptions = useDictionaryOptions('mission_activity_type')

  const [form, setForm] = useState({
    title: '',
    description: '',
    planned_start_date: '',
    planned_end_date: '',
    mission_type: '',
    pax_quota: 0,
    requires_badge: false,
    requires_epi: false,
    requires_visa: false,
    eligible_displacement_allowance: false,
    global_attachments_config: '',
    per_pax_attachments_config: '',
    programs: [
      {
        activity_description: '',
        activity_type: 'visit' as 'visit' | 'meeting' | 'inspection' | 'training' | 'handover' | 'other',
        site_asset_id: '',
        planned_start_date: '',
        planned_end_date: '',
        project_id: '',
        notes: '',
      },
    ],
  })

  const avmChecklist = [
    { label: t('paxlog.create_avm.checklist.title'), done: form.title.trim().length > 0 },
    { label: t('paxlog.create_avm.checklist.mission_type'), done: !!form.mission_type },
    { label: t('paxlog.create_avm.checklist.period'), done: !!form.planned_start_date && !!form.planned_end_date },
    { label: t('paxlog.create_avm.checklist.program_line'), done: form.programs.some((p) => p.activity_description.trim().length > 0) },
  ]
  const avmReady = avmChecklist.every((item) => item.done)
  const selectedMissionType = missionTypeOptions.find((option) => option.value === form.mission_type)?.label || t('paxlog.create_avm.summary.undefined')
  const describedPrograms = form.programs.filter((program) => program.activity_description.trim().length > 0)
  const programsWithSite = form.programs.filter((program) => !!program.site_asset_id).length
  const programsWithProject = form.programs.filter((program) => !!program.project_id).length

  const updateProgram = (index: number, patch: Partial<(typeof form.programs)[number]>) => {
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.map((program, i) => (i === index ? { ...program, ...patch } : program)),
    }))
  }

  const addProgramLine = () => {
    setForm((prev) => ({
      ...prev,
      programs: [
        ...prev.programs,
        {
          activity_description: '',
          activity_type: 'visit',
          site_asset_id: '',
          planned_start_date: prev.planned_start_date,
          planned_end_date: prev.planned_end_date,
          project_id: '',
          notes: '',
        },
      ],
    }))
  }

  const removeProgramLine = (index: number) => {
    setForm((prev) => ({
      ...prev,
      programs: prev.programs.length === 1 ? prev.programs : prev.programs.filter((_, i) => i !== index),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createAvm.mutateAsync({
      title: form.title,
      description: form.description || undefined,
      planned_start_date: form.planned_start_date || undefined,
      planned_end_date: form.planned_end_date || undefined,
      mission_type: (form.mission_type || undefined) as 'standard' | 'vip' | 'regulatory' | 'emergency' | undefined,
      pax_quota: form.pax_quota,
      requires_badge: form.requires_badge,
      requires_epi: form.requires_epi,
      requires_visa: form.requires_visa,
      eligible_displacement_allowance: form.eligible_displacement_allowance,
      global_attachments_config: form.global_attachments_config.split('\n').map((item) => item.trim()).filter(Boolean),
      per_pax_attachments_config: form.per_pax_attachments_config.split('\n').map((item) => item.trim()).filter(Boolean),
      programs: form.programs
        .filter((program) => program.activity_description.trim().length > 0)
        .map((program) => ({
          activity_description: program.activity_description,
          activity_type: program.activity_type,
          site_asset_id: program.site_asset_id || null,
          planned_start_date: program.planned_start_date || null,
          planned_end_date: program.planned_end_date || null,
          project_id: program.project_id || null,
          notes: program.notes || null,
        })),
    })
    closeDynamicPanel()
  }

  return (
    <DynamicPanelShell
      title={t('paxlog.create_avm.title')}
      subtitle={t('paxlog.create_avm.subtitle')}
      icon={<Briefcase size={14} className="text-primary" />}
      actions={
        <>
          <PanelActionButton onClick={closeDynamicPanel}>{t('common.cancel')}</PanelActionButton>
          <PanelActionButton
            variant="primary"
            disabled={createAvm.isPending || !avmReady}
            onClick={() => (document.getElementById('create-avm-form') as HTMLFormElement)?.requestSubmit()}
          >
            {createAvm.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.create')}
          </PanelActionButton>
        </>
      }
    >
      <form id="create-avm-form" onSubmit={handleSubmit}>
        <PanelContentLayout>
        <FormSection title={t('paxlog.create_avm.sections.preparation')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('paxlog.create_avm.intro')}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {avmChecklist.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]', item.done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300')}>
                    {item.done ? '✓' : '•'}
                  </span>
                  <span className={item.done ? 'text-foreground' : 'text-muted-foreground'}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.mission_type')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{selectedMissionType}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.planned_pax')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{form.pax_quota}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.described_lines')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{describedPrograms.length} / {form.programs.length}</p>
            </div>
            <div className="rounded-md border border-border bg-card px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('paxlog.create_avm.summary.sites_projects')}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{t('paxlog.create_avm.summary.sites_projects_value', { sites: programsWithSite, projects: programsWithProject })}</p>
            </div>
          </div>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.mission')}>
          <FormGrid>
            <DynamicPanelField label={t('common.title')} required>
              <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={panelInputClass} placeholder={t('paxlog.create_avm.placeholders.title')} />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.mission_type')}>
              <select value={form.mission_type} onChange={(e) => setForm({ ...form, mission_type: e.target.value as typeof form.mission_type })} className={panelInputClass}>
                <option value="">{t('paxlog.create_ads.select_option')}</option>
                {missionTypeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_avm.fields.planned_pax')}>
              <input type="number" min={0} value={form.pax_quota} onChange={(e) => setForm({ ...form, pax_quota: parseInt(e.target.value || '0', 10) || 0 })} className={panelInputClass} />
            </DynamicPanelField>
          </FormGrid>
          <DynamicPanelField label={t('common.description')}>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={cn(panelInputClass, 'min-h-[60px] resize-y')} placeholder={t('paxlog.create_avm.placeholders.description')} />
          </DynamicPanelField>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.planned_dates')}>
          <DateRangePicker
            startDate={form.planned_start_date || null}
            endDate={form.planned_end_date || null}
            onStartChange={(v) => setForm((prev) => ({
              ...prev,
              planned_start_date: v,
              programs: prev.programs.map((program) => (
                program.planned_start_date ? program : { ...program, planned_start_date: v }
              )),
            }))}
            onEndChange={(v) => setForm((prev) => ({
              ...prev,
              planned_end_date: v,
              programs: prev.programs.map((program) => (
                program.planned_end_date ? program : { ...program, planned_end_date: v }
              )),
            }))}
            startLabel={t('paxlog.create_avm.fields.departure')}
            endLabel={t('paxlog.create_avm.fields.return')}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('paxlog.create_avm.date_hint')}
          </p>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.preparation_indicators')}>
          <FormGrid>
            {[
              { key: 'requires_visa' as const, label: t('paxlog.requires_visa') },
              { key: 'requires_badge' as const, label: t('paxlog.requires_badge') },
              { key: 'requires_epi' as const, label: t('paxlog.requires_epi') },
              { key: 'eligible_displacement_allowance' as const, label: t('paxlog.displacement_allowance') },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form[opt.key]}
                  onChange={(e) => setForm({ ...form, [opt.key]: e.target.checked })}
                  className="rounded border-border"
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </FormGrid>
          <FormGrid>
            <DynamicPanelField label={t('paxlog.create_avm.fields.global_documents')}>
              <textarea
                value={form.global_attachments_config}
                onChange={(e) => setForm({ ...form, global_attachments_config: e.target.value })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('paxlog.create_avm.fields.documents_placeholder')}
              />
            </DynamicPanelField>
            <DynamicPanelField label={t('paxlog.create_avm.fields.per_pax_documents')}>
              <textarea
                value={form.per_pax_attachments_config}
                onChange={(e) => setForm({ ...form, per_pax_attachments_config: e.target.value })}
                className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                placeholder={t('paxlog.create_avm.fields.documents_placeholder')}
              />
            </DynamicPanelField>
          </FormGrid>
        </FormSection>

        <FormSection title={t('paxlog.create_avm.sections.initial_program')}>
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            {t('paxlog.create_avm.program_intro')}
          </div>
          <div className="space-y-3">
            {form.programs.map((program, index) => (
              <div key={index} className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-foreground">{t('paxlog.create_avm.program.line', { index: index + 1 })}</p>
                  {form.programs.length > 1 && (
                    <button type="button" className="text-xs text-destructive hover:underline" onClick={() => removeProgramLine(index)}>
                      {t('common.delete')}
                    </button>
                  )}
                </div>
                <FormGrid>
                  <DynamicPanelField label={t('paxlog.create_avm.program.activity')} required>
                    <input
                      type="text"
                      value={program.activity_description}
                      onChange={(e) => updateProgram(index, { activity_description: e.target.value })}
                      className={panelInputClass}
                      placeholder={t('paxlog.create_avm.program.placeholders.activity')}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_avm.program.activity_type')}>
                    <select value={program.activity_type} onChange={(e) => updateProgram(index, { activity_type: e.target.value as typeof program.activity_type })} className={panelInputClass}>
                      {missionActivityTypeOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </DynamicPanelField>
                  <DynamicPanelField label={t('assets.site')}>
                    <AssetPicker value={program.site_asset_id || null} onChange={(id) => updateProgram(index, { site_asset_id: id || '' })} />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_ads.fields.project')}>
                    <ProjectPicker
                      value={program.project_id || null}
                      onChange={(id) => updateProgram(index, { project_id: id || '' })}
                      placeholder={t('paxlog.create_ads.no_project')}
                    />
                  </DynamicPanelField>
                  <DynamicPanelField label={t('paxlog.create_avm.program.line_dates')}>
                    <DateRangePicker
                      startDate={program.planned_start_date || null}
                      endDate={program.planned_end_date || null}
                      onStartChange={(v) => updateProgram(index, { planned_start_date: v })}
                      onEndChange={(v) => updateProgram(index, { planned_end_date: v })}
                      startLabel={t('paxlog.create_avm.program.start')}
                      endLabel={t('paxlog.create_avm.program.end')}
                    />
                  </DynamicPanelField>
                </FormGrid>
                <DynamicPanelField label={t('common.notes')}>
                  <textarea value={program.notes} onChange={(e) => updateProgram(index, { notes: e.target.value })} className={cn(panelInputClass, 'min-h-[56px] resize-y')} placeholder={t('paxlog.create_avm.program.placeholders.notes')} />
                </DynamicPanelField>
              </div>
            ))}
            <button type="button" className="gl-button-sm gl-button-default" onClick={addProgramLine}>
              <Plus size={13} />
              {t('paxlog.create_avm.program.add_line')}
            </button>
          </div>
        </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}


// ── AVM Detail Panel ─────────────────────────────────────────

