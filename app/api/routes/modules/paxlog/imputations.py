"""PaxLog — AdS cost imputations (multi-project allocation).

Extracted from the monolithic paxlog module. Routes register onto the shared
`router` instance defined in `paxlog/__init__.py`.

The endpoints here delegate to the core `cost_imputations` routes for the
percentage-sum / entity-scope validation logic; this module just adds the
AdS-specific access checks and post-write project snapshot sync.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    require_any_permission,
    require_permission,
)
from app.core.database import get_db
from app.core.errors import StructuredHTTPException
from app.models.common import User
from app.models.paxlog import Ads
from app.schemas.paxlog import AdsImputationSuggestionRead

from . import (
    ADS_READ_ENTRY_PERMISSIONS,
    _assert_ads_read_access,
    _can_manage_ads,
    _resolve_ads_imputation_suggestion,
    _sync_ads_project_from_imputations,
    router,
)


class AdsImputationCreateBody(BaseModel):
    """Body for adding a cost imputation line on an AdS."""
    project_id: UUID | None = None
    cost_center_id: UUID | None = None
    percentage: float = Field(100.0, gt=0, le=100)
    wbs_id: UUID | None = None
    imputation_reference_id: UUID | None = None


@router.get("/ads/{ads_id}/imputations")
async def list_imputations(
    ads_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List cost imputations for an AdS — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import list_cost_imputations

    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise StructuredHTTPException(
            404,
            code="ADS_NOT_FOUND",
            message="AdS not found",
        )
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    return await list_cost_imputations(
        owner_type="ads", owner_id=ads_id, current_user=current_user, db=db
    )


@router.get("/ads/{ads_id}/imputation-suggestion", response_model=AdsImputationSuggestionRead)
async def get_imputation_suggestion(
    ads_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Return the default imputation suggestion for an AdS."""
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise StructuredHTTPException(
            404,
            code="ADS_NOT_FOUND",
            message="AdS not found",
        )
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    return await _resolve_ads_imputation_suggestion(db, ads=ads, entity_id=entity_id)


@router.post("/ads/{ads_id}/imputations", status_code=201)
async def add_imputation(
    ads_id: UUID,
    body: AdsImputationCreateBody,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a cost imputation line on an AdS — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import create_cost_imputation
    from app.schemas.common import CostImputationCreate

    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise StructuredHTTPException(
            404,
            code="ADS_NOT_FOUND",
            message="AdS not found",
        )
    if not await _can_manage_ads(
        ads, current_user=current_user, request=request, entity_id=entity_id, db=db
    ):
        raise StructuredHTTPException(
            403,
            code="VOUS_NE_POUVEZ_PAS_MODIFIER_LES",
            message="Vous ne pouvez pas modifier les imputations de cette AdS.",
        )

    imputation_body = CostImputationCreate(
        owner_type="ads",
        owner_id=ads_id,
        project_id=body.project_id,
        cost_center_id=body.cost_center_id,
        percentage=body.percentage,
        wbs_id=body.wbs_id,
        imputation_reference_id=body.imputation_reference_id,
    )
    result = await create_cost_imputation(
        body=imputation_body,
        request=request,
        entity_id=entity_id,
        current_user=current_user,
        db=db,
    )

    if body.project_id is not None:
        await _sync_ads_project_from_imputations(db, ads=ads)
        await db.commit()

    return result


@router.delete("/ads/{ads_id}/imputations/{imputation_id}", status_code=204)
async def delete_imputation(
    ads_id: UUID,
    imputation_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cost imputation line on an AdS — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import delete_cost_imputation

    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise StructuredHTTPException(
            404,
            code="ADS_NOT_FOUND",
            message="AdS not found",
        )
    if not await _can_manage_ads(
        ads, current_user=current_user, request=request, entity_id=entity_id, db=db
    ):
        raise StructuredHTTPException(
            403,
            code="VOUS_NE_POUVEZ_PAS_MODIFIER_LES",
            message="Vous ne pouvez pas modifier les imputations de cette AdS.",
        )

    await delete_cost_imputation(
        imputation_id=imputation_id,
        request=request,
        current_user=current_user,
        db=db,
    )
    await _sync_ads_project_from_imputations(db, ads=ads)
    await db.commit()
    return None
