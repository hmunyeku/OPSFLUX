from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.modules import projets
from app.core.event_contracts import PROJECT_STATUS_CHANGED_EVENT
from app.models.common import ProjectStatusHistory
from app.schemas.common import ProjectUpdate


class FakeDB:
    def __init__(self):
        self.added = []
        self.commits = 0

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, _obj):
        return None


@pytest.mark.asyncio
async def test_update_project_status_uses_fsm_and_emits_transition_event(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    project = SimpleNamespace(
        id=uuid4(),
        entity_id=entity_id,
        code="PRJ-001",
        status="draft",
        manager_id=actor_id,
        external_ref=None,
        __table__=SimpleNamespace(columns=[]),
    )
    db = FakeDB()
    transition_events = []
    business_events = []

    async def fake_get_project_or_404(_db, _project_id, _entity_id):
        return project

    async def fake_check_project_member_role(_db, _project_id, _user_id, _required_roles=None):
        return True

    async def fake_get_instance(*_args, **_kwargs):
        return None

    async def fake_get_or_create_instance(*_args, **_kwargs):
        return SimpleNamespace(current_state="draft")

    async def fake_transition(*_args, **_kwargs):
        return SimpleNamespace(current_state="draft")

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    async def fake_emit_event(name, payload):
        business_events.append((name, payload))

    monkeypatch.setattr(projets, "_get_project_or_404", fake_get_project_or_404)
    monkeypatch.setattr(projets, "_check_project_member_role", fake_check_project_member_role)
    monkeypatch.setattr(projets.fsm_service, "get_instance", fake_get_instance)
    monkeypatch.setattr(projets.fsm_service, "get_or_create_instance", fake_get_or_create_instance)
    monkeypatch.setattr(projets.fsm_service, "transition", fake_transition)
    monkeypatch.setattr(projets.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(projets, "emit_event", fake_emit_event)

    response = await projets.update_project(
        project.id,
        ProjectUpdate(status="planned"),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert project.status == "planned"
    assert response["manager_name"] is None
    assert db.commits == 2
    assert any(isinstance(obj, ProjectStatusHistory) for obj in db.added)
    assert transition_events and transition_events[0]["to_state"] == "planned"
    assert business_events and business_events[0][0] == PROJECT_STATUS_CHANGED_EVENT
