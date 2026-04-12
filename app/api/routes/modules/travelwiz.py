"""TravelWiz (transport logistics) module routes — vectors, voyages, manifests,
cargo, rotations, captain logs, capacity checks.

Integrates with:
- PaxLog: emits travelwiz.manifest.closed event for AdS auto-close
- Workflow Engine: FSM service manages voyage status transitions (D-014)
"""

import csv
import io
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func as sqla_func
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_module_enabled,
    require_permission,
)
from app.api.routes.modules import packlog_shared as packlog_shared_module
from app.api.routes.modules.packlog_shared import (
    add_package_element_impl,
    apply_cargo_request_loading_option_impl,
    create_cargo_impl,
    create_cargo_request_impl,
    download_cargo_request_lt_pdf_impl,
    get_cargo_history_impl,
    get_cargo_impl,
    get_cargo_request_impl,
    get_cargo_request_loading_options_impl,
    initiate_return_impl,
    list_cargo_attachment_evidence_impl,
    list_cargo_impl,
    list_cargo_requests_impl,
    list_package_elements_impl,
    receive_cargo_impl,
    set_cargo_attachment_evidence_type_impl,
    update_cargo_impl,
    update_cargo_request_impl,
    update_cargo_status_impl,
    update_cargo_workflow_status_impl,
    update_package_element_disposition_impl,
    update_package_element_return_impl,
)
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import Installation
from app.models.common import AuditLog, ImputationReference, TierContact, User
from app.models.packlog import (
    CargoItem,
    CargoRequest,
    PackageElement,
)
from app.models.travelwiz import (
    CaptainLog,
    ManifestPassenger,
    PickupRound,
    PickupStop,
    PickupStopAssignment,
    TransportRotation,
    TransportVector,
    TransportVectorZone,
    Voyage,
    VoyageManifest,
    VoyageStop,
    WeatherData,
)
from app.schemas.common import PaginatedResponse
from app.schemas.packlog import (
    BackCargoReturnRequest,
    CargoAttachmentEvidenceRead,
    CargoAttachmentEvidenceUpdate,
    CargoCreate,
    CargoLoadingOptionRead,
    CargoRead,
    CargoReceiptConfirm,
    CargoRequestCreate,
    CargoRequestRead,
    CargoRequestUpdate,
    CargoStatusUpdate,
    CargoTrackingRead,
    CargoUpdate,
    CargoWorkflowStatusUpdate,
    PackageElementDispositionUpdate,
    PackageElementReturnUpdate,
    VoyageCargoTrackingRead,
)
from app.schemas.travelwiz import (
    CapacityCheckResult,
    CaptainLogCreate,
    CaptainLogRead,
    ManifestCreate,
    ManifestRead,
    PassengerCreate,
    PassengerRead,
    PassengerUpdate,
    PickupNoShowReport,
    PickupProgressUpdate,
    PickupRoundCreate,
    RotationCreate,
    RotationRead,
    RotationUpdate,
    VectorCreate,
    VectorRead,
    VectorUpdate,
    VectorZoneCreate,
    VectorZoneRead,
    VectorZoneUpdate,
    VoyageCreate,
    VoyageRead,
    VoyageReassignRequest,
    VoyageStatusUpdate,
    VoyageStopCreate,
    VoyageStopRead,
    VoyageStopUpdate,
    VoyageUpdate,
)
from app.services.core.delete_service import delete_entity
from app.services.core.fsm_service import FSMError, fsm_service
from app.services.modules.packlog_service import (
    PACKLOG_PUBLIC_STATUS_LABELS,
    PACKLOG_WORKFLOW_ENTITY_TYPE,
    PACKLOG_WORKFLOW_SLUG,
    build_packlog_cargo_read_data,
    build_packlog_loading_options,
    build_packlog_operations_report,
    build_packlog_request_read_data,
    get_packlog_cargo_or_404,
    get_packlog_package_element_or_404,
    get_packlog_request_or_404,
    try_packlog_workflow_transition,
)
from app.services.modules.packlog_service import (
    update_cargo_status as apply_cargo_status_transition,
)
from app.services.modules.travelwiz_service import (
    assess_manifest_weight,
    assess_voyage_delay,
    get_weight_alert_ratio,
    reassign_voyage_passengers,
    rebalance_manifest_passenger_standby,
)

router = APIRouter(prefix="/api/v1/travelwiz", tags=["travelwiz"], dependencies=[require_module_enabled("travelwiz")])
logger = logging.getLogger(__name__)

VOYAGE_WORKFLOW_SLUG = "voyage-workflow"
VOYAGE_ENTITY_TYPE = "voyage"
CARGO_WORKFLOW_SLUG = PACKLOG_WORKFLOW_SLUG
CARGO_WORKFLOW_ENTITY_TYPE = PACKLOG_WORKFLOW_ENTITY_TYPE

CARGO_PUBLIC_STATUS_LABELS = PACKLOG_PUBLIC_STATUS_LABELS

VOYAGE_PUBLIC_STATUS_LABELS = {
    "draft": "Brouillon",
    "planned": "Planifié",
    "confirmed": "Confirmé",
    "boarding": "Embarquement",
    "in_progress": "En cours",
    "completed": "Terminé",
    "closed": "Clôturé",
    "delayed": "Retardé",
    "cancelled": "Annulé",
}


# ── Helpers ───────────────────────────────────────────────────────────────

# Legacy private helper aliases kept for internal tests and migration
# compatibility. Product/public cargo access now lives under PackLog.
_get_cargo_or_404 = get_packlog_cargo_or_404
_get_package_element_or_404 = get_packlog_package_element_or_404
_get_cargo_request_or_404 = get_packlog_request_or_404
_try_cargo_workflow_transition = try_packlog_workflow_transition
_build_cargo_read_data = build_packlog_cargo_read_data
_build_cargo_request_read_data = build_packlog_request_read_data
_build_cargo_loading_options = build_packlog_loading_options


async def _travelwiz_shared_get_cargo_or_404(*args, **kwargs):
    return await _get_cargo_or_404(*args, **kwargs)


async def _travelwiz_shared_get_package_element_or_404(*args, **kwargs):
    return await _get_package_element_or_404(*args, **kwargs)


async def _travelwiz_shared_get_cargo_request_or_404(*args, **kwargs):
    return await _get_cargo_request_or_404(*args, **kwargs)


async def _travelwiz_shared_get_voyage_or_404(*args, **kwargs):
    return await _get_voyage_or_404(*args, **kwargs)


async def _travelwiz_shared_try_cargo_workflow_transition(*args, **kwargs):
    return await _try_cargo_workflow_transition(*args, **kwargs)


async def _travelwiz_shared_build_cargo_read_data(*args, **kwargs):
    return await _build_cargo_read_data(*args, **kwargs)


async def _travelwiz_shared_build_cargo_request_read_data(*args, **kwargs):
    return await _build_cargo_request_read_data(*args, **kwargs)


async def _travelwiz_shared_build_cargo_loading_options(*args, **kwargs):
    return await _build_cargo_loading_options(*args, **kwargs)


async def _travelwiz_shared_generate_cargo_request_code(*args, **kwargs):
    return await _generate_cargo_request_code(*args, **kwargs)


async def _travelwiz_shared_record_audit(*args, **kwargs):
    return await record_audit(*args, **kwargs)


async def _travelwiz_shared_apply_cargo_status_transition(*args, **kwargs):
    return await apply_cargo_status_transition(*args, **kwargs)


packlog_shared_module.get_packlog_cargo_or_404 = _travelwiz_shared_get_cargo_or_404
packlog_shared_module.get_packlog_package_element_or_404 = _travelwiz_shared_get_package_element_or_404
packlog_shared_module.get_packlog_request_or_404 = _travelwiz_shared_get_cargo_request_or_404
packlog_shared_module._get_voyage_or_404 = _travelwiz_shared_get_voyage_or_404
packlog_shared_module.try_packlog_workflow_transition = _travelwiz_shared_try_cargo_workflow_transition
packlog_shared_module.build_packlog_cargo_read_data = _travelwiz_shared_build_cargo_read_data
packlog_shared_module.build_packlog_request_read_data = _travelwiz_shared_build_cargo_request_read_data
packlog_shared_module.build_packlog_loading_options = _travelwiz_shared_build_cargo_loading_options
packlog_shared_module._generate_cargo_request_code = _travelwiz_shared_generate_cargo_request_code
packlog_shared_module.record_audit = _travelwiz_shared_record_audit
packlog_shared_module.apply_cargo_status_transition = _travelwiz_shared_apply_cargo_status_transition


def _normalize_article_description(description: str) -> str:
    return " ".join(description.strip().lower().split())


def _serialize_package_element(element: PackageElement) -> dict:
    quantity_sent = getattr(element, "quantity_sent", None)
    quantity_returned = getattr(element, "quantity_returned", None)
    quantity_value = float(quantity_sent) if quantity_sent is not None else 0.0
    if quantity_value.is_integer():
        quantity_value = int(quantity_value)
    returned_value = float(quantity_returned) if quantity_returned is not None else 0.0
    if returned_value.is_integer():
        returned_value = int(returned_value)

    return {
        "id": element.id,
        "cargo_item_id": element.package_id,
        "description": element.description,
        "quantity": quantity_value,
        "quantity_returned": returned_value,
        "weight_kg": float(element.unit_weight_kg) if element.unit_weight_kg is not None else None,
        "sap_code": element.sap_code,
        "return_status": getattr(element, "return_status", "pending"),
        "return_notes": getattr(element, "return_notes", None),
        "created_at": (
            element.created_at.isoformat()
            if getattr(element, "created_at", None) is not None
            else datetime.now(UTC).isoformat()
        ),
    }


def _serialize_cargo_history_entry(entry: AuditLog, actor_name: str | None) -> dict:
    details = entry.details or {}
    return {
        "id": str(entry.id),
        "action": entry.action,
        "created_at": entry.created_at.isoformat(),
        "actor_id": str(entry.user_id) if entry.user_id else None,
        "actor_name": actor_name,
        "details": details,
    }


def _build_public_cargo_tracking_event(entry: AuditLog) -> dict:
    details = entry.details or {}
    if entry.action in {"travelwiz.cargo.create", "packlog.cargo.create"}:
        label = "Expédition enregistrée"
        description = details.get("cargo_type")
    elif entry.action in {"travelwiz.cargo.status", "packlog.cargo.status"}:
        next_status = details.get("to_status")
        label = CARGO_PUBLIC_STATUS_LABELS.get(str(next_status), "Statut mis à jour")
        description = details.get("damage_notes")
    elif entry.action in {"travelwiz.cargo.receive", "packlog.cargo.receive"}:
        label = "Réception confirmée"
        description = None
    elif entry.action in {"travelwiz.cargo.update", "packlog.cargo.update"}:
        label = "Informations mises à jour"
        changed = details.get("changes")
        if isinstance(changed, dict) and changed:
            description = ", ".join(changed.keys())
        else:
            description = None
    else:
        label = entry.action
        description = None

    return {
        "code": entry.action,
        "label": label,
        "occurred_at": entry.created_at,
        "description": description,
    }


def _parse_csv_bool(value: str | None) -> bool:
    if value is None:
        return False
    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "y", "oui", "o"}


def _parse_csv_decimal(value: str | None) -> float | None:
    if value is None:
        return None
    normalized = value.strip().replace(",", ".")
    if not normalized:
        return None
    return float(normalized)


def _normalize_article_csv_row(row: dict[str, str], line_number: int) -> dict:
    sap_code = (row.get("sap_code") or "").strip()
    description_fr = (row.get("description_fr") or row.get("description") or "").strip()
    if not sap_code:
        raise ValueError(f"Ligne {line_number}: sap_code requis")
    if not description_fr:
        raise ValueError(f"Ligne {line_number}: description requise")

    return {
        "sap_code": sap_code,
        "internal_code": (row.get("internal_code") or "").strip() or None,
        "description_fr": description_fr,
        "description_en": (row.get("description_en") or "").strip() or None,
        "description_normalized": _normalize_article_description(description_fr),
        "management_type": (row.get("management_type") or "standard").strip() or "standard",
        "unit_of_measure": (row.get("unit_of_measure") or row.get("unit") or "").strip() or None,
        "packaging_type": (row.get("packaging_type") or "").strip() or None,
        "is_hazmat": _parse_csv_bool(row.get("is_hazmat")),
        "hazmat_class": (row.get("hazmat_class") or "").strip() or None,
        "unit_weight_kg": _parse_csv_decimal(row.get("unit_weight_kg")),
        "active": _parse_csv_bool(row.get("active")) if "active" in row else True,
    }


async def _get_vector_or_404(db: AsyncSession, vector_id: UUID, entity_id: UUID) -> TransportVector:
    result = await db.execute(
        select(TransportVector).where(
            TransportVector.id == vector_id,
            TransportVector.entity_id == entity_id,
            TransportVector.active == True,  # noqa: E712
        )
    )
    vector = result.scalars().first()
    if not vector:
        raise HTTPException(404, "Vector not found")
    return vector


async def _get_voyage_or_404(db: AsyncSession, voyage_id: UUID, entity_id: UUID) -> Voyage:
    result = await db.execute(
        select(Voyage).where(
            Voyage.id == voyage_id,
            Voyage.entity_id == entity_id,
            Voyage.active == True,  # noqa: E712
        )
    )
    voyage = result.scalars().first()
    if not voyage:
        raise HTTPException(404, "Voyage not found")
    return voyage


