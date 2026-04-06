from __future__ import annotations

from datetime import datetime, timezone, timedelta
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from app.api.routes.modules import travelwiz as travelwiz_routes
from app.api.routes.core import settings as settings_routes
from app.core.events import OpsFluxEvent
from app.event_handlers import travelwiz_handlers
from app.services.modules import travelwiz_service
from app.tasks.jobs import travelwiz_operational_watch
from app.tasks.jobs import travelwiz_pickup_reminders
from app.tasks.jobs import travelwiz_weather_sync


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
        self.added = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    async def scalar(self, statement):
        result = await self.execute(statement)
        return result.scalar_one_or_none()

    def add(self, instance):
        self.added.append(instance)

    async def commit(self):
        self.commits += 1

    async def flush(self):
        self.flushes += 1

    async def refresh(self, _instance):
        return None

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
async def test_list_package_elements_uses_current_package_element_model(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    created_at = datetime.now(timezone.utc)
    element = SimpleNamespace(
        id=uuid4(),
        package_id=cargo_id,
        description="Pompe hydraulique",
        quantity_sent=Decimal("2"),
        unit_weight_kg=Decimal("5.5"),
        sap_code="SAP-001",
        created_at=created_at,
    )
    db = FakeDB([FakeResult(all_rows=[element])])

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return SimpleNamespace(id=_cargo_id)

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)

    result = await travelwiz_routes.list_package_elements(
        cargo_id=cargo_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        db=db,
    )

    assert result == [
        {
            "id": element.id,
            "cargo_item_id": cargo_id,
            "description": "Pompe hydraulique",
            "quantity": 2,
            "weight_kg": 5.5,
            "sap_code": "SAP-001",
            "created_at": created_at.isoformat(),
        }
    ]


@pytest.mark.asyncio
async def test_add_package_element_uses_package_element_model(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    db = FakeDB([])

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return SimpleNamespace(id=_cargo_id)

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)

    result = await travelwiz_routes.add_package_element(
        cargo_id=cargo_id,
        description="  Moteur auxiliaire  ",
        quantity=3,
        weight_kg=12.5,
        sap_code=" SAP-77 ",
        notes="  Controle retour  ",
        entity_id=entity_id,
        _=None,
        db=db,
    )

    assert len(db.added) == 1
    added = db.added[0]
    assert added.package_id == cargo_id
    assert added.description == "Moteur auxiliaire"
    assert added.quantity_sent == Decimal("3")
    assert added.unit_weight_kg == Decimal("12.5")
    assert added.sap_code == "SAP-77"
    assert added.management_type == "manual"
    assert added.unit_of_measure == "unit"
    assert added.return_notes == "Controle retour"
    assert db.flushes == 1
    assert db.commits == 1
    assert result["cargo_item_id"] == cargo_id
    assert result["quantity"] == 3
    assert result["weight_kg"] == 12.5


@pytest.mark.asyncio
async def test_get_cargo_history_returns_audit_entries(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    actor_id = uuid4()
    created_at = datetime.now(timezone.utc)
    audit_entry = SimpleNamespace(
        id=uuid4(),
        action="travelwiz.cargo.status",
        created_at=created_at,
        user_id=actor_id,
        details={"from_status": "registered", "to_status": "in_transit"},
    )
    db = FakeDB([FakeResult(all_rows=[(audit_entry, "Aline", "Mukeba")])])

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return SimpleNamespace(id=_cargo_id)

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)

    result = await travelwiz_routes.get_cargo_history(
        cargo_id=cargo_id,
        entity_id=entity_id,
        current_user=SimpleNamespace(id=uuid4()),
        db=db,
    )

    assert result == [
        {
            "id": str(audit_entry.id),
            "action": "travelwiz.cargo.status",
            "created_at": created_at.isoformat(),
            "actor_id": str(actor_id),
            "actor_name": "Aline Mukeba",
            "details": {"from_status": "registered", "to_status": "in_transit"},
        }
    ]


