"""Unit tests for recently added PaxLog operational flows."""

from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.modules import paxlog
from app.models.paxlog import AdsEvent
from app.schemas.paxlog import AdsStayChangeRequest, MissionNoticeModifyRequest


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

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj):
        self.refreshed.append(obj)


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
        "return_transport_mode": "boat",
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
async def test_get_ads_includes_avm_origin():
    ads = _build_ads()
    program_id = uuid4()
    avm_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads),
            FakeResult(first=(program_id, "Inspection compresseur", avm_id, "AVM-009", "Campagne compresseur")),
        ]
    )

    response = await paxlog.get_ads(
        ads.id,
        entity_id=ads.entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        db=db,
    )

    assert response.origin_mission_program_id == program_id
    assert response.origin_mission_program_activity == "Inspection compresseur"
    assert response.origin_mission_notice_id == avm_id
    assert response.origin_mission_notice_reference == "AVM-009"
    assert response.origin_mission_notice_title == "Campagne compresseur"


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
        current_user=SimpleNamespace(id=uuid4()),
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
    db = FakeDB([FakeResult(scalar_one_or_none=ads.id)])

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
    ads = _build_ads()
    program_id = uuid4()
    pax_user_id = uuid4()
    approver_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=ads.id),
            FakeResult(scalar=program_id),
            FakeResult(scalar=program_id),
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
