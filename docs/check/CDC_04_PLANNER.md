# Cahier des Charges Fonctionnel — Module Planner

> Ce document décrit la planification des activités sur les sites industriels :
> qui occupe quel site, pendant combien de temps, et comment gérer les conflits.

---

## Sommaire

1. [Rôle et positionnement](#1-rôle-et-positionnement)
2. [Les types d'activités](#2-les-types-dactivités)
3. [Cycle de vie d'une activité](#3-cycle-de-vie-dune-activité)
4. [Gestion de la capacité PAX](#4-gestion-de-la-capacité-pax)
5. [Conflits et arbitrage](#5-conflits-et-arbitrage)
6. [Liens entre activités](#6-liens-entre-activités)
7. [Vues et interfaces](#7-vues-et-interfaces)
8. [Permissions](#8-permissions)

---

## 1. Rôle et positionnement

Le Planner est le **chef d'orchestre de la charge opérationnelle sur les sites**. Il répond à la question fondamentale : "Qui peut être sur quel site, et quand ?"

Chaque site a une capacité d'accueil limitée. Plusieurs projets, chantiers et équipes d'exploitation se partagent cette capacité. Le Planner gère ces fenêtres d'occupation et garantit qu'aucun site n'est surchargé.

**Ce que le Planner fait :**
- Gérer les fenêtres d'occupation des sites (quelles activités, quand, combien de PAX)
- Calculer la capacité résiduelle disponible à tout moment
- Détecter et signaler les conflits de capacité
- Permettre l'arbitrage des conflits par la direction

**Ce que le Planner ne fait pas :**
- Créer les projets (module Projets)
- Valider les personnes individuellement (module PaxLog)
- Gérer le transport (module TravelWiz)

---

## 2. Les types d'activités

### 2.1 Activité Projet (`project`)

Liée à un projet du module Projets. Représente la fenêtre de temps pendant laquelle une équipe projet occupe un site pour réaliser ses travaux.

Le quota PAX est **estimatif** — le chef de projet déclare combien de personnes seront nécessaires. Le nombre réel de PAX validés dans PaxLog est suivi séparément.

Workflow : soumise par le chef de projet → validée par le CDS du site (+ DPROD si configuré).

### 2.2 Activité Workover (`workover`)

Intervention sur un **puits existant** pour maintenir ou restaurer sa production (slickline, coiled tubing, wireline, changement de pompe, traitement chimique).

Champs spécifiques : référence du puits, type d'intervention, nom du rig/unité d'intervention.

Workflow : soumise par le responsable → validée par CDS + DPROD.

### 2.3 Activité Forage (`drilling`)

Forage d'un **nouveau puits** — activité critique de longue durée avec un rig de forage mobilisé.

Champs spécifiques : nom du nouveau puits, date de démarrage prévue (spud date), profondeur cible, référence du programme de forage.

Priorité minimale imposée : haute (on ne peut pas descendre en dessous).

Workflow renforcé : soumise → validée par CDS + DPROD + DO (3 niveaux obligatoires).

### 2.4 Activité Intégrité (`integrity`)

Inspection d'intégrité des installations : pipeline, structure, équipements (pigging, ultrason, inspection visuelle, drone, MFL).

Peut être **réglementaire** (imposée par la loi) — dans ce cas, la référence réglementaire est documentée.

Workflow : soumise → validée par CDS + CHSE.

### 2.5 Activité Maintenance (`maintenance`)

Opération de maintenance générale sur un équipement du site. Trois sous-types :

- **Préventive** : planifiée à l'avance selon un plan de maintenance
- **Corrective** : suite à une panne ou dysfonctionnement (urgence)
- **Réglementaire** : exigée par la réglementation, priorité automatiquement haute

Les maintenances correctives urgentes peuvent être approuvées directement par le DO sans passer par le circuit standard.

Chaque activité maintenance génère une **référence d'ordre de travail** (ex : ACT-2026-03204).

### 2.6 Activité Exploitation permanente (`permanent_ops`)

Activité spéciale représentant le **quota incompressible** d'exploitation : les opérateurs permanents qui sont toujours sur site, quoi qu'il arrive.

Ce quota est soustrait en priorité de la capacité totale avant de calculer la disponibilité pour toutes les autres activités.

Approuvée directement par le CDS ou le DO — pas de workflow standard.

### 2.7 Activité Inspection / Audit (`inspection`)

Audit réglementaire, inspection externe, visite d'experts. Priorité par défaut élevée. Souvent de courte durée (1-3 jours) mais planifiée longtemps à l'avance.

### 2.8 Événement (`event`)

Réunion, deadline, jalons logistiques. Peut avoir un quota PAX nul (simple marqueur sur la timeline) ou avoir des participants.

---

## 3. Cycle de vie d'une activité

```
Brouillon → Soumise → [Validée / Rejetée / Annulée]
                          ↓
                       En cours → Terminée
```

**Brouillon** : l'activité est saisie mais pas encore soumise à validation.

**Soumise** : la demande est en cours de validation. Le système vérifie immédiatement la disponibilité de capacité sur le site.

Si capacité disponible → l'activité passe en circuit de validation (CDS, puis éventuellement DPROD ou DO selon le type).

Si dépassement de capacité → un **conflit** est créé et remonte au DO pour arbitrage.

**Validée** : l'activité est approuvée. Elle réserve le quota PAX sur le site pour la période.

**En cours** : la date de début est passée et des PAX sont présents sur site (selon PaxLog).

**Terminée** : la date de fin est passée, toutes les AdS liées sont clôturées.

---

## 4. Gestion de la capacité PAX

### 4.1 Capacité résiduelle

La capacité disponible sur un site à une date donnée est calculée ainsi :

```
Capacité résiduelle = Capacité totale
                    - Quota exploitation permanente
                    - Somme des quotas PAX des activités validées sur cette période
```

OpsFlux calcule cette capacité en temps réel. Le résultat est affiché visuellement sur la timeline du Planner.

### 4.2 Alertes de saturation

Quand la capacité d'un site dépasse 90% → alerte visible dans l'interface.
Quand elle atteint 100% → conflit créé, l'activité ne peut pas être validée sans arbitrage.

### 4.3 Limite par entreprise

Un site peut avoir une limite de PAX par entreprise sous-traitante. Par exemple : DIXSTONE ne peut pas avoir plus de 15 personnes simultanément sur ESF1. Cette limite est vérifiée au moment de la validation de l'AdS PaxLog (pas au niveau du Planner).

---

## 5. Conflits et arbitrage

### 5.1 Qu'est-ce qu'un conflit ?

Un conflit se crée quand deux (ou plusieurs) activités en cours de validation dépassent ensemble la capacité d'un site. Le Planner ne choisit pas automatiquement quelle activité est prioritaire — il demande au DO de trancher.

### 5.2 Processus d'arbitrage

1. Le conflit est créé et le DO est notifié immédiatement
2. Le DO accède à la vue d'arbitrage qui présente les activités en conflit côte à côte avec : projet, dates, quota, priorité, responsable
3. Le DO choisit parmi les options :
   - **Approuver les deux** (si la capacité le permet réellement après vérification)
   - **Décaler une activité** (choix de la nouvelle date)
   - **Réduire le quota PAX** d'une activité
   - **Annuler une activité** (motif obligatoire)
   - **Décision future** (mettre en attente temporairement)
4. La décision est enregistrée avec motif, notifiée aux chefs de projet concernés

### 5.3 Priorités des activités

Quand plusieurs activités sont en conflit, la priorité est un indicateur d'aide à la décision pour le DO. Les maintenances réglementaires et les inspections réglementaires ont une priorité automatiquement haute qui ne peut pas être réduite.

Le DO peut toujours modifier la priorité d'une activité pour l'adapter à la situation opérationnelle.

### 5.4 Historique des arbitrages

Chaque arbitrage est historisé avec la décision, le motif, et les impacts sur chaque activité concernée. Cet historique est visible sur chaque fiche d'activité et dans le journal global.

---

## 6. Liens entre activités

### 6.1 Dépendances inter-projets

Des activités de projets différents peuvent être liées par des dépendances (ex : "Le projet de construction ESF1 ne peut démarrer qu'une semaine après la fin de l'inspection réglementaire"). Ces liens sont définis dans le Planner.

Types de liens : Fin → Début, Début → Début, Fin → Fin.

### 6.2 Impact des décalages

Quand une activité est décalée (retard ou arbitrage), OpsFlux calcule automatiquement l'impact sur toutes les activités qui lui succèdent via des liens. Les chefs de projet des activités impactées reçoivent une notification avec le détail du décalage.

---

## 7. Vues et interfaces

### 7.1 Vue Gantt multi-assets

La vue principale du Planner affiche une ligne par asset sur la timeline. Chaque barre représente une activité avec un code couleur par type :

| Type | Couleur |
|---|---|
| Projet | Bleu |
| Workover | Vert foncé |
| Forage | Rouge foncé |
| Intégrité | Teal |
| Maintenance | Orange |
| Exploitation permanente | Gris (fond permanent) |
| Inspection | Violet |
| Événement | Gris clair |

Sous chaque ligne asset, un graphique de charge PAX indique le niveau d'occupation en pourcentage : vert < 70%, orange 70-90%, rouge > 90%.

### 7.2 Filtres disponibles

- Par asset (site, plateforme, zone)
- Par type d'activité
- Par statut (brouillon, validée, en cours)
- Par projet
- Par période (semaine, mois, trimestre, année)

### 7.3 Vue DO — arbitrage

Vue dédiée aux conflits en attente d'arbitrage. Présente les activités en conflit de manière comparative pour faciliter la décision.

### 7.4 Formulaire de création

Formulaire contextuel qui s'adapte au type d'activité sélectionné. Les champs spécifiques (référence puits pour workover, programme de forage pour drilling, etc.) apparaissent ou disparaissent selon le type.

---

## 8. Permissions

| Action | DO | DPROD | CDS | CHEF_PROJET | DEMANDEUR |
|---|:---:|:---:|:---:|:---:|:---:|
| Créer une activité | ✓ | ✓ | ✓ | ✓ | — |
| Soumettre une activité | ✓ | ✓ | ✓ | ✓ | — |
| Valider une activité | ✓ | ✓ | ✓ | — | — |
| Arbitrer un conflit | ✓ | — | — | — | — |
| Modifier une activité validée | ✓ | ✓ | ✓ | — | — |
| Gérer `permanent_ops` | ✓ | ✓ | ✓ | — | — |
| Approuver maintenance corrective d'urgence | ✓ | — | — | — | — |
| Voir toutes les activités | ✓ | ✓ | ✓* | ✓* | — |

*dans leur périmètre d'asset_scope
