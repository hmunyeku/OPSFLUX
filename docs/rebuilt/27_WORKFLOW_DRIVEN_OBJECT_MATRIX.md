# 27 Workflow Driven Object Matrix

Date: 2026-04-03

## 1. Objet

Classer les objets métier selon leur relation au moteur workflow.

## 2. Matrice

### `workflow-driven` cible

- `ads`
- `avm`
- `document`
- `pid_document`
- `support_ticket`

### `déjà assez intégrés`

- `document`
- `pid_document`

### `hybrides à clarifier`

- `ads`
- `avm`
- `support_ticket`

### `hors moteur FSM pour l'instant`

- certains statuts internes `travelwiz.cargo`
- certains statuts internes `planner.activity`

## 3. Règle

Quand un objet passe en `workflow-driven`, il ne doit plus changer de statut critique hors FSM.
