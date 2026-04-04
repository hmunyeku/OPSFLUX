# 32 Module Gap Matrix

Date: 2026-04-03

## 1. Objet

Rendre visible ce qui est:

- déjà bien en place
- partiel
- cible uniquement

## 2. Matrice

### Core

- statut: `partial`
- gaps:
  - tenant hardening
  - settings hardening
  - permissions lecture incomplètes

### Dashboard

- statut: `partial`
- gaps:
  - contrat frontend/backend
  - résolution home par rôle fort + BU

### PaxLog

- statut: `partial`
- gaps:
  - UX demandeur
  - formulaires AdS / AVM
  - homogénéité workflow

### Planner

- statut: `partial`
- gaps:
  - permissions lecture
  - vue pilotage à renforcer

### TravelWiz

- statut: `partial`
- gaps:
  - portail terrain sécurisé
  - lien AdS -> mouvements
  - cargo nominal complet

### Asset Registry

- statut: `implemented/partial`
- gaps:
  - doctrine transverse org/asset à mieux exposer

### Workflow

- statut: `partial`
- gaps:
  - objets hybrides
  - documentation par objet

### Imputations

- statut: `target`
- gaps:
  - module à créer
  - référentiel
  - OTP
  - resolver

### Support

- statut: `partial`
- gaps:
  - workflow à verrouiller

## 3. Règle

Chaque ticket doit dire explicitement s'il:

- ferme un gap `partial`
- implémente une cible `target`
- durcit une zone déjà `implemented`
