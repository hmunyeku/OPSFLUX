"""Test RbacAuditEvent model."""
import os

import pytest
from sqlalchemy import select
from app.models.common import RbacAuditEvent

# These tests require the columns added by migration 170 (PR-A phase 1).
# Until migration 170 is applied to the test DB, they will fail with UndefinedColumn.
pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Awaits alembic migration 170 (PR-A Group 2). Set RBAC_PR_A_MIGRATION_APPLIED=1 once applied.",
)


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
