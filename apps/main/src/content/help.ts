/**
 * Help content registry — per-module descriptions, workflows, tips,
 * and element-level tooltips rendered by HelpSystem + AssistantPanel.
 *
 * Data-only module: no React, no hooks. Extracted from HelpSystem.tsx
 * to keep the component focused on rendering and stop the file from
 * ballooning past 1,300 lines. Editing the text here does not require
 * touching any TSX.
 */

// ── Help content types ──────────────────────────────────────

export interface WorkflowHelp {
  title: string
  steps: string[]
  diagram?: string // Mermaid flowchart string
  requiredPermission?: string
  requiredAnyPermissions?: string[]
}

export interface ModuleHelp {
  title: string
  icon: string
  description: string
  workflows: WorkflowHelp[]
  tips: string[]
  elementHelp: Record<string, string>
}

// ── Help content registry ───────────────────────────────────

export const HELP_CONTENT: Record<string, ModuleHelp> = {
  dashboard: {
    title: 'Tableau de bord',
    icon: '📊',
    description:
      "Vue d'ensemble de vos opérations. Les widgets affichent les KPIs en temps réel de tous les modules.",
    workflows: [
      {
        title: 'Personnaliser le dashboard',
        requiredAnyPermissions: ['dashboard.customize', 'dashboard.admin'],
        steps: [
          'Cliquez sur "Modifier" en haut à droite',
          'Glissez-déposez les widgets pour les réorganiser',
          'Cliquez "+" pour ajouter un widget depuis le catalogue',
          'Configurez chaque widget via son icone ⚙️',
          'Cliquez "Terminer" pour sauvegarder',
        ],
      },
    ],
    tips: [
      'Chaque module a son propre dashboard avec des widgets spécifiques',
      'Les données se rafraîchissent automatiquement toutes les 5 minutes',
    ],
    elementHelp: {},
  },
  users: {
    title: 'Comptes utilisateurs',
    icon: '👥',
    description:
      "Gestion des comptes, rôles, groupes et permissions. Contrôle d'accès centralisé (RBAC).",
    workflows: [
      {
        title: 'Créer un utilisateur',
        requiredAnyPermissions: ['user.create', 'core.users.manage'],
        steps: [
          'Cliquez "+ Nouvel utilisateur"',
          'Renseignez nom, prénom, email',
          "Choisissez l'entité et le rôle",
          'Le mot de passe temporaire est envoyé par email',
        ],
      },
      {
        title: 'Gérer les permissions',
        requiredAnyPermissions: ['core.rbac.manage', 'admin.rbac'],
        steps: [
          'Cliquez sur un utilisateur dans la liste',
          'Allez dans l\'onglet "Permissions"',
          'Cliquez sur les cellules ✓/✗ pour accorder ou retirer',
          'Les permissions héritées du rôle/groupe sont indiquées par un badge',
        ],
        diagram: `graph TD
    A["👤 Utilisateur"]:::user --> B["👥 Groupe"]:::group
    B --> C["🛡️ Rôle"]:::role
    C --> D["🔑 Permissions de base"]:::perm
    B --> E["⚙️ Overrides groupe"]:::override
    A --> F["⚡ Overrides utilisateur"]:::override
    D --> G["✅ Permissions effectives"]:::effective
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
        title: 'Affecter un rôle via un groupe',
        requiredAnyPermissions: ['core.rbac.manage', 'admin.rbac'],
        steps: [
          'Allez dans l\'onglet "Groupes"',
          'Créez un groupe ou sélectionnez un existant',
          'Ajoutez des membres au groupe',
          'Le rôle du groupe est automatiquement appliqué aux membres',
        ],
      },
    ],
    tips: [
      'Un utilisateur peut appartenir à plusieurs groupes',
      'Les overrides utilisateur priment sur les permissions du groupe/rôle',
      'Le rôle SUPER_ADMIN ne peut pas être supprimé',
    ],
    elementHelp: {},
  },
  projets: {
    title: 'Gestion de projets',
    icon: '📁',
    description:
      "Module complet de gestion de projets pour les opérations Oil & Gas Perenco. Comprend un Gantt interactif avec dépendances entre tâches (FS, FF, SS, SF), un tableur pour l'édition en masse, une vue Kanban par statut, et un système de calcul d'avancement pondéré (par effort, par durée, par poids manuel ou égal). Les projets sont rattachés à un site/installation, peuvent être importés depuis Gouti, et supportent jalons, sous-tâches, pièces jointes, commentaires, suivi budgétaire et imputation analytique par centre de coûts.",
    workflows: [
      {
        title: 'Créer un projet',
        requiredPermission: 'project.create',
        steps: [
          'Cliquez "+ Nouveau projet" dans la liste des projets',
          'Renseignez le nom, le code projet (ex: WO-EBO-2026-001), les dates de début/fin et le budget prévisionnel',
          'Affectez un site/asset et un chef de projet (responsable opérationnel)',
          'Choisissez le mode de calcul d\'avancement (effort/durée/manuel) — modifiable ultérieurement',
          'Ajoutez les tâches dans l\'onglet "Planning" via le Gantt ou le Tableur',
        ],
        diagram: `graph LR
    A["📋 Planifié"]:::planned --> B["🔄 Actif"]:::active
    B --> C["✅ Terminé"]:::done
    B --> D["❌ Annulé"]:::cancelled

    classDef planned fill:#475569,stroke:#64748b,color:#fff
    classDef active fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef done fill:#22c55e,stroke:#4ade80,color:#fff
    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: "Suivre l'avancement",
        requiredPermission: 'project.read',
        steps: [
          'Le Gantt montre la timeline des tâches',
          "Double-cliquez une tâche pour l'éditer",
          "Le % d'avancement se met à jour automatiquement",
          "Le Tableur permet l'édition en masse",
        ],
        diagram: `graph LR
    A["📝 À faire"]:::todo --> B["🔄 En cours"]:::progress
    B --> C["👁️ Revue"]:::review
    C --> D["✅ Terminé"]:::done
    C -->|Corrections| B

    classDef todo fill:#475569,stroke:#64748b,color:#fff
    classDef progress fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef review fill:#eab308,stroke:#facc15,color:#000
    classDef done fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
      {
        title: 'Importer un projet Gouti',
        requiredAnyPermissions: ['project.import', 'project.gouti.sync'],
        steps: [
          'Allez dans l\'onglet "Sync Gouti" du module Projets',
          'Cliquez "+ Importer" et collez l\'URL du projet Gouti (ou son ID)',
          'Vérifiez les credentials Gouti dans Paramètres > Intégrations si la connexion échoue',
          'Mappez les rubriques Gouti vers les types OpsFlux (Tâches → Tâches, Jalons → Milestones, Ressources → Équipe)',
          'Cliquez "Synchroniser" — la structure WBS, les dates, les dépendances et l\'avancement sont importés',
          'Activez "Sync auto" pour rafraîchir quotidiennement (les modifications OpsFlux ne sont pas remontées vers Gouti)',
        ],
      },
      {
        title: 'Calcul d\'avancement pondéré (effort vs poids manuel)',
        requiredAnyPermissions: ['project.update', 'project.progress.configure'],
        steps: [
          'Ouvrez les paramètres du projet (icône engrenage en haut à droite)',
          'Section "Calcul d\'avancement" — choisissez la méthode',
          'Effort : pondère chaque tâche par sa charge (homme-jours estimés). Avancement = Σ(% * effort) / Σ(effort)',
          'Durée : pondère par la durée calendaire des tâches. Pratique pour les projets longs avec phases distinctes',
          'Poids manuel : saisissez explicitement un poids par tâche dans le tableur (utile quand la criticité ne suit pas la charge)',
          'Égal : toutes les tâches comptent identiquement. Simple mais peu précis sur projets hétérogènes',
          'L\'avancement projet est recalculé automatiquement à chaque modification de tâche',
        ],
      },
      {
        title: 'Export Gantt PDF',
        requiredAnyPermissions: ['project.export', 'project.read'],
        steps: [
          'Ouvrez le projet en vue Gantt',
          'Configurez la fenêtre temporelle souhaitée (zoom : jour/semaine/mois) et appliquez les filtres (par responsable, statut, jalons)',
          'Cliquez "Exporter" > "PDF Gantt" dans la barre d\'outils',
          'Choisissez le format papier (A4, A3, A2 paysage recommandé pour grands projets) et l\'orientation',
          'Cochez les options : afficher la légende, le chemin critique, le baseline, les ressources affectées',
          'Cliquez "Générer" — le PDF est produit côté serveur et téléchargé. Pour les très gros projets, le rendu est asynchrone et notifié par email',
        ],
      },
    ],
    tips: [
      'Utilisez le Kanban pour un suivi par statut (glisser-déposer)',
      "Sync Gouti permet d'importer des projets depuis Gouti avec rafraîchissement auto",
      'Les dépendances entre tâches sont visibles dans le Gantt (FS, SS, FF, SF) avec calcul du chemin critique',
      'Le mode "Poids manuel" est recommandé quand toutes les tâches n\'ont pas le même impact business',
      'Les jalons (milestones) sont visualisés en losange dans le Gantt et peuvent déclencher des notifications',
      'L\'avancement réel est comparé au baseline pour calculer l\'EVM (Earned Value Management)',
    ],
    elementHelp: {
      'projets.create': 'Crée un nouveau projet. Le code projet doit être unique au sein de l\'entité (ex: WO-EBO-2026-001 pour Workover Ebome).',
      'projets.gantt.toggle': 'Bascule entre les vues Gantt, Tableur et Kanban du projet. Chaque vue partage les mêmes données.',
      'projets.tasks.create': 'Ajoute une tâche au projet. Disponible en sous-tâche d\'une tâche existante (hiérarchie WBS jusqu\'à 5 niveaux).',
      'projets.task.dependency': 'Crée une dépendance entre tâches. FS = Fin-Début (la suivante démarre quand la précédente finit), SS = Début-Début, FF = Fin-Fin, SF = Début-Fin.',
      'projets.task.progress': 'Pourcentage d\'avancement de la tâche (0-100). Met à jour automatiquement l\'avancement projet selon le mode de pondération configuré.',
      'projets.milestone.create': 'Ajoute un jalon (milestone) — point clé sans durée. Visualisé en losange dans le Gantt et peut déclencher des notifications.',
      'projets.progress.mode': 'Mode de calcul d\'avancement projet. Effort = pondéré par charge homme-jours. Durée = pondéré par durée calendaire. Poids manuel = vous saisissez le poids. Égal = toutes les tâches comptent pareil.',
      'projets.gouti.sync': 'Synchronise le projet avec Gouti. Importe la WBS, les dates, dépendances et avancement. Sync unidirectionnelle (Gouti → OpsFlux).',
      'projets.export.gantt': 'Exporte le Gantt en PDF haute résolution. Choisissez le format papier (A4/A3/A2), orientation et options (légende, chemin critique, baseline).',
      'projets.budget.tracker': 'Suivi budgétaire — compare les coûts engagés (via imputations) au budget prévisionnel. Alerte automatique si dépassement > 10%.',
      'projets.kanban.column': 'Colonne du Kanban représentant un statut. Glissez-déposez les tâches pour changer leur statut. Configurable dans les paramètres projet.',
      'projets.critical.path': 'Chemin critique — séquence de tâches déterminant la durée totale du projet. Tout retard sur ces tâches retarde le projet entier.',
    },
  },
  paxlog: {
    title: 'PaxLog — Gestion des passagers',
    icon: '✈️',
    description:
      "Module central de gestion des avis de séjour (AdS) et du suivi opérationnel des passagers (PAX) sur les installations Perenco Cameroun. Couvre tout le cycle : création de l'AdS avec destination offshore (Ebome, Ekoundou, Mokoko...) et catégorie de visite, ajout de PAX internes (employés Perenco) ou externes (sous-traitants via portail), vérification automatique des certifications HUET/BOSIET/médicales, soumission au workflow de validation multi-niveaux (initiateur → chef de projet → CDS → validateur final), suivi POB en temps réel, gestion des rotations et liste d'attente quand la capacité du site est saturée.",
    workflows: [
      {
        title: 'Soumettre un avis de séjour (AdS)',
        requiredAnyPermissions: ['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.submit', 'paxlog.ads.update'],
        steps: [
          'Cliquez "+ Nouvel AdS" dans l\'onglet "Avis de séjour"',
          'Choisissez le type (Individuel pour 1 PAX, Équipe pour plusieurs PAX partageant le même séjour)',
          'Sélectionnez le site d\'entrée (FPSO, plateforme, base logistique) et la catégorie de visite (Maintenance, Projet, Inspection, Audit)',
          'Définissez les dates d\'arrivée et de départ ainsi que l\'objet du séjour',
          'Ajoutez les PAX : créez un nouveau profil ou sélectionnez un contact existant du module Tiers',
          'Vérifiez la checklist conformité — chaque PAX doit avoir HUET/BOSIET, visite médicale et habilitations à jour',
          'Cliquez "Soumettre" quand tous les indicateurs sont verts — l\'AdS entre dans le workflow de validation',
        ],
      },
      {
        title: 'Parcours de validation AdS',
        requiredAnyPermissions: ['paxlog.ads.approve', 'paxlog.ads.read'],
        steps: [
          'Brouillon → Soumis',
          'Contrôle conformité automatique',
          'Validation par le responsable projet',
          'Validation finale par le coordinateur',
          'Approuvé → Mouvement possible',
        ],
        diagram: `graph TD
    A["📝 Brouillon"]:::draft --> |Soumettre| B["📤 Soumis"]:::submitted
    B --> C{"🔍 Conformité"}
    C -->|OK| D["✅ En validation"]:::validation
    C -->|Issues| E["⚠️ Bloqué"]:::blocked
    D -->|Approuver| F["🟢 Approuvé"]:::approved
    D -->|Rejeter| G["🔴 Rejeté"]:::rejected
    D -->|Escalader| H["⚖️ Arbitrage"]:::arbitration
    F -->|Démarrer| I["🔄 En cours"]:::progress
    I -->|Terminer| J["✔️ Terminé"]:::done

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
      {
        title: 'Traiter un PAX non conforme',
        requiredAnyPermissions: ['paxlog.pax.update', 'conformite.record.update'],
        steps: [
          'Ouvrez l\'AdS bloqué — la checklist affiche les PAX en rouge avec le motif (certification expirée, document manquant)',
          'Cliquez sur le PAX concerné pour ouvrir sa fiche',
          'Allez dans l\'onglet "Conformité" et identifiez les éléments non valides',
          'Soit régularisez en chargeant le justificatif à jour (renouvellement HUET, certificat médical)',
          'Soit demandez une dérogation via "Demander dérogation" — le validateur conformité tranche',
          'Soit retirez le PAX de l\'AdS via le bouton "Retirer" si la situation ne peut être régularisée à temps',
          'Re-soumettez l\'AdS une fois la situation résolue',
        ],
      },
      {
        title: 'Gérer une liste d\'attente POB saturée',
        requiredAnyPermissions: ['paxlog.waitlist.manage', 'paxlog.pob.manage'],
        steps: [
          'Allez dans l\'onglet "Liste d\'attente" du site concerné — affiche tous les AdS en queue',
          'Vérifiez le POB actuel vs capacité maximale dans le panneau de droite',
          'Triez par priorité opérationnelle (urgences puis ancienneté de soumission)',
          'Pour chaque PAX en attente : cliquez "Promouvoir" pour le faire entrer dès qu\'une place se libère',
          'Ou cliquez "Reporter" pour décaler l\'AdS sur une rotation suivante avec accord de l\'initiateur',
          'La promotion automatique est déclenchée par le départ d\'un PAX (FIFO par défaut, pondéré par priorité)',
        ],
      },
      {
        title: 'Générer un lien externe pour sous-traitant',
        requiredAnyPermissions: ['paxlog.external.invite', 'paxlog.ads.create'],
        steps: [
          'Ouvrez un AdS de type Équipe en brouillon',
          'Cliquez sur "Inviter externe" dans la barre d\'actions',
          'Sélectionnez le tiers sous-traitant et le contact référent',
          'Définissez la durée de validité du lien (24h à 7 jours)',
          'Le système génère une URL signée envoyée par email au référent',
          'Le sous-traitant remplit les fiches PAX (identité, certifications, scans) sans accès OpsFlux',
          'À la soumission externe, les PAX apparaissent dans l\'AdS prêts pour la vérification conformité',
        ],
      },
    ],
    tips: [
      "Si la capacité site n'est pas configurée, l'AdS passe en mode illimité par défaut",
      'La conformité vérifie les certifications HUET/BOSIET, visite médicale et habilitations spécifiques au site',
      'Un PAX bloqué doit régulariser sa situation ou obtenir une dérogation avant le mouvement',
      'Le lien externe expire automatiquement et toute soumission est tracée dans l\'audit trail',
      'Les rotations standards (28/28, 21/21) sont configurables par contrat et appliquées automatiquement',
      'Un signalement PAX (incident sécurité, comportement) peut bloquer ses futurs AdS jusqu\'à clôture',
    ],
    elementHelp: {
      'paxlog.ads.create': 'Crée un nouvel avis de séjour. Le type Individuel ne contient qu\'un seul PAX, le type Équipe regroupe plusieurs PAX partageant les mêmes dates et destination.',
      'paxlog.ads.status.draft': 'Brouillon — l\'AdS peut être modifié librement. Il n\'est pas encore soumis au workflow de validation et ne consomme pas de quota POB.',
      'paxlog.ads.status.submitted': 'Soumis — l\'AdS est entré dans le workflow. La conformité est vérifiée automatiquement et les approbateurs sont notifiés.',
      'paxlog.ads.status.approved': 'Approuvé — toutes les validations sont OK. L\'AdS peut être attaché à un voyage TravelWiz et les PAX entrent au POB à l\'arrivée sur site.',
      'paxlog.ads.status.rejected': 'Rejeté — un validateur a refusé. Consultez les commentaires pour comprendre le motif et créer un nouvel AdS corrigé si nécessaire.',
      'paxlog.ads.submit': 'Soumet l\'AdS au workflow. Bloqué tant que des PAX sont non conformes (sauf dérogation accordée).',
      'paxlog.ads.compliance': 'Indicateur de conformité agrégé pour tous les PAX de l\'AdS. Vert = OK, Orange = avertissement non bloquant, Rouge = soumission impossible.',
      'paxlog.pax.add': 'Ajoute un passager à l\'AdS. Vous pouvez créer une fiche ou rattacher un contact existant du module Tiers (employé Perenco ou externe sous-traitant).',
      'paxlog.pax.compliance.badge': 'Statut conformité du PAX. Cliquez pour voir le détail des certifications, leur date d\'expiration et l\'historique des vérifications.',
      'paxlog.pob.counter': 'Population on Board actuelle vs capacité maximale du site. Cliquez pour voir la décomposition par entreprise et par catégorie.',
      'paxlog.waitlist.promote': 'Promeut un AdS en attente vers le statut Approuvé dès qu\'une place POB se libère. Respect du FIFO ou de la priorité opérationnelle selon configuration.',
      'paxlog.external.link': 'Génère une URL signée à durée limitée pour qu\'un sous-traitant remplisse les fiches PAX sans accès complet à OpsFlux.',
      'paxlog.rotation.calendar': 'Vue calendrier des rotations de personnel par site. Affiche les arrivées/départs prévus et le solde POB jour par jour.',
    },
  },
  planner: {
    title: 'Planner — Planification des activités',
    icon: '📅',
    description:
      "Module de planification opérationnelle des activités sur les installations Perenco (Workover, forage, maintenance majeure, projets, inspections, audits HSE). Le Gantt interactif visualise toutes les activités par asset (FPSO, plateformes, bases) et détecte automatiquement les conflits de capacité POB. Les scénarios what-if permettent de simuler l'impact de modifications avant application. Intégration native avec PaxLog (les quotas PAX consomment le POB du site) et avec Projets (chaque activité peut être rattachée à un projet pour le suivi budgétaire).",
    workflows: [
      {
        title: 'Créer une activité',
        requiredAnyPermissions: ['planner.activity.create', 'planner.activity.read'],
        steps: [
          'Cliquez "+ Nouvelle activité" dans la barre d\'outils du Gantt',
          'Sélectionnez l\'asset cible dans le picker hiérarchique (Champ > FPSO > Zone)',
          'Choisissez le type d\'activité (Workover, Forage, Maintenance, Projet, Inspection, Audit, Évènement)',
          'Définissez les dates de début et fin et le quota PAX prévu',
          'Rattachez optionnellement un projet existant et/ou un centre de coûts pour l\'imputation analytique',
          'Validez — l\'activité apparaît dans le Gantt et les conflits de capacité éventuels sont détectés en temps réel',
        ],
      },
      {
        title: 'Résoudre un conflit de capacité',
        requiredAnyPermissions: ['planner.conflict.resolve', 'planner.conflict.read'],
        steps: [
          'Les conflits sont signalés par une icône rouge dans le Gantt',
          'Cliquez sur le conflit pour voir les détails',
          'Choisissez une résolution : décaler, réduire ou annuler une activité',
          'Validez la résolution pour mettre à jour le planning',
        ],
        diagram: `graph TD
    A["📅 Activité A"]:::act --> C{"⚠️ Conflit capacité"}
    B["📅 Activité B"]:::act --> C
    C -->|Décaler| D["🔄 Reportée"]:::resolved
    C -->|Réduire| E["✂️ Ajustée"]:::resolved
    C -->|Annuler| F["❌ Annulée"]:::cancelled

    classDef act fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef resolved fill:#22c55e,stroke:#4ade80,color:#fff
    classDef cancelled fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: 'Arbitrer un conflit critical',
        requiredAnyPermissions: ['planner.conflict.arbitrate', 'planner.conflict.resolve'],
        steps: [
          'Ouvrez l\'onglet "Conflits" — les conflits critiques sont marqués d\'un badge rouge "CRITICAL"',
          'Cliquez sur le conflit pour voir les activités impliquées, leurs propriétaires et l\'écart de capacité',
          'Consultez les scores de priorité métier (impact production, risque HSE, criticité contractuelle)',
          'Discutez avec les propriétaires via les commentaires intégrés au panneau de conflit',
          'Le DO (Directeur des Opérations) tranche via "Arbitrer" → choisir l\'activité prioritaire et le motif',
          'Les activités perdantes sont décalées automatiquement et leurs propriétaires notifiés avec justification',
        ],
      },
      {
        title: 'Comparer 3 scénarios what-if',
        requiredAnyPermissions: ['planner.scenario.create', 'planner.scenario.read'],
        steps: [
          'Cliquez "Nouveau scénario" dans le menu Scénarios — le plan réel actuel est dupliqué',
          'Renommez le scénario (ex: "Scénario A — Décalage Workover Ebome de 2 semaines")',
          'Modifiez les activités du scénario : déplacez-les sur le Gantt, ajustez les quotas PAX, ajoutez/supprimez',
          'Répétez pour créer 2 autres scénarios (B et C) avec des hypothèses différentes',
          'Ouvrez la vue "Comparaison" et sélectionnez les 3 scénarios — affichage côte à côte des KPIs (POB max, conflits restants, coût estimé, jalons projets impactés)',
          'Choisissez le scénario gagnant et cliquez "Appliquer" — le plan réel est mis à jour atomiquement',
        ],
      },
      {
        title: 'Forcer la priorité DO sur une activité',
        requiredAnyPermissions: ['planner.priority.force', 'planner.admin'],
        steps: [
          'Ouvrez le détail de l\'activité critique (ex: shutdown forcé suite incident)',
          'Cliquez "Forcer priorité DO" — action restreinte aux directeurs et au coordinateur ops',
          'Choisissez le niveau (DO Standard, DO Critical, DO Override Capacity)',
          'Saisissez la justification opérationnelle (obligatoire, tracée dans l\'audit trail)',
          'Le système réorganise automatiquement les autres activités pour libérer la capacité',
          'Tous les acteurs impactés reçoivent une notification avec le motif et le contact du DO',
        ],
      },
    ],
    tips: [
      'Les conflits de capacité sont détectés automatiquement dès qu\'une activité est créée — comparaison total PAX vs POB max du site',
      'Les scénarios what-if n\'impactent pas le plan réel tant que vous n\'avez pas cliqué "Appliquer"',
      'La vue Capacité affiche un heatmap par site et par jour — zones rouges = dépassement',
      'Les signaux de révision alertent quand une activité validée a été modifiée après approbation',
      'Les prévisions (Forecast) montrent la tendance du plan de charge sur les semaines à venir',
      'Une activité Workover bloque automatiquement les autres activités de production sur le même puits',
    ],
    elementHelp: {
      'planner.activity.create': 'Crée une nouvelle activité opérationnelle (Workover, maintenance, projet, inspection). Détecte les conflits POB en temps réel à la sauvegarde.',
      'planner.activity.type.workover': 'Workover — intervention lourde sur un puits. Bloque automatiquement les autres opérations sur le même puits et consomme un quota PAX élevé.',
      'planner.activity.type.maintenance': 'Maintenance — intervention planifiée sur équipement. N\'arrête pas la production mais consomme du POB pour les équipes spécialisées.',
      'planner.activity.type.audit': 'Audit/Inspection — visite réglementaire ou interne. Quota PAX généralement faible mais priorité élevée si lié à une certification.',
      'planner.gantt.toolbar': 'Barre d\'outils du Gantt. Filtres par site/type, zoom temporel (jour/semaine/mois/trimestre), bascule entre plan réel et scénario.',
      'planner.conflict.badge': 'Compteur de conflits de capacité actifs. Cliquez pour ouvrir la liste détaillée avec impact POB et options de résolution.',
      'planner.conflict.severity.critical': 'Conflit CRITICAL — dépassement majeur du POB nécessitant un arbitrage DO. Bloque la validation des AdS associés.',
      'planner.scenario.new': 'Crée un scénario what-if en dupliquant le plan réel. Permet de tester des modifications sans impact opérationnel.',
      'planner.scenario.compare': 'Compare jusqu\'à 3 scénarios côte à côte sur les KPIs clés (POB, conflits, coûts, jalons impactés).',
      'planner.scenario.apply': 'Applique le scénario sélectionné au plan réel. Action atomique avec rollback possible depuis l\'historique.',
      'planner.priority.force': 'Forcer priorité DO — réservé aux directeurs. Réorganise automatiquement les autres activités pour libérer la capacité.',
      'planner.capacity.heatmap': 'Heatmap de capacité par site et par jour. Rouge = dépassement POB, Orange = saturation imminente, Vert = capacité disponible.',
      'planner.forecast.timeline': 'Vue prévisionnelle du plan de charge sur les semaines à venir. Aide à anticiper les pics et lisser la charge.',
    },
  },
  tiers: {
    title: 'Tiers — Entreprises & Contacts',
    icon: '🏢',
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
          "Liez l'entreprise aux utilisateurs concernés",
        ],
      },
      {
        title: 'Gérer les contacts',
        requiredAnyPermissions: ['tier.contact.create', 'tier.contact.read'],
        steps: [
          'Ouvrez la fiche d\'un tiers',
          'Allez dans l\'onglet "Contacts"',
          'Cliquez "+ Nouveau contact"',
          'Renseignez nom, prénom, fonction, email, téléphone',
          'Le contact peut être utilisé comme PAX dans PaxLog',
        ],
      },
      {
        title: 'Transférer un contact entre entreprises',
        requiredAnyPermissions: ['tier.contact.transfer', 'tier.contact.update'],
        steps: [
          'Ouvrez la fiche du contact',
          'Cliquez "Transférer"',
          'Sélectionnez le nouveau tiers de rattachement',
          "L'historique des affectations est conservé",
        ],
      },
    ],
    tips: [
      'Un tiers peut être fournisseur ET sous-traitant (types multiples)',
      'Les contacts tiers sont utilisés comme PAX externes dans PaxLog',
      'Le portail externe permet aux tiers de soumettre des documents directement',
      'Le blocage d\'un tiers empêche la création de nouveaux AdS pour ses contacts',
    ],
    elementHelp: {},
  },
  conformite: {
    title: 'Conformité',
    icon: '✅',
    description:
      'Gestion des certifications, habilitations, formations obligatoires et audits. Vérification automatique avant chaque déplacement.',
    workflows: [
      {
        title: "Vérifier la conformité d'un PAX",
        requiredAnyPermissions: ['conformite.verify', 'conformite.record.read'],
        steps: [
          'Allez dans l\'onglet Vérifications',
          'Recherchez le PAX par nom',
          'Consultez ses certifications et leur statut',
          'Les expirations sont signalées en rouge',
        ],
        diagram: `graph TD
    A["📋 Règles site"]:::rule --> D{"🔍 Vérification"}
    B["🎓 Profil / Habilitations"]:::rule --> D
    C["📝 Auto-déclarations"]:::rule --> D
    D -->|Tout OK| E["✅ Conforme"]:::ok
    D -->|Manquant| F["⚠️ Non conforme"]:::nok
    D -->|Expiré| G["🔴 Expiré"]:::expired

    classDef rule fill:#475569,stroke:#64748b,color:#fff
    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff
    classDef nok fill:#f59e0b,stroke:#fbbf24,color:#000
    classDef expired fill:#ef4444,stroke:#f87171,color:#fff`,
      },
      {
        title: 'Configurer les règles de conformité',
        requiredAnyPermissions: ['conformite.rule.create', 'conformite.admin'],
        steps: [
          'Allez dans l\'onglet "Règles"',
          'Cliquez "+ Nouvelle règle"',
          'Sélectionnez le type de site ou de visite',
          'Définissez les certifications requises',
          'Configurez les délais de validité',
          'La règle s\'applique immédiatement aux nouvelles vérifications',
        ],
      },
      {
        title: 'Enregistrer une certification',
        requiredAnyPermissions: ['conformite.record.create', 'conformite.record.update'],
        steps: [
          'Ouvrez le profil du PAX concerné',
          'Allez dans l\'onglet "Conformité"',
          'Cliquez "+ Ajouter une certification"',
          'Sélectionnez le type et la date de validité',
          'Joignez le justificatif (scan, PDF)',
          'La certification est prise en compte dans les vérifications',
        ],
      },
    ],
    tips: [
      'Les règles de conformité sont configurables par type de site',
      'Le score de conformité est calculé automatiquement',
      'Les alertes d\'expiration sont envoyées 30 jours avant l\'échéance',
      'La conformité est vérifiée automatiquement lors de la soumission d\'un AdS',
    ],
    elementHelp: {},
  },
  assets: {
    title: 'Registre des assets',
    icon: '🏭',
    description:
      "Hiérarchie des installations, sites, équipements et zones. Configuration des capacités et règles d'accès.",
    workflows: [
      {
        title: 'Naviguer dans la hiérarchie',
        requiredAnyPermissions: ['asset.read'],
        steps: [
          "Sélectionnez un site ou une installation dans l'arborescence à gauche",
          'Consultez les détails, capacités et équipements dans le panneau principal',
          'Utilisez la recherche pour trouver un asset par nom ou code',
        ],
      },
      {
        title: 'Configurer les capacités',
        requiredAnyPermissions: ['asset.update', 'asset.capacity.manage'],
        steps: [
          "Sélectionnez l'asset dans l'arborescence",
          'Allez dans l\'onglet "Capacités"',
          'Ajoutez ou modifiez les limites (PAX, poids, etc.)',
          'Les capacités sont historisées (chaque modification crée un nouvel enregistrement)',
        ],
      },
    ],
    tips: [
      "La hiérarchie est configurable par tenant (niveaux personnalisables)",
      "Les capacités sont utilisées par le Planner pour détecter les conflits",
      "Chaque asset peut avoir des règles de conformité spécifiques",
    ],
    elementHelp: {},
  },
  travelwiz: {
    title: 'TravelWiz — Voyages & Transport',
    icon: '🚁',
    description:
      "Module de gestion du transport aérien (hélicoptère) et maritime (bateau, crewboat, supply) entre les bases logistiques (Douala, Kribi) et les installations offshore Perenco (Ebome, Ekoundou, Mokoko, Sanaga). Couvre la planification des voyages avec pickup multi-sites, la génération des manifestes PAX et fret avec contrôle automatique du poids vs capacité, le suivi GPS temps réel des vecteurs, les conditions météo par site (vent, houle, plafond, visibilité), la gestion de la maintenance, et le portail capitaine pour la gestion terrain depuis les FPSO.",
    workflows: [
      {
        title: 'Créer un voyage',
        requiredAnyPermissions: ['travelwiz.voyage.create', 'travelwiz.voyage.read'],
        steps: [
          'Cliquez "+ Nouveau voyage" dans la barre d\'outils',
          'Sélectionnez le vecteur dans la liste déroulante (hélicoptère, bateau crewboat/supply, véhicule)',
          'Définissez l\'itinéraire : départ (base logistique), escales (sites offshore intermédiaires) et arrivée',
          'Renseignez la date et les horaires prévus (ETD départ, ETA arrivée)',
          'Validez — le voyage apparaît dans le planning transport et la disponibilité du vecteur est réservée',
        ],
      },
      {
        title: 'Générer un manifeste',
        requiredAnyPermissions: ['travelwiz.manifest.create', 'travelwiz.manifest.read'],
        steps: [
          'Ouvrez un voyage valide',
          'Cliquez "Générer manifeste"',
          'Les passagers des AdS approuvés sont automatiquement listés',
          'Vérifiez les poids bagages et le fret',
          'Validez le manifeste pour impression ou envoi',
        ],
        diagram: `graph LR
    A["📋 AdS Approuvés"]:::input --> B["📦 Manifeste"]:::manifest
    B --> C{"⚖️ Poids"}
    C -->|OK| D["✅ Validé"]:::ok
    C -->|Dépassé| E["⚠️ Surcharge"]:::warn

    classDef input fill:#475569,stroke:#64748b,color:#fff
    classDef manifest fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef ok fill:#22c55e,stroke:#4ade80,color:#fff
    classDef warn fill:#f59e0b,stroke:#fbbf24,color:#000`,
      },
      {
        title: 'Gérer la flotte',
        requiredAnyPermissions: ['travelwiz.vector.create', 'travelwiz.vector.read'],
        steps: [
          'Allez dans l\'onglet "Flotte"',
          'Ajoutez un vecteur (type, immatriculation, capacité)',
          'Définissez les périodes de maintenance',
          'Consultez la disponibilité dans le calendrier',
        ],
      },
      {
        title: 'Générer un manifeste PAX avec pickup multi-sites',
        requiredAnyPermissions: ['travelwiz.manifest.create', 'travelwiz.manifest.pickup'],
        steps: [
          'Ouvrez le voyage cible (statut Planifié ou En cours de chargement)',
          'Cliquez "Générer manifeste" — les PAX des AdS approuvés sont récupérés automatiquement par site d\'embarquement',
          'Pour chaque escale, le système liste les PAX à embarquer (ordre chronologique par site)',
          'Vérifiez les poids : poids corporel + bagages enregistré + fret accompagnant pour chaque PAX',
          'Le total est comparé à la MTOW (Maximum Take-Off Weight) du vecteur — alerte rouge si dépassement',
          'Si surcharge : retirer un PAX, réduire les bagages, ou splitter le voyage en deux rotations',
          'Validez le manifeste — un PDF signé est généré (briefing PAX, pesée, manifeste autorité aviation civile)',
        ],
      },
      {
        title: 'Gérer une panne vecteur en cours de voyage',
        requiredAnyPermissions: ['travelwiz.vector.incident', 'travelwiz.voyage.update'],
        steps: [
          'Le capitaine signale la panne via le portail terrain ("Signaler incident vecteur")',
          'Le voyage passe automatiquement en statut "Incident" et une notification est envoyée aux opérateurs base',
          'Ouvrez l\'incident — renseignez la nature (mécanique, électrique, hydraulique), criticité et lieu (en vol, au sol)',
          'Recherchez un vecteur de remplacement disponible via "Trouver substitut" (filtre par type, capacité, base proche)',
          'Réaffectez le voyage au nouveau vecteur — le manifeste est régénéré et les PAX notifiés du retard',
          'Marquez le vecteur initial en "Maintenance non planifiée" — son indisponibilité bloque les voyages futurs jusqu\'à reprise opérationnelle',
        ],
      },
      {
        title: 'Portail capitaine terrain',
        requiredAnyPermissions: ['travelwiz.captain.portal', 'travelwiz.voyage.read'],
        steps: [
          'Le capitaine se connecte au portail dédié (URL spécifique avec auth simplifiée mobile/tablette)',
          'Sélectionne son voyage du jour dans la liste filtrée par son immatriculation vecteur',
          'Confirme la pré-flight checklist (météo OK, masse et centrage validés, briefing PAX effectué)',
          'Saisit l\'heure de décollage réelle (ATD) — déclenche le tracking GPS automatique',
          'À chaque escale : pointe les PAX qui descendent et qui embarquent, signale écarts (no-show, ajout last minute)',
          'À l\'arrivée finale : saisit l\'ATA, valide les pleins de carburant et le rapport de vol — le voyage passe en "Terminé"',
        ],
      },
    ],
    tips: [
      'Le suivi GPS temps réel affiche la position des vecteurs actifs sur la carte avec trace des dernières 24h',
      'Le manifeste calcule le poids total (PAX + bagages + fret) vs MTOW — bloque la validation si dépassement',
      'Les vecteurs en maintenance (planifiée ou non) sont automatiquement exclus du picker de planification',
      'Le portail capitaine fonctionne en mode dégradé hors ligne — les saisies sont synchronisées au retour du réseau',
      'Les conditions météo (vent, houle, plafond, visibilité) sont vérifiées automatiquement avant chaque vol — alerte si limite dépassée',
      'Les pickups multi-sites sont optimisés automatiquement (ordre des escales selon coordonnées GPS)',
    ],
    elementHelp: {
      'travelwiz.voyage.create': 'Crée un nouveau voyage. Sélectionnez le vecteur, l\'itinéraire avec escales et la date — le système réserve la disponibilité.',
      'travelwiz.voyage.status.planned': 'Planifié — le voyage est créé et le vecteur réservé. Pas encore de manifeste validé ni d\'embarquement commencé.',
      'travelwiz.voyage.status.boarding': 'Embarquement — le manifeste est validé et les PAX sont en cours de pointage à l\'embarquement (terminal hélico/quai).',
      'travelwiz.voyage.status.intransit': 'En transit — le vecteur est parti (ATD saisi). Suivi GPS actif et tracking des escales en temps réel.',
      'travelwiz.voyage.status.completed': 'Terminé — le vecteur est arrivé à destination finale (ATA saisi). Manifeste archivé et rapport de vol soumis.',
      'travelwiz.manifest.generate': 'Génère le manifeste PAX et fret depuis les AdS approuvés. Vérifie automatiquement le poids vs MTOW du vecteur.',
      'travelwiz.manifest.weight.warning': 'Alerte de surcharge — le poids total (PAX + bagages + fret) dépasse la MTOW. Bloque la validation jusqu\'à correction.',
      'travelwiz.vector.maintenance': 'Période de maintenance du vecteur. Bloque automatiquement toute planification de voyage sur cette plage.',
      'travelwiz.vector.gps.live': 'Position GPS temps réel du vecteur (actualisée toutes les 60s). Affiche aussi la trace des dernières heures.',
      'travelwiz.weather.check': 'Vérification automatique des conditions météo (vent, houle, plafond, visibilité) avant validation. Alerte si limite vecteur dépassée.',
      'travelwiz.captain.portal.url': 'URL dédiée au portail capitaine — auth simplifiée mobile/tablette, mode dégradé hors ligne avec sync au retour réseau.',
      'travelwiz.pickup.multisite': 'Voyage avec pickup sur plusieurs sites. L\'ordre des escales est optimisé automatiquement selon les coordonnées GPS.',
      'travelwiz.incident.report': 'Signale un incident vecteur (panne, météo, médical) — déclenche la recherche d\'un vecteur de substitution.',
    },
  },
  packlog: {
    title: 'PackLog — Logistique Cargo',
    icon: '📦',
    description:
      "Module de gestion logistique cargo pour les opérations offshore Perenco. Gère les articles du catalogue centralisé (pièces de rechange, consommables, équipements), les lettres de transport (LT) avec expéditeur/destinataire et liste détaillée d'articles, le suivi des cargos depuis la préparation jusqu'à la livraison sur site, la traçabilité complète (préparation, en transit, réceptionné, livré), la gestion des matières dangereuses (HAZMAT) avec classes IMDG/IATA, et l'intégration avec TravelWiz pour le rattachement à un voyage hélicoptère ou bateau.",
    workflows: [
      {
        title: 'Créer une LT avec articles catalogue',
        requiredAnyPermissions: ['packlog.lt.create', 'packlog.lt.read'],
        steps: [
          'Cliquez "+ Nouvelle LT" dans l\'onglet Lettres de transport',
          'Sélectionnez l\'expéditeur (base logistique Douala/Kribi) et le destinataire (FPSO, plateforme cible)',
          'Ajoutez les articles via le picker catalogue : recherchez par référence, désignation ou code-barres',
          'Pour chaque article, saisissez la quantité, le poids unitaire (pré-rempli depuis le catalogue) et le conditionnement (carton, palette, conteneur)',
          'Si HAZMAT, le système exige la classe IMDG/IATA et le numéro UN — voir workflow dédié',
          'Affectez un voyage TravelWiz (hélicoptère ou bateau) pour le transport — vérification poids vs capacité fret',
          'Validez la LT pour expédition — un BL signé est généré et le cargo passe en statut "Préparation"',
        ],
      },
      {
        title: 'Suivre un cargo',
        requiredAnyPermissions: ['packlog.cargo.read', 'packlog.cargo.track'],
        steps: [
          'Ouvrez l\'onglet "Cargos"',
          'Filtrez par statut (en préparation, en transit, livré)',
          'Cliquez sur un cargo pour voir le détail',
          "L'historique des mouvements est tracé automatiquement",
        ],
        diagram: `graph LR
    A["📦 Préparation"]:::prep --> B["🚚 En transit"]:::transit
    B --> C["📥 Réceptionné"]:::received
    C --> D["✅ Livré"]:::delivered

    classDef prep fill:#475569,stroke:#64748b,color:#fff
    classDef transit fill:#3b82f6,stroke:#60a5fa,color:#fff
    classDef received fill:#8b5cf6,stroke:#a78bfa,color:#fff
    classDef delivered fill:#22c55e,stroke:#4ade80,color:#fff`,
      },
      {
        title: 'Suivre un cargo de la prépa à la livraison',
        requiredAnyPermissions: ['packlog.cargo.track', 'packlog.cargo.read'],
        steps: [
          'Ouvrez l\'onglet "Cargos" — vue Kanban par statut (Préparation, En transit, Réceptionné, Livré) ou liste filtrée',
          'Préparation : le cargo est constitué physiquement à la base, pesé, marqué et photographié — pointage articles vs LT',
          'Transition vers "En transit" : scannez le QR du cargo lors du chargement vecteur — heure et opérateur tracés',
          'En transit : le cargo suit le voyage TravelWiz — sa position GPS est celle du vecteur, ETA mise à jour en continu',
          'Réceptionné : à l\'arrivée site, le destinataire scanne le QR et confirme l\'état (intact, endommagé, manquants)',
          'Livré : signature électronique du destinataire final — le cargo est clos et la LT marquée "Livrée"',
          'L\'historique complet (mouvements, scans, photos, signatures) est consultable dans l\'onglet "Traçabilité" du cargo',
        ],
      },
      {
        title: 'Gestion HAZMAT (matières dangereuses)',
        requiredAnyPermissions: ['packlog.hazmat.handle', 'packlog.lt.create'],
        steps: [
          'Lors de l\'ajout d\'un article HAZMAT à une LT, le formulaire bascule en mode étendu',
          'Renseignez la classe IMDG (transport maritime) ou IATA DGR (transport aérien) — ex: Classe 3 inflammables, Classe 8 corrosifs',
          'Saisissez le numéro UN à 4 chiffres (ex: UN1203 pour essence, UN1830 pour acide sulfurique)',
          'Spécifiez le groupe d\'emballage (I/II/III selon dangerosité) et la quantité nette par colis',
          'Joignez la fiche de données de sécurité (FDS) à jour — obligatoire, refus si manquante',
          'Le système vérifie la compatibilité avec le vecteur (certains hélicos refusent classe 1 explosifs ou 7 radioactifs)',
          'Un BL HAZMAT spécifique est généré (déclaration expéditeur OACI/IMO) et le capitaine reçoit une notification spéciale au briefing',
        ],
      },
    ],
    tips: [
      "Les articles sont liés au catalogue centralisé de l'entité — référence unique, photo, dimensions, poids, classe HAZMAT",
      'Le poids total du cargo est calculé automatiquement à partir des articles et de leur conditionnement',
      'Les LT sont liées aux voyages TravelWiz pour la traçabilité complète (cargo + manifeste fret)',
      'Les alertes notifient automatiquement en cas de retard de livraison ou d\'écart à la réception',
      'Les matières HAZMAT exigent FDS à jour, classification IMDG/IATA, numéro UN et déclaration expéditeur',
      'Le scan QR à chaque transition assure la traçabilité bout-en-bout (horodatage, opérateur, photo)',
    ],
    elementHelp: {
      'packlog.lt.create': 'Crée une nouvelle Lettre de Transport. Sélectionnez expéditeur, destinataire, articles depuis le catalogue et voyage TravelWiz.',
      'packlog.lt.status.draft': 'Brouillon — la LT est en cours de saisie. Articles modifiables, pas encore de cargo physique constitué.',
      'packlog.lt.status.validated': 'Validée — le BL est généré et signé. Le cargo passe automatiquement en statut "Préparation" en base.',
      'packlog.article.catalog': 'Picker catalogue articles — recherche par référence, désignation, code-barres ou catégorie. Affiche stock, poids et HAZMAT.',
      'packlog.article.hazmat': 'Article matière dangereuse — exige classe IMDG/IATA, numéro UN, groupe d\'emballage et FDS jointe.',
      'packlog.cargo.status.preparation': 'Préparation — le cargo est en cours de constitution physique en base. Pointage articles vs LT, pesée et marquage.',
      'packlog.cargo.status.transit': 'En transit — le cargo est embarqué sur le vecteur. Position GPS = celle du vecteur, ETA mise à jour en continu.',
      'packlog.cargo.status.received': 'Réceptionné — le cargo est arrivé sur site et confirmé par le destinataire (intact / endommagé / manquants).',
      'packlog.cargo.status.delivered': 'Livré — signature électronique du destinataire final. Cargo clos, LT marquée Livrée, historique archivé.',
      'packlog.cargo.qr.scan': 'Scan QR du cargo à chaque transition. Horodatage, opérateur et photo capturés pour la traçabilité bout-en-bout.',
      'packlog.cargo.weight.total': 'Poids total du cargo calculé automatiquement (somme articles + conditionnement). Vérifié vs capacité fret du vecteur.',
      'packlog.hazmat.declaration': 'Déclaration expéditeur OACI (aérien) ou IMO (maritime) générée automatiquement pour les cargos HAZMAT. Obligatoire à l\'embarquement.',
      'packlog.delivery.signature': 'Signature électronique du destinataire à la livraison finale. Confirmation visuelle de réception, clôt le cycle de vie du cargo.',
    },
  },
  imputations: {
    title: 'Imputations — Allocation des coûts',
    icon: '💰',
    description:
      'Ventilation des coûts par centre de coûts, projet, activité et entité. Suivi budgétaire et analytique.',
    workflows: [
      {
        title: 'Imputer un coût',
        requiredAnyPermissions: ['imputation.create', 'imputation.read'],
        steps: [
          'Cliquez "+ Nouvelle imputation"',
          'Sélectionnez la référence (projet, activité, voyage)',
          'Choisissez le centre de coûts',
          'Renseignez le montant et la devise',
          'Ajoutez une justification si nécessaire',
          "Validez l'imputation",
        ],
      },
      {
        title: 'Consulter le suivi budgétaire',
        requiredAnyPermissions: ['imputation.report.read', 'imputation.read'],
        steps: [
          'Allez dans l\'onglet "Suivi budgétaire"',
          'Filtrez par période, projet ou centre de coûts',
          'Les indicateurs montrent le budget consommé vs alloué',
          'Exportez le rapport en PDF ou Excel',
        ],
      },
    ],
    tips: [
      'Les imputations sont liées automatiquement aux projets et activités Planner',
      'Le système détecte les dépassements budgétaires et envoie des alertes',
      "Les centres de coûts sont configurés dans les paramètres de l'entité",
      "L'export analytique permet le rapprochement comptable",
    ],
    elementHelp: {},
  },
  papyrus: {
    title: 'Papyrus — Gestion documentaire',
    icon: '📄',
    description:
      'Stockage, classement, versionning et partage des documents. Modèles de documents et génération PDF.',
    workflows: [
      {
        title: 'Déposer un document',
        requiredAnyPermissions: ['papyrus.document.create', 'papyrus.document.upload'],
        steps: [
          'Cliquez "+ Nouveau document" ou glissez-déposez un fichier',
          'Choisissez la catégorie et le classeur',
          'Ajoutez des tags pour faciliter la recherche',
          "Définissez les droits d'accès (public, restreint, confidentiel)",
          'Le document est indexé et disponible immédiatement',
        ],
      },
      {
        title: 'Générer un document depuis un modèle',
        requiredAnyPermissions: ['papyrus.template.use', 'papyrus.document.create'],
        steps: [
          'Allez dans l\'onglet "Modèles"',
          'Sélectionnez un modèle (rapport, formulaire, certificat)',
          'Les données sont pré-remplies depuis le contexte',
          'Complétez les champs manuels',
          'Générez le PDF final',
        ],
      },
    ],
    tips: [
      'La recherche plein texte fonctionne sur le contenu des PDF et documents Office',
      'Les versions précédentes sont conservées et consultables',
      "Les documents peuvent être liés à n'importe quel objet (projet, AdS, tiers)",
      'Les modèles PDF sont personnalisables dans les paramètres',
    ],
    elementHelp: {},
  },
  workflows: {
    title: 'Workflows — Moteur de processus',
    icon: '🔄',
    description:
      "Conception et exécution des workflows de validation. Éditeur visuel drag-and-drop, versioning et délégation.",
    workflows: [
      {
        title: 'Créer un workflow',
        requiredAnyPermissions: ['workflow.design', 'workflow.admin'],
        steps: [
          'Cliquez "+ Nouveau workflow"',
          "Nommez le workflow et choisissez l'objet cible (AdS, projet, etc.)",
          "Utilisez l'éditeur drag-and-drop pour ajouter les étapes",
          'Configurez les conditions de transition',
          'Définissez les approbateurs pour chaque étape',
          'Publiez le workflow (une nouvelle version est créée)',
        ],
        diagram: `graph TD
    A["📝 Conception"]:::design --> B["🔍 Test"]:::test
    B --> C["✅ Publication"]:::published
    C --> D["🔄 Nouvelle version"]:::version
    D --> B

    classDef design fill:#475569,stroke:#64748b,color:#fff
    classDef test fill:#eab308,stroke:#facc15,color:#000
    classDef published fill:#22c55e,stroke:#4ade80,color:#fff
    classDef version fill:#3b82f6,stroke:#60a5fa,color:#fff`,
      },
      {
        title: 'Déléguer une approbation',
        requiredAnyPermissions: ['workflow.delegate', 'workflow.approve'],
        steps: [
          'Ouvrez vos tâches en attente',
          'Cliquez "Déléguer" sur la tâche concernée',
          'Sélectionnez le collègue délégataire',
          'Définissez la durée de la délégation (optionnel)',
          'Le délégataire reçoit une notification',
        ],
      },
    ],
    tips: [
      "Chaque publication crée une nouvelle version, les instances en cours restent sur l'ancienne",
      "La délégation est tracée dans l'audit trail",
      'Les conditions de transition peuvent inclure des règles métier complexes',
      "Les notifications sont envoyées automatiquement à chaque changement d'étape",
    ],
    elementHelp: {},
  },
  entites: {
    title: 'Entités — Gestion des filiales',
    icon: '🌐',
    description:
      'Administration des entités (filiales, pays, divisions). Chaque entité isole ses données opérationnelles.',
    workflows: [
      {
        title: 'Configurer une entité',
        requiredAnyPermissions: ['entity.manage', 'entity.admin'],
        steps: [
          "Sélectionnez l'entité dans la liste",
          "Renseignez les informations légales et l'adresse",
          'Configurez les départements et BU',
          'Définissez les paramètres spécifiques (devise, fuseau horaire)',
          "Affectez les utilisateurs à l'entité",
        ],
      },
    ],
    tips: [
      'Un utilisateur peut être affecté à plusieurs entités',
      "Le changement d'entité active se fait via le sélecteur en haut de page",
      'Les données sont strictement isolées entre entités (filtrage par entity_id)',
      "Les paramètres globaux du tenant s'appliquent à toutes les entités sauf override",
    ],
    elementHelp: {},
  },
  support: {
    title: 'Support & Feedback',
    icon: '🎫',
    description:
      'Tickets de support, signalements de bugs, annonces et communication.',
    workflows: [
      {
        title: 'Signaler un bug',
        requiredPermission: 'support.ticket.create',
        steps: [
          'Cliquez le bouton 💬 en bas à droite',
          'Choisissez "Bug"',
          'Décrivez le problème (min. 20 caractères)',
          "Ajoutez une capture d'écran si possible",
          'Le log console est automatiquement joint',
        ],
      },
    ],
    tips: [
      "Les captures d'écran masquent automatiquement le widget feedback",
      "L'enregistrement vidéo permet de montrer les étapes de reproduction",
    ],
    elementHelp: {},
  },
  settings: {
    title: 'Paramètres',
    icon: '⚙️',
    description:
      "Configuration du profil, de l'application, des intégrations et des modules.",
    workflows: [],
    tips: [
      'Les modèles PDF permettent de personnaliser les exports',
      "Les modèles d'emails sont configurables par événement",
      'La délégation permet de confier ses droits à un collègue',
    ],
    elementHelp: {},
  },
}
