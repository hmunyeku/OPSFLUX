"""PackLog service constants and compatibility helpers.

This module centralizes the PackLog identity while the cargo domain logic is
still progressively extracted from TravelWiz.
"""

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from sqlalchemy import func as sqla_func, select, text

from app.core.config import settings
from app.core.rbac import get_user_permissions
from app.models.asset_registry import Installation
from app.models.common import Attachment, ImputationReference, Tier, TierContact, User
from app.models.travelwiz import (
    CargoAttachmentEvidence,
    CargoItem,
    CargoRequest,
    PackageElement,
    TransportVector,
    TransportVectorZone,
    Voyage,
    VoyageManifest,
    VoyageStop,
)
from app.services.core.fsm_service import FSMError, fsm_service

PACKLOG_WORKFLOW_SLUG = "packlog-cargo-workflow"
PACKLOG_WORKFLOW_LEGACY_SLUGS = ("travelwiz-cargo-workflow",)
PACKLOG_WORKFLOW_ENTITY_TYPE = "cargo_item_workflow"

PACKLOG_PERMISSION_ALIASES: dict[str, tuple[str, ...]] = {
    "read": ("packlog.cargo.read", "travelwiz.cargo.read"),
    "read_all": ("packlog.cargo.read_all", "travelwiz.cargo.read_all"),
    "create": ("packlog.cargo.create", "travelwiz.cargo.create"),
    "update": ("packlog.cargo.update", "travelwiz.cargo.update"),
    "receive": ("packlog.cargo.receive", "travelwiz.cargo.receive"),
}

PACKLOG_PUBLIC_STATUS_LABELS = {
    "registered": "Enregistré",
    "ready": "Prêt au départ",
    "ready_for_loading": "Prêt au chargement",
    "loaded": "Chargé",
    "in_transit": "En transit",
    "delivered_intermediate": "Livré en escale",
    "delivered_final": "Livré",
    "damaged": "Signalé endommagé",
    "missing": "Signalé manquant",
    "return_declared": "Retour déclaré",
    "return_in_transit": "Retour en transit",
    "returned": "Retourné base",
    "reintegrated": "Réintégré stock",
    "scrapped": "Mis au rebut",
}


def _build_packlog_frontend_url(path: str) -> str:
    base_url = settings.FRONTEND_URL.rstrip("/")
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{base_url}{normalized_path}"


async def has_packlog_permission(
    user_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
    scope: str,
) -> bool:
    permissions = await get_user_permissions(user_id, entity_id, db)
    aliases = PACKLOG_PERMISSION_ALIASES.get(scope, ())
    return "*" in permissions or any(code in permissions for code in aliases)


def normalize_packlog_status(value: str) -> str:
    normalized = value.strip().lower()
    if normalized == "ready":
        return "ready_for_loading"
    return normalized


def ensure_packlog_request_parent(request_id: UUID | None) -> None:
    if request_id is None:
        raise HTTPException(
            400,
            {
                "code": "CARGO_REQUEST_REQUIRED",
                "message": "Chaque colis doit être rattaché à une demande d'expédition.",
            },
        )


def assess_packlog_workflow_requirements(cargo: dict[str, Any] | object) -> dict[str, Any]:
    def required_evidence_types(cargo_type: str | None) -> list[str]:
        required = ["cargo_photo", "weight_ticket", "transport_document"]
        if cargo_type in {"unit", "bulk", "hazmat"}:
            required.append("lifting_certificate")
        if cargo_type == "hazmat":
            required.append("hazmat_document")
        return required

    def value(key: str) -> Any:
        if isinstance(cargo, dict):
            return cargo.get(key)
        return getattr(cargo, key, None)

    missing: list[str] = []
    if not value("description"):
        missing.append("description")
    if not value("designation"):
        missing.append("designation")
    if not value("weight_kg"):
        missing.append("weight_kg")
    if not value("destination_asset_id"):
        missing.append("destination_asset_id")
    if not value("pickup_location_label"):
        missing.append("pickup_location_label")
    if not (value("pickup_contact_user_id") or value("pickup_contact_tier_contact_id") or value("pickup_contact_name")):
        missing.append("pickup_contact")
    if not value("available_from"):
        missing.append("available_from")
    if not value("imputation_reference_id"):
        missing.append("imputation_reference_id")
    cargo_type = value("cargo_type")
    evidence_counts = value("_evidence_counts") or {}
    for evidence_type in required_evidence_types(cargo_type):
        if int(evidence_counts.get(evidence_type, 0) or 0) <= 0:
            missing.append(evidence_type)
    if cargo_type == "hazmat" and not value("hazmat_validated"):
        missing.append("hazmat_validated")
    if cargo_type in {"unit", "bulk", "hazmat"} and not value("lifting_points_certified"):
        missing.append("lifting_points_certified")
    return {"is_complete": len(missing) == 0, "missing_requirements": missing}


