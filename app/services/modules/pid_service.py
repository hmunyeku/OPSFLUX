"""PID/PFD — business logic service.

Handles PID document management, XML parsing, equipment sync,
process line tracing, and draw.io integration.
"""

import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import func, select, and_, or_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.expression import cast

logger = logging.getLogger(__name__)

# Workflow constants
PID_WORKFLOW_SLUG = "pid-approval"
PID_ENTITY_TYPE = "pid"


# ═══════════════════════════════════════════════════════════════════════════════
# PID Document CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def list_pid_documents(
    *,
    entity_id: UUID,
    project_id: str | None = None,
    bu_id: UUID | None = None,
    status: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession,
) -> dict[str, Any]:
    """List PID documents with filtering and pagination."""
    from app.models.pid_pfd import PIDDocument

    query = select(PIDDocument).where(
        PIDDocument.entity_id == entity_id,
        PIDDocument.is_active == True,  # noqa: E712
    )

    if project_id:
        query = query.where(PIDDocument.project_id == UUID(project_id))
    if bu_id:
        query = query.where(PIDDocument.bu_id == bu_id)
    if status:
        query = query.where(PIDDocument.status == status)
    if search:
        query = query.where(
            or_(
                PIDDocument.title.ilike(f"%{search}%"),
                PIDDocument.number.ilike(f"%{search}%"),
                PIDDocument.drawing_number.ilike(f"%{search}%"),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = (
        query
        .order_by(PIDDocument.updated_at.desc())
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


async def get_pid_document(
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single PID document by ID."""
    from app.models.pid_pfd import PIDDocument

    result = await db.execute(
        select(PIDDocument).where(
            PIDDocument.id == UUID(str(pid_id)),
            PIDDocument.entity_id == entity_id,
        )
    )
    pid = result.scalar_one_or_none()
    if not pid:
        from fastapi import HTTPException
        raise HTTPException(404, f"PID document {pid_id} not found")
    return pid


async def create_pid_document(
    *,
    body: Any,
    entity_id: UUID,
    bu_id: UUID | None,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new PID document."""
    from app.models.pid_pfd import PIDDocument

    # Generate PID number
    number = await _generate_pid_number(entity_id, body.project_id, db)

    pid = PIDDocument(
        entity_id=entity_id,
        project_id=body.project_id,
        bu_id=bu_id,
        number=number,
        title=body.title,
        pid_type=body.pid_type,
        sheet_format=getattr(body, "sheet_format", "A1"),
        scale=getattr(body, "scale", "1:100"),
        drawing_number=getattr(body, "drawing_number", None),
        revision="0",
        status="draft",
        created_by=created_by,
    )
    db.add(pid)
    await db.commit()

    logger.info("Created PID document %s (%s) by user %s", pid.number, pid.id, created_by)
    return pid


async def update_pid_document(
    *,
    pid_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update PID document metadata."""
    pid = await get_pid_document(pid_id, entity_id, db)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key != "xml_content":  # XML saved via separate endpoint
            setattr(pid, key, value)

    await db.commit()
    return pid


async def delete_pid_document(
    *,
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Soft-delete a PID document. Only allowed if status is 'draft'."""
    pid = await get_pid_document(pid_id, entity_id, db)

    if pid.status != "draft":
        from fastapi import HTTPException
        raise HTTPException(
            409,
            f"Cannot delete PID document in status '{pid.status}'. Only draft documents can be deleted.",
        )

    pid.is_active = False
    await db.commit()
    logger.info("Soft-deleted PID document %s (%s)", pid.number, pid.id)


# ═══════════════════════════════════════════════════════════════════════════════
# Workflow (FSM integration)
# ═══════════════════════════════════════════════════════════════════════════════


async def get_pid_workflow_state(
    *,
    pid_id: str | UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Return current workflow state, available transitions, and history for a PID."""
    from app.services.core.fsm_service import fsm_service

    pid_id_str = str(pid_id)

    # 1. Find existing workflow instance
    instance = await fsm_service.get_instance(
        db, entity_type=PID_ENTITY_TYPE, entity_id=pid_id_str,
    )

    if not instance:
        # Try to auto-create from published definition
        try:
            pid = await get_pid_document(pid_id, entity_id, db)
            instance = await fsm_service.get_or_create_instance(
                db,
                workflow_slug=PID_WORKFLOW_SLUG,
                entity_type=PID_ENTITY_TYPE,
                entity_id=pid_id_str,
                initial_state=pid.status or "draft",
                entity_id_scope=entity_id,
                created_by=user_id,
            )
            await db.commit()
        except Exception:
            return {
                "current_state": None,
                "instance_id": None,
                "available_transitions": [],
                "history": [],
            }

    # 2. Get available transitions
    transitions_info = await fsm_service.get_allowed_transitions(
        db,
        workflow_slug=PID_WORKFLOW_SLUG,
        entity_type=PID_ENTITY_TYPE,
        entity_id=pid_id_str,
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


async def execute_pid_transition(
    *,
    pid_id: str | UUID,
    to_state: str,
    comment: str | None = None,
    actor_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Execute a workflow transition on a PID with side effects."""
    from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError

    pid = await get_pid_document(pid_id, entity_id, db)
    pid_id_str = str(pid.id)
    from_state = pid.status

    try:
        instance = await fsm_service.transition(
            db,
            workflow_slug=PID_WORKFLOW_SLUG,
            entity_type=PID_ENTITY_TYPE,
            entity_id=pid_id_str,
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

    # Update PID document status
    pid.status = instance.current_state

    # Side effects based on target state
    if to_state == "afc":
        # Run AFC validation and create revision snapshot
        try:
            afc_result = await validate_for_afc(
                pid_id=pid.id, entity_id=entity_id, db=db,
            )
            if not afc_result.get("is_valid", True):
                logger.warning(
                    "PID %s transitioned to AFC with validation warnings", pid.number,
                )
        except Exception:
            logger.exception("AFC validation failed during transition for PID %s", pid.number)

        # Create revision snapshot
        try:
            await create_pid_revision(
                pid_id=pid.id,
                description=f"AFC milestone — {comment or 'Approved for Construction'}",
                change_type="milestone",
                entity_id=entity_id,
                user_id=actor_id,
                db=db,
            )
        except Exception:
            logger.exception("Revision snapshot failed during AFC transition for PID %s", pid.number)

    elif to_state == "draft" or to_state == "in_review":
        # Rejection: PID unlocked for editing (status handles this)
        pass

    await db.commit()

    # Emit event after commit
    try:
        await fsm_service.emit_transition_event(
            entity_type=PID_ENTITY_TYPE,
            entity_id=pid_id_str,
            from_state=from_state,
            to_state=to_state,
            actor_id=actor_id,
            workflow_slug=PID_WORKFLOW_SLUG,
            extra_payload={
                "pid_id": pid_id_str,
                "entity_id": str(entity_id),
                "number": pid.number,
                "title": pid.title,
            },
        )
    except Exception:
        logger.exception("Failed to emit PID transition event")

    return await get_pid_workflow_state(
        pid_id=pid_id, entity_id=entity_id, user_id=actor_id, db=db,
    )


async def seed_default_pid_workflow(
    *,
    entity_id: UUID,
    created_by: UUID | None = None,
    db: AsyncSession,
) -> None:
    """Create the default pid-approval workflow definition if it doesn't exist."""
    from app.models.common import WorkflowDefinition

    existing = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.slug == PID_WORKFLOW_SLUG,
        )
    )
    if existing.scalar_one_or_none():
        return

    definition = WorkflowDefinition(
        entity_id=entity_id,
        slug=PID_WORKFLOW_SLUG,
        name="PID/PFD Approval Workflow",
        description="Default approval workflow for PID/PFD: draft -> in_review -> ifd -> afc -> as_built -> obsolete",
        entity_type=PID_ENTITY_TYPE,
        version=1,
        status="published",
        active=True,
        states={
            "draft": {"label": "Brouillon", "color": "#6B7280"},
            "in_review": {"label": "En revue", "color": "#3B82F6"},
            "ifd": {"label": "IFD (Issued for Design)", "color": "#F59E0B"},
            "afc": {"label": "AFC (Approved for Construction)", "color": "#10B981"},
            "as_built": {"label": "As-Built", "color": "#8B5CF6"},
            "obsolete": {"label": "Obsolete", "color": "#EF4444"},
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
                "to": "ifd",
                "label": "Valider IFD",
                "required_roles": ["checker"],
                "comment_required": False,
            },
            {
                "from": "in_review",
                "to": "draft",
                "label": "Rejeter",
                "required_roles": ["checker"],
                "comment_required": True,
            },
            {
                "from": "ifd",
                "to": "afc",
                "label": "Approuver AFC",
                "required_roles": ["approver"],
                "comment_required": False,
            },
            {
                "from": "ifd",
                "to": "in_review",
                "label": "Rejeter",
                "required_roles": ["approver"],
                "comment_required": True,
            },
            {
                "from": "afc",
                "to": "as_built",
                "label": "Passer As-Built",
                "required_roles": ["admin"],
                "comment_required": False,
            },
            {
                "from": "afc",
                "to": "obsolete",
                "label": "Rendre obsolete",
                "required_roles": ["admin"],
                "comment_required": False,
            },
        ],
        created_by=created_by,
    )
    db.add(definition)
    await db.flush()
    logger.info("Seeded default pid-approval workflow for entity %s", entity_id)


async def save_xml(
    *,
    pid_id: str | UUID,
    xml_content: str,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> None:
    """Save the draw.io XML content for a PID document."""
    pid = await get_pid_document(pid_id, entity_id, db)
    pid.xml_content = xml_content
    pid.updated_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("Saved XML for PID %s (%d bytes)", pid.number, len(xml_content))


# ═══════════════════════════════════════════════════════════════════════════════
# PID Revisions
# ═══════════════════════════════════════════════════════════════════════════════


async def create_pid_revision(
    *,
    pid_id: str | UUID,
    description: str | None,
    change_type: str = "modification",
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> Any:
    """Create an immutable revision snapshot of the current PID XML."""
    from app.models.pid_pfd import PIDDocument, PIDRevision
    from app.services.modules.nomenclature_service import generate_next_revision_code

    pid = await get_pid_document(pid_id, entity_id, db)

    if not pid.xml_content:
        from fastapi import HTTPException
        raise HTTPException(400, "PID has no XML content to snapshot")

    # Generate next revision code
    next_code = generate_next_revision_code(pid.revision, "alpha")

    revision = PIDRevision(
        pid_document_id=pid.id,
        revision_code=next_code,
        xml_content=pid.xml_content,
        change_description=description,
        change_type=change_type,
        created_by=user_id,
    )
    db.add(revision)

    # Update PID document revision
    pid.revision = next_code

    await db.commit()

    logger.info("Created PID revision %s for %s", next_code, pid.number)
    return revision


async def list_pid_revisions(
    *,
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> list[Any]:
    """List all revisions for a PID document."""
    from app.models.pid_pfd import PIDRevision, PIDDocument

    # Verify access
    pid = await get_pid_document(pid_id, entity_id, db)

    result = await db.execute(
        select(PIDRevision)
        .where(PIDRevision.pid_document_id == pid.id)
        .order_by(PIDRevision.created_at.desc())
    )
    return result.scalars().all()


async def diff_revisions(
    *,
    rev_a_id: str,
    rev_b_id: str,
    db: AsyncSession,
) -> dict:
    """Compare two PID revisions by analyzing their XML objects."""
    from app.models.pid_pfd import PIDRevision

    rev_a = await db.get(PIDRevision, UUID(rev_a_id))
    rev_b = await db.get(PIDRevision, UUID(rev_b_id))

    if not rev_a or not rev_b:
        from fastapi import HTTPException
        raise HTTPException(404, "One or both revisions not found")

    # Parse both XMLs and compare cell IDs
    cells_a = _extract_cell_ids(rev_a.xml_content)
    cells_b = _extract_cell_ids(rev_b.xml_content)

    added = cells_b - cells_a
    removed = cells_a - cells_b
    common = cells_a & cells_b

    return {
        "rev_a": rev_a.revision_code,
        "rev_b": rev_b.revision_code,
        "objects_added": len(added),
        "objects_removed": len(removed),
        "objects_unchanged": len(common),
        "added_ids": list(added),
        "removed_ids": list(removed),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# XML → DB Synchronization (parse_and_sync_pid)
# ═══════════════════════════════════════════════════════════════════════════════


async def parse_and_sync_pid(
    *,
    pid_id: str | UUID,
    xml_content: str,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """
    Parse draw.io XML and synchronize objects to DB.

    Called after each save in draw.io. Detects equipment, process lines,
    and instruments from mxGraph cell styles and syncs to DB.
    """
    from app.models.pid_pfd import PIDDocument, Equipment, ProcessLine, PIDConnection

    pid = await db.get(PIDDocument, UUID(str(pid_id)))
    if not pid:
        from fastapi import HTTPException
        raise HTTPException(404, f"PID {pid_id} not found")

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as e:
        logger.error("Failed to parse XML for PID %s: %s", pid_id, e)
        return {"error": f"Invalid XML: {e}", "equipment": 0, "lines": 0, "connections": 0}

    cells = root.findall(".//mxCell")
    stats = {"equipment": 0, "lines": 0, "connections": 0, "instruments": 0}

    # Track cell IDs found in XML for detecting removed objects
    found_cell_ids: set[str] = set()

    for cell in cells:
        style = cell.get("style", "")
        cell_id = cell.get("id", "")

        if not cell_id or cell_id in ("0", "1"):
            continue

        found_cell_ids.add(cell_id)

        # Detect equipment
        if _is_equipment_style(style):
            await _sync_equipment(cell, pid, entity_id, db)
            stats["equipment"] += 1

        # Detect process lines
        elif _is_process_line_style(style):
            await _sync_process_line(cell, pid, entity_id, db)
            stats["lines"] += 1

        # Detect instruments
        elif _is_instrument_style(style):
            await _sync_instrument(cell, pid, entity_id, db)
            stats["instruments"] += 1

    # Sync connections (edges)
    edges = root.findall(".//mxCell[@edge='1']")
    for edge in edges:
        await _sync_connection(edge, pid, entity_id, db)
        stats["connections"] += 1

    # Mark equipment removed from PID (D-093)
    await _mark_removed_equipment(pid, found_cell_ids, entity_id, db)

    await db.commit()

    logger.info(
        "PID sync complete for %s: %d equip, %d lines, %d connections, %d instruments",
        pid.number, stats["equipment"], stats["lines"],
        stats["connections"], stats["instruments"],
    )
    return stats


# ═══════════════════════════════════════════════════════════════════════════════
# Equipment CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def search_equipment(
    *,
    entity_id: UUID,
    search: str | None = None,
    equipment_type: str | None = None,
    pid_id: str | None = None,
    project_id: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession,
) -> dict[str, Any]:
    """Search equipment across all PIDs."""
    from app.models.pid_pfd import Equipment

    query = select(Equipment).where(
        Equipment.entity_id == entity_id,
        Equipment.is_active == True,  # noqa: E712
    )

    if search:
        query = query.where(
            or_(
                Equipment.tag.ilike(f"%{search}%"),
                Equipment.description.ilike(f"%{search}%"),
                Equipment.service.ilike(f"%{search}%"),
            )
        )
    if equipment_type:
        query = query.where(Equipment.equipment_type == equipment_type)
    if pid_id:
        query = query.where(Equipment.pid_document_id == UUID(pid_id))
    if project_id:
        query = query.where(Equipment.project_id == UUID(project_id))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = (
        query
        .order_by(Equipment.tag)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    equipment = result.scalars().all()

    return {
        "items": equipment,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


async def get_equipment(
    eq_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single equipment by ID."""
    from app.models.pid_pfd import Equipment

    result = await db.execute(
        select(Equipment).where(
            Equipment.id == UUID(str(eq_id)),
            Equipment.entity_id == entity_id,
        )
    )
    eq = result.scalar_one_or_none()
    if not eq:
        from fastapi import HTTPException
        raise HTTPException(404, f"Equipment {eq_id} not found")
    return eq


async def update_equipment(
    *,
    eq_id: str | UUID,
    body: dict | Any,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update equipment properties."""
    eq = await get_equipment(eq_id, entity_id, db)

    if isinstance(body, dict):
        update_data = body
    else:
        update_data = body.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        if hasattr(eq, key):
            setattr(eq, key, value)

    eq.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return eq


async def create_equipment(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new equipment record with tag uniqueness validation."""
    from app.models.pid_pfd import Equipment

    # Validate tag uniqueness per (entity_id, project_id, tag)
    existing = await db.execute(
        select(Equipment).where(
            Equipment.entity_id == entity_id,
            Equipment.project_id == body.project_id,
            Equipment.tag == body.tag,
            Equipment.is_active == True,  # noqa: E712
        )
    )
    if existing.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(
            409,
            f"Equipment with tag '{body.tag}' already exists in this project",
        )

    eq = Equipment(
        entity_id=entity_id,
        project_id=body.project_id,
        pid_document_id=getattr(body, "pid_document_id", None),
        asset_id=getattr(body, "asset_id", None),
        tag=body.tag,
        description=getattr(body, "description", None),
        equipment_type=body.equipment_type,
        service=getattr(body, "service", None),
        fluid=getattr(body, "fluid", None),
        fluid_phase=getattr(body, "fluid_phase", None),
        design_pressure_barg=getattr(body, "design_pressure_barg", None),
        design_temperature_c=getattr(body, "design_temperature_c", None),
        operating_pressure_barg=getattr(body, "operating_pressure_barg", None),
        operating_temperature_c=getattr(body, "operating_temperature_c", None),
        material_of_construction=getattr(body, "material_of_construction", None),
        capacity_value=getattr(body, "capacity_value", None),
        capacity_unit=getattr(body, "capacity_unit", None),
        lat=getattr(body, "lat", None),
        lng=getattr(body, "lng", None),
        mxgraph_cell_id=getattr(body, "mxgraph_cell_id", None),
    )
    db.add(eq)
    await db.commit()

    logger.info("Created equipment %s (%s) by user %s", eq.tag, eq.id, created_by)
    return eq


async def delete_equipment(
    *,
    eq_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Soft-delete an equipment record (set is_active=False)."""
    eq = await get_equipment(eq_id, entity_id, db)

    eq.is_active = False
    eq.updated_at = datetime.now(timezone.utc)
    await db.commit()
    logger.info("Soft-deleted equipment %s (%s)", eq.tag, eq.id)


async def get_equipment_appearances(
    *,
    eq_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Trace an equipment across all PIDs where it appears."""
    from app.models.pid_pfd import Equipment, PIDDocument, PIDConnection

    eq = await get_equipment(eq_id, entity_id, db)

    # Find all PIDs containing this equipment tag
    appearances_result = await db.execute(
        select(Equipment, PIDDocument)
        .join(PIDDocument, Equipment.pid_document_id == PIDDocument.id)
        .where(
            Equipment.entity_id == entity_id,
            Equipment.tag == eq.tag,
            Equipment.is_active == True,  # noqa: E712
            PIDDocument.is_active == True,  # noqa: E712
        )
    )
    rows = appearances_result.all()

    appearances = []
    for eq_instance, pid in rows:
        appearances.append({
            "pid_id": str(pid.id),
            "pid_number": pid.number,
            "pid_title": pid.title,
            "pid_status": pid.status,
            "equipment_id": str(eq_instance.id),
            "mxgraph_cell_id": eq_instance.mxgraph_cell_id,
        })

    return {
        "tag": eq.tag,
        "equipment_type": eq.equipment_type,
        "description": eq.description,
        "appearance_count": len(appearances),
        "appearances": appearances,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Process Line Tracing
# ═══════════════════════════════════════════════════════════════════════════════


async def trace_process_line(
    *,
    line_number: str,
    entity_id: UUID,
    project_id: str,
    db: AsyncSession,
) -> dict:
    """Trace a process line across all PIDs where it appears."""
    from app.models.pid_pfd import ProcessLine, PIDConnection, PIDDocument, Equipment

    line = await db.execute(
        select(ProcessLine).where(
            ProcessLine.entity_id == entity_id,
            ProcessLine.project_id == UUID(project_id),
            ProcessLine.line_number == line_number,
        )
    )
    line = line.scalar_one_or_none()

    if not line:
        from fastapi import HTTPException
        raise HTTPException(404, f"Process line '{line_number}' not found")

    # Find all connections involving this line
    connections = await db.execute(
        select(PIDConnection).where(
            PIDConnection.entity_id == entity_id,
            or_(
                and_(
                    PIDConnection.from_entity_type == "process_line",
                    PIDConnection.from_entity_id == line.id,
                ),
                and_(
                    PIDConnection.to_entity_type == "process_line",
                    PIDConnection.to_entity_id == line.id,
                ),
            ),
        )
    )
    connections = connections.scalars().all()

    pid_appearances: dict[str, dict] = {}
    equipment_connected: list[str] = []

    for conn in connections:
        pid = await db.get(PIDDocument, conn.pid_document_id)
        if pid:
            pid_key = str(pid.id)
            if pid_key not in pid_appearances:
                pid_appearances[pid_key] = {
                    "pid_id": pid_key,
                    "pid_number": pid.number,
                    "pid_title": pid.title,
                    "pid_status": pid.status,
                    "continuation_ref": conn.continuation_ref,
                    "connected_equipment": [],
                }

            # Get connected equipment
            other_type = conn.to_entity_type if conn.from_entity_id == line.id else conn.from_entity_type
            other_id = conn.to_entity_id if conn.from_entity_id == line.id else conn.from_entity_id

            if other_type == "equipment":
                eq = await db.get(Equipment, other_id)
                if eq:
                    pid_appearances[pid_key]["connected_equipment"].append({
                        "tag": eq.tag,
                        "type": eq.equipment_type,
                        "connection_point": conn.from_connection_point or conn.to_connection_point,
                    })
                    equipment_connected.append(eq.tag)

    return {
        "line_number": line_number,
        "line_details": {
            "nominal_diameter_inch": float(line.nominal_diameter_inch) if line.nominal_diameter_inch else None,
            "spec_class": line.spec_class,
            "fluid": line.fluid,
            "design_pressure_barg": float(line.design_pressure_barg) if line.design_pressure_barg else None,
        },
        "pid_count": len(pid_appearances),
        "pids": list(pid_appearances.values()),
        "equipment_connected": list(set(equipment_connected)),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Process Line CRUD
# ═══════════════════════════════════════════════════════════════════════════════


async def list_process_lines(
    *,
    entity_id: UUID,
    project_id: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession,
) -> dict[str, Any]:
    """List process lines with filtering."""
    from app.models.pid_pfd import ProcessLine

    query = select(ProcessLine).where(ProcessLine.entity_id == entity_id)

    if project_id:
        query = query.where(ProcessLine.project_id == UUID(project_id))
    if search:
        query = query.where(
            or_(
                ProcessLine.line_number.ilike(f"%{search}%"),
                ProcessLine.fluid.ilike(f"%{search}%"),
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = (
        query
        .order_by(ProcessLine.line_number)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await db.execute(query)
    lines = result.scalars().all()

    return {
        "items": lines,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


async def get_process_line(
    line_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single process line by ID."""
    from app.models.pid_pfd import ProcessLine

    result = await db.execute(
        select(ProcessLine).where(
            ProcessLine.id == UUID(str(line_id)),
            ProcessLine.entity_id == entity_id,
        )
    )
    line = result.scalar_one_or_none()
    if not line:
        from fastapi import HTTPException
        raise HTTPException(404, f"Process line {line_id} not found")
    return line


async def create_process_line(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new process line with line_number uniqueness validation."""
    from app.models.pid_pfd import ProcessLine

    # Validate line_number uniqueness per (entity_id, project_id)
    existing = await db.execute(
        select(ProcessLine).where(
            ProcessLine.entity_id == entity_id,
            ProcessLine.project_id == body.project_id,
            ProcessLine.line_number == body.line_number,
            ProcessLine.is_active == True,  # noqa: E712
        )
    )
    if existing.scalar_one_or_none():
        from fastapi import HTTPException
        raise HTTPException(
            409,
            f"Process line '{body.line_number}' already exists in this project",
        )

    line = ProcessLine(
        entity_id=entity_id,
        project_id=body.project_id,
        line_number=body.line_number,
        nominal_diameter_inch=getattr(body, "nominal_diameter_inch", None),
        nominal_diameter_mm=getattr(body, "nominal_diameter_mm", None),
        pipe_schedule=getattr(body, "pipe_schedule", None),
        spec_class=getattr(body, "spec_class", None),
        spec_code=getattr(body, "spec_code", None),
        fluid=getattr(body, "fluid", None),
        fluid_full_name=getattr(body, "fluid_full_name", None),
        insulation_type=getattr(body, "insulation_type", "none"),
        insulation_thickness_mm=getattr(body, "insulation_thickness_mm", None),
        heat_tracing=getattr(body, "heat_tracing", False),
        heat_tracing_type=getattr(body, "heat_tracing_type", None),
        design_pressure_barg=getattr(body, "design_pressure_barg", None),
        design_temperature_c=getattr(body, "design_temperature_c", None),
        material_of_construction=getattr(body, "material_of_construction", None),
        length_m=getattr(body, "length_m", None),
        mxgraph_cell_id=getattr(body, "mxgraph_cell_id", None),
    )
    db.add(line)
    await db.commit()

    logger.info("Created process line %s (%s) by user %s", line.line_number, line.id, created_by)
    return line


async def update_process_line(
    *,
    line_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update process line properties."""
    line = await get_process_line(line_id, entity_id, db)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(line, key):
            setattr(line, key, value)

    await db.commit()
    return line


async def delete_process_line(
    *,
    line_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Soft-delete a process line (set is_active=False)."""
    line = await get_process_line(line_id, entity_id, db)

    line.is_active = False
    await db.commit()
    logger.info("Soft-deleted process line %s (%s)", line.line_number, line.id)


# ═══════════════════════════════════════════════════════════════════════════════
# AFC Validation
# ═══════════════════════════════════════════════════════════════════════════════


async def validate_for_afc(
    *,
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> dict:
    """Validate a PID before transition to AFC status."""
    from app.models.pid_pfd import PIDDocument, Equipment, DCSTag, ProcessLine, PIDConnection

    pid = await get_pid_document(pid_id, entity_id, db)
    errors: list[dict] = []
    warnings: list[dict] = []

    # 1. Check equipment has required properties
    equipment_result = await db.execute(
        select(Equipment).where(
            Equipment.pid_document_id == pid.id,
            Equipment.is_active == True,  # noqa: E712
        )
    )
    equipment_list = equipment_result.scalars().all()

    for eq in equipment_list:
        if not eq.tag:
            errors.append({
                "type": "equipment",
                "id": str(eq.id),
                "message": f"Equipment (cell {eq.mxgraph_cell_id}) has no tag assigned",
            })
        if not eq.equipment_type or eq.equipment_type == "other":
            warnings.append({
                "type": "equipment",
                "id": str(eq.id),
                "tag": eq.tag,
                "message": f"Equipment {eq.tag} has undefined type",
            })
        if eq.design_pressure_barg is None:
            warnings.append({
                "type": "equipment",
                "id": str(eq.id),
                "tag": eq.tag,
                "message": f"Equipment {eq.tag} has no design pressure",
            })

    # 2. Check instruments have valid DCS tags
    dcs_tags_result = await db.execute(
        select(DCSTag).where(
            DCSTag.pid_document_id == pid.id,
            DCSTag.is_active == True,  # noqa: E712
        )
    )
    dcs_tags = dcs_tags_result.scalars().all()

    for tag in dcs_tags:
        if not tag.tag_name:
            errors.append({
                "type": "instrument",
                "id": str(tag.id),
                "message": "Instrument has no tag name",
            })

    # 3. Check process lines have complete specs
    lines_result = await db.execute(
        select(ProcessLine).where(
            ProcessLine.entity_id == entity_id,
            ProcessLine.project_id == pid.project_id,
        )
    )
    lines = lines_result.scalars().all()

    for line in lines:
        if not line.spec_class:
            warnings.append({
                "type": "process_line",
                "id": str(line.id),
                "line_number": line.line_number,
                "message": f"Line {line.line_number} has no spec class",
            })
        if not line.nominal_diameter_inch and not line.nominal_diameter_mm:
            warnings.append({
                "type": "process_line",
                "id": str(line.id),
                "line_number": line.line_number,
                "message": f"Line {line.line_number} has no nominal diameter",
            })

    # 4. Check for orphan continuation flags
    connections_result = await db.execute(
        select(PIDConnection).where(
            PIDConnection.pid_document_id == pid.id,
            PIDConnection.continuation_ref.isnot(None),
        )
    )
    continuations = connections_result.scalars().all()

    for conn in continuations:
        # Try to find the referenced PID
        ref_pid = await db.execute(
            select(PIDDocument).where(
                PIDDocument.entity_id == entity_id,
                PIDDocument.number.ilike(f"%{conn.continuation_ref}%"),
            )
        )
        if not ref_pid.scalar_one_or_none():
            warnings.append({
                "type": "connection",
                "id": str(conn.id),
                "message": f"Continuation reference '{conn.continuation_ref}' — target PID not found",
            })

    is_valid = len(errors) == 0
    return {
        "is_valid": is_valid,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Library management
# ═══════════════════════════════════════════════════════════════════════════════


async def list_library_items(
    *,
    entity_id: UUID,
    category: str | None = None,
    search: str | None = None,
    db: AsyncSession,
) -> list[Any]:
    """List process library items."""
    from app.models.pid_pfd import ProcessLibItem

    query = select(ProcessLibItem).where(
        ProcessLibItem.entity_id == entity_id,
        ProcessLibItem.is_active == True,  # noqa: E712
    )

    if category:
        query = query.where(ProcessLibItem.category == category)
    if search:
        query = query.where(
            or_(
                ProcessLibItem.name.ilike(f"%{search}%"),
                ProcessLibItem.subcategory.ilike(f"%{search}%"),
            )
        )

    query = query.order_by(ProcessLibItem.category, ProcessLibItem.name)
    result = await db.execute(query)
    return result.scalars().all()


async def create_library_item(
    *,
    body: Any,
    entity_id: UUID,
    created_by: UUID,
    db: AsyncSession,
) -> Any:
    """Create a new library item."""
    from app.models.pid_pfd import ProcessLibItem

    item = ProcessLibItem(
        entity_id=entity_id,
        name=body.name,
        category=body.category,
        subcategory=getattr(body, "subcategory", None),
        svg_template=body.svg_template,
        mxgraph_style=body.mxgraph_style,
        properties_schema=body.properties_schema,
        connection_points=body.connection_points,
        equipment_type_mapping=getattr(body, "equipment_type_mapping", None),
        autocad_block_name=getattr(body, "autocad_block_name", None),
        created_by=created_by,
    )
    db.add(item)
    await db.commit()
    return item


async def get_library_item(
    item_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Get a single library item by ID."""
    from app.models.pid_pfd import ProcessLibItem

    result = await db.execute(
        select(ProcessLibItem).where(
            ProcessLibItem.id == UUID(str(item_id)),
            ProcessLibItem.entity_id == entity_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        from fastapi import HTTPException
        raise HTTPException(404, f"Library item {item_id} not found")
    return item


async def update_library_item(
    *,
    item_id: str | UUID,
    body: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> Any:
    """Update a library item."""
    item = await get_library_item(item_id, entity_id, db)

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(item, key):
            setattr(item, key, value)

    item.version = (item.version or 1) + 1
    await db.commit()
    return item


async def delete_library_item(
    *,
    item_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Soft-delete a library item (set is_active=False)."""
    item = await get_library_item(item_id, entity_id, db)

    item.is_active = False
    await db.commit()
    logger.info("Soft-deleted library item %s (%s)", item.name, item.id)


async def get_library_drawio_xml(
    entity_id: UUID,
    db: AsyncSession,
) -> str:
    """Generate draw.io XML library from all active library items.

    Endpoint: GET /api/v1/pid/library/drawio.xml (D-082)
    """
    from app.models.pid_pfd import ProcessLibItem

    result = await db.execute(
        select(ProcessLibItem).where(
            ProcessLibItem.entity_id == entity_id,
            ProcessLibItem.is_active == True,  # noqa: E712
        ).order_by(ProcessLibItem.category, ProcessLibItem.name)
    )
    items = result.scalars().all()

    # Build draw.io library XML
    xml_parts = ['<mxlibrary>[']
    entries = []
    for item in items:
        # Each library entry is a JSON object
        entry = (
            f'{{"xml":"{_escape_xml_for_json(item.svg_template)}",'
            f'"w":100,"h":100,'
            f'"title":"{item.name}",'
            f'"aspect":"fixed"}}'
        )
        entries.append(entry)

    xml_parts.append(",".join(entries))
    xml_parts.append("]</mxlibrary>")
    return "".join(xml_parts)


# ═══════════════════════════════════════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════════════════════════════════════


async def export_svg(
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> bytes:
    """Export PID as SVG (placeholder — actual rendering by frontend/draw.io)."""
    pid = await get_pid_document(pid_id, entity_id, db)
    if not pid.xml_content:
        from fastapi import HTTPException
        raise HTTPException(400, "PID has no XML content")

    # Simplified: return the mxGraph XML wrapped in SVG
    svg = f"""<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg">
  <metadata>{pid.xml_content}</metadata>
  <text x="10" y="20">PID {pid.number} — Export SVG requires draw.io rendering</text>
</svg>"""
    return svg.encode("utf-8")


async def export_pdf(
    pid_id: str | UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> tuple[bytes, str]:
    """Export PID as PDF via the centralized PDF template engine.

    Returns (pdf_bytes, filename).
    """
    from fastapi import HTTPException
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity

    pid = await get_pid_document(pid_id, entity_id, db)

    # Get SVG content (reuse the existing export_svg helper)
    svg_bytes = await export_svg(pid_id, entity_id, db)
    svg_content = svg_bytes.decode("utf-8")
    entity = await db.get(Entity, entity_id)
    try:
        pdf_bytes = await render_pdf(
            db,
            slug="pid.export",
            entity_id=entity_id,
            language="fr",
            variables={
                "pid_number": pid.number,
                "pid_title": pid.title,
                "revision": pid.revision or "0",
                "drawing_number": pid.drawing_number or "",
                "status": pid.status,
                "sheet_format": pid.sheet_format or "A1",
                "svg_content": svg_content,
                "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
                "entity": {"name": entity.name if entity else ""},
            },
        )
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    if not pdf_bytes:
        raise HTTPException(404, "Template PDF 'pid.export' introuvable. Creez-le dans Parametres > Modeles PDF.")

    revision_label = pid.revision or "0"
    filename = f"{pid.number}_rev{revision_label}.pdf"
    return pdf_bytes, filename


# ═══════════════════════════════════════════════════════════════════════════════
# Cell data (for draw.io properties panel)
# ═══════════════════════════════════════════════════════════════════════════════


async def get_cell_data(
    *,
    pid_id: str | UUID,
    cell_id: str,
    entity_id: UUID,
    db: AsyncSession,
) -> dict | None:
    """Get DB entity linked to a draw.io cell ID."""
    from app.models.pid_pfd import Equipment, ProcessLine, DCSTag

    # Try equipment first
    eq_result = await db.execute(
        select(Equipment).where(
            Equipment.pid_document_id == UUID(str(pid_id)),
            Equipment.mxgraph_cell_id == cell_id,
            Equipment.entity_id == entity_id,
        )
    )
    eq = eq_result.scalar_one_or_none()
    if eq:
        return {"entity_type": "equipment", "entity": eq, "tag": eq.tag}

    # Try process line
    line_result = await db.execute(
        select(ProcessLine).where(
            ProcessLine.mxgraph_cell_id == cell_id,
            ProcessLine.entity_id == entity_id,
        )
    )
    line = line_result.scalar_one_or_none()
    if line:
        return {"entity_type": "process_line", "entity": line, "line_number": line.line_number}

    # Try DCS tag / instrument
    tag_result = await db.execute(
        select(DCSTag).where(
            DCSTag.pid_document_id == UUID(str(pid_id)),
            DCSTag.entity_id == entity_id,
        )
    )
    # Note: DCS tags don't have mxgraph_cell_id directly
    # They are linked via equipment_id

    return None


# ═══════════════════════════════════════════════════════════════════════════════
# Lock Management (D-092)
# ═══════════════════════════════════════════════════════════════════════════════


async def acquire_lock(
    *,
    pid_id: UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Acquire exclusive editing lock on a PID document (D-092).

    Lock expires after 5 minutes; heartbeat extends the TTL.
    Returns 409 if another user already holds the lock.
    """
    from app.models.pid_pfd import PIDLock
    from fastapi import HTTPException
    from datetime import timedelta

    # Verify PID exists and belongs to entity
    await get_pid_document(pid_id, entity_id, db)

    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=5)

    # Check existing lock
    result = await db.execute(
        select(PIDLock).where(PIDLock.pid_document_id == pid_id)
    )
    existing = result.scalar_one_or_none()

    if existing:
        # Lock exists — check if expired
        if existing.expires_at > now and existing.locked_by != user_id:
            raise HTTPException(
                409,
                f"PID is locked by another user since {existing.locked_at.isoformat()}",
            )
        # Expired or same user — update the lock
        existing.locked_by = user_id
        existing.locked_at = now
        existing.expires_at = expires
        existing.heartbeat_at = now
    else:
        # Create new lock
        lock = PIDLock(
            pid_document_id=pid_id,
            locked_by=user_id,
            locked_at=now,
            expires_at=expires,
            heartbeat_at=now,
        )
        db.add(lock)

    await db.commit()

    logger.info("Lock acquired on PID %s by user %s", pid_id, user_id)
    return {
        "pid_id": str(pid_id),
        "locked_by": str(user_id),
        "locked_at": now.isoformat(),
        "expires_at": expires.isoformat(),
    }


async def release_lock(
    *,
    pid_id: UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Release the editing lock held by the current user.

    Returns 403 if the lock is owned by someone else.
    Returns 404 if no lock exists.
    """
    from app.models.pid_pfd import PIDLock
    from fastapi import HTTPException

    await get_pid_document(pid_id, entity_id, db)

    result = await db.execute(
        select(PIDLock).where(PIDLock.pid_document_id == pid_id)
    )
    lock = result.scalar_one_or_none()

    if not lock:
        raise HTTPException(404, "No lock found for this PID document")

    if lock.locked_by != user_id:
        raise HTTPException(403, "Lock is owned by another user")

    await db.delete(lock)
    await db.commit()

    logger.info("Lock released on PID %s by user %s", pid_id, user_id)
    return {"pid_id": str(pid_id), "released": True}


async def lock_heartbeat(
    *,
    pid_id: UUID,
    entity_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Extend the lock TTL by 5 minutes (heartbeat).

    Returns 404 if no lock found, 403 if owned by someone else.
    """
    from app.models.pid_pfd import PIDLock
    from fastapi import HTTPException
    from datetime import timedelta

    await get_pid_document(pid_id, entity_id, db)

    result = await db.execute(
        select(PIDLock).where(PIDLock.pid_document_id == pid_id)
    )
    lock = result.scalar_one_or_none()

    if not lock:
        raise HTTPException(404, "No lock found for this PID document")

    if lock.locked_by != user_id:
        raise HTTPException(403, "Lock is owned by another user")

    now = datetime.now(timezone.utc)
    lock.heartbeat_at = now
    lock.expires_at = now + timedelta(minutes=5)

    await db.commit()

    logger.info("Lock heartbeat on PID %s by user %s", pid_id, user_id)
    return {
        "pid_id": str(pid_id),
        "heartbeat_at": now.isoformat(),
        "expires_at": lock.expires_at.isoformat(),
    }


async def force_release_lock(
    *,
    pid_id: UUID,
    entity_id: UUID,
    admin_user_id: UUID,
    db: AsyncSession,
) -> dict:
    """Admin force-release of any lock regardless of owner.

    Logs who performed the force release.
    Returns 404 if no lock exists.
    """
    from app.models.pid_pfd import PIDLock
    from fastapi import HTTPException

    await get_pid_document(pid_id, entity_id, db)

    result = await db.execute(
        select(PIDLock).where(PIDLock.pid_document_id == pid_id)
    )
    lock = result.scalar_one_or_none()

    if not lock:
        raise HTTPException(404, "No lock found for this PID document")

    original_owner = str(lock.locked_by)
    await db.delete(lock)
    await db.commit()

    logger.warning(
        "Lock FORCE-RELEASED on PID %s by admin %s (was held by %s)",
        pid_id, admin_user_id, original_owner,
    )
    return {
        "pid_id": str(pid_id),
        "force_released": True,
        "previous_owner": original_owner,
        "released_by": str(admin_user_id),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Internal XML parsing helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _is_equipment_style(style: str) -> bool:
    """Detect if a cell is a process equipment."""
    PREFIXES = [
        "shape=mxgraph.pid.pumps",
        "shape=mxgraph.pid.vessels",
        "shape=mxgraph.pid.compressors",
        "shape=mxgraph.pid.heat_exchangers",
        "shape=mxgraph.pid.separators",
        "shape=mxgraph.pid.columns",
        "shape=mxgraph.pid.tanks",
        "shape=mxgraph.pid.filters",
        "shape=mxgraph.pid.motors",
        "opsflux.equipment=",
    ]
    return any(prefix in style for prefix in PREFIXES)


def _is_process_line_style(style: str) -> bool:
    """Detect if a cell is a process line."""
    PREFIXES = [
        "shape=mxgraph.pid.piping",
        "opsflux.process_line=",
    ]
    return any(prefix in style for prefix in PREFIXES)


def _is_instrument_style(style: str) -> bool:
    """Detect if a cell is an instrument."""
    PREFIXES = [
        "shape=mxgraph.pid.instruments",
        "shape=mxgraph.pid.valves",
        "opsflux.instrument=",
    ]
    return any(prefix in style for prefix in PREFIXES)


def _infer_equipment_type(style: str) -> str:
    """Infer equipment type from draw.io style."""
    STYLE_MAP = {
        "pumps": "pump",
        "vessels": "vessel",
        "separators": "separator",
        "compressors": "compressor",
        "heat_exchangers": "heat_exchanger",
        "valves": "valve",
        "columns": "column",
        "tanks": "tank",
        "filters": "filter",
        "motors": "motor",
    }
    for key, etype in STYLE_MAP.items():
        if key in style.lower():
            return etype
    return "other"


def _parse_cell_properties(cell: ET.Element) -> dict[str, str]:
    """Extract opsflux_* attributes from a draw.io cell."""
    props: dict[str, str] = {}
    for attr_name, attr_value in cell.attrib.items():
        if attr_name.startswith("opsflux_"):
            key = attr_name.replace("opsflux_", "")
            props[key] = attr_value
    return props


async def _sync_equipment(
    cell: ET.Element,
    pid: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Create or update an equipment from a draw.io cell."""
    from app.models.pid_pfd import Equipment

    props = _parse_cell_properties(cell)
    tag = props.get("tag") or cell.get("value", "").strip()
    cell_id = cell.get("id")

    if not tag:
        return

    style = cell.get("style", "")
    equipment_type = _infer_equipment_type(style)

    # Find existing by cell_id
    existing_result = await db.execute(
        select(Equipment).where(
            Equipment.entity_id == entity_id,
            Equipment.pid_document_id == pid.id,
            Equipment.mxgraph_cell_id == cell_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.tag = tag
        if props.get("description"):
            existing.description = props["description"]
        if props.get("service"):
            existing.service = props["service"]
        if props.get("design_pressure_barg"):
            try:
                existing.design_pressure_barg = float(props["design_pressure_barg"])
            except ValueError:
                pass
        if props.get("design_temperature_c"):
            try:
                existing.design_temperature_c = float(props["design_temperature_c"])
            except ValueError:
                pass
        existing.updated_at = datetime.now(timezone.utc)
        existing.removed_from_pid = False
    else:
        db.add(Equipment(
            entity_id=entity_id,
            project_id=pid.project_id,
            pid_document_id=pid.id,
            tag=tag,
            equipment_type=equipment_type,
            description=props.get("description"),
            service=props.get("service"),
            design_pressure_barg=_safe_float(props.get("design_pressure_barg")),
            design_temperature_c=_safe_float(props.get("design_temperature_c")),
            mxgraph_cell_id=cell_id,
        ))


async def _sync_process_line(
    cell: ET.Element,
    pid: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Create or update a process line from a draw.io cell."""
    from app.models.pid_pfd import ProcessLine

    props = _parse_cell_properties(cell)
    line_number = props.get("line_number") or cell.get("value", "").strip()
    cell_id = cell.get("id")

    if not line_number:
        return

    existing_result = await db.execute(
        select(ProcessLine).where(
            ProcessLine.entity_id == entity_id,
            ProcessLine.mxgraph_cell_id == cell_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.line_number = line_number
        if props.get("fluid"):
            existing.fluid = props["fluid"]
        if props.get("spec_class"):
            existing.spec_class = props["spec_class"]
    else:
        db.add(ProcessLine(
            entity_id=entity_id,
            project_id=pid.project_id,
            line_number=line_number,
            fluid=props.get("fluid"),
            spec_class=props.get("spec_class"),
            spec_code=props.get("spec_code"),
            mxgraph_cell_id=cell_id,
        ))


async def _sync_instrument(
    cell: ET.Element,
    pid: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Create or update a DCS tag/instrument from a draw.io cell."""
    from app.models.pid_pfd import DCSTag

    props = _parse_cell_properties(cell)
    tag_name = props.get("tag_name") or cell.get("value", "").strip()

    if not tag_name:
        return

    existing_result = await db.execute(
        select(DCSTag).where(
            DCSTag.entity_id == entity_id,
            DCSTag.tag_name == tag_name,
            DCSTag.project_id == pid.project_id,
        )
    )
    existing = existing_result.scalar_one_or_none()

    if existing:
        existing.pid_document_id = pid.id
        if props.get("tag_type"):
            existing.tag_type = props["tag_type"]
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(DCSTag(
            entity_id=entity_id,
            project_id=pid.project_id,
            pid_document_id=pid.id,
            tag_name=tag_name,
            tag_type=props.get("tag_type", "other"),
            area=props.get("area"),
            source="manual",
        ))


async def _sync_connection(
    edge: ET.Element,
    pid: Any,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Create or update a PID connection from a draw.io edge."""
    from app.models.pid_pfd import PIDConnection

    source = edge.get("source")
    target = edge.get("target")

    if not source or not target:
        return

    # Check if connection already exists
    existing_result = await db.execute(
        select(PIDConnection).where(
            PIDConnection.pid_document_id == pid.id,
            PIDConnection.from_entity_id == UUID(source) if _is_uuid(source) else PIDConnection.from_entity_type == "unknown",
            PIDConnection.to_entity_id == UUID(target) if _is_uuid(target) else PIDConnection.to_entity_type == "unknown",
        )
    )
    # Simplified — full implementation would resolve cell_id to entity_id


async def _mark_removed_equipment(
    pid: Any,
    found_cell_ids: set[str],
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Mark equipment removed from PID canvas (D-093)."""
    from app.models.pid_pfd import Equipment

    result = await db.execute(
        select(Equipment).where(
            Equipment.pid_document_id == pid.id,
            Equipment.entity_id == entity_id,
            Equipment.is_active == True,  # noqa: E712
            Equipment.mxgraph_cell_id.isnot(None),
        )
    )
    all_equipment = result.scalars().all()

    for eq in all_equipment:
        if eq.mxgraph_cell_id and eq.mxgraph_cell_id not in found_cell_ids:
            # D-093: Don't delete, mark as removed
            eq.removed_from_pid = True
            logger.info("Equipment %s removed from PID %s canvas", eq.tag, pid.number)


def _extract_cell_ids(xml_content: str) -> set[str]:
    """Extract all cell IDs from mxGraph XML."""
    try:
        root = ET.fromstring(xml_content)
        cells = root.findall(".//mxCell")
        return {c.get("id", "") for c in cells if c.get("id") not in ("0", "1", "")}
    except ET.ParseError:
        return set()


def _safe_float(value: str | None) -> float | None:
    """Safely convert string to float."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def _is_uuid(value: str) -> bool:
    """Check if a string is a valid UUID."""
    try:
        UUID(value)
        return True
    except (ValueError, AttributeError):
        return False


def _escape_xml_for_json(xml: str) -> str:
    """Escape XML for embedding in JSON string."""
    return (
        xml.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("\n", "\\n")
        .replace("\r", "")
    )


async def _generate_pid_number(
    entity_id: UUID,
    project_id: UUID | None,
    db: AsyncSession,
) -> str:
    """Generate a PID document number."""
    from app.models.pid_pfd import PIDDocument

    # Count existing PIDs for this project
    count_result = await db.execute(
        select(func.count()).where(
            PIDDocument.entity_id == entity_id,
            PIDDocument.project_id == project_id if project_id else True,
        )
    )
    count = (count_result.scalar() or 0) + 1

    # Simple pattern: PID-{project_code}-{seq:4}
    project_code = ""
    if project_id:
        from sqlalchemy import text
        result = await db.execute(
            text("SELECT code FROM projects WHERE id = :pid"),
            {"pid": project_id},
        )
        row = result.first()
        project_code = row[0] if row else ""

    if project_code:
        return f"PID-{project_code.upper()}-{count:04d}"
    return f"PID-{count:04d}"
