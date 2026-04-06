"""Workflow Engine API routes — definitions, instances, transitions, statistics."""

import logging
import re
import unicodedata
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.events import OpsFluxEvent, event_bus
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    User,
    UserGroup,
    UserGroupMember,
    WorkflowDefinition,
    WorkflowInstance,
    WorkflowTransition,
)
from app.schemas.workflow import (
    TransitionRequest,
    WorkflowDefinitionCreate,
    WorkflowDefinitionRead,
    WorkflowDefinitionStats,
    WorkflowDefinitionSummary,
    WorkflowDefinitionUpdate,
    WorkflowInstanceCreate,
    WorkflowInstanceDetail,
    WorkflowInstanceRead,
    WorkflowStateBucket,
    WorkflowTransitionRead,
)
from app.schemas.common import PaginatedResponse
from app.services.core.delete_service import delete_entity

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])
logger = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    """Generate a URL-safe slug from text."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")[:100]


def _normalize_definition_data(body) -> tuple:
    """Normalize nodes/edges (visual) or states/transitions (FSM) to storage format.

    Returns (states_value, transitions_value) for the JSONB columns.
    Visual editor: nodes list → states column, edges list → transitions column.
    FSM format: states dict → states column, transitions list → transitions column.
    """
    if body.nodes is not None:
        return body.nodes, body.edges or []
    return body.states or {}, body.transitions or []


# ═══════════════════════════════════════════════════════════════════════════════
# WORKFLOW DEFINITIONS (admin / design)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/definitions", response_model=PaginatedResponse[WorkflowDefinitionSummary])
async def list_definitions(
    status_filter: str | None = None,
    entity_type: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all workflow definitions for the current entity (paginated).

    Optionally filter by status (draft / published / archived) or entity_type.
    """
    query = (
        select(WorkflowDefinition)
        .where(WorkflowDefinition.entity_id == entity_id)
    )
    if status_filter:
        if status_filter not in ("draft", "published", "archived"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="status must be one of: draft, published, archived",
            )
        query = query.where(WorkflowDefinition.status == status_filter)
    if entity_type:
        query = query.where(WorkflowDefinition.entity_type == entity_type)
    if search:
        like = f"%{search}%"
        query = query.where(
            WorkflowDefinition.name.ilike(like) | WorkflowDefinition.slug.ilike(like)
        )
    query = query.order_by(WorkflowDefinition.updated_at.desc())
    return await paginate(db, query, pagination)


