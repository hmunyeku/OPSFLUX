import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPenLine, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import { useComplianceAuditTemplates, useCreateComplianceAuditTemplate, useUpdateComplianceAuditTemplate } from '@/hooks/useConformite'
import { useUIStore } from '@/stores/uiStore'
import type { ComplianceAuditQuestion, ComplianceAuditScoreThreshold, ComplianceAuditTemplate, ComplianceAuditTemplateCreate } from '@/types/api'
import { DEFAULT_AUDIT_SCORE_THRESHOLDS, getAuditScoreThresholds } from '@/lib/complianceAudit'
import { cn } from '@/lib/utils'

type DraftChoice = {
  value: string
  label: string
  score: number | null
}

type DraftQuestion = {
  id?: string
  code: string
  text: string
  response_type: 'score' | 'yes_no' | 'choice' | 'text'
  weight: number
  required: boolean
  attachment_required: boolean
  options: DraftChoice[]
  optionDraft: string
}

type DraftTheme = {
  id?: string
  title: string
  description: string
  weight: number
  questions: DraftQuestion[]
}

type DraftTemplate = {
  code: string
  name: string
  audit_type: string
  description: string
  passing_score: number
  score_thresholds: ComplianceAuditScoreThreshold[]
  validity_days: string
  themes: DraftTheme[]
}

const compactInputClass = cn(panelInputClass, 'h-8')

function createQuestion(): DraftQuestion {
  return {
    code: '',
    text: '',
    response_type: 'score',
    weight: 1,
    required: true,
    attachment_required: false,
    options: [],
    optionDraft: '',
  }
}

function createTheme(): DraftTheme {
  return {
    title: '',
    description: '',
    weight: 1,
    questions: [createQuestion()],
  }
}

function createDraft(): DraftTemplate {
  return {
    code: '',
    name: '',
    audit_type: 'HSE',
    description: '',
    passing_score: 70,
    score_thresholds: DEFAULT_AUDIT_SCORE_THRESHOLDS,
    validity_days: '365',
    themes: [createTheme()],
  }
}

function getQuestionChoiceOptions(question: ComplianceAuditQuestion): DraftChoice[] {
  const choices = question.options_json?.choices
  if (Array.isArray(choices)) {
    return choices
      .map((choice) => {
        if (typeof choice === 'string') return { value: choice, label: choice, score: null }
        if (!choice || typeof choice !== 'object') return null
        const raw = choice as Record<string, unknown>
        const value = String(raw.value ?? raw.label ?? '').trim()
        const label = String(raw.label ?? raw.value ?? '').trim()
        const score = typeof raw.score === 'number' ? raw.score : null
        return value && label ? { value, label, score } : null
      })
      .filter((choice): choice is DraftChoice => !!choice)
  }
  const options = question.options_json?.options
  if (Array.isArray(options)) {
    return options.map(String).filter(Boolean).map((option) => ({ value: option, label: option, score: null }))
  }
  return []
}

function draftFromTemplate(template: ComplianceAuditTemplate): DraftTemplate {
  return {
    code: template.code,
    name: template.name,
    audit_type: template.audit_type,
    description: template.description ?? '',
    passing_score: template.passing_score,
    score_thresholds: getAuditScoreThresholds(template.score_thresholds),
    validity_days: template.validity_days ? String(template.validity_days) : '',
    themes: template.themes
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((theme) => ({
        id: theme.id,
        title: theme.title,
        description: theme.description ?? '',
        weight: theme.weight,
        questions: theme.questions
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((question) => ({
            id: question.id,
            code: question.code ?? '',
            text: question.text,
            response_type: question.response_type as DraftQuestion['response_type'],
            weight: question.weight,
            required: question.required,
            attachment_required: question.attachment_required,
            options: getQuestionChoiceOptions(question),
            optionDraft: '',
          })),
      })),
  }
}

