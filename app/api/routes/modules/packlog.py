"""PackLog API routes.

This namespace hosts the cargo/package public surface for PackLog while
remaining compatible with legacy TravelWiz permissions during the migration.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_any_permission
from app.core.database import get_db
from app.models.common import User
from app.schemas.common import PaginatedResponse
from app.core.pagination import PaginationParams
from app.schemas.travelwiz import (
    BackCargoReturnRequest,
    CargoAttachmentEvidenceRead,
    CargoAttachmentEvidenceUpdate,
    CargoCreate,
    CargoRead,
    CargoRequestCreate,
    CargoRequestRead,
    CargoRequestUpdate,
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

router = APIRouter(prefix="/api/v1/packlog", tags=["packlog"])

PACKLOG_READ = require_any_permission("packlog.cargo.read", "travelwiz.cargo.read")
PACKLOG_CREATE = require_any_permission("packlog.cargo.create", "travelwiz.cargo.create")
PACKLOG_UPDATE = require_any_permission("packlog.cargo.update", "travelwiz.cargo.update")
PACKLOG_RECEIVE = require_any_permission("packlog.cargo.receive", "travelwiz.cargo.receive")


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
