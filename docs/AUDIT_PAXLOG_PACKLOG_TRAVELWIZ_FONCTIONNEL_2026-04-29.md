# Audit fonctionnel paxlog + packlog + travelwiz — 2026-04-29

Suite des deux audits statiques précédents (`AUDIT_PAXLOG_PACKLOG_2026-04.md`,
`AUDIT_TRAVELWIZ_MOC_2026-04.md`). Cette passe est centrée sur la
**logique métier** : state machines, transitions, validations,
cohérence emit/subscribe d'events, et cohérence API ↔ UI.

Méthode : lecture en profondeur du workflow AdS (cycle de vie
complet : draft → submitted → pending_compliance → pending_validation
→ approved → in_progress → completed) + cross-référence des events
émis vs souscrits + spot-check sur PackLog et TravelWiz.

Pas de tests live exécutés — bugs identifiés par lecture statique
ciblée sur les zones métier.

## Résumé exécutif

12 problèmes identifiés, dont **5 bloquants** (P0) qui cassent du
fonctionnel observable côté utilisateur :

| ID | Sévérité | Module | Symptôme utilisateur |
|---|---|---|---|
| #1 | **P0** | paxlog ↔ travelwiz | Approuver une AdS ne crée plus le manifest TravelWiz automatiquement |
| #2 | **P0** | paxlog | Ajouter une imputation sur AdS → 500 Internal Server Error |
| #3 | **P0** | paxlog | Supprimer une imputation sur AdS → 500 Internal Server Error |
| #4 | **P0** | paxlog | Le payload du form addImputation est ignoré (route lit Query, le front POSTe en body) |
| #5 | **P0** | paxlog | Compléter une AdS pas in_progress → 500 au lieu d'un message clair |
| #6 | P1 | paxlog | 3 endpoints retournent un payload appauvri (champs manquants côté front) |
| #7 | P1 | paxlog | Status `submitted` codé dans les contraintes mais jamais émis |
| #8 | P1 | paxlog | Le FSM peut être bypassé silencieusement |
| #9 | P2 | packlog ↔ travelwiz | Handler `on_cargo_status_changed` jamais appelé |
| #10 | P2 | travelwiz | `is_return: True` hardcodé sur la fermeture de voyage |
| #11 | P2 | paxlog | Approve auto-marque les `pending_check` PAX (filet à risque) |
| #12 | P3 | paxlog | Token boarding QR longue durée (end_date + 14 j) |

## Détails

### #1 — P0 — `ads.approved` ne déclenche plus le manifest TravelWiz

**Fichiers** :
- [app/api/routes/modules/paxlog/__init__.py:4766](app/api/routes/modules/paxlog/__init__.py:4766)
- [app/api/routes/modules/paxlog/__init__.py:5597](app/api/routes/modules/paxlog/__init__.py:5597)
- [app/event_handlers/travelwiz_handlers.py:907](app/event_handlers/travelwiz_handlers.py:907)
- [app/services/modules/paxlog_service.py:920](app/services/modules/paxlog_service.py:920)

Le route handler `approve_ads` émet :

```python
# paxlog/__init__.py:4766
event_type="ads.approved",
```

Le service `paxlog_service.approve_ads()` émet :

```python
# paxlog_service.py:920
event_type="paxlog.ads.approved",
```

Le subscriber TravelWiz qui crée le manifest auto écoute :

```python
# travelwiz_handlers.py:907
event_bus.subscribe("paxlog.ads.approved", on_ads_approved)
```

**Conséquence** : approuver une AdS via l'endpoint route (le flow
réel utilisé par l'UI) émet `ads.approved` qui ne matche pas la
souscription TravelWiz. Le handler `on_ads_approved` qui ajoute
les PAX au manifest du voyage **ne se déclenche jamais**.

Le service `paxlog_service.approve_ads()` qui émet le bon nom
n'a aucun caller dans le repo (`grep -rn "paxlog_service\.approve_ads"`
retourne 0 résultats hors la définition elle-même).

La docstring du route handler ligne 4389 ment :
> "Emits ads.approved event which triggers TravelWiz auto-manifest."

→ Le handler doit subscribe aux deux noms (pattern `subscribe_with_aliases`
déjà utilisé pour weather/cargo dans le même fichier lignes 916-919),
OU le route handler doit émettre `paxlog.ads.approved`.

**Fix recommandé** : ajouter un alias dans `register_travelwiz_handlers` :

```python
event_bus.subscribe("paxlog.ads.approved", on_ads_approved)
event_bus.subscribe("ads.approved", on_ads_approved)  # ajouter
```

