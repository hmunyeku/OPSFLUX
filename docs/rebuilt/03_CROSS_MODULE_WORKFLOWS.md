# 03 Cross Module Workflows

## 1. Objet

Ce document décrit les workflows qui traversent plusieurs modules.
Ce sont eux qui doivent piloter la roadmap, pas les fonctionnalités isolées.

## 2. Workflow PAX terrain

Chaîne:

`Tiers / Users -> PaxLog profil PAX -> Conformité -> AdS -> Planner -> TravelWiz -> retour terrain`

Étapes:

1. création ou identification du PAX
2. rattachement interne ou externe
3. contrôle de conformité pour le site
4. création AdS
5. validation AdS
6. alimentation Transport / manifeste
7. présence terrain
8. retour effectif
9. clôture

Point d'entrée utilisateur:

- pour un utilisateur standard, ce workflow commence généralement par `Nouvelle AdS`
- les écrans de contrôle, validation et supervision sont des parcours de rôles spécialisés

## 3. Workflow AVM mission

Chaîne:

`PaxLog AVM -> tâches préparatoires -> AdS générées -> TravelWiz -> clôture mission`

Étapes:

1. création AVM
2. programme de mission
3. PAX par ligne
4. création des tâches prépa
5. génération des AdS
6. validation des AdS
7. mouvements aller
8. séjour et modifications éventuelles
9. retours effectifs
10. clôture AVM

Point d'entrée utilisateur:

- pour un utilisateur standard, l'avis de mission est le deuxième grand point d'entrée naturel de PaxLog avec l'AdS
- la logique de génération, révision et suivi doit donc être extrêmement lisible côté formulaire

## 3 bis. Workflow externe Tiers

Chaîne:

`PaxLog interne -> lien sécurisé externe -> complément / soumission / re-soumission -> revue interne -> suite du workflow`

Étapes:

1. création du dossier interne
2. génération du lien externe
3. authentification externe contrôlée
4. complément d'information par le tiers
5. soumission externe
6. revue interne
7. correction ou re-soumission éventuelle
8. reprise du workflow normal

Règle:

- ce parcours doit être traité comme un vrai workflow externe, pas comme un simple formulaire public

## 4. Workflow charge et arbitrage

Chaîne:

`Projets -> Planner -> PaxLog -> TravelWiz`

Étapes:

1. le projet définit le besoin
2. Planner organise activités, capacité et conflits
3. PaxLog ouvre ou révise les AdS
4. TravelWiz ajuste les manifestes

Cas critique:

- toute modification Planner impactant des présences ou transports doit déclencher un `requires_review`

## 5. Workflow cargo

Chaîne:

`Projets -> TravelWiz cargo -> manifeste cargo -> site -> retour / back cargo`

Étapes:

1. enregistrement du colis
2. imputation projet / coût
3. affectation manifeste cargo
4. chargement
5. transit
6. réception terrain
7. anomalie éventuelle
8. retour site éventuel

## 6. Workflow documentaire officiel

Chaîne:

`Modules métier -> Report Editor -> PDF / export / diffusion`

Objets typiques:

- AdS PDF
- manifeste PAX
- manifeste cargo
- rapport de déchargement
- documents PID/PFD

## 7. Workflow IA / MCP

Chaîne:

`Core settings -> connecteurs / MCP -> aide opérateur -> action encadrée`

Règle:

- un outil IA n'est jamais source de vérité métier
- il assiste, il ne remplace pas les validations système

## 8. Workflows à traiter en priorité

Priorité 1:

- PAX terrain nominal
- AdS -> TravelWiz
- AVM -> AdS -> retour

Priorité 2:

- cargo complet
- projet -> planner -> transport

Priorité 3:

- génération documentaire exhaustive
- orchestration IA avancée
