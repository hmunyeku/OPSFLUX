/**
 * OnboardingWizard — Multi-step guided setup for a freshly created entity.
 *
 * Walks a new admin through 7 steps:
 *   1. Profile          — name, email, photo (self-service via /api/v1/profile)
 *   2. Entity info      — name, address, currency, timezone
 *   3. First user(s)    — invite at least one teammate
 *   4. Modules          — checkbox list of business modules to enable
 *   5. First Tier       — create the first business partner
 *   6. First Asset      — create the first site / installation
 *   7. Recap            — summary + "Terminé"
 *
 * Each step (except 7) has skip + previous/next. Current step + form
 * state persist in localStorage under `opsflux.onboarding.state` so the
 * wizard can resume after a reload. When the entity is already populated
 * (has tiers + users + assets) we render a short "déjà configuré" state
 * with a single dismiss button.
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

const TOTAL_STEPS = 7

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
  const [state, setState] = useState<OnboardingState>(() => loadState())

  // Check "already configured" — if the entity has tiers + users + assets
  // we show a different welcome state instead of forcing the full wizard.
  // We only fetch this once the modal opens to avoid extra API calls.
  const { data: tiers } = useTiers({ page_size: 1 })
  const { data: users } = useUsers({ page_size: 1 })
  const { data: assets } = useAssets({ page_size: 1 })

  const alreadyConfigured = useMemo(() => {
    if (!open) return false
    const hasTiers = (tiers?.total ?? 0) > 0
    const hasUsers = (users?.total ?? 0) > 1 // > 1 because the admin counts
    const hasAssets = (assets?.total ?? 0) > 0
    return hasTiers && hasUsers && hasAssets
  }, [open, tiers, users, assets])

  // Persist on every mutation.
  useEffect(() => {
    if (open) saveState(state)
  }, [state, open])

  const update = useCallback((patch: Partial<OnboardingState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  const goNext = useCallback(() => {
    setState((s) => {
      const next: OnboardingStepId = Math.min(s.currentStep + 1, TOTAL_STEPS) as OnboardingStepId
      return {
        ...s,
        currentStep: next,
        completed: { ...s.completed, [s.currentStep]: true },
      }
    })
  }, [])

  const goPrev = useCallback(() => {
    setState((s) => ({
      ...s,
      currentStep: Math.max(s.currentStep - 1, 1) as OnboardingStepId,
    }))
  }, [])

  const goSkip = useCallback(() => {
    setState((s) => ({
      ...s,
      currentStep: Math.min(s.currentStep + 1, TOTAL_STEPS) as OnboardingStepId,
    }))
  }, [])

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

  const progressPct = (state.currentStep / TOTAL_STEPS) * 100

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
                    {t('onboarding.step_label', { current: state.currentStep, total: TOTAL_STEPS })}
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
                aria-valuenow={state.currentStep}
                aria-valuemin={1}
                aria-valuemax={TOTAL_STEPS}
              />
            </div>
            {/* Step dots */}
            <div className="mt-2 flex items-center justify-between gap-1 px-0.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const stepNum = (i + 1) as OnboardingStepId
                const active = stepNum === state.currentStep
                const done = state.completed[stepNum] || stepNum < state.currentStep
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
              disabled={state.currentStep === 1}
              className="btn btn-sm btn-secondary"
            >
              <ArrowLeft size={12} />
              {t('onboarding.nav.previous')}
            </button>
            <div className="flex items-center gap-2">
              {state.currentStep < TOTAL_STEPS && (
                <button onClick={goSkip} className="btn btn-sm btn-secondary">
                  <SkipForward size={12} />
                  {t('onboarding.nav.skip')}
                </button>
              )}
              {state.currentStep < TOTAL_STEPS ? (
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

