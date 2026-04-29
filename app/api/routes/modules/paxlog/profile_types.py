"""PaxLog — PAX profile types and habilitation matrix.

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

Profile types are job-role categories (e.g. welder, scaffold-rigger). The
habilitation matrix wires each profile type to the credential types it
requires, used by the compliance engine when validating an AdS PAX entry.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_permission,
)
from app.core.database import get_db
from app.models.common import User
from app.models.paxlog import PaxProfileType

from . import router


@router.get("/profile-types")
async def list_profile_types(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List all PAX profile types (job roles/categories)."""
    result = await db.execute(
        sa_text(
            """
            SELECT id, code, name, description, created_at
            FROM pax_profile_types
            WHERE entity_id = :eid OR entity_id IS NULL
            ORDER BY name
            """
        ),
        {"eid": str(entity_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "created_at": str(r[4]),
        }
        for r in rows
    ]


@router.post("/profile-types", status_code=201)
async def create_profile_type(
    code: str,
    name: str,
    description: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a PAX profile type (job role/category)."""
    existing = await db.execute(
        sa_text(
            "SELECT id FROM pax_profile_types WHERE code = :code AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"code": code, "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Profile type with code '{code}' already exists",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_profile_types (entity_id, code, name, description, created_at)
            VALUES (:eid, :code, :name, :desc, NOW())
            RETURNING id
            """
        ),
        {"eid": str(entity_id), "code": code, "name": name, "desc": description},
    )
    new_id = result.scalar()
    await db.commit()

    return {"id": str(new_id), "code": code, "name": name, "description": description}


@router.get("/pax/{pax_id}/profile-types")
async def list_pax_profile_types(
    pax_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """List profile types assigned to a PAX (user or contact)."""
    fk_col = "user_id" if pax_source == "user" else "contact_id"
    result = await db.execute(
        sa_text(
            f"""
            SELECT pt.id, pt.code, pt.name, pt.description, ppt.created_at
            FROM pax_profile_types ppt
            JOIN pax_profile_types pt ON pt.id = ppt.profile_type_id
            WHERE ppt.{fk_col} = :pax_id
            ORDER BY pt.name
            """
        ),
        {"pax_id": str(pax_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "assigned_at": str(r[4]) if r[4] else None,
        }
        for r in rows
    ]


@router.post("/pax/{pax_id}/profile-types/{profile_type_id}", status_code=201)
async def assign_profile_type(
    pax_id: UUID,
    profile_type_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Assign a profile type to a PAX (user or contact)."""
    fk_col = "user_id" if pax_source == "user" else "contact_id"

    existing = await db.execute(
        sa_text(
            f"SELECT 1 FROM pax_profile_types WHERE {fk_col} = :pax_id AND profile_type_id = :pt_id"
        ),
        {"pax_id": str(pax_id), "pt_id": str(profile_type_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile type already assigned to this PAX",
        )

    ppt = PaxProfileType(
        user_id=pax_id if pax_source == "user" else None,
        contact_id=pax_id if pax_source == "contact" else None,
        profile_type_id=profile_type_id,
    )
    db.add(ppt)
    await db.commit()

    return {"pax_id": str(pax_id), "pax_source": pax_source, "profile_type_id": str(profile_type_id), "status": "assigned"}


@router.get("/habilitation-matrix")
async def list_habilitation_matrix(
    profile_type_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List habilitation matrix entries (credentials required per profile type)."""
    conditions = ["(hm.entity_id = :eid OR hm.entity_id IS NULL)"]
    params: dict = {"eid": str(entity_id)}

    if profile_type_id:
        conditions.append("hm.profile_type_id = :pt_id")
        params["pt_id"] = str(profile_type_id)

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT hm.id, hm.profile_type_id, pt.code AS profile_code, pt.name AS profile_name,
                   hm.credential_type_id, ct.code AS cred_code, ct.name AS cred_name,
                   hm.mandatory
            FROM habilitation_matrix hm
            JOIN pax_profile_types pt ON pt.id = hm.profile_type_id
            JOIN credential_types ct ON ct.id = hm.credential_type_id
            WHERE {where_clause}
            ORDER BY pt.name, ct.name
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "profile_type_id": str(r[1]),
            "profile_code": r[2],
            "profile_name": r[3],
            "credential_type_id": str(r[4]),
            "credential_code": r[5],
            "credential_name": r[6],
            "mandatory": r[7],
        }
        for r in rows
    ]


@router.post("/habilitation-matrix", status_code=201)
async def add_habilitation_requirement(
    profile_type_id: UUID,
    credential_type_id: UUID,
    mandatory: bool = True,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential requirement to a profile type in the habilitation matrix."""
    existing = await db.execute(
        sa_text(
            "SELECT id FROM habilitation_matrix "
            "WHERE profile_type_id = :pt_id AND credential_type_id = :ct_id "
            "AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"pt_id": str(profile_type_id), "ct_id": str(credential_type_id), "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This credential requirement already exists for this profile type",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO habilitation_matrix (entity_id, profile_type_id, credential_type_id, mandatory, created_at)
            VALUES (:eid, :pt_id, :ct_id, :mandatory, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "pt_id": str(profile_type_id),
            "ct_id": str(credential_type_id),
            "mandatory": mandatory,
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "profile_type_id": str(profile_type_id),
        "credential_type_id": str(credential_type_id),
        "mandatory": mandatory,
    }