@pytest.mark.asyncio
async def test_get_public_cargo_tracking_returns_limited_tracking_timeline():
    cargo_id = uuid4()
    created_at = datetime.now(timezone.utc) - timedelta(hours=4)
    received_at = datetime.now(timezone.utc)
    cargo = SimpleNamespace(
        id=cargo_id,
        tracking_code="CGO-TRACK-001",
        description="Pompe HP",
        cargo_type="unit",
        status="delivered_final",
        weight_kg=125.0,
        width_cm=120.0,
        length_cm=80.0,
        height_cm=95.0,
        receiver_name="Base logistique",
        received_at=received_at,
        created_at=created_at,
    )
    audit_create = SimpleNamespace(
        action="travelwiz.cargo.create",
        created_at=created_at,
        details={"cargo_type": "unit"},
    )
    audit_status = SimpleNamespace(
        action="travelwiz.cargo.status",
        created_at=created_at + timedelta(hours=2),
        details={"from_status": "ready", "to_status": "in_transit"},
    )
    audit_receive = SimpleNamespace(
        action="travelwiz.cargo.receive",
        created_at=received_at,
        details={"to_status": "delivered_final"},
    )
    db = FakeDB(
        [
            FakeResult(first=(cargo, "Acme Logistics", "Offshore Bravo", "VYG-204")),
            FakeResult(all_rows=[audit_create, audit_status, audit_receive]),
        ]
    )

    result = await travelwiz_routes.get_public_cargo_tracking(
        tracking_code="CGO-TRACK-001",
        db=db,
    )

    assert result["tracking_code"] == "CGO-TRACK-001"
    assert result["status"] == "delivered_final"
    assert result["status_label"] == "Livré"
    assert result["sender_name"] == "Acme Logistics"
    assert result["destination_name"] == "Offshore Bravo"
    assert result["voyage_code"] == "VYG-204"
    assert len(result["events"]) == 3
    assert result["events"][0]["label"] == "Expédition enregistrée"
    assert result["events"][-1]["label"] == "Réception confirmée"


@pytest.mark.asyncio
async def test_get_public_cargo_tracking_raises_404_when_not_found():
    db = FakeDB([FakeResult(first=None)])

    with pytest.raises(HTTPException) as exc:
        await travelwiz_routes.get_public_cargo_tracking(
            tracking_code="UNKNOWN",
            db=db,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_get_public_voyage_cargo_tracking_returns_associated_shipments():
    voyage_id = uuid4()
    cargo_id = uuid4()
    voyage = SimpleNamespace(
        id=voyage_id,
        code="VYG-204",
        status="confirmed",
        scheduled_departure=datetime.now(timezone.utc) + timedelta(hours=2),
        scheduled_arrival=datetime.now(timezone.utc) + timedelta(hours=7),
        active=True,
    )
    cargo = SimpleNamespace(
        id=cargo_id,
        tracking_code="CGO-TRACK-001",
        description="Pompe HP",
        cargo_type="unit",
        status="in_transit",
        weight_kg=125.0,
        manifest_id=uuid4(),
        receiver_name="Base logistique",
        created_at=datetime.now(timezone.utc) - timedelta(hours=4),
    )
    last_event_at = datetime.now(timezone.utc) - timedelta(minutes=15)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=voyage),
            FakeResult(all_rows=[(cargo, "Offshore Bravo")]),
            FakeResult(scalar_one_or_none=last_event_at),
        ]
    )

    result = await travelwiz_routes.get_public_voyage_cargo_tracking(
        voyage_code="VYG-204",
        db=db,
    )

    assert result["voyage_code"] == "VYG-204"
    assert result["voyage_status"] == "confirmed"
    assert result["cargo_count"] == 1
    assert result["items"][0]["tracking_code"] == "CGO-TRACK-001"
    assert result["items"][0]["destination_name"] == "Offshore Bravo"
    assert result["items"][0]["last_event_at"] == last_event_at


