# OpsFlux — Processus Fonctionnels par Module

> **Document de référence** : tous les processus métier d'OpsFlux, du point de vue de l'utilisateur.
> Version : Mars 2026 — Perenco Cameroun

---

## Sommaire

1. [Tiers — Référentiel entreprises externes](#1-tiers)
2. [Asset Registry — Référentiel des sites et équipements](#2-asset-registry)
3. [Projets — Gestion de projet et WBS](#3-projets)
4. [Planner — Planification des activités sur site](#4-planner)
5. [PaxLog — Mobilisation du personnel](#5-paxlog)
   - 5.1 Profils PAX et certifications
   - 5.2 Avis de Séjour (AdS) — du brouillon au retour
   - 5.3 Avis de Mission (AVM) — orchestration complète
   - 5.4 Programme de Séjour (intra-champ)
   - 5.5 Cycles de rotation
   - 5.6 Signalements
6. [TravelWiz — Logistique transport et cargo](#6-travelwiz)
   - 6.1 Gestion des vecteurs et voyages
   - 6.2 Manifestes PAX
   - 6.3 Cargo — de l'enregistrement à la livraison
   - 6.4 Retours site (back cargo)
   - 6.5 Ramassage terrestre
7. [Auth & Onboarding — Accès et comptes utilisateurs](#7-auth--onboarding)
8. [Admin & Dashboard](#8-admin--dashboard)

---

## 1. Tiers

### Rôle
Référentiel des entreprises externes (sous-traitants, fournisseurs, prestataires de transport) qui interviennent sur les sites Perenco. Point d'entrée pour la gestion des équipes extérieures dans PaxLog.

### Processus 1.1 — Créer et maintenir un Tiers

```
1. DQHSE/CHSE crée la fiche Tiers : nom, type, contacts, pays
2. Le Tiers est actif → peut être référencé dans les AdS et les imputations
3. Mise à jour continue : contacts, statut, statistiques auto-calculées
   (compliance HSE, taux de no-show, nombre d'AdS en cours)
```

**Statuts possibles :** `active → suspended → blacklisted → archived`

### Processus 1.2 — Générer un lien portail externe

Permet à une entreprise externe de gérer ses PAX sans compte OpsFlux.

```
1. Depuis la fiche Tiers → onglet "Accès externe"
2. Configurer : destinataire OTP, durée (7/14/30j), site de référence,
   permissions (voir / modifier / ajouter des membres)
3. Générer → lien + QR code → email/SMS automatique au responsable externe
4. Le responsable externe accède au portail :
   - Voit la liste de ses PAX avec leur statut compliance
   - Upload les justificatifs de certification
   - Met à jour les profils
5. Les justificatifs uploadés passent en pending_validation dans OpsFlux
6. Le CHSE valide → compliance PAX mise à jour automatiquement
7. Le lien peut être révoqué à tout moment (session invalidée immédiatement)
```

**Ce que l'externe NE voit PAS :** signalements, données médicales, AdS des autres entreprises, commentaires internes.

### Processus 1.3 — Suspension / Blacklist

```
Suspension automatique :
  → Si un signalement blacklist_temporaire/permanent est créé sur l'entreprise
  → Nouvelles AdS bloquées, AdS in_progress signalées

Suspension manuelle : DO ou DQHSE avec motif

Blacklist :
  → Toutes nouvelles AdS bloquées automatiquement
  → PAX avec badge ⛔ dans les manifestes
  → Liens portail existants révoqués
  → Levée : DO uniquement avec motif documenté
```

---

## 2. Asset Registry

### Rôle
Référentiel unique de tous les actifs physiques : sites, plateformes, bases, jetées, équipements. Source de vérité pour la hiérarchie géographique utilisée par tous les modules.

### Processus 2.1 — Créer et organiser les assets

```
1. ASSET_ADMIN crée les assets en respectant la hiérarchie ltree :
   Filiale > Champ > Site > Plateforme > Zone
2. Chaque asset a un type : base | platform | jetty | office | room | equipment | yard...
3. Les assets de type logistique (base, jetty) ont is_logistic_point=true
   → pas de capacité PAX, pas d'AdS possible
4. Les capacités PAX sont définies sur chaque asset (max_pax, permanent_ops_quota)
5. Protection : un asset avec des AdS actives ne peut pas être désactivé
```

### Processus 2.2 — Hiérarchie et héritage des règles HSE

```
Les règles de compliance HSE s'héritent du parent vers l'enfant.
Exemple :
  Perenco Cameroun → exige H2S pour TOUS
    ↓ héritage
  Munja → ajoute BOSIET (en plus de H2S)
    ↓ héritage
  Zone A Munja → ajoute Formation Travail en Hauteur

Un PAX allant sur Zone A Munja doit avoir : H2S + BOSIET + Travail en Hauteur.
```

---

## 3. Projets

### Rôle
Référentiel des projets de l'entreprise (capital, OPEX, maintenance, inspection). Fournit la structure WBS et les imputations pour PaxLog, Planner et TravelWiz.

### Processus 3.1 — Cycle de vie d'un projet

```
draft → active → on_hold → active → completed
                         ↘ cancelled (depuis tout statut)

1. CHEF_PROJET crée le projet : code (immuable), nom, type, budget, dates
2. Un WBS racine est créé automatiquement
3. Le CHEF_PROJET structure le WBS (phases, livrables, tâches feuilles)
4. Activation : le projet passe en active → visible dans Planner et PaxLog
5. Clôture : completed (déclenche warning sur AdS liées en cours)
```

### Processus 3.2 — WBS et tâches

```
Chaque tâche WBS a :
- Dates planifiées, durée, % avancement
- Dépendances (FS / SS / FF / SF) avec lag/lead
- Baseline (figée à l'activation du projet)
- Assignés (depuis les membres du projet)

Calcul automatique du chemin critique (CPM) côté backend Python.
Visualisation : SVAR UI Gantt (chemin critique = barres rouges,
                               baseline = barres grises transparentes)
```

### Processus 3.3 — Vues disponibles

| Vue | Description |
|---|---|
| Liste projets | Tableau avec statut, avancement, priorité |
| Gantt (SVAR) | WBS avec dépendances, chemin critique, baseline |
| Kanban tâches | Colonnes par statut, drag & drop |
| Calendrier | Tâches sur timeline mensuelle/hebdo |
| Analytics | Avancement global, burndown, charge par assigné |

### Processus 3.4 — Commentaires et collaboration sur les tâches

```
Tout membre du projet peut commenter une tâche.
@mentions → notification aux personnes citées.
Pièces jointes (PDF, images, Excel) uploadées directement sur la tâche.
```

### Processus 3.5 — Liens inter-projets (Planner)

Les activités Planner peuvent avoir des dépendances FS/SS/FF/SF entre projets différents. Si une activité est décalée, les chefs des projets impactés sont notifiés automatiquement.

---

## 4. Planner

### Rôle
Contrôle opérationnel des activités sur site. Gère les fenêtres d'occupation des assets, les conflits de capacité, et garantit qu'aucun site ne soit sur-chargé.

### Processus 4.1 — Créer une activité

```
1. Le demandeur choisit l'asset, les dates, le type d'activité
2. Saisit le quota PAX estimé et lie l'activité à un projet (si applicable)
3. Soumet (draft → submitted)
4. Le système vérifie la disponibilité de capacité sur l'asset :
   Capacité résiduelle = max_pax_total - permanent_ops_quota - Σ(quota des activités approuvées sur la période)
5a. Capacité OK → pending_validation (CDS approuve)
5b. Dépassement → ActivityConflict créé → arbitrage DO
```

**Visualisation :** React Modern Gantt avec barres colorées par type et statut, charge PAX par ligne d'asset.

**Code couleur par type :**

| Type | Couleur | Description |
|---|---|---|
| project | Bleu | Activité projet |
| workover | Vert foncé | Intervention sur puits |
| drilling | Rouge foncé | Forage nouveau puits |
| integrity | Teal | Inspection d'intégrité |
| maintenance | Orange | Maintenance générale |
| permanent_ops | Gris | Exploitation permanente (fond) |
| inspection | Violet | Audit / inspection réglementaire |
| event | Gris clair | Réunion, deadline |

### Processus 4.2 — Arbitrage DO (conflit de capacité)

```
1. Deux activités se chevauchent et dépassent la capacité
2. ActivityConflict créé → notification DO
3. DO choisit parmi :
   - approved_both : approuve les deux si la capacité le permet réellement
   - postponed_a/b : décale une des deux activités
   - cancelled_a/b : annule une des deux
   - quota_reduced : réduit le quota d'une activité
4. Décision propagée → activités concernées notifient leurs demandeurs
```

### Processus 4.2b — Activité `workover` (Intervention sur puits)

Intervention sur un puits existant pour maintenir ou restaurer la production.
Champs obligatoires : référence puits + type d'intervention (slickline, coiled tubing, wireline, pompe, traitement chimique).
Workflow : **CDS + DPROD**. Couleur Gantt : **vert foncé**.

### Processus 4.2c — Activité `drilling` (Forage)

Forage d'un nouveau puits — activité critique de longue durée.
Champs obligatoires : nom du puits, programme de forage référencé.
Workflow : **CDS + DPROD + DO** (3 niveaux). Priorité minimum HIGH.
Couleur Gantt : **rouge foncé**.

### Processus 4.2d — Activité `integrity` (Intégrité)

Inspection d'intégrité des installations : pipeline, structure, corrosion.
Méthodes : pigging | UT | CVI | drone | IRIS | MFL.
Si réglementaire : référence normative à documenter.
Workflow : **CDS + CHSE**. Couleur Gantt : **teal**.

### Processus 4.3 — Activité `permanent_ops`

Activité spéciale représentant le quota incompressible d'exploitation (opérateurs permanents). Son quota est soustrait en premier de toute la capacité. Ne passe pas par workflow standard — approuvée directement par CDS ou DO.

### Processus 4.4 — Activité `maintenance` (CMMS)

```
Champs supplémentaires : type (préventive/corrective/réglementaire),
équipement ciblé, référence d'ordre de travail (ACT-YYYY-NNNNN),
durée estimée/réelle, notes de clôture.

Maintenances correctives urgentes : DO peut approuver directement.
Maintenances réglementaires : priorité minimum HIGH, ne peut pas être réduite.
```

### Processus 4.5 — Liens inter-projets Planner

```
Une activité A (Projet 1) peut avoir un lien FS/SS/FF/SF
vers une activité B (Projet 2).

Si A est décalée :
  → Calcul de l'impact sur B et ses successeurs
  → Notification aux chefs de projet impactés avec le détail du décalage
  → Modal de confirmation avant application
```

---

## 5. PaxLog

### Rôle
Module central de mobilisation du personnel. Toute personne qui monte sur un site industriel Perenco doit avoir un dossier approuvé dans PaxLog.

---

### 5.1 Profils PAX et certifications

#### Processus — Créer/maintenir un profil PAX

```
Employé Perenco :
  → Synchronisation automatique depuis l'intranet
  → Les données synchros ne sont pas modifiables manuellement dans OpsFlux

Externe (sous-traitant) :
  → Création manuelle ou via portail Tiers
  → Algorithme de déduplication : score de similarité nom/prénom/date naissance
    < 0.75 → création normale
    0.75-0.95 → panneau "profil similaire existe"
    ≥ 0.95 même entreprise → fusion automatique proposée
    ≥ 0.95 entreprise différente → alerte cross_company
```

#### Processus — Gérer les certifications d'un PAX

```
1. CHSE ou PAX_ADMIN ajoute un type de certification (BOSIET, H2S, etc.)
2. PAX ou responsable externe uploade le justificatif
   → status = pending_validation
3. CHSE valide → status = valid (date d'expiration enregistrée)
   CHSE rejette → motif obligatoire → PAX notifié pour re-upload
4. Batch quotidien détecte les expirations à venir :
   → Alerte PAX + responsable N jours avant (configurable par type)
   → Alerte CDS si un PAX sur site a une certification qui expire
```

**7 statuts de compliance :** `valid | expires_during_stay | insufficient_validity | expired | in_grace | not_validated | missing`

#### Processus — Profils métier et habilitations (3 couches)

```
Couche 1 — Asset : ce que le site exige de tous
Couche 2 — Profil métier : ce que le métier exige
  → Un soudeur doit avoir : Permis de Soudage + Habilitation Feu
  → Un électricien : Habilitation Électrique B1V
Couche 3 — Autodéclaration : PAX déclare posséder une habilitation
  → Coche la case + uploade le justificatif
  → CHSE valide → pax_credentials créé automatiquement
```

---

### 5.2 Avis de Séjour (AdS)

L'AdS est la demande formelle d'accès à un site pour un individu ou une équipe.

#### Workflow complet

```
┌──────────────────────────────────────────────────────────────────┐
│  SOUMISSION (clic "Soumettre")                                   │
│    draft → submitted (transitoire, quelques ms)                  │
│      ↓ Routage automatique vers la 1ère étape applicable :       │
│                                                                   │
│  ÉTAPE 0-A — Validation INITIATEUR                               │
│  (si AdS créée pour quelqu'un d'autre et pas depuis un AVM)      │
│    pending_initiator_review                                       │
│    L'initiateur confirme, corrige ou annule                       │
│                                                                   │
│  ÉTAPE 0-B — Validation CHEF_PROJET                              │
│  (si AdS liée à un projet ou une tâche)                          │
│    pending_project_review                                         │
│    Le chef de projet valide la cohérence avec le planning        │
│    (son délégué si absent, même mécanisme que les délégations)   │
│                                                                   │
│  ÉTAPE 1 — COMPLIANCE HSE (automatique)                          │
│    pending_compliance (si certifications bloquantes)             │
│    pending_validation (si tous compliant)                         │
│                                                                   │
│  ÉTAPE 2 — CDS (Validateur N1)                                   │
│    Approuve individuellement chaque PAX                           │
│    Peut rejeter avec motif (définitif pour cette AdS)            │
│                                                                   │
│  ÉTAPE 3 — DPROD (Validateur N2) — si activé sur le site        │
│                                                                   │
│  → approved                                                       │
│    TravelWiz reçoit les PAX pour les manifestes                  │
└──────────────────────────────────────────────────────────────────┘
```

#### Rejet partiel d'une AdS d'équipe

```
3 PAX approuvés sur 5 → AdS passe en approved (partiel)
Les 2 PAX rejetés : définitifs dans cette AdS
Le demandeur peut créer une nouvelle AdS pré-remplie pour eux
(bouton "Créer une AdS pour les PAX rejetés")
```

#### `requires_review` — sortie du statut

```
Une AdS passe en requires_review si :
- Une activité Planner liée est modifiée
- Un signalement d'exclusion_site est validé
- L'OMAA signale une absence non confirmée

Sortie : le demandeur modifie et resoumet
         → réévaluation complète depuis le début (0-A → 0-B → compliance → validation)
Exception : AdS in_progress → resoumet uniquement devant CDS (PAX déjà sur site)
```

#### Transport aller/retour

```
Chaque AdS précise des préférences de transport indépendantes :
- Aller : mode (hélico/bateau/bus), point de départ, notes
- Retour : mode (peut différer de l'aller), point de départ, notes

Pour une AdS d'équipe : un PAX peut avoir un retour différent des autres
via return_transport_override sur ads_pax.

Modification du retour en cours de séjour (AdS in_progress) :
  - Si manifeste retour existe → motif obligatoire + notification LOG_BASE
  - Si pas encore de manifeste → modification silencieuse
```

#### Extension de séjour

```
Option A — Modifier la date de fin de l'AdS existante :
  → Compliance re-vérifiée sur la nouvelle durée
  → Capacité Planner vérifiée sur la période ajoutée
  → Si un manifeste retour validé existe → PAX retiré automatiquement
    du manifeste + LOG_BASE notifié pour réassignation

Option B — Nouvelle AdS pour la période complémentaire :
  → L'ancienne AdS reste et se clôture à sa date prévue
  → extended_from_ads_id tracé sur la nouvelle AdS
```

#### Clôture d'une AdS

```
3 mécanismes par ordre de priorité :
1. TravelWiz manifeste inbound clôturé (source de vérité principale)
   → pax_manifest.closed (inbound) → AdS = completed
2. Déclaration manuelle OMAA (évacuation, départ improvisé)
3. Batch automatique minuit (filet de sécurité si end_date dépassé)
```

---

### 5.3 Avis de Mission (AVM)

L'AVM orchestre le cycle complet d'une mission terrain : dossier administratif, AdS, briefings, créneaux. Il remplace les échanges d'emails non structurés.

#### FSM AVM

```
draft → in_preparation → active → ready → completed
      ↘                          ↗
        cancelled (si aucun PAX sur site)
        (BLOQUÉ si un PAX est déjà sur site → modification uniquement)
```

| Statut | Signification |
|---|---|
| `draft` | En cours de saisie |
| `in_preparation` | Lancée — actions en cours, AdS en validation |
| `active` | 1ère AdS approuvée — mission a démarré |
| `ready` | Tout est prêt : toutes tâches OK + toutes AdS approuvées |
| `completed` | Toutes les AdS clôturées (retour effectif) |

#### Processus de création

```
1. Initiateur ouvre une AVM :
   - Titre, description, type de mission
   - Liens vers projets/tâches (un par ligne de programme possible)
   - Programme ligne par ligne :
     - Site, dates, type d'activité
     - Intervenants (ou "mêmes personnes que la ligne X")
     - Projet d'imputation par ligne
   - Indicateurs à cocher :
     □ Besoin de badge d'accès     □ Besoin d'EPI (avec mensurations)
     □ Visa nécessaire             □ Éligible indemnité grand déplacement
   - Pièces jointes globales (LOI, ordre de mission)
   - Pièces jointes par PAX (passeport, visa)
   - Créneaux de réunion (date, heure, lieu, participants)
   - Parties prenantes (niveau de notification : complet/jalons/ciblé)
```

#### Séquence de lancement

```
1. Validation : au moins une ligne avec un site défini
2. Tâches prépa créées selon les indicateurs :
   - visa     → formulaire de suivi visa (to_initiate → obtained)
   - badge    → tâche LOG_BASE
   - epi_order → tâche Achats avec mensurations
   - allowance → formulaire d'indemnité (draft → paid)
3. Pour chaque ligne avec site_asset_id :
   → AdS créée automatiquement en draft
   → Suit son propre workflow (sans étapes 0-A et 0-B — l'AVM remplace)
   → Tâche prépa "ads_creation" marquée "completed"
4. Documents PAX créés (un par PAX × type de document requis)
5. Statut → in_preparation
6. Mail d'annonce envoyé (EN DERNIER, avec les références AdS)
```

#### Suivi des travaux préparatoires

```
Onglet "Travaux préparatoires" de la fiche AVM :
  TYPE       TITRE                           STATUT      RESPONSABLE
  ads        AdS ESF1 (14-15/05) créée       OK          AUTO
  badge      Vérification badge J.DUPONT     En cours    LOG_BASE
  visa       Demande visa — J.DUPONT         En revue    RH
  epi        Commande EPI XL/42              En attente  Achats
  allowance  Indemnité déplacement           Soumise     RH/Finance
  briefing   Briefing sécurité ESF1          En attente  CDS ESF1
```

**Rapport de préparation :** `GET /readiness` retourne `{ready, completion_pct, pending_items}` avec compliance par PAX × site de sa ligne.

#### AVM et modification / annulation

```
Si AUCUN PAX sur site :
  → Annulation libre → cascade sur toutes les AdS draft/pending/approved
  → Motif obligatoire

Si UN PAX est sur site (AdS in_progress) :
  → Annulation BLOQUÉE (409 AVM_CANNOT_CANCEL_PAX_ON_SITE)
  → Modification uniquement, dans les limites du consommé :
    • Date début : ne peut pas être avancée (PAX déjà parti)
    • Retrait PAX sur site : bloqué (409 CANNOT_REMOVE_PAX_ON_SITE)
    • Modification date fin → procédure de modification AdS déclenchée
      (motif obligatoire, modal d'impact, requires_review si nécessaire)
```

#### AdS rejetée dans une AVM

```
L'AVM reste active — pas d'annulation automatique.
La tâche prépa 'ads_creation' garde son statut 'completed' (la création a eu lieu).
L'initiateur reçoit une alerte + bouton "Recréer l'AdS" sur la ligne concernée.
Le bouton pré-remplit une nouvelle AdS avec les données de la ligne.
```

---

### 5.4 Programme de Séjour (intra-champ)

```
PAX déjà sur site → l'OMAA crée un Programme de Séjour
pour ses déplacements internes (ex: ESF1 → Munja → ESF1)

Workflow allégé : pas de validation N1/N2
→ OMAA crée → CDS valide → TravelWiz génère manifeste intra-champ

Lien avec AdS principale : le programme de séjour est rattaché
à l'AdS existante (ads_id)
```

---

### 5.5 Cycles de rotation

```
Pour les personnels permanents en rotation (ex: 21 jours sur / 21 jours off) :
1. LOG_BASE ou PAX_ADMIN configure un cycle de rotation :
   rotation_days_on, rotation_days_off, cycle_start_date, site
2. Batch quotidien 6h00 détecte les prochaines rotations
   → Crée les AdS automatiquement N jours avant (ads_lead_days)
   → AdS créées en draft — le PAX confirme lui-même
   → Notification si une certification va expirer pendant la prochaine rotation
```

---

### 5.6 Signalements

```
Types : avertissement | exclusion_site | blacklist_temporaire | blacklist_permanent

Processus :
1. CHSE/CDS crée un signalement (PAX, équipe ou entreprise entière)
2. Workflow de validation (avertissement : CDS / blacklist : DO)
3. À la validation :
   - avertissement      → notification seulement
   - exclusion_site     → AdS en cours → requires_review
   - blacklist_*        → AdS pending → rejet automatique
                          AdS in_progress → requires_review (CDS décide)
                          entreprise → liens portail révoqués, Tiers suspendu
```

---

## 6. TravelWiz

### Rôle
Logistique de transport : vecteurs, voyages, manifestes PAX, cargo, journal de bord, tracking IoT.

---

### 6.1 Gestion des vecteurs et voyages

#### Processus — Cycle d'un voyage

```
planned → confirmed → boarding → departed → arrived → completed
        ↘                              ↗
          delayed (retard déclaré)
          cancelled (motif obligatoire)
          emergency (incident critique)

1. LOG_BASE crée le voyage (ou généré par une rotation planifiée)
2. Il configure : vecteur, origine, destination, horaire
3. Confirmation → manifeste PAX créé (alimenté par les AdS approuvées)
4. boarding → pointage des PAX
5. departed → journal de bord actif
6. arrived → déchargement cargo, pointage arrivée
7. completed → KPIs calculés
```

#### Trip delayed — procédure

```
1. Capitaine ou LOG_BASE déclare le retard (motif + heure estimée obligatoires)
2. Notification immédiate aux 12 PAX du manifeste + LOG_BASE
3. Le manifeste reste validé
4. Si délai > TRIP_DELAY_REASSIGN_THRESHOLD_HOURS (défaut 4h) :
   → Bouton "Annuler et réassigner" disponible pour LOG_BASE
   → Liste des vols alternatifs proposée
   → Transfert automatique des PAX confirmés sur le nouveau vecteur
   → Notification PAX avec nouveau vecteur et horaire
```

#### Voyages multi-escales

```
Un vecteur dessert plusieurs destinations en une sortie :
Wouri → Munja → ESF1 → RDRW

Manifeste PAX unique pour tout le voyage.
Chaque PAX a une escale de débarquement précisée.
Vue capitaine : PAX à pointer par escale.
```

#### Portail capitaine

```
Code 6 chiffres + QR code pour accès sécurisé depuis le terrain (sans compte OpsFlux).

Le capitaine peut :
  → Pointer les PAX (embarquement / débarquement par escale)
  → Enregistrer les événements du journal de bord
  → Déclarer les incidents (panne, urgence médicale)
  → Saisir les données météo manuellement
  → Pointer le poids des PAX (si vecteur requires_pax_weight=true)

Mode offline : synchronisation différée si pas de connexion.
```

---

### 6.2 Manifestes PAX

#### Génération automatique depuis les AdS

```
À l'approbation d'une AdS :
  TravelWiz cherche un voyage compatible (même destination, dans la fenêtre de dates,
  même mode de transport si préférence exprimée)
  → Trouvé : PAX ajouté au manifeste existant (ou en standby si déjà validé)
  → Pas trouvé : création d'un Trip planned + manifeste draft
```

#### Priorité de placement (calcul de score)

```
Chaque PAX a un score de priorité :
- Type de visite (maintenance urgente > projet > visite)
- Statut VIP, durée d'attente
- Contrainte de certification (expiration imminente)

Les PAX sont triés par score décroissant.
Si capacité dépassée → les moins prioritaires passent en standby.
```

#### Poids PAX — vecteurs concernés

```
Si vehicle.requires_pax_weight = true (hélicoptères, petits avions) :
  Poids collecté en deux temps :
  1. Déclaration dans l'AdS (pré-remplie depuis le profil PAX si récent)
  2. Repesage physique par le capitaine au check-in (valeur finale)

  Validation bloquée si poids null sur un PAX confirmé.
  Alerte à 90% de la capacité poids, blocage à 100%.
```

#### Clôture d'un manifeste PAX

```
POST /pax-manifests/:id/close
Body: { boarded_pax: [...], no_show_pax: [...] }

Effets :
  → Émet pax_manifest.closed
  → Direction outbound : AdS → in_progress
  → Direction inbound  : AdS → completed
  → no_show aller : ads_pax.status = 'no_show'
  → no_show retour : missed_return_manifest = true + alerte OMAA/CDS
```

---

### 6.3 Cargo — de l'enregistrement à la livraison

#### Processus complet d'un colis

```
ENREGISTREMENT
  1. LOG_BASE enregistre le colis :
     - Description, type de gestion (unit/bulk/consommable/package/waste)
     - Poids, dimensions, expediteur, destinataire, projet
     - Matching SAP automatique en arrière-plan (suggestions IA)
     - Tracking number généré : CGO-YYYY-NNNNN
     - Étiquette PDF A6 avec QR code imprimable
     - Photos optionnelles (étape registration)

MANIFEST CARGO
  2. LOG_BASE crée ou choisit un manifeste cargo pour le voyage
  3. Ajoute le colis : status → ready_for_loading
  4. Validation manifeste : photos hazmat, validation HSE si HAZMAT
  5. Organisation de deck (algo 2D bin-packing si souhaité)

TRANSIT
  6. Chargement physique confirmé : status → loaded
  7. Voyage departed : status → in_transit
  8. Arrivée escale intermédiaire (si multi-voyages) : delivered_intermediate
     → colis re-embarqué sur prochain voyage pour atteindre destination finale

LIVRAISON
  9. Arrivée destination finale :
     - OMAA ou agent site réceptionne
     - Confirmation quantité reçue vs déclarée
     - Signalement anomalie si écart ou dommage → has_anomaly = true
     - Destinataire absent → reception_confirmed = false + notification
     - Signature tablette ou OTP : status → delivered

RAPPORT DE DÉCHARGEMENT (auto-généré)
  10. POST /cargo-manifests/:id/close
      Body: { entries: [{status: 'unloaded'|'missing', quantity_received?}] }
      → Rapport PDF auto-généré : liste des colis, écarts, manquants
      → Diffusé automatiquement aux expéditeurs concernés
```

#### Recherche et tracking

```
Scan QR code / recherche externe_reference :
  → Si plusieurs résultats (même référence physique sur plusieurs années)
    → Affichage liste triée par date décroissante, utilisateur choisit

Timeline colis : GET /cargo-items/:id/history
  → Grand livre immuable de tous les mouvements (cargo_movements append-only)
  → Vue chronologique : registered → loaded → in_transit → delivered
```

#### Colis sur trip annulé

```
LOG_BASE alerte : "N colis chargés sur ce voyage"
Option A : "Colis déchargé — retour à la base" → ready_for_loading + mouvement return_to_base
Option B : "Transfert sur autre voyage" → sélection du nouveau trip
Si pas de réponse → auto-retour à la base
```

---

### 6.4 Retours site (Back Cargo)

```
5 types de retour, chacun avec ses prérequis :

waste             → zone dédiée, bordereau spécifique, marquage obligatoire
contractor_return → laissez-passer, inventaire des éléments, double signature
stock_reintegration → code SAP confirmé obligatoire, formulaire de réintégration
scrap             → mention "ferraille" obligatoire (ou photos), zone ferraille
yard_storage      → mention "stockage Yard" + justification

Processus :
1. Sur site : OMAA ou agent déclare le retour (type + motif)
2. Colis : status → return_declared
3. Manifeste retour (inbound) créé → colis ajouté
4. Voyage retour → status → return_in_transit
5. Arrivée base → clôture manifeste inbound → status → returned
6. Dispatch final selon le type (réintégration stock / ferraille / yard)
```

---

### 6.5 Ramassage terrestre

```
Pour les voyages dont le vecteur a requires_pickup = true (ex: navire) :

1. Dans l'AdS, le PAX saisit son point de ramassage
   (pré-rempli depuis historique, adresse, ou géo-picker sur carte)

2. LOG_BASE crée un circuit de ramassage :
   → Optimisation automatique de l'ordre des points
   → Feuille de route PDF + PWA chauffeur (accès OTP)

3. Chauffeur via PWA :
   → Voit la liste et les positions des PAX à ramasser
   → Marque chaque PAX "picked_up" ou "no_show"
   → Position GPS suivie en temps réel

4. À la fin du circuit :
   → Rapport d'exécution automatique
   → PAX ramassés → ajoutés au manifeste du voyage
   → PAX no_show → alerte LOG_BASE
```

---

## 7. Auth & Onboarding

### Processus 7.1 — Connexion employé Perenco (SSO)

```
1. Employé clique "Se connecter avec Perenco"
2. Redirection vers IdP Perenco (SAML2 / OIDC / LDAP)
3. Authentification via les credentials Perenco existants
4. Retour avec assertions → JWT OpsFlux (Access 15min + Refresh 7j)
5. Si premier login → provisionnement JIT automatique :
   - Compte créé (ou mis à jour) dans OpsFlux
   - Profil PAX créé ou lié si intranet_id correspond
   - Affectation au groupe par défaut configuré pour son département
```

### Processus 7.2 — Invitation externe

```
1. Admin OpsFlux génère une invitation email
2. L'externe reçoit un lien valable N jours
3. Il clique → crée son mot de passe OpsFlux
4. Son compte a des droits limités (rôle EXT_SUPV par défaut)
5. Date d'expiration du compte configurable
```

### Processus 7.3 — Sessions et révocation

```
JWT Access Token  : 15 minutes (signé, non révocable)
JWT Refresh Token : 7 jours (stocké dans Redis, révocable immédiatement)

Révocation immédiate :
  → Désactivation compte → tous les refresh tokens révoqués dans Redis
  → Déconnexion d'un appareil spécifique
  → Rotation périodique des clés de signature (JWKS endpoint public)
```

---

## 8. Admin & Dashboard

### Processus 8.1 — Dashboard par rôle

Chaque rôle voit un dashboard personnalisé à son ouverture de session :

| Rôle | Contenu du dashboard |
|---|---|
| DO | KPIs globaux, conflits en attente, alertes critiques toutes catégories |
| CDS | AdS en attente de validation, PAX sur son site, capacité site |
| LOG_BASE | Voyages du jour, manifestes à valider, cargo en transit |
| CHEF_PROJET | Avancement WBS, tâches en retard, AdS liées au projet |
| CHSE | Autodéclarations en attente, certifications expirées, signalements |
| OMAA | PAX présents sur son site, manifestes à pointer, programme intra-champ |

### Processus 8.2 — Clôture AdS par l'OMAA (mode dégradé)

```
Quand le retour ne passe pas par TravelWiz (évacuation, départ improvisé) :
  OMAA → "Déclarer le départ manuel" → motif obligatoire
  → AdS passe en completed (source secondaire)
  → Traçé dans ads_events type 'manual_closure'
```

### Processus 8.3 — Délégation de validation

```
Avant un congé, tout validateur peut désigner un remplaçant :
1. Mon profil → Délégations → [+ Déléguer]
2. Choisir : remplaçant, dates, portée (nouvelles demandes ou aussi celles en attente)
3. Le remplaçant doit avoir le même rôle sur le même périmètre d'asset
4. Pendant la délégation : le remplaçant reçoit les notifications
   avec mention "En tant que remplaçant de [nom]"
5. Toute action tracée avec delegation_id dans l'audit log
```

### Processus 8.4 — Import initial des données

```
Séquence d'onboarding recommandée (9 étapes) :
1. Configurer l'entité (nom, timezone, politique HSE)
2. Importer la hiérarchie des assets (CSV)
3. Créer les groupes et utilisateurs (ou activer SSO)
4. Configurer les types de certifications et matrices de compliance
5. Importer les profils PAX (CSV avec dry_run=true pour validation)
6. Importer le catalogue SAP articles
7. Créer les vecteurs de transport
8. Configurer les rotations périodiques si applicable
9. Créer les projets et WBS initiaux
```

### Processus 8.5 — Audit log

```
Deux niveaux :
  → Onglet "Historique" sur chaque fiche : actions scopées aux droits du rôle
  → Vue globale (SYS_ADMIN + DO) : toutes les actions, exportable

Chaque action enregistre :
  who (user_id + nom), when (timestamp UTC), what (action),
  on_what (entity_type + entity_id), old_values, new_values,
  source (manuel / automatique / batch), delegation_id si applicable
```

---

## Annexe — Références des entités

| Entité | Format | Exemple |
|---|---|---|
| Avis de Mission | `AVM-YYYY-NNNNN` | AVM-2026-00021 |
| Avis de Séjour | `ADS-YYYY-NNNNN` | ADS-2026-04521 |
| Trip | `TRIP-YYYY-NNNNN` | TRIP-2026-03412 |
| Manifeste PAX | `MAN-PAX-YYYY-NNNNN` | MAN-PAX-2026-03412 |
| Manifeste Cargo | `MAN-CGO-YYYY-NNNNN` | MAN-CGO-2026-01832 |
| Colis | `CGO-YYYY-NNNNN` | CGO-2026-004521 |
| Activité Planner | `ACT-YYYY-NNNNN` | ACT-2026-03204 |
| Signalement | `SIG-YYYY-NNNNN` | SIG-2026-00042 |
| Urgence | `EMR-YYYY-NNNNN` | EMR-2026-00012 |
| Circuit ramassage | `PKP-YYYY-NNNNN` | PKP-2026-00315 |

*Tous les compteurs repartent à 00001 chaque 1er janvier.*

---

## Annexe — Rôles clés

| Rôle | Responsabilité principale |
|---|---|
| DO | Directeur Opérations — arbitre final, voit tout |
| DPROD | Directeur Production — valide les activités site |
| DQHSE | Directeur QHSE — politique HSE, signalements |
| CHEF_PROJET | Chef de Projet — son WBS, ses activités Planner |
| CDS | Chef de Site — valide les AdS pour son site |
| OMAA | Logistique terrain — pointe les PAX, gère le cargo |
| LOG_BASE | Logistique base — manifestes, vecteurs, cargo |
| CHSE | Compliance HSE — valide les certifications |
| DEMANDEUR | Employé Perenco — crée ses AdS |
| TRANSP_COORD | Coordinateur transport — gère la flotte |
