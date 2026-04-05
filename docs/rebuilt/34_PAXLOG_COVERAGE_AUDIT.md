# PAXLOG Coverage Audit

Date: 2026-04-05

## Objet

Ce document compare:

- le cahier de charge historique `docs/check/CDC_05_PAXLOG.md`
- la doc reconstruite `docs/rebuilt/modules/PAXLOG.md`
- l'état réel du code et des tests

Verdicts utilisés:

- `covered`
- `partial`
- `missing`

## Verdict Global

Verdict global:

- `covered` sur le noyau technique `AdS / AVM / RBAC / ownership / impacts Planner`
- `partial` sur la complétude fonctionnelle métier
- `missing` pour une partie des cas terrain avancés et la preuve de recette end-to-end

Conclusion nette:

- `PaxLog` est désormais défendable techniquement
- `PaxLog` n'est pas encore `100% couvert` par rapport au CDC

## Base de preuve

Références code principales:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `app/event_handlers/paxlog_handlers.py`
- `app/event_handlers/module_handlers.py`
- `app/event_handlers/travelwiz_handlers.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`
- `apps/ext-paxlog/`
- `tests/unit/test_paxlog_flows.py`

Vérifications disponibles à la date de cet audit:

- `python -m pytest -q` -> `128 passed, 2 skipped`
- `npm --prefix apps/main run typecheck` -> OK

## Matrice CDC

### 1. Rôle et périmètre

Verdict: `covered`

Éléments couverts:

- `PaxLog` porte bien les profils PAX, la compliance, les `AdS`, les `AVM`, les signalements, les rotations et les programmes de séjour
- les vues demandeur / valideur / supervision ont été fortement réalignées
- le module est bien interconnecté avec `Conformité`, `Planner`, `TravelWiz`, `Tiers` et `Imputations`

Références:

- `app/api/routes/modules/paxlog.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`

### 2. Profils PAX

Verdict: `partial`

Couverts:

- profils PAX internes et externes
- support `user_id` ou `contact_id`
- recherche de candidats internes / externes
- profils visibles dans `PaxLog`
- déduplication `exacte + phonétique simple` sur la création / pré-vérification

Partiels:

- la déduplication phonétique décrite dans le CDC n'est pas encore prouvée comme exhaustive sur tous les cas homophones
- l'historique exhaustif de présences site par site n'est pas audité ici comme fonctionnalité visible complète
- la synchronisation RH/annuaire des employés Perenco n'est pas prouvée ici comme couverture CDC opposable

Références:

- `app/api/routes/modules/paxlog.py`
- `app/models/paxlog.py`
- `app/models/common.py`

### 3. Certifications et compliance HSE

Verdict: `covered`

Couverts:

- types de certifications
- enregistrement de credentials
- validation / statut `pending_validation`
- lecture de la conformité par PAX/site
- matrice de conformité
- routes et vues principales de conformité mieux protégées
- contrat de conformité enrichi et prouvé par tests:
  - résultats détaillés par exigence
  - couches couvertes exposées
  - synthèse par statut
- alertes d'expiration bucketisées et prouvées pour:
  - `J-30`
  - `J-7`
  - `J-0`
- route `compliance/expiring` bornée sur l'entité pour les credentials internes

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `app/services/modules/compliance_service.py`
- `app/api/routes/modules/conformite.py`
- `apps/main/src/pages/conformite/ConformitePage.tsx`

### 4. AdS - circuit complet

Verdict: `covered`

Couverts:

- création
- lecture détail
- modification en `draft` / `requires_review`
- ajout / retrait de PAX
- soumission
- validation
- rejet
- retour en correction
- re-soumission
- annulation
- PDF
- imputation
- événements / historique

Durcissements récents couverts:

- ownership `owner ou arbitre`
- bornage lecture `read_all`
- cohérence des mutations backend

Références:

- `app/api/routes/modules/paxlog.py`
- `tests/unit/test_paxlog_flows.py`

### 5. Workflow de validation

Verdict: `covered`

Couverts:

- transitions principales `draft -> pending_compliance/pending_validation -> approved`
- `requires_review`
- `rejected`
- `cancelled`
- révision suite à impact `Planner` ou modification `AVM`

Points désormais couverts:

- `pending_initiator_review`
- `pending_project_review`
- approbation partielle PAX par PAX
- reprise du circuit après validation initiateur / projet
- re-soumission après `requires_review` prouvée sans rebouclage parasite vers initiateur / projet
- transitions backend et visibilité UI cohérentes sur ces états

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `docs/rebuilt/20_WORKFLOW_ADS.md`

### 6. Gestion des cas particuliers

Verdict: `covered`

Couverts:

- demande de modification de séjour `AdS`
- revalidation après changement
- classification métier des changements:
  - `extension`
  - `early_return`
  - `transport_change`
  - `window_change`
- impacts sur retours/manifeste via signaux `TravelWiz`
- annulation / révision d'`AdS` liées à une `AVM`

Points désormais mieux couverts:

- `transport_requested` prend en compte l'aller et le retour
- clôture manuelle `OMAA` avec motif obligatoire
- job nocturne:
  - alerte de dépassement retour
  - clôture auto après délai de grâce configurable
- clôture `TravelWiz` prouvée par tests sur:
  - `travelwiz.manifest.closed`
  - `travelwiz.trip.closed`

Références:

- `app/api/routes/modules/paxlog.py`
- `app/event_handlers/module_handlers.py`
- `app/event_handlers/travelwiz_handlers.py`

### 7. Programme de séjour intra-champ

Verdict: `covered`

Couverts:

- lecture des `stay_programs`
- création
- soumission
- approbation
- rattachement à une `AdS`
- contrôles sur statut de l'`AdS`
- contrôles sur appartenance du PAX
- exposition UI dans le détail `AdS`

Références:

- `app/api/routes/modules/paxlog.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`
- `tests/unit/test_paxlog_flows.py`

### 8. Cycles de rotation

Verdict: `covered`

Couverts:

- routes CRUD de base pour cycles de rotation
- visibilité UI de rotation
- batch de génération automatique `AdS` depuis les rotations
- sponsor interne pour rotations externes via `created_by`
- contrat backend/frontend réaligné
- alertes de conformité visibles avant prochaine rotation

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`
- `tests/unit/test_paxlog_flows.py`

### 9. Signalements

Verdict: `covered`

Couverts:

- création
- résolution
- validation
- levée
- lecture
- protections RBAC sur les routes
- effets automatiques selon sévérité
- cibles `personne / entreprise / groupe`
- rejet des `AdS pending`
- revue des `AdS approved / in_progress`

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `tests/unit/test_paxlog_flows.py`

### 10. AVM

Verdict: `covered`

Couverts:

- création
- détail
- programme mission
- tâches préparatoires
- soumission
- approbation
- annulation
- modification
- état `ready`
- état `completed`
- génération d'`AdS`
- propagation des impacts `AVM -> AdS`
- affichage origine mission dans `AdS`

Points désormais mieux couverts:

- `documents` côté `AVM`
  - configuration documentaire mission / par PAX
  - exposition API / UI
  - génération automatique d'une tâche `document_collection`
  - tâche bloquante tant qu'elle reste ouverte
  - type de tâche lisible via dictionnaire côté UI
- génération auto prouvée par tests pour `visa / badge / EPI / indemnité`
- suivi missionnel `visa` par PAX
  - généré à la soumission
  - lié à la tâche de préparation `visa`
  - cycle `à initier -> soumis -> en revue -> obtenu / refusé`
  - exposé et éditable dans le détail `AVM`
- suivi missionnel `indemnité` par PAX
  - généré à la soumission
  - lié à la tâche de préparation `allowance`
  - cycle `brouillon -> soumis -> approuvé -> payé`
  - référence de paiement traçable

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`
- `tests/unit/test_paxlog_flows.py`

### 11. Portail externe superviseur

Verdict: `partial`

Couverts:

- lien externe
- OTP
- session bornée
- lecture du dossier
- synthèse dossier enrichie:
  - société autorisée
  - transports aller / retour
  - compteurs PAX
  - blocages de conformité par PAX
  - certifications déjà enregistrées par PAX
- création / mise à jour de PAX externes
- ajout de credentials externes
- soumission / re-soumission
- filtrage par entreprise autorisée
- cycle OTP désormais prouvé par tests:
  - envoi
  - échec avec incrément de tentative
  - validation ouvrant une session externe

Partiels:

- preuve de couverture fonctionnelle complète de la mini-app en environnement réel manquante
- le portail ne remplace pas encore une recette intégrale opposable sur tous les cas superviseur du CDC

Références:

- `app/api/routes/modules/paxlog.py`
- `apps/ext-paxlog/`
- `tests/unit/test_paxlog_flows.py`

### 12. Permissions

Verdict: `covered`

Couverts:

- permissions explicites sur les routes sensibles
- bornage `owner / read_all / approve`
- restrictions `AVM` et `AdS`
- protections sur routes secondaires `profiles`, `compliance`, `incidents`, `signalements`, `stay_programs`
- audit final sans endpoint interne sensible oublié dans le routeur `PaxLog`

Références:

- `app/modules/paxlog/__init__.py`
- `app/api/routes/modules/paxlog.py`
- `tests/unit/test_paxlog_flows.py`
- `docs/rebuilt/30_ROUTE_PERMISSION_MATRIX.md`

## Exigences rebuilt/modules/PAXLOG.md

### Parcours par rôle

Verdict: `partial`

Points couverts:

- vues demandeur / valideur distinctes
- actions principales `Nouvel AdS` / `Nouvel AVM`
- vues avancées plus cohérentes avec les permissions

Point encore partiel:

- la résolution de homepage `par profil d'usage` plutôt que par permission brute n'est pas démontrée comme complètement fermée

### Workflows critiques

Verdict: `covered`

Workflows couverts au niveau socle:

- `profil PAX -> compliance -> AdS -> TravelWiz`
- `AVM -> AdS -> retour / revue`
- `modification Planner -> AdS à revoir`

Réserve:

- la preuve de bout en bout en production reste une question de recette, pas seulement de code

## Recette fonctionnelle 33_PAXLOG_FUNCTIONAL_RECIPE

État par rapport à cette recette:

- `Bloc A Demandeur AdS` -> `covered`
- `Bloc B Demandeur AVM` -> `covered`
- `Bloc C Valideur AdS` -> `covered`
- `Bloc D Valideur AVM` -> `covered`
- `Recette sécurité` -> `covered` sur le backend, `partial` sur la preuve UI par rôle réel
- `Recette imputation` -> `covered`

## Gaps restants

### Gaps techniques fermés

- RBAC route par route sur `PaxLog`
- ownership `AdS/AVM`
- bornage externe entreprise/session
- cohérence des mutations `AdS`

### Gaps fonctionnels encore partiels

- certaines verticales `achats` autour des `AVM`
- preuve end-to-end de la mini-app externe
- recette terrain des cas `OMAA / auto-close` en environnement déployé

### Gaps de preuve

- recette terrain multi-rôle sur environnement déployé
- preuve inter-modules `Planner / PaxLog / TravelWiz` sur données réalistes encore `partial`, mais renforcée par tests composés sur le même événement `planner.activity.modified`

Point désormais mieux couvert:

- suivi des `requires_review` sans action:
  - rappel automatique après 14 jours
  - sans doublon de notification
  - annulation forcée restant gérée via les routes métier existantes

## Conclusion

Conclusion rigoureuse:

- `PaxLog` est aujourd'hui `covered` sur son noyau technique et sur la majorité du nominal
- `PaxLog` reste `partial` par rapport au CDC complet
- la dette technique backend visible n'est plus le problème principal
- le vrai reste à faire est maintenant:
  1. fermer quelques gaps métier précis
  2. exécuter la recette end-to-end
  3. transformer les résultats en preuve de couverture

Verdict final:

- `technique`: proche d'un module abouti
- `CDC`: pas encore `100% couvert`