@pytest.mark.asyncio
async def test_get_public_voyage_cargo_tracking_raises_404_when_voyage_not_found():
    db = FakeDB([FakeResult(scalar_one_or_none=None)])

    with pytest.raises(HTTPException) as exc:
        await travelwiz_routes.get_public_voyage_cargo_tracking(
            voyage_code="VYG-404",
            db=db,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_update_cargo_status_records_audit(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    actor_id = uuid4()
    cargo = SimpleNamespace(
        id=cargo_id,
        status="registered",
        damage_notes=None,
        sender_tier_id=None,
        destination_asset_id=None,
        __table__=SimpleNamespace(columns=[]),
    )
    db = FakeDB([])
    audits = []

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return cargo

    async def fake_record_audit(_db, **kwargs):
        audits.append(kwargs)

    async def fake_build_cargo_read_data(_db, _cargo):
        return {"id": _cargo.id, "status": _cargo.status}

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)
    monkeypatch.setattr(travelwiz_routes, "record_audit", fake_record_audit)
    monkeypatch.setattr(travelwiz_routes, "_build_cargo_read_data", fake_build_cargo_read_data)

    await travelwiz_routes.update_cargo_status(
        cargo_id=cargo_id,
        body=travelwiz_routes.CargoStatusUpdate(status="in_transit", damage_notes="RAS"),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert db.commits == 2
    assert audits and audits[0]["action"] == "travelwiz.cargo.status"
    assert audits[0]["resource_type"] == "cargo_item"
    assert audits[0]["resource_id"] == str(cargo_id)
    assert audits[0]["user_id"] == actor_id
    assert audits[0]["details"]["from_status"] == "registered"
    assert audits[0]["details"]["to_status"] == "in_transit"


@pytest.mark.asyncio
async def test_update_cargo_workflow_status_records_audit(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    actor_id = uuid4()
    cargo = SimpleNamespace(
        id=cargo_id,
        workflow_status="draft",
        sender_tier_id=None,
        destination_asset_id=None,
        pickup_contact_user_id=None,
        pickup_contact_tier_contact_id=None,
        pickup_contact_name=None,
        __table__=SimpleNamespace(columns=[]),
    )
    db = FakeDB([])
    audits = []

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return cargo

    async def fake_record_audit(_db, **kwargs):
        audits.append(kwargs)

    async def fake_build_cargo_read_data(_db, _cargo):
        return {
            "id": _cargo.id,
            "workflow_status": _cargo.workflow_status,
            "description": "Pompe HP",
            "designation": "Skid pompe",
            "weight_kg": 120.0,
            "destination_asset_id": str(uuid4()),
            "pickup_location_label": "Magasin principal",
            "pickup_contact_name": "Jean Agent",
            "pickup_contact_user_id": None,
            "pickup_contact_tier_contact_id": None,
            "available_from": datetime.now(timezone.utc).isoformat(),
            "imputation_reference_id": str(uuid4()),
            "photo_evidence_count": 2,
            "document_attachment_count": 1,
            "weight_ticket_provided": True,
            "cargo_type": "unit",
            "hazmat_validated": False,
            "lifting_points_certified": True,
        }

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)
    monkeypatch.setattr(travelwiz_routes, "record_audit", fake_record_audit)
    monkeypatch.setattr(travelwiz_routes, "_build_cargo_read_data", fake_build_cargo_read_data)

    result = await travelwiz_routes.update_cargo_workflow_status(
        cargo_id=cargo_id,
        body=travelwiz_routes.CargoWorkflowStatusUpdate(workflow_status="approved"),
        entity_id=entity_id,
        current_user=SimpleNamespace(id=actor_id),
        _=None,
        db=db,
    )

    assert result["workflow_status"] == "approved"
    assert db.commits == 2
    assert audits and audits[0]["action"] == "travelwiz.cargo.workflow_status"
    assert audits[0]["details"]["from_status"] == "draft"
    assert audits[0]["details"]["to_status"] == "approved"


@pytest.mark.asyncio
async def test_update_cargo_workflow_status_blocks_incomplete_dossier(monkeypatch):
    cargo_id = uuid4()
    entity_id = uuid4()
    actor_id = uuid4()
    cargo = SimpleNamespace(
        id=cargo_id,
        workflow_status="draft",
        sender_tier_id=None,
        destination_asset_id=None,
        pickup_contact_user_id=None,
        pickup_contact_tier_contact_id=None,
        pickup_contact_name=None,
        __table__=SimpleNamespace(columns=[]),
    )
    db = FakeDB([])

    async def fake_get_cargo_or_404(_db, _cargo_id, _entity_id):
        return cargo

    async def fake_build_cargo_read_data(_db, _cargo):
        return {
            "id": _cargo.id,
            "description": "Pompe",
            "designation": None,
            "weight_kg": 120.0,
            "destination_asset_id": None,
            "pickup_location_label": None,
            "pickup_contact_name": None,
            "pickup_contact_user_id": None,
            "pickup_contact_tier_contact_id": None,
            "available_from": None,
            "imputation_reference_id": None,
            "photo_evidence_count": 0,
            "document_attachment_count": 0,
            "weight_ticket_provided": False,
            "cargo_type": "unit",
            "hazmat_validated": False,
            "lifting_points_certified": False,
        }

    monkeypatch.setattr(travelwiz_routes, "_get_cargo_or_404", fake_get_cargo_or_404)
    monkeypatch.setattr(travelwiz_routes, "_build_cargo_read_data", fake_build_cargo_read_data)

    with pytest.raises(HTTPException) as exc:
        await travelwiz_routes.update_cargo_workflow_status(
            cargo_id=cargo_id,
            body=travelwiz_routes.CargoWorkflowStatusUpdate(workflow_status="ready_for_review"),
            entity_id=entity_id,
            current_user=SimpleNamespace(id=actor_id),
            _=None,
            db=db,
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "CARGO_DOSSIER_INCOMPLETE"
    assert "designation" in exc.value.detail["missing_requirements"]
    assert "imputation_reference_id" in exc.value.detail["missing_requirements"]


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
async def test_authenticate_driver_code_requires_active_pickup_round():
    voyage_id = uuid4()
    entity_id = uuid4()
    pickup_round = SimpleNamespace(
        id=uuid4(),
        route_name="Circuit Nord",
        driver_name="Jean",
        scheduled_departure=datetime.now(timezone.utc),
    )
    db = FakeDB(
        [
            FakeResult(
                first=(
                    SimpleNamespace(id=uuid4()),
                    SimpleNamespace(id=voyage_id, code="VYG-001", entity_id=entity_id, scheduled_departure=datetime.now(timezone.utc)),
                    pickup_round,
                )
            )
        ]
    )

    result = await travelwiz_service.authenticate_driver_code(db, "123456")

    assert result["valid"] is True
    assert result["pickup_round_id"] == pickup_round.id
    assert result["route_name"] == "Circuit Nord"


@pytest.mark.asyncio
async def test_verify_driver_session_token_accepts_matching_round():
    voyage_id = uuid4()
    trip_code_access_id = uuid4()
    pickup_round = SimpleNamespace(id=uuid4(), status="planned")
    token = travelwiz_service.create_driver_session_token(
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
                    pickup_round,
                )
            )
        ]
    )

    result = await travelwiz_service.verify_driver_session_token(
        db,
        session_token=token,
        voyage_id=voyage_id,
    )

    assert result["trip_code_access_id"] == trip_code_access_id
    assert result["pickup_round"] == pickup_round


