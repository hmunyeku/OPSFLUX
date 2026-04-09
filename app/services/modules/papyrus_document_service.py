"""Papyrus document service.

Historical implementation file kept under ``report_service`` for compatibility.
Handles document CRUD, revisions, workflow transitions, nomenclature
generation, export (PDF/DOCX), and distribution.
"""

import hashlib
import logging
import os
from copy import deepcopy
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
DOCUMENT_WORKFLOW_SLUG = "document-approval"
DOCUMENT_ENTITY_TYPE = "document"


async def _record_papyrus_snapshot(
    *,
    db: AsyncSession,
    doc: Any,
    revision: Any | None,
    actor_id: UUID | None,
    previous_content: dict | list | None,
    new_content: dict | list | None,
    message: str,
    workflow_tag: str | None = None,
) -> Any:
    from app.models.papyrus_document import DocType
    from app.services.modules.papyrus_versioning_service import record_document_version

    doc_type = await db.get(DocType, doc.doc_type_id) if getattr(doc, "doc_type_id", None) else None
    return await record_document_version(
        db=db,
        entity_id=doc.entity_id,
        document_id=doc.id,
        revision_id=getattr(revision, "id", None),
        actor_id=actor_id,
        title=doc.title,
        workflow_id=getattr(doc_type, "default_workflow_id", None),
        current_state=doc.status,
        previous_content=previous_content,
        new_content=new_content,
        created_at=getattr(doc, "created_at", None),
        updated_at=getattr(doc, "updated_at", None),
        message=message,
        workflow_tag=workflow_tag,
    )


async def _record_papyrus_workflow_transition(
    *,
    db: AsyncSession,
    doc: Any,
    revision: Any | None,
    actor_id: UUID,
    from_state: str | None,
    to_state: str,
    comment: str | None = None,
) -> None:
    from app.services.modules.papyrus_versioning_service import record_workflow_event

    version_row = await _record_papyrus_snapshot(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        previous_content=getattr(revision, "content", None),
        new_content=getattr(revision, "content", None),
        message=f"Workflow transition: {from_state or 'none'} -> {to_state}",
        workflow_tag=to_state,
    )
    await record_workflow_event(
        db=db,
        entity_id=doc.entity_id,
        document_id=doc.id,
        from_state=from_state,
        to_state=to_state,
        actor_id=actor_id,
        comment=comment,
        version_tag=getattr(version_row, "version", None),
    )


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
    arborescence_node_id: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession,
) -> dict[str, Any]:
    """List documents with filtering and pagination."""
    from app.models.papyrus_document import Document, DocType

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
    if arborescence_node_id:
        query = query.where(Document.arborescence_node_id == UUID(arborescence_node_id))
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


async def get_document_counts(
    *,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, int]:
    """Return document counts grouped by status (single GROUP BY query)."""
    from app.models.papyrus_document import Document

    result = await db.execute(
        select(Document.status, func.count(Document.id))
        .where(Document.entity_id == entity_id)
        .group_by(Document.status)
    )
    rows = result.all()

    counts = {
        "draft": 0,
        "in_review": 0,
        "approved": 0,
        "published": 0,
        "obsolete": 0,
        "archived": 0,
        "total": 0,
    }
    for status, count in rows:
        if status in counts:
            counts[status] = count
        counts["total"] += count

    return counts


