import React from 'react'
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
  activeStep: number
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

export default function WizardNav({ steps, activeStep, onStepClick }: WizardNavProps) {
  return (
    <nav className="section-card" style={{ padding: '12px 16px' }}>
      <div className="flex items-center gap-0">
        {steps.map((step, index) => {
          const isActive = index === activeStep
          const isDone = step.done
          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <div className={`step-connector${isDone || (index <= activeStep) ? ' done' : ''}`} />
              )}
              <button
                type="button"
                onClick={() => onStepClick(index)}
                className={`step-dot${isActive ? ' active' : ''}${isDone && !isActive ? ' done' : ''}`}
                title={step.title}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone && !isActive ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  index + 1
                )}
              </button>
            </React.Fragment>
          )
        })}
      </div>
      {/* Step label below on wider screens */}
      <div className="hidden sm:flex items-center mt-2 px-1" style={{ gap: 0 }}>
        {steps.map((step, index) => (
          <React.Fragment key={`label-${step.id}`}>
            {index > 0 && <div className="flex-1" />}
            <span
              className={`text-xs font-medium text-center ${index === activeStep ? 'text-blue-700' : step.done ? 'text-green-700' : 'text-gray-400'}`}
              style={{ width: 32, flexShrink: 0 }}
            >
              {step.title}
            </span>
          </React.Fragment>
        ))}
      </div>
    </nav>
  )
}
