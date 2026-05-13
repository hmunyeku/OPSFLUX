# RBAC Bootstrap — Overview du plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each PR's detailed plan.

**Goal:** Implémenter une matrice de rôles utilisable post-install + exports PDF des matrices + gestion ISO des délégations, livré en 7 PR séquentielles.

**Spec source:** [docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md](../specs/2026-05-13-rbac-bootstrap-design.md)

**Architecture:** 4 migrations alembic séquentielles + extension du moteur RBAC à 4 couches (avec délégations) + 22 endpoints API + 22 versions de templates PDF + 8 versions de templates email + 3 composants frontend nouveaux + refactor des codes de permissions backend/frontend.

**Tech Stack:** FastAPI, SQLAlchemy 2.x async, Alembic, PostgreSQL, Redis, WeasyPrint, Jinja2, APScheduler, React + TypeScript, Vitest, Playwright, pytest-asyncio, pytest-alembic.

---

## Vue d'ensemble des 7 PR

| PR | Nom | Sprint | Dépendance | Plan détaillé |
|---|---|---|---|---|
| **A** | Fondations backend (modèles, migration phase 1, moteur RBAC 4-couches, routes délégations, routes exports, imports, admin) | S1 | — | [2026-05-13-rbac-pr-a-foundations.md](./2026-05-13-rbac-pr-a-foundations.md) |
| **B** | Seed templates PDF + email (FR + EN) | S1 | A | À produire au démarrage de B |
| **C** | UI front : 5 sous-onglets RBAC + composants partagés | S2 | A, B | À produire au démarrage de C |
| **D** | Migration phase 2 : backfill matrice rôles × permissions + email aux TENANT_ADMIN | S2 | A | À produire au démarrage de D |
| **E** | Refactor backend : `require_permission(old)` → `require_permission(new)` | S3 | D | À produire au démarrage de E |
| **F** | Refactor frontend : checks de permission UI | S3 | E | À produire au démarrage de F |
| **G** | Migration phase 3 : cleanup des codes dépréciés | S4 | E, F | À produire au démarrage de G |

**Workflow** : à la fin de chaque PR mergée, on relance `superpowers:writing-plans` pour produire le plan détaillé de la PR suivante. Cela permet d'intégrer les apprentissages et ajustements de la PR précédente.

---

## PR-A — Fondations backend

### Périmètre

- Étendre `Permission` (colonnes namespace, resource, action, deprecated, deprecated_for, sensitive)
- Ajouter `Entity.logo_url`
- Créer `RbacAuditEvent`
- Migration `170_rbac_bootstrap_phase1_additive.py` (DDL + seed nouveaux codes/rôles/settings)
- Renommer 3 rôles (`SUPER_ADMIN`→`PLATFORM_ADMIN`, `PAX_ADMIN`→`PAX_COORD`, `HSE_ADMIN`→`HSE_MGR`) avec stratégie INSERT+propagate+DELETE
- Étendre `rbac.py` avec la 4ᵉ couche délégation
- Service `rbac_delegation_service.py` avec garde-fous ISO
- 7 routes délégations (`/api/v1/rbac/delegations/*`)
- Cron APScheduler d'expiration (J-3 et J0)
- Service `rbac_export_service.py` (helpers de construction des variables PDF)
- 10 routes exports PDF (`/api/v1/rbac/exports/*`) — retournent 404 si template manquant
- Routes async polling (`/exports/jobs/{id}`)
- Service `rbac_import_service.py` (3 targets)
- Ajout des 3 targets dans `_PERMISSION_MAP` de `import_assistant.py`
- 2 routes admin (`/api/v1/rbac/defaults`)
- Route `GET /api/v1/rbac/audit-events`
- 3 routes matrix JSON helpers
- Update `_attach_default_role` dans `users.py`

### Critères d'acceptation

- [ ] La migration phase 1 s'exécute sans erreur sur une base fraîche ET sur une base existante (test idempotence)
- [ ] Tous les nouveaux endpoints API renvoient le bon statut HTTP avec les bonnes permissions
- [ ] Une délégation créée déclenche 2 emails + génère un certificat PDF + crée un audit event avec hash SHA-256
- [ ] Le moteur RBAC reflète bien les permissions reçues via délégation active (source `delegation`)
- [ ] Une sous-délégation est bloquée avec erreur structurée
- [ ] Une délégation dépassant `rbac.delegation.max_duration_days` est refusée
- [ ] Le cron d'expiration tourne et envoie les emails J-3 et J0
- [ ] Les 10 endpoints d'export renvoient `RBAC_TEMPLATE_NOT_FOUND` (proper) car aucun template n'est seedé en PR-A
- [ ] Les imports CSV/XLSX via `ImportWizard` créent les bonnes liaisons et émettent un audit event
- [ ] `GET /rbac/defaults` et `PUT /rbac/defaults` fonctionnent
- [ ] La création d'un nouveau user via `POST /users` colle le rôle par défaut selon `user_type`
- [ ] Tous les tests unit + intégration passent (au moins 25 tests TDD)

