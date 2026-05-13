# Spec — RBAC Bootstrap & Export PDF (matrice de rôles utilisable post-install)

**Date** : 2026-05-13
**Statut** : Design validé — prêt pour `writing-plans`
**Auteur** : Hervé MUNYEKU (cadrage en session brainstorming)
**Topic** : `rbac-bootstrap-design`

---

## Table des matières

1. [Contexte et problème](#1-contexte-et-problème)
2. [Objectifs et livrables](#2-objectifs-et-livrables)
3. [Décisions de cadrage](#3-décisions-de-cadrage)
4. [Convention de nommage des permissions](#4-convention-de-nommage-des-permissions)
5. [Matrice des 20 rôles](#5-matrice-des-20-rôles)
6. [Migration et seed](#6-migration-et-seed)
7. [API endpoints](#7-api-endpoints)
8. [Templates PDF et email](#8-templates-pdf-et-email)
9. [UI frontend](#9-ui-frontend)
10. [Audit trail, tests et roll-out](#10-audit-trail-tests-et-roll-out)
11. [Annexes](#11-annexes)

---

## 1. Contexte et problème

OpsFlux est un SaaS industriel multi-tenant (FastAPI + React/Vue + PostgreSQL + WeasyPrint + Redis) destiné au secteur Oil & Gas (assets, MOC, conformité HSE, paxlog, packlog, planning, documents techniques Papyrus, etc.).

### 1.1. État du système RBAC avant ce projet

Architecture RBAC mature et propre — pas à refaire :

- 3 couches de résolution : `User override > Role > Group override`, mode `restrictive` (défaut) ou `additive` configurable par tenant ([app/core/rbac.py](../../../app/core/rbac.py))
- Tables clés : `Role(code, name, module)`, `Permission(code, name, module)`, `RolePermission`, `UserGroup(entity_id, asset_scope)`, `UserGroupRole`, `UserGroupMember`, `GroupPermissionOverride`, `UserPermissionOverride` ([app/models/common.py:387-516](../../../app/models/common.py))
- Multi-tenant via `entity_id` sur `UserGroup` ; Roles et Permissions sont globaux
- Wildcard `*` = toutes permissions ; cache Redis 5 min
- Vérification dans les routes via `require_permission("code")` ([app/api/deps.py:157](../../../app/api/deps.py))
- UI admin existante : `apps/main/src/pages/settings/tabs/RbacAdminTab.tsx` avec 3 sous-onglets (Rôles, Groupes, Permissions)

Système PDF (sera réutilisé) :
- Stack WeasyPrint + Jinja2 via `app/core/pdf_templates.py:render_pdf(db, slug, entity_id, language, variables) → bytes`
- Tables `PdfTemplate(slug, entity_id, variables_schema)` + `PdfTemplateVersion(body_html, header_html, footer_html, published)`
- Versioning, multi-tenant, templates système possibles via `entity_id=NULL`

Système email équivalent : `app/core/email_templates.py:render_and_send_email(slug, language, variables, attachments)`.

### 1.2. Problème (pain points)

Le seed initial ([alembic/versions/001_initial_schema.py:315-372](../../../alembic/versions/001_initial_schema.py)) crée :

- **12 rôles** : `SUPER_ADMIN`, `TENANT_ADMIN`, `DO`, `DPROD`, `HSE_ADMIN`, `SITE_MGR`, `PROJ_MGR`, `MAINT_MGR`, `LOG_COORD`, `TRANSP_COORD`, `PAX_ADMIN`, `READER`
- **23 permissions** (user.*, asset.*, tier.*, entity.*, setting.*, audit.read, workflow.definition.*, dashboard.*)

Conséquences néfastes :
- **~120 permissions sont utilisées dans le code mais jamais seedées en base** (paxlog.*, packlog.*, moc.*, planner.*, conformite.*, pid.*, document.*, etc.)
- **Seuls `SUPER_ADMIN` et `TENANT_ADMIN` ont des permissions assignées** — les 10 autres rôles existent mais sont vides
- **Conventions de nommage incohérentes** : `asset.read`, `core.rbac.read`, `admin.system`, `moc.production.validate`, `role.manage` vs `core.rbac.manage` (doublons)
- **Pas de gestion fonctionnelle des délégations** : table `user_delegations` existe mais aucune route API, aucune notification, aucune UI
- **Aucun export PDF des matrices RBAC** : impossible de produire la documentation requise pour audit ISO 27001 ou RGPD

### 1.3. Conséquence opérationnelle

Après installation d'OpsFlux, un client doit :
1. Soit attribuer `SUPER_ADMIN` ou `TENANT_ADMIN` à tous ses managers (trop large)
2. Soit reconstruire manuellement la matrice de permissions pour chaque rôle (semaines de travail)
3. Soit accepter que 10 rôles sur 12 soient inutilisables

Aucune option n'est acceptable pour un logiciel destiné à être utilisable immédiatement après mise en service.

---

## 2. Objectifs et livrables

### 2.1. Objectifs

| # | Livrable | État cible après install |
|---|---|---|
| L1 | Catalogue complet de permissions seedées en base | ~150 permissions normalisées en `<module>.<resource>.<action>` |
| L2 | Matrice de 20 rôles starter avec liaisons `role_permissions` cohérentes | Logiciel utilisable immédiatement après création des users |
| L3 | Convention configurable du rôle par défaut à la création d'un user (selon `user_type`) | Setting tenant-scope éditable depuis l'admin système |
| L4 | 10 templates PDF système (matrices et fiches) + 1 template certificat délégation | Slugs `core.rbac.*` |
| L5 | Module complet de gestion des délégations (CRUD + emails + PDF certificat + audit) | Couvre ISO 27001 §A.9.2.5 et §A.9.2.6 |
| L6 | Système d'import CSV/XLSX pour 3 types de liaisons RBAC | Via `ImportWizard` existant |
| L7 | Table d'audit trail `rbac_audit_events` | Conformité audit, sans stockage des fichiers |
| L8 | Migration idempotente respectant les customs admin sur 17 rôles | Redéploiement safe |
| L9 | i18n FR + EN dès le départ | Tous les templates seedés en 2 langues |
| L10 | UI front enrichie : 5 sous-onglets RBAC + composants partagés | `ExportPdfMenu`, panel délégations, panel réglages |

### 2.2. Non-objectifs

- ❌ Pas de UI de matrice de ségrégation des devoirs (SoD) éditable : SoD est exportée en lecture seule, basée sur des règles hard-codées
- ❌ Pas de versioning des matrices RBAC en base : si snapshot daté requis, on exporte le PDF
- ❌ Pas de modification du modèle existant `UserDelegation` (la table est déjà bonne, on lui ajoute les routes manquantes)
- ❌ Pas de stockage long terme des PDF exportés : seul le hash SHA-256 reste dans `rbac_audit_events`
- ❌ Pas de "matrice par installation" exportable dans cette itération
- ❌ Pas de templates de groupes par installation à l'install (l'admin les crée)

### 2.3. Conformité couverte

- ✅ ISO 27001 §A.9.2.2 Provisionnement des accès (rôles starters)
- ✅ ISO 27001 §A.9.2.3 Gestion des privilèges (matrice + SoD)
- ✅ ISO 27001 §A.9.2.5 Revue des droits (exports PDF datés)
- ✅ ISO 27001 §A.9.2.6 Suppression des droits (révocation délégation + audit)
- ✅ ISO 9001 §7.5 Documentation maîtrisée (Papyrus + DOC_CONTROLLER)
- ✅ RGPD Art. 30 Registre des traitements (`rbac_audit_events` + fiche user PDF)
- ✅ RGPD Art. 32 Sécurité (RBAC fin + délégation tracée)

---

## 3. Décisions de cadrage

Six questions de cadrage ont été validées par l'utilisateur avant le design.

| # | Question | Décision |
|---|---|---|
| Q1 | Périmètre du bootstrap | **C — Refonte propre + nouveaux rôles** (harmoniser nommage + 20 rôles cibles) |
| Q2 | Personas / rôles cibles | **Liste de 20 rôles** avec hiérarchie `DO > DPROD > SITE_MGR` |
| Q3 | Convention de nommage | **B — Format 3-niveaux strict** `<namespace>.<resource>.<action>` partout |
| Q4 | Périmètre exports PDF | **Tous les 9** (+ ajout 10ᵉ : registre délégations) |
| Q5.A | Exécution sync vs async | **A2 — Sync + seuil** (bascule async > 30s estimés) |
| Q5.B | Stockage des PDF | **B2 — Audit trail seulement** (hash dans `rbac_audit_events`, pas de fichier) |
| Q5.C | Permissions sur l'export | **C2 — Graduées** (`core.rbac.export` + `core.user.audit_export` séparée) |
| Q5.D | Branding | **D2 — Branding tenant** (logo + nom, pas de watermark) |
| Q6.A | Idempotence du seed | **A2 — Upsert + reset système** (les 3 immuables réécrits, 17 autres préservés) |
| Q6.B | Rôle par défaut user | **B3 configurable** (selon user_type, géré en Setting tenant) |
| Q6.C | Langue PDF | **C3 — Paramètre URL** (`?lang=fr\|en`, défaut `user.language`) |
| Q6.D | Modules désactivés | **D3 — Choix par export** + indication visuelle (grisé) |

Extensions ajoutées en cours de cadrage :
- **Délégations ISO** : mail au délégateur, mail au délégué, PDF certificat attaché, audit trail complet avec hash SHA-256
- **Import CSV/XLSX** via l'`ImportWizard` existant pour 3 targets : `rbac_role_permission`, `rbac_group_override`, `rbac_user_group`

---

## 4. Convention de nommage des permissions

### 4.1. Règle formelle

Tous les codes de permissions suivent **`<namespace>.<resource>.<action>`** — exactement 3 segments, séparés par `.`, lowercase, snake_case si nécessaire dans un segment.

- `namespace` : nom du module ou domaine fonctionnel. Liste fermée (voir 4.2).
- `resource` : nom de l'objet métier au singulier dans ce namespace. Si le namespace n'a qu'un objet principal, on duplique : `asset.asset.read`, `dashboard.dashboard.read`.
- `action` : verbe d'action (voir 4.3).

### 4.2. Namespaces autorisés (21)

| Namespace | Périmètre | Resources |
|---|---|---|
| `system` | Plateforme cross-tenant (PLATFORM_ADMIN uniquement) | `tenant`, `audit`, `platform`, `user` |
| `core` | Transverse tenant : RBAC, audit, settings, users, entités | `rbac`, `audit`, `setting`, `user`, `entity`, `integration`, `notification`, `delegation` |
| `asset` | Asset registry | `asset`, `installation`, `field`, `pump`, `pipeline`, `equipment` |
| `tier` | Tiers (companies + contacts) | `tier`, `contact` |
| `papyrus` | Documents techniques (MDR) | `document`, `template`, `form`, `distribution_list`, `arborescence`, `nomenclature` |
| `moc` | Management of Change | `change`, `validator` |
| `planner` | Planning | `activity`, `capacity`, `conflict`, `priority` |
| `paxlog` | Personnel mobilization | `ads`, `profile`, `credential`, `credential_type`, `compliance`, `signalement`, `incident`, `rotation`, `stay_program` |
| `packlog` | Cargo logistique | `cargo`, `request` |
| `travelwiz` | Voyages | `boarding`, `tracking`, `voyage` |
| `pid` | P&ID / PFD | `diagram`, `equipment`, `tag`, `library` |
| `workflow` | Moteur workflow | `definition`, `instance` |
| `messaging` | Annonces + sécurité | `announcement`, `login_event`, `security_rule` |
| `support` | Tickets | `ticket` |
| `teams` | Équipes | `team`, `member` |
| `conformite` | HSE / conformité | `record`, `rule`, `type`, `exemption`, `transfer`, `verification`, `job_position` |
| `imputation` | Imputations | `imputation`, `template`, `assignment`, `cost_center`, `department` |
| `dashboard` | Tableaux de bord | `dashboard`, `widget` |
| `report` | Report editor | `report` |
| `mcp` | MCP gateway | `gateway`, `token`, `agent` |
| `integration` | Intégrations externes | `connection`, `oauth_app`, `webhook` |

### 4.3. Actions standardisées

- **CRUD** : `read`, `create`, `update`, `delete`
- **Bulk** : `import`, `export`
- **Workflow** : `submit`, `approve`, `reject`, `validate`, `publish`, `transition`
- **Cycle de vie** : `archive`, `share`, `revoke`, `assign`, `block`, `unblock`, `cancel`
- **Composé** : `manage` (= CRUD complet), `audit_export` (export de données RGPD)

Si une action sort de cette liste, justification dans le commentaire de la migration et docs.

### 4.4. Règles spéciales

- **Délégations sous `core`** : pas `core.rbac.delegation.*` (4 niveaux). On utilise `core.delegation.read/create/manage/revoke`. La délégation est une *resource* de `core`.
- **Export fiches user** : pas `core.rbac.export.user`. On utilise `core.user.audit_export` (l'action explicite la sensibilité RGPD).
- **Workflow appliqué à une resource d'un autre module** : rattaché au module métier, pas à `workflow`. Ex : `papyrus.document.publish` (pas `workflow.publish`).
- **Wildcard `*`** : conservé pour `PLATFORM_ADMIN`/`TENANT_ADMIN`. Convention en `check_permission()` ([app/core/rbac.py:245](../../../app/core/rbac.py)).

### 4.5. Mapping des codes existants

Le mapping exhaustif est dans l'**Annexe A**. Compteur :
- **Anciens codes uniques détectés** : ~130
- **Codes dépréciés / fusionnés** : ~12
- **Codes nouveaux créés** : ~20
- **Total final** : ~150 permissions

---

## 5. Matrice des 20 rôles

### 5.1. Liste des rôles

| # | Code | Strate | Intention |
|---|---|---|---|
| 1 | `PLATFORM_ADMIN` (ex `SUPER_ADMIN`) | Plateforme | Admin multi-tenant — bypass total via wildcard `*` |
| 2 | `TENANT_ADMIN` | Tenant | Admin complet sur 1 tenant — RBAC, settings, users |
| 3 | `SECURITY_OFFICER` | Tenant | Lecture audit, RBAC, MFA, sessions ; sans pouvoir métier |
| 4 | `DO` | Direction | Directeur des Opérations — vision globale, approbations top-level |
| 5 | `DPROD` | Direction | Directeur de Production — sous DO, gère plusieurs assets |
| 6 | `SITE_MGR` | Manager | Chef de Site — sous DPROD, responsable d'une installation |
| 7 | `PROJ_MGR` | Manager | Chef de Projet — pilote 1+ projets |
| 8 | `HSE_MGR` (ex `HSE_ADMIN`) | Manager | Conformité, exemptions, vérifications HSE |
| 9 | `MAINT_MGR` | Manager | Maintenance assets, équipements, PID equipment |
| 10 | `DOC_CONTROLLER` | Spécialiste | Papyrus : MDR, templates, distribution, approuve docs techniques |
| 11 | `PAX_COORD` (ex `PAX_ADMIN`) | Coordinateur | Paxlog : badges, profils, compliance, ADS create/submit |
| 12 | `LOG_COORD` | Coordinateur | Packlog : cargo, lettres de transport |
| 13 | `TRANSP_COORD` | Coordinateur | TravelWiz : voyages, boarding, tracking |
| 14 | `PLANNER` | Coordinateur | Planner : activités, capacité, conflits |
| 15 | `MOC_VALIDATOR` | Validateur | Valide les MOC sans pouvoir les créer (séparation des pouvoirs) |
| 16 | `OPERATOR` | Contributeur | Saisit/édite données métier, sans approuver |
| 17 | `PAX` | Self-service | Voit son profil, rotations, badges, compliance (user_type=external) |
| 18 | `TIER_CONTACT` | Self-service | Compagnie externe : voit ses propres tiers et demandes |
| 19 | `READER` | Lecture | Lecture seule globale tenant |
| 20 | `INTEGRATION_BOT` | Système | Compte service pour intégrations / MCP / webhooks |

**Rôles système immuables** (réécrits par chaque migration phase 2) : `PLATFORM_ADMIN`, `TENANT_ADMIN`, `READER`.

**Rôles starters customisables** : les 17 autres. Un admin peut modifier leurs permissions, la migration ne touche pas à ces customs (option Q6.A = A2).

### 5.2. Matrice détaillée

La matrice complète des liaisons rôle × permission est dans l'**Annexe B**. Synthèse par zone fonctionnelle :

#### Vue 5.A — Transverses

| # | Rôle | system | core.rbac | core.user | core.entity | core.setting | core.audit | core.integration | core.notification | core.delegation |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PLATFORM_ADMIN | `*` | `*` | `*` | `*` | `*` | `*` | `*` | `*` | `*` |
| 2 | TENANT_ADMIN | – | `*` | `*` | `*` | `*` | R | MGR | `*` | `*` |
| 3 | SECURITY_OFFICER | – | R + export | R + audit_export | R | R | R | R | R | R + revoke |
| 4 | DO | – | R | R | R | – | R | – | R | RWS (own) |
| 5 | DPROD | – | R | R | – | – | R | – | R | RWS (own) |
| 6 | SITE_MGR | – | R | R | – | – | – | – | R | RWS (own) |
| 7 | PROJ_MGR | – | R | R | – | – | – | – | R | RWS (own) |
| 8 | HSE_MGR | – | R | R | – | – | R | – | R | RWS (own) |
| 9 | MAINT_MGR | – | – | R | – | – | – | – | R | RWS (own) |
| 10 | DOC_CONTROLLER | – | – | R | – | – | – | – | R | RWS (own) |
| 11 | PAX_COORD | – | – | R | – | – | – | – | R | RWS (own) |
| 12 | LOG_COORD | – | – | R | – | – | – | – | R | RWS (own) |
| 13 | TRANSP_COORD | – | – | R | – | – | – | – | R | RWS (own) |
| 14 | PLANNER | – | – | R | – | – | – | – | R | RWS (own) |
| 15 | MOC_VALIDATOR | – | – | R | – | – | – | – | R | RWS (own) |
| 16 | OPERATOR | – | – | R/OWN | – | – | – | – | R/OWN | – |
| 17 | PAX | – | – | R/OWN | – | – | – | – | R/OWN | – |
| 18 | TIER_CONTACT | – | – | R/OWN | – | – | – | – | R/OWN | – |
| 19 | READER | – | R | R | R | R | R | R | R | R |
| 20 | INTEGRATION_BOT | – | – | – | – | – | – | – | R | – |

Légende : `–` aucun ; `R` lecture ; `RW` R + create/update/delete ; `RWS` RW + submit ; `RWA` RW + approve/validate ; `MGR` manage ; `*` wildcard du namespace ; `OWN` restreint à ses propres données (filtre route).

**À propos de `OWN`** : ce n'est PAS une permission distincte en base. C'est un filtre appliqué au niveau du code des routes (ex : `WHERE user_id = current_user.id` ou `WHERE tier_id IN (current_user.tier_links)`). La permission accordée au rôle reste générique (ex : `paxlog.profile.read`). Le filtre métier s'applique au-dessus selon le rôle effectif du user. Documentation à produire dans `docs/developer/rbac.md` : convention de codage des routes `OWN`.

#### Vue 5.B — Données + documents

Détail dans Annexe B.

#### Vue 5.C — Opérations

Détail dans Annexe B.

### 5.3. Anti-patterns SoD (détection passive)

Ces combinaisons sont signalées dans l'export PDF #9 (matrice de ségrégation des devoirs), pas bloquantes au runtime :

| Anti-pattern | Détection |
|---|---|
| Même rôle a `moc.change.create` ET `moc.change.approve` | Bloque approbation des MOC qu'on a créés |
| Même rôle a `paxlog.ads.create` ET `paxlog.ads.approve` | Bloque approbation des ADS qu'on a créés |
| Même rôle a `papyrus.document.create` ET `papyrus.document.approve` | Bloque approbation des docs qu'on a créés |
| Même rôle a `core.delegation.create` ET `core.delegation.revoke` ET `core.delegation.manage` (sauf TENANT_ADMIN/SECURITY_OFFICER) | Auto-révocation suspecte |
| Même user a `OPERATOR` ET `MOC_VALIDATOR` dans le même groupe | Conflit de séparation |

### 5.4. Comptage final

- **Rôles** : 20 (3 système + 17 starters customisables)
- **Permissions** : ~150 (130 existantes + 20 nouvelles)
- **Liaisons `role_permissions` seedées** : ~1200 (moyenne 60 perms par rôle, dont 2 rôles à 150 perms et 2 rôles à <10)

---

## 6. Migration et seed

### 6.1. Stratégie en 3 phases

Déploiement zéro downtime. Chaque phase = 1 PR distincte.

#### Phase 1 — `170_rbac_bootstrap_phase1_additive.py`

Objectif : créer tout le nouveau matériel sans rien casser.

```python
def upgrade():
    # 1. Étend la table permissions
    op.add_column('permissions', sa.Column('namespace', sa.String(50)))
    op.add_column('permissions', sa.Column('resource', sa.String(50)))
    op.add_column('permissions', sa.Column('action', sa.String(50)))
    op.add_column('permissions', sa.Column('deprecated', sa.Boolean(), server_default='false'))
    op.add_column('permissions', sa.Column('deprecated_for', sa.String(100)))
    op.add_column('permissions', sa.Column('sensitive', sa.Boolean(), server_default='false'))

    # 2. Ajoute logo_url à entities (si pas déjà présent)
    op.add_column('entities', sa.Column('logo_url', sa.String(500)))

    # 3. Crée la table rbac_audit_events (voir 10.1)
    op.create_table('rbac_audit_events', ...)

    # 4. Seed des ~20 nouvelles permissions
    op.execute("INSERT INTO permissions (code, name, namespace, resource, action, module) VALUES ...")

    # 5. Seed des nouveaux rôles (8 manquants)
    op.execute("""INSERT INTO roles (code, name, description, module) VALUES
        ('SECURITY_OFFICER', 'Security Officer', '...', 'core'),
        ('DOC_CONTROLLER', 'Document Controller', '...', 'papyrus'),
        ('PLANNER', 'Planner', '...', 'planner'),
        ('MOC_VALIDATOR', 'MOC Validator', '...', 'moc'),
        ('OPERATOR', 'Operator', '...', 'core'),
        ('PAX', 'Personnel mobilisé', '...', 'paxlog'),
        ('TIER_CONTACT', 'Contact tiers externe', '...', 'tier'),
        ('INTEGRATION_BOT', 'Integration Bot', '...', 'integration')
        ON CONFLICT (code) DO NOTHING
    """)

    # 6. Renomme les rôles existants
    # ATTENTION : Role.code est PK et RolePermission.role_code est FK sans ON UPDATE CASCADE
    # (cf app/models/common.py:411). On ne peut donc PAS faire UPDATE roles SET code=...
    # → stratégie en 4 étapes :
    #   a) INSERT le nouveau code
    #   b) Propager les liaisons (role_permissions, user_group_roles)
    #   c) DELETE l'ancien code
    #   d) Le faire pour chaque renommage
    RENAMES = [
        ('SUPER_ADMIN', 'PLATFORM_ADMIN'),
        ('PAX_ADMIN', 'PAX_COORD'),
        ('HSE_ADMIN', 'HSE_MGR'),
    ]
    for old_code, new_code in RENAMES:
        op.execute(f"""
            INSERT INTO roles (code, name, description, module)
            SELECT '{new_code}', name, description, module FROM roles WHERE code = '{old_code}'
            ON CONFLICT (code) DO NOTHING
        """)
        op.execute(f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT '{new_code}', permission_code FROM role_permissions WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        op.execute(f"""
            INSERT INTO user_group_roles (group_id, role_code)
            SELECT group_id, '{new_code}' FROM user_group_roles WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        op.execute(f"DELETE FROM role_permissions WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM user_group_roles WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM roles WHERE code = '{old_code}'")

    # 7. Seed des settings tenant (rôle par défaut + ISO délégations)
    # rbac.default_role.internal = "READER"
    # rbac.default_role.external = "PAX"
    # rbac.default_role.tier_contact = "TIER_CONTACT"
    # rbac.delegation.max_duration_days = 365
    # rbac.delegation.notify_security_officer = true
    # rbac.export.async_threshold_users = 500
```

Idempotence : tous les `INSERT ... ON CONFLICT DO NOTHING` et `UPDATE ... WHERE`.

#### Phase 2 — `171_rbac_bootstrap_phase2_backfill.py`

Objectif : seeder les liaisons rôles ↔ permissions selon la matrice §5, en respectant l'idempotence A2 (reset système, préserver customs).

```python
SYSTEM_ROLES = {'PLATFORM_ADMIN', 'TENANT_ADMIN', 'READER'}

ROLE_PERMISSIONS_MATRIX = {
    'PLATFORM_ADMIN': ['*'],  # wildcard
    'TENANT_ADMIN': 'SELECT code FROM permissions WHERE code NOT LIKE \'system.%\'',
    'SECURITY_OFFICER': [...],
    'DO': [...],
    # ... 17 rôles, contenu dans Annexe B
}

def upgrade():
    # Reset les 3 rôles système
    for role_code in SYSTEM_ROLES:
        op.execute(f"DELETE FROM role_permissions WHERE role_code = '{role_code}'")
        # Re-seed depuis la matrice

    # 17 autres rôles : INSERT ON CONFLICT DO NOTHING (respecte customs)
    for role_code, perms in ROLE_PERMISSIONS_MATRIX.items():
        if role_code in SYSTEM_ROLES:
            continue
        for perm in perms:
            op.execute(f"INSERT INTO role_permissions ... ON CONFLICT DO NOTHING")

    # Audit event + notification email aux TENANT_ADMIN de chaque tenant
    op.execute("""
        INSERT INTO rbac_audit_events (tenant_id, event_type, target, params, actor_user_id)
        SELECT e.id, 'matrix.bootstrap', 'phase2', ..., (SELECT id FROM users WHERE email='system@opsflux.io')
        FROM entities e
    """)
```

Edge case documenté : si un admin a renommé un rôle (ex : `MY_DO` copié de `DO`), la migration ne touche pas `MY_DO`. Comportement attendu.

#### Phase 3 — `172_rbac_bootstrap_phase3_cleanup.py`

Objectif : supprimer les codes dépréciés. Déployée **après** que tout le code (backend + frontend) référence les nouveaux codes.

```python
DEPRECATED_CODES = {
    'role.manage': 'core.rbac.manage',
    'audit.read': 'core.audit.read',
    'entity.read': 'core.entity.read',
    # ... mapping complet en Annexe A
}

def upgrade():
    # 1. Propage les liaisons : old_code → new_code (idempotent)
    for old_code, new_code in DEPRECATED_CODES.items():
        # role_permissions
        op.execute(f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT role_code, '{new_code}' FROM role_permissions WHERE permission_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        # group_permission_overrides
        # user_permission_overrides

    # 2. Supprime les anciennes liaisons
    op.execute("DELETE FROM role_permissions WHERE permission_code IN (...)")
    op.execute("DELETE FROM group_permission_overrides WHERE permission_code IN (...)")
    op.execute("DELETE FROM user_permission_overrides WHERE permission_code IN (...)")

    # 3. Supprime les permissions dépréciées
    op.execute("DELETE FROM permissions WHERE code IN (...)")

    # 4. Invalide tous les caches RBAC (hook post-migration ou au démarrage de l'app)
```

#### Phase 4 — `173_rbac_seed_pdf_email_templates.py`

Objectif : seeder les 11 templates PDF système + 4 templates email, en FR et EN, à partir de fichiers HTML externalisés dans `app/static/rbac_pdf_templates/`.

### 6.2. Setting du rôle par défaut (configurable B3)

Structure en base :

| Clé Setting | Valeur (JSONB) | Scope |
|---|---|---|
| `rbac.default_role.internal` | `"READER"` | tenant |
| `rbac.default_role.external` | `"PAX"` | tenant |
| `rbac.default_role.tier_contact` | `"TIER_CONTACT"` | tenant |

Code à modifier ([app/api/routes/core/users.py](../../../app/api/routes/core/users.py)) — endpoint `POST /users` :

```python
async def _attach_default_role(db, user, entity_id):
    if user.tier_contact_id:
        setting_key = 'rbac.default_role.tier_contact'
    else:
        setting_key = f'rbac.default_role.{user.user_type}'

    role_code = await get_tenant_setting(db, entity_id, setting_key, default='READER')

    default_group = await get_or_create_default_group(db, entity_id, role_code)
    db.add(UserGroupMember(user_id=user.id, group_id=default_group.id))
    await db.commit()
```

UI admin : nouveau sous-onglet **Settings > RBAC > Réglages** (§9.7).

### 6.3. Garde-fous sur le bootstrap multi-tenants

Pour les users existants déjà dans des groupes assignés à `DO`/`DPROD`/etc., la migration phase 2 va leur donner soudainement les permissions définies dans §5.2. Garde-fous :

- La migration phase 2 émet un audit event `matrix.bootstrap` par tenant
- Email automatique aux `TENANT_ADMIN` de chaque tenant avec résumé + lien vers l'export PDF de la nouvelle matrice
- Setting `rbac.bootstrap.email_admins_on_migration = true` (configurable)

### 6.4. Rollback strategy

**Principe général** : `alembic downgrade` est implémenté formellement mais **n'est pas la stratégie recommandée** au-delà de la phase 1. Pour les phases 2 et 3, la stratégie est **restauration depuis backup** (snapshot DB obligatoire avant chaque phase).

| Phase | Méthode primaire | Méthode `alembic downgrade` |
|---|---|---|
| Phase 1 | `alembic downgrade -1` | `drop_column` + `DELETE FROM permissions WHERE code IN (new_codes)`. Rôles renommés remis à l'ancien code via le même algo INSERT+propagate+DELETE inversé. |
| Phase 2 | **Restore depuis backup** (recommandé) | `DELETE FROM role_permissions WHERE role_code IN (SYSTEM_ROLES)` puis re-seed des anciennes liaisons. Pour les rôles non-système : le `ON CONFLICT DO NOTHING` rend impossible un rollback propre (on ne distingue pas seed vs custom). Le downgrade alembic est donc **partiel** (n'enlève que ce qui a été inséré). |
| Phase 3 | **Restore depuis backup obligatoire** | Pas de downgrade alembic — les anciens codes ont été supprimés et leurs liaisons aussi. |

Mitigation : avant chaque déploiement de phase 2 et 3, créer un snapshot logique des tables `roles`, `permissions`, `role_permissions`, `group_permission_overrides`, `user_permission_overrides` (export SQL). Stocker dans `backups/rbac/{phase}/{timestamp}.sql`.

### 6.5. Ordre de déploiement

| Sprint | PR | Contenu |
|---|---|---|
| S1 | PR-A | Migration phase 1 + endpoints API sans templates |
| S1 | PR-B | Seed des 11 templates PDF système + 4 templates email (FR + EN) |
| S2 | PR-C | UI front : `RbacAdminTab` enrichi |
| S2 | PR-D | Migration phase 2 (backfill rôles) + mail aux TENANT_ADMIN |
| S3 | PR-E | Refactor backend : `require_permission(...)` vers nouveaux codes |
| S3 | PR-F | Refactor frontend : checks de permission |
| S4 | PR-G | Migration phase 3 (cleanup) après vérification |

Durée estimée : 4 sprints (~4 semaines à 1 dev senior).

---

## 7. API endpoints

### 7.1. Endpoints d'export PDF (10 routes)

Préfixe : `/api/v1/rbac/exports/`. Toutes ces routes :
- Sont protégées par `core.rbac.export` (sauf #6 → `core.user.audit_export`)
- Acceptent `?lang=fr|en` (défaut `user.language`)
- Acceptent `?include_disabled_modules=false`
- Enregistrent un événement dans `rbac_audit_events`
- Retournent `Content-Type: application/pdf` en sync ; ou `202 Accepted` + URL de polling en async

| # | Endpoint | Verbe | Permission | Paramètres |
|---|---|---|---|---|
| 1 | `/matrix/role-permissions.pdf` | GET | `core.rbac.export` | `?module={ns}&format=full\|by_module` |
| 2 | `/matrix/group-permissions.pdf` | GET | `core.rbac.export` | `?group_id={uuid}...` |
| 3 | `/matrix/user-permissions.pdf` | GET | `core.user.audit_export` | `?user_id={uuid}...` ou `?role_code={code}` |
| 4 | `/role/{role_code}.pdf` | GET | `core.rbac.export` | — |
| 5 | `/group/{group_id}.pdf` | GET | `core.rbac.export` | — |
| 6 | `/user/{user_id}.pdf` | GET | `core.user.audit_export` | `?include_delegations=true` |
| 7 | `/matrix/role-modules.pdf` | GET | `core.rbac.export` | — |
| 8 | `/catalog/permissions.pdf` | GET | `core.rbac.export` | `?group_by={module\|action}` |
| 9 | `/matrix/sod.pdf` | GET | `core.rbac.export` | — |
| 10 | `/delegations/registry.pdf` | GET | `core.rbac.export` ou `core.delegation.read` | `?status=&start_date=&end_date=` |

Réponse async :

```json
HTTP 202 Accepted
{
  "audit_event_id": "uuid",
  "status": "pending",
  "poll_url": "/api/v1/rbac/exports/jobs/{audit_event_id}",
  "estimated_seconds": 45
}
```

Polling : `GET /api/v1/rbac/exports/jobs/{audit_event_id}` → `{ status, download_url }`. Fichier supprimé après première récupération + retry court (TTL 1h).

Réponse PDF (sync ou téléchargement post-async) :

```python
return Response(
    content=pdf_bytes,
    media_type="application/pdf",
    headers={
        "Content-Disposition": f'attachment; filename="rbac_matrix_role_permissions_{date_str}.pdf"',
        "X-Audit-Event-Id": str(audit_event.id),
        "X-Content-Hash": sha256_hex,
    },
)
```

### 7.2. Endpoints délégations (7 routes)

Préfixe : `/api/v1/rbac/delegations/`.

| Endpoint | Verbe | Permission | Description |
|---|---|---|---|
| `/` | GET | `core.delegation.read` | Liste tenant. Filtres `status`, `delegator_id`, `delegate_id`, `permission_code` |
| `/mine` | GET | (auth) | Mes délégations (reçues + données) |
| `/` | POST | `core.delegation.create` | Crée → 2 mails + PDF + audit |
| `/{id}` | GET | `core.delegation.read` ou délégateur/délégué | Détail |
| `/{id}` | PATCH | `core.delegation.manage` ou délégateur | Modifie `reason` ou `end_date` (raccourcir uniquement) |
| `/{id}/revoke` | POST | `core.delegation.revoke` ou délégateur | Révoque → mails + audit |
| `/{id}/certificate.pdf` | GET | délégateur/délégué/`core.delegation.read` | Retélécharge certificat (hash recalculé doit matcher) |

#### Schéma `POST /` (création)

```python
class DelegationCreate(BaseModel):
    delegate_id: UUID
    permissions: list[str]
    start_date: datetime
    end_date: datetime
    reason: str  # required (ISO traceability)
```

#### Garde-fous serveur

1. Vérifie durée max (`rbac.delegation.max_duration_days`)
2. Vérifie que le délégateur possède effectivement toutes les perms à déléguer (`get_user_permissions`)
3. Bloque sous-délégation : pour chaque perm à déléguer, vérifie qu'elle est disponible **autrement que par délégation reçue active** (via `_resolve_permissions` avec source filtrée). Si une perm n'est disponible **que** via une délégation reçue, refuse `RBAC_DELEGATION_SUB_DELEGATION_DENIED` et liste les perms concernées dans le message d'erreur. Les perms disponibles à la fois via délégation ET via rôle/group restent déléguables.
4. Crée la délégation
5. Génère le certificat PDF + hash SHA-256
6. Crée l'audit event
7. Envoie les 2 emails (+ CC SECURITY_OFFICER si setting on)
8. Invalide le cache RBAC du délégué

### 7.3. Intégration au moteur RBAC — 4ᵉ couche délégations

Le type `PermissionSource` ([app/core/rbac.py:31](../../../app/core/rbac.py)) passe de :

```python
PermissionSource = Literal["user", "role", "group"]
```

à :

```python
PermissionSource = Literal["user", "role", "group", "delegation"]
```

La fonction `_resolve_permissions()` ajoute une 4ᵉ couche :

```python
# Layer 4: Active delegations received
now = datetime.now(timezone.utc)
delegation_stmt = (
    select(UserDelegation.permissions)
    .where(
        UserDelegation.delegate_id == user_id,
        UserDelegation.entity_id == entity_id,
        UserDelegation.active == True,
        UserDelegation.start_date <= now,
        UserDelegation.end_date > now,
    )
)
delegation_perms = [...]

# Mode restrictive : user override granted=False peut révoquer
# Mode additive : delegations s'ajoutent (granted=False ignoré)
```

### 7.4. Endpoints d'import (3 routes via `import_assistant`)

Ajout dans `_PERMISSION_MAP` ([app/api/routes/core/import_assistant.py:41](../../../app/api/routes/core/import_assistant.py)) :

```python
_PERMISSION_MAP: dict[str, str] = {
    # ... existing
    "rbac_role_permission": "core.rbac.manage",
    "rbac_group_override": "core.rbac.manage",
    "rbac_user_group": "core.rbac.manage",
}
```

Services dans `app/services/modules/rbac_import_service.py` :

| Target | Colonnes | Stratégies | Validation |
|---|---|---|---|
| `rbac_role_permission` | `role_code`, `permission_code` (ou pivot) | `REPLACE_ROLE`, `MERGE` | role_code existe ; permission_code existe et non dépréciée |
| `rbac_group_override` | `group_id`/`group_name`, `permission_code`, `granted` | `REPLACE_GROUP`, `MERGE` | group existe dans le tenant ; permission_code existe |
| `rbac_user_group` | `user_email`/`user_id`, `group_name`/`group_id`, `roles` (optionnel, csv) | `REPLACE_USER`, `MERGE` | user existe ; group existe ; roles existent |

**Garde-fous import** :
- Pas d'import de nouveaux `Role` ou `Permission`
- Pas d'import des `UserPermissionOverride`
- Tous les imports émettent un audit event `import.*` avec `row_count` + hash du CSV input

### 7.5. Endpoints d'administration

| Endpoint | Verbe | Permission | Description |
|---|---|---|---|
| `/api/v1/rbac/defaults` | GET | `core.rbac.read` | Settings rôle par défaut (3 valeurs) |
| `/api/v1/rbac/defaults` | PUT | `core.rbac.manage` | Met à jour. Valide existence des rôles |
| `/api/v1/rbac/audit-events` | GET | `core.audit.read` ou `core.rbac.read` | Liste paginée filtres event_type/period/user |
| `/api/v1/rbac/matrix/role-permissions` | GET | `core.rbac.read` | Matrice JSON pour UI |
| `/api/v1/rbac/matrix/group-permissions` | GET | `core.rbac.read` | Matrice JSON avec 4 sources |
| `/api/v1/rbac/matrix/sod` | GET | `core.rbac.read` | Conflits SoD détectés |

### 7.6. Erreurs structurées

Utilise `StructuredHTTPException` ([app/core/errors.py](../../../app/core/errors.py)) avec codes :
- `RBAC_TEMPLATE_NOT_FOUND` (template PDF système non seedé)
- `RBAC_ASYNC_THRESHOLD_EXCEEDED` (export bascule en mode async)
- `RBAC_DELEGATION_INSUFFICIENT_PERMS` (délégateur manque les perms)
- `RBAC_DELEGATION_SUB_DELEGATION_DENIED` (tentative re-délégation)
- `RBAC_DELEGATION_DURATION_EXCEEDED` (durée > max configuré)
- `RBAC_IMPORT_VALIDATION_FAILED` (rows invalides)

---

## 8. Templates PDF et email

### 8.1. Templates PDF à seeder (11 slugs)

| # | Slug | Nom (FR) | Format | Variables principales |
|---|---|---|---|---|
| 1 | `core.rbac.matrix_role_permissions` | Matrice Rôles × Permissions | A4 paysage | `roles[]`, `permissions[]`, `grants{}`, `modules[]`, `tenant`, `generated_at`, `generated_by` |
| 2 | `core.rbac.matrix_group_permissions` | Matrice Groupes × Permissions | A4 paysage | `groups[]`, `permissions[]`, `grants{}` (avec source) |
| 3 | `core.rbac.matrix_user_permissions` | Matrice Utilisateurs × Permissions | A4 paysage | `users[]`, `permissions[]`, `grants{}` |
| 4 | `core.rbac.role_detail` | Fiche détaillée d'un rôle | A4 portrait | `role`, `permissions_by_module[]`, `groups_using_role[]`, `users_via_groups[]` |
| 5 | `core.rbac.group_detail` | Fiche détaillée d'un groupe | A4 portrait | `group`, `roles[]`, `overrides[]`, `members[]`, `effective_permissions[]`, `asset_scope` |
| 6 | `core.rbac.user_detail` | Fiche détaillée d'un utilisateur | A4 portrait | `user`, `groups[]`, `roles_via_groups[]`, `overrides[]`, `effective_permissions[]`, `delegations_received[]`, `delegations_given[]` |
| 7 | `core.rbac.role_modules` | Vue Rôles × Modules | A4 portrait | `roles[]`, `modules[]`, `access_levels{}` |
| 8 | `core.rbac.permission_catalog` | Catalogue de permissions | A4 portrait | `permissions_by_module[]`, `usage_stats[]` |
| 9 | `core.rbac.sod_matrix` | Matrice ségrégation devoirs | A4 portrait | `sod_rules[]`, `violations[]`, `users_at_risk[]` |
| 10 | `core.rbac.delegation_registry` | Registre délégations | A4 paysage | `delegations[]`, `period`, `tenant` |
| 11 | `core.rbac.delegation_certificate` | Certificat de délégation | A4 portrait | `delegation`, `delegator`, `delegate`, `tenant`, `audit_event_id`, `iso_clause` |

Tous en **FR + EN** = **22 versions** seedées.

### 8.2. Templates email à seeder (4 slugs)

| Slug | Trigger | Destinataire | Attachment |
|---|---|---|---|
| `rbac.delegation.granted` | POST création | Délégateur | `certificate.pdf` |
| `rbac.delegation.received` | POST création | Délégué | `certificate.pdf` |
| `rbac.delegation.revoked` | POST revoke | Délégateur + délégué | `certificate.pdf` (RÉVOQUÉ) |
| `rbac.delegation.expired` | Cron J-3 et J0 | Délégateur + délégué | `certificate.pdf` |

Tous en FR + EN = **8 versions**.

### 8.3. Structure HTML — partials communs

Header/footer mutualisés via un fichier `app/static/rbac_pdf_templates/_shared/header.html` (et `footer.html`) inclus via `{% include %}` au moment du seed (pas à l'exécution, car la table `PdfTemplateVersion` stocke le HTML déjà inliné).

Exemple de header (avec branding tenant D2) :

```html
<header style="display:flex; justify-content:space-between; padding:8mm 12mm;
               border-bottom:1px solid #cbd5e1; font-family:Arial; font-size:9pt; color:#475569;">
  <div style="display:flex; align-items:center; gap:10mm;">
    {% if tenant.logo_url %}
      <img src="{{ tenant.logo_url }}" alt="{{ tenant.name }}" style="height:14mm;"/>
    {% else %}
      <span style="font-weight:700; color:#0f172a;">OpsFlux</span>
    {% endif %}
    <div>
      <div style="font-weight:600; color:#0f172a;">{{ tenant.name }}</div>
      <div style="font-size:8pt; color:#64748b;">{{ document_title }}</div>
    </div>
  </div>
  <div style="text-align:right; font-size:8pt;">
    <div>{{ _('Généré le') }} {{ generated_at | format_datetime(lang) }}</div>
    <div>{{ _('Par') }} {{ generated_by.full_name }}</div>
    <div style="margin-top:1mm; padding:1mm 2mm; background:#fef3c7;
                border-radius:2mm; display:inline-block; font-weight:600; color:#92400e;">
      {{ _('CONFIDENTIEL') }}
    </div>
  </div>
</header>
```

Pagination via `@page` CSS :

```css
@page {
  size: A4 landscape;
  margin: 18mm 12mm 16mm 12mm;
  @top-center { content: element(header); }
  @bottom-center { content: element(footer); }
}
header { position: running(header); }
footer { position: running(footer); }
.page-number::before { content: counter(page); }
.total-pages::before { content: counter(pages); }
```

### 8.4. i18n via Jinja helper `_`

Helper global enregistré dans `app/core/pdf_templates.py` :

```python
def _build_translator(lang: str):
    from app.core.references import translate
    def _(key: str) -> str:
        return translate(key, lang=lang, domain="rbac_pdf")
    return _

# Injection dans le contexte de rendu
ctx["_"] = _build_translator(language)
ctx["lang"] = language
```

Catalogue dédié `rbac_pdf` dans la table `references` (existante).

### 8.5. Variables_schema (validation Jinja)

Pour que `validate_pdf_template_source` ([app/core/pdf_templates.py:154](../../../app/core/pdf_templates.py)) valide chaque template, le `PdfTemplate.variables_schema` déclare la structure attendue. Exemple pour `core.rbac.matrix_role_permissions` dans l'Annexe C.

### 8.6. Stockage des templates HTML

**Choix : externalisation dans `app/static/rbac_pdf_templates/`**.

Structure :

```
app/static/rbac_pdf_templates/
  matrix_role_permissions.fr.body.html
  matrix_role_permissions.fr.header.html
  matrix_role_permissions.fr.footer.html
  matrix_role_permissions.en.body.html
  ...
  _shared/
    header.html
    footer.html
    common.css
```

Migration phase 4 charge ces fichiers, inline les partials, et insère dans `PdfTemplate` / `PdfTemplateVersion`.

Avantage : templates HTML évoluent indépendamment du schéma ; un dev peut tester avec WeasyPrint en isolation.

---

## 9. UI frontend

### 9.1. Structure 5 sous-onglets

`apps/main/src/pages/settings/tabs/RbacAdminTab.tsx` :

```
Settings > RBAC
├── Rôles         (existant, enrichi)
├── Groupes       (existant, enrichi)
├── Permissions   (existant, enrichi)
├── Délégations   (NOUVEAU — RbacDelegationsTab.tsx)
└── Réglages      (NOUVEAU — RbacSettingsTab.tsx)
```

Chaque sous-onglet a sa permission de visibilité (`core.rbac.read`, `core.delegation.read`, etc.).

### 9.2. Composant partagé `ExportPdfMenu`

Nouveau composant `apps/main/src/components/shared/ExportPdfMenu.tsx`.

Props :

```typescript
type ExportItem = {
  key: string
  label: string
  description: string
  endpoint: string
  filename: (params: any) => string
  params?: Record<string, any>
  permission: string
  requiresSelection?: boolean
}

interface ExportPdfMenuProps {
  items: ExportItem[]
  selectedIds?: string[]
  context: 'roles' | 'groups' | 'permissions' | 'users' | 'delegations'
  language?: 'fr' | 'en' | 'auto'
  includeDisabledModules?: boolean
}
```

Comportement :
- Bouton "Export PDF" avec icône `FileDown`
- Dropdown listant les exports contextuels
- Switch global "Langue: FR / EN" et "Inclure modules désactivés"
- Au clic, fetch endpoint → blob → download
- Si `202 Accepted` (async) → toast "Export en cours, notification quand prêt" + suivi WebSocket
- Toast d'erreur si `RBAC_TEMPLATE_NOT_FOUND` ("Template système non installé")

### 9.3. Items par contexte

**Contexte `roles`** :
- Matrice complète Rôles × Permissions
- Matrice Rôles × Modules
- Fiche détaillée du rôle sélectionné (1 sélection requise)
- Bundle fiches détaillées (N sélections)
- Catalogue des permissions
- Matrice SoD

**Contexte `groups`** :
- Matrice Groupes × Permissions
- Fiche détaillée du groupe sélectionné
- Bundle fiches groupes

**Contexte `users`** (page Users principale, hors Settings) :
- Matrice Utilisateurs × Permissions (perm `core.user.audit_export`)
- Fiche utilisateur RGPD (1 sélection)

**Contexte `delegations`** :
- Registre des délégations actives
- Registre période complète (avec datepicker)
- Certificat de la délégation sélectionnée

### 9.4. Sous-onglet "Rôles" — enrichissements

- Toolbar : `ExportPdfMenu` à côté des filtres existants
- DataTable : colonne "État de la matrice" — Vert (selon seed), Orange (customisé), Gris (système immuable)
- Panel détail : bouton "Exporter cette fiche en PDF" ; rôles système avec badge "Système immuable" et édition disabled
- Modal création : select "Modèle de départ" pour pré-cocher perms d'un rôle existant
- Édition permissions : badge `RGPD` sur perms `sensitive=true` ; toast warning si combinaison crée violation SoD

### 9.5. Sous-onglet "Groupes" — enrichissements

- Toolbar : `ExportPdfMenu`
- Panel détail : colonne "Source des permissions" avec badge `role`/`group_override`/`user_override`/`delegation`
- Onglet Membres : indication "a aussi reçu N délégations actives qui ajoutent X permissions" + lien fiche PDF
- Mise à jour `RbacPermissionMatrix.tsx` : ajout de la source `delegation`

```typescript
export const SOURCE_BADGE = {
  user: { label: 'Utilisateur', color: 'red' },
  role: { label: 'Rôle', color: 'blue' },
  group: { label: 'Groupe', color: 'amber' },
  delegation: { label: 'Délégation', color: 'purple' },  // NOUVEAU
}
```

### 9.6. Sous-onglet "Permissions" — enrichissements

- Toolbar : `ExportPdfMenu` + switch "Inclure modules désactivés" (D3)
- Quand ON : permissions des modules désactivés grisées (`bg-slate-100`, opacity 60%, icône `EyeOff`)
- Colonne "Statut" : Actif / Inactif / Déprécié
- Bouton "Importer depuis CSV/XLSX" → `ImportWizard` target `rbac_role_permission`

### 9.7. Nouveau sous-onglet "Délégations" (`RbacDelegationsTab.tsx`)

**Section 1 — KPI cards** :
- Délégations actives (bleu)
- Expirent dans 7j (orange)
- Expirées 30j (gris)
- Révoquées 30j (rouge)

**Section 2 — Liste filtrable** :

DataTable colonnes :
- Délégant (avatar + nom + email)
- Délégué (avatar + nom + email)
- Période (start → end avec progress bar)
- Permissions (count + tooltip liste)
- Statut (badge : Actif/Programmée/Expirée/Révoquée)
- Raison (truncate + tooltip)
- Actions : Voir certificat PDF, Modifier, Révoquer

Filtres : statut, délégant, délégué, période, permission impliquée.

Bouton "+ Créer une délégation" → Modal wizard 3 steps :
1. Choisir un délégué (autocomplete users tenant)
2. Choisir les permissions (multi-select hiérarchique, filtré aux perms effectives du délégateur)
3. Période (datepicker) + Raison (textarea obligatoire)

Au submit : POST → toast + preview certificat PDF.

**Section 3 — Mes délégations** :
- Sans `core.delegation.read`
- Reçues (que je peux exercer)
- Données (que j'ai accordées)
- Boutons : Voir certificat, Révoquer (pour les données)

**Section 4 — Audit RBAC** (collapsable) :
- Tableau `rbac_audit_events` filtré `event_type LIKE 'delegation.%'`
- Bouton "Exporter registre PDF" (export #10)

### 9.8. Nouveau sous-onglet "Réglages" (`RbacSettingsTab.tsx`)

**Section 1 — Rôle par défaut à la création d'un user** :
- 3 selects (interne/externe/contact tiers) avec choix parmi 17 starters + "Aucun"
- Tooltip : "Quand un admin crée un utilisateur, ce rôle lui est attribué via le groupe 'Default {role}'"

**Section 2 — Réglages ISO délégations** :
- Slider durée max (1-730 jours, défaut 365)
- Toggle notification SECURITY_OFFICER (défaut on)
- Input seuil async (défaut 500)

**Section 3 — Mode de résolution RBAC** :
- Radio Restrictif (défaut) / Additif
- Description en clair de chaque mode
- Avertissement avant changement

**Section 4 — Audit & traçabilité** :
- Lien vers page Audit globale (filtre `category=rbac`)
- Bouton "Export journal d'audit RBAC (90j) en PDF"

### 9.9. Adaptation `DataTable`

`apps/main/src/components/ui/DataTable.tsx` :

```typescript
// Avant
export type ExportFormat = 'csv' | 'xlsx'

// Après
export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

interface DataTableProps {
  exportFormats?: ExportFormat[]
  pdfExports?: ExportItem[]  // si fourni, "pdf" ouvre ce menu
}
```

Quand `exportFormats=['csv', 'xlsx', 'pdf']` et `pdfExports=[...]`, l'icône export ouvre sous-menu : "CSV / XLSX / PDF →" et "PDF" déroule les items.

### 9.10. Indicateurs visuels

| Indicateur | Endroit | Visuel |
|---|---|---|
| Perm sensible RGPD | Listes de perms | Badge orange `RGPD` |
| Module désactivé | Toggle activé | `bg-slate-100`, opacity 60%, icône `EyeOff` |
| Rôle système immuable | Onglet Rôles | Badge gris `Système`, édition disabled |
| Rôle customisé vs seed | Colonne État | Vert/Orange/Gris |
| Source permission | Panel user/group | Badge coloré 4 valeurs |
| Conflit SoD | Édition rôle | Toast warning + icône ⚠️ |
| Délégation reçue active | Avatar user | Badge purple `+N` |
| Délégation près d'expirer | Liste délégations | Badge orange "Expire dans X jours" |

### 9.11. i18n UI

- Chaînes dans `apps/main/src/i18n/locales/{fr,en}/rbac.json`
- Clés structurées : `rbac.delegations.create.title`, `rbac.exports.pdf.role_matrix`, etc.

---

## 10. Audit trail, tests et roll-out

### 10.1. Modèle `RbacAuditEvent`

```python
# app/models/common.py

class RbacAuditEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "rbac_audit_events"
    __table_args__ = (
        Index("ix_rbac_audit_tenant_time", "tenant_id", "occurred_at"),
        Index("ix_rbac_audit_event_type", "event_type"),
        Index("ix_rbac_audit_actor", "actor_user_id"),
    )

    tenant_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("entities.id"), nullable=False, index=True
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target: Mapped[str | None] = mapped_column(String(200))
    params: Mapped[dict | None] = mapped_column(JSONB)
    result_summary: Mapped[dict | None] = mapped_column(JSONB)
    file_hash_sha256: Mapped[str | None] = mapped_column(String(64))
    actor_user_id: Mapped[PyUUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    client_ip: Mapped[str | None] = mapped_column(String(45))
    user_agent: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        String(20), default="success", server_default="success", nullable=False
    )
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_detail: Mapped[str | None] = mapped_column(Text)
```

#### Valeurs canoniques `event_type`

- `export.{matrix_role|matrix_group|matrix_user|role|group|user|role_modules|catalog|sod|delegations}`
- `import.{role_permission|group_override|user_group}`
- `delegation.{created|modified|revoked|expired}`
- `matrix.bootstrap` (migration phase 2)
- `role.{customized|reset_to_default}`
- `settings.{default_role_changed|delegation_config_changed|permission_mode_changed}`

#### Rétention

- Pas de purge automatique par défaut
- Setting `rbac.audit.retention_days` (défaut `null`), si défini, cron mensuel purge `occurred_at < now() - N days`
- Export CSV exhaustif possible via route dédiée

### 10.2. Stratégie de test (TDD)

| Niveau | Stack | Cible |
|---|---|---|
| Unit | `pytest` + mocks | Fonctions pures : 4ᵉ couche délégation, validation templates |
| Intégration | `pytest-asyncio` + PostgreSQL test | Routes API délégations, exports, imports |
| Migration tests | `pytest-alembic` (à ajouter) | Idempotence phase 1/2/3 |
| Rendu PDF | Snapshot tests WeasyPrint | Hash SHA-256 versionné par template + fixture |
| Frontend unit | Vitest + Testing Library | `ExportPdfMenu`, formulaires délégation |
| E2E | Playwright (existant) | Parcours admin : créer délégation → emails → certificat → audit |

### 10.3. Tests critiques (red flags must-have)

#### RBAC moteur (7 tests)
1. `test_delegation_layer_resolved_correctly`
2. `test_delegation_expired_no_longer_grants`
3. `test_sub_delegation_blocked`
4. `test_delegation_requires_effective_perms`
5. `test_user_override_revokes_delegation` (mode restrictive)
6. `test_max_duration_enforced`
7. `test_revoke_invalidates_cache`

#### Migrations (4 tests)
8. `test_migration_phase1_idempotent`
9. `test_migration_phase2_preserves_custom_role_perms`
10. `test_migration_phase2_resets_system_roles`
11. `test_migration_phase3_backfills_deprecated_codes`

#### Exports PDF (7 tests)
12. `test_export_role_matrix_pdf_renders`
13. `test_export_logs_audit_event`
14. `test_export_user_audit_requires_specific_permission`
15. `test_export_async_threshold_returns_202`
16. `test_export_includes_delegation_source_badge`
17. `test_disabled_module_grayed_when_included`
18. `test_export_lang_fr_en`

#### Délégations (4 tests)
19. `test_delegation_create_sends_2_emails_with_pdf_attachment`
20. `test_delegation_certificate_hash_in_audit`
21. `test_delegation_revoked_sends_email_to_both`
22. `test_delegation_expiry_cron_sends_j3_then_j0`

#### Imports (5 tests)
23. `test_import_role_permission_merge`
24. `test_import_role_permission_replace`
25. `test_import_validates_codes_exist`
26. `test_import_logs_audit`
27. `test_import_blocks_role_or_permission_creation`

#### UI E2E (3 tests)
28. `test_e2e_admin_creates_delegation_and_receives_emails`
29. `test_e2e_export_pdf_menu_displays_all_items_per_context`
30. `test_e2e_security_officer_can_revoke_but_not_create_delegation`

### 10.4. Plan de roll-out détaillé

#### Pré-requis

- Backup complet de la prod
- Communication aux tenants (email "Mise à jour matrice RBAC dans X jours")
- Tests unit + intégration verts
- Snapshot tests PDF validés visuellement par un humain
- Window de déploiement convenue (off-peak)

#### Séquence S1 (PR-A + PR-B)

1. Merge PR-A (migration phase 1 + endpoints sans templates)
2. Tests fumée staging
3. Merge PR-B (seed des templates)
4. Tests fumée + validation visuelle des 11 PDF
5. Déploiement production

#### Séquence S2 (PR-C + PR-D)

6. Merge PR-C (UI front)
7. Déploiement staging UAT
8. Corrections après UAT
9. Merge PR-D (migration phase 2) — **snapshot DB avant**
10. Déploiement staging PR-D, vérif SECURITY_OFFICER
11. Email aux TENANT_ADMIN auto
12. Déploiement production (window de maintenance)

#### Séquence S3 (PR-E + PR-F)

13. PR-E refactor backend
14. PR-F refactor frontend
15. Déploiement staging
16. Déploiement production

#### Séquence S4 (PR-G)

17. PR-G migration phase 3 — **backup DB**
18. Pre-flight check SQL (deprecated codes plus utilisés)
19. Déploiement production
20. Audit post-cleanup

### 10.5. Métriques de succès (30 jours post-PR-D)

| Métrique | Cible |
|---|---|
| Erreurs 403 RBAC | <0.1% |
| Erreurs 500 exports PDF | 0 |
| Latence p95 export matrice rôles | <3s sync |
| Délégations créées par tenant | ≥1 (preuve d'usage) |
| Tickets support "je ne peux pas X" | < baseline |
| Audit events RBAC | >10/jour/tenant actif |
| Taux réussite Playwright RBAC | 100% |

### 10.6. Risques et mitigations

| Risque | P | I | Mitigation |
|---|---|---|---|
| Permissions manquantes pour workflow non vu dans le code | M | M | UAT intensifs ; fallback `TENANT_ADMIN` temporaire |
| WeasyPrint plante sur grosse matrice | F | M | Snapshot tests + format paysage par module ; fallback 503 propre |
| Délégation accordée par erreur | M | H | Notif SECURITY_OFFICER on ; révocation 1-clic ; audit trail |
| Conflits SoD non détectés | F | M | Export #9 + alerte UI ; pas bloquant |
| Migration phase 3 supprime code utilisé | F | H | Pre-flight obligatoire ; backup ; rollback documenté |
| Charge Redis cache 4ᵉ layer | F | F | TTL 5min suffit ; mesurer p95 |
| Templates EN mal traduits | M | M | Revue par traducteur natif ou tenant pilote anglophone |

### 10.7. Documentation à produire

| Doc | Audience | Contenu |
|---|---|---|
| `docs/developer/rbac.md` | Devs | Convention, comment ajouter une perm |
| `docs/developer/rbac-pdf-templates.md` | Devs FE/BE | Comment créer un template système |
| `docs/enduser/rbac-administration.md` | TENANT_ADMIN | Guide UI RBAC, FAQ |
| `docs/enduser/rbac-delegations.md` | Tous users | Créer/recevoir délégation, garanties ISO |
| `docs/enduser/rbac-iso-compliance.md` | Auditeurs | Contrôles ISO 27001 par élément |
| PDF matrice par défaut | Tous | Généré par export #1 sur tenant vierge, livré dans git |

### 10.8. Récap final

| Catégorie | Compteur |
|---|---|
| Rôles seedés | **20** |
| Permissions seedées | **~150** |
| Liaisons `role_permissions` | **~1200** |
| Settings tenant ajoutés | **6** |
| Endpoints API nouveaux | **22** |
| Templates PDF système | **22 versions** |
| Templates email système | **8 versions** |
| Tables nouvelles | **1** (`rbac_audit_events`) |
| Migrations alembic | **4** |
| Composants frontend nouveaux | **3** |
| Tests à écrire | **~30 + 3 e2e** |
| Sprints estimés | **4** |

---

## 11. Annexes

### Annexe A — Mapping exhaustif des codes (old → new)

Le mapping ci-dessous est exécuté en migration phase 3 (`172_rbac_bootstrap_phase3_cleanup.py`).

| Ancien code | Nouveau code | Note |
|---|---|---|
| `admin.system` | `system.platform.admin` | |
| `admin.users.read` | `system.user.read` | Cross-tenant |
| `admin.users.create` | `system.user.create` | Cross-tenant |
| `role.manage` | `core.rbac.manage` | doublon migration 001 |
| `audit.read` | `core.audit.read` | doublon migration 001 |
| `user.read` | `core.user.read` | |
| `user.create` | `core.user.create` | |
| `user.update` | `core.user.update` | |
| `user.delete` | `core.user.delete` | |
| `entity.read` | `core.entity.read` | doublon |
| `entity.manage` | `core.entity.update` | |
| `setting.read` | `core.setting.read` | |
| `setting.write` | `core.setting.update` | |
| `core.settings.manage` | `core.setting.manage` | singularisé |
| `core.users.manage` | `core.user.manage` | singularisé |
| `core.integrations.manage` | `core.integration.manage` | singularisé |
| `notification.read` | `core.notification.read` | |
| `asset.read` | `asset.asset.read` | duplication namespace |
| `asset.create` | `asset.asset.create` | |
| `asset.update` | `asset.asset.update` | |
| `asset.delete` | `asset.asset.delete` | |
| `tier.read` | `tier.tier.read` | |
| `tier.create` | `tier.tier.create` | |
| `tier.update` | `tier.tier.update` | |
| `tier.delete` | `tier.tier.delete` | |
| `document.read` | `papyrus.document.read` | namespacé |
| `document.create` | `papyrus.document.create` | |
| `document.edit` | `papyrus.document.update` | normalisation verbe |
| `document.delete` | `papyrus.document.delete` | |
| `document.submit` | `papyrus.document.submit` | |
| `document.approve` | `papyrus.document.approve` | |
| `document.reject` | `papyrus.document.reject` | |
| `document.publish` | `papyrus.document.publish` | |
| `document.share` | `papyrus.document.share` | |
| `document.admin` | `papyrus.document.manage` | normalisation |
| `template.create` | `papyrus.template.create` | |
| `template.edit` | `papyrus.template.update` | |
| `moc.read` | `moc.change.read` | |
| `moc.create` | `moc.change.create` | |
| `moc.update` | `moc.change.update` | |
| `moc.delete` | `moc.change.delete` | |
| `moc.transition` | `moc.change.transition` | |
| `moc.validate` | `moc.change.validate` | |
| `moc.promote` | `moc.change.approve` | renommage cohérence |
| `moc.production.validate` | `moc.change.production_validate` | action composée |
| `moc.manage` | `moc.change.manage` | |
| `paxlog.credtype.manage` | `paxlog.credential_type.manage` | déshortage |
| `paxlog.stay.create` | `paxlog.stay_program.create` | déshortage |
| `pid.read` | `pid.diagram.read` | |
| `pid.create` | `pid.diagram.create` | |
| `pid.edit` | `pid.diagram.update` | |
| `pid.admin` | `pid.diagram.manage` | |
| `pid.export` | `pid.diagram.export` | |
| `pid.validate_afc` | `pid.diagram.validate_afc` | |
| `pid.equipment.edit` | `pid.equipment.update` | |
| `pid.library.edit` | `pid.library.update` | |
| `pid.tags.edit` | `pid.tag.update` | singularisé |
| `pid.tags.read` | `pid.tag.read` | |
| `conformite.check` | `conformite.record.check` | resource explicite |
| `conformite.verify` | `conformite.record.verify` | |
| `teams.read` | `teams.team.read` | |
| `teams.create` | `teams.team.create` | |
| `teams.update` | `teams.team.update` | |
| `teams.delete` | `teams.team.delete` | |
| `cost_center.create` | `imputation.cost_center.create` | rattaché à imputation |
| `cost_center.update` | `imputation.cost_center.update` | |
| `cost_center.delete` | `imputation.cost_center.delete` | |
| `department.create` | `imputation.department.create` | |
| `department.update` | `imputation.department.update` | |
| `department.delete` | `imputation.department.delete` | |
| `dashboard.read` | `dashboard.dashboard.read` | |
| `dashboard.customize` | `dashboard.dashboard.customize` | |
| `dashboard.admin` | `dashboard.dashboard.manage` | |

Permissions nouvelles créées (~20) :
- `system.tenant.read`, `system.tenant.create`, `system.tenant.update`
- `system.audit.cross_tenant_read`
- `core.rbac.export`
- `core.user.audit_export`
- `core.delegation.read`, `core.delegation.create`, `core.delegation.manage`, `core.delegation.revoke`
- `asset.installation.read`, `asset.installation.update`
- `asset.field.read`
- `paxlog.signalement.create`
- `mcp.gateway.manage`, `mcp.token.create`, `mcp.agent.execute`

Note : `workflow.instance.transition` existe déjà conforme dans le code, pas besoin de le créer.

### Annexe B — Matrice détaillée rôle × permission

**Statut** : la traduction des vues 5.A/5.B/5.C (niveau "module + niveau d'accès") en liaisons atomiques (`role_code` → liste explicite de `permission_code`) est un **livrable de la phase d'implémentation**, produit par le plan en sortie de `writing-plans`.

**Pourquoi pas dans le spec** : la matrice atomique fait ~1200 liaisons, contiendrait beaucoup de bruit syntaxique, et serait redondante avec les vues 5.A/B/C qui expriment la même information de manière compacte et révisable. Le passage de la vue à la matrice est une transformation mécanique guidée par les conventions suivantes :

- `R` sur un namespace = toutes les permissions `<ns>.*.read`
- `RW` = `R` + `<ns>.*.create` + `<ns>.*.update` + `<ns>.*.delete`
- `RWS` = `RW` + `<ns>.*.submit`
- `RWA` = `RWS` + `<ns>.*.approve` + `<ns>.*.validate`
- `MGR` = toutes les permissions `<ns>.*.manage` + actions usuelles
- `*` = toutes les permissions du namespace

Le plan d'implémentation expandera ces conventions en liaisons explicites, en validant chaque liaison contre la liste des ~150 permissions seedées.

Format final : Python dict dans la migration phase 2. Structure :

```python
ROLE_PERMISSIONS_MATRIX = {
    'PLATFORM_ADMIN': ['*'],
    'TENANT_ADMIN': "SELECT code FROM permissions WHERE code NOT LIKE 'system.%'",
    'SECURITY_OFFICER': [
        # core
        'core.rbac.read', 'core.rbac.export',
        'core.audit.read', 'core.user.audit_export',
        'core.delegation.read', 'core.delegation.revoke',
        'core.user.read', 'core.entity.read', 'core.setting.read',
        'core.integration.read', 'core.notification.read',
        # tous les *.read des modules
        'asset.asset.read', 'asset.installation.read', 'asset.field.read',
        'tier.tier.read', 'tier.contact.read',
        'papyrus.document.read', 'papyrus.template.read', 'papyrus.form.read',
        'moc.change.read', 'moc.validator.read',
        'planner.activity.read', 'planner.capacity.read', 'planner.conflict.read',
        'paxlog.ads.read', 'paxlog.profile.read', 'paxlog.credential.read',
        'paxlog.compliance.read', 'paxlog.signalement.read', 'paxlog.incident.read',
        'packlog.cargo.read',
        'travelwiz.boarding.read', 'travelwiz.tracking.read',
        'pid.diagram.read', 'pid.equipment.read', 'pid.tag.read', 'pid.library.read',
        'conformite.record.read', 'conformite.rule.read', 'conformite.type.read',
        'conformite.exemption.read', 'conformite.transfer.read',
        'conformite.verification.read', 'conformite.job_position.read',
        'imputation.imputation.read', 'imputation.cost_center.read', 'imputation.department.read',
        'dashboard.dashboard.read',
        'workflow.definition.read', 'workflow.instance.read',
        'messaging.announcement.read', 'messaging.login_event.read', 'messaging.security_rule.read',
        'support.ticket.read',
        'teams.team.read', 'teams.member.read',
        'report.report.read',
    ],
    'DO': [
        # Vision globale, approbations top-level
        'core.rbac.read', 'core.user.read', 'core.entity.read', 'core.audit.read',
        'core.notification.read', 'core.delegation.read', 'core.delegation.create',
        'asset.asset.read', 'tier.tier.read',
        'papyrus.document.read', 'papyrus.document.approve', 'papyrus.template.read',
        'moc.change.read', 'moc.change.approve', 'moc.change.transition',
        'planner.activity.read', 'planner.activity.approve',
        'paxlog.ads.read', 'paxlog.ads.approve', 'paxlog.profile.read', 'paxlog.compliance.read',
        'packlog.cargo.read', 'travelwiz.boarding.read', 'travelwiz.tracking.read',
        'pid.diagram.read', 'conformite.record.read', 'conformite.exemption.read',
        'imputation.imputation.read',
        'dashboard.dashboard.read',
        'workflow.definition.read', 'workflow.instance.read',
        'support.ticket.read', 'teams.team.read',
    ],
    # ... 17 autres rôles, détail à écrire dans le plan (writing-plans)
}
```

Note : la matrice complète sera **générée pendant la phase d'implémentation** par le plan, à partir du croisement entre les vues 5.A/5.B/5.C et la liste exhaustive des 150 permissions.

### Annexe C — Variables_schema des templates PDF

Exemple pour `core.rbac.matrix_role_permissions` :

```json
{
  "type": "object",
  "properties": {
    "tenant": {
      "type": "object",
      "properties": {
        "id": {"type": "string"},
        "name": {"type": "string"},
        "logo_url": {"type": "string", "nullable": true}
      },
      "required": ["id", "name"]
    },
    "roles": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "code": {"type": "string"},
          "name": {"type": "string"},
          "description": {"type": "string"}
        }
      }
    },
    "permissions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "code": {"type": "string"},
          "name": {"type": "string"},
          "module": {"type": "string"},
          "sensitive": {"type": "boolean"},
          "module_disabled": {"type": "boolean"}
        }
      }
    },
    "grants": {
      "type": "object",
      "description": "Tuple (role_code, perm_code) → bool"
    },
    "modules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "namespace": {"type": "string"},
          "label": {"type": "string"},
          "permissions": {"type": "array"},
          "disabled_in_tenant": {"type": "boolean"}
        }
      }
    },
    "generated_at": {"type": "string", "format": "date-time"},
    "generated_by": {"type": "object"},
    "audit_event_id": {"type": "string"},
    "content_hash": {"type": "string"}
  },
  "required": ["tenant", "roles", "permissions", "grants", "modules", "generated_at", "generated_by"]
}
```

Les schémas des 10 autres templates suivent la même structure et sont à produire pendant l'implémentation.

### Annexe D — Settings tenant créés

| Clé | Valeur défaut | Description |
|---|---|---|
| `rbac.default_role.internal` | `"READER"` | Rôle par défaut pour user_type=internal |
| `rbac.default_role.external` | `"PAX"` | Rôle par défaut pour user_type=external |
| `rbac.default_role.tier_contact` | `"TIER_CONTACT"` | Rôle par défaut pour les contacts tiers |
| `rbac.delegation.max_duration_days` | `365` | Durée max d'une délégation |
| `rbac.delegation.notify_security_officer` | `true` | CC le SECURITY_OFFICER sur les emails de délégation |
| `rbac.export.async_threshold_users` | `500` | Bascule en async si export dépasse N users |
| `rbac.audit.retention_days` | `null` | Si défini, purge mensuelle des audit events plus anciens |
| `rbac.bootstrap.email_admins_on_migration` | `true` | Email aux TENANT_ADMIN sur migration phase 2 |

### Annexe E — Fichiers de code touchés (récap)

#### Backend

- `app/core/rbac.py` — ajout 4ᵉ couche délégation
- `app/api/deps.py` — RAS (existant suffisant)
- `app/api/routes/core/rbac/exports.py` — **NOUVEAU**
- `app/api/routes/core/rbac/delegations.py` — **NOUVEAU**
- `app/api/routes/core/rbac/defaults.py` — **NOUVEAU**
- `app/api/routes/core/import_assistant.py` — ajouter 3 targets dans `_PERMISSION_MAP`
- `app/services/modules/rbac_import_service.py` — **NOUVEAU**
- `app/services/core/rbac_export_service.py` — **NOUVEAU** (helpers de construction des variables)
- `app/services/core/rbac_delegation_service.py` — **NOUVEAU**
- `app/models/common.py` — ajout `RbacAuditEvent`, extension `Permission` (namespace, resource, action, deprecated, sensitive), ajout `Entity.logo_url`
- `app/core/pdf_templates.py` — ajout helper `_build_translator`
- `app/tasks/scheduler.py` — ajout cron expiration délégations (J-3 et J0)
- Toutes les routes existantes : refactor `require_permission(old)` → `require_permission(new)` en phase E

#### Frontend

- `apps/main/src/components/shared/ExportPdfMenu.tsx` — **NOUVEAU**
- `apps/main/src/pages/settings/tabs/RbacAdminTab.tsx` — modif (5 sous-onglets)
- `apps/main/src/pages/settings/tabs/RbacPermissionMatrix.tsx` — ajout source `delegation`
- `apps/main/src/pages/settings/tabs/RbacDelegationsTab.tsx` — **NOUVEAU**
- `apps/main/src/pages/settings/tabs/RbacSettingsTab.tsx` — **NOUVEAU**
- `apps/main/src/components/ui/DataTable.tsx` — extension `ExportFormat`
- `apps/main/src/services/rbacService.ts` — nouveaux endpoints
- `apps/main/src/hooks/useRbac.ts` — nouveaux hooks (délégations, exports)
- `apps/main/src/i18n/locales/{fr,en}/rbac.json` — chaînes nouvelles
- Refactor des checks de permission UI en phase F

#### Migrations alembic

- `alembic/versions/170_rbac_bootstrap_phase1_additive.py` — **NOUVEAU**
- `alembic/versions/171_rbac_bootstrap_phase2_backfill.py` — **NOUVEAU**
- `alembic/versions/172_rbac_bootstrap_phase3_cleanup.py` — **NOUVEAU**
- `alembic/versions/173_rbac_seed_pdf_email_templates.py` — **NOUVEAU**

#### Templates statiques

- `app/static/rbac_pdf_templates/` — **NOUVEAU**, ~50 fichiers HTML (11 templates × 2 langues × 3 sections + partials)
- `app/static/rbac_email_templates/` — **NOUVEAU**, 8 fichiers HTML (4 templates × 2 langues)

#### Tests

- `tests/test_rbac_delegation.py` — **NOUVEAU**
- `tests/test_rbac_exports.py` — **NOUVEAU**
- `tests/test_rbac_imports.py` — **NOUVEAU**
- `tests/test_rbac_migrations.py` — **NOUVEAU** (pytest-alembic)
- `tests/test_rbac_pdf_snapshots.py` — **NOUVEAU**
- `test-e2e/rbac.spec.ts` — **NOUVEAU**

---

**FIN DU SPEC**
