from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.modules import conformite, paxlog


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None, all_rows=None, one_or_none=None):
        self._scalar_one_or_none = scalar_one_or_none
        self._all_rows = all_rows or []
        self._one_or_none = one_or_none

    def scalar_one_or_none(self):
        return self._scalar_one_or_none

    def all(self):
        return self._all_rows

    def one_or_none(self):
        return self._one_or_none


class FakeDB:
    def __init__(self, results):
        self._results = list(results)

    async def execute(self, statement, params=None):
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)


@pytest.mark.asyncio
async def test_conformite_external_user_denied_outside_company_scope():
    entity_id = uuid4()
    external_user = SimpleNamespace(id=uuid4(), user_type="external")
    allowed_tier_id = uuid4()
    other_contact_id = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(allowed_tier_id,)]),
            FakeResult(scalar_one_or_none=None),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await conformite._assert_external_owner_access(
            db,
            external_user,
            entity_id,
            owner_type="tier_contact",
            owner_id=other_contact_id,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_conformite_external_user_allows_self_user_scope():
    entity_id = uuid4()
    external_user = SimpleNamespace(id=uuid4(), user_type="external")

    await conformite._assert_external_owner_access(
        FakeDB([]),
        external_user,
        entity_id,
        owner_type="user",
        owner_id=external_user.id,
    )


@pytest.mark.asyncio
async def test_paxlog_resolve_identity_denies_external_user_for_other_user():
    entity_id = uuid4()
    external_user = SimpleNamespace(id=uuid4(), user_type="external")
    foreign_user = SimpleNamespace(id=uuid4())
    db = FakeDB([FakeResult(scalar_one_or_none=foreign_user)])

    with pytest.raises(HTTPException) as exc:
        await paxlog._resolve_pax_identity(
            db,
            foreign_user.id,
            "user",
            entity_id=entity_id,
            current_user=external_user,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_paxlog_resolve_identity_denies_external_user_for_contact_outside_company():
    entity_id = uuid4()
    external_user = SimpleNamespace(id=uuid4(), user_type="external")
    contact = SimpleNamespace(id=uuid4(), tier_id=uuid4())
    row = (contact, "Other Co")
    db = FakeDB(
        [
            FakeResult(one_or_none=row),
            FakeResult(all_rows=[(uuid4(),)]),
        ]
    )

    with pytest.raises(HTTPException) as exc:
        await paxlog._resolve_pax_identity(
            db,
            contact.id,
            "contact",
            entity_id=entity_id,
            current_user=external_user,
        )

    assert exc.value.status_code == 404
