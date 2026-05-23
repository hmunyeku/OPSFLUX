/**
 * OnboardingWizard — Multi-step guided setup, context-aware.
 *
 * Comportement (suite refonte Bastien : "assistant onboarding s'ouvre
 * comme si on cree une nouvelle entite alors que l'utilisateur est
 * deja affecte a une entite et il n'a pas forcement toutes les
 * permissions") :
 *
 * - Steps disponibles dependent des permissions effectives du user :
 *   1. Profile          — toujours (self-service)
 *   2. Entity info      — uniquement si core.entity.update
 *   3. First user(s)    — uniquement si core.user.create
 *   4. Modules          — uniquement si core.settings.manage
 *   5. First Tier       — uniquement si tier.create (avec bouton import en masse)
 *   6. First Asset      — uniquement si asset.create (avec bouton import en masse)
 *   7. Recap            — toujours
 *
 * - Step2Entity affiche le nom de l'entite courante en read-only et
 *   ne permet jamais de "changer d'entite" (impossible par design).
 *
 * - Si l'utilisateur n'a aucune permission admin (ni 2/3/4/5/6), le
 *   wizard se reduit a Step1Profile + Step7Recap minimaliste (welcome
 *   tour, pas creation).
 *
 * - Le wizard ne se rouvre pas si user a deja ete onboarde
 *   (markOnboardingDismissed dans localStorage).
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import {
  X,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  SkipForward,
  Sparkles,
  PartyPopper,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeLocal } from '@/lib/safeStorage'
import { useTiers } from '@/hooks/useTiers'
import { useUsers } from '@/hooks/useUsers'
import { useAssets } from '@/hooks/useAssets'
import { usePermission } from '@/hooks/usePermission'
import { Step1Profile } from './steps/Step1Profile'
import { Step2Entity } from './steps/Step2Entity'
import { Step3Users } from './steps/Step3Users'
import { Step4Modules } from './steps/Step4Modules'
import { Step5FirstTier } from './steps/Step5FirstTier'
import { Step6FirstAsset } from './steps/Step6FirstAsset'
import { Step7Recap } from './steps/Step7Recap'

// ── Types ────────────────────────────────────────────────────

export type OnboardingStepId = 1 | 2 | 3 | 4 | 5 | 6 | 7

export interface OnboardingState {
  currentStep: OnboardingStepId
  /** Mark steps that the user explicitly completed (vs skipped). */
  completed: Record<OnboardingStepId, boolean>
  /** Drafts persisted across sessions. */
  profile: { first_name: string; last_name: string; language: string }
  entity: {
    name: string
    address_line1: string
    city: string
    country: string
    currency: string
    timezone: string
  }
  users: { email: string; first_name: string; last_name: string }[]
  modules: string[]
  tier: { name: string; type: string; email: string }
  asset: { name: string; site_type: string; country: string }
}

const STORAGE_KEY = 'opsflux.onboarding.state'
const DISMISS_KEY = 'opsflux.onboarding.dismissed'

const DEFAULT_STATE: OnboardingState = {
  currentStep: 1,
  completed: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false },
  profile: { first_name: '', last_name: '', language: 'fr' },
  entity: {
    name: '',
    address_line1: '',
    city: '',
    country: '',
    currency: 'EUR',
    timezone: 'Europe/Paris',
  },
  users: [],
  modules: [],
  tier: { name: '', type: 'customer', email: '' },
  asset: { name: '', site_type: 'ONSHORE', country: '' },
}

// TOTAL_STEPS retire — le nombre de steps depend des permissions du
// user (cf allowedSteps dans le component). Conserve pour reference
// historique.
// const TOTAL_STEPS = 7

// ── Persistence helpers ──────────────────────────────────────

function loadState(): OnboardingState {
  try {
    const raw = safeLocal.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    // Merge with defaults so newly added keys don't break older saves.
    return {
      ...DEFAULT_STATE,
      ...parsed,
      profile: { ...DEFAULT_STATE.profile, ...(parsed.profile || {}) },
      entity: { ...DEFAULT_STATE.entity, ...(parsed.entity || {}) },
      tier: { ...DEFAULT_STATE.tier, ...(parsed.tier || {}) },
      asset: { ...DEFAULT_STATE.asset, ...(parsed.asset || {}) },
      completed: { ...DEFAULT_STATE.completed, ...(parsed.completed || {}) },
      users: parsed.users || [],
      modules: parsed.modules || [],
    }
  } catch {
    return DEFAULT_STATE
  }
}