async def _validate_cargo_dossier_refs(
    db: AsyncSession,
    *,
    entity_id: UUID,
    payload: CargoCreate | CargoUpdate,
) -> None:
    if getattr(payload, "request_id", None):
        cargo_request = await db.get(CargoRequest, payload.request_id)
        if not cargo_request or cargo_request.entity_id != entity_id or not cargo_request.active:
            raise HTTPException(400, "Demande d'expedition introuvable ou inactive")
    if payload.imputation_reference_id:
        imputation = await db.get(ImputationReference, payload.imputation_reference_id)
        if not imputation or imputation.entity_id != entity_id or not imputation.active:
            raise HTTPException(400, "Imputation introuvable ou inactive")
    if payload.pickup_contact_user_id:
        pickup_user = await db.get(User, payload.pickup_contact_user_id)
        if not pickup_user or not pickup_user.active:
            raise HTTPException(400, "Utilisateur d'enlevement introuvable ou inactif")
    if payload.pickup_contact_tier_contact_id:
        pickup_contact = await db.get(TierContact, payload.pickup_contact_tier_contact_id)
        if not pickup_contact or not pickup_contact.active:
            raise HTTPException(400, "Contact d'enlevement introuvable ou inactif")
    if getattr(payload, "planned_zone_id", None):
        zone = await db.get(TransportVectorZone, payload.planned_zone_id)
        if not zone or not zone.active:
            raise HTTPException(400, "Zone de chargement introuvable ou inactive")
        manifest_id = getattr(payload, "manifest_id", None)
        if manifest_id:
            manifest = await db.get(VoyageManifest, manifest_id)
            if not manifest:
                raise HTTPException(400, "Manifeste introuvable pour la zone de chargement")
            voyage = await db.get(Voyage, manifest.voyage_id)
            if not voyage or zone.vector_id != voyage.vector_id:
                raise HTTPException(400, "La zone de chargement ne correspond pas au vecteur du manifeste")


def _format_pdf_datetime(value: datetime | None) -> str:
    if value is None:
        return "--"
    return value.astimezone(UTC).strftime("%d/%m/%Y %H:%M UTC")


async def _get_entity_pdf_context(db: AsyncSession, entity_id: UUID) -> dict:
    row = (
        await db.execute(
            text("SELECT name, code FROM entities WHERE id = :eid"),
            {"eid": entity_id},
        )
    ).first()
    return {
        "name": row[0] if row else "OpsFlux",
        "code": row[1] if row and len(row) > 1 else None,
    }


async def _build_voyage_pdf_base_context(
    db: AsyncSession,
    *,
    voyage: Voyage,
    entity_id: UUID,
) -> dict:
    entity = await _get_entity_pdf_context(db, entity_id)
    vector = await db.get(TransportVector, voyage.vector_id) if voyage.vector_id else None
    departure_base = await db.get(Installation, voyage.departure_base_id) if voyage.departure_base_id else None
    stops = (
        (
            await db.execute(
                select(VoyageStop)
                .where(VoyageStop.voyage_id == voyage.id, VoyageStop.active == True)  # noqa: E712
                .order_by(VoyageStop.stop_order.asc())
            )
        )
        .scalars()
        .all()
    )
    arrival_location = departure_base.name if departure_base else "--"
    if stops:
        final_stop = await db.get(Installation, stops[-1].asset_id)
        arrival_location = final_stop.name if final_stop else arrival_location
    return {
        "entity": entity,
        "voyage_number": voyage.code,
        "transport_type": vector.type if vector else "--",
        "carrier": vector.name if vector else "--",
        "departure_date": _format_pdf_datetime(voyage.scheduled_departure),
        "departure_location": departure_base.name if departure_base else "--",
        "arrival_location": arrival_location,
        "generated_at": _format_pdf_datetime(datetime.now(UTC)),
    }


async def _build_voyage_pax_manifest_variables(
    db: AsyncSession,
    *,
    voyage: Voyage,
    entity_id: UUID,
) -> dict:
    variables = await _build_voyage_pdf_base_context(db, voyage=voyage, entity_id=entity_id)
    passengers = (
        (
            await db.execute(
                select(ManifestPassenger)
                .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
                .where(
                    VoyageManifest.voyage_id == voyage.id,
                    VoyageManifest.manifest_type == "pax",
                    VoyageManifest.active == True,  # noqa: E712
                    ManifestPassenger.active == True,  # noqa: E712
                )
                .order_by(ManifestPassenger.name.asc())
            )
        )
        .scalars()
        .all()
    )
    vector = await db.get(TransportVector, voyage.vector_id) if voyage.vector_id else None
    variables.update(
        {
            "passengers": [
                {
                    "name": passenger.name,
                    "company": passenger.company,
                    "badge_number": "--",
                    "compliance_status": "Standby" if passenger.standby else passenger.boarding_status,
                }
                for passenger in passengers
            ],
            "total_passengers": len(passengers),
            "max_capacity": vector.pax_capacity if vector else None,
        }
    )
    return variables


async def _build_voyage_cargo_manifest_variables(
    db: AsyncSession,
    *,
    voyage: Voyage,
    entity_id: UUID,
) -> dict:
    variables = await _build_voyage_pdf_base_context(db, voyage=voyage, entity_id=entity_id)
    cargo_rows = (
        await db.execute(
            select(
                CargoItem,
                CargoRequest.request_code.label("request_code"),
                Installation.name.label("destination_name"),
            )
            .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
            .outerjoin(CargoRequest, CargoItem.request_id == CargoRequest.id)
            .outerjoin(Installation, CargoItem.destination_asset_id == Installation.id)
            .where(
                VoyageManifest.voyage_id == voyage.id,
                VoyageManifest.manifest_type == "cargo",
                VoyageManifest.active == True,  # noqa: E712
                CargoItem.active == True,  # noqa: E712
            )
            .order_by(CargoItem.created_at.asc())
        )
    ).all()
    cargo_items = []
    total_weight = 0.0
    total_packages = 0
    for cargo, request_code, destination_name in cargo_rows:
        weight_value = float(cargo.weight_kg or 0)
        package_count = int(cargo.package_count or 0)
        total_weight += weight_value
        total_packages += package_count
        cargo_items.append(
            {
                "tracking_code": cargo.tracking_code,
                "request_code": request_code,
                "designation": cargo.designation,
                "description": cargo.description,
                "destination_name": destination_name,
                "receiver_name": cargo.receiver_name,
                "weight_kg": round(weight_value, 2),
                "package_count": package_count,
                "status": cargo.status,
                "status_label": CARGO_PUBLIC_STATUS_LABELS.get(cargo.status, cargo.status),
            }
        )
    variables.update(
        {
            "cargo_items": cargo_items,
            "total_cargo_items": len(cargo_items),
            "total_weight_kg": round(total_weight, 2),
            "total_packages": total_packages,
        }
    )
    return variables


async def _generate_voyage_code(db: AsyncSession, entity_id: UUID) -> str:
    """Generate next voyage code: VYG-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("VYG", db, entity_id=entity_id)


async def _generate_cargo_code(db: AsyncSession, entity_id: UUID) -> str:
    """Generate next cargo tracking code: CGO-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("CGO", db, entity_id=entity_id)


async def _generate_cargo_request_code(db: AsyncSession, entity_id: UUID) -> str:
    from app.core.references import generate_reference

    return await generate_reference("CGR", db, entity_id=entity_id)


async def _require_captain_session(
    voyage_id: UUID,
    db: AsyncSession,
    x_captain_session: str | None,
) -> dict:
    if not x_captain_session:
        raise HTTPException(401, "Captain session required")
    from app.services.modules.travelwiz_service import verify_captain_session_token as _verify

    try:
        return await _verify(
            db,
            session_token=x_captain_session,
            voyage_id=voyage_id,
        )
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc


async def _require_driver_session(
    voyage_id: UUID,
    db: AsyncSession,
    x_driver_session: str | None,
) -> dict:
    if not x_driver_session:
        raise HTTPException(401, "Driver session required")
    from app.services.modules.travelwiz_service import verify_driver_session_token as _verify

    try:
        return await _verify(
            db,
            session_token=x_driver_session,
            voyage_id=voyage_id,
        )
    except ValueError as exc:
        raise HTTPException(401, str(exc)) from exc


