"""Import assistant API — universal Excel/CSV import with saved mappings."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.common import ImportMapping, User
from app.schemas.import_assistant import (
    AutoDetectRequest,
    AutoDetectResponse,
    ImportExecuteRequest,
    ImportExecuteResponse,
    ImportMappingCreate,
    ImportMappingRead,
    ImportMappingUpdate,
    ImportPreviewRequest,
    ImportPreviewResponse,
    TargetObjectInfo,
)
from app.services.modules.import_service import (
    auto_detect_mapping,
    execute_import,
    get_target_objects,
    validate_import,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/import", tags=["import"])

# Permission mapping: target_object -> required permission
_PERMISSION_MAP: dict[str, str] = {
    "asset": "asset.create",
    "tier": "tier.create",
    "contact": "tier.create",
    "pax_profile": "paxlog.ads.create",
    "project": "project.create",
    "compliance_record": "conformite.create",
}


# ── Target metadata ───────────────────────────────────────────────────────


@router.get("/targets", response_model=list[TargetObjectInfo])
async def list_import_targets(
    current_user: User = Depends(get_current_user),
):
    """Return all importable target objects and their field definitions."""
    return get_target_objects()


# ── Auto-detect ───────────────────────────────────────────────────────────


@router.post("/auto-detect", response_model=AutoDetectResponse)
async def detect_mapping(
    body: AutoDetectRequest,
    current_user: User = Depends(get_current_user),
):
    """Suggest column mappings by fuzzy-matching file headers to target fields."""
    mapping, confidence = auto_detect_mapping(body.target_object, body.file_headers)
    return AutoDetectResponse(suggested_mapping=mapping, confidence=confidence)


# ── Validate / Preview ────────────────────────────────────────────────────


@router.post("/validate", response_model=ImportPreviewResponse)
async def validate_import_data(
    body: ImportPreviewRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Validate rows without importing. Returns per-row errors/warnings."""
    result = await validate_import(
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        rows=body.rows,
        duplicate_strategy=body.duplicate_strategy,
        entity_id=entity_id,
        db=db,
    )
    return ImportPreviewResponse(**result)


# ── Execute import ────────────────────────────────────────────────────────


@router.post("/execute", response_model=ImportExecuteResponse)
async def execute_import_data(
    body: ImportExecuteRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute the import with permission check based on target_object."""
    perm = _PERMISSION_MAP.get(body.target_object)
    if perm and not await has_user_permission(current_user, entity_id, perm, db):
        raise HTTPException(status_code=403, detail=f"Permission denied: {perm}")

    result = await execute_import(
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        rows=body.rows,
        duplicate_strategy=body.duplicate_strategy,
        entity_id=entity_id,
        user_id=current_user.id,
        db=db,
    )

    # Update mapping usage stats if mapping_id provided
    if body.mapping_id:
        await db.execute(
            update(ImportMapping)
            .where(ImportMapping.id == body.mapping_id)
            .values(last_used_at=datetime.now(UTC), use_count=ImportMapping.use_count + 1)
        )
        await db.commit()

    return ImportExecuteResponse(**result)


# ── Saved Mappings CRUD ───────────────────────────────────────────────────


@router.get("/mappings", response_model=list[ImportMappingRead])
async def list_mappings(
    target_object: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved column mappings for this entity."""
    stmt = (
        select(ImportMapping)
        .where(ImportMapping.entity_id == entity_id, ImportMapping.archived == False)
        .order_by(ImportMapping.last_used_at.desc().nullslast(), ImportMapping.created_at.desc())
    )
    if target_object:
        stmt = stmt.where(ImportMapping.target_object == target_object)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/mappings", response_model=ImportMappingRead, status_code=201)
async def create_mapping(
    body: ImportMappingCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a column mapping for reuse."""
    obj = ImportMapping(
        entity_id=entity_id,
        name=body.name,
        description=body.description,
        target_object=body.target_object,
        column_mapping=body.column_mapping,
        transforms=body.transforms,
        file_headers=body.file_headers,
        file_settings=body.file_settings,
        created_by=current_user.id,
    )
    db.add(obj)
    await db.commit()
    await db.refresh(obj)
    return obj


@router.patch("/mappings/{mapping_id}", response_model=ImportMappingRead)
async def update_mapping(
    mapping_id: UUID,
    body: ImportMappingUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a saved mapping."""
    result = await db.execute(
        select(ImportMapping).where(
            ImportMapping.id == mapping_id,
            ImportMapping.entity_id == entity_id,
            ImportMapping.archived == False,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Mapping not found")

    if body.name is not None:
        obj.name = body.name
    if body.description is not None:
        obj.description = body.description
    if body.column_mapping is not None:
        obj.column_mapping = body.column_mapping
    if body.transforms is not None:
        obj.transforms = body.transforms
    if body.file_headers is not None:
        obj.file_headers = body.file_headers
    if body.file_settings is not None:
        obj.file_settings = body.file_settings

    await db.commit()
    await db.refresh(obj)
    return obj


@router.delete("/mappings/{mapping_id}", status_code=204)
async def delete_mapping(
    mapping_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a saved mapping."""
    result = await db.execute(
        select(ImportMapping).where(
            ImportMapping.id == mapping_id,
            ImportMapping.entity_id == entity_id,
            ImportMapping.archived == False,
        )
    )
    obj = result.scalar_one_or_none()
    if not obj:
        raise HTTPException(status_code=404, detail="Mapping not found")

    obj.archived = True
    await db.commit()
