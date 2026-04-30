# PaxLog

## Rôle

Gérer les personnes, leur admissibilité terrain et leurs séjours.

Point d'entrée prioritaire:

- pour un utilisateur standard, PaxLog sert d'abord à demander un séjour ou un avis de mission
- le reste relève surtout de rôles spécialisés

## Fonctions

- profils PAX
- credentials
- matrice de conformité
- AdS
- AVM
- incidents / signalements
- rotations
- programmes de séjour

## Vues cibles par rôle

### Demandeur standard

Vues prioritaires:

- `Nouvelle AdS`
- `Nouvel avis de mission`
- `Mes demandes`
- `Mes brouillons`
- `Mes dossiers à corriger / re-soumettre`

Le demandeur standard ne doit pas tomber d'abord sur:

- la matrice de conformité
- la configuration
- les incidents
- les rotations globales

### Valideur / conformité

Vues prioritaires:

- file des AdS à vérifier
- écarts de conformité
- pièces manquantes / expirées / pending
- dossiers retournés pour correction

### Supervision opérationnelle

Vues prioritaires:

- séjours en cours
- arrivées / départs à venir
- dossiers bloqués
- exceptions terrain
- impacts Planner / TravelWiz

### Administration / référentiel

Vues prioritaires:

- profils
- types de credentials
- matrices
- programmes de séjour
- paramétrage

## Sources de vérité

- PAX et statuts de séjour: PaxLog
- conformité métier d'accès: PaxLog + Conformité
- transport effectif: TravelWiz

## Workflows critiques

- profil PAX -> compliance -> AdS -> TravelWiz
- AVM -> AdS -> retour effectif
- modification Planner -> AdS à revoir

## Formulaires prioritaires à améliorer

### AdS

Le formulaire AdS doit devenir un vrai formulaire transactionnel guidé.

Il doit séparer clairement:

- qui voyage
- pour quoi
- où
- quand
- avec quel rattachement projet / activité
- quelles contraintes de conformité
- qui valide ensuite

Il faut éviter:

- un formulaire trop administratif dès le départ
- des champs non pertinents pour le rôle courant
- des blocs métier mélangés sans hiérarchie

### Avis de mission

Le formulaire d'avis de mission doit être pensé comme un conteneur métier:

- objectif mission
- période
- site(s)
- équipe / intervenants
- programme
- dépendances logistiques
- AdS à générer ou à rattacher

Règle:

- l'avis de mission ne doit pas ressembler à une simple fiche CRUD
- il doit guider la préparation de mission

## Maturité

- `partial`, avec un socle important déjà présent

## Risques

- complexité fonctionnelle élevée
- dépendances fortes avec Tiers, Planner, TravelWiz
- besoin de stabiliser le nominal avant les cas avancés

## Priorités immédiates

1. profils PAX
2. AdS nominale
3. compliance minimale
4. événement vers TravelWiz
5. AVM minimale ensuite

## Règle d'expérience

PaxLog n'a pas une seule UX cible.
Il doit exposer des parcours différents selon:

- rôle fort
- permissions fines
- nature de l'action recherchée

La vue par défaut doit donc être résolue par profil d'usage, pas seulement par permission brute.
