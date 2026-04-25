from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from starlette.requests import Request

from app.api.routes.modules import projets
from app.api.routes.modules import planner
from app.models.common import AuditLog, ProjectTask
from app.models.planner import PlannerActivity
from app.core.event_contracts import PROJECT_STATUS_CHANGED_EVENT
from app.models.common import ProjectStatusHistory
from app.schemas.common import ProjectTaskUpdate, ProjectUpdate


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


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _ScalarsResult:
    def __init__(self, values):
        self._values = values

    def first(self):
        return self._values[0] if self._values else None

    def all(self):
        return list(self._values)


class _ExecuteResult:
    def __init__(self, values):
        self._values = values

    def scalars(self):
        return _ScalarsResult(self._values)

    def all(self):
        return list(self._values)


class _ScalarValueResult:
    def __init__(self, value):
        self._value = value

    def scalar(self):
        return self._value

    def all(self):
        return []


class PlannerRouteFakeDB(FakeDB):
    def __init__(self, project, task):
        super().__init__()
        self.project = project
        self.task = task

    async def get(self, model, obj_id):
        if model is planner.Project and obj_id == self.project.id:
            return self.project
        return None

    async def execute(self, _query):
        return _ScalarResult(self.task)


@pytest.mark.asyncio
async def test_create_activity_from_project_task_sets_source_task_id(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    project_id = uuid4()
    task_id = uuid4()
    asset_id = uuid4()
    project = SimpleNamespace(
        id=project_id,
        entity_id=entity_id,
        asset_id=asset_id,
        code="PRJ-001",
    )
    task = SimpleNamespace(
        id=task_id,
        title="Mobilisation offshore",
        description="Task description",
        start_date=None,
        due_date=None,
    )
    db = PlannerRouteFakeDB(project, task)

    async def fake_enrich_activity(_db, activity):
        return {"id": activity.id, "source_task_id": activity.source_task_id}

    monkeypatch.setattr(planner, "_enrich_activity", fake_enrich_activity)

    response = await planner.create_activity_from_project_task(
        project_id=project_id,
        task_id=task_id,
        pax_quota=12,
        priority="high",
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert db.commits == 1
    assert len(db.added) == 1
    activity = db.added[0]
    assert activity.project_id == project_id
    assert activity.source_task_id == task_id
    assert activity.asset_id == asset_id
    assert response["source_task_id"] == task_id


@pytest.mark.asyncio
async def test_update_project_task_syncs_linked_planner_activities_and_emits_revision_signal(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    project_id = uuid4()
    task_id = uuid4()
    activity_id = uuid4()
    project = SimpleNamespace(
        id=project_id,
        entity_id=entity_id,
        code="PRJ-002",
        name="Offshore Inspection",
    )
    task = SimpleNamespace(
        id=task_id,
        project_id=project_id,
        title="Ancien titre",
        description="Ancienne description",
        status="todo",
        priority="medium",
        assignee_id=None,
        progress=0,
        start_date=None,
        due_date=None,
        completed_at=None,
        estimated_hours=None,
        actual_hours=None,
        order=1,
        __table__=SimpleNamespace(columns=[]),
    )
    activity = SimpleNamespace(
        id=activity_id,
        project_id=project_id,
        source_task_id=task_id,
        active=True,
        title="PRJ-002 — Ancien titre",
        description="Ancienne description",
        start_date=None,
        end_date=None,
    )

    class TaskSyncDB(FakeDB):
        def __init__(self):
            super().__init__()
            self.calls = 0
            self.flushed = 0

        async def execute(self, _query):
            self.calls += 1
            if self.calls == 1:
                return _ExecuteResult([task])
            if self.calls == 2:
                return _ExecuteResult([activity])
            raise AssertionError("Unexpected execute call")

        async def flush(self):
            self.flushed += 1

    db = TaskSyncDB()
    emitted_events = []

    async def fake_get_project_or_404(_db, _project_id, _entity_id):
        return project

    async def fake_rollup_parent_dates(_db, _task):
        return None

    async def fake_update_project_progress(_db, _project_id):
        return None

    async def fake_emit_event(name, payload):
        emitted_events.append((name, payload))

    async def fake_record_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(projets, "_get_project_or_404", fake_get_project_or_404)
    monkeypatch.setattr(projets, "_rollup_parent_dates", fake_rollup_parent_dates)
    monkeypatch.setattr(projets, "_update_project_progress", fake_update_project_progress)
    monkeypatch.setattr(projets, "emit_event", fake_emit_event)
    monkeypatch.setattr(projets, "record_audit", fake_record_audit)

    response = await projets.update_project_task(
        project_id=project_id,
        task_id=task_id,
        body=ProjectTaskUpdate(
            title="Nouveau titre",
            description="Nouvelle description",
            start_date=None,
            due_date=None,
            status="in_progress",
        ),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert response["assignee_name"] is None
    assert activity.title == "PRJ-002 — Nouveau titre"
    assert activity.description == "Nouvelle description"
    assert db.flushed == 1
    assert emitted_events
    event_name, event_payload = emitted_events[0]
    assert event_name == "project.task.planner_sync_required"
    assert event_payload["task_id"] == str(task_id)
    assert event_payload["planner_activity_ids"] == [str(activity_id)]
    assert "title" in event_payload["changed_fields"]
    assert "status" in event_payload["changed_fields"]


@pytest.mark.asyncio
async def test_acknowledge_revision_signal_records_append_only_audit(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    signal_id = uuid4()
    signal = SimpleNamespace(
        id=signal_id,
        entity_id=entity_id,
        action="project.task.planner_sync_required",
        resource_type="planner_activity",
        resource_id=str(uuid4()),
    )

    class RevisionSignalDB(FakeDB):
        def __init__(self):
            super().__init__()
            self.queries = 0

        async def get(self, model, obj_id):
            if model is AuditLog and obj_id == signal_id:
                return signal
            return None

        async def execute(self, _query):
            self.queries += 1
            return _ExecuteResult([])

    db = RevisionSignalDB()
    audits = []

    async def fake_record_audit(*_args, **kwargs):
        audits.append(kwargs)

    scope = {
        "type": "http",
        "method": "POST",
        "path": f"/api/v1/planner/revision-signals/{signal_id}/acknowledge",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 50000),
    }
    request = Request(scope)

    monkeypatch.setattr(planner, "record_audit", fake_record_audit)

    response = await planner.acknowledge_revision_signal(
        signal_id=signal_id,
        request=request,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert response.acknowledged is True
    assert response.signal_id == signal_id
    assert db.commits == 1
    assert audits and audits[0]["action"] == "project.task.planner_sync_reviewed"
    assert audits[0]["resource_type"] == "planner_revision_signal"
    assert audits[0]["resource_id"] == str(signal_id)


@pytest.mark.asyncio
async def test_get_revision_signal_impact_summary_aggregates_downstream_counts():
    entity_id = uuid4()
    signal_id = uuid4()
    activity_id = uuid4()
    signal = SimpleNamespace(
        id=signal_id,
        entity_id=entity_id,
        action="project.task.planner_sync_required",
        resource_type="planner_activity",
        details={"planner_activity_ids": [str(activity_id)]},
    )
    activity = SimpleNamespace(
        id=activity_id,
        entity_id=entity_id,
        active=True,
        title="Mobilisation offshore",
        status="validated",
    )

    class ImpactSummaryDB(FakeDB):
        def __init__(self):
            super().__init__()
            self.calls = 0

        async def get(self, model, obj_id):
            if model is AuditLog and obj_id == signal_id:
                return signal
            if model is PlannerActivity and obj_id == activity_id:
                return activity
            return None

        async def execute(self, _query, _params=None):
            self.calls += 1
            if self.calls == 1:
                return _ScalarValueResult(3)
            if self.calls == 2:
                return _ScalarValueResult(2)
            if self.calls == 3:
                return _ScalarValueResult(4)
            raise AssertionError("Unexpected execute call")

    db = ImpactSummaryDB()

    response = await planner.get_revision_signal_impact_summary(
        signal_id=signal_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.signal_id == signal_id
    assert response.activity_count == 1
    assert response.total_ads_affected == 3
    assert response.total_manifests_affected == 2
    assert response.total_open_conflict_days == 4
    assert response.activities[0].activity_id == activity_id


@pytest.mark.asyncio
async def test_request_revision_decision_records_audit_and_emits_event(monkeypatch):
    entity_id = uuid4()
    actor_id = uuid4()
    signal_id = uuid4()
    request_id = uuid4()
    target_user_id = uuid4()
    now = datetime.now(timezone.utc)
    signal = SimpleNamespace(
        id=signal_id,
        entity_id=entity_id,
        action="project.task.planner_sync_required",
        resource_type="planner_activity",
        resource_id=str(uuid4()),
        details={
            "project_id": str(uuid4()),
            "project_code": "PRJ-100",
            "project_name": "Offshore Revamp",
            "task_id": str(uuid4()),
            "task_title": "Mobilisation",
            "planner_activity_ids": [str(uuid4())],
        },
    )
    request_row = SimpleNamespace(
        id=request_id,
        resource_id=str(signal_id),
        created_at=now,
        details={
            "project_id": signal.details["project_id"],
            "project_code": "PRJ-100",
            "project_name": "Offshore Revamp",
            "task_id": signal.details["task_id"],
            "task_title": "Mobilisation",
            "planner_activity_ids": signal.details["planner_activity_ids"],
            "requester_user_id": str(actor_id),
            "requester_user_name": "Arbitre Planner",
            "target_user_id": str(target_user_id),
            "target_user_name": "Chef Projet",
            "due_at": now.isoformat(),
            "note": "Décaler de 2 jours",
            "proposed_pax_quota": 8,
        },
    )

    class RevisionDecisionDB(FakeDB):
        async def get(self, model, obj_id):
            if model is AuditLog and obj_id == signal_id:
                return signal
            return None

        async def execute(self, _query, _params=None):
            return _ExecuteResult([request_row])

    db = RevisionDecisionDB()
    audits = []
    events = []

    async def fake_record_audit(*_args, **kwargs):
        audits.append(kwargs)

    async def fake_publish(event):
        events.append(event)

    async def fake_resolve_target(*_args, **_kwargs):
        return target_user_id, "Chef Projet"

    async def fake_get_delay(*_args, **_kwargs):
        return 48

    scope = {
        "type": "http",
        "method": "POST",
        "path": f"/api/v1/planner/revision-signals/{signal_id}/request-decision",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 50000),
    }
    request = Request(scope)

    monkeypatch.setattr(planner, "record_audit", fake_record_audit)
    monkeypatch.setattr(planner.event_bus, "publish", fake_publish)
    monkeypatch.setattr(planner, "_resolve_revision_signal_target", fake_resolve_target)
    monkeypatch.setattr(planner, "_get_planner_revision_response_delay_hours", fake_get_delay)

    response = await planner.request_revision_decision(
        signal_id=signal_id,
        body=planner.RevisionDecisionRequestCreate(note="Décaler de 2 jours", proposed_pax_quota=8),
        request=request,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id, first_name="Arbitre", last_name="Planner", email="arbiter@example.com"),
        _=None,
        db=db,
    )

    assert audits and audits[0]["action"] == "planner.revision.requested"
    assert audits[0]["resource_type"] == "planner_revision_signal"
    assert audits[0]["resource_id"] == str(signal_id)
    assert events and events[0].event_type == "planner.revision.requested"
    assert response["status"] == "pending"
    assert response["target_user_id"] == str(target_user_id)
    assert response["proposed_pax_quota"] == 8


@pytest.mark.asyncio
async def test_respond_revision_decision_request_records_response_and_event(monkeypatch):
    entity_id = uuid4()
    request_id = uuid4()
    signal_id = uuid4()
    target_user_id = uuid4()
    requester_user_id = uuid4()
    request_row = SimpleNamespace(
        id=request_id,
        entity_id=entity_id,
        created_at=datetime.now(timezone.utc),
        action="planner.revision.requested",
        resource_type="planner_revision_signal",
        resource_id=str(signal_id),
        details={
            "signal_id": str(signal_id),
            "requester_user_id": str(requester_user_id),
            "requester_user_name": "Arbitre Planner",
            "target_user_id": str(target_user_id),
            "target_user_name": "Chef Projet",
        },
    )
    resolution_row = SimpleNamespace(
        action="planner.revision.responded",
        details={
            "response": "accepted",
            "response_note": "Accordé",
            "responded_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    class RevisionResponseDB(FakeDB):
        async def get(self, model, obj_id):
            if model is AuditLog and obj_id == request_id:
                return request_row
            return None

    db = RevisionResponseDB()
    audits = []
    events = []
    helper_calls = {"count": 0}

    async def fake_record_audit(*_args, **kwargs):
        audits.append(kwargs)

    async def fake_publish(event):
        events.append(event)

    async def fake_latest_resolution(*_args, **_kwargs):
        helper_calls["count"] += 1
        return None if helper_calls["count"] == 1 else resolution_row

    scope = {
        "type": "http",
        "method": "POST",
        "path": f"/api/v1/planner/revision-decision-requests/{request_id}/respond",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 50000),
    }
    request = Request(scope)

    monkeypatch.setattr(planner, "record_audit", fake_record_audit)
    monkeypatch.setattr(planner.event_bus, "publish", fake_publish)
    monkeypatch.setattr(planner, "_get_latest_revision_request_resolution", fake_latest_resolution)

    response = await planner.respond_revision_decision_request(
        request_id=request_id,
        body=planner.RevisionDecisionRespond(response="accepted", response_note="Accordé"),
        request=request,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=target_user_id),
        db=db,
    )

    assert audits and audits[0]["action"] == "planner.revision.responded"
    assert events and events[0].event_type == "planner.revision.responded"
    assert response["status"] == "responded"
    assert response["response"] == "accepted"


@pytest.mark.asyncio
async def test_force_revision_decision_request_requires_overdue_and_emits_event(monkeypatch):
    entity_id = uuid4()
    request_id = uuid4()
    signal_id = uuid4()
    requester_user_id = uuid4()
    target_user_id = uuid4()
    request_row = SimpleNamespace(
        id=request_id,
        entity_id=entity_id,
        created_at=datetime.now(timezone.utc),
        action="planner.revision.requested",
        resource_type="planner_revision_signal",
        resource_id=str(signal_id),
        details={
            "signal_id": str(signal_id),
            "requester_user_id": str(requester_user_id),
            "requester_user_name": "Arbitre Planner",
            "target_user_id": str(target_user_id),
            "target_user_name": "Chef Projet",
            "due_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        },
    )
    forced_row = SimpleNamespace(
        action="planner.revision.forced",
        details={
            "reason": "Délai dépassé",
            "forced_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    class RevisionForceDB(FakeDB):
        async def get(self, model, obj_id):
            if model is AuditLog and obj_id == request_id:
                return request_row
            return None

    db = RevisionForceDB()
    audits = []
    events = []
    helper_calls = {"count": 0}

    async def fake_record_audit(*_args, **kwargs):
        audits.append(kwargs)

    async def fake_publish(event):
        events.append(event)

    async def fake_latest_resolution(*_args, **_kwargs):
        helper_calls["count"] += 1
        return None if helper_calls["count"] == 1 else forced_row

    scope = {
        "type": "http",
        "method": "POST",
        "path": f"/api/v1/planner/revision-decision-requests/{request_id}/force",
        "headers": [(b"user-agent", b"pytest")],
        "client": ("127.0.0.1", 50000),
    }
    request = Request(scope)

    monkeypatch.setattr(planner, "record_audit", fake_record_audit)
    monkeypatch.setattr(planner.event_bus, "publish", fake_publish)
    monkeypatch.setattr(planner, "_get_latest_revision_request_resolution", fake_latest_resolution)

    response = await planner.force_revision_decision_request(
        request_id=request_id,
        body=planner.RevisionDecisionForce(reason="Délai dépassé"),
        request=request,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        db=db,
    )

    assert audits and audits[0]["action"] == "planner.revision.forced"
    assert events and events[0].event_type == "planner.revision.forced"
    assert response["status"] == "forced"
    assert response["forced_reason"] == "Délai dépassé"


@pytest.mark.asyncio
async def test_apply_accepted_revision_request_updates_leaf_task_and_activity():
    entity_id = uuid4()
    task_id = uuid4()
    activity_id = uuid4()
    task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        active=True,
        start_date=None,
        due_date=None,
        status="todo",
    )
    activity = SimpleNamespace(
        id=activity_id,
        entity_id=entity_id,
        active=True,
        start_date=None,
        end_date=None,
        pax_quota=4,
        status="validated",
    )

    class ApplyAcceptedDB(FakeDB):
        def __init__(self):
            super().__init__()
            self.count_calls = 0

        async def get(self, model, obj_id):
            if model is ProjectTask and obj_id == task_id:
                return task
            if model is PlannerActivity and obj_id == activity_id:
                return activity
            return None

        async def execute(self, _query):
            self.count_calls += 1
            return _ScalarValueResult(0)

    db = ApplyAcceptedDB()

    result = await planner._apply_accepted_revision_request(
        db,
        entity_id=entity_id,
        request_details={
            "task_id": str(task_id),
            "planner_activity_ids": [str(activity_id)],
            "proposed_start_date": "2026-04-10T08:00:00+00:00",
            "proposed_end_date": "2026-04-12T18:00:00+00:00",
            "proposed_pax_quota": 9,
            "proposed_status": "submitted",
        },
    )

    assert result["applied_to_task"] is True
    assert result["task_requires_manual_breakdown"] is False
    assert result["applied_activity_count"] == 1
    assert task.status == "submitted"
    assert activity.pax_quota == 9
    assert activity.status == "submitted"


@pytest.mark.asyncio
async def test_apply_accepted_revision_request_marks_parent_task_for_manual_breakdown(monkeypatch):
    entity_id = uuid4()
    task_id = uuid4()
    child_id_1 = uuid4()
    child_id_2 = uuid4()
    task = SimpleNamespace(
        id=task_id,
        project_id=uuid4(),
        active=True,
        start_date=None,
        due_date=None,
        status="todo",
        title="Parent task",
    )

    class ApplyParentDB(FakeDB):
        async def get(self, model, obj_id):
            if model is ProjectTask and obj_id == task_id:
                return task
            return None

        async def execute(self, _query):
            return _ExecuteResult([(child_id_1,), (child_id_2,)])

    db = ApplyParentDB()

    async def fake_record_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(planner, "record_audit", fake_record_audit)

    result = await planner._apply_accepted_revision_request(
        db,
        entity_id=entity_id,
        request_details={
            "task_id": str(task_id),
            "planner_activity_ids": [],
            "proposed_start_date": "2026-04-10T08:00:00+00:00",
            "proposed_end_date": "2026-04-12T18:00:00+00:00",
            "proposed_status": "submitted",
        },
    )

    assert result["applied_to_task"] is False
    assert result["task_requires_manual_breakdown"] is True
    assert task.status == "todo"
