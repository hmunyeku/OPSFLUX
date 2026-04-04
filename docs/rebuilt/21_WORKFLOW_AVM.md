# 21 Workflow AVM

Date: 2026-04-03

## 1. Objet

Cette fiche décrit le workflow de l'`AVM` (avis de mission).

## 2. Nature

- objet de préparation mission
- conteneur métier
- source potentielle de génération d'AdS

## 3. Acteurs

- demandeur interne
- chef de projet
- valideur métier
- superviseur opération

## 4. États métier

- `draft`
- `in_preparation`
- `active`
- `ready`
- `completed`
- `cancelled`

## 5. Transitions principales

### `draft -> in_preparation`

Déclencheur:

- création initiale puis début de structuration mission

### `in_preparation -> active`

Déclencheur:

- programme mission suffisamment structuré
- intervenants / activités / sites renseignés

### `active -> ready`

Déclencheur:

- AdS associées prêtes ou générées
- prérequis logistiques traités

### `ready -> completed`

Déclencheur:

- mission terminée
- retours effectifs confirmés

### `* -> cancelled`

Déclencheur:

- annulation métier

## 6. Side effects

- génération ou rattachement d'AdS
- création de tâches préparatoires
- coordination Planner / TravelWiz

## 7. Point critique UX

L'AVM ne doit pas être une simple fiche CRUD.
C'est un formulaire / dossier de préparation de mission.

## 8. Cible

L'AVM doit être documenté comme workflow métier transverse, avec logique claire de préparation, activation, exécution et clôture.
