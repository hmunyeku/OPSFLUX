"""Unit tests for recently added PaxLog operational flows."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from fastapi import HTTPException

from app.api.routes.modules import paxlog
from app.api.routes.modules import conformite
from app.api.routes.modules import planner
from app.core.events import OpsFluxEvent
from app.event_handlers import module_handlers
from app.event_handlers import paxlog_handlers
from app.event_handlers import travelwiz_handlers
from app.tasks.jobs import paxlog_ads_autoclose
from app.tasks.jobs import paxlog_requires_review_followup
from app.models.common import CostImputation
from app.models.paxlog import AdsEvent, MissionAllowanceRequest, MissionVisaFollowup
from app.schemas.planner import ActivityUpdate
from app.schemas.paxlog import AdsManualDepartureRequest, AdsStayChangeRequest, MissionNoticeModifyRequest, MissionPreparationTaskUpdate
from app.services.modules import paxlog_service
from app.services.modules import compliance_service


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

    def scalars(self):
        if self._scalar is not None:
            return self._scalar
        return FakeScalarResult(self._all_rows)


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.deleted = []
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

    async def delete(self, obj):
        self.deleted.append(obj)

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


class FakeDBWithGet(FakeDB):
    def __init__(self, results, *, get_map=None):
        super().__init__(results)
        self._get_map = get_map or {}

    async def get(self, model, key):
        return self._get_map.get((model, key))


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
        code = getattr(call, "__code__", None)
        if code and permission_code in code.co_consts:
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
    if "created_by" not in overrides:
        data["created_by"] = data["requester_id"]
    return SimpleNamespace(**data)


def _ads_read_payload(ads, entity_id):
    payload = dict(ads.__dict__)
    for field in ("submitted_at", "approved_at", "rejected_at"):
        if not isinstance(payload.get(field), datetime):
            payload[field] = None
    payload.setdefault("workflow_id", None)
    payload.setdefault("archived", False)
    payload.setdefault("cross_company_flag", False)
    payload["entity_id"] = entity_id
    return payload


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
        "global_attachments_config": [],
        "per_pax_attachments_config": [],
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
            FakeResult(all_rows=[]),
            FakeResult(all_rows=[(ads.requester_id, "Aline", "Mukeba")]),
            FakeResult(first=(program_id, "Inspection compresseur", avm_id, "AVM-009", "Campagne compresseur")),
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
            FakeResult(all_rows=[]),
            FakeResult(all_rows=[(ads.requester_id, "Aline", "Mukeba")]),
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
async def test_submit_ads_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.submit_ads(
            ads.id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas soumettre cette AdS."


@pytest.mark.asyncio
async def test_cancel_ads_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="approved")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.cancel_ads(
            ads.id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas annuler cette AdS."


@pytest.mark.asyncio
async def test_submit_ads_routes_to_pending_initiator_review_when_created_for_someone_else(monkeypatch):
    requester_id = uuid4()
    creator_id = uuid4()
    ads = _build_ads(status="draft", requester_id=requester_id, created_by=creator_id)
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_can_manage_ads(*_args, **_kwargs):
        return True

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    async def fake_resolve_auto_transition(*_args, **_kwargs):
        return "pending_initiator_review"

    monkeypatch.setattr(paxlog, "_can_manage_ads", fake_can_manage_ads)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog, "_resolve_ads_auto_transition", fake_resolve_auto_transition)

    response = await paxlog.submit_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=creator_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_initiator_review"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_initiator_review"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_initiator_review"
    assert audits and audits[0]["details"]["initiator_review_required"] is True


@pytest.mark.asyncio
async def test_create_then_submit_ads_starts_workflow_with_initiator_review(monkeypatch):
    entity_id = uuid4()
    creator_id = uuid4()
    requester_id = uuid4()
    site_asset_id = uuid4()
    create_db = FakeDBWithGet([], get_map={(paxlog.User, requester_id): SimpleNamespace(id=requester_id, active=True)})
    transition_calls = []
    emitted_events = []
    created_ads_ref = {}

    async def fake_generate_reference(*_args, **_kwargs):
        return "ADS-NEW-001"

    async def fake_replace_allowed_companies(*_args, **_kwargs):
        return ([], [])

    async def fake_ensure_default_imputation(*_args, **_kwargs):
        return None

    async def fake_record_audit(*_args, **_kwargs):
        return None

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        ads.rejection_reason = getattr(ads, "rejection_reason", None)
        ads.created_at = getattr(ads, "created_at", None) or datetime.now(timezone.utc)
        ads.updated_at = getattr(ads, "updated_at", None) or datetime.now(timezone.utc)
        created_ads_ref["ads"] = ads
        return _ads_read_payload(ads, entity_id)

    async def fake_can_manage_ads(*_args, **_kwargs):
        return True

    async def fake_transition(*_args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_resolve_auto_transition(*_args, **_kwargs):
        return "pending_initiator_review"

    monkeypatch.setattr(paxlog, "generate_reference", fake_generate_reference)
    monkeypatch.setattr(paxlog, "_replace_ads_allowed_companies", fake_replace_allowed_companies)
    monkeypatch.setattr(paxlog, "_ensure_ads_default_imputation", fake_ensure_default_imputation)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog, "_resolve_ads_auto_transition", fake_resolve_auto_transition)

    create_body = paxlog.AdsCreate(
        type="individual",
        requester_id=requester_id,
        site_entry_asset_id=site_asset_id,
        visit_purpose="Inspection",
        visit_category="visit",
        start_date=date(2026, 4, 10),
        end_date=date(2026, 4, 12),
        pax_entries=[],
    )

    create_response = await paxlog.create_ads(
        create_body,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=creator_id),
        _=None,
        db=create_db,
    )

    created_ads = created_ads_ref["ads"]
    assert create_response.status == "draft"
    assert created_ads.created_by == creator_id
    assert created_ads.requester_id == requester_id

    submit_db = FakeDB([FakeResult(scalar_one_or_none=created_ads)])
    monkeypatch.setattr(paxlog, "_can_manage_ads", fake_can_manage_ads)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)

    submit_response = await paxlog.submit_ads(
        created_ads.id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=creator_id),
        _=None,
        db=submit_db,
    )

    assert submit_response.status == "pending_initiator_review"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_initiator_review"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_initiator_review"


@pytest.mark.asyncio
async def test_submit_ads_routes_to_pending_project_review_when_project_manager_review_is_required(monkeypatch):
    ads = _build_ads(status="draft", project_id=uuid4())
    project = SimpleNamespace(id=ads.project_id, manager_id=uuid4())
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_can_manage_ads(*_args, **_kwargs):
        return True

    async def fake_get_project_reviewer(*_args, **_kwargs):
        return project

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    async def fake_resolve_auto_transition(*_args, **_kwargs):
        return "pending_project_review"

    monkeypatch.setattr(paxlog, "_can_manage_ads", fake_can_manage_ads)
    monkeypatch.setattr(paxlog, "_get_ads_project_reviewer", fake_get_project_reviewer)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog, "_resolve_ads_auto_transition", fake_resolve_auto_transition)

    response = await paxlog.submit_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "pending_project_review"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_project_review"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_project_review"
    assert audits and audits[0]["details"]["project_review_required"] is True


@pytest.mark.asyncio
async def test_approve_ads_from_initiator_review_runs_next_step(monkeypatch):
    requester_id = uuid4()
    creator_id = uuid4()
    ads = _build_ads(status="pending_initiator_review", requester_id=requester_id, created_by=creator_id, project_id=uuid4())
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        if permission_code == "paxlog.ads.approve":
            return False
        if permission_code == "project.update":
            return False
        return False

    async def fake_get_project_reviewer(*_args, **_kwargs):
        return None

    async def fake_submission_checks(*_args, **_kwargs):
        return ([SimpleNamespace(id=uuid4())], False, "pending_compliance")

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    async def fake_resolve_auto_transition(*_args, **_kwargs):
        return "pending_compliance"

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "_get_ads_project_reviewer", fake_get_project_reviewer)
    monkeypatch.setattr(paxlog, "_run_ads_submission_checks", fake_submission_checks)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog, "_resolve_ads_auto_transition", fake_resolve_auto_transition)

    response = await paxlog.approve_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=requester_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_compliance"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_compliance"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_compliance"
    assert audits and audits[0]["action"] == "paxlog.ads.initiator_approve"


@pytest.mark.asyncio
async def test_approve_ads_from_project_review_runs_compliance_checks(monkeypatch):
    manager_id = uuid4()
    ads = _build_ads(status="pending_project_review", project_id=uuid4())
    project = SimpleNamespace(id=ads.project_id, manager_id=manager_id)
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_get_project_reviewer(*_args, **_kwargs):
        return project

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        if permission_code == "paxlog.ads.approve":
            return False
        if permission_code == "project.update":
            return True
        return False

    async def fake_submission_checks(*_args, **_kwargs):
        return ([SimpleNamespace(id=uuid4())], False, "pending_compliance")

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    async def fake_resolve_auto_transition(*_args, **_kwargs):
        return "pending_compliance"

    monkeypatch.setattr(paxlog, "_get_ads_project_reviewer", fake_get_project_reviewer)
    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "_run_ads_submission_checks", fake_submission_checks)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog, "_resolve_ads_auto_transition", fake_resolve_auto_transition)

    response = await paxlog.approve_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=manager_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_compliance"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_compliance"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_compliance"
    assert audits and audits[0]["action"] == "paxlog.ads.project_approve"


@pytest.mark.asyncio
async def test_approve_ads_from_pending_compliance_requires_hse_and_moves_to_pending_validation(monkeypatch):
    reviewer_id = uuid4()
    ads = _build_ads(status="pending_compliance")
    compliant_entry = SimpleNamespace(id=uuid4(), ads_id=ads.id, status="compliant")
    db = FakeDB([
        FakeResult(scalar_one_or_none=ads),
        FakeScalarResult([]),
    ])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        return permission_code == "paxlog.compliance.manage"

    async def fake_transition(*_args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*_args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)

    response = await paxlog.approve_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=reviewer_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_validation"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_validation"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_validation"
    assert audits and audits[0]["action"] == "paxlog.ads.compliance_approve"


@pytest.mark.asyncio
async def test_approve_ads_from_pending_validation_denies_user_without_final_approval(monkeypatch):
    ads = _build_ads(status="pending_validation")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        if permission_code == "paxlog.ads.approve":
            return False
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.approve_ads(
            ads.id,
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=uuid4()),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas approuver cette AdS."


@pytest.mark.asyncio
async def test_resubmit_ads_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="requires_review")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.resubmit_ads(
            ads.id,
            reason="updated",
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas re-soumettre cette AdS."


@pytest.mark.asyncio
async def test_add_pax_to_ads_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.add_pax_to_ads(
            ads.id,
            body=paxlog.AddPaxBody(user_id=uuid4()),
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id, user_type="internal"),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas modifier les PAX de cette AdS."


@pytest.mark.asyncio
async def test_create_external_link_denies_non_owner_without_approve(monkeypatch):
    ads = _build_ads(status="draft")
    outsider_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        assert permission_code == "paxlog.ads.approve"
        return False

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_external_link(
            ads.id,
            body=paxlog.ExternalLinkCreateBody(),
            entity_id=ads.entity_id,
            current_user=SimpleNamespace(id=outsider_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Vous ne pouvez pas créer de lien externe pour cette AdS."


@pytest.mark.asyncio
async def test_create_external_link_returns_external_portal_url(monkeypatch):
    ads = _build_ads(status="approved")
    current_user = SimpleNamespace(id=ads.requester_id)
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    audit_calls = []

    async def fake_record_audit(*args, **kwargs):
        audit_calls.append((args, kwargs))

    async def fake_resolve_destination(_db, *, ads_id, body):
        assert ads_id == ads.id
        assert body.max_uses == 3
        return "contractor@example.com", {
            "source": "ads_pax",
            "recipient_label": "Jean Dupont",
            "effective_channel": "email",
        }

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_resolve_external_link_destination", fake_resolve_destination)
    monkeypatch.setattr(paxlog.settings, "APP_URL", "https://app.opsflux.io")

    response = await paxlog.create_external_link(
        ads.id,
        body=paxlog.ExternalLinkCreateBody(max_uses=3),
        entity_id=ads.entity_id,
        current_user=current_user,
        _=None,
        db=db,
    )

    assert response["token"]
    assert response["url"] == f"https://ext.opsflux.io/?token={response['token']}"
    assert response["otp_sent_to"] == "contractor@example.com"
    assert response["max_uses"] == 3
    assert audit_calls


@pytest.mark.asyncio
async def test_create_external_link_uses_selected_recipient_destination(monkeypatch):
    ads = _build_ads(status="approved")
    current_user = SimpleNamespace(id=ads.requester_id)
    selected_contact_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    captured = {}

    async def fake_record_audit(*args, **kwargs):
        return None

    async def fake_resolve_destination(_db, *, ads_id, body):
        captured["recipient_contact_id"] = body.recipient_contact_id
        captured["otp_required"] = body.otp_required
        return "vendor@example.com", {"source": "ads_pax"}

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_resolve_external_link_destination", fake_resolve_destination)

    response = await paxlog.create_external_link(
        ads.id,
        body=paxlog.ExternalLinkCreateBody(recipient_contact_id=selected_contact_id),
        entity_id=ads.entity_id,
        current_user=current_user,
        _=None,
        db=db,
    )

    assert response["otp_sent_to"] == "vendor@example.com"
    assert captured["recipient_contact_id"] == selected_contact_id
    assert captured["otp_required"] is True


@pytest.mark.asyncio
async def test_list_ads_pax_exposes_contact_channels(monkeypatch):
    ads = _build_ads(status="approved")
    user_id = uuid4()
    contact_id = uuid4()
    db = FakeDBWithGet(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(all_rows=[
                SimpleNamespace(
                    id=uuid4(),
                    ads_id=ads.id,
                    user_id=user_id,
                    contact_id=None,
                    status="pending",
                    compliance_summary=None,
                    priority_score=0,
                ),
                SimpleNamespace(
                    id=uuid4(),
                    ads_id=ads.id,
                    user_id=None,
                    contact_id=contact_id,
                    status="pending",
                    compliance_summary=None,
                    priority_score=0,
                ),
            ]),
        ],
        get_map={
            (paxlog.User, user_id): SimpleNamespace(
                id=user_id,
                first_name="Alice",
                last_name="User",
                badge_number="U-1",
                pax_type="internal",
                email="alice@example.com",
            ),
            (paxlog.TierContact, contact_id): SimpleNamespace(
                id=contact_id,
                first_name="Bob",
                last_name="Contact",
                tier_id=uuid4(),
                badge_number="C-1",
                email="bob@example.com",
                phone="+243000000000",
            ),
        },
    )

    async def fake_assert_ads_read_access(*args, **kwargs):
        return None

    async def fake_resolve_user_contact(_db, _user_id, channel):
        return "alice@example.com" if channel == "email" else "+243111111111"

    monkeypatch.setattr(paxlog, "_assert_ads_read_access", fake_assert_ads_read_access)
    monkeypatch.setattr("app.core.sms_service.resolve_user_contact", fake_resolve_user_contact)

    items = await paxlog.list_ads_pax(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=ads.requester_id),
        _=None,
        db=db,
    )

    user_item = next(item for item in items if item["user_id"] == str(user_id))
    contact_item = next(item for item in items if item["contact_id"] == str(contact_id))

    assert user_item["pax_email"] == "alice@example.com"
    assert user_item["pax_phone"] == "+243111111111"
    assert contact_item["pax_email"] == "bob@example.com"
    assert contact_item["pax_phone"] == "+243000000000"


@pytest.mark.asyncio
async def test_get_compliance_verification_sequence_reads_entity_setting():
    entity_id = uuid4()
    db = FakeDB([
        FakeResult(scalar_one_or_none={"v": ["job_profile", "site_requirements", "self_declaration"]}),
    ])

    sequence = await paxlog_service.get_compliance_verification_sequence(db, entity_id=entity_id)

    assert sequence == ["job_profile", "site_requirements", "self_declaration"]


@pytest.mark.asyncio
async def test_run_ads_submission_checks_reuses_full_compliance_contract(monkeypatch):
    ads = _build_ads(status="draft", site_entry_asset_id=uuid4())
    pax_entry = SimpleNamespace(
        id=uuid4(),
        ads_id=ads.id,
        user_id=uuid4(),
        contact_id=None,
        compliance_checked_at=None,
        compliance_summary=None,
        status="pending_check",
    )
    db = FakeDBWithGet(
        [FakeResult(all_rows=[pax_entry])],
        get_map={
            (paxlog.User, pax_entry.user_id): SimpleNamespace(first_name="Alice", last_name="Reviewer"),
        },
    )

    async def fake_check_pax_compliance(_db, asset_id, entity_id, *, user_id=None, contact_id=None):
        assert asset_id == ads.site_entry_asset_id
        assert user_id == pax_entry.user_id
        assert contact_id is None
        return {
            "compliant": False,
            "results": [
                {
                    "credential_type_code": "H2S",
                    "credential_type_name": "H2S",
                    "status": "missing",
                    "message": "Habilitation manquante : H2S",
                    "layer": "site_requirements",
                    "layer_label": "Règles site",
                    "blocking": True,
                },
            ],
            "covered_layers": ["site_requirements", "job_profile"],
            "summary_by_status": {"missing": 1},
            "verification_sequence": ["job_profile", "site_requirements", "self_declaration"],
        }

    monkeypatch.setattr(paxlog_service, "check_pax_compliance", fake_check_pax_compliance)

    pax_entries, has_issues, target_status = await paxlog._run_ads_submission_checks(
        db,
        ads=ads,
        entity_id=ads.entity_id,
    )

    assert pax_entries == [pax_entry]
    assert has_issues is True
    assert target_status == "pending_compliance"
    assert pax_entry.status == "blocked"
    assert pax_entry.compliance_summary["verification_sequence"] == ["job_profile", "site_requirements", "self_declaration"]
    assert "Alice Reviewer" in pax_entry.compliance_summary["issues_summary"]
    assert ads.rejection_reason == pax_entry.compliance_summary["issues_summary"]


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
    assert ads_event.metadata_json["change_kinds"] == ["extension", "transport_change"]
    assert ads_event.metadata_json["primary_change_kind"] == "extension"
    assert published_events[0].payload["change_kinds"] == ["extension", "transport_change"]
    assert published_events[0].payload["primary_change_kind"] == "extension"


@pytest.mark.asyncio
async def test_request_ads_stay_change_classifies_early_return(monkeypatch):
    ads = _build_ads(status="in_progress")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])

    async def fake_has_user_permission(*args, **kwargs):
        return False

    async def fake_transition(*args, **kwargs):
        return None

    async def fake_emit_transition_event(**kwargs):
        return None

    async def fake_record_audit(*args, **kwargs):
        return None

    class FakeEventBus:
        async def publish(self, event):
            return None

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    await paxlog.request_ads_stay_change(
        ads.id,
        AdsStayChangeRequest(reason="Retour anticipé", end_date=date(2026, 4, 10)),
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=ads.requester_id),
        _=None,
        db=db,
    )

    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.metadata_json["change_kinds"] == ["early_return"]


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
    (
        "outbound_transport_mode",
        "return_transport_mode",
        "expected_outbound_requested",
        "expected_return_requested",
        "expected_transport_requested",
    ),
    [
        ("helicopter", "walking", True, False, True),
        ("walking", "boat", False, True, True),
        ("walking", "walking", False, False, False),
        (None, None, False, False, False),
    ],
)
async def test_approve_ads_emits_transport_requested_flag(
    monkeypatch,
    outbound_transport_mode,
    return_transport_mode,
    expected_outbound_requested,
    expected_return_requested,
    expected_transport_requested,
):
    ads = _build_ads(
        status="submitted",
        outbound_transport_mode=outbound_transport_mode,
        return_transport_mode=return_transport_mode,
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

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    async def fake_has_user_permission(_user, _entity_id, permission_code, _db):
        return permission_code == "paxlog.ads.approve"

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "has_user_permission", fake_has_user_permission)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
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
    assert (
        published_events[0].payload["outbound_transport_requested"]
        is expected_outbound_requested
    )
    assert (
        published_events[0].payload["return_transport_requested"]
        is expected_return_requested
    )
    assert published_events[0].payload["transport_requested"] is expected_transport_requested
    assert published_events[0].payload["outbound_transport_mode"] == outbound_transport_mode
    assert published_events[0].payload["return_transport_mode"] == return_transport_mode


@pytest.mark.asyncio
async def test_decide_ads_pax_finalizes_ads_as_approved_when_at_least_one_passenger_is_approved(monkeypatch):
    ads = _build_ads(status="pending_validation")
    approved_entry = SimpleNamespace(id=uuid4(), ads_id=ads.id, status="approved")
    target_entry = SimpleNamespace(id=uuid4(), ads_id=ads.id, status="pending_check")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(scalar_one_or_none=target_entry),
            FakeScalarResult([approved_entry, target_entry]),
            FakeScalarResult([approved_entry]),
        ]
    )
    transition_calls = []
    published_events = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.decide_ads_pax(
        ads.id,
        target_entry.id,
        paxlog.AdsPaxDecision(action="reject", reason="Missing project scope"),
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "approved"
    assert target_entry.status == "rejected"
    assert transition_calls and transition_calls[0]["to_state"] == "approved"
    assert published_events and published_events[0].event_type == "ads.approved"


@pytest.mark.asyncio
async def test_decide_ads_pax_finalizes_ads_as_rejected_when_all_passengers_are_rejected(monkeypatch):
    ads = _build_ads(status="pending_validation")
    rejected_entry = SimpleNamespace(id=uuid4(), ads_id=ads.id, status="rejected")
    target_entry = SimpleNamespace(id=uuid4(), ads_id=ads.id, status="pending_check")
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(scalar_one_or_none=target_entry),
            FakeScalarResult([rejected_entry, target_entry]),
        ]
    )
    transition_calls = []
    published_events = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.decide_ads_pax(
        ads.id,
        target_entry.id,
        paxlog.AdsPaxDecision(action="reject", reason="Site refusal"),
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "rejected"
    assert target_entry.status == "rejected"
    assert transition_calls and transition_calls[0]["to_state"] == "rejected"
    assert published_events and published_events[0].event_type == "ads.rejected"


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


def test_manual_departure_route_requires_ads_approve_permission():
    assert _route_requires_permission("/ads/{ads_id}/manual-departure", "POST", "paxlog.ads.approve")


@pytest.mark.asyncio
async def test_manual_departure_completes_ads_with_omaa_source(monkeypatch):
    entity_id = uuid4()
    requester_id = uuid4()
    actor_id = uuid4()
    ads = _build_ads(entity_id=entity_id, requester_id=requester_id, status="in_progress")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_events = []
    published_events = []
    audits = []

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    monkeypatch.setattr(paxlog_service.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)

    response = await paxlog.complete_ads_manual_departure(
        ads.id,
        AdsManualDepartureRequest(reason="Evacuation medicale"),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert response.status == "completed"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.metadata_json["source"] == "omaa.manual_departure"
    assert ads_event.reason == "Evacuation medicale"
    assert transition_events and transition_events[0]["to_state"] == "completed"
    assert published_events and published_events[0].event_type == "ads.completed"
    assert published_events[0].payload["source"] == "omaa.manual_departure"
    assert audits and audits[0]["action"] == "paxlog.ads.manual_departure"


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
        if call_index == 3:
            return FakeResult(all_rows=[])
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
async def test_submit_avm_creates_document_collection_task_and_stays_in_preparation(monkeypatch):
    avm = _build_avm(
        status="draft",
        global_attachments_config=["Ordre de mission", "Passeport"],
        per_pax_attachments_config=["Piece d'identite"],
    )
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
        if call_index == 3:
            return FakeResult(all_rows=[(uuid4(), None), (None, uuid4())])
        raise AssertionError("Unexpected execute call")

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    db.execute = fake_execute  # type: ignore[method-assign]
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_service.submit_avm(db, avm.id, avm.entity_id, uuid4())

    assert result["status"] == "in_preparation"
    assert avm.status == "in_preparation"
    assert result["preparation_tasks_created"] == 2
    created_ads_tasks = [obj for obj in db.added if getattr(obj, "task_type", None) == "ads_creation"]
    created_document_tasks = [obj for obj in db.added if getattr(obj, "task_type", None) == "document_collection"]
    assert len(created_ads_tasks) == 1
    assert len(created_document_tasks) == 1
    assert "Ordre de mission" in (created_document_tasks[0].notes or "")
    assert "Piece d'identite" in (created_document_tasks[0].notes or "")
    assert published_events and published_events[0].event_type == "paxlog.mission_notice.launched"


@pytest.mark.asyncio
async def test_submit_avm_creates_indicator_tasks_for_visa_badge_epi_and_allowance(monkeypatch):
    avm = _build_avm(
        status="draft",
        requires_visa=True,
        requires_badge=True,
        requires_epi=True,
        eligible_displacement_allowance=True,
    )
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

    async def fake_execute(statement, params=None):
        db.executed.append((statement, params))
        call_index = len(db.executed)
        if call_index == 1:
            return FakeResult(scalar_one_or_none=avm)
        if call_index == 2:
            return FakeScalarResult([program])
        if call_index == 3:
            return FakeResult(all_rows=[(uuid4(), None), (None, uuid4())])
        raise AssertionError("Unexpected execute call")

    class FakeEventBus:
        async def publish(self, event):
            return None

    db.execute = fake_execute  # type: ignore[method-assign]
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_service.submit_avm(db, avm.id, avm.entity_id, uuid4())

    assert result["status"] == "in_preparation"
    assert avm.status == "in_preparation"
    task_types = [getattr(obj, "task_type", None) for obj in db.added]
    assert task_types.count("ads_creation") == 1
    assert "visa" in task_types
    assert "badge" in task_types
    assert "epi_order" in task_types
    assert "allowance" in task_types
    created_titles = {getattr(obj, "task_type", None): getattr(obj, "title", "") for obj in db.added}
    assert created_titles["visa"] == "Demande de visa"
    assert created_titles["badge"] == "Demande de badge site"
    assert created_titles["epi_order"] == "Commande EPI"
    assert created_titles["allowance"] == "Indemnites de deplacement"
    created_visa_followups = [obj for obj in db.added if isinstance(obj, MissionVisaFollowup)]
    created_allowance_requests = [obj for obj in db.added if isinstance(obj, MissionAllowanceRequest)]
    assert len(created_visa_followups) == 2
    assert len(created_allowance_requests) == 2


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
async def test_apply_signalement_ads_effects_updates_pending_and_active_ads():
    entity_id = uuid4()
    asset_id = uuid4()
    incident = SimpleNamespace(
        id=uuid4(),
        severity="site_ban",
        asset_id=asset_id,
        company_id=None,
        user_id=uuid4(),
        contact_id=None,
        recorded_by=uuid4(),
        description="Accès site suspendu",
    )
    pending_ads = _build_ads(
        entity_id=entity_id,
        status="pending_validation",
        site_entry_asset_id=asset_id,
        rejected_at=None,
        rejection_reason=None,
    )
    active_ads = _build_ads(
        entity_id=entity_id,
        status="approved",
        site_entry_asset_id=asset_id,
        rejected_at=None,
        rejection_reason=None,
    )
    db = FakeDB([FakeScalarResult([pending_ads, active_ads])])

    result = await paxlog_service._apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    assert result == {"rejected": 1, "requires_review": 1}
    assert pending_ads.status == "rejected"
    assert pending_ads.rejection_reason == "Accès site suspendu"
    assert pending_ads.rejected_at is not None
    assert active_ads.status == "requires_review"
    assert active_ads.rejection_reason == "Accès site suspendu"
    events = [obj for obj in db.added if isinstance(obj, AdsEvent)]
    assert {event.event_type for event in events} == {"signalement_rejected", "signalement_requires_review"}


@pytest.mark.asyncio
async def test_create_signalement_emits_company_scope_and_ads_effect_counts(monkeypatch):
    entity_id = uuid4()
    company_id = uuid4()
    asset_id = uuid4()
    recorded_by = uuid4()
    published_events = []
    expected_entity_id = entity_id

    async def fake_apply_effects(_db, *, entity_id, incident):
        assert entity_id == expected_entity_id
        assert incident.company_id == company_id
        assert incident.asset_id == asset_id
        return {"rejected": 2, "requires_review": 1}

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog_service, "_apply_signalement_ads_effects", fake_apply_effects)
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    db = FakeDB([])
    result = await paxlog_service.create_signalement(
        db,
        entity_id=entity_id,
        data={
            "company_id": company_id,
            "asset_id": asset_id,
            "severity": "site_ban",
            "description": "Entreprise bloquée sur ce site",
            "incident_date": date(2026, 4, 5),
            "recorded_by": recorded_by,
        },
    )

    assert result["company_id"] == company_id
    assert result["ads_rejected"] == 2
    assert result["ads_flagged_for_review"] == 1
    assert db.commits == 1
    assert published_events and published_events[0].event_type == "paxlog.signalement.created"
    assert published_events[0].payload["company_id"] == str(company_id)
    assert published_events[0].payload["asset_id"] == str(asset_id)
    assert published_events[0].payload["ads_rejected"] == 2
    assert published_events[0].payload["ads_flagged_for_review"] == 1


@pytest.mark.asyncio
async def test_create_incident_delegates_group_scope_to_signalement_service(monkeypatch):
    entity_id = uuid4()
    pax_group_id = uuid4()
    current_user_id = uuid4()
    recorded = []

    async def fake_create_signalement(_db, *, entity_id, data):
        recorded.append((entity_id, data))
        return {"id": uuid4()}

    async def fake_record_audit(*args, **kwargs):
        return None

    monkeypatch.setattr("app.services.modules.paxlog_service.create_signalement", fake_create_signalement)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    incident_row = (
        SimpleNamespace(
            id=uuid4(),
            entity_id=entity_id,
            user_id=None,
            contact_id=None,
            company_id=None,
            pax_group_id=pax_group_id,
            asset_id=None,
            severity="warning",
            description="Groupe suspendu",
            incident_date=date(2026, 4, 5),
            ban_start_date=None,
            ban_end_date=None,
            recorded_by=current_user_id,
            resolved_at=None,
            resolved_by=None,
            resolution_notes=None,
            created_at=datetime.now(timezone.utc),
            reference=None,
            category=None,
            decision=None,
            decision_duration_days=None,
            decision_end_date=None,
            evidence_urls=None,
        ),
        None,
        None,
        None,
        None,
        None,
        "Equipe Alpha",
        None,
    )
    db = FakeDB([FakeResult(first=incident_row)])

    response = await paxlog.create_incident(
        paxlog.PaxIncidentCreate(
            pax_group_id=pax_group_id,
            severity="warning",
            description="Groupe suspendu",
            incident_date=date(2026, 4, 5),
        ),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=current_user_id),
        _=None,
        db=db,
    )

    assert recorded and recorded[0][0] == entity_id
    assert recorded[0][1]["pax_group_id"] == pax_group_id
    assert response.group_name == "Equipe Alpha"
    assert response.pax_group_id == pax_group_id


@pytest.mark.asyncio
async def test_apply_signalement_ads_effects_supports_group_scope():
    entity_id = uuid4()
    pax_group_id = uuid4()
    incident = SimpleNamespace(
        id=uuid4(),
        severity="temp_ban",
        asset_id=None,
        company_id=None,
        pax_group_id=pax_group_id,
        user_id=None,
        contact_id=None,
        recorded_by=uuid4(),
        description="Groupe suspendu temporairement",
    )
    active_ads = _build_ads(
        entity_id=entity_id,
        status="approved",
        rejected_at=None,
        rejection_reason=None,
    )
    db = FakeDB([FakeScalarResult([active_ads])])

    result = await paxlog_service._apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    assert result == {"rejected": 0, "requires_review": 1}
    assert active_ads.status == "requires_review"
    event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert event.event_type == "signalement_requires_review"
    assert event.metadata_json["pax_group_id"] == str(pax_group_id)


@pytest.mark.asyncio
async def test_apply_signalement_ads_effects_ignores_warning_severity():
    entity_id = uuid4()
    incident = SimpleNamespace(
        id=uuid4(),
        severity="warning",
        asset_id=None,
        company_id=None,
        pax_group_id=None,
        user_id=uuid4(),
        contact_id=None,
        recorded_by=uuid4(),
        description="Avertissement simple",
    )
    db = FakeDB([])

    result = await paxlog_service._apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    assert result == {"rejected": 0, "requires_review": 0}
    assert db.added == []


@pytest.mark.asyncio
async def test_apply_signalement_ads_effects_company_scope_rejects_pending_and_reviews_in_progress():
    entity_id = uuid4()
    company_id = uuid4()
    incident = SimpleNamespace(
        id=uuid4(),
        severity="temp_ban",
        asset_id=None,
        company_id=company_id,
        pax_group_id=None,
        user_id=None,
        contact_id=None,
        recorded_by=uuid4(),
        description="Entreprise suspendue temporairement",
    )
    pending_ads = _build_ads(
        entity_id=entity_id,
        status="pending_validation",
        rejected_at=None,
        rejection_reason=None,
    )
    in_progress_ads = _build_ads(
        entity_id=entity_id,
        status="in_progress",
        rejected_at=None,
        rejection_reason=None,
    )
    db = FakeDB([FakeScalarResult([pending_ads, in_progress_ads])])

    result = await paxlog_service._apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    executed_sql = str(db.executed[0][0])
    assert "tier_contacts" in executed_sql.lower()
    assert result == {"rejected": 1, "requires_review": 1}
    assert pending_ads.status == "rejected"
    assert in_progress_ads.status == "requires_review"
    events = [obj for obj in db.added if isinstance(obj, AdsEvent)]
    assert {event.event_type for event in events} == {"signalement_rejected", "signalement_requires_review"}
    assert all(event.metadata_json["company_id"] == str(company_id) for event in events)


@pytest.mark.asyncio
async def test_apply_signalement_ads_effects_site_ban_filters_to_target_site_only():
    entity_id = uuid4()
    asset_id = uuid4()
    other_asset_id = uuid4()
    incident = SimpleNamespace(
        id=uuid4(),
        severity="site_ban",
        asset_id=asset_id,
        company_id=None,
        pax_group_id=None,
        user_id=uuid4(),
        contact_id=None,
        recorded_by=uuid4(),
        description="Interdiction sur site ciblé",
    )
    impacted_ads = _build_ads(
        entity_id=entity_id,
        status="approved",
        site_entry_asset_id=asset_id,
        rejected_at=None,
        rejection_reason=None,
    )
    db = FakeDB([FakeScalarResult([impacted_ads])])

    result = await paxlog_service._apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    executed_sql = str(db.executed[0][0])
    assert "site_entry_asset_id" in executed_sql
    assert result == {"rejected": 0, "requires_review": 1}
    assert impacted_ads.status == "requires_review"
    event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert event.metadata_json["asset_id"] == str(asset_id)
    assert event.metadata_json["severity"] == "site_ban"

@pytest.mark.asyncio
async def test_resubmit_ads_clears_rejection_and_rechecks_submission(monkeypatch):
    ads = _build_ads(status="requires_review", rejection_reason="Pièces manquantes")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []

    async def fake_run_submission_checks(*args, **kwargs):
        return ([{"id": "p1"}], False, "pending_compliance")

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

    assert response.status == "pending_compliance"
    assert response.rejection_reason is None
    assert transition_calls and transition_calls[0]["to_state"] == "pending_compliance"
    assert emitted_events and emitted_events[0]["to_state"] == "pending_compliance"
    assert audits and audits[0]["action"] == "paxlog.ads.resubmit"

    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "resubmitted"
    assert ads_event.old_status == "requires_review"
    assert ads_event.new_status == "pending_compliance"
    assert ads_event.reason == "Pièces complétées"


@pytest.mark.asyncio
async def test_resubmit_ads_from_requires_review_does_not_reenter_initiator_or_project_review(monkeypatch):
    requester_id = uuid4()
    creator_id = uuid4()
    ads = _build_ads(
        status="requires_review",
        requester_id=requester_id,
        created_by=creator_id,
        rejection_reason="Retour OMAA à clarifier",
    )
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []

    async def fake_run_submission_checks(*args, **kwargs):
        return ([{"id": "p1"}], False, "pending_compliance")

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        return None

    monkeypatch.setattr(paxlog, "_run_ads_submission_checks", fake_run_submission_checks)
    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.resubmit_ads(
        ads.id,
        reason="Retour clarifié et pièces mises à jour",
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=requester_id),
        _=None,
        db=db,
    )

    assert response.status == "pending_compliance"
    assert transition_calls and transition_calls[0]["to_state"] == "pending_compliance"
    assert all(call["to_state"] not in {"pending_initiator_review", "pending_project_review"} for call in transition_calls)
    assert emitted_events and emitted_events[0]["to_state"] == "pending_compliance"
    assert all(event["to_state"] not in {"pending_initiator_review", "pending_project_review"} for event in emitted_events)


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


@pytest.mark.asyncio
async def test_resolve_ads_imputation_suggestion_supports_group_assignment():
    entity_id = uuid4()
    requester_id = uuid4()
    group_id = uuid4()
    project_id = uuid4()
    cost_center_id = uuid4()
    ads = _build_ads(entity_id=entity_id, requester_id=requester_id, project_id=None)
    requester = SimpleNamespace(id=requester_id, business_unit_id=None)
    project = SimpleNamespace(id=project_id, entity_id=entity_id, code="PRJ-001", name="Project Work")
    cost_center = SimpleNamespace(id=cost_center_id, entity_id=entity_id, code="CC-001", name="Offshore Ops", active=True)
    reference = SimpleNamespace(
        id=uuid4(),
        code="REF-GRP",
        name="Reference Group",
        imputation_type="OPEX",
        otp_policy="forbidden",
        default_project_id=project_id,
        default_cost_center_id=cost_center_id,
        default_project=project,
        default_cost_center=cost_center,
        valid_from=None,
        valid_to=None,
        active=True,
    )
    assignment = SimpleNamespace(valid_from=None, valid_to=None)
    db = FakeDBWithGet(
        [
            FakeResult(all_rows=[]),
            FakeResult(scalar_one_or_none=None),
            FakeResult(scalar=FakeScalarResult([group_id])),
            FakeResult(all_rows=[(assignment, reference)]),
        ],
        get_map={
            (paxlog.User, requester_id): requester,
        },
    )

    suggestion = await paxlog._resolve_ads_imputation_suggestion(db, ads=ads, entity_id=entity_id)

    assert suggestion.imputation_reference_id == reference.id
    assert suggestion.imputation_reference_code == "REF-GRP"
    assert suggestion.project_id == project_id
    assert suggestion.project_source == "group_assignment"
    assert suggestion.cost_center_id == cost_center_id
    assert suggestion.cost_center_source == "group_assignment"
    assert "Référence d'imputation appliquée via une affectation de groupe." in suggestion.resolution_notes


@pytest.mark.asyncio
async def test_ensure_ads_default_imputation_creates_line_from_resolved_suggestion(monkeypatch):
    ads = _build_ads()
    entity_id = ads.entity_id
    author_id = uuid4()
    suggestion = SimpleNamespace(
        project_id=uuid4(),
        cost_center_id=uuid4(),
        imputation_reference_id=uuid4(),
        imputation_type="OPEX",
        otp_policy="forbidden",
        project_source="group_assignment",
        cost_center_source="group_assignment",
    )
    db = FakeDB([FakeResult(scalar_one_or_none=None)])

    async def fake_resolve(_db, *, ads, entity_id):
        return suggestion

    monkeypatch.setattr(paxlog, "_resolve_ads_imputation_suggestion", fake_resolve)

    await paxlog._ensure_ads_default_imputation(
        db,
        ads=ads,
        entity_id=entity_id,
        author_id=author_id,
    )

    imputation = next(obj for obj in db.added if isinstance(obj, CostImputation))
    assert imputation.owner_type == "ads"
    assert imputation.owner_id == ads.id
    assert imputation.project_id == suggestion.project_id
    assert imputation.cost_center_id == suggestion.cost_center_id
    assert imputation.imputation_reference_id == suggestion.imputation_reference_id
    assert imputation.percentage == 100.0
    assert imputation.created_by == author_id
    assert imputation.notes == "Default imputation applied from group_assignment/group_assignment"


@pytest.mark.asyncio
async def test_ensure_ads_default_imputation_skips_capex_and_otp_required(monkeypatch):
    ads = _build_ads()
    entity_id = ads.entity_id
    author_id = uuid4()
    db = FakeDB([FakeResult(scalar_one_or_none=None), FakeResult(scalar_one_or_none=None)])
    suggestions = iter(
        [
            SimpleNamespace(
                project_id=uuid4(),
                cost_center_id=uuid4(),
                imputation_reference_id=uuid4(),
                imputation_type="CAPEX",
                otp_policy="forbidden",
                project_source="project_assignment",
                cost_center_source="project_assignment",
            ),
            SimpleNamespace(
                project_id=uuid4(),
                cost_center_id=uuid4(),
                imputation_reference_id=uuid4(),
                imputation_type="OPEX",
                otp_policy="required",
                project_source="user_assignment",
                cost_center_source="user_assignment",
            ),
        ]
    )

    async def fake_resolve(_db, *, ads, entity_id):
        return next(suggestions)

    monkeypatch.setattr(paxlog, "_resolve_ads_imputation_suggestion", fake_resolve)

    await paxlog._ensure_ads_default_imputation(
        db,
        ads=ads,
        entity_id=entity_id,
        author_id=author_id,
    )
    await paxlog._ensure_ads_default_imputation(
        db,
        ads=ads,
        entity_id=entity_id,
        author_id=author_id,
    )

    assert not any(isinstance(obj, CostImputation) for obj in db.added)


@pytest.mark.asyncio
async def test_start_ads_progress_transitions_approved_ads(monkeypatch):
    ads = _build_ads(status="approved")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []
    published_events = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog, "_try_ads_workflow_transition", fake_transition)
    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr("app.core.events.event_bus", FakeEventBus())

    response = await paxlog.start_ads_progress(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "in_progress"
    assert transition_calls and transition_calls[0]["to_state"] == "in_progress"
    assert emitted_events and emitted_events[0]["to_state"] == "in_progress"
    assert audits and audits[0]["action"] == "paxlog.ads.start_progress"
    assert published_events and published_events[0].event_type == "ads.in_progress"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "in_progress"
    assert ads_event.new_status == "in_progress"


@pytest.mark.asyncio
async def test_complete_ads_transitions_in_progress_ads(monkeypatch):
    ads = _build_ads(status="in_progress")
    db = FakeDB([FakeResult(scalar_one_or_none=ads)])
    transition_calls = []
    emitted_events = []
    audits = []
    published_events = []

    async def fake_transition(*args, **kwargs):
        transition_calls.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        emitted_events.append(kwargs)

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    async def fake_build_ads_read_data(_db, *, ads, entity_id):
        return _ads_read_payload(ads, entity_id)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)
    monkeypatch.setattr(paxlog, "_build_ads_read_data", fake_build_ads_read_data)
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    response = await paxlog.complete_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    assert response.status == "completed"
    assert emitted_events and emitted_events[0]["to_state"] == "completed"
    assert audits and audits[0]["action"] == "paxlog.ads.complete"
    assert published_events and published_events[0].event_type == "ads.completed"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "completed"
    assert ads_event.new_status == "completed"


def test_ads_routes_use_expected_permissions():
    assert _route_requires_permission("/ads", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/events", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/pax", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/submit", "POST", "paxlog.ads.submit")
    assert _route_requires_permission("/ads/{ads_id}/approve", "POST", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/start-progress", "POST", "paxlog.ads.approve")
    assert _route_requires_permission("/ads/{ads_id}/complete", "POST", "paxlog.ads.approve")
    assert _route_requires_permission("/ads/{ads_id}/reject", "POST", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/cancel", "POST", "paxlog.ads.cancel")
    assert _route_requires_permission("/stay-programs", "GET", "paxlog.ads.read")


def test_avm_routes_use_expected_permissions():
    assert _route_requires_permission("/avm", "GET", "paxlog.avm.read")
    assert _route_requires_permission("/avm/{avm_id}", "GET", "paxlog.avm.read")


def test_profile_and_compliance_routes_use_expected_permissions():
    assert _route_requires_permission("/profiles", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/pax-groups", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/profiles/check-duplicates", "POST", "paxlog.profile.read")
    assert _route_requires_permission("/profiles/{profile_id}", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/profiles/{profile_id}/site-presence-history", "GET", "paxlog.profile.read")
    assert _route_requires_permission("/credential-types", "GET", "paxlog.credential_type.read")
    assert _route_requires_permission("/profiles/{profile_id}/credentials", "GET", "paxlog.credential.read")
    assert _route_requires_permission("/profiles/{profile_id}/compliance/{asset_id}", "GET", "paxlog.compliance.read")


def test_secondary_paxlog_routes_use_expected_permissions():
    assert _route_requires_permission("/compliance-matrix", "GET", "paxlog.compliance.read")
    assert _route_requires_permission("/ads/by-reference/{reference}", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/pdf", "GET", "paxlog.ads.read")
    assert _route_requires_permission("/ads/{ads_id}/pax/{entry_id}/decision", "POST", "paxlog.ads.approve")
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
async def test_create_profile_rejects_phonetic_duplicate_contact():
    entity_id = uuid4()
    company_id = uuid4()
    existing = SimpleNamespace(
        id=uuid4(),
        first_name="Moussa",
        last_name="Diallo",
        badge_number="X-01",
    )
    db = FakeDB([FakeResult(all_rows=[existing])])

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_profile(
            paxlog._ExternalPaxCreate(
                first_name="Mussa",
                last_name="Diallo",
                company_id=company_id,
            ),
            entity_id=entity_id,
            current_user=SimpleNamespace(id=uuid4(), user_type="internal"),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "DUPLICATE_PAX_PROFILE"


@pytest.mark.asyncio
async def test_check_profile_duplicates_detects_phonetic_match():
    entity_id = uuid4()
    user_row = SimpleNamespace(
        id=uuid4(),
        first_name="Moussa",
        last_name="Diallo",
        birth_date=None,
        badge_number="X-01",
    )
    db = FakeDB([
        FakeResult(all_rows=[user_row]),
        FakeResult(all_rows=[]),
    ])

    response = await paxlog.check_profile_duplicates(
        first_name="Mussa",
        last_name="Diallo",
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4(), user_type="internal"),
        _=None,
        db=db,
    )

    assert response["has_duplicates"] is True
    assert response["matches"][0]["match_type"] == "name_phonetic"


@pytest.mark.asyncio
async def test_get_profile_site_presence_history_returns_ads_and_boarding_context(monkeypatch):
    entity_id = uuid4()
    profile_id = uuid4()
    site_asset_id = uuid4()
    ads_id = uuid4()
    row = (
        ads_id,
        "ADS-330",
        "completed",
        "approved",
        site_asset_id,
        "Onshore A",
        date(2026, 4, 10),
        date(2026, 4, 12),
        "Inspection",
        "mission",
        "boarded",
        datetime(2026, 4, 10, 8, 0, tzinfo=timezone.utc),
        datetime(2026, 4, 8, 9, 0, tzinfo=timezone.utc),
        datetime(2026, 4, 12, 18, 0, tzinfo=timezone.utc),
    )
    db = FakeDB([FakeResult(all_rows=[row])])

    async def fake_resolve(*_args, **_kwargs):
        return SimpleNamespace(id=profile_id), None

    monkeypatch.setattr(paxlog, "_resolve_pax_identity", fake_resolve)

    response = await paxlog.get_profile_site_presence_history(
        profile_id,
        pax_source="user",
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4(), user_type="internal"),
        _=None,
        db=db,
    )

    sql = str(db.executed[0][0])
    assert "manifest_passengers" in sql
    assert "ar_installations" in sql
    assert response[0].ads_reference == "ADS-330"
    assert response[0].site_name == "Onshore A"
    assert response[0].boarding_status == "boarded"


@pytest.mark.asyncio
async def test_check_pax_compliance_exposes_layers_and_status_summary():
    entity_id = uuid4()
    asset_id = uuid4()
    user_id = uuid4()
    site_requirement_id = uuid4()
    job_requirement_id = uuid4()
    db = FakeDB([
        FakeResult(scalar_one_or_none=None),
        FakeResult(all_rows=[(asset_id,)]),
        FakeResult(all_rows=[
            SimpleNamespace(
                credential_type_id=site_requirement_id,
                scope="all_visitors",
            ),
        ]),
        FakeResult(all_rows=[(job_requirement_id, True)]),
        FakeResult(all_rows=[
            SimpleNamespace(
                credential_type_id=job_requirement_id,
                status="pending_validation",
                expiry_date=date(2026, 4, 20),
            ),
        ]),
        FakeResult(all_rows=[
            SimpleNamespace(id=site_requirement_id, code="H2S", name="H2S Awareness"),
            SimpleNamespace(id=job_requirement_id, code="ELEC", name="Habilitation electrique"),
        ]),
    ])

    response = await paxlog_service.check_pax_compliance(
        db,
        asset_id=asset_id,
        entity_id=entity_id,
        user_id=user_id,
    )

    assert response["compliant"] is False
    assert response["covered_layers"] == ["site_requirements", "job_profile", "self_declaration"]
    assert response["summary_by_status"]["pending_validation"] == 1
    assert response["summary_by_status"]["missing"] == 1
    by_code = {item["credential_type_code"]: item for item in response["results"]}
    assert by_code["ELEC"]["status"] == "pending_validation"
    assert by_code["ELEC"]["layer"] == "job_profile"
    assert by_code["ELEC"]["blocking"] is False
    assert by_code["H2S"]["status"] == "missing"
    assert by_code["H2S"]["layer"] == "site_requirements"


@pytest.mark.asyncio
async def test_check_compliance_route_returns_enriched_compliance_contract(monkeypatch):
    entity_id = uuid4()
    profile_id = uuid4()
    asset_id = uuid4()

    async def fake_resolve_identity(*_args, **_kwargs):
        return SimpleNamespace(id=profile_id), None

    async def fake_check(*_args, **_kwargs):
        return {
            "compliant": False,
            "results": [
                {
                    "credential_type_code": "H2S",
                    "credential_type_name": "H2S Awareness",
                    "status": "pending_validation",
                    "message": "En attente de validation : H2S Awareness",
                    "expiry_date": date(2026, 4, 20),
                    "layer": "self_declaration",
                    "blocking": False,
                },
                {
                    "credential_type_code": "BOSIET",
                    "credential_type_name": "BOSIET",
                    "status": "missing",
                    "message": "Habilitation manquante : BOSIET",
                    "expiry_date": None,
                    "layer": "site_requirements",
                    "blocking": True,
                },
            ],
            "covered_layers": ["site_requirements", "self_declaration"],
            "summary_by_status": {"pending_validation": 1, "missing": 1},
        }

    monkeypatch.setattr(paxlog, "_resolve_pax_identity", fake_resolve_identity)
    monkeypatch.setattr(paxlog_service, "check_pax_compliance", fake_check)

    response = await paxlog.check_compliance(
        profile_id,
        asset_id,
        pax_source="user",
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4(), user_type="internal"),
        _=None,
        db=FakeDB([]),
    )

    assert response.user_id == profile_id
    assert response.asset_id == asset_id
    assert response.compliant is False
    assert response.missing_credentials == ["BOSIET"]
    assert response.pending_credentials == ["H2S Awareness"]
    assert response.covered_layers == ["site_requirements", "self_declaration"]
    assert response.summary_by_status["missing"] == 1
    assert response.results[0].status == "pending_validation"


@pytest.mark.asyncio
async def test_conformite_check_route_uses_central_asset_aware_verdict(monkeypatch):
    entity_id = uuid4()
    owner_id = uuid4()
    asset_id = uuid4()

    async def fake_check(*_args, **_kwargs):
        return {
            "compliant": False,
            "results": [
                {
                    "credential_type_code": "H2S",
                    "credential_type_name": "H2S Awareness",
                    "status": "missing",
                    "message": "Habilitation manquante : H2S Awareness",
                    "layer": "site_requirements",
                    "layer_label": "Règles site",
                    "blocking": True,
                }
            ],
            "covered_layers": ["site_requirements"],
            "summary_by_status": {"missing": 1},
            "verification_sequence": ["site_requirements", "job_profile", "self_declaration"],
        }

    async def fake_assert_access(*_args, **_kwargs):
        return None

    monkeypatch.setattr(conformite, "_assert_external_owner_access", fake_assert_access)
    monkeypatch.setattr(compliance_service, "check_pax_asset_compliance", fake_check)

    response = await conformite.check_compliance(
        "user",
        owner_id,
        include_contextual=True,
        asset_id=asset_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4(), user_type="internal"),
        db=FakeDB([]),
    )

    assert response.owner_type == "user"
    assert response.owner_id == owner_id
    assert response.is_compliant is False
    assert response.total_missing == 1
    assert response.details[0]["layer"] == "site_requirements"
    assert response.details[0]["verification_sequence"] == ["site_requirements", "job_profile", "self_declaration"]


@pytest.mark.asyncio
async def test_get_expiring_credentials_exposes_alert_buckets_and_entity_scope():
    entity_id = uuid4()
    today = date.today()
    db = FakeDB(
        [
            FakeResult(
                all_rows=[
                    (uuid4(), uuid4(), uuid4(), today, "valid", "Aline", "Mukeba", "B-01", "MED", "Medical"),
                    (uuid4(), uuid4(), uuid4(), today + timedelta(days=7), "valid", "Boris", "Maki", "B-02", "SAFE", "Safety"),
                ]
            ),
            FakeResult(
                all_rows=[
                    (uuid4(), uuid4(), uuid4(), today + timedelta(days=30), "valid", "Chris", "Mvula", "C-01", "H2S", "H2S"),
                ]
            ),
        ]
    )

    response = await paxlog.get_expiring_credentials(
        days_ahead=45,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    user_sql = str(db.executed[0][0])
    assert "default_entity_id" in user_sql
    assert [item["alert_bucket"] for item in response] == ["j0", "j7", "j30"]


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
        access_log=[],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    response = await paxlog.access_external_link(
        "token-1",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session=None,
        db=FakeDB([]),
    )

    assert response["ads_id"] == str(link.ads_id)
    assert response["authenticated"] is False
    assert response["otp_required"] is True
    assert response["preconfigured_data"] is None
    assert response["remaining_uses"] == 2
    assert link.access_log[-1]["action"] == "public_access"


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
        access_log=[],
    )

    async def fake_get_link(_db, _token):
        return link

    async def fake_require_session(_db, token, session_token, request=None):
        assert token == "token-2"
        assert session_token == "session-123"
        assert request is not None
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)
    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)

    response = await paxlog.access_external_link(
        "token-2",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-123",
        db=FakeDB([]),
    )

    assert response["authenticated"] is True
    assert response["preconfigured_data"] == {"company_name": "Vendor X"}
    assert response["remaining_uses"] is None
    assert link.access_log[-1]["action"] == "authenticated_access"


@pytest.mark.asyncio
async def test_access_external_link_rate_limits_public_consultation(monkeypatch):
    now = datetime.now(timezone.utc)
    link = SimpleNamespace(
        ads_id=uuid4(),
        otp_required=True,
        otp_sent_to="contractor@example.com",
        preconfigured_data={"company_name": "Vendor X"},
        max_uses=None,
        use_count=0,
        expires_at=datetime(2026, 4, 30, tzinfo=timezone.utc),
        access_log=[
            {"action": "public_access", "timestamp": (now - timedelta(minutes=1)).isoformat()}
            for _ in range(paxlog.EXTERNAL_PUBLIC_ACCESS_MAX_PER_WINDOW)
        ],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog.access_external_link(
            "token-1",
            request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"}),
            x_external_session=None,
            db=FakeDB([]),
        )

    assert exc.value.status_code == 429
    assert link.access_log[-1]["action"] == "public_access_rate_limited"


@pytest.mark.asyncio
async def test_send_external_link_otp_sets_code_and_masks_destination(monkeypatch):
    ads = _build_ads()
    link = SimpleNamespace(
        otp_required=True,
        ads_id=ads.id,
        token="token-otp",
        otp_sent_to="contractor@example.com",
        otp_code_hash=None,
        otp_expires_at=None,
        otp_attempt_count=2,
        session_token_hash="old-session",
        session_expires_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        access_log=[],
    )
    sent_messages = []
    template_calls = []

    async def fake_get_link(_db, _token):
        return link

    async def fake_render_and_send_email(db, slug, entity_id, language, to, variables):
        template_calls.append({
            "slug": slug,
            "entity_id": entity_id,
            "language": language,
            "to": to,
            "variables": variables,
        })
        return True

    async def fake_send_email(*, to, subject, body_html):
        sent_messages.append({"to": to, "subject": subject, "body_html": body_html})

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)
    monkeypatch.setattr("app.core.email_templates.render_and_send_email", fake_render_and_send_email)
    monkeypatch.setattr("app.core.notifications.send_email", fake_send_email)
    monkeypatch.setattr(paxlog.secrets, "randbelow", lambda _max: 123456)

    response = await paxlog.send_external_link_otp(
        "token-otp",
        request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"}),
        db=FakeDBWithGet([], get_map={(paxlog.Ads, ads.id): ads}),
    )

    assert response["otp_required"] is True
    assert response["destination_masked"] == "co********@example.com"
    assert response["expires_in_seconds"] == paxlog.EXTERNAL_OTP_TTL_MINUTES * 60
    assert not sent_messages
    assert template_calls and template_calls[0]["slug"] == "paxlog_external_link_otp"
    assert template_calls[0]["variables"]["otp_code"] == "123456"
    assert template_calls[0]["variables"]["external_link_url"].endswith("token-otp")
    assert link.otp_code_hash == paxlog._hash_secret("123456")
    assert link.otp_attempt_count == 0
    assert link.session_token_hash is None
    assert link.session_expires_at is None
    assert link.access_log[-1]["action"] == "otp_sent"


@pytest.mark.asyncio
async def test_verify_external_link_otp_rejects_invalid_code_and_tracks_attempt(monkeypatch):
    link = SimpleNamespace(
        otp_required=True,
        otp_code_hash=paxlog._hash_secret("123456"),
        otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        otp_attempt_count=0,
        session_token_hash=None,
        session_expires_at=None,
        access_log=[],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog.verify_external_link_otp(
            "token-otp",
            paxlog.ExternalOtpVerifyBody(code="000000"),
            request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"}),
            db=FakeDB([]),
        )

    assert exc.value.status_code == 400
    assert link.otp_attempt_count == 1
    assert link.access_log[-1]["action"] == "otp_failed"
    assert link.session_token_hash is None


@pytest.mark.asyncio
async def test_verify_external_link_otp_rate_limits_recent_failures(monkeypatch):
    now = datetime.now(timezone.utc)
    link = SimpleNamespace(
        otp_required=True,
        otp_code_hash=paxlog._hash_secret("123456"),
        otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        otp_attempt_count=0,
        session_token_hash=None,
        session_expires_at=None,
        access_log=[
            {"action": "otp_failed", "timestamp": (now - timedelta(minutes=5)).isoformat()},
            {"action": "otp_failed", "timestamp": (now - timedelta(minutes=4)).isoformat()},
            {"action": "otp_failed", "timestamp": (now - timedelta(minutes=3)).isoformat()},
            {"action": "otp_failed", "timestamp": (now - timedelta(minutes=2)).isoformat()},
            {"action": "otp_failed", "timestamp": (now - timedelta(minutes=1)).isoformat()},
        ],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog.verify_external_link_otp(
            "token-otp",
            paxlog.ExternalOtpVerifyBody(code="000000"),
            request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"}),
            db=FakeDB([]),
        )

    assert exc.value.status_code == 429
    assert link.access_log[-1]["action"] == "otp_verify_rate_limited"


@pytest.mark.asyncio
async def test_verify_external_link_otp_opens_session_and_consumes_use(monkeypatch):
    link = SimpleNamespace(
        otp_required=True,
        otp_code_hash=paxlog._hash_secret("123456"),
        otp_expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
        otp_attempt_count=1,
        session_token_hash=None,
        session_expires_at=None,
        last_validated_at=None,
        use_count=0,
        access_log=[],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)
    monkeypatch.setattr(paxlog.secrets, "token_urlsafe", lambda _n: "session-token-123")

    response = await paxlog.verify_external_link_otp(
        "token-otp",
        paxlog.ExternalOtpVerifyBody(code="123456"),
        request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest"}),
        db=FakeDB([]),
    )

    assert response["session_token"] == "session-token-123"
    assert response["expires_in_seconds"] == paxlog.EXTERNAL_SESSION_TTL_MINUTES * 60
    assert link.otp_code_hash is None
    assert link.otp_expires_at is None
    assert link.otp_attempt_count == 0
    assert link.session_token_hash == paxlog._hash_secret("session-token-123")
    assert link.last_validated_at is not None
    assert link.use_count == 1
    assert link.access_log[-1]["action"] == "otp_validated"


@pytest.mark.asyncio
async def test_send_external_link_otp_rate_limits_recent_requests(monkeypatch):
    now = datetime.now(timezone.utc)
    link = SimpleNamespace(
        otp_required=True,
        otp_sent_to="contractor@example.com",
        access_log=[
            {"action": "otp_sent", "timestamp": (now - timedelta(minutes=3)).isoformat()},
            {"action": "otp_sent", "timestamp": (now - timedelta(minutes=2)).isoformat()},
            {"action": "otp_sent", "timestamp": (now - timedelta(minutes=1)).isoformat()},
        ],
    )

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog.send_external_link_otp(
            "token-otp",
            request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"), headers={"user-agent": "pytest-browser"}),
            db=FakeDB([]),
        )

    assert exc.value.status_code == 429
    assert link.access_log[-1]["action"] == "otp_rate_limited"


@pytest.mark.asyncio
async def test_require_external_session_rejects_browser_context_change(monkeypatch):
    session_token = "session-token-123"
    original_request = SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        headers={"user-agent": "Browser A"},
    )
    link = SimpleNamespace(
        otp_required=True,
        token="token-ctx",
        session_token_hash=paxlog._hash_secret(session_token),
        session_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        access_log=[],
    )
    paxlog._append_external_access_log(link, action="session_opened", request=original_request, otp_validated=True)
    db = FakeDB([])

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog._require_external_session(
            db,
            token="token-ctx",
            session_token=session_token,
            request=SimpleNamespace(
                client=SimpleNamespace(host="127.0.0.1"),
                headers={"user-agent": "Browser B"},
            ),
        )

    assert exc.value.status_code == 401
    assert link.access_log[-1]["action"] == "session_context_mismatch"
    assert link.session_token_hash is None


@pytest.mark.asyncio
async def test_require_external_session_logs_invalid_token_attempt(monkeypatch):
    valid_session_token = "session-token-123"
    link = SimpleNamespace(
        otp_required=True,
        token="token-ctx",
        session_token_hash=paxlog._hash_secret(valid_session_token),
        session_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        access_log=[],
    )
    db = FakeDB([])

    async def fake_get_link(_db, _token):
        return link

    monkeypatch.setattr(paxlog, "_get_external_link_or_404", fake_get_link)

    with pytest.raises(HTTPException) as exc:
        await paxlog._require_external_session(
            db,
            token="token-ctx",
            session_token="wrong-token",
            request=SimpleNamespace(
                client=SimpleNamespace(host="127.0.0.1"),
                headers={"user-agent": "Browser A"},
            ),
        )

    assert exc.value.status_code == 401
    assert link.access_log[-1]["action"] == "session_invalid"


@pytest.mark.asyncio
async def test_submit_external_ads_requires_draft(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="approved")

    async def fake_require_session(_db, token, session_token, request=None):
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

    async def fake_require_session(_db, token, session_token, request=None):
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
async def test_finalize_external_ads_submission_keeps_compliance_reason(monkeypatch):
    link = SimpleNamespace(id=uuid4(), access_log=[])
    ads = _build_ads(status="draft", rejection_reason=None)
    pax_entries = [SimpleNamespace(id=uuid4(), status="blocked")]
    audit_calls = []
    db = FakeDB([])

    async def fake_run_checks(_db, *, ads, entity_id):
        ads.rejection_reason = "Alice [Règles site]: H2S manquante"
        return pax_entries, True, "pending_compliance"

    async def fake_record_audit(*_args, **kwargs):
        audit_calls.append(kwargs)

    monkeypatch.setattr(paxlog, "_run_ads_submission_checks", fake_run_checks)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog._finalize_external_ads_submission(
        link=link,
        ads=ads,
        entity_id=ads.entity_id,
        reason=None,
        event_type="external_submitted",
        old_status="draft",
        request=SimpleNamespace(client=None, headers={}),
        db=db,
    )

    assert response is ads
    assert ads.status == "pending_compliance"
    assert ads.rejection_reason == "Alice [Règles site]: H2S manquante"
    assert audit_calls and audit_calls[0]["details"]["compliance_issues"] is True


@pytest.mark.asyncio
async def test_get_external_ads_dossier_filters_pax_to_allowed_company(monkeypatch):
    link = SimpleNamespace(id=uuid4(), preconfigured_data={"company_name": "Vendor X"}, access_log=[])
    allowed_company_id = uuid4()
    project_id = uuid4()
    ads = _build_ads(status="draft", project_id=project_id, rejection_reason="Pièces HSE manquantes")
    visible_contact = SimpleNamespace(
        id=uuid4(),
        tier_id=allowed_company_id,
        first_name="Aline",
        last_name="Mukeba",
        birth_date=date(1990, 5, 1),
        nationality="CD",
        badge_number="BG-01",
        photo_url=None,
        email="aline@example.com",
        phone="+243000001",
        position="Technician",
    )
    hidden_contact = SimpleNamespace(
        id=uuid4(),
        tier_id=uuid4(),
        first_name="John",
        last_name="Doe",
        birth_date=None,
        nationality=None,
        badge_number=None,
        photo_url=None,
        email=None,
        phone=None,
        position=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none="Onshore Alpha"),
            FakeResult(first=("PRJ-001", "Projet Alpha")),
            FakeResult(
                all_rows=[
                    (
                        SimpleNamespace(
                            id=uuid4(),
                            status="pending_check",
                            compliance_summary={
                                "compliant": False,
                                "results": [
                                    {
                                        "credential_type_code": "MED",
                                        "credential_type_name": "Medical",
                                        "status": "missing",
                                        "message": "Medical certificate missing",
                                        "expiry_date": None,
                                    },
                                    {
                                        "credential_type_code": "SAFE",
                                        "credential_type_name": "Safety",
                                        "status": "valid",
                                        "message": None,
                                        "expiry_date": None,
                                    },
                                ],
                            },
                        ),
                        visible_contact,
                        None,
                    ),
                    (SimpleNamespace(id=uuid4(), status="pending_check"), hidden_contact, None),
                ]
            ),
            FakeResult(
                all_rows=[
                    (
                        SimpleNamespace(
                            id=uuid4(),
                            contact_id=visible_contact.id,
                            obtained_date=date(2026, 4, 1),
                            expiry_date=date(2026, 10, 1),
                            proof_url="https://files.example/medical.pdf",
                            status="pending_validation",
                        ),
                        SimpleNamespace(code="MED", name="Medical"),
                    ),
                ]
            ),
            FakeResult(all_rows=[]),
        ]
    )

    async def fake_require_session(_db, token, session_token, request=None):
        assert token == "token-dossier"
        assert session_token == "session-ok"
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    response = await paxlog.get_external_ads_dossier(
        "token-dossier",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db,
    )

    assert response["allowed_company_id"] == str(allowed_company_id)
    assert response["allowed_company_name"] == "Vendor X"
    assert len(response["pax"]) == 1
    assert response["pax"][0]["contact_id"] == str(visible_contact.id)
    assert response["pax"][0]["compliance_ok"] is False
    assert response["pax"][0]["compliance_blocker_count"] == 1
    assert response["pax"][0]["compliance_blockers"][0]["credential_type_code"] == "MED"
    assert response["pax"][0]["compliance_blockers"][0]["layer_label"] is None
    assert response["pax"][0]["credentials"][0]["credential_type_code"] == "MED"
    assert response["pax"][0]["credentials"][0]["status"] == "pending_validation"
    assert response["pax"][0]["missing_identity_fields"] == []
    assert any(item["kind"] == "credential" for item in response["pax"][0]["required_actions"])
    assert response["pax_summary"]["total"] == 1
    assert response["pax_summary"]["pending_check"] == 1
    assert response["ads"]["outbound_transport_mode"] == ads.outbound_transport_mode
    assert response["ads"]["return_transport_mode"] == ads.return_transport_mode
    assert response["ads"]["site_name"] == "Onshore Alpha"
    assert response["ads"]["project_name"] == "PRJ-001 — Projet Alpha"
    assert response["ads"]["rejection_reason"] == "Pièces HSE manquantes"


@pytest.mark.asyncio
async def test_get_external_ads_dossier_includes_user_backed_promoted_contact(monkeypatch):
    link = SimpleNamespace(id=uuid4(), preconfigured_data={"company_name": "Vendor X"}, access_log=[])
    allowed_company_id = uuid4()
    ads = _build_ads(status="draft", project_id=uuid4())
    promoted_contact_id = uuid4()
    promoted_user_id = uuid4()
    promoted_contact = SimpleNamespace(
        id=promoted_contact_id,
        tier_id=allowed_company_id,
        first_name="Aline",
        last_name="Mukeba",
        birth_date=date(1990, 5, 1),
        nationality="CD",
        badge_number="BG-01",
        photo_url=None,
        email="aline@example.com",
        phone="+243000001",
        position=None,
        contractual_airport=None,
        nearest_airport=None,
        nearest_station=None,
        job_position_id=None,
        job_position=None,
        linked_user_email="aline@example.com",
        linked_user_active=True,
    )
    promoted_user = SimpleNamespace(
        id=promoted_user_id,
        first_name="Aline",
        last_name="Mukeba",
        birth_date=date(1990, 5, 1),
        nationality="CD",
        badge_number="BG-01",
        email="aline@example.com",
        active=True,
        contractual_airport="FIH",
        nearest_airport="FIH",
        nearest_station="Gare centrale",
        job_position_id=None,
        job_position_name="Supervisor",
    )
    pickup_address = SimpleNamespace(
        owner_type="user",
        owner_id=promoted_user_id,
        label="pickup",
        address_line1="12 Avenue du Port",
        address_line2=None,
        city="Matadi",
        state_province="Kongo Central",
        postal_code="1001",
        country="CD",
        is_default=True,
        created_at=datetime.now(timezone.utc),
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none="Onshore Alpha"),
            FakeResult(first=None),
            FakeResult(
                all_rows=[
                    (
                        SimpleNamespace(
                            id=uuid4(),
                            user_id=promoted_user_id,
                            contact_id=None,
                            status="pending_check",
                            compliance_summary={"compliant": True, "results": []},
                        ),
                        promoted_contact,
                        promoted_user,
                    ),
                ]
            ),
            FakeResult(all_rows=[]),
            FakeResult(all_rows=[pickup_address]),
        ]
    )

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    response = await paxlog.get_external_ads_dossier(
        "token-dossier",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db,
    )

    assert len(response["pax"]) == 1
    assert response["pax"][0]["contact_id"] == str(promoted_contact_id)
    assert response["pax"][0]["user_id"] == str(promoted_user_id)
    assert response["pax"][0]["pax_source"] == "user"
    assert response["pax"][0]["contractual_airport"] == "FIH"
    assert response["pax"][0]["pickup_city"] == "Matadi"
    assert response["pax_summary"]["total"] == 1


@pytest.mark.asyncio
async def test_download_external_ads_pdf_reuses_canonical_ads_ticket(monkeypatch):
    ads = _build_ads()
    link = SimpleNamespace(ads_id=ads.id, company_id=None)
    response_calls = []

    async def fake_require_session(_db, token, session_token, request=None):
        assert token == "tok"
        assert session_token == "sess"
        return link

    async def fake_get_ads_and_context(_db, link, require_company_scope=False):
        assert link.ads_id == ads.id
        assert require_company_scope is False
        return ads, None

    async def fake_build_response(_db, *, ads, entity_id, language="fr"):
        response_calls.append((ads.id, entity_id, language))
        return "PDF-OK"

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "_build_ads_pdf_response", fake_build_response)

    response = await paxlog.download_external_ads_pdf(
        "tok",
        language="en",
        x_external_session="sess",
        request=None,
        db=FakeDB([]),
    )

    assert response == "PDF-OK"
    assert response_calls == [(ads.id, ads.entity_id, "en")]


@pytest.mark.asyncio
async def test_build_ads_pdf_response_passes_entity_context_to_template(monkeypatch):
    entity_id = uuid4()
    ads = _build_ads(entity_id=entity_id)
    db = FakeDB([
        FakeResult(all_rows=[]),
        FakeResult(first=("Aline", "Mukeba", "aline@example.com")),
        FakeResult(first=("Onshore A",)),
        FakeResult(first=("OpsFlux Public", "OPS")),
    ])
    captured = {}

    async def fake_render_pdf(_db, *, slug, entity_id, language, variables):
        captured["slug"] = slug
        captured["entity_id"] = entity_id
        captured["language"] = language
        captured["variables"] = variables
        return b"%PDF-1.4"

    monkeypatch.setattr("app.core.pdf_templates.render_pdf", fake_render_pdf)

    response = await paxlog._build_ads_pdf_response(
        db,
        ads=ads,
        entity_id=entity_id,
        language="fr",
    )

    assert response.media_type == "application/pdf"
    assert captured["slug"] == "ads.ticket"
    assert captured["entity_id"] == entity_id
    assert captured["variables"]["entity"] == {"name": "OpsFlux Public", "code": "OPS"}
    assert captured["variables"]["entity_name"] == "OpsFlux Public"


@pytest.mark.asyncio
async def test_list_external_credential_types_requires_external_session(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    credential_types = [
        SimpleNamespace(id=uuid4(), code="BOSIET", name="BOSIET", category="training", active=True),
        SimpleNamespace(id=uuid4(), code="H2S", name="H2S", category="safety", active=True),
    ]
    db = FakeDB([FakeResult(all_rows=credential_types)])

    async def fake_require_session(_db, token, session_token, request=None):
        assert token == "token-cred"
        assert session_token == "session-ok"
        return link

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)

    response = await paxlog.list_external_credential_types(
        "token-cred",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db,
    )

    assert [item.code for item in response] == ["BOSIET", "H2S"]


@pytest.mark.asyncio
async def test_list_external_departure_bases_requires_external_session(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    bases = [
        SimpleNamespace(id=uuid4(), code="BASE-A", name="Base A", installation_type="base", archived=False),
        SimpleNamespace(id=uuid4(), code="PORT-B", name="Port B", installation_type="port", archived=False),
    ]
    db = FakeDB([FakeResult(all_rows=bases)])

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, uuid4()

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    response = await paxlog.list_external_departure_bases(
        "token-bases",
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db,
    )

    assert [item.code for item in response] == ["BASE-A", "PORT-B"]


@pytest.mark.asyncio
async def test_update_external_transport_preferences_updates_ads(monkeypatch):
    link = SimpleNamespace(id=uuid4(), access_log=[])
    ads = _build_ads(status="draft")
    outbound_base = SimpleNamespace(id=uuid4(), entity_id=ads.entity_id, archived=False)
    return_base = SimpleNamespace(id=uuid4(), entity_id=ads.entity_id, archived=False)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=outbound_base),
            FakeResult(scalar_one_or_none=return_base),
        ]
    )
    audit_calls = []

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, uuid4()

    async def fake_record_audit(*args, **kwargs):
        audit_calls.append(kwargs)

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.update_external_transport_preferences(
        "token-transport",
        body=paxlog.ExternalTransportPreferencesBody(
            outbound_departure_base_id=outbound_base.id,
            outbound_notes="Ramassage au port à 05h30",
            return_departure_base_id=return_base.id,
            return_notes="Retour flexible selon marée",
        ),
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db,
    )

    assert response["ads_id"] == str(ads.id)
    assert ads.outbound_departure_base_id == outbound_base.id
    assert ads.return_departure_base_id == return_base.id
    assert ads.outbound_notes == "Ramassage au port à 05h30"
    assert ads.return_notes == "Retour flexible selon marée"
    assert link.access_log[-1]["action"] == "update_transport_preferences"
    assert audit_calls


@pytest.mark.asyncio
async def test_find_external_ads_pax_matches_uses_allowed_company_scope(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    expected_allowed_company_id = uuid4()
    expected_match = paxlog.ExternalPaxMatchRead(
        contact_id=uuid4(),
        first_name="Aline",
        last_name="Mukeba",
        match_score=80,
        match_reasons=["name_exact", "badge_number"],
        already_linked_to_ads=False,
    )

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, expected_allowed_company_id

    async def fake_find_matches(_db, *, ads_id, allowed_company_id: object, body):
        assert ads_id == ads.id
        assert allowed_company_id == expected_allowed_company_id
        assert body.first_name == "Aline"
        return [expected_match]

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "_find_external_contact_matches", fake_find_matches)

    response = await paxlog.find_external_ads_pax_matches(
        "token-match",
        body=paxlog.ExternalPaxUpsertBody(first_name="Aline", last_name="Mukeba"),
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=FakeDB([]),
    )

    assert len(response) == 1
    assert response[0].contact_id == expected_match.contact_id


@pytest.mark.asyncio
async def test_find_external_ads_pax_matches_accepts_email_only_lookup(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    expected_allowed_company_id = uuid4()
    expected_match = paxlog.ExternalPaxMatchRead(
        contact_id=uuid4(),
        first_name="Aline",
        last_name="Mukeba",
        email="aline@example.com",
        match_score=80,
        match_reasons=["email"],
        already_linked_to_ads=False,
    )

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, expected_allowed_company_id

    async def fake_find_matches(_db, *, ads_id, allowed_company_id: object, body):
        assert ads_id == ads.id
        assert allowed_company_id == expected_allowed_company_id
        assert body.first_name == ""
        assert body.last_name == ""
        assert body.email == "aline@example.com"
        return [expected_match]

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "_find_external_contact_matches", fake_find_matches)

    response = await paxlog.find_external_ads_pax_matches(
        "token-match",
        body=paxlog.ExternalPaxUpsertBody(first_name="", last_name="", email="aline@example.com"),
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=FakeDB([]),
    )

    assert len(response) == 1
    assert response[0].email == "aline@example.com"


@pytest.mark.asyncio
async def test_create_external_ads_pax_rejects_duplicate_match(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    allowed_company_id = uuid4()

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    async def fake_find_matches(_db, *, ads_id, allowed_company_id, body):
        return [
            paxlog.ExternalPaxMatchRead(
                contact_id=uuid4(),
                first_name="Aline",
                last_name="Mukeba",
                match_score=80,
                match_reasons=["name_exact"],
                already_linked_to_ads=False,
            )
        ]

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "_find_external_contact_matches", fake_find_matches)

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_external_ads_pax(
            "token-create",
            body=paxlog.ExternalPaxUpsertBody(first_name="Aline", last_name="Mukeba"),
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-ok",
            db=FakeDB([]),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "EXTERNAL_PAX_DUPLICATE_MATCH"


@pytest.mark.asyncio
async def test_attach_existing_external_ads_pax_updates_and_links_contact(monkeypatch):
    link = SimpleNamespace(id=uuid4(), access_log=[])
    ads = _build_ads(status="draft")
    allowed_company_id = uuid4()
    contact = SimpleNamespace(
        id=uuid4(),
        tier_id=allowed_company_id,
        active=True,
        first_name="Aline",
        last_name="Mukeba",
        birth_date=None,
        nationality="CD",
        badge_number="BG-77",
        photo_url=None,
        email="aline@example.com",
        phone=None,
        position=None,
        contractual_airport=None,
        nearest_airport=None,
        nearest_station=None,
    )
    linked_user = SimpleNamespace(
        id=uuid4(),
        tier_contact_id=contact.id,
        contractual_airport=None,
        nearest_airport=None,
        nearest_station=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=None),
            FakeResult(scalar_one_or_none=linked_user),
            FakeResult(all_rows=[]),
            FakeResult(all_rows=[]),
        ]
    )
    db_get = FakeDBWithGet(db._results, get_map={(paxlog.TierContact, contact.id): contact})
    db_get.added = db.added
    db_get.commits = db.commits
    db_get.refreshed = db.refreshed
    db_get.executed = db.executed
    db_get.deleted = db.deleted
    audit_calls = []

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    async def fake_record_audit(*args, **kwargs):
        audit_calls.append(kwargs)

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)
    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.attach_existing_external_ads_pax(
        "token-attach",
        contact_id=contact.id,
        body=paxlog.ExternalPaxUpsertBody(
            first_name="Aline",
            last_name="Mukeba",
            nationality="CD",
            badge_number="BG-77",
            email="aline@example.com",
            contractual_airport="FIH",
            nearest_airport="FIH",
            nearest_station="Gare de Matadi",
            pickup_address_line1="12 Avenue du Port",
            pickup_city="Matadi",
            pickup_state_province="Kongo Central",
            pickup_postal_code="1001",
            pickup_country="CD",
        ),
        request=SimpleNamespace(client=None, headers={}),
        x_external_session="session-ok",
        db=db_get,
    )

    assert response["contact_id"] == str(contact.id)
    assert response["already_linked"] is False
    assert contact.first_name == "Aline"
    assert contact.last_name == "Mukeba"
    assert contact.nationality == "CD"
    assert contact.badge_number == "BG-77"
    assert contact.contractual_airport == "FIH"
    assert linked_user.contractual_airport == "FIH"
    assert any(isinstance(item, paxlog.AdsPax) and item.contact_id == contact.id for item in db_get.added)
    assert any(isinstance(item, paxlog.Address) and item.owner_type == "tier_contact" for item in db_get.added)
    assert any(isinstance(item, paxlog.Address) and item.owner_type == "user" for item in db_get.added)
    assert link.access_log[-1]["action"] == "attach_existing_pax"
    assert audit_calls


@pytest.mark.asyncio
async def test_attach_existing_external_ads_pax_rejects_non_matching_company_contact(monkeypatch):
    link = SimpleNamespace(id=uuid4(), access_log=[])
    ads = _build_ads(status="draft")
    allowed_company_id = uuid4()
    contact = SimpleNamespace(
        id=uuid4(),
        tier_id=allowed_company_id,
        active=True,
        first_name="Jean",
        last_name="Kasongo",
        birth_date=None,
        nationality="CD",
        badge_number="BG-11",
        photo_url=None,
        email="jean@example.com",
        phone="+243900000111",
        position="Welder",
    )
    db = FakeDB([])
    db_get = FakeDBWithGet(db._results, get_map={(paxlog.TierContact, contact.id): contact})

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    with pytest.raises(HTTPException) as exc:
        await paxlog.attach_existing_external_ads_pax(
            "token-attach",
            contact_id=contact.id,
            body=paxlog.ExternalPaxUpsertBody(
                first_name="Aline",
                last_name="Mukeba",
                nationality="FR",
                badge_number="DIFFERENT",
                email="aline@example.com",
            ),
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-ok",
            db=db_get,
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "EXTERNAL_PAX_ATTACH_REQUIRES_MATCH"
    assert exc.value.detail["match_score"] == 0


@pytest.mark.asyncio
async def test_create_external_ads_pax_requires_allowed_company(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, None

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_external_ads_pax(
            "token-create",
            body=paxlog.ExternalPaxUpsertBody(first_name="Aline", last_name="Mukeba"),
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-ok",
            db=FakeDB([]),
        )

    assert exc.value.status_code == 400
    assert "entreprise cible" in exc.value.detail


@pytest.mark.asyncio
async def test_update_external_ads_pax_rejects_foreign_company_contact(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    allowed_company_id = uuid4()
    foreign_contact = SimpleNamespace(id=uuid4(), tier_id=uuid4())
    db = FakeDB([FakeResult(first=(SimpleNamespace(id=uuid4()), foreign_contact))])

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    with pytest.raises(HTTPException) as exc:
        await paxlog.update_external_ads_pax(
            "token-update",
            contact_id=foreign_contact.id,
            body=paxlog.ExternalPaxUpsertBody(first_name="Aline", last_name="Mukeba"),
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-ok",
            db=db,
        )

    assert exc.value.status_code == 403
    assert "entreprise autorisée" in exc.value.detail


@pytest.mark.asyncio
async def test_create_external_ads_pax_credential_rejects_foreign_company_contact(monkeypatch):
    link = SimpleNamespace(id=uuid4())
    ads = _build_ads(status="draft")
    allowed_company_id = uuid4()
    foreign_contact = SimpleNamespace(id=uuid4(), tier_id=uuid4())
    db = FakeDB([FakeResult(first=(SimpleNamespace(id=uuid4()), foreign_contact))])

    async def fake_require_session(_db, token, session_token, request=None):
        return link

    async def fake_get_ads_and_context(_db, link):
        return ads, ads.entity_id, allowed_company_id

    monkeypatch.setattr(paxlog, "_require_external_session", fake_require_session)
    monkeypatch.setattr(paxlog, "_get_external_ads_and_context", fake_get_ads_and_context)

    with pytest.raises(HTTPException) as exc:
        await paxlog.create_external_ads_pax_credential(
            "token-credential",
            contact_id=foreign_contact.id,
            body=paxlog.ExternalCredentialCreateBody(
                credential_type_id=uuid4(),
                obtained_date=date(2026, 4, 1),
            ),
            request=SimpleNamespace(client=None, headers={}),
            x_external_session="session-ok",
            db=db,
        )

    assert exc.value.status_code == 403
    assert "entreprise autorisée" in exc.value.detail


@pytest.mark.asyncio
async def test_list_ads_external_links_returns_security_summary(monkeypatch):
    ads = _build_ads(status="approved")
    current_user = SimpleNamespace(id=ads.requester_id)
    link = SimpleNamespace(
        id=uuid4(),
        ads_id=ads.id,
        created_by=uuid4(),
        otp_required=True,
        otp_sent_to="contractor@example.com",
        expires_at=datetime.now(timezone.utc) + timedelta(hours=4),
        max_uses=5,
        use_count=2,
        revoked=False,
        created_at=datetime.now(timezone.utc) - timedelta(hours=1),
        session_expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
        last_validated_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        access_log=[
            {"action": "otp_validated", "timestamp": datetime.now(timezone.utc).isoformat(), "otp_validated": True},
            {"action": "session_invalid", "timestamp": datetime.now(timezone.utc).isoformat(), "otp_validated": False},
            {"action": "public_access_rate_limited", "timestamp": datetime.now(timezone.utc).isoformat(), "otp_validated": False},
        ],
    )
    db = FakeDB([
        FakeResult(scalar_one_or_none=ads),
        FakeResult(all_rows=[link]),
    ])

    async def fake_assert_ads_read_access(*args, **kwargs):
        return None

    monkeypatch.setattr(paxlog, "_assert_ads_read_access", fake_assert_ads_read_access)

    response = await paxlog.list_ads_external_links(
        ads.id,
        entity_id=ads.entity_id,
        current_user=current_user,
        db=db,
        _=None,
    )

    assert len(response) == 1
    assert response[0].otp_destination_masked == "co********@example.com"
    assert response[0].remaining_uses == 3
    assert response[0].anomaly_count == 2
    assert response[0].anomaly_actions["session_invalid"] == 1
    assert response[0].anomaly_actions["public_access_rate_limited"] == 1


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


@pytest.mark.asyncio
async def test_ads_workflow_transition_notifies_assigned_user(monkeypatch):
    entity_scope_id = uuid4()
    ads_id = uuid4()
    assigned_user_id = uuid4()
    db = FakeDB([
        FakeResult(first=("aline@example.com", "Aline Mukeba")),
    ])
    notifications = []
    emails = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_render_and_send_email(db, slug, entity_id, language, to, variables):
        emails.append({
            "slug": slug,
            "entity_id": entity_id,
            "language": language,
            "to": to,
            "variables": variables,
        })
        return True

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.core.email_templates.render_and_send_email", fake_render_and_send_email)
    monkeypatch.setattr(paxlog_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await paxlog_handlers.on_ads_workflow_validation_required(
        OpsFluxEvent(
            event_type="workflow.transition",
            payload={
                "entity_type": "ads",
                "entity_id": str(ads_id),
                "entity_scope_id": str(entity_scope_id),
                "to_state": "pending_project_review",
                "actor_id": str(uuid4()),
                "reference": "ADS-777",
                "assigned_to": str(assigned_user_id),
            },
        )
    )

    assert notifications and notifications[0]["user_id"] == assigned_user_id
    assert notifications[0]["link"] == f"/paxlog/ads/{ads_id}"
    assert emails and emails[0]["slug"] == "workflow.validation_required"
    assert emails[0]["to"] == "aline@example.com"
    assert emails[0]["variables"]["workflow_step"] == "Validation chef de projet"


@pytest.mark.asyncio
async def test_ads_workflow_transition_notifies_role_assignee(monkeypatch):
    entity_scope_id = uuid4()
    ads_id = uuid4()
    role_user_id = uuid4()
    db = FakeDB([
        FakeResult(all_rows=[(role_user_id,)]),
        FakeResult(first=("cds@example.com", "Chef De Site")),
    ])
    notifications = []
    emails = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_render_and_send_email(db, slug, entity_id, language, to, variables):
        emails.append({
            "slug": slug,
            "entity_id": entity_id,
            "language": language,
            "to": to,
            "variables": variables,
        })
        return True

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.core.email_templates.render_and_send_email", fake_render_and_send_email)
    monkeypatch.setattr(paxlog_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))

    await paxlog_handlers.on_ads_workflow_validation_required(
        OpsFluxEvent(
            event_type="workflow.transition",
            payload={
                "entity_type": "ads",
                "entity_id": str(ads_id),
                "entity_scope_id": str(entity_scope_id),
                "to_state": "pending_validation",
                "actor_id": str(uuid4()),
                "reference": "ADS-778",
                "assigned_role_code": "CDS",
            },
        )
    )

    assert notifications and notifications[0]["user_id"] == role_user_id
    assert emails and emails[0]["to"] == "cds@example.com"
    assert emails[0]["variables"]["workflow_step"] == "Validation finale CDS"


def test_register_module_handlers_does_not_duplicate_planner_cancelled_for_paxlog():
    bus = FakeEventBusRegistry()

    module_handlers.register_module_handlers(bus)

    subscribed_events = [event_type for event_type, _handler in bus.subscriptions]
    assert subscribed_events.count("planner.activity.cancelled") == 1


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


@pytest.mark.asyncio
async def test_planner_modified_event_propagates_to_paxlog_and_travelwiz(monkeypatch):
    entity_id = uuid4()
    activity_id = uuid4()
    ads_id = uuid4()
    requester_id = uuid4()
    paxlog_db = FakeDB([FakeResult(all_rows=[(ads_id, "ADS-777", requester_id)])])
    travelwiz_db = FakeDB([FakeResult(all_rows=[(uuid4(),), (uuid4(),)])])
    paxlog_notifications = []
    travelwiz_notifications = []

    async def fake_send_in_app(*args, **kwargs):
        if kwargs.get("category") == "paxlog":
            paxlog_notifications.append(kwargs)
        elif kwargs.get("category") == "travelwiz":
            travelwiz_notifications.append(kwargs)

    async def fake_get_admin_user_ids(_entity_id):
        return [uuid4(), uuid4()]

    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.event_handlers.core_handlers._get_admin_user_ids", fake_get_admin_user_ids)
    monkeypatch.setattr(paxlog_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(paxlog_db))
    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(travelwiz_db))

    event = OpsFluxEvent(
        event_type="planner.activity.modified",
        payload={
            "activity_id": str(activity_id),
            "entity_id": str(entity_id),
            "title": "Inspection compressor",
            "changes": {
                "start_date": {"old": "2026-04-10", "new": "2026-04-12"},
                "pax_quota": {"old": "8", "new": "12"},
            },
        },
    )

    await paxlog_handlers.on_planner_activity_modified(event)
    await travelwiz_handlers.on_planner_activity_modified_tw(event)

    planner_events = [obj for obj in paxlog_db.added if isinstance(obj, AdsEvent)]
    assert len(planner_events) == 1
    assert planner_events[0].event_type == "planner_activity_modified_requires_review"
    assert planner_events[0].metadata_json["planner_activity_id"] == str(activity_id)
    assert planner_events[0].metadata_json["changes"]["pax_quota"]["new"] == "12"
    assert paxlog_notifications and paxlog_notifications[0]["link"] == f"/paxlog/ads/{ads_id}"

    travelwiz_sql = str(travelwiz_db.executed[0][0])
    assert "UPDATE pax_manifests pm SET status = 'requires_review'" in travelwiz_sql
    assert len(travelwiz_notifications) == 2
    assert all(item["category"] == "travelwiz" for item in travelwiz_notifications)
    assert "Inspection compressor" in travelwiz_notifications[0]["body"]
    assert "pax_quota" in travelwiz_notifications[0]["body"]


@pytest.mark.asyncio
async def test_module_handler_manifest_closed_completes_linked_ads_with_traceability(monkeypatch):
    entity_id = uuid4()
    manifest_id = uuid4()
    voyage_id = uuid4()
    ads_id = uuid4()
    ads_pax_id = uuid4()
    requester_id = uuid4()
    passenger = SimpleNamespace(manifest_id=manifest_id, ads_pax_id=ads_pax_id, boarding_status="boarded")
    ads = _build_ads(id=ads_id, entity_id=entity_id, requester_id=requester_id, status="in_progress")
    db = FakeDB(
        [
            FakeScalarResult([passenger]),
            FakeResult(scalar_one_or_none=ads_id),
            FakeResult(scalar_one_or_none=ads),
        ]
    )
    transition_events = []
    published_events = []

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(module_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(module_handlers.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(module_handlers, "event_bus", FakeEventBus())

    await module_handlers.on_travelwiz_manifest_closed(
        OpsFluxEvent(
            event_type="travelwiz.manifest.closed",
            payload={
                "manifest_id": str(manifest_id),
                "voyage_id": str(voyage_id),
                "entity_id": str(entity_id),
                "is_return": True,
            },
        )
    )

    assert ads.status == "completed"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "completed"
    assert ads_event.metadata_json["source"] == "travelwiz.manifest.closed"
    assert ads_event.metadata_json["manifest_id"] == str(manifest_id)
    assert transition_events and transition_events[0]["to_state"] == "completed"
    assert published_events and published_events[0].event_type == "ads.completed"
    assert published_events[0].payload["source"] == "travelwiz.manifest.closed"


@pytest.mark.asyncio
async def test_module_handler_trip_closed_completes_linked_ads_with_traceability(monkeypatch):
    entity_id = uuid4()
    manifest_id = uuid4()
    voyage_id = uuid4()
    ads_id = uuid4()
    ads_pax_id = uuid4()
    requester_id = uuid4()
    passenger = SimpleNamespace(manifest_id=manifest_id, ads_pax_id=ads_pax_id, boarding_status="boarded")
    ads = _build_ads(id=ads_id, entity_id=entity_id, requester_id=requester_id, status="in_progress")
    db = FakeDB(
        [
            FakeScalarResult([manifest_id]),
            FakeScalarResult([passenger]),
            FakeResult(scalar_one_or_none=ads_id),
            FakeResult(scalar_one_or_none=ads),
        ]
    )
    transition_events = []
    published_events = []

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(module_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(module_handlers.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(module_handlers, "event_bus", FakeEventBus())

    await module_handlers.on_travelwiz_trip_closed(
        OpsFluxEvent(
            event_type="travelwiz.trip.closed",
            payload={
                "voyage_id": str(voyage_id),
                "entity_id": str(entity_id),
            },
        )
    )

    assert ads.status == "completed"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.event_type == "completed"
    assert ads_event.metadata_json["source"] == "travelwiz.trip.closed"
    assert ads_event.metadata_json["voyage_id"] == str(voyage_id)
    assert ads_event.metadata_json["manifest_id"] is None
    assert transition_events and transition_events[0]["to_state"] == "completed"
    assert published_events and published_events[0].event_type == "ads.completed"
    assert published_events[0].payload["source"] == "travelwiz.trip.closed"


@pytest.mark.asyncio
async def test_overdue_ads_job_sends_single_alert_before_autoclose(monkeypatch):
    entity_id = uuid4()
    requester_id = uuid4()
    ads = _build_ads(entity_id=entity_id, requester_id=requester_id, status="in_progress", end_date=date(2026, 4, 1))
    db = FakeDB(
        [
            FakeScalarResult([]),
            FakeScalarResult([ads]),
            FakeResult(scalar_one_or_none=None),
        ]
    )
    notifications = []

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 4, 2, 1, 30, tzinfo=timezone.utc)

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    monkeypatch.setattr(paxlog_ads_autoclose, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(paxlog_ads_autoclose, "send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_ads_autoclose, "datetime", FakeDateTime)

    result = await paxlog_ads_autoclose.process_overdue_ads_closure()

    assert result == {"alerts_sent": 1, "auto_closed": 0}
    alert_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert alert_event.event_type == "overdue_return_alert"
    assert alert_event.metadata_json["source"] == "paxlog.nightly_autoclose"
    assert notifications and "dépass" in notifications[0]["body"]


@pytest.mark.asyncio
async def test_overdue_ads_job_autocloses_after_grace(monkeypatch):
    entity_id = uuid4()
    requester_id = uuid4()
    ads = _build_ads(entity_id=entity_id, requester_id=requester_id, status="in_progress", end_date=date(2026, 4, 1))
    db = FakeDB(
        [
            FakeScalarResult([]),
            FakeScalarResult([ads]),
        ]
    )
    notifications = []
    transition_events = []
    published_events = []

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 4, 4, 1, 30, tzinfo=timezone.utc)

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_emit_transition_event(**kwargs):
        transition_events.append(kwargs)

    class FakeEventBus:
        async def publish(self, event):
            published_events.append(event)

    monkeypatch.setattr(paxlog_ads_autoclose, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(paxlog_ads_autoclose, "send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_ads_autoclose, "datetime", FakeDateTime)
    monkeypatch.setattr(paxlog_service.fsm_service, "emit_transition_event", fake_emit_transition_event)
    monkeypatch.setattr(paxlog_service, "event_bus", FakeEventBus())

    result = await paxlog_ads_autoclose.process_overdue_ads_closure()

    assert result == {"alerts_sent": 0, "auto_closed": 1}
    assert ads.status == "completed"
    ads_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert ads_event.metadata_json["source"] == "paxlog.nightly_autoclose"
    assert ads_event.metadata_json["grace_days"] == paxlog_ads_autoclose.DEFAULT_GRACE_DAYS
    assert transition_events and transition_events[0]["to_state"] == "completed"
    assert published_events and published_events[0].payload["source"] == "paxlog.nightly_autoclose"
    assert notifications and "clôturée automatiquement" in notifications[0]["body"]


@pytest.mark.asyncio
async def test_requires_review_followup_sends_single_reminder(monkeypatch):
    entity_id = uuid4()
    requester_id = uuid4()
    ads = _build_ads(
        entity_id=entity_id,
        requester_id=requester_id,
        status="requires_review",
        updated_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
    )
    notifications = []

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 3, 20, tzinfo=timezone.utc)

    db = FakeDB([
        FakeScalarResult([ads]),
        FakeResult(scalar_one_or_none=None),
    ])

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    monkeypatch.setattr(paxlog_requires_review_followup, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(paxlog_requires_review_followup, "send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_requires_review_followup, "datetime", FakeDateTime)

    result = await paxlog_requires_review_followup.process_requires_review_followup()

    assert result == {"reminders_sent": 1}
    reminder_event = next(obj for obj in db.added if isinstance(obj, AdsEvent))
    assert reminder_event.event_type == "requires_review_reminder"
    assert reminder_event.metadata_json["source"] == "paxlog.requires_review_followup"
    assert reminder_event.metadata_json["days_in_requires_review"] == 14
    assert notifications and notifications[0]["link"] == f"/paxlog/ads/{ads.id}"


@pytest.mark.asyncio
async def test_requires_review_followup_skips_when_reminder_already_sent(monkeypatch):
    entity_id = uuid4()
    requester_id = uuid4()
    ads = _build_ads(
        entity_id=entity_id,
        requester_id=requester_id,
        status="requires_review",
        updated_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
    )
    notifications = []

    class FakeDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 3, 20, tzinfo=timezone.utc)

    db = FakeDB([
        FakeScalarResult([ads]),
        FakeResult(scalar_one_or_none=uuid4()),
    ])

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    monkeypatch.setattr(paxlog_requires_review_followup, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(paxlog_requires_review_followup, "send_in_app", fake_send_in_app)
    monkeypatch.setattr(paxlog_requires_review_followup, "datetime", FakeDateTime)

    result = await paxlog_requires_review_followup.process_requires_review_followup()

    assert result == {"reminders_sent": 0}
    assert notifications == []


@pytest.mark.asyncio
async def test_process_rotation_cycles_uses_rotation_columns_and_creates_ads_for_internal_user(monkeypatch):
    entity_id = uuid4()
    cycle_id = uuid4()
    user_id = uuid4()
    site_asset_id = uuid4()
    project_id = uuid4()
    created_by = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(cycle_id, user_id, None, site_asset_id, 14, 14, date(2026, 4, 12), 7, project_id, None, created_by)]),
            FakeResult(scalar=uuid4()),
            FakeResult(),
            FakeResult(),
        ]
    )

    async def fake_generate_ads_reference(_db, _entity_id):
        return "ADS-ROT-001"

    monkeypatch.setattr(paxlog_service, "generate_ads_reference", fake_generate_ads_reference)

    created = await paxlog_service.process_rotation_cycles(db, entity_id)

    assert created == 1
    select_sql = str(db.executed[0][0])
    insert_sql = str(db.executed[1][0])
    update_sql = str(db.executed[3][0])
    assert "rotation_days_on" in select_sql
    assert "rotation_days_off" in select_sql
    assert "days_on" not in select_sql.replace("rotation_days_on", "").replace("rotation_days_off", "")
    assert "INSERT INTO ads" in insert_sql
    assert "created_by" in insert_sql
    assert "requester_id" in insert_sql
    assert "UPDATE pax_rotation_cycles SET next_on_date" in update_sql
    assert db.commits == 1


@pytest.mark.asyncio
async def test_process_rotation_cycles_uses_cycle_creator_as_sponsor_for_external_contact(monkeypatch):
    entity_id = uuid4()
    cycle_id = uuid4()
    contact_id = uuid4()
    site_asset_id = uuid4()
    sponsor_user_id = uuid4()
    new_ads_id = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(cycle_id, None, contact_id, site_asset_id, 14, 14, date(2026, 4, 12), 7, None, None, sponsor_user_id)]),
            FakeResult(scalar=new_ads_id),
            FakeResult(),
            FakeResult(),
        ]
    )

    async def fake_generate_ads_reference(_db, _entity_id):
        return "ADS-ROT-002"

    monkeypatch.setattr(paxlog_service, "generate_ads_reference", fake_generate_ads_reference)

    created = await paxlog_service.process_rotation_cycles(db, entity_id)

    assert created == 1
    insert_ads_sql = str(db.executed[1][0])
    insert_pax_sql = str(db.executed[2][0])
    insert_ads_params = db.executed[1][1]
    insert_pax_params = db.executed[2][1]
    assert "created_by" in insert_ads_sql
    assert "requester_id" in insert_ads_sql
    assert "contact_id" in insert_pax_sql
    assert insert_ads_params["created_by"] == str(sponsor_user_id)
    assert insert_ads_params["requester_id"] == str(sponsor_user_id)
    assert insert_pax_params["pax_fk"] == str(contact_id)
    assert db.commits == 1


@pytest.mark.asyncio
async def test_create_rotation_cycle_uses_rotation_columns_and_created_by(monkeypatch):
    entity_id = uuid4()
    current_user_id = uuid4()
    cycle_id = uuid4()
    user_id = uuid4()
    site_asset_id = uuid4()
    audits = []
    db = FakeDB([FakeResult(scalar=cycle_id)])

    async def fake_record_audit(*args, **kwargs):
        audits.append(kwargs)

    monkeypatch.setattr(paxlog, "record_audit", fake_record_audit)

    response = await paxlog.create_rotation_cycle(
        site_asset_id=site_asset_id,
        days_on=21,
        days_off=21,
        cycle_start_date=date(2026, 4, 20),
        user_id=user_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=current_user_id),
        _=None,
        db=db,
    )

    insert_sql = str(db.executed[0][0])
    assert "rotation_days_on" in insert_sql
    assert "rotation_days_off" in insert_sql
    assert "created_by" in insert_sql
    assert response["id"] == str(cycle_id)
    assert audits and audits[0]["action"] == "paxlog.rotation.create"


@pytest.mark.asyncio
async def test_list_rotation_cycles_returns_paginated_enriched_rows_and_status_alias(monkeypatch):
    entity_id = uuid4()
    user_id = uuid4()
    site_asset_id = uuid4()
    rows = [
        (
            uuid4(),
            entity_id,
            user_id,
            None,
            site_asset_id,
            14,
            14,
            date(2026, 4, 1),
            date(2026, 4, 15),
            "active",
            True,
            7,
            None,
            None,
            "Cycle test",
            datetime(2026, 4, 1, tzinfo=timezone.utc),
            datetime(2026, 4, 2, tzinfo=timezone.utc),
            None,
            "Aline",
            "Mukeba",
            "Onshore A",
            None,
        )
    ]
    db = FakeDB([
        FakeResult(scalar=1),
        FakeResult(all_rows=rows),
    ])

    async def fake_check_pax_compliance(*_args, **_kwargs):
        return {
            "compliant": False,
            "results": [
                {"status": "missing", "message": "Badge expired"},
                {"status": "pending_validation", "message": "Medical pending"},
            ],
        }

    monkeypatch.setattr(paxlog_service, "check_pax_compliance", fake_check_pax_compliance)

    response = await paxlog.list_rotation_cycles(
        status_filter="active",
        pagination=SimpleNamespace(page=1, page_size=20),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        _=None,
        db=db,
    )

    count_sql = str(db.executed[0][0])
    list_sql = str(db.executed[1][0])
    assert "COUNT(*)" in count_sql
    assert "status = :status" in count_sql
    assert "LIMIT :limit OFFSET :offset" in list_sql
    assert response.total == 1
    assert response.page == 1
    assert response.page_size == 20
    assert response.items[0].pax_first_name == "Aline"
    assert response.items[0].site_name == "Onshore A"
    assert response.items[0].next_rotation_date == date(2026, 4, 15)
    assert response.items[0].compliance_risk_level == "blocked"
    assert response.items[0].compliance_issue_count == 2
