# Analyse Fonctionnelle Complète — Module Projets

## 1. Vue d'ensemble du module

Le module Projets est le **référentiel des projets de l'entreprise**. Il sert de source de données amont pour tous les autres modules : Planner consomme les projets pour créer des fenêtres d'activité, PaxLog les utilise pour les imputations d'AdS, TravelWiz pour imputer le cargo.

Il est important de comprendre ce que le module Projets **ne fait pas** : il ne gère pas le scheduling détaillé des activités sur les assets (c'est Planner), ni les mobilisations de personnes (c'est PaxLog), ni la logistique (c'est TravelWiz). Il gère les projets en tant qu'entités avec leurs paramètres (budget, planning, WBS, statut) et sert de référentiel partagé.

---

## 2. Gestion du cycle de vie d'un projet

### 2.1 Création d'un projet

**Qui peut créer ?** Tout utilisateur avec le rôle `PROJ_MGR` ou `DO`.

**Processus de création :**
1. L'utilisateur saisit les informations de base : code projet (unique), nom, type, description, responsable, département, dates prévues, priorité.
2. Le système vérifie l'unicité du code projet au niveau de l'entité.
3. Le projet est créé en statut `draft`.
4. Un WBS racine est automatiquement créé avec le code du projet.

**Types de projet :**

Les types de projet disponibles sont :
- `capital` : projet d'investissement
- `opex` : projet de dépenses opérationnelles
- `maintenance` : projet de maintenance structurée
- `inspection` : campagne d'inspection
- `study` : étude technique ou ingénierie
- `workover` : intervention sur puits existant (re-completion, stimulation, fishing)
- `drilling` : forage de nouveau puits — rattaché au module Planner pour la réservation de rig

Chaque type peut avoir des champs spécifiques et un workflow de validation adapté.

**Particularités :**
- Le code projet est **immuable** une fois créé. Si une erreur est faite, il faut archiver et recréer.
- La priorité initiale (`critical`, `high`, `medium`, `low`) est héritée par les activités Planner créées pour ce projet. Le DO peut la surcharger dans Planner sans modifier le projet.
- Le responsable (`owner_id`) est l'interlocuteur principal du projet. Il n'est pas nécessairement le créateur.
- Si aucune date n'est renseignée, le projet est un projet "ouvert" sans horizon temporel.

### 2.2 Transitions de statut

```
draft → active       : Le chef de projet lance officiellement le projet
active → on_hold     : Mise en pause (raison obligatoire)
on_hold → active     : Reprise du projet
active → completed   : Clôture définitive (raison obligatoire)
* → cancelled        : Annulation depuis n'importe quel statut (raison obligatoire)
```

**Règles importantes :**

- Passer un projet en `cancelled` ou `completed` déclenche l'événement `project.status_changed` → PaxLog est notifié et affiche un avertissement sur les AdS liées en `draft` ou `submitted`.
- Un projet `cancelled` ou `completed` n'apparaît plus dans les listes de sélection de Planner pour créer de nouvelles activités.
- Un projet archivé (suppression logique) reste accessible via ses références dans PaxLog, TravelWiz et Planner pour l'historique.
- Toute transition de statut est historisée dans `project_status_history` avec : ancien statut, nouveau statut, raison, auteur, horodatage.

### 2.3 Modification d'un projet actif

**Qui peut modifier ?** Le `PROJ_MGR` responsable du projet, le `DO`.

**Ce qui peut être modifié :**
- Nom, description, dates prévues, priorité, département, responsable
- Budget (via les nœuds WBS)

**Ce qui ne peut pas être modifié :**
- Code projet (immuable)
- Statut sans passer par la machine d'état

**Impact des modifications :**
- Modifier les dates du projet n'affecte pas automatiquement les activités Planner. C'est informatif pour le chef de projet.
- Modifier la priorité du projet ne propage pas automatiquement aux activités Planner existantes. Le DO peut choisir de le faire manuellement dans Planner.

---

## 3. Structure WBS (Work Breakdown Structure)

### 3.1 Concept

Le WBS est la décomposition hiérarchique du projet en livrables et sous-livrables. Chaque nœud WBS peut avoir un centre de coût associé, ce qui permet l'imputation budgétaire.

**Structure :** Arborescence libre, profondeur illimitée.

Exemple :
```
1.0 Projet GCM (racine automatique)
├── 1.1 Phase Ingénierie
│   ├── 1.1.1 Études de base
│   └── 1.1.2 FEED
├── 1.2 Phase Construction
│   ├── 1.2.1 Génie civil
│   ├── 1.2.2 Mécanique
│   └── 1.2.3 Électricité
└── 1.3 Phase Commissioning
```

### 3.2 Création et gestion des nœuds WBS

**Processus :**
1. Le chef de projet navigue dans l'arborescence du projet.
2. Il sélectionne un nœud parent.
3. Il saisit le code (ex: `1.2.1`), le nom, le centre de coût associé, le budget estimé et la devise.
4. Le nœud est créé immédiatement — pas de workflow de validation.

**Particularités :**
- Le code WBS est unique **par projet**. Deux projets peuvent avoir le même code WBS.
- Un nœud WBS peut ne pas avoir de centre de coût (pour les nœuds de regroupement purs).
- Les nœuds WBS avec des AdS PaxLog ou des activités Planner qui les référencent ne peuvent pas être supprimés — seulement désactivés.
- Supprimer un nœud parent supprime tous ses enfants (cascade) — uniquement si aucun des enfants n'est référencé ailleurs.
- Le budget estimé est indicatif. Il n'y a pas de contrôle budgétaire automatique (pas de blocage si dépassement).

### 3.3 Relation WBS ↔ PaxLog

Quand une AdS PaxLog référence un projet, elle peut aussi référencer un nœud WBS spécifique pour l'imputation. Ceci permet de savoir quelle partie du projet "consomme" des jours-PAX.

**Règles :**
- Si un nœud WBS est sélectionné dans une AdS, il doit appartenir au projet sélectionné (validation côté API).
- Le centre de coût de l'AdS peut être différent de celui du nœud WBS : c'est la notion de "cross imputation" — on vient pour le projet X mais on impute sur le CC Y.

---

## 4. Planning du projet (Module Projets)

### 4.1 Distinction avec Planner

Le Module Projets possède son propre planning (tâches, dépendances, chemin critique) — c'est le planning **interne au projet**. Il est différent du module Planner qui gère les fenêtres d'occupation des assets.

- **Planning Projets** : "Qu'est-ce qu'on fait et quand ?" — vision chef de projet
- **Planner** : "Qui occupe quel site et pendant combien de temps ?" — vision opérations

La passerelle entre les deux : le chef de projet peut "pousser" des tâches du planning projet vers Planner comme fenêtres d'activité.

### 4.2 Versioning du planning

Le planning d'un projet est versionné. Chaque version est un snapshot complet de toutes les tâches et dépendances.

**Statuts d'une version :**
```
simulation → draft → active → archived
```

- `simulation` : version temporaire en mémoire (Redis, TTL 4h). Permet d'explorer des scénarios sans rien persister.
- `draft` : version persistée mais non active. Peut coexister plusieurs drafts.
- `active` : la version de référence du projet. Une seule version active à la fois (contrainte UNIQUE).
- `archived` : ancienne version active, archivée lors d'une activation d'une nouvelle version.

**Règle d'activation :**
- Activer une version `draft` archive automatiquement la version précédemment active.
- L'activation émet l'événement `project.schedule_updated` vers Planner avec le diff des tâches modifiées.
- Une baseline est automatiquement enregistrée à chaque activation (dates de référence pour le suivi des écarts).

### 4.3 Simulations de planning (TTL 4h)

**Objectif :** Permettre au chef de projet d'explorer des scénarios de décalage ("que se passe-t-il si je décale cette tâche de 3 semaines ?") sans rien persister.

**Processus :**
1. Le chef de projet clique "Simuler" depuis la vue Gantt.
2. Une simulation est créée en base (statut `simulation`) basée sur la version active.
3. Le chef de projet modifie les tâches dans l'interface — chaque modification met à jour la simulation (pas la version active).
4. Le recalcul CPM est exécuté côté client (TypeScript) en temps réel pour chaque modification.
5. Le chef de projet voit l'impact en cascade : tâches déplacées, nouveau chemin critique, comparaison avec la baseline.
6. S'il valide, la simulation devient un nouveau `draft` qui peut être activé.
7. S'il annule ou si la TTL expire, la simulation est supprimée. Rien n'a changé.

**Particularité :** La simulation n'a pas de statut dans les autres modules — PaxLog et TravelWiz ne voient jamais une simulation, seulement la version active.

### 4.4 Gestion des tâches

**Types de tâches :**
- `task` : tâche normale avec durée, ressources, dates
- `summary` : tâche récapitulative (groupe) — ses dates sont calculées depuis ses enfants
- `milestone` : jalons — durée = 0, date unique

**Contraintes sur les tâches :**
- `as_soon_as_possible` (défaut) : la tâche démarre dès que ses prédécesseurs sont terminés
- `must_start_on` : démarre exactement à une date fixe
- `must_finish_on` : termine exactement à une date fixe
- `start_no_earlier_than` : peut démarrer au plus tôt à cette date
- `finish_no_later_than` : deadline douce — signalée si dépassée

**Ressources PAX sur une tâche :**
Chaque tâche peut avoir des ressources PAX associées (`task_resources`) :
- **Ressource nominative** : un PAX spécifique (`pax_id`)
- **Ressource par rôle** : "il faut 2 ingénieurs de procédé"
- **Ressource équipe** : "toute l'équipe E-LINE"

Le `pax_estimated` de la tâche est le nombre de PAX nécessaires par jour (ou total selon `pax_unit`). Ce chiffre alimente la fenêtre d'activité dans Planner quand la tâche est "poussée" vers Planner.

### 4.5 Moteur CPM (Critical Path Method)

**Principe :** Le CPM calcule, pour chaque tâche, les dates au plus tôt (early start/finish) et au plus tard (late start/finish), ainsi que la marge totale (total float). Les tâches à marge nulle forment le chemin critique.

**Implémentation :**
- Côté client (TypeScript) : recalcul en temps réel à chaque modification, pour l'interactivité
- Côté serveur (Python) : recalcul validé et persisté lors de l'activation d'une version

**Formules :**
```
Forward pass :
  ES(tâche) = max(EF des prédécesseurs) + lag
  EF(tâche) = ES + durée

Backward pass :
  LF(tâche) = min(LS des successeurs) - lag
  LS(tâche) = LF - durée

Total float = LS - ES = LF - EF
Critique si total float = 0
```

**Dépendances inter-projets :**

Les liens de dépendance peuvent traverser les frontières d'un projet (dépendances inter-projets) :
- Exemple : la tâche "Mise en service" du projet A dépend de "Fin de construction" du projet B
- Visibilité dans le Gantt : les tâches externes sont affichées en gris avec le nom du projet source
- Notifications automatiques au chef de projet B si un décalage dans le projet A impacte ses tâches
- Le chemin critique peut traverser plusieurs projets (CPM inter-projets)

**Détection de cycles :** Avant d'ajouter un lien de dépendance (intra-projet ou inter-projets), le serveur vérifie l'absence de cycle (algorithme DFS). Si un cycle est détecté → erreur 409 `DEPENDENCY_CYCLE`.

**Types de liens :**
- `FS` (Finish-to-Start) : successeur ne démarre qu'après la fin du prédécesseur (le plus courant)
- `SS` (Start-to-Start) : les deux démarrent ensemble (+ lag optionnel)
- `FF` (Finish-to-Finish) : les deux finissent ensemble
- `SF` (Start-to-Finish) : rare, successeur finit quand le prédécesseur démarre

**Lag :** Délai en jours (positif = attente entre les tâches, négatif = chevauchement). L'unité peut être `working_days` ou `calendar_days`.

---

## 5. Vues et interfaces du module Projets

### 5.1 Liste des projets

**Filtres disponibles :** statut, type, responsable, département, priorité, période (dates chevauchantes).

**Colonnes affichées :** code, nom, statut (badge coloré), type, responsable, dates prévues, avancement (%), priorité.

**Tri par défaut :** projets actifs en premier, par priorité décroissante, puis par date de début.

**Actions rapides depuis la liste :** voir le détail, changer le statut, dupliquer un projet.

### 5.2 Fiche projet

**Onglets :**
1. **Informations générales** : tous les attributs du projet, historique des statuts
2. **WBS / Budget** : arborescence interactive, budget par nœud, total estimé vs engagé
3. **Planning (Gantt)** : vue Gantt interactive avec tâches, dépendances, chemin critique
4. **Activités Planner** : liste des fenêtres d'activité créées dans Planner pour ce projet
5. **AdS en cours** : liste des Avis de Séjour PaxLog liés à ce projet
6. **Cargo** : liste des colis TravelWiz liés à ce projet

### 5.3 Vue Gantt

**Fonctionnalités :**
- Barre de temps (semaine/mois/trimestre/année) switchable
- Drag & drop des tâches pour déplacer les dates (déclenche recalcul CPM)
- Clic sur une tâche → panneau latéral avec détail, ressources, précédesseurs/successeurs
- Chemin critique mis en évidence (barres rouges)
- Baseline affichée en transparence sous les barres actuelles (comparaison)
- Zoom in/out sur la timeline
- Filtre par ressource PAX
- Export PNG/PDF du Gantt

**Barre de progression :** chaque tâche affiche son avancement (%) soit saisi manuellement, soit calculé depuis les tâches filles (pour les summary).

### 5.4 Vue PERT (Phase 2)

Vue réseau orienté montrant les dépendances entre tâches. Utile pour identifier visuellement le chemin critique dans les projets complexes.

---

## 6. Export SAP (imputations)

### 6.1 Objectif

Générer un fichier CSV importable dans SAP pour saisir les imputations des dépenses (jours-PAX, cargo) sur les centres de coût des projets.

### 6.2 Processus

1. L'utilisateur (`PROJ_MGR` ou `DO`) sélectionne un projet et une période.
2. Le système agrège toutes les imputations PaxLog (AdS approuvées) et TravelWiz (cargo imputé) pour ce projet sur la période.
3. Un CSV est généré avec le mapping de colonnes configuré dans `sap_export_configs`.
4. Le fichier est téléchargé ou envoyé par email.

**Colonnes typiques du CSV SAP :** centre de coût, ordre interne, compte de charge, quantité, unité, montant, libellé, date comptable.

**Particularité :** Le mapping est configurable par entité et par type d'export. Perenco Cameroun peut avoir un mapping SAP différent de Perenco Congo. L'administrateur configure les colonnes dans `sap_export_configs`.

---

## 7. Interactions inter-modules depuis Projets

### 7.1 Projets → Planner

Quand un chef de projet "pousse" des tâches vers Planner :
1. Il sélectionne une ou plusieurs tâches feuilles dans le Gantt.
2. Il choisit l'asset cible (où l'activité se déroulera).
3. Le système crée une `Activity` dans Planner avec :
   - `type = project`
   - `project_id` = le projet
   - `title` = nom de la tâche
   - `start_date` / `end_date` = dates de la tâche (ou dates saisies manuellement)
   - `pax_quota` = `task.pax_estimated`
   - `priority` = priorité du projet
