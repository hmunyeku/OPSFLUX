# 01 Core Reference

## 1. Rôle du Core

Le Core n'est pas un module de plus.
C'est la couche qui rend tous les modules cohérents.

Il fournit:

- identité
- sécurité
- permissions
- multi-entité
- settings
- audit
- événements
- notifications
- workflow
- recherche
- fichiers et pièces jointes
- intégrations et MCP

## 2. Capacités Core

### 2.1 Identité et accès

Le Core porte:

- login
- sessions
- tokens
- MFA
- profils utilisateur
- rôles
- groupes
- permissions

Règle:

- aucun module ne doit réimplémenter une authentification ou une permission locale

### 2.2 Multi-entité et contexte

Le Core gère le contexte actif:

- utilisateur
- entité
- tenant / schéma

Point de vigilance réel:

- le projet contient encore des incohérences importantes sur la gestion tenant et les en-têtes de contexte
- cette zone doit être stabilisée avant toute montée en charge sérieuse

### 2.3 Settings

Le Core porte la hiérarchie de settings:

- plateforme
- entité
- utilisateur
- éventuellement module

Règle cible:

- lecture et écriture strictement contrôlées par scope et permission

Point de vigilance réel:

- l'API settings actuelle est trop permissive et doit être sécurisée

### 2.4 Audit et traçabilité

Chaque action sensible doit laisser:

- un audit log
- un acteur
- un objet
- un contexte entité
- une date
- un détail utile

### 2.5 Event bus

Le bus d'événements est l'outil principal de synchronisation inter-modules.

Exemples structurants:

- `ads.approved`
- `planner.activity.modified`
- `travelwiz.manifest.validated`
- `mission_notice.*`

Règle:

- les modules se couplent par événements et contrats, pas par appels ad hoc dispersés

### 2.6 Workflow engine

Le Core porte les machines d'états génériques.
Les modules décrivent leurs objets et transitions métier.

### 2.7 Notifications

Le Core centralise:

- notifications in-app
- email
- websocket

### 2.8 Intégrations et MCP

Le Core expose:

- intégrations applicatives
- synchronisations externes
- serveurs MCP et plugins

## 3. Contrats imposés aux modules

Chaque module doit:

1. déclarer un manifest
2. exposer ses permissions
3. respecter le contexte entité
4. passer par le Core pour notifications, audit, settings et auth
5. éviter toute duplication de services Core

## 4. Risques Core connus

Priorité haute:

- seed de dev exécuté au démarrage
- isolement tenant fragile
- settings insuffisamment sécurisés
- endpoints d'intégration trop ouverts
- divergence docs/code sur architecture réelle

## 5. Définition de done Core

Une évolution Core n'est terminée que si:

1. le contrat est écrit ici
2. les permissions sont synchronisées
3. l'audit existe
4. le workflow et les événements sont nommés proprement
5. l'impact multi-module est documenté dans les workflows

## 6. Doctrine sécurité

Doctrine validée:

- **secure by default**
- pas de lecture implicite d'un module sans permission explicite
- pas de fallback multi-tenant permissif en production cible
- pas de maintien durable d'un mode dev dangereux dans le runtime normal

Conséquence immédiate:

- les routes de lecture doivent être revues au même niveau d'exigence que les routes d'écriture
- les dashboards, widgets et insights doivent eux aussi être filtrés par permission et rôle