@pytest.mark.asyncio
async def test_create_pickup_round_persists_assigned_manifest_passengers():
    entity_id = uuid4()
    trip_id = uuid4()
    passenger_id = uuid4()
    voyage = SimpleNamespace(id=trip_id, entity_id=entity_id)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=voyage),
            FakeResult(all_rows=[(passenger_id,)]),
        ]
    )
    added = []

    def fake_add(obj):
        if getattr(obj, "id", None) is None:
            obj.id = uuid4()
        added.append(obj)

    db.add = fake_add

    result = await travelwiz_service.create_pickup_round(
        db,
        entity_id=entity_id,
        data={
            "trip_id": trip_id,
            "route_name": "Circuit Nord",
            "scheduled_departure": datetime.now(timezone.utc),
            "stops": [
                {
                    "asset_id": uuid4(),
                    "pickup_order": 1,
                    "pax_expected": 1,
                    "manifest_passenger_ids": [passenger_id],
                }
            ],
        },
    )

    assert result["stops"][0]["assigned_manifest_passenger_count"] == 1
    assert any(obj.__class__.__name__ == "PickupStopAssignment" for obj in added)


@pytest.mark.asyncio
async def test_assess_pickup_stop_proximity_uses_latest_vector_position():
    entity_id = uuid4()
    trip_id = uuid4()
    stop_id = uuid4()
    vector_id = uuid4()
    stop = SimpleNamespace(id=stop_id, asset_id=uuid4())
    pickup_round = SimpleNamespace(id=uuid4(), trip_id=trip_id, entity_id=entity_id)
    voyage = SimpleNamespace(id=trip_id, vector_id=vector_id, active=True)
    asset = SimpleNamespace(latitude=Decimal("4.00000000"), longitude=Decimal("15.00000000"), centroid_latitude=None, centroid_longitude=None)
    position = SimpleNamespace(
        latitude=4.0005,
        longitude=15.0000,
        recorded_at=datetime.now(timezone.utc),
        source="gps",
    )
    db = FakeDB(
        [
            FakeResult(first=(stop, pickup_round, voyage)),
            FakeResult(scalar_one_or_none=asset),
            FakeResult(scalar_one_or_none=position),
            FakeResult(scalar_one_or_none={"v": 100}),
        ]
    )

    result = await travelwiz_service.assess_pickup_stop_proximity(
        db,
        trip_id=trip_id,
        stop_id=stop_id,
        entity_id=entity_id,
    )

    assert result["distance_meters"] is not None
    assert result["threshold_meters"] == 100
    assert result["can_confirm"] is True


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
async def test_report_pickup_no_show_marks_stop_skipped_and_emits_event(monkeypatch):
    entity_id = uuid4()
    trip_id = uuid4()
    stop_id = uuid4()
    pickup_round_id = uuid4()
    stop = SimpleNamespace(
        id=stop_id,
        pickup_round_id=pickup_round_id,
        status="pending",
        actual_time=None,
        notes=None,
    )
    pickup_round = SimpleNamespace(
        id=pickup_round_id,
        trip_id=trip_id,
        entity_id=entity_id,
        route_name="Camp Nord",
        status="planned",
        actual_departure=None,
        total_pax_picked=0,
    )
    published = []

    async def fake_publish(event):
        published.append(event)

    monkeypatch.setattr(travelwiz_service.event_bus, "publish", fake_publish)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=stop),
            FakeResult(scalar_one_or_none=pickup_round),
            FakeResult(scalar=3),
        ]
    )

    result = await travelwiz_service.report_pickup_no_show(
        db,
        trip_id=trip_id,
        stop_id=stop_id,
        entity_id=entity_id,
        event_data={"missing_pax_count": 2, "notes": "Le chauffeur continue la rotation"},
    )

    assert result["stop_status"] == "skipped"
    assert pickup_round.status == "in_progress"
    assert stop.notes.startswith("No-show signale: 2 absent(s)")
    assert published and published[0].event_type == "travelwiz.pickup.no_show"
    assert published[0].payload["missing_pax_count"] == 2


