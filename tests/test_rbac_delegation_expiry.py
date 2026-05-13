"""Test the cron job that notifies J-3 and J0 of delegation expiry."""
import os
from datetime import datetime, timedelta, timezone

import pytest

from app.models.common import UserDelegation
from app.tasks.rbac_delegation_expiry import notify_expiring_delegations

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema. Set RBAC_PR_A_MIGRATION_APPLIED=1 after `alembic upgrade head`.",
)


@pytest.mark.asyncio
async def test_notifies_j3(
    db_session,
    sample_entity,
    sample_user,
    another_user,
    mock_expiry_render_pdf,
    mock_expiry_send_email,
):
    """A delegation expiring in 3 days triggers email notification."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(days=3, hours=1),  # in 3 days (~J-3)
        active=True,
        reason="test j-3",
    )
    db_session.add(delegation)
    await db_session.commit()

    await notify_expiring_delegations(db_session)
    # at least 2 emails: delegator + delegate
    assert mock_expiry_send_email.call_count >= 2


@pytest.mark.asyncio
async def test_notifies_j0(
    db_session,
    sample_entity,
    sample_user,
    another_user,
    mock_expiry_render_pdf,
    mock_expiry_send_email,
):
    """A delegation expiring today triggers J0 email."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now + timedelta(hours=2),  # expires within next 24h (J0)
        active=True,
        reason="test j-0",
    )
    db_session.add(delegation)
    await db_session.commit()

    await notify_expiring_delegations(db_session)
    assert mock_expiry_send_email.call_count >= 2
