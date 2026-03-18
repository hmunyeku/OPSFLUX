# Cahier des Charges Fonctionnel — Module Projets

> Ce document décrit la gestion des projets : cycle de vie, structure WBS,
> planning, collaboration et interactions avec les autres modules OpsFlux.

---

## Sommaire

1. [Rôle et positionnement](#1-rôle-et-positionnement)
2. [Cycle de vie d'un projet](#2-cycle-de-vie-dun-projet)
3. [Structure WBS et budget](#3-structure-wbs-et-budget)
4. [Planning et tâches](#4-planning-et-tâches)
5. [Chemin critique (CPM)](#5-chemin-critique-cpm)
6. [Vues et interfaces](#6-vues-et-interfaces)
7. [Collaboration sur les tâches](#7-collaboration-sur-les-tâches)
8. [Interactions avec les autres modules](#8-interactions-avec-les-autres-modules)
9. [Permissions](#9-permissions)

---

## 1. Rôle et positionnement

Le module Projets est le **référentiel des projets de l'entreprise**. Il répond aux questions : "Quels projets sont en cours ? Qui en est responsable ? Quelle est leur structure de livraison et leur avancement ?"

Ce module couvre la gestion documentaire des projets (structure, budget, planning). Il **ne gère pas** :
- La planification des fenêtres d'occupation des sites (c'est le module Planner)
- La mobilisation des personnes sur site (c'est PaxLog)
- La logistique transport et cargo (c'est TravelWiz)

Ces modules se nourrissent du référentiel Projets. Un chef de projet crée son projet ici, puis planifie les activités terrain dans Planner, et les personnes nécessaires sont demandées via PaxLog.

---

## 2. Cycle de vie d'un projet

### 2.1 Création

Un chef de projet ou le DO crée un projet en renseignant :
- Un **code unique** (ex : GCM-2026, FORAGE-MJ20) — immuable une fois créé
- Un nom, un type (projet / workover / forage / intégrité / maintenance / inspection)
- Un responsable principal
- Des dates prévisionnelles de début et de fin (optionnelles)
- Une priorité : critique, haute, moyenne, faible
- Un département d'appartenance

Le projet démarre en statut **brouillon** (draft) jusqu'à son lancement officiel.

### 2.2 Statuts et transitions

```
Brouillon → Actif        (le chef de projet lance officiellement)
Actif → En pause         (raison obligatoire)
En pause → Actif         (reprise)
Actif → Terminé          (clôture, raison obligatoire)
* → Annulé               (depuis n'importe quel statut, raison obligatoire)
```

**Conséquences d'une clôture ou annulation :**
- Le projet disparaît des listes de sélection (on ne peut plus créer de nouvelles activités ou AdS pour ce projet)
- Les AdS PaxLog en brouillon liées à ce projet affichent un avertissement
- L'historique complet est conservé

Toute transition de statut est enregistrée avec la raison, l'auteur et la date.

### 2.3 Modification d'un projet actif

Le code projet est immuable. Tout le reste peut être modifié par le responsable ou le DO : nom, dates, priorité, responsable, département.

Modifier les dates du projet n'affecte pas automatiquement les tâches ou les activités Planner — c'est informatif. Le chef de projet doit répercuter manuellement si nécessaire.

---

## 3. Structure WBS et budget

### 3.1 Qu'est-ce que le WBS ?

Le WBS (Work Breakdown Structure) est la **décomposition hiérarchique du projet en livrables**. C'est la colonne vertébrale du projet, utilisée pour organiser le travail, imputer les dépenses, et suivre l'avancement.

Chaque nœud WBS représente une partie du projet (phase, livrable, tâche). L'arbre peut être aussi profond que nécessaire.

Exemple pour un projet de forage :
```
GCM-2026 (racine créée automatiquement)
├── 1.1 Préparation du chantier
│   ├── 1.1.1 Mobilisation équipements
│   └── 1.1.2 Sécurisation de la zone
├── 1.2 Forage
│   ├── 1.2.1 Phase superficielle
│   └── 1.2.2 Phase intermédiaire
└── 1.3 Complétion
    ├── 1.3.1 Tests de puits
    └── 1.3.2 Mise en production
```

### 3.2 Centre de coût et budget

Chaque nœud WBS peut être associé à un centre de coût SAP et avoir un budget estimé. Cela permet de répondre à la question : "Combien de dépenses devrait-on imputer sur chaque partie du projet ?"

Le suivi du budget réalisé vient de SAP — OpsFlux ne suit que l'estimé. La comparaison estimé vs réalisé est présentée dans les exports SAP.

### 3.3 Imputation des dépenses

Quand une AdS PaxLog ou un colis TravelWiz référence ce projet, l'utilisateur peut préciser le nœud WBS et le centre de coût pour l'imputation. Cela permet de savoir, par exemple, que 3 jours de présence d'un soudeur sont imputés sur "1.2 Forage" et non sur le projet global.

---

## 4. Planning et tâches

### 4.1 Les tâches du projet

Le planning d'un projet est composé de tâches. Trois types de tâches existent :
- **Tâche normale** : a une durée, des ressources, des dépendances
- **Tâche récapitulative** : groupe d'autres tâches ; ses dates sont calculées automatiquement depuis ses enfants
- **Jalon** : marqueur sans durée (ex : "Livraison FEED", "Décision d'investissement")

### 4.2 Assignations et responsabilités

Chaque tâche peut être assignée à un ou plusieurs membres du projet. Quand une tâche est assignée, l'assigné reçoit une notification. Des rappels automatiques sont envoyés à J-7 et J-1 avant l'échéance.

L'avancement (%) de chaque tâche est saisi manuellement ou calculé automatiquement depuis les tâches filles.

### 4.3 Dépendances entre tâches

Les tâches peuvent avoir des relations de dépendance :
- **Fin → Début** (le plus courant) : B ne peut démarrer qu'après la fin de A
- **Début → Début** : A et B démarrent ensemble
- **Fin → Fin** : A et B se terminent ensemble
- **Début → Fin** : rare

Un délai (lag) peut s'ajouter sur chaque dépendance. Par exemple : "Attendre 5 jours après la fin de A avant de démarrer B".

OpsFlux détecte automatiquement les **cycles de dépendances** (A dépend de B qui dépend de A) et les rejette.

### 4.4 Dépendances entre projets

Un projet peut avoir des tâches dépendant de tâches d'un autre projet (ex : le projet de forage MJ-20 ne peut démarrer qu'après la fin du projet de mobilisation du rig). Ces liens inter-projets sont visibles dans la vue Gantt et déclenchent des notifications aux chefs de projet concernés si un décalage se produit.

### 4.5 Versioning du planning

Le planning d'un projet est versionné. On peut créer plusieurs versions en parallèle (simulation de scénarios) sans affecter la version de référence. Quand une version est activée, la précédente est archivée automatiquement.

**Simulation** : le chef de projet peut explorer "que se passe-t-il si je décale cette phase de 3 semaines ?" sans rien modifier dans la version active. La simulation expire automatiquement après 4 heures.

À chaque activation d'une nouvelle version, une **baseline** est enregistrée — les dates de référence qui permettront de mesurer les écarts futurs.

---

## 5. Chemin critique (CPM)

Le chemin critique est l'ensemble des tâches dont le retard entraîne automatiquement un retard du projet. Ces tâches ont une **marge nulle** — aucune flexibilité.

OpsFlux calcule le chemin critique automatiquement :
1. Passage avant : calcule les dates au plus tôt pour chaque tâche
2. Passage arrière : calcule les dates au plus tard
3. La marge = date au plus tard - date au plus tôt
4. Tâches à marge nulle = chemin critique

Dans la vue Gantt, les tâches du chemin critique sont affichées en rouge. La baseline (dates de référence) s'affiche en transparence derrière les barres actuelles pour visualiser immédiatement les écarts.

---

## 6. Vues et interfaces

### 6.1 Liste des projets

Tableau filtrable avec les projets de l'organisation. Filtres : statut, type, responsable, priorité, période. Les projets actifs et critiques sont mis en avant.

### 6.2 Vue Gantt

La vue principale de gestion du planning. Elle permet :
- De voir toutes les tâches sur une timeline
- De déplacer les tâches par glisser-déposer (le CPM se recalcule en temps réel)
- De voir le chemin critique (barres rouges)
- De comparer avec la baseline (barres grises transparentes)
- De zoomer de la semaine à l'année
- D'exporter le Gantt en image ou PDF

### 6.3 Vue Kanban

Tableau à colonnes (À faire / En cours / Terminé) avec les tâches déplaçables par glisser-déposer. Utile pour les équipes qui préfèrent une vision par statut plutôt que par date.

### 6.4 Vue Calendrier

Affiche les tâches sur un calendrier mensuel ou hebdomadaire. Lecture seule — les modifications se font dans le Gantt.

### 6.5 Tableau de bord projet

Indicateurs de suivi : pourcentage d'avancement global, nombre de tâches en retard, charge par assigné, courbe d'avancement planifié vs réel (burndown).

---

## 7. Collaboration sur les tâches

### 7.1 Commentaires

Chaque tâche dispose d'un fil de commentaires. N'importe quel membre du projet peut commenter. L'utilisation de `@nom` dans un commentaire envoie une notification à la personne mentionnée.

### 7.2 Pièces jointes

Des fichiers peuvent être joints directement à une tâche (plans, documents techniques, photos). Formats acceptés : PDF, Word, Excel, images, vidéos.

### 7.3 Membres du projet

Chaque projet a une liste de membres avec leur rôle dans le projet : propriétaire, manager, membre, observateur. Seuls les membres et managers peuvent commenter et mettre à jour l'avancement.

---

## 8. Interactions avec les autres modules

### 8.1 Projets → Planner

Le chef de projet peut "pousser" des tâches vers Planner pour créer des fenêtres d'activité sur un site. Cela crée automatiquement une activité dans Planner avec le quota PAX estimé, les dates, et la priorité du projet.

Si le planning est modifié (activation d'une nouvelle version), Planner est notifié des tâches modifiées.

### 8.2 Projets → PaxLog

Les AdS PaxLog peuvent être liées à un projet et un nœud WBS. Quand un projet est annulé ou terminé, les AdS brouillons liées affichent un avertissement.

Dans le workflow d'une AdS liée à un projet, le chef de projet est sollicité pour valider la cohérence avec son planning (étape 0-B).

### 8.3 Projets → TravelWiz

Les colis cargo peuvent être imputés sur un projet et un nœud WBS pour le suivi des coûts logistiques.

---

## 9. Permissions

| Action | DO | Chef de projet (responsable) | Membre du projet | Observateur |
|---|:---:|:---:|:---:|:---:|
| Créer un projet | ✓ | ✓ | — | — |
| Voir les projets | ✓ | ✓ | ✓ | ✓ |
| Modifier le projet | ✓ | ✓ | — | — |
| Gérer le WBS | ✓ | ✓ | — | — |
| Gérer le planning | ✓ | ✓ | — | — |
| Commenter les tâches | ✓ | ✓ | ✓ | — |
| Mettre à jour l'avancement | ✓ | ✓ | ✓ | — |
| Activer une version de planning | ✓ | ✓ | — | — |
| Clôturer / annuler un projet | ✓ | ✓ | — | — |