@router.post(
    "/definitions",
    response_model=WorkflowDefinitionRead,
    status_code=201,
)
async def create_definition(
    body: WorkflowDefinitionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new workflow definition (status=draft, version=1)."""
    # Auto-generate slug from name if not provided
    slug = body.slug or _slugify(body.name)
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not generate slug from name. Provide a slug explicitly.",
        )

    # Check slug uniqueness within entity
    existing = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.slug == slug,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A workflow definition with slug '{slug}' already exists for this entity",
        )

    # Normalize visual editor (nodes/edges) or FSM (states/transitions) input
    states_val, transitions_val = _normalize_definition_data(body)

    definition = WorkflowDefinition(
        entity_id=entity_id,
        slug=slug,
        name=body.name,
        description=body.description,
        entity_type=body.entity_type,
        version=1,
        status="draft",
        states=states_val,
        transitions=transitions_val,
        active=True,
        created_by=current_user.id,
    )
    db.add(definition)
    await db.commit()
    await db.refresh(definition)

    await record_audit(
        db,
        action="workflow.definition.create",
        resource_type="workflow_definition",
        resource_id=str(definition.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"slug": body.slug, "name": body.name},
    )
    await db.commit()

    return definition


@router.get("/definitions/{definition_id}", response_model=WorkflowDefinitionRead)
async def get_definition(
    definition_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single workflow definition by ID."""
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")
    return definition


@router.put("/definitions/{definition_id}", response_model=WorkflowDefinitionRead)
async def update_definition(
    definition_id: UUID,
    body: WorkflowDefinitionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update a workflow definition (only allowed when status=draft)."""
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    if definition.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only draft definitions can be edited. Clone to create a new version.",
        )

    update_data = body.model_dump(exclude_unset=True)

    # Normalize: if nodes/edges provided, map to states/transitions columns
    if "nodes" in update_data:
        update_data["states"] = update_data.pop("nodes")
    if "edges" in update_data:
        update_data["transitions"] = update_data.pop("edges")

    for field_name, value in update_data.items():
        setattr(definition, field_name, value)

    await db.commit()
    await db.refresh(definition)

    await record_audit(
        db,
        action="workflow.definition.update",
        resource_type="workflow_definition",
        resource_id=str(definition.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"updated_fields": list(update_data.keys())},
    )
    await db.commit()

    return definition


@router.post(
    "/definitions/{definition_id}/publish",
    response_model=WorkflowDefinitionRead,
)
async def publish_definition(
    definition_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.update"),
    db: AsyncSession = Depends(get_db),
):
    """Publish a draft definition, making it available for instance creation."""
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    if definition.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot publish a definition with status '{definition.status}'. Only drafts can be published.",
        )

    # Structural validation before publishing
    _validate_definition_structure(definition.states, definition.transitions)

    definition.status = "published"
    await db.commit()
    await db.refresh(definition)

    await record_audit(
        db,
        action="workflow.definition.publish",
        resource_type="workflow_definition",
        resource_id=str(definition.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"slug": definition.slug, "version": definition.version},
    )
    await db.commit()

    logger.info(
        "Workflow definition '%s' v%d published by %s",
        definition.slug, definition.version, current_user.id,
    )
    return definition


@router.post(
    "/definitions/{definition_id}/archive",
    response_model=WorkflowDefinitionRead,
)
async def archive_definition(
    definition_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.update"),
    db: AsyncSession = Depends(get_db),
):
    """Archive a published definition (soft delete — no physical removal)."""
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    if definition.status != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot archive a definition with status '{definition.status}'. Only published definitions can be archived.",
        )

    definition.status = "archived"
    definition.active = False
    await db.commit()
    await db.refresh(definition)

    await record_audit(
        db,
        action="workflow.definition.archive",
        resource_type="workflow_definition",
        resource_id=str(definition.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"slug": definition.slug, "version": definition.version},
    )
    await db.commit()

    logger.info(
        "Workflow definition '%s' v%d archived by %s",
        definition.slug, definition.version, current_user.id,
    )
    return definition


@router.delete(
    "/definitions/{definition_id}",
    status_code=204,
)
async def delete_definition(
    definition_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.create"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a draft workflow definition permanently.

    Only drafts with zero linked instances can be deleted. Published or
    archived definitions must be archived instead (soft-delete).
    """
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    if definition.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les brouillons (draft) peuvent être supprimés. "
                   "Les définitions publiées doivent être archivées.",
        )

    # Check no instances reference this definition
    inst_count_result = await db.execute(
        select(func.count(WorkflowInstance.id)).where(
            WorkflowInstance.workflow_definition_id == definition_id,
        )
    )
    inst_count = inst_count_result.scalar() or 0
    if inst_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Impossible de supprimer: {inst_count} instance(s) utilisent cette définition.",
        )

    await delete_entity(definition, db, "workflow_definition", entity_id=definition_id, user_id=current_user.id)
    await db.commit()

    await record_audit(
        db,
        action="workflow.definition.delete",
        resource_type="workflow_definition",
        resource_id=str(definition_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"slug": definition.slug, "name": definition.name},
    )
    await db.commit()

    logger.info(
        "Workflow definition '%s' deleted by %s",
        definition.slug, current_user.id,
    )
    return None


@router.post(
    "/definitions/{definition_id}/clone",
    response_model=WorkflowDefinitionRead,
    status_code=201,
)
async def clone_definition(
    definition_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.definition.create"),
    db: AsyncSession = Depends(get_db),
):
    """Clone an existing definition as a new draft with incremented version.

    This is the primary mechanism for versioning workflow definitions.
    """
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    # Determine next version number for this slug within this entity
    max_version_result = await db.execute(
        select(func.max(WorkflowDefinition.version)).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.slug == source.slug,
        )
    )
    max_version = max_version_result.scalar() or 0

    cloned = WorkflowDefinition(
        entity_id=entity_id,
        slug=source.slug,
        name=source.name,
        description=source.description,
        entity_type=source.entity_type,
        version=max_version + 1,
        status="draft",
        states=source.states,
        transitions=source.transitions,
        active=True,
        created_by=current_user.id,
    )
    db.add(cloned)
    await db.commit()
    await db.refresh(cloned)

    await record_audit(
        db,
        action="workflow.definition.clone",
        resource_type="workflow_definition",
        resource_id=str(cloned.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "source_id": str(source.id),
            "source_version": source.version,
            "new_version": cloned.version,
        },
    )
    await db.commit()

    logger.info(
        "Workflow definition '%s' cloned v%d → v%d by %s",
        source.slug, source.version, cloned.version, current_user.id,
    )
    return cloned


