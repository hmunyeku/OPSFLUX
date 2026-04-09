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
  useState,
} from 'react'
import { useLocation } from 'react-router-dom'
import { X, ChevronDown, ChevronRight, Lightbulb, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Help content types ──────────────────────────────────────

interface ModuleHelp {
  title: string
  icon: string
  description: string
  workflows: { title: string; steps: string[] }[]
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
        steps: [
          'Cliquez "+ Nouvel utilisateur"',
          'Renseignez nom, prenom, email',
          "Choisissez l'entite et le role",
          'Le mot de passe temporaire est envoye par email',
        ],
      },
      {
        title: 'Gerer les permissions',
        steps: [
          'Cliquez sur un utilisateur dans la liste',
          'Allez dans l\'onglet "Permissions"',
          'Cliquez sur les cellules \u2713/\u2717 pour accorder ou retirer',
          'Les permissions heritees du role/groupe sont indiquees par un badge',
        ],
      },
      {
        title: 'Affecter un role via un groupe',
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
        steps: [
          'Cliquez "+ Nouveau projet"',
          'Renseignez le nom, code, dates, budget',
          'Affectez un site/asset et un chef de projet',
          "Ajoutez des taches dans l'onglet Planning",
        ],
      },
      {
        title: "Suivre l'avancement",
        steps: [
          'Le Gantt montre la timeline des taches',
          "Double-cliquez une tache pour l'editer",
          "Le % d'avancement se met a jour automatiquement",
          "Le Tableur permet l'edition en masse",
        ],
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
      "Avis de sejour (AdS), gestion des passagers, conformite, rotations et listes d'attente.",
    workflows: [
      {
        title: 'Soumettre un Avis de Sejour (AdS)',
        steps: [
          'Cliquez "+ Nouvel AdS" dans l\'onglet Avis de sejour',
          'Choisissez le type (individuel ou equipe)',
          'Selectionnez le site, les dates, la categorie de visite',
          'Ajoutez les passagers (PAX)',
          'Verifiez la conformite dans la checklist',
          'Cliquez "Soumettre" quand tout est vert',
        ],
      },
      {
        title: 'Parcours de validation AdS',
        steps: [
          'Brouillon \u2192 Soumis',
          'Controle conformite automatique',
          'Validation par le responsable projet',
          'Validation finale par le coordinateur',
          'Approuve \u2192 Mouvement possible',
        ],
      },
    ],
    tips: [
      "Si la capacite site n'est pas configuree, l'AdS passe en mode illimite par defaut",
      'La conformite verifie les certifications et habilitations de chaque PAX',
      'Un PAX bloque doit regulariser sa situation avant le mouvement',
    ],
    elementHelp: {},
  },
  planner: {
    title: 'Planner — Planification des activites',
    icon: '\u{1F4C5}',
    description:
      'Planification des activites sur les assets, gestion des capacites et scenarios.',
    workflows: [
      {
        title: 'Creer une activite',
        steps: [
          'Cliquez "+ Nouvelle activite"',
          "Choisissez l'asset, les dates, le type",
          'Definissez le quota PAX necessaire',
          "L'activite apparait dans le Gantt Planner",
        ],
      },
    ],
    tips: [
      'Le Gantt Planner montre toutes les activites par asset',
      'Les conflits de capacite sont detectes automatiquement',
      'Les scenarios permettent de comparer differentes planifications',
    ],
    elementHelp: {},
  },
  tiers: {
    title: 'Tiers — Entreprises & Contacts',
    icon: '\u{1F3E2}',
    description:
      'Annuaire des entreprises partenaires, fournisseurs, sous-traitants et leurs contacts.',
    workflows: [
      {
        title: 'Ajouter une entreprise',
        steps: [
          'Cliquez "+ Nouveau tiers"',
          'Renseignez la raison sociale, SIRET, type',
          'Ajoutez les contacts (personnes)',
          "Liez l'entreprise aux utilisateurs concernes",
        ],
      },
    ],
    tips: [
      'Un tiers peut etre fournisseur ET sous-traitant',
      'Les contacts tiers sont utilises comme PAX externes dans PaxLog',
    ],
    elementHelp: {},
  },
  conformite: {
    title: 'Conformite',
    icon: '\u2705',
    description:
      'Gestion des certifications, habilitations, formations obligatoires et audits.',
    workflows: [
      {
        title: "Verifier la conformite d'un PAX",
        steps: [
          'Allez dans l\'onglet Verifications',
          'Recherchez le PAX par nom',
          'Consultez ses certifications et leur statut',
          'Les expirations sont signalees en rouge',
        ],
      },
    ],
    tips: [
      'Les regles de conformite sont configurables par type de site',
      'Le score de conformite est calcule automatiquement',
    ],
    elementHelp: {},
  },
  travelwiz: {
    title: 'TravelWiz — Voyages & Transport',
    icon: '\u{1F681}',
    description:
      'Gestion des voyages, reservations transport, manifestes et suivi en temps reel.',
    workflows: [],
    tips: ['Module en cours de developpement'],
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

function WorkflowItem({ title, steps }: { title: string; steps: string[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors text-left"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && (
        <ol className="px-3 pb-3 pt-1 space-y-1.5 list-none">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-xs text-muted-foreground leading-relaxed">
              <span className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ── HelpPanel ───────────────────────────────────────────────

export function HelpPanel() {
  const { currentModule, hoveredElement, isHelpOpen, toggleHelp } = useHelp()

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

  const help = HELP_CONTENT[currentModule]

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
                Aide contextuelle
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
              aria-label="Fermer l'aide"
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
                Element selectionne
              </p>
              <p className="text-xs text-foreground leading-relaxed">
                {help.elementHelp[hoveredElement]}
              </p>
            </div>
          )}

          {!help && (
            <div className="text-sm text-muted-foreground">
              Aucune aide disponible pour cette page.
            </div>
          )}

          {help && (
            <>
              {/* Description */}
              <section>
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={13} className="text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Description
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
                    Workflows
                  </h3>
                  <div className="space-y-2">
                    {help.workflows.map((wf, i) => (
                      <WorkflowItem
                        key={i}
                        title={wf.title}
                        steps={wf.steps}
                      />
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
                      Astuces
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
          Appuyez sur <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono">?</kbd> pour afficher/masquer l'aide
        </div>
      </aside>
    </>
  )
}