4. L'activité est créée en statut `draft` dans Planner.
5. Le chef de projet doit ensuite la soumettre dans Planner pour démarrer le workflow de validation.

**Événement :** Quand une version de planning est activée → `project.schedule_updated` émis vers Planner avec la liste des tâches modifiées et leur nouvel état (pour synchroniser les activités Planner liées).

### 7.2 Projets → TravelWiz (imputation cargo sur nœud WBS)

Les colis cargo (TravelWiz) peuvent être imputés sur un projet et un nœud WBS pour le suivi des coûts logistiques :
- Chaque mouvement cargo avec imputation projet génère une ligne de coût dans le suivi budgétaire du nœud WBS
- Événement `cargo.delivered` avec payload `{project_id, wbs_node_id, cost}` → mis à jour dans le coût réel du WBS
- Le budget estimé du nœud WBS intègre ainsi à la fois les jours-PAX (via PaxLog) et les coûts logistiques (via TravelWiz)

### 7.3 Projets → PaxLog

Quand un projet change de statut (`cancelled`, `completed`) → `project.status_changed` émis vers PaxLog.

PaxLog réagit :
- Pour les AdS en `draft`/`submitted` liées à ce projet : ajout d'un bandeau d'alerte visible ("Le projet associé a été annulé/terminé. Vérifier la pertinence de cette demande.").
- Pour les AdS approuvées/en cours : pas d'action automatique, journalisation uniquement.

---

## 8. Permissions et RBAC détaillé

| Action | DO | PROJ_MGR (propriétaire) | PROJ_MGR (autre) | READER |
|---|---|---|---|---|
| Créer un projet | ✓ | ✓ | ✓ | ✗ |
| Voir tous les projets | ✓ | ✓ | ✓ | ✓ |
| Modifier un projet | ✓ | ✓ | ✗ | ✗ |
| Changer statut | ✓ | ✓ | ✗ | ✗ |
| Gérer le WBS | ✓ | ✓ | ✗ | ✗ |
| Gérer le planning | ✓ | ✓ | ✗ | ✗ |
| Activer une version | ✓ | ✓ | ✗ | ✗ |
| Exporter SAP | ✓ | ✓ | ✗ | ✗ |
| Pousser vers Planner | ✓ | ✓ | ✗ | ✗ |
| Archiver un projet | ✓ | ✓ | ✗ | ✗ |

**Note :** Un `PROJ_MGR` sans être le propriétaire peut voir le projet mais ne peut pas le modifier. Il peut toutefois créer des AdS PaxLog qui le référencent s'il a le rôle `REQUESTER`.
