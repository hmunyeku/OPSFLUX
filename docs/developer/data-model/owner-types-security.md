# 14 Allowed Owner Types And Polymorphic Security

Date: 2026-04-03

## 1. Objet

Ce document fixe:

- la whitelist centrale des `owner_type`
- les objets polymorphes autorisés par type
- les règles de sécurité associées

Le but est d'éviter:

- l'invention libre de nouveaux `owner_type` dans chaque module
- les dérives de sécurité sur fichiers, notes, tags et imputations
- les écarts de comportement entre backend et frontend

## 2. Règle de base

Les objets polymorphes ne sont jamais libres.

Chaque `owner_type` doit:

- être déclaré officiellement
- être documenté
- avoir un contrat de permissions
- hériter à 100% des permissions de l'objet parent

Règle validée:

- un polymorphe n'a jamais une sécurité indépendante de son objet parent

## 3. Objets polymorphes concernés

Ce document couvre principalement:

- `attachments`
- `notes`
- `tags`
- `cost_imputations`

La même doctrine peut ensuite être appliquée aux autres objets `owner_type / owner_id`.

## 4. Whitelist centrale des owner_type

La liste ci-dessous est la liste cible officielle à partir de maintenant.

### Core / organisation

- `user`
- `group`
- `role`
- `entity`
- `business_unit`
- `cost_center`

### Référentiels tiers et personnes

- `tier`
- `tier_contact`
- `pax_profile`

### PaxLog

- `ads`
- `avm`
- `pax_incident`
- `rotation_cycle`
- `stay_program`

### Projets / planning

- `project`
- `project_task`
- `project_milestone`
- `planner_activity`
- `planner_conflict`

### TravelWiz

- `voyage`
- `voyage_manifest`
- `cargo_item`
- `pickup_round`

### Asset / technique

- `ar_field`
- `ar_site`
- `ar_installation`
- `ar_equipment`
- `ar_pipeline`
- `pid_document`
- `process_line`
- `dcs_tag`

### Documents / support / autres

- `document`
- `support_ticket`

## 5. Règle stricte

Tout `owner_type` hors whitelist doit être rejeté.

Cela implique:

- validation backend systématique
- idéalement une enum ou table centrale
- frontend aligné sur la même source

## 6. Matrice par polymorphe

## 6.1 Attachments

### Owner types autorisés

- `user`
- `tier`
- `tier_contact`
- `pax_profile`
- `ads`
- `avm`
- `project`
- `project_task`
- `planner_activity`
- `voyage`
- `voyage_manifest`
- `cargo_item`
- `document`
- `support_ticket`
- `ar_field`
- `ar_site`
- `ar_installation`
- `ar_equipment`
- `ar_pipeline`

### Règles

- lecture si et seulement si l'objet parent est lisible
- upload si et seulement si l'objet parent est modifiable
- suppression si et seulement si l'objet parent est modifiable avec droit de suppression associé
- téléchargement externe interdit sauf mécanisme explicite de partage sécurisé

## 6.2 Notes

### Owner types autorisés

- mêmes types que `attachments`, plus éventuellement:
- `group`
- `business_unit`
- `entity`

### Règles

- lecture si l'objet parent est lisible
- création si l'objet parent est modifiable
- visibilité 100% héritée du parent
- pas de note "privée" cassant l'héritage sans règle explicite documentée

## 6.3 Tags

### Owner types autorisés

- très large, mais toujours whitelistés
- `tier`
- `tier_contact`
- `user`
- `project`
- `document`
- `voyage`
- `cargo_item`
- `ads`
- `avm`
- `ar_*`

### Règles

- le droit de tagger dépend du droit de modifier l'objet parent
- les tags ne modifient jamais la sécurité de l'objet
- les tags ne remplacent ni statut, ni permission, ni workflow

## 6.4 Cost imputations

### Owner types autorisés

- `ads`
- `avm` si retenu plus tard
- `voyage`
- `cargo_item` si besoin
- `project` seulement si on décide de supporter une couche d'affectation projet

### Règles

- la liste de choix provient du module `Imputations`
- l'affectation suit les règles de sécurité de l'objet parent
- la somme des pourcentages doit être de 100%
- les validations comptables fortes sont centralisées dans le module `Imputations`

## 7. Règles de permission

## 7.1 Principe

Pour tout polymorphe:

- lire le polymorphe = lire le parent
- créer le polymorphe = modifier le parent
- supprimer le polymorphe = supprimer ou modifier fortement le parent selon le cas

## 7.2 Exemples

### ADS

- `ads` lisible -> notes/fichiers/tags lisibles
- `ads` modifiable -> notes/fichiers/tags/imputations modifiables

### Document

- `document` lisible -> pièces jointes et notes lisibles
- `document` modifiable -> ajout / suppression possible

### Voyage

- `voyage` lisible -> notes et fichiers lisibles
- `voyage` modifiable -> notes, fichiers, imputations modifiables

## 8. Règles backend à imposer

1. validation stricte de `owner_type`
2. vérification de l'existence du parent
3. vérification de l'entité du parent
4. vérification de la permission sur le parent
5. audit sur les actions sensibles

## 9. Règles frontend à imposer

1. ne jamais proposer un `owner_type` non documenté
2. réutiliser les composants partagés
3. masquer l'action si le parent n'est pas modifiable
4. ne jamais supposer qu'un polymorphe a ses propres droits

## 10. Risques si on ne verrouille pas cela

- fuites documentaires
- incohérences d'affichage
- notes ou fichiers visibles alors que le parent ne devrait pas l'être
- invention de `owner_type` non maintenables
- sécurité différente d'un module à l'autre

## 11. Étapes suivantes

1. transformer cette whitelist en constante partagée backend
2. aligner les composants frontend sur cette whitelist
3. auditer toutes les routes polymorphes existantes
4. écrire la matrice finale `owner_type -> endpoints -> permissions`
