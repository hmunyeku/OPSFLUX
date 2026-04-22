/**
 * SmartForm — adaptive Create/Edit panels with 3 modes.
 *
 * ## The problem
 *
 * As we've made Create panels richer (staging pattern unlocked attachments,
 * notes, tags, nested entities, rich-text, etc.), a single form can hold
 * 40+ fields across 10 sections. That's overwhelming for a "quick create"
 * user and fine for a power user — no single layout serves both.
 *
 * ## The solution
 *
 * Three modes sharing ONE form definition:
 *
 *   • `simple`   — only essential sections (required fields +
 *                  recommended context). What 80 % of users need.
 *                  A banner offers "Afficher tout" to switch.
 *
 *   • `advanced` — every section, expandable/collapsible. Power users.
 *
 *   • `wizard`   — step-by-step, one section at a time, with prev/skip/next
 *                  buttons + progress bar + contextual help per step.
 *                  Great for onboarding or complex flows.
 *
 * The user's choice is persisted per-panel in localStorage.
 *
 * ## Usage
 *
 * ```tsx
 * <DynamicPanelShell title="Nouveau projet" actions={[...]}>
 *   <SmartFormProvider panelId="create-project" defaultMode="simple">
 *     <SmartFormToolbar />
 *
 *     <SmartFormSection id="identity" title="Identité" level="essential">
 *       <FormGrid>
 *         <DynamicPanelField label="Nom" required>
 *           <input required value={name} onChange={...} />
 *         </DynamicPanelField>
 *       </FormGrid>
 *     </SmartFormSection>
 *
 *     <SmartFormSection id="planning" title="Planning" level="advanced">
 *       ...
 *     </SmartFormSection>
 *
 *     <SmartFormWizardNav onSubmit={submit} onCancel={cancel} />
 *   </SmartFormProvider>
 * </DynamicPanelShell>
 * ```
 *
 * Migrations are non-destructive: `SmartFormSection` is a thin wrapper
 * over `FormSection`, so rendering falls back cleanly when the provider
 * isn't mounted (it behaves like a plain FormSection in that case).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Rows3,
  Sparkles,
  SkipForward,
  Check,
  HelpCircle,
  X,
  Lightbulb,
  ExternalLink,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { FormSection, PanelActionButton } from '@/components/layout/DynamicPanel'
import { safeLocal } from '@/lib/safeStorage'
import { useUIStore } from '@/stores/uiStore'
import { HELP_CONTENT } from '@/content/help'

// ── Types ────────────────────────────────────────────────────────────────

export type SmartFormMode = 'simple' | 'advanced' | 'wizard'
export type SmartFormSectionLevel = 'essential' | 'advanced'

interface RegisteredSection {
  id: string
  title: string
  level: SmartFormSectionLevel
  skippable: boolean
  helpKey?: string
  order: number
}

interface SmartFormContextValue {
  panelId: string
  mode: SmartFormMode
  setMode: (m: SmartFormMode) => void
  /** Section registry (populated by children on mount). */
  registerSection: (section: RegisteredSection) => () => void
  sections: RegisteredSection[]
  /** Wizard state */
  currentStep: number
  goToStep: (idx: number) => void
  markStepComplete: (idx: number) => void
  completedSteps: ReadonlySet<number>
  /** Inline help drawer (wizard only) */
  helpDrawerOpen: boolean
  setHelpDrawerOpen: (v: boolean) => void
}

const Ctx = createContext<SmartFormContextValue | null>(null)

/** Hook — returns the smart form context if inside a provider, null otherwise. */
export function useSmartForm(): SmartFormContextValue | null {
  return useContext(Ctx)
}

// ── Mode persistence ────────────────────────────────────────────────────

function storageKeyFor(panelId: string): string {
  return `smartForm.mode.${panelId}`
}

