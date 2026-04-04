from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.modules import tiers
from app.models.common import UserTierLink
from app.schemas.common import TierContactPromoteUserRequest


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None, all_rows=None):
        self._scalar_one_or_none = scalar_one_or_none
        self._all_rows = all_rows or []

    def scalar_one_or_none(self):
        return self._scalar_one_or_none

    def all(self):
        return self._all_rows


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.commits = 0
        self.refreshed = []
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in reversed(self.added):
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
                break

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)


@pytest.mark.asyncio
async def test_promote_tier_contact_to_external_user_creates_user_and_tier_link(monkeypatch):
    entity_id = uuid4()
    tier_id = uuid4()
    contact_id = uuid4()
    job_position_id = uuid4()
    tier = SimpleNamespace(id=tier_id, entity_id=entity_id)
    contact = SimpleNamespace(
        id=contact_id,
        tier_id=tier_id,
        active=True,
        email="contact@example.com",
        promoted_user=None,
        first_name="Jane",
        last_name="Doe",
        job_position_id=job_position_id,
        nationality="CM",
        birth_date=date(1991, 5, 17),
        badge_number="EXT-42",
    )
    current_user = SimpleNamespace(first_name="Admin", last_name="Ops", user_type="internal")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=tier),
            FakeResult(scalar_one_or_none=contact),
            FakeResult(scalar_one_or_none=None),
        ]
    )
    invitations = []

    async def _fake_send(**kwargs):
        invitations.append(kwargs["user"].email)

    monkeypatch.setattr(tiers, "_send_promoted_user_invitation", _fake_send)

    user = await tiers.promote_tier_contact_to_user(
        tier_id=tier_id,
        contact_id=contact_id,
        body=TierContactPromoteUserRequest(),
        entity_id=entity_id,
        current_user=current_user,
        _=None,
        db=db,
    )

    assert user.email == "contact@example.com"
    assert user.user_type == "external"
    assert user.tier_contact_id == contact_id
    assert user.default_entity_id == entity_id
    assert user.job_position_id == job_position_id
    assert db.commits == 1
    assert len(db.added) == 2
    assert isinstance(db.added[1], UserTierLink)
    assert db.added[1].tier_id == tier_id
    assert invitations == ["contact@example.com"]


@pytest.mark.asyncio
async def test_promote_tier_contact_to_external_user_requires_contact_email():
    entity_id = uuid4()
    tier_id = uuid4()
    contact_id = uuid4()
    tier = SimpleNamespace(id=tier_id, entity_id=entity_id)
    contact = SimpleNamespace(
        id=contact_id,
        tier_id=tier_id,
        active=True,
        email=None,
        promoted_user=None,
        first_name="Jane",
        last_name="Doe",
        job_position_id=None,
        nationality=None,
        birth_date=None,
        badge_number=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=tier),
            FakeResult(scalar_one_or_none=contact),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await tiers.promote_tier_contact_to_user(
            tier_id=tier_id,
            contact_id=contact_id,
            body=TierContactPromoteUserRequest(),
            entity_id=entity_id,
            current_user=SimpleNamespace(first_name="Admin", last_name="Ops", user_type="internal"),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 400
    assert "email" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_promote_tier_contact_to_external_user_rejects_existing_link():
    entity_id = uuid4()
    tier_id = uuid4()
    contact_id = uuid4()
    tier = SimpleNamespace(id=tier_id, entity_id=entity_id)
    contact = SimpleNamespace(
        id=contact_id,
        tier_id=tier_id,
        active=True,
        email="contact@example.com",
        promoted_user=SimpleNamespace(id=uuid4()),
        first_name="Jane",
        last_name="Doe",
        job_position_id=None,
        nationality=None,
        birth_date=None,
        badge_number=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=tier),
            FakeResult(scalar_one_or_none=contact),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await tiers.promote_tier_contact_to_user(
            tier_id=tier_id,
            contact_id=contact_id,
            body=TierContactPromoteUserRequest(send_invitation=False),
            entity_id=entity_id,
            current_user=SimpleNamespace(first_name="Admin", last_name="Ops", user_type="internal"),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 409
    assert "already linked" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_promote_tier_contact_to_external_user_rejects_email_collision():
    entity_id = uuid4()
    tier_id = uuid4()
    contact_id = uuid4()
    tier = SimpleNamespace(id=tier_id, entity_id=entity_id)
    contact = SimpleNamespace(
        id=contact_id,
        tier_id=tier_id,
        active=True,
        email="contact@example.com",
        promoted_user=None,
        first_name="Jane",
        last_name="Doe",
        job_position_id=None,
        nationality=None,
        birth_date=None,
        badge_number=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=tier),
            FakeResult(scalar_one_or_none=contact),
            FakeResult(scalar_one_or_none=SimpleNamespace(id=uuid4(), email="contact@example.com")),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await tiers.promote_tier_contact_to_user(
            tier_id=tier_id,
            contact_id=contact_id,
            body=TierContactPromoteUserRequest(send_invitation=False),
            entity_id=entity_id,
            current_user=SimpleNamespace(first_name="Admin", last_name="Ops", user_type="internal"),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 409
    assert "already exists with this email" in str(exc.value.detail).lower()


def test_forbid_external_company_creation():
    with pytest.raises(HTTPException) as exc:
        tiers._forbid_external_company_creation(SimpleNamespace(user_type="external"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_tier_or_404_denies_external_user_outside_linked_tier():
    entity_id = uuid4()
    allowed_tier_id = uuid4()
    requested_tier_id = uuid4()
    current_user = SimpleNamespace(id=uuid4(), user_type="external")
    db = FakeDB(
        [
            FakeResult(all_rows=[(allowed_tier_id,)]),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await tiers._get_tier_or_404(
            db,
            requested_tier_id,
            entity_id,
            current_user=current_user,
        )

    assert exc.value.status_code == 404
