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

- `python -m pytest -q` -> `77 passed, 2 skipped`
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

Partiels:

- la déduplication phonétique décrite dans le CDC n'est pas prouvée comme complète bout en bout dans le module actuel
- l'historique exhaustif de présences site par site n'est pas audité ici comme fonctionnalité visible complète
- la synchronisation RH/annuaire des employés Perenco n'est pas prouvée ici comme couverture CDC opposable

Références:

- `app/api/routes/modules/paxlog.py`
- `app/models/paxlog.py`
- `app/models/common.py`

### 3. Certifications et compliance HSE

Verdict: `partial`

Couverts:

- types de certifications
- enregistrement de credentials
- validation / statut `pending_validation`
- lecture de la conformité par PAX/site
- matrice de conformité
- routes et vues principales de conformité mieux protégées

Partiels:

- preuve incomplète que les `7 statuts` CDC sont tous matérialisés exactement comme décrits
- preuve incomplète que les `3 couches` de compliance sont couvertes exhaustivement selon le CDC
- alertes d'expiration J-30 / J-7 / J-0 non auditées comme couverture opposable

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
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

Verdict: `partial`

Couverts:

- transitions principales `draft -> pending_compliance/pending_validation -> approved`
- `requires_review`
- `rejected`
- `cancelled`
- révision suite à impact `Planner` ou modification `AVM`

Partiels:

- les étapes `0-A` et `0-B` du CDC ne sont pas prouvées comme workflow séparé et complet
- l'approbation partielle PAX par PAX côté `CDS` n'est pas démontrée comme capacité complète du flux actuel
- la reprise spécifique directe vers `CDS` pour un dossier déjà `in_progress` est partiellement adressée mais pas démontrée de bout en bout dans la recette

Références:

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `docs/rebuilt/20_WORKFLOW_ADS.md`

### 6. Gestion des cas particuliers

Verdict: `partial`

Couverts:

- demande de modification de séjour `AdS`
- revalidation après changement
- impacts sur retours/manifeste via signaux `TravelWiz` au moins partiels
- annulation / révision d'`AdS` liées à une `AVM`

Partiels ou non prouvés:

- extension de séjour couverte seulement partiellement
- changement aller/retour très fin par individu d'équipe non prouvé complètement
- clôture par `TravelWiz`, `OMAA`, puis batch nocturne non auditée comme chaîne CDC complète

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

Verdict: `partial`

Couverts:

- routes CRUD de base pour cycles de rotation
- visibilité UI de rotation

Partiels:

- la génération automatique quotidienne d'`AdS` depuis les rotations n'est pas prouvée ici comme couverture CDC complète
- la gestion d'alertes de certification avant prochaine rotation n'est pas auditée comme couverture opposable

Références:

- `app/api/routes/modules/paxlog.py`

### 9. Signalements

Verdict: `partial`

Couverts:

- création
- résolution
- validation
- levée
- lecture
- protections RBAC sur les routes

Partiels:

- preuve incomplète que tous les effets automatiques CDC sur `AdS pending / approved / in_progress` sont couverts exactement selon les quatre niveaux de signalement
- couverture entreprise entière / équipe entière non démontrée exhaustivement

Références:

- `app/api/routes/modules/paxlog.py`

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

Partiels:

- certaines dépendances métier détaillées du CDC comme `visa`, `indemnités`, `achats`, `documents` ne sont pas démontrées comme verticales complètes

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
- création / mise à jour de PAX externes
- ajout de credentials externes
- soumission / re-soumission
- filtrage par entreprise autorisée

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
- `Bloc C Valideur AdS` -> `partial`
- `Bloc D Valideur AVM` -> `covered`
- `Recette sécurité` -> `covered` sur le backend, `partial` sur la preuve UI par rôle réel
- `Recette imputation` -> `partial`

Pourquoi `Bloc C` reste `partial`:

- le socle est en place, mais l'approbation partielle PAX par PAX du CDC n'est pas prouvée comme couverture actuelle complète

Pourquoi `Recette imputation` reste `partial`:

- la chaîne existe, mais le document de recette lui-même signalait déjà des dépendances partielles sur certains cas `group`

## Gaps restants

### Gaps techniques fermés

- RBAC route par route sur `PaxLog`
- ownership `AdS/AVM`
- bornage externe entreprise/session
- cohérence des mutations `AdS`

### Gaps fonctionnels encore partiels

- validation initiateur / chef de projet au niveau CDC complet
- approbation partielle PAX par PAX
- extension de séjour et retour/transport très fins selon tous les cas CDC
- rotations auto complètement prouvées
- certaines verticales `visa / indemnité / documents / achats` autour des `AVM`
- preuve end-to-end de la mini-app externe

### Gaps de preuve

- recette terrain multi-rôle sur environnement déployé
- preuve inter-modules `Planner / PaxLog / TravelWiz` sur données réalistes

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