# ══════════════════════════════════════════════════════════════════════════════
# VECTORS CRUD
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/vectors", response_model=PaginatedResponse[VectorRead])
async def list_vectors(
    type: str | None = None,
    mode: str | None = None,
    active_only: bool = True,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    zone_count_sq = (
        select(
            TransportVectorZone.vector_id,
            sqla_func.count(TransportVectorZone.id).label("zone_count"),
        )
        .where(TransportVectorZone.active == True)
        .group_by(TransportVectorZone.vector_id)
        .subquery()
    )
    voyage_count_sq = (
        select(
            Voyage.vector_id,
            sqla_func.count(Voyage.id).label("voyage_count"),
        )
        .where(Voyage.active == True)
        .group_by(Voyage.vector_id)
        .subquery()
    )

    query = (
        select(
            TransportVector,
            sqla_func.coalesce(zone_count_sq.c.zone_count, 0).label("zone_count"),
            sqla_func.coalesce(voyage_count_sq.c.voyage_count, 0).label("voyage_count"),
            Installation.name.label("home_base_name"),
        )
        .outerjoin(zone_count_sq, TransportVector.id == zone_count_sq.c.vector_id)
        .outerjoin(voyage_count_sq, TransportVector.id == voyage_count_sq.c.vector_id)
        .outerjoin(Installation, TransportVector.home_base_id == Installation.id)
        .where(TransportVector.entity_id == entity_id, TransportVector.active == True)  # noqa: E712
    )

    if type:
        query = query.where(TransportVector.type == type)
    if mode:
        query = query.where(TransportVector.mode == mode)
    if active_only:
        query = query.where(TransportVector.active == True)
    if search:
        like = f"%{search}%"
        query = query.where(TransportVector.name.ilike(like) | TransportVector.registration.ilike(like))
    query = query.order_by(TransportVector.name)

    def _transform(row):
        vec = row[0]
        d = {c.key: getattr(vec, c.key) for c in vec.__table__.columns}
        d["zone_count"] = row[1]
        d["voyage_count"] = row[2]
        d["home_base_name"] = row[3]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/vectors", response_model=VectorRead, status_code=201)
async def create_vector(
    body: VectorCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.vector.create"),
    db: AsyncSession = Depends(get_db),
):
    vector = TransportVector(entity_id=entity_id, **body.model_dump())
    db.add(vector)
    await db.commit()
    await db.refresh(vector)
    d = {c.key: getattr(vector, c.key) for c in vector.__table__.columns}
    d["home_base_name"] = None
    d["zone_count"] = 0
    d["voyage_count"] = 0
    return d


@router.get("/vectors/{vector_id}", response_model=VectorRead)
async def get_vector(
    vector_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vector = await _get_vector_or_404(db, vector_id, entity_id)
    d = {c.key: getattr(vector, c.key) for c in vector.__table__.columns}
    # Counts
    zc = await db.execute(
        select(sqla_func.count())
        .select_from(TransportVectorZone)
        .where(TransportVectorZone.vector_id == vector_id, TransportVectorZone.active == True)
    )
    vc = await db.execute(
        select(sqla_func.count()).select_from(Voyage).where(Voyage.vector_id == vector_id, Voyage.active == True)
    )
    d["zone_count"] = zc.scalar() or 0
    d["voyage_count"] = vc.scalar() or 0
    # Home base name
    if vector.home_base_id:
        asset = await db.get(Installation, vector.home_base_id)
        d["home_base_name"] = asset.name if asset else None
    else:
        d["home_base_name"] = None
    return d


@router.patch("/vectors/{vector_id}", response_model=VectorRead)
async def update_vector(
    vector_id: UUID,
    body: VectorUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.vector.update"),
    db: AsyncSession = Depends(get_db),
):
    vector = await _get_vector_or_404(db, vector_id, entity_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vector, field, value)
    await db.commit()
    await db.refresh(vector)
    d = {c.key: getattr(vector, c.key) for c in vector.__table__.columns}
    d["home_base_name"] = None
    d["zone_count"] = 0
    d["voyage_count"] = 0
    return d


@router.delete("/vectors/{vector_id}")
async def archive_vector(
    vector_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.vector.delete"),
    db: AsyncSession = Depends(get_db),
):
    vector = await _get_vector_or_404(db, vector_id, entity_id)
    await delete_entity(vector, db, "transport_vector", entity_id=vector.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Vector archived"}


# ── Vector Zones ─────────────────────────────────────────────────────────


@router.get("/vectors/{vector_id}/zones", response_model=list[VectorZoneRead])
async def list_vector_zones(
    vector_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_vector_or_404(db, vector_id, entity_id)
    result = await db.execute(
        select(TransportVectorZone)
        .where(TransportVectorZone.vector_id == vector_id, TransportVectorZone.active == True)
        .order_by(TransportVectorZone.name)
    )
    return result.scalars().all()


@router.post("/vectors/{vector_id}/zones", response_model=VectorZoneRead, status_code=201)
async def create_vector_zone(
    vector_id: UUID,
    body: VectorZoneCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.deck.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_vector_or_404(db, vector_id, entity_id)
    zone = TransportVectorZone(vector_id=vector_id, **body.model_dump())
    db.add(zone)
    await db.commit()
    await db.refresh(zone)
    return zone


@router.patch("/vectors/{vector_id}/zones/{zone_id}", response_model=VectorZoneRead)
async def update_vector_zone(
    vector_id: UUID,
    zone_id: UUID,
    body: VectorZoneUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.deck.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_vector_or_404(db, vector_id, entity_id)
    result = await db.execute(
        select(TransportVectorZone).where(TransportVectorZone.id == zone_id, TransportVectorZone.vector_id == vector_id)
    )
    zone = result.scalars().first()
    if not zone:
        raise HTTPException(404, "Zone not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(zone, field, value)
    await db.commit()
    await db.refresh(zone)
    return zone


@router.delete("/vectors/{vector_id}/zones/{zone_id}")
async def delete_vector_zone(
    vector_id: UUID,
    zone_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.deck.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_vector_or_404(db, vector_id, entity_id)
    result = await db.execute(
        select(TransportVectorZone).where(TransportVectorZone.id == zone_id, TransportVectorZone.vector_id == vector_id)
    )
    zone = result.scalars().first()
    if not zone:
        raise HTTPException(404, "Zone not found")
    await delete_entity(zone, db, "transport_vector_zone", entity_id=zone.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Zone deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# ROTATIONS CRUD
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/rotations", response_model=PaginatedResponse[RotationRead])
async def list_rotations(
    vector_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(
            TransportRotation,
            TransportVector.name.label("vector_name"),
            Installation.name.label("departure_base_name"),
        )
        .outerjoin(TransportVector, TransportRotation.vector_id == TransportVector.id)
        .outerjoin(Installation, TransportRotation.departure_base_id == Installation.id)
        .where(TransportRotation.entity_id == entity_id, TransportRotation.active == True)
    )
    if vector_id:
        query = query.where(TransportRotation.vector_id == vector_id)
    if search:
        query = query.where(TransportRotation.name.ilike(f"%{search}%"))
    query = query.order_by(TransportRotation.name)

    def _transform(row):
        rot = row[0]
        d = {c.key: getattr(rot, c.key) for c in rot.__table__.columns}
        d["vector_name"] = row[1]
        d["departure_base_name"] = row[2]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/rotations", response_model=RotationRead, status_code=201)
async def create_rotation(
    body: RotationCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.create"),
    db: AsyncSession = Depends(get_db),
):
    rotation = TransportRotation(entity_id=entity_id, **body.model_dump())
    db.add(rotation)
    await db.commit()
    await db.refresh(rotation)
    d = {c.key: getattr(rotation, c.key) for c in rotation.__table__.columns}
    d["vector_name"] = None
    d["departure_base_name"] = None
    return d


@router.patch("/rotations/{rotation_id}", response_model=RotationRead)
async def update_rotation(
    rotation_id: UUID,
    body: RotationUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TransportRotation).where(TransportRotation.id == rotation_id, TransportRotation.entity_id == entity_id)
    )
    rotation = result.scalars().first()
    if not rotation:
        raise HTTPException(404, "Rotation not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rotation, field, value)
    await db.commit()
    await db.refresh(rotation)
    d = {c.key: getattr(rotation, c.key) for c in rotation.__table__.columns}
    d["vector_name"] = None
    d["departure_base_name"] = None
    return d


# ══════════════════════════════════════════════════════════════════════════════
# VOYAGES CRUD
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/voyages", response_model=PaginatedResponse[VoyageRead])
async def list_voyages(
    vector_id: UUID | None = None,
    status: str | None = None,
    departure_base_id: UUID | None = None,
    search: str | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stop_count_sq = (
        select(
            VoyageStop.voyage_id,
            sqla_func.count(VoyageStop.id).label("stop_count"),
        )
        .where(VoyageStop.active == True)
        .group_by(VoyageStop.voyage_id)
        .subquery()
    )

    # Count PAX per voyage through manifests
    pax_count_sq = (
        select(
            VoyageManifest.voyage_id,
            sqla_func.count(ManifestPassenger.id).label("pax_count"),
        )
        .join(ManifestPassenger, VoyageManifest.id == ManifestPassenger.manifest_id)
        .where(VoyageManifest.active == True, ManifestPassenger.active == True)
        .group_by(VoyageManifest.voyage_id)
        .subquery()
    )

    # Count cargo per voyage through manifests
    cargo_count_sq = (
        select(
            VoyageManifest.voyage_id,
            sqla_func.count(CargoItem.id).label("cargo_count"),
        )
        .join(CargoItem, VoyageManifest.id == CargoItem.manifest_id)
        .where(VoyageManifest.active == True, CargoItem.active == True)
        .group_by(VoyageManifest.voyage_id)
        .subquery()
    )

    query = (
        select(
            Voyage,
            TransportVector.name.label("vector_name"),
            TransportVector.type.label("vector_type"),
            Installation.name.label("departure_base_name"),
            sqla_func.coalesce(stop_count_sq.c.stop_count, 0).label("stop_count"),
            sqla_func.coalesce(pax_count_sq.c.pax_count, 0).label("pax_count"),
            sqla_func.coalesce(cargo_count_sq.c.cargo_count, 0).label("cargo_count"),
        )
        .outerjoin(TransportVector, Voyage.vector_id == TransportVector.id)
        .outerjoin(Installation, Voyage.departure_base_id == Installation.id)
        .outerjoin(stop_count_sq, Voyage.id == stop_count_sq.c.voyage_id)
        .outerjoin(pax_count_sq, Voyage.id == pax_count_sq.c.voyage_id)
        .outerjoin(cargo_count_sq, Voyage.id == cargo_count_sq.c.voyage_id)
        .where(Voyage.entity_id == entity_id, Voyage.active == True)  # noqa: E712
    )

    # ── User-scoped data visibility ──
    if scope == "my":
        query = query.where(Voyage.created_by == current_user.id)
    elif scope != "all":
        # Auto-detect: users without read_all only see their own voyages
        can_read_all = await has_user_permission(current_user, entity_id, "travelwiz.voyage.read_all", db)
        if not can_read_all:
            query = query.where(Voyage.created_by == current_user.id)

    if vector_id:
        query = query.where(Voyage.vector_id == vector_id)
    if status:
        query = query.where(Voyage.status == status)
    if departure_base_id:
        query = query.where(Voyage.departure_base_id == departure_base_id)
    if search:
        like = f"%{search}%"
        query = query.where(Voyage.code.ilike(like))
    query = query.order_by(Voyage.scheduled_departure.desc())

    def _transform(row):
        vyg = row[0]
        d = {c.key: getattr(vyg, c.key) for c in vyg.__table__.columns}
        d["vector_name"] = row[1]
        d["vector_type"] = row[2]
        d["departure_base_name"] = row[3]
        d["stop_count"] = row[4]
        d["pax_count"] = row[5]
        d["cargo_count"] = row[6]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/voyages", response_model=VoyageRead, status_code=201)
async def create_voyage(
    body: VoyageCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.voyage.create"),
    db: AsyncSession = Depends(get_db),
):
    code = await _generate_voyage_code(db, entity_id)
    voyage = Voyage(
        entity_id=entity_id,
        code=code,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(voyage)
    await db.commit()
    await db.refresh(voyage)
    d = {c.key: getattr(voyage, c.key) for c in voyage.__table__.columns}
    d["vector_name"] = None
    d["vector_type"] = None
    d["departure_base_name"] = None
    d["stop_count"] = 0
    d["pax_count"] = 0
    d["cargo_count"] = 0
    return d


@router.get("/voyages/{voyage_id}", response_model=VoyageRead)
async def get_voyage(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    d = {c.key: getattr(voyage, c.key) for c in voyage.__table__.columns}
    # Vector info
    if voyage.vector_id:
        vec = await db.get(TransportVector, voyage.vector_id)
        d["vector_name"] = vec.name if vec else None
        d["vector_type"] = vec.type if vec else None
    else:
        d["vector_name"] = None
        d["vector_type"] = None
    # Departure base
    if voyage.departure_base_id:
        asset = await db.get(Installation, voyage.departure_base_id)
        d["departure_base_name"] = asset.name if asset else None
    else:
        d["departure_base_name"] = None
    # Counts
    sc = await db.execute(
        select(sqla_func.count())
        .select_from(VoyageStop)
        .where(VoyageStop.voyage_id == voyage_id, VoyageStop.active == True)
    )
    d["stop_count"] = sc.scalar() or 0
    # PAX count via manifests
    pc = await db.execute(
        select(sqla_func.count())
        .select_from(ManifestPassenger)
        .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
        .where(VoyageManifest.voyage_id == voyage_id, VoyageManifest.active == True, ManifestPassenger.active == True)
    )
    d["pax_count"] = pc.scalar() or 0
    # Cargo count via manifests
    cc = await db.execute(
        select(sqla_func.count())
        .select_from(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(VoyageManifest.voyage_id == voyage_id, VoyageManifest.active == True, CargoItem.active == True)
    )
    d["cargo_count"] = cc.scalar() or 0
    return d


@router.patch("/voyages/{voyage_id}", response_model=VoyageRead)
async def update_voyage(
    voyage_id: UUID,
    body: VoyageUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(voyage, field, value)
    await db.commit()
    await db.refresh(voyage)
    d = {c.key: getattr(voyage, c.key) for c in voyage.__table__.columns}
    d["vector_name"] = None
    d["vector_type"] = None
    d["departure_base_name"] = None
    d["stop_count"] = 0
    d["pax_count"] = 0
    d["cargo_count"] = 0
    return d


@router.patch("/voyages/{voyage_id}/status", response_model=VoyageRead)
async def update_voyage_status(
    voyage_id: UUID,
    body: VoyageStatusUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.voyage.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Transition a voyage to a new status with optional departure/arrival timestamps."""
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    from_state = voyage.status

    # Validate allowed transitions
    VALID_TRANSITIONS = {
        "planned": {"confirmed", "cancelled"},
        "confirmed": {"boarding", "delayed", "cancelled"},
        "boarding": {"departed", "cancelled"},
        "departed": {"arrived", "delayed"},
        "delayed": {"confirmed", "boarding", "departed", "cancelled"},
        "arrived": {"closed"},
        "closed": set(),
        "cancelled": set(),
    }
    allowed = VALID_TRANSITIONS.get(voyage.status, set())
    if body.status not in allowed:
        raise HTTPException(400, f"Cannot transition from '{voyage.status}' to '{body.status}'")

    # FSM transition (if workflow definition exists)
    try:
        await fsm_service.transition(
            db,
            workflow_slug=VOYAGE_WORKFLOW_SLUG,
            entity_type=VOYAGE_ENTITY_TYPE,
            entity_id=str(voyage_id),
            to_state=body.status,
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            skip_role_check=True,
        )
    except FSMError as e:
        if "not found" not in str(e).lower():
            raise HTTPException(400, str(e))
        logger.debug("No voyage workflow definition — direct status update")

    voyage.status = body.status
    if body.delay_reason is not None:
        voyage.delay_reason = body.delay_reason
    if body.actual_departure is not None:
        voyage.actual_departure = body.actual_departure
    if body.actual_arrival is not None:
        voyage.actual_arrival = body.actual_arrival
    # Auto-set timestamps for departure/arrival
    if body.status == "departed" and not voyage.actual_departure:
        voyage.actual_departure = datetime.now(UTC)
    if body.status == "arrived" and not voyage.actual_arrival:
        voyage.actual_arrival = datetime.now(UTC)

    await db.commit()
    await db.refresh(voyage)

    # FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=VOYAGE_ENTITY_TYPE,
        entity_id=str(voyage_id),
        from_state=from_state,
        to_state=body.status,
        actor_id=current_user.id,
        workflow_slug=VOYAGE_WORKFLOW_SLUG,
    )

    # Emit event when voyage is confirmed → triggers TravelWiz PAX notifications
    if body.status == "confirmed":
        from app.core.events import OpsFluxEvent, event_bus

        await event_bus.publish(
            OpsFluxEvent(
                event_type="travelwiz.voyage.confirmed",
                payload={
                    "voyage_id": str(voyage_id),
                    "entity_id": str(entity_id),
                    "code": voyage.code if hasattr(voyage, "code") else str(voyage_id),
                    "departure_base": str(voyage.departure_base_id) if voyage.departure_base_id else "",
                    "destination": str(voyage.destination_asset_id)
                    if hasattr(voyage, "destination_asset_id") and voyage.destination_asset_id
                    else "",
                    "scheduled_departure": str(voyage.scheduled_departure) if voyage.scheduled_departure else "",
                    "transport_mode": voyage.transport_mode if hasattr(voyage, "transport_mode") else "",
                },
            )
        )

    if body.status == "delayed":
        from app.core.events import OpsFluxEvent, event_bus

        delay_analysis = await assess_voyage_delay(db, voyage_id=voyage_id, entity_id=entity_id)
        await event_bus.publish(
            OpsFluxEvent(
                event_type="travelwiz.voyage.delayed",
                payload={
                    "voyage_id": str(voyage_id),
                    "entity_id": str(entity_id),
                    "code": voyage.code,
                    "delay_reason": voyage.delay_reason,
                    "delay_hours": delay_analysis["delay_hours"],
                    "threshold_hours": delay_analysis["threshold_hours"],
                    "reassign_available": delay_analysis["reassign_available"],
                    "alternatives": delay_analysis["alternatives"],
                },
            )
        )

    if body.status == "cancelled":
        from app.core.events import OpsFluxEvent, event_bus

        await event_bus.publish(
            OpsFluxEvent(
                event_type="travelwiz.voyage.cancelled",
                payload={
                    "voyage_id": str(voyage_id),
                    "entity_id": str(entity_id),
                    "code": voyage.code,
                    "from_status": from_state,
                    "delay_reason": voyage.delay_reason,
                },
            )
        )

    # Emit event when voyage is closed → triggers PaxLog AdS auto-close
    if body.status == "closed":
        from app.core.events import OpsFluxEvent, event_bus

        # Find all PAX manifests for this voyage and emit close events
        manifest_result = await db.execute(
            select(VoyageManifest).where(
                VoyageManifest.voyage_id == voyage_id,
                VoyageManifest.manifest_type == "pax",
            )
        )
        for manifest in manifest_result.scalars().all():
            # Auto-close the manifest if not already closed
            if manifest.status != "closed":
                manifest.status = "closed"
            await event_bus.publish(
                OpsFluxEvent(
                    event_type="travelwiz.manifest.closed",
                    payload={
                        "manifest_id": str(manifest.id),
                        "voyage_id": str(voyage_id),
                        "entity_id": str(entity_id),
                        "is_return": True,  # Assume closing = return completed
                    },
                )
            )
        await db.commit()
        await db.refresh(voyage)

    d = {c.key: getattr(voyage, c.key) for c in voyage.__table__.columns}
    d["vector_name"] = None
    d["vector_type"] = None
    d["departure_base_name"] = None
    d["stop_count"] = 0
    d["pax_count"] = 0
    d["cargo_count"] = 0
    return d


@router.delete("/voyages/{voyage_id}")
async def archive_voyage(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.voyage.delete"),
    db: AsyncSession = Depends(get_db),
):
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    await delete_entity(voyage, db, "voyage", entity_id=voyage.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Voyage archived"}


@router.get("/voyages/{voyage_id}/pdf/pax-manifest")
async def download_voyage_pax_manifest_pdf(
    voyage_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.read"),
    db: AsyncSession = Depends(get_db),
):
    from app.core.pdf_templates import render_pdf

    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    variables = await _build_voyage_pax_manifest_variables(db, voyage=voyage, entity_id=entity_id)
    pdf_bytes = await render_pdf(
        db,
        slug="voyage.manifest",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise HTTPException(
            404, "Template PDF 'voyage.manifest' introuvable. Initialisez-le dans Parametres > Modeles PDF."
        )
    filename = f"{voyage.code}_manifest_pax.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/voyages/{voyage_id}/pdf/cargo-manifest")
async def download_voyage_cargo_manifest_pdf(
    voyage_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.read"),
    db: AsyncSession = Depends(get_db),
):
    from app.core.pdf_templates import render_pdf

    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    variables = await _build_voyage_cargo_manifest_variables(db, voyage=voyage, entity_id=entity_id)
    pdf_bytes = await render_pdf(
        db,
        slug="voyage.cargo_manifest",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise HTTPException(
            404, "Template PDF 'voyage.cargo_manifest' introuvable. Initialisez-le dans Parametres > Modeles PDF."
        )
    filename = f"{voyage.code}_manifest_cargo.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# ── Voyage Stops ─────────────────────────────────────────────────────────


@router.get("/voyages/{voyage_id}/stops", response_model=list[VoyageStopRead])
async def list_voyage_stops(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(VoyageStop)
        .where(VoyageStop.voyage_id == voyage_id, VoyageStop.active == True)
        .order_by(VoyageStop.stop_order)
    )
    stops = result.scalars().all()
    enriched = []
    for s in stops:
        d = {c.key: getattr(s, c.key) for c in s.__table__.columns}
        asset = await db.get(Installation, s.asset_id)
        d["asset_name"] = asset.name if asset else None
        enriched.append(d)
    return enriched


@router.post("/voyages/{voyage_id}/stops", response_model=VoyageStopRead, status_code=201)
async def create_voyage_stop(
    voyage_id: UUID,
    body: VoyageStopCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    stop = VoyageStop(voyage_id=voyage_id, **body.model_dump())
    db.add(stop)
    await db.commit()
    await db.refresh(stop)
    d = {c.key: getattr(stop, c.key) for c in stop.__table__.columns}
    d["asset_name"] = None
    return d


@router.patch("/voyages/{voyage_id}/stops/{stop_id}", response_model=VoyageStopRead)
async def update_voyage_stop(
    voyage_id: UUID,
    stop_id: UUID,
    body: VoyageStopUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(select(VoyageStop).where(VoyageStop.id == stop_id, VoyageStop.voyage_id == voyage_id))
    stop = result.scalars().first()
    if not stop:
        raise HTTPException(404, "Stop not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(stop, field, value)
    await db.commit()
    await db.refresh(stop)
    d = {c.key: getattr(stop, c.key) for c in stop.__table__.columns}
    d["asset_name"] = None
    return d


@router.delete("/voyages/{voyage_id}/stops/{stop_id}")
async def delete_voyage_stop(
    voyage_id: UUID,
    stop_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(select(VoyageStop).where(VoyageStop.id == stop_id, VoyageStop.voyage_id == voyage_id))
    stop = result.scalars().first()
    if not stop:
        raise HTTPException(404, "Stop not found")
    await delete_entity(stop, db, "voyage_stop", entity_id=stop.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Stop deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# MANIFESTS
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/manifests")
async def list_all_manifests(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    status: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all manifests across all voyages (paginated)."""
    # Use raw SQL to avoid ORM subquery issues
    from sqlalchemy import text as sql_text

    count_sql = sql_text("""
        SELECT COUNT(*) FROM voyage_manifests vm
        JOIN voyages v ON vm.voyage_id = v.id
        WHERE v.entity_id = :eid AND vm.active = TRUE
    """)
    total = (await db.execute(count_sql, {"eid": str(entity_id)})).scalar() or 0

    data_sql = sql_text("""
        SELECT vm.id, vm.voyage_id, vm.manifest_type, vm.status, vm.created_at
        FROM voyage_manifests vm
        JOIN voyages v ON vm.voyage_id = v.id
        WHERE v.entity_id = :eid AND vm.active = TRUE
        ORDER BY vm.created_at DESC
        OFFSET :off LIMIT :lim
    """)
    rows = await db.execute(data_sql, {"eid": str(entity_id), "off": (page - 1) * page_size, "lim": page_size})
    items = []
    for row in rows:
        items.append(
            {
                "id": str(row[0]),
                "voyage_id": str(row[1]),
                "manifest_type": row[2],
                "status": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
            }
        )
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/voyages/{voyage_id}/manifests", response_model=list[ManifestRead])
async def list_manifests(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(VoyageManifest)
        .where(VoyageManifest.voyage_id == voyage_id, VoyageManifest.active == True)
        .order_by(VoyageManifest.created_at)
    )
    manifests = result.scalars().all()
    enriched = []
    for m in manifests:
        d = {c.key: getattr(m, c.key) for c in m.__table__.columns}
        # Passenger count
        pc = await db.execute(
            select(sqla_func.count())
            .select_from(ManifestPassenger)
            .where(ManifestPassenger.manifest_id == m.id, ManifestPassenger.active == True)
        )
        d["passenger_count"] = pc.scalar() or 0
        # Cargo count
        cc = await db.execute(
            select(sqla_func.count())
            .select_from(CargoItem)
            .where(CargoItem.manifest_id == m.id, CargoItem.active == True)
        )
        d["cargo_count"] = cc.scalar() or 0
        # Validator name
        if m.validated_by:
            u = await db.get(User, m.validated_by)
            d["validated_by_name"] = f"{u.first_name} {u.last_name}" if u else None
        else:
            d["validated_by_name"] = None
        enriched.append(d)
    return enriched


@router.get("/voyages/{voyage_id}/cargo-operations-report")
async def get_voyage_cargo_operations_report(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    return await build_packlog_operations_report(db, voyage_id=voyage_id, entity_id=entity_id)


@router.post("/voyages/{voyage_id}/manifests", response_model=ManifestRead, status_code=201)
async def create_manifest(
    voyage_id: UUID,
    body: ManifestCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.manifest.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    manifest = VoyageManifest(voyage_id=voyage_id, **body.model_dump())
    db.add(manifest)
    await db.commit()
    await db.refresh(manifest)
    d = {c.key: getattr(manifest, c.key) for c in manifest.__table__.columns}
    d["passenger_count"] = 0
    d["cargo_count"] = 0
    d["validated_by_name"] = None
    return d


@router.post("/voyages/{voyage_id}/manifests/{manifest_id}/validate", response_model=ManifestRead)
async def validate_manifest(
    voyage_id: UUID,
    manifest_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.manifest.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Validate a manifest — freezes it for departure.

    Before flipping the manifest to ``validated`` we run a hard
    safety check on the combined PAX + cargo weight against the
    vessel/heli weight capacity. ``assess_manifest_weight`` returns
    ``is_blocked=True`` when the combined weight equals or exceeds
    the vector's ``weight_capacity_kg``. Validating an overweight
    manifest is an operational safety risk: the cargo + crew on
    departure would exceed the certified payload of the vehicle.
    Operators must reduce PAX, reduce cargo, or assign to a larger
    vessel before validation can proceed.
    """
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(VoyageManifest).where(VoyageManifest.id == manifest_id, VoyageManifest.voyage_id == voyage_id)
    )
    manifest = result.scalars().first()
    if not manifest:
        raise HTTPException(404, "Manifest not found")
    if manifest.status == "validated":
        raise HTTPException(400, "Manifest already validated")
    if manifest.status == "closed":
        raise HTTPException(400, "Manifest is closed")

    # ── Combined PAX + cargo weight enforcement ─────────────────
    # Read-only safety gate. The function reads ManifestPassenger
    # (PAX weight) and CargoItem (cargo weight) for this manifest's
    # voyage and compares to the vector's certified capacity.
    try:
        weight_check = await assess_manifest_weight(
            db,
            voyage_id=voyage_id,
            manifest_id=manifest_id,
            entity_id=entity_id,
        )
    except ValueError as exc:
        # Manifest/voyage/vector not found at the deeper level —
        # surface as 404 instead of leaking the ValueError.
        raise HTTPException(404, str(exc)) from exc

    if weight_check.get("is_blocked"):
        capacity_kg = weight_check.get("weight_capacity_kg")
        current_kg = weight_check.get("current_weight_kg")
        raise HTTPException(
            400,
            (
                f"Cannot validate manifest: combined PAX + cargo weight "
                f"({current_kg} kg) meets or exceeds the vector capacity "
                f"({capacity_kg} kg). Reduce PAX, reduce cargo, or reassign "
                f"to a larger vector before validation."
            ),
        )

    manifest.status = "validated"
    manifest.validated_by = current_user.id
    manifest.validated_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(manifest)

    # Count passengers for the event payload
    from sqlalchemy import func as sqla_func_local

    pax_count_result = await db.execute(
        select(sqla_func_local.count())
        .select_from(ManifestPassenger)
        .where(
            ManifestPassenger.manifest_id == manifest_id,
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    pax_count = pax_count_result.scalar() or 0

    # Load voyage for context
    voyage_obj = await db.get(Voyage, voyage_id)

    # Emit module-level event AFTER commit → triggers TravelWiz notification handlers
    from app.core.events import OpsFluxEvent
    from app.core.events import event_bus as _event_bus

    await _event_bus.publish(
        OpsFluxEvent(
            event_type="travelwiz.manifest.validated",
            payload={
                "manifest_id": str(manifest_id),
                "voyage_id": str(voyage_id),
                "entity_id": str(entity_id),
                "code": voyage_obj.code if voyage_obj and hasattr(voyage_obj, "code") else str(voyage_id),
                "departure_base": str(voyage_obj.departure_base_id)
                if voyage_obj and voyage_obj.departure_base_id
                else "",
                "destination": str(voyage_obj.destination_asset_id)
                if voyage_obj and hasattr(voyage_obj, "destination_asset_id") and voyage_obj.destination_asset_id
                else "",
                "scheduled_departure": str(voyage_obj.scheduled_departure)
                if voyage_obj and voyage_obj.scheduled_departure
                else "",
                "passenger_count": pax_count,
                "captain_user_id": str(voyage_obj.captain_id)
                if voyage_obj and hasattr(voyage_obj, "captain_id") and voyage_obj.captain_id
                else None,
            },
        )
    )

    d = {c.key: getattr(manifest, c.key) for c in manifest.__table__.columns}
    d["passenger_count"] = pax_count
    d["cargo_count"] = 0
    d["validated_by_name"] = f"{current_user.first_name} {current_user.last_name}"
    return d


# ── Manifest Passengers ──────────────────────────────────────────────────


@router.get("/voyages/{voyage_id}/manifests/{manifest_id}/passengers", response_model=list[PassengerRead])
async def list_passengers(
    voyage_id: UUID,
    manifest_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(ManifestPassenger)
        .where(ManifestPassenger.manifest_id == manifest_id, ManifestPassenger.active == True)
        .order_by(ManifestPassenger.priority_score.desc(), ManifestPassenger.created_at)
    )
    return result.scalars().all()


@router.post("/voyages/{voyage_id}/manifests/{manifest_id}/passengers", response_model=PassengerRead, status_code=201)
async def add_passenger(
    voyage_id: UUID,
    manifest_id: UUID,
    body: PassengerCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.manifest.create"),
    db: AsyncSession = Depends(get_db),
):
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    # Verify manifest exists and is draft
    result = await db.execute(
        select(VoyageManifest).where(VoyageManifest.id == manifest_id, VoyageManifest.voyage_id == voyage_id)
    )
    manifest = result.scalars().first()
    if not manifest:
        raise HTTPException(404, "Manifest not found")
    if manifest.status != "draft":
        raise HTTPException(400, "Cannot add passengers to a non-draft manifest")

    pax = ManifestPassenger(manifest_id=manifest_id, **body.model_dump())
    db.add(pax)
    await db.flush()
    await rebalance_manifest_passenger_standby(
        db,
        voyage_id=voyage_id,
        manifest_id=manifest_id,
        entity_id=entity_id,
    )
    await db.commit()
    await db.refresh(pax)
    return pax


@router.patch("/voyages/{voyage_id}/manifests/{manifest_id}/passengers/{passenger_id}", response_model=PassengerRead)
async def update_passenger(
    voyage_id: UUID,
    manifest_id: UUID,
    passenger_id: UUID,
    body: PassengerUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.boarding.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(ManifestPassenger).where(
            ManifestPassenger.id == passenger_id, ManifestPassenger.manifest_id == manifest_id
        )
    )
    pax = result.scalars().first()
    if not pax:
        raise HTTPException(404, "Passenger not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(pax, field, value)
    # Auto-set boarded_at
    if body.boarding_status == "boarded" and not pax.boarded_at:
        pax.boarded_at = datetime.now(UTC)
    await db.flush()
    await rebalance_manifest_passenger_standby(
        db,
        voyage_id=voyage_id,
        manifest_id=manifest_id,
        entity_id=entity_id,
    )
    await db.commit()
    await db.refresh(pax)
    return pax


@router.delete("/voyages/{voyage_id}/manifests/{manifest_id}/passengers/{passenger_id}")
async def remove_passenger(
    voyage_id: UUID,
    manifest_id: UUID,
    passenger_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.manifest.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(ManifestPassenger).where(
            ManifestPassenger.id == passenger_id, ManifestPassenger.manifest_id == manifest_id
        )
    )
    pax = result.scalars().first()
    if not pax:
        raise HTTPException(404, "Passenger not found")
    await delete_entity(pax, db, "manifest_passenger", entity_id=pax.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Passenger removed"}


# ══════════════════════════════════════════════════════════════════════════════
# CARGO REQUESTS
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/cargo-requests", response_model=PaginatedResponse[CargoRequestRead])
async def list_cargo_requests(
    status: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_requests_impl(
        status=status,
        search=search,
        pagination=pagination,
        entity_id=entity_id,
        db=db,
    )


@router.post("/cargo-requests", response_model=CargoRequestRead, status_code=201)
async def create_cargo_request(
    body: CargoRequestCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.create"),
    db: AsyncSession = Depends(get_db),
):
    return await create_cargo_request_impl(
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo-requests/{request_id}", response_model=CargoRequestRead)
async def get_cargo_request(
    request_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_request_impl(request_id=request_id, entity_id=entity_id, db=db)


@router.get("/cargo-requests/{request_id}/pdf/lt")
async def download_cargo_request_lt_pdf(
    request_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("packlog.cargo.read"),
    db: AsyncSession = Depends(get_db),
):
    return await download_cargo_request_lt_pdf_impl(
        request_id=request_id,
        language=language,
        entity_id=entity_id,
        db=db,
    )


@router.patch("/cargo-requests/{request_id}", response_model=CargoRequestRead)
async def update_cargo_request(
    request_id: UUID,
    body: CargoRequestUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_request_impl(
        request_id=request_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo-requests/{request_id}/loading-options", response_model=list[CargoLoadingOptionRead])
async def get_cargo_request_loading_options(
    request_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_request_loading_options_impl(request_id=request_id, entity_id=entity_id, db=db)


@router.post("/cargo-requests/{request_id}/loading-options/{voyage_id}/apply", response_model=CargoRequestRead)
async def apply_cargo_request_loading_option(
    request_id: UUID,
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await apply_cargo_request_loading_option_impl(
        request_id=request_id,
        voyage_id=voyage_id,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CARGO CRUD
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/cargo", response_model=PaginatedResponse[CargoRead])
async def list_cargo(
    request: Request,
    status: str | None = None,
    cargo_type: str | None = None,
    manifest_id: UUID | None = None,
    destination_asset_id: UUID | None = None,
    request_id: UUID | None = None,
    search: str | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_impl(
        request=request,
        status=status,
        cargo_type=cargo_type,
        manifest_id=manifest_id,
        destination_asset_id=destination_asset_id,
        request_id=request_id,
        search=search,
        scope=scope,
        pagination=pagination,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.post("/cargo", response_model=CargoRead, status_code=201)
async def create_cargo(
    body: CargoCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.create"),
    db: AsyncSession = Depends(get_db),
):
    return await create_cargo_impl(
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo/{cargo_id}", response_model=CargoRead)
async def get_cargo(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_impl(cargo_id=cargo_id, entity_id=entity_id, db=db)


@router.get("/cargo/{cargo_id}/attachment-evidence", response_model=list[CargoAttachmentEvidenceRead])
async def list_cargo_attachment_evidence(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_attachment_evidence_impl(cargo_id=cargo_id, entity_id=entity_id, db=db)


@router.put("/cargo/{cargo_id}/attachments/{attachment_id}/evidence-type", response_model=CargoAttachmentEvidenceRead)
async def set_cargo_attachment_evidence_type(
    cargo_id: UUID,
    attachment_id: UUID,
    body: CargoAttachmentEvidenceUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await set_cargo_attachment_evidence_type_impl(
        cargo_id=cargo_id,
        attachment_id=attachment_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


# ──────────────────────────────────────────────────────────────────────────
# LEGACY PUBLIC TRACKING ROUTES
#
# These routes are DEPRECATED — the canonical endpoints live in the
# PackLog router (/api/v1/packlog/public/cargo/{code} and
# /api/v1/packlog/public/voyages/{code}/cargo). They are kept here as
# thin delegations for backwards compatibility with any external consumer
# that may still reference the old TravelWiz path. New consumers MUST use
# the PackLog routes. See memory/project_packlog_isolation.md.
# ──────────────────────────────────────────────────────────────────────────


@router.get("/public/cargo/{tracking_code}", response_model=CargoTrackingRead)
async def get_public_cargo_tracking_legacy(
    tracking_code: str,
    db: AsyncSession = Depends(get_db),
):
    """DEPRECATED — use /api/v1/packlog/public/cargo/{tracking_code} instead."""
    from app.api.routes.modules.packlog_shared import get_public_cargo_tracking_impl

    return await get_public_cargo_tracking_impl(tracking_code=tracking_code, db=db)


@router.get("/public/voyages/{voyage_code}/cargo", response_model=VoyageCargoTrackingRead)
async def get_public_voyage_cargo_tracking_legacy(
    voyage_code: str,
    db: AsyncSession = Depends(get_db),
):
    """DEPRECATED — use /api/v1/packlog/public/voyages/{voyage_code}/cargo instead."""
    from app.api.routes.modules.packlog_shared import get_public_voyage_cargo_tracking_impl

    return await get_public_voyage_cargo_tracking_impl(voyage_code=voyage_code, db=db)


@router.get("/cargo/{cargo_id}/history")
async def get_cargo_history(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_history_impl(cargo_id=cargo_id, entity_id=entity_id, db=db)


@router.patch("/cargo/{cargo_id}", response_model=CargoRead)
async def update_cargo(
    cargo_id: UUID,
    body: CargoUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_impl(cargo_id=cargo_id, body=body, entity_id=entity_id, db=db)


@router.patch("/cargo/{cargo_id}/workflow-status", response_model=CargoRead)
async def update_cargo_workflow_status(
    cargo_id: UUID,
    body: CargoWorkflowStatusUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_workflow_status_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.patch("/cargo/{cargo_id}/status", response_model=CargoRead)
async def update_cargo_status(
    cargo_id: UUID,
    body: CargoStatusUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_status_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.post("/cargo/{cargo_id}/receive", response_model=CargoRead)
async def receive_cargo(
    cargo_id: UUID,
    body: CargoReceiptConfirm | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.receive"),
    db: AsyncSession = Depends(get_db),
):
    return await receive_cargo_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


# ══════════════════════════════════════════════════════════════════════════════
# CAPTAIN LOGS
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/voyages/{voyage_id}/logs", response_model=list[CaptainLogRead])
async def list_captain_logs(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(CaptainLog)
        .where(CaptainLog.voyage_id == voyage_id, CaptainLog.active == True)
        .order_by(CaptainLog.timestamp)
    )
    return result.scalars().all()


@router.post("/voyages/{voyage_id}/logs", response_model=CaptainLogRead, status_code=201)
async def create_captain_log(
    voyage_id: UUID,
    body: CaptainLogCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.boarding.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    log = CaptainLog(voyage_id=voyage_id, **body.model_dump())
    db.add(log)
    await db.commit()
    await db.refresh(log)
    return log


# ══════════════════════════════════════════════════════════════════════════════
# CAPACITY CHECK
# ══════════════════════════════════════════════════════════════════════════════


@router.get("/voyages/{voyage_id}/capacity", response_model=CapacityCheckResult)
async def check_voyage_capacity(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check current capacity usage for a voyage."""
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    vector = await db.get(TransportVector, voyage.vector_id)
    if not vector:
        raise HTTPException(404, "Vector not found")

    # Count active PAX on all manifests for this voyage
    pax_result = await db.execute(
        select(sqla_func.count())
        .select_from(ManifestPassenger)
        .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.active == True,
            ManifestPassenger.active == True,
            ManifestPassenger.boarding_status != "no_show",
            ManifestPassenger.boarding_status != "offloaded",
        )
    )
    current_pax = pax_result.scalar() or 0

    # Sum declared weight of PAX + cargo weight
    pax_weight_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(ManifestPassenger.declared_weight_kg), 0))
        .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.active == True,
            ManifestPassenger.active == True,
        )
    )
    pax_weight = float(pax_weight_result.scalar() or 0)

    cargo_weight_result = await db.execute(
        select(sqla_func.coalesce(sqla_func.sum(CargoItem.weight_kg), 0))
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.active == True,
            CargoItem.active == True,
        )
    )
    cargo_weight = float(cargo_weight_result.scalar() or 0)

    current_weight = pax_weight + cargo_weight
    remaining_pax = vector.pax_capacity - current_pax
    remaining_weight = (vector.weight_capacity_kg - current_weight) if vector.weight_capacity_kg else None
    weight_alert_ratio = await get_weight_alert_ratio(db, entity_id=entity_id)
    weight_alert_threshold = vector.weight_capacity_kg * weight_alert_ratio if vector.weight_capacity_kg else None
    weight_alert_reached = bool(weight_alert_threshold is not None and current_weight >= weight_alert_threshold)
    weight_blocked = bool(vector.weight_capacity_kg is not None and current_weight >= vector.weight_capacity_kg)
    is_over = current_pax > vector.pax_capacity or (
        vector.weight_capacity_kg is not None and current_weight > vector.weight_capacity_kg
    )

    return {
        "vector_id": vector.id,
        "vector_name": vector.name,
        "pax_capacity": vector.pax_capacity,
        "current_pax": current_pax,
        "remaining_pax": remaining_pax,
        "weight_capacity_kg": vector.weight_capacity_kg,
        "current_weight_kg": current_weight,
        "remaining_weight_kg": remaining_weight,
        "weight_alert_ratio": weight_alert_ratio,
        "weight_alert_threshold_kg": weight_alert_threshold,
        "weight_alert_reached": weight_alert_reached,
        "weight_blocked": weight_blocked,
        "is_over_capacity": is_over,
    }


@router.get("/voyages/{voyage_id}/delay-analysis")
async def get_voyage_delay_analysis(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    try:
        return await assess_voyage_delay(db, voyage_id=voyage_id, entity_id=entity_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.get("/voyages/{voyage_id}/manifests/{manifest_id}/weight-analysis")
async def get_manifest_weight_analysis(
    voyage_id: UUID,
    manifest_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    try:
        return await assess_manifest_weight(
            db,
            voyage_id=voyage_id,
            manifest_id=manifest_id,
            entity_id=entity_id,
        )
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@router.post("/voyages/{voyage_id}/reassign")
async def reassign_delayed_voyage(
    voyage_id: UUID,
    body: VoyageReassignRequest,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.voyage.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_voyage_or_404(db, voyage_id, entity_id)
    try:
        result = await reassign_voyage_passengers(
            db,
            source_voyage_id=voyage_id,
            target_voyage_id=body.target_voyage_id,
            entity_id=entity_id,
        )
        await db.commit()
        return result
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(400, str(exc)) from exc


# ==============================================================================
# VOYAGE EVENTS (Journal de Bord) — enhanced
# ==============================================================================


@router.get("/voyages/{voyage_id}/voyage-events")
async def list_voyage_events(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all journal de bord events for a voyage, ordered chronologically."""
    await _get_voyage_or_404(db, voyage_id, entity_id)
    from sqlalchemy import text

    try:
        result = await db.execute(
            text(
                "SELECT id, voyage_id, event_code, recorded_at, recorded_by, "
                "  latitude, longitude, asset_id, payload, notes "
                "FROM voyage_events "
                "WHERE voyage_id = :vid "
                "ORDER BY recorded_at"
            ),
            {"vid": str(voyage_id)},
        )
        rows = result.all()
        return [
            {
                "id": row[0],
                "voyage_id": row[1],
                "event_code": row[2],
                "recorded_at": row[3],
                "recorded_by": row[4],
                "latitude": row[5],
                "longitude": row[6],
                "asset_id": row[7],
                "payload": row[8],
                "notes": row[9],
            }
            for row in rows
        ]
    except Exception as e:
        logger.debug("voyage_events query failed (table may not exist): %s", e)
        return []


@router.post("/voyages/{voyage_id}/voyage-events", status_code=201)
async def create_voyage_event(
    voyage_id: UUID,
    event_code: str,
    recorded_at: datetime | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    asset_id: UUID | None = None,
    payload: dict | None = None,
    notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.boarding.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Record a voyage event. Validates prerequisites and updates trip status."""
    from app.services.modules.travelwiz_service import record_voyage_event as _record_event

    try:
        result = await _record_event(
            db,
            trip_id=voyage_id,
            entity_id=entity_id,
            user_id=current_user.id,
            event_code=event_code,
            recorded_at=recorded_at,
            latitude=latitude,
            longitude=longitude,
            asset_id=asset_id,
            payload=payload,
            notes=notes,
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/voyages/{voyage_id}/kpis")
async def get_trip_kpis(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get computed KPIs for a trip."""
    from app.services.modules.travelwiz_service import compute_trip_kpis as _compute_kpis

    try:
        return await _compute_kpis(db, trip_id=voyage_id, entity_id=entity_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/voyages/{voyage_id}/close")
async def close_trip(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.voyage.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Close a trip -- compute KPIs, update status, emit travelwiz.trip.closed event."""
    from app.services.modules.travelwiz_service import compute_trip_kpis as _compute_kpis

    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    if voyage.status not in ("arrived", "departed"):
        raise HTTPException(400, f"Cannot close voyage in status '{voyage.status}'")

    # Compute KPIs
    try:
        kpis = await _compute_kpis(db, trip_id=voyage_id, entity_id=entity_id)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Update status
    voyage.status = "closed"
    if not voyage.actual_arrival:
        voyage.actual_arrival = datetime.now(UTC)

    # Close all manifests
    manifest_result = await db.execute(
        select(VoyageManifest).where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.active == True,  # noqa: E712
        )
    )
    for manifest in manifest_result.scalars().all():
        if manifest.status != "closed":
            manifest.status = "closed"

    await db.commit()
    await db.refresh(voyage)

    # Emit close event
    from app.core.events import OpsFluxEvent
    from app.core.events import event_bus as _eb

    await _eb.publish(
        OpsFluxEvent(
            event_type="travelwiz.trip.closed",
            payload={
                "voyage_id": str(voyage_id),
                "entity_id": str(entity_id),
                "code": voyage.code,
                "closed_by": str(current_user.id),
                "kpis": kpis,
            },
        )
    )

    return {"detail": "Trip closed", "kpis": kpis}


# ==============================================================================
# DECK LAYOUT
# ==============================================================================


@router.get("/voyages/{voyage_id}/deck-layouts")
async def list_deck_layouts(
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List deck zones for the vector assigned to this voyage."""
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    result = await db.execute(
        select(TransportVectorZone)
        .where(TransportVectorZone.vector_id == voyage.vector_id, TransportVectorZone.active == True)
        .order_by(TransportVectorZone.name)
    )
    zones = result.scalars().all()
    return [
        {
            "id": z.id,
            "vector_id": z.vector_id,
            "name": z.name,
            "zone_type": z.zone_type,
            "max_weight_kg": z.max_weight_kg,
            "width_m": z.width_m,
            "length_m": z.length_m,
            "exclusion_zones": z.exclusion_zones,
        }
        for z in zones
    ]


@router.post("/voyages/{voyage_id}/deck-layouts/{deck_surface_id}/suggest")
async def suggest_layout(
    voyage_id: UUID,
    deck_surface_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.deck.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Run deck placement algorithm for a specific deck surface."""
    # suggest_deck_layout lives in packlog_service since the PackLog
    # isolation refactor — deck placement is a cargo concern.
    from app.services.modules.packlog_service import suggest_deck_layout as _suggest

    await _get_voyage_or_404(db, voyage_id, entity_id)
    try:
        return await _suggest(db, trip_id=voyage_id, deck_surface_id=deck_surface_id, entity_id=entity_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/voyages/{voyage_id}/deck-layouts/{deck_surface_id}/validate")
async def validate_layout(
    voyage_id: UUID,
    deck_surface_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.deck.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Validate (approve) a deck layout. Marks cargo items as ready_for_loading."""
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)

    # Get cargo assigned to the cargo manifest for this voyage
    cargo_result = await db.execute(
        select(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
            CargoItem.status == "registered",
        )
    )
    updated = 0
    for cargo in cargo_result.scalars().all():
        cargo.status = "ready_for_loading"
        updated += 1

    await db.commit()
    return {
        "detail": "Layout validated",
        "cargo_items_ready": updated,
        "deck_surface_id": str(deck_surface_id),
    }


# ==============================================================================
# CARGO — enhanced (back cargo, package elements, SAP match)
# ==============================================================================


@router.post("/cargo/{cargo_id}/return")
async def initiate_return(
    cargo_id: UUID,
    body: BackCargoReturnRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await initiate_return_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo/{cargo_id}/elements")
async def list_package_elements(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await list_package_elements_impl(cargo_id=cargo_id, entity_id=entity_id, db=db)


@router.post("/cargo/{cargo_id}/elements", status_code=201)
async def add_package_element(
    cargo_id: UUID,
    description: str,
    quantity: int = 1,
    weight_kg: float | None = None,
    sap_code: str | None = None,
    notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("packlog.cargo.create"),
    db: AsyncSession = Depends(get_db),
):
    return await add_package_element_impl(
        cargo_id=cargo_id,
        description=description,
        quantity=quantity,
        weight_kg=weight_kg,
        sap_code=sap_code,
        notes=notes,
        entity_id=entity_id,
        db=db,
    )


@router.patch("/cargo/{cargo_id}/elements/{element_id}/return")
async def update_package_element_return(
    cargo_id: UUID,
    element_id: UUID,
    body: PackageElementReturnUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_package_element_return_impl(
        cargo_id=cargo_id,
        element_id=element_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.patch("/cargo/{cargo_id}/elements/{element_id}/disposition")
async def update_package_element_disposition(
    cargo_id: UUID,
    element_id: UUID,
    body: PackageElementDispositionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("packlog.cargo.update"),
    db: AsyncSession = Depends(get_db),
):
    return await update_package_element_disposition_impl(
        cargo_id=cargo_id,
        element_id=element_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.post("/cargo/sap-match")
async def sap_match(
    description: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Find matching SAP codes for a cargo description."""
    # SAP matching lives in packlog_service since the PackLog isolation
    # refactor — article catalog and SAP codes are cargo concerns.
    from app.services.modules.packlog_service import match_packlog_sap_code as _match

    return await _match(db, description=description, entity_id=entity_id)


# ==============================================================================
# CAPTAIN PORTAL
# ==============================================================================


@router.post("/captain/authenticate")
async def captain_auth(
    access_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with 6-digit captain code. Returns trip details if valid."""
    from app.services.modules.travelwiz_service import authenticate_captain_code as _auth
    from app.services.modules.travelwiz_service import (
        create_captain_session_token as _create_session,
    )
    from app.services.modules.travelwiz_service import (
        get_captain_session_minutes as _get_session_minutes,
    )

    result = await _auth(db, access_code=access_code)
    if not result.get("valid"):
        raise HTTPException(401, "Invalid or expired access code")
    entity_id = result.get("entity_id")
    voyage_id = result.get("voyage_id")
    trip_code_access_id = result.get("trip_code_access_id")
    if not entity_id or not voyage_id or not trip_code_access_id:
        raise HTTPException(500, "Captain access is missing required session context")
    session_minutes = await _get_session_minutes(db, entity_id=entity_id)
    expires_at = datetime.now(UTC) + timedelta(minutes=session_minutes)
    result["session_token"] = _create_session(
        trip_code_access_id=trip_code_access_id,
        voyage_id=voyage_id,
        expires_at=expires_at,
    )
    result["session_expires_at"] = expires_at.isoformat()
    return result


@router.get("/captain/{voyage_id}/manifest")
async def captain_manifest(
    voyage_id: UUID,
    x_captain_session: str | None = Header(default=None, alias="X-Captain-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Read-only manifest view for captain portal."""
    await _require_captain_session(voyage_id, db, x_captain_session)
    voyage_result = await db.execute(select(Voyage).where(Voyage.id == voyage_id))
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise HTTPException(404, "Voyage not found")

    # PAX manifest
    pax_result = await db.execute(
        select(ManifestPassenger)
        .join(VoyageManifest, ManifestPassenger.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.manifest_type == "pax",
            VoyageManifest.active == True,  # noqa: E712
            ManifestPassenger.active == True,  # noqa: E712
        )
        .order_by(ManifestPassenger.priority_score.desc(), ManifestPassenger.name)
    )
    passengers = [
        {
            "id": p.id,
            "name": p.name,
            "company": p.company,
            "boarding_status": p.boarding_status,
            "priority_score": p.priority_score,
            "standby": p.standby,
            "declared_weight_kg": p.declared_weight_kg,
        }
        for p in pax_result.scalars().all()
    ]

    # Cargo manifest
    cargo_result = await db.execute(
        select(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
        )
        .order_by(CargoItem.tracking_code)
    )
    cargo = [
        {
            "id": c.id,
            "tracking_code": c.tracking_code,
            "description": c.description,
            "cargo_type": c.cargo_type,
            "weight_kg": c.weight_kg,
            "status": c.status,
            "hazmat_validated": c.hazmat_validated,
        }
        for c in cargo_result.scalars().all()
    ]

    return {
        "voyage_id": voyage.id,
        "code": voyage.code,
        "status": voyage.status,
        "scheduled_departure": voyage.scheduled_departure,
        "passengers": passengers,
        "cargo": cargo,
        "pax_count": len(passengers),
        "cargo_count": len(cargo),
    }


@router.post("/captain/{voyage_id}/event", status_code=201)
async def captain_event(
    voyage_id: UUID,
    event_code: str,
    notes: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    x_captain_session: str | None = Header(default=None, alias="X-Captain-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Captain records a voyage event from the portal."""
    from app.services.modules.travelwiz_service import record_voyage_event as _record_event

    captain_session = await _require_captain_session(voyage_id, db, x_captain_session)
    voyage_result = await db.execute(select(Voyage).where(Voyage.id == voyage_id))
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise HTTPException(404, "Voyage not found")

    try:
        result = await _record_event(
            db,
            trip_id=voyage_id,
            entity_id=voyage.entity_id,
            user_id=captain_session["created_by"],
            event_code=event_code,
            latitude=latitude,
            longitude=longitude,
            notes=notes,
        )
        await db.commit()
        result["trip_code_access_id"] = str(captain_session["trip_code_access_id"])
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


# ==============================================================================
# DRIVER PORTAL
# ==============================================================================


@router.post("/driver/authenticate")
async def driver_auth(
    access_code: str,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate chauffeur access for pickup rounds using a 6-digit code."""
    from app.services.modules.travelwiz_service import authenticate_driver_code as _auth
    from app.services.modules.travelwiz_service import (
        create_driver_session_token as _create_session,
    )
    from app.services.modules.travelwiz_service import (
        get_driver_session_minutes as _get_session_minutes,
    )

    result = await _auth(db, access_code=access_code)
    if not result.get("valid"):
        raise HTTPException(401, "Invalid or expired access code")
    entity_id = result.get("entity_id")
    voyage_id = result.get("voyage_id")
    trip_code_access_id = result.get("trip_code_access_id")
    if not entity_id or not voyage_id or not trip_code_access_id:
        raise HTTPException(500, "Driver access is missing required session context")
    session_minutes = await _get_session_minutes(db, entity_id=entity_id)
    expires_at = datetime.now(UTC) + timedelta(minutes=session_minutes)
    result["session_token"] = _create_session(
        trip_code_access_id=trip_code_access_id,
        voyage_id=voyage_id,
        expires_at=expires_at,
    )
    result["session_expires_at"] = expires_at.isoformat()
    return result


@router.get("/driver/{voyage_id}/round")
async def driver_round(
    voyage_id: UUID,
    x_driver_session: str | None = Header(default=None, alias="X-Driver-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Pickup round view for chauffeur portal."""
    driver_session = await _require_driver_session(voyage_id, db, x_driver_session)
    pickup_round = driver_session["pickup_round"]

    stops_result = await db.execute(
        select(PickupStop)
        .where(
            PickupStop.pickup_round_id == pickup_round.id,
            PickupStop.active == True,  # noqa: E712
        )
        .order_by(PickupStop.pickup_order)
    )
    stops = stops_result.scalars().all()
    assignment_result = await db.execute(
        select(
            PickupStopAssignment.pickup_stop_id,
            ManifestPassenger.id,
            ManifestPassenger.name,
            ManifestPassenger.company,
        )
        .join(ManifestPassenger, ManifestPassenger.id == PickupStopAssignment.manifest_passenger_id)
        .where(
            PickupStopAssignment.pickup_stop_id.in_([stop.id for stop in stops] or [UUID(int=0)]),
            PickupStopAssignment.active == True,  # noqa: E712
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    assignments_by_stop: dict[UUID, list[dict[str, object]]] = {}
    for pickup_stop_id, passenger_id, passenger_name, passenger_company in assignment_result.all():
        assignments_by_stop.setdefault(pickup_stop_id, []).append(
            {
                "id": passenger_id,
                "name": passenger_name,
                "company": passenger_company,
            }
        )
    enriched_stops = []
    for stop in stops:
        asset = await db.get(Installation, stop.asset_id)
        enriched_stops.append(
            {
                "id": stop.id,
                "asset_id": stop.asset_id,
                "asset_name": asset.name if asset else None,
                "pickup_order": stop.pickup_order,
                "scheduled_time": stop.scheduled_time,
                "actual_time": stop.actual_time,
                "pax_expected": stop.pax_expected,
                "pax_picked_up": stop.pax_picked_up,
                "status": stop.status,
                "notes": stop.notes,
                "assigned_passengers": assignments_by_stop.get(stop.id, []),
            }
        )

    return {
        "voyage_id": voyage_id,
        "pickup_round_id": pickup_round.id,
        "route_name": pickup_round.route_name,
        "driver_name": pickup_round.driver_name,
        "vehicle_registration": pickup_round.vehicle_registration,
        "scheduled_departure": pickup_round.scheduled_departure,
        "actual_departure": pickup_round.actual_departure,
        "status": pickup_round.status,
        "total_pax_picked": pickup_round.total_pax_picked,
        "stops": enriched_stops,
    }


@router.get("/driver/{voyage_id}/stops/{stop_id}/proximity")
async def driver_stop_proximity(
    voyage_id: UUID,
    stop_id: UUID,
    x_driver_session: str | None = Header(default=None, alias="X-Driver-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Assess whether the chauffeur is close enough to confirm the stop."""
    from app.services.modules.travelwiz_service import assess_pickup_stop_proximity as _assess

    driver_session = await _require_driver_session(voyage_id, db, x_driver_session)
    try:
        return await _assess(
            db,
            trip_id=voyage_id,
            stop_id=stop_id,
            entity_id=driver_session["pickup_round"].entity_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/driver/{voyage_id}/stops/{stop_id}/pickup", status_code=201)
async def driver_pickup_stop(
    voyage_id: UUID,
    stop_id: UUID,
    body: PickupProgressUpdate,
    x_driver_session: str | None = Header(default=None, alias="X-Driver-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Chauffeur records pickup progress for a stop."""
    from app.services.modules.travelwiz_service import update_pickup_progress as _progress

    await _require_driver_session(voyage_id, db, x_driver_session)
    try:
        result = await _progress(
            db,
            trip_id=voyage_id,
            stop_id=stop_id,
            event_data=body.model_dump(),
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/driver/{voyage_id}/stops/{stop_id}/no-show", status_code=201)
async def driver_no_show_stop(
    voyage_id: UUID,
    stop_id: UUID,
    body: PickupNoShowReport,
    x_driver_session: str | None = Header(default=None, alias="X-Driver-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Chauffeur reports a no-show for a stop."""
    from app.services.modules.travelwiz_service import report_pickup_no_show as _report

    driver_session = await _require_driver_session(voyage_id, db, x_driver_session)
    try:
        result = await _report(
            db,
            trip_id=voyage_id,
            stop_id=stop_id,
            entity_id=driver_session["pickup_round"].entity_id,
            event_data=body.model_dump(),
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/driver/{voyage_id}/close")
async def driver_close_round(
    voyage_id: UUID,
    x_driver_session: str | None = Header(default=None, alias="X-Driver-Session"),
    db: AsyncSession = Depends(get_db),
):
    """Chauffeur closes the pickup round after the circuit ends."""
    from app.services.modules.travelwiz_service import close_pickup_round as _close

    await _require_driver_session(voyage_id, db, x_driver_session)
    try:
        result = await _close(db, trip_id=voyage_id)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


# ==============================================================================
# ARTICLE CATALOG
# ==============================================================================


@router.get("/articles")
async def list_articles(
    search: str | None = None,
    sap_code: str | None = None,
    management_type: str | None = None,
    is_hazmat: bool | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List article catalog entries with optional filtering."""
    from sqlalchemy import text

    conditions = ["entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}

    if search:
        conditions.append("(description ILIKE :search OR sap_code ILIKE :search)")
        params["search"] = f"%{search}%"
    if sap_code:
        conditions.append("sap_code = :sap")
        params["sap"] = sap_code
    if management_type:
        conditions.append("management_type = :mt")
        params["mt"] = management_type
    if is_hazmat is not None:
        conditions.append("is_hazmat = :haz")
        params["haz"] = is_hazmat

    where_clause = " AND ".join(conditions)
    try:
        result = await db.execute(
            text(
                f"SELECT id, sap_code, description_fr, management_type, unit_of_measure, "
                f"  is_hazmat, hazmat_class, created_at "
                f"FROM article_catalog "
                f"WHERE {where_clause} "
                f"ORDER BY sap_code "
                f"LIMIT 200"
            ),
            params,
        )
        return [
            {
                "id": row[0],
                "sap_code": row[1],
                "description": row[2],
                "management_type": row[3],
                "unit": row[4],
                "is_hazmat": row[5],
                "hazmat_class": row[6],
                "created_at": row[7],
            }
            for row in result.all()
        ]
    except Exception as e:
        logger.debug("article_catalog query failed: %s", e)
        return []


@router.post("/articles", status_code=201)
async def create_article(
    sap_code: str,
    description: str,
    management_type: str = "standard",
    unit: str = "EA",
    is_hazmat: bool = False,
    hazmat_class: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("packlog.cargo.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new article catalog entry."""
    from sqlalchemy import text

    try:
        normalized = _normalize_article_description(description)
        result = await db.execute(
            text(
                "INSERT INTO article_catalog "
                "(entity_id, sap_code, description_fr, description_normalized, "
                "  management_type, unit_of_measure, is_hazmat, hazmat_class, source, last_imported_at) "
                "VALUES (:eid, :sap, :desc, :norm, :mt, :unit, :haz, :hclass, :source, :imported_at) "
                "RETURNING id, sap_code, description_fr, management_type, unit_of_measure, is_hazmat, hazmat_class"
            ),
            {
                "eid": str(entity_id),
                "sap": sap_code,
                "desc": description,
                "norm": normalized,
                "mt": management_type,
                "unit": unit,
                "haz": is_hazmat,
                "hclass": hazmat_class,
                "source": "manual",
                "imported_at": datetime.now(UTC),
            },
        )
        row = result.first()
        await db.commit()
        return {
            "id": row[0],
            "sap_code": row[1],
            "description": row[2],
            "management_type": row[3],
            "unit": row[4],
            "is_hazmat": row[5],
            "hazmat_class": row[6],
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to create article: {e}")


@router.post("/articles/import-csv")
async def import_articles_csv(
    file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("packlog.cargo.create"),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import SAP articles from a CSV file."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "Le fichier doit être un CSV")

    raw_bytes = await file.read()
    try:
        content = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise HTTPException(400, "Le fichier CSV doit être encodé en UTF-8") from exc

    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise HTTPException(400, "Le fichier CSV est vide")

    imported = 0
    updated = 0
    errors: list[str] = []
    imported_at = datetime.now(UTC)

    for line_number, row in enumerate(reader, start=2):
        try:
            payload = _normalize_article_csv_row(row, line_number)
            existing = await db.execute(
                text("SELECT id FROM article_catalog WHERE entity_id = :eid AND sap_code = :sap LIMIT 1"),
                {"eid": str(entity_id), "sap": payload["sap_code"]},
            )
            article_id = existing.scalar_one_or_none()
            if article_id:
                await db.execute(
                    text(
                        "UPDATE article_catalog "
                        "SET internal_code = :internal_code, "
                        "    description_fr = :description_fr, "
                        "    description_en = :description_en, "
                        "    description_normalized = :description_normalized, "
                        "    management_type = :management_type, "
                        "    unit_of_measure = :unit_of_measure, "
                        "    packaging_type = :packaging_type, "
                        "    is_hazmat = :is_hazmat, "
                        "    hazmat_class = :hazmat_class, "
                        "    unit_weight_kg = :unit_weight_kg, "
                        "    source = :source, "
                        "    last_imported_at = :last_imported_at, "
                        "    active = :active "
                        "WHERE id = :article_id"
                    ),
                    {
                        **payload,
                        "article_id": article_id,
                        "source": "csv",
                        "last_imported_at": imported_at,
                    },
                )
                updated += 1
            else:
                await db.execute(
                    text(
                        "INSERT INTO article_catalog ("
                        "entity_id, sap_code, internal_code, description_fr, description_en, "
                        "description_normalized, management_type, unit_of_measure, packaging_type, "
                        "is_hazmat, hazmat_class, unit_weight_kg, source, last_imported_at, active"
                        ") VALUES ("
                        ":entity_id, :sap_code, :internal_code, :description_fr, :description_en, "
                        ":description_normalized, :management_type, :unit_of_measure, :packaging_type, "
                        ":is_hazmat, :hazmat_class, :unit_weight_kg, :source, :last_imported_at, :active"
                        ")"
                    ),
                    {
                        **payload,
                        "entity_id": str(entity_id),
                        "source": "csv",
                        "last_imported_at": imported_at,
                    },
                )
                imported += 1
        except ValueError as exc:
            errors.append(str(exc))

    await db.commit()
    return {
        "status": "completed",
        "imported": imported,
        "updated": updated,
        "errors": errors,
        "total_rows": max(0, imported + updated + len(errors)),
    }


# ==============================================================================
# DASHBOARD DATA ENDPOINTS
# ==============================================================================


@router.get("/dashboard/trips-today")
async def trips_today(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get voyages departing or arriving today. Used by dashboard widget."""
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(hour=23, minute=59, second=59)

    result = await db.execute(
        select(
            Voyage.id.label("id"),
            Voyage.code.label("code"),
            Voyage.status.label("status"),
            Voyage.scheduled_departure.label("scheduled_departure"),
            Voyage.scheduled_arrival.label("scheduled_arrival"),
            Voyage.actual_departure.label("actual_departure"),
            Voyage.actual_arrival.label("actual_arrival"),
            TransportVector.name.label("vector_name"),
            TransportVector.type.label("vector_type"),
            Installation.name.label("departure_base_name"),
        )
        .outerjoin(TransportVector, Voyage.vector_id == TransportVector.id)
        .outerjoin(Installation, Voyage.departure_base_id == Installation.id)
        .where(
            Voyage.entity_id == entity_id,
            Voyage.active == True,  # noqa: E712
            Voyage.status.in_(["planned", "confirmed", "boarding", "departed", "arrived"]),
            ((Voyage.scheduled_departure >= today_start) & (Voyage.scheduled_departure <= today_end))
            | ((Voyage.scheduled_arrival >= today_start) & (Voyage.scheduled_arrival <= today_end)),
        )
        .order_by(Voyage.scheduled_departure)
    )

    return [
        {
            "id": row.id,
            "code": row.code,
            "status": row.status,
            "vector_name": row.vector_name,
            "vector_type": row.vector_type,
            "departure_base_name": row.departure_base_name,
            "scheduled_departure": row.scheduled_departure,
            "scheduled_arrival": row.scheduled_arrival,
            "actual_departure": row.actual_departure,
            "actual_arrival": row.actual_arrival,
        }
        for row in result.all()
    ]


@router.get("/dashboard/cargo-pending")
async def cargo_pending(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get cargo items awaiting loading. Used by dashboard widget."""
    result = await db.execute(
        select(
            CargoItem,
            Installation.name.label("destination_name"),
        )
        .outerjoin(Installation, CargoItem.destination_asset_id == Installation.id)
        .where(
            CargoItem.entity_id == entity_id,
            CargoItem.active == True,  # noqa: E712
            CargoItem.status.in_(["registered", "ready_for_loading"]),
        )
        .order_by(CargoItem.created_at.desc())
        .limit(50)
    )

    items = []
    for row in result.all():
        cargo = row[0]
        items.append(
            {
                "id": cargo.id,
                "tracking_code": cargo.tracking_code,
                "description": cargo.description,
                "cargo_type": cargo.cargo_type,
                "weight_kg": cargo.weight_kg,
                "status": cargo.status,
                "destination_name": row[1],
                "hazmat_validated": cargo.hazmat_validated,
                "created_at": cargo.created_at,
            }
        )
    return items


@router.get("/dashboard/fleet-kpis")
async def fleet_kpis(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get fleet-level KPIs. Used by dashboard widget."""
    # Active vectors
    vec_count = await db.execute(
        select(sqla_func.count())
        .select_from(TransportVector)
        .where(
            TransportVector.entity_id == entity_id,
            TransportVector.active == True,  # noqa: E712
        )
    )
    active_vectors = vec_count.scalar() or 0

    # Voyages today
    today_start = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start.replace(hour=23, minute=59, second=59)
    voyages_today = await db.execute(
        select(sqla_func.count())
        .select_from(Voyage)
        .where(
            Voyage.entity_id == entity_id,
            Voyage.active == True,  # noqa: E712
            Voyage.scheduled_departure >= today_start,
            Voyage.scheduled_departure <= today_end,
        )
    )

    # Active voyages (not closed/cancelled)
    active_voyages = await db.execute(
        select(sqla_func.count())
        .select_from(Voyage)
        .where(
            Voyage.entity_id == entity_id,
            Voyage.active == True,  # noqa: E712
            Voyage.status.in_(["planned", "confirmed", "boarding", "departed", "arrived"]),
        )
    )

    # Pending cargo
    pending_cargo = await db.execute(
        select(sqla_func.count())
        .select_from(CargoItem)
        .where(
            CargoItem.entity_id == entity_id,
            CargoItem.active == True,  # noqa: E712
            CargoItem.status.in_(["registered", "ready_for_loading"]),
        )
    )

    # In-transit cargo
    transit_cargo = await db.execute(
        select(sqla_func.count())
        .select_from(CargoItem)
        .where(
            CargoItem.entity_id == entity_id,
            CargoItem.active == True,  # noqa: E712
            CargoItem.status == "in_transit",
        )
    )

    return {
        "active_vectors": active_vectors,
        "voyages_today": voyages_today.scalar() or 0,
        "active_voyages": active_voyages.scalar() or 0,
        "pending_cargo": pending_cargo.scalar() or 0,
        "in_transit_cargo": transit_cargo.scalar() or 0,
    }


# ==============================================================================
# RAMASSAGE TERRESTRE (Terrestrial Pickup Rounds)
# ==============================================================================


@router.post("/pickup-rounds", status_code=201)
async def create_pickup_round(
    body: PickupRoundCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.pickup.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a pickup round (bus/4x4 collecting passengers at multiple stops)."""
    from app.services.modules.travelwiz_service import create_pickup_round as _create

    try:
        result = await _create(db, entity_id=entity_id, data=body.model_dump())
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/pickup-rounds")
async def list_pickup_rounds(
    status: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List pickup rounds with optional status filter."""
    query = (
        select(PickupRound)
        .where(
            PickupRound.entity_id == entity_id,
            PickupRound.active == True,  # noqa: E712
        )
        .order_by(PickupRound.scheduled_departure.desc())
    )
    if status:
        query = query.where(PickupRound.status == status)

    result = await db.execute(query)
    rounds = result.scalars().all()
    return [
        {
            "id": r.id,
            "trip_id": r.trip_id,
            "route_name": r.route_name,
            "scheduled_departure": r.scheduled_departure,
            "actual_departure": r.actual_departure,
            "actual_arrival": r.actual_arrival,
            "driver_name": r.driver_name,
            "vehicle_registration": r.vehicle_registration,
            "status": r.status,
            "total_pax_picked": r.total_pax_picked,
            "notes": r.notes,
            "created_at": r.created_at,
        }
        for r in rounds
    ]


@router.get("/pickup-rounds/{trip_id}")
async def get_pickup_round_details(
    trip_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get pickup round details with stops for a trip."""
    round_result = await db.execute(
        select(PickupRound).where(
            PickupRound.trip_id == trip_id,
            PickupRound.entity_id == entity_id,
            PickupRound.active == True,  # noqa: E712
        )
    )
    pickup_round = round_result.scalar_one_or_none()
    if not pickup_round:
        raise HTTPException(404, "Pickup round not found for this trip")

    # Load stops with asset names
    stops_result = await db.execute(
        select(PickupStop)
        .where(
            PickupStop.pickup_round_id == pickup_round.id,
            PickupStop.active == True,  # noqa: E712
        )
        .order_by(PickupStop.pickup_order)
    )
    stops = stops_result.scalars().all()
    assignment_result = await db.execute(
        select(
            PickupStopAssignment.pickup_stop_id,
            ManifestPassenger.id,
            ManifestPassenger.name,
            ManifestPassenger.company,
            ManifestPassenger.user_id,
            ManifestPassenger.contact_id,
        )
        .join(ManifestPassenger, ManifestPassenger.id == PickupStopAssignment.manifest_passenger_id)
        .where(
            PickupStopAssignment.pickup_stop_id.in_([stop.id for stop in stops] or [UUID(int=0)]),
            PickupStopAssignment.active == True,  # noqa: E712
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    assignments_by_stop: dict[UUID, list[dict[str, object]]] = {}
    for pickup_stop_id, passenger_id, passenger_name, passenger_company, user_id, contact_id in assignment_result.all():
        assignments_by_stop.setdefault(pickup_stop_id, []).append(
            {
                "id": passenger_id,
                "name": passenger_name,
                "company": passenger_company,
                "user_id": user_id,
                "contact_id": contact_id,
            }
        )

    enriched_stops = []
    for s in stops:
        asset = await db.get(Installation, s.asset_id)
        enriched_stops.append(
            {
                "id": s.id,
                "asset_id": s.asset_id,
                "asset_name": asset.name if asset else None,
                "pickup_order": s.pickup_order,
                "scheduled_time": s.scheduled_time,
                "actual_time": s.actual_time,
                "pax_expected": s.pax_expected,
                "pax_picked_up": s.pax_picked_up,
                "status": s.status,
                "notes": s.notes,
                "assigned_passengers": assignments_by_stop.get(s.id, []),
            }
        )

    return {
        "id": pickup_round.id,
        "trip_id": pickup_round.trip_id,
        "route_name": pickup_round.route_name,
        "scheduled_departure": pickup_round.scheduled_departure,
        "actual_departure": pickup_round.actual_departure,
        "actual_arrival": pickup_round.actual_arrival,
        "driver_name": pickup_round.driver_name,
        "driver_phone": pickup_round.driver_phone,
        "vehicle_registration": pickup_round.vehicle_registration,
        "status": pickup_round.status,
        "total_pax_picked": pickup_round.total_pax_picked,
        "notes": pickup_round.notes,
        "stops": enriched_stops,
    }


@router.post("/pickup-rounds/{trip_id}/stops/{stop_id}/pickup", status_code=201)
async def record_pickup_at_stop(
    trip_id: UUID,
    stop_id: UUID,
    body: PickupProgressUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.pickup.update"),
    db: AsyncSession = Depends(get_db),
):
    """Record passenger pickup at a stop during a pickup round."""
    from app.services.modules.travelwiz_service import update_pickup_progress as _progress

    try:
        result = await _progress(
            db,
            trip_id=trip_id,
            stop_id=stop_id,
            event_data=body.model_dump(),
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/pickup-rounds/{trip_id}/stops/{stop_id}/no-show", status_code=201)
async def report_pickup_no_show(
    trip_id: UUID,
    stop_id: UUID,
    body: PickupNoShowReport,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.pickup.update"),
    db: AsyncSession = Depends(get_db),
):
    """Report absent passengers at a pickup stop and alert operators."""
    from app.services.modules.travelwiz_service import report_pickup_no_show as _report

    try:
        result = await _report(
            db,
            trip_id=trip_id,
            stop_id=stop_id,
            entity_id=entity_id,
            event_data=body.model_dump(),
        )
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/pickup-rounds/{trip_id}/close")
async def close_pickup_round_endpoint(
    trip_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.pickup.update"),
    db: AsyncSession = Depends(get_db),
):
    """Close a pickup round and compute pickup KPIs."""
    from app.services.modules.travelwiz_service import close_pickup_round as _close

    try:
        result = await _close(db, trip_id=trip_id)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


# ==============================================================================
# IoT TRACKING (Real-time vehicle positions)
# ==============================================================================


@router.post("/tracking/position", status_code=201)
async def record_single_position(
    vehicle_id: UUID,
    latitude: float,
    longitude: float,
    source: str = "manual",
    speed_knots: float | None = None,
    heading: float | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.tracking.update"),
    db: AsyncSession = Depends(get_db),
):
    """Record a single position (from IoT device or manual entry)."""
    from app.services.modules.travelwiz_service import record_position as _record

    # Validate source
    if source not in ("ais", "gps", "manual"):
        raise HTTPException(400, "Invalid source. Must be: ais, gps, manual")

    result = await _record(
        db,
        vehicle_id=vehicle_id,
        lat=latitude,
        lng=longitude,
        source=source,
        speed_knots=speed_knots,
        heading=heading,
    )
    await db.commit()
    return result


@router.post("/tracking/ais-bulk", status_code=201)
async def bulk_import_ais(
    messages: list[dict],
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("travelwiz.tracking.update"),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import AIS data. Matches by MMSI to registered vehicles."""
    from app.services.modules.travelwiz_service import process_ais_data as _process

    result = await _process(db, entity_id=entity_id, ais_messages=messages)
    await db.commit()
    return result


@router.get("/tracking/fleet")
async def get_fleet_positions_endpoint(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get latest positions of all vehicles (for fleet map widget)."""
    from datetime import datetime

    from app.services.modules.travelwiz_service import get_fleet_positions as _fleet

    positions = await _fleet(db, entity_id=entity_id)
    return {"positions": positions, "updated_at": datetime.now(UTC).isoformat()}


@router.get("/tracking/{vehicle_id}/track")
async def get_vehicle_track_endpoint(
    vehicle_id: UUID,
    start: datetime = Query(..., description="Start datetime (ISO 8601)"),
    end: datetime = Query(..., description="End datetime (ISO 8601)"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get position history for a vehicle between two timestamps."""
    from app.services.modules.travelwiz_service import get_vehicle_track as _track

    return await _track(db, vehicle_id=vehicle_id, start=start, end=end)


@router.get("/tracking/sse")
async def tracking_sse(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint streaming position updates for the fleet map.

    Clients connect and receive real-time position updates as they occur.
    Uses EventBus subscription for ``travelwiz.position.updated`` events.
    """
    import asyncio
    import json

    from app.core.events import event_bus as _eb

    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()

        async def _handler(event):
            await queue.put(event)

        _eb.subscribe("travelwiz.position.updated", _handler)

        try:
            yield f"data: {json.dumps({'type': 'connected', 'entity_id': str(entity_id)})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event.payload)}\n\n"
                except TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ==============================================================================
# WEATHER INTEGRATION
# ==============================================================================


@router.post("/weather", status_code=201)
async def record_weather_observation(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.weather.create"),
    db: AsyncSession = Depends(get_db),
):
    """Record a weather observation (manual or API-sourced)."""
    from app.services.modules.travelwiz_service import record_weather as _record

    if "asset_id" not in body:
        raise HTTPException(400, "asset_id is required")

    try:
        result = await _record(db, entity_id=entity_id, data=body)
        await db.commit()
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/weather/sites")
async def get_all_sites_weather(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get latest weather for all operational sites.

    Uses DISTINCT ON to return only the most recent observation per asset.
    """
    try:
        result = await db.execute(
            text(
                "SELECT DISTINCT ON (wd.asset_id) "
                "  wd.id, wd.asset_id, a.name AS asset_name, "
                "  wd.recorded_at, wd.source, wd.wind_speed_knots, "
                "  wd.wind_direction_deg, wd.wave_height_m, wd.visibility_nm, "
                "  wd.sea_state, wd.temperature_c, wd.weather_code, "
                "  wd.flight_conditions "
                "FROM weather_data wd "
                "JOIN ar_installations a ON a.id = wd.asset_id "
                "WHERE wd.entity_id = :eid AND wd.active = true "
                "ORDER BY wd.asset_id, wd.recorded_at DESC"
            ),
            {"eid": str(entity_id)},
        )
        rows = result.all()
    except Exception as e:
        logger.debug("Weather sites query failed: %s", e)
        return []

    return [
        {
            "id": row[0],
            "asset_id": row[1],
            "asset_name": row[2],
            "recorded_at": row[3].isoformat() if row[3] else None,
            "source": row[4],
            "wind_speed_knots": float(row[5]) if row[5] else None,
            "wind_direction_deg": row[6],
            "wave_height_m": float(row[7]) if row[7] else None,
            "visibility_nm": float(row[8]) if row[8] else None,
            "sea_state": row[9],
            "temperature_c": float(row[10]) if row[10] else None,
            "weather_code": row[11],
            "flight_conditions": row[12],
        }
        for row in rows
    ]


@router.get("/weather/{asset_id}")
async def get_weather_history(
    asset_id: UUID,
    limit: int = Query(50, ge=1, le=500),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get weather observation history for a site."""
    result = await db.execute(
        select(WeatherData)
        .where(
            WeatherData.entity_id == entity_id,
            WeatherData.asset_id == asset_id,
            WeatherData.active == True,  # noqa: E712
        )
        .order_by(WeatherData.recorded_at.desc())
        .limit(limit)
    )
    records = result.scalars().all()
    return [
        {
            "id": w.id,
            "asset_id": w.asset_id,
            "recorded_at": w.recorded_at.isoformat(),
            "source": w.source,
            "wind_speed_knots": float(w.wind_speed_knots) if w.wind_speed_knots else None,
            "wind_direction_deg": w.wind_direction_deg,
            "wave_height_m": float(w.wave_height_m) if w.wave_height_m else None,
            "visibility_nm": float(w.visibility_nm) if w.visibility_nm else None,
            "sea_state": w.sea_state,
            "temperature_c": float(w.temperature_c) if w.temperature_c else None,
            "weather_code": w.weather_code,
            "flight_conditions": w.flight_conditions,
            "notes": w.notes,
        }
        for w in records
    ]


@router.get("/weather/{asset_id}/flight-conditions")
async def get_flight_conditions(
    asset_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current flight conditions (VFR/IFR) for helicopter operations at a site."""
    from app.services.modules.travelwiz_service import check_flight_conditions as _check

    return await _check(db, asset_id=asset_id)
