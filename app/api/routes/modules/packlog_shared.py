from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import func as sqla_func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.acting_context import get_effective_actor_user_id
from app.core.audit import record_audit
from app.core.pagination import PaginationParams, paginate
from app.models.asset_registry import Installation
from app.models.common import Attachment, AuditLog, ImputationReference, Tier, TierContact, User, UserGroup, UserGroupMember
from app.models.packlog import (
    CargoAttachmentEvidence,
    CargoItem,
    CargoRequest,
    PackageElement,
)
from app.models.travelwiz import (
    TransportVector,
    TransportVectorZone,
    Voyage,
    VoyageManifest,
)
from app.schemas.packlog import (
    BackCargoReturnRequest,
    CargoAttachmentEvidenceUpdate,
    CargoCreate,
    CargoReceiptConfirm,
    CargoRequestCreate,
    CargoRequestUpdate,
    CargoStatusUpdate,
    CargoUpdate,
    CargoWorkflowStatusUpdate,
    PackageElementDispositionUpdate,
    PackageElementReturnUpdate,
    CargoTrackingRead,
    VoyageCargoTrackingRead,
)
from app.services.core.fsm_service import fsm_service
from app.services.modules import compliance_service
from app.services.modules.packlog_service import (
    PACKLOG_WORKFLOW_ENTITY_TYPE,
    PACKLOG_WORKFLOW_SLUG,
    assess_packlog_request_requirements,
    assess_packlog_workflow_requirements,
    build_packlog_cargo_read_data,
    build_packlog_loading_options,
    build_packlog_lt_variables,
    build_packlog_request_read_data,
    ensure_packlog_request_parent,
    get_packlog_cargo_or_404,
    get_packlog_package_element_or_404,
    get_packlog_request_or_404,
    has_packlog_permission,
    initiate_packlog_back_cargo,
    match_packlog_sap_code,
    normalize_packlog_status,
    packlog_request_to_payload,
    update_packlog_cargo_status,
    try_packlog_workflow_transition,
)


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
            else datetime.now(timezone.utc).isoformat()
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


async def _generate_cargo_code(db: AsyncSession, entity_id: UUID) -> str:
    from app.core.references import generate_reference

    return await generate_reference("CGO", db, entity_id=entity_id)


async def _generate_cargo_request_code(db: AsyncSession, entity_id: UUID) -> str:
    from app.core.references import generate_reference

    return await generate_reference("LT", db, entity_id=entity_id)


async def _user_has_access_to_entity(db: AsyncSession, *, user_id: UUID, entity_id: UUID) -> bool:
    membership_exists = await db.execute(
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
        )
        .limit(1)
    )
    if membership_exists.scalar_one_or_none() is not None:
        return True
    user = await db.get(User, user_id)
    return bool(user and user.active and user.default_entity_id == entity_id)


async def _validate_cargo_request_refs(
    db: AsyncSession,
    *,
    entity_id: UUID,
    sender_tier_id: UUID | None,
    sender_contact_tier_contact_id: UUID | None,
    requester_user_id: UUID | None,
    imputation_reference_id: UUID | None,
) -> None:
    if imputation_reference_id:
        imputation = await db.get(ImputationReference, imputation_reference_id)
        if not imputation or imputation.entity_id != entity_id or not imputation.active:
            raise HTTPException(400, "Imputation introuvable ou inactive")
    if sender_tier_id:
        sender_tier = await db.get(Tier, sender_tier_id)
        if not sender_tier or sender_tier.entity_id != entity_id or not sender_tier.active:
            raise HTTPException(400, "Entreprise expeditrice introuvable ou inactive")
    if requester_user_id:
        requester = await db.get(User, requester_user_id)
        if not requester or not requester.active or not await _user_has_access_to_entity(db, user_id=requester_user_id, entity_id=entity_id):
            raise HTTPException(400, "Demandeur introuvable ou hors entite")
    if sender_contact_tier_contact_id:
        sender_contact = await db.get(TierContact, sender_contact_tier_contact_id)
        if not sender_contact or not sender_contact.active:
            raise HTTPException(400, "Contact entreprise introuvable ou inactif")
        if not sender_tier_id:
            raise HTTPException(400, "Selectionnez d'abord une entreprise expeditrice")
        if sender_contact.tier_id != sender_tier_id:
            raise HTTPException(400, "Le contact entreprise ne correspond pas a l'entreprise expeditrice")


async def list_cargo_requests_impl(
    *,
    status: str | None,
    search: str | None,
    pagination: PaginationParams,
    entity_id: UUID,
    db: AsyncSession,
):
    cargo_count_sq = (
        select(
            CargoItem.request_id.label("request_id"),
            sqla_func.count(CargoItem.id).label("cargo_count"),
        )
        .where(CargoItem.active == True)  # noqa: E712
        .group_by(CargoItem.request_id)
        .subquery()
    )
    query = (
        select(
            CargoRequest,
            sqla_func.coalesce(cargo_count_sq.c.cargo_count, 0).label("cargo_count"),
        )
        .outerjoin(cargo_count_sq, cargo_count_sq.c.request_id == CargoRequest.id)
        .where(
            CargoRequest.entity_id == entity_id,
            CargoRequest.active == True,  # noqa: E712
        )
        .order_by(CargoRequest.created_at.desc())
    )
    if status:
        query = query.where(CargoRequest.status == status)
    if search:
        like = f"%{search}%"
        query = query.where(
            CargoRequest.request_code.ilike(like)
            | CargoRequest.title.ilike(like)
            | CargoRequest.description.ilike(like)
        )

    async def _transform(row):
        cargo_request, cargo_count = row
        return await build_packlog_request_read_data(
            db,
            cargo_request,
            cargo_count=int(cargo_count or 0),
        )

    return await paginate(db, query, pagination, transform=_transform)


