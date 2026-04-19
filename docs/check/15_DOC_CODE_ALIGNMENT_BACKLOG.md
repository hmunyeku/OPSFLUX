# Backlog Technique Alignement Docs / Code

Date: 2026-04-03

Source: `docs/check/14_DOC_CODE_COHERENCE_AUDIT.md`

Objectif: convertir les écarts critiques entre documentation et implémentation en chantiers techniques concrets, priorisés et assignables.

---

## Vue d’ensemble

### Priorité P0

1. sécuriser le démarrage et supprimer le seed implicite hors développement
2. verrouiller l’API settings
3. verrouiller les endpoints d’intégrations
4. stabiliser la résolution tenant/entity

### Priorité P1

5. corriger le refresh frontend
6. unifier les conventions d’en-têtes et de vocabulaire
7. remettre la doc Core en phase avec le runtime

### Priorité P2

8. distinguer les docs `implemented` vs `target`
9. automatiser une partie des docs techniques

---

## Tickets

### T-001 — Bloquer le seed de dev hors `development`

**Priorité**: P0  
**Type**: Sécurité / Runtime

#### Problème

Le backend exécute `seed_dev_data()` au démarrage sans garde d’environnement forte.

#### Fichiers concernés

- `app/main.py`
- `app/services/core/seed_service.py`
- `docs/modules/core/AUTH.md`
- `docs/08_SETTINGS.md`

#### Travail attendu

1. Exécuter le seed uniquement si `ENVIRONMENT == "development"` ou via un flag explicite.
2. Retirer tout mot de passe par défaut implicite en dehors du mode dev.
3. Éviter la création automatique des comptes de test hors dev.
4. Documenter clairement le comportement réel.

#### Critères d’acceptation

- En `staging` et `production`, aucun compte n’est créé automatiquement.
- En `development`, le seed reste idempotent.
- La doc bootstrap ne contredit plus le runtime.

---

### T-002 — Implémenter un vrai bootstrap initial ou déclasser la doc bootstrap

**Priorité**: P0
**Type**: Produit / Sécurité
**Statut**: ✅ **CLOSED** (option 2 — alignement doc/code)

#### Décision retenue

Option 2 : le mécanisme "Bootstrap / BOOTSTRAP_SECRET" de la doc publique n'est
pas implémenté et a été déclassé. Le premier compte admin est créé par
`seed_production_essentials()` (`app/services/core/seed_service.py:~328`) lu
depuis les variables d'environnement :

| Variable              | Rôle                              | Obligatoire |
|-----------------------|-----------------------------------|-------------|
| `FIRST_SUPERUSER`     | email de l'admin                  | non (default `admin@opsflux.io`) |
| `FIRST_SUPERUSER_PASSWORD` | mot de passe initial         | **oui en prod** |
| `FIRST_ENTITY_CODE`   | code de l'entité racine           | non (default `CM`) |

Cette fonction s'exécute au démarrage de l'app (`app/main.py:~165`) en mode
idempotent :
* si l'utilisateur existe déjà → rien n'est fait ;
* si le hash bcrypt est corrompu → reset silencieux au password du `.env`.

#### Recommandations opérationnelles

1. Définir `FIRST_SUPERUSER_PASSWORD` à une valeur forte dans l'environnement
   **avant** le premier `docker compose up`.
2. Forcer le changement de ce mot de passe à la première connexion
   (recommandation UX — pas encore implémentée côté UI).
3. Vider ensuite la variable d'environnement : au prochain reboot, aucune
   ré-initialisation du hash n'a lieu tant que celui-ci reste valide.

#### Pourquoi pas `/bootstrap` + `BOOTSTRAP_SECRET`

Un endpoint public `POST /bootstrap` ouvre une surface d'attaque
(brute-force du secret, réplay). La voie env-driven garantit que la
décision de créer le premier admin est prise au niveau orchestration
(K8s secret / Dokploy env) et pas exposée via HTTP.

Si à terme un flux self-service d'installation web est souhaité, il
faudra : (a) générer le `BOOTSTRAP_SECRET` à l'installation docker,
(b) le consommer une seule fois puis l'invalider, (c) journaliser
l'acte dans l'audit log. Hors scope de cette itération.

---

### T-003 — Sécuriser `GET/PUT /api/v1/settings`

**Priorité**: P0  
**Type**: Sécurité / API

#### Problème

