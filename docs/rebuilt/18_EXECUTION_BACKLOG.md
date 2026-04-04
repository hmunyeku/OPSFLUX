# 18 Execution Backlog

Date: 2026-04-03

## 1. Objet

Backlog atomique orienté exécution.

## 2. Lot 1 Sécurité socle

### T-001

Sujet:

- supprimer le seed dev automatique au démarrage normal

Done:

- aucun seed dev hors mode explicitement activé

### T-002

Sujet:

- durcir le middleware tenant

Done:

- plus de fallback permissif dangereux
- validation stricte du contexte

### T-003

Sujet:

- fermer les lectures sans permission explicite sur `tiers`, `projets`, `planner`

Done:

- tous les GET critiques ont une permission explicite

## 3. Lot 2 Portails et polymorphes

### T-004

Sujet:

- imposer une whitelist backend centrale des `owner_type`

Done:

- tout `owner_type` hors whitelist est rejeté

### T-005

Sujet:

- faire hériter strictement les polymorphes des permissions du parent

Done:

- lecture/écriture testées sur parent et polymorphes

### T-006

Sujet:

- sécuriser les liens externes et portails terrain

Done:

- session externe bornée
- token sécurisé
- pas de route “temporaire” non protégée

## 4. Lot 3 Imputations

### T-007

Sujet:

- créer le référentiel module `Imputations`

Done:

- types
- imputations
- validité temporelle

### T-008

Sujet:

- créer les rubriques OTP et modèles OTP

Done:

- import
- réutilisation

### T-009

Sujet:

- créer le resolver d'imputation

Done:

- ordre projet -> user -> groupe -> BU -> entité

### T-010

Sujet:

- brancher PaxLog sur le resolver

Done:

- préremplissage
- override demandeur interne
- override valideur

## 5. Lot 4 PaxLog UX

### T-011

Sujet:

- refondre la homepage PaxLog pour `demandeur`

Done:

- entrée principale AdS / AVM

### T-012

Sujet:

- refondre le formulaire AdS

Done:

- formulaire guidé
- hiérarchie claire
- imputation claire

### T-013

Sujet:

- refondre le formulaire AVM

Done:

- logique mission lisible

## 6. Lot 5 Dashboard et vues

### T-014

Sujet:

- corriger le contrat frontend/backend du Dashboard

### T-015

Sujet:

- résoudre les home dashboards par rôle fort + BU

### T-016

Sujet:

- aligner les vues module selon les matrices documentées
