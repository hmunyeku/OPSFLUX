"""Regression tests for the multi-entity isolation fixes (Sprint 1).

Each test exercises one of the 8 route handlers we hardened after the audit
spotted cross-tenant leaks (commit 41ed4637):

    - messaging.update_announcement        (entity_id filter on SELECT)
    - messaging.delete_announcement        (entity_id filter + Depends)
    - messaging.update_security_rule       (entity_id filter)
    - messaging.delete_security_rule       (entity_id filter)
    - support.update_ticket_todo           (JOIN SupportTicket on entity_id)
    - support.delete_ticket_todo           (JOIN SupportTicket on entity_id)
    - conformite.create_transfer           (validate contact + tiers in entity)
    - planner.get_capacity                 (asset.entity_id match)

Strategy: rather than mounting the full FastAPI app, we call the handlers
with a FakeDB that records the SQL statement passed to `execute()`.
The WHERE clause is compiled to SQL and inspected for the expected
entity_id predicate. If any fix regresses, the compiled SQL will no
longer contain the entity_id clause and the test will fail loudly.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException


# ── Test utilities ─────────────────────────────────────────────────────────


class QuerySpy:
    """Capture the first `.execute()` call and return the canned result."""

    def __init__(self, result):
        self.captured = None
        self._result = result
        self._calls = 0

    async def execute(self, statement, params=None):
        if self._calls == 0:
            self.captured = statement
        self._calls += 1
        return self._result

    async def commit(self):
        return None

    async def refresh(self, *args, **kwargs):
        return None

    async def rollback(self):
        return None

    async def get(self, model, pk):
        return None

    async def scalar(self, statement):
        self.captured = statement
        return None

    def add(self, _obj):
        return None

    async def flush(self):
        return None

    async def delete(self, _obj):
        return None


class EmptyResult:
    def scalar_one_or_none(self):
        return None

    def scalars(self):
        return self

    def all(self):
        return []

    def one_or_none(self):
        return None


def _compiled_sql(stmt) -> str:
    """Render the SQLAlchemy Select/Update/Delete as SQL string (literal_binds)."""
    try:
        return str(stmt.compile(compile_kwargs={"literal_binds": True}))
    except Exception:
        return str(stmt)


# ── messaging.update_announcement ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_update_announcement_filters_by_entity_id():
    from app.api.routes.modules import messaging as m

    announcement_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    body = SimpleNamespace(model_dump=lambda exclude_unset=True: {})
    current_user = SimpleNamespace(id=uuid4(), full_name="x")

    with pytest.raises(HTTPException) as exc:
        await m.update_announcement(
            announcement_id=announcement_id,
            body=body,
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured)
    assert str(entity_id) in sql, f"entity_id missing from SELECT: {sql}"
    assert str(announcement_id) in sql


@pytest.mark.asyncio
async def test_delete_announcement_filters_by_entity_id():
    from app.api.routes.modules import messaging as m

    announcement_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    current_user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await m.delete_announcement(
            announcement_id=announcement_id,
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured)
    assert str(entity_id) in sql


# ── messaging.update_security_rule / delete_security_rule ──────────────────


@pytest.mark.asyncio
async def test_update_security_rule_filters_by_entity_id():
    from app.api.routes.modules import messaging as m

    rule_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    body = SimpleNamespace(model_dump=lambda exclude_unset=True: {})

    with pytest.raises(HTTPException) as exc:
        await m.update_security_rule(
            rule_id=rule_id,
            body=body,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured)
    assert str(entity_id) in sql


@pytest.mark.asyncio
async def test_delete_security_rule_filters_by_entity_id():
    from app.api.routes.modules import messaging as m

    rule_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    current_user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await m.delete_security_rule(
            rule_id=rule_id,
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured)
    assert str(entity_id) in sql


# ── support.update_ticket_todo / delete_ticket_todo ────────────────────────


@pytest.mark.asyncio
async def test_update_ticket_todo_joins_ticket_for_entity_scope():
    from app.api.routes.modules import support as s

    todo_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    current_user = SimpleNamespace(id=uuid4())
    body = SimpleNamespace(title=None, order=None, completed=None)

    with pytest.raises(HTTPException) as exc:
        await s.update_ticket_todo(
            todo_id=todo_id,
            body=body,
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured).lower()
    # Both filters must be present in the generated SQL: todo_id AND support
    # tickets entity_id. The JOIN naturally pulls support_tickets in.
    assert str(todo_id) in _compiled_sql(db.captured)
    assert str(entity_id) in _compiled_sql(db.captured)
    assert "support_tickets" in sql, f"JOIN on support_tickets missing: {sql}"


@pytest.mark.asyncio
async def test_delete_ticket_todo_joins_ticket_for_entity_scope():
    from app.api.routes.modules import support as s

    todo_id = uuid4()
    entity_id = uuid4()
    db = QuerySpy(EmptyResult())
    current_user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await s.delete_ticket_todo(
            todo_id=todo_id,
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    assert exc.value.status_code == 404
    sql = _compiled_sql(db.captured).lower()
    assert "support_tickets" in sql
    assert str(entity_id) in _compiled_sql(db.captured)


# ── planner.get_capacity ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_capacity_rejects_cross_entity_asset():
    """Fetching an Installation whose entity_id != caller's entity_id → 404.

    Regression guard for planner.py:2330 where a `db.get(Installation, id)`
    without entity check leaked asset.name cross-tenant.
    """
    from app.api.routes.modules import planner as p
    from datetime import date

    asset_id = uuid4()
    caller_entity = uuid4()
    other_entity = uuid4()
    other_asset = SimpleNamespace(id=asset_id, entity_id=other_entity, name="leak")

    class OneShotDB:
        def __init__(self):
            self.calls = 0

        async def get(self, model, pk):
            return other_asset

    db = OneShotDB()
    current_user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as exc:
        await p.get_capacity(
            asset_id=asset_id,
            date_from=date(2026, 1, 1),
            date_to=date(2026, 1, 31),
            entity_id=caller_entity,
            current_user=current_user,
            db=db,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_capacity_allows_same_entity_asset():
    """Sanity: same-entity asset must NOT raise before the service call."""
    from app.api.routes.modules import planner as p
    from datetime import date

    asset_id = uuid4()
    caller_entity = uuid4()
    same_asset = SimpleNamespace(
        id=asset_id, entity_id=caller_entity, name="ok", pob_capacity=100
    )

    # We expect the handler to proceed past the 404 guard and call the
    # service — which we short-circuit by monkey-patching.
    import app.services.modules.planner_service as psvc
    original = psvc.get_current_capacity

    async def fake_capacity(_db, _asset_id, _date):
        return {"max_pax_total": 100, "permanent_ops_quota": 0}

    psvc.get_current_capacity = fake_capacity

    class GetDB:
        async def get(self, _model, _pk):
            return same_asset

        async def execute(self, _stmt):
            return EmptyResult()

    try:
        result = await p.get_capacity(
            asset_id=asset_id,
            date_from=date(2026, 1, 1),
            date_to=date(2026, 1, 1),
            entity_id=caller_entity,
            current_user=SimpleNamespace(id=uuid4()),
            db=GetDB(),
        )
        # If we got here the guard did NOT falsely reject — test passes.
        assert isinstance(result, list)
    finally:
        psvc.get_current_capacity = original
