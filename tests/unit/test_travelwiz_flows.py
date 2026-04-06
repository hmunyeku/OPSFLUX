from __future__ import annotations

from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.routes.core import settings as settings_routes
from app.core.events import OpsFluxEvent
from app.event_handlers import travelwiz_handlers
from app.services.modules import travelwiz_service
from app.tasks.jobs import travelwiz_operational_watch


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
        return FakeScalarResult(self._all_rows if self._scalar is None else self._scalar)


class FakeScalarResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.executed = []
        self.commits = 0
        self.rollbacks = 0
        self.flushes = 0

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        self.flushes += 1

    async def rollback(self):
        self.rollbacks += 1


class FakeAsyncSessionContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, exc_type, exc, tb):
        return False


def _body(key: str, value):
    return SimpleNamespace(key=key, value={"v": value})


@pytest.mark.asyncio
async def test_assess_manifest_weight_uses_settings_ratio_and_blocks_at_capacity():
    entity_id = uuid4()
    voyage_id = uuid4()
    manifest_id = uuid4()
    vector_id = uuid4()
    voyage = SimpleNamespace(id=voyage_id, entity_id=entity_id, vector_id=vector_id)
    manifest = SimpleNamespace(id=manifest_id, voyage_id=voyage_id, manifest_type="pax")
    vector = SimpleNamespace(id=vector_id, weight_capacity_kg=1000.0, requires_weighing=True)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=voyage),
            FakeResult(scalar_one_or_none=manifest),
            FakeResult(scalar_one_or_none=vector),
            FakeResult(scalar=820.0),
            FakeResult(scalar=130.0),
            FakeResult(scalar_one_or_none={"v": 0.9}),
        ]
    )

    result = await travelwiz_service.assess_manifest_weight(
        db,
        voyage_id=voyage_id,
        manifest_id=manifest_id,
        entity_id=entity_id,
    )

    assert result["requires_weighing"] is True
    assert result["current_weight_kg"] == 950.0
    assert result["alert_threshold_kg"] == 900.0
    assert result["is_alert"] is True
    assert result["is_blocked"] is False


@pytest.mark.asyncio
async def test_assess_voyage_delay_exposes_reassignment_options():
    entity_id = uuid4()
    voyage_id = uuid4()
    stop_asset_id = uuid4()
    voyage = SimpleNamespace(
        id=voyage_id,
        entity_id=entity_id,
        status="delayed",
        scheduled_departure=datetime.now(timezone.utc) - timedelta(hours=5),
        actual_departure=None,
        delay_reason="Meteo",
    )
    alternative = SimpleNamespace(
        id=uuid4(),
        code="VYG-ALT",
        scheduled_departure=datetime.now(timezone.utc) + timedelta(hours=2),
        status="confirmed",
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=voyage),
            FakeResult(scalar_one_or_none={"v": 4}),
            FakeResult(all_rows=[(stop_asset_id,)]),
            FakeResult(all_rows=[(alternative, "DOLPHIN")]),
        ]
    )

    result = await travelwiz_service.assess_voyage_delay(
        db,
        voyage_id=voyage_id,
        entity_id=entity_id,
    )

    assert result["delay_hours"] >= 4
    assert result["threshold_hours"] == 4
    assert result["reassign_available"] is True
    assert result["alternatives"][0]["code"] == "VYG-ALT"


@pytest.mark.asyncio
async def test_on_ads_approved_uses_current_voyage_models(monkeypatch):
    entity_id = uuid4()
    voyage = SimpleNamespace(id=uuid4(), scheduled_departure=datetime.now(timezone.utc))
    db = FakeDB([FakeResult(scalar_one_or_none=voyage)])
    generated = []

    async def fake_generate(*args, **kwargs):
        generated.append(kwargs)
        return {"manifest_id": uuid4(), "added_count": 2, "skipped_count": 0, "total_pax": 2}

    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr("app.services.modules.travelwiz_service.generate_pax_manifest_from_ads", fake_generate)

    await travelwiz_handlers.on_ads_approved(
        OpsFluxEvent(
            event_type="paxlog.ads.approved",
            payload={
                "ads_id": str(uuid4()),
                "entity_id": str(entity_id),
                "site_asset_id": str(uuid4()),
                "start_date": "2026-04-10",
                "transport_requested": True,
            },
        )
    )

    executed_sql = " ".join(str(item[0]) for item in db.executed)
    assert "trips" not in executed_sql
    assert generated and generated[0]["entity_id"] == entity_id


