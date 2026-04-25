/**
 * AssistantPanel — Unified support panel (persistent across navigation).
 *
 * Tabs:
 *   1. AI Chat     — Streaming chat with configured AI provider (RBAC-aware)
 *   2. Help        — Contextual help (module-aware workflows, tips, diagrams)
 *   3. Tours       — Interactive guided tours per module
 *   4. Alerts      — Notifications center with RBAC filtering
 *   5. Ticket      — Quick ticket creation (bug, improvement, question)
 *
 * The panel lives in AppLayout and persists across page navigation.
 * Visibility is controlled via uiStore.aiPanelOpen / toggleAIPanel.
 */
import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react'
import { useTranslation } from 'react-i18next'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import {
  X,
  Bot,
  BookOpen,
  Map,
  LifeBuoy,
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Bug,
  HelpCircle,
  Camera,
  Video,
  Square,
  Paperclip,
  Sparkles,
  RotateCcw,
  StopCircle,
  Play,
  ArrowRight,
  CheckCircle2,
  PanelRight,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useUserPreferences } from '@/hooks/useUserPreferences'
import { useToast } from '@/components/ui/Toast'
import { useCreateTicket } from '@/hooks/useSupport'
import api from '@/lib/api'
import { resolveApiBaseUrl } from '@/lib/runtimeUrls'
import type { TicketCreate, TicketType } from '@/services/supportService'
import mermaid from 'mermaid'
import { safeLocal } from '@/lib/safeStorage'
import { buildConsoleLogFile, consoleLogBuffer } from '@/lib/consoleCapture'
import { RichTextField } from '@/components/shared/RichTextField'

// ── Types ──────────────────────────────────────────────────────

type TabId = 'chat' | 'help' | 'tours' | 'ticket'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}


interface AssistantActionToken {
  type: 'go' | 'confirm-write'
  target?: string
  label: string
}

const SAFE_ASSISTANT_ROUTE_PREFIXES = [
  '/dashboard',
  '/users',
  '/projets',
  '/paxlog',
  '/planner',
  '/tiers',
  '/conformite',
  '/travelwiz',
  '/packlog',
  '/support',
  '/settings',
  '/papyrus',
  '/assets',
  '/imputations',
  '/workflows',
  '/entites',
] as const

const CANONICAL_ASSISTANT_ROUTE_ALIASES: Record<string, string> = {
  '/projects': '/projets',
  '/report-editor': '/papyrus',
  '/assets-legacy': '/assets',
  '/comptes': '/users',
  '/entities': '/entites',
  '/cargo': '/packlog',
  '/transport': '/travelwiz',
}

function isSafeAssistantRoute(target: string): boolean {
  if (!target.startsWith('/')) return false
  return SAFE_ASSISTANT_ROUTE_PREFIXES.some(prefix => target === prefix || target.startsWith(`${prefix}/`))
}

function parseAssistantActions(content: string): { text: string; actions: AssistantActionToken[] } {
  const actions: AssistantActionToken[] = []
  let text = content.replace(/\[\[action:go:([^|\]]+)\|([^\]]+)\]\]/g, (_match, target, label) => {
    const rawTarget = String(target).trim()
    const safeTarget = CANONICAL_ASSISTANT_ROUTE_ALIASES[rawTarget] || rawTarget
    const safeLabel = String(label).replace(/[\r\n[\]|]+/g, ' ').trim()
    if (isSafeAssistantRoute(safeTarget) && safeLabel) {
      actions.push({ type: 'go', target: safeTarget, label: safeLabel })
    }
    return ''
  })
  text = text.replace(/\[\[action:confirm-write\|([^\]]+)\]\]/g, (_match, label) => {
    const safeLabel = String(label).replace(/[\r\n[\]|]+/g, ' ').trim()
    if (safeLabel) {
      actions.push({ type: 'confirm-write', label: safeLabel })
    }
    return ''
  }).trim()
  return { text, actions }
}

function renderAssistantMarkdown(content: string): string {
  const escaped = content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return marked.parse(escaped, { breaks: true, gfm: true }) as string
}

// ── Mermaid init (reuse from HelpSystem config) ────────────────

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
  const [svg, setSvg] = useState('')
  useEffect(() => {
    const id = 'mermaid-' + Math.random().toString(36).slice(2, 8)
    mermaid.render(id, chart).then(({ svg: s }) => setSvg(s)).catch(() => setSvg(''))
  }, [chart])
  if (!svg) return null
  return <div className={cn('overflow-x-auto', className)} dangerouslySetInnerHTML={{ __html: svg }} />
}

// Help content registry — shared with HelpSystem. Data lives in
// src/content/help.ts so edits don't touch this file.
import { HELP_CONTENT, type WorkflowHelp } from '@/content/help'

// ── Contextual chat suggestions per module ────────────────────

