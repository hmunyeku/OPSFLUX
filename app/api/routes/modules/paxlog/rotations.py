"""PaxLog — Rotation cycles routes.

Extracted from the monolithic paxlog module. Routes here register onto the
shared `router` instance defined in `paxlog/__init__.py`, so URLs, tags and
dependencies remain identical.
"""

from datetime import date
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.core.pagination import PaginationParams
from app.models.common import User
from app.schemas.common import PaginatedResponse
from app.schemas.paxlog import RotationCycleRead

from . import router


# ═══════════════════════════════════════════════════════════════════════════════
# ROTATION CYCLES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/rotation-cycles", response_model=PaginatedResponse[RotationCycleRead])
async def list_rotation_cycles(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    site_asset_id: UUID | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List rotation cycles for the entity."""
    from app.services.modules import paxlog_service
    from sqlalchemy import text as sa_text

    conditions = ["entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}

    if user_id:
        conditions.append("user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if site_asset_id:
        conditions.append("site_asset_id = :site_id")
        params["site_id"] = str(site_asset_id)
    if status_filter:
        conditions.append("status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    count_result = await db.execute(
        sa_text(
            f"""
            SELECT COUNT(*)
            FROM pax_rotation_cycles
            WHERE {where_clause}
            """
        ),
        params,
    )
    total = count_result.scalar() or 0

    offset = (pagination.page - 1) * pagination.page_size
    list_result = await db.execute(
        sa_text(
            f"""
            SELECT id, entity_id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                   cycle_start_date, next_on_date, status,
                   auto_create_ads, ads_lead_days,
                   default_project_id, default_cc_id, notes, created_at, updated_at,
                   pax_first_name, pax_last_name, site_name, company_name
            FROM pax_rotation_cycles
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {**params, "limit": pagination.page_size, "offset": offset},
    )
    items: list[RotationCycleRead] = []
    for row in list_result.all():
        pax_user_id = row[2]
        pax_contact_id = row[3]
        compliance_result = await paxlog_service.check_pax_compliance(
            db,
            row[4],
            entity_id,
            user_id=pax_user_id,
            contact_id=pax_contact_id,
        )
        issues = [item["message"] for item in compliance_result.get("results", []) if item.get("status") != "valid"]
        risk_level = "clear" if compliance_result.get("compliant") else "blocked"
        items.append(
            RotationCycleRead(
                id=row[0],
                entity_id=row[1],
                user_id=pax_user_id,
                contact_id=pax_contact_id,
                site_asset_id=row[4],
                days_on=row[5],
                days_off=row[6],
                start_date=row[7],
                next_rotation_date=row[8],
                status=row[9],
                auto_create_ads=row[10],
                ads_lead_days=row[11],
                default_project_id=row[12],
                default_cc_id=row[13],
                notes=row[14],
                created_at=row[15],
                updated_at=row[16],
                pax_first_name=row[18],
                pax_last_name=row[19],
                site_name=row[20],
                company_name=row[21],
                compliance_risk_level=risk_level,
                compliance_issue_count=len(issues),
                compliance_issue_preview=issues[:3],
            )
        )

    return PaginatedResponse[RotationCycleRead](
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        pages=max(1, -(-total // pagination.page_size)) if pagination.page_size else 1,
    )


@router.post("/rotation-cycles", status_code=201)
async def create_rotation_cycle(
    site_asset_id: UUID,
    days_on: int,
    days_off: int,
    cycle_start_date: date,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    auto_create_ads: bool = True,
    ads_lead_days: int = 7,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a rotation cycle for a PAX on a site."""
    from sqlalchemy import text as sa_text

    if not user_id and not contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_rotation_cycles (
                entity_id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                cycle_start_date, next_on_date, status,
                auto_create_ads, ads_lead_days,
                default_project_id, default_cc_id, created_by, created_at
            ) VALUES (
                :eid, :user_id, :contact_id, :site_id, :days_on, :days_off,
                :start_date, :start_date, 'active',
                :auto_ads, :lead_days,
                :project_id, :cc_id, :created_by, NOW()
            ) RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
            "start_date": cycle_start_date,
            "auto_ads": auto_create_ads,
            "lead_days": ads_lead_days,
            "project_id": str(default_project_id) if default_project_id else None,
            "cc_id": str(default_cc_id) if default_cc_id else None,
            "created_by": str(current_user.id),
        },
    )
    new_id = result.scalar()
    await db.commit()

    # Resolve via parent package so tests that do
    # `monkeypatch.setattr(paxlog, "record_audit", fake)` still intercept this call.
    from . import record_audit as _record_audit  # type: ignore[attr-defined]
    await _record_audit(
        db,
        action="paxlog.rotation.create",
        resource_type="pax_rotation_cycle",
        resource_id=str(new_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_asset_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
        },
    )
    await db.commit()

    return {
        "id": str(new_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "site_asset_id": str(site_asset_id),
        "days_on": days_on,
        "days_off": days_off,
        "cycle_start_date": str(cycle_start_date),
        "status": "active",
    }


@router.patch("/rotation-cycles/{cycle_id}")
async def update_rotation_cycle(
    cycle_id: UUID,
    status_val: str | None = None,
    days_on: int | None = None,
    days_off: int | None = None,
    ads_lead_days: int | None = None,
    auto_create_ads: bool | None = None,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update a rotation cycle."""
    from sqlalchemy import text as sa_text

    # Verify cycle exists
    check = await db.execute(
        sa_text("SELECT id FROM pax_rotation_cycles WHERE id = :cid AND entity_id = :eid"),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not check.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")

    updates = []
    params: dict = {"cid": str(cycle_id)}

    if status_val is not None:
        updates.append("status = :status")
        params["status"] = status_val
    if days_on is not None:
        updates.append("rotation_days_on = :days_on")
        params["days_on"] = days_on
    if days_off is not None:
        updates.append("rotation_days_off = :days_off")
        params["days_off"] = days_off
    if ads_lead_days is not None:
        updates.append("ads_lead_days = :lead")
        params["lead"] = ads_lead_days
    if auto_create_ads is not None:
        updates.append("auto_create_ads = :auto")
        params["auto"] = auto_create_ads
    if default_project_id is not None:
        updates.append("default_project_id = :proj")
        params["proj"] = str(default_project_id)
    if default_cc_id is not None:
        updates.append("default_cc_id = :cc")
        params["cc"] = str(default_cc_id)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    set_clause = ", ".join(updates)
    await db.execute(
        sa_text(f"UPDATE pax_rotation_cycles SET {set_clause} WHERE id = :cid"),
        params,
    )
    await db.commit()

    return {"id": str(cycle_id), "updated_fields": list(params.keys() - {"cid"})}


@router.delete("/rotation-cycles/{cycle_id}", status_code=204)
async def end_rotation_cycle(
    cycle_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """End (deactivate) a rotation cycle."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "UPDATE pax_rotation_cycles SET status = 'ended' "
            "WHERE id = :cid AND entity_id = :eid RETURNING id"
        ),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")
    await db.commit()
    return None