# ═══════════════════════════════════════════════════════════════════════════════
# WORKFLOW INSTANCES (runtime)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/instances", response_model=PaginatedResponse[WorkflowInstanceRead])
async def list_instances(
    definition_id: UUID | None = None,
    current_state: str | None = None,
    created_by: UUID | None = None,
    entity_type: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List workflow instances for the current entity (paginated).

    Optionally filter by definition_id, current_state, created_by, or entity_type.
    """
    query = (
        select(WorkflowInstance)
        .where(WorkflowInstance.entity_id == entity_id)
    )
    if definition_id:
        query = query.where(WorkflowInstance.workflow_definition_id == definition_id)
    if current_state:
        query = query.where(WorkflowInstance.current_state == current_state)
    if created_by:
        query = query.where(WorkflowInstance.created_by == created_by)
    if entity_type:
        query = query.where(WorkflowInstance.entity_type == entity_type)
    query = query.order_by(WorkflowInstance.created_at.desc())
    return await paginate(db, query, pagination)


@router.post(
    "/instances",
    response_model=WorkflowInstanceRead,
    status_code=201,
)
async def create_instance(
    body: WorkflowInstanceCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.instance.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a workflow instance from a published definition.

    The instance links to a business object via entity_type + entity_id_ref.
    The initial state is the first state defined in the definition's states list,
    or 'draft' as fallback.
    """
    # Validate definition exists, is published, and belongs to this entity
    def_result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == body.workflow_definition_id,
            WorkflowDefinition.entity_id == entity_id,
        )
    )
    definition = def_result.scalar_one_or_none()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    if definition.status != "published":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Instances can only be created from published definitions",
        )

    # Determine initial state from the definition's states
    initial_state = _resolve_initial_state(definition.states)

    instance = WorkflowInstance(
        entity_id=entity_id,
        workflow_definition_id=definition.id,
        entity_type=body.entity_type,
        entity_id_ref=body.entity_id_ref,
        current_state=initial_state,
        metadata_=body.metadata,
        created_by=current_user.id,
    )
    db.add(instance)
    await db.commit()
    await db.refresh(instance)

    await record_audit(
        db,
        action="workflow.instance.create",
        resource_type="workflow_instance",
        resource_id=str(instance.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "definition_id": str(definition.id),
            "definition_slug": definition.slug,
            "entity_type": body.entity_type,
            "entity_id_ref": body.entity_id_ref,
            "initial_state": initial_state,
        },
    )
    await db.commit()

    return instance