async def create_cargo_request_impl(
    *,
    body: CargoRequestCreate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    await _validate_cargo_request_refs(
        db,
        entity_id=entity_id,
        sender_tier_id=body.sender_tier_id,
        sender_contact_tier_contact_id=body.sender_contact_tier_contact_id,
        requester_user_id=body.requester_user_id,
        imputation_reference_id=body.imputation_reference_id,
    )
    request_code = await _generate_cargo_request_code(db, entity_id)
    now = datetime.now(timezone.utc)

    # Extract inline cargos from payload — handled separately below
    payload = body.model_dump()
    inline_cargos = payload.pop("cargos", []) or []

    cargo_request = CargoRequest(
        entity_id=entity_id,
        request_code=request_code,
        requested_by=current_user.id,
        created_at=now,
        updated_at=now,
        **payload,
    )
    db.add(cargo_request)
    await db.flush()  # assign ID without final commit
    await db.refresh(cargo_request)

    # Create inline cargo items (atomic with the request)
    created_cargos = 0
    for cargo_data in inline_cargos:
        tracking_code = await _generate_cargo_code(db, entity_id)
        cargo_item = CargoItem(
            entity_id=entity_id,
            request_id=cargo_request.id,
            tracking_code=tracking_code,
            # Inherit context from request
            project_id=cargo_request.project_id,
            imputation_reference_id=cargo_request.imputation_reference_id,
            sender_tier_id=cargo_request.sender_tier_id,
            receiver_name=cargo_request.receiver_name,
            destination_asset_id=cargo_request.destination_asset_id,
            requester_name=cargo_request.requester_name,
            registered_by=current_user.id,
            # Cargo-specific fields from the inline payload
            description=cargo_data["description"],
            designation=cargo_data.get("designation"),
            cargo_type=cargo_data["cargo_type"],
            weight_kg=cargo_data["weight_kg"],
            package_count=cargo_data.get("package_count", 1),
            width_cm=cargo_data.get("width_cm"),
            length_cm=cargo_data.get("length_cm"),
            height_cm=cargo_data.get("height_cm"),
            stackable=cargo_data.get("stackable", False),
            sap_article_code=cargo_data.get("sap_article_code"),
            hazmat_validated=cargo_data.get("hazmat_validated", False),
        )
        db.add(cargo_item)
        created_cargos += 1

    await db.commit()
    await db.refresh(cargo_request)

    await record_audit(
        db,
        action="packlog.cargo_request.create",
        resource_type="cargo_request",
        resource_id=str(cargo_request.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "request_code": cargo_request.request_code,
            "status": cargo_request.status,
            "inline_cargos_created": created_cargos,
        },
    )
    await db.commit()
    return await build_packlog_request_read_data(db, cargo_request, cargo_count=created_cargos)


async def get_cargo_request_impl(*, request_id: UUID, entity_id: UUID, db: AsyncSession):
    cargo_request = await get_packlog_request_or_404(db, request_id, entity_id)
    return await build_packlog_request_read_data(db, cargo_request)


async def download_cargo_request_lt_pdf_impl(
    *,
    request_id: UUID,
    language: str,
    entity_id: UUID,
    db: AsyncSession,
):
    from app.core.pdf_templates import render_pdf

    cargo_request = await get_packlog_request_or_404(db, request_id, entity_id)
    variables = await build_packlog_lt_variables(db, cargo_request=cargo_request, entity_id=entity_id)
    pdf_bytes = await render_pdf(
        db,
        slug="cargo.lt",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise HTTPException(404, "Template PDF 'cargo.lt' introuvable. Initialisez-le dans Parametres > Modeles PDF.")
    filename = f"{cargo_request.request_code}_lt.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename=\"{filename}\"'},
    )


async def update_cargo_request_impl(
    *,
    request_id: UUID,
    body: CargoRequestUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo_request = await get_packlog_request_or_404(db, request_id, entity_id)
    next_sender_tier_id = body.sender_tier_id if "sender_tier_id" in body.model_fields_set else cargo_request.sender_tier_id
    await _validate_cargo_request_refs(
        db,
        entity_id=entity_id,
        sender_tier_id=next_sender_tier_id,
        sender_contact_tier_contact_id=body.sender_contact_tier_contact_id if "sender_contact_tier_contact_id" in body.model_fields_set else cargo_request.sender_contact_tier_contact_id,
        requester_user_id=body.requester_user_id if "requester_user_id" in body.model_fields_set else cargo_request.requester_user_id,
        imputation_reference_id=body.imputation_reference_id if "imputation_reference_id" in body.model_fields_set else cargo_request.imputation_reference_id,
    )
    target_status = body.status or cargo_request.status
    request_payload = packlog_request_to_payload(cargo_request)
    request_payload.update(body.model_dump(exclude_unset=True))
    cargo_result = await db.execute(
        select(CargoItem).where(
            CargoItem.request_id == cargo_request.id,
            CargoItem.active == True,  # noqa: E712
        )
    )
    request_cargo = cargo_result.scalars().all()
    readiness = assess_packlog_request_requirements(request_payload, request_cargo)
    if target_status in {"submitted", "approved", "assigned", "closed"} and not readiness["is_complete"]:
        raise HTTPException(
            400,
            {
                "code": "CARGO_REQUEST_INCOMPLETE",
                "message": "La demande d'expédition est incomplète.",
                "missing_requirements": readiness["missing_requirements"],
            },
        )
    if target_status == "approved":
        invalid_cargo = [
            cargo.tracking_code
            for cargo in request_cargo
            if cargo.workflow_status not in {"approved", "assigned", "in_transit", "delivered"}
        ]
        if invalid_cargo:
            raise HTTPException(
                400,
                {
                    "code": "CARGO_REQUEST_REQUIRES_APPROVED_ITEMS",
                    "message": "Tous les colis doivent être validés avant approbation de la demande.",
                    "tracking_codes": invalid_cargo,
                },
            )
    if target_status == "assigned":
        unassigned_cargo = [cargo.tracking_code for cargo in request_cargo if not cargo.manifest_id]
        if unassigned_cargo:
            raise HTTPException(
                400,
                {
                    "code": "CARGO_REQUEST_REQUIRES_ASSIGNED_ITEMS",
                    "message": "Tous les colis doivent être affectés à un manifeste/voyage.",
                    "tracking_codes": unassigned_cargo,
                },
            )
    if target_status == "closed":
        open_cargo = [
            cargo.tracking_code
            for cargo in request_cargo
            if cargo.status not in {"delivered", "delivered_intermediate", "delivered_final"}
        ]
        if open_cargo:
            raise HTTPException(
                400,
                {
                    "code": "CARGO_REQUEST_REQUIRES_DELIVERED_ITEMS",
                    "message": "Tous les colis doivent être livrés avant clôture de la demande.",
                    "tracking_codes": open_cargo,
                },
            )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(cargo_request, field, value)
    await db.commit()
    await db.refresh(cargo_request)
    await record_audit(
        db,
        action="packlog.cargo_request.update",
        resource_type="cargo_request",
        resource_id=str(cargo_request.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"status": cargo_request.status},
    )
    await db.commit()
    return await build_packlog_request_read_data(db, cargo_request)


async def get_cargo_request_loading_options_impl(*, request_id: UUID, entity_id: UUID, db: AsyncSession):
    cargo_request = await get_packlog_request_or_404(db, request_id, entity_id)
    return await build_packlog_loading_options(db, cargo_request=cargo_request, entity_id=entity_id)


async def apply_cargo_request_loading_option_impl(
    *,
    request_id: UUID,
    voyage_id: UUID,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo_request = await get_packlog_request_or_404(db, request_id, entity_id)
    if cargo_request.status not in {"approved", "assigned"}:
        raise HTTPException(400, "La demande doit être approuvée avant affectation à un voyage")
    loading_options = await build_packlog_loading_options(db, cargo_request=cargo_request, entity_id=entity_id)
    selected_option = next((option for option in loading_options if option["voyage_id"] == voyage_id), None)
    if not selected_option:
        raise HTTPException(404, "Voyage de chargement introuvable")
    if not selected_option["can_load"]:
        raise HTTPException(
            400,
            {
                "code": "CARGO_REQUEST_LOADING_OPTION_BLOCKED",
                "message": "Le voyage sélectionné ne peut pas recevoir cette demande.",
                "blocking_reasons": selected_option["blocking_reasons"],
            },
        )
    voyage = await _get_voyage_or_404(db, voyage_id, entity_id)
    manifest_id = selected_option["manifest_id"]
    manifest: VoyageManifest | None = None
    if manifest_id:
        manifest = await db.get(VoyageManifest, manifest_id)
    if manifest is None:
        manifest = VoyageManifest(voyage_id=voyage.id, manifest_type="cargo", status="draft")
        db.add(manifest)
        await db.flush()
    cargo_result = await db.execute(
        select(CargoItem).where(
            CargoItem.request_id == cargo_request.id,
            CargoItem.active == True,  # noqa: E712
        )
    )
    request_cargo = cargo_result.scalars().all()
    assigned_tracking_codes: list[str] = []
    workflow_transitioned: list[tuple[CargoItem, str]] = []
    for cargo in request_cargo:
        cargo.manifest_id = manifest.id
        if selected_option["compatible_zones"]:
            cargo.planned_zone_id = UUID(selected_option["compatible_zones"][0]["zone_id"])
        if cargo.workflow_status == "approved":
            await try_packlog_workflow_transition(
                db,
                cargo=cargo,
                to_state="assigned",
                actor_id=current_user.id,
                entity_id=entity_id,
            )
            workflow_transitioned.append((cargo, cargo.workflow_status))
            cargo.workflow_status = "assigned"
        assigned_tracking_codes.append(cargo.tracking_code)
    cargo_request.status = "assigned"
    await db.commit()
    await db.refresh(cargo_request)
    for cargo, previous_status in workflow_transitioned:
        await fsm_service.emit_transition_event(
            entity_type=PACKLOG_WORKFLOW_ENTITY_TYPE,
            entity_id=str(cargo.id),
            from_state=previous_status,
            to_state=cargo.workflow_status,
            actor_id=current_user.id,
            workflow_slug=PACKLOG_WORKFLOW_SLUG,
        )
    await record_audit(
        db,
        action="packlog.cargo_request.assign_to_voyage",
        resource_type="cargo_request",
        resource_id=str(cargo_request.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "voyage_id": str(voyage.id),
            "voyage_code": voyage.code,
            "manifest_id": str(manifest.id),
            "tracking_codes": assigned_tracking_codes,
        },
    )
    await db.commit()
    return await build_packlog_request_read_data(db, cargo_request)


async def list_cargo_impl(
    *,
    request: Request,
    status: str | None,
    cargo_type: str | None,
    manifest_id: UUID | None,
    destination_asset_id: UUID | None,
    request_id: UUID | None,
    search: str | None,
    scope: str | None,
    pagination: PaginationParams,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    query = (
        select(
            CargoItem,
            CargoRequest.request_code.label("request_code"),
            CargoRequest.title.label("request_title"),
            Tier.name.label("sender_name"),
            Installation.name.label("destination_name"),
            ImputationReference.code.label("imputation_reference_code"),
            ImputationReference.name.label("imputation_reference_name"),
        )
        .outerjoin(CargoRequest, CargoItem.request_id == CargoRequest.id)
        .outerjoin(Tier, CargoItem.sender_tier_id == Tier.id)
        .outerjoin(Installation, CargoItem.destination_asset_id == Installation.id)
        .outerjoin(ImputationReference, CargoItem.imputation_reference_id == ImputationReference.id)
        .where(CargoItem.entity_id == entity_id, CargoItem.active == True)  # noqa: E712
    )
    if scope == "my":
        query = query.where(CargoItem.registered_by == acting_user_id)
    elif scope != "all":
        can_read_all = await has_packlog_permission(current_user.id, entity_id, db, "read_all")
        if not can_read_all:
            query = query.where(CargoItem.registered_by == acting_user_id)
    if status:
        query = query.where(CargoItem.status == status)
    if cargo_type:
        query = query.where(CargoItem.cargo_type == cargo_type)
    if manifest_id:
        query = query.where(CargoItem.manifest_id == manifest_id)
    if destination_asset_id:
        query = query.where(CargoItem.destination_asset_id == destination_asset_id)
    if request_id:
        query = query.where(CargoItem.request_id == request_id)
    if search:
        like = f"%{search}%"
        query = query.where(CargoItem.tracking_code.ilike(like) | CargoItem.description.ilike(like))
    query = query.order_by(CargoItem.created_at.desc())

    def _transform(row):
        item = row[0]
        d = {c.key: getattr(item, c.key) for c in item.__table__.columns}
        d["request_code"] = row[1]
        d["request_title"] = row[2]
        d["sender_name"] = row[3]
        d["destination_name"] = row[4]
        d["imputation_reference_code"] = row[5]
        d["imputation_reference_name"] = row[6]
        d["pickup_contact_display_name"] = item.pickup_contact_name
        return d

    return await paginate(db, query, pagination, transform=_transform)


async def create_cargo_impl(
    *,
    body: CargoCreate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    ensure_packlog_request_parent(body.request_id)
    await _validate_cargo_dossier_refs(db, entity_id=entity_id, payload=body)
    payload_data = body.model_dump()
    cargo_request = await get_packlog_request_or_404(db, body.request_id, entity_id)
    for cargo_field, request_field in (
        ("project_id", "project_id"),
        ("imputation_reference_id", "imputation_reference_id"),
        ("sender_tier_id", "sender_tier_id"),
        ("receiver_name", "receiver_name"),
        ("destination_asset_id", "destination_asset_id"),
        ("requester_name", "requester_name"),
    ):
        payload_data[cargo_field] = getattr(cargo_request, request_field, None)
    if payload_data.get("manifest_id"):
        manifest_result = await db.execute(select(VoyageManifest).where(VoyageManifest.id == payload_data["manifest_id"]))
        manifest = manifest_result.scalars().first()
        if manifest:
            voyage_result = await db.execute(select(Voyage).where(Voyage.id == manifest.voyage_id))
            voyage = voyage_result.scalars().first()
            if voyage:
                vector = await db.get(TransportVector, voyage.vector_id)
                if vector and vector.weight_capacity_kg:
                    weight_result = await db.execute(
                        select(sqla_func.coalesce(sqla_func.sum(CargoItem.weight_kg), 0))
                        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
                        .where(
                            VoyageManifest.voyage_id == voyage.id,
                            VoyageManifest.manifest_type == "cargo",
                            CargoItem.active == True,
                        )
                    )
                    current_weight = float(weight_result.scalar() or 0)
                    if current_weight + float(payload_data["weight_kg"]) > vector.weight_capacity_kg:
                        raise HTTPException(
                            400,
                            f"Weight capacity exceeded: vector allows {vector.weight_capacity_kg} kg, current load is {current_weight} kg, new item weighs {payload_data['weight_kg']} kg",
                        )
    tracking_code = await _generate_cargo_code(db, entity_id)
    cargo = CargoItem(entity_id=entity_id, tracking_code=tracking_code, registered_by=current_user.id, **payload_data)
    db.add(cargo)
    await db.commit()
    await db.refresh(cargo)
    await record_audit(
        db,
        action="packlog.cargo.create",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "tracking_code": cargo.tracking_code,
            "status": cargo.status,
            "manifest_id": str(cargo.manifest_id) if cargo.manifest_id else None,
            "cargo_type": cargo.cargo_type,
            "workflow_status": cargo.workflow_status,
        },
    )
    await db.commit()
    return await build_packlog_cargo_read_data(db, cargo)


async def get_cargo_impl(*, cargo_id: UUID, entity_id: UUID, db: AsyncSession):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    return await build_packlog_cargo_read_data(db, cargo)


async def list_cargo_attachment_evidence_impl(*, cargo_id: UUID, entity_id: UUID, db: AsyncSession):
    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    result = await db.execute(
        select(
            Attachment.id,
            CargoAttachmentEvidence.evidence_type,
            Attachment.original_name,
            Attachment.content_type,
            Attachment.created_at,
        )
        .select_from(Attachment)
        .outerjoin(CargoAttachmentEvidence, CargoAttachmentEvidence.attachment_id == Attachment.id)
        .where(Attachment.owner_type == "cargo_item", Attachment.owner_id == cargo_id)
        .order_by(Attachment.created_at.desc())
    )
    return [
        {
            "attachment_id": attachment_id,
            "evidence_type": evidence_type or "other",
            "original_name": original_name,
            "content_type": content_type,
            "created_at": created_at,
        }
        for attachment_id, evidence_type, original_name, content_type, created_at in result.all()
    ]


async def set_cargo_attachment_evidence_type_impl(
    *,
    cargo_id: UUID,
    attachment_id: UUID,
    body: CargoAttachmentEvidenceUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    attachment_result = await db.execute(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.owner_type == "cargo_item",
            Attachment.owner_id == cargo_id,
        )
    )
    attachment = attachment_result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(404, "Pièce jointe cargo introuvable")
    evidence_result = await db.execute(
        select(CargoAttachmentEvidence).where(CargoAttachmentEvidence.attachment_id == attachment_id)
    )
    evidence = evidence_result.scalar_one_or_none()
    if evidence:
        evidence.evidence_type = body.evidence_type
    else:
        evidence = CargoAttachmentEvidence(
            entity_id=entity_id,
            cargo_item_id=cargo_id,
            attachment_id=attachment_id,
            evidence_type=body.evidence_type,
            created_by=current_user.id,
        )
        db.add(evidence)
    await db.commit()
    await db.refresh(evidence)
    return {
        "attachment_id": attachment.id,
        "evidence_type": evidence.evidence_type,
        "original_name": attachment.original_name,
        "content_type": attachment.content_type,
        "created_at": attachment.created_at,
    }


async def get_cargo_history_impl(*, cargo_id: UUID, entity_id: UUID, db: AsyncSession):
    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    result = await db.execute(
        select(AuditLog, User.first_name, User.last_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.resource_type == "cargo_item",
            AuditLog.resource_id == str(cargo_id),
        )
        .order_by(AuditLog.created_at.desc())
    )
    return [
        _serialize_cargo_history_entry(
            entry,
            " ".join(part for part in [first_name, last_name] if part) or None,
        )
        for entry, first_name, last_name in result.all()
    ]


async def update_cargo_impl(*, cargo_id: UUID, body: CargoUpdate, entity_id: UUID, db: AsyncSession):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    await _validate_cargo_dossier_refs(db, entity_id=entity_id, payload=body)
    changes = body.model_dump(exclude_unset=True)
    resulting_request_id = changes["request_id"] if "request_id" in changes else cargo.request_id
    ensure_packlog_request_parent(resulting_request_id)
    cargo_request = await get_packlog_request_or_404(db, resulting_request_id, entity_id)
    for cargo_field, request_field in (
        ("project_id", "project_id"),
        ("imputation_reference_id", "imputation_reference_id"),
        ("sender_tier_id", "sender_tier_id"),
        ("receiver_name", "receiver_name"),
        ("destination_asset_id", "destination_asset_id"),
        ("requester_name", "requester_name"),
    ):
        changes[cargo_field] = getattr(cargo_request, request_field, None)
    for field, value in changes.items():
        setattr(cargo, field, value)
    await db.commit()
    await db.refresh(cargo)
    if changes:
        await record_audit(
            db,
            action="packlog.cargo.update",
            resource_type="cargo_item",
            resource_id=str(cargo.id),
            user_id=None,
            entity_id=entity_id,
            details={"changes": changes},
        )
        await db.commit()
    return await build_packlog_cargo_read_data(db, cargo)


async def get_cargo_compliance_check_impl(
    *,
    cargo_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    cargo_payload = await build_packlog_cargo_read_data(db, cargo)
    return await compliance_service.evaluate_packlog_cargo_compliance(
        db,
        entity_id=entity_id,
        cargo_context=cargo_payload,
    )


async def update_cargo_workflow_status_impl(
    *,
    cargo_id: UUID,
    body: CargoWorkflowStatusUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    current_payload = await build_packlog_cargo_read_data(db, cargo)
    if body.workflow_status in {"ready_for_review", "approved"}:
        readiness = assess_packlog_workflow_requirements(current_payload)
        if not readiness["is_complete"]:
            raise HTTPException(
                400,
                {
                    "code": "CARGO_DOSSIER_INCOMPLETE",
                    "message": "Le dossier cargo est incomplet pour cette étape workflow.",
                    "missing_requirements": readiness["missing_requirements"],
                },
            )
        compliance_payload = {
            **current_payload,
            "target_workflow_status": body.workflow_status,
        }
        compliance_verdict = await compliance_service.evaluate_packlog_cargo_compliance(
            db,
            entity_id=entity_id,
            cargo_context=compliance_payload,
        )
        if not compliance_verdict["is_compliant"]:
            raise HTTPException(
                400,
                {
                    "code": "PACKLOG_COMPLIANCE_RULES_FAILED",
                    "message": "Le dossier PackLog ne respecte pas les règles de conformité applicables.",
                    "compliance": compliance_verdict,
                },
            )
    previous_status = cargo.workflow_status
    await try_packlog_workflow_transition(
        db,
        cargo=cargo,
        to_state=body.workflow_status,
        actor_id=current_user.id,
        entity_id=entity_id,
    )
    cargo.workflow_status = body.workflow_status
    await db.commit()
    await db.refresh(cargo)
    await fsm_service.emit_transition_event(
        entity_type=PACKLOG_WORKFLOW_ENTITY_TYPE,
        entity_id=str(cargo.id),
        from_state=previous_status,
        to_state=cargo.workflow_status,
        actor_id=current_user.id,
        workflow_slug=PACKLOG_WORKFLOW_SLUG,
    )
    await record_audit(
        db,
        action="packlog.cargo.workflow_status",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"from_status": previous_status, "to_status": cargo.workflow_status},
    )
    await db.commit()
    return await build_packlog_cargo_read_data(db, cargo)


async def update_cargo_status_impl(
    *,
    cargo_id: UUID,
    body: CargoStatusUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    target_status = normalize_packlog_status(body.status)
    previous_status = cargo.status
    if body.damage_notes is not None:
        cargo.damage_notes = body.damage_notes
    try:
        await update_packlog_cargo_status(
            db,
            cargo_item_id=cargo.id,
            new_status=target_status,
            entity_id=entity_id,
            user_id=current_user.id,
            location_asset_id=cargo.destination_asset_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if body.damage_notes is not None:
        cargo.damage_notes = body.damage_notes
    await db.commit()
    await db.refresh(cargo)
    await record_audit(
        db,
        action="packlog.cargo.status",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"from_status": previous_status, "to_status": cargo.status, "damage_notes": body.damage_notes},
    )
    await db.commit()
    return await build_packlog_cargo_read_data(db, cargo)


async def receive_cargo_impl(
    *,
    cargo_id: UUID,
    body: CargoReceiptConfirm | None,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    if cargo.status not in ("in_transit", "delivered_intermediate"):
        raise HTTPException(400, f"Cannot receive cargo in status '{cargo.status}'")
    receipt = body or CargoReceiptConfirm()
    if receipt.damage_notes and receipt.photo_evidence_count <= 0:
        raise HTTPException(
            400,
            {
                "code": "CARGO_DAMAGE_EVIDENCE_REQUIRED",
                "message": "Une photo de preuve est obligatoire en cas de dommage à la réception.",
            },
        )
    previous_status = cargo.status
    cargo.damage_notes = receipt.damage_notes
    try:
        await update_packlog_cargo_status(
            db,
            cargo_item_id=cargo.id,
            new_status="delivered_final",
            entity_id=entity_id,
            user_id=current_user.id,
            location_asset_id=cargo.destination_asset_id,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await db.commit()
    await db.refresh(cargo)
    await record_audit(
        db,
        action="packlog.cargo.receive",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "from_status": previous_status,
            "to_status": cargo.status,
            "received_at": cargo.received_at.isoformat() if cargo.received_at else None,
            "received_quantity": receipt.received_quantity,
            "declared_quantity": receipt.declared_quantity if receipt.declared_quantity is not None else float(cargo.package_count or 0),
            "recipient_available": receipt.recipient_available,
            "signature_collected": receipt.signature_collected,
            "damage_notes": receipt.damage_notes,
            "photo_evidence_count": receipt.photo_evidence_count,
            "notes": receipt.notes,
        },
    )
    await db.commit()
    return await build_packlog_cargo_read_data(db, cargo)


async def initiate_return_impl(
    *,
    cargo_id: UUID,
    body: BackCargoReturnRequest,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    try:
        result = await initiate_packlog_back_cargo(
            db,
            cargo_item_id=cargo_id,
            entity_id=entity_id,
            user_id=current_user.id,
            return_type=body.return_type,
            notes=body.notes,
            return_metadata={
                "waste_manifest_ref": body.waste_manifest_ref,
                "pass_number": body.pass_number,
                "inventory_reference": body.inventory_reference,
                "sap_code_confirmed": body.sap_code_confirmed,
                "photo_evidence_count": body.photo_evidence_count,
                "double_signature_confirmed": body.double_signature_confirmed,
                "yard_justification": body.yard_justification,
            },
        )
        await db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


async def list_package_elements_impl(*, cargo_id: UUID, entity_id: UUID, db: AsyncSession):
    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    result = await db.execute(
        select(PackageElement).where(PackageElement.package_id == cargo_id).order_by(PackageElement.description.asc())
    )
    return [_serialize_package_element(element) for element in result.scalars().all()]


async def add_package_element_impl(
    *,
    cargo_id: UUID,
    description: str,
    quantity: int,
    weight_kg: float | None,
    sap_code: str | None,
    notes: str | None,
    entity_id: UUID,
    db: AsyncSession,
):
    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    normalized_description = description.strip()
    if not normalized_description:
        raise HTTPException(400, "Description is required")
    if quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than zero")
    normalized_sap_code = sap_code.strip() if isinstance(sap_code, str) and sap_code.strip() else None
    normalized_notes = notes.strip() if isinstance(notes, str) and notes.strip() else None
    element = PackageElement(
        package_id=cargo_id,
        description=normalized_description,
        quantity_sent=Decimal(str(quantity)),
        unit_weight_kg=Decimal(str(weight_kg)) if weight_kg is not None else None,
        sap_code=normalized_sap_code,
        sap_code_status="matched" if normalized_sap_code else "unknown",
        management_type="manual",
        unit_of_measure="unit",
        return_notes=normalized_notes,
    )
    db.add(element)
    await db.flush()
    await db.commit()
    await db.refresh(element)
    return _serialize_package_element(element)


async def update_package_element_return_impl(
    *,
    cargo_id: UUID,
    element_id: UUID,
    body: PackageElementReturnUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    element = await get_packlog_package_element_or_404(db, cargo_id=cargo_id, element_id=element_id)
    quantity_sent = float(element.quantity_sent or 0)
    quantity_returned = float(body.quantity_returned)
    if quantity_returned > quantity_sent:
        raise HTTPException(
            400,
            {
                "code": "PACKAGE_RETURN_EXCEEDS_SENT",
                "message": "La quantité retournée ne peut pas dépasser la quantité expédiée.",
            },
        )
    element.quantity_returned = Decimal(str(quantity_returned))
    if quantity_returned <= 0:
        element.return_status = "pending"
    elif quantity_returned < quantity_sent:
        element.return_status = "partial"
    else:
        element.return_status = "returned"
    if body.return_notes is not None:
        element.return_notes = body.return_notes
    if quantity_returned > 0:
        target_status = "returned" if quantity_returned >= quantity_sent else "return_in_transit"
        if cargo.status != target_status:
            try:
                await apply_cargo_status_transition(
                    db,
                    cargo_item_id=cargo.id,
                    new_status=target_status,
                    entity_id=entity_id,
                    user_id=current_user.id,
                    location_asset_id=cargo.destination_asset_id,
                )
            except ValueError as exc:
                raise HTTPException(400, str(exc)) from exc
    await db.commit()
    await db.refresh(element)
    await record_audit(
        db,
        action="packlog.cargo.element_return",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "element_id": str(element.id),
            "quantity_sent": quantity_sent,
            "quantity_returned": quantity_returned,
            "return_status": element.return_status,
            "return_notes": element.return_notes,
        },
    )
    await db.commit()
    return _serialize_package_element(element)


async def update_package_element_disposition_impl(
    *,
    cargo_id: UUID,
    element_id: UUID,
    body: PackageElementDispositionUpdate,
    entity_id: UUID,
    current_user: User,
    db: AsyncSession,
):
    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    element = await get_packlog_package_element_or_404(db, cargo_id=cargo_id, element_id=element_id)
    if float(element.quantity_returned or 0) <= 0:
        raise HTTPException(
            400,
            {
                "code": "PACKAGE_RETURN_REQUIRED",
                "message": "Aucun retour partiel ou complet n'a encore été déclaré pour cet élément.",
            },
        )
    element.return_status = body.return_status
    if body.return_notes is not None:
        element.return_notes = body.return_notes
    mapped_cargo_status = {"returned": "returned", "reintegrated": "reintegrated", "scrapped": "scrapped", "yard_storage": "returned"}
    target_status = mapped_cargo_status.get(body.return_status)
    if target_status and cargo.status != target_status:
        try:
            await apply_cargo_status_transition(
                db,
                cargo_item_id=cargo.id,
                new_status=target_status,
                entity_id=entity_id,
                user_id=current_user.id,
                location_asset_id=cargo.destination_asset_id,
            )
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    await db.commit()
    await db.refresh(element)
    await record_audit(
        db,
        action="packlog.cargo.element_disposition",
        resource_type="cargo_item",
        resource_id=str(cargo.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"element_id": str(element.id), "return_status": element.return_status, "return_notes": element.return_notes},
    )
    await db.commit()
    return _serialize_package_element(element)


async def sap_match_impl(*, description: str, entity_id: UUID, db: AsyncSession):
    return await match_packlog_sap_code(db, description=description, entity_id=entity_id)


def _build_public_cargo_tracking_event(entry: AuditLog) -> dict:
    details = entry.details or {}
    action = entry.action
    if action in {"travelwiz.cargo.create", "packlog.cargo.create"}:
        label = "Expédition enregistrée"
        description = details.get("cargo_type")
    elif action in {"travelwiz.cargo.status", "packlog.cargo.status"}:
        next_status = details.get("to_status")
        label = str(next_status or "Statut mis à jour")
        description = details.get("damage_notes")
    elif action in {"travelwiz.cargo.receive", "packlog.cargo.receive"}:
        label = "Réception confirmée"
        description = None
    elif action in {"travelwiz.cargo.update", "packlog.cargo.update"}:
        label = "Informations mises à jour"
        changed = details.get("changes")
        description = ", ".join(changed.keys()) if isinstance(changed, dict) and changed else None
    else:
        label = action
        description = None
    return {
        "code": action,
        "label": label,
        "occurred_at": entry.created_at,
        "description": description,
    }


async def get_public_cargo_tracking_impl(*, tracking_code: str, db: AsyncSession) -> dict:
    cargo_result = await db.execute(
        select(
            CargoItem,
            Tier.name.label("sender_name"),
            Installation.name.label("destination_name"),
            Voyage.code.label("voyage_code"),
        )
        .outerjoin(Tier, CargoItem.sender_tier_id == Tier.id)
        .outerjoin(Installation, CargoItem.destination_asset_id == Installation.id)
        .outerjoin(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .outerjoin(Voyage, VoyageManifest.voyage_id == Voyage.id)
        .where(CargoItem.tracking_code == tracking_code, CargoItem.active == True)  # noqa: E712
    )
    row = cargo_result.first()
    if not row:
        raise HTTPException(404, "Cargo tracking not found")
    cargo, sender_name, destination_name, voyage_code = row
    history_result = await db.execute(
        select(AuditLog)
        .where(AuditLog.resource_type == "cargo_item", AuditLog.resource_id == str(cargo.id))
        .order_by(AuditLog.created_at.asc())
    )
    audit_entries = history_result.scalars().all()
    events = [_build_public_cargo_tracking_event(entry) for entry in audit_entries]
    last_event_at = events[-1]["occurred_at"] if events else cargo.created_at
    return {
        "tracking_code": cargo.tracking_code,
        "description": cargo.description,
        "cargo_type": cargo.cargo_type,
        "status": cargo.status,
        "status_label": cargo.status,
        "weight_kg": cargo.weight_kg,
        "width_cm": cargo.width_cm,
        "length_cm": cargo.length_cm,
        "height_cm": cargo.height_cm,
        "sender_name": sender_name,
        "receiver_name": cargo.receiver_name,
        "destination_name": destination_name,
        "voyage_code": voyage_code,
        "received_at": cargo.received_at,
        "last_event_at": last_event_at,
        "events": events,
    }


async def get_public_voyage_cargo_tracking_impl(*, voyage_code: str, db: AsyncSession) -> dict:
    voyage_result = await db.execute(select(Voyage).where(Voyage.code == voyage_code, Voyage.active == True))  # noqa: E712
    voyage = voyage_result.scalar_one_or_none()
    if not voyage:
        raise HTTPException(404, "Voyage not found")
    cargo_result = await db.execute(
        select(CargoItem, Installation.name.label("destination_name"))
        .join(VoyageManifest, CargoItem.manifest_id == VoyageManifest.id)
        .outerjoin(Installation, CargoItem.destination_asset_id == Installation.id)
        .where(
            VoyageManifest.voyage_id == voyage.id,
            VoyageManifest.manifest_type == "cargo",
            CargoItem.active == True,  # noqa: E712
        )
        .order_by(CargoItem.created_at.asc())
    )
    items = []
    for cargo, destination_name in cargo_result.all():
        last_event_result = await db.execute(
            select(AuditLog.created_at)
            .where(AuditLog.resource_type == "cargo_item", AuditLog.resource_id == str(cargo.id))
            .order_by(AuditLog.created_at.desc())
            .limit(1)
        )
        items.append(
            {
                "tracking_code": cargo.tracking_code,
                "description": cargo.description,
                "cargo_type": cargo.cargo_type,
                "status": cargo.status,
                "status_label": cargo.status,
                "destination_name": destination_name,
                "receiver_name": cargo.receiver_name,
                "weight_kg": cargo.weight_kg,
                "manifest_id": cargo.manifest_id,
                "last_event_at": last_event_result.scalar_one_or_none(),
            }
        )
    return {
        "voyage_code": voyage.code,
        "voyage_status": voyage.status,
        "voyage_status_label": voyage.status,
        "scheduled_departure": voyage.scheduled_departure,
        "scheduled_arrival": voyage.scheduled_arrival,
        "cargo_count": len(items),
        "items": items,
    }