def assess_packlog_request_requirements(
    cargo_request: dict[str, Any] | object,
    request_cargo: list[Any] | None = None,
) -> dict[str, Any]:
    def value(key: str) -> Any:
        if isinstance(cargo_request, dict):
            return cargo_request.get(key)
        return getattr(cargo_request, key, None)

    missing: list[str] = []
    if not value("title"):
        missing.append("title")
    if not value("description"):
        missing.append("description")
    if not value("sender_tier_id"):
        missing.append("sender_tier_id")
    if not value("receiver_name"):
        missing.append("receiver_name")
    if not value("destination_asset_id"):
        missing.append("destination_asset_id")
    if not value("imputation_reference_id"):
        missing.append("imputation_reference_id")
    if not (value("requester_user_id") or value("requester_name")):
        missing.append("requester")
    if not request_cargo:
        missing.append("cargo_items")
    return {"is_complete": len(missing) == 0, "missing_requirements": missing}


def packlog_request_to_payload(cargo_request: dict[str, Any] | object) -> dict[str, Any]:
    if isinstance(cargo_request, dict):
        return dict(cargo_request)
    table = getattr(cargo_request, "__table__", None)
    if table is not None:
        return {column.key: getattr(cargo_request, column.key) for column in table.columns}
    if hasattr(cargo_request, "__dict__"):
        return {key: value for key, value in vars(cargo_request).items() if not key.startswith("_")}
    raise TypeError("Unsupported cargo request payload object")


def estimate_packlog_surface_m2(cargo: object) -> float:
    explicit_surface = getattr(cargo, "surface_m2", None)
    if explicit_surface is not None:
        return float(explicit_surface or 0)
    width_cm = getattr(cargo, "width_cm", None)
    length_cm = getattr(cargo, "length_cm", None)
    package_count = int(getattr(cargo, "package_count", 1) or 1)
    if width_cm and length_cm:
        return round((float(width_cm) / 100.0) * (float(length_cm) / 100.0) * package_count, 3)
    return 0.0


def summarize_packlog_return_states(elements: list[Any]) -> dict[str, Any]:
    if not elements:
        return {
            "total_sent_units": 0.0,
            "total_returned_units": 0.0,
            "return_coverage_ratio": 0.0,
            "aggregate_return_status": "no_elements",
            "aggregate_disposition": "none",
        }

    total_sent_units = sum(float(getattr(element, "quantity_sent", 0) or 0) for element in elements)
    total_returned_units = sum(float(getattr(element, "quantity_returned", 0) or 0) for element in elements)
    finalized_statuses = {"reintegrated", "scrapped", "yard_storage"}
    finalized = [element for element in elements if (getattr(element, "return_status", "") or "") in finalized_statuses]

    aggregate_return_status = "not_started"
    if total_returned_units > 0:
        aggregate_return_status = "partial_return"
    if total_sent_units > 0 and total_returned_units >= total_sent_units:
        aggregate_return_status = "fully_returned"

    aggregate_disposition = "not_dispatched"
    if finalized:
        distinct = {getattr(element, "return_status", None) for element in finalized}
        aggregate_disposition = next(iter(distinct)) if len(distinct) == 1 and len(finalized) == len(elements) else "mixed"

    return {
        "total_sent_units": round(total_sent_units, 3),
        "total_returned_units": round(total_returned_units, 3),
        "return_coverage_ratio": round((total_returned_units / total_sent_units), 4) if total_sent_units > 0 else 0.0,
        "aggregate_return_status": aggregate_return_status,
        "aggregate_disposition": aggregate_disposition,
    }


async def get_packlog_cargo_or_404(
    db: AsyncSession,
    cargo_id: UUID,
    entity_id: UUID,
) -> CargoItem:
    result = await db.execute(
        select(CargoItem).where(
            CargoItem.id == cargo_id,
            CargoItem.entity_id == entity_id,
            CargoItem.active == True,  # noqa: E712
        )
    )
    cargo = result.scalars().first()
    if not cargo:
        raise HTTPException(404, "Cargo item not found")
    return cargo


