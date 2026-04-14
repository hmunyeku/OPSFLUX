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

// ── Help content types ──────────────────────────────────────

interface WorkflowHelp {
  title: string
  steps: string[]
  diagram?: string // Mermaid flowchart string
  requiredPermission?: string
  requiredAnyPermissions?: string[]
}

interface ModuleHelp {
  title: string
  icon: string
  description: string
  workflows: WorkflowHelp[]
  tips: string[]
  elementHelp: Record<string, string>
}

// ── Help content registry ───────────────────────────────────

const HELP_CONTENT: Record<string, ModuleHelp> = {
  dashboard: {
    title: 'Tableau de bord',
    icon: '\u{1F4CA}',
    description:
      "Vue d'ensemble de vos operations. Les widgets affichent les KPIs en temps reel de tous les modules.",
    workflows: [
      {
        title: 'Personnaliser le dashboard',
        requiredAnyPermissions: ['dashboard.customize', 'dashboard.admin'],
        steps: [
          'Cliquez sur "Modifier" en haut a droite',
          'Glissez-deposez les widgets pour les reorganiser',
          'Cliquez "+" pour ajouter un widget depuis le catalogue',
          'Configurez chaque widget via son icone \u2699\uFE0F',
          'Cliquez "Terminer" pour sauvegarder',
        ],
      },
    ],
    tips: [
      'Chaque module a son propre dashboard avec des widgets specifiques',
      'Les donnees se rafraichissent automatiquement toutes les 5 minutes',
    ],
    elementHelp: {},
  },
  users: {
    title: 'Comptes utilisateurs',
    icon: '\u{1F465}',
    description:
      "Gestion des comptes, roles, groupes et permissions. Controle d'acces centralise (RBAC).",
    workflows: [
      {
        title: 'Creer un utilisateur',
        requiredAnyPermissions: ['user.create', 'core.users.manage'],
        steps: [
          'Cliquez "+ Nouvel utilisateur"',
          'Renseignez nom, prenom, email',
          "Choisissez l'entite et le role",
          'Le mot de passe temporaire est envoye par email',
        ],
      },
      {
        title: 'Gerer les permissions',
        requiredAnyPermissions: ['core.rbac.manage', 'admin.rbac'],
        steps: [
          'Cliquez sur un utilisateur dans la liste',
          'Allez dans l\'onglet "Permissions"',
          'Cliquez sur les cellules \u2713/\u2717 pour accorder ou retirer',
          'Les permissions heritees du role/groupe sont indiquees par un badge',
        ],
        diagram: `graph TD
    A["\u{1F464} Utilisateur"]:::user --> B["\u{1F465} Groupe"]:::group
    B --> C["\u{1F6E1}\uFE0F R\u00f4le"]:::role
    C --> D["\u{1F511} Permissions de base"]:::perm
    B --> E["\u2699\uFE0F Overrides groupe"]:::override
    A --> F["\u26A1 Overrides utilisateur"]:::override
    D --> G["\u2705 Permissions effectives"]:::effective
    E --> G
    F --> G

    classDef user fill:#8b5cf6,stroke:#a78bfa,color:#fff
    classDef group fill:#06b6d4,stroke:#22d3ee,color:#fff
    classDef role fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef perm fill:#475569,stroke:#64748b,color:#fff
    classDef override fill:#f59e0b,stroke:#fbbf24,color:#000
    classDef effective fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
      {
        title: 'Affecter un role via un groupe',
        requiredAnyPermissions: ['core.rbac.manage', 'admin.rbac'],
        steps: [
          'Allez dans l\'onglet "Groupes"',
          'Creez un groupe ou selectionnez un existant',
          'Ajoutez des membres au groupe',
          'Le role du groupe est automatiquement applique aux membres',
        ],
      },
    ],
    tips: [
      'Un utilisateur peut appartenir a plusieurs groupes',
      'Les overrides utilisateur priment sur les permissions du groupe/role',
      'Le role SUPER_ADMIN ne peut pas etre supprime',
    ],
    elementHelp: {},
  },
  projets: {
    title: 'Gestion de projets',
    icon: '\u{1F4C1}',
    description:
      'Planification et suivi des projets : taches, jalons, Gantt, budget, equipe.',
    workflows: [
      {
        title: 'Creer un projet',
        requiredPermission: 'project.create',
        steps: [
          'Cliquez "+ Nouveau projet"',
          'Renseignez le nom, code, dates, budget',
          'Affectez un site/asset et un chef de projet',
          "Ajoutez des taches dans l'onglet Planning",
        ],
        diagram: `graph LR
    A["\u{1F4CB} Planifi\u00e9"]:::planned --> B["\u{1F504} Actif"]:::active
    B --> C["\u2705 Termin\u00e9"]:::done
    B --> D["\u274C Annul\u00e9"]:::cancelled

    classDef planned fill:#475569,stroke:#64748b,color:#fff
    classDef active fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef done fill:#22c55e,stroke:#4ade80,color:#fff
    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: "Suivre l'avancement",
        requiredPermission: 'project.read',
        steps: [
          'Le Gantt montre la timeline des taches',
          "Double-cliquez une tache pour l'editer",
          "Le % d'avancement se met a jour automatiquement",
          "Le Tableur permet l'edition en masse",
        ],
        diagram: `graph LR
    A["\u{1F4DD} \u00C0 faire"]:::todo --> B["\u{1F504} En cours"]:::progress
    B --> C["\u{1F441}\uFE0F Revue"]:::review
    C --> D["\u2705 Termin\u00e9"]:::done
    C -->|Corrections| B

    classDef todo fill:#475569,stroke:#64748b,color:#fff
    classDef progress fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef review fill:#eab308,stroke:#facc15,color:#000
    classDef done fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: [
      'Utilisez le Kanban pour un suivi par statut (glisser-deposer)',
      "Sync Gouti permet d'importer des projets depuis Gouti",
      'Les dependances entre taches sont visibles dans le Gantt',
    ],
    elementHelp: {},
  },
  paxlog: {
    title: 'PaxLog — Gestion des passagers',
    icon: '\u2708\uFE0F',
    description:
      "Avis de séjour (AdS), gestion des passagers, conformité, rotations et listes d'attente.",
    workflows: [
      {
        title: 'Soumettre un avis de séjour (AdS)',
        requiredAnyPermissions: ['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.submit', 'paxlog.ads.update'],
        steps: [
          'Cliquez "+ Nouvel AdS" dans l\'onglet Avis de séjour',
          'Choisissez le type (individuel ou equipe)',
          'Selectionnez le site, les dates, la categorie de visite',
          'Ajoutez les passagers (PAX)',
          'Verifiez la conformite dans la checklist',
          'Cliquez "Soumettre" quand tout est vert',
        ],
      },
      {
        title: 'Parcours de validation AdS',
        requiredAnyPermissions: ['paxlog.ads.approve', 'paxlog.ads.read'],
        steps: [
          'Brouillon \u2192 Soumis',
          'Controle conformite automatique',
          'Validation par le responsable projet',
          'Validation finale par le coordinateur',
          'Approuve \u2192 Mouvement possible',
        ],
        diagram: `graph TD
    A["\u{1F4DD} Brouillon"]:::draft --> |Soumettre| B["\u{1F4E4} Soumis"]:::submitted
    B --> C{"\u{1F50D} Conformit\u00e9"}
    C -->|OK| D["\u2705 En validation"]:::validation
    C -->|Issues| E["\u26A0\uFE0F Bloqu\u00e9"]:::blocked
    D -->|Approuver| F["\u{1F7E2} Approuv\u00e9"]:::approved
    D -->|Rejeter| G["\u{1F534} Rejet\u00e9"]:::rejected
    D -->|Escalader| H["\u2696\uFE0F Arbitrage"]:::arbitration
    F -->|D\u00e9marrer| I["\u{1F504} En cours"]:::progress
    I -->|Terminer| J["\u2714\uFE0F Termin\u00e9"]:::done

    classDef draft fill:#475569,stroke:#64748b,color:#fff
    classDef submitted fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef validation fill:#8b5cf6,stroke:#a78bfa,color:#fff
    classDef blocked fill:#f59e0b,stroke:#fbbf24,color:#000
    classDef approved fill:#22c55e,stroke:#4ade80,color:#fff
    classDef rejected fill:#ef4444,stroke:#f87171,color:#fff
    classDef arbitration fill:#f97316,stroke:#fb923c,color:#fff
    classDef progress fill:#06b6d4,stroke:#22d3ee,color:#fff
    classDef done fill:#10b981,stroke:#34d399,color:#fff`,
      },
    ],
    tips: [
      "Si la capacite site n'est pas configuree, l'AdS passe en mode illimite par defaut",
      'La conformité vérifie les certifications et habilitations de chaque PAX',
      'Un PAX bloque doit regulariser sa situation avant le mouvement',
    ],
    elementHelp: {},
  },
  planner: {
    title: 'Planner — Planification des activites',
    icon: '\u{1F4C5}',
    description:
      'Planification des activites sur les assets, gestion des capacites, detection des conflits et scenarios de planification.',
    workflows: [
      {
        title: 'Creer une activite',
        requiredAnyPermissions: ['planner.activity.create', 'planner.activity.read'],
        steps: [
          'Cliquez "+ Nouvelle activite"',
          "Choisissez l'asset, les dates, le type",
          'Definissez le quota PAX necessaire',
          'Rattachez un projet ou un centre de couts',
          "L'activite apparait dans le Gantt Planner",
        ],
      },
      {
        title: 'Resoudre un conflit de capacite',
        requiredAnyPermissions: ['planner.conflict.resolve', 'planner.conflict.read'],
        steps: [
          'Les conflits sont signales par une icone rouge dans le Gantt',
          'Cliquez sur le conflit pour voir les details',
          'Choisissez une resolution : decaler, reduire ou annuler une activite',
          'Validez la resolution pour mettre a jour le planning',
        ],
        diagram: `graph TD
    A["\u{1F4C5} Activit\u00e9 A"]:::act --> C{"\u26A0\uFE0F Conflit capacit\u00e9"}
    B["\u{1F4C5} Activit\u00e9 B"]:::act --> C
    C -->|D\u00e9caler| D["\u{1F504} Report\u00e9e"]:::resolved
    C -->|R\u00e9duire| E["\u2702\uFE0F Ajust\u00e9e"]:::resolved
    C -->|Annuler| F["\u274C Annul\u00e9e"]:::cancelled

    classDef act fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef resolved fill:#22c55e,stroke:#4ade80,color:#fff
    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: 'Comparer des scenarios',
        requiredAnyPermissions: ['planner.scenario.create', 'planner.scenario.read'],
        steps: [
          'Cliquez "Nouveau scenario" pour dupliquer le planning actuel',
          'Modifiez les activites dans le scenario sans affecter le reel',
          'Comparez cote a cote les scenarios (capacite, couts, conflits)',
          'Appliquez le scenario retenu pour le rendre officiel',
        ],
      },
    ],
    tips: [
      'Le Gantt Planner montre toutes les activites par asset',
      'Les conflits de capacite sont detectes automatiquement',
      'Les scenarios permettent de comparer differentes planifications',
      'La vue capacite affiche le taux de remplissage de chaque asset',
    ],
    elementHelp: {},
  },
  tiers: {
    title: 'Tiers — Entreprises & Contacts',
    icon: '\u{1F3E2}',
    description:
      'Annuaire des entreprises partenaires, fournisseurs, sous-traitants et leurs contacts. Portail externe pour les tiers.',
    workflows: [
      {
        title: 'Ajouter une entreprise',
        requiredAnyPermissions: ['tier.create', 'tier.read'],
        steps: [
          'Cliquez "+ Nouveau tiers"',
          'Renseignez la raison sociale, SIRET, type',
          'Ajoutez les contacts (personnes)',
          "Liez l'entreprise aux utilisateurs concernes",
        ],
      },
      {
        title: 'Gerer les contacts',
        requiredAnyPermissions: ['tier.contact.create', 'tier.contact.read'],
        steps: [
          'Ouvrez la fiche d\'un tiers',
          'Allez dans l\'onglet "Contacts"',
          'Cliquez "+ Nouveau contact"',
          'Renseignez nom, prenom, fonction, email, telephone',
          'Le contact peut etre utilise comme PAX dans PaxLog',
        ],
      },
      {
        title: 'Transferer un contact entre entreprises',
        requiredAnyPermissions: ['tier.contact.transfer', 'tier.contact.update'],
        steps: [
          'Ouvrez la fiche du contact',
          'Cliquez "Transferer"',
          'Selectionnez le nouveau tiers de rattachement',
          "L'historique des affectations est conserve",
        ],
      },
    ],
    tips: [
      'Un tiers peut etre fournisseur ET sous-traitant (types multiples)',
      'Les contacts tiers sont utilises comme PAX externes dans PaxLog',
      'Le portail externe permet aux tiers de soumettre des documents directement',
      'Le blocage d\'un tiers empeche la creation de nouveaux AdS pour ses contacts',
    ],
    elementHelp: {},
  },
  conformite: {
    title: 'Conformite',
    icon: '\u2705',
    description:
      'Gestion des certifications, habilitations, formations obligatoires et audits. Verification automatique avant chaque deplacement.',
    workflows: [
      {
        title: "Verifier la conformite d'un PAX",
        requiredAnyPermissions: ['conformite.verify', 'conformite.record.read'],
        steps: [
          'Allez dans l\'onglet Verifications',
          'Recherchez le PAX par nom',
          'Consultez ses certifications et leur statut',
          'Les expirations sont signalees en rouge',
        ],
        diagram: `graph TD
    A["\u{1F4CB} R\u00e8gles site"]:::rule --> D{"\u{1F50D} V\u00e9rification"}
    B["\u{1F393} Profil / Habilitations"]:::rule --> D
    C["\u{1F4DD} Auto-d\u00e9clarations"]:::rule --> D
    D -->|Tout OK| E["\u2705 Conforme"]:::ok
    D -->|Manquant| F["\u26A0\uFE0F Non conforme"]:::nok
    D -->|Expir\u00e9| G["\u{1F534} Expir\u00e9"]:::expired

    classDef rule fill:#475569,stroke:#64748b,color:#fff
    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff
    classDef nok fill:#f59e0b,stroke:#fbbf24,color:#000
    classDef expired fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: 'Configurer les regles de conformite',
        requiredAnyPermissions: ['conformite.rule.create', 'conformite.admin'],
        steps: [
          'Allez dans l\'onglet "Regles"',
          'Cliquez "+ Nouvelle regle"',
          'Selectionnez le type de site ou de visite',
          'Definissez les certifications requises',
          'Configurez les delais de validite',
          'La regle s\'applique immediatement aux nouvelles verifications',
        ],
      },
      {
        title: 'Enregistrer une certification',
        requiredAnyPermissions: ['conformite.record.create', 'conformite.record.update'],
        steps: [
          'Ouvrez le profil du PAX concerne',
          'Allez dans l\'onglet "Conformite"',
          'Cliquez "+ Ajouter une certification"',
          'Selectionnez le type et la date de validite',
          'Joignez le justificatif (scan, PDF)',
          'La certification est prise en compte dans les verifications',
        ],
      },
    ],
    tips: [
      'Les regles de conformite sont configurables par type de site',
      'Le score de conformite est calcule automatiquement',
      'Les alertes d\'expiration sont envoyees 30 jours avant l\'echeance',
      'La conformite est verifiee automatiquement lors de la soumission d\'un AdS',
    ],
    elementHelp: {},
  },
  assets: {
    title: 'Registre des assets',
    icon: '\u{1F3ED}',
    description:
      "Hierarchie des installations, sites, equipements et zones. Configuration des capacites et regles d'acces.",
    workflows: [
      {
        title: 'Naviguer dans la hierarchie',
        requiredAnyPermissions: ['asset.read'],
        steps: [
          "Selectionnez un site ou une installation dans l'arborescence a gauche",
          'Consultez les details, capacites et equipements dans le panneau principal',
          'Utilisez la recherche pour trouver un asset par nom ou code',
        ],
      },
      {
        title: 'Configurer les capacites',
        requiredAnyPermissions: ['asset.update', 'asset.capacity.manage'],
        steps: [
          "Selectionnez l'asset dans l'arborescence",
          'Allez dans l\'onglet "Capacites"',
          'Ajoutez ou modifiez les limites (PAX, poids, etc.)',
          'Les capacites sont historisees (chaque modification cree un nouvel enregistrement)',
        ],
      },
    ],
    tips: [
      "La hierarchie est configurable par tenant (niveaux personnalisables)",
      "Les capacites sont utilisees par le Planner pour detecter les conflits",
      "Chaque asset peut avoir des regles de conformite specifiques",
    ],
    elementHelp: {},
  },
  travelwiz: {
    title: 'TravelWiz — Voyages & Transport',
    icon: '\u{1F681}',
    description:
      'Gestion des voyages helicoptere et bateau, manifestes passagers/fret, suivi des vecteurs et conditions meteo.',
    workflows: [
      {
        title: 'Creer un voyage',
        requiredAnyPermissions: ['travelwiz.voyage.create', 'travelwiz.voyage.read'],
        steps: [
          'Cliquez "+ Nouveau voyage"',
          "Selectionnez le vecteur (helicoptere, bateau, vehicule)",
          "Definissez l'itineraire (depart, escales, arrivee)",
          "Renseignez la date et les horaires prevus",
          "Le voyage apparait dans le planning transport",
        ],
      },
      {
        title: 'Generer un manifeste',
        requiredAnyPermissions: ['travelwiz.manifest.create', 'travelwiz.manifest.read'],
        steps: [
          'Ouvrez un voyage valide',
          'Cliquez "Generer manifeste"',
          'Les passagers des AdS approuves sont automatiquement listes',
          'Verifiez les poids bagages et le fret',
          'Validez le manifeste pour impression ou envoi',
        ],
        diagram: `graph LR
    A["\u{1F4CB} AdS Approuv\u00e9s"]:::input --> B["\u{1F4E6} Manifeste"]:::manifest
    B --> C{"\u2696\uFE0F Poids"}
    C -->|OK| D["\u2705 Valid\u00e9"]:::ok
    C -->|D\u00e9pass\u00e9| E["\u26A0\uFE0F Surcharge"]:::warn

    classDef input fill:#475569,stroke:#64748b,color:#fff
    classDef manifest fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff
    classDef warn fill:#f59e0b,stroke:#fbbf24,color:#000`,
      },
      {
        title: 'Gerer la flotte',
        requiredAnyPermissions: ['travelwiz.vector.create', 'travelwiz.vector.read'],
        steps: [
          'Allez dans l\'onglet "Flotte"',
          'Ajoutez un vecteur (type, immatriculation, capacite)',
          'Definissez les periodes de maintenance',
          'Consultez la disponibilite dans le calendrier',
        ],
      },
    ],
    tips: [
      'Le suivi en temps reel affiche la position GPS des vecteurs actifs',
      'Le manifeste calcule le poids total (PAX + bagages + fret) vs la capacite',
      'Les vecteurs en maintenance sont automatiquement exclus de la planification',
      'Le portail capitaine permet au capitaine de gerer le voyage depuis le terrain',
      'Les conditions meteo sont verifiees automatiquement avant chaque vol',
    ],
    elementHelp: {},
  },
  packlog: {
    title: 'PackLog — Logistique Cargo',
    icon: '\u{1F4E6}',
    description:
      'Gestion des articles, lettres de transport (LT), cargos et suivi des expeditions pour les operations offshore.',
    workflows: [
      {
        title: 'Creer une lettre de transport',
        requiredAnyPermissions: ['packlog.lt.create', 'packlog.lt.read'],
        steps: [
          'Cliquez "+ Nouvelle LT"',
          "Selectionnez l'expediteur et le destinataire",
          'Ajoutez les articles (reference, quantite, poids)',
          'Affectez un voyage TravelWiz pour le transport',
          'Validez la LT pour expedition',
        ],
      },
      {
        title: 'Suivre un cargo',
        requiredAnyPermissions: ['packlog.cargo.read', 'packlog.cargo.track'],
        steps: [
          'Ouvrez l\'onglet "Cargos"',
          'Filtrez par statut (en preparation, en transit, livre)',
          'Cliquez sur un cargo pour voir le detail',
          "L'historique des mouvements est trace automatiquement",
        ],
        diagram: `graph LR
    A["\u{1F4E6} Pr\u00e9paration"]:::prep --> B["\u{1F69A} En transit"]:::transit
    B --> C["\u{1F4E5} R\u00e9ceptionn\u00e9"]:::received
    C --> D["\u2705 Livr\u00e9"]:::delivered

    classDef prep fill:#475569,stroke:#64748b,color:#fff
    classDef transit fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef received fill:#8b5cf6,stroke:#a78bfa,color:#fff
    classDef delivered fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
    ],
    tips: [
      "Les articles sont lies au catalogue centralise de l'entite",
      'Le poids total du cargo est calcule automatiquement a partir des articles',
      'Les LT sont liees aux voyages TravelWiz pour la tracabilite complete',
      'Les alertes notifient automatiquement en cas de retard de livraison',
    ],
    elementHelp: {},
  },
  imputations: {
    title: 'Imputations — Allocation des couts',
    icon: '\u{1F4B0}',
    description:
      'Ventilation des couts par centre de couts, projet, activite et entite. Suivi budgetaire et analytique.',
    workflows: [
      {
        title: 'Imputer un cout',
        requiredAnyPermissions: ['imputation.create', 'imputation.read'],
        steps: [
          'Cliquez "+ Nouvelle imputation"',
          'Selectionnez la reference (projet, activite, voyage)',
          'Choisissez le centre de couts',
          'Renseignez le montant et la devise',
          'Ajoutez une justification si necessaire',
          "Validez l'imputation",
        ],
      },
      {
        title: 'Consulter le suivi budgetaire',
        requiredAnyPermissions: ['imputation.report.read', 'imputation.read'],
        steps: [
          'Allez dans l\'onglet "Suivi budgetaire"',
          'Filtrez par periode, projet ou centre de couts',
          'Les indicateurs montrent le budget consomme vs alloue',
          'Exportez le rapport en PDF ou Excel',
        ],
      },
    ],
    tips: [
      'Les imputations sont liees automatiquement aux projets et activites Planner',
      'Le systeme detecte les depassements budgetaires et envoie des alertes',
      "Les centres de couts sont configures dans les parametres de l'entite",
      "L'export analytique permet le rapprochement comptable",
    ],
    elementHelp: {},
  },
  papyrus: {
    title: 'Papyrus — Gestion documentaire',
    icon: '\u{1F4C4}',
    description:
      'Stockage, classement, versionning et partage des documents. Modeles de documents et generation PDF.',
    workflows: [
      {
        title: 'Deposer un document',
        requiredAnyPermissions: ['papyrus.document.create', 'papyrus.document.upload'],
        steps: [
          'Cliquez "+ Nouveau document" ou glissez-deposez un fichier',
          'Choisissez la categorie et le classeur',
          'Ajoutez des tags pour faciliter la recherche',
          "Definissez les droits d'acces (public, restreint, confidentiel)",
          'Le document est indexe et disponible immediatement',
        ],
      },
      {
        title: 'Generer un document depuis un modele',
        requiredAnyPermissions: ['papyrus.template.use', 'papyrus.document.create'],
        steps: [
          'Allez dans l\'onglet "Modeles"',
          'Selectionnez un modele (rapport, formulaire, certificat)',
          'Les donnees sont pre-remplies depuis le contexte',
          'Completez les champs manuels',
          'Generez le PDF final',
        ],
      },
    ],
    tips: [
      'La recherche plein texte fonctionne sur le contenu des PDF et documents Office',
      'Les versions precedentes sont conservees et consultables',
      "Les documents peuvent etre lies a n'importe quel objet (projet, AdS, tiers)",
      'Les modeles PDF sont personnalisables dans les parametres',
    ],
    elementHelp: {},
  },
  workflows: {
    title: 'Workflows — Moteur de processus',
    icon: '\u{1F504}',
    description:
      "Conception et execution des workflows de validation. Editeur visuel drag-and-drop, versioning et delegation.",
    workflows: [
      {
        title: 'Creer un workflow',
        requiredAnyPermissions: ['workflow.design', 'workflow.admin'],
        steps: [
          'Cliquez "+ Nouveau workflow"',
          "Nommez le workflow et choisissez l'objet cible (AdS, projet, etc.)",
          "Utilisez l'editeur drag-and-drop pour ajouter les etapes",
          'Configurez les conditions de transition',
          'Definissez les approbateurs pour chaque etape',
          'Publiez le workflow (une nouvelle version est creee)',
        ],
        diagram: `graph TD
    A["\u{1F4DD} Conception"]:::design --> B["\u{1F50D} Test"]:::test
    B --> C["\u2705 Publication"]:::published
    C --> D["\u{1F504} Nouvelle version"]:::version
    D --> B

    classDef design fill:#475569,stroke:#64748b,color:#fff
    classDef test fill:#eab308,stroke:#facc15,color:#000
    classDef published fill:#22c55e,stroke:#4ade80,color:#fff
    classDef version fill:#3b82f6,stroke:#60a5fa,color:#fff`,
      },
      {
        title: 'Deleguer une approbation',
        requiredAnyPermissions: ['workflow.delegate', 'workflow.approve'],
        steps: [
          'Ouvrez vos taches en attente',
          'Cliquez "Deleguer" sur la tache concernee',
          'Selectionnez le collegue delegataire',
          'Definissez la duree de la delegation (optionnel)',
          'Le delegataire recoit une notification',
        ],
      },
    ],
    tips: [
      "Chaque publication cree une nouvelle version, les instances en cours restent sur l'ancienne",
      "La delegation est tracee dans l'audit trail",
      'Les conditions de transition peuvent inclure des regles metier complexes',
      "Les notifications sont envoyees automatiquement a chaque changement d'etape",
    ],
    elementHelp: {},
  },
  entites: {
    title: 'Entites — Gestion des filiales',
    icon: '\u{1F310}',
    description:
      'Administration des entites (filiales, pays, divisions). Chaque entite isole ses donnees operationnelles.',
    workflows: [
      {
        title: 'Configurer une entite',
        requiredAnyPermissions: ['entity.manage', 'entity.admin'],
        steps: [
          "Selectionnez l'entite dans la liste",
          "Renseignez les informations legales et l'adresse",
          'Configurez les departements et BU',
          'Definissez les parametres specifiques (devise, fuseau horaire)',
          "Affectez les utilisateurs a l'entite",
        ],
      },
    ],
    tips: [
      'Un utilisateur peut etre affecte a plusieurs entites',
      "Le changement d'entite active se fait via le selecteur en haut de page",
      'Les donnees sont strictement isolees entre entites (filtrage par entity_id)',
      "Les parametres globaux du tenant s'appliquent a toutes les entites sauf override",
    ],
    elementHelp: {},
  },
  support: {
    title: 'Support & Feedback',
    icon: '\u{1F3AB}',
    description:
      'Tickets de support, signalements de bugs, annonces et communication.',
    workflows: [
      {
        title: 'Signaler un bug',
        requiredPermission: 'support.ticket.create',
        steps: [
          'Cliquez le bouton \u{1F4AC} en bas a droite',
          'Choisissez "Bug"',
          'Decrivez le probleme (min. 20 caracteres)',
          "Ajoutez une capture d'ecran si possible",
          'Le log console est automatiquement joint',
        ],
      },
    ],
    tips: [
      "Les captures d'ecran masquent automatiquement le widget feedback",
      "L'enregistrement video permet de montrer les etapes de reproduction",
    ],
    elementHelp: {},
  },
  settings: {
    title: 'Parametres',
    icon: '\u2699\uFE0F',
    description:
      "Configuration du profil, de l'application, des integrations et des modules.",
    workflows: [],
    tips: [
      'Les modeles PDF permettent de personnaliser les exports',
      "Les modeles d'emails sont configurables par evenement",
      'La delegation permet de confier ses droits a un collegue',
    ],
    elementHelp: {},
  },
}

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
    icon: '\u2699\uFE0F',
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
              className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                          \u2022
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
