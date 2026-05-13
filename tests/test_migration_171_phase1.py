"""Test migration 171 phase 1 — additive bootstrap."""
import os
import subprocess
import pytest
from sqlalchemy import select
from app.models.common import Permission, Role

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Migration 171 tests require the schema to include PR-A objects. "
           "Set RBAC_PR_A_MIGRATION_APPLIED=1 once `alembic upgrade head` has run.",
)


@pytest.mark.asyncio
async def test_new_permissions_seeded(db_session):
    """The ~20 new permissions are present in DB after migration 171."""
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


@pytest.mark.asyncio
async def test_new_roles_seeded(db_session):
    """8 new roles are seeded (SECURITY_OFFICER, DOC_CONTROLLER, PLANNER, MOC_VALIDATOR, OPERATOR, PAX, TIER_CONTACT, INTEGRATION_BOT)."""
    expected = ["SECURITY_OFFICER", "DOC_CONTROLLER", "PLANNER", "MOC_VALIDATOR", "OPERATOR", "PAX", "TIER_CONTACT", "INTEGRATION_BOT"]
    result = await db_session.execute(select(Role.code).where(Role.code.in_(expected)))
    found = {row[0] for row in result.all()}
    assert set(expected) == found, f"Rôles manquants: {set(expected) - found}"


@pytest.mark.asyncio
async def test_new_role_aliases_seeded(db_session):
    """3 new role aliases exist alongside their legacy codes."""
    new_codes = ["PLATFORM_ADMIN", "PAX_COORD", "HSE_MGR"]
    legacy_codes = ["SUPER_ADMIN", "PAX_ADMIN", "HSE_ADMIN"]
    result = await db_session.execute(select(Role.code).where(Role.code.in_(new_codes + legacy_codes)))
    found = {row[0] for row in result.all()}
    missing_new = set(new_codes) - found
    missing_legacy = set(legacy_codes) - found
    assert not missing_new, f"Aliases manquants: {missing_new}"
    assert not missing_legacy, f"Codes legacy manquants (perm_sync devrait les avoir seedés): {missing_legacy}"


@pytest.mark.asyncio
async def test_tenant_settings_seeded(db_session, sample_entity):
    """7 tenant settings are seeded for each existing entity."""
    from app.models.common import Setting
    expected_keys = [
        "rbac.default_role.internal",
        "rbac.default_role.external",
        "rbac.default_role.tier_contact",
        "rbac.delegation.max_duration_days",
        "rbac.delegation.notify_security_officer",
        "rbac.export.async_threshold_users",
        "rbac.bootstrap.email_admins_on_migration",
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


def test_migration_171_idempotent():
    """Running alembic upgrade head on a DB already at head is a safe no-op (doesn't error).

    NOTE: This is a smoke test only. True data-level idempotence (no duplicate rows on re-run)
    is guaranteed by the `ON CONFLICT` clauses in the migration's SQL, not asserted here.
    To strengthen, add a row-count diff test that re-runs the seed SQL directly (out of scope for PR-A).
    """
    result = subprocess.run(
        ["alembic", "upgrade", "head"], capture_output=True, text=True
    )
    assert result.returncode == 0, f"Migration failed on second run: {result.stderr}"