async def get_packlog_package_element_or_404(
    db: AsyncSession,
    *,
    cargo_id: UUID,
    element_id: UUID,
) -> PackageElement:
    result = await db.execute(
        select(PackageElement).where(
            PackageElement.id == element_id,
            PackageElement.package_id == cargo_id,
        )
    )
    element = result.scalars().first()
    if not element:
        raise HTTPException(404, "Package element not found")
    return element


async def get_packlog_request_or_404(
    db: AsyncSession,
    request_id: UUID,
    entity_id: UUID,
) -> CargoRequest:
    result = await db.execute(
        select(CargoRequest).where(
            CargoRequest.id == request_id,
            CargoRequest.entity_id == entity_id,
            CargoRequest.active == True,  # noqa: E712
        )
    )
    cargo_request = result.scalars().first()
    if not cargo_request:
        raise HTTPException(404, "Cargo request not found")
    return cargo_request


async def try_packlog_workflow_transition(
    db: AsyncSession,
    *,
    cargo: CargoItem,
    to_state: str,
    actor_id: UUID,
    entity_id: UUID,
) -> None:
    try:
        instance = await fsm_service.get_instance(
            db,
            entity_type=PACKLOG_WORKFLOW_ENTITY_TYPE,
            entity_id=str(cargo.id),
        )
        if not instance:
            await fsm_service.get_or_create_instance(
                db,
                workflow_slug=PACKLOG_WORKFLOW_SLUG,
                entity_type=PACKLOG_WORKFLOW_ENTITY_TYPE,
                entity_id=str(cargo.id),
                initial_state=cargo.workflow_status,
                entity_id_scope=entity_id,
                created_by=actor_id,
            )
        await fsm_service.transition(
            db,
            workflow_slug=PACKLOG_WORKFLOW_SLUG,
            entity_type=PACKLOG_WORKFLOW_ENTITY_TYPE,
            entity_id=str(cargo.id),
            to_state=to_state,
            actor_id=actor_id,
            entity_id_scope=entity_id,
            skip_role_check=True,
        )
    except FSMError as exc:
        if "not found" not in str(exc).lower():
            raise HTTPException(400, str(exc)) from exc


