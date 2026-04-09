import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'
import { t } from '../lib/i18n'

export interface WizardStep {
  id: string
  title: string
  description: string
  done: boolean
  current: boolean
}

interface WizardNavProps {
  steps: WizardStep[]
  onStepClick: (stepIndex: number) => void
}

export function buildSteps(authenticated: boolean, dossier: any): WizardStep[] {
  const totalPax = dossier?.pax_summary?.total ?? 0
  const blocked = dossier?.pax_summary?.blocked ?? 0
  const pending = dossier?.pax_summary?.pending_check ?? 0
  const accessDone = authenticated
  const publicInfoDone = authenticated && Boolean(dossier)
  const teamDone = publicInfoDone && totalPax > 0
  const complianceDone = teamDone && blocked === 0 && pending === 0
  const finalizeDone = Boolean(dossier?.can_submit || dossier?.can_resubmit)

  const steps: WizardStep[] = [
    { id: 'step-access', title: t('wizard_access_title'), description: t('wizard_access_nav'), done: accessDone, current: !accessDone },
    { id: 'step-ads', title: t('wizard_ads_title'), description: t('wizard_ads_nav'), done: publicInfoDone, current: accessDone && !publicInfoDone },
    { id: 'step-team', title: t('wizard_team_title'), description: t('wizard_team_nav'), done: teamDone, current: publicInfoDone && !teamDone },
    { id: 'step-compliance', title: t('wizard_compliance_title'), description: t('wizard_compliance_nav'), done: complianceDone, current: teamDone && !complianceDone },
    { id: 'step-finalize', title: t('wizard_finalize_title'), description: t('wizard_finalize_nav'), done: finalizeDone, current: complianceDone && !finalizeDone },
  ]

  if (!steps.some((s) => s.current)) {
    const fallback = steps.find((s) => !s.done)
    if (fallback) fallback.current = true
    else steps[steps.length - 1].current = true
  }

  return steps
}

export default function WizardNav({ steps, onStepClick }: WizardNavProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden lg:flex flex-col w-72 shrink-0 sticky top-[3.5rem] h-[calc(100vh-3.5rem)] bg-[var(--surface)] border-r border-[var(--border)] overflow-y-auto">
        <div className="px-5 pt-6 pb-4">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-brand-500 mb-1">{t('wizard_title')}</p>
          <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{t('wizard_subtitle')}</p>
        </div>
        <div className="flex-1 px-3 pb-6">
          <div className="flex flex-col gap-1">
            {steps.map((step, i) => (
              <button
                key={step.id}
                onClick={() => onStepClick(i)}
                className={cn(
                  'group flex items-start gap-3 w-full px-3 py-3 rounded-xl text-left transition-all duration-200',
                  step.current
                    ? 'bg-brand-50 dark:bg-brand-950/30'
                    : 'hover:bg-[var(--surface-raised)]',
                )}
              >
                <StepIndicator index={i} done={step.done} current={step.current} />
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-sm font-medium leading-tight truncate',
                    step.current ? 'text-brand-600 dark:text-brand-400' : step.done ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]',
                  )}>
                    {step.title}
                  </p>
                  <p className={cn(
                    'text-xs mt-0.5 leading-tight truncate',
                    step.current ? 'text-brand-500/70 dark:text-brand-400/60' : 'text-[var(--text-tertiary)]',
                  )}>
                    {step.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Mobile top bar */}
      <nav className="lg:hidden sticky top-14 z-20 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex items-center gap-1 px-4 py-3 overflow-x-auto">
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => onStepClick(i)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0',
                step.current
                  ? 'bg-brand-500 text-white shadow-sm'
                  : step.done
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-[var(--surface-raised)] text-[var(--text-tertiary)]',
              )}
            >
              {step.done ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <span className="w-4 h-4 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
              )}
              <span className="hidden sm:inline">{step.description}</span>
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}

function StepIndicator({ index, done, current }: { index: number; done: boolean; current: boolean }) {
  if (done) {
    return (
      <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
      </div>
    )
  }
  if (current) {
    return (
      <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-brand-500/30">
        <span className="text-xs font-bold text-white">{index + 1}</span>
      </div>
    )
  }
  return (
    <div className="w-7 h-7 rounded-full border-2 border-[var(--border)] flex items-center justify-center shrink-0 mt-0.5">
      <span className="text-xs font-medium text-[var(--text-tertiary)]">{index + 1}</span>
    </div>
  )
}
