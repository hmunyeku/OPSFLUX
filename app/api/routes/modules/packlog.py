"""PackLog API routes."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.database import get_db
from app.models.common import User
from app.schemas.common import PaginatedResponse
from app.core.pagination import PaginationParams
from app.schemas.packlog import (
    BackCargoReturnRequest,
    CargoAttachmentEvidenceRead,
    CargoAttachmentEvidenceUpdate,
    CargoCreate,
    CargoRead,
    CargoRequestCreate,
    CargoRequestRead,
    CargoRequestUpdate,
    CargoScanConfirmRequest,
    CargoScanHistoryEntry,
    CargoScanRequest,
    CargoTrackingRead,
    CargoUpdate,
    CargoStatusUpdate,
    CargoWorkflowStatusUpdate,
    CargoReceiptConfirm,
    CargoLoadingOptionRead,
    PackageElementDispositionUpdate,
    PackageElementReturnUpdate,
    VoyageCargoTrackingRead,
)
from app.api.routes.modules.packlog_shared import (
    add_package_element_impl,
    apply_cargo_request_loading_option_impl,
    create_cargo_impl,
    create_cargo_request_impl,
    download_cargo_request_lt_pdf_impl,
    get_cargo_compliance_check_impl,
    get_cargo_history_impl,
    get_cargo_impl,
    get_cargo_request_impl,
    get_cargo_request_loading_options_impl,
    get_public_cargo_tracking_impl,
    get_public_voyage_cargo_tracking_impl,
    initiate_return_impl,
    list_cargo_attachment_evidence_impl,
    list_cargo_impl,
    list_cargo_requests_impl,
    list_package_elements_impl,
    receive_cargo_impl,
    sap_match_impl,
    set_cargo_attachment_evidence_type_impl,
    update_cargo_impl,
    update_cargo_request_impl,
    update_cargo_status_impl,
    update_cargo_workflow_status_impl,
    update_package_element_disposition_impl,
    update_package_element_return_impl,
)
from app.services.modules.packlog_service import (
    create_packlog_article_catalog_entry,
    get_packlog_article_catalog_entry,
    import_packlog_article_catalog_csv,
    list_packlog_article_catalog,
)
from app.core.errors import StructuredHTTPException

router = APIRouter(prefix="/api/v1/packlog", tags=["packlog"], dependencies=[require_module_enabled("packlog")])

PACKLOG_READ = require_permission("packlog.cargo.read")
PACKLOG_CREATE = require_permission("packlog.cargo.create")
PACKLOG_UPDATE = require_permission("packlog.cargo.update")
PACKLOG_RECEIVE = require_permission("packlog.cargo.receive")


@router.get("/cargo-requests", response_model=PaginatedResponse[CargoRequestRead])
async def list_cargo_requests(
    search: str | None = None,
    status: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_requests_impl(
        search=search,
        status=status,
        pagination=pagination,
        entity_id=entity_id,
        db=db,
    )


@router.post("/cargo-requests", response_model=CargoRequestRead, status_code=201)
async def create_cargo_request(
    body: CargoRequestCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_CREATE,
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
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_request_impl(
        request_id=request_id,
        entity_id=entity_id,
        db=db,
    )


@router.get("/cargo-requests/{request_id}/pdf/lt")
async def download_cargo_request_lt_pdf(
    request_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
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
    _: None = PACKLOG_UPDATE,
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
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_request_loading_options_impl(
        request_id=request_id,
        entity_id=entity_id,
        db=db,
    )


@router.post("/cargo-requests/{request_id}/loading-options/{voyage_id}/apply", response_model=CargoRequestRead)
async def apply_cargo_request_loading_option(
    request_id: UUID,
    voyage_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
    db: AsyncSession = Depends(get_db),
):
    return await apply_cargo_request_loading_option_impl(
        request_id=request_id,
        voyage_id=voyage_id,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo", response_model=PaginatedResponse[CargoRead])
async def list_cargo(
    request: Request,
    search: str | None = None,
    status: str | None = None,
    cargo_type: str | None = None,
    manifest_id: UUID | None = None,
    destination_asset_id: UUID | None = None,
    request_id: UUID | None = None,
    scope: str = "all",
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_impl(
        request=request,
        search=search,
        status=status,
        cargo_type=cargo_type,
        manifest_id=manifest_id,
        destination_asset_id=destination_asset_id,
        request_id=request_id,
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
    _: None = PACKLOG_CREATE,
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
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_impl(
        cargo_id=cargo_id,
        entity_id=entity_id,
        db=db,
    )


@router.get("/public/cargo/{tracking_code}", response_model=CargoTrackingRead)
async def get_public_cargo_tracking(
    tracking_code: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_public_cargo_tracking_impl(tracking_code=tracking_code, db=db)


@router.get("/public/voyages/{voyage_code}/cargo", response_model=VoyageCargoTrackingRead)
async def get_public_voyage_cargo_tracking(
    voyage_code: str,
    db: AsyncSession = Depends(get_db),
):
    return await get_public_voyage_cargo_tracking_impl(voyage_code=voyage_code, db=db)


@router.patch("/cargo/{cargo_id}", response_model=CargoRead)
async def update_cargo(
    cargo_id: UUID,
    body: CargoUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        db=db,
    )


@router.patch("/cargo/{cargo_id}/status", response_model=CargoRead)
async def update_cargo_status(
    cargo_id: UUID,
    body: CargoStatusUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_status_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.patch("/cargo/{cargo_id}/workflow-status", response_model=CargoRead)
async def update_cargo_workflow_status(
    cargo_id: UUID,
    body: CargoWorkflowStatusUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
    db: AsyncSession = Depends(get_db),
):
    return await update_cargo_workflow_status_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo/by-tracking/{tracking_code}", response_model=CargoRead)
async def get_cargo_by_tracking_code(
    tracking_code: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    """Resolve a cargo by its human-scannable tracking_code.

    Used by the authenticated mobile scanner so it can hand off to
    the /scan endpoint (which requires the UUID).
    """
    from app.models.packlog import CargoItem
    from sqlalchemy import select as _select
    from app.api.routes.modules.packlog_shared import build_packlog_cargo_read_data

    row = await db.execute(
        _select(CargoItem).where(
            CargoItem.tracking_code == tracking_code,
            CargoItem.entity_id == entity_id,
            CargoItem.active == True,  # noqa: E712
        ).limit(1)
    )
    cargo = row.scalar_one_or_none()
    if cargo is None:
        raise StructuredHTTPException(
            404,
            code="CARGO_NOT_FOUND",
            message="Cargo not found",
        )
    return await build_packlog_cargo_read_data(db, cargo)


# ─── Cargo Scan (GPS-stamped tracking) ──────────────────────────────────────
#
# Any authorized user with `packlog.cargo.read` can record a scan. Status
# transition via scan requires `packlog.cargo.update` in addition.

PACKLOG_SCAN_LIST = require_permission("packlog.cargo.read")


@router.post("/cargo/{cargo_id}/scan")
async def scan_cargo(
    cargo_id: UUID,
    body: CargoScanRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    """Log a GPS-stamped scan and return the location-match + status suggestion."""
    from app.services.modules.packlog_scan_service import record_scan
    from app.services.modules.packlog_service import get_packlog_cargo_or_404
    from app.api.deps import has_user_permission

    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    result = await record_scan(
        db,
        cargo=cargo,
        user=current_user,
        lat=body.lat,
        lon=body.lon,
        accuracy_m=body.accuracy_m,
        scanned_at=body.scanned_at,
        device_id=body.device_id,
        note=body.note,
    )

    # Hydrate the cargo view so the mobile has everything in one response.
    from app.api.routes.modules.packlog_shared import build_packlog_cargo_read_data
    result["cargo"] = await build_packlog_cargo_read_data(db, cargo)
    result["can_update_status"] = await has_user_permission(
        current_user, entity_id, "packlog.cargo.update", db
    )

    # Information-disclosure guard (SEC-M1): only surface nearby
    # installations when the user has `asset.read`. Without the
    # permission we keep the matched one (the match IS the actionable
    # value) but scrub the alternatives. Prevents an attacker from
    # enumerating the entity's installation topology by sweeping GPS.
    can_read_assets = await has_user_permission(
        current_user, entity_id, "asset.read", db
    )
    if not can_read_assets:
        result["nearby_installations"] = []
    return result


@router.post("/cargo/{cargo_id}/scan/confirm")
async def confirm_cargo_scan(
    cargo_id: UUID,
    body: CargoScanConfirmRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    """Apply the operator's confirmation (confirm location + optional status change)."""
    from app.services.modules.packlog_scan_service import confirm_scan
    from app.services.modules.packlog_service import get_packlog_cargo_or_404
    from app.api.deps import has_user_permission

    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)

    # Status change requires the update permission on top of read.
    if body.new_status and body.new_status != cargo.status:
        allowed = await has_user_permission(
            current_user, entity_id, "packlog.cargo.update", db
        )
        if not allowed:
            raise StructuredHTTPException(
                403,
                code="PERMISSION_DENIED_PACKLOG_CARGO_UPDATE_REQUIRED",
                message="Permission denied: packlog.cargo.update required to change status via scan",
            )

    await confirm_scan(
        db,
        cargo=cargo,
        user=current_user,
        scan_event_id=body.scan_event_id,
        confirmed_asset_id=body.confirmed_asset_id,
        new_status=body.new_status,
        note=body.note,
    )

    # Return the updated cargo so the mobile screen can refresh.
    from app.api.routes.modules.packlog_shared import build_packlog_cargo_read_data
    return await build_packlog_cargo_read_data(db, cargo)