const CONTEXTUAL_SUGGESTIONS: Record<string, string[]> = {
  dashboard: ['Quels sont mes KPIs importants aujourd\'hui ?', 'Comment personnaliser mon tableau de bord avec des widgets ?', 'Expliquer les indicateurs de chaque module', 'Comment ajouter un widget météo ou charge PAX ?'],
  users: ['Comment créer un compte utilisateur et lui attribuer un rôle ?', 'Expliquer le système RBAC (rôles, groupes, permissions)', 'Comment déléguer temporairement mes droits à un collègue ?', 'Quelle est la différence entre un override utilisateur et un rôle ?'],
  projets: ['Comment créer un projet et définir les tâches dans le Gantt ?', 'Comment fonctionne le calcul d\'avancement pondéré (effort, durée, manuel) ?', 'Comment ajouter des dépendances entre tâches (FS, SS, FF, SF) ?', 'Comment exporter le planning Gantt en PDF ?'],
  paxlog: ['Comment créer et soumettre un avis de séjour (AdS) complet ?', 'Un PAX a des certifications expirées — comment régulariser avant soumission ?', 'Comment fonctionne le workflow de validation multi-niveaux (initiateur, chef de projet, CDS) ?', 'Comment générer un lien externe pour qu\'un sous-traitant remplisse les infos PAX ?', 'Expliquer la liste d\'attente POB et la promotion automatique'],
  planner: ['Comment créer une activité et la positionner sur le Gantt du plan ?', 'Il y a un conflit de capacité sur un site — comment le résoudre ?', 'Comment créer un scénario what-if pour comparer des options de planification ?', 'Comment fonctionne la détection automatique des conflits PAX ?', 'Expliquer les signaux de révision et les demandes de décision'],
  tiers: ['Comment ajouter une entreprise sous-traitante et ses contacts ?', 'Comment transférer un contact d\'une entreprise à une autre en gardant l\'historique ?', 'Comment bloquer un tiers pour empêcher les nouveaux AdS pour ses contacts ?', 'Quelle est la différence entre un tiers fournisseur et un sous-traitant ?'],
  conformite: ['Comment vérifier la conformité complète d\'un PAX avant un déplacement ?', 'Comment configurer les règles de conformité par type de site (certifications requises) ?', 'Comment enregistrer une nouvelle certification pour un PAX ?', 'Les alertes d\'expiration fonctionnent comment ?'],
  travelwiz: ['Comment planifier un vol hélicoptère avec passagers et fret ?', 'Comment générer et valider un manifeste avant le départ ?', 'Comment fonctionne le portail capitaine pour la gestion terrain ?', 'Comment surveiller les conditions météo sur les sites avant un vol ?', 'Comment gérer la maintenance d\'un vecteur (hélicoptère, bateau) ?'],
  packlog: ['Comment créer une lettre de transport (LT) avec des articles ?', 'Comment suivre un cargo de la préparation à la livraison ?', 'Comment lier une LT à un voyage TravelWiz ?', 'Expliquer le catalogue d\'articles et le mode global vs per-entity'],
  imputations: ['Comment imputer un coût à un projet ou un centre de coûts ?', 'Comment consulter le suivi budgétaire par période ?', 'Comment exporter les données analytiques pour le rapprochement comptable ?'],
  papyrus: ['Comment déposer et classer un document dans Papyrus ?', 'Comment générer un PDF depuis un modèle avec des données pré-remplies ?', 'Comment retrouver un document par recherche plein texte ?'],
  workflows: ['Comment concevoir un workflow de validation avec l\'éditeur visuel ?', 'Comment déléguer une approbation à un collègue ?', 'Comment fonctionne le versioning des workflows (brouillon, publié, archivé) ?'],
  assets: ['Comment naviguer dans la hiérarchie des installations ?', 'Comment configurer la capacité POB d\'un site ?', 'Comment les capacités sont utilisées par le Planner pour les conflits ?'],
  entites: ['Comment configurer une nouvelle entité (filiale, pays) ?', 'Comment changer d\'entité active dans l\'application ?', 'Comment les données sont isolées entre entités ?'],
  support: ['Comment signaler un bug avec une capture d\'écran ?', 'Comment créer un ticket d\'amélioration ?', 'Comment suivre l\'avancement de mes tickets ?'],
  settings: ['Comment modifier mon profil et mes préférences ?', 'Comment configurer les notifications par module ?', 'Comment connecter une intégration externe (SMTP, S3, OAuth) ?', 'Comment personnaliser les modèles PDF d\'export ?'],
}

// ── Guided tours definitions ───────────────────────────────────
// Data moved to src/content/tours.ts so the panel component isn't
// bloated by the full catalogue. Types are imported for consumers
// (TourSpotlight, ToursTab) declared below.

import { GUIDED_TOURS, type TourStep, type GuidedTour } from '@/content/tours'

// ── Tour Spotlight Overlay (renders outside the panel via portal) ──

