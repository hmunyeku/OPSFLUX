"""Test RBAC delegation service — ISO guardrails."""
import os
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.models.common import UserDelegation
from app.schemas.rbac_delegation import DelegationCreate
from app.services.core.rbac_delegation_service import (
    create_delegation,
    revoke_delegation,
    validate_delegation_constraints,
)

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema. Set RBAC_PR_A_MIGRATION_APPLIED=1 after `alembic upgrade head`.",
)


@pytest.mark.asyncio
async def test_create_delegation_requires_effective_perms(db_session, sample_entity, sample_user, another_user):
    """Cannot delegate a permission the delegator doesn't have."""
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.delete"],
        start_date=datetime.now(timezone.utc),
        end_date=datetime.now(timezone.utc) + timedelta(days=7),
        reason="should fail — missing perms",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, sample_user, sample_entity.id)
    assert exc.value.status_code == 403
    assert "RBAC_DELEGATION_INSUFFICIENT_PERMS" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_blocks_sub_delegation(db_session, sample_entity, sample_user, another_user, third_user):
    """Cannot re-delegate permissions that come from a delegation received."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="initial",
    )
    db_session.add(delegation)
    await db_session.commit()

    body = DelegationCreate(
        delegate_id=third_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=3),
        reason="should fail — sub-delegation",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, another_user, sample_entity.id)
    assert exc.value.status_code == 403
    assert "RBAC_DELEGATION_SUB_DELEGATION_DENIED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_enforces_max_duration(db_session, sample_entity, sample_user, another_user, set_tenant_setting):
    """Cannot create a delegation longer than max_duration_days."""
    await set_tenant_setting(sample_entity.id, "rbac.delegation.max_duration_days", 30)

    now = datetime.now(timezone.utc)
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=60),
        reason="should fail — duration",
    )
    with pytest.raises(HTTPException) as exc:
        await create_delegation(db_session, body, sample_user, sample_entity.id)
    assert exc.value.status_code == 400
    assert "RBAC_DELEGATION_DURATION_EXCEEDED" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_create_delegation_happy_path(
    db_session, sample_entity, user_with_asset_read, another_user, mock_render_pdf, mock_send_email
):
    """A valid delegation creates DB row, sends 2 emails, creates audit event with hash."""
    now = datetime.now(timezone.utc)
    body = DelegationCreate(
        delegate_id=another_user.id,
        permissions=["asset.asset.read"],
        start_date=now,
        end_date=now + timedelta(days=7),
        reason="vacances de la semaine prochaine",
    )
    delegation = await create_delegation(db_session, body, user_with_asset_read, sample_entity.id)
    assert delegation.id is not None
    assert delegation.permissions == ["asset.asset.read"]
    # granted + received (+ optional SECURITY_OFFICER CCs if fixtures add them)
    assert mock_send_email.call_count >= 2

    from sqlalchemy import select

    from app.models.common import RbacAuditEvent
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "delegation.created")
    )
    event = result.scalar_one()
    assert event.file_hash_sha256 is not None
    assert len(event.file_hash_sha256) == 64


@pytest.mark.asyncio
async def test_revoke_delegation_marks_inactive_and_sends_emails(
    db_session, sample_entity, sample_user, another_user, mock_render_pdf, mock_send_email
):
    """Revoking a delegation marks active=false, sends emails, logs audit."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    await revoke_delegation(db_session, delegation.id, sample_user, sample_entity.id, "annulation forcée")

    await db_session.refresh(delegation)
    assert delegation.active is False
    assert mock_send_email.call_count >= 2

    from sqlalchemy import select

    from app.models.common import RbacAuditEvent
    result = await db_session.execute(
        select(RbacAuditEvent).where(RbacAuditEvent.event_type == "delegation.revoked")
    )
    assert result.scalar_one() is not None
