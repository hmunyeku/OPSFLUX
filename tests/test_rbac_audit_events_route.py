"""Test the audit events list route."""
import os
import pytest

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema.",
)


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
