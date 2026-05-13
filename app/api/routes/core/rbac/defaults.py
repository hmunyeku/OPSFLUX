"""Routes for the default-role-per-user-type setting (Q6.B configurable)."""
import json
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, require_permission
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.models.common import Role, Setting

router = APIRouter(prefix="/api/v1/rbac/defaults", tags=["rbac"])


class DefaultsRead(BaseModel):
    internal: str
    external: str
    tier_contact: str


class DefaultsUpdate(BaseModel):
    internal: str = Field(..., min_length=1, max_length=50)
    external: str = Field(..., min_length=1, max_length=50)
    tier_contact: str = Field(..., min_length=1, max_length=50)


async def _read_setting(db: AsyncSession, entity_id: UUID, key: str, default: str) -> str:
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        return default
    if isinstance(row, dict) and "value" in row:
        return row["value"]
    return row


async def _write_setting(db: AsyncSession, entity_id: UUID, key: str, value: str) -> None:
    result = await db.execute(
        select(Setting).where(
            Setting.key == key,
            Setting.scope == "tenant",
            Setting.scope_id == str(entity_id),
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.value = value
    else:
        db.add(Setting(key=key, value=value, scope="tenant", scope_id=str(entity_id)))


@router.get("", response_model=DefaultsRead)
async def get_defaults(
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.read"),
    db: AsyncSession = Depends(get_db),
):
    return DefaultsRead(
        internal=await _read_setting(db, entity_id, "rbac.default_role.internal", "READER"),
        external=await _read_setting(db, entity_id, "rbac.default_role.external", "PAX"),
        tier_contact=await _read_setting(db, entity_id, "rbac.default_role.tier_contact", "TIER_CONTACT"),
    )


@router.put("", response_model=DefaultsRead)
async def update_defaults(
    body: DefaultsUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("core.rbac.manage"),
    db: AsyncSession = Depends(get_db),
):
    # Validate roles exist
    role_codes = {body.internal, body.external, body.tier_contact}
    result = await db.execute(select(Role.code).where(Role.code.in_(role_codes)))
    found = {row[0] for row in result.all()}
    missing = role_codes - found
    if missing:
        raise StructuredHTTPException(
            400, code="RBAC_ROLE_NOT_FOUND",
            message=f"Unknown role(s): {sorted(missing)}",
        )

    await _write_setting(db, entity_id, "rbac.default_role.internal", body.internal)
    await _write_setting(db, entity_id, "rbac.default_role.external", body.external)
    await _write_setting(db, entity_id, "rbac.default_role.tier_contact", body.tier_contact)
    await db.commit()

    return DefaultsRead(internal=body.internal, external=body.external, tier_contact=body.tier_contact)
