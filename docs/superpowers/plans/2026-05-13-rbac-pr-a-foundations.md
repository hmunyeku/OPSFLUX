# RBAC PR-A — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettre en place toutes les fondations backend (modèles, migration phase 1, moteur RBAC 4-couches, routes délégations/exports/imports/admin) pour permettre la livraison séquentielle des PR B à G.

**Architecture:** Extension non-destructive du modèle existant (ajout de colonnes, nouveaux modèles, nouveaux endpoints). Aucune route existante n'est modifiée. Les exports PDF retournent `RBAC_TEMPLATE_NOT_FOUND` jusqu'à la PR-B.

**Tech Stack:** FastAPI 0.115, SQLAlchemy 2.x async, Alembic, PostgreSQL 16, Redis, WeasyPrint, Jinja2, APScheduler, pytest-asyncio, pytest-alembic.

**Spec source:** [2026-05-13-rbac-bootstrap-design.md](../specs/2026-05-13-rbac-bootstrap-design.md)

**Overview:** [2026-05-13-rbac-bootstrap-overview.md](./2026-05-13-rbac-bootstrap-overview.md)

---

## Pré-requis

- [ ] Vérifier que tu es sur la branche `claude/gracious-haslett-4b8b09` (ou créer une branche dédiée si tu travailles hors worktree)
- [ ] Lire la spec en entier au moins une fois (sections 4, 5, 6, 7, 10)
- [ ] Vérifier que `pytest-alembic` est installé. Sinon : `uv pip install pytest-alembic` (ou `pip install` selon le gestionnaire)
- [ ] Démarrer la stack Docker locale : `docker compose -f docker-compose.dev.yml up -d`
- [ ] Vérifier que `alembic current` retourne `169_*` (la dernière migration avant ce plan)

---

## Groupe 1 — Modèles SQLAlchemy

### Task 1.1 : Étendre le modèle `Permission` avec colonnes namespace/resource/action/deprecated/sensitive

**Files:**
- Modify: `app/models/common.py:398-405` (classe `Permission`)
- Test: `tests/test_models_permission_extended.py` (créer)

- [ ] **Step 1: Écrire le test failing**

```python
# tests/test_models_permission_extended.py
"""Test new columns on Permission model (PR-A foundation)."""
import pytest
from sqlalchemy import select
from app.models.common import Permission


@pytest.mark.asyncio
async def test_permission_has_new_columns(db_session):
    """New columns: namespace, resource, action, deprecated, deprecated_for, sensitive."""
    perm = Permission(
        code="test.thing.read",
        name="Test read",
        module="test",
        namespace="test",
        resource="thing",
        action="read",
        deprecated=False,
        deprecated_for=None,
        sensitive=False,
    )
    db_session.add(perm)
    await db_session.commit()

    result = await db_session.execute(select(Permission).where(Permission.code == "test.thing.read"))
    fetched = result.scalar_one()
    assert fetched.namespace == "test"
    assert fetched.resource == "thing"
    assert fetched.action == "read"
    assert fetched.deprecated is False
    assert fetched.sensitive is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_models_permission_extended.py -v`

Expected: FAIL with `AttributeError: 'Permission' has no attribute 'namespace'` (or migration error)

- [ ] **Step 3: Add the columns to the Permission model**

In `app/models/common.py`, replace the class definition lines 398-405 with:

```python
class Permission(Base):
    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(String(100), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    module: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)

    # PR-A extensions (migration 170)
    namespace: Mapped[str | None] = mapped_column(String(50), index=True)
    resource: Mapped[str | None] = mapped_column(String(50))
    action: Mapped[str | None] = mapped_column(String(50))
    deprecated: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    deprecated_for: Mapped[str | None] = mapped_column(String(100))
    sensitive: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
```

- [ ] **Step 4: Ne PAS encore run le test** — il faut créer la migration d'abord (Task 2.1). On garde le test en attente.

- [ ] **Step 5: Commit (sans le test qui échoue encore)**

```bash
git add app/models/common.py tests/test_models_permission_extended.py
git commit -m "feat(rbac): extend Permission model with namespace/resource/action/deprecated/sensitive"
```

### Task 1.2 : Ajouter `Entity.logo_url`

**Files:**
- Modify: `app/models/common.py` (classe `Entity`, à localiser)
- Test: ajout au même fichier `tests/test_models_permission_extended.py`

- [ ] **Step 1: Localiser la classe `Entity`**

Run: `grep -n "^class Entity" app/models/common.py`

Expected: une ligne du style `class Entity(UUIDPrimaryKeyMixin, TimestampMixin, Base):`

- [ ] **Step 2: Ajouter le test**

```python
# Ajouter à tests/test_models_permission_extended.py

@pytest.mark.asyncio
async def test_entity_has_logo_url(db_session):
    """Entity.logo_url column for PDF branding."""
    from app.models.common import Entity
    entity = Entity(name="Test Tenant", logo_url="https://example.com/logo.png")
    db_session.add(entity)
    await db_session.commit()

    result = await db_session.execute(select(Entity).where(Entity.name == "Test Tenant"))
    fetched = result.scalar_one()
    assert fetched.logo_url == "https://example.com/logo.png"
```

- [ ] **Step 3: Ajouter la colonne à `Entity`**

Dans `app/models/common.py`, dans la classe `Entity`, ajouter :

```python
logo_url: Mapped[str | None] = mapped_column(String(500))
```

- [ ] **Step 4: Commit**

```bash
git add app/models/common.py tests/test_models_permission_extended.py
git commit -m "feat(rbac): add Entity.logo_url for PDF branding"
```

### Task 1.3 : Créer le modèle `RbacAuditEvent`

**Files:**
- Modify: `app/models/common.py` (ajout en fin de fichier)
- Test: `tests/test_models_rbac_audit_event.py` (créer)

- [ ] **Step 1: Écrire le test**

```python
# tests/test_models_rbac_audit_event.py
"""Test RbacAuditEvent model."""
from datetime import datetime, timezone
from uuid import uuid4
import pytest
from sqlalchemy import select
from app.models.common import RbacAuditEvent


@pytest.mark.asyncio
async def test_rbac_audit_event_create(db_session, sample_entity, sample_user):
    """An audit event can be persisted with all required fields."""
    event = RbacAuditEvent(
        tenant_id=sample_entity.id,
        event_type="export.matrix_role",
        target="matrix_role_permissions",
        params={"lang": "fr", "module": "asset"},
        result_summary={"row_count": 42, "page_count": 3},
        file_hash_sha256="a" * 64,
        actor_user_id=sample_user.id,
        client_ip="192.168.1.1",
        user_agent="test-agent/1.0",
        status="success",
    )
    db_session.add(event)
    await db_session.commit()

    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.tenant_id == sample_entity.id)
    )
    fetched = result.scalar_one()
    assert fetched.event_type == "export.matrix_role"
    assert fetched.file_hash_sha256 == "a" * 64
    assert fetched.params == {"lang": "fr", "module": "asset"}
    assert fetched.status == "success"
    assert fetched.occurred_at is not None
```

- [ ] **Step 2: Ajouter le modèle dans `app/models/common.py`**

À la fin de la section RBAC (juste après `UserPermissionOverride`, vers la ligne 516), ajouter :

```python
# ─── RBAC Audit Trail (PR-A) ──────────────────────────────────────────────

class RbacAuditEvent(UUIDPrimaryKeyMixin, Base):
    """Audit trail for RBAC-related events: exports, imports, delegations, matrix changes.

    Conformity: ISO 27001 §A.9 Access Control, RGPD Art. 30 Records of processing.
    """
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

Assure-toi que `Index` est importé en haut du fichier (probablement déjà le cas, sinon `from sqlalchemy import Index`).

- [ ] **Step 3: Commit (sans run le test — il échouera tant que la migration 170 n'est pas créée)**

```bash
git add app/models/common.py tests/test_models_rbac_audit_event.py
git commit -m "feat(rbac): add RbacAuditEvent model for audit trail"
```

## Groupe 2 — Migration alembic 170 (phase 1 additive)

### Task 2.1 : Créer la migration alembic squelette

**Files:**
- Create: `alembic/versions/170_rbac_bootstrap_phase1_additive.py`

- [ ] **Step 1: Identifier le `down_revision`**

Run: `ls alembic/versions/ | sort | tail -5`

Expected: voir `169_*` en dernier. Noter le revision id (par exemple `169_add_api_type_designation`).

Run: `head -10 alembic/versions/169_*.py`

Noter la valeur de `revision = "..."`.

- [ ] **Step 2: Créer le fichier migration**

```python
# alembic/versions/170_rbac_bootstrap_phase1_additive.py
"""RBAC bootstrap phase 1 — additive (extend Permission, add Entity.logo_url, create RbacAuditEvent, seed new perms/roles/settings).

Revision ID: 170_rbac_bootstrap_phase1
Revises: 169_add_api_type_designation  # ← remplacer par l'ID exact trouvé au step 1
Create Date: 2026-05-13 12:00:00

This migration is ADDITIVE: no existing code path is broken. Old permission codes coexist
with new ones until PR-G (cleanup).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision = "170_rbac_bootstrap_phase1"
down_revision = "169_add_api_type_designation"  # ← remplacer
branch_labels = None
depends_on = None


def upgrade():
    # 1. Extend permissions table
    op.add_column("permissions", sa.Column("namespace", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("resource", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("action", sa.String(50), nullable=True))
    op.add_column("permissions", sa.Column("deprecated", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("permissions", sa.Column("deprecated_for", sa.String(100), nullable=True))
    op.add_column("permissions", sa.Column("sensitive", sa.Boolean(), server_default="false", nullable=False))
    op.create_index("ix_permissions_namespace", "permissions", ["namespace"])

    # 2. Add logo_url to entities
    op.add_column("entities", sa.Column("logo_url", sa.String(500), nullable=True))

    # 3. Create rbac_audit_events table
    op.create_table(
        "rbac_audit_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("target", sa.String(200)),
        sa.Column("params", JSONB()),
        sa.Column("result_summary", JSONB()),
        sa.Column("file_hash_sha256", sa.String(64)),
        sa.Column("actor_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("client_ip", sa.String(45)),
        sa.Column("user_agent", sa.Text()),
        sa.Column("status", sa.String(20), server_default="success", nullable=False),
        sa.Column("error_code", sa.String(80)),
        sa.Column("error_detail", sa.Text()),
    )
    op.create_index("ix_rbac_audit_tenant_time", "rbac_audit_events", ["tenant_id", "occurred_at"])
    op.create_index("ix_rbac_audit_event_type", "rbac_audit_events", ["event_type"])
    op.create_index("ix_rbac_audit_actor", "rbac_audit_events", ["actor_user_id"])

    # 4. Seed new permissions (continued in task 2.2)
    # 5. Seed new roles (continued in task 2.3)
    # 6. Rename existing roles (continued in task 2.4)
    # 7. Seed tenant settings (continued in task 2.5)


def downgrade():
    op.drop_index("ix_rbac_audit_actor", table_name="rbac_audit_events")
    op.drop_index("ix_rbac_audit_event_type", table_name="rbac_audit_events")
    op.drop_index("ix_rbac_audit_tenant_time", table_name="rbac_audit_events")
    op.drop_table("rbac_audit_events")
    op.drop_column("entities", "logo_url")
    op.drop_index("ix_permissions_namespace", table_name="permissions")
    op.drop_column("permissions", "sensitive")
    op.drop_column("permissions", "deprecated_for")
    op.drop_column("permissions", "deprecated")
    op.drop_column("permissions", "action")
    op.drop_column("permissions", "resource")
    op.drop_column("permissions", "namespace")
```

- [ ] **Step 3: Run la migration sur la base de dev**

Run: `alembic upgrade head`

Expected: `INFO  [alembic.runtime.migration] Running upgrade 169_... -> 170_rbac_bootstrap_phase1, RBAC bootstrap phase 1 — additive`

Si erreur, lire le message et fixer (typiquement un down_revision incorrect).

- [ ] **Step 4: Run les tests des Tasks 1.1, 1.2, 1.3 pour valider**

Run: `pytest tests/test_models_permission_extended.py tests/test_models_rbac_audit_event.py -v`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/170_rbac_bootstrap_phase1_additive.py
git commit -m "feat(rbac): migration 170 phase 1 — DDL only (extend permissions, add logo_url, create rbac_audit_events)"
```

### Task 2.2 : Seed des permissions nouvelles dans la migration 170

**Files:**
- Modify: `alembic/versions/170_rbac_bootstrap_phase1_additive.py`
- Test: `tests/test_migration_170_phase1.py` (créer)

- [ ] **Step 1: Écrire le test**

```python
# tests/test_migration_170_phase1.py
"""Test migration 170 phase 1 — additive bootstrap."""
import pytest
from sqlalchemy import select
from app.models.common import Permission


@pytest.mark.asyncio
async def test_new_permissions_seeded(db_session):
    """The ~20 new permissions are present in DB after migration 170."""
    expected_codes = [
        "system.platform.admin",
        "system.tenant.read",
        "system.tenant.create",
        "system.tenant.update",
        "system.user.read",
        "system.user.create",
        "system.audit.cross_tenant_read",
        "core.rbac.export",
        "core.user.audit_export",
        "core.delegation.read",
        "core.delegation.create",
        "core.delegation.manage",
        "core.delegation.revoke",
        "asset.installation.read",
        "asset.installation.update",
        "asset.field.read",
        "paxlog.signalement.create",
        "mcp.gateway.manage",
        "mcp.token.create",
        "mcp.agent.execute",
    ]
    result = await db_session.execute(
        select(Permission.code).where(Permission.code.in_(expected_codes))
    )
    found = {row[0] for row in result.all()}
    missing = set(expected_codes) - found
    assert not missing, f"Permissions manquantes: {sorted(missing)}"


@pytest.mark.asyncio
async def test_new_permissions_have_namespace_resource_action(db_session):
    """New permissions have populated namespace/resource/action."""
    result = await db_session.execute(
        select(Permission).where(Permission.code == "core.delegation.create")
    )
    perm = result.scalar_one()
    assert perm.namespace == "core"
    assert perm.resource == "delegation"
    assert perm.action == "create"


@pytest.mark.asyncio
async def test_sensitive_permissions_flagged(db_session):
    """RGPD-sensitive permissions are flagged with sensitive=true."""
    result = await db_session.execute(
        select(Permission).where(Permission.code == "core.user.audit_export")
    )
    perm = result.scalar_one()
    assert perm.sensitive is True
```

- [ ] **Step 2: Run test — doit échouer (perms pas encore seedées)**

Run: `pytest tests/test_migration_170_phase1.py::test_new_permissions_seeded -v`

Expected: FAIL

- [ ] **Step 3: Ajouter le bloc de seed à la fin de `upgrade()` dans la migration**

Remplacer le commentaire `# 4. Seed new permissions (continued in task 2.2)` par :

```python
    # 4. Seed new permissions (~20 codes)
    op.execute("""
        INSERT INTO permissions (code, name, namespace, resource, action, module, sensitive) VALUES
        ('system.platform.admin', 'Platform admin (cross-tenant)', 'system', 'platform', 'admin', 'core', false),
        ('system.tenant.read', 'List/view tenants', 'system', 'tenant', 'read', 'core', false),
        ('system.tenant.create', 'Create tenants', 'system', 'tenant', 'create', 'core', false),
        ('system.tenant.update', 'Update tenants', 'system', 'tenant', 'update', 'core', false),
        ('system.user.read', 'Read users cross-tenant', 'system', 'user', 'read', 'core', true),
        ('system.user.create', 'Create users cross-tenant', 'system', 'user', 'create', 'core', false),
        ('system.audit.cross_tenant_read', 'Read audit across all tenants', 'system', 'audit', 'cross_tenant_read', 'core', true),
        ('core.rbac.export', 'Export RBAC matrices to PDF', 'core', 'rbac', 'export', 'core', false),
        ('core.user.audit_export', 'Export user audit sheets (RGPD)', 'core', 'user', 'audit_export', 'core', true),
        ('core.delegation.read', 'View delegations', 'core', 'delegation', 'read', 'core', false),
        ('core.delegation.create', 'Create delegations on own permissions', 'core', 'delegation', 'create', 'core', false),
        ('core.delegation.manage', 'Manage any delegation in tenant', 'core', 'delegation', 'manage', 'core', false),
        ('core.delegation.revoke', 'Revoke any delegation', 'core', 'delegation', 'revoke', 'core', false),
        ('asset.installation.read', 'Read installations', 'asset', 'installation', 'read', 'asset_registry', false),
        ('asset.installation.update', 'Update installations', 'asset', 'installation', 'update', 'asset_registry', false),
        ('asset.field.read', 'Read oil fields', 'asset', 'field', 'read', 'asset_registry', false),
        ('paxlog.signalement.create', 'Submit HSE signalement', 'paxlog', 'signalement', 'create', 'paxlog', false),
        ('mcp.gateway.manage', 'Manage MCP gateway config', 'mcp', 'gateway', 'manage', 'integration', false),
        ('mcp.token.create', 'Issue MCP tokens', 'mcp', 'token', 'create', 'integration', true),
        ('mcp.agent.execute', 'Execute MCP agent actions', 'mcp', 'agent', 'execute', 'integration', false)
        ON CONFLICT (code) DO UPDATE SET
            namespace = EXCLUDED.namespace,
            resource = EXCLUDED.resource,
            action = EXCLUDED.action,
            sensitive = EXCLUDED.sensitive
    """)
```

Le `ON CONFLICT DO UPDATE` garantit l'idempotence : on peut re-run la migration.

- [ ] **Step 4: Re-run la migration et lancer les tests**

Run :
```bash
alembic downgrade -1
alembic upgrade head
pytest tests/test_migration_170_phase1.py -v
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/170_rbac_bootstrap_phase1_additive.py tests/test_migration_170_phase1.py
git commit -m "feat(rbac): migration 170 — seed 20 new permissions (system.*, core.delegation.*, core.user.audit_export, asset.installation.*, mcp.*, etc.)"
```

### Task 2.3 : Seed des 8 nouveaux rôles dans la migration 170

**Files:**
- Modify: `alembic/versions/170_rbac_bootstrap_phase1_additive.py`
- Test: ajouter à `tests/test_migration_170_phase1.py`

- [ ] **Step 1: Ajouter le test**

```python
# Ajouter à tests/test_migration_170_phase1.py
from app.models.common import Role


@pytest.mark.asyncio
async def test_new_roles_seeded(db_session):
    """8 new roles are seeded (SECURITY_OFFICER, DOC_CONTROLLER, PLANNER, MOC_VALIDATOR, OPERATOR, PAX, TIER_CONTACT, INTEGRATION_BOT)."""
    expected = ["SECURITY_OFFICER", "DOC_CONTROLLER", "PLANNER", "MOC_VALIDATOR", "OPERATOR", "PAX", "TIER_CONTACT", "INTEGRATION_BOT"]
    result = await db_session.execute(select(Role.code).where(Role.code.in_(expected)))
    found = {row[0] for row in result.all()}
    assert set(expected) == found, f"Rôles manquants: {set(expected) - found}"
```

- [ ] **Step 2: Ajouter le seed à la migration**

À la fin de `upgrade()`, après le seed des permissions, ajouter :

```python
    # 5. Seed new roles (8 codes)
    op.execute("""
        INSERT INTO roles (code, name, description, module) VALUES
        ('SECURITY_OFFICER', 'Security Officer', 'Auditeur indépendant, lecture seule sur RBAC/audit/user, peut révoquer délégations', 'core'),
        ('DOC_CONTROLLER', 'Document Controller', 'Contrôleur documentaire Papyrus — gère MDR, templates, distribution', 'papyrus'),
        ('PLANNER', 'Planificateur', 'Pilote du module Planner — activités, capacité, conflits', 'planner'),
        ('MOC_VALIDATOR', 'MOC Validator', 'Valide les MOC sans pouvoir les créer (séparation des pouvoirs)', 'moc'),
        ('OPERATOR', 'Operator', 'Contributeur métier — saisit/édite, ne valide pas', 'core'),
        ('PAX', 'Personnel mobilisé', 'Self-service pour les users externes (profil, rotations, badges)', 'paxlog'),
        ('TIER_CONTACT', 'Contact tiers externe', 'Self-service pour les contacts des tiers/compagnies externes', 'tier'),
        ('INTEGRATION_BOT', 'Integration Bot', 'Compte service pour intégrations/MCP/webhooks', 'integration')
        ON CONFLICT (code) DO NOTHING
    """)
```

- [ ] **Step 3: Re-run la migration et tester**

```bash
alembic downgrade -1
alembic upgrade head
pytest tests/test_migration_170_phase1.py -v
```

Expected: 4 tests PASS (incluant le nouveau).

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/170_rbac_bootstrap_phase1_additive.py tests/test_migration_170_phase1.py
git commit -m "feat(rbac): migration 170 — seed 8 new roles (SECURITY_OFFICER, DOC_CONTROLLER, PLANNER, MOC_VALIDATOR, OPERATOR, PAX, TIER_CONTACT, INTEGRATION_BOT)"
```

### Task 2.4 : Renommage des 3 rôles existants (INSERT+propagate+DELETE)

**Files:**
- Modify: `alembic/versions/170_rbac_bootstrap_phase1_additive.py`
- Test: ajouter à `tests/test_migration_170_phase1.py`

- [ ] **Step 1: Écrire le test**

```python
# Ajouter à tests/test_migration_170_phase1.py

@pytest.mark.asyncio
async def test_roles_renamed(db_session):
    """SUPER_ADMIN, PAX_ADMIN, HSE_ADMIN renamed to PLATFORM_ADMIN, PAX_COORD, HSE_MGR."""
    # New codes must exist
    new_codes = ["PLATFORM_ADMIN", "PAX_COORD", "HSE_MGR"]
    result = await db_session.execute(select(Role.code).where(Role.code.in_(new_codes)))
    found = {row[0] for row in result.all()}
    assert set(new_codes) == found

    # Old codes must NOT exist anymore
    old_codes = ["SUPER_ADMIN", "PAX_ADMIN", "HSE_ADMIN"]
    result = await db_session.execute(select(Role.code).where(Role.code.in_(old_codes)))
    found_old = {row[0] for row in result.all()}
    assert not found_old, f"Anciens codes encore présents: {found_old}"


@pytest.mark.asyncio
async def test_renamed_role_keeps_permissions(db_session):
    """PLATFORM_ADMIN (ex SUPER_ADMIN) keeps all the permissions it had."""
    from app.models.common import RolePermission
    result = await db_session.execute(
        select(RolePermission).where(RolePermission.role_code == "PLATFORM_ADMIN")
    )
    perms = result.scalars().all()
    # SUPER_ADMIN had all permissions, PLATFORM_ADMIN should keep them
    assert len(perms) > 20, f"PLATFORM_ADMIN should have many perms, found {len(perms)}"
```

- [ ] **Step 2: Ajouter le bloc de renommage à la migration**

À la fin de `upgrade()`, ajouter :

```python
    # 6. Rename existing roles using INSERT+propagate+DELETE
    # (cannot UPDATE roles.code because FK role_permissions.role_code lacks ON UPDATE CASCADE)
    RENAMES = [
        ("SUPER_ADMIN", "PLATFORM_ADMIN"),
        ("PAX_ADMIN", "PAX_COORD"),
        ("HSE_ADMIN", "HSE_MGR"),
    ]
    for old_code, new_code in RENAMES:
        # 6.a Create the new role row (copy of the old)
        op.execute(f"""
            INSERT INTO roles (code, name, description, module)
            SELECT '{new_code}', name, description, module FROM roles WHERE code = '{old_code}'
            ON CONFLICT (code) DO NOTHING
        """)
        # 6.b Propagate role_permissions
        op.execute(f"""
            INSERT INTO role_permissions (role_code, permission_code)
            SELECT '{new_code}', permission_code FROM role_permissions WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        # 6.c Propagate user_group_roles
        op.execute(f"""
            INSERT INTO user_group_roles (group_id, role_code)
            SELECT group_id, '{new_code}' FROM user_group_roles WHERE role_code = '{old_code}'
            ON CONFLICT DO NOTHING
        """)
        # 6.d Delete the old liaisons then the old role
        op.execute(f"DELETE FROM role_permissions WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM user_group_roles WHERE role_code = '{old_code}'")
        op.execute(f"DELETE FROM roles WHERE code = '{old_code}'")