function readPersistedMode(panelId: string, fallback: SmartFormMode): SmartFormMode {
  const raw = safeLocal.getItem(storageKeyFor(panelId))
  if (raw === 'simple' || raw === 'advanced' || raw === 'wizard') return raw
  return fallback
}

// ── Provider ────────────────────────────────────────────────────────────

interface SmartFormProviderProps {
  panelId: string
  defaultMode?: SmartFormMode
  /** Optional override: force a mode (ignores persistence). */
  mode?: SmartFormMode
  onModeChange?: (m: SmartFormMode) => void
  children: ReactNode
}

export function SmartFormProvider({
  panelId,
  defaultMode = 'simple',
  mode: controlledMode,
  onModeChange,
  children,
}: SmartFormProviderProps) {
  const [internalMode, setInternalMode] = useState<SmartFormMode>(
    () => controlledMode ?? readPersistedMode(panelId, defaultMode),
  )
  const mode = controlledMode ?? internalMode

  const setMode = useCallback(
    (next: SmartFormMode) => {
      if (!controlledMode) {
        setInternalMode(next)
        safeLocal.setItem(storageKeyFor(panelId), next)
      }
      onModeChange?.(next)
    },
    [controlledMode, onModeChange, panelId],
  )

  // Section registry — children register themselves in mount order.
  // We keep a map by id so re-renders don't duplicate entries.
  const sectionMapRef = useRef<Map<string, RegisteredSection>>(new Map())
  const [sectionsVersion, setSectionsVersion] = useState(0)
  const registerSection = useCallback(
    (section: RegisteredSection) => {
      sectionMapRef.current.set(section.id, section)
      setSectionsVersion((v) => v + 1)
      return () => {
        sectionMapRef.current.delete(section.id)
        setSectionsVersion((v) => v + 1)
      }
    },
    [],
  )

  const sections = useMemo(
    () =>
      Array.from(sectionMapRef.current.values()).sort((a, b) => a.order - b.order),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectionsVersion],
  )

  // Wizard state
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const goToStep = useCallback((idx: number) => {
    setCurrentStep(Math.max(0, idx))
  }, [])
  const markStepComplete = useCallback((idx: number) => {
    setCompletedSteps((prev) => {
      if (prev.has(idx)) return prev
      const next = new Set(prev)
      next.add(idx)
      return next
    })
  }, [])
  // Reset wizard step when switching OUT of wizard or when sections change.
  useEffect(() => {
    if (mode !== 'wizard') setCurrentStep(0)
  }, [mode])

  // Inline help drawer (wizard only). Closed by default.
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false)
  // Auto-close when leaving wizard mode.
  useEffect(() => {
    if (mode !== 'wizard') setHelpDrawerOpen(false)
  }, [mode])

  const value = useMemo<SmartFormContextValue>(
    () => ({
      panelId,
      mode,
      setMode,
      registerSection,
      sections,
      currentStep,
      goToStep,
      markStepComplete,
      completedSteps,
      helpDrawerOpen,
      setHelpDrawerOpen,
    }),
    [panelId, mode, setMode, registerSection, sections, currentStep, goToStep, markStepComplete, completedSteps, helpDrawerOpen],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ── Toolbar (mode selector + wizard progress) ──────────────────────────

interface SmartFormToolbarProps {
  className?: string
  /** Extra content rendered at the right of the toolbar (optional). */
  right?: ReactNode
}

export function SmartFormToolbar({ className, right }: SmartFormToolbarProps) {
  const { t } = useTranslation()
  const ctx = useSmartForm()
  if (!ctx) return null
  const { mode, setMode, sections, currentStep, completedSteps } = ctx

  const modeButtons: { value: SmartFormMode; label: string; icon: typeof Rows3 }[] = [
    { value: 'simple', label: t('smart_form.mode.simple', 'Simple'), icon: Rows3 },
    { value: 'advanced', label: t('smart_form.mode.advanced', 'Avancé'), icon: ListChecks },
    { value: 'wizard', label: t('smart_form.mode.wizard', 'Assistant'), icon: Sparkles },
  ]

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-muted/20',
        className,
      )}
    >
      <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5">
        {modeButtons.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
              mode === value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
            title={label}
          >
            <Icon size={11} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {mode === 'wizard' && sections.length > 0 && (
        <div className="flex-1 max-w-md">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>
              {t('smart_form.wizard.step', 'Étape')} {currentStep + 1} / {sections.length}
            </span>
            <span className="flex-1 h-1 rounded-full bg-border overflow-hidden">
              <span
                className="block h-full bg-primary transition-all"
                style={{ width: `${((currentStep + 1) / sections.length) * 100}%` }}
              />
            </span>
            <span>{completedSteps.size} ✓</span>
          </div>
        </div>
      )}

      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

// ── SmartFormSection ───────────────────────────────────────────────────

interface SmartFormSectionProps {
  id: string
  title: string
  /** Essential = always visible in simple mode. Advanced = hidden in simple. */
  level?: SmartFormSectionLevel
  /** Allow the user to skip this section in wizard mode. */
  skippable?: boolean
  /** Help article key for the help system (wizard mode shows a button). */
  helpKey?: string
  /** Collapsible by default in simple/advanced modes (ignored in wizard). */
  collapsible?: boolean
  defaultExpanded?: boolean
  children: ReactNode
  description?: string
  className?: string
}

export function SmartFormSection({
  id,
  title,
  level = 'advanced',
  skippable = false,
  helpKey,
  collapsible,
  defaultExpanded = true,
  children,
  description,
  className,
}: SmartFormSectionProps) {
  const ctx = useSmartForm()
  // Stable registration order — captured on first mount.
  const orderRef = useRef<number | null>(null)

  // Register with the provider. Unregister on unmount.
  useEffect(() => {
    if (!ctx) return
    if (orderRef.current === null) {
      orderRef.current = ctx.sections.length
    }
    const unregister = ctx.registerSection({
      id,
      title,
      level,
      skippable,
      helpKey,
      order: orderRef.current,
    })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, title, level, skippable, helpKey])

  const descriptionNode = description ? (
    <p className="mb-2 text-[11px] text-muted-foreground italic">{description}</p>
  ) : null

  // Fallback: no provider — behave as a plain FormSection.
  if (!ctx) {
    return (
      <FormSection title={title} collapsible={collapsible} defaultExpanded={defaultExpanded}>
        {descriptionNode}
        <div className={className}>{children}</div>
      </FormSection>
    )
  }

  const { mode, sections, currentStep } = ctx

  // Visibility rules
  if (mode === 'simple' && level === 'advanced') return null
  if (mode === 'wizard') {
    const myIndex = sections.findIndex((s) => s.id === id)
    if (myIndex !== currentStep) return null
    // In wizard mode, sections render without collapse UI.
    return (
      <div className={cn('animate-in fade-in-50 duration-200', className)}>
        <FormSection title={title} collapsible={false} defaultExpanded>
          {descriptionNode}
          {children}
        </FormSection>
      </div>
    )
  }

  return (
    <FormSection title={title} collapsible={collapsible} defaultExpanded={defaultExpanded}>
      {descriptionNode}
      <div className={className}>{children}</div>
    </FormSection>
  )
}

// ── Wizard navigation ──────────────────────────────────────────────────

interface SmartFormWizardNavProps {
  /** Called when the user clicks Finish on the last step. */
  onSubmit?: () => void
  /** Called when the user clicks Cancel. */
  onCancel?: () => void
  /** Whether the Submit button should be disabled (e.g. mutation in-flight). */
  submitDisabled?: boolean
  /** Override label for the final submit button. */
  submitLabel?: string
  /** Optional per-step validator: return false to block "Next" on that step. */
  canLeaveStep?: (sectionId: string, index: number) => boolean
}

export function SmartFormWizardNav({
  onSubmit,
  onCancel,
  submitDisabled,
  submitLabel,
  canLeaveStep,
}: SmartFormWizardNavProps) {
  const { t } = useTranslation()
  const ctx = useSmartForm()
  if (!ctx || ctx.mode !== 'wizard') return null
  const { sections, currentStep, goToStep, markStepComplete, helpDrawerOpen, setHelpDrawerOpen } = ctx
  if (sections.length === 0) return null

  const section = sections[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === sections.length - 1

  const toggleHelp = () => {
    // Inline drawer — avoids covering the form with a docked AssistantPanel.
    // The drawer reads HELP_CONTENT[currentModule], same source of truth as
    // the AssistantPanel Help tab.
    setHelpDrawerOpen(!helpDrawerOpen)
  }

  const handleNext = () => {
    if (canLeaveStep && !canLeaveStep(section.id, currentStep)) return
    markStepComplete(currentStep)
    goToStep(Math.min(sections.length - 1, currentStep + 1))
  }
  const handleSkip = () => {
    if (!section.skippable) return
    goToStep(Math.min(sections.length - 1, currentStep + 1))
  }

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-border bg-background/95 backdrop-blur px-3 py-2">
      <div className="flex items-center gap-2">
        {onCancel && (
          <PanelActionButton onClick={onCancel}>{t('common.cancel')}</PanelActionButton>
        )}
        {!isFirst && (
          <button
            type="button"
            onClick={() => goToStep(currentStep - 1)}
            className="gl-button gl-button-default inline-flex items-center gap-1"
          >
            <ChevronLeft size={12} />
            {t('smart_form.wizard.previous', 'Précédent')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleHelp}
          className={cn(
            'gl-button gl-button-default inline-flex items-center gap-1',
            helpDrawerOpen ? 'text-primary' : 'text-muted-foreground',
          )}
          title={t('smart_form.wizard.help', "Afficher l'aide de cette étape") as string}
        >
          <HelpCircle size={12} />
          {t('smart_form.wizard.help_short', 'Aide')}
        </button>
        {section.skippable && !isLast && (
          <button
            type="button"
            onClick={handleSkip}
            className="gl-button gl-button-default inline-flex items-center gap-1"
            title={t('smart_form.wizard.skip_hint', 'Étape facultative — vous pourrez y revenir plus tard') as string}
          >
            <SkipForward size={12} />
            {t('smart_form.wizard.skip', 'Passer')}
          </button>
        )}
        {!isLast && (
          <button
            type="button"
            onClick={handleNext}
            className="gl-button-sm gl-button-primary inline-flex items-center gap-1"
          >
            {t('smart_form.wizard.next', 'Suivant')}
            <ChevronRight size={12} />
          </button>
        )}
        {isLast && (
          <button
            type="button"
            onClick={() => {
              markStepComplete(currentStep)
              onSubmit?.()
            }}
            disabled={submitDisabled}
            className="gl-button-sm gl-button-confirm inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Check size={12} />
            {submitLabel ?? t('smart_form.wizard.finish', 'Terminer')}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Inline help drawer (wizard) ────────────────────────────────────────
// Shown as a slim panel at the bottom of the wizard body when the user
// clicks "Aide". Reads the same `HELP_CONTENT[currentModule]` the
// AssistantPanel's Help tab reads — same source of truth, but without
// covering the form. The drawer is rendered *inside* the form panel so
// it scrolls with the content.

function deriveModuleFromPath(pathname: string): string {
  const seg = pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
  return seg
}

export function SmartFormInlineHelpDrawer() {
  const { t } = useTranslation()
  const ctx = useSmartForm()
  const { pathname } = useLocation()
  if (!ctx || ctx.mode !== 'wizard' || !ctx.helpDrawerOpen) return null

  const currentModule = deriveModuleFromPath(pathname)
  const help = HELP_CONTENT[currentModule]
  const step = ctx.sections[ctx.currentStep]

  return (
    <aside
      className="mx-3 my-3 rounded-lg border border-border bg-muted/20 animate-in slide-in-from-bottom-2 duration-200"
      role="complementary"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <HelpCircle size={14} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground truncate">
              {t('smart_form.wizard.help_title', 'Aide')}
              {help && ` — ${help.title}`}
              {step && ` · ${step.title}`}
            </p>
            {help?.description && (
              <p className="text-[10px] text-muted-foreground truncate">{help.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              // Escape hatch: open the full AssistantPanel for more context.
              const store = useUIStore.getState()
              store.setAssistantTab('help')
              store.setAIPanelOpen(true)
            }}
            className="gl-button-sm gl-button-default inline-flex items-center gap-1 text-muted-foreground"
            title={t('smart_form.wizard.help_full', 'Ouvrir dans le panneau complet') as string}
          >
            <ExternalLink size={11} />
          </button>
          <button
            type="button"
            onClick={() => ctx.setHelpDrawerOpen(false)}
            className="gl-button-sm gl-button-default"
            title={t('common.close', 'Fermer') as string}
          >
            <X size={11} />
          </button>
        </div>
      </header>

      <div className="space-y-3 px-3 py-2.5 max-h-64 overflow-y-auto">
        {!help ? (
          <p className="text-xs text-muted-foreground italic">
            {t('smart_form.wizard.help_none', "Aucune aide disponible pour ce module.")}
          </p>
        ) : (
          <>
            {/* Tips — displayed first: they're quick to read and most
                immediately useful during a create flow. */}
            {help.tips.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Lightbulb size={11} className="text-amber-500" />
                  <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('assistant.help.tips', 'Conseils')}
                  </h4>
                </div>
                <ul className="space-y-1">
                  {help.tips.slice(0, 5).map((tip, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground leading-snug">
                      <span className="text-amber-500/70 mt-0.5 shrink-0">•</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Workflows — compact list of titles + steps. We don't
                render Mermaid diagrams here (too tall); user can click
                the "external" icon above to open the full panel. */}
            {help.workflows.length > 0 && (
              <section>
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {t('assistant.help.workflows', 'Workflows')}
                </h4>
                <ul className="space-y-2">
                  {help.workflows.slice(0, 3).map((wf, i) => (
                    <li key={i} className="text-[11px] text-muted-foreground">
                      <p className="font-medium text-foreground mb-0.5">{wf.title}</p>
                      <ol className="space-y-0.5 list-none pl-2">
                        {wf.steps.slice(0, 3).map((s, j) => (
                          <li key={j} className="flex gap-1.5 leading-snug">
                            <span className="text-primary/70 shrink-0">{j + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                        {wf.steps.length > 3 && (
                          <li className="text-[10px] italic opacity-60 pl-3">
                            {t('smart_form.wizard.help_more_steps', '... (cliquer l\u2019icône pour voir tout)')}
                          </li>
                        )}
                      </ol>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </aside>
  )
}

// ── "Simple mode" hint banner ──────────────────────────────────────────
// Shown above the form when at least one advanced section exists. Lets
// the user switch to Advanced with one click.

export function SmartFormSimpleHint() {
  const { t } = useTranslation()
  const ctx = useSmartForm()
  if (!ctx || ctx.mode !== 'simple') return null
  const hiddenAdvanced = ctx.sections.filter((s) => s.level === 'advanced').length
  if (hiddenAdvanced === 0) return null
  return (
    <div className="mx-3 mt-3 flex items-center justify-between gap-2 rounded border border-dashed border-border/70 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span>
        {t('smart_form.simple_hint', {
          count: hiddenAdvanced,
          defaultValue: '{{count}} sections avancées masquées.',
        })}
      </span>
      <button
        type="button"
        onClick={() => ctx.setMode('advanced')}
        className="font-medium text-primary hover:underline"
      >
        {t('smart_form.show_advanced', 'Afficher tout')}
      </button>
    </div>
  )
}
