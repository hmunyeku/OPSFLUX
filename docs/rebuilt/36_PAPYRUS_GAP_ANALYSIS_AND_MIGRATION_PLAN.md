# 36 Papyrus Gap Analysis And Migration Plan

Date: 2026-04-08

## 1. Objet

Transformer le module actuel `report_editor` en cible `Papyrus v1.1` sans casser:

- le moteur de workflow OpsFlux existant
- le service PDF existant
- les usages documentaires déjà en production

Le principe retenu est une migration incrémentale, pas une réécriture complète.

## 2. Point de départ réel

Le module actuel fournit déjà un socle documentaire exploitable:

- `doc_types` avec nomenclature, langue et `default_workflow_id`
- `documents` comme objet métier principal
- `revisions` avec contenu JSONB, `form_data`, verrouillage et historique par révision
- `templates` et `template_fields`
- export PDF via le service PDF OpsFlux
- transitions workflow via le moteur FSM existant
- partage externe lecture seule via `share_links`

En revanche, ce socle n'est pas encore équivalent à Papyrus.

## 3. Gap global

### 3.1 Ce qui est déjà aligné

- stockage JSON en base
- templates documentaires
- workflow réutilisant l'infrastructure OpsFlux
- export PDF réutilisant le service existant
- notion de verrouillage
- accès externe partiel

### 3.2 Ce qui est seulement partiel

- le contenu est stocké en JSON, mais pas sous un contrat canonique unique Papyrus
- le workflow est raccordé, mais pas modélisé dans le document comme `meta.workflow_id` plus `current_state` plus événements Papyrus
- l'accès externe existe, mais uniquement pour consultation, pas pour soumission de formulaires externes sécurisés
- les templates existent, mais pas comme documents Papyrus eux-mêmes

### 3.3 Ce qui manque réellement

- document canonique Papyrus avec racine `meta`, `blocks`, `refs`, `workflow`, `schedule`, `render`
- versioning Git-like par JSON Patch RFC 6902
- snapshots de contrôle et tags de workflow immuables
- blocs métiers OpsFlux `opsflux_kpi`, `opsflux_asset`, `opsflux_actions`, `opsflux_gantt`
- moteur de références URI `kpi://`, `asset://`, `project://`, `form://`, `formula://`
- moteur de formules front et back
- builder de formulaires Papyrus
- import/export EpiCollect5
- pipeline `ext.opsflux.io` pour soumissions externes avec JWT signé
- rapports automatisés avec cron, conditions, recipients, channel et rendu serveur
- éditeur bloc moderne unifié entre mode visuel et mode code

## 4. Analyse par domaine

### 4.1 Modèle de données

Etat actuel:

- `Document` porte les métadonnées métier
- `Revision` porte le contenu et les données de formulaire
- `Template` est un objet séparé

Cible Papyrus:

- un document canonique unique stocké en JSONB
- une table de versions dédiée stockant snapshots et diffs
- une table séparée pour les formulaires Papyrus natifs
- une table de soumissions externes
- une table d'événements workflow dédiée à Papyrus

Décision:

- conserver `documents` comme enveloppe métier et de permissions
- faire évoluer `revisions.content` vers le contrat JSON Papyrus
- ajouter `papyrus_versions`, `papyrus_forms`, `papyrus_external_submissions`, `papyrus_workflow_events`
- éviter une duplication durable entre anciens et nouveaux formats

### 4.2 Versioning

Etat actuel:

- une nouvelle révision copie le contenu courant
- le diff existant compare surtout `form_data`

Cible Papyrus:

- snapshot complet à la création
- diff JSON Patch à chaque sauvegarde
- snapshot tous les 20 patches
- snapshot tagué aux étapes workflow
- snapshot immuable à l'approbation finale

Décision:

- garder la notion de révision métier visible par l'utilisateur
- ajouter sous cette couche un historique technique `papyrus_versions`
- distinguer:
  - révision métier
  - granularité de sauvegarde technique

### 4.3 Editeur

Etat actuel:

- éditeur HTML `contentEditable`
- compatibilité partielle avec ancien contenu BlockNote

Cible Papyrus:

- éditeur bloc structuré
- mêmes données en mode visuel et en mode code
- prise en charge des blocs métiers, formules, refs et champs de formulaire

Décision:

- remplacer l'éditeur actuel par un éditeur bloc structuré
- introduire un schéma de blocs versionné
- ne plus considérer le HTML comme format source

### 4.4 Templates et documents contraints

Etat actuel:

- `Template` plus `TemplateField`
- verrouillage champ par champ possible

Cible Papyrus:

- un template est lui-même un document Papyrus
- les blocs `locked: true` définissent la structure figée

Décision:

- converger vers un seul format document/template
- garder une phase transitoire de compatibilité avec `templates`
- préparer ensuite la fusion logique template/document

### 4.5 Workflow

Etat actuel:

- le document est branché au moteur workflow existant
- les statuts documentaires sont déjà pilotés par FSM

Cible Papyrus:

- Papyrus ne réimplémente pas le moteur
- Papyrus écoute les événements et journalise son propre audit trail

Décision:

- conserver impérativement le moteur workflow actuel
- ajouter uniquement une projection Papyrus:
  - `workflow_id`
  - `current_state`
  - `papyrus_workflow_events`
  - snapshots tagués

### 4.6 Reporting automatisé

Etat actuel:

- export manuel PDF
- diffusion documentaire déjà partiellement gérée

Cible Papyrus:

- HTML template plus Jinja2
- scheduling cron
- conditions d'envoi
- recipients et channel configurables par document
- injection de données OpsFlux et réponses de formulaire

Décision:

- ajouter un sous-mode `document_type = report`
- stocker la planification dans `meta.schedule`
- réutiliser le scheduler/jobs OpsFlux au lieu d'un nouveau moteur

### 4.7 Formulaires

Etat actuel:

- `form_data` existe, mais ce n'est pas un produit formulaire autonome

Cible Papyrus:

- formulaires natifs Papyrus séparés
- logique conditionnelle
- import/export EpiCollect5
- publication externe contrôlée

Décision:

- ne pas détourner `template_fields` pour tout faire
- créer une vraie couche `papyrus_forms`
- laisser `form_data` comme payload de réponse ou compatibilité

### 4.8 Accès externe

Etat actuel:

- lien de partage externe en lecture seule
- OTP optionnel

Cible Papyrus:

- lien JWT signé pour soumission externe
- expiration, quota, prefill, IP allowlist, identité facultative
- tampon avant intégration

Décision:

- garder `share_links` pour lecture seule documentaire
- créer un flux séparé pour formulaires externes
- ne pas mélanger lecture de document et collecte externe

## 5. Architecture cible minimale

## 5.1 Contrat document

Le contrat canonique à viser pour `revisions.content` ou son successeur:

- `meta`
- `blocks`
- `refs`
- `workflow`
- `schedule`
- `render`

Règle:

- aucun bloc métier ne copie les données OpsFlux si une référence suffit
- les valeurs résolues sont calculées au rendu
- les caches de calcul sont explicitement marqués comme temporaires

## 5.2 Tables à introduire

- `papyrus_versions`
- `papyrus_forms`
- `papyrus_form_versions` si versioning séparé retenu
- `papyrus_external_submissions`
- `papyrus_workflow_events`
- éventuellement `papyrus_external_links` si on veut séparer des `share_links`

## 5.3 Services à introduire

- `papyrus_document_service`
- `papyrus_versioning_service`
- `papyrus_formula_service`
- `papyrus_ref_resolver_service`
- `papyrus_render_service`
- `papyrus_forms_service`
- `papyrus_external_submission_service`

## 6. Plan de migration recommandé

### Phase 0. Cadrage technique

- geler le contrat JSON Papyrus v1
- décider si `Papyrus` remplace le nom `report_editor` ou reste une couche métier au-dessus
- définir la compatibilité entre ancien contenu et nouveau contenu

Livrables:

- schéma JSON officiel
- matrice de mapping `report_editor` -> `papyrus`
- règles de migration de données

### Phase 1. Fondations backend

- créer les tables de versioning et d'audit Papyrus
- introduire un service de reconstruction par snapshot plus patches
- brancher la sauvegarde pour produire JSON Patch
- conserver les endpoints actuels autant que possible

Critère de sortie:

- un document existant peut être sauvegardé et reconstruit via `papyrus_versions`

### Phase 2. Contrat JSON canonique

- faire évoluer le payload de contenu vers `meta`, `blocks`, `refs`, `workflow`, `schedule`, `render`
- ajouter des convertisseurs temporaires ancien format -> nouveau format
- adapter les exports PDF pour lire le nouveau contrat

Critère de sortie:

- un document nouveau n'utilise plus HTML comme source

### Phase 3. Nouvel éditeur

- remplacer `contentEditable` par un éditeur bloc
- intégrer blocs classiques et système `locked`
- ajouter mode code lisant et écrivant exactement le même JSON

Critère de sortie:

- édition visuelle et édition code produisent le même document

### Phase 4. Références et blocs OpsFlux

- implémenter les URI de refs
- ajouter les blocs métiers en lecture live
- sécuriser chaque résolution par permissions utilisateur

Critère de sortie:

- un document peut afficher des données OpsFlux sans duplication durable

### Phase 5. Formules

- intégrer l'évaluation front
- intégrer le recalcul serveur
- définir les fonctions custom OpsFlux

Critère de sortie:

- les rapports serveur recalculent systématiquement les formules

### Phase 6. Rapports automatisés

- ajouter `document_type = report`
- stocker `meta.schedule`
- brancher cron, conditions, recipients, channel
- produire HTML puis PDF via le service existant

Critère de sortie:

- un rapport peut partir automatiquement selon horaire et conditions

### Phase 7. Formulaires Papyrus

- créer le builder de formulaires
- stocker formulaires et réponses
- ajouter import/export EpiCollect5

Critère de sortie:

- un formulaire Papyrus peut être créé, rempli, exporté

### Phase 8. Ext OpsFlux

- ajouter les liens JWT de soumission
- gérer prefill, quotas, expiration, IP et identité
- stocker les soumissions en tampon
- intégrer validation manuelle ou automatique

Critère de sortie:

- un intervenant externe peut soumettre sans compte OpsFlux

## 7. Ordre de priorité recommandé

Si l'objectif est de livrer vite sans casser le socle:

1. versioning Papyrus
2. contrat JSON canonique
3. nouvel éditeur
4. refs et blocs OpsFlux
5. rapports automatisés
6. formulaires
7. ext.opsflux.io

Raison:

- les formulaires, le scheduling et l'externe dépendent tous d'un bon contrat document
- lancer l'UI avant le contrat et le versioning créerait une dette immédiate

## 8. Ce qu'il ne faut pas faire

- ne pas conserver le HTML comme source de vérité
- ne pas mélanger partage documentaire et soumission externe dans le même objet
- ne pas réimplémenter un moteur workflow parallèle
- ne pas dupliquer les données OpsFlux dans les blocs métiers
- ne pas lancer les rapports automatisés avant d'avoir fixé les refs et le recalcul serveur

## 9. Décision proposée

Statut de `Papyrus` dans OpsFlux:

- `target`, construit par évolution contrôlée du module `report_editor`

Décision d'architecture:

- `report_editor` devient le socle legacy de transition
- `Papyrus` devient le contrat cible, les nouveaux services et les nouvelles tables
- la migration se fait en plusieurs phases avec compatibilité descendante temporaire

## 10. Prochaine étape concrète

Le prochain chantier à ouvrir n'est pas l'UI.

Le prochain chantier à ouvrir est:

- définir le schéma JSON Papyrus v1
- créer les tables `papyrus_versions` et `papyrus_workflow_events`
- brancher une première sauvegarde technique par snapshot plus patch

Sans cela, tout le reste restera instable.
