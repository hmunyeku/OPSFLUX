# RBAC PR-E / PR-F / PR-G — Note technique (RÉSOLU)

> **🟢 Mise à jour 2026-05-14 18:35** : PR-E / PR-F / PR-G ont finalement
> été réalisées dans la session du 2026-05-14, en sortant du plan de
> report initial. La note ci-dessous reste utile comme **archive
> historique** du raisonnement qui a mené au report initial.
>
> **Commits qui ont fait le travail** :
>
> | PR | Commit(s) | Contenu |
> |----|-----------|---------|
> | Phase 0 (prereq) | `8babf007` | Seed des codes namespacés en alias + mirroir des liaisons rôle (Phase A) |
> | PR-E (backend) | `2bc2756a` | 323 remplacements `require_permission()` legacy → namespacé sur 17 fichiers |
> | PR-F (frontend) | `c9b2b560` | 109 remplacements `usePermission/hasPerm` sur 26 fichiers |
> | PR-G (cleanup) | `1c543238` + migration `178` | Traduction au collection-time dans `permission_sync.py` + DELETE des codes legacy |
> | Cosmétique PDF | `5a9a166e`, `6dd2e098`, `e5828c00` + migrations 179/180/181 | Fixes rendu PDF (SHA-256, source labels, None cells, page break, ? symbol) |
>
> **Vérification prod** : 196 permissions exposées (177 namespacées 3-segments + 19 module-level non-mappables), 0 code `deprecated=true` restant en DB. Audit `/api/v1/users/me/permissions` (admin) confirme.
>
> Le document original suit pour mémoire.

---

**Statut initial** : ❌ NON FAIT — différé à une session dédiée
**Date** : 2026-05-14
**Contexte** : ces 3 PRs étaient prévues dans `2026-05-13-rbac-bootstrap-overview.md` mais l'analyse en cours de session a révélé une dépendance que l'overview sous-estimait.

---

## Pourquoi le report

L'overview initial supposait que les nouveaux codes namespacés (`asset.asset.read`, `papyrus.document.publish`, etc.) seraient présents en base parallèlement aux anciens (`asset.read`, `document.publish`). C'est faux : **les manifests modules** (`app/modules/*/__init__.py`) déclarent uniquement les anciens codes 2-segments, et c'est `permission_sync.py` qui les seed en base à chaque startup.

Conséquence : faire `require_permission("asset.asset.read")` sans avoir préalablement seedé ce code donnerait **403 forever** sur la route concernée.

## Ce qu'il faut vraiment faire

PR-E n'est pas juste un find/replace. Le workflow complet est :

### Phase 0 — Préparation (pré-requis pour PR-E)

1. **Étendre les manifests modules** (16 modules dans `app/modules/`) pour qu'ils déclarent les nouveaux codes namespacés EN PLUS des anciens :

   ```python
   # app/modules/asset_registry/__init__.py
   permissions=[
       "asset.read", "asset.create", "asset.update", "asset.delete",  # legacy
       "asset.asset.read", "asset.asset.create",  # new namespaced
       "asset.asset.update", "asset.asset.delete",
       "asset.installation.read", "asset.installation.update",  # déjà ajoutés en migration 175
       "asset.field.read",  # déjà ajoutés en migration 175
       # ...
   ],
   ```

2. **Tourner `permission_sync.py`** une fois pour seeder les nouveaux codes (déjà appelé au startup).

3. **Étendre `seed_starter_role_matrix.py`** pour grant les nouveaux codes aux rôles (en plus des anciens — coexistence pendant la transition).

### Phase 1 — PR-E (refactor backend)

4. Pour chaque entrée du `DEPRECATED_PERMISSION_MAPPING` (78 entrées définies dans `permission_sync.py`), remplacer `require_permission("old_code")` par `require_permission("new_code")` dans **toutes les routes** d'`app/api/routes/`.

5. Tests de régression : pour chaque route modifiée, un test pytest qui vérifie qu'un user avec le **nouveau code seul** peut accéder, ET qu'un user sans aucun des codes obtient 403.

### Phase 2 — PR-F (refactor frontend)

6. Sweep des ~30 occurrences `usePermission("old_code")` / checks similaires côté frontend, vers les nouveaux codes.

### Phase 3 — PR-G (cleanup migration)

7. Migration alembic qui :
   - Propage les liaisons `role_permissions` des anciens codes vers les nouveaux (idempotent ON CONFLICT).
   - Propage les liaisons `group_permission_overrides` et `user_permission_overrides`.
   - Supprime les liaisons sur les anciens codes.
   - Supprime les anciens codes de la table `permissions`.

8. Retirer du `DEPRECATED_PERMISSION_MAPPING` dans `permission_sync.py`.

9. Nettoyage du seed_starter_role_matrix : retirer les références aux anciens codes.

## Estimation

- Phase 0 : 3h (étendre 16 manifests + tests permissions seedées)
- Phase 1 (PR-E) : 6h (~80 routes à modifier + tests régression sur chaque)
- Phase 2 (PR-F) : 2h (~30 occurrences frontend)
- Phase 3 (PR-G) : 2h (migration de propagation + tests)
- **Total : ~13h de travail propre**

Une vraie session dédiée 1-2 jours avec TDD, code review et déploiement progressif est nécessaire.

## Ce qui a été mitigé temporairement dans la session 2026-05-13/14

Pour ne pas bloquer le RBAC en attendant PR-E/F/G :

- **PR-G prep** (commit `ede1093`) : les anciens codes sont flagués `deprecated=true` dans la table `permissions` avec `deprecated_for` pointant vers le nouveau code. Visible dans les exports PDF et l'UI.
- **Runtime seed matrix** (commit `a257809c`) : `seed_starter_role_matrix.py` tourne au startup et lie les rôles aux anciens codes existants en base — donc les rôles starters fonctionnent immédiatement même sans PR-E.
- **PLATFORM_ADMIN alias sweep** (commit `4904fec7`) : les checks `is_admin` dans `fsm_service`, `dashboard_service`, `gdpr_purge`, `roles.py` reconnaissent les deux codes (SUPER_ADMIN et PLATFORM_ADMIN) → pas d'asymétrie fonctionnelle entre les 2 rôles.

Ces mitigations rendent le système **opérationnel et cohérent** sans la dette PR-E/F/G. Mais la dette technique reste : double maintenance des codes legacy + namespacés, code review plus difficile sur les routes, risque de drift entre routes et matrices.

## Décision

PR-E/F/G sera ouvert comme **3 issues GitHub distinctes** avec ce document comme spec source. À planifier par le responsable RBAC dans une fenêtre dédiée (pas en milieu de session générale).

## Références

- Spec source : [`docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md`](../specs/2026-05-13-rbac-bootstrap-design.md), §10 (Roll-out plan)
- Mapping deprecated : `app/services/core/permission_sync.py` (constante `DEPRECATED_PERMISSION_MAPPING`)
- Runtime matrix : `app/services/core/seed_starter_role_matrix.py`
