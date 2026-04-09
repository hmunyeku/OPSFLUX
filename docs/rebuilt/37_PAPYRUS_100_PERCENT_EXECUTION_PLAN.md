# 37 Papyrus 100 Percent Execution Plan

Date: 2026-04-09

## 1. Etat reel du code

Le module Papyrus existe deja dans le runtime:

- routes: `app/api/routes/modules/papyrus_core.py`
- services: `papyrus_document_service`, `papyrus_runtime_service`, `papyrus_forms_service`, `papyrus_dispatch_service`
- tables: `papyrus_versions`, `papyrus_workflow_events`, `papyrus_forms`, `papyrus_external_links`, `papyrus_external_submissions`, `papyrus_dispatch_runs`
- facade frontend: `/papyrus`

En revanche, plusieurs briques du cahier sont encore au stade MVP:

- l'editeur est un editeur JSON/blocs minimal, pas un vrai builder Papyrus
- les refs live ne couvrent que `project://`, `asset://`, `task://`, `kpi://project/.../progress`
- le moteur de formules est un evaluateur AST maison tres limite
- le dispatch automatise envoie du HTML/in-app, pas un vrai flux PDF attache abouti
- les formulaires Papyrus existent mais sans vrai builder visuel ni logique conditionnelle riche
- il n'y a pas encore de portail externe Papyrus dedie

## 2. Definition de 100 percent

Papyrus pourra etre considere termine quand les points suivants seront vrais:

1. Le document canonique Papyrus est la source de verite pour tout le flux documentaire.
2. Les refs live et blocs metier du cahier sont resolus au rendu serveur.
3. Les formules sont evaluees de facon credible en front et en back.
4. Les rapports automatises gerent templates, conditions, recipients, canaux et PDF.
5. Les formulaires Papyrus ont un vrai builder, un pipeline externe et un traitement de soumission complet.
6. Les migrations et parcours critiques sont valides sur une vraie base.

## 3. Chantiers restants

## 3.1 Moteur documentaire

Objectif:

- durcir `revisions.content` pour qu'il reste toujours un document Papyrus canonique
- eliminer les derniers payloads legacy opportunistes
- enrichir les blocs supportes dans le rendu et le frontend

Travaux:

- normalisation stricte a la sauvegarde
- validation schema par type de bloc
- support bloc `html_template`
- support bloc `input_field` riche
- enrichissement du rendu de blocs table, liste, image, file, code

## 3.2 Refs et blocs live

Objectif:

- couvrir les refs et blocs annonces dans le cahier

Travaux:

- `kpi://...` avec vraies resolutions KPI metier
- `asset://...` avec sous-ressources et champs derives
- `project://...` avec projection plus complete
- `form://...`
- `file://...`
- `formula://...`
- blocs:
  - `opsflux_kpi`
  - `opsflux_asset`
  - `opsflux_actions`
  - `opsflux_gantt`

## 3.3 Formules

Objectif:

- remplacer le moteur actuel trop limite par un socle plus credible

Travaux:

- backend:
  - service dedie `papyrus_formula_service`
  - fonctions `SUM`, `IF`, `MIN`, `MAX`, `ROUND`, `ABS`, `COUNT`, `AVG`
  - refs multi-valeurs
  - erreurs de calcul tracees proprement
- frontend:
  - evaluation temps reel
  - edition claire des expressions
  - affichage des erreurs de formule

## 3.4 Rapports automatises

Objectif:

- aller au bout du mode rapport du cahier

Travaux:

- edition `html_template`/Jinja2
- contexte de rendu structure
- vrai dispatch email avec PDF attache
- historisation detaillee des runs
- recipients groupes/utilisateurs/emails robustes
- conditions metier plus riches

## 3.5 Formulaires

Objectif:

- sortir du simple schema JSON editable

Travaux:

- builder drag-and-drop
- logique conditionnelle
- types de champs complets
- edition des validations
- import/export EpiCollect renforce
- traitement admin des soumissions externes

## 3.6 Portail externe Papyrus

Objectif:

- permettre le remplissage de formulaires Papyrus via `ext.opsflux.io`

Travaux:

- page publique de consommation de lien JWT
- rendu dynamique des champs
- support prefill et champs verrouilles
- quota, expiration, IP allowlist, identite
- ecran de confirmation de soumission

## 3.7 Stabilisation

Objectif:

- fermer la boucle technique

Travaux:

- migrations `108` a `111` executees sur vraie base
- verification slug module `papyrus`
- tests backend de versioning, refs, formules, dispatch
- tests frontend de lecture/edition/soumission

## 4. Ordre d'execution recommande

Phase 1:

- durcir le document canonique
- enrichir refs et blocs live
- extraire un vrai service de formules backend

Phase 2:

- terminer rapports automatises
- brancher PDF attache
- terminer l'edition de templates HTML/Jinja2

Phase 3:

- builder formulaires avance
- portail externe Papyrus
- revue de migrations et tests

## 5. Risques principaux

- la dette legacy `report_editor` peut encore polluer certains parcours
- les migrations Papyrus n'ont pas encore ete validees en execution reelle sur cette machine
- les integrations live KPI/actions/Gantt dependent de services metier deja existants dans le codebase
- la partie frontend demandera plus que du renommage: il manque un vrai produit d'edition

## 6. Critere de sortie

Papyrus sera declare termine quand:

- un document peut etre cree, edite, valide, versionne, rendu, exporte PDF et diffuse
- un rapport automatise peut etre programme et envoye avec rendu final correct
- un formulaire Papyrus peut etre publie en externe, soumis, relu et integre
- les refs et formules du cahier sont executees de facon fiable
- les migrations sont appliquees et les parcours critiques verifies
