"""Report Editor — business logic service.

Handles document CRUD, revisions, workflow transitions,
nomenclature generation, export (PDF/DOCX), and distribution.
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.modules.nomenclature_service import (
    generate_document_number,
    generate_next_revision_code,
)

logger = logging.getLogger(__name__)

# Workflow constants
DOCUMENT_WORKFLOW_SLUG = "document-workflow"
DOCUMENT_ENTITY_TYPE = "document"


# ═══════════════════════════════════════════════════════════════════════════════
# Document CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def list_documents(
    *,
    entity_id: UUID,
    bu_id: UUID | None = None,
    project_id: str | None = None,
    doc_type_id: str | None = None,
    status: str | None = None,
    classification: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession,
) -> dict[str, Any]:
    """List documents with filtering and pagination."""
    from app.models.report_editor import Document, DocType

    query = (
        select(Document)
        .where(
            Document.entity_id == entity_id,
            Document.status != "archived",
        )
    )

    if bu_id:
        query = query.where(Document.bu_id == bu_id)
    if project_id:
        query = query.where(Document.project_id == UUID(project_id))
    if doc_type_id:
        query = query.where(Document.doc_type_id == UUID(doc_type_id))
    if status:
        query = query.where(Document.status == status)
    if classification:
        query = query.where(Document.classification == classification)
    if search:
        query = query.where(
            or_(
                Document.title.ilike(f"%{search}%"),
                Document.number.ilike(f"%{search}%"),
            )
        )

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = (
        query
        .order_by(Document.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    documents = result.scalars().all()

    return {
        "items": documents,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


async def get_document(
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single document by ID."""
    from app.models.report_editor import Document

    result = await db.execute(
        select(Document).where(
            Document.id == UUID(str(doc_id)),
            Document.entity_id == entity_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        from fastapi import HTTPException
        raise HTTPException(404, f"Document {doc_id} not found")
    return doc


async def create_document(
    *,
    body: Any,  # DocumentCreate schema
    entity_id: UUID,
    bu_id: UUID | None,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new document with auto-generated number."""
    from app.models.report_editor import Document, DocType, Revision

    # Load the doc type for nomenclature and defaults
    doc_type = await db.execute(
        select(DocType).where(
            DocType.id == body.doc_type_id,
            DocType.entity_id == entity_id,
            DocType.is_active == True,  # noqa: E712
        )
    )
    doc_type = doc_type.scalar_one_or_none()
    if not doc_type:
        from fastapi import HTTPException
        raise HTTPException(404, "Doc type not found or inactive")

    # Retrieve tenant slug and project code for nomenclature
    tenant_slug = await _get_tenant_slug(entity_id, db)
    project_code = None
    if body.project_id:
        project_code = await _get_project_code(body.project_id, db)

    bu_code = None
    if bu_id:
        bu_code = await _get_bu_code(bu_id, db)

    # Generate the document number
    number = await generate_document_number(
        doc_type_id=doc_type.id,
        nomenclature_pattern=doc_type.nomenclature_pattern,
        discipline=doc_type.discipline,
        doc_type_code=doc_type.code,
        project_code=project_code,
        project_id=body.project_id,
        tenant_slug=tenant_slug,
        bu_code=bu_code,
        free_parts=body.free_parts if hasattr(body, "free_parts") else None,
        db=db,
    )

    # Create the document
    doc = Document(
        entity_id=entity_id,
        bu_id=bu_id,
        doc_type_id=doc_type.id,
        project_id=body.project_id,
        arborescence_node_id=getattr(body, "arborescence_node_id", None),
        number=number,
        title=body.title,
        language=getattr(body, "language", "fr") or "fr",
        status="draft",
        classification=getattr(body, "classification", "INT") or "INT",
        created_by=created_by,
    )
    db.add(doc)
    await db.flush()

    # Create initial revision (Rev 0)
    initial_content = {}
    # If the doc_type has a default template, build initial content from it
    if doc_type.default_template_id:
        template = await db.get(
            __import__("app.models.report_editor", fromlist=["Template"]).Template,
            doc_type.default_template_id,
        )
        if template:
            initial_content = template.structure or {}

    revision = Revision(
        entity_id=entity_id,
        document_id=doc.id,
        rev_code="0",
        content=initial_content,
        form_data={},
        word_count=0,
        is_locked=False,
        created_by=created_by,
    )
    db.add(revision)
    await db.flush()

    # Set current_revision_id
    doc.current_revision_id = revision.id

    await db.commit()

    logger.info("Created document %s (%s) by user %s", doc.number, doc.id, created_by)
    return doc


async def update_document(
    *,
    doc_id: str | UUID,
    body: Any,  # DocumentUpdate schema
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update document metadata (title, classification, arborescence node)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status not in ("draft", "in_review"):
        from fastapi import HTTPException
        raise HTTPException(400, "Cannot edit document in current status")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc, key, value)

    await db.commit()
    return doc


# ═══════════════════════════════════════════════════════════════════════════════
# Draft saving (autosave)
# ═══════════════════════════════════════════════════════════════════════════════


async def save_draft(
    *,
    doc_id: str | UUID,
    content: dict,
    form_data: dict,
    yjs_state: bytes | None = None,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Save draft content to the current revision. Does not create a new revision."""
    from app.models.report_editor import Document, Revision

    doc = await get_document(doc_id, entity_id, db)

    if doc.status not in ("draft",):
        from fastapi import HTTPException
        raise HTTPException(400, "Can only save drafts for documents in 'draft' status")

    if not doc.current_revision_id:
        from fastapi import HTTPException
        raise HTTPException(400, "Document has no current revision")

    revision = await db.get(Revision, doc.current_revision_id)
    if not revision:
        from fastapi import HTTPException
        raise HTTPException(404, "Current revision not found")

    if revision.is_locked:
        from fastapi import HTTPException
        raise HTTPException(400, "Current revision is locked (approved). Create a new revision.")

    # Update revision content
    revision.content = content
    revision.form_data = form_data
    if yjs_state is not None:
        revision.yjs_state = yjs_state

    # Update word count
    revision.word_count = _count_words(content)

    await db.commit()

    return {
        "status": "saved",
        "revision_id": str(revision.id),
        "word_count": revision.word_count,
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Revision management
# ═══════════════════════════════════════════════════════════════════════════════


async def create_new_revision(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new revision by advancing the rev code (e.g., 0 → A → B)."""
    from app.models.report_editor import Document, DocType, Revision

    doc = await get_document(doc_id, entity_id, db)

    # Must be in draft or approved status to create a new revision
    if doc.status not in ("draft", "approved", "published"):
        from fastapi import HTTPException
        raise HTTPException(
            400,
            "Cannot create new revision in current status. "
            "Document must be draft, approved, or published.",
        )

    # Get doc type for revision scheme
    doc_type = await db.get(DocType, doc.doc_type_id)
    scheme = doc_type.revision_scheme if doc_type else "alpha"

    # Get current revision code
    current_rev = None
    if doc.current_revision_id:
        current_rev = await db.get(Revision, doc.current_revision_id)

    current_code = current_rev.rev_code if current_rev else "0"
    next_code = generate_next_revision_code(current_code, scheme)

    # Lock the current revision
    if current_rev and not current_rev.is_locked:
        current_rev.is_locked = True

    # Create new revision (copy content from current)
    new_revision = Revision(
        entity_id=entity_id,
        document_id=doc.id,
        rev_code=next_code,
        content=current_rev.content if current_rev else {},
        form_data=current_rev.form_data if current_rev else {},
        word_count=current_rev.word_count if current_rev else 0,
        is_locked=False,
        created_by=user_id,
    )
    db.add(new_revision)
    await db.flush()

    # Update document to point to new revision, reset to draft
    doc.current_revision_id = new_revision.id
    doc.status = "draft"

    await db.commit()

    logger.info(
        "Created revision %s for document %s (was %s)",
        next_code,
        doc.number,
        current_code,
    )
    return new_revision


async def list_revisions(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """List all revisions for a document, newest first."""
    from app.models.report_editor import Revision

    result = await db.execute(
        select(Revision)
        .where(
            Revision.document_id == UUID(str(doc_id)),
            Revision.entity_id == entity_id,
        )
        .order_by(Revision.created_at.desc())
    )
    return result.scalars().all()


async def get_revision(
    revision_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a specific revision."""
    from app.models.report_editor import Revision

    result = await db.execute(
        select(Revision).where(
            Revision.id == UUID(str(revision_id)),
            Revision.entity_id == entity_id,
        )
    )
    revision = result.scalar_one_or_none()
    if not revision:
        from fastapi import HTTPException
        raise HTTPException(404, f"Revision {revision_id} not found")
    return revision


# ═══════════════════════════════════════════════════════════════════════════════
# Workflow transitions (FSM integration)
# ═══════════════════════════════════════════════════════════════════════════════


async def _try_workflow_transition(
    db: AsyncSession,
    *,
    entity_id_str: str,
    doc_id_str: str,
    to_state: str,
    actor_id: UUID,
    comment: str | None = None,
) -> tuple[str | None, Any]:
    """Attempt FSM transition with graceful fallback."""
    try:
        from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError

        instance = await fsm_service.transition(
            db,
            workflow_slug=DOCUMENT_WORKFLOW_SLUG,
            entity_type=DOCUMENT_ENTITY_TYPE,
            entity_id=doc_id_str,
            to_state=to_state,
            actor_id=str(actor_id),
            entity_id_scope=entity_id_str,
            comment=comment,
        )
        return instance.current_state, instance
    except Exception as e:
        err_str = str(e).lower()
        if "not found" in err_str or "no workflow" in err_str:
            # No workflow definition exists — fallback to direct status update
            return None, None
        # Permission or other FSM error
        if "permission" in err_str:
            from fastapi import HTTPException
            raise HTTPException(403, str(e))
        from fastapi import HTTPException
        raise HTTPException(400, str(e))


async def submit_document(
    *,
    doc_id: str | UUID,
    comment: str | None = None,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Submit document for validation (draft → in_review)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "draft":
        from fastapi import HTTPException
        raise HTTPException(400, "Only draft documents can be submitted")

    # Lock current revision
    if doc.current_revision_id:
        from app.models.report_editor import Revision
        revision = await db.get(Revision, doc.current_revision_id)
        if revision:
            revision.is_locked = True

    # Try FSM transition
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="in_review",
        actor_id=actor_id,
        comment=comment,
    )

    doc.status = fsm_state or "in_review"
    await db.commit()

    # Emit event after commit (D-004)
    try:
        from app.core.events import event_bus, OpsFluxEvent
        await event_bus.publish(OpsFluxEvent(
            event_type="document.submitted",
            payload={
                "document_id": str(doc.id),
                "entity_id": str(entity_id),
                "number": doc.number,
                "title": doc.title,
                "submitted_by": str(actor_id),
            },
        ))
    except Exception:
        logger.exception("Failed to emit document.submitted event")

    return doc


async def approve_document(
    *,
    doc_id: str | UUID,
    comment: str | None = None,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Approve document (in_review → approved)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "in_review":
        from fastapi import HTTPException
        raise HTTPException(400, "Only documents in review can be approved")

    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="approved",
        actor_id=actor_id,
        comment=comment,
    )

    doc.status = fsm_state or "approved"

    # Create electronic signature
    await _create_signature(
        document_id=doc.id,
        revision_id=doc.current_revision_id,
        signer_id=actor_id,
        signer_role="approver",
        db=db,
    )

    await db.commit()

    try:
        from app.core.events import event_bus, OpsFluxEvent
        await event_bus.publish(OpsFluxEvent(
            event_type="document.approved",
            payload={
                "document_id": str(doc.id),
                "entity_id": str(entity_id),
                "number": doc.number,
                "title": doc.title,
                "approved_by": str(actor_id),
            },
        ))
    except Exception:
        logger.exception("Failed to emit document.approved event")

    return doc


async def reject_document(
    *,
    doc_id: str | UUID,
    reason: str,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Reject document (in_review → draft with reason)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "in_review":
        from fastapi import HTTPException
        raise HTTPException(400, "Only documents in review can be rejected")

    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="draft",
        actor_id=actor_id,
        comment=reason,
    )

    doc.status = fsm_state or "draft"

    # Unlock current revision so author can edit
    if doc.current_revision_id:
        from app.models.report_editor import Revision
        revision = await db.get(Revision, doc.current_revision_id)
        if revision:
            revision.is_locked = False

    await db.commit()

    try:
        from app.core.events import event_bus, OpsFluxEvent
        await event_bus.publish(OpsFluxEvent(
            event_type="document.rejected",
            payload={
                "document_id": str(doc.id),
                "entity_id": str(entity_id),
                "number": doc.number,
                "title": doc.title,
                "rejected_by": str(actor_id),
                "reason": reason,
            },
        ))
    except Exception:
        logger.exception("Failed to emit document.rejected event")

    return doc


async def publish_document(
    *,
    doc_id: str | UUID,
    distribution_list_ids: list[UUID] | None = None,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Publish document (approved → published). D-083: manual after approval."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "approved":
        from fastapi import HTTPException
        raise HTTPException(400, "Only approved documents can be published")

    # Only author or admin can publish (D-083)
    if doc.created_by != actor_id:
        # TODO: check for document.admin permission
        pass

    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="published",
        actor_id=actor_id,
    )

    doc.status = fsm_state or "published"
    await db.commit()

    # Emit event — distribution will be handled by event handler
    try:
        from app.core.events import event_bus, OpsFluxEvent
        await event_bus.publish(OpsFluxEvent(
            event_type="document.published",
            payload={
                "document_id": str(doc.id),
                "entity_id": str(entity_id),
                "number": doc.number,
                "title": doc.title,
                "published_by": str(actor_id),
                "distribution_list_ids": [str(dl) for dl in (distribution_list_ids or [])],
            },
        ))
    except Exception:
        logger.exception("Failed to emit document.published event")

    return doc


# ═══════════════════════════════════════════════════════════════════════════════
# Electronic signatures
# ═══════════════════════════════════════════════════════════════════════════════


async def _create_signature(
    *,
    document_id: UUID,
    revision_id: UUID | None,
    signer_id: UUID,
    signer_role: str,
    db: AsyncSession,
) -> None:
    """Create an electronic signature with content hash."""
    from app.models.report_editor import DocumentSignature, Revision
    import json

    content_hash = ""
    if revision_id:
        revision = await db.get(Revision, revision_id)
        if revision:
            content_str = json.dumps(revision.content, sort_keys=True, default=str)
            content_hash = hashlib.sha256(content_str.encode()).hexdigest()

    sig = DocumentSignature(
        document_id=document_id,
        revision_id=revision_id,
        signer_id=signer_id,
        signer_role=signer_role,
        content_hash=content_hash,
    )
    db.add(sig)
    await db.flush()


# ═══════════════════════════════════════════════════════════════════════════════
# Share links
# ═══════════════════════════════════════════════════════════════════════════════


async def create_share_link(
    *,
    document_id: UUID,
    entity_id: UUID,
    expires_days: int = 30,
    otp_required: bool = False,
    max_accesses: int | None = None,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a temporary share link for external access."""
    from app.models.report_editor import ShareLink
    import secrets

    doc = await get_document(document_id, entity_id, db)

    token = secrets.token_urlsafe(32)
    link = ShareLink(
        entity_id=entity_id,
        document_id=doc.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=expires_days),
        otp_required=otp_required,
        max_accesses=max_accesses,
        access_count=0,
        created_by=created_by,
    )
    db.add(link)
    await db.commit()

    return link


# ═══════════════════════════════════════════════════════════════════════════════
# DocType management
# ═══════════════════════════════════════════════════════════════════════════════


async def list_doc_types(
    *,
    entity_id: UUID,
    active_only: bool = True,
    db: AsyncSession,
) -> list[Any]:
    """List document types for the entity."""
    from app.models.report_editor import DocType

    query = select(DocType).where(DocType.entity_id == entity_id)
    if active_only:
        query = query.where(DocType.is_active == True)  # noqa: E712
    query = query.order_by(DocType.code)

    result = await db.execute(query)
    return result.scalars().all()


async def create_doc_type(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new document type."""
    from app.models.report_editor import DocType

    doc_type = DocType(
        entity_id=entity_id,
        code=body.code,
        name=body.name,
        nomenclature_pattern=body.nomenclature_pattern,
        discipline=getattr(body, "discipline", None),
        default_template_id=getattr(body, "default_template_id", None),
        default_workflow_id=getattr(body, "default_workflow_id", None),
        default_language=getattr(body, "default_language", "fr"),
        revision_scheme=getattr(body, "revision_scheme", "alpha"),
        created_by=created_by,
    )
    db.add(doc_type)
    await db.commit()
    return doc_type


# ═══════════════════════════════════════════════════════════════════════════════
# Template management
# ═══════════════════════════════════════════════════════════════════════════════


async def list_templates(
    *,
    entity_id: UUID,
    doc_type_id: UUID | None = None,
    active_only: bool = True,
    db: AsyncSession,
) -> list[Any]:
    """List templates for the entity."""
    from app.models.report_editor import Template

    query = select(Template).where(Template.entity_id == entity_id)
    if active_only:
        query = query.where(Template.is_active == True)  # noqa: E712
    if doc_type_id:
        query = query.where(Template.doc_type_id == doc_type_id)
    query = query.order_by(Template.name)

    result = await db.execute(query)
    return result.scalars().all()


async def create_template(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new template."""
    from app.models.report_editor import Template

    template = Template(
        entity_id=entity_id,
        name=body.name,
        description=getattr(body, "description", None),
        doc_type_id=getattr(body, "doc_type_id", None),
        structure=body.structure,
        styles=body.styles,
        created_by=created_by,
    )
    db.add(template)
    await db.commit()
    return template


async def update_template(
    *,
    template_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a template."""
    from app.models.report_editor import Template

    result = await db.execute(
        select(Template).where(
            Template.id == UUID(str(template_id)),
            Template.entity_id == entity_id,
        )
    )
    template = result.scalar_one_or_none()
    if not template:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")

    update_data = body.model_dump(exclude_unset=True)

    # Bump version if structure changes
    if "structure" in update_data:
        template.version += 1

    for key, value in update_data.items():
        setattr(template, key, value)

    await db.commit()
    return template


# ═══════════════════════════════════════════════════════════════════════════════
# Distribution lists
# ═══════════════════════════════════════════════════════════════════════════════


async def list_distribution_lists(
    *,
    entity_id: UUID,
    doc_type_id: UUID | None = None,
    db: AsyncSession,
) -> list[Any]:
    """List distribution lists for the entity."""
    from app.models.report_editor import DistributionList

    query = (
        select(DistributionList)
        .where(
            DistributionList.entity_id == entity_id,
            DistributionList.is_active == True,  # noqa: E712
        )
    )
    if doc_type_id:
        query = query.where(
            or_(
                DistributionList.doc_type_filter == doc_type_id,
                DistributionList.doc_type_filter.is_(None),
            )
        )
    result = await db.execute(query)
    return result.scalars().all()


async def create_distribution_list(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a distribution list."""
    from app.models.report_editor import DistributionList

    dl = DistributionList(
        entity_id=entity_id,
        name=body.name,
        doc_type_filter=getattr(body, "doc_type_filter", None),
        recipients=body.recipients,
        created_by=created_by,
    )
    db.add(dl)
    await db.commit()
    return dl


# ═══════════════════════════════════════════════════════════════════════════════
# Arborescence nodes
# ═══════════════════════════════════════════════════════════════════════════════


async def list_arborescence_nodes(
    *,
    project_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """List arborescence nodes for a project (tree structure)."""
    from app.models.report_editor import ArborescenceNode

    result = await db.execute(
        select(ArborescenceNode)
        .where(
            ArborescenceNode.project_id == project_id,
            ArborescenceNode.entity_id == entity_id,
        )
        .order_by(ArborescenceNode.node_level, ArborescenceNode.display_order)
    )
    return result.scalars().all()


async def create_arborescence_node(
    *,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Create an arborescence node."""
    from app.models.report_editor import ArborescenceNode

    # Determine node level from parent
    node_level = 0
    if body.parent_id:
        parent = await db.get(ArborescenceNode, body.parent_id)
        if parent:
            node_level = parent.node_level + 1

    node = ArborescenceNode(
        entity_id=entity_id,
        project_id=body.project_id,
        parent_id=body.parent_id,
        name=body.name,
        node_level=node_level,
        display_order=getattr(body, "display_order", 0),
        nomenclature_override=getattr(body, "nomenclature_override", None),
    )
    db.add(node)
    await db.commit()
    return node


# ═══════════════════════════════════════════════════════════════════════════════
# Revision diff
# ═══════════════════════════════════════════════════════════════════════════════


async def diff_revisions(
    *,
    doc_id: str | UUID,
    rev_a_id: str,
    rev_b_id: str,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Compare two revisions and return the diff."""
    rev_a = await get_revision(rev_a_id, entity_id, db)
    rev_b = await get_revision(rev_b_id, entity_id, db)

    # Basic JSON diff of form_data
    additions = []
    deletions = []
    modifications = []

    form_a = rev_a.form_data or {}
    form_b = rev_b.form_data or {}

    all_keys = set(form_a.keys()) | set(form_b.keys())
    for key in sorted(all_keys):
        val_a = form_a.get(key)
        val_b = form_b.get(key)

        if val_a is None and val_b is not None:
            additions.append({"field": key, "value": val_b})
        elif val_a is not None and val_b is None:
            deletions.append({"field": key, "value": val_a})
        elif val_a != val_b:
            modifications.append({"field": key, "old": val_a, "new": val_b})

    return {
        "rev_a": rev_a.rev_code,
        "rev_b": rev_b.rev_code,
        "additions": additions,
        "deletions": deletions,
        "modifications": modifications,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Archive / Delete (soft)
# ═══════════════════════════════════════════════════════════════════════════════


async def archive_document(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Archive a document (any status → archived). Admin-only."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status == "archived":
        from fastapi import HTTPException
        raise HTTPException(400, "Document is already archived")

    # FSM transition attempt
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="archived",
        actor_id=actor_id,
    )

    doc.status = fsm_state or "archived"
    await db.commit()

    logger.info("Archived document %s (%s) by user %s", doc.number, doc.id, actor_id)
    return doc


async def delete_document(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> dict:
    """Soft-delete a draft document that has never been submitted (D-022)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "draft":
        from fastapi import HTTPException
        raise HTTPException(
            400,
            "Only draft documents can be deleted. "
            "Submitted documents must be archived instead.",
        )

    # Check the document was never submitted (no workflow transition history)
    try:
        from app.services.core.fsm_service import fsm_service
        history = await fsm_service.get_transition_history(
            db,
            entity_type=DOCUMENT_ENTITY_TYPE,
            entity_id=str(doc.id),
        )
        if history:
            from fastapi import HTTPException
            raise HTTPException(
                400,
                "This document has been submitted at least once and cannot be deleted. "
                "Use archive instead.",
            )
    except Exception:
        pass  # No FSM instance = never submitted = OK to delete

    # Soft delete (D-022: never physical DELETE)
    doc.status = "archived"
    await db.commit()

    logger.info("Soft-deleted document %s (%s) by user %s", doc.number, doc.id, actor_id)
    return {"status": "deleted", "document_id": str(doc.id), "number": doc.number}


# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _count_words(content: dict) -> int:
    """Count words in BlockNote JSON content."""
    if not content:
        return 0

    text_parts: list[str] = []

    def _extract_text(obj: Any) -> None:
        if isinstance(obj, dict):
            if obj.get("type") == "text" and "text" in obj:
                text_parts.append(obj["text"])
            for v in obj.values():
                _extract_text(v)
        elif isinstance(obj, list):
            for item in obj:
                _extract_text(item)

    _extract_text(content)
    full_text = " ".join(text_parts)
    return len(full_text.split()) if full_text.strip() else 0


async def _get_tenant_slug(entity_id: UUID, db: AsyncSession) -> str:
    """Get tenant slug from entity → tenant relationship."""
    from sqlalchemy import text
    result = await db.execute(
        text(
            "SELECT t.slug FROM tenants t "
            "JOIN entities e ON e.tenant_id = t.id "
            "WHERE e.id = :eid"
        ),
        {"eid": entity_id},
    )
    row = result.first()
    return row[0].upper() if row else "OPF"


async def _get_project_code(project_id: UUID, db: AsyncSession) -> str | None:
    """Get project code."""
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT code FROM projects WHERE id = :pid"),
        {"pid": project_id},
    )
    row = result.first()
    return row[0] if row else None


async def _get_bu_code(bu_id: UUID, db: AsyncSession) -> str | None:
    """Get BU code."""
    from sqlalchemy import text
    result = await db.execute(
        text("SELECT code FROM business_units WHERE id = :bid"),
        {"bid": bu_id},
    )
    row = result.first()
    return row[0] if row else None
