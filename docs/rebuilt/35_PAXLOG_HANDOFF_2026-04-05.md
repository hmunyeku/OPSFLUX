# PaxLog Handoff 2026-04-05

## Objet

Ce document sert de point de reprise si le développement `PaxLog` continue avec un autre agent, notamment Claude.

Il décrit:

- l'état réel du module à la date du `2026-04-05`
- ce qui est considéré comme fermé
- ce qui reste encore `partial`
- l'ordre de développement recommandé
- les règles à respecter pour éviter de réintroduire de la dette

## État actuel

Verdict court:

- `PaxLog` est maintenant proche d'un module abouti techniquement
- le noyau `AdS / AVM / RBAC / ownership / externe / rotations / signalements` est fortement durci
- le reste à faire n'est plus un trou backend évident, mais des cas CDC fins et de la preuve de recette

Vérifications disponibles:

- `python -m pytest tests/unit/test_paxlog_flows.py -q` -> `132 passed`
- `python -m pytest tests/unit/test_workflow_seed_config.py -q` -> `2 passed`
- `npm --prefix apps/main run typecheck` -> OK
- `npm --prefix apps/ext-paxlog run build` -> OK

## Ce qui est fermé

### Backend / sécurité

- RBAC route par route sur `PaxLog`
- bornage `owner / read_all / approve`
- bornage externe par entreprise et session OTP
- ownership des mutations `AdS`
- ownership des lectures `AdS / AVM / profiles / incidents / compliance`

### AdS

- création / lecture / soumission / rejet / correction / re-soumission
- `pending_initiator_review`
- `pending_project_review`
- `pending_compliance` explicite avant validation finale
- approbation partielle PAX par PAX
- re-soumission `requires_review` prouvée sans retour parasite vers initiateur / projet
- imputation backend
- suggestion d'imputation prouvée sur les priorités projet / utilisateur / groupe / BU / entité
- garde-fous prouvés sur l'imputation par défaut:
  - pas de ligne auto pour `CAPEX`
  - pas de ligne auto si `OTP` requis
- programmes de séjour `stay_programs`
- impacts `Planner` visibles
- impacts `AVM` visibles
- transitions `approved -> in_progress -> completed`
- clôture manuelle `OMAA` avec motif
- classification des changements de séjour:
  - `extension`
  - `early_return`
  - `transport_change`
  - `window_change`
- transport aller/retour explicite pour le contrat `AdS -> TravelWiz`
- scope multi-entreprises explicite sur `AdS` via `allowed companies`
- preuve automatisée `create -> submit` avec déclenchement réel du workflow lors du lancement en validation

### Workflow

- `PaxLog` branché sur les slugs workflow canoniques:
  - `ads-workflow`
  - `planner-activity`
  - `voyage-workflow`
- seed aligné avec les slugs runtime
- migration de synchronisation des définitions existantes:
  - [093_sync_workflow_definition_slugs.py](/C:/Users/ajha0/Desktop/OPSFLUX/alembic/versions/093_sync_workflow_definition_slugs.py)
- garde-fous d'approbation clarifiés par étape:
  - initiateur
  - chef de projet
  - conformité/HSE
  - validation finale

### AVM

- création / préparation / soumission / approbation / annulation / complétion
- état `ready` réellement piloté
- checklist de préparation opérable
- types de tâches de préparation lisibles via dictionnaire
- génération d'`AdS`
- propagation `AVM -> AdS`
- verticale `documents` branchée de bout en bout
  - configuration documentaire mission / par PAX
  - exposition API / UI
  - génération automatique d'une tâche `document_collection`
  - tâche bloquante tant qu'elle reste ouverte
- génération auto prouvée par tests pour:
  - `visa`
  - `badge`
  - `EPI`
  - `indemnité`
- suivi `visa` par PAX au niveau mission
  - génération auto à la soumission
  - statut éditable
  - liaison à la tâche de préparation
- suivi `indemnité` par PAX au niveau mission
  - génération auto à la soumission
  - statut éditable
  - montant / devise / référence de paiement

### Signalements

- création / validation / résolution / levée
- portée `individu / entreprise / groupe`
- sévérités via dictionnaire
- effets automatiques sur `AdS pending / approved / in_progress`

### Rotations

- CRUD de base
- batch de génération auto d'`AdS`
- sponsor interne pour rotations externes via `created_by`
- statuts de rotation via dictionnaire
- lecture paginée et enrichie
- signal de risque conformité avant prochaine rotation

### TravelWiz / clôture

- clôture `AdS` depuis:
  - `travelwiz.manifest.closed`
  - `travelwiz.trip.closed`
- événement `completed` tracé proprement
- chaîne nocturne de dépassement retour:
  - alerte préalable
  - auto-close après délai de grâce configurable

### Compliance / expiration

- moteur de verdict centralisé dans `Conformité`
  - `app/services/modules/compliance_service.py`
  - consommé par `PaxLog`
  - consommé par la route `Conformité`
- route `compliance/expiring` bornée sur l'entité pour les credentials internes
- bucket métier disponible sur les expirations:
  - `J-30`
  - `J-7`
  - `J-0`
