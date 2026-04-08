from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.core import settings as settings_routes
from app.schemas.common import SettingWrite


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None):
        self._scalar_one_or_none = scalar_one_or_none

    def scalar_one_or_none(self):
        return self._scalar_one_or_none


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.commits = 0

    async def execute(self, statement, params=None):
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_upsert_setting_allows_user_scope_without_settings_admin_permission():
    user_id = uuid4()
    entity_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=None)])

    response = await settings_routes.upsert_setting(
        body=SettingWrite(key="datatable.page_size", value={"v": 50}),
        scope="user",
        current_user=SimpleNamespace(id=user_id),
        entity_id=entity_id,
        db=db,
    )

    assert response == {"detail": "Setting saved"}
    assert db.commits == 1
    assert len(db.added) == 1
    created = db.added[0]
    assert created.key == "datatable.page_size"
    assert created.scope == "user"
    assert created.scope_id == str(user_id)
    assert created.value == {"v": 50}
