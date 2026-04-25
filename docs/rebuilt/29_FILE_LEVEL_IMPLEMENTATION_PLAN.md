# 29 File Level Implementation Plan

Date: 2026-04-03

## 1. Objet

Découper l'exécution par fichiers et zones de code pour éviter les tickets trop abstraits.

## 2. Lot sécurité socle

### `app/main.py`

- retirer ou protéger strictement le seed dev automatique

### `app/core/middleware/tenant.py`

- supprimer les comportements permissifs
- verrouiller la résolution du contexte

### `app/core/login_security.py`

- supprimer les comportements fail-open sur les chemins critiques

## 3. Lot permissions lecture

### `app/api/routes/modules/tiers.py`

- ajouter permissions explicites sur les lectures

### `app/api/routes/modules/projets.py`

- ajouter permissions explicites sur les lectures

### `app/api/routes/modules/planner.py`

- ajouter permissions explicites sur les lectures

### `app/api/routes/core/dashboard.py`

- aligner permissions, routes et usages frontend

## 4. Lot polymorphes

### `app/api/routes/core/attachments.py`

- ajouter validation stricte `owner_type`
- brancher héritage permission parent

### `app/api/routes/core/notes.py`

- même logique

### `app/api/routes/core/tags.py`

- même logique

### `app/api/routes/core/cost_imputations.py`

- limiter aux `owner_type` autorisés
- préparer branchement module `Imputations`

## 5. Lot Imputations

### `app/models/common.py`

- conserver `cost_imputations` comme couche d'affectation

### nouveaux fichiers module imputations

- modèle référentiel imputations
- modèle types
- modèle rubriques OTP
- modèle templates OTP
- resolver partagé

## 6. Lot PaxLog UX

### `apps/main/src/pages/paxlog/PaxLogPage.tsx`

- homepage demandeur
- hiérarchie des vues
- mise en avant AdS / AVM

### hooks/services PaxLog

- brancher préremplissage d'imputation
- brancher statut et actions par rôle

## 7. Lot Dashboard

### `apps/main/src/services/dashboardService.ts`

- corriger contrats d'URL

### `app/api/routes/core/dashboard.py`

- aligner avec frontend

## 8. Lot workflow

### `app/services/core/fsm_service.py`

- référence moteur

### services modules

- identifier et réduire fallbacks hors FSM
