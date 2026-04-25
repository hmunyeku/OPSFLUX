# Imputations

## Rôle

Gérer le référentiel des imputations et les règles de résolution utilisées par les autres modules.

Ce module est une source de vérité métier.
Il ne se limite pas à stocker des répartitions polymorphes sur des objets.

## Fonctions

- référentiel des imputations
- types d'imputation
- gestion des OTP associés
- modèles d'OTP réutilisables
- validité temporelle par exercice ou période
- associations BU / groupe / user / projet
- moteur de proposition d'imputation
- contrôle des règles comptables fortes
- alimentation des listes déroulantes de choix

## Structure d'une imputation

Une imputation est un objet riche.

Elle porte au minimum:

- `nom`
- `code`
- `type`
- `statut`
- `période de validité`
- `OTP` associé

## Type d'imputation

Chaque imputation a un type.

Exemples:

- `OPEX`
- `SOPEX`
- `CAPEX`

La liste doit rester configurable au niveau référentiel.

## OTP

L'OTP fait partie du modèle métier d'imputation.

Il est composé d'une liste de rubriques codifiées, par exemple:

- `M01`
- `L03`

Exemples métier:

- `M01` = matériel HSE
- `L03` = catering et accommodation

Règles:

- les rubriques OTP doivent pouvoir être importées
- on peut créer des modèles OTP réutilisables
- un modèle OTP peut être affecté à une nouvelle imputation

## Associations

Une imputation peut être associée à:

- une BU
- un groupe
- un utilisateur
- un projet

## Résolution

Ordre de proposition retenu:

1. projet
2. utilisateur explicite
3. groupe
4. BU
5. fallback entité

## Règle métier AdS

- ce que saisit un utilisateur interne demandeur fait foi
- un utilisateur externe ne peut jamais modifier l'imputation
- chaque valideur peut encore modifier l'imputation avant validation

## Validité temporelle

Une imputation peut changer entre deux exercices.

Le module doit donc gérer:

- période de validité
- historique
- proposition correcte selon la date métier du dossier

## Règles comptables fortes

Le module doit porter des règles de compatibilité fortes.

Exemple:

- on ne peut pas imputer une `AdS` sur un `OTP matériel`

## Dépendances

- Core pour auth, permissions, audit, settings
- entités / BU / groupes / users
- projets
- modules consommateurs comme PaxLog et TravelWiz

## Maturité actuelle

- `target`

Le système dispose aujourd'hui d'une couche polymorphe `cost_imputations`, mais pas encore du vrai module métier complet.

## Priorités

1. référentiel d'imputation
2. rubriques OTP et modèles OTP
3. associations organisationnelles
4. moteur de résolution partagé
5. branchement PaxLog en premier