@pytest.mark.asyncio
async def test_update_pickup_progress_does_not_double_count_round_total(monkeypatch):
    trip_id = uuid4()
    stop_id = uuid4()
    pickup_round_id = uuid4()
    stop = SimpleNamespace(
        id=stop_id,
        pickup_round_id=pickup_round_id,
        pax_picked_up=0,
        actual_time=None,
        status="pending",
        notes=None,
    )
    pickup_round = SimpleNamespace(
        id=pickup_round_id,
        trip_id=trip_id,
        route_name="Camp Nord",
        status="planned",
        actual_departure=None,
        total_pax_picked=0,
    )
    published = []

    async def fake_publish(event):
        published.append(event)

    monkeypatch.setattr(travelwiz_service.event_bus, "publish", fake_publish)
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=stop),
            FakeResult(scalar_one_or_none=pickup_round),
            FakeResult(scalar=4),
        ]
    )

    result = await travelwiz_service.update_pickup_progress(
        db,
        trip_id=trip_id,
        stop_id=stop_id,
        event_data={"pax_picked_up": 4, "notes": "Tous montes"},
    )

    assert pickup_round.total_pax_picked == 4
    assert result["total_pax_picked"] == 4
    assert published and published[0].payload["total_pax_picked"] == 4


@pytest.mark.asyncio
async def test_on_pickup_no_show_notifies_log_base_or_admin(monkeypatch):
    entity_id = uuid4()
    log_base_user_id = uuid4()
    db = FakeDB([FakeResult(all_rows=[(log_base_user_id,)])])
    notifications = []

    async def fake_send_in_app(*args, **kwargs):
        notifications.append(kwargs)

    async def fake_admins(_entity_id):
        return []

    monkeypatch.setattr(travelwiz_handlers, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr("app.core.notifications.send_in_app", fake_send_in_app)
    monkeypatch.setattr("app.event_handlers.core_handlers._get_admin_user_ids", fake_admins)

    await travelwiz_handlers.on_pickup_no_show(
        OpsFluxEvent(
            event_type="travelwiz.pickup.no_show",
            payload={
                "entity_id": str(entity_id),
                "trip_id": str(uuid4()),
                "pickup_round_id": str(uuid4()),
                "stop_id": str(uuid4()),
                "route_name": "Camp Nord",
                "missing_pax_count": 1,
                "notes": "Aucun contact sur zone",
            },
        )
    )

    assert notifications
    assert notifications[0]["title"] == "No-show ramassage"
    assert notifications[0]["category"] == "travelwiz"


@pytest.mark.asyncio
async def test_initiate_back_cargo_requires_type_specific_prerequisites():
    entity_id = uuid4()
    cargo = SimpleNamespace(id=uuid4(), entity_id=entity_id, status="delivered_final", tracking_code="CGO-001")
    db = FakeDB([FakeResult(scalar_one_or_none=cargo)])

    with pytest.raises(ValueError):
        await travelwiz_service.initiate_back_cargo(
            db,
            cargo_item_id=cargo.id,
            entity_id=entity_id,
            user_id=uuid4(),
            return_type="waste",
            notes="Retour site",
            return_metadata={},
        )


@pytest.mark.asyncio
async def test_initiate_back_cargo_persists_structured_metadata():
    entity_id = uuid4()
    user_id = uuid4()
    cargo = SimpleNamespace(id=uuid4(), entity_id=entity_id, status="delivered_final", tracking_code="CGO-002")
    db = FakeDB([FakeResult(scalar_one_or_none=cargo), FakeResult()])

    result = await travelwiz_service.initiate_back_cargo(
        db,
        cargo_item_id=cargo.id,
        entity_id=entity_id,
        user_id=user_id,
        return_type="stock_reintegration",
        notes="Retour magasin",
        return_metadata={
            "inventory_reference": "INV-01",
            "sap_code_confirmed": True,
        },
    )

    assert result["return_metadata"]["inventory_reference"] == "INV-01"
    assert cargo.status == "return_declared"
    persisted_sql, persisted_params = db.executed[1]
    assert "INSERT INTO cargo_returns" in str(persisted_sql)
    assert '"sap_code_confirmed": true' in persisted_params["notes"].lower()


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


@pytest.mark.asyncio
async def test_travelwiz_pickup_reminders_send_once(monkeypatch):
    entity_id = uuid4()
    user_id = uuid4()
    assignment = SimpleNamespace(reminder_sent_at=None)
    stop = SimpleNamespace(
        asset_id=uuid4(),
        scheduled_time=datetime.now(timezone.utc) + timedelta(minutes=4),
        status="pending",
    )
    pickup_round = SimpleNamespace(route_name="Circuit Nord", entity_id=entity_id)
    passenger = SimpleNamespace(user_id=user_id, contact_id=None)
    db = FakeDB(
        [
            FakeResult(all_rows=[(entity_id,)]),
            FakeResult(scalar_one_or_none={"v": 5}),
            FakeResult(all_rows=[(assignment, stop, pickup_round, passenger, "Base Ouest")]),
        ]
    )
    sent_calls = []

    async def fake_send_to_user(*args, **kwargs):
        sent_calls.append(kwargs)
        return True, "sms"

    monkeypatch.setattr(travelwiz_pickup_reminders, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr("app.tasks.jobs.travelwiz_pickup_reminders.send_to_user", fake_send_to_user)

    result = await travelwiz_pickup_reminders.process_travelwiz_pickup_reminders()

    assert result["sent_count"] == 1
    assert assignment.reminder_sent_at is not None
    assert sent_calls and sent_calls[0]["user_id"] == str(user_id)


@pytest.mark.asyncio
async def test_fetch_and_record_weather_for_asset_uses_configured_provider(monkeypatch):
    entity_id = uuid4()
    asset_id = uuid4()
    asset = SimpleNamespace(
        id=asset_id,
        entity_id=entity_id,
        active=True,
        latitude=Decimal("4.788"),
        longitude=Decimal("11.867"),
        centroid_latitude=None,
        centroid_longitude=None,
    )
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=asset),
            FakeResult(scalar_one_or_none={"v": "open_meteo"}),
            FakeResult(all_rows=[SimpleNamespace(key="integration.weather.provider", value={"v": "open_meteo"})]),
        ]
    )
    recorded_payloads = []

    class FakeConnector:
        async def fetch_current_weather(self, *, latitude: float, longitude: float):
            assert latitude == 4.788
            assert longitude == 11.867
            return SimpleNamespace(
                recorded_at=datetime.now(timezone.utc),
                source="api_open_meteo",
                wind_speed_knots=22.5,
                wind_direction_deg=180,
                wave_height_m=None,
                visibility_nm=5.2,
                sea_state=None,
                temperature_c=27.1,
                weather_code="rain",
                flight_conditions="mvfr",
                raw_data={"ok": True},
                notes=None,
            )

    async def fake_record_weather(db_arg, entity_id, data):
        recorded_payloads.append((entity_id, data))
        return {"asset_id": data["asset_id"], "source": data["source"]}

    monkeypatch.setattr("app.services.connectors.weather_connector.create_weather_connector", lambda provider_id, settings: FakeConnector())
    monkeypatch.setattr(travelwiz_service, "record_weather", fake_record_weather)

    result = await travelwiz_service.fetch_and_record_weather_for_asset(
        db,
        entity_id=entity_id,
        asset_id=asset_id,
    )

    assert result["source"] == "api_open_meteo"
    assert recorded_payloads and recorded_payloads[0][1]["weather_code"] == "rain"