### #2 — P0 — `add_imputation` crash 500

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:6871](app/api/routes/modules/paxlog/__init__.py:6871)

```python
@router.post("/ads/{ads_id}/imputations", status_code=201)
async def add_imputation(
    ads_id: UUID,
    project_id: UUID | None = None,         # Query param par défaut
    cost_center_id: UUID | None = None,     # Query param par défaut
    percentage: float = 100.0,              # Query param par défaut
    wbs_id: UUID | None = None,             # Query param par défaut
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    ...
    body = CostImputationCreate(...)
    result = await create_cost_imputation(
        body=body, current_user=current_user, db=db,  # ← request et entity_id manquants
    )
```

`create_cost_imputation` ([app/api/routes/core/cost_imputations.py:247](app/api/routes/core/cost_imputations.py:247))
attend :

```python
async def create_cost_imputation(
    body: CostImputationCreate,
    request: Request,                       # ← requis, sans défaut
    entity_id: UUID = Depends(get_current_entity),
    ...
):
```

Quand FastAPI route une requête, il injecte `request` et `entity_id`
via DI. Mais en appel manuel, ces deux paramètres ne sont **pas**
passés et l'appel échoue avec `TypeError`.

**Conséquence** : tout `POST /api/v1/pax/ads/{id}/imputations` retourne
500. Le frontend ([apps/main/src/services/paxlogService.ts:1320](apps/main/src/services/paxlogService.ts:1320))
appelle bien cet endpoint, donc l'UI imputations est cassée.

**Note bonus** : la route lit `project_id`, `cost_center_id`, etc. en
Query alors que le frontend POST un JSON body. Même si le crash était
fixé, les valeurs frontend seraient ignorées.

**Fix** : utiliser un `BaseModel` body et appeler le service correctement.

### #3 — P0 — `delete_imputation` crash 500

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:6970](app/api/routes/modules/paxlog/__init__.py:6970)

Même bug que #2 : appel à `delete_cost_imputation` sans passer
`request` (qui est requis par la signature core line 405-410).

```python
await delete_cost_imputation(
    imputation_id=imputation_id, current_user=current_user, db=db,  # ← request manquant
)
```

→ TypeError au runtime, supprimer une imputation depuis l'UI échoue.

### #4 — P0 — `add_imputation` ignore le body POST

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:6871](app/api/routes/modules/paxlog/__init__.py:6871)

Détaillé sous #2 ci-dessus. Les paramètres `project_id`, `cost_center_id`,
`percentage`, `wbs_id` sont déclarés sans `Body(...)` ni `Query(...)` ;
FastAPI les traite comme des Query params par défaut. Le frontend POST
un JSON body, qui n'est pas parsé.

→ Même si #2 était fixé, l'imputation serait créée avec
`project_id=None, cost_center_id=None`, ce qui déclenche la validation
ligne 111-118 de `_validate_imputation_references` :
*"Une imputation doit référencer au moins un projet ou un centre de coût"*.

### #5 — P0 — `complete_ads` lève 500 au lieu de 400

**Fichiers** :
- [app/api/routes/modules/paxlog/__init__.py:5213](app/api/routes/modules/paxlog/__init__.py:5213) (`complete_ads`)
- [app/api/routes/modules/paxlog/__init__.py:5097](app/api/routes/modules/paxlog/__init__.py:5097) (`complete_ads_manual_departure`)
- [app/services/modules/paxlog_service.py:600](app/services/modules/paxlog_service.py:600)

```python
# paxlog_service.py:600
async def complete_ads_operationally(...):
    if ads.status != "in_progress":
        raise ValueError(f"Cannot complete AdS with status '{ads.status}'")
```

Les deux route handlers appellent ce service sans try/except. Le
`ValueError` non catché remonte en exception non-handled → 500.

→ L'utilisateur essaie de compléter une AdS draft/cancelled/etc., il
voit un 500 sans message clair. Devrait être un 400 avec
*"Impossible de compléter un AdS avec le statut 'X'"*.

**Fix** : soit raise `HTTPException(400)` dans le service, soit catch
`ValueError` dans le route handler.

### #6 — P1 — 3 endpoints retournent l'ORM brut au lieu d'`AdsRead` enrichi

**Fichiers** :
- [app/api/routes/modules/paxlog/__init__.py:4997](app/api/routes/modules/paxlog/__init__.py:4997) (`request_ads_review`)
- [app/api/routes/modules/paxlog/__init__.py:5094](app/api/routes/modules/paxlog/__init__.py:5094) (`cancel_ads`)
- [app/api/routes/modules/paxlog/__init__.py:5373](app/api/routes/modules/paxlog/__init__.py:5373) (`resubmit_ads`)