@router.get("/cargo/{cargo_id}/scan-history", response_model=list[CargoScanHistoryEntry])
async def get_cargo_scan_history(
    cargo_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    """Return the N most recent scan events for this cargo (newest first)."""
    from app.models.packlog import CargoScanEvent
    from app.models.asset_registry import Installation
    from app.models.common import User as UserModel
    from app.services.modules.packlog_service import get_packlog_cargo_or_404
    from sqlalchemy import select

    await get_packlog_cargo_or_404(db, cargo_id, entity_id)
    rows = (await db.execute(
        select(CargoScanEvent)
        .where(
            CargoScanEvent.cargo_item_id == cargo_id,
            CargoScanEvent.entity_id == entity_id,
        )
        .order_by(CargoScanEvent.scanned_at.desc())
        .limit(limit)
    )).scalars().all()

    # N+1-avoidant batch lookup of asset names + user names.
    asset_ids = {e.matched_asset_id for e in rows if e.matched_asset_id}
    asset_ids |= {e.confirmed_asset_id for e in rows if e.confirmed_asset_id}
    user_ids = {e.user_id for e in rows if e.user_id}
    asset_map: dict = {}
    if asset_ids:
        for inst in (await db.execute(
            select(Installation).where(Installation.id.in_(list(asset_ids)))
        )).scalars():
            asset_map[inst.id] = inst
    user_map: dict = {}
    if user_ids:
        for u in (await db.execute(
            select(UserModel).where(UserModel.id.in_(list(user_ids)))
        )).scalars():
            user_map[u.id] = u

    out: list[dict] = []
    for e in rows:
        display_user = None
        if e.user_id and e.user_id in user_map:
            u = user_map[e.user_id]
            # Never fall back to email — that would leak employee
            # addresses to any viewer with packlog.cargo.read (SEC-M2).
            fullname = f"{u.first_name or ''} {u.last_name or ''}".strip()
            display_user = fullname or f"Opérateur #{str(u.id)[:8]}"
        matched_asset_name = None
        if e.matched_asset_id and e.matched_asset_id in asset_map:
            matched_asset_name = asset_map[e.matched_asset_id].name
        out.append({
            "id": e.id,
            "scanned_at": e.scanned_at,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "accuracy_m": e.accuracy_m,
            "matched_asset_id": e.matched_asset_id,
            "matched_asset_name": matched_asset_name,
            "matched_distance_m": e.matched_distance_m,
            "confirmed_asset_id": e.confirmed_asset_id,
            "status_before": e.status_before,
            "status_after": e.status_after,
            "action": e.action,
            "note": e.note,
            "user_id": e.user_id,
            "user_display_name": display_user,
            "device_id": e.device_id,
        })
    return out


@router.get("/cargo/{cargo_id}/label.pdf")
async def download_cargo_label_pdf(
    cargo_id: UUID,
    language: str = Query(default="fr", description="Label language (fr, en)"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    """Generate a printable 10×15cm label PDF for this cargo.

    The QR code embedded in the label contains the tracking_code, which
    is what the mobile scanner reads to fire a scan event against this
    cargo.
    """
    from app.core.pdf_templates import generate_qr_base64, render_pdf
    from app.services.modules.packlog_service import get_packlog_cargo_or_404
    from app.models.common import Entity
    from app.models.asset_registry import Installation
    from datetime import datetime as _dt, timezone as _tz
    from fastapi.responses import Response
    from sqlalchemy import select as _select

    cargo = await get_packlog_cargo_or_404(db, cargo_id, entity_id)

    # Load related display names (single round-trip each).
    entity = await db.get(Entity, entity_id)
    destination = None
    if cargo.destination_asset_id:
        destination = await db.get(Installation, cargo.destination_asset_id)

    sender_name = None
    if cargo.sender_tier_id:
        from app.models.common import Tier
        sender = await db.get(Tier, cargo.sender_tier_id)
        sender_name = sender.name if sender else None

    request_code = None
    if cargo.request_id:
        from app.models.packlog import CargoRequest
        req = await db.get(CargoRequest, cargo.request_id)
        request_code = req.request_code if req else None

    # Cache the rendered PDF for 1h — WeasyPrint is expensive and the
    # content doesn't change between scans (SEC-H4 DoS mitigation).
    from app.core.redis_client import get_redis
    cache_key = f"cargo_label_pdf:{cargo.id}:{cargo.tracking_code}:{language}"
    try:
        redis = get_redis()
        cached_b64 = await redis.get(cache_key)
        if cached_b64:
            import base64 as _b64
            cached_bytes = _b64.b64decode(cached_b64)
            import re as _re
            safe_cached = _re.sub(r"[^A-Za-z0-9._-]", "_", cargo.tracking_code)[:60] or "cargo"
            from fastapi.responses import Response as _Resp
            return _Resp(
                content=cached_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f'inline; filename="label_{safe_cached}.pdf"',
                    "X-Cache": "HIT",
                },
            )
    except Exception:
        redis = None  # fall through to live render

    # QR code payload = tracking_code (simple + scannable by any mobile).
    qr_data_uri = generate_qr_base64(cargo.tracking_code, box_size=8, border=1)

    variables = {
        "tracking_code": cargo.tracking_code,
        "reference": cargo.tracking_code,  # human-visible reference
        "description": cargo.description,
        "cargo_type": cargo.cargo_type,
        "weight_kg": cargo.weight_kg,
        "sender_name": sender_name,
        "recipient_name": cargo.receiver_name,
        "destination_name": destination.name if destination else None,
        "hazmat": bool(cargo.hazmat_validated),
        "request_code": request_code,
        "qr_code_data_uri": qr_data_uri,
        "entity": {"name": entity.name if entity else ""},
        "generated_at": _dt.now(_tz.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }

    pdf_bytes = await render_pdf(
        db,
        slug="packlog.cargo_label",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise StructuredHTTPException(
            404,
            code="TEMPLATE_PACKLOG_CARGO_LABEL_INTROUVABLE_SEED",
            message="Template 'packlog.cargo_label' introuvable — seed via scripts/seed_pdf_templates.",
        )
    # Populate the Redis cache (1h TTL) for subsequent requests.
    if redis is not None:
        try:
            import base64 as _b64
            await redis.set(cache_key, _b64.b64encode(pdf_bytes), ex=3600)
        except Exception:
            pass

    # Defensive: tracking_code is server-generated today but sanitize
    # anyway — any future bulk-import / SAP sync path that allows \r\n
    # or quotes in tracking_code would otherwise open a header-injection
    # primitive (SEC-M3). Keep only ASCII alnum + dash + dot.
    import re as _re
    safe_code = _re.sub(r"[^A-Za-z0-9._-]", "_", cargo.tracking_code)[:60] or "cargo"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="label_{safe_code}.pdf"',
            "X-Cache": "MISS",
        },
    )


@router.get("/cargo/{cargo_id}/compliance-check")
async def get_cargo_compliance_check(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_compliance_check_impl(
        cargo_id=cargo_id,
        entity_id=entity_id,
        db=db,
    )


@router.get("/cargo/{cargo_id}/attachment-evidence", response_model=list[CargoAttachmentEvidenceRead])
async def list_cargo_attachment_evidence(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await list_cargo_attachment_evidence_impl(
        cargo_id=cargo_id,
        entity_id=entity_id,
        db=db,
    )


@router.put("/cargo/{cargo_id}/attachments/{attachment_id}/evidence-type", response_model=CargoAttachmentEvidenceRead)
async def set_cargo_attachment_evidence_type(
    cargo_id: UUID,
    attachment_id: UUID,
    body: CargoAttachmentEvidenceUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
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


@router.post("/cargo/{cargo_id}/receive", response_model=CargoRead)
async def receive_cargo(
    cargo_id: UUID,
    body: CargoReceiptConfirm,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_RECEIVE,
    db: AsyncSession = Depends(get_db),
):
    return await receive_cargo_impl(
        cargo_id=cargo_id,
        body=body,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )


@router.get("/cargo/{cargo_id}/history")
async def get_cargo_history(
    cargo_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await get_cargo_history_impl(
        cargo_id=cargo_id,
        entity_id=entity_id,
        db=db,
    )


@router.post("/cargo/{cargo_id}/return")
async def initiate_return(
    cargo_id: UUID,
    body: BackCargoReturnRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_UPDATE,
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
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await list_package_elements_impl(
        cargo_id=cargo_id,
        entity_id=entity_id,
        db=db,
    )


@router.post("/cargo/{cargo_id}/elements", status_code=201)
async def add_package_element(
    cargo_id: UUID,
    description: str,
    quantity: int = 1,
    weight_kg: float | None = None,
    sap_code: str | None = None,
    notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    _: None = PACKLOG_CREATE,
    current_user: User = Depends(get_current_user),
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
    _: None = PACKLOG_UPDATE,
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
    _: None = PACKLOG_UPDATE,
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
    _: None = PACKLOG_CREATE,
    db: AsyncSession = Depends(get_db),
):
    return await sap_match_impl(description=description, entity_id=entity_id, db=db)


@router.get("/articles")
async def list_articles(
    search: str | None = None,
    sap_code: str | None = None,
    management_type: str | None = None,
    is_hazmat: bool | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
):
    return await list_packlog_article_catalog(
        db,
        entity_id=entity_id,
        search=search,
        sap_code=sap_code,
        management_type=management_type,
        is_hazmat=is_hazmat,
    )


@router.get("/articles/{article_id}")
async def get_article(
    article_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_READ,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    article = await get_packlog_article_catalog_entry(
        db,
        entity_id=entity_id,
        article_id=article_id,
    )
    if not article:
        raise StructuredHTTPException(
            404,
            code="ARTICLE_INTROUVABLE",
            message="Article introuvable",
        )
    return article


@router.post("/articles", status_code=201)
async def create_article(
    sap_code: str,
    description: str,
    management_type: str = "standard",
    unit: str = "EA",
    is_hazmat: bool = False,
    hazmat_class: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_CREATE,
    db: AsyncSession = Depends(get_db),
):
    return await create_packlog_article_catalog_entry(
        db,
        entity_id=entity_id,
        sap_code=sap_code,
        description=description,
        management_type=management_type,
        unit=unit,
        is_hazmat=is_hazmat,
        hazmat_class=hazmat_class,
    )


@router.post("/articles/import-csv")
async def import_articles_csv(
    file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = PACKLOG_CREATE,
    db: AsyncSession = Depends(get_db),
):
    try:
        raw_bytes = await file.read()
        return await import_packlog_article_catalog_csv(
            db,
            entity_id=entity_id,
            filename=file.filename,
            raw_bytes=raw_bytes,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