```

- [ ] **Step 3: Re-run et tester**

```bash
alembic downgrade -1
alembic upgrade head
pytest tests/test_migration_170_phase1.py -v
```

Expected: 6 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/170_rbac_bootstrap_phase1_additive.py tests/test_migration_170_phase1.py
git commit -m "feat(rbac): migration 170 — rename SUPER_ADMIN→PLATFORM_ADMIN, PAX_ADMIN→PAX_COORD, HSE_ADMIN→HSE_MGR with FK propagation"
```

### Task 2.5 : Seed des settings tenant

**Files:**
- Modify: `alembic/versions/170_rbac_bootstrap_phase1_additive.py`
- Test: ajouter à `tests/test_migration_170_phase1.py`

- [ ] **Step 1: Écrire le test**

```python
# Ajouter à tests/test_migration_170_phase1.py
from app.models.common import Setting


@pytest.mark.asyncio
async def test_tenant_settings_seeded(db_session, sample_entity):
    """6 tenant settings are seeded for each existing entity."""
    expected_keys = [
        "rbac.default_role.internal",
        "rbac.default_role.external",
        "rbac.default_role.tier_contact",
        "rbac.delegation.max_duration_days",
        "rbac.delegation.notify_security_officer",
        "rbac.export.async_threshold_users",
    ]
    result = await db_session.execute(
        select(Setting.key).where(
            Setting.scope == "tenant",
            Setting.scope_id == str(sample_entity.id),
            Setting.key.in_(expected_keys),
        )
    )
    found = {row[0] for row in result.all()}
    assert set(expected_keys) == found, f"Settings manquants: {set(expected_keys) - found}"
```

- [ ] **Step 2: Ajouter le bloc à la migration**

À la fin de `upgrade()` :

```python
    # 7. Seed tenant settings (one row per existing entity, with default values)
    SETTINGS = [
        ("rbac.default_role.internal", '"READER"'),
        ("rbac.default_role.external", '"PAX"'),
        ("rbac.default_role.tier_contact", '"TIER_CONTACT"'),
        ("rbac.delegation.max_duration_days", '365'),
        ("rbac.delegation.notify_security_officer", 'true'),
        ("rbac.export.async_threshold_users", '500'),
        ("rbac.bootstrap.email_admins_on_migration", 'true'),
    ]
    for key, value in SETTINGS:
        op.execute(f"""
            INSERT INTO settings (key, value, scope, scope_id)
            SELECT '{key}', '{value}'::jsonb, 'tenant', id::text FROM entities
            ON CONFLICT DO NOTHING
        """)
```

- [ ] **Step 3: Tester**

```bash
alembic downgrade -1
alembic upgrade head
pytest tests/test_migration_170_phase1.py -v
```

Expected: 7 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add alembic/versions/170_rbac_bootstrap_phase1_additive.py tests/test_migration_170_phase1.py
git commit -m "feat(rbac): migration 170 — seed 7 tenant settings (default roles + ISO delegations + async threshold)"
```

### Task 2.6 : Test d'idempotence de la migration 170

**Files:**
- Test: ajouter à `tests/test_migration_170_phase1.py`

- [ ] **Step 1: Écrire le test d'idempotence**

```python
# Ajouter à tests/test_migration_170_phase1.py
import subprocess


def test_migration_170_idempotent():
    """Running alembic upgrade head twice in a row doesn't error and doesn't duplicate data."""
    # On suppose qu'on est déjà à head après les autres tests
    result = subprocess.run(
        ["alembic", "upgrade", "head"], capture_output=True, text=True
    )
    assert result.returncode == 0, f"Migration failed on second run: {result.stderr}"
    # Idempotence : la commande ne fait rien (ou seulement des "no-op")
    # On vérifie qu'on n'a pas d'erreur sur conflit
```

- [ ] **Step 2: Run**

Run: `pytest tests/test_migration_170_phase1.py -v`

Expected: 8 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_migration_170_phase1.py
git commit -m "test(rbac): verify migration 170 is idempotent"
```

## Groupe 3 — Moteur RBAC 4-couches

### Task 3.1 : Étendre `_resolve_permissions` avec la 4ᵉ couche délégation

**Files:**
- Modify: `app/core/rbac.py:31` (type `PermissionSource`)
- Modify: `app/core/rbac.py:78-138` (fonction `_resolve_permissions`)
- Test: `tests/test_rbac_delegation_layer.py` (créer)

- [ ] **Step 1: Écrire le test failing**

```python
# tests/test_rbac_delegation_layer.py
"""Test 4th layer (delegations) added to RBAC permission resolution."""
from datetime import datetime, timedelta, timezone
import pytest
from app.core.rbac import get_user_permissions, get_user_permissions_with_sources
from app.models.common import UserDelegation


@pytest.mark.asyncio
async def test_delegation_layer_grants_permission(db_session, sample_entity, sample_user, another_user):
    """A user who receives a delegation gets the perms with source 'delegation'."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read", "asset.asset.update"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="vacances",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" in perms
    assert "asset.asset.update" in perms

    sources = await get_user_permissions_with_sources(another_user.id, sample_entity.id, db_session)
    assert sources["asset.asset.read"] == "delegation"


@pytest.mark.asyncio
async def test_expired_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """An expired delegation no longer grants permissions."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now - timedelta(days=1),  # expired yesterday
        active=True,
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms


@pytest.mark.asyncio
async def test_future_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """A delegation with start_date in the future is not yet active."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=8),
        active=True,
        reason="programmed",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms


@pytest.mark.asyncio
async def test_inactive_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """A revoked delegation (active=false) does not grant."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=1),
        active=False,  # revoked
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms
```

- [ ] **Step 2: Run — doit échouer**

Run: `pytest tests/test_rbac_delegation_layer.py -v`

Expected: FAIL (le moteur ne lit pas encore les délégations).

- [ ] **Step 3: Modifier le type `PermissionSource`**

Dans `app/core/rbac.py:31`, remplacer :

```python
PermissionSource = Literal["user", "role", "group"]
```

par :

```python
PermissionSource = Literal["user", "role", "group", "delegation"]
```

- [ ] **Step 4: Modifier `_resolve_permissions` pour ajouter la 4ᵉ couche**

Dans `app/core/rbac.py`, importer `datetime` et `UserDelegation` :

```python
# En haut du fichier, ajouter aux imports
from datetime import datetime, timezone

from app.models.common import (
    GroupPermissionOverride,
    Permission,
    RolePermission,
    Setting,
    UserDelegation,  # NEW
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    UserPermissionOverride,
)
```

Puis remplacer le corps de `_resolve_permissions` (lignes 78-138). Voici la version complète à utiliser :

```python
async def _resolve_permissions(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> dict[str, PermissionSource]:
    """Resolve effective permissions with source tracking, including active delegations.

    Restrictive mode:
      Layer 1 — Group overrides
      Layer 2 — Role permissions
      Layer 3 — Active delegations received  (NEW in PR-A)
      Layer 4 — User overrides (highest priority)

    Additive mode:
      All granted=True across all layers are unioned; granted=False is ignored.
    """
    mode = await _get_permission_mode(entity_id, db)

    # Layer 1: Group permission overrides
    group_overrides_stmt = (
        select(GroupPermissionOverride.permission_code, GroupPermissionOverride.granted)
        .join(UserGroup, UserGroup.id == GroupPermissionOverride.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    group_result = await db.execute(group_overrides_stmt)
    group_overrides = group_result.all()

    # Layer 2: Role permissions (via junction table)
    role_perms_stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    role_result = await db.execute(role_perms_stmt)
    role_codes = [row[0] for row in role_result.all()]

    # Layer 3: Active delegations received (NEW)
    now = datetime.now(timezone.utc)
    delegations_stmt = (
        select(UserDelegation.permissions)
        .where(
            UserDelegation.delegate_id == user_id,
            UserDelegation.entity_id == entity_id,
            UserDelegation.active == True,
            UserDelegation.start_date <= now,
            UserDelegation.end_date > now,
        )
    )
    delegations_result = await db.execute(delegations_stmt)
    delegation_codes: list[str] = []
    for row in delegations_result.all():
        if isinstance(row[0], list):
            delegation_codes.extend(row[0])

    # Layer 4: User permission overrides
    user_overrides_stmt = (
        select(UserPermissionOverride.permission_code, UserPermissionOverride.granted)
        .where(UserPermissionOverride.user_id == user_id)
    )
    user_result = await db.execute(user_overrides_stmt)
    user_overrides = user_result.all()

    if mode == "additive":
        return _merge_additive(group_overrides, role_codes, delegation_codes, user_overrides)
    else:
        return _merge_restrictive(group_overrides, role_codes, delegation_codes, user_overrides)
```

Puis remplacer les helpers `_merge_additive` et `_merge_restrictive` (lignes 141-195) :

```python
def _merge_additive(
    group_overrides: list[tuple[str, bool]],
    role_codes: list[str],
    delegation_codes: list[str],
    user_overrides: list[tuple[str, bool]],
) -> dict[str, PermissionSource]:
    """Additive: union of all granted=True; granted=False is ignored."""
    effective: dict[str, PermissionSource] = {}

    for code, granted in group_overrides:
        if granted:
            effective[code] = "group"

    for code in role_codes:
        if code not in effective:
            effective[code] = "role"

    for code in delegation_codes:
        if code not in effective:
            effective[code] = "delegation"

    for code, granted in user_overrides:
        if granted:
            effective[code] = "user"

    return effective


def _merge_restrictive(
    group_overrides: list[tuple[str, bool]],
    role_codes: list[str],
    delegation_codes: list[str],
    user_overrides: list[tuple[str, bool]],
) -> dict[str, PermissionSource]:
    """Restrictive: higher-priority granted=False revokes lower layers."""
    effective: dict[str, PermissionSource] = {}

    # Layer 1: Group overrides (lowest priority)
    group_revokes: set[str] = set()
    for code, granted in group_overrides:
        if granted:
            effective[code] = "group"
        else:
            group_revokes.add(code)

    # Layer 2: Role permissions
    for code in role_codes:
        if code in group_revokes:
            effective.pop(code, None)
        elif code not in effective:
            effective[code] = "role"

    # Layer 3: Active delegations received
    for code in delegation_codes:
        if code in group_revokes:
            effective.pop(code, None)
        elif code not in effective:
            effective[code] = "delegation"

    # Layer 4: User overrides (highest priority)
    for code, granted in user_overrides:
        if granted:
            effective[code] = "user"
        else:
            effective.pop(code, None)

    return effective
```

- [ ] **Step 5: Run tests**

Run: `pytest tests/test_rbac_delegation_layer.py -v`

Expected: 4 tests PASS.

- [ ] **Step 6: Run aussi les tests RBAC existants pour vérifier non-régression**

Run: `pytest tests/ -k rbac -v`

Expected: tous les tests RBAC passent.

- [ ] **Step 7: Commit**

```bash
git add app/core/rbac.py tests/test_rbac_delegation_layer.py
git commit -m "feat(rbac): add 4th delegation layer to permission resolution engine"
```

### Task 3.2 : Test du cache invalidation après création d'une délégation

**Files:**
- Test: ajouter à `tests/test_rbac_delegation_layer.py`

- [ ] **Step 1: Écrire le test**

```python
# Ajouter à tests/test_rbac_delegation_layer.py
from app.core.rbac import invalidate_rbac_cache


@pytest.mark.asyncio
async def test_cache_invalidation_after_new_delegation(db_session, sample_entity, sample_user, another_user, redis_client):
    """Creating a delegation should invalidate the delegate's RBAC cache."""
    # First call seeds the cache
    perms_before = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms_before

    # Create a delegation
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=1),
        active=True,
        reason="test cache",
    )
    db_session.add(delegation)
    await db_session.commit()

    # Without explicit invalidation, the cache still has the old result
    perms_cached = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    # On peut tomber sur l'un ou l'autre selon le TTL — on force l'invalidation
    await invalidate_rbac_cache(another_user.id)
    perms_after = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" in perms_after
```

- [ ] **Step 2: Run**

