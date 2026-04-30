# 11 Entity BU Asset Operating Model

Date: 2026-04-03

## 1. Objet

Ce document fixe la doctrine opératoire entre:

- entité
- business unit
- actif
- projet
- imputation
- rôles et vues

## 2. Règle de base

### Entité

Une entité est le périmètre principal:

- sécurité
- configuration
- permissions
- workflows
- dashboards
- données métier

Une entité peut comprendre plusieurs `BU`.

### Business Unit

Une BU est une sous-organisation d'une entité.

Exemples:

- département
- direction
- unité d'exploitation
- sous-organisation métier

Une BU peut être associée à:

- des utilisateurs
- des dashboards
- des responsabilités métier
- une logique d'imputation par défaut

Règle validée:

- un utilisateur appartient à une BU

### Actif

L'actif représente le périmètre physique:

- champ
- site
- installation
- équipement
- pipeline

## 3. Doctrine imputation

## 3.1 Règle générale

L'imputation n'est pas toujours projectisée.

Quand un objet métier n'est pas associé à un projet, son imputation par défaut peut venir du contexte organisationnel du demandeur.

Cette logique doit être servie par un vrai module `Imputations`.

## 3.2 Cas AdS

Règle explicitement retenue:

- si une `AdS` est rattachée à un projet, l'imputation suit la logique projet
- si une `AdS` n'est pas rattachée à un projet, l'imputation par défaut est celle du `BU` du demandeur

Conséquence:

- le `BU` du demandeur n'est pas décoratif
- il a un impact métier réel sur l'imputation

## 3.3 Règle cible

Pour tout objet métier avec imputation:

1. si projet explicite -> priorité projet
2. sinon si utilisateur explicite -> priorité utilisateur
3. sinon si groupe -> priorité groupe
4. sinon fallback organisationnel -> BU du demandeur
5. sinon fallback entité

## 3.4 Doctrine recommandée

Il faut distinguer:

- `imputation calculée par défaut`
- `imputation imposée`
- `imputation modifiée manuellement`

Et historiser la source:

- `project`
- `user`
- `group`
- `requester_bu`
- `manual_override`
- `workflow_decision`

## 4. Relation entre organisation et actifs

La bonne lecture d'OpsFlux doit être:

- `entity` = périmètre d'exploitation et de sécurité
- `BU` = périmètre de responsabilité interne
- `asset` = périmètre physique d'exécution

Donc:

- un utilisateur agit dans une entité
- il est rattaché à une BU
- il opère sur un actif via les modules métier

## 5. Conséquences UX

## 5.1 Dashboard

Le dashboard peut être résolu par:

- entité
- rôle fort
- éventuellement BU

## 5.2 PaxLog

Dans `PaxLog`:

- l'utilisateur standard entre par AdS / avis de mission
- son BU peut préremplir ou déduire l'imputation
- l'actif détermine le contexte terrain

## 5.3 Planner / TravelWiz

Dans `Planner` et `TravelWiz`:

- la sécurité est entité-scopée
- la responsabilité opérationnelle peut être BU-scopée
- l'exécution se fait sur l'actif

## 6. Règles à inscrire dans le code

1. un utilisateur peut appartenir à une entité et à une BU de cette entité
2. une BU appartient toujours à une seule entité
3. un actif appartient toujours à une seule entité
4. l'imputation par défaut doit pouvoir être résolue depuis le BU du demandeur
5. toute surcharge manuelle d'imputation doit être tracée

## 7. Ce qu'il reste à formaliser ensuite

1. matrice `module -> source d'imputation par défaut`
2. matrice `rôle fort -> visibilité BU`
3. règles exactes d'héritage BU / groupe / user par module