Tous les autres endpoints AdS retournent :

```python
return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))
```

Ces 3 endpoints retournent juste :

```python
return ads
```

→ Pydantic v2 sérialise depuis l'ORM via `from_attributes=True`, mais
les champs computed (allowed_company_names, requester_name, site_name,
project_name, planner_activity_title, etc.) sont absents du payload.

Le front qui consomme la réponse de `cancelAds` ou `requestAdsReview`
verra ces champs à `null` après l'action, alors qu'ils étaient remplis
avant. Bug visuel subtil ("le nom du site disparaît après cancel").

### #7 — P1 — Status `submitted` orphelin

**Fichier** : [app/models/paxlog.py:178-181](app/models/paxlog.py:178)

La check constraint inclut `'submitted'` dans la liste des status
valides, et le code y fait référence dans des conditions (par
exemple `approve_ads:4693` → `if ads.status not in ("pending_validation", "submitted"):`).

Mais aucun endpoint n'**émet** ce statut. Le `submit_ads` route handler
résout via `_resolve_ads_auto_transition` puis va directement vers
`pending_initiator_review`, `pending_project_review`, `pending_compliance`,
ou `pending_validation`.

→ Soit `submitted` est un statut legacy qui doit être nettoyé, soit
c'est un statut prévu mais jamais implémenté. Dans tous les cas, c'est
un piège pour les futurs devs (ils peuvent croire que le code traite
ce statut alors qu'il ne peut jamais y entrer).

### #8 — P1 — Le FSM peut être bypassé silencieusement

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:692-732](app/api/routes/modules/paxlog/__init__.py:692)

```python
async def _try_ads_workflow_transition(...):
    try:
        instance = await fsm_service.transition(...)
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        err_msg = str(e).lower()
        if "not found" in err_msg or "not allowed" in err_msg:
            logger.debug(...)
            return None, None       # ← swallow
        raise HTTPException(400, str(e))
```

Si le FSM rejette la transition avec `not allowed` (transition
illégale dans la définition workflow), le helper retourne `(None, None)`
et le code appelant continue avec `ads.status = X` direct.

Le seul rempart restant est le `if ads.status not in (...)` route-level,
qui couvre la plupart des transitions mais pas toutes. Notamment :
- `cancel_ads` accepte tout sauf `cancelled` et `completed` →
  on peut cancel un `rejected` (probable bug ou intentionnel ?)
- `reject_ads` accepte tout sauf `cancelled, completed, rejected` →
  on peut reject un `draft` directement (probable bug)

→ Soit le FSM doit être autoritaire (raise sur tout `not allowed`),
soit les guards route-level doivent être complets et le commentaire
"graceful fallback" doit l'expliciter clairement.

### #9 — P2 — Handler `on_cargo_status_changed` mort

**Fichier** : [app/event_handlers/travelwiz_handlers.py:880-919](app/event_handlers/travelwiz_handlers.py:880)

```python
event_bus.subscribe("packlog.cargo.status_changed", on_cargo_status_changed)
event_bus.subscribe("cargo.status_changed", on_cargo_status_changed)
```

Aucun emit `cargo.status_changed` ou `packlog.cargo.status_changed`
dans tout `app/`. Le handler ne se déclenche jamais.

→ Soit un emit a été oublié dans packlog (cargo lifecycle), soit le
handler doit être supprimé. Dans l'état actuel, la sync cargo
status PackLog → TravelWiz est silencieusement morte.

### #10 — P2 — `is_return: True` hardcodé sur close de voyage

**Fichier** : [app/api/routes/modules/travelwiz.py:1735](app/api/routes/modules/travelwiz.py:1735)

```python
await event_bus.publish(OpsFluxEvent(
    event_type="travelwiz.manifest.closed",
    payload={
        "manifest_id": str(manifest.id),
        "voyage_id": str(voyage_id),
        "entity_id": str(entity_id),
        "is_return": True,  # Assume closing = return completed
    },
))
```

Le commentaire reconnaît l'hypothèse, mais elle est fausse en pratique :
un voyage aller closé n'est pas un retour. Le subscriber qui consomme
`is_return: True` va déclencher la mauvaise logique (probablement
auto-clôturer l'AdS comme si le PAX était rentré, alors qu'il vient
juste d'arriver).

### #11 — P2 — `approve_ads` filet auto-approuvant les `pending_check`

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:4709](app/api/routes/modules/paxlog/__init__.py:4709)

