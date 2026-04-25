# 26 Module Home Resolvers

Date: 2026-04-03

## 1. Objet

Définir la page d'entrée effective d'un module selon:

- rôle fort
- permissions
- contexte

## 2. PaxLog

### Demandeur

Home:

- `Nouvelle AdS`
- `Nouvel avis de mission`
- `Mes dossiers`
- `À corriger`

### Valideur conformité

Home:

- `Dossiers à vérifier`
- `Bloqués conformité`

### Superviseur mouvement

Home:

- `Séjours en cours`
- `Mouvements à venir`

## 3. TravelWiz

### Log base

Home:

- `Ops dashboard`

### Ops terrain

Home:

- `Portail terrain`

## 4. Planner

### Chef projet

Home:

- `Activités / Gantt`

### Superviseur

Home:

- `Conflits / capacité`

## 5. Dashboard

Home:

- résolu par `rôle fort + BU + permissions`

## 6. Règle

Le resolver doit être centralisé, pas codé page par page.
