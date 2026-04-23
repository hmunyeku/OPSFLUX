"""CRUD for `support_verification_scenarios` + seed helpers.

The scenarios are executed by the Playwright runner container at the
end of a Mode A run (against staging) or during Mode B monitoring
(against prod). Admins define them here.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.models.agent import SupportVerificationScenario
from app.models.common import User

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/support/verification-scenarios",
    tags=["support-agent"],
    dependencies=[require_permission("core.settings.manage")],
)


class ScenarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    script_language: Literal["typescript", "python"] = "typescript"
    script_content: str = Field(..., min_length=1)
    expected_assertions: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=60, ge=5, le=900)
    is_smoke_test: bool = False
    criticality: Literal["critical", "important", "nice_to_have"] = "important"
    enabled: bool = True


class ScenarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    script_language: Literal["typescript", "python"] | None = None
    script_content: str | None = None
    expected_assertions: list[str] | None = None
    timeout_seconds: int | None = None
    is_smoke_test: bool | None = None
    criticality: Literal["critical", "important", "nice_to_have"] | None = None
    enabled: bool | None = None


class ScenarioRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    entity_id: UUID
    name: str
    description: str | None
    tags: list[str]
    script_language: str
    script_content: str
    expected_assertions: list[Any]
    timeout_seconds: int
    is_smoke_test: bool
    criticality: str
    enabled: bool
    created_at: datetime
    updated_at: datetime


@router.get("", response_model=list[ScenarioRead])
async def list_scenarios(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    rows = (
        await db.execute(
            select(SupportVerificationScenario)
            .where(SupportVerificationScenario.entity_id == entity_id)
            .order_by(SupportVerificationScenario.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post("", response_model=ScenarioRead, status_code=201)
async def create_scenario(
    body: ScenarioCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = SupportVerificationScenario(
        entity_id=entity_id,
        created_by=current_user.id,
        **body.model_dump(),
    )
    db.add(row)
    await record_audit(
        db,
        action="verification_scenario.create",
        resource_type="verification_scenario",
        resource_id="(new)",
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": body.name},
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{scenario_id}", response_model=ScenarioRead)
async def update_scenario(
    scenario_id: UUID,
    body: ScenarioUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(SupportVerificationScenario).where(
                SupportVerificationScenario.id == scenario_id,
                SupportVerificationScenario.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Scenario not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.updated_at = datetime.now(UTC)

    await record_audit(
        db,
        action="verification_scenario.update",
        resource_type="verification_scenario",
        resource_id=str(row.id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(
    scenario_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        await db.execute(
            select(SupportVerificationScenario).where(
                SupportVerificationScenario.id == scenario_id,
                SupportVerificationScenario.entity_id == entity_id,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Scenario not found")
    await db.delete(row)
    await record_audit(
        db,
        action="verification_scenario.delete",
        resource_type="verification_scenario",
        resource_id=str(scenario_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()
