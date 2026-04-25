# 16 Module View Permissions

Date: 2026-04-03

## 1. Objet

Cette matrice définit quelles vues doivent être exposées par module selon rôle fort et permissions.

## 2. PaxLog

### Vues

- `home_demandeur`
- `ads_create`
- `avm_create`
- `my_requests`
- `validation_queue`
- `compliance_ops`
- `stay_supervision`
- `configuration`

### Exposition

- `demandeur`:
  - `home_demandeur`
  - `ads_create`
  - `avm_create`
  - `my_requests`
- `valideur_conformite`:
  - `validation_queue`
  - `compliance_ops`
- `superviseur_mouvement`:
  - `stay_supervision`
- `admin_module`:
  - toutes les vues

## 3. TravelWiz

### Vues

- `ops_dashboard`
- `voyages`
- `manifests`
- `cargo`
- `vectors`
- `terrain_portal`
- `configuration`

### Exposition

- `log_base`:
  - `ops_dashboard`
  - `voyages`
  - `manifests`
  - `cargo`
- `superviseur_mouvement`:
  - `ops_dashboard`
  - `voyages`
  - `manifests`
- `ops_terrain`:
  - `terrain_portal`
- `admin_module`:
  - toutes les vues

## 4. Planner

### Vues

- `gantt`
- `activities`
- `conflicts`
- `capacity`

### Exposition

- `chef_projet`:
  - `activities`
  - `gantt`
- `superviseur_mouvement`:
  - `conflicts`
  - `capacity`
  - `gantt`
- `admin_module`:
  - toutes les vues

## 5. Dashboard

Les vues dashboard sont résolues par:

- rôle fort
- permissions
- BU éventuelle
- module concerné

Règle:

- un widget ne doit jamais être visible si la vue source ne l'est pas.