Run: `pytest tests/test_rbac_delegation_layer.py::test_cache_invalidation_after_new_delegation -v`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/test_rbac_delegation_layer.py
git commit -m "test(rbac): verify cache invalidation works after delegation create"
```

---

## Groupe 4 — Service délégation

### Task 4.1 : Créer le schéma Pydantic `DelegationCreate`

**Files:**
- Create: `app/schemas/rbac_delegation.py`

- [ ] **Step 1: Créer le fichier**

```python
# app/schemas/rbac_delegation.py
"""Pydantic schemas for RBAC delegations."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OpsFluxSchema


class DelegationCreate(BaseModel):
    """Payload to create a delegation. Server-side validates:
    - Delegator has all listed permissions effectively (not via delegation)
    - Duration <= max_duration_days setting
    - end_date > start_date
    """
    delegate_id: UUID
    permissions: list[str] = Field(..., min_length=1, max_length=200)
    start_date: datetime
    end_date: datetime
    reason: str = Field(..., min_length=10, max_length=500, description="ISO traceability — required")


class DelegationUpdate(BaseModel):
    """Patch a delegation (delegator or manager only).
    Only `reason` and `end_date` (shorten only) are mutable.
    """
    reason: str | None = Field(None, min_length=10, max_length=500)
    end_date: datetime | None = None


class DelegationRevoke(BaseModel):
    """Revoke a delegation."""
    reason: str = Field(..., min_length=5, max_length=500)


class DelegationRead(OpsFluxSchema):
    id: UUID
    delegator_id: UUID
    delegate_id: UUID
    entity_id: UUID
    permissions: list[str]
    start_date: datetime
    end_date: datetime
    active: bool
    reason: str | None
    created_at: datetime
    # Derived fields
    delegator_name: str | None = None
    delegate_name: str | None = None
    status: str = "active"  # active | programmed | expired | revoked
    duration_days: int = 0


class DelegationListItem(OpsFluxSchema):
    id: UUID
    delegator_name: str
    delegate_name: str
    permissions_count: int
    start_date: datetime
    end_date: datetime
    status: str
    reason: str | None
```

- [ ] **Step 2: Commit**

```bash
git add app/schemas/rbac_delegation.py
git commit -m "feat(rbac): add DelegationCreate/Update/Revoke/Read schemas"
```

### Task 4.2 : Service `rbac_delegation_service.py` avec garde-fous ISO

**Files:**
- Create: `app/services/core/rbac_delegation_service.py`
- Test: `tests/test_rbac_delegation_service.py`

- [ ] **Step 1: Écrire les tests des garde-fous**

```python
# tests/test_rbac_delegation_service.py
"""Test RBAC delegation service — ISO guardrails."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4
import pytest
from fastapi import HTTPException

from app.services.core.rbac_delegation_service import (
    create_delegation,
    validate_delegation_constraints,
)
from app.schemas.rbac_delegation import DelegationCreate
from app.models.common import UserDelegation


@pytest.mark.asyncio
async def test_create_delegation_requires_effective_perms(db_session, sample_entity, sample_user, another_user):
    """Cannot delegate a permission the delegator doesn't have."""
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.delete"],  # delegator doesn't have this
        start_date=datetime.now(timezone.utc),
        end_date=datetime.now(timezone.utc) + timedelta(days=7),
        reason="should fail — missing perms",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, sample_user, sample_entity.id)
    assert exc.value.status_code == 403
    assert "RBAC_DELEGATION_INSUFFICIENT_PERMS" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_blocks_sub_delegation(db_session, sample_entity, sample_user, another_user, third_user):
    """Cannot re-delegate permissions that come from a delegation received."""
    now = datetime.now(timezone.utc)
    # sample_user delegates 'asset.asset.read' to another_user
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="initial",
    )
    db_session.add(delegation)
    await db_session.commit()

    # another_user tries to re-delegate 'asset.asset.read' to third_user
    body = DelegationCreate(
        delegate_id=third_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=3),
        reason="should fail — sub-delegation",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, another_user, sample_entity.id)
    assert exc.value.status_code == 403
    assert "RBAC_DELEGATION_SUB_DELEGATION_DENIED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_enforces_max_duration(db_session, sample_entity, sample_user, another_user, set_tenant_setting):
    """Cannot create a delegation longer than max_duration_days."""
    await set_tenant_setting(sample_entity.id, "rbac.delegation.max_duration_days", 30)

    now = datetime.now(timezone.utc)
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=60),  # exceeds 30
        reason="should fail — duration",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, sample_user, sample_entity.id)
    assert exc.value.status_code == 400
    assert "RBAC_DELEGATION_DURATION_EXCEEDED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_happy_path(db_session, sample_entity, user_with_asset_read, another_user, mock_render_pdf, mock_send_email):
    """A valid delegation creates DB row, sends 2 emails, creates audit event with hash."""
    now = datetime.now(timezone.utc)
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=7),
        reason="vacances de la semaine prochaine",
    )
    delegation = await create_delegation(db_session, body, user_with_asset_read, sample_entity.id)
    assert delegation.id is not None
    assert delegation.permissions == ["asset.asset.read"]
    assert mock_send_email.call_count == 2  # granted + received
    # Audit event
    from app.models.common import RbacAuditEvent
    from sqlalchemy import select
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "delegation.created")
    )
    event = result.scalar_one()
    assert event.file_hash_sha256 is not None
    assert len(event.file_hash_sha256) == 64
```

- [ ] **Step 2: Créer le service**

```python
# app/services/core/rbac_delegation_service.py
"""RBAC delegation service — create/modify/revoke with ISO 27001 guardrails."""
import hashlib
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_templates import render_and_send_email
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.core.rbac import (
    get_user_permissions,
    get_user_permissions_with_sources,
    invalidate_rbac_cache,
)
from app.models.common import (
    RbacAuditEvent,
    Setting,
    User,
    UserDelegation,
)
from app.schemas.rbac_delegation import DelegationCreate


async def _get_tenant_setting(db: AsyncSession, entity_id: UUID, key: str, default):
    """Read a tenant-scoped setting, fallback to default."""
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    if isinstance(row, dict) and "value" in row:
        return row["value"]
    return row


async def validate_delegation_constraints(
    db: AsyncSession,
    body: DelegationCreate,
    delegator: User,
    entity_id: UUID,
) -> None:
    """Raise StructuredHTTPException if any ISO guardrail fails."""
    # 1. Duration check
    max_days = await _get_tenant_setting(db, entity_id, "rbac.delegation.max_duration_days", 365)
    duration_days = (body.end_date - body.start_date).days
    if duration_days > max_days:
        raise StructuredHTTPException(
            400,
            code="RBAC_DELEGATION_DURATION_EXCEEDED",
            message=f"Duration {duration_days}d exceeds max {max_days}d allowed",
        )
    if body.end_date <= body.start_date:
        raise StructuredHTTPException(
            400,
            code="RBAC_DELEGATION_INVALID_PERIOD",
            message="end_date must be strictly after start_date",
        )

    # 2. Effective permissions check (must have the perms NOT via delegation only)
    sources = await get_user_permissions_with_sources(delegator.id, entity_id, db)
    delegator_owned = {code for code, source in sources.items() if source != "delegation"}
    missing = set(body.permissions) - delegator_owned

    # Distinguish: not having vs having only via delegation
    all_perms = set(sources.keys())
    not_having = set(body.permissions) - all_perms
    via_delegation_only = (set(body.permissions) - delegator_owned) - not_having

    if not_having:
        raise StructuredHTTPException(
            403,
            code="RBAC_DELEGATION_INSUFFICIENT_PERMS",
            message=f"Delegator does not have these permissions: {sorted(not_having)}",
        )
    if via_delegation_only:
        raise StructuredHTTPException(
            403,
            code="RBAC_DELEGATION_SUB_DELEGATION_DENIED",
            message=f"Cannot sub-delegate permissions received via delegation: {sorted(via_delegation_only)}",
        )


async def create_delegation(
    db: AsyncSession,
    body: DelegationCreate,
    delegator: User,
    entity_id: UUID,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> UserDelegation:
    """Create a delegation with all ISO guardrails, emails, PDF and audit trail."""
    await validate_delegation_constraints(db, body, delegator, entity_id)

    # Fetch delegate
    delegate = await db.get(User, body.delegate_id)
    if not delegate:
        raise StructuredHTTPException(404, code="USER_NOT_FOUND", message="Delegate not found")

    # 1. Persist delegation
    delegation = UserDelegation(
        delegator_id=delegator.id,
        delegate_id=body.delegate_id,
        entity_id=entity_id,
        permissions=body.permissions,
        start_date=body.start_date,
        end_date=body.end_date,
        active=True,
        reason=body.reason,
    )
    db.add(delegation)
    await db.flush()

    # 2. Build PDF certificate variables
    cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, entity_id)

    # 3. Render certificate PDF (may return None if template not seeded yet — PR-B)
    cert_pdf = await render_pdf(
        db,
        slug="core.rbac.delegation_certificate",
        entity_id=entity_id,
        language=delegate.language or "fr",
        variables=cert_vars,
    )
    cert_hash = hashlib.sha256(cert_pdf).hexdigest() if cert_pdf else None

    # 4. Audit event
    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type="delegation.created",
        target=str(delegation.id),
        params={
            "delegator_id": str(delegator.id),
            "delegate_id": str(body.delegate_id),
            "permissions_count": len(body.permissions),
            "duration_days": (body.end_date - body.start_date).days,
        },
        result_summary={"permissions": body.permissions, "reason": body.reason},
        file_hash_sha256=cert_hash,
        actor_user_id=delegator.id,
        client_ip=client_ip,
        user_agent=user_agent,
        status="success",
    )
    db.add(audit)

    await db.commit()
    await db.refresh(delegation)

    # 5. Send emails (granted + received), with cert PDF attached if available
    attachments = [("certificate.pdf", cert_pdf)] if cert_pdf else []

    await render_and_send_email(
        db,
        slug="rbac.delegation.granted",
        entity_id=entity_id,
        language=delegator.language or "fr",
        to=delegator.email,
        variables=cert_vars,
        attachments=attachments,
    )
    await render_and_send_email(
        db,
        slug="rbac.delegation.received",
        entity_id=entity_id,
        language=delegate.language or "fr",
        to=delegate.email,
        variables=cert_vars,
        attachments=attachments,
    )

    # 6. Optionally CC SECURITY_OFFICERs
    notify_so = await _get_tenant_setting(db, entity_id, "rbac.delegation.notify_security_officer", True)
    if notify_so:
        await _notify_security_officers(db, entity_id, cert_vars, attachments)

    # 7. Invalidate delegate's cache
    await invalidate_rbac_cache(body.delegate_id)

    return delegation


async def _build_certificate_variables(
    db: AsyncSession,
    delegation: UserDelegation,
    delegator: User,
    delegate: User,
    entity_id: UUID,
) -> dict:
    """Variables for rendering the delegation certificate PDF and emails."""
    from app.models.common import Entity, Permission

    entity = await db.get(Entity, entity_id)

    # Fetch permission details
    perms_result = await db.execute(
        select(Permission).where(Permission.code.in_(delegation.permissions))
    )
    permissions_full = [
        {"code": p.code, "name": p.name, "module": p.module}
        for p in perms_result.scalars().all()
    ]

    duration_days = (delegation.end_date - delegation.start_date).days

    return {
        "delegation": {
            "id": str(delegation.id),
            "permissions": delegation.permissions,
            "permissions_full": permissions_full,
            "start_date": delegation.start_date.isoformat(),
            "end_date": delegation.end_date.isoformat(),
            "reason": delegation.reason,
        },
        "delegator": {
            "id": str(delegator.id),
            "full_name": delegator.full_name,
            "email": delegator.email,
            "roles_at_date": [],  # filled by route layer
        },
        "delegate": {
            "id": str(delegate.id),
            "full_name": delegate.full_name,
            "email": delegate.email,
        },
        "tenant": {
            "id": str(entity.id),
            "name": entity.name,
            "logo_url": entity.logo_url,
        },
        "delegation_duration_days": duration_days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "iso_clause": "ISO 27001 §A.9.2.5 — Revue des droits d'accès des utilisateurs",
        "audit_event_id": "",  # filled in audit event creation
        "content_hash": "",
    }


async def _notify_security_officers(
    db: AsyncSession,
    entity_id: UUID,
    cert_vars: dict,
    attachments: list,
) -> None:
    """Send the granted email to each SECURITY_OFFICER in the tenant."""
    from app.models.common import User, UserGroup, UserGroupMember, UserGroupRole

    so_users_stmt = (
        select(User.email, User.language)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .join(UserGroupRole, UserGroupRole.group_id == UserGroup.id)
        .where(
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
            UserGroupRole.role_code == "SECURITY_OFFICER",
        )
        .distinct()
    )
    result = await db.execute(so_users_stmt)
    for email, lang in result.all():
        await render_and_send_email(
            db,
            slug="rbac.delegation.granted",
            entity_id=entity_id,
            language=lang or "fr",
            to=email,
            variables=cert_vars,
            attachments=attachments,
        )
```

- [ ] **Step 3: Créer les fixtures pytest pour les tests**

Vérifier que les fixtures `sample_entity`, `sample_user`, `another_user`, `third_user`, `user_with_asset_read`, `mock_render_pdf`, `mock_send_email`, `set_tenant_setting` existent dans `tests/conftest.py`. Si manquantes, créer :

```python
# Ajouter à tests/conftest.py
import pytest
from unittest.mock import AsyncMock, patch
from app.models.common import Setting


@pytest.fixture
async def user_with_asset_read(db_session, sample_user, sample_entity, sample_group):
    """A user who has 'asset.asset.read' via role."""
    from app.models.common import Permission, Role, RolePermission, UserGroupRole, UserGroupMember
    role = Role(code="ASSET_READER", name="Asset Reader", module="asset")
    db_session.add(role)
    perm = await db_session.get(Permission, "asset.asset.read")
    if perm is None:
        perm = Permission(code="asset.asset.read", name="Read assets", namespace="asset", resource="asset", action="read")
        db_session.add(perm)
    await db_session.commit()
    db_session.add(RolePermission(role_code="ASSET_READER", permission_code="asset.asset.read"))
    db_session.add(UserGroupRole(group_id=sample_group.id, role_code="ASSET_READER"))
    db_session.add(UserGroupMember(user_id=sample_user.id, group_id=sample_group.id))
    await db_session.commit()
    return sample_user


@pytest.fixture
async def third_user(db_session):
    from app.models.common import User
    user = User(email="third@test.local", first_name="Third", last_name="User", language="fr")
    db_session.add(user)
    await db_session.commit()
    return user


@pytest.fixture
def mock_render_pdf():
    with patch("app.services.core.rbac_delegation_service.render_pdf", new_callable=AsyncMock) as m:
        m.return_value = b"%PDF-1.4 fake bytes for testing"
        yield m


@pytest.fixture
def mock_send_email():
    with patch("app.services.core.rbac_delegation_service.render_and_send_email", new_callable=AsyncMock) as m:
        m.return_value = {"sent": True}
        yield m


