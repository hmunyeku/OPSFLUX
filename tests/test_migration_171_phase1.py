"""Test migration 171 phase 1 — additive bootstrap."""
import os
import pytest
from sqlalchemy import select
from app.models.common import Permission

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
