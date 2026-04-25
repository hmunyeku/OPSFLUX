# 24 Workflow Support Ticket

Date: 2026-04-03

## 1. Objet

Cette fiche décrit la cible de workflow pour le ticket Support.

## 2. Nature

- workflow encore à clarifier
- objet potentiellement hybride aujourd'hui

## 3. États cibles recommandés

- `new`
- `triaged`
- `in_progress`
- `waiting_user`
- `resolved`
- `closed`
- `cancelled`

## 4. Transitions principales

### `new -> triaged`

- qualification initiale

### `triaged -> in_progress`

- prise en charge

### `in_progress -> waiting_user`

- attente retour demandeur

### `waiting_user -> in_progress`

- retour reçu

### `in_progress -> resolved`

- solution apportée

### `resolved -> closed`

- clôture confirmée

## 5. Side effects

- notifications
- horodatage prise en charge
- historique des actions
- éventuels SLA

## 6. Point critique

Le module Support doit être explicitement positionné:

- simple ticket opérationnel
- incident métier
- canal support transverse

Tant que cela n'est pas verrouillé, son workflow restera ambigu.
