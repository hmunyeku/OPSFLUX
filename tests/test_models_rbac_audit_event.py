"""Test RbacAuditEvent model."""
import os

import pytest
from sqlalchemy import select
from app.models.common import RbacAuditEvent

# Group 1 tests require the test DB schema to include the new PR-A columns/tables
# (Permission.namespace/resource/action/deprecated/deprecated_for/sensitive and the
# rbac_audit_events table). The schema is populated either by:
#   (a) conftest's Base.metadata.create_all() picking up the new model definitions, or
#   (b) running alembic migration 171 (PR-A Group 2) against the test DB.
# Set RBAC_PR_A_MIGRATION_APPLIED=1 once you've verified the schema is current.
pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Group 1 tests require the test DB schema to include PR-A columns/tables. "
           "These come from either (a) running alembic migration 171 (PR-A Group 2) or "
           "(b) ensuring conftest's create_all picks up the new model definitions. "
           "Set RBAC_PR_A_MIGRATION_APPLIED=1 once you've verified the schema is current.",
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