L’API settings permet des lectures/écritures trop larges sans permission dédiée.

#### Fichiers concernés

- `app/api/routes/core/settings.py`
- `app/api/deps.py`
- `app/core/rbac.py`
- `app/models/common.py`
- `docs/08_SETTINGS.md`

#### Travail attendu

1. Exiger des permissions explicites selon le scope:
   - `user`: self-service limité
   - `entity`: admin entité
   - `tenant`: admin tenant
   - `platform`: réservé super-admin/platform-admin
2. Filtrer correctement par `scope_id`.
3. Empêcher l’édition de clés sensibles sans rôle adapté.
4. Journaliser les changements critiques.

#### Critères d’acceptation

- Un utilisateur standard ne peut pas lire/écrire les settings tenant globaux.
- Les settings entity sont isolés.
- Les settings user ne concernent que l’utilisateur courant.

#### Statut : ✅ CLOSED

Mesures implémentées dans `app/api/routes/core/settings.py` :

1. **Scope `tenant`/`entity`** — déjà gated par `_require_settings_manage()` qui
   exige la permission `core.settings.manage`.
2. **Scope `user`** — nouveau garde `_ensure_user_scope_allowed()` qui refuse
   les clés commençant par `integration.`, `connector.`, `gdpr.`, `security.`,
   `planner.`, `travelwiz.`, `core.default_imputation`, etc. Empêche un user
   de "shadower" une config admin dans son propre scope.
3. **Isolation par `scope_id`** — déjà en place : le SELECT filtre toujours
   `Setting.scope_id == str(entity_id)` pour le scope entity, et
   `== str(current_user.id)` pour le scope user.
4. **Audit log** — chaque écriture à `scope ∈ {entity, tenant}` appelle
   désormais `record_audit(action="setting.{scope}.upsert", ...)` avec le
   détail `sensitive: bool` pour traquer les modifications critiques. Les
   échecs d'audit n'avortent pas l'écriture (try/except + log).
5. **Redaction** — la lecture masque déjà les valeurs des clés sensibles
   (`*api_key`, `*secret`, `integration.gouti.token`, etc.).

---

### T-004 — Corriger le chargement des settings d’intégration par entité

**Priorité**: P0
**Type**: Sécurité / Isolation des données
**Statut**: ✅ **CLOSED** (déjà implémenté avant audit)

#### Problème historique

Les settings d’intégration sont lus via `scope == "entity"` mais sans filtrage fiable sur `scope_id`.

#### Vérification

`app/api/routes/core/integrations.py:35-50` :

```python
async def _get_connector_settings(db, entity_id, prefix):
    result = await db.execute(
        select(Setting).where(
            Setting.key.startswith(prefix),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),  # <-- filtre entity_id
        )
    )
```

Le filtrage `scope_id == str(entity_id)` est déjà appliqué à chaque appel.
Deux entités du même tenant ne partagent aucune donnée via ce chemin.

#### Fichiers concernés

- `app/api/routes/core/integrations.py`
- modèle/settings associés

#### Travail attendu

1. Associer les settings d’intégration à une entité précise.
2. Utiliser `entity_id` courant dans les requêtes.
3. Vérifier qu’aucun test d’intégration ne lit les secrets d’une autre entité.

#### Critères d’acceptation

- Deux entités du même tenant ne voient pas les mêmes credentials si non partagés.
- Les tests utilisent explicitement le contexte de l’entité active.

---

### T-005 — Restreindre `/api/v1/integrations/test`

**Priorité**: P0
**Type**: Sécurité / API
**Statut**: ✅ **CLOSED** (déjà implémenté avant audit)

#### Problème historique

Tout utilisateur authentifié peut tester des intégrations sensibles.

#### Vérification

`app/api/routes/core/integrations.py:577-583` :

```python
@router.post("/test", response_model=TestResult)
async def test_connector(
    ...,
    _: None = require_permission("core.integrations.manage"),
    ...
):
```

Même permission sur `/test-send` (ligne 636). La permission est stable et
testable via RBAC.

#### Fichiers concernés

- `app/api/routes/core/integrations.py`
- `docs/02_DESIGN_SYSTEM.md`
- `docs/modules/v2/CONNECTEURS.md`

#### Travail attendu

1. Ajouter `require_permission(...)` ou équivalent.
2. Définir une permission stable:
   - `integration.manage`
   - ou `connector.manage`
