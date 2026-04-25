# Workflow

## Rôle

Porter le moteur générique de machines d'états du produit.

Le module `Workflow` ne décrit pas à lui seul tous les processus métier.
Il fournit:

- la FSM technique
- les définitions de transition
- les guards
- l'historique
- les événements associés

## Fonctions

- définitions de workflow
- états et transitions
- guards par rôle et permission
- historique immuable des transitions
- instanciation sur objets métier
- émission d'événements de transition

## Dépendances

- Core pour auth, audit, events
- utilisé déjà par Report Editor et PID/PFD
- destiné à être utilisé plus explicitement par PaxLog, Support et autres modules critiques

## Maturité

- `partial`

## Point critique

Il faut distinguer clairement:

1. workflow métier
2. FSM technique
3. side effects métier

Sans cela, le mot "workflow" reste ambigu.

## Risques

- objets annoncés comme pilotés par workflow mais encore hybrides
- fallback de changement de statut hors FSM
- documentation trop faible sur les transitions réelles

## Priorités

1. expliciter pour chaque module ce qui relève du moteur générique et ce qui relève de la logique métier locale
2. identifier les objets réellement `workflow-driven`
3. documenter les transitions et side effects des objets critiques
4. supprimer progressivement les fallbacks hors FSM quand le workflow doit être opposable