function TourSpotlight({
  targetRect,
  tooltipContent,
  step,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  isLast,
}: {
  targetRect: DOMRect | null
  tooltipContent: { title: string; content: string }
  step: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  isLast: boolean
}) {
  const padding = 8
  const cutout = targetRect ? {
    x: targetRect.x - padding,
    y: targetRect.y - padding,
    w: targetRect.width + padding * 2,
    h: targetRect.height + padding * 2,
  } : null

  // Smart tooltip positioning: handles tall elements (sidebar), wide elements (topbar), small buttons
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tooltipRef = useRef<HTMLDivElement>(null)
  // Measure tooltip's real size after mount instead of guessing. Starts at the
  // typical content size and re-measures on layout. Fixes off-screen tooltips
  // when the content is longer than the hardcoded 200 estimate, and correctly
  // clamps the last step tooltip near the viewport edge.
  const [tipSize, setTipSize] = useState({ w: Math.min(300, vw - 32), h: 200 })
  useLayoutEffect(() => {
    if (!tooltipRef.current) return
    const r = tooltipRef.current.getBoundingClientRect()
    if (r.width && r.height && (Math.abs(r.width - tipSize.w) > 2 || Math.abs(r.height - tipSize.h) > 4)) {
      setTipSize({ w: r.width, h: r.height })
    }
  })
  const tooltipW = tipSize.w
  const tooltipH = tipSize.h
  const gap = 12
  // Safe zones — never place the tooltip under the system UI (iOS notch / home-indicator)
  // or the topbar area.
  const safeTop = 56
  const safeBottom = 24

  const tooltipStyle: React.CSSProperties = { position: 'fixed', width: tooltipW, zIndex: 10001 }

  const clampX = (x: number) => Math.max(16, Math.min(x, vw - tooltipW - 16))
  const clampY = (y: number) => Math.max(safeTop, Math.min(y, vh - tooltipH - safeBottom))

  if (!cutout) {
    // No visible target — center-overlay the tooltip so the step is still reachable.
    tooltipStyle.top = clampY((vh - tooltipH) / 2)
    tooltipStyle.left = clampX((vw - tooltipW) / 2)
  } else { const spaceRight = vw - (cutout.x + cutout.w)
  const spaceBelow = vh - (cutout.y + cutout.h)
  const spaceLeft = cutout.x
  const spaceAbove = cutout.y
  const isTall = cutout.h > vh * 0.5 // element taller than half viewport

  if (isTall && spaceRight >= tooltipW + gap) {
    // Tall element (sidebar): place tooltip to the right, vertically centered
    tooltipStyle.left = cutout.x + cutout.w + gap
    tooltipStyle.top = clampY(cutout.y + cutout.h / 2 - tooltipH / 2)
  } else if (isTall && spaceLeft >= tooltipW + gap) {
    // Tall element but no space right: place to the left
    tooltipStyle.left = cutout.x - tooltipW - gap
    tooltipStyle.top = clampY(cutout.y + cutout.h / 2 - tooltipH / 2)
  } else if (spaceBelow >= tooltipH + gap + safeBottom) {
    // Normal: place below
    tooltipStyle.top = clampY(cutout.y + cutout.h + gap)
    tooltipStyle.left = clampX(cutout.x)
  } else if (spaceAbove >= tooltipH + gap + safeTop) {
    // Place above if there's room — use top (not bottom) to be compatible with
    // clamping so the tooltip never pokes beyond the viewport.
    tooltipStyle.top = clampY(cutout.y - tooltipH - gap)
    tooltipStyle.left = clampX(cutout.x)
  } else {
    // Neither above nor below fits — center-overlay the tooltip. Better to
    // cover the target than to render off-screen (happens when the target is
    // nearly viewport-sized, e.g. main content on mobile).
    tooltipStyle.top = clampY((vh - tooltipH) / 2)
    tooltipStyle.left = clampX((vw - tooltipW) / 2)
  } }

  return ReactDOM.createPortal(
    <>
      {/* Full-screen overlay with cutout (only when a target is visible) */}
      {cutout ? (
        <svg
          className="fixed inset-0"
          style={{ zIndex: 10000, pointerEvents: 'none' }}
          width="100%" height="100%"
        >
          <defs>
            <mask id="tour-spotlight-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={cutout.x} y={cutout.y}
                width={cutout.w} height={cutout.h}
                rx={8} fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%" height="100%"
            fill="rgba(0,0,0,0.55)"
            mask="url(#tour-spotlight-mask)"
            style={{ pointerEvents: 'auto' }}
            onClick={onClose}
          />
        </svg>
      ) : (
        <div
          className="fixed inset-0"
          style={{ zIndex: 10000, background: 'rgba(0,0,0,0.55)' }}
          onClick={onClose}
        />
      )}

      {/* Highlight ring around target */}
      {cutout && (
        <div
          className="fixed rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
          style={{
            zIndex: 10001,
            left: cutout.x,
            top: cutout.y,
            width: cutout.w,
            height: cutout.h,
          }}
        />
      )}

      {/* Tooltip */}
      <div ref={tooltipRef} style={tooltipStyle} className="bg-card border border-border rounded-xl shadow-2xl p-4 pointer-events-auto">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground block mb-2">Étape {step + 1} / {totalSteps}</span>

        <h4 className="text-sm font-semibold text-foreground mb-1">{tooltipContent.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{tooltipContent.content}</p>

        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-[10px] text-muted-foreground hover:text-foreground">
            Quitter
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={onPrev} className="gl-button-sm gl-button-default text-[10px]">
                Précédent
              </button>
            )}
            <button onClick={onNext} className="gl-button-sm gl-button-confirm text-[10px] items-center gap-1">
              {isLast ? <><CheckCircle2 size={10} /> Terminer</> : <><ArrowRight size={10} /> Suivant</>}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

// ── Derive current module slug ─────────────────────────────────

function deriveModule(pathname: string): string {
  const seg = pathname.replace(/^\//, '').split('/')[0] || 'dashboard'
  return seg
}

// ── Workflow accordion ─────────────────────────────────────────

function WorkflowItem({ workflow }: { workflow: WorkflowHelp }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {workflow.title}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {workflow.diagram && <MermaidDiagram chart={workflow.diagram} className="rounded-lg p-2 border border-border/60" />}
          <ol className="pt-1 space-y-1.5 list-none">
            {workflow.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-xs text-muted-foreground leading-relaxed">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function AssistantPanel() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { hasPermission } = usePermission()
  const { aiPanelOpen, toggleAIPanel, assistantTab, setAssistantTab } = useUIStore()

  const currentModule = useMemo(() => deriveModule(pathname), [pathname])
  // Local state tracks `assistantTab` in the store so external callers
  // (SmartForm wizard "Aide" button, etc.) can deep-link to a tab.
  const activeTab: TabId = assistantTab as TabId
  const setActiveTab = setAssistantTab as (tab: TabId) => void

  // ── Panel display mode (persisted via user preferences API) ──
  type PanelMode = 'docked' | 'floating' | 'compact'
  const { getPref, setPref } = useUserPreferences()
  const panelMode = getPref<PanelMode>('assistantPanelMode', 'docked')

  // ── First-login welcome tour auto-launch ──
  // On very first session we open the panel on the Tours tab so the user
  // lands on the `welcome` guided tour. `welcomeTourOffered` is flipped
  // regardless of whether the user completes or dismisses the tour, so we
  // only auto-open once — ticks the AUP §7.2 onboarding requirement
  // without being annoying on every login.
  const welcomeTourOffered = getPref<boolean>('welcomeTourOffered', false)
  const completedToursEarly = getPref<string[]>('completedTours', [])
  useEffect(() => {
    if (welcomeTourOffered) return
    if (completedToursEarly.includes('welcome')) {
      setPref('welcomeTourOffered', true)
      return
    }
    // Open the panel + switch to tours tab (ToursTab auto-starts the
    // welcome tour when it sees it hasn't been completed).
    if (!aiPanelOpen) toggleAIPanel()
    setActiveTab('tours')
    setPref('welcomeTourOffered', true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cyclePanelMode = useCallback(() => {
    const next = panelMode === 'docked' ? 'floating' : panelMode === 'floating' ? 'compact' : 'docked'
    setPref('assistantPanelMode', next)
  }, [panelMode, setPref])

  // ── Tab visibility based on permissions ──
  const canChat = true // All authenticated users can use AI chat
  const canCreateTicket = hasPermission('support.ticket.create')
  // Alerts tab removed 2026-04-23 — the notification bell in the topbar
  // and the /notifications journal page replace it.

  const tabs: { id: TabId; icon: typeof Bot; label: string; visible: boolean; badge?: number }[] = useMemo(() => [
    { id: 'chat', icon: Bot, label: t('assistant.tabs.chat'), visible: canChat },
    { id: 'help', icon: BookOpen, label: t('assistant.tabs.help'), visible: true },
    { id: 'tours', icon: Map, label: t('assistant.tabs.tours'), visible: true },
    { id: 'ticket', icon: LifeBuoy, label: t('assistant.tabs.ticket'), visible: canCreateTicket },
  ], [canChat, canCreateTicket])

  // Ensure active tab is visible
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab && t.visible)) {
      const first = tabs.find(t => t.visible)
      if (first) setActiveTab(first.id)
    }
  }, [tabs, activeTab])

  if (!aiPanelOpen) return null

  const modeIcon = panelMode === 'docked' ? PanelRight : panelMode === 'floating' ? Maximize2 : Minimize2
  const modeLabel = panelMode === 'docked' ? 'Docké (clic: flottant)' : panelMode === 'floating' ? 'Flottant (clic: compact)' : 'Compact (clic: docké)'
  const ModeIcon = modeIcon

  return (
    <aside
      className={cn(
        'flex flex-col bg-background/95 backdrop-blur-sm border-border shadow-lg',
        'animate-in slide-in-from-right duration-200',
        // On mobile (<sm) the panel takes the full viewport height minus the topbar,
        // using 100dvh so the URL bar's appearance/disappearance doesn't clip the
        // input area. From sm+ we fall back to the classic docked/floating/compact modes.
        'fixed right-0 z-40 w-full max-w-full border-l',
        'top-[44px] h-[calc(100dvh-44px)]',
        'sm:w-[360px] sm:max-w-[90vw]',
        panelMode === 'docked' && 'sm:top-[44px] sm:h-[calc(100dvh-44px)]',
        panelMode === 'floating' && 'sm:top-[56px] sm:right-4 sm:z-50 sm:h-[calc(100dvh-72px)] sm:w-[380px] sm:rounded-xl sm:border sm:shadow-2xl',
        panelMode === 'compact' && 'sm:top-auto sm:bottom-4 sm:right-4 sm:z-50 sm:h-[420px] sm:w-[340px] sm:rounded-xl sm:border sm:shadow-2xl',
      )}
    >
      {/* ── Header — height matches page header (h-[38px]) ── */}
      <div className={cn(
        'flex items-center justify-between px-3 h-[38px] border-b border-border bg-muted/30 shrink-0',
        panelMode !== 'docked' && 'rounded-t-xl cursor-move',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-primary shrink-0" />
          <h2 className="text-sm font-semibold text-foreground truncate">{t('assistant.title')}</h2>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">· {HELP_CONTENT[currentModule]?.title || currentModule}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Icon buttons — use plain classes instead of .gl-button. The
              button class ships with text-button padding and a min-h that
              collapses inside a 24×24 square, erasing the icon. */}
          <button
            onClick={cyclePanelMode}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-chrome hover:text-foreground transition-colors"
            title={modeLabel}
          >
            <ModeIcon size={14} />
          </button>
          <button
            onClick={toggleAIPanel}
            className="h-7 w-7 inline-flex items-center justify-center rounded border border-border bg-background text-muted-foreground hover:bg-chrome hover:text-foreground transition-colors"
            aria-label={t('assistant.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-border bg-muted/20 shrink-0 overflow-x-auto">
        {tabs.filter(t => t.visible).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap border-b-2',
              activeTab === tab.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <tab.icon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {activeTab === 'chat' && <ChatTab currentModule={currentModule} />}
        {activeTab === 'help' && <HelpTab currentModule={currentModule} />}
        {activeTab === 'tours' && <ToursTab currentModule={currentModule} />}
        {activeTab === 'ticket' && <TicketTab />}
      </div>
    </aside>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: AI CHAT
// ═══════════════════════════════════════════════════════════════

function ChatTab({ currentModule }: { currentModule: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { toast } = useToast()

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingText])

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    if (streamingText) {
      setMessages(prev => [...prev, { role: 'assistant', content: streamingText, timestamp: Date.now() }])
      setStreamingText('')
    }
    setStreaming(false)
  }, [streamingText])

  const sendNonStreamingFallback = useCallback(
    async (newMessages: ChatMsg[], token: string | null, entityId: string | null, baseUrl: string) => {
      const response = await fetch(`${baseUrl}/api/v1/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(entityId ? { 'X-Entity-ID': entityId } : {}),
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context_module: currentModule,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Erreur serveur' }))
        throw new Error(err.detail || `HTTP ${response.status}`)
      }

      const data = await response.json()
      const text = typeof data?.response === 'string' ? data.response.trim() : ''
      if (!text) {
        throw new Error('L’assistant n’a renvoyé aucun contenu.')
      }
      return text
    },
    [currentModule],
  )

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMsg = { role: 'user', content: text, timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)
    setStreamingText('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = safeLocal.getItem('access_token')
      const entityId = safeLocal.getItem('entity_id')
      const baseUrl = resolveApiBaseUrl()

      const response = await fetch(`${baseUrl}/api/v1/ai-chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(entityId ? { 'X-Entity-ID': entityId } : {}),
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context_module: currentModule,
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Erreur serveur' }))
        throw new Error(err.detail || `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No reader')

      const decoder = new TextDecoder()
      let accumulatedText = ''
      let buffer = ''
      let streamFailed = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content') {
              accumulatedText += data.text
              setStreamingText(accumulatedText)
            } else if (data.type === 'done') {
              buffer = ''
            } else if (data.type === 'error') {
              streamFailed = true
              throw new Error(data.message)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }

      if (!streamFailed && accumulatedText.trim()) {
        setMessages(prev => [...prev, { role: 'assistant', content: accumulatedText.trim(), timestamp: Date.now() }])
      } else {
        const fallbackText = await sendNonStreamingFallback(newMessages, token, entityId, baseUrl)
        setMessages(prev => [...prev, { role: 'assistant', content: fallbackText, timestamp: Date.now() }])
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      const errMsg = e.message || 'Erreur de communication avec l\'IA'
      toast({
        title: 'Assistant indisponible',
        description: errMsg,
        variant: 'error',
      })
      setMessages(prev => [...prev, { role: 'assistant', content: `\u26A0\uFE0F ${errMsg}`, timestamp: Date.now() }])
    } finally {
      setStreamingText('')
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, messages, streaming, currentModule, sendNonStreamingFallback, toast])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  const clearChat = useCallback(() => {
    setMessages([])
    setStreamingText('')
  }, [])

  const confirmLastWriteIntent = useCallback(async () => {
    if (streaming) return
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user')
    if (!lastUserMessage) return
    setInput(`${lastUserMessage.content}\n\nJe confirme. Exécute l'action demandée si mes permissions le permettent.`)
  }, [messages, streaming])

  const runAssistantAction = useCallback((action: AssistantActionToken) => {
    if (action.type === 'go' && action.target) {
      navigate(action.target)
      return
    }
    if (action.type === 'confirm-write') {
      void confirmLastWriteIntent()
    }
  }, [confirmLastWriteIntent, navigate])

  return (
    <>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-8">
            <Bot size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">{t('layout.posez_une_question_sur_opsflux')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              L'assistant connait le module {HELP_CONTENT[currentModule]?.title || currentModule}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-4">
              {(CONTEXTUAL_SUGGESTIONS[currentModule] || CONTEXTUAL_SUGGESTIONS.dashboard).map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {(() => {
              if (msg.role === 'user') {
                return (
                  <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-primary text-primary-foreground">
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                )
              }

              const parsed = parseAssistantActions(msg.content)
              return (
                <div className="max-w-[88%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-muted/50 text-foreground border border-border space-y-3">
                  <div
                    className="assistant-markdown break-words [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-background/70 [&_code]:px-1 [&_code]:py-0.5"
                    dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(parsed.text) }}
                  />
                  {parsed.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {parsed.actions.map((action, actionIndex) => (
                        <button
                          key={`${i}-${actionIndex}-${action.target}`}
                          onClick={() => runAssistantAction(action)}
                          className="gl-button-sm gl-button-secondary inline-flex items-center gap-1"
                        >
                          {action.type === 'confirm-write' ? <CheckCircle2 size={12} /> : <ArrowRight size={12} />}
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        ))}

        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-muted/50 text-foreground border border-border">
              <div
                className="assistant-markdown break-words [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1.5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:rounded [&_code]:bg-background/70 [&_code]:px-1 [&_code]:py-0.5"
                dangerouslySetInnerHTML={{ __html: renderAssistantMarkdown(parseAssistantActions(streamingText).text) }}
              />
              <span className="inline-block w-1.5 h-4 bg-primary/60 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {streaming && !streamingText && (
          <div className="flex justify-start">
            <div className="rounded-lg px-3 py-2 bg-muted/50 border border-border">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input area — extra bottom padding for iOS home-indicator safe area */}
      <div
        className="border-t border-border bg-muted/20 p-3 shrink-0 space-y-2"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {messages.length > 0 && (
          <div className="flex justify-end gap-1.5">
            {streaming && (
              <button onClick={stopStreaming} className="text-[10px] flex items-center gap-1 text-red-500 hover:text-red-400">
                <StopCircle size={10} /> Stop
              </button>
            )}
            <button onClick={clearChat} className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground">
              <RotateCcw size={10} /> Effacer
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('layout.votre_question')}
            className="gl-form-input text-sm flex-1 min-h-[36px] max-h-[100px] resize-y"
            rows={1}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="gl-button-sm gl-button-confirm h-9 w-9 items-center justify-center shrink-0"
          >
            {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: CONTEXTUAL HELP
// ═══════════════════════════════════════════════════════════════

function HelpTab({ currentModule }: { currentModule: string }) {
  const { t } = useTranslation()
  const help = HELP_CONTENT[currentModule]

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {!help ? (
        <div className="text-sm text-muted-foreground">{t('help_system.empty')}</div>
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center gap-2.5">
            <span className="text-lg" role="img" aria-hidden>{help.icon}</span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{help.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{help.description}</p>
            </div>
          </div>

          {/* Workflows */}
          {help.workflows.length > 0 && (
            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{t('assistant.help.workflows')}</h4>
              <div className="space-y-2">
                {help.workflows.map((wf, i) => <WorkflowItem key={i} workflow={wf} />)}
              </div>
            </section>
          )}

          {/* Tips */}
          {help.tips.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-amber-500" />
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('assistant.help.tips')}</h4>
              </div>
              <ul className="space-y-2">
                {help.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                    <span className="text-amber-500/70 mt-0.5 shrink-0">{'\u2022'}</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: GUIDED TOURS
// ═══════════════════════════════════════════════════════════════

function ToursTab({ currentModule }: { currentModule: string }) {
  const [activeTour, setActiveTour] = useState<GuidedTour | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)

  // Completed tours stored in localStorage
  const { getPref: getTourPref, setPref: setTourPref } = useUserPreferences()
  const completedTours = getTourPref<string[]>('completedTours', [])

  const markCompleted = useCallback((tourId: string) => {
    const next = [...new Set([...completedTours, tourId])]
    setTourPref('completedTours', next)
  }, [completedTours, setTourPref])

  // Filter tours: global ones + module-specific
  const availableTours = useMemo(() =>
    GUIDED_TOURS.filter(t => t.module === null || t.module === currentModule),
    [currentModule],
  )

  // Find and highlight the target element for the current step
  const highlightTarget = useCallback((step: TourStep) => {
    // Try data-tour attribute first, then CSS selector
    const el = document.querySelector(`[data-tour="${step.target}"]`) || document.querySelector(step.target)
    if (el) {
      // Center the element so the tooltip has room above OR below — block:'nearest'
      // would leave targets pinned to the viewport edge with no placement space.
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const rect = el.getBoundingClientRect()
      // If the element is not visible at all (display:none, parent hidden…)
      // the rect collapses to width/height 0 at (0,0). Skip the spotlight in
      // that case — the tooltip will fall back to center-overlay mode.
      if (rect.width === 0 && rect.height === 0) {
        setTargetRect(null)
        return
      }
      setTargetRect(rect)
      // Focus the element if it's focusable (input, button, etc.)
      if (el instanceof HTMLElement && (el.tabIndex >= 0 || el.tagName === 'INPUT' || el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA')) {
        el.focus({ preventScroll: true })
      }
    } else {
      setTargetRect(null)
    }
  }, [])

  // Re-highlight on step change or window resize
  useEffect(() => {
    if (!activeTour) { setTargetRect(null); return }
    const step = activeTour.steps[currentStep]
    // Small delay for DOM to settle (e.g. after scrollIntoView)
    const timer = setTimeout(() => highlightTarget(step), 150)

    const onResize = () => highlightTarget(step)
    window.addEventListener('resize', onResize)
    return () => { clearTimeout(timer); window.removeEventListener('resize', onResize) }
  }, [activeTour, currentStep, highlightTarget])

  const startTour = useCallback((tour: GuidedTour) => {
    setActiveTour(tour)
    setCurrentStep(0)
  }, [])

  // Auto-start the welcome tour the first time the user lands on this tab.
  // Paired with the AssistantPanel-level effect that auto-opens the panel
  // on the Tours tab at first login.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current) return
    if (completedTours.includes('welcome')) return
    const welcome = GUIDED_TOURS.find(t => t.id === 'welcome')
    if (welcome) {
      autoStartedRef.current = true
      // Slight delay so the panel + tabs finish mounting before we
      // measure the target element.
      const tm = setTimeout(() => startTour(welcome), 300)
      return () => clearTimeout(tm)
    }
  }, [completedTours, startTour])

  const closeTour = useCallback(() => {
    setActiveTour(null)
    setCurrentStep(0)
    setTargetRect(null)
  }, [])

  const nextStep = useCallback(() => {
    if (!activeTour) return
    if (currentStep < activeTour.steps.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      markCompleted(activeTour.id)
      closeTour()
    }
  }, [activeTour, currentStep, markCompleted, closeTour])

  const prevStep = useCallback(() => {
    setCurrentStep(s => Math.max(0, s - 1))
  }, [])

  // Render spotlight overlay when a tour is active — targetRect may be null
  // when the anchor is hidden/off-screen (TourSpotlight handles that case by
  // centering the tooltip over a full-screen backdrop instead of a cutout).
  const spotlightOverlay = activeTour ? (
    <TourSpotlight
      targetRect={targetRect}
      tooltipContent={activeTour.steps[currentStep]}
      step={currentStep}
      totalSteps={activeTour.steps.length}
      onNext={nextStep}
      onPrev={prevStep}
      onClose={closeTour}
      isLast={currentStep === activeTour.steps.length - 1}
    />
  ) : null

  // Tour list view (always shown — spotlight is rendered via portal)
  return (
    <>
      {spotlightOverlay}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {activeTour && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 mb-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary">{activeTour.title}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Étape {currentStep + 1} / {activeTour.steps.length} — {activeTour.steps[currentStep].title}
                </p>
              </div>
              <button onClick={closeTour} className="text-[10px] text-muted-foreground hover:text-foreground">
                Quitter
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-2">
          Visites guidées interactives avec spotlight sur les éléments de la page.
        </p>

        {availableTours.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Map size={24} className="mx-auto mb-2 text-muted-foreground/30" />
            Aucune visite disponible pour ce module.
          </div>
        )}

        {availableTours.map(tour => {
          const isCompleted = completedTours.includes(tour.id)
          const isActive = activeTour?.id === tour.id
          return (
            <div key={tour.id} className={cn(
              'border rounded-lg p-3 transition-colors',
              isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30',
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate">{tour.title}</h4>
                    {isCompleted && (
                      <span className="shrink-0 text-[9px] bg-green-500/10 text-green-500 px-1.5 py-0.5 rounded-full font-medium">
                        Fait
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{tour.description}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{tour.steps.length} étapes</p>
                </div>
                {isActive ? (
                  <button onClick={closeTour} className="gl-button-sm gl-button-default shrink-0 items-center gap-1 text-red-500">
                    <StopCircle size={10} /> Arreter
                  </button>
                ) : (
                  <button
                    onClick={() => startTour(tour)}
                    className="gl-button-sm gl-button-default shrink-0 items-center gap-1"
                  >
                    <Play size={10} /> {isCompleted ? 'Revoir' : 'Démarrer'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}


// ═══════════════════════════════════════════════════════════════
// TAB 5: QUICK TICKET
// ═══════════════════════════════════════════════════════════════

const TICKET_TYPE_OPTIONS: { value: TicketType; iconKey: 'bug' | 'improvement' | 'question'; icon: typeof Bug }[] = [
  { value: 'bug', iconKey: 'bug', icon: Bug },
  { value: 'improvement', iconKey: 'improvement', icon: Lightbulb },
  { value: 'question', iconKey: 'question', icon: HelpCircle },
]

function TicketTab() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const createTicket = useCreateTicket()
  const [form, setForm] = useState<TicketCreate>({
    title: '',
    description: '',
    ticket_type: 'bug',
    priority: 'medium',
  })
  const [attachments, setAttachments] = useState<File[]>([])
  const [previews, setPreviews] = useState<{ name: string; url: string | null; type: string }[]>([])
  const [capturing, setCapturing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Screenshot capture — hides the Assistant panel so it doesn't appear in
  // the capture, then restores it.
  const captureScreenshot = useCallback(async () => {
    setCapturing(true)
    const panelEl = document.querySelector<HTMLElement>('aside[class*="slide-in-from-right"]')
    const prevVisibility = panelEl?.style.visibility
    if (panelEl) panelEl.style.visibility = 'hidden'
    try {
      await new Promise(r => setTimeout(r, 80))
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, scale: 0.5, logging: false })
      if (panelEl) panelEl.style.visibility = prevVisibility ?? ''
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
          setAttachments(prev => [...prev, file])
          setPreviews(prev => [...prev, { name: file.name, url: URL.createObjectURL(blob), type: 'image' }])
        }
        setCapturing(false)
      }, 'image/png')
    } catch {
      if (panelEl) panelEl.style.visibility = prevVisibility ?? ''
      toast({ title: "Capture d'écran impossible", variant: 'error' })
      setCapturing(false)
    }
  }, [toast])

  // Screen recording (getDisplayMedia + MediaRecorder) — ported from the
  // now-removed FeedbackWidget. Output is a .webm (or .mp4 fallback) attached
  // like any other file.
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1280, height: 720, frameRate: 15 },
        audio: false,
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
          ? 'video/webm'
          : 'video/mp4'

      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_000_000 })
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const ext = mimeType.includes('webm') ? 'webm' : 'mp4'
        const file = new File([blob], `recording-${Date.now()}.${ext}`, { type: mimeType })
        setAttachments(prev => [...prev, file])
        setPreviews(prev => [...prev, { name: file.name, url: null, type: 'video' }])
        setRecording(false)
        setRecordingTime(0)
        if (timerRef.current) clearInterval(timerRef.current)
        streamRef.current?.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      stream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }

      recorder.start(1000)
      setRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
      toast({ title: 'Enregistrement démarré', description: 'Cliquez sur Stop quand vous avez terminé.', variant: 'success' })
    } catch {
      toast({ title: 'Enregistrement impossible', description: "L'accès au partage d'écran a été refusé.", variant: 'error' })
    }
  }, [toast])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // File attach
  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachments(prev => [...prev, file])
      const isImage = file.type.startsWith('image/')
      setPreviews(prev => [...prev, { name: file.name, url: isImage ? URL.createObjectURL(file) : null, type: isImage ? 'image' : 'file' }])
    }
    e.target.value = ''
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => {
      const p = prev[index]
      if (p?.url) URL.revokeObjectURL(p.url)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // Submit
  const handleSubmit = useCallback(async () => {
    if (!form.title.trim()) return
    try {
      const ticket = await createTicket.mutateAsync({
        ...form,
        source_url: window.location.href,
        browser_info: {
          userAgent: navigator.userAgent,
          language: navigator.language,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          url: window.location.href,
        },
      })

      // Build upload list — user attachments + auto console log for bugs
      const filesToUpload: { file: File; description: string }[] = attachments.map(f => ({
        file: f,
        description: f.type.startsWith('video/') ? 'Enregistrement écran'
          : f.type.startsWith('image/') ? "Capture d'écran"
          : 'Pièce jointe',
      }))
      if (form.ticket_type === 'bug' && consoleLogBuffer.length > 0) {
        filesToUpload.push({ file: buildConsoleLogFile(), description: 'Console log (auto-capturé)' })
      }

      for (const { file, description } of filesToUpload) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('owner_type', 'support_ticket')
          fd.append('owner_id', ticket.id)
          fd.append('description', description)
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* non-blocking */ }
      }

      const logNote = form.ticket_type === 'bug' ? ' (console log inclus)' : ''
      toast({ title: 'Ticket créé !', description: `Ref: ${ticket.reference} · ${filesToUpload.length} PJ${logNote}`, variant: 'success' })
      setForm({ title: '', description: '', ticket_type: 'bug', priority: 'medium' })
      setAttachments([])
      setPreviews([])
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: 'error' })
    }
  }, [form, createTicket, toast, attachments])

  return (
    <div
      className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      {/* Type selector */}
      <div className="flex gap-1.5">
        {TICKET_TYPE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setForm({ ...form, ticket_type: opt.value })}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              form.ticket_type === opt.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted/50',
            )}
          >
            <opt.icon size={11} />
            {t(`assistant.ticket.types.${opt.iconKey}`)}
          </button>
        ))}
      </div>

      {/* Title */}
      <input
        className={cn('gl-form-input text-sm w-full', form.title.trim().length > 0 && form.title.trim().length < 10 && 'border-orange-400')}
        placeholder={t('layout.titre_clair_et_precis_min_10_car')}
        value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })}
      />

      {/* Description — Tiptap rich editor, same component used everywhere
          else in OpsFlux. Stored as HTML; the backend renders it on the
          ticket timeline the same way it renders MOC content. */}
      <RichTextField
        value={form.description || ''}
        onChange={(html) => setForm({ ...form, description: html })}
        placeholder={form.ticket_type === 'bug'
          ? 'Décrivez : que faisiez-vous ? que s\'est-il passé ? (min. 20 car.)'
          : 'Décrivez votre demande...'}
        rows={4}
      />

      {/* Priority */}
      <select
        className="gl-form-select text-xs h-7 w-full"
        value={form.priority}
        onChange={e => setForm({ ...form, priority: e.target.value as TicketCreate['priority'] })}
      >
        <option value="low">{t('assistant.ticket.priorities.low')}</option>
        <option value="medium">{t('assistant.ticket.priorities.medium')}</option>
        <option value="high">{t('assistant.ticket.priorities.high')}</option>
        <option value="critical">{t('assistant.ticket.priorities.critical')}</option>
      </select>

      {/* Media buttons — screenshot, screen-recording, file attach */}
      <div className="flex items-center gap-1.5">
        <button onClick={captureScreenshot} disabled={capturing || recording} className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]">
          {capturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />} Photo
        </button>
        {recording ? (
          <button onClick={stopRecording} className="gl-button-sm gl-button-danger flex-1 justify-center text-[10px] animate-pulse">
            <Square size={10} /> Stop {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
          </button>
        ) : (
          <button onClick={startRecording} disabled={capturing} className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]">
            <Video size={10} /> Vidéo
          </button>
        )}
        <button onClick={() => fileRef.current?.click()} disabled={recording} className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]">
          <Paperclip size={10} /> Fichier
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileAttach} />
      </div>

      {/* Attachment previews */}
      {previews.length > 0 && (
        <div className="space-y-1.5">
          {previews.map((p, i) => (
            <div key={i} className="relative">
              {p.url ? (
                <div className="relative">
                  <img src={p.url} alt={p.name} className="w-full h-14 object-cover rounded border border-border" />
                  <span className="absolute bottom-0.5 left-1 text-[7px] bg-black/60 text-white px-1 py-0.5 rounded">{p.name}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border border-border/50">
                  <Paperclip size={10} />
                  <span className="truncate flex-1">{p.name}</span>
                </div>
              )}
              <button onClick={() => removeAttachment(i)} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <p className="text-[9px] text-muted-foreground truncate">
        Page: {window.location.pathname} · {attachments.length} PJ
      </p>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={
          form.title.trim().length < 10
          // Description now contains HTML — strip tags before length check
          // so <p></p> from Tiptap doesn't count as "20 chars"
          || (form.ticket_type === 'bug'
              && (form.description || '').replace(/<[^>]+>/g, '').trim().length < 20)
          || createTicket.isPending
        }
        className="gl-button-sm gl-button-confirm w-full justify-center"
      >
        {createTicket.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        Envoyer le ticket
      </button>
    </div>
  )
}
