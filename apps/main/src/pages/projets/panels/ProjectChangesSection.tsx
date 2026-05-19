import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FileText, Loader2, Paperclip, Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { panelInputClass, FormSection } from '@/components/layout/DynamicPanel'
import { EmptyState } from '@/components/ui/EmptyState'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { RichTextDisplay, RichTextField } from '@/components/shared/RichTextField'
import { useDictionaryOptions } from '@/hooks/useDictionary'
import {
  useCreateProjectChange,
  useDeleteProjectChange,
  useProjectChanges,
  useUpdateProjectChange,
} from '@/hooks/useProjets'
import type { ProjectChange } from '@/types/api'

const statusTone: Record<string, string> = {
  draft: 'border-border bg-muted/40 text-muted-foreground',
  submitted: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  approved: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
  implemented: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  cancelled: 'border-muted bg-muted/40 text-muted-foreground',
}

function formatMoney(value: number | null, currency: string, locale: string) {
  if (value == null) return '0'
  return new Intl.NumberFormat(locale || 'fr-FR', { maximumFractionDigits: 0 }).format(value) + ` ${currency}`
}

function labelFor(options: { value: string; label: string }[], value: string | null | undefined) {
  if (!value) return '-'
  return options.find((o) => o.value === value)?.label ?? value
}

function ChangeCard({
  change,
  projectId,
  typeOptions,
  statusOptions,
}: {
  change: ProjectChange
  projectId: string
  typeOptions: { value: string; label: string }[]
  statusOptions: { value: string; label: string }[]
}) {
  const { t, i18n } = useTranslation()
  const update = useUpdateProjectChange()
  const remove = useDeleteProjectChange()
  const [openFiles, setOpenFiles] = useState(false)
  const currency = change.currency || 'XAF'
  const statusLabel = labelFor(statusOptions, change.status)

  return (
    <article className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground">{change.reference}</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', statusTone[change.status] ?? statusTone.draft)}>
              {statusLabel}
            </span>
            <span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
              {labelFor(typeOptions, change.change_type)}
            </span>
          </div>
          <h4 className="mt-1 truncate text-sm font-semibold text-foreground">{change.title}</h4>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>{t('projets.changes.planning')}: <b className="text-foreground">{change.planning_impact_days ?? 0} {t('common.days_short', 'j')}</b></span>
            <span>{t('projets.changes.budget')}: <b className="text-foreground">{formatMoney(change.budget_impact_amount, currency, i18n.language)}</b></span>
            <span>{t('projets.changes.source')}: <b className="text-foreground">{change.source || '-'}</b></span>
            <span>{t('projets.changes.attachments_short')}: <b className="text-foreground">{change.attachment_count}</b></span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <select
            className={`${panelInputClass} h-8 w-[124px] text-[12px]`}
            value={change.status}
            onChange={(e) => update.mutate({ projectId, changeId: change.id, payload: { status: e.target.value } })}
          >
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setOpenFiles((v) => !v)}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={t('projets.changes.attachments')}
          >
            <Paperclip size={14} />
          </button>
          <button
            type="button"
            onClick={() => remove.mutate({ projectId, changeId: change.id })}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
            title={t('common.delete')}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {(change.description || change.decision_summary) && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {change.description && (
            <div className="rounded border border-border/60 bg-background/40 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('common.description')}</div>
              <RichTextDisplay value={change.description} className="text-[12px]" />
            </div>
          )}
          {change.decision_summary && (
            <div className="rounded border border-border/60 bg-background/40 p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('projets.changes.decision')}</div>
              <RichTextDisplay value={change.decision_summary} className="text-[12px]" />
            </div>
          )}
        </div>
      )}

      {openFiles && (
        <div className="mt-3 border-t border-border pt-3">
          <AttachmentManager
            ownerType="project_change"
            ownerId={change.id}
            compact
            categoryDictionary="project_attachment_type"
          />
        </div>
      )}
    </article>
  )
}

