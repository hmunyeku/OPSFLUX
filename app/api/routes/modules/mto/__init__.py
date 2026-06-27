"""Routes API du module MTO — import, consolidation, rapprochement, validation.

Auth + permissions + entity-scope via app.api.deps (style OpsFlux). Le travail lourd
est delegue a app.services.modules.mto_service (qui branche le moteur de calcul).
"""

import os
import tempfile
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_module_enabled,
    require_permission,
)
from app.core.database import get_db
from app.models.common import User
from app.models.mto import MtoConsolidatedGroup, MtoImportBatch, SapCatalogItem
from app.schemas.mto import (
    BatchRead,
    BatchStatsRead,
    CatalogItemRead,
    ConsolidateResult,
    CorrectRequest,
    GroupRead,
    ImportResult,
)
from app.services.modules import mto_service

router = APIRouter(prefix="/api/v1/mto", tags=["mto"], dependencies=[require_module_enabled("mto")])


async def _save_upload(file: UploadFile) -> str:
    suffix = os.path.splitext(file.filename or "")[1] or ".xlsx"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(await file.read())
    tmp.close()
    return tmp.name


async def _get_batch(db: AsyncSession, entity_id: UUID, batch_id: UUID) -> MtoImportBatch:
    batch = (await db.execute(
        select(MtoImportBatch).where(
            MtoImportBatch.id == batch_id, MtoImportBatch.entity_id == entity_id)
    )).scalar_one_or_none()
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch MTO introuvable")
    return batch


async def _get_group(db: AsyncSession, entity_id: UUID, group_id: UUID) -> MtoConsolidatedGroup:
    group = (await db.execute(
        select(MtoConsolidatedGroup).where(
            MtoConsolidatedGroup.id == group_id, MtoConsolidatedGroup.entity_id == entity_id)
    )).scalar_one_or_none()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Groupe introuvable")
    return group


# --- Imports ---------------------------------------------------------------- #
@router.post("/import/catalogue", response_model=ImportResult,
             dependencies=[require_permission("mto.catalogue.import")])
async def import_catalogue(
    file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    path = await _save_upload(file)
    try:
        n = await mto_service.import_catalogue(db, entity_id, path)
    finally:
        os.unlink(path)
    return ImportResult(imported=n, kind="catalogue")


@router.post("/import/stock", response_model=ImportResult,
             dependencies=[require_permission("mto.stock.import")])
async def import_stock(
    file: UploadFile = File(...),
    label: str = Form(""),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    path = await _save_upload(file)
    try:
        n = await mto_service.import_stock(db, entity_id, path, label)
    finally:
        os.unlink(path)
    return ImportResult(imported=n, kind="stock")


@router.post("/import/mto", response_model=BatchRead,
             dependencies=[require_permission("mto.requirement.import")])
async def import_mto(
    file: UploadFile = File(...),
    project_id: UUID | None = Form(None),
    label: str = Form(""),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    path = await _save_upload(file)
    try:
        batch = await mto_service.import_mto(
            db, entity_id, path=path, project_id=project_id,
            filename=file.filename or "", label=label, created_by=current_user.id)
    finally:
        os.unlink(path)
    return batch


# --- Batches & consolidation ----------------------------------------------- #
@router.get("/batches", response_model=list[BatchRead],
            dependencies=[require_permission("mto.requirement.read")])
async def list_batches(
    project_id: UUID | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    from app.models.common import Project
    query = (
        select(MtoImportBatch, Project.name)
        .outerjoin(Project, Project.id == MtoImportBatch.project_id)
        .where(MtoImportBatch.entity_id == entity_id)
        .order_by(MtoImportBatch.created_at.desc())
    )
    if project_id:
        query = query.where(MtoImportBatch.project_id == project_id)
    res = await db.execute(query)
    out: list[BatchRead] = []
    for batch, project_name in res.all():
        data = BatchRead.model_validate(batch)
        data.project_name = project_name
        out.append(data)
    return out


@router.get("/batches/stats", response_model=list[BatchStatsRead],
            dependencies=[require_permission("mto.requirement.read")])
async def batches_stats(
    project_id: UUID | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    return await mto_service.get_batch_stats(db, entity_id, project_id)


@router.post("/batches/{batch_id}/consolidate", response_model=ConsolidateResult,
             dependencies=[require_permission("mto.matching.run")])
async def consolidate(
    batch_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    batch = await _get_batch(db, entity_id, batch_id)
    result = await mto_service.consolidate_batch(db, entity_id, batch.id)
    return ConsolidateResult(**result)


@router.get("/batches/{batch_id}/groups", response_model=list[GroupRead],
            dependencies=[require_permission("mto.matching.read")])
async def list_groups(
    batch_id: UUID,
    statut: str | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    query = (select(MtoConsolidatedGroup)
             .where(MtoConsolidatedGroup.entity_id == entity_id,
                    MtoConsolidatedGroup.batch_id == batch_id)
             .order_by(MtoConsolidatedGroup.besoin.desc()))
    if statut:
        query = query.where(MtoConsolidatedGroup.statut == statut)
    res = await db.execute(query)
    return res.scalars().all()


_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/batches/{batch_id}/export.xlsx",
            dependencies=[require_permission("mto.export")])
async def export_batch(
    batch_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Export Excel metier (Synthese / A sortir du stock / A commander) du batch consolide."""
    await _get_batch(db, entity_id, batch_id)  # 404 si batch hors entite
    content = await mto_service.export_batch_xlsx(db, entity_id, batch_id)
    return Response(
        content=content,
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="MTO_{batch_id}.xlsx"'},
    )


# --- Validation & correction ----------------------------------------------- #
@router.post("/groups/{group_id}/validate", response_model=GroupRead,
             dependencies=[require_permission("mto.matching.validate")])
async def validate_group(
    group_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group(db, entity_id, group_id)
    if not group.article_code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Aucun article a valider (groupe non trouve)")
    return await mto_service.validate_group(db, group, current_user.id)


@router.post("/groups/{group_id}/correct", response_model=GroupRead,
             dependencies=[require_permission("mto.matching.correct")])
async def correct_group(
    group_id: UUID,
    body: CorrectRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    group = await _get_group(db, entity_id, group_id)
    try:
        return await mto_service.correct_group(db, group, body.article_code, current_user.id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc))


# --- Catalogue (consultation / recherche pour la correction) --------------- #
@router.get("/catalogue", response_model=list[CatalogItemRead],
            dependencies=[require_permission("mto.catalogue.read")])
async def list_catalogue(
    q: str | None = Query(None),
    limit: int = Query(50, le=200),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    query = select(SapCatalogItem).where(SapCatalogItem.entity_id == entity_id)
    if q:
        like = f"%{q}%"
        query = query.where(SapCatalogItem.code.ilike(like) | SapCatalogItem.designation.ilike(like))
    res = await db.execute(query.order_by(SapCatalogItem.code).limit(limit))
    return res.scalars().all()
