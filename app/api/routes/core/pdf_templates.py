"""PDF template management routes -- CRUD, versions, publish, preview, seed.

Admin-level endpoints for configuring PDF templates per entity.
All templates are entity-scoped (X-Entity-ID header) or global (entity_id = NULL).

Required permission: core.pdf_templates.manage
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_entity, get_current_user
from app.core.database import get_db
from app.core.pdf_templates import render_html_from_version, render_pdf_from_version, render_template_string
from app.models.common import (
    PdfTemplate,
    PdfTemplateVersion,
    User,
)
from app.schemas.common import (
    PdfPreviewRequest,
    PdfTemplateCreate,
    PdfTemplateRead,
    PdfTemplateSummaryRead,
    PdfTemplateUpdate,
    PdfTemplateVersionCreate,
    PdfTemplateVersionRead,
)
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/pdf-templates", tags=["pdf-templates"])


# ── List all templates ─────────────────────────────────────────────────────

@router.get("", response_model=list[PdfTemplateSummaryRead])
async def list_templates(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all PDF templates for the current entity (including global ones)."""
    result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(
            (PdfTemplate.entity_id == entity_id) | (PdfTemplate.entity_id.is_(None))
        )
        .order_by(PdfTemplate.slug)
    )
    templates = result.scalars().all()

    summaries = []
    for t in templates:
        published_langs = list({v.language for v in t.versions if v.is_published})
        summaries.append(
            PdfTemplateSummaryRead(
                id=t.id,
                entity_id=t.entity_id,
                slug=t.slug,
                name=t.name,
                description=t.description,
                object_type=t.object_type,
                enabled=t.enabled,
                page_size=t.page_size,
                orientation=t.orientation,
                created_at=t.created_at,
                updated_at=t.updated_at,
                published_languages=published_langs,
                version_count=len(t.versions),
            )
        )
    return summaries


# ── Get single template (with versions) ───────────────────────────────────

