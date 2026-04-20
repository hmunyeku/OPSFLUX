/**
 * MOCDetailPanel helper components — extracted from the monolithic
 * MOCDetailPanel.tsx to keep it readable.
 *
 * All components here are pure presentation / stateless-ish helpers:
 *   - MOCStepper          : top-of-panel progress indicator
 *   - LinkedProjectCard   : project summary on the Exécution tab
 *   - SignatureSlot       : single slot signature pad + save button
 *   - FullWidthRichRow    : labelled block for rich-text HTML value
 *
 * Plus one pure utility:
 *   - missingPrereqsFor   : mirrors backend FSM guards, returns the
 *                           i18n keys of missing prerequisites for a
 *                           target transition
 *
 * None of these own mutations — the bigger components that do
 * (ValidationRow, ExecutionTab, DirectorAccordBlock, …) stay in
 * MOCDetailPanel.tsx until a second refactor pass.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/i18n'
import { SignaturePad } from '@/components/shared/SignaturePad'
import { RichTextDisplay } from '@/components/shared/RichTextField'
import type {
  MOCStatus,
  MOCWithDetails,
  MOCLinkedProject,
} from '@/services/mocService'

// ─── Stepper milestones ──────────────────────────────────────────────────
// Keep the order in sync with MOCTrack's visual workflow in docs/check.
// Each milestone aggregates 1+ backend statuses so one step covers
// transient states like "stand_by" under the "direction" umbrella.

export const STEPPER_MILESTONES: {
  id: string
  i18nKey: string
  statuses: MOCStatus[]
}[] = [
  { id: 'request', i18nKey: 'moc.stepper.request', statuses: ['created'] },
  { id: 'site_chief', i18nKey: 'moc.stepper.site_chief', statuses: ['approved'] },
  {
    id: 'direction',
    i18nKey: 'moc.stepper.direction',
    statuses: ['submitted_to_confirm', 'stand_by', 'approved_to_study'],
  },
  { id: 'study', i18nKey: 'moc.stepper.study', statuses: ['under_study'] },
  {
    id: 'validation',
    i18nKey: 'moc.stepper.validation',
    statuses: ['study_in_validation', 'validated'],
  },
  { id: 'execution', i18nKey: 'moc.stepper.execution', statuses: ['execution'] },
  {
    id: 'close',
    i18nKey: 'moc.stepper.close',
    statuses: ['executed_docs_pending', 'closed'],
  },
]

export function MOCStepper({ status }: { status: MOCStatus }) {
  const { t } = useTranslation()
  const activeIndex = STEPPER_MILESTONES.findIndex((m) =>
    m.statuses.includes(status),
  )
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] select-none">
      {STEPPER_MILESTONES.map((m, i) => {
        const done = i < activeIndex
        const active = i === activeIndex
        return (
          <div key={m.id} className="flex items-center gap-1">
            <div
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors',
                active && 'bg-primary text-primary-foreground font-semibold shadow-sm',
                done && 'bg-primary/20 text-primary',
                !active && !done && 'bg-muted text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                  active && 'bg-primary-foreground/20',
                  done && 'bg-primary/30',
                  !active && !done && 'bg-background/50',
                )}
              >
                {done ? '✓' : i + 1}
              </span>
              <span>{t(m.i18nKey)}</span>
            </div>
            {i < STEPPER_MILESTONES.length - 1 && (
              <span
                className={cn(
                  'h-px w-3',
                  i < activeIndex ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── LinkedProjectCard — summary of the project spawned from the MOC ───
// Shown on top of the Exécution tab when `moc.linked_project` is set.
// Displays code, name, status badge, progress bar and key dates. Clicking
// "Ouvrir" navigates to the project page.

export function LinkedProjectCard({ project }: { project: MOCLinkedProject }) {
  const { t } = useTranslation()
  const statusClass =
    project.status === 'completed'
      ? 'bg-green-600 text-white'
      : project.status === 'cancelled'
        ? 'bg-destructive text-destructive-foreground'
        : project.status === 'on_hold'
          ? 'bg-amber-500 text-white'
          : 'bg-primary text-primary-foreground'
  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
          {project.code}
        </span>
        <strong className="truncate">{project.name}</strong>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            statusClass,
          )}
        >
          {project.status}
        </span>
        <a
          href={`/projets?id=${project.id}`}
          className="ml-auto text-primary underline inline-flex items-center gap-1"
        >
          {t('moc.fields.linked_project_view')}
        </a>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1 text-[10px] text-muted-foreground">
          <span>{t('common.progress')}</span>
          <span>{project.progress}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        {project.start_date && (
          <span>
            {t('common.start_date')} : {formatDate(project.start_date)}
          </span>
        )}
        {project.end_date && (
          <span>
            {t('common.end_date')} : {formatDate(project.end_date)}
          </span>
        )}
        {project.actual_end_date && (
          <span>
            {t('common.actual_end')} : {formatDate(project.actual_end_date)}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── SignatureSlot — single signature pad + save button ──────────────────
// Uncontrolled draft state so the user can re-draw without committing
// until they click Save. The parent hands down the latest saved value
// and the async save mutation.

export function SignatureSlot({
  label,
  value,
  disabled,
  onSave,
}: {
  label: string
  value: string | null
  disabled?: boolean
  onSave: (signature: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(value)
  return (
    <div className="space-y-1">
      <SignaturePad
        label={label}
        value={draft ?? value}
        onChange={(s) => setDraft(s)}
        disabled={disabled}
      />
      {draft && draft !== value && (
        <button
          type="button"
          className="gl-button gl-button-sm gl-button-primary"
          onClick={async () => {
            if (draft) await onSave(draft)
          }}
        >
          <CheckCircle2 size={11} /> {t('moc.actions.save_signature')}
        </button>
      )}
    </div>
  )
}

// ─── FullWidthRichRow — labelled block for multi-paragraph rich text ─────
// Used instead of ReadOnlyRow inside a DetailFieldGrid when the value is
// long-form rich HTML that needs the whole section width to breathe.

export function FullWidthRichRow({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  const hasContent = !!(value && value.trim() && value.trim() !== '<p></p>')
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1">
        {label}
      </div>
      <div className="rounded border border-border bg-muted/10 px-3 py-2">
        {hasContent ? (
          <RichTextDisplay value={value} />
        ) : (
          <span className="text-xs italic text-muted-foreground">—</span>
        )}
      </div>
    </div>
  )
}

// ─── Transition preconditions — mirror the backend guards ─────────────────
// Returns the i18n keys of missing prerequisites for a given target status.
// Must stay in sync with the gates declared in app/services/modules/moc_service.py
// under `async def transition`. If the list is non-empty, the UI disables
// the transition button and surfaces the blockers inline.

export function missingPrereqsFor(
  to: MOCStatus,
  moc: MOCWithDetails,
  transitionNote: string,
  priority: '1' | '2' | '3',
): string[] {
  const missing: string[] = []
  if (to === 'approved') {
    if (!moc.initiator_signature) missing.push('moc.prereq.initiator_signature')
    if (moc.is_real_change === null || moc.is_real_change === undefined) {
      missing.push('moc.prereq.is_real_change')
    }
    if (
      !moc.site_chief_comment?.trim() &&
      !transitionNote.trim()
    ) {
      missing.push('moc.prereq.site_chief_comment')
    }
  } else if (to === 'submitted_to_confirm') {
    if (!moc.site_chief_signature) missing.push('moc.prereq.site_chief_signature')
  } else if (to === 'approved_to_study') {
    if (!['1', '2', '3'].includes(priority)) missing.push('moc.prereq.priority')
  } else if (to === 'validated') {
    const unapproved = (moc.validations || []).filter(
      (v) => v.required && !v.approved,
    )
    if (unapproved.length > 0) missing.push('moc.prereq.all_validators_approved')
  } else if (to === 'execution') {
    if (moc.do_execution_accord !== true) missing.push('moc.prereq.do_accord')
    if (moc.dg_execution_accord !== true) missing.push('moc.prereq.dg_accord')
  } else if (to === 'closed') {
    if (moc.pid_update_required && !moc.pid_update_completed) {
      missing.push('moc.prereq.pid_update')
    }
    if (moc.esd_update_required && !moc.esd_update_completed) {
      missing.push('moc.prereq.esd_update')
    }
    if (!moc.close_signature) missing.push('moc.prereq.close_signature')
  }
  return missing
}