async def build_packlog_cargo_read_data(
    db: AsyncSession,
    cargo: CargoItem,
    *,
    sender_name: str | None = None,
    destination_name: str | None = None,
    imputation_reference_code: str | None = None,
    imputation_reference_name: str | None = None,
) -> dict[str, Any]:
    data = {c.key: getattr(cargo, c.key) for c in cargo.__table__.columns}
    request_id = getattr(cargo, "request_id", None)
    sender_tier_id = getattr(cargo, "sender_tier_id", None)
    destination_asset_id = getattr(cargo, "destination_asset_id", None)
    imputation_reference_id = getattr(cargo, "imputation_reference_id", None)
    pickup_contact_user_id = getattr(cargo, "pickup_contact_user_id", None)
    pickup_contact_tier_contact_id = getattr(cargo, "pickup_contact_tier_contact_id", None)
    pickup_contact_name = getattr(cargo, "pickup_contact_name", None)
    planned_zone_id = getattr(cargo, "planned_zone_id", None)

    if sender_name is None and sender_tier_id:
        tier = await db.get(Tier, sender_tier_id)
        sender_name = tier.name if tier else None
    if destination_name is None and destination_asset_id:
        installation = await db.get(Installation, destination_asset_id)
        destination_name = installation.name if installation else None
    if imputation_reference_name is None and imputation_reference_id:
        imputation = await db.get(ImputationReference, imputation_reference_id)
        if imputation:
            imputation_reference_name = imputation.name
            imputation_reference_code = imputation.code

    pickup_contact_display_name = None
    if pickup_contact_user_id:
        pickup_user = await db.get(User, pickup_contact_user_id)
        if pickup_user:
            pickup_contact_display_name = f"{pickup_user.first_name} {pickup_user.last_name}".strip()
    elif pickup_contact_tier_contact_id:
        pickup_contact = await db.get(TierContact, pickup_contact_tier_contact_id)
        if pickup_contact:
            pickup_contact_display_name = f"{pickup_contact.first_name} {pickup_contact.last_name}".strip()
    elif pickup_contact_name:
        pickup_contact_display_name = pickup_contact_name

    request_code = None
    request_title = None
    if request_id:
        cargo_request = await db.get(CargoRequest, request_id)
        if cargo_request:
            request_code = cargo_request.request_code
            request_title = cargo_request.title
    planned_zone_name = None
    if planned_zone_id:
        planned_zone = await db.get(TransportVectorZone, planned_zone_id)
        planned_zone_name = planned_zone.name if planned_zone else None

    attachment_result = await db.execute(
        select(Attachment.id, Attachment.content_type).where(
            Attachment.owner_type == "cargo_item",
            Attachment.owner_id == cargo.id,
        )
    )
    attachment_rows = attachment_result.all()
    attachment_ids = [attachment_id for attachment_id, _content_type in attachment_rows]
    evidence_counts: dict[str, int] = {}
    if attachment_ids:
        evidence_result = await db.execute(
            select(CargoAttachmentEvidence.evidence_type, sqla_func.count(CargoAttachmentEvidence.id))
            .where(CargoAttachmentEvidence.attachment_id.in_(attachment_ids))
            .group_by(CargoAttachmentEvidence.evidence_type)
        )
        evidence_counts = {evidence_type: int(count) for evidence_type, count in evidence_result.all()}
    image_count = evidence_counts.get("cargo_photo", 0)
    document_count = sum(count for evidence_type, count in evidence_counts.items() if evidence_type != "cargo_photo")

    data["sender_name"] = sender_name
    data["destination_name"] = destination_name
    data["imputation_reference_code"] = imputation_reference_code
    data["imputation_reference_name"] = imputation_reference_name
    data["pickup_contact_display_name"] = pickup_contact_display_name
    data["request_code"] = request_code
    data["request_title"] = request_title
    data["planned_zone_name"] = planned_zone_name
    data["photo_evidence_count"] = max(int(getattr(cargo, "photo_evidence_count", 0) or 0), image_count)
    data["document_attachment_count"] = max(int(getattr(cargo, "document_attachment_count", 0) or 0), document_count)
    data["weight_ticket_provided"] = bool(getattr(cargo, "weight_ticket_provided", False) or evidence_counts.get("weight_ticket", 0) > 0)
    data["lifting_points_certified"] = bool(getattr(cargo, "lifting_points_certified", False) or evidence_counts.get("lifting_certificate", 0) > 0)
    data["_evidence_counts"] = evidence_counts
    return data


async def build_packlog_request_read_data(
    db: AsyncSession,
    cargo_request: CargoRequest,
    *,
    cargo_count: int | None = None,
) -> dict[str, Any]:
    data = {c.key: getattr(cargo_request, c.key) for c in cargo_request.__table__.columns}
    sender_name = None
    destination_name = None
    imputation_reference_code = None
    imputation_reference_name = None
    requester_display_name = None
    sender_contact_name = None
    if cargo_request.sender_tier_id:
        tier = await db.get(Tier, cargo_request.sender_tier_id)
        sender_name = tier.name if tier else None
    if cargo_request.sender_contact_tier_contact_id:
        sender_contact = await db.get(TierContact, cargo_request.sender_contact_tier_contact_id)
        if sender_contact:
            sender_contact_name = " ".join(
                part for part in [sender_contact.first_name, sender_contact.last_name] if part
            ).strip() or sender_contact.email or sender_contact.phone
    if cargo_request.destination_asset_id:
        installation = await db.get(Installation, cargo_request.destination_asset_id)
        destination_name = installation.name if installation else None
    if cargo_request.imputation_reference_id:
        imputation = await db.get(ImputationReference, cargo_request.imputation_reference_id)
        if imputation:
            imputation_reference_code = imputation.code
            imputation_reference_name = imputation.name
    if cargo_request.requester_user_id:
        requester = await db.get(User, cargo_request.requester_user_id)
        if requester:
            requester_display_name = " ".join(
                part for part in [requester.first_name, requester.last_name] if part
            ).strip() or requester.email
    if not requester_display_name:
        requester_display_name = cargo_request.requester_name
    request_cargo_result = await db.execute(
        select(
            CargoItem.id,
            CargoItem.workflow_status,
            CargoItem.manifest_id,
            CargoItem.status,
        ).where(
            CargoItem.request_id == cargo_request.id,
            CargoItem.active == True,  # noqa: E712
        )
    )
    request_cargo = request_cargo_result.all()
    if cargo_count is None:
        cargo_count = len(request_cargo)
    readiness = assess_packlog_request_requirements(cargo_request, request_cargo)
    data["cargo_count"] = cargo_count
    data["sender_name"] = sender_name
    data["destination_name"] = destination_name
    data["imputation_reference_code"] = imputation_reference_code
    data["imputation_reference_name"] = imputation_reference_name
    data["requester_display_name"] = requester_display_name
    data["sender_contact_name"] = sender_contact_name
    data["is_ready_for_submission"] = readiness["is_complete"]
    data["missing_requirements"] = readiness["missing_requirements"]
    return data