- contrat conformité enrichi et prouvé:
  - résultats détaillés par exigence
  - couches couvertes exposées
  - synthèse par statut

### Portail externe

- lien externe
- OTP / session
- cycle OTP prouvé:
  - envoi
  - rejet sur mauvais code avec compteur de tentatives
  - ouverture de session sur bon code
- lecture dossier
- enrichissement dossier:
  - société autorisée
  - synthèse PAX
  - transports aller / retour
- détail équipe exposé:
  - blocages de conformité par PAX
  - certifications déjà enregistrées par PAX
- création / mise à jour PAX externes
- ajout credentials externes
- soumission / re-soumission
- filtrage par entreprise autorisée

### Profils PAX

- pré-vérification doublons côté création
- comparaison `exacte + phonétique simple`
- historique de présence site par site exposé

## Ce qui reste partiel

### Cas métier AdS encore fins

- arbitrage très détaillé des `AdS` déjà `in_progress`
- preuve terrain complète de la chaîne `TravelWiz -> OMAA -> batch nocturne`

Point désormais mieux couvert:

- clôture `TravelWiz` testée sur les deux chemins:
  - `travelwiz.manifest.closed`
  - `travelwiz.trip.closed`
- suivi `requires_review` sans action:
  - rappel automatique après 14 jours
  - pas de doublon de rappel
  - annulation forcée restant une action métier explicite

### Verticales AVM encore périphériques

- `achats`

### Portail externe

- preuve end-to-end réelle de la mini-app en environnement déployé
- recette opposable sur tous les cas superviseur

### Preuve inter-modules

- recette réaliste `Planner -> PaxLog -> TravelWiz`
- recette multi-rôle sur environnement déployé

Point désormais mieux couvert:

- test composé sur le même événement `planner.activity.modified`:
  - `PaxLog` crée l'événement `requires_review` et notifie le demandeur
  - `TravelWiz` remet les manifestes en revue et notifie les opérateurs

## Ordre recommandé pour la suite

Si Claude reprend, l'ordre recommandé est:

1. traiter la verticale `AVM achats` si elle reste exigée par le CDC réel
2. exécuter la recette terrain `TravelWiz / OMAA / batch nocturne`
3. ne finir par le portail externe qu'avec une vraie recette E2E
4. ensuite seulement faire la recette terrain complète multi-rôle

## Priorité de développement

### Priorité 1

- recette terrain `TravelWiz / OMAA / batch nocturne`

### Priorité 2

- chaîne `Planner / PaxLog / TravelWiz` avec preuve de comportement réaliste

### Priorité 3

- verticale `AVM` encore non prouvée: `achats`

### Priorité 4

- preuve de la mini-app externe en conditions déployées

## Règles à respecter

### 1. Pas de liste métier statique côté UI

Toute liste métier visible doit venir d'un dictionnaire quand elle est référentielle.

Exemples déjà corrigés:

- sévérités de signalement
- statuts de rotation
- types de tâches de préparation `AVM`

### 2. Multi-entité strict

Ne jamais élargir un lookup sans filtre `entity_id`.

### 3. Pas de doublon de logique métier

Si un handler ou un service existe déjà, l'utiliser.

Éviter:

- route qui fait une mutation métier en parallèle d'un handler
- second moteur de transition local au front

### 4. Toute mutation sensible doit avoir un test

En pratique:

- test backend ciblé dans `tests/unit/test_paxlog_flows.py`
- puis relancer `python -m pytest -q`

### 5. Toute doc `PaxLog` doit être réalignée après fermeture d'un vrai gap

Documents à tenir à jour:

- `docs/rebuilt/33_PAXLOG_FUNCTIONAL_RECIPE.md`
- `docs/rebuilt/34_PAXLOG_COVERAGE_AUDIT.md`
- ce document de handoff si le plan change

### 6. Les types de tâches AVM et options référentielles doivent rester pilotés par dictionnaire

Ne pas réintroduire:

- libellés bruts de type de tâche en UI
- tableaux frontend codés en dur pour `visa / badge / allowance / document_collection / ads_creation / ...`

Le détail `AVM` consomme maintenant le dictionnaire `pax_preparation_task_type`.

## Fichiers clés pour reprendre

- `app/api/routes/modules/paxlog.py`
- `app/services/modules/paxlog_service.py`
- `app/event_handlers/paxlog_handlers.py`
- `app/event_handlers/module_handlers.py`
- `app/event_handlers/travelwiz_handlers.py`
- `apps/main/src/pages/paxlog/PaxLogPage.tsx`
- `apps/main/src/services/paxlogService.ts`
- `apps/main/src/hooks/usePaxlog.ts`
- `tests/unit/test_paxlog_flows.py`
- `docs/rebuilt/34_PAXLOG_COVERAGE_AUDIT.md`

## Résumé pour Claude

Si Claude reprend:

- ne pas repartir sur un refactor global
- continuer `PaxLog` par gaps CDC précis
- privilégier les cas avancés `AdS transport/retour/extension`
- garder les dictionnaires pour les référentiels UI
- garder les tests comme preuve principale
- mettre la doc à jour au fur et à mesure
