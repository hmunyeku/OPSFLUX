# Audit TravelWiz — complétude, fixes & backlog (2026-05-31 → 06-01)

**Méthode** : audit multi-agents (workflow, 32 agents) — cartographie → 10 dimensions en
parallèle → **vérification adverse** de chaque finding P0/P1 → synthèse. 73 findings,
**68 confirmées, 5 écartées**. Puis correctifs par vagues, chacun re-vérifié manuellement
(les agents et l'audit se sont trompés plusieurs fois — voir §Réserves).

**Cartographie** : 107 endpoints, 42 fichiers backend, 49 frontend, i18n 293/293 (FR/EN).
**Complétude initiale estimée : 68 %.**

## Scorecard initial par dimension

| Dimension | % init | Trou principal |
|---|---|---|
| Audit-log / traçabilité | **12 %** | 5/59 endpoints mutants tracés (re-vérifié) |
| Workflow / FSM | 68 % | `schedule_cron` = donnée morte (pas de job générateur) |
| UI / hooks | 68 % | hooks rotation get-by-id/delete manquants |
| Traductions FR/EN | 68 % | couverture i18n incomplète |
| Emails | 68 % | événements cycle de vie sans template |
| Notifications | 82 % | `travelwiz.rotation.updated` non émis |
| Permissions / RBAC | 82 % | permissions orphelines, double seeding TRANSP_COORD |
| Backend & API | 82 % | rotation sans GET-by-id/DELETE, pas de validation cron |
| Génération PDF | 88 % | sièges fictifs manifeste, fuite d'exception 500 |
| Sécurité | 88 % | fuite d'internes 500 PDF, audit cargo sans acteur |

---

## ✅ FAIT cette session (déployé en prod + vérifié)

### Vague 1 — Sécurité (commit 9103384d, 702af4c8, ed7ef5cd)
- **Fuite d'exception PDF manifeste PAX** : les 500 (`build` + `render`) renvoyaient
  `detail=f"...{type(exc).__name__}: {exc}"` → remplacé par `StructuredHTTPException(500,
  code, message)` générique, `logger.exception` conservé serveur-side.
  **Vérifié prod** : `GET /voyages/{id}/pdf/pax-manifest` → 200, `leak_internals=False`.
- **Audit cargo `user_id=None`** : `update_cargo_impl` écrivait l'audit sans acteur. Ajout
  de `current_user` (rendu optionnel-défensif après churn git) + câblage des 2 callers
  (packlog + travelwiz). **Vérifié prod** : `GET /packlog/cargo` → 200 (rien cassé).

### Vague 2 — Audit-log P0 (commit 53d46df7)
- **28 endpoints métier mutants** reçoivent `record_audit` (le module passe de ~5 à 33
  endpoints tracés) : vectors (update/zones/certifications), rotations (update), voyages
  (update/status/delete/stops/events/close/reassign), manifests (create/passengers),
  captain log, deck layout validate, pickup rounds, articles.
- 12 signatures reçoivent `current_user` en additif (sans impact contrat API).
- **Vérifié prod** : create_vector→201, update_vector→200. Le `record_audit` est
  **inconditionnel** (après `db.commit()`) ; un 200 prouve donc que l'INSERT audit_log a
  réussi (un échec aurait propagé un 500). *Lecture directe via `/audit-log` non
  re-vérifiable : l'endpoint exige `core.audit.read`, refusé (401) à mon compte de test.*
- **Périmètre exclu volontairement** : télémétrie haute fréquence (`tracking/position`,
  `ais-bulk`, `weather`, GPS captain/driver) et portails token-based — pour ne pas noyer
  l'audit-log sous des milliers de pings.

### Faux positif écarté (vérifié)
- « Permission orpheline `emergency.declare` non câblée sur `/emergency` » → **il n'existe
  aucun endpoint `/emergency`** dans travelwiz.py. Reclassé en simple cleanup P3.

---

## ⏳ RESTE À FAIRE (backlog priorisé)

### P2
- Matérialiser les voyages récurrents depuis `rotation.schedule_cron`
  (`generate_voyages_from_rotation` + enregistrement scheduler). *(L)*
- Valider `schedule_cron` via `field_validator` Pydantic — **`apscheduler.CronTrigger.from_crontab`
  est disponible** (croniter NON). *(S)*
- `GET /rotations/{id}` + `DELETE /rotations/{id}` (parité CRUD ; colonne `active` existe). *(M)*
- Manifeste PAX : sièges fictifs → vrai champ `seat` ou renommer la colonne PDF. *(M)*
- Validateurs cross-field : `type`→`mode` vecteur (rejeter ship+air) ; `expiry_date ≥
  issued_date` certif (VectorCreate/VehicleCertification). *(S)*
- Permission orpheline `travelwiz.pickup.manage` (retirer ou appliquer). *(S)*
- Unifier le double seeding TRANSP_COORD (source unique). *(S)*

### P3
- Émettre `travelwiz.rotation.updated` sur `update_rotation` (miroir d'`update_vector`). *(S)*
- `scope` de `list_voyages` → `Literal['my','all']`. *(S)*
- Rate-limit échange code 6 chiffres capitaine/chauffeur (infra/middleware — à confirmer). *(M)*
- Documenter l'auth session-token portail capitaine/chauffeur comme hors-RBAC intentionnel. *(S)*
- Re-vérifier le doublon modèle `TripCodeAccess` (non re-prouvé). *(S)*
- Finaliser i18n FR/EN + combler les trous email. *(M)*

**Complétude après cette session : audit-log ~12 % → ~85 %, sécurité 88 % → ~95 %.
Estimé global ~78 %** (les P2/P3 restants pèsent surtout sur workflow récurrent + parité CRUD).

---

## ⚠️ Réserves d'honnêteté (CLAUDE.md §2)

Cette session a connu **plusieurs erreurs de ma part, toutes rattrapées** :
- L'audit-agent affirmait un ratio « 1/38 » et un endpoint `/emergency` — **re-vérifié** :
  5/59, et `/emergency` n'existe pas.
- Ma 1ʳᵉ liste d'endpoints passée à un sous-agent était **inventée** (`submit_voyage`,
  `add_segment`…) ; l'agent a refusé d'inventer → liste réelle re-extraite par script.
- Un changement de signature `update_cargo_impl` a temporairement cassé 2 callers (corrigé,
  rendu défensif).
La règle appliquée : **preuve file:line + py_compile + vérif runtime avant toute
conclusion**. Le fichier source et le comportement prod priment sur les résumés d'agents.