function saveState(state: OnboardingState): void {
  try {
    safeLocal.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage full or denied — non-fatal */
  }
}

export function isOnboardingDismissed(): boolean {
  return safeLocal.getItem(DISMISS_KEY) === '1'
}

export function markOnboardingDismissed(): void {
  try {
    safeLocal.setItem(DISMISS_KEY, '1')
  } catch {
    /* non-fatal */
  }
}

// ── Component ────────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function OnboardingWizard({ open, onClose }: Props) {
  const { t } = useTranslation()
  const { hasPermission, loading: permsLoading } = usePermission()
  const [state, setState] = useState<OnboardingState>(() => loadState())

  // ── Steps autorises selon les permissions du user courant ──────
  // Step1 (profile) et Step7 (recap) sont toujours visibles. Les
  // autres sont conditionnees par les permissions admin du user.
  // Si user n'a aucune perm admin -> wizard reduit a Profile+Recap.
  const allowedSteps = useMemo<OnboardingStepId[]>(() => {
    const steps: OnboardingStepId[] = [1] // Profile toujours
    if (hasPermission('core.entity.update')) steps.push(2)
    if (hasPermission('core.user.create')) steps.push(3)
    if (hasPermission('core.settings.manage')) steps.push(4)
    if (hasPermission('tier.tier.create')) steps.push(5)
    if (hasPermission('asset.asset.create')) steps.push(6)
    steps.push(7) // Recap toujours
    return steps
  }, [hasPermission])

  const totalSteps = allowedSteps.length
  const currentIndex = Math.max(0, allowedSteps.indexOf(state.currentStep))

  // Check "already configured" — les hooks fetch toujours, en 403 si
  // l'user n'a pas la perm, data reste undefined ; le check se base
  // alors uniquement sur totalSteps.
  const { data: tiers } = useTiers({ page_size: 1 })
  const { data: users } = useUsers({ page_size: 1 })
  const { data: assets } = useAssets({ page_size: 1 })

  const alreadyConfigured = useMemo(() => {
    if (!open) return false
    if (permsLoading) return false
    // Si user a aucune perm admin -> on considere "deja configure"
    // pour skipper le wizard, parce qu'il n'a rien a configurer.
    if (totalSteps <= 2) return true
    const hasTiers = (tiers?.total ?? 0) > 0
    const hasUsers = (users?.total ?? 0) > 1
    const hasAssets = (assets?.total ?? 0) > 0
    return hasTiers && hasUsers && hasAssets
  }, [open, permsLoading, totalSteps, tiers, users, assets])

  // Persist on every mutation.
  useEffect(() => {
    if (open) saveState(state)
  }, [state, open])

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  // Navigation : on saute aux steps autorises (allowedSteps) plutot
  // qu'incrementer aveuglement, parce qu'un step peut etre filtre par
  // permission entre 2 transitions.
  const goNext = useCallback(() => {
    setState((s) => {
      const idx = allowedSteps.indexOf(s.currentStep)
      const next = allowedSteps[idx + 1] ?? s.currentStep
      return {
        ...s,
        currentStep: next,
        completed: { ...s.completed, [s.currentStep]: true },
      }
    })
  }, [allowedSteps])

  const goPrev = useCallback(() => {
    setState((s) => {
      const idx = allowedSteps.indexOf(s.currentStep)
      const prev = idx > 0 ? allowedSteps[idx - 1] : s.currentStep
      return { ...s, currentStep: prev }
    })
  }, [allowedSteps])

  const goSkip = useCallback(() => {
    setState((s) => {
      const idx = allowedSteps.indexOf(s.currentStep)
      const next = allowedSteps[idx + 1] ?? s.currentStep
      return { ...s, currentStep: next }
    })
  }, [allowedSteps])

  // Auto-correct : si currentStep n'est plus autorise (cas refresh
  // permission), on reinitialise au 1er step autorise.
  useEffect(() => {
    if (!open || permsLoading) return
    if (!allowedSteps.includes(state.currentStep)) {
      setState((s) => ({ ...s, currentStep: allowedSteps[0] ?? 1 }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, permsLoading, allowedSteps])

  const handleFinish = useCallback(() => {
    markOnboardingDismissed()
    safeLocal.removeItem(STORAGE_KEY)
    setState(DEFAULT_STATE)
    onClose()
  }, [onClose])

  const handleDismissAlreadyConfigured = useCallback(() => {
    markOnboardingDismissed()
    onClose()
  }, [onClose])

  if (!open) return null
  if (permsLoading) return null

  const progressPct = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0
  const isLastStep = currentIndex === totalSteps - 1
  const isFirstStep = currentIndex === 0

  // ── Already configured shortcut ────────────────────────────
  if (alreadyConfigured) {
    return (
      <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 w-[95vw] max-w-md flex flex-col p-6"
          >
            <Dialog.Title className="sr-only">{t('onboarding.already.title')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('onboarding.already.desc')}</Dialog.Description>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 size={28} className="text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-base font-semibold text-foreground">{t('onboarding.already.title')}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{t('onboarding.already.desc')}</p>
              <button
                onClick={handleDismissAlreadyConfigured}
                className="btn btn-sm btn-primary mt-2"
              >
                <Check size={13} />
                {t('onboarding.already.dismiss')}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }

  // ── Main wizard ────────────────────────────────────────────
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content
          className={cn(
            'fixed z-[var(--z-modal)] border bg-card shadow-xl animate-in fade-in flex flex-col',
            // Mobile: full-screen.
            'inset-0 sm:inset-auto',
            // Desktop: centered modal.
            'sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:rounded-lg sm:w-[95vw] sm:max-w-2xl sm:max-h-[90vh]',
            'sm:slide-in-from-bottom-4',
          )}
        >
          {/* Header + progress */}
          <div className="px-4 py-3 border-b border-border shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <Dialog.Title className="text-sm font-semibold truncate">
                    {t('onboarding.title')}
                  </Dialog.Title>
                  <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                    {t('onboarding.step_label', { current: currentIndex + 1, total: totalSteps })}
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-chrome hover:text-foreground transition-colors"
                  aria-label={t('common.close')}
                >
                  <X size={14} />
                </button>
              </Dialog.Close>
            </div>
            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
                role="progressbar"
                aria-valuenow={currentIndex + 1}
                aria-valuemin={1}
                aria-valuemax={totalSteps}
              />
            </div>
            {/* Step dots — un dot par step autorise */}
            <div className="mt-2 flex items-center justify-between gap-1 px-0.5">
              {allowedSteps.map((stepNum, i) => {
                const active = stepNum === state.currentStep
                const done = state.completed[stepNum] || i < currentIndex
                return (
                  <div
                    key={stepNum}
                    className={cn(
                      'h-1.5 w-1.5 rounded-full transition-colors',
                      active && 'bg-primary scale-125',
                      !active && done && 'bg-primary/70',
                      !active && !done && 'bg-muted-foreground/30',
                    )}
                    aria-hidden
                  />
                )
              })}
            </div>
          </div>

          {/* Step body */}
          <div className="flex-1 overflow-y-auto px-4 py-5">
            {state.currentStep === 1 && (
              <Step1Profile
                value={state.profile}
                onChange={(v) => update({ profile: { ...state.profile, ...v } })}
              />
            )}
            {state.currentStep === 2 && (
              <Step2Entity
                value={state.entity}
                onChange={(v) => update({ entity: { ...state.entity, ...v } })}
              />
            )}
            {state.currentStep === 3 && (
              <Step3Users
                value={state.users}
                onChange={(v) => update({ users: v })}
              />
            )}
            {state.currentStep === 4 && (
              <Step4Modules
                value={state.modules}
                onChange={(v) => update({ modules: v })}
              />
            )}
            {state.currentStep === 5 && (
              <Step5FirstTier
                value={state.tier}
                onChange={(v) => update({ tier: { ...state.tier, ...v } })}
              />
            )}
            {state.currentStep === 6 && (
              <Step6FirstAsset
                value={state.asset}
                onChange={(v) => update({ asset: { ...state.asset, ...v } })}
              />
            )}
            {state.currentStep === 7 && <Step7Recap state={state} />}
          </div>

          {/* Footer — nav buttons */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/20 shrink-0">
            <button
              onClick={goPrev}
              disabled={isFirstStep}
              className="btn btn-sm btn-secondary"
            >
              <ArrowLeft size={12} />
              {t('onboarding.nav.previous')}
            </button>
            <div className="flex items-center gap-2">
              {!isLastStep && (
                <button onClick={goSkip} className="btn btn-sm btn-secondary">
                  <SkipForward size={12} />
                  {t('onboarding.nav.skip')}
                </button>
              )}
              {!isLastStep ? (
                <button onClick={goNext} className="btn btn-sm btn-primary">
                  {t('onboarding.nav.next')}
                  <ArrowRight size={12} />
                </button>
              ) : (
                <button onClick={handleFinish} className="btn btn-sm btn-primary">
                  <PartyPopper size={12} />
                  {t('onboarding.nav.finish')}
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

