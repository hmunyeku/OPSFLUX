# 28 Ticket Acceptance And Tests

Date: 2026-04-03

## 1. Objet

Définir la structure minimale obligatoire d'un ticket exécutable.

## 2. Format obligatoire

Chaque ticket doit contenir:

- objectif
- fichiers concernés
- dépendances
- critères d'acceptation
- tests attendus
- risques de régression

## 3. Tests minimaux par catégorie

### Sécurité

- lecture refusée sans permission
- lecture autorisée avec permission
- écriture refusée sans permission
- scoping entité respecté

### Workflow

- transition valide réussit
- transition interdite échoue
- rôle insuffisant échoue
- historique enregistré

### UI conditionnelle

- bonne home selon rôle fort
- vue masquée sans permission
- action masquée si statut non compatible

### Polymorphes

- owner_type hors whitelist rejeté
- accès refusé si parent illisible
- accès autorisé si parent lisible

### Imputations

- proposition correcte selon ordre de résolution
- blocage comptable fort testé
- règle temporelle par exercice testée

## 4. Définition de done

Un ticket n'est terminé que si:

1. le comportement attendu est codé
2. les permissions sont alignées
3. les tests sont exécutés ou écrits
4. la doc reconstruite est mise à jour si le contrat change
