"""Test RBAC import service (3 targets)."""
import os

import pytest

from app.services.modules.rbac_import_service import (
    import_rbac_group_override,
    import_rbac_role_permission,
    import_rbac_user_group,
)

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema and RBAC import service.",
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
