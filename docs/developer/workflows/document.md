# 22 Workflow Document

Date: 2026-04-03

## 1. Objet

Cette fiche décrit le workflow documentaire piloté par `Report Editor`.

## 2. Nature

- workflow déjà relativement bien intégré au moteur FSM

## 3. États typiques

- `draft`
- `in_review`
- `approved`
- `published`
- `obsolete`
- `archived`

## 4. Transitions principales

### `draft -> in_review`

- soumission en revue

### `in_review -> approved`

- approbation

### `in_review -> draft`

- retour pour correction

### `approved -> published`

- publication

### `published -> obsolete`

- obsolescence

### `obsolete -> archived`

- archivage

## 5. Side effects connus

- verrouillage / déverrouillage de révision
- diffusion
- notifications
- événements documentaires

## 6. Point de vigilance

Des fallbacks hors FSM existent encore dans certains flux.
Le module peut servir de bonne base, mais doit être rendu plus strict si on veut un workflow totalement opposable.
