"""Reference number routes — preview, generate, numbering patterns, external references."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.references import DEFAULT_TEMPLATE, generate_reference, preview_reference
from app.models.common import ExternalReference, Setting, User
from app.services.core.delete_service import delete_entity

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


# ══════════════════════════════════════════════════════════════════════════════
# NUMBERING PATTERNS (admin)
# ══════════════════════════════════════════════════════════════════════════════


class NumberingPatternRead(BaseModel):
    prefix: str
    template: str


class NumberingPatternUpdate(BaseModel):
    template: str = Field(..., min_length=3, max_length=300)


class NumberingPreviewResponse(BaseModel):
    prefix: str
    next_reference: str
    template: str


@router.get("/numbering-patterns", response_model=list[NumberingPatternRead])
async def list_numbering_patterns(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all configured numbering patterns (admin).

    Returns every ``reference_template:*`` setting. Prefixes without a
    custom template are not listed (they use the global default).
    """
    result = await db.execute(select(Setting).where(Setting.key.like("reference_template:%")))
    settings = result.scalars().all()

    patterns = []
    for s in settings:
        prefix = s.key.split(":", 1)[1] if ":" in s.key else s.key
        tpl = s.value.get("template", DEFAULT_TEMPLATE) if isinstance(s.value, dict) else DEFAULT_TEMPLATE
        patterns.append(NumberingPatternRead(prefix=prefix, template=tpl))
    return patterns


@router.put("/numbering-patterns/{prefix}", response_model=NumberingPatternRead)
async def update_numbering_pattern(
    prefix: str,
    body: NumberingPatternUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update (or create) the numbering template for a given prefix (admin).

    Example body: ``{"template": "ADS-{entity_code}-{YYYY}-{#####}"}``
    """
    key = f"reference_template:{prefix.upper()}"

    result = await db.execute(select(Setting).where(Setting.key == key))
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = {"template": body.template}
    else:
        setting = Setting(
            key=key,
            value={"template": body.template},
            scope="tenant",
        )
        db.add(setting)

    await db.commit()
    return NumberingPatternRead(prefix=prefix.upper(), template=body.template)


@router.get("/numbering-preview/{prefix}", response_model=NumberingPreviewResponse)
async def preview_numbering(
    prefix: str,
    template: str | None = Query(None, description="Optional template override for preview"),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Preview the next reference for a given prefix without consuming a number.

    If ``template`` is not provided, uses the configured template (or default).
    """
    next_ref = await preview_reference(
        prefix.upper(),
        db,
        entity_id=entity_id,
        template=template,
    )

    # Determine the effective template
    effective_tpl = template
    if effective_tpl is None:
        key = f"reference_template:{prefix.upper()}"
        result = await db.execute(select(Setting).where(Setting.key == key).limit(1))
        setting = result.scalar_one_or_none()
        if setting and isinstance(setting.value, dict):
            effective_tpl = setting.value.get("template", DEFAULT_TEMPLATE)
        else:
            effective_tpl = DEFAULT_TEMPLATE

    return NumberingPreviewResponse(
        prefix=prefix.upper(),
        next_reference=next_ref,
        template=effective_tpl,
    )


# ══════════════════════════════════════════════════════════════════════════════
# EXTERNAL REFERENCES CRUD
# ══════════════════════════════════════════════════════════════════════════════


class ExternalReferenceRead(BaseModel):
    id: UUID
    owner_type: str
    owner_id: UUID
    system: str
    code: str
    label: str | None = None
    url: str | None = None
    notes: str | None = None
    created_by: UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ExternalReferenceCreate(BaseModel):
    system: str = Field(..., min_length=1, max_length=50)
    code: str = Field(..., min_length=1, max_length=200)
    label: str | None = None
    url: str | None = None
    notes: str | None = None


@router.get(
    "/external/{owner_type}/{owner_id}",
    response_model=list[ExternalReferenceRead],
)
async def list_external_references(
    owner_type: str,
    owner_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all external references for a given object."""
    result = await db.execute(
        select(ExternalReference)
        .where(
            ExternalReference.owner_type == owner_type,
            ExternalReference.owner_id == owner_id,
        )
        .order_by(ExternalReference.system, ExternalReference.code)
    )
    return result.scalars().all()


@router.post(
    "/external/{owner_type}/{owner_id}",
    response_model=ExternalReferenceRead,
    status_code=201,
)
async def create_external_reference(
    owner_type: str,
    owner_id: UUID,
    body: ExternalReferenceCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Add an external reference to an object."""
    ext_ref = ExternalReference(
        owner_type=owner_type,
        owner_id=owner_id,
        system=body.system,
        code=body.code,
        label=body.label,
        url=body.url,
        notes=body.notes,
        created_by=current_user.id,
    )
    db.add(ext_ref)
    await db.commit()
    await db.refresh(ext_ref)
    return ext_ref


@router.delete("/external/{id}", status_code=204)
async def delete_external_reference(
    id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete an external reference by ID."""
    result = await db.execute(select(ExternalReference).where(ExternalReference.id == id))
    ext_ref = result.scalar_one_or_none()
    if not ext_ref:
        raise HTTPException(status_code=404, detail="External reference not found")

    await delete_entity(ext_ref, db, "external_reference", entity_id=id, user_id=current_user.id)
    await db.commit()