@pytest.mark.asyncio
async def test_on_voyage_delayed_notifies_admins_and_passengers(monkeypatch):
    entity_id = uuid4()
    user_id = uuid4()
    passenger = SimpleNamespace(user_id=user_id, contact_id=None)
    db = FakeDB([FakeResult(all_rows=[passenger])])
    notifications = []
    emails = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_render_and_send_email(*args, **kwargs):
        emails.append(kwargs)

    async def fake_get_admin_user_ids(_entity_id):
        return [uuid4()]

    async def fake_get_user_email_and_name(_user_id, _db):
        return "captain@example.com", "Admin"

    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.core.email_templates.render_and_send_email", fake_render_and_send_email)
    monkeypatch.setattr("app.event_handlers.core_handlers._get_admin_user_ids", fake_get_admin_user_ids)
    monkeypatch.setattr(travelwiz_handlers, "_get_user_email_and_name", fake_get_user_email_and_name)

    await travelwiz_handlers.on_voyage_delayed(
        OpsFluxEvent(
            event_type="travelwiz.voyage.delayed",
            payload={
                "voyage_id": str(uuid4()),
                "entity_id": str(entity_id),
                "code": "VYG-001",
                "delay_reason": "Meteo",
                "delay_hours": 5,
                "reassign_available": True,
            },
        )
    )

    assert notifications
    assert any(item["category"] == "travelwiz" for item in notifications)
    assert emails and emails[0]["slug"] == "travelwiz.voyage.delayed"


@pytest.mark.asyncio
async def test_verify_captain_session_token_accepts_matching_access():
    voyage_id = uuid4()
    trip_code_access_id = uuid4()
    token = travelwiz_service.create_captain_session_token(
        trip_code_access_id=trip_code_access_id,
        voyage_id=voyage_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db = FakeDB(
        [
                FakeResult(
                    first=(
                        SimpleNamespace(id=trip_code_access_id, created_by=uuid4()),
                        SimpleNamespace(id=voyage_id, active=True),
                    )
                )
            ]
    )

    result = await travelwiz_service.verify_captain_session_token(
        db,
        session_token=token,
        voyage_id=voyage_id,
    )

    assert result["trip_code_access_id"] == trip_code_access_id
    assert result["voyage"].id == voyage_id


@pytest.mark.asyncio
async def test_verify_captain_session_token_rejects_wrong_voyage():
    token = travelwiz_service.create_captain_session_token(
        trip_code_access_id=uuid4(),
        voyage_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )

    with pytest.raises(ValueError):
        await travelwiz_service.verify_captain_session_token(
            FakeDB([]),
            session_token=token,
            voyage_id=uuid4(),
        )


@pytest.mark.asyncio
async def test_rebalance_manifest_passenger_standby_marks_over_capacity_passengers():
    entity_id = uuid4()
    voyage_id = uuid4()
    manifest_id = uuid4()
    vector_id = uuid4()
    voyage = SimpleNamespace(id=voyage_id, entity_id=entity_id, vector_id=vector_id)
    vector = SimpleNamespace(id=vector_id, pax_capacity=2, weight_capacity_kg=None)
    passengers = [
        SimpleNamespace(priority_score=90, created_at=datetime(2026, 1, 1, tzinfo=timezone.utc), actual_weight_kg=None, declared_weight_kg=None, standby=False),
        SimpleNamespace(priority_score=80, created_at=datetime(2026, 1, 2, tzinfo=timezone.utc), actual_weight_kg=None, declared_weight_kg=None, standby=False),
        SimpleNamespace(priority_score=10, created_at=datetime(2026, 1, 3, tzinfo=timezone.utc), actual_weight_kg=None, declared_weight_kg=None, standby=False),
    ]
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=voyage),
            FakeResult(scalar_one_or_none=vector),
            FakeResult(all_rows=passengers),
        ]
    )

    summary = await travelwiz_service.rebalance_manifest_passenger_standby(
        db,
        voyage_id=voyage_id,
        manifest_id=manifest_id,
        entity_id=entity_id,
    )

    assert summary["active_count"] == 2
    assert summary["standby_count"] == 1
    assert passengers[0].standby is False
    assert passengers[1].standby is False
    assert passengers[2].standby is True


