"""Reference number routes — preview and generate."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.references import generate_reference, preview_reference
from app.models.common import User

router = APIRouter(prefix="/api/v1/references", tags=["references"])


class ReferencePreviewResponse(BaseModel):
    prefix: str
    next_reference: str
    template: str | None = None


class ReferenceGenerateResponse(BaseModel):
    reference: str


@router.get("/preview", response_model=ReferencePreviewResponse)
async def preview_next_reference(
    prefix: str = Query(..., min_length=1, max_length=20, description="Reference prefix (e.g. AST, TRS)"),
    template: str | None = Query(None, description="Optional template override"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Preview what the next reference will look like (without consuming it).

    This is useful for UI forms that want to show the user what code will be
    assigned to a new record before they submit.
    """
    next_ref = await preview_reference(
        prefix,
        db,
        entity_id=entity_id,
        template=template,
    )
    return ReferencePreviewResponse(
        prefix=prefix,
        next_reference=next_ref,
        template=template,
    )


@router.post("/generate", response_model=ReferenceGenerateResponse)
async def generate_next_reference(
    prefix: str = Query(..., min_length=1, max_length=20, description="Reference prefix (e.g. AST, TRS)"),
    template: str | None = Query(None, description="Optional template override"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Generate and consume the next reference number.

    This atomically increments the sequence counter and returns the
    formatted reference string. Use the preview endpoint if you only
    need to see what the next value will be.
    """
    ref = await generate_reference(
        prefix,
        db,
        entity_id=entity_id,
        template=template,
    )
    await db.commit()
    return ReferenceGenerateResponse(reference=ref)
