"""PID / PFD — API routes.

CRUD for PID documents, equipment, process lines.
DCS tag management (create, suggest, validate, CSV import, bulk rename).
Revision snapshots and diff.  AFC validation.
Draw.io XML save/sync, cell data lookup.
Process library.  Export (SVG, PDF).  Line tracing.
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.deps import get_current_entity, get_current_user, require_module_enabled, require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/pid", tags=["pid_pfd"], dependencies=[require_module_enabled("pid_pfd")])


# ═══════════════════════════════════════════════════════════════════════════════
# PID Documents CRUD
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/",
    dependencies=[require_permission("pid.read")],
    summary="List PID documents",
)
async def list_pid_documents(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of PID documents with optional filters."""
    from app.services.modules.pid_service import list_pid_documents as svc_list

    return await svc_list(
        entity_id=entity_id,
        bu_id=getattr(current_user, "bu_id", None),
        project_id=project_id,
        status=status,
        search=search,
        page=page,
        page_size=page_size,
        db=db,
    )


@router.post(
    "/",
    dependencies=[require_permission("pid.create")],
    summary="Create a new PID document",
)
async def create_pid_document(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a PID document record."""
    from app.schemas.pid_pfd import PIDDocumentCreate
    from app.services.modules.pid_service import create_pid_document as svc_create

    parsed = PIDDocumentCreate(**body)
    return await svc_create(
        body=parsed,
        entity_id=entity_id,
        bu_id=getattr(current_user, "bu_id", None),
        created_by=current_user.id,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORTANT: ALL literal-path routes MUST be placed BEFORE /{pid_id}
# to prevent FastAPI from matching "equipment"/"tags"/"lines" as UUID.
# ═══════════════════════════════════════════════════════════════════════════════


# ── Equipment (before /{pid_id}) ──────────────────────────────────────────────


@router.get(
    "/equipment",
    dependencies=[require_permission("pid.equipment.read")],
    summary="Search equipment",
)
async def list_equipment_early(
    search: Optional[str] = None,
    equipment_type: Optional[str] = None,
    pid_id: Optional[str] = None,
    project_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of equipment with optional filters."""
    from app.services.modules.pid_service import search_equipment as svc_list

    return await svc_list(
        entity_id=entity_id, search=search, equipment_type=equipment_type,
        pid_id=pid_id, project_id=project_id, page=page, page_size=page_size, db=db,
    )


@router.post(
    "/equipment",
    dependencies=[require_permission("pid.equipment.edit")],
    summary="Create equipment",
)
async def create_equipment_early(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new equipment record."""
    from app.schemas.pid_pfd import EquipmentCreate
    from app.services.modules.pid_service import create_equipment as svc_create

    parsed = EquipmentCreate(**body)
    return await svc_create(body=parsed, entity_id=entity_id, created_by=current_user.id, db=db)


@router.get(
    "/equipment/{eq_id}",
    dependencies=[require_permission("pid.equipment.read")],
    summary="Get equipment detail",
)
async def get_equipment_early(
    eq_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return single equipment detail."""
    from app.services.modules.pid_service import get_equipment_detail as svc_get

    return await svc_get(eq_id=eq_id, entity_id=entity_id, db=db)


@router.patch(
    "/equipment/{eq_id}",
    dependencies=[require_permission("pid.equipment.edit")],
    summary="Update equipment",
)
async def update_equipment_early(
    eq_id: str, body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update equipment fields."""
    from app.schemas.pid_pfd import EquipmentUpdate
    from app.services.modules.pid_service import update_equipment as svc_update

    parsed = EquipmentUpdate(**body)
    return await svc_update(eq_id=eq_id, body=parsed, entity_id=entity_id, db=db)


@router.delete(
    "/equipment/{eq_id}",
    dependencies=[require_permission("pid.equipment.edit")],
    summary="Delete equipment",
    status_code=204,
)
async def delete_equipment_early(
    eq_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete equipment."""
    from app.services.modules.pid_service import delete_equipment as svc_delete

    await svc_delete(eq_id=eq_id, entity_id=entity_id, db=db)


@router.get(
    "/equipment/{eq_id}/appearances",
    dependencies=[require_permission("pid.equipment.read")],
    summary="Equipment appearances across PIDs",
)
async def equipment_appearances_early(
    eq_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List PIDs where this equipment appears."""
    from app.services.modules.pid_service import equipment_appearances as svc_app

    return await svc_app(eq_id=eq_id, entity_id=entity_id, db=db)


# ── Process Lines (before /{pid_id}) ─────────────────────────────────────────


@router.get(
    "/lines",
    dependencies=[require_permission("pid.read")],
    summary="List process lines",
)
async def list_lines_early(
    search: Optional[str] = None,
    pid_document_id: Optional[str] = None,
    project_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of process lines."""
    from app.services.modules.pid_service import list_process_lines as svc_list

    return await svc_list(
        entity_id=entity_id, search=search,
        project_id=project_id, page=page, page_size=page_size, db=db,
    )


@router.post(
    "/lines",
    dependencies=[require_permission("pid.edit")],
    summary="Create process line",
)
async def create_line_early(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new process line."""
    from app.schemas.pid_pfd import ProcessLineCreate
    from app.services.modules.pid_service import create_process_line as svc_create

    parsed = ProcessLineCreate(**body)
    return await svc_create(body=parsed, entity_id=entity_id, created_by=current_user.id, db=db)


@router.post(
    "/lines/trace",
    dependencies=[require_permission("pid.read")],
    summary="Trace a process line across PIDs",
)
async def trace_line_early(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Trace a process line across multiple PID documents."""
    from app.services.modules.pid_service import trace_line as svc_trace

    return await svc_trace(line_number=body.get("line_number", ""), entity_id=entity_id, db=db)


@router.patch(
    "/lines/{line_id}",
    dependencies=[require_permission("pid.edit")],
    summary="Update process line",
)
async def update_line_early(
    line_id: str, body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update process line fields."""
    from app.schemas.pid_pfd import ProcessLineUpdate
    from app.services.modules.pid_service import update_process_line as svc_update

    parsed = ProcessLineUpdate(**body)
    return await svc_update(line_id=line_id, body=parsed, entity_id=entity_id, db=db)


@router.delete(
    "/lines/{line_id}",
    dependencies=[require_permission("pid.edit")],
    summary="Delete process line",
    status_code=204,
)
async def delete_line_early(
    line_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a process line."""
    from app.services.modules.pid_service import delete_process_line as svc_delete

    await svc_delete(line_id=line_id, entity_id=entity_id, db=db)


# ── DCS Tags (before /{pid_id}) ──────────────────────────────────────────────


@router.get(
    "/tags",
    dependencies=[require_permission("pid.tags.read")],
    summary="List DCS tags",
)
async def list_tags_early(
    search: Optional[str] = None,
    tag_type: Optional[str] = None,
    area: Optional[str] = None,
    pid_document_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated list of DCS tags."""
    from app.services.modules.tag_service import list_tags as svc_list

    return await svc_list(
        entity_id=entity_id, search=search, tag_type=tag_type,
        area=area, page=page, page_size=page_size, db=db,
    )


@router.post(
    "/tags",
    dependencies=[require_permission("pid.tags.edit")],
    summary="Create DCS tag",
)
async def create_tag_early(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new DCS tag."""
    from app.schemas.pid_pfd import DCSTagCreate
    from app.services.modules.tag_service import create_tag as svc_create

    parsed = DCSTagCreate(**body)
    return await svc_create(body=parsed, entity_id=entity_id, created_by=current_user.id, db=db)


@router.patch(
    "/tags/{tag_id}",
    dependencies=[require_permission("pid.tags.edit")],
    summary="Update DCS tag",
)
async def update_tag_early(
    tag_id: str, body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update DCS tag fields."""
    from app.schemas.pid_pfd import DCSTagUpdate
    from app.services.modules.tag_service import update_tag as svc_update

    parsed = DCSTagUpdate(**body)
    return await svc_update(tag_id=tag_id, body=parsed, entity_id=entity_id, db=db)


@router.delete(
    "/tags/{tag_id}",
    dependencies=[require_permission("pid.tags.edit")],
    summary="Delete DCS tag",
    status_code=204,
)
async def delete_tag_early(
    tag_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a DCS tag."""
    from app.services.modules.tag_service import delete_tag as svc_delete

    await svc_delete(tag_id=tag_id, entity_id=entity_id, db=db)


@router.post("/tags/suggest", dependencies=[require_permission("pid.tags.read")], summary="Suggest tag names")
async def suggest_tags_early(body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.tag_service import suggest_tag_names as svc
    return await svc(entity_id=entity_id, equipment_type=body.get("equipment_type"), area=body.get("area"), db=db)


@router.post("/tags/validate", dependencies=[require_permission("pid.tags.read")], summary="Validate tag name")
async def validate_tag_early(body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.tag_service import validate_tag_name as svc
    return await svc(entity_id=entity_id, tag_name=body.get("tag_name", ""), db=db)


@router.post("/tags/import", dependencies=[require_permission("pid.tags.edit")], summary="Import DCS tags from CSV")
async def import_tags_early(
    project_id: str = Query(...), file: UploadFile = File(...),
    entity_id: UUID = Depends(get_current_entity), current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.modules.tag_service import import_tags_csv as svc
    return await svc(entity_id=entity_id, project_id=project_id, file=file, created_by=current_user.id, db=db)


@router.post("/tags/bulk-rename/preview", dependencies=[require_permission("pid.tags.edit")], summary="Preview bulk rename")
async def bulk_rename_preview_early(body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.tag_service import bulk_rename_preview as svc
    return await svc(entity_id=entity_id, find=body.get("find", ""), replace=body.get("replace", ""), db=db)


@router.post("/tags/bulk-rename/execute", dependencies=[require_permission("pid.tags.edit")], summary="Execute bulk rename")
async def bulk_rename_execute_early(body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.tag_service import bulk_rename_execute as svc
    return await svc(entity_id=entity_id, find=body.get("find", ""), replace=body.get("replace", ""), db=db)


# ── Naming Rules (before /{pid_id}) ──────────────────────────────────────────


@router.get("/naming-rules", dependencies=[require_permission("pid.tags.read")], summary="List naming rules")
async def list_naming_rules_early(entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.tag_service import list_naming_rules as svc
    return await svc(entity_id=entity_id, db=db)


@router.post("/naming-rules", dependencies=[require_permission("pid.tags.edit")], summary="Create naming rule")
async def create_naming_rule_early(body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.schemas.pid_pfd import TagNamingRuleCreate
    from app.services.modules.tag_service import create_naming_rule as svc
    parsed = TagNamingRuleCreate(**body)
    return await svc(body=parsed, entity_id=entity_id, db=db)


@router.patch("/naming-rules/{rule_id}", dependencies=[require_permission("pid.tags.edit")], summary="Update naming rule")
async def update_naming_rule_early(rule_id: str, body: dict, entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.schemas.pid_pfd import TagNamingRuleUpdate
    from app.services.modules.tag_service import update_naming_rule as svc
    parsed = TagNamingRuleUpdate(**body)
    return await svc(rule_id=rule_id, body=parsed, entity_id=entity_id, db=db)


# ── Library (before /{pid_id}) ───────────────────────────────────────────────


@router.get("/library", dependencies=[require_permission("pid.library.read")], summary="List process library items")
async def list_library_items_early(
    category: Optional[str] = None, search: Optional[str] = None,
    entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db),
):
    from app.services.modules.pid_service import list_library_items as svc_list
    return await svc_list(entity_id=entity_id, category=category, search=search, db=db)

@router.post("/library", dependencies=[require_permission("pid.library.edit")], summary="Create a process library item")
async def create_library_item_early(
    body: dict, entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    from app.schemas.pid_pfd import ProcessLibItemCreate
    from app.services.modules.pid_service import create_library_item as svc_create
    parsed = ProcessLibItemCreate(**body)
    return await svc_create(body=parsed, entity_id=entity_id, created_by=current_user.id, db=db)

@router.get("/library/drawio.xml", dependencies=[require_permission("pid.library.read")], summary="Get draw.io XML library")
async def get_drawio_library_early(entity_id: UUID = Depends(get_current_entity), db: AsyncSession = Depends(get_db)):
    from app.services.modules.pid_service import get_library_drawio_xml as svc_export
    xml_content = await svc_export(entity_id=entity_id, db=db)
    return Response(content=xml_content, media_type="application/xml", headers={"Content-Disposition": 'attachment; filename="pid_library.xml"'})

@router.patch(
    "/library/{item_id}",
    dependencies=[require_permission("pid.library.edit")],
    summary="Update a process library item",
)
async def update_library_item(
    item_id: str,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update properties of a process library item."""
    from app.schemas.pid_pfd import ProcessLibItemUpdate
    from app.services.modules.pid_service import update_library_item as svc_update

    parsed = ProcessLibItemUpdate(**body)
    return await svc_update(item_id=item_id, body=parsed, entity_id=entity_id, db=db)


@router.delete(
    "/library/{item_id}",
    dependencies=[require_permission("pid.library.edit")],
    summary="Delete a process library item",
    status_code=204,
)
async def delete_library_item(
    item_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a process library item."""
    from app.services.modules.pid_service import delete_library_item as svc_delete

    await svc_delete(item_id=item_id, entity_id=entity_id, db=db)


@router.get(
    "/{pid_id}",
    dependencies=[require_permission("pid.read")],
    summary="Get a PID document by ID (includes XML)",
)
async def get_pid_document(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return full PID document detail including draw.io XML content."""
    from app.services.modules.pid_service import get_pid_document as svc_get

    return await svc_get(pid_id, entity_id, db)


@router.patch(
    "/{pid_id}",
    dependencies=[require_permission("pid.edit")],
    summary="Update PID document metadata",
)
async def update_pid_document(
    pid_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update metadata fields of a PID document (title, status, etc.)."""
    from app.schemas.pid_pfd import PIDDocumentUpdate
    from app.services.modules.pid_service import update_pid_document as svc_update

    parsed = PIDDocumentUpdate(**body)
    return await svc_update(pid_id=pid_id, body=parsed, entity_id=entity_id, db=db)


@router.delete(
    "/{pid_id}",
    dependencies=[require_permission("pid.edit")],
    summary="Delete a PID document (draft only)",
    status_code=204,
)
async def delete_pid_document(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a PID document. Only allowed if status is 'draft'."""
    from app.services.modules.pid_service import delete_pid_document as svc_delete

    await svc_delete(pid_id=pid_id, entity_id=entity_id, db=db)


# ═══════════════════════════════════════════════════════════════════════════════
# Dynamic Workflow (FSM-driven)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/{pid_id}/workflow-state",
    dependencies=[require_permission("pid.read")],
    summary="Get workflow state, available transitions, and history",
)
async def get_pid_workflow_state(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the dynamic workflow state for a PID document.

    Returns current state, available transitions (with labels,
    required roles, comment requirements), and transition history.
    """
    from app.services.modules.pid_service import get_pid_workflow_state as svc_get

    return await svc_get(
        pid_id=pid_id,
        entity_id=entity_id,
        user_id=current_user.id,
        db=db,
    )


@router.post(
    "/{pid_id}/transition",
    dependencies=[require_permission("pid.edit")],
    summary="Execute a workflow transition on a PID",
)
async def execute_pid_transition(
    pid_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Execute a workflow transition with optional comment.

    Body: {"to_state": "ifd", "comment": "Checked OK"}
    Returns the updated workflow state.
    """
    from app.services.modules.pid_service import execute_pid_transition as svc_transition

    to_state = body.get("to_state")
    if not to_state:
        raise HTTPException(400, "to_state is required")

    return await svc_transition(
        pid_id=pid_id,
        to_state=to_state,
        comment=body.get("comment"),
        actor_id=current_user.id,
        entity_id=entity_id,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Draw.io XML Save & Sync
# ═══════════════════════════════════════════════════════════════════════════════


@router.patch(
    "/{pid_id}/xml",
    dependencies=[require_permission("pid.edit")],
    summary="Save draw.io XML content",
)
async def save_pid_xml(
    pid_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist the draw.io XML blob for a PID document."""
    from app.schemas.pid_pfd import PIDXMLUpdate
    from app.services.modules.pid_service import save_xml as svc_save

    parsed = PIDXMLUpdate(**body)
    await svc_save(
        pid_id=pid_id,
        xml_content=parsed.xml_content,
        entity_id=entity_id,
        user_id=current_user.id,
        db=db,
    )
    return {"status": "ok"}


@router.post(
    "/{pid_id}/sync",
    dependencies=[require_permission("pid.edit")],
    summary="Parse draw.io XML and sync entities to DB",
)
async def sync_pid(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse the stored draw.io XML and create/update equipment, lines,
    connections in the database (XML → DB sync)."""
    from app.services.modules.pid_service import (
        get_pid_document as svc_get,
        parse_and_sync_pid as svc_sync,
    )

    pid = await svc_get(pid_id, entity_id, db)
    if not pid.xml_content:
        raise HTTPException(400, "PID has no XML content to sync")

    return await svc_sync(
        pid_id=pid_id,
        xml_content=pid.xml_content,
        entity_id=entity_id,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PID Revisions
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/{pid_id}/revisions",
    dependencies=[require_permission("pid.read")],
    summary="List revisions for a PID document",
)
async def list_pid_revisions(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return all revision snapshots for the given PID."""
    from app.services.modules.pid_service import list_pid_revisions as svc_list

    return await svc_list(pid_id=pid_id, entity_id=entity_id, db=db)


@router.post(
    "/{pid_id}/revisions",
    dependencies=[require_permission("pid.edit")],
    summary="Create a revision snapshot",
)
async def create_pid_revision(
    pid_id: UUID,
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Snapshot the current PID state as a new revision."""
    from app.schemas.pid_pfd import PIDRevisionCreate
    from app.services.modules.pid_service import create_pid_revision as svc_create

    parsed = PIDRevisionCreate(**body)
    return await svc_create(
        pid_id=pid_id,
        description=getattr(parsed, "description", None),
        change_type=getattr(parsed, "change_type", "modification"),
        entity_id=entity_id,
        user_id=current_user.id,
        db=db,
    )


@router.get(
    "/{pid_id}/diff",
    dependencies=[require_permission("pid.read")],
    summary="Diff two PID revisions",
)
async def diff_pid_revisions(
    pid_id: UUID,
    rev_a: str = Query(..., description="Revision A ID"),
    rev_b: str = Query(..., description="Revision B ID"),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Compare two revisions and return the structural diff."""
    from app.services.modules.pid_service import diff_revisions as svc_diff

    return await svc_diff(
        rev_a_id=rev_a,
        rev_b_id=rev_b,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Cell Data (draw.io panel)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/{pid_id}/cell/{cell_id}",
    dependencies=[require_permission("pid.read")],
    summary="Get DB entity for a draw.io cell",
)
async def get_cell_data(
    pid_id: UUID,
    cell_id: str,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Look up the database entity associated with a specific draw.io cell ID."""
    from app.services.modules.pid_service import get_cell_data as svc_get

    return await svc_get(
        pid_id=pid_id,
        cell_id=cell_id,
        entity_id=entity_id,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# AFC Validation
# ═══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{pid_id}/validate-afc",
    dependencies=[require_permission("pid.validate_afc")],
    summary="Validate PID for Approved For Construction",
)
async def validate_afc(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run AFC validation checks on a PID document and return results."""
    from app.services.modules.pid_service import validate_for_afc as svc_validate

    return await svc_validate(
        pid_id=pid_id,
        entity_id=entity_id,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Export (SVG / PDF)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/{pid_id}/export/svg",
    dependencies=[require_permission("pid.export")],
    summary="Export PID as SVG",
)
async def export_svg(
    pid_id: UUID,
    revision_id: Optional[str] = None,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Export the PID document as an SVG file."""
    from app.services.modules.pid_service import export_svg as svc_export, get_pid_document

    svg_bytes = await svc_export(pid_id, entity_id, db)
    pid = await get_pid_document(pid_id, entity_id, db)
    return Response(
        content=svg_bytes,
        media_type="image/svg+xml",
        headers={"Content-Disposition": f'attachment; filename="{pid.number}.svg"'},
    )


@router.get(
    "/{pid_id}/export/pdf",
    dependencies=[require_permission("pid.export")],
    summary="Export PID as PDF",
)
async def export_pdf(
    pid_id: UUID,
    revision_id: Optional[str] = None,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Export the PID document as a PDF file."""
    import io
    from app.services.modules.pid_service import export_pdf as svc_export

    pdf_bytes, filename = await svc_export(pid_id, entity_id, db)
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Lock Management (D-092)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{pid_id}/lock",
    dependencies=[require_permission("pid.edit")],
    summary="Acquire editing lock on PID",
)
async def acquire_lock(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Acquire exclusive editing lock (D-092: single-user, 30min TTL, heartbeat 5min)."""
    from app.services.modules.pid_service import acquire_lock as svc_acquire

    return await svc_acquire(pid_id=pid_id, entity_id=entity_id, user_id=current_user.id, db=db)


@router.delete(
    "/{pid_id}/lock",
    dependencies=[require_permission("pid.edit")],
    summary="Release editing lock on PID",
)
async def release_lock(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Release the exclusive editing lock held by the current user."""
    from app.services.modules.pid_service import release_lock as svc_release

    return await svc_release(pid_id=pid_id, entity_id=entity_id, user_id=current_user.id, db=db)


@router.post(
    "/{pid_id}/lock/heartbeat",
    dependencies=[require_permission("pid.edit")],
    summary="Heartbeat to extend editing lock TTL",
)
async def lock_heartbeat(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send heartbeat to extend the lock TTL (D-092: every 5min resets 30min TTL)."""
    from app.services.modules.pid_service import lock_heartbeat as svc_heartbeat

    return await svc_heartbeat(pid_id=pid_id, entity_id=entity_id, user_id=current_user.id, db=db)


@router.post(
    "/{pid_id}/lock/force-release",
    dependencies=[require_permission("pid.admin")],
    summary="Force-release editing lock (admin)",
)
async def force_release_lock(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Admin force-release of a stale or stuck lock on a PID document."""
    from app.services.modules.pid_service import force_release_lock as svc_force_release

    return await svc_force_release(pid_id=pid_id, entity_id=entity_id, admin_user_id=current_user.id, db=db)


# ═══════════════════════════════════════════════════════════════════════════════
# Draw.io XML Bidirectional Sync (detailed parse)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/{pid_id}/xml-sync",
    dependencies=[require_permission("pid.edit")],
    summary="Parse draw.io XML and sync equipment/lines to DB",
)
async def sync_xml_to_db(
    pid_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse draw.io mxGraph XML and upsert equipment + process lines to DB.

    The draw.io XML structure is parsed as follows:
    - Equipment = mxCell with a ``style`` containing a shape identifier
      (e.g. ``shape=mxgraph.pid.vessel``) and a ``value`` containing the
      equipment tag/name.
    - Lines = mxCell elements with ``source`` and ``target`` attributes
      (graph edges / connections between cells).

    Each equipment cell is upserted by matching ``mxgraph_cell_id`` within
    the PID document.  Lines are upserted by matching source/target cell
    pairs.  Returns a sync summary with counts of synced entities.
    """
    import xml.etree.ElementTree as ET

    from sqlalchemy import select, update as sa_update

    from app.models.pid_pfd import Equipment, PIDConnection, PIDDocument, ProcessLine
    from app.services.modules.pid_service import get_pid_document as svc_get

    pid = await svc_get(pid_id, entity_id, db)
    if not pid.xml_content:
        raise HTTPException(400, "PID has no XML content to sync")

    # Parse the XML
    try:
        root = ET.fromstring(pid.xml_content)
    except ET.ParseError as exc:
        raise HTTPException(400, f"Invalid XML: {exc}") from exc

    # Find all mxCell elements (draw.io stores cells inside <root> or <mxGraphModel>)
    cells = root.findall(".//mxCell")

    # Classify cells into equipment and lines
    equipment_cells: list[dict] = []
    line_cells: list[dict] = []

    # Known draw.io PID shape prefixes that indicate equipment
    EQUIPMENT_SHAPE_PATTERNS = (
        "shape=mxgraph.pid",
        "shape=mxgraph.pid2",
        "shape=stencil",
        "shape=ellipse",
        "shape=rectangle",
        "shape=mxgraph.floorplan",
    )

    for cell in cells:
        cell_id = cell.attrib.get("id", "")
        style = cell.attrib.get("style", "")
        value = cell.attrib.get("value", "")
        source = cell.attrib.get("source")
        target = cell.attrib.get("target")
        parent = cell.attrib.get("parent", "")

        # Skip root/layer cells (id=0, id=1 are draw.io root and default layer)
        if cell_id in ("0", "1") or not cell_id:
            continue

        if source and target:
            # This is a connection / edge (process line or flow arrow)
            line_cells.append({
                "cell_id": cell_id,
                "source": source,
                "target": target,
                "style": style,
                "value": value,
            })
        elif value and any(pat in style.lower() for pat in ("shape=",)):
            # This is a shaped cell with a label — treat as equipment
            # Extract equipment type from style
            eq_type = _extract_equipment_type_from_style(style)
            equipment_cells.append({
                "cell_id": cell_id,
                "tag": _clean_html_value(value),
                "equipment_type": eq_type,
                "style": style,
            })
        elif value and not source and not target and parent not in ("0", "1", ""):
            # Child cell with a label but no shape — could be a text label on equipment
            # Still register as potential equipment if it has meaningful content
            tag = _clean_html_value(value)
            if tag and len(tag) <= 100 and not tag.startswith("<"):
                equipment_cells.append({
                    "cell_id": cell_id,
                    "tag": tag,
                    "equipment_type": "other",
                    "style": style,
                })

    # --- Upsert equipment ---
    equipment_synced = 0
    pid_uuid = UUID(pid_id) if isinstance(pid_id, str) else pid_id
    project_id = pid.project_id

    for eq_cell in equipment_cells:
        tag = eq_cell["tag"]
        if not tag:
            continue

        # Check for existing equipment by cell_id within this PID
        result = await db.execute(
            select(Equipment).where(
                Equipment.entity_id == entity_id,
                Equipment.pid_document_id == pid_uuid,
                Equipment.mxgraph_cell_id == eq_cell["cell_id"],
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Update tag and type if changed
            existing.tag = tag
            existing.equipment_type = eq_cell["equipment_type"]
        else:
            # Also check by tag + project to avoid duplicates
            result2 = await db.execute(
                select(Equipment).where(
                    Equipment.entity_id == entity_id,
                    Equipment.project_id == project_id,
                    Equipment.tag == tag,
                )
            )
            existing_by_tag = result2.scalar_one_or_none()
            if existing_by_tag:
                # Link this cell_id to the existing equipment record
                existing_by_tag.mxgraph_cell_id = eq_cell["cell_id"]
                existing_by_tag.pid_document_id = pid_uuid
                existing_by_tag.equipment_type = eq_cell["equipment_type"]
            else:
                # Create new equipment
                new_eq = Equipment(
                    entity_id=entity_id,
                    project_id=project_id,
                    pid_document_id=pid_uuid,
                    tag=tag,
                    equipment_type=eq_cell["equipment_type"],
                    mxgraph_cell_id=eq_cell["cell_id"],
                )
                db.add(new_eq)

        equipment_synced += 1

    # --- Upsert process lines / connections ---
    lines_synced = 0

    # Build a cell_id → equipment UUID mapping
    await db.flush()  # flush to ensure new equipment has IDs
    eq_result = await db.execute(
        select(Equipment).where(
            Equipment.entity_id == entity_id,
            Equipment.pid_document_id == pid_uuid,
        )
    )
    cell_to_equipment: dict[str, Equipment] = {}
    for eq in eq_result.scalars().all():
        if eq.mxgraph_cell_id:
            cell_to_equipment[eq.mxgraph_cell_id] = eq

    for line_cell in line_cells:
        source_cell_id = line_cell["source"]
        target_cell_id = line_cell["target"]
        line_label = line_cell["value"]

        # If both source and target map to equipment, create a connection
        source_eq = cell_to_equipment.get(source_cell_id)
        target_eq = cell_to_equipment.get(target_cell_id)

        if source_eq and target_eq:
            # Check for existing connection
            conn_result = await db.execute(
                select(PIDConnection).where(
                    PIDConnection.entity_id == entity_id,
                    PIDConnection.pid_document_id == pid_uuid,
                    PIDConnection.from_entity_id == source_eq.id,
                    PIDConnection.to_entity_id == target_eq.id,
                )
            )
            existing_conn = conn_result.scalar_one_or_none()
            if not existing_conn:
                new_conn = PIDConnection(
                    entity_id=entity_id,
                    pid_document_id=pid_uuid,
                    from_entity_type="equipment",
                    from_entity_id=source_eq.id,
                    to_entity_type="equipment",
                    to_entity_id=target_eq.id,
                    connection_type="process",
                    flow_direction="forward",
                )
                db.add(new_conn)
            lines_synced += 1

        # If the line has a label resembling a line number, upsert ProcessLine too
        if line_label:
            clean_label = _clean_html_value(line_label)
            if clean_label and len(clean_label) <= 100:
                pl_result = await db.execute(
                    select(ProcessLine).where(
                        ProcessLine.entity_id == entity_id,
                        ProcessLine.mxgraph_cell_id == line_cell["cell_id"],
                    )
                )
                existing_pl = pl_result.scalar_one_or_none()
                if existing_pl:
                    existing_pl.line_number = clean_label
                else:
                    # Check by line_number + project
                    pl_result2 = await db.execute(
                        select(ProcessLine).where(
                            ProcessLine.entity_id == entity_id,
                            ProcessLine.project_id == project_id,
                            ProcessLine.line_number == clean_label,
                        )
                    )
                    existing_pl2 = pl_result2.scalar_one_or_none()
                    if existing_pl2:
                        existing_pl2.mxgraph_cell_id = line_cell["cell_id"]
                    else:
                        new_pl = ProcessLine(
                            entity_id=entity_id,
                            project_id=project_id,
                            line_number=clean_label,
                            mxgraph_cell_id=line_cell["cell_id"],
                        )
                        db.add(new_pl)

    await db.commit()

    return {
        "status": "synced",
        "pid_id": pid_id,
        "equipment_synced": equipment_synced,
        "lines_synced": lines_synced,
        "equipment_cells_found": len(equipment_cells),
        "line_cells_found": len(line_cells),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# XML Sync helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _clean_html_value(value: str) -> str:
    """Strip basic HTML tags from draw.io cell values.

    Draw.io wraps cell labels in HTML (e.g. ``<div>Tag-001</div>``).
    This function extracts the plain text content.
    """
    import re
    if not value:
        return ""
    # Remove HTML tags
    cleaned = re.sub(r"<[^>]+>", " ", value)
    # Collapse whitespace
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _extract_equipment_type_from_style(style: str) -> str:
    """Extract an equipment type from draw.io cell style string.

    Maps common draw.io PID shape names to our equipment_type enum values.
    Falls back to 'other' if no known pattern matches.
    """
    style_lower = style.lower()

    shape_map = {
        "vessel": "vessel",
        "tank": "tank",
        "pump": "pump",
        "compressor": "compressor",
        "heat_exchanger": "heat_exchanger",
        "exchanger": "heat_exchanger",
        "heatexchanger": "heat_exchanger",
        "valve": "valve",
        "filter": "filter",
        "separator": "separator",
        "column": "column",
        "instrument": "instrument",
        "motor": "motor",
        "generator": "generator",
    }

    for pattern, eq_type in shape_map.items():
        if pattern in style_lower:
            return eq_type

    return "other"
