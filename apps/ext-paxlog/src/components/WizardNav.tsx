import React from 'react'
import { EuiBadge, EuiIcon, EuiPanel, EuiProgress, EuiSteps, EuiText, EuiTitle } from '@elastic/eui'
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
  const currentIndex = Math.max(steps.findIndex((step) => step.current), 0)
  const percent = ((currentIndex + 1) / Math.max(steps.length, 1)) * 100

  return (
    <EuiPanel hasBorder paddingSize="m">
      <EuiTitle size="xxs">
        <h3>{t('wizard_title')}</h3>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        <p>{t('wizard_subtitle')}</p>
      </EuiText>
      <EuiProgress value={percent} max={100} size="s" />
      <div style={{ marginTop: 16 }}>
        <EuiSteps
          steps={steps.map((step, index) => ({
            title: step.title,
            children: (
              <button
                type="button"
                onClick={() => onStepClick(index)}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <EuiText size="s" color="subdued">
                  <p>{step.description}</p>
                </EuiText>
              </button>
            ),
            status: step.done ? 'complete' : step.current ? 'current' : 'incomplete',
          }))}
        />
      </div>
      <div style={{ marginTop: 8 }}>
        <EuiBadge color="primary">
          <EuiIcon type="editorComment" />
          &nbsp;{String(currentIndex + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}
        </EuiBadge>
      </div>
    </EuiPanel>
  )
}