@router.get("/{template_id}", response_model=PdfTemplateRead)
async def get_template(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single PDF template with all versions."""
    result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(
            PdfTemplate.id == template_id,
            (PdfTemplate.entity_id == entity_id) | (PdfTemplate.entity_id.is_(None)),
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="PDF template not found")
    return template


# ── Create template ────────────────────────────────────────────────────────

@router.post("", response_model=PdfTemplateRead, status_code=201)
async def create_template(
    body: PdfTemplateCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new PDF template."""
    # Check slug uniqueness within entity
    existing = await db.execute(
        select(PdfTemplate.id).where(
            PdfTemplate.entity_id == entity_id,
            PdfTemplate.slug == body.slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"PDF template with slug '{body.slug}' already exists for this entity",
        )

    template = PdfTemplate(
        entity_id=entity_id,
        slug=body.slug,
        name=body.name,
        description=body.description,
        object_type=body.object_type,
        enabled=body.enabled,
        variables_schema=body.variables_schema,
        page_size=body.page_size,
        orientation=body.orientation,
        margin_top=body.margin_top,
        margin_right=body.margin_right,
        margin_bottom=body.margin_bottom,
        margin_left=body.margin_left,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)

    # Re-fetch with relationships
    result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(PdfTemplate.id == template.id)
    )
    return result.scalar_one()


# ── Update template metadata ──────────────────────────────────────────────

@router.patch("/{template_id}", response_model=PdfTemplateRead)
async def update_template(
    template_id: UUID,
    body: PdfTemplateUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update PDF template metadata (name, description, enabled, page settings, etc.)."""
    result = await db.execute(
        select(PdfTemplate)
        .options(selectinload(PdfTemplate.versions))
        .where(
            PdfTemplate.id == template_id,
            PdfTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="PDF template not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return template


# ── Delete template ────────────────────────────────────────────────────────

@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a PDF template and all its versions."""
    result = await db.execute(
        select(PdfTemplate).where(
            PdfTemplate.id == template_id,
            PdfTemplate.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="PDF template not found")

    await delete_entity(template, db, "pdf_template", entity_id=template_id, user_id=current_user.id)
    await db.commit()


# ── Template versions ─────────────────────────────────────────────────────

@router.get("/{template_id}/versions", response_model=list[PdfTemplateVersionRead])
async def list_versions(
    template_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all versions of a PDF template."""
    tpl = await db.execute(
        select(PdfTemplate.id).where(
            PdfTemplate.id == template_id,
            (PdfTemplate.entity_id == entity_id) | (PdfTemplate.entity_id.is_(None)),
        )
    )
    if not tpl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="PDF template not found")

    result = await db.execute(
        select(PdfTemplateVersion)
        .where(PdfTemplateVersion.template_id == template_id)
        .order_by(PdfTemplateVersion.language, PdfTemplateVersion.version_number.desc())
    )
    return result.scalars().all()


@router.post("/{template_id}/versions", response_model=PdfTemplateVersionRead, status_code=201)
async def create_version(
    template_id: UUID,
    body: PdfTemplateVersionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new version of a PDF template."""
    tpl = await db.execute(
        select(PdfTemplate.id).where(
            PdfTemplate.id == template_id,
            PdfTemplate.entity_id == entity_id,
        )
    )
    if not tpl.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="PDF template not found")

    # Calculate next version number for this language
    max_version = await db.execute(
        select(func.coalesce(func.max(PdfTemplateVersion.version_number), 0))
        .where(
            PdfTemplateVersion.template_id == template_id,
            PdfTemplateVersion.language == body.language,
        )
    )
    next_version = max_version.scalar() + 1

    # If publishing this version, unpublish others for same language
    if body.is_published:
        await _unpublish_language_versions(db, template_id, body.language)

    version = PdfTemplateVersion(
        template_id=template_id,
        version_number=next_version,
        language=body.language,
        body_html=body.body_html,
        header_html=body.header_html,
        footer_html=body.footer_html,
        is_published=body.is_published,
        created_by=current_user.id,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return version


# ── Publish a version ─────────────────────────────────────────────────────

@router.post(
    "/{template_id}/versions/{version_id}/publish",
    response_model=PdfTemplateVersionRead,
)
async def publish_version(
    template_id: UUID,
    version_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set a version as the published (active) version for its language."""
    result = await db.execute(
        select(PdfTemplateVersion).where(
            PdfTemplateVersion.id == version_id,
            PdfTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Unpublish others for same language
    await _unpublish_language_versions(db, template_id, version.language)

    version.is_published = True
    await db.commit()
    await db.refresh(version)
    return version


# ── Delete a version ──────────────────────────────────────────────────────

@router.delete(
    "/{template_id}/versions/{version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_version(
    template_id: UUID,
    version_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a PDF template version."""
    result = await db.execute(
        select(PdfTemplateVersion).where(
            PdfTemplateVersion.id == version_id,
            PdfTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    await delete_entity(version, db, "pdf_template", entity_id=version_id, user_id=current_user.id)
    await db.commit()


# ── Preview ────────────────────────────────────────────────────────────────

@router.post("/{template_id}/preview")
async def preview_template(
    template_id: UUID,
    body: PdfPreviewRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Preview a rendered PDF template version with sample variables.

    If output='html', returns the rendered HTML (for in-browser preview).
    If output='pdf', returns the PDF file as application/pdf.
    """
    # Fetch version
    result = await db.execute(
        select(PdfTemplateVersion).where(
            PdfTemplateVersion.id == body.version_id,
            PdfTemplateVersion.template_id == template_id,
        )
    )
    version = result.scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    # Fetch parent template (for page settings)
    tpl_result = await db.execute(
        select(PdfTemplate).where(PdfTemplate.id == template_id)
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if body.output == "pdf":
        pdf_bytes = await render_pdf_from_version(version, template, body.variables)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'inline; filename="{template.slug}_preview.pdf"',
            },
        )
    else:
        html = await render_html_from_version(version, body.variables)
        return {"rendered_html": html}


# ── Seed defaults ──────────────────────────────────────────────────────────

@router.post("/seed", status_code=201)
async def seed_default_templates(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Seed default PDF templates for the current entity.

    Idempotent: only creates templates that don't already exist.
    """
    from app.core.pdf_templates import DEFAULT_PDF_TEMPLATES

    created = []
    for tpl_def in DEFAULT_PDF_TEMPLATES:
        existing = await db.execute(
            select(PdfTemplate.id).where(
                PdfTemplate.entity_id == entity_id,
                PdfTemplate.slug == tpl_def["slug"],
            )
        )
        if existing.scalar_one_or_none():
            continue

        template = PdfTemplate(
            entity_id=entity_id,
            slug=tpl_def["slug"],
            name=tpl_def["name"],
            description=tpl_def.get("description"),
            object_type=tpl_def.get("object_type", "system"),
            enabled=True,
            variables_schema=tpl_def.get("variables_schema"),
            page_size=tpl_def.get("page_size", "A4"),
            orientation=tpl_def.get("orientation", "portrait"),
            margin_top=tpl_def.get("margin_top", 15),
            margin_right=tpl_def.get("margin_right", 12),
            margin_bottom=tpl_def.get("margin_bottom", 15),
            margin_left=tpl_def.get("margin_left", 12),
        )
        db.add(template)
        await db.flush()  # Get the ID

        # Create default versions
        for lang, content in tpl_def.get("default_versions", {}).items():
            version = PdfTemplateVersion(
                template_id=template.id,
                version_number=1,
                language=lang,
                body_html=content["body_html"],
                header_html=content.get("header_html"),
                footer_html=content.get("footer_html"),
                is_published=True,
                created_by=current_user.id,
            )
            db.add(version)

        created.append(tpl_def["slug"])

    await db.commit()
    return {"seeded": created, "count": len(created)}


# ── Helpers ────────────────────────────────────────────────────────────────

async def _unpublish_language_versions(
    db: AsyncSession,
    template_id: UUID,
    language: str,
) -> None:
    """Unpublish all versions of a template for a given language."""
    result = await db.execute(
        select(PdfTemplateVersion).where(
            PdfTemplateVersion.template_id == template_id,
            PdfTemplateVersion.language == language,
            PdfTemplateVersion.is_published == True,  # noqa: E712
        )
    )
    for v in result.scalars():
        v.is_published = False