### Livrable

Branche mergée avec tous les endpoints fonctionnels. Les exports retournent 404 jusqu'à la PR-B. La PR-B peut commencer.

---

## PR-B — Seed templates PDF + email

### Périmètre

- Créer le répertoire `app/static/rbac_pdf_templates/` avec sous-répertoire `_shared/`
- Écrire 11 fichiers HTML pour body × 2 langues = 22 fichiers
- Écrire 1 fichier shared/header.html, 1 fichier shared/footer.html, 1 fichier shared/common.css (FR/EN dans le même)
- Créer le répertoire `app/static/rbac_email_templates/` avec 4 templates × 2 langues = 8 fichiers
- Migration `173_rbac_seed_pdf_email_templates.py` qui charge les fichiers, inline les partials, et insère dans `PdfTemplate`/`PdfTemplateVersion`/`EmailTemplate`/`EmailTemplateVersion`
- Helper `_build_translator` dans `pdf_templates.py`
- Catalogue de traductions `rbac_pdf` dans la table `references`
- Tests snapshot WeasyPrint : pour chaque template, on génère avec fixture et on hash → comparaison avec snapshot versionné

### Critères d'acceptation

- [ ] Les 22 versions PDF + 8 versions email sont en base après migration
- [ ] Chaque template passe la validation `validate_pdf_template_source`
- [ ] Les 10 endpoints d'export de la PR-A renvoient maintenant un PDF (200, hash dans header)
- [ ] Validation visuelle humaine : un dev ouvre les 11 templates rendus et confirme qu'ils sont lisibles, branded, pas de bug layout

### Livrable

Templates fonctionnels. Validation visuelle humaine obligatoire avant merge.

---

## PR-C — UI frontend

### Périmètre

- Composant `apps/main/src/components/shared/ExportPdfMenu.tsx`
- Extension `apps/main/src/components/ui/DataTable.tsx` (`ExportFormat = 'csv' | 'xlsx' | 'pdf'`)
- Refonte `apps/main/src/pages/settings/tabs/RbacAdminTab.tsx` en 5 sous-onglets
- Nouveau `apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx` (KPI + liste + create wizard + mes délégations + audit panel)
- Nouveau `apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx` (rôles par défaut + ISO délégations + mode résolution + audit RBAC)
- Mise à jour `apps/main/src/pages/settings/tabs/RbacPermissionMatrix.tsx` (source `delegation`)
- Mise à jour `apps/main/src/services/rbacService.ts` (nouveaux endpoints)
- Mise à jour `apps/main/src/hooks/useRbac.ts` (nouveaux hooks)
- Chaînes i18n `apps/main/src/i18n/locales/{fr,en}/rbac.json`
- Tests Vitest pour les composants critiques
- Tests Playwright e2e (3 scénarios minimum)

### Critères d'acceptation

- [ ] Les 5 sous-onglets sont visibles selon les permissions du user connecté
- [ ] Le bouton "Export PDF" dans chaque onglet ouvre le menu contextuel et télécharge le PDF
- [ ] La création d'une délégation via le wizard 3 steps fonctionne, génère 2 emails, télécharge le certificat
- [ ] La page Réglages permet de changer le rôle par défaut et les settings ISO
- [ ] Les tests Vitest passent
- [ ] Les 3 tests Playwright passent

### Livrable

UI complète et testée e2e. UAT par les TENANT_ADMIN avant merge.

---

## PR-D — Migration phase 2 (backfill rôles)

### Périmètre

- Migration `171_rbac_bootstrap_phase2_backfill.py` :
  - Reset des 3 rôles système (`PLATFORM_ADMIN`, `TENANT_ADMIN`, `READER`)
  - Backfill des 17 rôles starters via `INSERT ... ON CONFLICT DO NOTHING`
  - Création de la matrice atomique : traduction des vues 5.A/5.B/5.C du spec en ~1200 liaisons explicites
  - Émet un audit event `matrix.bootstrap` par tenant
  - Envoie l'email "Mise à jour matrice" aux TENANT_ADMIN de chaque tenant
- Snapshot SQL des tables RBAC avant migration (`backups/rbac/phase2/{timestamp}.sql`)
- Tests `pytest-alembic` :
  - Idempotence : run 2 fois → pas d'erreur
  - Préservation des customs : un test crée un rôle DO custom, run la migration, vérifie qu'elle ne touche pas DO
  - Reset système : un test enlève une perm de TENANT_ADMIN, run la migration, vérifie qu'elle la remet

