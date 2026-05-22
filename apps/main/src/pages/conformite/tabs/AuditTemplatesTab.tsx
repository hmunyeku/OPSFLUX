import { useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ClipboardPenLine, FileText, Plus, Power, ShieldCheck, Trash2, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { usePermission } from '@/hooks/usePermission'
import {
  useComplianceAuditTemplates,
  useCreateComplianceAuditTemplate,
  useUpdateComplianceAuditTemplate,
} from '@/hooks/useConformite'
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

const inputClass = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40'
const smallInputClass = 'h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary/40'

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

export function AuditTemplatesTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { hasPermission } = usePermission()
  const { data: templates = [], isLoading } = useComplianceAuditTemplates({ include_inactive: true })
  const createTemplate = useCreateComplianceAuditTemplate()
  const updateTemplate = useUpdateComplianceAuditTemplate()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DraftTemplate>(() => createDraft())

  const canCreate = hasPermission('conformite.audit.template.create')
  const canUpdate = hasPermission('conformite.audit.template.update')

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => `${a.audit_type}-${a.code}`.localeCompare(`${b.audit_type}-${b.code}`)),
    [templates],
  )

  const stats = useMemo(() => {
    const questions = templates.reduce((total, template) => (
      total + template.themes.reduce((sum, theme) => sum + theme.questions.length, 0)
    ), 0)
    return {
      templates: templates.length,
      themes: templates.reduce((total, template) => total + template.themes.length, 0),
      questions,
    }
  }, [templates])

  const resetAndClose = () => {
    setOpen(false)
    setDraft(createDraft())
  }

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
    setDraft(prev => ({
      ...prev,
      themes: prev.themes.filter((_, index) => index !== themeIndex),
    }))
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

  const handleCreate = async () => {
    const payload = buildPayload()
    if (!payload) {
      toast({ title: t('conformite.audit_templates.validation_error'), variant: 'error' })
      return
    }
    try {
      await createTemplate.mutateAsync(payload)
      toast({ title: t('conformite.audit_templates.created'), variant: 'success' })
      resetAndClose()
    } catch {
      toast({ title: t('conformite.audit_templates.create_error'), variant: 'error' })
    }
  }

  const toggleTemplate = async (id: string, active: boolean) => {
    try {
      await updateTemplate.mutateAsync({ id, payload: { active: !active } })
      toast({ title: t(active ? 'conformite.audit_templates.disabled' : 'conformite.audit_templates.enabled'), variant: 'success' })
    } catch {
      toast({ title: t('conformite.toast.error'), variant: 'error' })
    }
  }

  return (
    <div className="h-full overflow-auto p-3 sm:p-4">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <MetricCard label={t('conformite.audit_templates.metrics.templates')} value={stats.templates} />
        <MetricCard label={t('conformite.audit_templates.metrics.themes')} value={stats.themes} />
        <MetricCard label={t('conformite.audit_templates.metrics.questions')} value={stats.questions} />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ClipboardPenLine size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-foreground">{t('conformite.audit_templates.title')}</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t('conformite.audit_templates.subtitle')}</p>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <Plus size={14} />
              {t('conformite.audit_templates.create')}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : sortedTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <FileText size={24} className="text-muted-foreground" />
            <div className="text-sm font-semibold text-foreground">{t('conformite.audit_templates.empty_title')}</div>
            <p className="max-w-md text-xs text-muted-foreground">{t('conformite.audit_templates.empty_description')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedTemplates.map(template => {
              const questionCount = template.themes.reduce((sum, theme) => sum + theme.questions.length, 0)
              return (
                <article key={template.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-primary">{template.audit_type}</span>
                      <h3 className="truncate text-sm font-semibold text-foreground">{template.name}</h3>
                      <span className="text-[11px] text-muted-foreground">{template.code}</span>
                      {!template.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{t('conformite.audit_templates.inactive')}</span>}
                    </div>
                    {template.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>{template.themes.length} {t('conformite.audit_templates.theme_count')}</span>
                      <span>{questionCount} {t('conformite.audit_templates.question_count')}</span>
                      <span>{t('conformite.audit_templates.passing_score_short', { score: template.passing_score })}</span>
                      <span>{template.validity_days ? t('conformite.audit_templates.validity_days', { count: template.validity_days }) : t('conformite.audit_templates.validity_permanent')}</span>
                    </div>
                  </div>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => toggleTemplate(template.id, template.active)}
                      className={cn(
                        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs transition',
                        template.active
                          ? 'border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive'
                          : 'border-primary/30 text-primary hover:bg-primary/10',
                      )}
                      title={template.active ? t('conformite.audit_templates.disable') : t('conformite.audit_templates.enable')}
                    >
                      {template.active ? <Power size={13} /> : <CheckCircle2 size={13} />}
                      {template.active ? t('conformite.audit_templates.disable') : t('conformite.audit_templates.enable')}
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <Dialog.Root open={open} onOpenChange={(next) => { if (!next) resetAndClose(); else setOpen(true) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/50 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-[min(96vw,58rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-sm font-semibold text-foreground">
                  {t('conformite.audit_templates.create_title')}
                </Dialog.Title>
                <Dialog.Description className="sr-only">
                  {t('conformite.audit_templates.subtitle')}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground">
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Field label={t('conformite.audit_templates.fields.code')}>
                  <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={inputClass} placeholder="AUD-HSE" />
                </Field>
                <Field label={t('conformite.audit_templates.fields.name')} className="md:col-span-2">
                  <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputClass} placeholder={t('conformite.audit_templates.placeholders.name')} />
                </Field>
                <Field label={t('conformite.audit_templates.fields.audit_type')}>
                  <select value={draft.audit_type} onChange={(e) => setDraft({ ...draft, audit_type: e.target.value })} className={inputClass}>
                    <option value="Administratif">{t('conformite.audit_templates.types.administrative')}</option>
                    <option value="HSE">{t('conformite.audit_templates.types.hse')}</option>
                    <option value="Metier">{t('conformite.audit_templates.types.business')}</option>
                  </select>
                </Field>
                <Field label={t('conformite.audit_templates.fields.passing_score')}>
                  <input type="number" min={0} max={100} value={draft.passing_score} onChange={(e) => setDraft({ ...draft, passing_score: Number(e.target.value) })} className={inputClass} />
                </Field>
                <Field label={t('conformite.audit_templates.fields.validity_days')}>
                  <input type="number" min={1} value={draft.validity_days} onChange={(e) => setDraft({ ...draft, validity_days: e.target.value })} className={inputClass} placeholder="365" />
                </Field>
                <Field label={t('conformite.audit_templates.fields.description')} className="md:col-span-2">
                  <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className={inputClass} placeholder={t('conformite.audit_templates.placeholders.description')} />
                </Field>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">{t('conformite.audit_templates.themes')}</h3>
                  <button type="button" onClick={addTheme} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-primary hover:bg-primary/10">
                    <Plus size={12} />
                    {t('conformite.audit_templates.add_theme')}
                  </button>
                </div>

                {draft.themes.map((theme, themeIndex) => (
                  <div key={themeIndex} className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_7rem_2rem]">
                      <input
                        value={theme.title}
                        onChange={(e) => updateTheme(themeIndex, { title: e.target.value })}
                        className={smallInputClass}
                        placeholder={t('conformite.audit_templates.placeholders.theme')}
                      />
                      <input
                        type="number"
                        min={0}
                        value={theme.weight}
                        onChange={(e) => updateTheme(themeIndex, { weight: Number(e.target.value) })}
                        className={smallInputClass}
                        title={t('conformite.audit_templates.fields.weight')}
                      />
                      <button type="button" onClick={() => removeTheme(themeIndex)} className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <input
                      value={theme.description}
                      onChange={(e) => updateTheme(themeIndex, { description: e.target.value })}
                      className={cn(smallInputClass, 'mt-2')}
                      placeholder={t('conformite.audit_templates.placeholders.theme_description')}
                    />

                    <div className="mt-3 space-y-2">
                      {theme.questions.map((question, questionIndex) => (
                        <div key={questionIndex} className="grid gap-2 rounded-md border border-border/70 p-2 md:grid-cols-[5rem_minmax(0,1fr)_8rem_5rem_7rem_7rem_2rem] md:items-center">
                          <input value={question.code} onChange={(e) => updateQuestion(themeIndex, questionIndex, { code: e.target.value })} className={smallInputClass} placeholder={t('conformite.audit_templates.fields.code')} />
                          <input value={question.text} onChange={(e) => updateQuestion(themeIndex, questionIndex, { text: e.target.value })} className={smallInputClass} placeholder={t('conformite.audit_templates.placeholders.question')} />
                          <select value={question.response_type} onChange={(e) => updateQuestion(themeIndex, questionIndex, { response_type: e.target.value as DraftQuestion['response_type'] })} className={smallInputClass}>
                            <option value="score">{t('conformite.audit_templates.response_types.score')}</option>
                            <option value="yes_no">{t('conformite.audit_templates.response_types.yes_no')}</option>
                            <option value="choice">{t('conformite.audit_templates.response_types.choice')}</option>
                            <option value="text">{t('conformite.audit_templates.response_types.text')}</option>
                          </select>
                          <input type="number" min={0} value={question.weight} onChange={(e) => updateQuestion(themeIndex, questionIndex, { weight: Number(e.target.value) })} className={smallInputClass} title={t('conformite.audit_templates.fields.weight')} />
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={question.required} onChange={(e) => updateQuestion(themeIndex, questionIndex, { required: e.target.checked })} />
                            {t('conformite.audit_templates.fields.required')}
                          </label>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <input type="checkbox" checked={question.attachment_required} onChange={(e) => updateQuestion(themeIndex, questionIndex, { attachment_required: e.target.checked })} />
                            {t('conformite.audit_templates.fields.evidence')}
                          </label>
                          <button type="button" onClick={() => removeQuestion(themeIndex, questionIndex)} className="inline-flex h-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 size={13} />
                          </button>
                          {question.response_type === 'choice' && (
                            <input
                              value={question.options}
                              onChange={(e) => updateQuestion(themeIndex, questionIndex, { options: e.target.value })}
                              className={cn(smallInputClass, 'md:col-span-7')}
                              placeholder={t('conformite.audit_templates.placeholders.options')}
                            />
                          )}
                        </div>
                      ))}
                      <button type="button" onClick={() => addQuestion(themeIndex)} className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-primary hover:bg-primary/10">
                        <Plus size={12} />
                        {t('conformite.audit_templates.add_question')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border p-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={resetAndClose} className="h-8 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={createTemplate.isPending}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                <ShieldCheck size={13} />
                {t('conformite.audit_templates.save')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  )
}