@router.get("/instances/{instance_id}", response_model=WorkflowInstanceDetail)
async def get_instance(
    instance_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get workflow instance detail with current state, metadata, and allowed transitions."""
    result = await db.execute(
        select(WorkflowInstance).where(
            WorkflowInstance.id == instance_id,
            WorkflowInstance.entity_id == entity_id,
        )
    )
    instance = result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Workflow instance not found")

    # Load definition for name/slug and allowed transitions
    def_result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == instance.workflow_definition_id,
        )
    )
    definition = def_result.scalar_one_or_none()

    allowed = []
    def_name = None
    def_slug = None
    if definition:
        def_name = definition.name
        def_slug = definition.slug
        allowed = _get_allowed_transitions(definition.transitions, instance.current_state)

    return WorkflowInstanceDetail(
        id=instance.id,
        entity_id=instance.entity_id,
        workflow_definition_id=instance.workflow_definition_id,
        entity_type=instance.entity_type,
        entity_id_ref=instance.entity_id_ref,
        current_state=instance.current_state,
        metadata_=instance.metadata_,
        created_by=instance.created_by,
        created_at=instance.created_at,
        updated_at=instance.updated_at,
        definition_name=def_name,
        definition_slug=def_slug,
        allowed_transitions=allowed,
    )


@router.get(
    "/instances/{instance_id}/history",
    response_model=list[WorkflowTransitionRead],
)
async def get_instance_history(
    instance_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the full transition history for a workflow instance."""
    # Verify instance belongs to entity
    inst_result = await db.execute(
        select(WorkflowInstance.id).where(
            WorkflowInstance.id == instance_id,
            WorkflowInstance.entity_id == entity_id,
        )
    )
    if not inst_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Workflow instance not found")

    result = await db.execute(
        select(WorkflowTransition)
        .where(WorkflowTransition.instance_id == instance_id)
        .order_by(WorkflowTransition.created_at.asc())
    )
    return result.scalars().all()


@router.post(
    "/instances/{instance_id}/transition",
    response_model=WorkflowInstanceRead,
)
async def execute_transition(
    instance_id: UUID,
    body: TransitionRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("workflow.instance.transition"),
    db: AsyncSession = Depends(get_db),
):
    """Execute a state transition on a workflow instance.

    Validates that the transition is allowed by the definition, enforces
    per-transition role requirements, uses optimistic locking to prevent
    race conditions, records the transition in history, and emits a
    "workflow.transition" event via EventBus.
    """
    # Load instance with FOR UPDATE lock to prevent concurrent transitions
    inst_result = await db.execute(
        select(WorkflowInstance)
        .where(
            WorkflowInstance.id == instance_id,
            WorkflowInstance.entity_id == entity_id,
        )
        .with_for_update()
    )
    instance = inst_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail="Workflow instance not found")

    from_state = instance.current_state
    to_state = body.to_state

    # Load definition to validate transition
    def_result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.id == instance.workflow_definition_id,
        )
    )
    definition = def_result.scalar_one()

    # Validate transition is allowed
    allowed = _get_allowed_transitions(definition.transitions, from_state)
    if to_state not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transition from '{from_state}' to '{to_state}' is not allowed. "
                   f"Allowed transitions: {allowed}",
        )

    # Enforce per-transition role requirements (blocks if user lacks role)
    await _enforce_transition_roles(
        definition.transitions, from_state, to_state,
        current_user, entity_id, db,
    )

    # Optimistic lock check — bump version
    instance.current_state = to_state
    instance.version = instance.version + 1

    # Record transition history
    transition_record = WorkflowTransition(
        instance_id=instance.id,
        from_state=from_state,
        to_state=to_state,
        actor_id=current_user.id,
        comment=body.comment,
    )
    db.add(transition_record)

    await db.commit()
    await db.refresh(instance)

    # Audit log
    await record_audit(
        db,
        action="workflow.instance.transition",
        resource_type="workflow_instance",
        resource_id=str(instance.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "definition_slug": definition.slug,
            "from": from_state,
            "to": to_state,
            "comment": body.comment,
            "entity_type": instance.entity_type,
            "entity_id_ref": instance.entity_id_ref,
        },
    )
    await db.commit()

    # Resolve target node type for hook dispatch
    target_node_type = _get_node_type_by_id(definition.states, to_state)

    # Emit event (after commit — as per EventBus contract)
    await event_bus.publish(
        OpsFluxEvent(
            event_type="workflow.transition",
            payload={
                "instance_id": str(instance.id),
                "definition_id": str(definition.id),
                "definition_slug": definition.slug,
                "entity_type": instance.entity_type,
                "entity_id_ref": instance.entity_id_ref,
                "from_state": from_state,
                "to_state": to_state,
                "to_node_type": target_node_type,
                "actor_id": str(current_user.id),
                "comment": body.comment,
                "entity_id": str(entity_id),
                "metadata": instance.metadata_ or {},
            },
        )
    )

    logger.info(
        "Workflow instance %s transitioned %s -> %s (definition: %s, v%d) by %s",
        instance.id, from_state, to_state, definition.slug,
        instance.version, current_user.id,
    )

    return instance


