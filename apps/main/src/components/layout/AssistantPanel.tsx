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
  useMemo,
} from 'react'
import ReactDOM from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { marked } from 'marked'
import {
  X,
  Bot,
  BookOpen,
  Map,
  Bell,
  LifeBuoy,
  Send,
  Loader2,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Bug,
  HelpCircle,
  Camera,
  Paperclip,
  CheckCheck,
  ExternalLink,
  Inbox,
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

// ── Types ──────────────────────────────────────────────────────

type TabId = 'chat' | 'help' | 'tours' | 'alerts' | 'ticket'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface Notification {
  id: string
  title: string
  body: string | null
  category: string
  link: string | null
  read: boolean
  created_at: string
}

interface AssistantActionToken {
  type: 'go'
  target: string
  label: string
}

const SAFE_ASSISTANT_ROUTE_PREFIXES = [
  '/dashboard',
  '/users',
  '/projets',
  '/projects',
  '/paxlog',
  '/planner',
  '/tiers',
  '/conformite',
  '/travelwiz',
  '/support',
  '/settings',
  '/papyrus',
  '/assets',
  '/imputations',
] as const

function isSafeAssistantRoute(target: string): boolean {
  if (!target.startsWith('/')) return false
  return SAFE_ASSISTANT_ROUTE_PREFIXES.some(prefix => target === prefix || target.startsWith(`${prefix}/`))
}

function parseAssistantActions(content: string): { text: string; actions: AssistantActionToken[] } {
  const actions: AssistantActionToken[] = []
  const text = content.replace(/\[\[action:go:([^|\]]+)\|([^\]]+)\]\]/g, (_match, target, label) => {
    const safeTarget = String(target).trim()
    const safeLabel = String(label).replace(/[\r\n[\]|]+/g, ' ').trim()
    if (isSafeAssistantRoute(safeTarget) && safeLabel) {
      actions.push({ type: 'go', target: safeTarget, label: safeLabel })
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
  theme: 'dark',
  themeVariables: {
    primaryColor: '#3b82f6',
    primaryTextColor: '#fff',
    primaryBorderColor: '#60a5fa',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a',
    lineColor: '#64748b',
    textColor: '#e2e8f0',
    mainBkg: '#1e293b',
    nodeBorder: '#3b82f6',
    clusterBkg: '#0f172a',
    edgeLabelBackground: '#1e293b',
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

// ── Help content ───────────────────────────────────────────────

interface WorkflowHelp { title: string; steps: string[]; diagram?: string }
interface ModuleHelp {
  title: string; icon: string; description: string
  workflows: WorkflowHelp[]; tips: string[]
  elementHelp: Record<string, string>
}

const HELP_CONTENT: Record<string, ModuleHelp> = {
  dashboard: {
    title: 'Tableau de bord', icon: '\u{1F4CA}',
    description: "Vue d'ensemble de vos operations. Les widgets affichent les KPIs en temps reel de tous les modules.",
    workflows: [{ title: 'Personnaliser le dashboard', steps: ['Cliquez sur "Modifier" en haut a droite', 'Glissez-deposez les widgets', 'Cliquez "+" pour ajouter un widget', 'Configurez via l\'icone \u2699\uFE0F', 'Cliquez "Terminer"'] }],
    tips: ['Chaque module a son propre dashboard', 'Les donnees se rafraichissent toutes les 5 minutes'],
    elementHelp: {},
  },
  users: {
    title: 'Comptes utilisateurs', icon: '\u{1F465}',
    description: "Gestion des comptes, roles, groupes et permissions. Controle d'acces centralise (RBAC).",
    workflows: [
      { title: 'Creer un utilisateur', steps: ['Cliquez "+ Nouvel utilisateur"', 'Renseignez nom, prenom, email', "Choisissez l'entite et le role", 'Le mot de passe temporaire est envoye par email'] },
      { title: 'Gerer les permissions', steps: ['Cliquez sur un utilisateur', 'Allez dans l\'onglet "Permissions"', 'Cliquez sur les cellules pour accorder ou retirer', 'Les permissions heritees sont indiquees par un badge'],
        diagram: `graph TD\n    A["Utilisateur"]:::user --> B["Groupe"]:::group\n    B --> C["Role"]:::role\n    C --> D["Permissions de base"]:::perm\n    B --> E["Overrides groupe"]:::override\n    A --> F["Overrides utilisateur"]:::override\n    D --> G["Permissions effectives"]:::effective\n    E --> G\n    F --> G\n    classDef user fill:#8b5cf6,stroke:#a78bfa,color:#fff\n    classDef group fill:#06b6d4,stroke:#22d3ee,color:#fff\n    classDef role fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef perm fill:#475569,stroke:#64748b,color:#fff\n    classDef override fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef effective fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: ['Un utilisateur peut appartenir a plusieurs groupes', 'Les overrides utilisateur priment sur les permissions du groupe/role'],
    elementHelp: {},
  },
  projets: {
    title: 'Gestion de projets', icon: '\u{1F4C1}',
    description: 'Planification et suivi des projets : taches, jalons, Gantt, budget, equipe.',
    workflows: [
      { title: 'Creer un projet', steps: ['Cliquez "+ Nouveau projet"', 'Renseignez le nom, code, dates, budget', 'Affectez un site/asset et un chef de projet', "Ajoutez des taches dans l'onglet Planning"],
        diagram: `graph LR\n    A["Planifie"]:::planned --> B["Actif"]:::active\n    B --> C["Termine"]:::done\n    B --> D["Annule"]:::cancelled\n    classDef planned fill:#475569,stroke:#64748b,color:#fff\n    classDef active fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef done fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      { title: "Suivre l'avancement", steps: ['Le Gantt montre la timeline', "Double-cliquez une tache pour l'editer", "Le % d'avancement se met a jour automatiquement", "Le Tableur permet l'edition en masse"],
        diagram: `graph LR\n    A["A faire"]:::todo --> B["En cours"]:::progress\n    B --> C["Revue"]:::review\n    C --> D["Termine"]:::done\n    C -->|Corrections| B\n    classDef todo fill:#475569,stroke:#64748b,color:#fff\n    classDef progress fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef review fill:#eab308,stroke:#facc15,color:#000\n    classDef done fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: ['Utilisez le Kanban pour un suivi par statut', 'Les dependances sont visibles dans le Gantt'],
    elementHelp: {},
  },
  paxlog: {
    title: 'PaxLog', icon: '\u2708\uFE0F',
    description: "Avis de séjour, gestion des passagers, conformité, rotations et listes d'attente.",
    workflows: [
      { title: 'Soumettre un avis de séjour', steps: ['Cliquez "+ Nouvel AdS"', 'Choisissez le type', 'Selectionnez le site, dates, categorie', 'Ajoutez les passagers', 'Verifiez la conformite', 'Cliquez "Soumettre"'],
        diagram: `graph TD\n    A["Brouillon"]:::draft -->|Soumettre| B["Soumis"]:::submitted\n    B --> C{"Conformite"}\n    C -->|OK| D["En validation"]:::validation\n    C -->|Issues| E["Bloque"]:::blocked\n    D -->|Approuver| F["Approuve"]:::approved\n    D -->|Rejeter| G["Rejete"]:::rejected\n    F -->|Demarrer| H["En cours"]:::progress\n    H -->|Terminer| I["Termine"]:::done\n    classDef draft fill:#475569,stroke:#64748b,color:#fff\n    classDef submitted fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef validation fill:#8b5cf6,stroke:#a78bfa,color:#fff\n    classDef blocked fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef approved fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef rejected fill:#ef4444,stroke:#f87171,color:#fff\n    classDef progress fill:#06b6d4,stroke:#22d3ee,color:#fff\n    classDef done fill:#10b981,stroke:#34d399,color:#fff`,
      },
    ],
    tips: ['La conformite verifie les certifications de chaque PAX', 'Un PAX bloque doit regulariser sa situation'],
    elementHelp: {},
  },
  planner: {
    title: 'Planner', icon: '\u{1F4C5}',
    description: 'Planification des activites sur les assets, gestion des capacites et scenarios.',
    workflows: [{ title: 'Creer une activite', steps: ['Cliquez "+ Nouvelle activite"', "Choisissez l'asset, les dates, le type", 'Definissez le quota PAX', "L'activite apparait dans le Gantt"] }],
    tips: ['Les conflits de capacite sont detectes automatiquement', 'Les scenarios permettent de comparer differentes planifications'],
    elementHelp: {},
  },
  tiers: {
    title: 'Tiers', icon: '\u{1F3E2}',
    description: 'Annuaire des entreprises partenaires, fournisseurs, sous-traitants et leurs contacts.',
    workflows: [{ title: 'Ajouter une entreprise', steps: ['Cliquez "+ Nouveau tiers"', 'Renseignez la raison sociale, SIRET, type', 'Ajoutez les contacts', "Liez l'entreprise aux utilisateurs concernes"] }],
    tips: ['Un tiers peut etre fournisseur ET sous-traitant', 'Les contacts tiers sont utilises comme PAX externes dans PaxLog'],
    elementHelp: {},
  },
  conformite: {
    title: 'Conformite', icon: '\u2705',
    description: 'Gestion des certifications, habilitations, formations obligatoires et audits.',
    workflows: [{ title: "Verifier la conformite d'un PAX", steps: ['Allez dans l\'onglet Verifications', 'Recherchez le PAX', 'Consultez ses certifications', 'Les expirations sont signalees en rouge'],
      diagram: `graph TD\n    A["Regles site"]:::rule --> D{"Verification"}\n    B["Profil / Habilitations"]:::rule --> D\n    C["Auto-declarations"]:::rule --> D\n    D -->|Tout OK| E["Conforme"]:::ok\n    D -->|Manquant| F["Non conforme"]:::nok\n    D -->|Expire| G["Expire"]:::expired\n    classDef rule fill:#475569,stroke:#64748b,color:#fff\n    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef nok fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef expired fill:#ef4444,stroke:#f87171,color:#fff`,
    }],
    tips: ['Les regles de conformite sont configurables par type de site'],
    elementHelp: {},
  },
  travelwiz: {
    title: 'TravelWiz', icon: '\u{1F681}',
    description: 'Gestion des voyages, reservations transport, manifestes et suivi en temps reel.',
    workflows: [], tips: ['Module en cours de developpement'], elementHelp: {},
  },
  support: {
    title: 'Support', icon: '\u{1F3AB}',
    description: 'Tickets de support, signalements de bugs, annonces et communication.',
    workflows: [{ title: 'Signaler un bug', steps: ['Cliquez le bouton assistant', 'Allez dans l\'onglet Ticket', 'Choisissez "Bug"', 'Decrivez le probleme', "Ajoutez une capture d'ecran"] }],
    tips: ['Les captures masquent automatiquement le widget', "L'enregistrement video montre les etapes de reproduction"],
    elementHelp: {},
  },
  settings: {
    title: 'Parametres', icon: '\u2699\uFE0F',
    description: "Configuration du profil, de l'application, des integrations et des modules.",
    workflows: [], tips: ['Les modeles PDF permettent de personnaliser les exports', 'La delegation permet de confier ses droits a un collegue'],
    elementHelp: {},
  },
}

// ── Guided tours definitions ───────────────────────────────────

interface TourStep {
  target: string // data-tour attribute value OR CSS selector
  title: string
  content: string
}

interface GuidedTour {
  id: string
  title: string
  description: string
  module: string | null // null = global
  steps: TourStep[]
}

const GUIDED_TOURS: GuidedTour[] = [
  {
    id: 'welcome',
    title: 'Bienvenue sur OpsFlux',
    description: 'Decouvrez les fonctionnalites principales de la plateforme.',
    module: null,
    steps: [
      { target: 'sidebar', title: 'Navigation', content: 'La barre laterale vous permet de naviguer entre les modules. Cliquez sur les icones pour acceder aux differentes sections.' },
      { target: 'topbar', title: 'Barre superieure', content: 'Recherche globale, notifications, preferences de langue et de theme sont accessibles ici.' },
      { target: 'search-bar', title: 'Recherche', content: 'Tapez pour filtrer la page en cours, ou utilisez Ctrl+K pour la palette de commandes.' },
      { target: 'main-content', title: 'Zone principale', content: 'Les pages affichent leur contenu ici. Quand vous selectionnez un element, un panel de detail s\'ouvre sur le cote.' },
      { target: 'assistant-button', title: 'Assistant', content: 'Ce bouton ouvre l\'assistant OpsFlux : aide contextuelle, chatbot IA, visites guidees et tickets.' },
    ],
  },
  {
    id: 'projets-basics',
    title: 'Premiers pas avec les Projets',
    description: 'Apprenez a creer et gerer vos projets.',
    module: 'projets',
    steps: [
      { target: 'main-content', title: 'Vue liste', content: 'La page Projets affiche tous vos projets. Utilisez les filtres et le tri pour trouver rapidement un projet.' },
      { target: 'search-bar', title: 'Recherche projets', content: 'Tapez le nom ou code d\'un projet pour le filtrer instantanement.' },
      { target: 'sidebar', title: 'Modules lies', content: 'Le Planner et les Imputations dans la sidebar sont lies a vos projets pour la planification et le suivi des couts.' },
    ],
  },
  {
    id: 'paxlog-basics',
    title: 'Premiers pas avec PaxLog',
    description: 'Gestion des avis de séjour et passagers.',
    module: 'paxlog',
    steps: [
      { target: 'main-content', title: 'Avis de séjour', content: 'Un AdS est une demande de deplacement de passagers vers un site. Chaque AdS passe par un workflow de validation.' },
      { target: 'search-bar', title: 'Recherche PAX', content: 'Recherchez un passager, un site ou un numero d\'AdS pour le retrouver rapidement.' },
    ],
  },
  {
    id: 'users-rbac',
    title: 'Gestion des droits d\'acces',
    description: 'Comprendre le systeme RBAC d\'OpsFlux.',
    module: 'users',
    steps: [
      { target: 'main-content', title: 'Liste des utilisateurs', content: 'Tous les comptes utilisateurs sont affiches ici. Cliquez sur un utilisateur pour voir ses details et permissions.' },
      { target: 'sidebar', title: 'Modules admin', content: 'Les modules Comptes, Entites et Parametres en bas de la sidebar contiennent les outils d\'administration.' },
    ],
  },
]

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
  targetRect: DOMRect
  tooltipContent: { title: string; content: string }
  step: number
  totalSteps: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
  isLast: boolean
}) {
  const padding = 8
  const cutout = {
    x: targetRect.x - padding,
    y: targetRect.y - padding,
    w: targetRect.width + padding * 2,
    h: targetRect.height + padding * 2,
  }

  // Smart tooltip positioning: handles tall elements (sidebar), wide elements (topbar), small buttons
  const vw = window.innerWidth
  const vh = window.innerHeight
  const tooltipW = Math.min(300, vw - 32)
  const tooltipH = 200 // estimated tooltip height
  const gap = 12

  const spaceRight = vw - (cutout.x + cutout.w)
  const spaceBelow = vh - (cutout.y + cutout.h)
  const spaceLeft = cutout.x
  const isTall = cutout.h > vh * 0.5 // element taller than half viewport

  const tooltipStyle: React.CSSProperties = { position: 'fixed', width: tooltipW, zIndex: 10001 }

  if (isTall && spaceRight > tooltipW + gap) {
    // Tall element (sidebar): place tooltip to the right, vertically centered
    tooltipStyle.left = cutout.x + cutout.w + gap
    tooltipStyle.top = Math.max(60, Math.min(cutout.y + cutout.h / 2 - tooltipH / 2, vh - tooltipH - 16))
  } else if (isTall && spaceLeft > tooltipW + gap) {
    // Tall element but no space right: place to the left
    tooltipStyle.left = cutout.x - tooltipW - gap
    tooltipStyle.top = Math.max(60, Math.min(cutout.y + cutout.h / 2 - tooltipH / 2, vh - tooltipH - 16))
  } else if (spaceBelow > tooltipH) {
    // Normal: place below
    tooltipStyle.top = cutout.y + cutout.h + gap
    tooltipStyle.left = Math.max(16, Math.min(cutout.x, vw - tooltipW - 16))
  } else {
    // Fallback: place above
    tooltipStyle.bottom = vh - cutout.y + gap
    tooltipStyle.left = Math.max(16, Math.min(cutout.x, vw - tooltipW - 16))
  }

  return ReactDOM.createPortal(
    <>
      {/* Full-screen overlay with cutout */}
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

      {/* Highlight ring around target */}
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

      {/* Tooltip */}
      <div style={tooltipStyle} className="bg-card border border-border rounded-xl shadow-2xl p-4 pointer-events-auto">
        {/* Progress */}
        <div className="flex items-center gap-1.5 mb-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground block mb-2">Etape {step + 1} / {totalSteps}</span>

        <h4 className="text-sm font-semibold text-foreground mb-1">{tooltipContent.title}</h4>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">{tooltipContent.content}</p>

        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-[10px] text-muted-foreground hover:text-foreground">
            Quitter
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button onClick={onPrev} className="gl-button-sm gl-button-default text-[10px]">
                Precedent
              </button>
            )}
            <button onClick={onNext} className="gl-button-sm gl-button-confirm text-[10px] flex items-center gap-1">
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
          {workflow.diagram && <MermaidDiagram chart={workflow.diagram} className="bg-slate-900/50 rounded-lg p-2" />}
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
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { hasPermission } = usePermission()
  const { aiPanelOpen, toggleAIPanel } = useUIStore()

  const currentModule = useMemo(() => deriveModule(pathname), [pathname])
  const [activeTab, setActiveTab] = useState<TabId>('chat')

  // ── Panel display mode (persisted via user preferences API) ──
  type PanelMode = 'docked' | 'floating' | 'compact'
  const { getPref, setPref } = useUserPreferences()
  const panelMode = getPref<PanelMode>('assistantPanelMode', 'docked')

  const cyclePanelMode = useCallback(() => {
    const next = panelMode === 'docked' ? 'floating' : panelMode === 'floating' ? 'compact' : 'docked'
    setPref('assistantPanelMode', next)
  }, [panelMode, setPref])

  // ── Tab visibility based on permissions ──
  const canChat = true // All authenticated users can use AI chat
  const canCreateTicket = hasPermission('support.ticket.create')
  const canViewAlerts = true // All users see their notifications

  const tabs: { id: TabId; icon: typeof Bot; label: string; visible: boolean; badge?: number }[] = useMemo(() => [
    { id: 'chat', icon: Bot, label: 'Assistant IA', visible: canChat },
    { id: 'help', icon: BookOpen, label: 'Aide', visible: true },
    { id: 'tours', icon: Map, label: 'Visites', visible: true },
    { id: 'alerts', icon: Bell, label: 'Alertes', visible: canViewAlerts },
    { id: 'ticket', icon: LifeBuoy, label: 'Ticket', visible: canCreateTicket },
  ], [canChat, canViewAlerts, canCreateTicket])

  // Ensure active tab is visible
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab && t.visible)) {
      const first = tabs.find(t => t.visible)
      if (first) setActiveTab(first.id)
    }
  }, [tabs, activeTab])

  if (!aiPanelOpen) return null

  const modeIcon = panelMode === 'docked' ? PanelRight : panelMode === 'floating' ? Maximize2 : Minimize2
  const modeLabel = panelMode === 'docked' ? 'Docke (clic: flottant)' : panelMode === 'floating' ? 'Flottant (clic: compact)' : 'Compact (clic: docke)'
  const ModeIcon = modeIcon

  return (
    <aside
      className={cn(
        'flex flex-col bg-background/95 backdrop-blur-sm border-border shadow-lg',
        'animate-in slide-in-from-right duration-200',
        panelMode === 'docked' && 'fixed top-[44px] right-0 z-40 h-[calc(100vh-44px)] w-[360px] max-w-[90vw] border-l',
        panelMode === 'floating' && 'fixed top-[56px] right-4 z-50 h-[calc(100vh-72px)] w-[380px] max-w-[90vw] rounded-xl border shadow-2xl',
        panelMode === 'compact' && 'fixed bottom-4 right-4 z-50 h-[420px] w-[340px] max-w-[90vw] rounded-xl border shadow-2xl',
      )}
    >
      {/* ── Header — height matches page header (h-[38px]) ── */}
      <div className={cn(
        'flex items-center justify-between px-3 h-[38px] border-b border-border bg-muted/30 shrink-0',
        panelMode !== 'docked' && 'rounded-t-xl cursor-move',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-primary shrink-0" />
          <h2 className="text-sm font-semibold text-foreground truncate">Assistant</h2>
          <span className="text-[10px] text-muted-foreground truncate hidden sm:inline">· {HELP_CONTENT[currentModule]?.title || currentModule}</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={cyclePanelMode}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title={modeLabel}
          >
            <ModeIcon size={12} />
          </button>
          <button
            onClick={toggleAIPanel}
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fermer l'assistant"
          >
            <X size={12} />
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
        {activeTab === 'alerts' && <AlertsTab navigate={navigate} />}
        {activeTab === 'ticket' && <TicketTab />}
      </div>
    </aside>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: AI CHAT
// ═══════════════════════════════════════════════════════════════

function ChatTab({ currentModule }: { currentModule: string }) {
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
      const token = localStorage.getItem('access_token')
      const entityId = localStorage.getItem('entity_id')
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

  const runAssistantAction = useCallback((action: AssistantActionToken) => {
    if (action.type === 'go' && action.target) {
      navigate(action.target)
    }
  }, [navigate])

  return (
    <>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-8">
            <Bot size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">Posez une question sur OpsFlux</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              L'assistant connait le module {HELP_CONTENT[currentModule]?.title || currentModule}
            </p>
            <div className="flex flex-wrap gap-1.5 justify-center mt-4">
              {['Comment creer un projet ?', 'Aide avec les permissions', 'Expliquer le workflow'].map(q => (
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
                          <ArrowRight size={12} />
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

      {/* Input area */}
      <div className="border-t border-border bg-muted/20 p-3 shrink-0 space-y-2">
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
            placeholder="Votre question..."
            className="gl-form-input text-sm flex-1 min-h-[36px] max-h-[100px] resize-y"
            rows={1}
            disabled={streaming}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="gl-button-sm gl-button-confirm h-9 w-9 flex items-center justify-center shrink-0"
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
  const help = HELP_CONTENT[currentModule]

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
      {!help ? (
        <div className="text-sm text-muted-foreground">Aucune aide disponible pour cette page.</div>
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
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Workflows</h4>
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
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Astuces</h4>
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
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      const rect = el.getBoundingClientRect()
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

  // Render spotlight overlay when a tour is active and target is found
  const spotlightOverlay = activeTour && targetRect ? (
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
                  Etape {currentStep + 1} / {activeTour.steps.length} — {activeTour.steps[currentStep].title}
                </p>
              </div>
              <button onClick={closeTour} className="text-[10px] text-muted-foreground hover:text-foreground">
                Quitter
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mb-2">
          Visites guidees interactives avec spotlight sur les elements de la page.
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
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{tour.steps.length} etapes</p>
                </div>
                {isActive ? (
                  <button onClick={closeTour} className="gl-button-sm gl-button-default shrink-0 flex items-center gap-1 text-red-500">
                    <StopCircle size={10} /> Arreter
                  </button>
                ) : (
                  <button
                    onClick={() => startTour(tour)}
                    className="gl-button-sm gl-button-default shrink-0 flex items-center gap-1"
                  >
                    <Play size={10} /> {isCompleted ? 'Revoir' : 'Demarrer'}
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
// TAB 4: ALERTS / NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function AlertsTab({ navigate }: { navigate: (path: string) => void }) {
  const queryClient = useQueryClient()

  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/api/v1/notifications/unread-count').then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<{ items: Notification[] }>('/api/v1/notifications', { params: { page_size: 30 } }).then(r => r.data),
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: () => api.post('/api/v1/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = notificationsData?.items ?? []

  const CATEGORY_COLORS: Record<string, string> = {
    info: 'bg-blue-500', warning: 'bg-amber-500', error: 'bg-red-500',
    success: 'bg-green-500', workflow: 'bg-violet-500', system: 'bg-gray-500',
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "a l'instant"
    if (mins < 60) return `${mins}min`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}j`
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with mark all */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10 shrink-0">
        <span className="text-xs text-muted-foreground">
          {(unreadCount?.count ?? 0) > 0
            ? `${unreadCount.count} non lue(s)`
            : 'Tout est lu'}
        </span>
        {(unreadCount?.count ?? 0) > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            className="text-[10px] text-primary hover:underline flex items-center gap-1"
          >
            <CheckCheck size={10} /> Tout lire
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="text-center py-8">
            <Inbox size={24} className="mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Aucune notification</p>
          </div>
        )}

        {notifications.map(n => (
          <div
            key={n.id}
            className={cn(
              'px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer',
              !n.read && 'bg-primary/5',
            )}
            onClick={() => {
              if (!n.read) markRead.mutate(n.id)
              if (n.link) navigate(n.link)
            }}
          >
            <div className="flex items-start gap-2.5">
              <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', CATEGORY_COLORS[n.category] || 'bg-gray-500')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm truncate', n.read ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                    {n.title}
                  </p>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                </div>
                {n.body && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                )}
              </div>
              {n.link && <ExternalLink size={10} className="text-muted-foreground/50 mt-1.5 shrink-0" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: QUICK TICKET
// ═══════════════════════════════════════════════════════════════

const TICKET_TYPE_OPTIONS: { value: TicketType; label: string; icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'improvement', label: 'Amelioration', icon: Lightbulb },
  { value: 'question', label: 'Question', icon: HelpCircle },
]

function TicketTab() {
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
  const fileRef = useRef<HTMLInputElement>(null)

  // Screenshot capture
  const captureScreenshot = useCallback(async () => {
    setCapturing(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, { useCORS: true, scale: 0.5, logging: false })
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' })
          setAttachments(prev => [...prev, file])
          setPreviews(prev => [...prev, { name: file.name, url: URL.createObjectURL(blob), type: 'image' }])
        }
        setCapturing(false)
      }, 'image/png')
    } catch {
      toast({ title: "Capture d'ecran impossible", variant: 'error' })
      setCapturing(false)
    }
  }, [toast])

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

      // Upload attachments
      for (const file of attachments) {
        try {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('owner_type', 'support_ticket')
          fd.append('owner_id', ticket.id)
          fd.append('description', file.type.startsWith('image/') ? "Capture d'ecran" : 'Piece jointe')
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* non-blocking */ }
      }

      toast({ title: 'Ticket cree !', description: `Ref: ${ticket.reference}`, variant: 'success' })
      setForm({ title: '', description: '', ticket_type: 'bug', priority: 'medium' })
      setAttachments([])
      setPreviews([])
    } catch {
      toast({ title: "Erreur lors de l'envoi", variant: 'error' })
    }
  }, [form, createTicket, toast, attachments])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
            {opt.label}
          </button>
        ))}
      </div>

      {/* Title */}
      <input
        className={cn('gl-form-input text-sm w-full', form.title.trim().length > 0 && form.title.trim().length < 10 && 'border-orange-400')}
        placeholder="Titre clair et precis (min. 10 car.)..."
        value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })}
      />

      {/* Description */}
      <textarea
        className="gl-form-input text-sm w-full min-h-[80px] resize-y"
        placeholder={form.ticket_type === 'bug' ? 'Decrivez: que faisiez-vous ? que s\'est-il passe ? (min. 20 car.)' : 'Decrivez votre demande...'}
        value={form.description || ''}
        onChange={e => setForm({ ...form, description: e.target.value })}
      />

      {/* Priority */}
      <select
        className="gl-form-select text-xs h-7 w-full"
        value={form.priority}
        onChange={e => setForm({ ...form, priority: e.target.value as TicketCreate['priority'] })}
      >
        <option value="low">Priorite basse</option>
        <option value="medium">Priorite moyenne</option>
        <option value="high">Priorite haute</option>
        <option value="critical">Critique</option>
      </select>

      {/* Media buttons */}
      <div className="flex items-center gap-1.5">
        <button onClick={captureScreenshot} disabled={capturing} className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]">
          {capturing ? <Loader2 size={10} className="animate-spin" /> : <Camera size={10} />} Photo
        </button>
        <button onClick={() => fileRef.current?.click()} className="gl-button-sm gl-button-default flex-1 justify-center text-[10px]">
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
          || (form.ticket_type === 'bug' && (form.description || '').trim().length < 20)
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
