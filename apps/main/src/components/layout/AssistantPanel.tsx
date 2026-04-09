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
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/stores/uiStore'
import { usePermission } from '@/hooks/usePermission'
import { useToast } from '@/components/ui/Toast'
import { useCreateTicket } from '@/hooks/useSupport'
import api from '@/lib/api'
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
    description: "Avis de sejour, gestion des passagers, conformite, rotations et listes d'attente.",
    workflows: [
      { title: 'Soumettre un Avis de Sejour', steps: ['Cliquez "+ Nouvel AdS"', 'Choisissez le type', 'Selectionnez le site, dates, categorie', 'Ajoutez les passagers', 'Verifiez la conformite', 'Cliquez "Soumettre"'],
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
  target?: string // CSS selector or data-help-id
  title: string
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
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
      { title: 'Navigation', content: 'La barre laterale vous permet de naviguer entre les modules. Cliquez sur les icones pour acceder aux differentes sections.' },
      { title: 'Barre superieure', content: 'Ici vous trouverez la recherche globale, les notifications, les preferences de langue et de theme.' },
      { title: 'Panels dynamiques', content: 'Quand vous selectionnez un element, un panel de detail s\'ouvre sur le cote. Vous pouvez le detacher en fenetre flottante.' },
      { title: 'Assistant', content: 'Ce panel que vous lisez est l\'assistant OpsFlux. Il vous accompagne avec de l\'aide contextuelle, un chatbot IA, des visites guidees et la creation rapide de tickets.' },
    ],
  },
  {
    id: 'projets-basics',
    title: 'Premiers pas avec les Projets',
    description: 'Apprenez a creer et gerer vos projets.',
    module: 'projets',
    steps: [
      { title: 'Vue liste', content: 'La page Projets affiche tous vos projets. Utilisez les filtres et le tri pour trouver rapidement un projet.' },
      { title: 'Creer un projet', content: 'Cliquez sur "+ Nouveau projet" pour ouvrir le formulaire de creation. Renseignez le nom, code, dates et budget.' },
      { title: 'Vues multiples', content: 'Basculez entre la vue Liste, Kanban, Gantt et Tableur avec les onglets en haut de la page.' },
      { title: 'Gestion des taches', content: 'Dans un projet, ajoutez des taches, definissez les dependances et suivez l\'avancement avec le Gantt.' },
    ],
  },
  {
    id: 'paxlog-basics',
    title: 'Premiers pas avec PaxLog',
    description: 'Gestion des avis de sejour et passagers.',
    module: 'paxlog',
    steps: [
      { title: 'Avis de sejour', content: 'Un AdS est une demande de deplacement de passagers vers un site. Chaque AdS passe par un workflow de validation.' },
      { title: 'Conformite', content: 'Le systeme verifie automatiquement que chaque passager possede les certifications et habilitations requises.' },
      { title: 'Rotations', content: 'Les rotations planifient le transport physique des passagers vers les sites.' },
    ],
  },
  {
    id: 'users-rbac',
    title: 'Gestion des droits d\'acces',
    description: 'Comprendre le systeme RBAC d\'OpsFlux.',
    module: 'users',
    steps: [
      { title: 'Roles', content: 'Un role est un ensemble de permissions. Creez des roles adaptes a chaque metier (operateur, manager, admin, etc.).' },
      { title: 'Groupes', content: 'Les groupes rassemblent des utilisateurs. Assignez un role au groupe pour appliquer les permissions a tous ses membres.' },
      { title: 'Overrides', content: 'Vous pouvez surcharger les permissions au niveau du groupe ou de l\'utilisateur pour des cas specifiques.' },
    ],
  },
]

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

  return (
    <aside
      className={cn(
        'fixed top-0 right-0 z-50 h-full flex flex-col',
        'w-[360px] max-w-[90vw]',
        'bg-background/95 backdrop-blur-sm border-l border-border shadow-lg',
        'animate-in slide-in-from-right duration-200',
      )}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles size={14} className="text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground leading-tight">OpsFlux Assistant</h2>
            <span className="text-[10px] text-muted-foreground">Module: {HELP_CONTENT[currentModule]?.title || currentModule}</span>
          </div>
        </div>
        <button
          onClick={toggleAIPanel}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Fermer l'assistant"
        >
          <X size={14} />
        </button>
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
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

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
      const baseUrl = import.meta.env.VITE_API_URL || ''

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

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'content') {
              accumulatedText += data.text
              setStreamingText(accumulatedText)
            } else if (data.type === 'error') {
              throw new Error(data.message)
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue
            throw e
          }
        }
      }

      if (accumulatedText) {
        setMessages(prev => [...prev, { role: 'assistant', content: accumulatedText, timestamp: Date.now() }])
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      const errMsg = e.message || 'Erreur de communication avec l\'IA'
      setMessages(prev => [...prev, { role: 'assistant', content: `\u26A0\uFE0F ${errMsg}`, timestamp: Date.now() }])
    } finally {
      setStreamingText('')
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, messages, streaming, currentModule])

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
            <div className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 text-foreground border border-border',
            )}>
              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
            </div>
          </div>
        ))}

        {streaming && streamingText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed bg-muted/50 text-foreground border border-border">
              <p className="whitespace-pre-wrap break-words">{streamingText}</p>
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

  // Completed tours stored in localStorage
  const [completedTours, setCompletedTours] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('opsflux:completed-tours') || '[]')
    } catch { return [] }
  })

  const markCompleted = useCallback((tourId: string) => {
    setCompletedTours(prev => {
      const next = [...new Set([...prev, tourId])]
      localStorage.setItem('opsflux:completed-tours', JSON.stringify(next))
      return next
    })
  }, [])

  // Filter tours: global ones + module-specific
  const availableTours = useMemo(() =>
    GUIDED_TOURS.filter(t => t.module === null || t.module === currentModule),
    [currentModule],
  )

  const startTour = useCallback((tour: GuidedTour) => {
    setActiveTour(tour)
    setCurrentStep(0)
  }, [])

  const nextStep = useCallback(() => {
    if (!activeTour) return
    if (currentStep < activeTour.steps.length - 1) {
      setCurrentStep(s => s + 1)
    } else {
      markCompleted(activeTour.id)
      setActiveTour(null)
      setCurrentStep(0)
    }
  }, [activeTour, currentStep, markCompleted])

  const prevStep = useCallback(() => {
    setCurrentStep(s => Math.max(0, s - 1))
  }, [])

  // Tour execution view
  if (activeTour) {
    const step = activeTour.steps[currentStep]
    const isLast = currentStep === activeTour.steps.length - 1
    return (
      <div className="flex-1 flex flex-col">
        {/* Tour header */}
        <div className="px-4 py-3 border-b border-border bg-primary/5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">{activeTour.title}</h4>
            <button onClick={() => { setActiveTour(null); setCurrentStep(0) }} className="text-xs text-muted-foreground hover:text-foreground">
              Quitter
            </button>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {activeTour.steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  i <= currentStep ? 'bg-primary' : 'bg-border',
                )}
              />
            ))}
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            Etape {currentStep + 1} / {activeTour.steps.length}
          </span>
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">
              {currentStep + 1}
            </div>
            <h5 className="text-sm font-semibold text-foreground">{step.title}</h5>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 shrink-0">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className="gl-button-sm gl-button-default disabled:opacity-30"
          >
            Precedent
          </button>
          <button
            onClick={nextStep}
            className="gl-button-sm gl-button-confirm flex items-center gap-1"
          >
            {isLast ? (
              <><CheckCircle2 size={12} /> Terminer</>
            ) : (
              <><ArrowRight size={12} /> Suivant</>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Tour list view
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        Visites guidees interactives pour vous aider a demarrer.
      </p>

      {availableTours.length === 0 && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <Map size={24} className="mx-auto mb-2 text-muted-foreground/30" />
          Aucune visite disponible pour ce module.
        </div>
      )}

      {availableTours.map(tour => {
        const isCompleted = completedTours.includes(tour.id)
        return (
          <div key={tour.id} className="border border-border rounded-lg p-3 hover:bg-muted/30 transition-colors">
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
              <button
                onClick={() => startTour(tour)}
                className="gl-button-sm gl-button-default shrink-0 flex items-center gap-1"
              >
                <Play size={10} /> {isCompleted ? 'Revoir' : 'Demarrer'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
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