# ═══════════════════════════════════════════════════════════════════════════════
# STATISTICS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/stats", response_model=list[WorkflowDefinitionStats])
async def get_workflow_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get instance counts by state for each workflow definition in this entity."""
    # Get all active definitions for this entity
    def_result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.status == "published",
        )
    )
    definitions = def_result.scalars().all()

    stats = []
    for defn in definitions:
        # Count instances grouped by current_state
        count_result = await db.execute(
            select(
                WorkflowInstance.current_state,
                func.count(WorkflowInstance.id),
            )
            .where(
                WorkflowInstance.workflow_definition_id == defn.id,
                WorkflowInstance.entity_id == entity_id,
            )
            .group_by(WorkflowInstance.current_state)
        )
        rows = count_result.all()

        by_state = [
            WorkflowStateBucket(state=row[0], count=row[1])
            for row in rows
        ]
        total = sum(b.count for b in by_state)

        stats.append(
            WorkflowDefinitionStats(
                definition_id=defn.id,
                definition_name=defn.name,
                definition_slug=defn.slug,
                by_state=by_state,
                total=total,
            )
        )

    return stats


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _resolve_initial_state(states: dict | list) -> str:
    """Determine the initial state from a definition's states structure.

    Supports:
      1. Visual editor format: [{id, type, label, ...}] — looks for type='start'
      2. FSM list format: [{name, initial: true}]
      3. FSM dict format: {state_name: {initial: true}}
    """
    if isinstance(states, list):
        # Visual editor format: look for node with type='start'
        for s in states:
            if isinstance(s, dict) and s.get("type") == "start":
                return s.get("id", "start")
        # FSM list format: look for initial=true
        for s in states:
            if isinstance(s, dict) and s.get("initial"):
                return s.get("name", "draft")
        # Fallback: first item's id or name
        if states and isinstance(states[0], dict):
            return states[0].get("id") or states[0].get("name", "draft")
        return "draft"

    if isinstance(states, dict):
        # FSM dict format: look for a key marked as initial
        for key, val in states.items():
            if isinstance(val, dict) and val.get("initial"):
                return key
        # Fallback: first key
        if states:
            return next(iter(states))

    return "draft"


def _get_allowed_transitions(transitions: dict | list, from_state: str) -> list[str]:
    """Get list of allowed target states from the current state.

    Supports:
      1. Visual editor format: [{source, target, ...}]
      2. FSM list format: [{from, to, ...}]
      3. FSM dict format: {state: [targets]}
    """
    if isinstance(transitions, list):
        allowed = []
        for t in transitions:
            if not isinstance(t, dict):
                continue
            # Visual editor edge format
            if t.get("source") == from_state:
                allowed.append(t["target"])
            # FSM transition format
            elif t.get("from") == from_state:
                allowed.append(t["to"])
        return allowed
    elif isinstance(transitions, dict):
        targets = transitions.get(from_state, [])
        if isinstance(targets, list):
            return targets
    return []


async def _get_user_role_codes(
    user_id: UUID, entity_id: UUID, db: AsyncSession,
) -> set[str]:
    """Return the set of role codes the user holds in the given entity."""
    stmt = (
        select(distinct(UserGroup.role_code))
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,  # noqa: E712
        )
    )
    result = await db.execute(stmt)
    return {row[0] for row in result.all()}


async def _enforce_transition_roles(
    transitions: dict | list,
    from_state: str,
    to_state: str,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    """Enforce per-transition role requirements.

    If the transition definition specifies `roles` or `required_role`,
    the user MUST hold at least one of those roles in the current entity.
    Raises HTTP 403 if the check fails.
    """
    if not isinstance(transitions, list):
        return

    for t in transitions:
        if not isinstance(t, dict):
            continue
        # Match both formats: {from,to} and {source,target}
        t_from = t.get("from") or t.get("source")
        t_to = t.get("to") or t.get("target")
        if t_from == from_state and t_to == to_state:
            required_roles = t.get("roles") or t.get("required_role")
            if not required_roles:
                break  # No role requirement on this transition
            if isinstance(required_roles, str):
                required_roles = [required_roles]

            # Fetch user's entity-scoped roles
            user_roles = await _get_user_role_codes(current_user.id, entity_id, db)

            # Wildcard admin bypass
            if "*" in user_roles:
                logger.info(
                    "Transition %s -> %s: user %s has wildcard role, bypassing",
                    from_state, to_state, current_user.id,
                )
                break

            if not any(r in user_roles for r in required_roles):
                logger.warning(
                    "Transition %s -> %s DENIED: requires %s, user %s has %s",
                    from_state, to_state, required_roles, current_user.id, user_roles,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "message": "Vous n'avez pas le rôle requis pour cette transition",
                        "required_roles": required_roles,
                        "your_roles": sorted(user_roles),
                    },
                )

            logger.info(
                "Transition %s -> %s: user %s authorized (roles: %s)",
                from_state, to_state, current_user.id,
                user_roles & set(required_roles),
            )
            break


def _get_node_type_by_id(states: dict | list, node_id: str) -> str | None:
    """Resolve the node type from its ID (visual editor format).

    Returns None if states is not in visual editor format or node not found.
    """
    if not isinstance(states, list):
        return None
    for s in states:
        if isinstance(s, dict) and s.get("id") == node_id:
            return s.get("type")
    return None


def _validate_definition_structure(states: dict | list, transitions: dict | list) -> None:
    """Validate that a definition has the minimum required structure for publishing.

    Raises HTTPException with detailed errors if validation fails.
    """
    errors: list[str] = []

    if isinstance(states, list):
        # Visual editor format: [{id, type, label, ...}]
        node_types = {
            s.get("type") for s in states if isinstance(s, dict) and s.get("type")
        }
        node_ids = {
            s.get("id") for s in states if isinstance(s, dict) and s.get("id")
        }

        if "start" not in node_types:
            errors.append("Le workflow doit contenir un noeud de démarrage (start)")

        end_types = {"end_approved", "end_rejected", "end_cancelled"}
        if not node_types & end_types:
            errors.append("Le workflow doit contenir au moins un noeud de fin")

        if len(states) < 2:
            errors.append("Le workflow doit contenir au moins 2 noeuds")

        # Validate edge references
        if isinstance(transitions, list):
            for t in transitions:
                if not isinstance(t, dict):
                    continue
                src = t.get("source") or t.get("from")
                tgt = t.get("target") or t.get("to")
                if src and src not in node_ids:
                    errors.append(f"Transition référence un noeud source inexistant: '{src}'")
                if tgt and tgt not in node_ids:
                    errors.append(f"Transition référence un noeud cible inexistant: '{tgt}'")

    elif isinstance(states, dict):
        # FSM format
        if not states:
            errors.append("Le workflow doit contenir au moins un état")
    else:
        errors.append("Le workflow ne contient aucun état défini")

    if not transitions or (isinstance(transitions, list) and len(transitions) == 0):
        errors.append("Le workflow doit contenir au moins une transition")

    if isinstance(transitions, list):
        for index, transition in enumerate(transitions):
            if not isinstance(transition, dict):
                continue
            _validate_transition_runtime_metadata(transition, errors, index)

    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Le workflow n'est pas valide pour la publication",
                "errors": errors,
            },
        )


def _validate_transition_runtime_metadata(
    transition: dict,
    errors: list[str],
    index: int,
) -> None:
    condition = transition.get("condition")
    if condition is not None:
        _validate_transition_condition(condition, errors, index, "condition")

    assignee = transition.get("assignee")
    if assignee is not None:
        if not isinstance(assignee, dict):
            errors.append(f"Transition #{index + 1}: assignee doit être un objet")
        else:
            resolver = assignee.get("resolver")
            if resolver not in {"field", "role"}:
                errors.append(
                    f"Transition #{index + 1}: assignee.resolver doit être 'field' ou 'role'"
                )
            if resolver == "field" and not assignee.get("field"):
                errors.append(
                    f"Transition #{index + 1}: assignee.field est requis pour le resolver 'field'"
                )
            if resolver == "role" and not assignee.get("role_code"):
                errors.append(
                    f"Transition #{index + 1}: assignee.role_code est requis pour le resolver 'role'"
                )

    sla_hours = transition.get("sla_hours")
    if sla_hours is not None and (not isinstance(sla_hours, int) or sla_hours <= 0):
        errors.append(f"Transition #{index + 1}: sla_hours doit être un entier strictement positif")


def _validate_transition_condition(
    condition: object,
    errors: list[str],
    index: int,
    path: str,
) -> None:
    if not isinstance(condition, dict):
        errors.append(f"Transition #{index + 1}: {path} doit être un objet")
        return

    logical_keys = {"all", "any", "not"} & set(condition.keys())
    if logical_keys:
        if "all" in condition or "any" in condition:
            key = "all" if "all" in condition else "any"
            value = condition.get(key)
            if not isinstance(value, list) or not value:
                errors.append(f"Transition #{index + 1}: {path}.{key} doit être une liste non vide")
                return
            for child_index, child in enumerate(value):
                _validate_transition_condition(
                    child,
                    errors,
                    index,
                    f"{path}.{key}[{child_index}]",
                )
            return
        nested = condition.get("not")
        if not isinstance(nested, dict):
            errors.append(f"Transition #{index + 1}: {path}.not doit être un objet")
            return
        _validate_transition_condition(nested, errors, index, f"{path}.not")
        return

    field = condition.get("field")
    op = condition.get("op")
    has_value = "value" in condition or "value_from" in condition

    if not field:
        errors.append(f"Transition #{index + 1}: {path}.field est requis")
    if op not in {"eq", "ne", "truthy", "falsy", "in", "not_in"}:
        errors.append(
            f"Transition #{index + 1}: {path}.op doit être l'un de eq, ne, truthy, falsy, in, not_in"
        )
    if op in {"eq", "ne", "in", "not_in"} and not has_value:
        errors.append(
            f"Transition #{index + 1}: {path} doit fournir value ou value_from pour l'opérateur '{op}'"
        )
