# 12 Reusable And Polymorphic Components

Date: 2026-04-03

## 1. Objet

Ce document clarifie les composants réutilisables et les objets polymorphes partagés par les modules.

Le but est d'éviter:

- la duplication de logique
- les implémentations divergentes par module
- les trous de sécurité sur des objets transverses

## 2. Définition

Un objet polymorphe est un objet Core réutilisable qui peut être rattaché à plusieurs types d'objets métier via:

- `owner_type`
- `owner_id`

## 3. Polymorphes déjà présents

Le système utilise déjà largement ce modèle pour:

- `attachments`
- `notes`
- `tags`
- `phones`
- `contact_emails`
- `addresses`
- `cost_imputations`
- divers identifiants ou sous-objets partagés

## 4. Ce que cela veut dire produit

Un module métier ne doit pas recréer sa propre logique locale pour:

- joindre un fichier
- ajouter une note
- tagger un objet
- gérer une imputation

Il doit consommer le socle Core.

## 5. Pièces jointes

Les `attachments` sont polymorphes:

- `owner_type`
- `owner_id`
- `entity_id`
- metadata fichier

Règles à imposer:

1. les permissions de lecture d'un fichier dépendent du droit de lire l'objet propriétaire
2. les permissions d'upload dépendent du droit de modifier l'objet propriétaire
3. le stockage fichier ne doit jamais court-circuiter le contrôle sur l'objet métier
4. toute pièce jointe doit être traçable: uploader, date, owner, entity

## 6. Notes

Les `notes` sont polymorphes et peuvent être:

- publiques dans le périmètre autorisé
- privées selon le modèle choisi

Règle:

- la visibilité d'une note doit rester cohérente avec la sensibilité de l'objet propriétaire

## 7. Tags

Les `tags` sont polymorphes et servent à:

- classer
- filtrer
- accélérer la recherche

Règle:

- un tag n'est pas une permission
- un tag n'est pas un statut workflow
- un tag n'est pas une donnée de référence métier structurante

## 8. Imputations

Les `cost_imputations` sont polymorphes, mais ils ne constituent pas le module métier `Imputations`.

Ils représentent seulement la couche d'affectation sur les objets métier:

- une AdS peut avoir des imputations
- un voyage peut avoir des imputations
- d'autres objets métier peuvent en avoir aussi

Le référentiel, la proposition et les règles fortes doivent venir du module `Imputations`.

Règles:

1. la somme doit être 100%
2. la source d'imputation par défaut doit être explicitée par module
3. la logique projet / BU / override manuel doit être historisée
4. la liste de choix doit provenir du référentiel d'imputations, pas d'une saisie libre

## 9. Composants UI réutilisables

Le frontend a déjà de bons composants réutilisables:

- `AttachmentManager`
- `NoteManager`
- `TagManager`
- `ImputationManager`
- `CrossModuleLink`
- `AssetPicker`

Règle de conception:

- on améliore ces composants partagés au lieu de réécrire des variantes locales dans chaque module

## 10. Contrat obligatoire des composants polymorphes

Tout composant polymorphe doit déclarer clairement:

- owner_type autorisés
- permissions requises
- scoping entité
- comportement lecture / écriture
- audit attendu

## 11. Risques actuels

Les risques classiques sur ce type de système sont:

- `owner_type` libre sans whitelist stricte
- lecture d'objet polymorphe sans vérifier la permission sur l'objet parent
- duplication de fichiers / notes hors socle partagé
- confusion entre donnée transverse et donnée métier locale

## 12. Règle cible

Tous les polymorphes doivent être considérés comme des services Core:

- sécurisés
- whitelistés
- audités
- cohérents en UX

Un module ne peut les utiliser que s'il respecte leur contrat.

Règle validée:

- il doit exister une whitelist stricte centrale des `owner_type` autorisés
- un polymorphe hérite à 100% des permissions de l'objet parent

## 13. Ce qu'il faut documenter ensuite

1. la liste officielle des `owner_type` autorisés
2. la matrice `owner_type -> permissions requises`
3. les règles de rétention / archivage des pièces jointes
4. les règles antivirus / taille / type MIME
5. la politique de téléchargement externe ou partage de fichier
