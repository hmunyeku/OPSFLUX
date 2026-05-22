import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardPenLine, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import {
  DynamicPanelShell,
  PanelContentLayout,
  FormSection,
  panelInputClass,
  type ActionItem,
} from '@/components/layout/DynamicPanel'
import { useToast } from '@/components/ui/Toast'
import { useCreateComplianceAuditTemplate } from '@/hooks/useConformite'
import { useUIStore } from '@/stores/uiStore'
import type { ComplianceAuditTemplateCreate } from '@/types/api'
import { cn } from '@/lib/utils'

type DraftQuestion = {
  code: string
  text: string
  response_type: 'score' | 'yes_no' | 'choice' | 'text'
  weight: number
  required: boolean
  attachment_required: boolean
  options: string
}

type DraftTheme = {
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
    options: '',
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
    validity_days: '365',
    themes: [createTheme()],
  }
}

export function CreateAuditTemplatePanel() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTemplate = useCreateComplianceAuditTemplate()
  const closeDynamicPanel = useUIStore((s) => s.closeDynamicPanel)
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const [draft, setDraft] = useState<DraftTemplate>(() => createDraft())

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

  const buildPayload = (): ComplianceAuditTemplateCreate | null => {
    const code = draft.code.trim()
    const name = draft.name.trim()
    const auditType = draft.audit_type.trim()
    if (!code || !name || !auditType) return null
    const themes = draft.themes
      .map((theme, themeIndex) => ({
        title: theme.title.trim(),
        description: theme.description.trim() || null,
        weight: Number(theme.weight) || 0,
        position: themeIndex,
        questions: theme.questions
          .map((question, questionIndex) => ({
            code: question.code.trim() || null,
            text: question.text.trim(),
            response_type: question.response_type,
            weight: Number(question.weight) || 0,
            required: question.required,
            attachment_required: question.attachment_required,
            options_json: question.response_type === 'choice'
              ? { options: question.options.split(',').map(item => item.trim()).filter(Boolean) }
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
      const created = await createTemplate.mutateAsync(payload)
      toast({ title: t('conformite.audit_templates.created'), variant: 'success' })
      openDynamicPanel({ type: 'detail', module: 'conformite', id: created.id, meta: { subtype: 'audit-template' } })
    } catch {
      toast({ title: t('conformite.audit_templates.create_error'), variant: 'error' })
    }
  }

  const actionItems = useMemo<ActionItem[]>(() => [
    { id: 'cancel', label: t('common.cancel'), priority: 20, onClick: closeDynamicPanel },
    {
      id: 'create',
      label: t('conformite.audit_templates.save'),
      icon: ShieldCheck,
      variant: 'primary',
      priority: 100,
      loading: createTemplate.isPending,
      disabled: createTemplate.isPending,
      onClick: () => (document.getElementById('create-audit-template-form') as HTMLFormElement)?.requestSubmit(),
    },
  ], [closeDynamicPanel, createTemplate.isPending, t])

  return (
    <DynamicPanelShell
      title={t('conformite.audit_templates.create_title')}
      subtitle={t('conformite.tabs.audit_templates')}
      icon={<ClipboardPenLine size={14} className="text-primary" />}
      actionItems={actionItems}
    >
      <form id="create-audit-template-form" onSubmit={handleSubmit}>
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
                          <input value={question.options} onChange={(e) => updateQuestion(themeIndex, questionIndex, { options: e.target.value })} className={cn(compactInputClass, 'mt-2')} placeholder={t('conformite.audit_templates.placeholders.options')} />
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

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
