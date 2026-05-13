"""Test the JSON matrix routes used by the frontend (no PDF rendering involved)."""
import os
import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema.",
)


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
