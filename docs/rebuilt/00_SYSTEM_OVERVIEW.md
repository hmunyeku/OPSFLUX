# 00 System Overview

## 1. Ce qu'est OpsFlux

OpsFlux est une plateforme d'opérations multi-entité orientée terrain.
Elle couvre:

- la donnée de référence
- les droits et rôles
- les workflows
- les opérations de présence terrain
- la planification
- les voyages et manifestes
- la génération documentaire
- l'assistance IA / MCP

Le système est organisé autour d'un **Core** commun et de **modules** métier.

## 2. Structure logique

### 2.1 Core

Le Core porte les fondations:

- authentification
- utilisateurs, groupes, rôles, permissions
- entités et périmètres d'accès
- settings
- audit
- notifications
- moteur d'événements
- moteur de workflow
- recherche et pièces jointes
- intégrations et MCP

### 2.2 Modules

Les modules actuellement branchés au runtime sont:

- Asset Registry
- Tiers
- Dashboard
- Workflow
- PaxLog
- Conformité
- Projets
- Planner
- TravelWiz
- Report Editor
- PID/PFD
- Messaging
- Support

## 3. Architecture d'intégration

Le point clé d'OpsFlux n'est pas seulement la présence de modules, mais leurs
interactions.

Exemples:

- PaxLog approuve une AdS -> TravelWiz prépare le manifeste
- Planner modifie une activité -> AdS et manifestes passent à revoir
- AVM crée des AdS -> TravelWiz gère les mouvements -> AVM se clôture quand tout est terminé
- Conformité qualifie l'accès terrain -> PaxLog l'utilise pour la décision d'entrée
- Report Editor produit les documents formels à partir des objets métier

## 4. Sources de vérité

Les règles de vérité doivent être explicites:

- identités, sessions, rôles, permissions: Core
- hiérarchie physique et actifs: Asset Registry
- tiers, sociétés, contacts externes: Tiers
- profils PAX, AdS, AVM, incidents, rotations: PaxLog
- règles de conformité: Conformité
- projets, WBS, tâches: Projets
- arbitrage de charge et capacité: Planner
- voyages, vecteurs, manifestes, cargo: TravelWiz
- rapports et PDF officiels: Report Editor
- référentiel PID/PFD: PID/PFD
- communications opérationnelles: Messaging
- support utilisateur et tickets: Support

## 5. Lecture réaliste du projet aujourd'hui

Le projet a une matière fonctionnelle riche, mais trois états coexistent:

- des parties déjà réellement branchées
- des parties partiellement branchées
- des parties surtout décrites dans les docs

La documentation reconstruite ici adopte donc une règle simple:

- décrire le **rôle cible**
- dire le **niveau de maturité**
- expliciter les **dépendances**
- lister les **priorités d'atterrissage**

## 6. Niveaux de maturité à utiliser dans toute la doc

- `implemented`: comportement visible dans le runtime ou clairement confirmé par code
- `partial`: socle présent mais cas métier non terminés
- `target`: logique voulue mais encore principalement documentaire

## 7. Priorité produit immédiate

La priorité opérationnelle demandée est claire:

- rendre **PaxLog fonctionnel ce week-end**

Conséquence:

- toute décision documentaire ou technique doit être jugée d'abord à l'aune de son impact sur PaxLog
- les autres modules doivent être documentés, mais sans disperser l'effort critique

## 8. Arbitrages directeurs validés

Les arbitrages produits et techniques désormais retenus sont:

1. **Système sécurisé d'abord**
   - la vitesse ne justifie pas le maintien de failles structurelles
   - les permissions, scopes et isolations doivent être durcis

2. **Dashboard = module à part entière**
   - ce n'est pas seulement une page d'accueil
   - chaque module peut disposer de son instance de dashboard et de ses insights propres
   - le dashboard global et les dashboards de module doivent partager le même socle

3. **Granularité fine + rôles forts**
   - les permissions restent fines au niveau technique
   - l'exploitation quotidienne se fait via des rôles métier forts
   - les rôles forts agrègent les permissions fines au lieu de les remplacer
