from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.exc import IntegrityError

from app.api.routes.core import settings as settings_routes
from app.models.common import Setting
from app.schemas.common import SettingWrite


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None, scalars_all=None):
        self._scalar_one_or_none = scalar_one_or_none
        self._scalars_all = list(scalars_all or [])

    def scalar_one_or_none(self):
        return self._scalar_one_or_none

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._scalars_all))


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, statement, params=None):
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1
        if self.commits == 1:
            raise IntegrityError(
                "INSERT INTO settings ...",
                {},
                Exception('duplicate key value violates unique constraint "uq_settings_key_scope"'),
            )

    async def rollback(self):
        self.rollbacks += 1


@pytest.mark.asyncio
async def test_upsert_setting_reuses_legacy_scope_row_on_unique_conflict(monkeypatch):
    entity_id = uuid4()
    legacy_row = Setting(
        key="integration.ai.provider",
        value={"v": "anthropic"},
        scope="entity",
        scope_id=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=None),
            FakeResult(scalars_all=[legacy_row]),
            FakeResult(scalar_one_or_none=legacy_row),
        ]
    )

    async def _allow_settings_manage(*args, **kwargs):
        return None

    monkeypatch.setattr(settings_routes, "_require_settings_manage", _allow_settings_manage)

    response = await settings_routes.upsert_setting(
        body=SettingWrite(key="integration.ai.provider", value={"v": "ollama"}),
        scope="entity",
        current_user=SimpleNamespace(id=uuid4()),
        entity_id=entity_id,
        db=db,
    )

    assert response == {"detail": "Setting saved"}
    assert db.rollbacks == 1
    assert db.commits == 2
    assert legacy_row.value == {"v": "ollama"}
    assert legacy_row.scope_id == str(entity_id)
