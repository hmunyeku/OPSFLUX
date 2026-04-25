# PAXLOG Functional Recipe

Date: 2026-04-04

## Objet

Ce document sert de recette exécutable pour répondre à une question simple:

- `PaxLog est-il fonctionnellement complet ?`

La réponse actuelle est:

- `non, pas encore complètement`
- `oui, le socle principal est désormais testable sérieusement`

## Statut Global

### Solide

- parcours demandeur `AdS`
- parcours demandeur `AVM`
- vues demandeur / valideur distinctes
- permissions mieux alignées sur les vues
- logique d’imputation `AdS` branchée côté backend
- dictionnaires métier branchés au lieu de listes codées en dur
- i18n largement rétablie sur les vues principales

### Partiel

- révision / correction / re-soumission bout en bout
- prolongation de séjour
- cas d’impact `Planner -> PaxLog -> TravelWiz`
- portail externe `compléter / soumettre / re-soumettre`
- conformité temps réel opposable dans tous les cas critiques
- couverture de tests métier automatisés

### Non encore fermé

- recette end-to-end avec données réalistes
- validation multi-rôle sur environnement proche réel
- validation complète des cas `in_progress`, changement de date, arbitrage, retour anticipé

## Définition De Done Fonctionnelle

`PaxLog` ne sera considéré fonctionnellement complet que si les points suivants passent:

1. un demandeur peut créer, compléter et soumettre un `AdS`
2. un demandeur peut créer, cadrer et soumettre un `AVM`
3. un valideur peut approuver, rejeter ou annuler selon ses permissions
4. l’imputation proposée est cohérente avec la chaîne backend attendue
5. les vues affichées dépendent bien des rôles forts et permissions fines
6. les statuts visibles correspondent aux transitions réellement autorisées
7. les cas d’erreur critiques sont compréhensibles pour l’utilisateur
8. aucun accès cross-entité ou cross-owner n’est observable

## Recette Prioritaire

### Bloc A. Demandeur AdS

1. Ouvrir `PaxLog` avec un compte demandeur standard.
   Attendu:
   - homepage demandeur visible
   - actions principales `Nouvel AdS` et `Nouvel AVM`
   - pas de vues avancées de conformité/validation si le rôle ne les porte pas

2. Créer un `AdS`.
   Attendu:
   - formulaire charge sans liste codée en dur
   - catégories, types et transports viennent des dictionnaires
   - aucun libellé métier critique ne reste figé en français

3. Remplir:
   - site d’entrée
   - catégorie
   - dates
   - objet de visite
   - projet éventuel
   Attendu:
   - checklist de création cohérente
   - création possible seulement avec les champs minimums

4. Ouvrir le détail du dossier créé.
   Attendu:
   - statut `draft`
   - section passagers vide mais lisible
   - suggestion d’imputation visible si disponible

5. Ajouter un ou plusieurs PAX.
   Attendu:
   - recherche PAX fonctionne
   - distinction `interne / externe`
   - impossibilité d’ajouter deux fois le même PAX

6. Vérifier l’imputation.
   Attendu:
   - suggestion backend cohérente
   - pas de `CAPEX / OTP` accepté pour `ads`
   - imputation éditable seulement si le statut le permet

7. Soumettre l’AdS.
   Attendu:
   - transition autorisée uniquement si permission présente
   - message d’état cohérent après soumission

### Bloc B. Demandeur AVM

1. Créer un `AVM`.
   Attendu:
   - formulaire lisible
   - type mission via dictionnaire
   - lignes programme ajoutables proprement

2. Renseigner:
   - titre
   - type de mission
   - fenêtre mission
   - au moins une ligne
   Attendu:
   - checklist de cadrage cohérente
   - les champs de ligne peuvent reprendre les dates mission

3. Soumettre l’AVM.
   Attendu:
   - passage hors brouillon selon règles de permission
   - lecture demandeur compréhensible dans le détail

### Bloc C. Valideur AdS

1. Ouvrir `PaxLog` avec un compte valideur.
   Attendu:
   - homepage valideur visible
   - file prioritaire `AdS`
   - alertes conformité visibles si permission correspondante

2. Ouvrir une `AdS` soumise.
   Attendu:
   - bouton `Valider` ou `Rejeter` seulement si permission présente
   - prochaine action compréhensible
   - imputation consultable et ajustable avant validation finale

3. Rejeter le dossier.
   Attendu:
   - motif de rejet saisissable
   - transition visible dans l’historique

4. Tester un dossier corrigé puis validé.
   Attendu:
   - workflow lisible
   - historique cohérent

### Bloc D. Valideur AVM

1. Ouvrir un `AVM` en préparation.
   Attendu:
   - checklist lisible
   - lignes programme visibles
   - boutons alignés sur les permissions

2. Approuver ou annuler.
   Attendu:
   - transitions cohérentes
   - statut final affiché proprement

## Recette Sécurité

### Permissions

- un demandeur ne voit pas les actions valideur
- un valideur ne doit pas voir plus que ce que ses permissions autorisent
- un bouton visible doit correspondre à une capacité backend réelle

### Multi-entité

- aucun projet d’une autre entité n’est sélectionnable
- aucune imputation étrangère à l’entité n’est enregistrable
- aucune donnée `AdS / AVM / PAX` d’une autre entité n’est remontée

### Polymorphes

- fichiers, notes, tags et imputations héritent bien des droits du parent
- aucun owner non autorisé n’est accepté

## Recette Imputation

Ordre à valider:

1. projet
2. user explicite
3. group explicite
4. BU
5. fallback entité

État réel actuel:

- `project` OK
- `user` OK via settings / assignments
- `group` partiellement dépendant du modèle existant
- `BU` OK
- `entity` OK

Règles fortes à valider:

- `ads` refuse les références OTP/CAPEX
- `ads` n’accepte pas une imputation cross-entité
- une imputation invalide doit échouer côté backend avec message utile

## Gaps Restants

### Gaps Produit

- scénario de prolongation `AdS`
- scénario de changement de date en mission
- scénario de réarbitrage `Planner`
- scénario de retour / descente à terre avec impact `TravelWiz`
- portail externe sécurisé complet

### Gaps Techniques

- tests automatisés E2E insuffisants
- quelques reliquats UI probables dans le gros fichier `PaxLogPage.tsx`
- validation workflow encore à confirmer sur tous les objets hybrides

## Verdict

Verdict à ce stade:

- `PaxLog` est désormais `testable sérieusement`
- `PaxLog` n’est pas encore `fonctionnellement complet`

Le bon objectif court terme n’est plus “continuer à embellir l’écran”, mais:

1. exécuter cette recette sur données réelles
2. noter chaque échec par scénario
3. corriger seulement les écarts fonctionnels prouvés
4. verrouiller ensuite les cas avancés multi-modules
