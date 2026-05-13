"""Test that the 3 RBAC targets are registered and require core.rbac.manage."""
import os

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema and RBAC ImportWizard targets registered.",
)


@pytest.mark.asyncio
async def test_rbac_import_targets_registered(async_client: AsyncClient, auth_headers_admin):
    """GET /api/v1/import/targets returns the 3 new RBAC targets."""
    resp = await async_client.get("/api/v1/import/targets", headers=auth_headers_admin)
    assert resp.status_code == 200
    targets = {t["key"] for t in resp.json()}
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
            "column_mapping": {"role_code": "role_code", "permission_code": "permission_code"},
            "rows": [{"role_code": "OPERATOR", "permission_code": "asset.asset.read"}],
            "duplicate_strategy": "skip",
        },
        headers=auth_headers_pax,
    )
    assert resp.status_code == 403
