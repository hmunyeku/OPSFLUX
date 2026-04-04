# 20 Workflow AdS

Date: 2026-04-03

## 1. Objet

Cette fiche décrit le workflow métier et technique de l'`AdS`.

## 2. Nature

- objet critique
- fortement transverse
- doit tendre vers `workflow-driven`

## 3. Acteurs

- demandeur interne
- tiers externe via lien sécurisé
- valideur conformité
- valideur métier / opération
- superviseur mouvement

## 4. États métier

- `draft`
- `pending_compliance`
- `pending_validation`
- `approved`
- `rejected`
- `requires_review`
- `in_progress`
- `completed`
- `cancelled`

## 5. Transitions principales

### `draft -> pending_compliance`

Déclencheur:

- soumission initiale du demandeur

Conditions:

- dossier minimal complet
- PAX identifié
- site / dates / justification renseignés

Side effects:

- contrôle conformité initial
- calcul / proposition d'imputation
- émission d'événements utiles

### `draft -> pending_validation`

Déclencheur:

- soumission initiale si la conformité ne bloque pas

### `pending_compliance -> pending_validation`

Déclencheur:

- validation ou régularisation conformité

### `pending_* -> rejected`

Déclencheur:

- rejet par un valideur

Conditions:

- commentaire de rejet obligatoire

Side effects:

- notification
- dossier renvoyé au demandeur

### `pending_* -> approved`

Déclencheur:

- approbation finale

Side effects:

- émission vers TravelWiz
- génération documentaire éventuelle
- gel métier du dossier

### `approved -> requires_review`

Déclencheur:

- impact Planner
- changement de dates
- changement de conformité
- retour/correction externe

### `approved -> in_progress`

Déclencheur:

- embarquement / arrivée effective selon logique de mouvement

### `in_progress -> completed`

Déclencheur:

- retour effectif confirmé

### `* -> cancelled`

Déclencheur:

- annulation autorisée selon statut et rôle

## 6. Points sensibles

- imputation
- conformité contextualisée
- re-soumission externe
- prolongation de séjour
- révision suite à arbitrage Planner

## 7. Règles imputation

- le demandeur interne peut saisir / corriger avant validation
- l'externe ne peut jamais modifier l'imputation
- chaque valideur peut encore l'ajuster avant validation finale

## 8. Side effects critiques

- `ads.approved`
- alimentation TravelWiz
- PDF / documents
- notifications
- audit

## 9. Cible

L'AdS doit devenir un workflow pleinement opposable, sans fallback silencieux hors FSM sur les transitions critiques.
