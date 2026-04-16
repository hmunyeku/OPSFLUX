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
    description: "Vue d'ensemble de vos opérations. Les widgets affichent les KPIs en temps réel de tous les modules.",
    workflows: [{ title: 'Personnaliser le dashboard', steps: ['Cliquez sur "Modifier" en haut à droite', 'Glissez-déposez les widgets', 'Cliquez "+" pour ajouter un widget', 'Configurez via l\'icône \u2699\uFE0F', 'Cliquez "Terminer"'] }],
    tips: ['Chaque module a son propre dashboard', 'Les données se rafraîchissent toutes les 5 minutes'],
    elementHelp: {},
  },
  users: {
    title: 'Comptes utilisateurs', icon: '\u{1F465}',
    description: "Gestion des comptes, rôles, groupes et permissions. Contrôle d'accès centralisé (RBAC).",
    workflows: [
      { title: 'Créer un utilisateur', steps: ['Cliquez "+ Nouvel utilisateur"', 'Renseignez nom, prénom, email', "Choisissez l'entité et le rôle", 'Le mot de passe temporaire est envoyé par email'] },
      { title: 'Gérer les permissions', steps: ['Cliquez sur un utilisateur', 'Allez dans l\'onglet "Permissions"', 'Cliquez sur les cellules pour accorder ou retirer', 'Les permissions héritées sont indiquées par un badge'],
        diagram: `graph TD\n    A["Utilisateur"]:::user --> B["Groupe"]:::group\n    B --> C["Rôle"]:::role\n    C --> D["Permissions de base"]:::perm\n    B --> E["Overrides groupe"]:::override\n    A --> F["Overrides utilisateur"]:::override\n    D --> G["Permissions effectives"]:::effective\n    E --> G\n    F --> G\n    classDef user fill:#8b5cf6,stroke:#a78bfa,color:#fff\n    classDef group fill:#06b6d4,stroke:#22d3ee,color:#fff\n    classDef role fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef perm fill:#475569,stroke:#64748b,color:#fff\n    classDef override fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef effective fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: ['Un utilisateur peut appartenir à plusieurs groupes', 'Les overrides utilisateur priment sur les permissions du groupe/rôle'],
    elementHelp: {},
  },
  projets: {
    title: 'Projets — Gestion de projets', icon: '\u{1F4C1}',
    description: 'Module complet de gestion de projets pour les opérations Oil & Gas. Il comprend un diagramme de Gantt interactif avec gestion des dépendances entre tâches (FS, FF, SS, SF), un tableur pour l\'édition en masse, une vue Kanban par statut, et un système de calcul d\'avancement pondérable (effort, durée, poids manuel ou égal). Les projets sont rattachés à un site/installation et peuvent être importés depuis Gouti. Chaque projet supporte les jalons, les sous-tâches, les pièces jointes, les commentaires et le suivi budgétaire.',
    workflows: [
      { title: 'Créer un projet', steps: ['Cliquez "+ Nouveau projet"', 'Renseignez le nom, code, dates, budget', 'Affectez un site/asset et un chef de projet', "Ajoutez des tâches dans l'onglet Planning"],
        diagram: `graph LR\n    A["Planifié"]:::planned --> B["Actif"]:::active\n    B --> C["Terminé"]:::done\n    B --> D["Annulé"]:::cancelled\n    classDef planned fill:#475569,stroke:#64748b,color:#fff\n    classDef active fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef done fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      { title: "Suivre l'avancement", steps: ['Le Gantt montre la timeline', "Double-cliquez une tâche pour l'éditer", "Le % d'avancement se met à jour automatiquement", "Le Tableur permet l'édition en masse"],
        diagram: `graph LR\n    A["À faire"]:::todo --> B["En cours"]:::progress\n    B --> C["Revue"]:::review\n    C --> D["Terminé"]:::done\n    C -->|Corrections| B\n    classDef todo fill:#475569,stroke:#64748b,color:#fff\n    classDef progress fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef review fill:#eab308,stroke:#facc15,color:#000\n    classDef done fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: ['Utilisez le Kanban pour un suivi par statut', 'Les dépendances sont visibles dans le Gantt', 'Le mode Poids manuel est recommandé quand toutes les tâches n\'ont pas le même impact business', 'Sync Gouti permet d\'importer des projets avec rafraîchissement auto'],
    elementHelp: {
      'projets.create': 'Crée un nouveau projet. Le code projet doit être unique au sein de l\'entité (ex: WO-EBO-2026-001 pour Workover Ebome).',
      'projets.gantt.toggle': 'Bascule entre les vues Gantt, Tableur et Kanban du projet. Chaque vue partage les mêmes données.',
      'projets.tasks.create': 'Ajoute une tâche au projet. Disponible en sous-tâche d\'une tâche existante (hiérarchie WBS jusqu\'à 5 niveaux).',
      'projets.task.dependency': 'Crée une dépendance entre tâches. FS = Fin-Début, SS = Début-Début, FF = Fin-Fin, SF = Début-Fin.',
      'projets.task.progress': 'Pourcentage d\'avancement de la tâche (0-100). Met à jour automatiquement l\'avancement projet selon le mode de pondération configuré.',
      'projets.milestone.create': 'Ajoute un jalon (milestone) — point clé sans durée. Visualisé en losange dans le Gantt et peut déclencher des notifications.',
      'projets.progress.mode': 'Mode de calcul d\'avancement projet. Effort = pondéré par charge homme-jours. Durée = pondéré par durée calendaire. Poids manuel = vous saisissez le poids. Égal = toutes les tâches comptent pareil.',
      'projets.gouti.sync': 'Synchronise le projet avec Gouti. Importe la WBS, les dates, dépendances et avancement. Sync unidirectionnelle (Gouti -> OpsFlux).',
      'projets.export.gantt': 'Exporte le Gantt en PDF haute résolution. Choisissez le format papier (A4/A3/A2), orientation et options.',
      'projets.budget.tracker': 'Suivi budgétaire — compare les coûts engagés au budget prévisionnel. Alerte automatique si dépassement > 10%.',
      'projets.kanban.column': 'Colonne du Kanban représentant un statut. Glissez-déposez les tâches pour changer leur statut.',
      'projets.critical.path': 'Chemin critique — séquence de tâches déterminant la durée totale du projet. Tout retard sur ces tâches retarde le projet entier.',
    },
  },
  paxlog: {
    title: 'PaxLog — Gestion des passagers', icon: '\u2708\uFE0F',
    description: "Module central de gestion des avis de séjour (AdS) et du suivi des passagers (PAX). Il couvre l'ensemble du cycle de vie d'une demande de déplacement : création de l'AdS avec destination et dates, ajout des passagers avec vérification de conformité (certifications, habilitations), soumission pour validation hiérarchique, puis suivi en temps réel du séjour. Le module intègre également la gestion des incidents PAX, la liste d'attente POB, les rotations de personnel et le portail externe pour les sous-traitants.",
    workflows: [
      { title: 'Soumettre un avis de séjour (AdS)', steps: ['Cliquez "+ Nouvel AdS" dans l\'onglet "Avis de séjour"', 'Choisissez le type (Individuel ou Équipe) et sélectionnez le site d\'entrée', 'Renseignez la catégorie de visite (Maintenance, Projet, Inspection...), les dates et l\'objet', 'Ajoutez les passagers : créez un nouveau profil ou attachez un contact existant du module Tiers', 'Vérifiez la conformité de chaque PAX — les certifications manquantes ou expirées sont signalées en rouge', 'Une fois tous les checks verts, cliquez "Soumettre" — l\'AdS entre dans le workflow de validation'],
        diagram: `graph TD\n    A["Brouillon"]:::draft -->|Soumettre| B["Soumis"]:::submitted\n    B --> C{"Conformité"}\n    C -->|OK| D["En validation"]:::validation\n    C -->|Issues| E["Bloqué"]:::blocked\n    D -->|Approuver| F["Approuvé"]:::approved\n    D -->|Rejeter| G["Rejeté"]:::rejected\n    F -->|Démarrer| H["En cours"]:::progress\n    H -->|Terminer| I["Terminé"]:::done\n    classDef draft fill:#475569,stroke:#64748b,color:#fff\n    classDef submitted fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef validation fill:#8b5cf6,stroke:#a78bfa,color:#fff\n    classDef blocked fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef approved fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef rejected fill:#ef4444,stroke:#f87171,color:#fff\n    classDef progress fill:#06b6d4,stroke:#22d3ee,color:#fff\n    classDef done fill:#10b981,stroke:#34d399,color:#fff`,
      },
    ],
    tips: ['La conformité est vérifiée automatiquement pour chaque PAX — les certifications HUET/BOSIET manquantes ou expirées bloquent la soumission', 'Un PAX non conforme doit régulariser ses documents avant que l\'AdS puisse avancer dans le workflow', 'Le lien externe permet aux sous-traitants de remplir les informations PAX sans accès à OpsFlux', 'La liste d\'attente POB gère les situations de dépassement de capacité sur un site', 'Les signalements permettent de remonter des incidents liés à un PAX (comportement, sécurité, interdiction)', 'L\'onglet Rotations affiche le planning des rotations de personnel par site'],
    elementHelp: {
      'paxlog.ads.create': 'Crée un nouvel avis de séjour. Le type Individuel ne contient qu\'un seul PAX, le type Équipe regroupe plusieurs PAX partageant les mêmes dates et destination.',
      'paxlog.ads.status.draft': 'Brouillon — l\'AdS peut être modifié librement. Il n\'est pas encore soumis au workflow et ne consomme pas de quota POB.',
      'paxlog.ads.status.submitted': 'Soumis — l\'AdS est entré dans le workflow. La conformité est vérifiée automatiquement et les approbateurs sont notifiés.',
      'paxlog.ads.status.approved': 'Approuvé — toutes les validations sont OK. L\'AdS peut être attaché à un voyage TravelWiz et les PAX entrent au POB à l\'arrivée.',
      'paxlog.ads.status.rejected': 'Rejeté — un validateur a refusé. Consultez les commentaires pour comprendre le motif et créer un nouvel AdS corrigé si nécessaire.',
      'paxlog.ads.submit': 'Soumet l\'AdS au workflow. Bloqué tant que des PAX sont non conformes (sauf dérogation accordée).',
      'paxlog.ads.compliance': 'Indicateur de conformité agrégé pour tous les PAX. Vert = OK, Orange = avertissement non bloquant, Rouge = soumission impossible.',
      'paxlog.pax.add': 'Ajoute un passager à l\'AdS. Vous pouvez créer une fiche ou rattacher un contact existant du module Tiers.',
      'paxlog.pax.compliance.badge': 'Statut conformité du PAX. Cliquez pour voir le détail des certifications, leur date d\'expiration et l\'historique.',
      'paxlog.pob.counter': 'Population on Board actuelle vs capacité maximale du site. Cliquez pour voir la décomposition par entreprise et catégorie.',
      'paxlog.waitlist.promote': 'Promeut un AdS en attente vers le statut Approuvé dès qu\'une place POB se libère. Respect du FIFO ou de la priorité opérationnelle.',
      'paxlog.external.link': 'Génère une URL signée à durée limitée pour qu\'un sous-traitant remplisse les fiches PAX sans accès complet à OpsFlux.',
      'paxlog.rotation.calendar': 'Vue calendrier des rotations de personnel par site. Affiche les arrivées/départs prévus et le solde POB jour par jour.',
    },
  },
  planner: {
    title: 'Planner — Planification opérationnelle', icon: '\u{1F4C5}',
    description: 'Module de planification opérationnelle des activités sur les installations. Il permet de visualiser et gérer le plan d\'occupation des sites via un Gantt interactif, de détecter automatiquement les conflits de capacité (quand le nombre de PAX prévu dépasse la capacité d\'un site), de résoudre ces conflits via un système d\'arbitrage, et de simuler des scénarios what-if pour comparer différentes organisations avant de les appliquer. Le module est connecté aux Projets (chaque activité peut être rattachée à un projet) et à PaxLog (les quotas PAX impactent le calcul POB).',
    workflows: [
      { title: 'Créer une activité', steps: ['Cliquez "+ Nouvelle activité" dans la barre d\'outils ou via le menu contextuel du Gantt', 'Sélectionnez le site/installation cible dans le picker d\'assets (hiérarchie arborescente)', 'Choisissez le type d\'activité (Projet, Maintenance, Workover, Forage, Inspection, Événement)', 'Définissez les dates de début et fin, et le quota PAX prévu', 'Rattachez optionnellement un projet existant et/ou un centre de coûts pour l\'imputation', 'L\'activité apparaît immédiatement dans le Gantt — les conflits éventuels sont détectés en temps réel'] },
      { title: 'Résoudre un conflit de capacité', steps: ['Les conflits apparaissent dans l\'onglet "Conflits" avec un compteur rouge dans la tab bar', 'Cliquez sur un conflit pour voir les activités concernées et le dépassement de capacité', 'Trois options de résolution : décaler une activité dans le temps, réduire le quota PAX, ou annuler', 'Le directeur des opérations (DO) peut forcer la priorité d\'une activité critique via l\'action "Forcer"', 'Validez la résolution — les activités sont mises à jour et le conflit passe en "Résolu"'],
        diagram: `graph TD\n    A["Activité A"]:::act --> C{"Conflit capacité"}\n    B["Activité B"]:::act --> C\n    C -->|Décaler| D["Reportée"]:::resolved\n    C -->|Réduire| E["Ajustée"]:::resolved\n    C -->|Annuler| F["Annulée"]:::cancelled\n    classDef act fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef resolved fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      { title: 'Comparer des scénarios', steps: ['Cliquez "Nouveau scénario"', 'Modifiez les activités sans affecter le réel', 'Comparez les scénarios côte à côte', 'Appliquez le scénario retenu'] },
    ],
    tips: ['Les conflits de capacité sont détectés automatiquement dès qu\'une activité est créée ou modifiée — le Planner compare le total PAX prévu avec la capacité POB du site', 'Les scénarios what-if permettent de tester des modifications sans affecter le plan réel — créez un scénario, ajoutez/modifiez des activités, simulez l\'impact, puis promouvez le scénario si valide', 'La vue Capacité affiche un heatmap du taux de remplissage par site et par jour — les zones rouges indiquent un dépassement', 'Les signaux de révision alertent quand une activité validée a été modifiée après approbation', 'Les prévisions (Forecast) montrent la tendance du plan de charge sur les prochaines semaines avec un calendrier heatmap'],
    elementHelp: {
      'planner.activity.create': 'Crée une nouvelle activité opérationnelle (Workover, maintenance, projet, inspection). Détecte les conflits POB en temps réel.',
      'planner.activity.type.workover': 'Workover — intervention lourde sur un puits. Bloque automatiquement les autres opérations sur le même puits et consomme un quota PAX élevé.',
      'planner.activity.type.maintenance': 'Maintenance — intervention planifiée sur équipement. N\'arrête pas la production mais consomme du POB.',
      'planner.activity.type.audit': 'Audit/Inspection — visite réglementaire ou interne. Quota PAX faible mais priorité élevée si lié à une certification.',
      'planner.gantt.toolbar': 'Barre d\'outils du Gantt. Filtres par site/type, zoom temporel, bascule entre plan réel et scénario.',
      'planner.conflict.badge': 'Compteur de conflits de capacité actifs. Cliquez pour ouvrir la liste détaillée avec impact POB et options de résolution.',
      'planner.conflict.severity.critical': 'Conflit CRITICAL — dépassement majeur du POB nécessitant un arbitrage DO. Bloque la validation des AdS associés.',
      'planner.scenario.new': 'Crée un scénario what-if en dupliquant le plan réel. Permet de tester des modifications sans impact opérationnel.',
      'planner.scenario.compare': 'Compare jusqu\'à 3 scénarios côte à côte sur les KPIs clés (POB, conflits, coûts, jalons impactés).',
      'planner.scenario.apply': 'Applique le scénario sélectionné au plan réel. Action atomique avec rollback possible depuis l\'historique.',
      'planner.priority.force': 'Forcer priorité DO — réservé aux directeurs. Réorganise automatiquement les autres activités pour libérer la capacité.',
      'planner.capacity.heatmap': 'Heatmap de capacité par site et par jour. Rouge = dépassement POB, Orange = saturation imminente, Vert = capacité disponible.',
    },
  },
  tiers: {
    title: 'Tiers', icon: '\u{1F3E2}',
    description: 'Annuaire des entreprises partenaires, fournisseurs, sous-traitants et leurs contacts.',
    workflows: [
      { title: 'Ajouter une entreprise', steps: ['Cliquez "+ Nouveau tiers"', 'Renseignez la raison sociale, SIRET, type', 'Ajoutez les contacts', "Liez l'entreprise aux utilisateurs concernés"] },
      { title: 'Gérer les contacts', steps: ['Ouvrez la fiche d\'un tiers', 'Onglet "Contacts" > "+ Nouveau contact"', 'Renseignez nom, fonction, email, téléphone', 'Le contact peut être utilisé comme PAX'] },
      { title: 'Transférer un contact', steps: ['Ouvrez la fiche du contact', 'Cliquez "Transférer"', 'Sélectionnez le nouveau tiers', "L'historique est conservé"] },
    ],
    tips: ['Un tiers peut être fournisseur ET sous-traitant', 'Les contacts tiers sont utilisés comme PAX externes dans PaxLog', 'Le blocage d\'un tiers empêche les nouveaux AdS pour ses contacts'],
    elementHelp: {},
  },
  conformite: {
    title: 'Conformité', icon: '\u2705',
    description: 'Gestion des certifications, habilitations, formations obligatoires et audits.',
    workflows: [
      { title: "Vérifier la conformité d'un PAX", steps: ['Onglet Vérifications', 'Recherchez le PAX', 'Consultez ses certifications', 'Les expirations sont en rouge'],
        diagram: `graph TD\n    A["Règles site"]:::rule --> D{"Vérification"}\n    B["Profil / Habilitations"]:::rule --> D\n    C["Auto-déclarations"]:::rule --> D\n    D -->|Tout OK| E["Conforme"]:::ok\n    D -->|Manquant| F["Non conforme"]:::nok\n    D -->|Expiré| G["Expiré"]:::expired\n    classDef rule fill:#475569,stroke:#64748b,color:#fff\n    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef nok fill:#f59e0b,stroke:#fbbf24,color:#000\n    classDef expired fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      { title: 'Configurer les règles', steps: ['Onglet "Règles" > "+ Nouvelle règle"', 'Sélectionnez le type de site', 'Définissez les certifications requises', 'Configurez les délais de validité'] },
      { title: 'Enregistrer une certification', steps: ['Ouvrez le profil du PAX', 'Onglet "Conformité"', '"+Ajouter une certification"', 'Sélectionnez type et validité', 'Joignez le justificatif'] },
    ],
    tips: ['Les règles sont configurables par type de site', 'Le score de conformité est calculé automatiquement', 'Alertes d\'expiration envoyées 30 jours avant l\'échéance'],
    elementHelp: {},
  },
  travelwiz: {
    title: 'TravelWiz — Transport & Logistique', icon: '\u{1F681}',
    description: 'Module de gestion du transport aérien (hélicoptère) et maritime (bateau) entre les bases logistiques et les installations offshore. Il couvre la planification des voyages, la génération des manifestes passagers et fret (avec vérification automatique du poids vs capacité du vecteur), le suivi en temps réel de la flotte sur carte, les conditions météo par site, et la gestion de la maintenance des vecteurs. Le portail capitaine permet au commandant de bord de gérer le voyage directement depuis le terrain.',
    workflows: [
      { title: 'Créer un voyage', steps: ['Cliquez "+ Nouveau voyage"', 'Sélectionnez le vecteur', "Définissez l'itinéraire et les escales", 'Renseignez date et horaires', 'Le voyage apparaît dans le planning'] },
      { title: 'Générer un manifeste', steps: ['Ouvrez un voyage valide', 'Cliquez "Générer manifeste"', 'Les PAX des AdS approuvés sont listés', 'Vérifiez les poids', 'Validez pour impression'],
        diagram: `graph LR\n    A["AdS Approuvés"]:::input --> B["Manifeste"]:::manifest\n    B --> C{"Poids"}\n    C -->|OK| D["Validé"]:::ok\n    C -->|Dépassé| E["Surcharge"]:::warn\n    classDef input fill:#475569,stroke:#64748b,color:#fff\n    classDef manifest fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef warn fill:#f59e0b,stroke:#fbbf24,color:#000`,
      },
      { title: 'Gérer la flotte', steps: ['Onglet "Flotte"', 'Ajoutez un vecteur (type, immatriculation, capacité)', 'Définissez les périodes de maintenance', 'Consultez la disponibilité'] },
    ],
    tips: ['Le manifeste calcule le poids total (PAX + bagages + fret) vs MTOW — bloque la validation si dépassement', 'Vecteurs en maintenance (planifiée ou non) exclus automatiquement du picker de planification', 'Conditions météo (vent, houle, plafond, visibilité) vérifiées avant chaque vol', 'Portail capitaine fonctionne en mode dégradé hors ligne avec sync au retour réseau', 'Pickups multi-sites optimisés automatiquement (ordre des escales selon coordonnées GPS)'],
    elementHelp: {
      'travelwiz.voyage.create': 'Crée un nouveau voyage. Sélectionnez le vecteur, l\'itinéraire avec escales et la date — le système réserve la disponibilité.',
      'travelwiz.voyage.status.planned': 'Planifié — le voyage est créé et le vecteur réservé. Pas encore de manifeste valide ni d\'embarquement commencé.',
      'travelwiz.voyage.status.boarding': 'Embarquement — le manifeste est valide et les PAX sont en cours de pointage à l\'embarquement.',
      'travelwiz.voyage.status.intransit': 'En transit — le vecteur est parti (ATD saisi). Suivi GPS actif et tracking des escales en temps réel.',
      'travelwiz.voyage.status.completed': 'Terminé — le vecteur est arrivé à destination finale (ATA saisi). Manifeste archivé et rapport de vol soumis.',
      'travelwiz.manifest.generate': 'Génère le manifeste PAX et fret depuis les AdS approuvés. Vérifie automatiquement le poids vs MTOW du vecteur.',
      'travelwiz.manifest.weight.warning': 'Alerte de surcharge — le poids total dépasse la MTOW. Bloque la validation jusqu\'à correction.',
      'travelwiz.vector.maintenance': 'Période de maintenance du vecteur. Bloque automatiquement toute planification de voyage sur cette plage.',
      'travelwiz.vector.gps.live': 'Position GPS temps réel du vecteur (actualisée toutes les 60s). Affiche aussi la trace des dernières heures.',
      'travelwiz.weather.check': 'Vérification automatique des conditions météo avant validation. Alerte si limite vecteur dépassée.',
      'travelwiz.captain.portal.url': 'URL dédiée au portail capitaine — auth simplifiée mobile/tablette, mode dégradé hors ligne avec sync au retour réseau.',
      'travelwiz.pickup.multisite': 'Voyage avec pickup sur plusieurs sites. L\'ordre des escales est optimisé automatiquement selon les coordonnées GPS.',
      'travelwiz.incident.report': 'Signale un incident vecteur (panne, météo, médical) — déclenche la recherche d\'un vecteur de substitution.',
    },
  },
  packlog: {
    title: 'PackLog', icon: '\u{1F4E6}',
    description: 'Gestion des articles, lettres de transport (LT), cargos et suivi des expeditions offshore.',
    workflows: [
      { title: 'Créer une lettre de transport', steps: ['Cliquez "+ Nouvelle LT"', "Sélectionnez expéditeur et destinataire", 'Ajoutez les articles (référence, quantité, poids)', 'Affectez un voyage TravelWiz', 'Validez la LT'] },
      { title: 'Suivre un cargo', steps: ['Onglet "Cargos"', 'Filtrez par statut', 'Cliquez pour voir le détail', "L'historique des mouvements est tracé"],
        diagram: `graph LR\n    A["Préparation"]:::prep --> B["En transit"]:::transit\n    B --> C["Réceptionné"]:::received\n    C --> D["Livré"]:::delivered\n    classDef prep fill:#475569,stroke:#64748b,color:#fff\n    classDef transit fill:#3b82f6,stroke:#60a5fa,color:#fff\n    classDef received fill:#8b5cf6,stroke:#a78bfa,color:#fff\n    classDef delivered fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: ['Articles liés au catalogue centralisé — référence unique, photo, dimensions, poids, classe HAZMAT', 'Poids total calculé automatiquement à partir des articles et conditionnement', 'LT liées aux voyages TravelWiz pour la traçabilité complète', 'Alertes en cas de retard de livraison ou écart à la réception', 'Matières HAZMAT exigent FDS, classification IMDG/IATA, numéro UN', 'Scan QR à chaque transition assure la traçabilité bout-en-bout'],
    elementHelp: {
      'packlog.lt.create': 'Crée une nouvelle Lettre de Transport. Sélectionnez expéditeur, destinataire, articles depuis le catalogue et voyage TravelWiz.',
      'packlog.lt.status.draft': 'Brouillon — la LT est en cours de saisie. Articles modifiables, pas encore de cargo physique constitué.',
      'packlog.lt.status.validated': 'Validée — le BL est généré et signé. Le cargo passe automatiquement en statut Préparation en base.',
      'packlog.article.catalog': 'Picker catalogue articles — recherche par référence, désignation, code-barres ou catégorie. Affiche stock, poids et HAZMAT.',
      'packlog.article.hazmat': 'Article matière dangereuse — exige classe IMDG/IATA, numéro UN, groupe d\'emballage et FDS jointe.',
      'packlog.cargo.status.preparation': 'Préparation — le cargo est en cours de constitution physique en base. Pointage articles vs LT, pesée et marquage.',
      'packlog.cargo.status.transit': 'En transit — le cargo est embarqué sur le vecteur. Position GPS = celle du vecteur, ETA mise à jour en continu.',
      'packlog.cargo.status.received': 'Réceptionné — le cargo est arrivé sur site et confirmé par le destinataire (intact / endommagé / manquants).',
      'packlog.cargo.status.delivered': 'Livré — signature électronique du destinataire final. Cargo clos, LT marquée Livrée, historique archivé.',
      'packlog.cargo.qr.scan': 'Scan QR du cargo à chaque transition. Horodatage, opérateur et photo capturés pour la traçabilité bout-en-bout.',
      'packlog.cargo.weight.total': 'Poids total du cargo calculé automatiquement (somme articles + conditionnement). Vérifié vs capacité fret du vecteur.',
      'packlog.hazmat.declaration': 'Déclaration expéditeur OACI (aérien) ou IMO (maritime) générée automatiquement pour les cargos HAZMAT.',
    },
  },
  imputations: {
    title: 'Imputations', icon: '\u{1F4B0}',
    description: 'Ventilation des coûts par centre de coûts, projet, activité et entité. Suivi budgétaire.',
    workflows: [
      { title: 'Imputer un coût', steps: ['Cliquez "+ Nouvelle imputation"', 'Sélectionnez la référence (projet, activité, voyage)', 'Choisissez le centre de coûts', 'Renseignez montant et devise', "Validez l'imputation"] },
      { title: 'Suivi budgétaire', steps: ['Onglet "Suivi budgétaire"', 'Filtrez par période, projet ou centre de coûts', 'Consultez budget consommé vs alloué', 'Exportez en PDF ou Excel'] },
    ],
    tips: ['Imputations liées automatiquement aux projets et activités', 'Détection des dépassements budgétaires', 'Centres de coûts configurés dans les paramètres', 'Export analytique pour rapprochement comptable'],
    elementHelp: {},
  },
  papyrus: {
    title: 'Papyrus', icon: '\u{1F4C4}',
    description: 'Stockage, classement, versionning et partage des documents. Modeles et generation PDF.',
    workflows: [
      { title: 'Déposer un document', steps: ['Cliquez "+ Nouveau document" ou glissez-déposez', 'Choisissez catégorie et classeur', 'Ajoutez des tags', "Définissez les droits d'accès", 'Le document est indexé immédiatement'] },
      { title: 'Générer depuis un modèle', steps: ['Onglet "Modèles"', 'Sélectionnez un modèle', 'Données pré-remplies depuis le contexte', 'Complétez les champs manuels', 'Générez le PDF final'] },
    ],
    tips: ['Recherche plein texte dans les PDF et documents Office', 'Versions précédentes conservées', 'Documents liables à tout objet (projet, AdS, tiers)', 'Modèles PDF personnalisables dans les paramètres'],
    elementHelp: {},
  },
  workflows: {
    title: 'Workflows', icon: '\u{1F504}',
    description: 'Conception et exécution des workflows de validation. Éditeur visuel, versioning et délégation.',
    workflows: [
      { title: 'Créer un workflow', steps: ['Cliquez "+ Nouveau workflow"', "Nommez et choisissez l'objet cible", 'Éditeur drag-and-drop pour les étapes', 'Configurez les conditions de transition', 'Définissez les approbateurs', 'Publiez (nouvelle version créée)'],
        diagram: `graph TD\n    A["Conception"]:::design --> B["Test"]:::test\n    B --> C["Publication"]:::published\n    C --> D["Nouvelle version"]:::version\n    D --> B\n    classDef design fill:#475569,stroke:#64748b,color:#fff\n    classDef test fill:#eab308,stroke:#facc15,color:#000\n    classDef published fill:#22c55e,stroke:#4ade80,color:#fff\n    classDef version fill:#3b82f6,stroke:#60a5fa,color:#fff`,
      },
      { title: 'Déléguer une approbation', steps: ['Ouvrez vos tâches en attente', 'Cliquez "Déléguer"', 'Sélectionnez le délégataire', 'Définissez la durée (optionnel)', 'Le délégataire est notifié'] },
    ],
    tips: ['Chaque publication crée une nouvelle version', 'La délégation est tracée dans l\'audit trail', 'Notifications automatiques à chaque changement d\'étape'],
    elementHelp: {},
  },
  assets: {
    title: 'Assets', icon: '\u{1F3ED}',
    description: 'Hiérarchie des sites, installations, équipements et zones. Capacités et géolocalisation.',
    workflows: [
      { title: 'Naviguer dans la hiérarchie', steps: ['Sélectionnez un site dans l\'arborescence', 'Consultez détails, capacités et équipements', 'Recherche par nom ou code'] },
      { title: 'Configurer les capacités', steps: ['Sélectionnez l\'asset', 'Onglet "Capacités"', 'Modifiez les limites (PAX, poids)', 'Chaque modification crée un nouvel enregistrement historisé'] },
    ],
    tips: ['Hiérarchie configurable par tenant', 'Capacités utilisées par le Planner pour détecter les conflits', 'Carte avec tous les assets géolocalisés', 'Chaque asset peut avoir des règles de conformité spécifiques'],
    elementHelp: {},
  },
  entites: {
    title: 'Entites', icon: '\u{1F310}',
    description: 'Administration des entités (filiales, pays, divisions). Isolation des données opérationnelles.',
    workflows: [
      { title: 'Configurer une entité', steps: ['Sélectionnez l\'entité', 'Renseignez informations légales et adresse', 'Configurez départements et BU', 'Définissez devise et fuseau horaire', 'Affectez les utilisateurs'] },
    ],
    tips: ['Un utilisateur peut être dans plusieurs entités', 'Changement d\'entité via le sélecteur en haut de page', 'Données strictement isolées entre entités', 'Paramètres globaux du tenant s\'appliquent sauf override'],
    elementHelp: {},
  },
  support: {
    title: 'Support', icon: '\u{1F3AB}',
    description: 'Tickets de support, signalements de bugs, annonces et communication.',
    workflows: [{ title: 'Signaler un bug', steps: ['Cliquez le bouton assistant', 'Allez dans l\'onglet Ticket', 'Choisissez "Bug"', 'Décrivez le problème', "Ajoutez une capture d'écran"] }],
    tips: ['Les captures masquent automatiquement le widget', "L'enregistrement vidéo montre les étapes de reproduction"],
    elementHelp: {},
  },
  settings: {
    title: 'Parametres', icon: '\u2699\uFE0F',
    description: "Configuration du profil, de l'application, des intégrations et des modules.",
    workflows: [], tips: ['Les modèles PDF permettent de personnaliser les exports', 'La délégation permet de confier ses droits à un collègue'],
    elementHelp: {},
  },
}

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
    description: 'Découvrez les fonctionnalités principales de la plateforme.',
    module: null,
    steps: [
      { target: 'sidebar', title: 'Navigation', content: 'La barre latérale vous permet de naviguer entre les modules. Cliquez sur les icônes pour accéder aux différentes sections.' },
      { target: 'topbar', title: 'Barre supérieure', content: 'Recherche globale, notifications, préférences de langue et de thème sont accessibles ici.' },
      { target: 'search-bar', title: 'Recherche', content: 'Tapez pour filtrer la page en cours, ou utilisez Ctrl+K pour la palette de commandes.' },
      { target: 'main-content', title: 'Zone principale', content: 'Les pages affichent leur contenu ici. Quand vous sélectionnez un élément, un panel de détail s\'ouvre sur le côté.' },
      { target: 'assistant-button', title: 'Assistant', content: 'Ce bouton ouvre l\'assistant OpsFlux : aide contextuelle, chatbot IA, visites guidées et tickets.' },
    ],
  },
  {
    id: 'projets-basics',
    title: 'Premiers pas avec les Projets',
    description: 'Apprenez à créer et gérer vos projets.',
    module: 'projets',
    steps: [
      { target: 'main-content', title: 'Vue liste', content: 'La page Projets affiche tous vos projets. Utilisez les filtres et le tri pour trouver rapidement un projet.' },
      { target: 'search-bar', title: 'Recherche projets', content: 'Tapez le nom ou code d\'un projet pour le filtrer instantanément.' },
      { target: 'sidebar', title: 'Modules liés', content: 'Le Planner et les Imputations dans la sidebar sont liés à vos projets pour la planification et le suivi des coûts.' },
    ],
  },
  {
    id: 'paxlog-basics',
    title: 'Premiers pas avec PaxLog',
    description: 'Gestion des avis de séjour et passagers.',
    module: 'paxlog',
    steps: [
      { target: 'main-content', title: 'Avis de séjour', content: 'Un AdS est une demande de déplacement de passagers vers un site. Chaque AdS passe par un workflow de validation.' },
      { target: 'search-bar', title: 'Recherche PAX', content: 'Recherchez un passager, un site ou un numéro d\'AdS pour le retrouver rapidement.' },
    ],
  },
  {
    id: 'users-rbac',
    title: 'Gestion des droits d\'accès',
    description: 'Comprendre le système RBAC d\'OpsFlux.',
    module: 'users',
    steps: [
      { target: 'main-content', title: 'Liste des utilisateurs', content: 'Tous les comptes utilisateurs sont affichés ici. Cliquez sur un utilisateur pour voir ses détails et permissions.' },
      { target: 'sidebar', title: 'Modules admin', content: 'Les modules Comptes, Entités et Paramètres en bas de la sidebar contiennent les outils d\'administration.' },
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
  const modeLabel = panelMode === 'docked' ? 'Docké (clic: flottant)' : panelMode === 'floating' ? 'Flottant (clic: compact)' : 'Compact (clic: docké)'
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
            <p className="text-sm text-muted-foreground">Posez une question sur OpsFlux</p>
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
                  <button onClick={closeTour} className="gl-button-sm gl-button-default shrink-0 flex items-center gap-1 text-red-500">
                    <StopCircle size={10} /> Arreter
                  </button>
                ) : (
                  <button
                    onClick={() => startTour(tour)}
                    className="gl-button-sm gl-button-default shrink-0 flex items-center gap-1"
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
    if (mins < 1) return "à l'instant"
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
  { value: 'improvement', label: 'Amélioration', icon: Lightbulb },
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
      toast({ title: "Capture d'écran impossible", variant: 'error' })
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
          fd.append('description', file.type.startsWith('image/') ? "Capture d'écran" : 'Pièce jointe')
          await api.post('/api/v1/attachments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        } catch { /* non-blocking */ }
      }

      toast({ title: 'Ticket créé !', description: `Ref: ${ticket.reference}`, variant: 'success' })
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
        placeholder="Titre clair et précis (min. 10 car.)..."
        value={form.title}
        onChange={e => setForm({ ...form, title: e.target.value })}
      />

      {/* Description */}
      <textarea
        className="gl-form-input text-sm w-full min-h-[80px] resize-y"
        placeholder={form.ticket_type === 'bug' ? 'Décrivez: que faisiez-vous ? que s\'est-il passé ? (min. 20 car.)' : 'Décrivez votre demande...'}
        value={form.description || ''}
        onChange={e => setForm({ ...form, description: e.target.value })}
      />

      {/* Priority */}
      <select
        className="gl-form-select text-xs h-7 w-full"
        value={form.priority}
        onChange={e => setForm({ ...form, priority: e.target.value as TicketCreate['priority'] })}
      >
        <option value="low">Priorité basse</option>
        <option value="medium">Priorité moyenne</option>
        <option value="high">Priorité haute</option>
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