### Critères d'acceptation

- [ ] Les ~1200 liaisons sont insérées
- [ ] Snapshot SQL produit dans le dossier de backup
- [ ] Email envoyé aux TENANT_ADMIN (vérifié en staging)
- [ ] Tests d'idempotence et de préservation passent
- [ ] Aucune erreur sur le redéploiement (re-run)

### Livrable

Tenants reçoivent leur nouvelle matrice. SECURITY_OFFICER peut être attribué aux users existants. Roll-back impossible sans restore — backup obligatoire.

---

## PR-E — Refactor backend

### Périmètre

- Remplacement de tous les `require_permission("old_code")` → `require_permission("new_code")` selon le mapping de l'Annexe A du spec
- Estimation : ~80 occurrences à modifier dans les routes
- Tests régression : pour chaque route modifiée, un test vérifie que la nouvelle permission donne accès et l'ancienne ne donne plus accès (mais l'ancienne fonctionne encore en transition, jusqu'à PR-G)
- Mise à jour de la documentation `docs/developer/rbac.md`

### Critères d'acceptation

- [ ] Aucun `require_permission` ne référence un code de la liste `DEPRECATED_CODES`
- [ ] Tests unit régressifs sur toutes les routes modifiées
- [ ] OpenAPI docs régénérées sans erreur

### Livrable

Le code backend utilise uniquement les nouveaux codes. Les anciens codes sont encore en base (supprimés en PR-G).

---

## PR-F — Refactor frontend

### Périmètre

- Remplacement des checks de permission côté UI (`canRead`, `canEdit`, etc. dans les hooks et composants)
- Estimation : ~30 occurrences
- Tests Vitest régressifs
- Mise à jour de la documentation `docs/developer/rbac.md` côté frontend

### Critères d'acceptation

- [ ] Aucun composant ne référence un code déprécié
- [ ] Tests Vitest passent
- [ ] Tests Playwright e2e régressifs OK (les boutons d'action sont visibles aux bons rôles)

### Livrable

UI fonctionne avec les nouveaux codes. La PR-G peut alors supprimer les anciens en toute sécurité.

---

## PR-G — Migration phase 3 (cleanup)

### Périmètre

- Pre-flight check SQL obligatoire : `SELECT permission_code FROM role_permissions WHERE permission_code IN (deprecated_list)` doit retourner 0 lignes
- Si non zéro : **abort**, investiguer (un code déprécié est encore lié quelque part)
- Migration `172_rbac_bootstrap_phase3_cleanup.py` :
  - Propagation finale des liaisons orphelines (old_code → new_code) si tout n'a pas été fait avant
  - Suppression des liaisons sur les codes dépréciés
  - Suppression des permissions dépréciées
  - Invalidation du cache Redis RBAC (hook post-migration)
- Backup DB complet obligatoire avant déploiement

### Critères d'acceptation

- [ ] Pre-flight check OK
- [ ] Backup DB sauvegardé
- [ ] `SELECT count(*) FROM permissions WHERE deprecated=true` → 0
- [ ] Cache Redis vidé après migration
- [ ] 48h post-prod : aucune erreur 500 `permission_code does not exist`

### Livrable

Système RBAC final et propre. Tous les codes sont en `<namespace>.<resource>.<action>`. La doc finale est publiée.

---

## Risques transverses (rappel)

| Risque | Mitigation |
|---|---|
| Permissions manquantes pour workflow non vu | UAT intensif par TENANT_ADMIN, fallback `TENANT_ADMIN` temporaire |
| WeasyPrint plante sur grosse matrice | Snapshot tests + format paysage par module + fallback 503 |
| Délégation accordée par erreur | Notif SECURITY_OFFICER on + révocation 1-clic + audit |
| Conflits SoD non détectés | Export #9 SoD matrix + alerte UI au cochage |
| Phase 3 supprime code utilisé | Pre-flight obligatoire + backup |
| Charge Redis cache 4ᵉ layer | TTL 5min suffit, mesurer p95 |
| Templates EN mal traduits | Revue par tenant pilote anglophone |

---

## Métriques de succès (rappel)

À mesurer 30j post-PR-D :

| Métrique | Cible |
|---|---|
| Erreurs 403 RBAC | <0.1% |
| Erreurs 500 exports PDF | 0 |
| Latence p95 export matrice rôles | <3s sync |
| Délégations créées par tenant | ≥1 |
| Tickets support "je ne peux pas X" | < baseline |
| Audit events RBAC | >10/jour/tenant actif |
| Taux réussite Playwright RBAC | 100% |

---

## Prochaine étape

→ Implémenter la **PR-A** selon le plan détaillé : [2026-05-13-rbac-pr-a-foundations.md](./2026-05-13-rbac-pr-a-foundations.md)