@pytest.mark.asyncio
async def test_travelwiz_weather_sync_fetches_missing_observations(monkeypatch):
    entity_id = uuid4()
    asset_id = uuid4()
    db = FakeDB(
        [
            FakeResult(all_rows=[(entity_id, asset_id)]),
            FakeResult(scalar_one_or_none=None),
        ]
    )
    fetched = []

    async def fake_fetch_and_record_weather_for_asset(db_arg, *, entity_id, asset_id):
        fetched.append((entity_id, asset_id))
        return {"asset_id": asset_id}

    async def fake_get_weather_sync_interval_minutes(db_arg, *, entity_id):
        return 30

    monkeypatch.setattr(travelwiz_weather_sync, "async_session_factory", lambda: FakeAsyncSessionContext(db))
    monkeypatch.setattr(travelwiz_weather_sync, "fetch_and_record_weather_for_asset", fake_fetch_and_record_weather_for_asset)
    monkeypatch.setattr(travelwiz_weather_sync, "get_weather_sync_interval_minutes", fake_get_weather_sync_interval_minutes)

    result = await travelwiz_weather_sync.process_travelwiz_weather_sync()

    assert result == {"fetched": 1, "skipped_recent": 0, "failed": 0}
    assert fetched == [(entity_id, asset_id)]


