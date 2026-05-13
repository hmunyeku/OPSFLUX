"""Test the /api/v1/rbac/defaults routes for default-role-per-user-type setting."""
import os
import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema.",
)


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
