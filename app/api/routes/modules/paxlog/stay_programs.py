"""PaxLog — Stay Programs (intra-field movement plans).

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

A stay program tracks where a PAX physically goes during their AdS window
(e.g. multi-site rotation inside the same field). It has its own draft →
submitted → approved lifecycle, gated by AdS being in an active state.
"""

from __future__ import annotations

import json
from uuid import UUID

from fastapi import Depends
from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_any_permission,
    require_permission,
)
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.models.common import User
from app.models.paxlog import Ads, AdsPax, StayProgram

from . import ADS_READ_ENTRY_PERMISSIONS, router


STAY_PROGRAM_ACTIVE_ADS_STATUSES = {"draft", "requires_review", "approved", "in_progress"}


def _ensure_stay_program_ads_status(ads_status: str) -> None:
    if ads_status not in STAY_PROGRAM_ACTIVE_ADS_STATUSES:
        raise StructuredHTTPException(
            400,
            code="LE_PROGRAMME_DE_S_JOUR_N",
            message="Le programme de séjour n'est autorisé qu'à partir du statut brouillon.",
        )


async def _get_stay_program_ads_or_404(
    ads_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Ads:
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise StructuredHTTPException(
            404,
            code="ADS_NOT_FOUND",
            message="AdS not found",
        )
    return ads


async def _ensure_stay_program_target_belongs_to_ads(
    ads_id: UUID,
    db: AsyncSession,
    *,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
) -> None:
    conditions = [AdsPax.ads_id == ads_id]
    if user_id:
        conditions.append(AdsPax.user_id == user_id)
    elif contact_id:
        conditions.append(AdsPax.contact_id == contact_id)
    else:
        raise StructuredHTTPException(
            400,
            code="PROVIDE_USER_ID_CONTACT_ID",
            message="Provide user_id or contact_id",
        )

    pax_result = await db.execute(select(AdsPax.id).where(*conditions))
    if not pax_result.scalar_one_or_none():
        raise StructuredHTTPException(
            400,
            code="LE_PAX_CIBLE_DOIT_D_J",
            message="Le PAX cible doit déjà appartenir à cette AdS.",
        )


async def _get_stay_program_context_or_404(
    program_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
):
    result = await db.execute(
        select(
            StayProgram.id,
            StayProgram.status,
            StayProgram.ads_id,
            StayProgram.user_id,
            StayProgram.contact_id,
            Ads.status,
        )
        .join(Ads, Ads.id == StayProgram.ads_id)
        .where(
            StayProgram.id == program_id,
            StayProgram.entity_id == entity_id,
            Ads.entity_id == entity_id,
        )
    )
    context = result.first()
    if not context:
        raise StructuredHTTPException(
            404,
            code="PROGRAMME_DE_SEJOUR_INTROUVABLE",
            message="Programme de sejour introuvable",
        )
    return context


@router.get("/stay-programs")
async def list_stay_programs(
    ads_id: UUID | None = None,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    status_filter: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List stay programs (intra-field movement plans)."""
    conditions = ["sp.entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}
    can_read_all = await has_user_permission(
        current_user, entity_id, "paxlog.ads.read_all", db
    )
    if not can_read_all:
        conditions.append("ads.requester_id = :requester_id")
        params["requester_id"] = str(current_user.id)

    if ads_id:
        conditions.append("sp.ads_id = :ads_id")
        params["ads_id"] = str(ads_id)
    if user_id:
        conditions.append("sp.user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("sp.contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if status_filter:
        conditions.append("sp.status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT sp.id, sp.ads_id, sp.user_id, sp.contact_id, sp.status, sp.movements, sp.created_at
            FROM stay_programs sp
            JOIN ads ON ads.id = sp.ads_id
            WHERE {where_clause}
            ORDER BY sp.created_at DESC
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "ads_id": str(r[1]),
            "user_id": str(r[2]) if r[2] else None,
            "contact_id": str(r[3]) if r[3] else None,
            "status": r[4],
            "movements": r[5],
            "created_at": str(r[6]),
        }
        for r in rows
    ]


@router.post("/stay-programs", status_code=201)
async def create_stay_program(
    ads_id: UUID,
    movements: list[dict],
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a stay program (intra-field movement plan for a PAX in an AdS)."""
    if not user_id and not contact_id:
        raise StructuredHTTPException(
            400,
            code="PROVIDE_USER_ID_CONTACT_ID",
            message="Provide user_id or contact_id",
        )

    ads = await _get_stay_program_ads_or_404(ads_id, entity_id, db)
    _ensure_stay_program_ads_status(ads.status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO stay_programs (entity_id, ads_id, user_id, contact_id, status, movements, created_by, created_at)
            VALUES (:eid, :ads_id, :user_id, :contact_id, 'draft', :movements, :created_by, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "ads_id": str(ads_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "movements": json.dumps(movements),
            "created_by": str(current_user.id),
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "ads_id": str(ads_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "status": "draft",
    }


@router.post("/stay-programs/{program_id}/submit")
async def submit_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Submit a stay program for approval."""
    context = await _get_stay_program_context_or_404(program_id, entity_id, db)
    _, current_status, ads_id, user_id, contact_id, ads_status = context
    if current_status != "draft":
        raise StructuredHTTPException(
            400,
            code="PROGRAMME_INTROUVABLE_OU_NON_SOUMETTABLE_DOIT",
            message="Programme introuvable ou non-soumettable (doit etre en brouillon).",
        )
    _ensure_stay_program_ads_status(ads_status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'submitted', submitted_at = NOW() "
            "WHERE id = :pid AND entity_id = :eid AND status = 'draft' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise StructuredHTTPException(
            400,
            code="PROGRAMME_INTROUVABLE_OU_NON_SOUMETTABLE_DOIT",
            message="Programme introuvable ou non-soumettable (doit etre en brouillon).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "submitted"}


@router.post("/stay-programs/{program_id}/approve")
async def approve_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve a submitted stay program."""
    context = await _get_stay_program_context_or_404(program_id, entity_id, db)
    _, current_status, ads_id, user_id, contact_id, ads_status = context
    if current_status != "submitted":
        raise StructuredHTTPException(
            400,
            code="PROGRAMME_INTROUVABLE_OU_NON_APPROVABLE_DOIT",
            message="Programme introuvable ou non-approvable (doit etre soumis).",
        )
    _ensure_stay_program_ads_status(ads_status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'approved', approved_by = :uid, approved_at = NOW() "
            "WHERE id = :pid AND entity_id = :eid AND status = 'submitted' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id), "uid": str(current_user.id)},
    )
    if not result.scalar():
        raise StructuredHTTPException(
            400,
            code="PROGRAMME_INTROUVABLE_OU_NON_APPROVABLE_DOIT",
            message="Programme introuvable ou non-approvable (doit etre soumis).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "approved"}