export function ProjectChangesSection({ projectId, currency = 'XAF' }: { projectId: string; currency?: string }) {
  const { t, i18n } = useTranslation()
  const { data: changes = [], isLoading } = useProjectChanges(projectId)
  const create = useCreateProjectChange()
  const typeDictionaryOptions = useDictionaryOptions('project_change_type')
  const statusDictionaryOptions = useDictionaryOptions('project_change_status')
  const typeFallbackOptions = useMemo(() => [
    { value: 'scope', label: t('projets.changes.type.scope') },
    { value: 'planning', label: t('projets.changes.type.planning') },
    { value: 'budget', label: t('projets.changes.type.budget') },
    { value: 'technical_decision', label: t('projets.changes.type.technical_decision') },
    { value: 'other', label: t('projets.changes.type.other') },
  ], [t])
  const statusOptions = statusDictionaryOptions.length > 0 ? statusDictionaryOptions : [
    { value: 'draft', label: t('projets.changes.status.draft') },
    { value: 'submitted', label: t('projets.changes.status.submitted') },
    { value: 'approved', label: t('projets.changes.status.approved') },
    { value: 'rejected', label: t('projets.changes.status.rejected') },
    { value: 'implemented', label: t('projets.changes.status.implemented') },
    { value: 'cancelled', label: t('projets.changes.status.cancelled') },
  ]
  const priorityOptions = [
    { value: 'low', label: t('projets.priority.low') },
    { value: 'medium', label: t('projets.priority.medium') },
    { value: 'high', label: t('projets.priority.high') },
    { value: 'critical', label: t('projets.priority.critical') },
  ]
  const typeOptions = typeDictionaryOptions.length > 0 ? typeDictionaryOptions : typeFallbackOptions
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    title: '',
    change_type: typeOptions[0]?.value ?? 'other',
    status: 'draft',
    priority: 'medium',
    source: '',
    planning_impact_days: '',
    budget_impact_amount: '',
    description: '',
    decision_summary: '',
  })

  const stats = useMemo(() => {
    const totalBudget = changes.reduce((sum, c) => sum + (c.budget_impact_amount ?? 0), 0)
    const totalDays = changes.reduce((sum, c) => sum + (c.planning_impact_days ?? 0), 0)
    const approved = changes.filter((c) => c.status === 'approved' || c.status === 'implemented').length
    return { totalBudget, totalDays, approved }
  }, [changes])

  const save = async () => {
    const title = form.title.trim()
    if (!title) return
    await create.mutateAsync({
      projectId,
      payload: {
        title,
        change_type: form.change_type,
        status: form.status,
        priority: form.priority,
        source: form.source.trim() || null,
        planning_impact_days: form.planning_impact_days ? Number(form.planning_impact_days) : null,
        budget_impact_amount: form.budget_impact_amount ? Number(form.budget_impact_amount) : null,
        currency,
        description: form.description || null,
        decision_summary: form.decision_summary || null,
      },
    })
    setForm({
      title: '',
      change_type: typeOptions[0]?.value ?? 'other',
      status: 'draft',
      priority: 'medium',
      source: '',
      planning_impact_days: '',
      budget_impact_amount: '',
      description: '',
      decision_summary: '',
    })
    setExpanded(false)
  }

  return (
    <FormSection
      title={<span className="inline-flex items-center gap-2"><AlertTriangle size={14} /> {t('projets.changes.section_title', { count: changes.length })}</span>}
      collapsible
      defaultExpanded
      storageKey="project-changes"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t('projets.changes.total')}</div>
            <div className="text-lg font-semibold">{changes.length}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t('projets.changes.validated')}</div>
            <div className="text-lg font-semibold">{stats.approved}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t('projets.changes.planning')}</div>
            <div className="text-lg font-semibold">{stats.totalDays} {t('common.days_short', 'j')}</div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{t('projets.changes.budget')}</div>
            <div className="text-lg font-semibold">{formatMoney(stats.totalBudget, currency, i18n.language)}</div>
          </div>
        </div>

        {!expanded ? (
          <button type="button" onClick={() => setExpanded(true)} className="flex items-center gap-2 text-sm font-medium text-primary">
            <Plus size={14} /> {t('projets.changes.add')}
          </button>
        ) : (
          <div className="rounded-md border border-border bg-background/40 p-3">
            <div className="grid gap-2 md:grid-cols-4">
              <input className={`${panelInputClass} md:col-span-2`} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('projets.changes.title_placeholder')} />
              <select className={panelInputClass} value={form.change_type} onChange={(e) => setForm({ ...form, change_type: e.target.value })}>
                {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select className={panelInputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input className={panelInputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder={t('projets.changes.source_placeholder')} />
              <input className={panelInputClass} type="number" value={form.planning_impact_days} onChange={(e) => setForm({ ...form, planning_impact_days: e.target.value })} placeholder={t('projets.changes.planning_impact_placeholder')} />
              <input className={panelInputClass} type="number" value={form.budget_impact_amount} onChange={(e) => setForm({ ...form, budget_impact_amount: e.target.value })} placeholder={t('projets.changes.budget_impact_placeholder', { currency })} />
              <select className={panelInputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              <RichTextField value={form.description} onChange={(html) => setForm({ ...form, description: html })} placeholder={t('projets.changes.description_placeholder')} compact rows={4} />
              <RichTextField value={form.decision_summary} onChange={(html) => setForm({ ...form, decision_summary: html })} placeholder={t('projets.changes.decision_placeholder')} compact rows={4} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => setExpanded(false)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-primary" onClick={save} disabled={!form.title.trim() || create.isPending}>
                {create.isPending ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                {t('common.save')}
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : changes.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={t('projets.changes.empty_title')} description={t('projets.changes.empty_description')} />
        ) : (
          <div className="space-y-2">
            {changes.map((change) => (
              <ChangeCard key={change.id} change={change} projectId={projectId} typeOptions={typeOptions} statusOptions={statusOptions} />
            ))}
          </div>
        )}
      </div>
    </FormSection>
  )
}
