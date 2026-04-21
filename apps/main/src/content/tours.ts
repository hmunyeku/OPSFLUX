/**
 * Guided tours — module-aware walkthroughs rendered by
 * `AssistantPanel` → `ToursTab`.
 *
 * Each tour defines a series of steps anchored to DOM elements via
 * their `data-tour` attribute (or a CSS selector fallback). The panel
 * renders a spotlight overlay with a tooltip at each step.
 *
 * Keep this file data-only — no React, no hooks. It is imported once
 * when the panel renders the tours list, and once by the auto-launch
 * effect that kicks in at first login (AUP §7.2 onboarding hook).
 */

export interface TourStep {
  /** `data-tour` attribute value OR a CSS selector. */
  target: string
  title: string
  content: string
}

export interface GuidedTour {
  id: string
  title: string
  description: string
  /** `null` = global (applies to every module). */
  module: string | null
  steps: TourStep[]
}

export const GUIDED_TOURS: GuidedTour[] = [
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
  {
    id: 'moc-basics',
    title: 'Premiers pas avec MOCtrack',
    description: 'Gestion des demandes de modification (Management of Change).',
    module: 'moc',
    steps: [
      { target: 'main-content', title: 'Vos MOC', content: 'La liste affiche toutes les demandes de modification que vous pouvez voir. Filtrez par statut ou sélectionnez "Mes MOC" pour ne voir que ceux dont vous êtes chef de projet.' },
      { target: 'search-bar', title: 'Recherche MOC', content: 'Tapez un code (ex. MOC-2026-001), un titre, ou un nom de plateforme pour retrouver rapidement un MOC.' },
      { target: 'main-content', title: 'Workflow', content: 'Chaque MOC suit un workflow : Création → Chef de site → Direction → Étude Process → Validations → Exécution → Clôture. Les signatures et validations obligatoires sont indiquées à chaque étape.' },
      { target: 'assistant-button', title: 'Aide contextuelle', content: 'Depuis n\'importe quel MOC, rouvrez ce panel (onglet Aide) pour retrouver les rappels sur les étapes du workflow.' },
    ],
  },
  {
    id: 'planner-basics',
    title: 'Premiers pas avec Planner',
    description: 'Planification de charge, Gantt et what-if.',
    module: 'planner',
    steps: [
      { target: 'main-content', title: 'Vue Gantt', content: 'Le Gantt affiche toutes les activités planifiées dans le temps. Glissez-déposez pour déplacer, redimensionnez les bords pour changer la durée, double-cliquez pour éditer.' },
      { target: 'main-content', title: 'Heatmap de capacité', content: 'La heatmap montre la saturation par ressource — rouge = surcharge. Les scénarios "what-if" permettent de tester une modification sans toucher au plan en cours.' },
      { target: 'sidebar', title: 'Projets liés', content: 'Les activités du Planner sont alimentées par les projets. Configurer un projet dans le module Projets déclenche automatiquement la création des activités.' },
    ],
  },
  {
    id: 'travelwiz-basics',
    title: 'Premiers pas avec TravelWiz',
    description: 'Planification des voyages et suivi en temps réel.',
    module: 'travelwiz',
    steps: [
      { target: 'main-content', title: 'Vos voyages', content: 'La liste affiche les voyages passés, en cours et à venir avec départs, arrivées et passagers. Cliquez pour voir le détail et l\'état du cargo associé.' },
      { target: 'search-bar', title: 'Recherche voyage', content: 'Cherchez par code voyage, base de départ, destination ou vecteur (avion, bateau…) pour filtrer rapidement.' },
      { target: 'main-content', title: 'Portail capitaine', content: 'Pendant l\'exécution, le capitaine se connecte au portail dédié avec un code à 6 chiffres pour enregistrer POB, départ, arrivée et événements météo en mode dégradé hors-ligne.' },
    ],
  },
  {
    id: 'packlog-basics',
    title: 'Premiers pas avec PackLog',
    description: 'Demandes d\'expédition et suivi cargo.',
    module: 'packlog',
    steps: [
      { target: 'main-content', title: 'Demandes d\'expédition', content: 'Toutes les demandes d\'expédition et leurs colis sont ici. Une demande peut contenir plusieurs colis qui seront répartis sur différents voyages.' },
      { target: 'search-bar', title: 'Recherche cargo', content: 'Par code, site d\'enlèvement, destination, ou projet lié — retrouvez rapidement un colis ou une demande.' },
      { target: 'main-content', title: 'Enlèvement & preuves', content: 'À chaque colis, vous pouvez joindre bon de pesée, photos, ticket HAZMAT et preuves d\'enlèvement. Les informations se propagent automatiquement sur le voyage associé côté TravelWiz.' },
    ],
  },
  {
    id: 'papyrus-basics',
    title: 'Premiers pas avec Papyrus',
    description: 'Génération de PDF à partir de modèles et de données.',
    module: 'papyrus',
    steps: [
      { target: 'main-content', title: 'Catalogue de documents', content: 'Papyrus regroupe vos modèles PDF (AdS, rapports, bons de livraison, MOC…). Chaque modèle est un formulaire structuré qu\'on peut réutiliser avec des données métier.' },
      { target: 'main-content', title: 'Version brouillon / publié', content: 'Un modèle a des révisions : vous travaillez sur un brouillon, puis vous publiez pour le mettre à disposition. Les anciennes versions restent consultables.' },
      { target: 'sidebar', title: 'Intégration avec les modules', content: 'Depuis MOC, PackLog, PaxLog ou TravelWiz, un bouton "PDF" appelle directement le modèle Papyrus approprié avec les données pré-remplies.' },
    ],
  },
  {
    id: 'conformite-basics',
    title: 'Premiers pas avec Conformité',
    description: 'Suivi des certifications, visites médicales et habilitations.',
    module: 'conformite',
    steps: [
      { target: 'main-content', title: 'Vue conformité', content: 'Le tableau croise utilisateurs × fiches de poste × exigences : une pastille verte signale conforme, orange = expire bientôt, rouge = expiré.' },
      { target: 'search-bar', title: 'Recherche conformité', content: 'Cherchez un utilisateur, un type de certification, ou un statut (expirés, en retard…) pour isoler ce qui demande attention.' },
      { target: 'main-content', title: 'Records & exemptions', content: 'Chaque preuve (certificat scanné, date, validité) est un record. Les exemptions permettent de déroger ponctuellement à une règle avec justification et date de fin.' },
    ],
  },
  {
    id: 'assets-basics',
    title: 'Premiers pas avec Asset Registry',
    description: 'Hiérarchie des installations, équipements et références.',
    module: 'assets',
    steps: [
      { target: 'main-content', title: 'Arborescence', content: 'Le registre d\'actifs structure vos champs / plateformes / installations / équipements en une seule hiérarchie partagée par tous les modules (Planner, PaxLog, Conformité…).' },
      { target: 'search-bar', title: 'Recherche actif', content: 'Tapez un nom, un code, ou filtrez par type pour retrouver l\'actif concerné.' },
      { target: 'main-content', title: 'Capacités & POB', content: 'Chaque site a une capacité maximale (POB) qui alimente automatiquement les vérifications dans PaxLog — un dépassement bloque la validation des AdS.' },
    ],
  },
  {
    id: 'support-basics',
    title: 'Signaler un problème ou poser une question',
    description: 'Bugs, améliorations, questions — tout passe par ce même flux.',
    module: 'support',
    steps: [
      { target: 'assistant-button', title: 'Le panel d\'assistance', content: 'Ce bouton (ou le raccourci clavier) ouvre l\'assistant OpsFlux. L\'onglet Ticket regroupe tout ce qu\'il faut pour signaler un problème sans quitter votre page.' },
      { target: 'main-content', title: 'Mes tickets', content: 'La page Support liste tous vos tickets avec leur statut (Nouveau, En cours, Résolu). Cliquez pour voir l\'échange, les pièces jointes et les notes de résolution.' },
      { target: 'assistant-button', title: 'Capture d\'écran + vidéo', content: 'Depuis l\'onglet Ticket du panel, vous pouvez joindre une capture d\'écran, un enregistrement vidéo, ou un fichier. Les bugs embarquent en plus un log console auto-capturé — très utile pour le support.' },
    ],
  },
  {
    id: 'tiers-basics',
    title: 'Premiers pas avec les Tiers',
    description: 'Annuaire unifié : entreprises, sous-traitants, fournisseurs, contacts.',
    module: 'tiers',
    steps: [
      { target: 'main-content', title: 'Entreprises & contacts', content: 'Le module Tiers centralise toutes vos relations externes : clients, sous-traitants, fournisseurs, partenaires. Chaque entreprise a sa fiche, ses adresses, ses identifiants légaux et ses contacts.' },
      { target: 'search-bar', title: 'Recherche rapide', content: 'Tapez un nom, un code (TIR-YYYY-NNNN), un SIRET ou un domaine pour retrouver instantanément une entreprise. Ctrl+K ouvre la palette globale.' },
      { target: 'main-content', title: 'Blocage & conformité', content: 'Un tier peut être bloqué (ne plus apparaître dans les sélecteurs) ou associé à des exigences de conformité (assurance, KYC). Les règles vivent dans l\'onglet Conformité.' },
    ],
  },
  {
    id: 'workflow-basics',
    title: 'Premiers pas avec les Workflows',
    description: 'Visualiser et configurer les chaînes d\'approbation.',
    module: 'workflow',
    steps: [
      { target: 'main-content', title: 'Définitions de workflow', content: 'Chaque module (ADS, MOC, Cargo…) peut être régi par un workflow. Une définition décrit les états possibles, les transitions permises et qui peut les déclencher.' },
      { target: 'main-content', title: 'Steps & assignations', content: 'Un step représente un nœud : qui valide, dans quel délai, avec quelle action (approuver / rejeter / demander des compléments). Les assignations peuvent être nominatives, par rôle, ou dynamiques (hiérarchie, manager, responsable site).' },
      { target: 'main-content', title: 'Instances en cours', content: 'L\'onglet Instances montre toutes les demandes en cours d\'approbation : qui doit agir, depuis quand, quel retard. C\'est votre vue "corbeille globale" des décisions en attente.' },
    ],
  },
  {
    id: 'dashboard-basics',
    title: 'Personnaliser votre Tableau de bord',
    description: 'Widgets, disposition, partage entre équipes.',
    module: 'dashboard',
    steps: [
      { target: 'main-content', title: 'Widgets modulaires', content: 'Le dashboard est composé de widgets autonomes. Chaque module expose les siens (KPIs PaxLog, courbe Conformité, carte PackLog…). Vous pouvez les mélanger librement.' },
      { target: 'main-content', title: 'Mode édition', content: 'Le bouton "Modifier" active le mode édition : glissez-déposez, redimensionnez, ajoutez depuis le catalogue, ou retirez les widgets non pertinents. Chaque utilisateur a sa propre disposition.' },
      { target: 'main-content', title: 'Rafraîchissement', content: 'Les widgets se rafraîchissent en arrière-plan. Pour un refresh forcé, utilisez l\'icône circulaire sur le widget concerné.' },
    ],
  },
  {
    id: 'imputations-basics',
    title: 'Premiers pas avec les Imputations',
    description: 'Plan analytique : BU, entités, centres de coût, références budgétaires.',
    module: 'imputations',
    steps: [
      { target: 'main-content', title: 'Arbre analytique', content: 'Les Imputations structurent votre plan de coûts : BU → entité → centre de coût → référence. Toutes les saisies de PaxLog, PackLog, Planner y pointent pour alimenter le reporting financier.' },
      { target: 'search-bar', title: 'Rechercher une référence', content: 'Cherchez par code ou par libellé. Les références inactives ne remontent pas dans les formulaires — désactivez plutôt que supprimer pour conserver l\'historique.' },
      { target: 'main-content', title: 'Imports CSV', content: 'Pour initialiser ou mettre à jour en masse, utilisez l\'import CSV : un template pré-rempli est disponible et le système détecte doublons et références orphelines avant commit.' },
    ],
  },
  {
    id: 'settings-basics',
    title: 'Naviguer dans les Paramètres',
    description: 'RBAC, dictionnaires, intégrations, modèles d\'e-mail et PDF.',
    module: 'settings',
    steps: [
      { target: 'main-content', title: 'Permissions & rôles', content: 'L\'onglet RBAC liste tous les rôles et leurs permissions. Un rôle est un sac de permissions ; assignez-le à un utilisateur ou à un groupe. Les permissions wildcard (*) réservent l\'accès total aux administrateurs.' },
      { target: 'main-content', title: 'Dictionnaires configurables', content: 'Catégories de visite, modes de transport, classifications HAZMAT… ces listes vivent dans l\'onglet Dictionnaire et sont traduites par langue. Modifier une valeur se répercute instantanément dans tous les formulaires.' },
      { target: 'main-content', title: 'Modèles e-mail & PDF', content: 'Personnalisez les notifications et les exports PDF avec votre charte : logo, couleurs, variables Jinja. Les templates supportent les traductions par langue (fallback FR).' },
    ],
  },
]