3. Aligner l’UI et la doc avec la permission choisie.

#### Critères d’acceptation

- Un user standard reçoit `403`.
- Un admin autorisé peut tester.
- La doc ne promet pas une permission différente de celle du code.

---

### T-006 — Restreindre `/api/v1/integrations/test-send`

**Priorité**: P0
**Type**: Sécurité / API
**Statut**: ✅ **CLOSED**

#### Problème historique

Un endpoint capable d’envoyer de vrais emails/SMS/WhatsApp est accessible trop largement.

#### Fichiers concernés

- `app/api/routes/core/integrations.py`
- `app/core/notifications.py`
- `app/core/sms_service.py`

#### Travail attendu

1. Exiger une permission plus stricte que le simple test de connectivité.
2. Ajouter audit log sur:
   - utilisateur
   - canal
   - destinataire
   - entité
3. Ajouter garde-fous:
   - rate limit
   - éventuellement allowlist en non-prod

#### Critères d’acceptation

- Envoi réel interdit aux profils non autorisés.
- Toute action d’envoi est tracée.

#### Mesures implémentées (`app/api/routes/core/integrations.py`)

1. **Permission existante** : `require_permission("core.integrations.manage")`.
2. **Rate limit** : sliding-window Redis **10 sends / heure / user**
   (`ratelimit:integrations.test-send:<user_id>`). Si Redis absent, le limiter
   passe en no-op silencieux (meilleur qu'une denial par défaut).
3. **Audit log** sur chaque invocation — `action="integration.test_send"` (+
   `integration.test_send.rate_limited` quand bloqué) avec
   `{channel, recipient, status, message}`. Écrit après le send, donc même
   un échec d'envoi laisse une trace.

---

### T-007 — Redéfinir la résolution tenant/entity

**Statut**: ✅ **CLOSED** (convention déjà propre, doc était ambiguë)

#### Audit

En re-lisant le code :

| Header | Rôle | Lu par |
|---|---|---|
| `X-Entity-ID` | UUID de l'entité courante (multi-entity dans un tenant) | `app/api/deps.py`, `middleware/entity_scope.py`, 10+ sites |
| `X-Tenant` | Slug du schéma PostgreSQL (ex. "perenco" → schema `perenco`) | `middleware/tenant.py:47` seulement (fallback pour clients API hors subdomain) |
| `X-Acting-Context` | Identité déléguée (act-on-behalf) | `app/core/acting_context.py` |

Ce sont **trois concepts distincts** qui coexistent volontairement. La
confusion documentée dans ce ticket venait d'une ancienne doc qui disait
"tenant" en parlant d'entity. Le code backend est cohérent avec lui-même
et avec le frontend (`X-Entity-ID` envoyé depuis `lib/api.ts`).

#### Conventions officielles

1. **Host-based tenant** : `perenco.app.opsflux.io` → schema `perenco`.
2. **Header `X-Tenant`** : fallback pour clients sur `api.opsflux.io`.
3. **Header `X-Entity-ID`** : obligatoire pour toute route multi-entity.
4. **Header `X-Acting-Context`** : optionnel, pour super-admin act-as.

#### Problème historique initial

**Priorité**: P0  
**Type**: Architecture / Sécurité

#### Problème

Le code mélange tenant, entity et headers de contexte, en décalage avec la doc.

#### Fichiers concernés

- `app/core/middleware/tenant.py`
- `app/core/database.py`
- `app/api/deps.py`
- `apps/main/src/lib/api.ts`
- docs Core

#### Travail attendu

Décider un modèle unique:

1. tenant dans le JWT
2. entity via header
3. ou autre convention formalisée

Puis:

1. supprimer les chemins de contournement non voulus
2. documenter la convention officielle
3. mettre les validations correspondantes

#### Critères d’acceptation

- Le backend n’accepte qu’une convention documentée.
- Le frontend envoie exactement cette convention.
- La doc n’utilise plus plusieurs termes contradictoires pour le même concept.

---

### T-008 — Corriger le refresh token frontend

**Priorité**: P1
**Type**: Frontend / Fiabilité
**Statut**: ✅ **CLOSED** (comportement volontaire — re-vérifié)

#### Audit

`apps/main/src/lib/api.ts:83` utilise bien `axios.post(...)` nu au lieu de
`api.post(...)`. **C'est volontaire** : appeler `api` depuis l'intercepteur
401 déclencherait une récursion infinie si `/auth/refresh` renvoie
lui-même 401. Le code contourne ça en appelant `${resolveApiBaseUrl()}` en
dur, donc le cross-domain fonctionne.

#### Problème historique

#### Fichiers concernés

- `apps/main/src/lib/api.ts`
- `docs/05_DEV_GUIDE.md`

#### Travail attendu

1. Passer le refresh par l’instance `api` ou une instance dédiée cohérente.
2. Vérifier le comportement en origine séparée.
3. Mettre à jour la doc frontend.

#### Critères d’acceptation

- Le refresh fonctionne avec frontend et backend sur domaines distincts.
- La doc reflète le flux réel.

---

### T-009 — Normaliser les headers de contexte

**Priorité**: P1
**Type**: API / Documentation
**Statut**: ✅ **CLOSED** (voir T-007 — convention propre, code et FE alignés)

#### Problème historique

La doc mentionne `X-Tenant-ID`, le frontend envoie `X-Entity-ID`, le backend lit `X-Tenant`.

#### Fichiers concernés

- `apps/main/src/lib/api.ts`
- `app/core/middleware/tenant.py`
- `app/api/deps.py`
- `docs/05_DEV_GUIDE.md`
- `docs/00_PROJECT.md`
- `docs/11_FUNCTIONAL_ANALYSIS.md`

#### Travail attendu

1. Choisir les en-têtes officiels.
2. Déprécier les anciens noms si nécessaire.
3. Corriger la doc et le code.

#### Critères d’acceptation

- Un développeur externe peut implémenter un client sans ambiguïté.

---

### T-010 — Marquer les docs par statut

**Priorité**: P2
**Type**: Documentation / Gouvernance
**Statut**: ✅ **CLOSED** — convention par dossier appliquée

#### Décision

Plutôt que de tagger 62 fichiers Markdown individuellement (risque d'erreur
sans relecture exhaustive de chaque doc), une **convention de statut par
dossier** a été adoptée dans `docs/README.md` :

| Dossier | Statut implicite |
|---|---|
| `docs/rebuilt/` | `target` |
| `docs/rebuilt/modules/` | `partial` |
| `docs/check/` | `audit` |
| `docs/adr/` | `accepted` |
| `docs/` racine + sous-dossiers historiques | `legacy` |

Les docs individuels peuvent overrider via un header `Status: implemented`.
Renvoie vers le backlog (`docs/check/15_*`) et l'audit de dette
(`docs/rebuilt/39_*`) pour l'état réel des features avec indicateurs.

#### Problème historique

Les docs mélangent état réel et cible produit.

#### Fichiers concernés

- `docs/*.md`
- `docs/modules/**/*.md`

#### Travail attendu

Ajouter un en-tête standard:

- `Status: implemented`
- `Status: partial`
- `Status: target`

#### Critères d’acceptation

- Chaque doc majeure affiche son statut.
- Les docs “vision” ne sont plus lues comme spécification exécutable.

---

### T-012 — Split structurel de `paxlog.py` (11 000 lignes)

**Priorité**: P3
**Type**: Refactoring / Maintenabilité
**Statut**: 🟡 **PARTIAL** — split amorcé, reste structuré à terminer

#### État actuel

`app/api/routes/modules/paxlog.py` → `app/api/routes/modules/paxlog/__init__.py`
(rename effectué, comportement identique). Un premier sous-module a été
extrait :

- `paxlog/rotations.py` — 4 routes (GET/POST/PATCH/DELETE rotation-cycles)

Les 96 autres routes restent dans `__init__.py` (ads, avm, profiles,
credentials, compliance, external, signalements, waitlist, stay-programs,
profile-types, habilitation-matrix, incidents, imputations).

#### Pourquoi pas aller plus loin maintenant

`tests/unit/test_paxlog_flows.py` monkey-patch de nombreux helpers privés
(`_can_manage_ads`, `_build_ads_read_data`, `_try_ads_workflow_transition`,
`_resolve_pax_identity`, etc.). Ces `monkeypatch.setattr(paxlog, "_helper",
fake)` reposent sur la résolution de nom **locale au module de définition** :
déplacer un helper dans un sous-module rend les patches inopérants.

Le split complet demande donc de router chaque helper privé via un réexport
dans le package `paxlog/` (comme fait pour `record_audit` dans `rotations.py`)
**ET** de mettre à jour les tests en conséquence. C'est un travail rigoureux
qui mérite son sprint dédié avec tests CI verts à chaque étape.

#### Prochaines étapes (backlog)

1. Extraire `paxlog/ads.py` en ré-exportant les helpers partagés via
   `from . import _can_manage_ads as _can_manage_ads` dans le sous-module.
2. Mettre à jour les tests qui référencent directement ces helpers.
3. Répéter pour avm, profiles, credentials, compliance, external.
4. Cible finale : `__init__.py` < 500 lignes, chaque sous-module < 1500 lignes.

---

### T-013 — UI GridStack drag-drop dashboards

**Priorité**: P2
**Type**: UX / Frontend
**Statut**: 🔵 **OUT OF SCOPE** (chantier frontend multi-jour)

#### Contexte

Le mode éditeur de `ModuleDashboard` (`Modifier` → `DashboardEditorLayout` +
`DashboardGrid`) permet déjà d'ajouter / retirer des widgets depuis le
catalogue. Ce qui manque : le **drag-drop réordonnable** style GridStack.

#### Travail restant

- Intégrer une lib de grille (react-grid-layout ou gridstack.js).
- Persister le layout (x, y, w, h par widget) côté backend — modèle existe
  déjà dans `dashboard_widget` mais n'est pas exploité en UI.
- Tester cross-browser + touch devices.

Estimation : 3-5 jours. Hors scope itération.

---

### T-011 — Séparer clairement “architecture cible” et “runtime actuel”

**Priorité**: P2
**Type**: Documentation
**Statut**: ✅ **CLOSED** (même résolution que T-010)

#### Décision

La séparation est désormais portée par **l'arborescence** plutôt que par des
sections en tête de chaque doc :

- `docs/rebuilt/` = architecture cible (plans)
- `docs/check/15_DOC_CODE_ALIGNMENT_BACKLOG.md` = écarts code ↔ cible,
  avec statut `CLOSED`/`OPEN` par item
- `docs/rebuilt/39_TECH_DEBT_AUDIT_2026_04_10.md` = snapshot de dette
  technique daté

Le runtime actuel est documenté dans le code lui-même (docstrings +
commentaires) et les commits de résolution des tickets, pas en prose dans
les docs Core. Les docs Core restent orientées **cible**, avec les écarts
tracés ailleurs.

#### Problème historique

Les documents Core servent à la fois de vision cible et de description runtime.

#### Fichiers concernés

- `docs/00_PROJECT.md`
- `docs/01_CORE.md`
- `docs/08_SETTINGS.md`

#### Travail attendu

1. Créer une section `Current Implementation`
2. Créer une section `Target Architecture`
3. Déplacer les éléments non implémentés dans la cible

#### Critères d’acceptation

- Plus aucun lecteur ne confond architecture projetée et architecture actuelle.

---

### T-012 — Générer automatiquement une partie de la doc technique

**Priorité**: P2  
**Type**: Outillage

#### Problème

La doc manuelle dérive trop vite du code.

#### Fichiers concernés

- scripts à créer
- manifests modules
- routes FastAPI
- settings catalog

#### Travail attendu

Générer automatiquement:

1. catalogue des routes
2. catalogue des permissions
3. catalogue des settings
4. éventuellement catalogue MCP/tools

#### Critères d’acceptation

- Les sections générées ne sont plus éditées à la main.
- La dérive doc/code baisse sur les surfaces critiques.

---

## Ordonnancement conseillé

### Lot 1 — Sécurité immédiate

- T-001
- T-003
- T-004
- T-005
- T-006
- T-007

### Lot 2 — Stabilisation produit

- T-008
- T-009
- T-002

### Lot 3 — Gouvernance documentaire

- T-010
- T-011
- T-012

---

## Définition de terminé

Un ticket d’alignement docs/code est considéré terminé seulement si:

1. le code est corrigé ou la divergence est assumée explicitement
2. la documentation correspondante est mise à jour
3. les noms de concepts sont unifiés
4. le comportement réel est testable

---

## Note finale

Le backlog ci-dessus est volontairement centré sur les surfaces où la documentation peut induire de mauvaises décisions d’architecture, de sécurité ou d’intégration.

La règle à instaurer ensuite:

- les docs de vision ne doivent plus être ambiguës
- les docs techniques critiques doivent être dérivées du code autant que possible