def _format_packlog_pdf_datetime(value: datetime | None) -> str:
    if value is None:
        return "--"
    return value.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M UTC")


async def _get_packlog_entity_pdf_context(db: AsyncSession, entity_id: UUID) -> dict[str, Any]:
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


async def build_packlog_operations_report(
    db: AsyncSession,
    *,
    voyage_id: UUID,
    entity_id: UUID,
) -> dict[str, Any]:
    cargo_result = await db.execute(
        select(CargoItem)
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.voyage_id == voyage_id,
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
            CargoItem.entity_id == entity_id,
        )
        .order_by(CargoItem.created_at.asc())
    )
    cargo_items = cargo_result.scalars().all()

    report_items: list[dict[str, Any]] = []
    delivered_count = 0
    damaged_count = 0
    missing_count = 0
    return_started_count = 0

    for cargo in cargo_items:
        destination_name = None
        request_code = None
        if cargo.destination_asset_id:
            destination = await db.get(Installation, cargo.destination_asset_id)
            destination_name = destination.name if destination else None
        if cargo.request_id:
            cargo_request = await db.get(CargoRequest, cargo.request_id)
            request_code = cargo_request.request_code if cargo_request else None

        element_result = await db.execute(
            select(PackageElement).where(PackageElement.package_id == cargo.id)
        )
        package_elements = element_result.scalars().all()
        return_summary = summarize_packlog_return_states(package_elements)

        if cargo.status in {"delivered_intermediate", "delivered_final"}:
            delivered_count += 1
        if cargo.status == "damaged":
            damaged_count += 1
        if cargo.status == "missing":
            missing_count += 1
        if cargo.status in {"return_declared", "return_in_transit", "returned", "reintegrated", "scrapped"} or return_summary["total_returned_units"] > 0:
            return_started_count += 1

        report_items.append(
            {
                "cargo_id": str(cargo.id),
                "tracking_code": cargo.tracking_code,
                "designation": cargo.designation,
                "description": cargo.description,
                "request_code": request_code,
                "status": cargo.status,
                "workflow_status": cargo.workflow_status,
                "destination_name": destination_name,
                "weight_kg": float(cargo.weight_kg or 0),
                "package_count": int(cargo.package_count or 0),
                "damage_notes": cargo.damage_notes,
                "received_at": cargo.received_at.isoformat() if cargo.received_at else None,
                "package_element_count": len(package_elements),
                **return_summary,
            }
        )

    return {
        "voyage_id": str(voyage_id),
        "cargo_count": len(report_items),
        "delivered_count": delivered_count,
        "damaged_count": damaged_count,
        "missing_count": missing_count,
        "return_started_count": return_started_count,
        "items": report_items,
    }


