# 17 Status Action Matrix

Date: 2026-04-03

## 1. Objet

Cette matrice définit les actions autorisées selon le statut métier.

## 2. AdS

### `draft`

Actions:

- modifier
- supprimer
- soumettre
- modifier imputation si demandeur interne

### `pending_compliance`

Actions:

- lire
- corriger si retour demandé
- valider / rejeter côté valideur
- ajuster imputation côté valideur

### `pending_validation`

Actions:

- lire
- approuver
- rejeter
- ajuster imputation côté valideur

### `approved`

Actions:

- lire
- générer PDF
- transmettre au flux TravelWiz
- réviser si impact Planner / conformité

### `in_progress`

Actions:

- superviser
- prolonger / revoir
- organiser retour

### `completed`

Actions:

- lecture seule

### `rejected` / `requires_review`

Actions:

- corriger
- re-soumettre

## 3. AVM

### `draft`

- modifier
- compléter programme
- soumettre

### `active` / `ready`

- suivre
- ajuster selon règles métier

### `completed`

- lecture seule