def test_validate_travelwiz_numeric_settings():
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.delay_reassign_threshold_hours", 4))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.weight_alert_ratio", 0.9))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.weather_sync_interval_minutes", 15))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.captain_session_minutes", 30))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.driver_session_minutes", 30))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.pickup_sms_lead_minutes", 5))
    settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.pickup_confirm_radius_meters", 100))

    with pytest.raises(HTTPException):
        settings_routes._validate_travelwiz_numeric_setting(_body("travelwiz.weight_alert_ratio", 2))


def test_normalize_article_csv_row_supports_aliases_and_types():
    normalized = travelwiz_routes._normalize_article_csv_row(
        {
            "sap_code": "SAP-001",
            "description": " Pompe Hydraulique ",
            "unit": "EA",
            "management_type": "stock",
            "is_hazmat": "oui",
            "unit_weight_kg": "12,5",
        },
        2,
    )

    assert normalized["sap_code"] == "SAP-001"
    assert normalized["description_fr"] == "Pompe Hydraulique"
    assert normalized["description_normalized"] == "pompe hydraulique"
    assert normalized["unit_of_measure"] == "EA"
    assert normalized["is_hazmat"] is True
    assert normalized["unit_weight_kg"] == 12.5


@pytest.mark.asyncio
async def test_import_articles_csv_creates_and_updates_rows():
    entity_id = uuid4()
    db = FakeDB(
        [
            FakeResult(scalar_one_or_none=None),
            FakeResult(),
            FakeResult(scalar_one_or_none=uuid4()),
            FakeResult(),
        ]
    )
    upload = UploadFile(
        filename="articles.csv",
        file=BytesIO(
            "\n".join(
                [
                    "sap_code,description,management_type,unit,is_hazmat",
                    "SAP-001,Pompe,stock,EA,false",
                    "SAP-002,Vanne,consumable,EA,true",
                ]
            ).encode("utf-8")
        ),
    )

    result = await travelwiz_routes.import_articles_csv(
        file=upload,
        entity_id=entity_id,
        _=None,
        db=db,
    )

    assert result["status"] == "completed"
    assert result["imported"] == 1
    assert result["updated"] == 1
    assert result["errors"] == []
    assert result["total_rows"] == 2
    assert db.commits == 1
    assert len(db.executed) == 4


@pytest.mark.asyncio
async def test_import_articles_csv_collects_validation_errors():
    entity_id = uuid4()
    db = FakeDB([])
    upload = UploadFile(
        filename="articles.csv",
        file=BytesIO(
            "\n".join(
                [
                    "sap_code,description",
                    ",Article sans code",
                    "SAP-003,",
                ]
            ).encode("utf-8")
        ),
    )

    result = await travelwiz_routes.import_articles_csv(
        file=upload,
        entity_id=entity_id,
        _=None,
        db=db,
    )

    assert result["imported"] == 0
    assert result["updated"] == 0
    assert len(result["errors"]) == 2
    assert db.commits == 1