async def build_packlog_lt_variables(
    db: AsyncSession,
    *,
    cargo_request: CargoRequest,
    entity_id: UUID,
) -> dict[str, Any]:
    entity = await _get_packlog_entity_pdf_context(db, entity_id)
    request_payload = await build_packlog_request_read_data(db, cargo_request)
    cargo_rows = (
        await db.execute(
            select(CargoItem)
            .where(
                CargoItem.request_id == cargo_request.id,
                CargoItem.active == True,  # noqa: E712
            )
            .order_by(CargoItem.created_at.asc())
        )
    ).scalars().all()
    cargo_items: list[dict[str, Any]] = []
    total_weight = 0.0
    total_packages = 0
    status_breakdown = {
        "registered": 0,
        "ready_for_loading": 0,
        "loaded": 0,
        "in_transit": 0,
        "delivered_final": 0,
        "damaged": 0,
        "missing": 0,
    }
    request_url = _build_packlog_frontend_url(f"/packlog?request={cargo_request.id}")
    for cargo in cargo_rows:
        weight_value = float(cargo.weight_kg or 0)
        package_count = int(cargo.package_count or 0)
        total_weight += weight_value
        total_packages += package_count
        normalized_status = str(cargo.status or "")
        if normalized_status in status_breakdown:
            status_breakdown[normalized_status] += 1
        cargo_items.append(
            {
                "id": str(cargo.id),
                "tracking_code": cargo.tracking_code,
                "designation": cargo.designation,
                "description": cargo.description,
                "cargo_type": cargo.cargo_type,
                "weight_kg": round(weight_value, 2),
                "package_count": package_count,
                "status": cargo.status,
                "status_label": PACKLOG_PUBLIC_STATUS_LABELS.get(cargo.status, cargo.status),
                "qr_data": _build_packlog_frontend_url(f"/packlog?cargo={cargo.id}"),
                "qr_url": _build_packlog_frontend_url(f"/packlog?cargo={cargo.id}"),
            }
        )
    return {
        "entity": entity,
        "request_code": request_payload.get("request_code"),
        "request_title": request_payload.get("title"),
        "request_status": request_payload.get("status"),
        "sender_name": request_payload.get("sender_name"),
        "receiver_name": request_payload.get("receiver_name"),
        "destination_name": request_payload.get("destination_name"),
        "requester_name": request_payload.get("requester_display_name") or request_payload.get("requester_name"),
        "sender_contact_name": request_payload.get("sender_contact_name"),
        "description": request_payload.get("description"),
        "imputation_reference": " ".join(
            part
            for part in [
                request_payload.get("imputation_reference_code"),
                request_payload.get("imputation_reference_name"),
            ]
            if part
        ) or None,
        "request_qr_data": request_url,
        "request_qr_url": request_url,
        "request_ready": bool(request_payload.get("is_ready_for_submission")),
        "request_missing_requirements": request_payload.get("missing_requirements") or [],
        "cargo_items": cargo_items,
        "total_cargo_items": len(cargo_items),
        "total_weight_kg": round(total_weight, 2),
        "total_packages": total_packages,
        "status_breakdown": status_breakdown,
        "generated_at": _format_packlog_pdf_datetime(datetime.now(timezone.utc)),
    }