async def get_document(
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single document by ID."""
    from app.models.papyrus_document import Document

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
    from app.models.papyrus_document import Document, DocType, Revision

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
            __import__("app.models.papyrus_document", fromlist=["Template"]).Template,
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

    await _record_papyrus_snapshot(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=created_by,
        previous_content=None,
        new_content=revision.content,
        message="Initial document creation",
    )

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
    from app.models.papyrus_document import Document, Revision

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

    previous_content = deepcopy(revision.content) if revision.content is not None else {}

    # Update revision content
    revision.content = content
    revision.form_data = form_data
    if yjs_state is not None:
        revision.yjs_state = yjs_state

    # Update word count
    revision.word_count = _count_words(content)

    await _record_papyrus_snapshot(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=user_id,
        previous_content=previous_content,
        new_content=revision.content,
        message="Draft saved",
    )

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
    from app.models.papyrus_document import Document, DocType, Revision

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

    await _record_papyrus_snapshot(
        db=db,
        doc=doc,
        revision=new_revision,
        actor_id=user_id,
        previous_content=None,
        new_content=new_revision.content,
        message=f"Revision {next_code} created",
    )

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
    from app.models.papyrus_document import Revision

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
    from app.models.papyrus_document import Revision

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
    result_doc = await db.execute(
        select(__import__("app.models.papyrus_document", fromlist=["Document"]).Document).where(
            __import__("app.models.papyrus_document", fromlist=["Document"]).Document.id == revision.document_id
        )
    )
    doc = result_doc.scalar_one_or_none()
    if doc:
        from app.models.papyrus_document import DocType
        from app.services.modules.papyrus_versioning_service import ensure_papyrus_document

        doc_type = await db.get(DocType, doc.doc_type_id) if getattr(doc, "doc_type_id", None) else None
        revision.content = ensure_papyrus_document(
            revision.content,
            document_id=doc.id,
            title=doc.title,
            workflow_id=getattr(doc_type, "default_workflow_id", None),
            current_state=doc.status,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
        )
    return revision


async def list_papyrus_versions(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    from app.services.modules.papyrus_versioning_service import list_document_versions

    doc = await get_document(doc_id, entity_id, db)
    versions = await list_document_versions(db=db, entity_id=entity_id, document_id=doc.id)
    return [
        {
            "id": str(version.id),
            "document_id": str(version.document_id),
            "revision_id": str(version.revision_id) if version.revision_id else None,
            "version": version.version,
            "patch_type": version.patch_type,
            "created_by": str(version.created_by) if version.created_by else None,
            "created_at": version.created_at.isoformat() if version.created_at else None,
            "message": version.message,
            "workflow_tag": version.workflow_tag,
        }
        for version in versions
    ]


async def get_papyrus_document(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
    version: int | None = None,
) -> dict[str, Any]:
    from app.models.papyrus_document import DocType, Revision
    from app.services.modules.papyrus_versioning_service import ensure_papyrus_document, reconstruct_document_version

    doc = await get_document(doc_id, entity_id, db)
    reconstructed = await reconstruct_document_version(
        db=db,
        entity_id=entity_id,
        document_id=doc.id,
        version=version,
    )
    if reconstructed is not None:
        return reconstructed

    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    doc_type = await db.get(DocType, doc.doc_type_id) if getattr(doc, "doc_type_id", None) else None
    return ensure_papyrus_document(
        revision.content if revision else {},
        document_id=doc.id,
        title=doc.title,
        workflow_id=getattr(doc_type, "default_workflow_id", None),
        current_state=doc.status,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


async def get_rendered_papyrus_document(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
    version: int | None = None,
) -> dict[str, Any]:
    from app.models.papyrus_document import DocType
    from app.services.modules.papyrus_runtime_service import render_papyrus_document

    doc = await get_document(doc_id, entity_id, db)
    canonical = await get_papyrus_document(doc_id=doc_id, entity_id=entity_id, db=db, version=version)
    doc_type = await db.get(DocType, doc.doc_type_id) if getattr(doc, "doc_type_id", None) else None
    canonical.setdefault("meta", {})
    canonical["meta"]["workflow_id"] = str(getattr(doc_type, "default_workflow_id", None)) if doc_type and getattr(doc_type, "default_workflow_id", None) else canonical["meta"].get("workflow_id")
    canonical["meta"]["current_state"] = doc.status
    return await render_papyrus_document(db=db, entity_id=entity_id, document=canonical)


# ═══════════════════════════════════════════════════════════════════════════════
# Workflow transitions (FSM integration)
# ═══════════════════════════════════════════════════════════════════════════════


async def get_workflow_state(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Return current workflow state, available transitions, and history for a document."""
    from app.services.core.fsm_service import fsm_service
    from app.models.common import (
        WorkflowInstance,
        WorkflowDefinition,
        WorkflowTransition,
    )

    doc_id_str = str(doc_id)
    entity_id_str = str(entity_id)

    # 1. Find existing workflow instance
    instance = await fsm_service.get_instance(
        db, entity_type=DOCUMENT_ENTITY_TYPE, entity_id=doc_id_str,
    )

    if not instance:
        # Try to auto-create from published definition
        try:
            # Get the document to know current status
            doc = await get_document(doc_id, entity_id, db)
            instance = await fsm_service.get_or_create_instance(
                db,
                workflow_slug=DOCUMENT_WORKFLOW_SLUG,
                entity_type=DOCUMENT_ENTITY_TYPE,
                entity_id=doc_id_str,
                initial_state=doc.status or "draft",
                entity_id_scope=entity_id,
                created_by=user_id,
            )
            await db.commit()
        except Exception:
            # No workflow definition exists — return empty state
            return {
                "current_state": None,
                "instance_id": None,
                "available_transitions": [],
                "history": [],
            }

    # 2. Get available transitions from current state
    transitions_info = await fsm_service.get_allowed_transitions(
        db,
        workflow_slug=DOCUMENT_WORKFLOW_SLUG,
        entity_type=DOCUMENT_ENTITY_TYPE,
        entity_id=doc_id_str,
    )

    available = [
        {
            "to_state": t.to_state,
            "label": t.label or t.to_state.replace("_", " ").title(),
            "required_roles": t.required_roles or [],
            "comment_required": t.comment_required,
        }
        for t in transitions_info
    ]

    # 3. Get transition history with actor names
    from sqlalchemy import text

    history_rows = await db.execute(
        text(
            "SELECT wt.from_state, wt.to_state, wt.comment, wt.created_at, "
            "COALESCE(u.full_name, u.email, 'Systeme') AS actor_name "
            "FROM workflow_transitions wt "
            "LEFT JOIN users u ON u.id = wt.actor_id "
            "WHERE wt.instance_id = :iid "
            "ORDER BY wt.created_at DESC "
            "LIMIT 50"
        ),
        {"iid": instance.id},
    )
    history = [
        {
            "from_state": row.from_state,
            "to_state": row.to_state,
            "comment": row.comment,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "actor_name": row.actor_name,
        }
        for row in history_rows.all()
    ]

    return {
        "current_state": instance.current_state,
        "instance_id": str(instance.id),
        "available_transitions": available,
        "history": history,
    }


async def execute_transition(
    *,
    doc_id: str | UUID,
    to_state: str,
    comment: str | None = None,
    actor_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Execute a workflow transition with side effects and return updated state."""
    from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError
    from app.models.papyrus_document import Revision

    doc = await get_document(doc_id, entity_id, db)
    doc_id_str = str(doc.id)
    entity_id_str = str(entity_id)
    from_state = doc.status

    # Execute the FSM transition
    try:
        instance = await fsm_service.transition(
            db,
            workflow_slug=DOCUMENT_WORKFLOW_SLUG,
            entity_type=DOCUMENT_ENTITY_TYPE,
            entity_id=doc_id_str,
            to_state=to_state,
            actor_id=actor_id,
            entity_id_scope=entity_id,
            comment=comment,
        )
    except FSMPermissionError as e:
        from fastapi import HTTPException
        raise HTTPException(403, str(e))
    except FSMError as e:
        from fastapi import HTTPException
        raise HTTPException(400, str(e))

    # Update document status to match workflow
    doc.status = instance.current_state

    # Side effects based on target state
    if to_state in ("approved",) or to_state.endswith("_approved"):
        # Create signature, lock revision
        await _create_signature(
            document_id=doc.id,
            revision_id=doc.current_revision_id,
            signer_id=actor_id,
            signer_role="approver",
            db=db,
        )
        if doc.current_revision_id:
            revision = await db.get(Revision, doc.current_revision_id)
            if revision:
                revision.is_locked = True

    elif to_state == "in_review":
        # Lock revision on submission
        if doc.current_revision_id:
            revision = await db.get(Revision, doc.current_revision_id)
            if revision:
                revision.is_locked = True

    elif to_state == "draft":
        # Rejection: unlock revision for editing
        if doc.current_revision_id:
            revision = await db.get(Revision, doc.current_revision_id)
            if revision:
                revision.is_locked = False

    elif to_state == "published":
        pass  # Distribution handled by event handler

    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=comment,
    )

    await db.commit()

    # Emit event after commit
    try:
        await fsm_service.emit_transition_event(
            entity_type=DOCUMENT_ENTITY_TYPE,
            entity_id=doc_id_str,
            from_state=from_state,
            to_state=to_state,
            actor_id=actor_id,
            workflow_slug=DOCUMENT_WORKFLOW_SLUG,
            extra_payload={
                "document_id": doc_id_str,
                "entity_id": entity_id_str,
                "number": doc.number,
                "title": doc.title,
            },
        )
    except Exception:
        logger.exception("Failed to emit transition event")

    # Return updated workflow state
    return await get_workflow_state(
        doc_id=doc_id, entity_id=entity_id, user_id=actor_id, db=db,
    )


async def seed_default_document_workflow(
    *,
    entity_id: UUID,
    created_by: UUID | None = None,
    db: AsyncSession,
) -> None:
    """Create the default document-approval workflow definition if it doesn't exist.

    Called on app startup or first document creation. Safe to call multiple times.
    """
    from app.models.common import WorkflowDefinition
    from sqlalchemy import select

    # Check if definition already exists
    existing = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.slug == DOCUMENT_WORKFLOW_SLUG,
        )
    )
    if existing.scalar_one_or_none():
        return  # Already seeded

    definition = WorkflowDefinition(
        entity_id=entity_id,
        slug=DOCUMENT_WORKFLOW_SLUG,
        name="Document Approval Workflow",
        description="Default approval workflow for Papyrus documents: draft -> in_review -> approved -> published -> obsolete -> archived",
        entity_type=DOCUMENT_ENTITY_TYPE,
        version=1,
        status="published",
        active=True,
        states={
            "draft": {"label": "Brouillon", "color": "#6B7280"},
            "in_review": {"label": "En revue", "color": "#3B82F6"},
            "approved": {"label": "Approuve", "color": "#10B981"},
            "published": {"label": "Publie", "color": "#8B5CF6"},
            "obsolete": {"label": "Obsolete", "color": "#F59E0B"},
            "archived": {"label": "Archive", "color": "#9CA3AF"},
        },
        transitions=[
            {
                "from": "draft",
                "to": "in_review",
                "label": "Soumettre",
                "required_roles": ["author"],
                "comment_required": False,
            },
            {
                "from": "in_review",
                "to": "approved",
                "label": "Approuver",
                "required_roles": ["checker", "approver"],
                "comment_required": False,
            },
            {
                "from": "in_review",
                "to": "draft",
                "label": "Rejeter",
                "required_roles": ["checker", "approver"],
                "comment_required": True,
            },
            {
                "from": "approved",
                "to": "published",
                "label": "Publier",
                "required_roles": ["publisher"],
                "comment_required": False,
            },
            {
                "from": "published",
                "to": "obsolete",
                "label": "Rendre obsolete",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "draft",
                "to": "archived",
                "label": "Archiver",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "in_review",
                "to": "archived",
                "label": "Archiver",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "approved",
                "to": "archived",
                "label": "Archiver",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "published",
                "to": "archived",
                "label": "Archiver",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "obsolete",
                "to": "archived",
                "label": "Archiver",
                "required_roles": ["admin"],
                "comment_required": False,
            },
        ],
        created_by=created_by,
    )
    db.add(definition)
    await db.flush()
    logger.info("Seeded default document-approval workflow for entity %s", entity_id)


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
            actor_id=actor_id,
            entity_id_scope=UUID(entity_id_str) if entity_id_str else None,
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
        from app.models.papyrus_document import Revision
        revision = await db.get(Revision, doc.current_revision_id)
        if revision:
            revision.is_locked = True

    # Try FSM transition
    from_state = doc.status
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="in_review",
        actor_id=actor_id,
        comment=comment,
    )

    doc.status = fsm_state or "in_review"
    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=comment,
    )
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
                "created_by": str(doc.created_by),
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

    from_state = doc.status
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

    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=comment,
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
                "created_by": str(doc.created_by),
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

    from_state = doc.status
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
        from app.models.papyrus_document import Revision
        revision = await db.get(Revision, doc.current_revision_id)
        if revision:
            revision.is_locked = False

    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=reason,
    )

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
                "created_by": str(doc.created_by),
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

    from_state = doc.status
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="published",
        actor_id=actor_id,
    )

    doc.status = fsm_state or "published"
    from app.models.papyrus_document import Revision
    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=None,
    )
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


async def obsolete_document(
    *,
    doc_id: str | UUID,
    superseded_by: UUID | None = None,
    entity_id: UUID,
    actor_id: UUID,
    db: AsyncSession,
) -> Any:
    """Obsolete a published document (published -> obsolete)."""
    doc = await get_document(doc_id, entity_id, db)

    if doc.status != "published":
        from fastapi import HTTPException
        raise HTTPException(400, "Only published documents can be obsoleted")

    from_state = doc.status
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="obsolete",
        actor_id=actor_id,
    )

    doc.status = fsm_state or "obsolete"
    from app.models.papyrus_document import Revision
    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=None,
    )
    await db.commit()

    # Emit event after commit
    try:
        from app.core.events import event_bus, OpsFluxEvent
        await event_bus.publish(OpsFluxEvent(
            event_type="document.obsoleted",
            payload={
                "document_id": str(doc.id),
                "entity_id": str(entity_id),
                "number": doc.number,
                "title": doc.title,
                "obsoleted_by": str(actor_id),
                "created_by": str(doc.created_by),
                "superseded_by": str(superseded_by) if superseded_by else None,
            },
        ))
    except Exception:
        logger.exception("Failed to emit document.obsoleted event")

    logger.info("Obsoleted document %s (%s) by user %s", doc.number, doc.id, actor_id)
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
    from app.models.papyrus_document import DocumentSignature, Revision
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
    from app.models.papyrus_document import ShareLink
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
    from app.models.papyrus_document import DocType

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
    from app.models.papyrus_document import DocType

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


async def update_doc_type(
    *,
    type_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a document type."""
    from app.models.papyrus_document import DocType

    result = await db.execute(
        select(DocType).where(
            DocType.id == UUID(str(type_id)),
            DocType.entity_id == entity_id,
        )
    )
    doc_type = result.scalar_one_or_none()
    if not doc_type:
        from fastapi import HTTPException
        raise HTTPException(404, "Doc type not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(doc_type, key, value)

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
    from app.models.papyrus_document import Template

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
    from app.models.papyrus_document import Template

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
    from app.models.papyrus_document import Template

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
    from app.models.papyrus_document import DistributionList

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
    from app.models.papyrus_document import DistributionList

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
    from app.models.papyrus_document import ArborescenceNode

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
    from app.models.papyrus_document import ArborescenceNode

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
    from app.models.papyrus_document import Document, DocType
    from app.services.modules.papyrus_versioning_service import ensure_papyrus_document, summarize_document_diff

    rev_a = await get_revision(rev_a_id, entity_id, db)
    rev_b = await get_revision(rev_b_id, entity_id, db)
    doc = await db.get(Document, UUID(str(doc_id)))
    doc_type = await db.get(DocType, doc.doc_type_id) if doc and getattr(doc, "doc_type_id", None) else None

    papyrus_a = ensure_papyrus_document(
        rev_a.content,
        document_id=doc.id if doc else UUID(str(doc_id)),
        title=getattr(doc, "title", None),
        workflow_id=getattr(doc_type, "default_workflow_id", None),
        current_state=getattr(doc, "status", None),
        created_at=getattr(doc, "created_at", None),
        updated_at=getattr(doc, "updated_at", None),
    )
    papyrus_b = ensure_papyrus_document(
        rev_b.content,
        document_id=doc.id if doc else UUID(str(doc_id)),
        title=getattr(doc, "title", None),
        workflow_id=getattr(doc_type, "default_workflow_id", None),
        current_state=getattr(doc, "status", None),
        created_at=getattr(doc, "created_at", None),
        updated_at=getattr(doc, "updated_at", None),
    )
    summary = summarize_document_diff(papyrus_a, papyrus_b)

    return {
        "rev_a": rev_a.rev_code,
        "rev_b": rev_b.rev_code,
        "additions": summary["additions"],
        "deletions": summary["deletions"],
        "modifications": summary["modifications"],
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
    from_state = doc.status
    fsm_state, _ = await _try_workflow_transition(
        db,
        entity_id_str=str(entity_id),
        doc_id_str=str(doc.id),
        to_state="archived",
        actor_id=actor_id,
    )

    doc.status = fsm_state or "archived"
    from app.models.papyrus_document import Revision
    revision = await db.get(Revision, doc.current_revision_id) if doc.current_revision_id else None
    await _record_papyrus_workflow_transition(
        db=db,
        doc=doc,
        revision=revision,
        actor_id=actor_id,
        from_state=from_state,
        to_state=doc.status,
        comment=None,
    )
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


# ═══════════════════════════════════════════════════════════════════════════════
# TemplateField CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def list_template_fields(
    *,
    template_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """List fields for a template, ordered by display_order."""
    from app.models.papyrus_document import Template, TemplateField

    # Verify the template belongs to the entity
    tpl_result = await db.execute(
        select(Template).where(
            Template.id == UUID(str(template_id)),
            Template.entity_id == entity_id,
        )
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")

    result = await db.execute(
        select(TemplateField)
        .where(TemplateField.template_id == UUID(str(template_id)))
        .order_by(TemplateField.display_order, TemplateField.field_key)
    )
    return result.scalars().all()


async def create_template_field(
    *,
    template_id: str | UUID,
    body: Any,  # TemplateFieldCreate schema
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Create a field in a template."""
    from app.models.papyrus_document import Template, TemplateField

    # Verify the template belongs to the entity
    tpl_result = await db.execute(
        select(Template).where(
            Template.id == UUID(str(template_id)),
            Template.entity_id == entity_id,
        )
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")

    field = TemplateField(
        template_id=template.id,
        section_id=body.section_id,
        field_key=body.field_key,
        field_type=body.field_type,
        label=body.label,
        is_required=getattr(body, "is_required", False),
        is_locked=getattr(body, "is_locked", False),
        options=getattr(body, "options", {}),
        display_order=getattr(body, "display_order", 0),
        validation_rules=getattr(body, "validation_rules", {}),
    )
    db.add(field)
    await db.commit()

    logger.info("Created template field %s.%s in template %s", body.section_id, body.field_key, template_id)
    return field


async def update_template_field(
    *,
    template_id: str | UUID,
    field_id: str | UUID,
    body: Any,  # TemplateFieldUpdate schema
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a template field."""
    from app.models.papyrus_document import Template, TemplateField

    # Verify the template belongs to the entity
    tpl_result = await db.execute(
        select(Template).where(
            Template.id == UUID(str(template_id)),
            Template.entity_id == entity_id,
        )
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")

    result = await db.execute(
        select(TemplateField).where(
            TemplateField.id == UUID(str(field_id)),
            TemplateField.template_id == UUID(str(template_id)),
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        from fastapi import HTTPException
        raise HTTPException(404, "Template field not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(field, key, value)

    await db.commit()
    return field


async def delete_template_field(
    *,
    template_id: str | UUID,
    field_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Delete a template field (hard delete)."""
    from app.models.papyrus_document import Template, TemplateField

    # Verify the template belongs to the entity
    tpl_result = await db.execute(
        select(Template).where(
            Template.id == UUID(str(template_id)),
            Template.entity_id == entity_id,
        )
    )
    template = tpl_result.scalar_one_or_none()
    if not template:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")

    result = await db.execute(
        select(TemplateField).where(
            TemplateField.id == UUID(str(field_id)),
            TemplateField.template_id == UUID(str(template_id)),
        )
    )
    field = result.scalar_one_or_none()
    if not field:
        from fastapi import HTTPException
        raise HTTPException(404, "Template field not found")

    await db.delete(field)
    await db.commit()

    logger.info("Deleted template field %s from template %s", field_id, template_id)
    return {"status": "deleted", "field_id": str(field_id)}


# ═══════════════════════════════════════════════════════════════════════════════
# Share link consumption (public, no auth)
# ═══════════════════════════════════════════════════════════════════════════════


async def consume_share_link(
    *,
    token: str,
    db: AsyncSession,
) -> dict[str, Any]:
    """Consume a share link — public endpoint, no auth required.

    Validates token, checks expiry and access limits,
    increments access_count, returns document metadata + revision content.
    """
    from app.models.papyrus_document import ShareLink, Document, Revision
    from fastapi import HTTPException

    result = await db.execute(
        select(ShareLink).where(ShareLink.token == token)
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(404, "Share link not found or invalid")

    # Check expiry
    now = datetime.now(timezone.utc)
    if link.expires_at < now:
        raise HTTPException(410, "Share link has expired")

    # Check max accesses
    if link.max_accesses is not None and link.access_count >= link.max_accesses:
        raise HTTPException(410, "Share link has reached its maximum number of accesses")

    # Check OTP requirement
    if link.otp_required:
        raise HTTPException(401, "OTP verification required to access this document")

    # Increment access count and update last_accessed_at
    link.access_count += 1

    # Load the document
    doc_result = await db.execute(
        select(Document).where(Document.id == link.document_id)
    )
    doc = doc_result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")

    # Load current revision content
    revision_data = None
    if doc.current_revision_id:
        rev_result = await db.execute(
            select(Revision).where(Revision.id == doc.current_revision_id)
        )
        revision = rev_result.scalar_one_or_none()
        if revision:
            revision_data = {
                "rev_code": revision.rev_code,
                "content": revision.content,
                "form_data": revision.form_data,
                "word_count": revision.word_count,
                "created_at": revision.created_at.isoformat() if revision.created_at else None,
            }

    await db.commit()

    return {
        "title": doc.title,
        "number": doc.number,
        "status": doc.status,
        "language": doc.language,
        "classification": doc.classification,
        "current_revision": revision_data,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Distribution list UPDATE / DELETE
# ═══════════════════════════════════════════════════════════════════════════════


async def update_distribution_list(
    *,
    list_id: str | UUID,
    body: Any,  # DistributionListUpdate schema
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a distribution list."""
    from app.models.papyrus_document import DistributionList

    result = await db.execute(
        select(DistributionList).where(
            DistributionList.id == UUID(str(list_id)),
            DistributionList.entity_id == entity_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        from fastapi import HTTPException
        raise HTTPException(404, "Distribution list not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(dl, key, value)

    await db.commit()
    return dl


async def delete_distribution_list(
    *,
    list_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Soft-delete a distribution list (set is_active=False)."""
    from app.models.papyrus_document import DistributionList

    result = await db.execute(
        select(DistributionList).where(
            DistributionList.id == UUID(str(list_id)),
            DistributionList.entity_id == entity_id,
        )
    )
    dl = result.scalar_one_or_none()
    if not dl:
        from fastapi import HTTPException
        raise HTTPException(404, "Distribution list not found")

    dl.is_active = False
    await db.commit()

    logger.info("Soft-deleted distribution list %s", list_id)
    return {"status": "deleted", "list_id": str(list_id)}


# ═══════════════════════════════════════════════════════════════════════════════
# Document signatures list
# ═══════════════════════════════════════════════════════════════════════════════


async def list_document_signatures(
    *,
    doc_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """List all signatures for a document, ordered by signed_at DESC.

    Joins with users table to resolve signer_name.
    """
    from app.models.papyrus_document import DocumentSignature, Document
    from sqlalchemy import text

    # Verify the document belongs to the entity
    doc = await get_document(doc_id, entity_id, db)

    result = await db.execute(
        text(
            "SELECT ds.id, ds.document_id, ds.revision_id, ds.signer_id, "
            "ds.signer_role, ds.content_hash, ds.signed_at, "
            "COALESCE(u.full_name, u.email, 'Unknown') AS signer_name "
            "FROM document_signatures ds "
            "LEFT JOIN users u ON u.id = ds.signer_id "
            "WHERE ds.document_id = :doc_id "
            "ORDER BY ds.signed_at DESC"
        ),
        {"doc_id": doc.id},
    )
    rows = result.all()

    return [
        {
            "id": str(row.id),
            "document_id": str(row.document_id),
            "revision_id": str(row.revision_id),
            "signer_id": str(row.signer_id),
            "signer_role": row.signer_role,
            "content_hash": row.content_hash,
            "signed_at": row.signed_at.isoformat() if row.signed_at else None,
            "signer_name": row.signer_name,
        }
        for row in rows
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# DocType soft-delete
# ═══════════════════════════════════════════════════════════════════════════════


async def delete_doc_type(
    *,
    type_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Soft-delete a document type (set is_active=False).

    Only allowed if no documents currently reference this type.
    """
    from app.models.papyrus_document import DocType, Document

    result = await db.execute(
        select(DocType).where(
            DocType.id == UUID(str(type_id)),
            DocType.entity_id == entity_id,
        )
    )
    doc_type = result.scalar_one_or_none()
    if not doc_type:
        from fastapi import HTTPException
        raise HTTPException(404, "Doc type not found")

    # Check for referencing documents
    doc_count = await db.execute(
        select(func.count()).select_from(Document).where(
            Document.doc_type_id == UUID(str(type_id)),
            Document.entity_id == entity_id,
        )
    )
    count = doc_count.scalar() or 0
    if count > 0:
        from fastapi import HTTPException
        raise HTTPException(
            409,
            f"Cannot delete doc type: {count} document(s) reference this type. "
            "Reassign or archive them first.",
        )

    doc_type.is_active = False
    await db.commit()

    logger.info("Soft-deleted doc type %s (%s)", doc_type.code, type_id)
    return {"status": "deleted", "type_id": str(type_id), "code": doc_type.code}


# ═══════════════════════════════════════════════════════════════════════════════
# MDR Import
# ═══════════════════════════════════════════════════════════════════════════════


# Column alias mapping (case-insensitive)
_MDR_COL_MAP: dict[str, str] = {
    # → code
    "code": "code",
    "doc_type_code": "code",
    "type_code": "code",
    # → name
    "name": "name",
    "doc_type_name": "name",
    "type_name": "name",
    # → discipline
    "discipline": "discipline",
    "disc": "discipline",
    # → nomenclature_pattern
    "pattern": "nomenclature_pattern",
    "nomenclature": "nomenclature_pattern",
    "nomenclature_pattern": "nomenclature_pattern",
    # → revision_scheme
    "revision_scheme": "revision_scheme",
    "rev_scheme": "revision_scheme",
    # → document_number (optional — creates Document placeholders)
    "document_number": "document_number",
    "doc_number": "document_number",
}


def _normalise_header(raw: str) -> str | None:
    """Map a raw column header to canonical field name, or None if unknown."""
    return _MDR_COL_MAP.get(raw.strip().lower().replace(" ", "_"))


async def import_mdr(
    *,
    file,  # fastapi UploadFile
    entity_id: UUID,
    project_id: UUID | None,
    created_by: UUID,
    db: AsyncSession,
) -> dict:
    """Import a Master Document Register (CSV / XLSX).

    For each row:
      1. Upsert DocType (match on entity_id + code).
      2. Optionally create Document placeholder when document_number column is present.

    Returns {created_types, updated_types, created_documents, errors}.
    """
    import csv
    import io

    from app.models.papyrus_document import DocType, Document

    filename = (file.filename or "").lower()
    raw_bytes = await file.read()

    rows: list[dict[str, str]] = []
    errors: list[str] = []

    # ── Parse file ──
    if filename.endswith(".csv"):
        text = raw_bytes.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        for row in reader:
            rows.append(row)
    elif filename.endswith((".xlsx", ".xls")):
        try:
            import openpyxl
        except ImportError:
            from fastapi import HTTPException
            raise HTTPException(501, "XLSX import requires openpyxl — pip install openpyxl")

        wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
        ws = wb.active
        if ws is None:
            return {"created_types": 0, "updated_types": 0, "created_documents": 0, "errors": ["Empty workbook"]}

        headers: list[str] = []
        for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
            if row_idx == 1:
                headers = [str(c or "").strip() for c in row]
                continue
            row_dict = {}
            for col_idx, cell_val in enumerate(row):
                if col_idx < len(headers):
                    row_dict[headers[col_idx]] = str(cell_val) if cell_val is not None else ""
            if any(v.strip() for v in row_dict.values()):
                rows.append(row_dict)
        wb.close()
    else:
        from fastapi import HTTPException
        raise HTTPException(400, "Unsupported file format. Use .csv or .xlsx")

    if not rows:
        return {"created_types": 0, "updated_types": 0, "created_documents": 0, "errors": ["File is empty or has no data rows"]}

    # ── Resolve column mapping ──
    sample_keys = list(rows[0].keys())
    col_map: dict[str, str] = {}
    for raw_key in sample_keys:
        canonical = _normalise_header(raw_key)
        if canonical:
            col_map[raw_key] = canonical

    if "code" not in col_map.values():
        return {
            "created_types": 0,
            "updated_types": 0,
            "created_documents": 0,
            "errors": [
                f"No 'code' column found. Expected one of: code, doc_type_code, type_code. "
                f"Found columns: {', '.join(sample_keys)}"
            ],
        }

    # ── Pre-load existing doc types for this entity ──
    existing_result = await db.execute(
        select(DocType).where(DocType.entity_id == entity_id)
    )
    existing_types: dict[str, DocType] = {
        dt.code: dt for dt in existing_result.scalars().all()
    }

    created_types = 0
    updated_types = 0
    created_documents = 0

    for row_num, row in enumerate(rows, start=2):
        # Build mapped values
        mapped: dict[str, str] = {}
        for raw_key, canonical in col_map.items():
            mapped[canonical] = row.get(raw_key, "").strip()

        code = mapped.get("code", "").strip()
        if not code:
            errors.append(f"Row {row_num}: empty code — skipped")
            continue

        name_str = mapped.get("name", code).strip() or code
        discipline = mapped.get("discipline", "").strip() or None
        nomenclature_pattern = mapped.get("nomenclature_pattern", "").strip()
        revision_scheme = mapped.get("revision_scheme", "").strip().lower() or "alpha"
        if revision_scheme not in ("alpha", "numeric", "semver"):
            errors.append(f"Row {row_num}: invalid revision_scheme '{revision_scheme}' — defaulting to 'alpha'")
            revision_scheme = "alpha"

        if not nomenclature_pattern:
            nomenclature_pattern = f"{code}-{{SEQ:4}}"

        if code in existing_types:
            # Update existing
            dt = existing_types[code]
            dt.name = {"fr": name_str}
            if discipline is not None:
                dt.discipline = discipline
            dt.nomenclature_pattern = nomenclature_pattern
            dt.revision_scheme = revision_scheme
            dt.is_active = True
            updated_types += 1
        else:
            # Create new
            dt = DocType(
                entity_id=entity_id,
                code=code,
                name={"fr": name_str},
                discipline=discipline,
                nomenclature_pattern=nomenclature_pattern,
                revision_scheme=revision_scheme,
                is_active=True,
                created_by=created_by,
            )
            db.add(dt)
            existing_types[code] = dt
            created_types += 1

        # Flush so dt gets an id (needed for Document FK)
        await db.flush()

        # Optionally create Document placeholder
        doc_number = mapped.get("document_number", "").strip()
        if doc_number:
            # Check if document with this number already exists
            existing_doc = await db.execute(
                select(Document).where(
                    Document.entity_id == entity_id,
                    Document.number == doc_number,
                )
            )
            if existing_doc.scalar_one_or_none() is None:
                doc = Document(
                    entity_id=entity_id,
                    doc_type_id=dt.id,
                    project_id=project_id,
                    number=doc_number,
                    title=doc_number,
                    language="fr",
                    status="draft",
                    classification="INT",
                    created_by=created_by,
                )
                db.add(doc)
                created_documents += 1
            else:
                errors.append(f"Row {row_num}: document '{doc_number}' already exists — skipped placeholder")

    await db.commit()

    logger.info(
        "MDR import: %d types created, %d updated, %d docs — %d errors",
        created_types, updated_types, created_documents, len(errors),
    )
    return {
        "created_types": created_types,
        "updated_types": updated_types,
        "created_documents": created_documents,
        "errors": errors,
    }

