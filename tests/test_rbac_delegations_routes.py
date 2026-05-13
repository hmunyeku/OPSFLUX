"""Test RBAC delegations routes."""
import os
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema and the RBAC delegations routes to be registered.",
)


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