```python
pax_result = await db.execute(
    select(AdsPax).where(
        AdsPax.ads_id == ads_id,
        AdsPax.status.in_(["compliant", "pending_check"]),
    )
)
for entry in pax_entries:
    entry.status = "approved"
```

En pratique, `add_pax_to_ads` (5764) bloque l'ajout après le statut
draft/requires_review, donc tous les PAX devraient être passés par
le compliance check avant d'arriver ici. Mais si un futur changement
ajoute un nouveau chemin pour créer des `AdsPax` après submit (par
exemple via la rotation cycles), un PAX `pending_check` jamais
contrôlé serait auto-approuvé.

→ Devrait soit :
- Refaire le compliance check ici sur les `pending_check`, ou
- Retirer `pending_check` de la liste et raise si on en trouve

### #12 — P3 — Boarding QR longue durée

**Fichier** : [app/api/routes/modules/paxlog/__init__.py:155-168](app/api/routes/modules/paxlog/__init__.py:155)

Le JWT du QR boarding expire à `end_date + 14 days`. Si la PDF de
l'AdS leak (mail, screenshot, etc.), le QR reste exploitable jusqu'à
2 semaines après la fin de la mission par tout utilisateur ayant la
permission `travelwiz.boarding.manage` dans la même entité.

Le QR ne donne pas accès aux données sensibles directement (il faut
être loggé), mais permet de marquer des PAX comme boarded/no_show/offloaded
ce qui altère les KPIs et déclenche des cascades (waitlist, real_pob).

→ Mitigation acceptable car double-facteur (QR + login + permission),
mais TTL trop long. Recommandation : `end_date + 1 day`.

## Bonnes nouvelles

Ce qui est solide et peut servir de modèle :

- **External link flow** : OTP hashé, session token séparé, rate-limiting
  sur `otp_send`, `otp_verify`, `public_access`, audit log structuré.
  Très bien conçu.
- **Voyage state machine** : `VALID_TRANSITIONS` table explicite
  ([travelwiz.py:1588](app/api/routes/modules/travelwiz.py:1588)),
  facile à raisonner.
- **Cost imputations** : la logique core (sum ≤ 100%, validation
  entity scope, references) est solide. Le bug est uniquement dans
  les wrappers AdS.
- **Compliance gate avant pending_validation** : `_run_ads_submission_checks`
  marque correctement chaque PAX (compliant/blocked) et bloque la
  transition pending_compliance → pending_validation s'il reste un
  PAX bloqué (line 4633-4637).
- **Tenant isolation et RBAC** : aucun autre cas problématique
  trouvé pendant cette passe (cohérent avec les audits précédents).

## Recommandations de fix par priorité

### P0 — à fixer avant n'importe quel autre changement

1. Patcher l'event mismatch `ads.approved` ↔ `paxlog.ads.approved`
   (1 ligne dans travelwiz_handlers.py)
2. Refaire `add_imputation` et `delete_imputation` côté AdS (utiliser
   un BaseModel body, appeler le service avec tous les params)
3. Catch `ValueError` dans `complete_ads` et `complete_ads_manual_departure`,
   ou raise `HTTPException` directement dans le service

### P1 — à corriger en passe de cleanup

4. Aligner `request_ads_review`, `cancel_ads`, `resubmit_ads` sur le
   pattern `AdsRead(**(_build_ads_read_data(...)))`
5. Supprimer le statut `submitted` du model (et nettoyer les conditions
   qui y font référence) OU finir l'implémentation
6. Soit rendre le FSM autoritaire (drop le swallow `not allowed`),
   soit compléter les guards route-level

### P2 — backlog

7. Décider ce qu'on fait du handler `on_cargo_status_changed` (le
   wirer côté packlog ou supprimer)
8. Calculer `is_return` correctement (probablement via voyage type
   ou rotation direction)
9. Renforcer `approve_ads` sur le filet `pending_check`
10. Réduire le TTL du QR boarding à `end_date + 1 day`

## Réalité

Cet audit fonctionnel a trouvé 5 bugs P0 que la lecture statique pure
des audits précédents avait manqués (tenant isolation et RBAC étaient
clean, mais la cohérence métier — events, retours, validations — ne
l'était pas).

Tous trouvables aussi par des tests live :
- "approuver une AdS et vérifier qu'un manifest est créé" → casse #1
- "ajouter une imputation depuis le panel AdS" → casse #2 et #4
- "annuler puis rouvrir" → casse #6 (champ disparu)
- "compléter une AdS qui n'est pas en cours" → casse #5

→ La P1 *Tests* du précédent audit (Playwright sur les workflows
critiques) reste la meilleure assurance qualité. Cette passe trouve
les bugs ; un Playwright les empêche de revenir.