export function CreateAuditTemplatePanel({ templateId }: { templateId?: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTemplate = useCreateComplianceAuditTemplate()
  const updateTemplate = useUpdateComplianceAuditTemplate()
  const { data: templates = [] } = useComplianceAuditTemplates({ include_inactive: true })
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [draft, setDraft] = useState<DraftTemplate>(() => createDraft())
  const template = templateId ? templates.find(item => item.id === templateId) : undefined
  const isEdit = !!templateId

  useEffect(() => {
    if (template) setDraft(draftFromTemplate(template))
  }, [template])

  const updateTheme = (themeIndex: number, patch: Partial<DraftTheme>) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex ? { ...theme, ...patch } : theme),
    }))
  }

  const updateQuestion = (themeIndex: number, questionIndex: number, patch: Partial<DraftQuestion>) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? {
            ...theme,
            questions: theme.questions.map((question, qIndex) => qIndex === questionIndex ? { ...question, ...patch } : question),
          }
        : theme),
    }))
  }

  const addTheme = () => setDraft(prev => ({ ...prev, themes: [...prev.themes, createTheme()] }))

  const removeTheme = (themeIndex: number) => {
    setDraft(prev => ({ ...prev, themes: prev.themes.filter((_, index) => index !== themeIndex) }))
  }

  const addQuestion = (themeIndex: number) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? { ...theme, questions: [...theme.questions, createQuestion()] }
        : theme),
    }))
  }

  const removeQuestion = (themeIndex: number, questionIndex: number) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? { ...theme, questions: theme.questions.filter((_, qIndex) => qIndex !== questionIndex) }
        : theme),
    }))
  }

  const updateChoiceOption = (themeIndex: number, questionIndex: number, optionIndex: number, value: string) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? {
            ...theme,
            questions: theme.questions.map((question, qIndex) => qIndex === questionIndex
              ? {
                  ...question,
                  options: question.options.map((option, oIndex) => oIndex === optionIndex ? { ...option, value, label: value } : option),
                }
              : question),
          }
        : theme),
    }))
  }

  const addChoiceOption = (themeIndex: number, questionIndex: number) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? {
            ...theme,
            questions: theme.questions.map((question, qIndex) => {
              if (qIndex !== questionIndex) return question
              const nextOption = question.optionDraft.trim()
              if (!nextOption) return question
              return {
                ...question,
                options: [...question.options, { value: nextOption, label: nextOption, score: null }],
                optionDraft: '',
              }
            }),
          }
        : theme),
    }))
  }

  const removeChoiceOption = (themeIndex: number, questionIndex: number, optionIndex: number) => {
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.map((theme, index) => index === themeIndex
        ? {
            ...theme,
            questions: theme.questions.map((question, qIndex) => qIndex === questionIndex
              ? { ...question, options: question.options.filter((_, oIndex) => oIndex !== optionIndex) }
              : question),
          }
        : theme),
    }))
  }

  const updateThreshold = (thresholdIndex: number, patch: Partial<ComplianceAuditScoreThreshold>) => {
    setDraft(prev => ({
      ...prev,
      score_thresholds: prev.score_thresholds.map((threshold, index) => index === thresholdIndex
        ? { ...threshold, ...patch }
        : threshold),
    }))
  }

  const addThreshold = () => {
    setDraft(prev => ({
      ...prev,
      score_thresholds: [
        ...prev.score_thresholds,
        { code: `level_${prev.score_thresholds.length + 1}`, label: '', min_score: 0, color: 'primary', blocks_assignment: false },
      ],
    }))
  }

  const removeThreshold = (thresholdIndex: number) => {
    setDraft(prev => ({
      ...prev,
      score_thresholds: prev.score_thresholds.filter((_, index) => index !== thresholdIndex),
    }))
  }

  const buildPayload = (): ComplianceAuditTemplateCreate | null => {
    const code = draft.code.trim()
    const name = draft.name.trim()
    const auditType = draft.audit_type.trim()
    if (!code || !name || !auditType) return null
    const themes = draft.themes
      .map((theme, themeIndex) => ({
        id: theme.id ?? null,
        title: theme.title.trim(),
        description: theme.description.trim() || null,
        weight: Number(theme.weight) || 0,
        position: themeIndex,
        questions: theme.questions
          .map((question, questionIndex) => ({
            id: question.id ?? null,
            code: question.code.trim() || null,
            text: question.text.trim(),
            response_type: question.response_type,
            weight: Number(question.weight) || 0,
            required: question.required,
            attachment_required: question.attachment_required,
            options_json: question.response_type === 'choice'
              ? {
                  choices: [
                    ...question.options,
                    ...(question.optionDraft.trim()
                      ? [{ value: question.optionDraft.trim(), label: question.optionDraft.trim(), score: null }]
                      : []),
                  ]
                    .map(item => ({
                      value: item.value.trim() || item.label.trim(),
                      label: item.label.trim() || item.value.trim(),
                      score: item.score,
                    }))
                    .filter(item => item.value && item.label),
                }
              : null,
            position: questionIndex,
          }))
          .filter(question => question.text),
      }))
      .filter(theme => theme.title && theme.questions.length > 0)
    if (themes.length === 0) return null
    return {
      code,
      name,
      audit_type: auditType,
      target_scope: 'company',
      description: draft.description.trim() || null,
      passing_score: Number(draft.passing_score) || 70,
      score_thresholds: draft.score_thresholds
        .map((threshold, index) => ({
          code: threshold.code.trim() || `level_${index + 1}`,
          label: threshold.label.trim() || threshold.code.trim() || `Level ${index + 1}`,
          min_score: Math.max(0, Math.min(100, Number(threshold.min_score) || 0)),
          color: threshold.color || null,
          blocks_assignment: !!threshold.blocks_assignment,
        }))
        .sort((a, b) => b.min_score - a.min_score),
      validity_days: draft.validity_days ? Number(draft.validity_days) : null,
      themes,
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const payload = buildPayload()
    if (!payload) {
      toast({ title: t('conformite.audit_templates.validation_error'), variant: 'error' })
      return
    }
    try {
      const saved = isEdit && templateId
        ? await updateTemplate.mutateAsync({ id: templateId, payload })
        : await createTemplate.mutateAsync(payload)
      toast({ title: t(isEdit ? 'conformite.audit_templates.updated' : 'conformite.audit_templates.created'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: 'conformite', id: saved.id, meta: { subtype: 'audit-template' } })
    } catch {
      toast({ title: t(isEdit ? 'conformite.audit_templates.update_error' : 'conformite.audit_templates.create_error'), variant: 'error' })
    }
  }

  const formId = isEdit ? 'edit-audit-template-form' : 'create-audit-template-form'
  const isPending = createTemplate.isPending || updateTemplate.isPending
  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 20, onClick: closeDynamicPanel },
    {
      id: isEdit ? 'save' : 'create',
      label: t(isEdit ? 'common.save' : 'conformite.audit_templates.save'),
      icon: isEdit ? Save : ShieldCheck,
      variant: 'primary',
      priority: 100,
      loading: isPending,
      disabled: isPending,
      onClick: () => (document.getElementById(formId) as HTMLFormElement)?.requestSubmit(),
    },
  ], [closeDynamicPanel, formId, isEdit, isPending, t])

  return (
    <DynamicPanelShell
      title={t(isEdit ? 'conformite.audit_templates.edit_title' : 'conformite.audit_templates.create_title')}
      subtitle={t('conformite.tabs.audit_templates')}
      icon={<ClipboardPenLine size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id={formId} onSubmit={handleSubmit}>
        <PanelContentLayout>
          <FormSection title={t('common.information')}>
            <div className="grid gap-2 @2xl:grid-cols-6">
              <Field label={t('conformite.audit_templates.fields.code')} className="@2xl:col-span-2">
                <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={compactInputClass} placeholder="AUD-HSE" />
              </Field>
              <Field label={t('conformite.audit_templates.fields.name')} className="@2xl:col-span-4">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={compactInputClass} placeholder={t('conformite.audit_templates.placeholders.name')} />
              </Field>
              <Field label={t('conformite.audit_templates.fields.audit_type')} className="@2xl:col-span-2">
                <select value={draft.audit_type} onChange={(e) => setDraft({ ...draft, audit_type: e.target.value })} className={compactInputClass}>
                  <option value="Administratif">{t('conformite.audit_templates.types.administrative')}</option>
                  <option value="HSE">{t('conformite.audit_templates.types.hse')}</option>
                  <option value="Metier">{t('conformite.audit_templates.types.business')}</option>
                </select>
              </Field>
              <Field label={t('conformite.audit_templates.fields.passing_score')} className="@2xl:col-span-2">
                <input type="number" min={0} max={100} value={draft.passing_score} onChange={(e) => setDraft({ ...draft, passing_score: Number(e.target.value) })} className={compactInputClass} />
              </Field>
              <Field label={t('conformite.audit_templates.fields.validity_days')} className="@2xl:col-span-2">
                <input type="number" min={1} value={draft.validity_days} onChange={(e) => setDraft({ ...draft, validity_days: e.target.value })} className={compactInputClass} placeholder="365" />
              </Field>
              <Field label={t('conformite.audit_templates.fields.description')} className="@2xl:col-span-6">
                <textarea
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={cn(panelInputClass, 'min-h-[72px] resize-y')}
                  placeholder={t('conformite.audit_templates.placeholders.description')}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title={t('conformite.audit_templates.thresholds.title')}
            headerExtra={(
              <button type="button" onClick={addThreshold} className="btn btn-secondary btn-sm">
                <Plus size={12} />
                {t('conformite.audit_templates.thresholds.add')}
              </button>
            )}
          >
            <div className="space-y-2">
              <p className="text-xs leading-snug text-muted-foreground">{t('conformite.audit_templates.thresholds.help')}</p>
              <div className="hidden grid-cols-[6.5rem_minmax(0,1fr)_5rem_6rem_2rem] gap-1.5 px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground @2xl:grid">
                <span>{t('conformite.audit_templates.fields.code')}</span>
                <span>{t('conformite.audit_templates.thresholds.label')}</span>
                <span>{t('conformite.audit_templates.thresholds.min_score')}</span>
                <span>{t('conformite.audit_templates.thresholds.blocks_assignment')}</span>
                <span />
              </div>
              {draft.score_thresholds.map((threshold, thresholdIndex) => (
                <div key={thresholdIndex} className="grid gap-1.5 rounded-md border border-border/70 bg-card/70 p-1.5 @2xl:grid-cols-[6.5rem_minmax(0,1fr)_5rem_6rem_2rem] @2xl:items-center">
                  <Field label={t('conformite.audit_templates.fields.code')} compact>
                    <input value={threshold.code} onChange={(e) => updateThreshold(thresholdIndex, { code: e.target.value })} className={compactInputClass} placeholder="qualified" />
                  </Field>
                  <Field label={t('conformite.audit_templates.thresholds.label')} compact>
                    <input value={threshold.label} onChange={(e) => updateThreshold(thresholdIndex, { label: e.target.value })} className={compactInputClass} placeholder={t('conformite.audit_templates.thresholds.label_placeholder')} />
                  </Field>
                  <Field label={t('conformite.audit_templates.thresholds.min_score')} compact>
                    <input type="number" min={0} max={100} value={threshold.min_score} onChange={(e) => updateThreshold(thresholdIndex, { min_score: Number(e.target.value) })} className={compactInputClass} />
                  </Field>
                  <label className="flex h-8 items-center gap-2 text-xs text-muted-foreground @2xl:justify-center">
                    <input type="checkbox" checked={!!threshold.blocks_assignment} onChange={(e) => updateThreshold(thresholdIndex, { blocks_assignment: e.target.checked })} />
                    <span className="@2xl:hidden">{t('conformite.audit_templates.thresholds.blocks_assignment')}</span>
                  </label>
                  <button type="button" onClick={() => removeThreshold(thresholdIndex)} className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection
            title={t('conformite.audit_templates.themes')}
            headerExtra={(
              <button type="button" onClick={addTheme} className="btn btn-secondary btn-sm">
                <Plus size={12} />
                {t('conformite.audit_templates.add_theme')}
              </button>
            )}
          >
            <div className="space-y-3">
              {draft.themes.map((theme, themeIndex) => (
                <div key={themeIndex} className="rounded-lg border border-border bg-card">
                  <div className="grid gap-2 border-b border-border p-2 @2xl:grid-cols-[minmax(0,1fr)_6rem_2rem] @2xl:items-end">
                    <Field label={t('conformite.audit_templates.theme_label', { count: themeIndex + 1 })}>
                      <input value={theme.title} onChange={(e) => updateTheme(themeIndex, { title: e.target.value })} className={compactInputClass} placeholder={t('conformite.audit_templates.placeholders.theme')} />
                    </Field>
                    <Field label={t('conformite.audit_templates.fields.weight')}>
                      <input type="number" min={0} value={theme.weight} onChange={(e) => updateTheme(themeIndex, { weight: Number(e.target.value) })} className={compactInputClass} />
                    </Field>
                    <button type="button" onClick={() => removeTheme(themeIndex)} className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="space-y-2 p-2">
                    <input value={theme.description} onChange={(e) => updateTheme(themeIndex, { description: e.target.value })} className={compactInputClass} placeholder={t('conformite.audit_templates.placeholders.theme_description')} />
                    {theme.questions.map((question, questionIndex) => (
                      <div key={questionIndex} className="rounded-md border border-border/70 bg-background/50 p-2">
                        <div className="grid gap-2 @2xl:grid-cols-[4.5rem_minmax(0,1fr)_2rem] @2xl:items-end">
                          <Field label={t('conformite.audit_templates.fields.code')}>
                            <input value={question.code} onChange={(e) => updateQuestion(themeIndex, questionIndex, { code: e.target.value })} className={compactInputClass} placeholder="Q1" />
                          </Field>
                          <Field label={t('conformite.audit_templates.question_label', { count: questionIndex + 1 })}>
                            <input value={question.text} onChange={(e) => updateQuestion(themeIndex, questionIndex, { text: e.target.value })} className={compactInputClass} placeholder={t('conformite.audit_templates.placeholders.question')} />
                          </Field>
                          <button type="button" onClick={() => removeQuestion(themeIndex, questionIndex)} className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="mt-2 grid gap-2 @2xl:grid-cols-[8rem_5rem_1fr] @2xl:items-center">
                          <select value={question.response_type} onChange={(e) => updateQuestion(themeIndex, questionIndex, { response_type: e.target.value as DraftQuestion['response_type'] })} className={compactInputClass}>
                            <option value="score">{t('conformite.audit_templates.response_types.score')}</option>
                            <option value="yes_no">{t('conformite.audit_templates.response_types.yes_no')}</option>
                            <option value="choice">{t('conformite.audit_templates.response_types.choice')}</option>
                            <option value="text">{t('conformite.audit_templates.response_types.text')}</option>
                          </select>
                          <input type="number" min={0} value={question.weight} onChange={(e) => updateQuestion(themeIndex, questionIndex, { weight: Number(e.target.value) })} className={compactInputClass} title={t('conformite.audit_templates.fields.weight')} />
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input type="checkbox" checked={question.required} onChange={(e) => updateQuestion(themeIndex, questionIndex, { required: e.target.checked })} />
                              {t('conformite.audit_templates.fields.required')}
                            </label>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input type="checkbox" checked={question.attachment_required} onChange={(e) => updateQuestion(themeIndex, questionIndex, { attachment_required: e.target.checked })} />
                              {t('conformite.audit_templates.fields.evidence')}
                            </label>
                          </div>
                        </div>
                        {question.response_type === 'choice' && (
                          <div className="mt-2 rounded-md border border-border/70 bg-card/60 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {t('conformite.audit_templates.fields.options')}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {t('conformite.audit_templates.option_count', { count: question.options.length })}
                              </span>
                            </div>
                            {question.options.length > 0 && (
                              <div className="mb-2 space-y-1.5">
                                {question.options.map((option, optionIndex) => (
                                  <div key={`${themeIndex}-${questionIndex}-${optionIndex}`} className="grid gap-1.5 @2xl:grid-cols-[minmax(0,1fr)_2rem]">
                                    <input
                                      value={option.label}
                                      onChange={(e) => updateChoiceOption(themeIndex, questionIndex, optionIndex, e.target.value)}
                                      className={compactInputClass}
                                      placeholder={t('conformite.audit_templates.placeholders.option')}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removeChoiceOption(themeIndex, questionIndex, optionIndex)}
                                      className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                      title={t('common.delete')}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="grid gap-1.5 @2xl:grid-cols-[minmax(0,1fr)_2rem]">
                              <input
                                value={question.optionDraft}
                                onChange={(e) => updateQuestion(themeIndex, questionIndex, { optionDraft: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    addChoiceOption(themeIndex, questionIndex)
                                  }
                                }}
                                className={compactInputClass}
                                placeholder={t('conformite.audit_templates.placeholders.option')}
                              />
                              <button
                                type="button"
                                onClick={() => addChoiceOption(themeIndex, questionIndex)}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
                                title={t('conformite.audit_templates.add_option')}
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => addQuestion(themeIndex)} className="btn btn-secondary btn-sm">
                      <Plus size={12} />
                      {t('conformite.audit_templates.add_question')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </FormSection>
        </PanelContentLayout>
      </form>
    </DynamicPanelShell>
  )
}

function Field({ label, children, className, compact }: { label: string; children: ReactNode; className?: string; compact?: boolean }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className={cn('mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground', compact && '@2xl:sr-only')}>{label}</span>
      {children}
    </label>
  )
}