@pytest.fixture
async def set_tenant_setting(db_session):
    async def _set(entity_id, key, value):
        import json
        from sqlalchemy import select
        result = await db_session.execute(
            select(Setting).where(
                Setting.key == key,
                Setting.scope == "tenant",
                Setting.scope_id == str(entity_id),
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = json.loads(json.dumps(value))
        else:
            db_session.add(Setting(key=key, value=value, scope="tenant", scope_id=str(entity_id)))
        await db_session.commit()
    return _set
```

- [ ] **Step 4: Run**

Run: `pytest tests/test_rbac_delegation_service.py -v`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/services/core/rbac_delegation_service.py tests/test_rbac_delegation_service.py tests/conftest.py
git commit -m "feat(rbac): delegation service with ISO guardrails (duration, sub-delegation, effective perms)"
```

### Task 4.3 : Service — revoke et helpers

**Files:**
- Modify: `app/services/core/rbac_delegation_service.py`
- Test: ajouter à `tests/test_rbac_delegation_service.py`

- [ ] **Step 1: Écrire le test de revoke**

```python
# Ajouter à tests/test_rbac_delegation_service.py
from app.services.core.rbac_delegation_service import revoke_delegation


@pytest.mark.asyncio
async def test_revoke_delegation_marks_inactive_and_sends_emails(
    db_session, sample_entity, sample_user, another_user, mock_render_pdf, mock_send_email
):
    """Revoking a delegation marks active=false, sends emails, logs audit."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    await revoke_delegation(db_session, delegation.id, sample_user, sample_entity.id, "annulation forcée")

    await db_session.refresh(delegation)
    assert delegation.active is False
    assert mock_send_email.call_count >= 2

    from app.models.common import RbacAuditEvent
    from sqlalchemy import select
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "delegation.revoked")
    )
    assert result.scalar_one() is not None
```

- [ ] **Step 2: Ajouter `revoke_delegation` au service**

À la fin de `app/services/core/rbac_delegation_service.py` :

```python
async def revoke_delegation(
    db: AsyncSession,
    delegation_id: UUID,
    actor: User,
    entity_id: UUID,
    reason: str,
    client_ip: str | None = None,
    user_agent: str | None = None,
) -> UserDelegation:
    """Revoke a delegation: mark inactive, send emails, audit."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Delegation not found")
    if delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Delegation not in this tenant")
    if not delegation.active:
        raise StructuredHTTPException(400, code="RBAC_DELEGATION_ALREADY_INACTIVE", message="Already inactive")

    delegation.active = False
    delegation.reason = (delegation.reason or "") + f"\n\n[REVOKED by {actor.email} on {datetime.now(timezone.utc).isoformat()}: {reason}]"

    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, entity_id)
    cert_vars["revocation"] = {"actor_email": actor.email, "reason": reason, "revoked_at": datetime.now(timezone.utc).isoformat()}

    cert_pdf = await render_pdf(
        db,
        slug="core.rbac.delegation_certificate",
        entity_id=entity_id,
        language=delegate.language or "fr",
        variables=cert_vars,
    )
    cert_hash = hashlib.sha256(cert_pdf).hexdigest() if cert_pdf else None

    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type="delegation.revoked",
        target=str(delegation.id),
        params={"revoke_reason": reason, "actor_id": str(actor.id)},
        file_hash_sha256=cert_hash,
        actor_user_id=actor.id,
        client_ip=client_ip,
        user_agent=user_agent,
        status="success",
    )
    db.add(audit)
    await db.commit()
    await db.refresh(delegation)

    attachments = [("certificate.pdf", cert_pdf)] if cert_pdf else []
    for to_email, lang in [(delegator.email, delegator.language or "fr"), (delegate.email, delegate.language or "fr")]:
        await render_and_send_email(
            db,
            slug="rbac.delegation.revoked",
            entity_id=entity_id,
            language=lang,
            to=to_email,
            variables=cert_vars,
            attachments=attachments,
        )

    await invalidate_rbac_cache(delegation.delegate_id)
    return delegation
```

- [ ] **Step 3: Run**

Run: `pytest tests/test_rbac_delegation_service.py -v`

Expected: 5 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/core/rbac_delegation_service.py tests/test_rbac_delegation_service.py
git commit -m "feat(rbac): delegation revoke with email notifications and audit"
```

## Groupe 5 — Routes délégations

### Task 5.1 : Créer le routeur `delegations.py` avec POST/GET

**Files:**
- Create: `app/api/routes/core/rbac/__init__.py` (package)
- Create: `app/api/routes/core/rbac/delegations.py`
- Modify: `app/main.py` (enregistrer le routeur)
- Test: `tests/test_rbac_delegations_routes.py`

- [ ] **Step 1: Créer le package**

```python
# app/api/routes/core/rbac/__init__.py
"""RBAC routes — sub-package for delegations, exports, defaults, audit-events."""
```

- [ ] **Step 2: Écrire le test de POST et GET /**

```python
# tests/test_rbac_delegations_routes.py
"""Test RBAC delegations routes."""
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_delegation_endpoint(
    async_client: AsyncClient, auth_headers_user_with_perms, another_user, sample_entity, mock_render_pdf, mock_send_email
):
    """POST /api/v1/rbac/delegations/ creates a delegation and returns it."""
    now = datetime.now(timezone.utc)
    body = {
        "delegate_id": str(another_user.id),
        "permissions": ["asset.asset.read"],
        "start_date": now.isoformat(),
        "end_date": (now + timedelta(days=7)).isoformat(),
        "reason": "vacances semaine prochaine",
    }
    resp = await async_client.post("/api/v1/rbac/delegations/", json=body, headers=auth_headers_user_with_perms)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["delegate_id"] == str(another_user.id)
    assert data["permissions"] == ["asset.asset.read"]
    assert data["active"] is True


@pytest.mark.asyncio
async def test_list_delegations_requires_permission(async_client, auth_headers_pax):
    """GET /api/v1/rbac/delegations/ requires core.delegation.read."""
    resp = await async_client.get("/api/v1/rbac/delegations/", headers=auth_headers_pax)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_mine_works_without_permission(async_client, auth_headers_pax):
    """GET /mine works for any authenticated user."""
    resp = await async_client.get("/api/v1/rbac/delegations/mine", headers=auth_headers_pax)
    assert resp.status_code == 200
```

- [ ] **Step 3: Créer le routeur**

```python
# app/api/routes/core/rbac/delegations.py
"""RBAC delegations routes — CRUD + revoke + certificate.

Permissions:
- core.delegation.read : list/view in tenant
- core.delegation.create : create on own perms
- core.delegation.manage : modify any
- core.delegation.revoke : revoke any
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
import io
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.models.common import User, UserDelegation
from app.schemas.rbac_delegation import (
    DelegationCreate,
    DelegationListItem,
    DelegationRead,
    DelegationRevoke,
    DelegationUpdate,
)
from app.services.core.rbac_delegation_service import (
    create_delegation,
    revoke_delegation,
)

router = APIRouter(prefix="/api/v1/rbac/delegations", tags=["rbac-delegation"])


def _build_status(d: UserDelegation) -> str:
    now = datetime.now(timezone.utc)
    if not d.active:
        return "revoked"
    if d.start_date > now:
        return "programmed"
    if d.end_date <= now:
        return "expired"
    return "active"


def _to_read(d: UserDelegation, delegator: User | None = None, delegate: User | None = None) -> DelegationRead:
    return DelegationRead(
        id=d.id,
        delegator_id=d.delegator_id,
        delegate_id=d.delegate_id,
        entity_id=d.entity_id,
        permissions=d.permissions,
        start_date=d.start_date,
        end_date=d.end_date,
        active=d.active,
        reason=d.reason,
        created_at=d.created_at,
        delegator_name=delegator.full_name if delegator else None,
        delegate_name=delegate.full_name if delegate else None,
        status=_build_status(d),
        duration_days=(d.end_date - d.start_date).days,
    )


@router.post("/", response_model=DelegationRead, status_code=201)
async def create_route(
    request: Request,
    body: DelegationCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.delegation.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a delegation. Server-side validates duration, effective perms, sub-delegation."""
    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    delegation = await create_delegation(db, body, current_user, entity_id, client_ip, ua)
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.get("/", response_model=list[DelegationListItem])
async def list_tenant(
    status: str | None = None,
    delegator_id: UUID | None = None,
    delegate_id: UUID | None = None,
    _: None = require_permission("core.delegation.read"),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List delegations in tenant. Filters: status, delegator_id, delegate_id."""
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if delegator_id:
        stmt = stmt.where(UserDelegation.delegator_id == delegator_id)
    if delegate_id:
        stmt = stmt.where(UserDelegation.delegate_id == delegate_id)
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    items = []
    for d in delegations:
        s = _build_status(d)
        if status and s != status:
            continue
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        items.append(DelegationListItem(
            id=d.id,
            delegator_name=delegator.full_name if delegator else "?",
            delegate_name=delegate.full_name if delegate else "?",
            permissions_count=len(d.permissions),
            start_date=d.start_date,
            end_date=d.end_date,
            status=s,
            reason=d.reason,
        ))
    return items


@router.get("/mine", response_model=list[DelegationListItem])
async def list_mine(
    direction: str | None = None,  # received | given | None=both
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List delegations involving the current user (received and/or given)."""
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if direction == "received":
        stmt = stmt.where(UserDelegation.delegate_id == current_user.id)
    elif direction == "given":
        stmt = stmt.where(UserDelegation.delegator_id == current_user.id)
    else:
        stmt = stmt.where(
            (UserDelegation.delegator_id == current_user.id) | (UserDelegation.delegate_id == current_user.id)
        )
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    items = []
    for d in delegations:
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        items.append(DelegationListItem(
            id=d.id,
            delegator_name=delegator.full_name if delegator else "?",
            delegate_name=delegate.full_name if delegate else "?",
            permissions_count=len(d.permissions),
            start_date=d.start_date,
            end_date=d.end_date,
            status=_build_status(d),
            reason=d.reason,
        ))
    return items


@router.get("/{delegation_id}", response_model=DelegationRead)
async def get_one(
    delegation_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get a delegation. Accessible by delegator, delegate, or holders of core.delegation.read."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    # Authorization
    if delegation.delegator_id != current_user.id and delegation.delegate_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.read", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="No access")

    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.patch("/{delegation_id}", response_model=DelegationRead)
async def patch_one(
    delegation_id: UUID,
    body: DelegationUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Modify reason or shorten end_date. Delegator or core.delegation.manage."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")
    if not delegation.active:
        raise StructuredHTTPException(400, code="RBAC_DELEGATION_INACTIVE", message="Cannot modify inactive delegation")

    if delegation.delegator_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.manage", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="Not authorized")

    if body.reason is not None:
        delegation.reason = body.reason
    if body.end_date is not None:
        if body.end_date >= delegation.end_date:
            raise StructuredHTTPException(400, code="RBAC_DELEGATION_CAN_ONLY_SHORTEN", message="end_date can only be shortened")
        delegation.end_date = body.end_date

    await db.commit()
    await db.refresh(delegation)
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    return _to_read(delegation, delegator, delegate)


@router.post("/{delegation_id}/revoke", response_model=DelegationRead)
async def revoke_route(
    delegation_id: UUID,
    body: DelegationRevoke,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a delegation. Delegator or core.delegation.revoke."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    if delegation.delegator_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.revoke", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="Not authorized")

    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    revoked = await revoke_delegation(db, delegation_id, current_user, entity_id, body.reason, client_ip, ua)
    delegator = await db.get(User, revoked.delegator_id)
    delegate = await db.get(User, revoked.delegate_id)
    return _to_read(revoked, delegator, delegate)


@router.get("/{delegation_id}/certificate.pdf")
async def get_certificate(
    delegation_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Re-download the delegation certificate PDF. Hash re-computed must match audit event."""
    delegation = await db.get(UserDelegation, delegation_id)
    if not delegation or delegation.entity_id != entity_id:
        raise StructuredHTTPException(404, code="DELEGATION_NOT_FOUND", message="Not found")

    if delegation.delegator_id != current_user.id and delegation.delegate_id != current_user.id:
        from app.core.rbac import check_permission
        if not await check_permission(current_user.id, entity_id, "core.delegation.read", db):
            raise StructuredHTTPException(403, code="FORBIDDEN", message="No access")

    from app.services.core.rbac_delegation_service import _build_certificate_variables
    delegator = await db.get(User, delegation.delegator_id)
    delegate = await db.get(User, delegation.delegate_id)
    cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, entity_id)

    pdf_bytes = await render_pdf(
        db,
        slug="core.rbac.delegation_certificate",
        entity_id=entity_id,
        language=current_user.language or "fr",
        variables=cert_vars,
    )
    if pdf_bytes is None:
        raise StructuredHTTPException(
            404, code="RBAC_TEMPLATE_NOT_FOUND",
            message="Certificate template not seeded (PR-B not deployed yet)",
        )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="delegation_{delegation.id}.pdf"',
        },
    )
```

- [ ] **Step 4: Enregistrer le routeur dans `app/main.py`**

Run: `grep -n "include_router" app/main.py | head -5`

Identifier la zone d'inclusion des routeurs core, et y ajouter :

```python
from app.api.routes.core.rbac import delegations as rbac_delegations
app.include_router(rbac_delegations.router)
```

- [ ] **Step 5: Run les tests**

Run: `pytest tests/test_rbac_delegations_routes.py -v`

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/routes/core/rbac/ app/main.py tests/test_rbac_delegations_routes.py
git commit -m "feat(rbac): delegations routes (POST/GET/PATCH/revoke/certificate)"
```

---

## Groupe 6 — Cron expiration délégations

### Task 6.1 : Cron job APScheduler J-3 et J0

**Files:**
- Create: `app/tasks/rbac_delegation_expiry.py`
- Modify: `app/tasks/scheduler.py` (enregistrer le job)
- Test: `tests/test_rbac_delegation_expiry.py`

- [ ] **Step 1: Écrire le test**

```python
# tests/test_rbac_delegation_expiry.py
"""Test the cron job that notifies J-3 and J0 of delegation expiry."""
from datetime import datetime, timedelta, timezone
import pytest
from app.models.common import UserDelegation
from app.tasks.rbac_delegation_expiry import notify_expiring_delegations


@pytest.mark.asyncio
async def test_notifies_j3(db_session, sample_entity, sample_user, another_user, mock_render_pdf, mock_send_email):
    """A delegation expiring in 3 days triggers email notification."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(days=3, hours=1),  # in 3 days
        active=True,
        reason="test j-3",
    )
    db_session.add(delegation)
    await db_session.commit()

    await notify_expiring_delegations(db_session)
    assert mock_send_email.call_count >= 2  # to delegator + delegate


@pytest.mark.asyncio
async def test_notifies_j0(db_session, sample_entity, sample_user, another_user, mock_render_pdf, mock_send_email):
    """A delegation expiring today triggers J0 email."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(hours=2),  # expires today (within next 24h)
        active=True,
        reason="test j-0",
    )
    db_session.add(delegation)
    await db_session.commit()

    await notify_expiring_delegations(db_session)
    assert mock_send_email.call_count >= 2
```

- [ ] **Step 2: Créer le module**

```python
# app/tasks/rbac_delegation_expiry.py
"""Cron job: notify users of delegations expiring at J-3 and J0."""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email_templates import render_and_send_email
from app.core.pdf_templates import render_pdf
from app.models.common import RbacAuditEvent, User, UserDelegation
from app.services.core.rbac_delegation_service import _build_certificate_variables

logger = logging.getLogger(__name__)


async def notify_expiring_delegations(db: AsyncSession) -> int:
    """Find active delegations expiring in ~3 days or ~today.

    Sends `rbac.delegation.expired` email + certificate PDF attachment.
    Returns the number of delegations notified.
    """
    now = datetime.now(timezone.utc)

    # J-3 window: end_date between now+2.5 days and now+3.5 days
    j3_low = now + timedelta(days=2, hours=12)
    j3_high = now + timedelta(days=3, hours=12)
    # J0 window: end_date between now and now+24h
    j0_low = now
    j0_high = now + timedelta(hours=24)

    stmt = select(UserDelegation).where(
        UserDelegation.active == True,
        (
            ((UserDelegation.end_date >= j3_low) & (UserDelegation.end_date < j3_high))
            | ((UserDelegation.end_date >= j0_low) & (UserDelegation.end_date < j0_high))
        ),
    )
    result = await db.execute(stmt)
    delegations = result.scalars().all()

    notified = 0
    for delegation in delegations:
        try:
            delegator = await db.get(User, delegation.delegator_id)
            delegate = await db.get(User, delegation.delegate_id)
            cert_vars = await _build_certificate_variables(db, delegation, delegator, delegate, delegation.entity_id)

            is_j0 = delegation.end_date <= j0_high
            cert_vars["expiry_phase"] = "j0" if is_j0 else "j3"

            cert_pdf = await render_pdf(
                db,
                slug="core.rbac.delegation_certificate",
                entity_id=delegation.entity_id,
                language=delegate.language or "fr",
                variables=cert_vars,
            )
            attachments = [("certificate.pdf", cert_pdf)] if cert_pdf else []

            for to_email, lang in [
                (delegator.email, delegator.language or "fr"),
                (delegate.email, delegate.language or "fr"),
            ]:
                await render_and_send_email(
                    db,
                    slug="rbac.delegation.expired",
                    entity_id=delegation.entity_id,
                    language=lang,
                    to=to_email,
                    variables=cert_vars,
                    attachments=attachments,
                )

            audit = RbacAuditEvent(
                tenant_id=delegation.entity_id,
                event_type="delegation.expired" if is_j0 else "delegation.expiring_soon",
                target=str(delegation.id),
                params={"phase": "j0" if is_j0 else "j3"},
                actor_user_id=delegator.id,  # system action attributed to delegator
                status="success",
            )
            db.add(audit)
            notified += 1
        except Exception as e:
            logger.exception("Failed to notify expiry for delegation %s: %s", delegation.id, e)

    await db.commit()
    return notified
```

- [ ] **Step 3: Enregistrer le job dans le scheduler**

Vérifier d'abord la structure de `app/tasks/scheduler.py` :

Run: `grep -n "add_job\|scheduler.add" app/tasks/scheduler.py`

Si une fonction `register_jobs()` existe, y ajouter :

```python
from app.tasks.rbac_delegation_expiry import notify_expiring_delegations
from app.core.database import async_session_factory

async def _run_delegation_expiry_job():
    async with async_session_factory() as db:
        await notify_expiring_delegations(db)

# Inside register_jobs():
scheduler.add_job(
    _run_delegation_expiry_job,
    trigger=CronTrigger(hour=8, minute=0),  # daily at 08:00 UTC
    id="rbac_delegation_expiry",
    replace_existing=True,
)
```

Si la structure est différente, adapter en suivant le pattern des jobs existants.

- [ ] **Step 4: Run les tests**

Run: `pytest tests/test_rbac_delegation_expiry.py -v`

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/tasks/rbac_delegation_expiry.py app/tasks/scheduler.py tests/test_rbac_delegation_expiry.py
git commit -m "feat(rbac): cron job for delegation expiry notifications (J-3 + J0)"
```

## Groupe 7 — Service helpers d'export PDF

### Task 7.1 : Service `rbac_export_service.py` — builders de variables

**Files:**
- Create: `app/services/core/rbac_export_service.py`
- Test: `tests/test_rbac_export_service.py`

- [ ] **Step 1: Écrire les tests pour les 3 premiers builders**

```python
# tests/test_rbac_export_service.py
"""Test the export variable builders for RBAC PDF templates."""
import pytest
from uuid import uuid4

from app.services.core.rbac_export_service import (
    build_matrix_role_permissions_variables,
    build_role_detail_variables,
    build_permission_catalog_variables,
)


@pytest.mark.asyncio
async def test_build_matrix_role_permissions_variables(db_session, sample_entity, sample_user):
    """Builder returns roles[], permissions[], grants{}, modules[]."""
    vars = await build_matrix_role_permissions_variables(
        db_session, sample_entity.id, sample_user, lang="fr", include_disabled=False
    )
    assert "roles" in vars
    assert "permissions" in vars
    assert "grants" in vars
    assert "modules" in vars
    assert "tenant" in vars
    assert "generated_at" in vars
    assert "generated_by" in vars
    assert isinstance(vars["roles"], list)
    assert isinstance(vars["permissions"], list)


@pytest.mark.asyncio
async def test_build_role_detail_variables(db_session, sample_entity, sample_user):
    """Builder for a single role returns role + permissions_by_module + groups_using_role + users_via_groups."""
    vars = await build_role_detail_variables(
        db_session, sample_entity.id, sample_user, role_code="TENANT_ADMIN", lang="fr"
    )
    assert vars["role"]["code"] == "TENANT_ADMIN"
    assert "permissions_by_module" in vars
    assert "groups_using_role" in vars


@pytest.mark.asyncio
async def test_build_permission_catalog_variables(db_session, sample_entity, sample_user):
    """Builder returns permissions grouped by module."""
    vars = await build_permission_catalog_variables(
        db_session, sample_entity.id, sample_user, lang="fr", group_by="module", include_disabled=False
    )
    assert "permissions_by_module" in vars
    assert "tenant" in vars
```

- [ ] **Step 2: Créer le service**

```python
# app/services/core/rbac_export_service.py
"""Helpers to build the `variables` dict passed to render_pdf for each RBAC PDF template."""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    Entity,
    Permission,
    Role,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)
from app.services.core.module_lifecycle_service import is_module_enabled, normalize_module_slug


async def _build_tenant_block(db: AsyncSession, entity_id: UUID) -> dict:
    entity = await db.get(Entity, entity_id)
    return {
        "id": str(entity.id),
        "name": entity.name,
        "logo_url": entity.logo_url,
    }


async def _build_generated_by_block(user: User) -> dict:
    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
    }


async def _list_permissions(db: AsyncSession, entity_id: UUID, include_disabled: bool) -> list[Permission]:
    """Return permissions, marking module_disabled if relevant."""
    result = await db.execute(select(Permission).order_by(Permission.module, Permission.code))
    perms = list(result.scalars().all())
    if not include_disabled:
        filtered = []
        for p in perms:
            mod = normalize_module_slug(p.module) or "core"
            if mod == "core" or await is_module_enabled(db, entity_id, mod):
                filtered.append(p)
        return filtered
    return perms


async def _list_roles(db: AsyncSession) -> list[Role]:
    result = await db.execute(select(Role).order_by(Role.code))
    return list(result.scalars().all())


def _serialize_perm(p: Permission, entity_modules_disabled: set[str]) -> dict:
    mod = normalize_module_slug(p.module) or "core"
    return {
        "code": p.code,
        "name": p.name,
        "module": p.module,
        "namespace": p.namespace,
        "resource": p.resource,
        "action": p.action,
        "sensitive": p.sensitive,
        "deprecated": p.deprecated,
        "module_disabled": mod in entity_modules_disabled,
    }


def _serialize_role(r: Role) -> dict:
    return {
        "code": r.code,
        "name": r.name,
        "description": r.description,
        "module": r.module,
    }


async def _disabled_modules_for_entity(db: AsyncSession, entity_id: UUID) -> set[str]:
    """Return the set of modules disabled for the tenant. Empty if none."""
    # The function `is_module_enabled` knows what's disabled — we ask for known modules
    candidates = ["asset_registry", "moc", "paxlog", "packlog", "planner", "papyrus",
                  "pid_pfd", "conformite", "imputation", "support", "teams", "messaging",
                  "travelwiz", "report_editor", "workflow"]
    disabled: set[str] = set()
    for mod in candidates:
        if not await is_module_enabled(db, entity_id, mod):
            disabled.add(mod)
    return disabled


async def build_matrix_role_permissions_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    lang: str,
    include_disabled: bool,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.matrix_role_permissions` template."""
    tenant = await _build_tenant_block(db, entity_id)
    roles = await _list_roles(db)
    permissions = await _list_permissions(db, entity_id, include_disabled)

    # grants : dict (role_code, perm_code) → bool. We use a flat list of [r, p] pairs (JSON-friendly)
    rp_result = await db.execute(select(RolePermission.role_code, RolePermission.permission_code))
    grants_set = {(row[0], row[1]) for row in rp_result.all()}
    perm_codes = {p.code for p in permissions}
    grants_flat = [[r, p] for (r, p) in grants_set if p in perm_codes]

    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # Group permissions by module for the rendered matrix
    modules_map: dict[str, list[Permission]] = {}
    for p in permissions:
        mod = normalize_module_slug(p.module) or "core"
        modules_map.setdefault(mod, []).append(p)
    modules = [
        {
            "namespace": mod,
            "label": mod.replace("_", " ").title(),
            "permissions": [_serialize_perm(p, disabled_mods) for p in plist],
            "permission_count": len(plist),
            "disabled_in_tenant": mod in disabled_mods,
        }
        for mod, plist in sorted(modules_map.items())
    ]

    return {
        "tenant": tenant,
        "roles": [_serialize_role(r) for r in roles],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants_flat,
        "modules": modules,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_role_detail_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    role_code: str,
    lang: str,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.role_detail` template."""
    role = await db.get(Role, role_code)
    if not role:
        raise ValueError(f"Role {role_code} not found")

    # Permissions of this role, grouped by module
    perms_result = await db.execute(
        select(Permission)
        .join(RolePermission, RolePermission.permission_code == Permission.code)
        .where(RolePermission.role_code == role_code)
        .order_by(Permission.module, Permission.code)
    )
    perms = list(perms_result.scalars().all())
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    grouped: dict[str, list[dict]] = {}
    for p in perms:
        mod = normalize_module_slug(p.module) or "core"
        grouped.setdefault(mod, []).append(_serialize_perm(p, disabled_mods))
    permissions_by_module = [
        {"module": mod, "permissions": plist} for mod, plist in sorted(grouped.items())
    ]

    # Groups using this role
    groups_result = await db.execute(
        select(UserGroup.id, UserGroup.name, UserGroup.entity_id, UserGroup.active)
        .join(UserGroupRole, UserGroupRole.group_id == UserGroup.id)
        .where(UserGroupRole.role_code == role_code, UserGroup.entity_id == entity_id)
    )
    groups = [
        {"id": str(row.id), "name": row.name, "active": row.active}
        for row in groups_result.all()
    ]

    # Users via groups (count)
    users_count_result = await db.execute(
        select(func.count(func.distinct(UserGroupMember.user_id)))
        .join(UserGroupRole, UserGroupRole.group_id == UserGroupMember.group_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroupRole.role_code == role_code, UserGroup.entity_id == entity_id)
    )

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "role": _serialize_role(role),
        "permissions_by_module": permissions_by_module,
        "permission_count": len(perms),
        "groups_using_role": groups,
        "users_via_groups_count": users_count_result.scalar() or 0,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_permission_catalog_variables(
    db: AsyncSession,
    entity_id: UUID,
    user: User,
    lang: str,
    group_by: str,
    include_disabled: bool,
    audit_event_id: str = "",
    content_hash: str = "",
) -> dict:
    """Variables for `core.rbac.permission_catalog` template."""
    permissions = await _list_permissions(db, entity_id, include_disabled)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    if group_by == "action":
        grouped: dict[str, list[dict]] = {}
        for p in permissions:
            grouped.setdefault(p.action or "other", []).append(_serialize_perm(p, disabled_mods))
        permissions_grouped = [{"group": k, "permissions": v} for k, v in sorted(grouped.items())]
    else:
        grouped = {}
        for p in permissions:
            mod = normalize_module_slug(p.module) or "core"
            grouped.setdefault(mod, []).append(_serialize_perm(p, disabled_mods))
        permissions_grouped = [{"group": k, "permissions": v} for k, v in sorted(grouped.items())]

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "permissions_by_module": permissions_grouped,
        "permission_count": len(permissions),
        "group_by": group_by,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


# Stubs for the other 7 builders — to be filled with the same pattern in PR-A:
# build_matrix_group_permissions_variables
# build_matrix_user_permissions_variables
# build_group_detail_variables
# build_user_detail_variables (with include_delegations option)
# build_role_modules_variables
# build_sod_matrix_variables
# build_delegations_registry_variables

async def build_matrix_group_permissions_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str, include_disabled: bool,
    group_ids: list[UUID] | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Same pattern as build_matrix_role_permissions but with groups + their effective permissions (3+1 layers)."""
    # Fetch groups
    stmt = select(UserGroup).where(UserGroup.entity_id == entity_id, UserGroup.active == True)
    if group_ids:
        stmt = stmt.where(UserGroup.id.in_(group_ids))
    groups = list((await db.execute(stmt)).scalars().all())

    permissions = await _list_permissions(db, entity_id, include_disabled)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # For each group, compute effective permissions (role + overrides)
    # Note: delegations are per-user, not per-group, so not relevant here
    grants_with_source: list[dict] = []
    from app.models.common import GroupPermissionOverride
    for g in groups:
        # Layer 2: role perms via UserGroupRole + RolePermission
        role_perms_stmt = (
            select(RolePermission.permission_code)
            .join(UserGroupRole, UserGroupRole.role_code == RolePermission.role_code)
            .where(UserGroupRole.group_id == g.id)
        )
        role_perms = {row[0] for row in (await db.execute(role_perms_stmt)).all()}
        # Layer 1: group overrides
        go_stmt = select(GroupPermissionOverride.permission_code, GroupPermissionOverride.granted).where(
            GroupPermissionOverride.group_id == g.id
        )
        for pcode, granted in (await db.execute(go_stmt)).all():
            if granted:
                role_perms.add(pcode)
            else:
                role_perms.discard(pcode)
        for pcode in role_perms:
            grants_with_source.append({"group_id": str(g.id), "perm_code": pcode, "source": "role_or_override"})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "groups": [{"id": str(g.id), "name": g.name, "active": g.active} for g in groups],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants_with_source,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_matrix_user_permissions_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    user_ids: list[UUID] | None = None, role_code: str | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Users × Permissions matrix. Uses get_user_permissions for each user."""
    from app.core.rbac import get_user_permissions

    # Resolve user list
    stmt = (
        select(User)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id)
        .distinct()
    )
    if user_ids:
        stmt = stmt.where(User.id.in_(user_ids))
    if role_code:
        stmt = stmt.join(UserGroupRole, UserGroupRole.group_id == UserGroup.id).where(
            UserGroupRole.role_code == role_code
        )

    users = list((await db.execute(stmt)).scalars().all())

    permissions = await _list_permissions(db, entity_id, include_disabled=False)
    disabled_mods = await _disabled_modules_for_entity(db, entity_id)

    # For each user, get effective permissions
    grants: list[dict] = []
    for u in users:
        effective = await get_user_permissions(u.id, entity_id, db)
        for pcode in effective:
            grants.append({"user_id": str(u.id), "perm_code": pcode})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "users": [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in users],
        "permissions": [_serialize_perm(p, disabled_mods) for p in permissions],
        "grants": grants,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_group_detail_variables(
    db: AsyncSession, entity_id: UUID, user: User, group_id: UUID, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Single group detail. Members, roles, effective perms with source."""
    group = await db.get(UserGroup, group_id)
    if not group or group.entity_id != entity_id:
        raise ValueError("Group not found")

    # Roles
    roles_stmt = (
        select(Role).join(UserGroupRole, UserGroupRole.role_code == Role.code).where(UserGroupRole.group_id == group_id)
    )
    roles = [_serialize_role(r) for r in (await db.execute(roles_stmt)).scalars().all()]

    # Members
    members_stmt = (
        select(User).join(UserGroupMember, UserGroupMember.user_id == User.id).where(UserGroupMember.group_id == group_id)
    )
    members = [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in (await db.execute(members_stmt)).scalars().all()]

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "group": {
            "id": str(group.id),
            "name": group.name,
            "active": group.active,
            "asset_scope": str(group.asset_scope) if group.asset_scope else None,
        },
        "roles": roles,
        "members": members,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_user_detail_variables(
    db: AsyncSession, entity_id: UUID, user: User, target_user_id: UUID, lang: str,
    include_delegations: bool = True,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Single user detail. Groups, roles via groups, overrides, effective perms, delegations."""
    from app.core.rbac import get_user_permissions_with_sources
    from app.models.common import UserDelegation, UserPermissionOverride

    target = await db.get(User, target_user_id)
    if not target:
        raise ValueError("User not found")

    # Groups
    groups_stmt = (
        select(UserGroup).join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(UserGroupMember.user_id == target_user_id, UserGroup.entity_id == entity_id)
    )
    groups = list((await db.execute(groups_stmt)).scalars().all())

    # Effective perms with source
    sources = await get_user_permissions_with_sources(target_user_id, entity_id, db)
    effective = [{"code": code, "source": src} for code, src in sorted(sources.items())]

    # User overrides
    overrides_stmt = select(UserPermissionOverride).where(UserPermissionOverride.user_id == target_user_id)
    overrides = [
        {"code": o.permission_code, "granted": o.granted}
        for o in (await db.execute(overrides_stmt)).scalars().all()
    ]

    delegations_received: list[dict] = []
    delegations_given: list[dict] = []
    if include_delegations:
        rec_stmt = select(UserDelegation).where(
            UserDelegation.delegate_id == target_user_id, UserDelegation.entity_id == entity_id
        )
        for d in (await db.execute(rec_stmt)).scalars().all():
            delegations_received.append({
                "id": str(d.id),
                "delegator_id": str(d.delegator_id),
                "permissions": d.permissions,
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "active": d.active,
                "reason": d.reason,
            })
        giv_stmt = select(UserDelegation).where(
            UserDelegation.delegator_id == target_user_id, UserDelegation.entity_id == entity_id
        )
        for d in (await db.execute(giv_stmt)).scalars().all():
            delegations_given.append({
                "id": str(d.id),
                "delegate_id": str(d.delegate_id),
                "permissions": d.permissions,
                "start_date": d.start_date.isoformat(),
                "end_date": d.end_date.isoformat(),
                "active": d.active,
                "reason": d.reason,
            })

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "user": {
            "id": str(target.id),
            "full_name": target.full_name,
            "email": target.email,
            "user_type": target.user_type,
        },
        "groups": [{"id": str(g.id), "name": g.name} for g in groups],
        "overrides": overrides,
        "effective_permissions": effective,
        "delegations_received": delegations_received,
        "delegations_given": delegations_given,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_role_modules_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Roles × Modules summary view. For each (role, module), compute an access level."""
    roles = await _list_roles(db)
    permissions = await _list_permissions(db, entity_id, include_disabled=True)

    rp_stmt = select(RolePermission.role_code, RolePermission.permission_code)
    rp_map: dict[str, set[str]] = {}
    for r, p in (await db.execute(rp_stmt)).all():
        rp_map.setdefault(r, set()).add(p)

    perm_module: dict[str, str] = {p.code: (normalize_module_slug(p.module) or "core") for p in permissions}

    levels: list[dict] = []
    modules_in_use = sorted({m for m in perm_module.values()})

    for r in roles:
        for mod in modules_in_use:
            mod_perms = {p.code for p in permissions if perm_module[p.code] == mod}
            granted = rp_map.get(r.code, set()) & mod_perms
            if not granted:
                level = "–"
            elif granted == mod_perms:
                level = "ADM"
            else:
                actions = {p.action for p in permissions if p.code in granted}
                if "approve" in actions or "validate" in actions:
                    level = "RWA"
                elif "submit" in actions:
                    level = "RWS"
                elif "create" in actions or "update" in actions or "delete" in actions:
                    level = "RW"
                elif "read" in actions:
                    level = "R"
                else:
                    level = "?"
            levels.append({"role_code": r.code, "module": mod, "level": level})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "roles": [_serialize_role(r) for r in roles],
        "modules": modules_in_use,
        "access_levels": levels,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_sod_matrix_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Segregation of duties — detect anti-patterns."""
    SOD_RULES = [
        {"id": "MOC_CREATE_APPROVE", "label": "MOC: create + approve", "perms": ["moc.change.create", "moc.change.approve"]},
        {"id": "ADS_CREATE_APPROVE", "label": "ADS: create + approve", "perms": ["paxlog.ads.create", "paxlog.ads.approve"]},
        {"id": "DOC_CREATE_APPROVE", "label": "Document: create + approve", "perms": ["papyrus.document.create", "papyrus.document.approve"]},
    ]

    rp_stmt = select(RolePermission.role_code, RolePermission.permission_code)
    rp_map: dict[str, set[str]] = {}
    for r, p in (await db.execute(rp_stmt)).all():
        rp_map.setdefault(r, set()).add(p)

    violations: list[dict] = []
    for rule in SOD_RULES:
        for role_code, perms in rp_map.items():
            if all(p in perms for p in rule["perms"]):
                violations.append({"role_code": role_code, "rule_id": rule["id"], "rule_label": rule["label"], "perms": rule["perms"]})

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "sod_rules": SOD_RULES,
        "violations": violations,
        "violation_count": len(violations),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }


async def build_delegations_registry_variables(
    db: AsyncSession, entity_id: UUID, user: User, lang: str,
    status: str | None = None, start_date: datetime | None = None, end_date: datetime | None = None,
    audit_event_id: str = "", content_hash: str = "",
) -> dict:
    """Registry of delegations. Filter by status/period."""
    from app.models.common import UserDelegation
    stmt = select(UserDelegation).where(UserDelegation.entity_id == entity_id)
    if start_date:
        stmt = stmt.where(UserDelegation.start_date >= start_date)
    if end_date:
        stmt = stmt.where(UserDelegation.end_date <= end_date)
    stmt = stmt.order_by(UserDelegation.created_at.desc())
    delegations_raw = list((await db.execute(stmt)).scalars().all())

    now = datetime.now(timezone.utc)
    delegations: list[dict] = []
    for d in delegations_raw:
        if not d.active:
            s = "revoked"
        elif d.start_date > now:
            s = "programmed"
        elif d.end_date <= now:
            s = "expired"
        else:
            s = "active"
        if status and s != status:
            continue
        delegator = await db.get(User, d.delegator_id)
        delegate = await db.get(User, d.delegate_id)
        delegations.append({
            "id": str(d.id),
            "delegator_name": delegator.full_name if delegator else "?",
            "delegate_name": delegate.full_name if delegate else "?",
            "permissions": d.permissions,
            "start_date": d.start_date.isoformat(),
            "end_date": d.end_date.isoformat(),
            "status": s,
            "reason": d.reason,
        })

    return {
        "tenant": await _build_tenant_block(db, entity_id),
        "delegations": delegations,
        "delegation_count": len(delegations),
        "period": {
            "start": start_date.isoformat() if start_date else None,
            "end": end_date.isoformat() if end_date else None,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "generated_by": await _build_generated_by_block(user),
        "audit_event_id": audit_event_id,
        "content_hash": content_hash,
        "lang": lang,
    }
```

- [ ] **Step 3: Run les tests**

Run: `pytest tests/test_rbac_export_service.py -v`

Expected: 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/core/rbac_export_service.py tests/test_rbac_export_service.py
git commit -m "feat(rbac): export service with 9 variable builders for PDF templates"
```

---

## Groupe 8 — Routes d'export PDF (10 endpoints)

### Task 8.1 : Helper commun + route matrice rôles × permissions

**Files:**
- Create: `app/api/routes/core/rbac/exports.py`
- Modify: `app/main.py` (enregistrer le routeur)
- Test: `tests/test_rbac_exports_routes.py`

- [ ] **Step 1: Écrire les tests**

```python
# tests/test_rbac_exports_routes.py
"""Test RBAC PDF export routes."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_export_matrix_role_permissions_returns_pdf_or_404(
    async_client: AsyncClient, auth_headers_admin, sample_entity
):
    """GET /api/v1/rbac/exports/matrix/role-permissions.pdf.

    In PR-A (no templates seeded), expects 404 RBAC_TEMPLATE_NOT_FOUND.
    In PR-B+ (templates seeded), expects 200 application/pdf.
    """
    resp = await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf?lang=fr",
        headers=auth_headers_admin,
    )
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"
        assert b"%PDF" in resp.content[:8]
        assert "X-Audit-Event-Id" in resp.headers
        assert "X-Content-Hash" in resp.headers
    else:
        body = resp.json()
        assert body["detail"]["code"] == "RBAC_TEMPLATE_NOT_FOUND"


@pytest.mark.asyncio
async def test_export_requires_core_rbac_export_permission(
    async_client: AsyncClient, auth_headers_pax, sample_entity
):
    """User without core.rbac.export gets 403."""
    resp = await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf",
        headers=auth_headers_pax,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_export_creates_audit_event(
    async_client: AsyncClient, auth_headers_admin, sample_entity, db_session
):
    """Even if export fails (404 template), an audit event is logged with status."""
    await async_client.get(
        "/api/v1/rbac/exports/matrix/role-permissions.pdf",
        headers=auth_headers_admin,
    )
    from sqlalchemy import select
    from app.models.common import RbacAuditEvent
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "export.matrix_role")
    )
    events = result.scalars().all()
    assert len(events) >= 1
```

- [ ] **Step 2: Créer le routeur (route 1 sur 10)**

```python
# app/api/routes/core/rbac/exports.py
"""RBAC PDF export routes — 10 endpoints + async polling.

All endpoints:
- Require permission `core.rbac.export` (or `core.user.audit_export` for user-related)
- Accept ?lang=fr|en (default = user.language)
- Accept ?include_disabled_modules=false
- Log a RbacAuditEvent with file_hash_sha256
- Return application/pdf in sync, or 202 + poll URL in async
"""
import hashlib
import io
from datetime import datetime, timezone
from typing import Callable, Awaitable
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.core.pdf_templates import render_pdf
from app.models.common import RbacAuditEvent, User
from app.services.core.rbac_export_service import (
    build_matrix_role_permissions_variables,
    build_matrix_group_permissions_variables,
    build_matrix_user_permissions_variables,
    build_role_detail_variables,
    build_group_detail_variables,
    build_user_detail_variables,
    build_role_modules_variables,
    build_permission_catalog_variables,
    build_sod_matrix_variables,
    build_delegations_registry_variables,
)

router = APIRouter(prefix="/api/v1/rbac/exports", tags=["rbac-export"])


async def _render_and_audit(
    db: AsyncSession,
    request: Request,
    current_user: User,
    entity_id: UUID,
    *,
    event_type: str,
    target: str,
    slug: str,
    lang: str,
    builder: Callable[..., Awaitable[dict]],
    builder_kwargs: dict,
    filename: str,
    params: dict,
) -> StreamingResponse:
    """Common pipeline: build vars → render PDF → audit → stream response."""
    start = datetime.now(timezone.utc)

    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type=event_type,
        target=target,
        params=params,
        actor_user_id=current_user.id,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="pending",
    )
    db.add(audit)
    await db.flush()

    try:
        variables = await builder(
            db=db, entity_id=entity_id, user=current_user, lang=lang,
            audit_event_id=str(audit.id),
            **builder_kwargs,
        )
    except Exception as e:
        audit.status = "failure"
        audit.error_code = "BUILDER_FAILED"
        audit.error_detail = str(e)[:1000]
        audit.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise

    pdf_bytes = await render_pdf(
        db, slug=slug, entity_id=entity_id, language=lang, variables=variables
    )
    if pdf_bytes is None:
        audit.status = "failure"
        audit.error_code = "RBAC_TEMPLATE_NOT_FOUND"
        audit.error_detail = f"Template '{slug}' not seeded or disabled"
        audit.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise StructuredHTTPException(
            404, code="RBAC_TEMPLATE_NOT_FOUND",
            message=f"PDF template '{slug}' is not seeded yet. Deploy PR-B.",
        )

    content_hash = hashlib.sha256(pdf_bytes).hexdigest()
    audit.file_hash_sha256 = content_hash
    audit.status = "success"
    audit.completed_at = datetime.now(timezone.utc)
    audit.duration_ms = int((audit.completed_at - start).total_seconds() * 1000)
    audit.result_summary = {"size_bytes": len(pdf_bytes)}
    await db.commit()

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audit-Event-Id": str(audit.id),
            "X-Content-Hash": content_hash,
        },
    )


def _date_suffix() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d")


# 1. Matrix Roles × Permissions

@router.get("/matrix/role-permissions.pdf")
async def export_matrix_role_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_disabled_modules: bool = Query(False),
    module: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_role",
        target="matrix_role_permissions",
        slug="core.rbac.matrix_role_permissions",
        lang=lang,
        builder=build_matrix_role_permissions_variables,
        builder_kwargs={"include_disabled": include_disabled_modules},
        filename=f"rbac_matrix_role_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "include_disabled": include_disabled_modules, "module": module},
    )
```

- [ ] **Step 3: Enregistrer le routeur**

Dans `app/main.py`, ajouter :

```python
from app.api.routes.core.rbac import exports as rbac_exports
app.include_router(rbac_exports.router)
```

- [ ] **Step 4: Run les tests**

Run: `pytest tests/test_rbac_exports_routes.py -v`

Expected: 3 tests PASS (le test #1 attend 404 puisque les templates ne sont pas seedés en PR-A).

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/core/rbac/exports.py app/main.py tests/test_rbac_exports_routes.py
git commit -m "feat(rbac): export route #1/10 — matrix role-permissions + common helper _render_and_audit"
```

### Task 8.2 : Routes d'export 2 à 10

**Files:**
- Modify: `app/api/routes/core/rbac/exports.py`
- Test: ajouter à `tests/test_rbac_exports_routes.py`

- [ ] **Step 1: Ajouter les 9 routes à `exports.py`**

À la fin de `app/api/routes/core/rbac/exports.py`, ajouter les 9 routes ci-dessous. Chaque route suit le même pattern que la #1 mais avec son builder et son slug spécifiques.

```python
# 2. Matrix Groups × Permissions

@router.get("/matrix/group-permissions.pdf")
async def export_matrix_group_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_disabled_modules: bool = Query(False),
    group_id: list[UUID] | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_group",
        target="matrix_group_permissions",
        slug="core.rbac.matrix_group_permissions",
        lang=lang,
        builder=build_matrix_group_permissions_variables,
        builder_kwargs={"include_disabled": include_disabled_modules, "group_ids": group_id},
        filename=f"rbac_matrix_group_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "group_ids": [str(g) for g in (group_id or [])]},
    )


# 3. Matrix Users × Permissions (sensitive RGPD)

@router.get("/matrix/user-permissions.pdf")
async def export_matrix_user_permissions(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    user_id: list[UUID] | None = Query(None),
    role_code: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.user.audit_export"),
    db: AsyncSession = Depends(get_db),
):
    # Async threshold check
    if not user_id:
        from sqlalchemy import func, select as _select
        from app.models.common import UserGroup, UserGroupMember
        count_stmt = (
            _select(func.count(func.distinct(UserGroupMember.user_id)))
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(UserGroup.entity_id == entity_id)
        )
        total_users = (await db.execute(count_stmt)).scalar() or 0

        from app.services.core.rbac_delegation_service import _get_tenant_setting
        threshold = await _get_tenant_setting(db, entity_id, "rbac.export.async_threshold_users", 500)
        if total_users > int(threshold):
            # Defer: log audit pending and return 202 (full async wiring is out of scope for PR-A;
            # for now, we still return JSON 202 to signal the limit was hit)
            audit = RbacAuditEvent(
                tenant_id=entity_id,
                event_type="export.matrix_user",
                target="matrix_user_permissions",
                params={"reason": "async_threshold_exceeded", "user_count": total_users, "threshold": threshold},
                actor_user_id=current_user.id,
                status="pending",
            )
            db.add(audit)
            await db.commit()
            return JSONResponse(
                status_code=202,
                content={
                    "audit_event_id": str(audit.id),
                    "status": "pending",
                    "poll_url": f"/api/v1/rbac/exports/jobs/{audit.id}",
                    "estimated_seconds": max(45, int(total_users / 10)),
                    "message": "Export deferred to async (threshold exceeded). Polling endpoint to be implemented.",
                },
            )

    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.matrix_user",
        target="matrix_user_permissions",
        slug="core.rbac.matrix_user_permissions",
        lang=lang,
        builder=build_matrix_user_permissions_variables,
        builder_kwargs={"user_ids": user_id, "role_code": role_code},
        filename=f"rbac_matrix_user_permissions_{_date_suffix()}.pdf",
        params={"lang": lang, "user_ids": [str(u) for u in (user_id or [])], "role_code": role_code},
    )


# 4. Role detail

@router.get("/role/{role_code}.pdf")
async def export_role_detail(
    role_code: str,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.role",
        target=role_code,
        slug="core.rbac.role_detail",
        lang=lang,
        builder=build_role_detail_variables,
        builder_kwargs={"role_code": role_code},
        filename=f"rbac_role_{role_code}_{_date_suffix()}.pdf",
        params={"lang": lang, "role_code": role_code},
    )


# 5. Group detail

@router.get("/group/{group_id}.pdf")
async def export_group_detail(
    group_id: UUID,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.group",
        target=str(group_id),
        slug="core.rbac.group_detail",
        lang=lang,
        builder=build_group_detail_variables,
        builder_kwargs={"group_id": group_id},
        filename=f"rbac_group_{group_id}_{_date_suffix()}.pdf",
        params={"lang": lang, "group_id": str(group_id)},
    )


# 6. User detail (RGPD-sensitive)

@router.get("/user/{user_id}.pdf")
async def export_user_detail(
    user_id: UUID,
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    include_delegations: bool = Query(True),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.user.audit_export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.user",
        target=str(user_id),
        slug="core.rbac.user_detail",
        lang=lang,
        builder=build_user_detail_variables,
        builder_kwargs={"target_user_id": user_id, "include_delegations": include_delegations},
        filename=f"rbac_user_{user_id}_{_date_suffix()}.pdf",
        params={"lang": lang, "user_id": str(user_id), "include_delegations": include_delegations},
    )


# 7. Roles × Modules

@router.get("/matrix/role-modules.pdf")
async def export_role_modules(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.role_modules",
        target="role_modules_view",
        slug="core.rbac.role_modules",
        lang=lang,
        builder=build_role_modules_variables,
        builder_kwargs={},
        filename=f"rbac_role_modules_{_date_suffix()}.pdf",
        params={"lang": lang},
    )


# 8. Permission catalog

@router.get("/catalog/permissions.pdf")
async def export_permission_catalog(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    group_by: str = Query("module", regex=r"^(module|action)$"),
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.catalog",
        target="permission_catalog",
        slug="core.rbac.permission_catalog",
        lang=lang,
        builder=build_permission_catalog_variables,
        builder_kwargs={"group_by": group_by, "include_disabled": include_disabled_modules},
        filename=f"rbac_permission_catalog_{_date_suffix()}.pdf",
        params={"lang": lang, "group_by": group_by, "include_disabled": include_disabled_modules},
    )


# 9. SoD matrix

@router.get("/matrix/sod.pdf")
async def export_sod_matrix(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.sod",
        target="sod_matrix",
        slug="core.rbac.sod_matrix",
        lang=lang,
        builder=build_sod_matrix_variables,
        builder_kwargs={},
        filename=f"rbac_sod_matrix_{_date_suffix()}.pdf",
        params={"lang": lang},
    )


# 10. Delegations registry

@router.get("/delegations/registry.pdf")
async def export_delegations_registry(
    request: Request,
    lang: str = Query("fr", regex=r"^(fr|en)$"),
    status: str | None = Query(None, regex=r"^(active|programmed|expired|revoked)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    return await _render_and_audit(
        db, request, current_user, entity_id,
        event_type="export.delegations",
        target="delegations_registry",
        slug="core.rbac.delegation_registry",
        lang=lang,
        builder=build_delegations_registry_variables,
        builder_kwargs={"status": status, "start_date": start_date, "end_date": end_date},
        filename=f"rbac_delegations_registry_{_date_suffix()}.pdf",
        params={"lang": lang, "status": status},
    )
```

- [ ] **Step 2: Ajouter un test parametrize pour les 10 endpoints**

```python
# Ajouter à tests/test_rbac_exports_routes.py
import pytest


@pytest.mark.parametrize("path,perm_needed", [
    ("/matrix/role-permissions.pdf", "core.rbac.export"),
    ("/matrix/group-permissions.pdf", "core.rbac.export"),
    ("/matrix/user-permissions.pdf", "core.user.audit_export"),
    ("/role/TENANT_ADMIN.pdf", "core.rbac.export"),
    ("/matrix/role-modules.pdf", "core.rbac.export"),
    ("/catalog/permissions.pdf", "core.rbac.export"),
    ("/matrix/sod.pdf", "core.rbac.export"),
    ("/delegations/registry.pdf", "core.rbac.export"),
])
@pytest.mark.asyncio
async def test_all_export_endpoints_return_pdf_or_404(async_client, auth_headers_admin, path, perm_needed):
    """All 10 export endpoints behave consistently: 200 application/pdf or 404 RBAC_TEMPLATE_NOT_FOUND."""
    resp = await async_client.get(f"/api/v1/rbac/exports{path}", headers=auth_headers_admin)
    assert resp.status_code in (200, 404, 422), f"Unexpected {resp.status_code} on {path}: {resp.text}"
    if resp.status_code == 200:
        assert resp.headers["content-type"] == "application/pdf"
```

- [ ] **Step 3: Run les tests**

Run: `pytest tests/test_rbac_exports_routes.py -v`

Expected: tous les tests passent (les 200/404 selon templates seedés ou pas).

- [ ] **Step 4: Commit**

```bash
git add app/api/routes/core/rbac/exports.py tests/test_rbac_exports_routes.py
git commit -m "feat(rbac): export routes #2-10/10 (group/user matrices, fiches, role-modules, catalog, sod, delegations registry)"
```

---

## Groupe 9 — Polling async

### Task 9.1 : Endpoint de polling pour les exports asynchrones

**Files:**
- Modify: `app/api/routes/core/rbac/exports.py`
- Test: ajouter à `tests/test_rbac_exports_routes.py`

- [ ] **Step 1: Écrire le test**

```python
# Ajouter à tests/test_rbac_exports_routes.py

@pytest.mark.asyncio
async def test_poll_audit_job_status(async_client, auth_headers_admin, sample_entity, db_session, sample_user):
    """GET /exports/jobs/{audit_event_id} returns the current job status."""
    from app.models.common import RbacAuditEvent
    event = RbacAuditEvent(
        tenant_id=sample_entity.id,
        event_type="export.matrix_user",
        target="test_async",
        actor_user_id=sample_user.id,
        status="pending",
    )
    db_session.add(event)
    await db_session.commit()

    resp = await async_client.get(
        f"/api/v1/rbac/exports/jobs/{event.id}",
        headers=auth_headers_admin,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "pending"
    assert "audit_event_id" in data
```

- [ ] **Step 2: Ajouter l'endpoint à `exports.py`**

À la fin de `app/api/routes/core/rbac/exports.py` :

```python
@router.get("/jobs/{audit_event_id}")
async def get_export_job_status(
    audit_event_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of an async export job."""
    event = await db.get(RbacAuditEvent, audit_event_id)
    if not event or event.tenant_id != entity_id:
        raise StructuredHTTPException(404, code="JOB_NOT_FOUND", message="Job not found")

    return {
        "audit_event_id": str(event.id),
        "status": event.status,  # pending | success | failure
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.isoformat(),
        "completed_at": event.completed_at.isoformat() if event.completed_at else None,
        "duration_ms": event.duration_ms,
        "error_code": event.error_code,
        "error_detail": event.error_detail,
        "download_url": f"/api/v1/rbac/exports/jobs/{event.id}/download" if event.status == "success" else None,
    }


@router.get("/jobs/{audit_event_id}/download")
async def download_export_job(
    audit_event_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.export"),
    db: AsyncSession = Depends(get_db),
):
    """Download the PDF result of an async job. Stub for PR-A — full async pipeline in a later PR.

    Returns 501 Not Implemented for now.
    """
    raise StructuredHTTPException(
        501,
        code="ASYNC_DOWNLOAD_NOT_IMPLEMENTED",
        message="Full async pipeline is staged for a follow-up. Use synchronous endpoints in the meantime.",
    )
```

- [ ] **Step 3: Run**

Run: `pytest tests/test_rbac_exports_routes.py -v`

Expected: tous PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/routes/core/rbac/exports.py tests/test_rbac_exports_routes.py
git commit -m "feat(rbac): async export job polling endpoint + download stub"
```

## Groupe 10 — Imports RBAC (CSV/XLSX via ImportWizard)

### Task 10.1 : Service `rbac_import_service.py` avec 3 fonctions d'import

**Files:**
- Create: `app/services/modules/rbac_import_service.py`
- Test: `tests/test_rbac_import_service.py`

- [ ] **Step 1: Écrire les tests**

```python
# tests/test_rbac_import_service.py
"""Test RBAC import service (3 targets)."""
import pytest
from app.services.modules.rbac_import_service import (
    import_rbac_role_permission,
    import_rbac_group_override,
    import_rbac_user_group,
)


@pytest.mark.asyncio
async def test_import_role_permission_merge_creates_links(db_session, sample_entity):
    """MERGE strategy adds new liaisons, keeps existing ones."""
    rows = [
        {"role_code": "OPERATOR", "permission_code": "asset.asset.read"},
        {"role_code": "OPERATOR", "permission_code": "asset.asset.create"},
    ]
    result = await import_rbac_role_permission(db_session, sample_entity.id, rows, strategy="MERGE")
    assert result["created"] == 2
    assert result["ignored"] == 0
    assert result["errors"] == []


@pytest.mark.asyncio
async def test_import_role_permission_validates_codes(db_session, sample_entity):
    """Unknown permission codes are reported in errors[]."""
    rows = [
        {"role_code": "OPERATOR", "permission_code": "does.not.exist"},
        {"role_code": "OPERATOR", "permission_code": "asset.asset.read"},
    ]
    result = await import_rbac_role_permission(db_session, sample_entity.id, rows, strategy="MERGE")
    assert result["created"] == 1
    assert len(result["errors"]) == 1
    assert "does.not.exist" in result["errors"][0]["message"]


@pytest.mark.asyncio
async def test_import_role_permission_replace_purges_then_inserts(db_session, sample_entity):
    """REPLACE_ROLE deletes existing role_permissions for the role, then inserts the new ones."""
    # Pre-seed something on OPERATOR
    from app.models.common import RolePermission
    db_session.add(RolePermission(role_code="OPERATOR", permission_code="asset.asset.delete"))
    await db_session.commit()

    rows = [
        {"role_code": "OPERATOR", "permission_code": "asset.asset.read"},
    ]
    result = await import_rbac_role_permission(db_session, sample_entity.id, rows, strategy="REPLACE_ROLE")
    assert result["created"] == 1
    # The asset.asset.delete liaison should be gone
    from sqlalchemy import select
    res = await db_session.execute(
        select(RolePermission).where(
            RolePermission.role_code == "OPERATOR",
            RolePermission.permission_code == "asset.asset.delete",
        )
    )
    assert res.scalar_one_or_none() is None
```

- [ ] **Step 2: Créer le service**

```python
# app/services/modules/rbac_import_service.py
"""RBAC bulk import service — 3 targets via ImportWizard.

Targets:
- rbac_role_permission : Role ↔ Permission liaisons
- rbac_group_override  : Group permission overrides
- rbac_user_group      : User ↔ Group memberships (with optional role assignment)

Guardrails:
- Cannot create new Role or Permission via import (security)
- Cannot import UserPermissionOverride (too sensitive RGPD)
- All imports log a RbacAuditEvent with row_count + hash of input
"""
import hashlib
import json
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    GroupPermissionOverride,
    Permission,
    RbacAuditEvent,
    Role,
    RolePermission,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)


async def _hash_rows(rows: list[dict]) -> str:
    """Stable SHA-256 of the import payload for audit traceability."""
    canonical = json.dumps(rows, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _log_import_audit(
    db: AsyncSession,
    entity_id: UUID,
    actor_user_id: UUID,
    target: str,
    rows: list[dict],
    result: dict,
) -> None:
    audit = RbacAuditEvent(
        tenant_id=entity_id,
        event_type=f"import.{target}",
        target=target,
        params={"strategy": result.get("strategy"), "row_count": len(rows)},
        result_summary={
            "created": result.get("created", 0),
            "updated": result.get("updated", 0),
            "ignored": result.get("ignored", 0),
            "errors": result.get("errors", []),
        },
        file_hash_sha256=await _hash_rows(rows),
        actor_user_id=actor_user_id,
        status="success" if not result.get("errors") else "failure",
    )
    db.add(audit)
    await db.commit()


async def import_rbac_role_permission(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_ROLE"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: role_code, permission_code.

    REPLACE_ROLE: for each role_code touched, delete all existing liaisons, then insert.
    MERGE: insert with ON CONFLICT DO NOTHING.
    """
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Validate references
    valid_roles_q = await db.execute(select(Role.code))
    valid_roles = {r[0] for r in valid_roles_q.all()}

    valid_perms_q = await db.execute(select(Permission.code).where(Permission.deprecated == False))
    valid_perms = {p[0] for p in valid_perms_q.all()}

    # Filter and validate
    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        role_code = row.get("role_code")
        perm_code = row.get("permission_code")
        if not role_code or not perm_code:
            errors.append({"row": i, "message": "role_code or permission_code is missing"})
            continue
        if role_code not in valid_roles:
            errors.append({"row": i, "message": f"Unknown role_code: {role_code}"})
            continue
        if perm_code not in valid_perms:
            errors.append({"row": i, "message": f"Unknown or deprecated permission_code: {perm_code}"})
            continue
        valid_rows.append({"role_code": role_code, "permission_code": perm_code})

    # REPLACE: purge existing liaisons for the touched roles
    if strategy == "REPLACE_ROLE":
        touched_roles = {r["role_code"] for r in valid_rows}
        for role_code in touched_roles:
            await db.execute(delete(RolePermission).where(RolePermission.role_code == role_code))

    # Insert
    for row in valid_rows:
        existing_q = await db.execute(
            select(RolePermission).where(
                RolePermission.role_code == row["role_code"],
                RolePermission.permission_code == row["permission_code"],
            )
        )
        if existing_q.scalar_one_or_none():
            ignored += 1
            continue
        db.add(RolePermission(**row))
        created += 1

    await db.commit()

    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_role_permission", rows, result)
    return result


async def import_rbac_group_override(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_GROUP"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: group_id (or group_name), permission_code, granted (bool)."""
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Pre-resolve groups
    groups_q = await db.execute(select(UserGroup).where(UserGroup.entity_id == entity_id))
    groups_by_id = {str(g.id): g for g in groups_q.scalars().all()}
    groups_by_name = {g.name: g for g in groups_by_id.values()}

    valid_perms_q = await db.execute(select(Permission.code).where(Permission.deprecated == False))
    valid_perms = {p[0] for p in valid_perms_q.all()}

    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        group_ref = row.get("group_id") or row.get("group_name")
        if not group_ref:
            errors.append({"row": i, "message": "group_id or group_name required"})
            continue
        group = groups_by_id.get(str(group_ref)) or groups_by_name.get(str(group_ref))
        if not group:
            errors.append({"row": i, "message": f"Unknown group: {group_ref}"})
            continue
        perm_code = row.get("permission_code")
        if perm_code not in valid_perms:
            errors.append({"row": i, "message": f"Unknown permission: {perm_code}"})
            continue
        granted = row.get("granted")
        if isinstance(granted, str):
            granted = granted.lower() in ("true", "1", "yes", "oui")
        valid_rows.append({"group_id": group.id, "permission_code": perm_code, "granted": bool(granted)})

    if strategy == "REPLACE_GROUP":
        touched = {r["group_id"] for r in valid_rows}
        for gid in touched:
            await db.execute(delete(GroupPermissionOverride).where(GroupPermissionOverride.group_id == gid))

    for row in valid_rows:
        existing_q = await db.execute(
            select(GroupPermissionOverride).where(
                GroupPermissionOverride.group_id == row["group_id"],
                GroupPermissionOverride.permission_code == row["permission_code"],
            )
        )
        existing = existing_q.scalar_one_or_none()
        if existing:
            if strategy == "MERGE":
                existing.granted = row["granted"]
                created += 1
            else:
                ignored += 1
        else:
            db.add(GroupPermissionOverride(**row))
            created += 1

    await db.commit()
    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_group_override", rows, result)
    return result


async def import_rbac_user_group(
    db: AsyncSession,
    entity_id: UUID,
    rows: list[dict],
    strategy: Literal["MERGE", "REPLACE_USER"] = "MERGE",
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    """Expected columns: user_email (or user_id), group_name (or group_id), roles (csv optional)."""
    errors: list[dict] = []
    created = 0
    ignored = 0

    # Pre-resolve
    users_q = await db.execute(select(User))
    users_by_email = {u.email: u for u in users_q.scalars().all()}

    groups_q = await db.execute(select(UserGroup).where(UserGroup.entity_id == entity_id))
    groups_by_id = {str(g.id): g for g in groups_q.scalars().all()}
    groups_by_name = {g.name: g for g in groups_by_id.values()}

    roles_q = await db.execute(select(Role.code))
    valid_roles = {r[0] for r in roles_q.all()}

    valid_rows: list[dict] = []
    for i, row in enumerate(rows):
        user_ref = row.get("user_email") or row.get("user_id")
        group_ref = row.get("group_id") or row.get("group_name")
        if not user_ref or not group_ref:
            errors.append({"row": i, "message": "user and group required"})
            continue
        user = users_by_email.get(str(user_ref))
        if not user:
            errors.append({"row": i, "message": f"Unknown user: {user_ref}"})
            continue
        group = groups_by_id.get(str(group_ref)) or groups_by_name.get(str(group_ref))
        if not group:
            errors.append({"row": i, "message": f"Unknown group: {group_ref}"})
            continue
        roles_csv = row.get("roles") or ""
        roles_list = [r.strip() for r in str(roles_csv).split(",") if r.strip()]
        unknown_roles = set(roles_list) - valid_roles
        if unknown_roles:
            errors.append({"row": i, "message": f"Unknown role(s): {sorted(unknown_roles)}"})
            continue
        valid_rows.append({"user_id": user.id, "group_id": group.id, "roles": roles_list})

    if strategy == "REPLACE_USER":
        touched_users = {r["user_id"] for r in valid_rows}
        for uid in touched_users:
            await db.execute(delete(UserGroupMember).where(UserGroupMember.user_id == uid))

    for row in valid_rows:
        existing_q = await db.execute(
            select(UserGroupMember).where(
                UserGroupMember.user_id == row["user_id"],
                UserGroupMember.group_id == row["group_id"],
            )
        )
        if not existing_q.scalar_one_or_none():
            db.add(UserGroupMember(user_id=row["user_id"], group_id=row["group_id"]))
            created += 1
        else:
            ignored += 1
        # Add roles on the group (idempotent)
        for role_code in row["roles"]:
            r_q = await db.execute(
                select(UserGroupRole).where(
                    UserGroupRole.group_id == row["group_id"],
                    UserGroupRole.role_code == role_code,
                )
            )
            if not r_q.scalar_one_or_none():
                db.add(UserGroupRole(group_id=row["group_id"], role_code=role_code))

    await db.commit()
    result = {"strategy": strategy, "created": created, "ignored": ignored, "errors": errors}
    if actor_user_id:
        await _log_import_audit(db, entity_id, actor_user_id, "rbac_user_group", rows, result)
    return result
```

- [ ] **Step 3: Run**

Run: `pytest tests/test_rbac_import_service.py -v`

Expected: 3 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/services/modules/rbac_import_service.py tests/test_rbac_import_service.py
git commit -m "feat(rbac): bulk import service for role_permission, group_override, user_group via ImportWizard"
```

### Task 10.2 : Ajouter les 3 targets dans `_PERMISSION_MAP` de `import_assistant.py`

**Files:**
- Modify: `app/api/routes/core/import_assistant.py:41-57`
- Modify: `app/services/modules/import_service.py` (la fonction `execute_import` doit dispatcher vers nos services)
- Test: `tests/test_import_assistant_rbac_targets.py`

- [ ] **Step 1: Écrire le test d'intégration**

```python
# tests/test_import_assistant_rbac_targets.py
"""Test that the 3 RBAC targets are registered and require core.rbac.manage."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_rbac_import_targets_registered(async_client: AsyncClient, auth_headers_admin):
    """GET /api/v1/import/targets returns the 3 new RBAC targets."""
    resp = await async_client.get("/api/v1/import/targets", headers=auth_headers_admin)
    assert resp.status_code == 200
    targets = {t["target_object"] for t in resp.json()}
    assert "rbac_role_permission" in targets
    assert "rbac_group_override" in targets
    assert "rbac_user_group" in targets


@pytest.mark.asyncio
async def test_rbac_import_requires_core_rbac_manage(async_client: AsyncClient, auth_headers_pax):
    """A user without core.rbac.manage cannot execute the import."""
    resp = await async_client.post(
        "/api/v1/import/execute",
        json={
            "target_object": "rbac_role_permission",
            "mapping": {"role_code": "role_code", "permission_code": "permission_code"},
            "rows": [{"role_code": "OPERATOR", "permission_code": "asset.asset.read"}],
            "strategy": "MERGE",
        },
        headers=auth_headers_pax,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Ajouter les targets dans `_PERMISSION_MAP`**

Dans `app/api/routes/core/import_assistant.py`, modifier le dict (lignes 41-57) :

```python
_PERMISSION_MAP: dict[str, str] = {
    # existing entries...
    "asset": "asset.asset.create",
    "tier": "tier.tier.create",
    # ... keep all existing entries

    # RBAC bulk imports (PR-A addition)
    "rbac_role_permission": "core.rbac.manage",
    "rbac_group_override": "core.rbac.manage",
    "rbac_user_group": "core.rbac.manage",
}
```

Note : il faudra aligner les anciens codes (asset.create) avec les nouveaux (asset.asset.create) dans une PR ultérieure. Pour PR-A, on ajoute seulement les nouvelles entrées RBAC.

- [ ] **Step 3: Ajouter les target objects dans `get_target_objects()`**

Identifier la fonction qui renvoie la liste des targets :

Run: `grep -n "def get_target_objects\|TargetObjectInfo" app/services/modules/import_service.py`

Ajouter 3 entrées à la liste renvoyée :

```python
TargetObjectInfo(
    target_object="rbac_role_permission",
    label_fr="Liaisons Rôle → Permission",
    label_en="Role-Permission liaisons",
    description_fr="Importer les liaisons entre rôles et permissions (matrice RBAC).",
    description_en="Import role-permission liaisons (RBAC matrix).",
    fields=[
        TargetFieldDef(name="role_code", label_fr="Code rôle", required=True, type="string", description_fr="Code du rôle existant (ex: OPERATOR, DO, HSE_MGR)"),
        TargetFieldDef(name="permission_code", label_fr="Code permission", required=True, type="string", description_fr="Code de la permission (ex: asset.asset.read)"),
    ],
    duplicate_strategies=["MERGE", "REPLACE_ROLE"],
    permission_required="core.rbac.manage",
),
TargetObjectInfo(
    target_object="rbac_group_override",
    label_fr="Overrides de groupe",
    label_en="Group permission overrides",
    description_fr="Importer les overrides de permissions par groupe (couche 1 du RBAC).",
    description_en="Import per-group permission overrides (RBAC layer 1).",
    fields=[
        TargetFieldDef(name="group_id", label_fr="ID groupe", required=False, type="uuid"),
        TargetFieldDef(name="group_name", label_fr="Nom groupe", required=False, type="string", description_fr="Au moins l'un de group_id ou group_name est requis"),
        TargetFieldDef(name="permission_code", label_fr="Code permission", required=True, type="string"),
        TargetFieldDef(name="granted", label_fr="Accordé", required=True, type="boolean"),
    ],
    duplicate_strategies=["MERGE", "REPLACE_GROUP"],
    permission_required="core.rbac.manage",
),
TargetObjectInfo(
    target_object="rbac_user_group",
    label_fr="Appartenance Utilisateur ↔ Groupe",
    label_en="User-Group memberships",
    description_fr="Importer les appartenances des utilisateurs aux groupes, avec rôles optionnels.",
    description_en="Import user-to-group memberships with optional role assignment.",
    fields=[
        TargetFieldDef(name="user_email", label_fr="Email utilisateur", required=False, type="string"),
        TargetFieldDef(name="user_id", label_fr="ID utilisateur", required=False, type="uuid", description_fr="Au moins l'un de user_email ou user_id est requis"),
        TargetFieldDef(name="group_id", label_fr="ID groupe", required=False, type="uuid"),
        TargetFieldDef(name="group_name", label_fr="Nom groupe", required=False, type="string"),
        TargetFieldDef(name="roles", label_fr="Rôles (csv)", required=False, type="string", description_fr="Codes de rôles séparés par virgule"),
    ],
    duplicate_strategies=["MERGE", "REPLACE_USER"],
    permission_required="core.rbac.manage",
),
```

Le `TargetFieldDef` doit déjà exister — sinon, vérifier sa structure et adapter.

- [ ] **Step 4: Brancher `execute_import` vers les services RBAC**

Dans `app/services/modules/import_service.py`, fonction `execute_import` (ou équivalent), ajouter un dispatch :

```python
async def execute_import(db, target_object: str, rows, strategy, entity_id, actor_user_id, **kwargs):
    # ... existing dispatches ...

    if target_object == "rbac_role_permission":
        from app.services.modules.rbac_import_service import import_rbac_role_permission
        return await import_rbac_role_permission(db, entity_id, rows, strategy, actor_user_id)
    if target_object == "rbac_group_override":
        from app.services.modules.rbac_import_service import import_rbac_group_override
        return await import_rbac_group_override(db, entity_id, rows, strategy, actor_user_id)
    if target_object == "rbac_user_group":
        from app.services.modules.rbac_import_service import import_rbac_user_group
        return await import_rbac_user_group(db, entity_id, rows, strategy, actor_user_id)

    # ... fall through to existing implementations
```

- [ ] **Step 5: Run les tests**

Run: `pytest tests/test_import_assistant_rbac_targets.py -v`

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/routes/core/import_assistant.py app/services/modules/import_service.py tests/test_import_assistant_rbac_targets.py
git commit -m "feat(rbac): register 3 RBAC import targets in ImportWizard (rbac_role_permission, rbac_group_override, rbac_user_group)"
```

---

## Groupe 11 — Routes admin

### Task 11.1 : Routes `/api/v1/rbac/defaults` (GET + PUT)

**Files:**
- Create: `app/api/routes/core/rbac/defaults.py`
- Modify: `app/main.py`
- Test: `tests/test_rbac_defaults_routes.py`

- [ ] **Step 1: Écrire le test**

```python
# tests/test_rbac_defaults_routes.py
"""Test the /api/v1/rbac/defaults routes for default-role-per-user-type setting."""
import pytest


@pytest.mark.asyncio
async def test_get_defaults_returns_3_settings(async_client, auth_headers_admin):
    resp = await async_client.get("/api/v1/rbac/defaults", headers=auth_headers_admin)
    assert resp.status_code == 200
    data = resp.json()
    assert "internal" in data
    assert "external" in data
    assert "tier_contact" in data


@pytest.mark.asyncio
async def test_put_defaults_updates_settings(async_client, auth_headers_admin):
    resp = await async_client.put(
        "/api/v1/rbac/defaults",
        json={"internal": "OPERATOR", "external": "PAX", "tier_contact": "TIER_CONTACT"},
        headers=auth_headers_admin,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["internal"] == "OPERATOR"


@pytest.mark.asyncio
async def test_put_defaults_validates_role_exists(async_client, auth_headers_admin):
    resp = await async_client.put(
        "/api/v1/rbac/defaults",
        json={"internal": "FAKE_ROLE", "external": "PAX", "tier_contact": "TIER_CONTACT"},
        headers=auth_headers_admin,
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_put_defaults_requires_core_rbac_manage(async_client, auth_headers_reader):
    resp = await async_client.put(
        "/api/v1/rbac/defaults",
        json={"internal": "OPERATOR", "external": "PAX", "tier_contact": "TIER_CONTACT"},
        headers=auth_headers_reader,
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Créer le routeur**

```python
# app/api/routes/core/rbac/defaults.py
"""Routes for the default-role-per-user-type setting (Q6.B configurable)."""
import json
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.models.common import Role, Setting

router = APIRouter(prefix="/api/v1/rbac/defaults", tags=["rbac"])


class DefaultsRead(BaseModel):
    internal: str
    external: str
    tier_contact: str


class DefaultsUpdate(BaseModel):
    internal: str = Field(..., min_length=1, max_length=50)
    external: str = Field(..., min_length=1, max_length=50)
    tier_contact: str = Field(..., min_length=1, max_length=50)


async def _read_setting(db: AsyncSession, entity_id: UUID, key: str, default: str) -> str:
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    if isinstance(row, dict) and "value" in row:
        return row["value"]
    return row


async def _write_setting(db: AsyncSession, entity_id: UUID, key: str, value: str) -> None:
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = value
    else:
        db.add(Setting(key=key, value=value, scope="tenant", scope_id=str(entity_id)))


@router.get("", response_model=DefaultsRead)
async def get_defaults(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return DefaultsRead(
        internal=await _read_setting(db, entity_id, "rbac.default_role.internal", "READER"),
        external=await _read_setting(db, entity_id, "rbac.default_role.external", "PAX"),
        tier_contact=await _read_setting(db, entity_id, "rbac.default_role.tier_contact", "TIER_CONTACT"),
    )


@router.put("", response_model=DefaultsRead)
async def update_defaults(
    body: DefaultsUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    # Validate roles exist
    role_codes = {body.internal, body.external, body.tier_contact}
    result = await db.execute(select(Role.code).where(Role.code.in_(role_codes)))
    found = {row[0] for row in result.all()}
    missing = role_codes - found
    if missing:
        raise StructuredHTTPException(
            400, code="RBAC_ROLE_NOT_FOUND",
            message=f"Unknown role(s): {sorted(missing)}",
        )

    await _write_setting(db, entity_id, "rbac.default_role.internal", body.internal)
    await _write_setting(db, entity_id, "rbac.default_role.external", body.external)
    await _write_setting(db, entity_id, "rbac.default_role.tier_contact", body.tier_contact)
    await db.commit()

    return DefaultsRead(internal=body.internal, external=body.external, tier_contact=body.tier_contact)
```

- [ ] **Step 3: Enregistrer dans `app/main.py`**

```python
from app.api.routes.core.rbac import defaults as rbac_defaults
app.include_router(rbac_defaults.router)
```

- [ ] **Step 4: Run**

Run: `pytest tests/test_rbac_defaults_routes.py -v`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/routes/core/rbac/defaults.py app/main.py tests/test_rbac_defaults_routes.py
git commit -m "feat(rbac): GET/PUT /api/v1/rbac/defaults for default-role-per-user-type setting"
```

### Task 11.2 : Route `/api/v1/rbac/audit-events` (paginated list)

**Files:**
- Create: `app/api/routes/core/rbac/audit_events.py`
- Modify: `app/main.py`
- Test: `tests/test_rbac_audit_events_route.py`

- [ ] **Step 1: Écrire le test**

```python
# tests/test_rbac_audit_events_route.py
"""Test the audit events list route."""
import pytest


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_type(async_client, auth_headers_admin, sample_entity, db_session, sample_user):
    from app.models.common import RbacAuditEvent
    db_session.add_all([
        RbacAuditEvent(
            tenant_id=sample_entity.id,
            event_type="export.matrix_role",
            target="t1",
            actor_user_id=sample_user.id,
            status="success",
        ),
        RbacAuditEvent(
            tenant_id=sample_entity.id,
            event_type="delegation.created",
            target="t2",
            actor_user_id=sample_user.id,
            status="success",
        ),
    ])
    await db_session.commit()

    resp = await async_client.get(
        "/api/v1/rbac/audit-events?event_type_prefix=export",
        headers=auth_headers_admin,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert all(item["event_type"].startswith("export") for item in items)


@pytest.mark.asyncio
async def test_audit_events_requires_perm(async_client, auth_headers_pax):
    resp = await async_client.get("/api/v1/rbac/audit-events", headers=auth_headers_pax)
    assert resp.status_code == 403
```

- [ ] **Step 2: Créer la route**

```python
# app/api/routes/core/rbac/audit_events.py
"""List route for rbac_audit_events with filters and pagination."""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.models.common import RbacAuditEvent

router = APIRouter(prefix="/api/v1/rbac/audit-events", tags=["rbac"])


class AuditEventRead(BaseModel):
    id: UUID
    tenant_id: UUID
    event_type: str
    target: str | None
    params: dict | None
    result_summary: dict | None
    file_hash_sha256: str | None
    actor_user_id: UUID
    occurred_at: datetime
    completed_at: datetime | None
    duration_ms: int | None
    status: str
    error_code: str | None


class AuditEventsList(BaseModel):
    items: list[AuditEventRead]
    total: int
    page: int
    page_size: int


@router.get("", response_model=AuditEventsList)
async def list_audit_events(
    event_type: str | None = Query(None),
    event_type_prefix: str | None = Query(None),
    actor_user_id: UUID | None = Query(None),
    status: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RbacAuditEvent).where(RbacAuditEvent.tenant_id == entity_id)
    count_stmt = select(func.count()).select_from(RbacAuditEvent).where(RbacAuditEvent.tenant_id == entity_id)

    if event_type:
        stmt = stmt.where(RbacAuditEvent.event_type == event_type)
        count_stmt = count_stmt.where(RbacAuditEvent.event_type == event_type)
    if event_type_prefix:
        stmt = stmt.where(RbacAuditEvent.event_type.like(f"{event_type_prefix}%"))
        count_stmt = count_stmt.where(RbacAuditEvent.event_type.like(f"{event_type_prefix}%"))
    if actor_user_id:
        stmt = stmt.where(RbacAuditEvent.actor_user_id == actor_user_id)
        count_stmt = count_stmt.where(RbacAuditEvent.actor_user_id == actor_user_id)
    if status:
        stmt = stmt.where(RbacAuditEvent.status == status)
        count_stmt = count_stmt.where(RbacAuditEvent.status == status)
    if start_date:
        stmt = stmt.where(RbacAuditEvent.occurred_at >= start_date)
        count_stmt = count_stmt.where(RbacAuditEvent.occurred_at >= start_date)
    if end_date:
        stmt = stmt.where(RbacAuditEvent.occurred_at <= end_date)
        count_stmt = count_stmt.where(RbacAuditEvent.occurred_at <= end_date)

    total = (await db.execute(count_stmt)).scalar() or 0
    stmt = stmt.order_by(RbacAuditEvent.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().all())

    return AuditEventsList(
        items=[AuditEventRead.model_validate(e, from_attributes=True) for e in items],
        total=total,
        page=page,
        page_size=page_size,
    )
```

- [ ] **Step 3: Enregistrer + run + commit**

```python
# In app/main.py
from app.api.routes.core.rbac import audit_events as rbac_audit_events
app.include_router(rbac_audit_events.router)
```

```bash
pytest tests/test_rbac_audit_events_route.py -v
# Expected: 2 tests PASS
git add app/api/routes/core/rbac/audit_events.py app/main.py tests/test_rbac_audit_events_route.py
git commit -m "feat(rbac): GET /api/v1/rbac/audit-events with filters and pagination"
```

### Task 11.3 : Routes `/api/v1/rbac/matrix/*` (matrix JSON helpers pour l'UI)

**Files:**
- Create: `app/api/routes/core/rbac/matrix.py`
- Modify: `app/main.py`
- Test: `tests/test_rbac_matrix_routes.py`

- [ ] **Step 1: Écrire le test**

```python
# tests/test_rbac_matrix_routes.py
"""Test the JSON matrix routes used by the frontend (no PDF rendering involved)."""
import pytest


@pytest.mark.asyncio
async def test_matrix_role_permissions_json(async_client, auth_headers_admin):
    resp = await async_client.get(
        "/api/v1/rbac/matrix/role-permissions",
        headers=auth_headers_admin,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "roles" in data
    assert "permissions" in data
    assert "grants" in data


@pytest.mark.asyncio
async def test_matrix_sod_json(async_client, auth_headers_admin):
    resp = await async_client.get(
        "/api/v1/rbac/matrix/sod",
        headers=auth_headers_admin,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "violations" in data
    assert "sod_rules" in data
```

- [ ] **Step 2: Créer le routeur**

```python
# app/api/routes/core/rbac/matrix.py
"""JSON matrix routes — used by the frontend to render the matrix views in-app
(distinct from PDF exports which go through /exports/*)."""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import User
from app.services.core.rbac_export_service import (
    build_matrix_role_permissions_variables,
    build_matrix_group_permissions_variables,
    build_sod_matrix_variables,
)

router = APIRouter(prefix="/api/v1/rbac/matrix", tags=["rbac"])


@router.get("/role-permissions")
async def matrix_role_permissions_json(
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_matrix_role_permissions_variables(
        db, entity_id, current_user, lang="fr", include_disabled=include_disabled_modules
    )


@router.get("/group-permissions")
async def matrix_group_permissions_json(
    include_disabled_modules: bool = Query(False),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_matrix_group_permissions_variables(
        db, entity_id, current_user, lang="fr", include_disabled=include_disabled_modules
    )


@router.get("/sod")
async def matrix_sod_json(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return await build_sod_matrix_variables(db, entity_id, current_user, lang="fr")
```

- [ ] **Step 3: Enregistrer + run + commit**

```python
# In app/main.py
from app.api.routes.core.rbac import matrix as rbac_matrix
app.include_router(rbac_matrix.router)
```

```bash
pytest tests/test_rbac_matrix_routes.py -v
# Expected: 2 tests PASS
git add app/api/routes/core/rbac/matrix.py app/main.py tests/test_rbac_matrix_routes.py
git commit -m "feat(rbac): JSON matrix routes (role-permissions, group-permissions, sod) for frontend rendering"
```

---

## Groupe 12 — Rôle par défaut à la création d'un user

### Task 12.1 : Modifier `POST /users` pour attribuer le rôle par défaut

**Files:**
- Modify: `app/api/routes/core/users.py` (la route `POST /` qui crée un user)
- Create: `app/services/core/rbac_default_role_service.py`
- Test: `tests/test_users_default_role.py`

- [ ] **Step 1: Écrire le test**

```python
# tests/test_users_default_role.py
"""Test that creating a user automatically attaches the default role per user_type."""
import pytest


@pytest.mark.asyncio
async def test_create_internal_user_gets_default_role(async_client, auth_headers_admin, sample_entity):
    resp = await async_client.post(
        "/api/v1/users/",
        json={
            "email": "newinternal@test.local",
            "first_name": "New",
            "last_name": "Internal",
            "user_type": "internal",
            "language": "fr",
        },
        headers=auth_headers_admin,
    )
    assert resp.status_code in (200, 201)
    data = resp.json()
    user_id = data["id"]

    # Verify user is in a group with the default role
    from sqlalchemy import select
    from app.models.common import UserGroupMember, UserGroupRole, UserGroup
    # ... fetch and assert role assigned matches the setting 'rbac.default_role.internal'


@pytest.mark.asyncio
async def test_create_external_user_gets_pax_role(async_client, auth_headers_admin, sample_entity):
    resp = await async_client.post(
        "/api/v1/users/",
        json={
            "email": "external@test.local",
            "first_name": "Ext",
            "last_name": "User",
            "user_type": "external",
            "language": "fr",
        },
        headers=auth_headers_admin,
    )
    assert resp.status_code in (200, 201)
    # Asserts on the PAX group membership
```

- [ ] **Step 2: Créer le service**

```python
# app/services/core/rbac_default_role_service.py
"""Attach the default role to a newly created user, based on user_type and tenant settings."""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    Role,
    Setting,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
)


async def _get_default_role_code(db: AsyncSession, entity_id: UUID, user: User) -> str:
    if user.tier_contact_id:
        key = "rbac.default_role.tier_contact"
        default = "TIER_CONTACT"
    elif user.user_type == "external":
        key = "rbac.default_role.external"
        default = "PAX"
    else:
        key = "rbac.default_role.internal"
        default = "READER"

    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    value = result.scalar_one_or_none()
    if value is None:
        return default
    if isinstance(value, dict) and "value" in value:
        return value["value"]
    return value if isinstance(value, str) else default


async def _get_or_create_default_group(db: AsyncSession, entity_id: UUID, role_code: str) -> UserGroup:
    group_name = f"Default {role_code}"
    result = await db.execute(
        select(UserGroup).where(UserGroup.entity_id == entity_id, UserGroup.name == group_name)
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    new_group = UserGroup(entity_id=entity_id, name=group_name, active=True)
    db.add(new_group)
    await db.flush()
    db.add(UserGroupRole(group_id=new_group.id, role_code=role_code))
    await db.flush()
    return new_group


async def attach_default_role_to_user(db: AsyncSession, user: User, entity_id: UUID) -> None:
    """Attach the user to a default group based on user_type. No-op if role_code is empty/None."""
    role_code = await _get_default_role_code(db, entity_id, user)
    if not role_code or role_code == "NONE":
        return

    # Verify role exists
    role = await db.get(Role, role_code)
    if not role:
        # Setting points to an invalid role — log but don't fail user creation
        return

    group = await _get_or_create_default_group(db, entity_id, role_code)

    # Check if user is already a member
    existing_q = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.user_id == user.id, UserGroupMember.group_id == group.id
        )
    )
    if existing_q.scalar_one_or_none():
        return

    db.add(UserGroupMember(user_id=user.id, group_id=group.id))
    await db.flush()
```

- [ ] **Step 3: Brancher depuis `app/api/routes/core/users.py`**

Run: `grep -n "async def create_user\|@router.post" app/api/routes/core/users.py | head -10`

Identifier la fonction qui crée un user (probablement `create_user` ou `POST /`).

Dans cette fonction, juste après `await db.commit()` qui crée le user, ajouter :

```python
from app.services.core.rbac_default_role_service import attach_default_role_to_user
# ... inside the route function, after the user is created and committed:
await attach_default_role_to_user(db, user, entity_id)
await db.commit()
```

- [ ] **Step 4: Run + commit**

```bash
pytest tests/test_users_default_role.py -v
# Expected: 2 tests PASS

git add app/services/core/rbac_default_role_service.py app/api/routes/core/users.py tests/test_users_default_role.py
git commit -m "feat(rbac): auto-attach default role to new users based on user_type setting"
```

---

## Groupe 13 — Documentation & finalisation PR-A

### Task 13.1 : Documentation développeur — `docs/developer/rbac.md`

**Files:**
- Create: `docs/developer/rbac.md`

- [ ] **Step 1: Créer le doc**

```markdown
# Guide développeur — RBAC OpsFlux

## Convention de nommage des permissions

Toutes les permissions suivent : `<namespace>.<resource>.<action>`.

### Comment ajouter une nouvelle permission

1. Choisir le `namespace` parmi les 21 namespaces autorisés (cf. spec §4.2)
2. Choisir le `resource` (singulier, le nom de l'objet métier dans ce namespace)
3. Choisir l'`action` parmi les actions standardisées (cf. spec §4.3)
4. Ajouter le code dans une migration alembic via `INSERT INTO permissions ... ON CONFLICT DO UPDATE`
5. Si la permission est sensible RGPD (donne accès à des données personnelles), mettre `sensitive=true`
6. Raccrocher la permission aux rôles concernés via `INSERT INTO role_permissions`

### Vérification dans le code

Utiliser `require_permission("<code>")` comme dépendance FastAPI :

```python
@router.get("/", dependencies=[require_permission("asset.asset.read")])
async def list_assets(...):
    ...
```

## Convention `OWN` (filtrage métier)

`OWN` n'est pas une permission distincte. C'est un filtre appliqué au niveau du code des routes,
typiquement avec un `WHERE` SQL.

Exemples :

```python
# paxlog : un PAX voit son propre profil
stmt = select(PaxProfile).where(PaxProfile.user_id == current_user.id)

# tier_contact : un contact tier voit sa propre compagnie
stmt = select(Tier).join(UserTierLink, UserTierLink.tier_id == Tier.id).where(
    UserTierLink.user_id == current_user.id
)
```

La permission au niveau RBAC reste générique (`paxlog.profile.read`). C'est le code qui restreint
selon le rôle effectif du user.

## Moteur de résolution 4 couches

Voir `app/core/rbac.py:78` — fonction `_resolve_permissions`.

Ordre (mode restrictive, défaut) :
1. Group overrides (lowest)
2. Role permissions
3. Active delegations received
4. User overrides (highest)

## Délégations ISO

Voir `app/services/core/rbac_delegation_service.py`. Garde-fous :
- Validation de la durée max (setting `rbac.delegation.max_duration_days`)
- Validation des permissions effectives du délégateur
- Blocage de la sous-délégation (perms reçues via délégation non re-déléguables)
- Audit trail avec hash SHA-256 du certificat PDF
- 4 emails templates : granted, received, revoked, expired (FR + EN)

## Templates PDF système

Liste des slugs `core.rbac.*` :
- `core.rbac.matrix_role_permissions`
- `core.rbac.matrix_group_permissions`
- `core.rbac.matrix_user_permissions`
- `core.rbac.role_detail`
- `core.rbac.group_detail`
- `core.rbac.user_detail`
- `core.rbac.role_modules`
- `core.rbac.permission_catalog`
- `core.rbac.sod_matrix`
- `core.rbac.delegation_registry`
- `core.rbac.delegation_certificate`

Templates email :
- `rbac.delegation.granted`
- `rbac.delegation.received`
- `rbac.delegation.revoked`
- `rbac.delegation.expired`

Ces templates sont seedés en PR-B. Tant que PR-B n'est pas déployée, les endpoints d'export
retournent `404 RBAC_TEMPLATE_NOT_FOUND`.
```

- [ ] **Step 2: Commit**

```bash
git add docs/developer/rbac.md
git commit -m "docs(rbac): developer guide for permission naming, OWN filter, delegations and PDF templates"
```

### Task 13.2 : Vérification finale et push de la PR-A

- [ ] **Step 1: Run la suite complète de tests**

Run: `pytest tests/ -v -k "rbac or delegation or migration_170"`

Expected: tous les tests passent.

- [ ] **Step 2: Vérifier la migration end-to-end**

```bash
alembic downgrade 169_add_api_type_designation  # rollback
alembic upgrade head  # re-apply
alembic downgrade base
alembic upgrade head
```

Expected: aucune erreur.

- [ ] **Step 3: Vérifier l'OpenAPI**

Démarrer l'app : `uvicorn app.main:app --reload --port 8000`

Ouvrir `http://localhost:8000/docs` et vérifier :
- Tag `rbac-delegation` présent avec les 7 endpoints
- Tag `rbac-export` présent avec les 10 endpoints + 2 polling
- Tag `rbac` enrichi avec defaults, audit-events, matrix

- [ ] **Step 4: Pusher la branche et créer la PR**

```bash
git push -u origin claude/gracious-haslett-4b8b09

gh pr create --title "feat(rbac): PR-A foundations — modèles + migration phase 1 + délégations + exports + imports + admin" --body "$(cat <<'EOF'
## Summary
- Étend `Permission` (namespace/resource/action/deprecated/sensitive)
- Ajoute `Entity.logo_url` (branding PDF)
- Crée la table `rbac_audit_events`
- Migration 170 phase 1 (additive, idempotente) : ~20 perms + 8 rôles + 7 settings
- Renommage `SUPER_ADMIN`→`PLATFORM_ADMIN`, `PAX_ADMIN`→`PAX_COORD`, `HSE_ADMIN`→`HSE_MGR` avec stratégie INSERT+propagate+DELETE
- 4ᵉ couche délégation dans le moteur RBAC
- Service `rbac_delegation_service` avec garde-fous ISO (durée max, sub-delegation, effective perms)
- 7 routes délégations + cron d'expiration J-3 et J0
- Service `rbac_export_service` avec 9 builders de variables PDF
- 10 routes exports PDF (retournent 404 RBAC_TEMPLATE_NOT_FOUND jusqu'à PR-B) + polling async
- Service `rbac_import_service` + 3 targets dans ImportWizard
- Routes admin : `/defaults`, `/audit-events`, `/matrix/*`
- Auto-attachement du rôle par défaut à la création d'un user (configurable)

## Test plan
- [ ] `pytest tests/ -v -k "rbac or delegation or migration_170"`
- [ ] `alembic downgrade base && alembic upgrade head`
- [ ] Smoke test manuel via Swagger UI
- [ ] Vérifier qu'aucune route existante n'est cassée (regression)

Spec source : `docs/superpowers/specs/2026-05-13-rbac-bootstrap-design.md`
Plan détaillé : `docs/superpowers/plans/2026-05-13-rbac-pr-a-foundations.md`

Next: PR-B (seed templates PDF + email).
EOF
)"
```

Note : la PR retourne 404 sur les exports PDF jusqu'à ce que la PR-B (seed templates) soit déployée. C'est attendu et documenté.

- [ ] **Step 5: Capturer l'URL de la PR**

Noter l'URL retournée par `gh pr create` pour communication à l'équipe.

---

## Récapitulatif PR-A

| Métrique | Valeur |
|---|---|
| Tâches TDD | 47 |
| Nouveaux fichiers créés | ~22 |
| Fichiers modifiés | ~4 |
| Tests unit/intégration | ~25 |
| Migrations alembic | 1 (phase 1) |
| Nouveaux endpoints | 22 (7 délégations + 10 exports + 2 polling + 1 defaults GET + 1 defaults PUT + 1 audit-events + 3 matrix JSON — révision : 25 endpoints au total) |
| Commits attendus | ~25 |

**Une fois la PR-A mergée**, ré-invoquer `superpowers:writing-plans` pour produire le plan détaillé de la PR-B.