@pytest.mark.asyncio
async def test_reassign_voyage_passengers_moves_pending_passengers_and_cancels_source():
    entity_id = uuid4()
    source_voyage_id = uuid4()
    target_voyage_id = uuid4()
    source_manifest_id = uuid4()
    target_manifest_id = uuid4()
    source_voyage = SimpleNamespace(id=source_voyage_id, entity_id=entity_id, status="delayed", scheduled_departure=datetime.now(timezone.utc) - timedelta(hours=5), actual_departure=None, delay_reason="Meteo", vector_id=uuid4())
    target_voyage = SimpleNamespace(id=target_voyage_id, entity_id=entity_id, status="confirmed", scheduled_departure=datetime.now(timezone.utc) + timedelta(hours=2), code="VYG-TARGET", active=True)
    source_manifest = SimpleNamespace(id=source_manifest_id, voyage_id=source_voyage_id, manifest_type="pax", active=True)
    target_manifest = SimpleNamespace(id=target_manifest_id, voyage_id=target_voyage_id, manifest_type="pax", status="draft", active=True)
    passenger = SimpleNamespace(
        ads_pax_id=uuid4(),
        manifest_id=source_manifest_id,
        standby=False,
        boarding_status="pending",
        priority_score=80,
        created_at=datetime.now(timezone.utc),
        actual_weight_kg=None,
        declared_weight_kg=None,
    )
    rebalance_calls = []

    async def fake_rebalance(db, *, voyage_id, manifest_id, entity_id):
        rebalance_calls.append((voyage_id, manifest_id, entity_id))
        return {"standby_count": 0}

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(travelwiz_service, "rebalance_manifest_passenger_standby", fake_rebalance)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=source_voyage),          # assess source voyage
            FakeResult(scalar_one_or_none={"v": 4}),               # delay threshold
            FakeResult(all_rows=[(uuid4(),)]),                     # source stop ids
            FakeResult(all_rows=[(target_voyage, "DOLPHIN")]),     # alternatives
            FakeResult(scalar_one_or_none=source_voyage),          # source voyage load
            FakeResult(scalar_one_or_none=target_voyage),          # target voyage load
            FakeResult(scalar_one_or_none=source_manifest),        # source manifest
            FakeResult(scalar_one_or_none=target_manifest),        # target manifest
            FakeResult(all_rows=[]),                               # target existing ads pax ids
            FakeResult(all_rows=[passenger]),                      # source passengers
        ]
    )

    try:
        result = await travelwiz_service.reassign_voyage_passengers(
            db,
            source_voyage_id=source_voyage_id,
            target_voyage_id=target_voyage_id,
            entity_id=entity_id,
        )
    finally:
        monkeypatch.undo()

    assert result["moved_count"] == 1
    assert passenger.manifest_id == target_manifest_id
    assert source_voyage.status == "cancelled"
    assert rebalance_calls == [(target_voyage_id, target_manifest_id, entity_id)]


@pytest.mark.asyncio
async def test_travelwiz_operational_watch_notifies_on_stale_signal(monkeypatch):
    entity_id = uuid4()
    voyage_id = uuid4()
    admin_id = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(voyage_id, entity_id, "VYG-001", datetime.now(timezone.utc) - timedelta(minutes=45))]),
            FakeResult(scalar_one_or_none={"v": 15}),
            FakeResult(scalar=0),
            FakeResult(all_rows=[]),
        ]
    )
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_admins(_entity_id):
        return [admin_id]

    monkeypatch.setattr("app.tasks.jobs.travelwiz_operational_watch.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.tasks.jobs.travelwiz_operational_watch._get_admin_user_ids", fake_admins)

    count = await travelwiz_operational_watch._process_stale_vector_signals(db)

    assert count == 1
    assert notifications and notifications[0]["title"] == "Signal de suivi indisponible"


@pytest.mark.asyncio
async def test_travelwiz_operational_watch_notifies_on_weather_alert(monkeypatch):
    entity_id = uuid4()
    asset_id = uuid4()
    admin_id = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(entity_id, asset_id, "Base A", 25.0, "vfr", "storm", datetime.now(timezone.utc))]),
            FakeResult(scalar_one_or_none={"v": 6}),
            FakeResult(scalar=0),
        ]
    )
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_admins(_entity_id):
        return [admin_id]

    monkeypatch.setattr("app.tasks.jobs.travelwiz_operational_watch.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.tasks.jobs.travelwiz_operational_watch._get_admin_user_ids", fake_admins)

    count = await travelwiz_operational_watch._process_weather_alerts(db)

    assert count == 1
    assert notifications and notifications[0]["title"] == "Alerte météo opérationnelle"


def test_validate_travelwiz_numeric_settings():
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.delay_reassign_threshold_hours", 4))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.weight_alert_ratio", 0.9))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.captain_session_minutes", 30))

    with pytest.raises(HTTPException):
        settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.weight_alert_ratio", 2))
