"""Unit tests for recently added PaxLog operational flows."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from fastapi import HTTPException

from app.api.routes.modules import paxlog
from app.api.routes.modules import planner
from app.core.events import OpsFluxEvent
from app.event_handlers import module_handlers
from app.event_handlers import paxlog_handlers
from app.event_handlers import travelwiz_handlers
from app.models.paxlog import AdsEvent
from app.schemas.planner import ActivityUpdate
from app.schemas.paxlog import AdsStayChangeRequest, MissionNoticeModifyRequest, MissionPreparationTaskUpdate
from app.services.modules import paxlog_service


class FakeResult:
    def __init__(self, *, scalar_one_or_none=None, first=None, all_rows=None, scalar=None):
        self._scalar_one_or_none = scalar_one_or_none
        self._first = first
        self._all_rows = all_rows or []
        self._scalar = scalar

    def scalar_one_or_none(self):
        return self._scalar_one_or_none

    def first(self):
        return self._first

    def all(self):
        return self._all_rows

    def scalar(self):
        return self._scalar


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
        return None

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


def _get_route(path: str, method: str) -> APIRoute:
    for route in paxlog.router.routes:
        if isinstance(route, APIRoute) and route.path.endswith(path) and method.upper() in route.methods:
            return route
    raise AssertionError(f"Route not found: {method} {path}")


def _route_requires_permission(path: str, method: str, permission_code: str) -> bool:
    route = _get_route(path, method)
    for dependency in route.dependant.dependencies:
        call = dependency.call
        if not call:
            continue
        closure = getattr(call, "__closure__", None) or ()
        if any(cell.cell_contents == permission_code for cell in closure):
            return True
    return False


class FakeAsyncSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeEventBusRegistry:
    def __init__(self):
        self.subscriptions = []

    def subscribe(self, event_type, handler):
        self.subscriptions.append((event_type, handler))


def _build_ads(**overrides):
    now = datetime.now(timezone.utc)
    data = {
        "id": uuid4(),
        "entity_id": uuid4(),
        "reference": "ADS-001",
        "type": "contractor_visit",
        "status": "approved",
        "workflow_id": None,
        "planner_activity_id": None,
        "project_id": None,
        "requester_id": uuid4(),
        "site_entry_asset_id": uuid4(),
        "visit_purpose": "Inspection",
        "visit_category": "mission",
        "start_date": date(2026, 4, 10),
        "end_date": date(2026, 4, 12),
        "outbound_transport_mode": "helicopter",
        "outbound_departure_base_id": None,
        "return_transport_mode": "boat",
        "return_departure_base_id": None,
        "cross_company_flag": False,
        "submitted_at": None,
        "approved_at": None,
        "rejected_at": None,
        "rejection_reason": None,
        "archived": False,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def _build_avm(**overrides):
    now = datetime.now(timezone.utc)
    data = {
        "id": uuid4(),
        "entity_id": uuid4(),
        "reference": "AVM-001",
        "title": "Mission offshore",
        "description": None,
        "created_by": uuid4(),
        "status": "active",
        "planned_start_date": date(2026, 4, 10),
        "planned_end_date": date(2026, 4, 20),
        "requires_badge": False,
        "requires_epi": False,
        "requires_visa": False,
        "eligible_displacement_allowance": False,
        "epi_measurements": None,
        "mission_type": "campaign",
        "pax_quota": 12,
        "archived": False,
        "cancellation_reason": None,
        "created_at": now,
        "updated_at": now,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


@pytest.mark.asyncio
async def test_list_avm_normalizes_in_preparation_to_ready(monkeypatch):
    avm = _build_avm(status="in_preparation")
    db = FakeDB(
        [
            FakeResult(scalar=1),
            FakeResult(all_rows=[(avm, "Aline", "Mukeba")]),
            FakeResult(scalar=3),
        ]
    )

    async def fake_get_avm_preparation_status(_db, _avm_id):
        return {
            "progress_percent": 100,
            "open_preparation_tasks": 0,
            "ready_for_approval": True,
        }

    async def fake_has_user_permission(*_args, **_kwargs):
        return True

    monkeypatch.setattr(paxlog_service, "get_avm_preparation_status", fake_get_avm_preparation_status)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.list_avm(
        pagination=SimpleNamespace(page=1, page_size=20),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response["items"][0].status == "ready"
    assert response["items"][0].ready_for_approval is True
    assert response["items"][0].open_preparation_tasks == 0


@pytest.mark.asyncio
async def test_list_avm_scope_all_falls_back_to_creator_without_read_all(monkeypatch):
    avm = _build_avm(status="draft")
    db = FakeDB(
        [
            FakeResult(scalar=0),
            FakeResult(all_rows=[]),
        ]
    )

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.avm.read_all"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.list_avm(
        scope="all",
        pagination=SimpleNamespace(page=1, page_size=20),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response["items"] == []
    compiled = str(db.executed[0][0])
    assert "mission_notices.created_by" in compiled


@pytest.mark.asyncio
async def test_list_avm_normalizes_ready_to_in_preparation_when_blocked(monkeypatch):
    avm = _build_avm(status="ready")
    db = FakeDB(
        [
            FakeResult(scalar=1),
            FakeResult(all_rows=[(avm, "Aline", "Mukeba")]),
            FakeResult(scalar=2),
        ]
    )

    async def fake_get_avm_preparation_status(_db, _avm_id):
        return {
            "progress_percent": 60,
            "open_preparation_tasks": 2,
            "ready_for_approval": False,
        }

    async def fake_has_user_permission(*_args, **_kwargs):
        return True

    monkeypatch.setattr(paxlog_service, "get_avm_preparation_status", fake_get_avm_preparation_status)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.list_avm(
        pagination=SimpleNamespace(page=1, page_size=20),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response["items"][0].status == "in_preparation"
    assert response["items"][0].ready_for_approval is False
    assert response["items"][0].open_preparation_tasks == 2


@pytest.mark.asyncio
async def test_get_avm_denies_non_owner_without_read_all(monkeypatch):
    avm = _build_avm(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.avm.read_all"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.get_avm(
            avm.id,
            entity_id=avm.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "AVM not found"


@pytest.mark.asyncio
async def test_get_ads_includes_avm_origin(monkeypatch):
    ads = _build_ads()
    program_id = uuid4()
    avm_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(first=(program_id, "Inspection compresseur", avm_id, "AVM-009", "Campagne compresseur")),
            FakeResult(first=None),
        ]
    )

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.read_all"
        return True

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.get_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.origin_mission_program_id == program_id
    assert response.origin_mission_program_activity == "Inspection compresseur"
    assert response.origin_mission_notice_id == avm_id
    assert response.origin_mission_notice_reference == "AVM-009"
    assert response.origin_mission_notice_title == "Campagne compresseur"


@pytest.mark.asyncio
async def test_get_ads_includes_planner_context(monkeypatch):
    planner_id = uuid4()
    ads = _build_ads(planner_activity_id=planner_id)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(first=None),
            FakeResult(first=("Inspection ligne 12", "validated")),
        ]
    )

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.read_all"
        return True

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.get_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.planner_activity_id == planner_id
    assert response.planner_activity_title == "Inspection ligne 12"
    assert response.planner_activity_status == "validated"


@pytest.mark.asyncio
async def test_get_ads_denies_non_owner_without_read_all(monkeypatch):
    ads = _build_ads()
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.read_all"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.get_ads(
            ads.id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "AdS not found"


@pytest.mark.asyncio
async def test_update_ads_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.update_ads(
            ads.id,
            paxlog.AdsUpdate(visit_purpose="Updated by outsider"),
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas modifier cette AdS."


@pytest.mark.asyncio
async def test_list_ads_events_denies_non_owner_without_read_all(monkeypatch):
    ads = _build_ads()
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.read_all"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.list_ads_events(
            ads.id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "AdS not found"


@pytest.mark.asyncio
async def test_request_ads_stay_change_sets_requires_review_and_logs_diff(monkeypatch):
    ads = _build_ads(status="in_progress")
    entity_id = ads.entity_id
    current_user = SimpleNamespace(id=ads.requester_id)
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_has_user_permission(*args, **kwargs):
        return False

    published_events = []

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    body = AdsStayChangeRequest(
        reason="Extension de mission",
        end_date=date(2026, 4, 14),
        return_transport_mode="helicopter",
    )

    response = await paxlog.request_ads_stay_change(
        ads.id,
        body,
        entity_id=entity_id,
        current_user=current_user,
        _=None,
        db=db,
    )

    assert response.status == "requires_review"
    assert response.end_date == date(2026, 4, 14)
    assert response.return_transport_mode == "helicopter"
    assert response.rejection_reason == "Extension de mission"
    assert transition_calls and transition_calls[0]["to_state"] == "requires_review"
    assert emitted_events and emitted_events[0]["to_state"] == "requires_review"
    assert audits and audits[0]["action"] == "paxlog.ads.request_stay_change"
    assert published_events and published_events[0].event_type == "ads.stay_change_requested"

    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "stay_change_requested"
    assert ads_event.old_status == "in_progress"
    assert ads_event.new_status == "requires_review"
    assert ads_event.metadata_json["changes"]["end_date"] == {
        "from": "2026-04-12",
        "to": "2026-04-14",
    }
    assert ads_event.metadata_json["changes"]["return_transport_mode"] == {
        "from": "boat",
        "to": "helicopter",
    }


@pytest.mark.asyncio
async def test_request_ads_stay_change_rejects_no_effective_change(monkeypatch):
    ads = _build_ads(status="approved")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(*args, **kwargs):
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.request_ads_stay_change(
            ads.id,
            AdsStayChangeRequest(reason="Aucun changement", end_date=ads.end_date),
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=ads.requester_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "La demande ne contient aucun changement effectif."


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("outbound_transport_mode", "expected_transport_requested"),
    [
        ("helicopter", True),
        ("walking", False),
        (None, False),
    ],
)
async def test_approve_ads_emits_transport_requested_flag(
    monkeypatch,
    outbound_transport_mode,
    expected_transport_requested,
):
    ads = _build_ads(
        status="submitted",
        outbound_transport_mode=outbound_transport_mode,
    )
    pax_entry = SimpleNamespace(status="compliant")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeScalarResult([pax_entry]),
        ]
    )
    emitted_events = []
    transition_calls = []
    audits = []
    published_events = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.approve_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "approved"
    assert transition_calls and transition_calls[0]["to_state"] == "approved"
    assert emitted_events and emitted_events[0]["to_state"] == "approved"
    assert audits and audits[0]["action"] == "paxlog.ads.approve"
    assert published_events and published_events[0].event_type == "ads.approved"
    assert published_events[0].payload["transport_requested"] is expected_transport_requested
    assert published_events[0].payload["outbound_transport_mode"] == outbound_transport_mode


@pytest.mark.asyncio
async def test_modify_active_avm_sets_linked_ads_to_review_and_notifies(monkeypatch):
    avm = _build_avm()
    linked_ads_id = uuid4()
    linked_requester_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[(linked_ads_id, "ADS-009", "approved", linked_requester_id)]),
            FakeResult(),
        ]
    )
    audits = []
    notifications = []
    published_events = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_build_avm_read(_db, updated_avm):
        return SimpleNamespace(
            id=updated_avm.id,
            status=updated_avm.status,
            title=updated_avm.title,
            last_linked_ads_set_to_review=1,
            last_linked_ads_references=["ADS-009"],
        )

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    fake_event_bus = FakeEventBus()

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog, "_build_avm_read", fake_build_avm_read)
    monkeypatch.setattr("app.core.events.event_bus", fake_event_bus)

    body = MissionNoticeModifyRequest(
        reason="Décalage d'une journée",
        planned_end_date=date(2026, 4, 21),
    )

    response = await paxlog.modify_active_avm(
        avm.id,
        body,
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=avm.created_by),
        _=None,
        db=db,
    )

    assert response.last_linked_ads_set_to_review == 1
    assert response.last_linked_ads_references == ["ADS-009"]
    assert notifications and notifications[0]["user_id"] == linked_requester_id
    assert audits and audits[0]["details"]["linked_ads_set_to_review"] == 1
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.modified"

    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "avm_modified_requires_review"
    assert ads_event.old_status == "approved"
    assert ads_event.new_status == "requires_review"


@pytest.mark.asyncio
async def test_modify_active_avm_allows_ready_status(monkeypatch):
    avm = _build_avm(status="ready")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[]),
            FakeResult(),
        ]
    )
    audits = []
    published_events = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_avm_read(_db, updated_avm):
        return SimpleNamespace(id=updated_avm.id, status=updated_avm.status, title=updated_avm.title)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_avm_read", fake_build_avm_read)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.modify_active_avm(
        avm.id,
        MissionNoticeModifyRequest(reason="Ajustement final", title="Mission offshore ajustee"),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=avm.created_by),
        _=None,
        db=db,
    )

    assert response.status == "ready"
    assert audits and audits[0]["action"] == "paxlog.avm.modify_active"
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.modified"


@pytest.mark.asyncio
async def test_modify_active_avm_rejects_non_owner_without_arbitration_permission(monkeypatch):
    avm = _build_avm(status="active")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])

    async def fake_has_user_permission(*args, **kwargs):
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.modify_active_avm(
            avm.id,
            MissionNoticeModifyRequest(reason="Tentative", title="Mission offshore ajustee"),
            entity_id=avm.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert "own AVM" in exc.value.detail


@pytest.mark.asyncio
async def test_update_avm_rejects_non_owner_without_arbitration_permission(monkeypatch):
    avm = _build_avm(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])

    async def fake_has_user_permission(*args, **kwargs):
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.update_avm(
            avm.id,
            paxlog.MissionNoticeUpdate(title="Mission modifiée"),
            entity_id=avm.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert "own AVM" in exc.value.detail


@pytest.mark.asyncio
async def test_update_avm_allows_arbitrator_override(monkeypatch):
    avm = _build_avm(status="in_preparation")
    arbitrator_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])
    audits = []

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        return permission_code == "paxlog.avm.approve"

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_avm_read(_db, updated_avm):
        return SimpleNamespace(id=updated_avm.id, status=updated_avm.status, title=updated_avm.title)

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_avm_read", fake_build_avm_read)

    response = await paxlog.update_avm(
        avm.id,
        paxlog.MissionNoticeUpdate(title="Mission arbitrée"),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=arbitrator_id),
        _=None,
        db=db,
    )

    assert response.title == "Mission arbitrée"
    assert audits and audits[0]["action"] == "paxlog.avm.update"


@pytest.mark.asyncio
async def test_update_avm_preparation_task_allows_arbitrator_override(monkeypatch):
    avm = _build_avm(status="ready")
    arbitrator_id = uuid4()
    task = SimpleNamespace(
        id=uuid4(),
        mission_notice_id=avm.id,
        title="Demande de visa",
        task_type="visa",
        status="pending",
        assigned_to_user_id=None,
        linked_ads_id=None,
        due_date=None,
        completed_at=None,
        notes=None,
        auto_generated=True,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(scalar_one_or_none=task),
            FakeScalarResult([task]),
        ]
    )
    audits = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        return permission_code == "paxlog.avm.approve"

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    response = await paxlog.update_avm_preparation_task(
        avm.id,
        task.id,
        MissionPreparationTaskUpdate(status="completed"),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=arbitrator_id),
        _=None,
        db=db,
    )

    assert response.status == "completed"
    assert audits and audits[0]["action"] == "paxlog.avm.preparation_task.update"


@pytest.mark.asyncio
async def test_cancel_avm_propagates_to_linked_ads(monkeypatch):
    avm = _build_avm(status="in_preparation")
    linked_draft_id = uuid4()
    linked_approved_id = uuid4()
    draft_requester_id = uuid4()
    approved_requester_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[
                (linked_draft_id, "ADS-100", "draft", draft_requester_id),
                (linked_approved_id, "ADS-200", "approved", approved_requester_id),
            ]),
            FakeResult(),
            FakeResult(),
            FakeResult(),
        ]
    )
    audits = []
    notifications = []
    published_events = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_build_avm_read(_db, updated_avm):
        return SimpleNamespace(id=updated_avm.id, status=updated_avm.status, cancellation_reason=updated_avm.cancellation_reason)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    async def fake_has_user_permission(*_args, **_kwargs):
        return True

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog, "_build_avm_read", fake_build_avm_read)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.cancel_avm(
        avm.id,
        reason="Mission annulée par arbitrage",
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "cancelled"
    assert response.cancellation_reason == "Mission annulée par arbitrage"
    assert len(notifications) == 2
    assert audits and audits[0]["details"]["linked_ads_cancelled"] == 1
    assert audits[0]["details"]["linked_ads_reviewed"] == 1
    assert audits[0]["details"]["linked_ads_references"] == ["ADS-100", "ADS-200"]
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.cancelled"
    assert published_events[0].payload["linked_ads_cancelled"] == 1
    assert published_events[0].payload["linked_ads_reviewed"] == 1

    avm_cancel_events = [obj for obj in db.added if isinstance(obj, AdsEvent) and obj.event_type == "avm_cancelled"]
    assert len(avm_cancel_events) == 2
    statuses = {(evt.old_status, evt.new_status) for evt in avm_cancel_events}
    assert ("draft", "cancelled") in statuses
    assert ("approved", "requires_review") in statuses


@pytest.mark.asyncio
async def test_submit_avm_route_denies_non_owner_without_arbitration(monkeypatch):
    avm = _build_avm(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code in {"paxlog.avm.approve", "paxlog.avm.complete"}
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.submit_avm_route(
            avm.id,
            entity_id=avm.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "You may only submit your own AVM unless you can arbitrate it."


@pytest.mark.asyncio
async def test_cancel_avm_denies_non_owner_without_arbitration(monkeypatch):
    avm = _build_avm(status="active")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=avm)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code in {"paxlog.avm.approve", "paxlog.avm.complete"}
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.cancel_avm(
            avm.id,
            entity_id=avm.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "You may only cancel your own AVM unless you can arbitrate it."


@pytest.mark.asyncio
async def test_update_avm_preparation_task_marks_completion_and_audits(monkeypatch):
    avm = _build_avm(status="in_preparation")
    task_id = uuid4()
    assigned_user_id = uuid4()
    linked_ads_id = uuid4()
    task = SimpleNamespace(
        id=task_id,
        mission_notice_id=avm.id,
        title="Demande de visa",
        task_type="visa",
        status="pending",
        assigned_to_user_id=None,
        linked_ads_id=linked_ads_id,
        due_date=None,
        completed_at=None,
        notes=None,
        auto_generated=True,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(scalar_one_or_none=task),
            FakeResult(scalar_one_or_none=assigned_user_id),
            FakeScalarResult([task]),
            FakeResult(first=("Aline", "Mukeba")),
            FakeResult(scalar_one_or_none="ADS-330"),
        ]
    )
    audits = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.update_avm_preparation_task(
        avm.id,
        task.id,
        MissionPreparationTaskUpdate(
            status="completed",
            assigned_to_user_id=assigned_user_id,
            due_date=date(2026, 4, 15),
            notes="Visa reçu",
        ),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=avm.created_by),
        _=None,
        db=db,
    )

    assert response.status == "completed"
    assert response.assigned_to_user_id == assigned_user_id
    assert response.assigned_to_user_name == "Aline Mukeba"
    assert response.linked_ads_reference == "ADS-330"
    assert response.completed_at is not None
    assert audits and audits[0]["action"] == "paxlog.avm.preparation_task.update"
    assert audits[0]["details"]["task_id"] == str(task_id)
    assert audits[0]["details"]["changes"]["status"] == "completed"


@pytest.mark.asyncio
async def test_update_avm_preparation_task_sets_ready_when_no_blocker_remains(monkeypatch):
    avm = _build_avm(status="in_preparation")
    task = SimpleNamespace(
        id=uuid4(),
        mission_notice_id=avm.id,
        title="Demande de visa",
        task_type="visa",
        status="in_progress",
        assigned_to_user_id=None,
        linked_ads_id=None,
        due_date=None,
        completed_at=None,
        notes=None,
        auto_generated=True,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(scalar_one_or_none=task),
            FakeScalarResult([task]),
        ]
    )
    audits = []

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.update_avm_preparation_task(
        avm.id,
        task.id,
        MissionPreparationTaskUpdate(status="completed"),
        entity_id=avm.entity_id,
        current_user=SimpleNamespace(id=avm.created_by),
        _=None,
        db=db,
    )

    assert response.status == "completed"
    assert avm.status == "ready"
    assert audits and audits[0]["action"] == "paxlog.avm.preparation_task.update"


@pytest.mark.asyncio
async def test_approve_avm_refuses_open_preparation_tasks():
    avm = _build_avm(status="in_preparation")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[("Demande de visa", "pending")]),
        ]
    )

    with pytest.raises(ValueError) as exc:
        await paxlog_service.approve_avm(
            db,
            avm.id,
            avm.entity_id,
            uuid4(),
        )

    assert "Cannot approve AVM while preparation tasks remain open" in str(exc.value)
    assert "Demande de visa" in str(exc.value)


@pytest.mark.asyncio
async def test_submit_avm_sets_ready_when_only_ads_creation_tasks_exist(monkeypatch):
    avm = _build_avm(status="draft")
    program = SimpleNamespace(
        id=uuid4(),
        mission_notice_id=avm.id,
        order_index=0,
        activity_description="Inspection compresseur",
        activity_type="inspection",
        site_asset_id=uuid4(),
        planned_start_date=date(2026, 4, 12),
        planned_end_date=date(2026, 4, 14),
        project_id=None,
    )
    db = FakeDB([])
    published_events = []

    async def fake_execute(statement, params=None):
        db.executed.append((statement, params))
        call_index = len(db.executed)
        if call_index == 1:
            return FakeResult(scalar_one_or_none=avm)
        if call_index == 2:
            return FakeScalarResult([program])
        raise AssertionError("Unexpected execute call")

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    db.execute = fake_execute  # type: ignore[method-assign]
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_service.submit_avm(db, avm.id, avm.entity_id, uuid4())

    assert result["status"] == "ready"
    assert avm.status == "ready"
    assert result["preparation_tasks_created"] == 1
    created_tasks = [obj for obj in db.added if getattr(obj, "task_type", None) == "ads_creation"]
    assert len(created_tasks) == 1
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.launched"


@pytest.mark.asyncio
async def test_approve_avm_links_ads_creation_tasks_to_generated_ads(monkeypatch):
    avm = _build_avm(status="ready")
    program = SimpleNamespace(
        id=uuid4(),
        mission_notice_id=avm.id,
        order_index=0,
        activity_description="Inspection compresseur",
        activity_type="inspection",
        site_asset_id=uuid4(),
        planned_start_date=date(2026, 4, 12),
        planned_end_date=date(2026, 4, 14),
        project_id=uuid4(),
        generated_ads_id=None,
    )
    prep_task = SimpleNamespace(
        id=uuid4(),
        mission_notice_id=avm.id,
        title="Creation AdS — Inspection compresseur",
        task_type="ads_creation",
        status="pending",
        assigned_to_user_id=None,
        linked_ads_id=None,
        due_date=None,
        completed_at=None,
        notes=None,
        auto_generated=True,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[]),
            FakeResult(scalar_one_or_none=[program]),  # placeholder, not used
        ]
    )

    published_events = []

    async def fake_generate_ads_reference(_db, _entity_id):
        return "ADS-777"

    async def fake_execute(statement, params=None):
        db.executed.append((statement, params))
        call_index = len(db.executed)
        if call_index == 1:
            return FakeResult(scalar_one_or_none=avm)
        if call_index == 2:
            return FakeResult(all_rows=[])
        if call_index == 3:
            return FakeScalarResult([program])
        if call_index == 4:
            return FakeScalarResult([prep_task])
        if call_index == 5:
            return FakeResult(all_rows=[(uuid4(), None)])
        raise AssertionError("Unexpected execute call")

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    db.execute = fake_execute  # type: ignore[method-assign]
    monkeypatch.setattr(paxlog_service, "generate_ads_reference", fake_generate_ads_reference)
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_service.approve_avm(db, avm.id, avm.entity_id, uuid4())

    assert result["status"] == "active"
    assert result["ads_created"] == 1
    assert program.generated_ads_id is not None
    assert prep_task.linked_ads_id == program.generated_ads_id
    assert prep_task.status == "completed"
    assert prep_task.completed_at is not None
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.approved"


@pytest.mark.asyncio
async def test_complete_avm_refuses_non_terminal_generated_ads():
    avm = _build_avm(status="active")
    generated_ads_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[(uuid4(), "Inspection compresseur", uuid4(), generated_ads_id)]),
            FakeResult(all_rows=[(generated_ads_id, "ADS-777", "approved")]),
        ]
    )

    with pytest.raises(ValueError) as exc:
        await paxlog_service.complete_avm(db, avm.id, avm.entity_id, uuid4())

    assert "Cannot complete AVM while generated AdS are still active" in str(exc.value)
    assert "ADS-777 (approved)" in str(exc.value)


@pytest.mark.asyncio
async def test_complete_avm_succeeds_when_generated_ads_are_terminal(monkeypatch):
    avm = _build_avm(status="active")
    generated_ads_id = uuid4()
    published_events = []
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=avm),
            FakeResult(all_rows=[(uuid4(), "Inspection compresseur", uuid4(), generated_ads_id)]),
            FakeResult(all_rows=[(generated_ads_id, "ADS-888", "completed")]),
        ]
    )

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_service.complete_avm(db, avm.id, avm.entity_id, uuid4())

    assert result["status"] == "completed"
    assert result["generated_ads_count"] == 1
    assert avm.status == "completed"
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.completed"


@pytest.mark.asyncio
async def test_resubmit_ads_clears_rejection_and_rechecks_submission(monkeypatch):
    ads = _build_ads(status="requires_review", rejection_reason="Pièces manquantes")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_run_submission_checks(*args, **kwargs):
        return ([{"id": "p1"}], False, "pending_validation")

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    monkeypatch.setattr(paxlog, "_run_ads_submission_checks", fake_run_submission_checks)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.resubmit_ads(
        ads.id,
        reason="Pièces complétées",
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=ads.requester_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_validation"
    assert response.rejection_reason is None
    assert transition_calls and transition_calls[0]["to_state"] == "pending_validation"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_validation"
    assert audits and audits[0]["action"] == "paxlog.ads.resubmit"

    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "resubmitted"
    assert ads_event.old_status == "requires_review"
    assert ads_event.new_status == "pending_validation"
    assert ads_event.reason == "Pièces complétées"


@pytest.mark.asyncio
async def test_create_stay_program_requires_target_pax():
    ads = _build_ads()
    db = FakeDB([])

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_stay_program(
            ads_id=ads.id,
            movements=[{"from_location": "Base", "to_location": "Site"}],
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Provide user_id or contact_id"


@pytest.mark.asyncio
async def test_create_submit_and_approve_stay_program():
    ads = _build_ads(status="approved")
    program_id = uuid4()
    pax_user_id = uuid4()
    approver_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(scalar_one_or_none=uuid4()),
            FakeResult(scalar=program_id),
            FakeResult(first=(program_id, "draft", ads.id, pax_user_id, None, ads.status)),
            FakeResult(scalar_one_or_none=uuid4()),
            FakeResult(scalar=program_id),
            FakeResult(first=(program_id, "submitted", ads.id, pax_user_id, None, ads.status)),
            FakeResult(scalar_one_or_none=uuid4()),
            FakeResult(scalar=program_id),
        ]
    )

    created = await paxlog.create_stay_program(
        ads_id=ads.id,
        movements=[{
            "effective_date": "2026-04-11",
            "from_location": "Base",
            "to_location": "Munja",
            "transport_mode": "helicopter",
        }],
        user_id=pax_user_id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )
    assert created["id"] == str(program_id)
    assert created["status"] == "draft"
    assert created["user_id"] == str(pax_user_id)

    submitted = await paxlog.submit_stay_program(
        program_id=program_id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )
    assert submitted == {"id": str(program_id), "status": "submitted"}

    approved = await paxlog.approve_stay_program(
        program_id=program_id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=approver_id),
        _=None,
        db=db,
    )
    assert approved == {"id": str(program_id), "status": "approved"}


@pytest.mark.asyncio
async def test_create_stay_program_requires_ads_membership_and_operational_status():
    ads = _build_ads(status="draft")
    pax_user_id = uuid4()

    db_wrong_status = FakeDB([FakeResult(scalar_one_or_none=ads)])
    with pytest.raises(HTTPException) as exc_status:
        await paxlog.create_stay_program(
            ads_id=ads.id,
            movements=[{"effective_date": "2026-04-11", "from_location": "Base", "to_location": "Munja"}],
            user_id=pax_user_id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=db_wrong_status,
        )
    assert exc_status.value.status_code == 400
    assert exc_status.value.detail == "Le programme de sejour n'est autorise que pour une AdS approuvee ou en cours."

    ads.status = "approved"
    db_missing_pax = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(scalar_one_or_none=None),
        ]
    )
    with pytest.raises(HTTPException) as exc_pax:
        await paxlog.create_stay_program(
            ads_id=ads.id,
            movements=[{"effective_date": "2026-04-11", "from_location": "Base", "to_location": "Munja"}],
            user_id=pax_user_id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=db_missing_pax,
        )
    assert exc_pax.value.status_code == 400
    assert exc_pax.value.detail == "Le PAX cible doit deja appartenir a cette AdS."


@pytest.mark.asyncio
async def test_submit_and_approve_stay_program_require_active_ads_context():
    ads = _build_ads(status="completed")
    program_id = uuid4()
    pax_user_id = uuid4()

    submit_db = FakeDB(
        [
            FakeResult(first=(program_id, "draft", ads.id, pax_user_id, None, ads.status)),
        ]
    )
    with pytest.raises(HTTPException) as exc_submit:
        await paxlog.submit_stay_program(
            program_id=program_id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=submit_db,
        )
    assert exc_submit.value.status_code == 400
    assert exc_submit.value.detail == "Le programme de sejour n'est autorise que pour une AdS approuvee ou en cours."

    ads.status = "in_progress"
    approve_db = FakeDB(
        [
            FakeResult(first=(program_id, "submitted", ads.id, pax_user_id, None, ads.status)),
            FakeResult(scalar_one_or_none=None),
        ]
    )
    with pytest.raises(HTTPException) as exc_approve:
        await paxlog.approve_stay_program(
            program_id=program_id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=approve_db,
        )
    assert exc_approve.value.status_code == 400
    assert exc_approve.value.detail == "Le PAX cible doit deja appartenir a cette AdS."


def test_ads_routes_use_expected_permissions():
    assert _route_requires_permission("/ads", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/events", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/pax", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/approve", "POST", "paxlog.ads.approve")
    assert _route_requires_permission("/ads/{ads_id}/reject", "POST", "paxlog.ads.approve")
    assert _route_requires_permission("/ads/{ads_id}/cancel", "POST", "paxlog.ads.cancel")
    assert _route_requires_permission("/stay-programs", "GET", "paxlog.ads.read")


def test_avm_routes_use_expected_permissions():
    assert _route_requires_permission("/avm", "GET", "paxlog.avm.read")
    assert _route_requires_permission("/avm/{avm_id}", "GET", "paxlog.avm.read")


def test_profile_and_compliance_routes_use_expected_permissions():
    assert _route_requires_permission("/profiles", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/profiles/check-duplicates", "POST", "paxlog.profile.read")
    assert _route_requires_permission("/profiles/{profile_id}", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/credential-types", "GET", "paxlog.credential_type.read")
    assert _route_requires_permission("/profiles/{profile_id}/credentials", "GET", "paxlog.credential.read")
    assert _route_requires_permission("/profiles/{profile_id}/compliance/{asset_id}", "GET", "paxlog.compliance.read")


def test_secondary_paxlog_routes_use_expected_permissions():
    assert _route_requires_permission("/compliance-matrix", "GET", "paxlog.compliance.read")
    assert _route_requires_permission("/ads/by-reference/{reference}", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/pdf", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/incidents", "GET", "paxlog.incident.read")
    assert _route_requires_permission("/ads/{ads_id}/imputations", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/imputation-suggestion", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/rotation-cycles", "GET", "paxlog.rotation.manage")
    assert _route_requires_permission("/compliance/expiring", "GET", "paxlog.compliance.read")
    assert _route_requires_permission("/compliance/stats", "GET", "paxlog.compliance.read")
    assert _route_requires_permission("/signalements", "GET", "paxlog.incident.read")
    assert _route_requires_permission("/profile-types", "GET", "paxlog.profile_type.manage")
    assert _route_requires_permission("/pax/{pax_id}/profile-types", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/habilitation-matrix", "GET", "paxlog.profile_type.manage")


@pytest.mark.asyncio
async def test_access_external_link_hides_preconfigured_data_without_session(monkeypatch):
    link = SimpleNamespace(
        ads_id=uuid4(),
        otp_required=True,
        otp_sent_to="contractor@example.com",
        preconfigured_data={"company_name": "Vendor X"},
        max_uses=3,
        use_count=1,
        expires_at=datetime(2026, 4, 30, tzinfo=timezone.utc),
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    response = await paxlog.access_external_link("token-1", x_external_session=None, db=FakeDB([]))

    assert response["ads_id"] == str(link.ads_id)
    assert response["authenticated"] is False
    assert response["otp_required"] is True
    assert response["preconfigured_data"] is None
    assert response["remaining_uses"] == 2


@pytest.mark.asyncio
async def test_access_external_link_exposes_preconfigured_data_with_valid_session(monkeypatch):
    link = SimpleNamespace(
        ads_id=uuid4(),
        otp_required=True,
        otp_sent_to="contractor@example.com",
        preconfigured_data={"company_name": "Vendor X"},
        max_uses=None,
        use_count=0,
        expires_at=datetime(2026, 4, 30, tzinfo=timezone.utc),
    )

    async def fake_get_link(_db, _token):
        return link

    async def fake_require_session(_db, token, session_token):
        assert token == "token-2"
        assert session_token == "session-123"
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)
    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)

    response = await paxlog.access_external_link(
        "token-2",
        x_external_session="session-123",
        db=FakeDB([]),
    )

    assert response["authenticated"] is True
    assert response["preconfigured_data"] == {"company_name": "Vendor X"}
    assert response["remaining_uses"] is None


@pytest.mark.asyncio
async def test_submit_external_ads_requires_draft(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="approved")

    async def fake_require_session(_db, token, session_token):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, uuid4()

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    with pytest.raises(HTTPException) as exc:
        await paxlog.submit_external_ads(
            "token-3",
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-abc",
            db=FakeDB([]),
        )

    assert exc.value.status_code == 400
    assert "Impossible de soumettre" in exc.value.detail


@pytest.mark.asyncio
async def test_resubmit_external_ads_uses_finalize_flow(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="requires_review")
    finalized_calls = []

    async def fake_require_session(_db, token, session_token):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, uuid4()

    async def fake_finalize_external_ads_submission(**kwargs):
        finalized_calls.append(kwargs)
        return kwargs["ads"]

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "_finalize_external_ads_submission", fake_finalize_external_ads_submission)

    response = await paxlog.resubmit_external_ads(
        "token-4",
        request=SimpleNamespace(client=None, headers={}),
        reason="Dossier corrigé",
        x_external_session="session-xyz",
        db=FakeDB([]),
    )

    assert response is ads
    assert finalized_calls and finalized_calls[0]["event_type"] == "external_resubmitted"
    assert finalized_calls[0]["old_status"] == "requires_review"
    assert finalized_calls[0]["reason"] == "Dossier corrigé"


@pytest.mark.asyncio
async def test_module_handler_skips_manifest_lookup_when_transport_not_requested(monkeypatch):
    def fake_session_factory():
        raise AssertionError("TravelWiz lookup should be skipped when transport is not requested")

    monkeypatch.setattr(module_handlers, "async_session_factory", fake_session_factory)

    await module_handlers.on_ads_approved(
        OpsFluxEvent(
            event_type="ads.approved",
            payload={
                "ads_id": str(uuid4()),
                "entity_id": str(uuid4()),
                "site_asset_id": str(uuid4()),
                "start_date": "2026-04-10",
                "outbound_transport_mode": "walking",
                "transport_requested": False,
            },
        )
    )


@pytest.mark.asyncio
async def test_module_handler_derives_no_manifest_lookup_for_walking_mode(monkeypatch):
    def fake_session_factory():
        raise AssertionError("Walking AdS should not trigger TravelWiz manifest lookup")

    monkeypatch.setattr(module_handlers, "async_session_factory", fake_session_factory)

    await module_handlers.on_ads_approved(
        OpsFluxEvent(
            event_type="ads.approved",
            payload={
                "ads_id": str(uuid4()),
                "entity_id": str(uuid4()),
                "site_asset_id": str(uuid4()),
                "start_date": "2026-04-10",
                "outbound_transport_mode": "walking",
            },
        )
    )


@pytest.mark.asyncio
async def test_planner_activity_modified_creates_ads_event_and_notifies(monkeypatch):
    entity_id = uuid4()
    activity_id = uuid4()
    ads_id = uuid4()
    requester_id = uuid4()
    db = FakeDB([FakeResult(all_rows=[(ads_id, "ADS-321", requester_id)])])
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await paxlog_handlers.on_planner_activity_modified(
        OpsFluxEvent(
            event_type="planner.activity.modified",
            payload={
                "activity_id": str(activity_id),
                "entity_id": str(entity_id),
                "title": "Inspection torch line",
                "changes": {
                    "start_date": {"old": "2026-04-10", "new": "2026-04-12"},
                },
            },
        )
    )

    planner_events = [obj for obj in db.added if isinstance(obj, AdsEvent)]
    assert len(planner_events) == 1
    assert planner_events[0].event_type == "planner_activity_modified_requires_review"
    assert planner_events[0].new_status == "requires_review"
    assert planner_events[0].reason == "Inspection torch line"
    assert planner_events[0].metadata_json["planner_activity_id"] == str(activity_id)
    assert planner_events[0].metadata_json["changes"]["start_date"]["new"] == "2026-04-12"
    assert notifications and notifications[0]["link"] == f"/paxlog/ads/{ads_id}"


@pytest.mark.asyncio
async def test_planner_activity_cancelled_creates_ads_event_and_notifies(monkeypatch):
    entity_id = uuid4()
    activity_id = uuid4()
    ads_id = uuid4()
    requester_id = uuid4()
    db = FakeDB([FakeResult(all_rows=[(ads_id, "ADS-654", requester_id)])])
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await paxlog_handlers.on_planner_activity_cancelled(
        OpsFluxEvent(
            event_type="planner.activity.cancelled",
            payload={
                "activity_id": str(activity_id),
                "entity_id": str(entity_id),
                "title": "Shutdown window",
            },
        )
    )

    planner_events = [obj for obj in db.added if isinstance(obj, AdsEvent)]
    assert len(planner_events) == 1
    assert planner_events[0].event_type == "planner_activity_cancelled"
    assert planner_events[0].new_status == "requires_review"
    assert planner_events[0].reason == "Shutdown window"
    assert planner_events[0].metadata_json["planner_activity_id"] == str(activity_id)
    assert planner_events[0].metadata_json["planner_activity_title"] == "Shutdown window"
    assert notifications and notifications[0]["link"] == f"/paxlog/ads/{ads_id}"


def test_register_module_handlers_does_not_duplicate_planner_cancelled_for_paxlog():
    bus = FakeEventBusRegistry()

    module_handlers.register_module_handlers(bus)

    subscribed_events = [event_type for event_type, _handler in bus.subscriptions]
    assert "planner.activity.cancelled" not in subscribed_events


@pytest.mark.asyncio
async def test_update_activity_counts_impacted_ads_without_updating_them(monkeypatch):
    entity_id = uuid4()
    activity = SimpleNamespace(
        id=uuid4(),
        entity_id=entity_id,
        asset_id=uuid4(),
        title="Inspection line A",
        type="maintenance",
        status="validated",
        pax_quota=12,
        start_date=datetime(2026, 4, 10, tzinfo=timezone.utc),
        end_date=datetime(2026, 4, 12, tzinfo=timezone.utc),
    )
    db = FakeDB([FakeResult(scalar=2)])
    published_events = []

    async def fake_get_activity_or_404(_db, _activity_id, _entity_id):
        return activity

    async def fake_enrich_activity(_db, enriched_activity):
        return enriched_activity

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(planner, "_get_activity_or_404", fake_get_activity_or_404)
    monkeypatch.setattr(planner, "_enrich_activity", fake_enrich_activity)
    monkeypatch.setattr(planner, "event_bus", FakeEventBus())

    response = await planner.update_activity(
        activity.id,
        ActivityUpdate(start_date=datetime(2026, 4, 11, tzinfo=timezone.utc)),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.start_date == datetime(2026, 4, 11, tzinfo=timezone.utc)
    sql_text = str(db.executed[0][0])
    assert "SELECT COUNT(*)" in sql_text
    assert "UPDATE ads SET status = 'requires_review'" not in sql_text
    assert published_events and published_events[0].payload["ads_flagged_for_review"] == 2


@pytest.mark.asyncio
async def test_cancel_activity_counts_impacted_ads_without_updating_them(monkeypatch):
    entity_id = uuid4()
    activity = SimpleNamespace(
        id=uuid4(),
        entity_id=entity_id,
        asset_id=uuid4(),
        title="Shutdown slot",
        status="validated",
    )
    db = FakeDB([FakeResult(scalar=3)])
    transition_calls = []
    transition_events = []
    published_events = []

    async def fake_get_activity_or_404(_db, _activity_id, _entity_id):
        return activity

    async def fake_enrich_activity(_db, enriched_activity):
        return enriched_activity

    async def fake_try_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(planner, "_get_activity_or_404", fake_get_activity_or_404)
    monkeypatch.setattr(planner, "_enrich_activity", fake_enrich_activity)
    monkeypatch.setattr(planner, "_try_workflow_transition", fake_try_transition)
    monkeypatch.setattr(planner.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(planner, "event_bus", FakeEventBus())

    response = await planner.cancel_activity(
        activity.id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "cancelled"
    sql_text = str(db.executed[0][0])
    assert "SELECT COUNT(*)" in sql_text
    assert "UPDATE ads SET status = 'requires_review'" not in sql_text
    assert transition_calls and transition_events
    assert published_events and published_events[0].payload["ads_flagged_for_review"] == 3


@pytest.mark.asyncio
async def test_travelwiz_planner_change_notifies_admins_for_impacted_manifests(monkeypatch):
    entity_id = uuid4()
    db = FakeDB([FakeResult(all_rows=[(uuid4(),), (uuid4(),)])])
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_get_admin_user_ids(_entity_id):
        return [uuid4(), uuid4()]

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.event_handlers.core_handlers._get_admin_user_ids", fake_get_admin_user_ids)
    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await travelwiz_handlers.on_planner_activity_modified_tw(
        OpsFluxEvent(
            event_type="planner.activity.modified",
            payload={
                "activity_id": str(uuid4()),
                "entity_id": str(entity_id),
                "title": "Inspection compressor",
                "changes": {
                    "start_date": {"old": "2026-04-10 00:00:00+00:00", "new": "2026-04-12 00:00:00+00:00"},
                    "pax_quota": {"old": "8", "new": "12"},
                },
            },
        )
    )

    sql_text = str(db.executed[0][0])
    assert "UPDATE pax_manifests pm SET status = 'requires_review'" in sql_text
    assert len(notifications) == 2
    assert all(item["category"] == "travelwiz" for item in notifications)
    assert all(item["link"] == "/travelwiz" for item in notifications)
    assert "Inspection compressor" in notifications[0]["body"]
    assert "pax_quota" in notifications[0]["body"]
    assert "start_date" in notifications[0]["body"]


@pytest.mark.asyncio
async def test_travelwiz_planner_change_skips_notifications_when_no_manifest_impacted(monkeypatch):
    entity_id = uuid4()
    db = FakeDB([FakeResult(all_rows=[])])
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_get_admin_user_ids(_entity_id):
        return [uuid4()]

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.event_handlers.core_handlers._get_admin_user_ids", fake_get_admin_user_ids)
    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await travelwiz_handlers.on_planner_activity_modified_tw(
        OpsFluxEvent(
            event_type="planner.activity.modified",
            payload={
                "activity_id": str(uuid4()),
                "entity_id": str(entity_id),
                "title": "No manifest case",
            },
        )
    )

    assert notifications == []
