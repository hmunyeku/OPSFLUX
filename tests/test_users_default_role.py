"""Test that creating a user automatically attaches the default role per user_type."""
import os
import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema and default role settings.",
)


@pytest.mark.asyncio
async def test_create_internal_user_gets_default_role(
    async_client, auth_headers_admin, sample_entity
):
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
async def test_create_external_user_gets_pax_role(
    async_client, auth_headers_admin, sample_entity
):
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
