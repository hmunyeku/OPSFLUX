/**
 * HelpSystem — Contextual help provider + floating panel.
 *
 * Tracks the current module from the URL, shows module-specific
 * help content (description, workflows, tips) and element-level
 * tooltips driven by data-help-id attributes.
 *
 * Toggle via the ? key (when not in an input) or the Topbar button.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { X, ChevronDown, ChevronRight, Lightbulb, BookOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import mermaid from 'mermaid'

// ── Mermaid initialisation ─────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    background: 'transparent',
    primaryColor: '#eff6ff',
    primaryTextColor: '#1e40af',
    primaryBorderColor: '#3b82f6',
    secondaryColor: '#f1f5f9',
    tertiaryColor: '#ffffff',
    lineColor: '#94a3b8',
    textColor: '#0f172a',
    mainBkg: '#eff6ff',
    nodeBorder: '#3b82f6',
    clusterBkg: '#f8fafc',
    clusterBorder: '#cbd5e1',
    edgeLabelBackground: '#ffffff',
    fontSize: '12px',
  },
  flowchart: { curve: 'basis', padding: 10 },
})

function MermaidDiagram({ chart, className }: { chart: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState('')

  useEffect(() => {
    const id = 'mermaid-' + Math.random().toString(36).slice(2, 8)
    mermaid.render(id, chart).then(({ svg: s }) => setSvg(s)).catch(() => setSvg(''))
  }, [chart])

  if (!svg) return null
  return (
    <div
      ref={containerRef}
      className={cn('overflow-x-auto', className)}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

// Help content registry + types live in src/content/help.ts
// so this component stays focused on rendering. See that file for
// module descriptions, workflows, tips and element tooltips.
import {
  HELP_CONTENT,
  type ModuleHelp,
  type WorkflowHelp,
} from '@/content/help'

function getSettingsHelp(
  t: (key: string, options?: Record<string, unknown>) => string,
  hash: string,
): ModuleHelp {
  const section = hash.replace(/^#/, '') || 'profile'
  const profileFirst = section === 'profile'

  const profileWorkflow: WorkflowHelp = {
    title: t('settings.help.profile_workflow.title'),
    steps: [
      t('settings.help.profile_workflow.steps.0'),
      t('settings.help.profile_workflow.steps.1'),
      t('settings.help.profile_workflow.steps.2'),
      t('settings.help.profile_workflow.steps.3'),
      t('settings.help.profile_workflow.steps.4'),
    ],
  }
  const notificationWorkflow: WorkflowHelp = {
    title: t('settings.help.notifications_workflow.title'),
    steps: [
      t('settings.help.notifications_workflow.steps.0'),
      t('settings.help.notifications_workflow.steps.1'),
      t('settings.help.notifications_workflow.steps.2'),
      t('settings.help.notifications_workflow.steps.3'),
    ],
  }
  const securityWorkflow: WorkflowHelp = {
    title: t('settings.help.security_workflow.title'),
    steps: [
      t('settings.help.security_workflow.steps.0'),
      t('settings.help.security_workflow.steps.1'),
      t('settings.help.security_workflow.steps.2'),
      t('settings.help.security_workflow.steps.3'),
    ],
  }

  return {
    title: profileFirst ? t('settings.help.profile_title') : t('settings.help.title'),
    icon: '⚙️',
    description: profileFirst
      ? t('settings.help.profile_description')
      : t('settings.help.description'),
    workflows: profileFirst
      ? [profileWorkflow, notificationWorkflow, securityWorkflow]
      : [notificationWorkflow, securityWorkflow, profileWorkflow],
    tips: [
      t('settings.help.tips.0'),
      t('settings.help.tips.1'),
      t('settings.help.tips.2'),
    ],
    elementHelp: {},
  }
}

function getHelpContent(
  currentModule: string,
  hash: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): ModuleHelp | undefined {
  if (currentModule === 'settings') return getSettingsHelp(t, hash)
  return HELP_CONTENT[currentModule]
}

function filterHelpByPermissions(
  help: ModuleHelp | undefined,
  hasPermission: (code: string) => boolean,
  hasAny: (codes: string[]) => boolean,
): ModuleHelp | undefined {
  if (!help) return help
  return {
    ...help,
    workflows: help.workflows.filter((workflow) => {
      if (workflow.requiredPermission && !hasPermission(workflow.requiredPermission)) return false
      if (workflow.requiredAnyPermissions && !hasAny(workflow.requiredAnyPermissions)) return false
      return true
    }),
  }
}

// ── Derive current module slug from pathname ────────────────

function deriveModule(pathname: string): string {
  // Strip leading slash, take first segment
  const seg = pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
  return seg
}

// ── Context ─────────────────────────────────────────────────

interface HelpContextValue {
  currentModule: string
  hoveredElement: string | null
  isHelpOpen: boolean
  toggleHelp: () => void
  setHoveredElement: (id: string | null) => void
}

const HelpContext = createContext<HelpContextValue>({
  currentModule: 'dashboard',
  hoveredElement: null,
  isHelpOpen: false,
  toggleHelp: () => {},
  setHoveredElement: () => {},
})

export function useHelp() {
  return useContext(HelpContext)
}

// ── Provider ────────────────────────────────────────────────

export function HelpProvider({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [hoveredElement, setHoveredElement] = useState<string | null>(null)

  const currentModule = useMemo(() => deriveModule(pathname), [pathname])

  const toggleHelp = useCallback(() => {
    setIsHelpOpen((prev) => !prev)
  }, [])

  // Listen for mouseover on elements with data-help-id
  useEffect(() => {
    if (!isHelpOpen) return

    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-help-id]')
      if (target) {
        setHoveredElement(target.getAttribute('data-help-id'))
      } else {
        setHoveredElement(null)
      }
    }

    document.addEventListener('mouseover', handleMouseOver)
    return () => document.removeEventListener('mouseover', handleMouseOver)
  }, [isHelpOpen])

  const value = useMemo<HelpContextValue>(
    () => ({
      currentModule,
      hoveredElement,
      isHelpOpen,
      toggleHelp,
      setHoveredElement,
    }),
    [currentModule, hoveredElement, isHelpOpen, toggleHelp],
  )

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>
}

// ── Workflow accordion item ─────────────────────────────────

function WorkflowItem({ workflow }: { workflow: WorkflowHelp }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {workflow.title}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {workflow.diagram && (
            <MermaidDiagram chart={workflow.diagram} className="bg-slate-900/50 rounded-lg p-2" />
          )}
          <ol className="pt-1 space-y-1.5 list-none">
            {workflow.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-muted-foreground leading-relaxed">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ── HelpPanel ───────────────────────────────────────────────

export function HelpPanel() {
  const { t } = useTranslation()
  const { hash } = useLocation()
  const { currentModule, hoveredElement, isHelpOpen, toggleHelp } = useHelp()
  const { hasPermission, hasAny } = usePermission()

  // Keyboard shortcut: ? to toggle (outside inputs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === '?' &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        toggleHelp()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleHelp])

  const help = useMemo(
    () => filterHelpByPermissions(getHelpContent(currentModule, hash, t), hasPermission, hasAny),
    [currentModule, hash, t, hasPermission, hasAny],
  )

  if (!isHelpOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/10 z-40"
        onClick={toggleHelp}
      />

      {/* Panel */}
      <aside
        className={cn(
          'fixed top-0 right-0 z-50 h-full w-[320px] flex flex-col',
          'bg-background/95 backdrop-blur-sm border-l border-border shadow-lg',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2.5">
            {help && (
              <span className="text-lg leading-none" role="img" aria-hidden>
                {help.icon}
              </span>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">
                {help?.title ?? currentModule}
              </h2>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {t('help_system.contextual')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="hidden sm:inline-flex h-5 select-none items-center rounded-sm border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
              ?
            </kbd>
            <button
              onClick={toggleHelp}
              className="h-7 w-7 inline-flex items-center justify-center rounded-lg border border-border-strong bg-background text-muted-foreground hover:bg-chrome hover:text-foreground transition-colors"
              aria-label={t('help_system.close')}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Element-specific help (shown when hovering a data-help-id element) */}
          {hoveredElement && help?.elementHelp[hoveredElement] && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
              <p className="text-xs font-medium text-primary mb-1">
                {t('help_system.selected_element')}
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {help.elementHelp[hoveredElement]}
              </p>
            </div>
          )}

          {!help && (
            <div className="text-sm text-muted-foreground">
              {t('help_system.empty')}
            </div>
          )}

          {help && (
            <>
              {/* Description */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={13} className="text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('help_system.description')}
                  </h3>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {help.description}
                </p>
              </section>

              {/* Workflows */}
              {help.workflows.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {t('help_system.workflows')}
                  </h3>
                  <div className="space-y-2">
                    {help.workflows.map((wf, i) => (
                      <WorkflowItem key={i} workflow={wf} />
                    ))}
                  </div>
                </section>
              )}

              {/* Tips */}
              {help.tips.length > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Lightbulb size={13} className="text-amber-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('help_system.tips')}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {help.tips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-xs text-muted-foreground leading-relaxed"
                      >
                        <span className="text-amber-500/70 mt-0.5 shrink-0">
                          •
                        </span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[10px] text-muted-foreground text-center">
          {t('help_system.shortcut_prefix')} <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">?</kbd> {t('help_system.shortcut_suffix')}
        </div>
      </aside>
    </>
  )
}
