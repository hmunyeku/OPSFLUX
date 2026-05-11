/**
 * Step 7 — Recap. Shows what the admin entered/skipped across the
 * previous steps and prompts them to finish.
 */
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Circle, PartyPopper } from 'lucide-react'
import type { OnboardingState } from '../OnboardingWizard'
import { cn } from '@/lib/utils'

interface Props {
  state: OnboardingState
}

export function Step7Recap({ state }: Props) {
  const { t } = useTranslation()

  const items: { id: number; label: string; done: boolean; detail: string }[] = [
    {
      id: 1,
      label: t('onboarding.step1.title'),
      done: !!(state.profile.first_name && state.profile.last_name),
      detail: state.profile.first_name
        ? `${state.profile.first_name} ${state.profile.last_name}`
        : t('onboarding.recap.skipped'),
    },
    {
      id: 2,
      label: t('onboarding.step2.title'),
      done: !!state.entity.name,
      detail: state.entity.name || t('onboarding.recap.skipped'),
    },
    {
      id: 3,
      label: t('onboarding.step3.title'),
      done: state.users.length > 0,
      detail: state.users.length
        ? t('onboarding.recap.users_count', { count: state.users.length })
        : t('onboarding.recap.skipped'),
    },
    {
      id: 4,
      label: t('onboarding.step4.title'),
      done: state.modules.length > 0,
      detail: state.modules.length
        ? t('onboarding.recap.modules_count', { count: state.modules.length })
        : t('onboarding.recap.skipped'),
    },
    {
      id: 5,
      label: t('onboarding.step5.title'),
      done: !!state.tier.name,
      detail: state.tier.name || t('onboarding.recap.skipped'),
    },
    {
      id: 6,
      label: t('onboarding.step6.title'),
      done: !!state.asset.name,
      detail: state.asset.name || t('onboarding.recap.skipped'),
    },
  ]

  const doneCount = items.filter((i) => i.done).length

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <PartyPopper size={24} className="text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">{t('onboarding.recap.title')}</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {t('onboarding.recap.subtitle', { done: doneCount, total: items.length })}
        </p>
      </div>

      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.id}
            className={cn(
              'flex items-start gap-3 px-3 py-2 rounded-md border border-border',
              it.done && 'border-green-500/30 bg-green-500/5',
            )}
          >
            {it.done ? (
              <CheckCircle2 size={16} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
            ) : (
              <Circle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                {it.id}. {it.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">{it.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-muted-foreground leading-relaxed text-center">
        {t('onboarding.recap.note')}
      </p>
    </div>
  )
}
