"""Test 4th layer (delegations) added to RBAC permission resolution."""
import os
from datetime import datetime, timedelta, timezone
import pytest
from app.core.rbac import get_user_permissions, get_user_permissions_with_sources
from app.models.common import UserDelegation

pytestmark = pytest.mark.skipif(
    os.getenv("RBAC_PR_A_MIGRATION_APPLIED") != "1",
    reason="Requires migration 171 schema (permissions extension + RbacAuditEvent). "
           "Set RBAC_PR_A_MIGRATION_APPLIED=1 once `alembic upgrade head` has run.",
)


@pytest.mark.asyncio
async def test_delegation_layer_grants_permission(db_session, sample_entity, sample_user, another_user):
    """A user who receives a delegation gets the perms with source 'delegation'."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read", "asset.asset.update"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=7),
        active=True,
        reason="vacances",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" in perms
    assert "asset.asset.update" in perms

    sources = await get_user_permissions_with_sources(another_user.id, sample_entity.id, db_session)
    assert sources["asset.asset.read"] == "delegation"


@pytest.mark.asyncio
async def test_expired_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """An expired delegation no longer grants permissions."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=10),
        end_date=now - timedelta(days=1),  # expired yesterday
        active=True,
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms


@pytest.mark.asyncio
async def test_future_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """A delegation with start_date in the future is not yet active."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now + timedelta(days=1),
        end_date=now + timedelta(days=8),
        active=True,
        reason="programmed",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms


@pytest.mark.asyncio
async def test_inactive_delegation_does_not_grant(db_session, sample_entity, sample_user, another_user):
    """A revoked delegation (active=false) does not grant."""
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(days=1),
        end_date=now + timedelta(days=1),
        active=False,  # revoked
        reason="test",
    )
    db_session.add(delegation)
    await db_session.commit()

    perms = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms


from app.core.rbac import invalidate_rbac_cache


@pytest.mark.asyncio
async def test_cache_invalidation_after_new_delegation(db_session, sample_entity, sample_user, another_user):
    """Creating a delegation + calling invalidate_rbac_cache makes the new perms visible."""
    # First call seeds the cache (no delegation yet)
    perms_before = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" not in perms_before

    # Create a delegation
    now = datetime.now(timezone.utc)
    delegation = UserDelegation(
        delegator_id=sample_user.id,
        delegate_id=another_user.id,
        entity_id=sample_entity.id,
        permissions=["asset.asset.read"],
        start_date=now - timedelta(hours=1),
        end_date=now + timedelta(days=1),
        active=True,
        reason="test cache",
    )
    db_session.add(delegation)
    await db_session.commit()

    # Without invalidation the cache may still serve the old result (depends on TTL).
    # Force invalidation to make the new perm visible immediately.
    await invalidate_rbac_cache(another_user.id)
    perms_after = await get_user_permissions(another_user.id, sample_entity.id, db_session)
    assert "asset.asset.read" in perms_after