async def build_packlog_loading_options(
    db: AsyncSession,
    *,
    cargo_request: CargoRequest,
    entity_id: UUID,
) -> list[dict[str, Any]]:
    cargo_result = await db.execute(
        select(CargoItem).where(
            CargoItem.request_id == cargo_request.id,
            CargoItem.active == True,  # noqa: E712
        )
    )
    request_cargo = cargo_result.scalars().all()
    total_request_weight = float(sum(float(cargo.weight_kg or 0) for cargo in request_cargo))
    total_request_surface = round(sum(estimate_packlog_surface_m2(cargo) for cargo in request_cargo), 3)
    all_items_stackable = all(bool(getattr(cargo, "stackable", False)) for cargo in request_cargo) if request_cargo else False

    manifest_weight_sq = (
        select(
            VoyageManifest.voyage_id.label("voyage_id"),
            sqla_func.sum(CargoItem.weight_kg).label("assigned_weight_kg"),
        )
        .join(CargoItem, CargoItem.manifest_id == VoyageManifest.id)
        .where(
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
            CargoItem.active == True,  # noqa: E712
        )
        .group_by(VoyageManifest.voyage_id)
        .subquery()
    )

    manifest_sq = (
        select(
            VoyageManifest.voyage_id.label("voyage_id"),
            VoyageManifest.id.label("manifest_id"),
            VoyageManifest.status.label("manifest_status"),
        )
        .where(
            VoyageManifest.manifest_type == "cargo",
            VoyageManifest.active == True,  # noqa: E712
        )
        .subquery()
    )

    voyage_result = await db.execute(
        select(
            Voyage,
            TransportVector.name.label("vector_name"),
            TransportVector.weight_capacity_kg.label("weight_capacity_kg"),
            Installation.name.label("departure_base_name"),
            manifest_sq.c.manifest_id,
            manifest_sq.c.manifest_status,
            sqla_func.coalesce(manifest_weight_sq.c.assigned_weight_kg, 0).label("assigned_weight_kg"),
        )
        .join(TransportVector, Voyage.vector_id == TransportVector.id)
        .outerjoin(Installation, Voyage.departure_base_id == Installation.id)
        .outerjoin(manifest_sq, manifest_sq.c.voyage_id == Voyage.id)
        .outerjoin(manifest_weight_sq, manifest_weight_sq.c.voyage_id == Voyage.id)
        .where(
            Voyage.entity_id == entity_id,
            Voyage.active == True,  # noqa: E712
            Voyage.status.in_(["planned", "confirmed", "boarding", "delayed"]),
        )
        .order_by(Voyage.scheduled_departure.asc())
    )
    voyage_rows = voyage_result.all()
    voyage_ids = [voyage.id for voyage, *_ in voyage_rows]
    vector_ids = list({voyage.vector_id for voyage, *_ in voyage_rows})

    stop_assets_by_voyage: dict[UUID, set[UUID]] = {}
    if voyage_ids:
        stop_result = await db.execute(
            select(VoyageStop.voyage_id, VoyageStop.asset_id).where(
                VoyageStop.voyage_id.in_(voyage_ids),
                VoyageStop.active == True,  # noqa: E712
            )
        )
        for voyage_id, asset_id in stop_result.all():
            stop_assets_by_voyage.setdefault(voyage_id, set()).add(asset_id)

    zones_by_vector: dict[UUID, list[TransportVectorZone]] = {}
    if vector_ids:
        zone_result = await db.execute(
            select(TransportVectorZone).where(
                TransportVectorZone.vector_id.in_(vector_ids),
                TransportVectorZone.active == True,  # noqa: E712
            ).order_by(TransportVectorZone.name.asc())
        )
        for zone in zone_result.scalars().all():
            zones_by_vector.setdefault(zone.vector_id, []).append(zone)

    destination_asset_id = cargo_request.destination_asset_id
    options: list[dict[str, Any]] = []
    for voyage, vector_name, weight_capacity_kg, departure_base_name, manifest_id, manifest_status, assigned_weight_kg in voyage_rows:
        stop_assets = stop_assets_by_voyage.get(voyage.id, set())
        destination_match = bool(destination_asset_id and destination_asset_id in stop_assets)
        remaining_weight = None if weight_capacity_kg is None else max(float(weight_capacity_kg or 0) - float(assigned_weight_kg or 0), 0.0)
        compatible_zones: list[dict[str, Any]] = []
        for zone in zones_by_vector.get(voyage.vector_id, []):
            zone_surface = None
            if zone.width_m is not None and zone.length_m is not None:
                zone_surface = round(float(zone.width_m) * float(zone.length_m), 3)
            zone_weight_limit = float(zone.max_weight_kg) if zone.max_weight_kg is not None else None
            surface_ok = zone_surface is None or total_request_surface <= zone_surface or (all_items_stackable and total_request_surface <= zone_surface * 1.25)
            weight_ok = zone_weight_limit is None or total_request_weight <= zone_weight_limit
            if surface_ok and weight_ok:
                compatible_zones.append(
                    {
                        "zone_id": str(zone.id),
                        "zone_name": zone.name,
                        "zone_type": zone.zone_type,
                        "surface_m2": zone_surface,
                        "max_weight_kg": zone_weight_limit,
                    }
                )
        blocking_reasons: list[str] = []
        if destination_asset_id and not destination_match:
            blocking_reasons.append("destination_mismatch")
        if manifest_status and manifest_status != "draft":
            blocking_reasons.append("manifest_not_draft")
        if remaining_weight is not None and total_request_weight > remaining_weight:
            blocking_reasons.append("insufficient_weight_capacity")
        if zones_by_vector.get(voyage.vector_id) and not compatible_zones:
            blocking_reasons.append("no_zone_capacity_match")
        can_load = len(blocking_reasons) == 0
        options.append(
            {
                "voyage_id": voyage.id,
                "voyage_code": voyage.code,
                "voyage_status": voyage.status,
                "scheduled_departure": voyage.scheduled_departure,
                "vector_id": voyage.vector_id,
                "vector_name": vector_name,
                "departure_base_name": departure_base_name,
                "manifest_id": manifest_id,
                "manifest_status": manifest_status,
                "destination_match": destination_match,
                "remaining_weight_kg": remaining_weight,
                "total_request_weight_kg": total_request_weight,
                "total_request_surface_m2": total_request_surface,
                "all_items_stackable": all_items_stackable,
                "compatible_zones": compatible_zones,
                "requires_manifest_creation": manifest_id is None,
                "can_load": can_load,
                "blocking_reasons": blocking_reasons,
            }
        )
    return options
