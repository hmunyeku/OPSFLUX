"""Projets (project management) module routes — projects, tasks, members, milestones,
planning revisions, deliverables, actions, change logs."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import delete as sql_delete, select, func as sqla_func, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.audit import record_audit
from app.core.database import get_db
from app.core.event_contracts import PROJECT_STATUS_CHANGED_EVENT
from app.core.references import generate_reference
from app.services.core.delete_service import delete_entity
from app.core.events import emit_event
from app.core.pagination import PaginationParams, paginate
from app.services.core.fsm_service import fsm_service, FSMError
from app.models.common import (
    AuditLog,
    Project, ProjectMember, ProjectTask, ProjectMilestone,
    PlanningRevision, TaskDeliverable, TaskAction, TaskChangeLog,
    ProjectTaskDependency, ProjectWBSNode, CostCenter,
    ProjectTaskAssignee, ProjectComment, ProjectStatusHistory,
    User, Tier,
)
from app.models.asset_registry import Installation
from app.schemas.common import (
    PaginatedResponse,
    ProjectCreate, ProjectRead, ProjectUpdate,
    ProjectMemberCreate, ProjectMemberRead,
    ProjectTaskCreate, ProjectTaskRead, ProjectTaskUpdate, ProjectTaskEnriched,
    ProjectMilestoneCreate, ProjectMilestoneRead, ProjectMilestoneUpdate,
    PlanningRevisionCreate, PlanningRevisionRead, PlanningRevisionUpdate,
    TaskDeliverableCreate, TaskDeliverableRead, TaskDeliverableUpdate,
    TaskActionCreate, TaskActionRead, TaskActionUpdate,
    TaskChangeLogRead,
    TaskDependencyCreate, TaskDependencyRead,
    ProjectWBSNodeCreate, ProjectWBSNodeRead, ProjectWBSNodeUpdate,
    CPMResult,
    TaskAssigneeCreate, TaskAssigneeRead,
    ProjectCommentCreate, ProjectCommentRead, ProjectCommentUpdate,
    ProjectStatusHistoryRead,
)
from app.services.cpm_service import compute_cpm

router = APIRouter(prefix="/api/v1/projects", tags=["projects"], dependencies=[require_module_enabled("projets")])
PROJECT_WORKFLOW_SLUG = "project"
PROJECT_ENTITY_TYPE = "project"


# ── Helpers ───────────────────────────────────────────────────────────────


PROGRESS_WEIGHT_METHODS = ("equal", "effort", "duration", "manual")


async def _resolve_project_progress_method(db: AsyncSession, project: Project) -> str:
    """Resolve the progress weighting method to apply for a project.

    Order of precedence:
      1. project.progress_weight_method (per-project override)
      2. entity-scoped admin setting `projets.default_progress_weight_method`
      3. hardcoded fallback 'equal' (backward compat with the old behaviour)
    """
    if project.progress_weight_method in PROGRESS_WEIGHT_METHODS:
        return project.progress_weight_method
    try:
        result = await db.execute(
            text(
                """
                SELECT value FROM settings
                WHERE key = 'projets.default_progress_weight_method'
                  AND scope = 'entity'
                  AND scope_id = :sid
                LIMIT 1
                """
            ),
            {"sid": str(project.entity_id)},
        )
        row = result.first()
        if row:
            raw = row[0]
            if isinstance(raw, dict) and "value" in raw:
                raw = raw["value"]
            if isinstance(raw, str) and raw in PROGRESS_WEIGHT_METHODS:
                return raw
    except Exception:
        pass
    return "equal"


def _task_raw_weight(task: ProjectTask, method: str) -> float:
    """Return the raw weight of a task for a given weighting method.

    A return value of 0 means the task contributes nothing to its
    parent's weighted average. The aggregator below applies a per-group
    fallback to equal weighting when ALL siblings have weight 0, so a
    project with no estimated hours still computes a sensible average.
    """
    if method == "effort":
        return float(task.estimated_hours or 0)
    if method == "duration":
        if task.start_date and task.due_date:
            delta = (task.due_date - task.start_date).days
            return float(max(delta, 0))
        return 0.0
    if method == "manual":
        return float(task.weight or 0)
    # 'equal' (and fallback): every task counts the same
    return 1.0


def _weighted_average(items: list[tuple[float, float]]) -> float:
    """Compute a weighted average of (value, weight) tuples.

    Falls back to a plain mean if all weights are zero — this is the key
    invariant: a project never returns 0% just because its tasks have no
    estimated hours / no dates / no manual weight. It degrades to equal.
    """
    if not items:
        return 0.0
    total_weight = sum(w for _, w in items)
    if total_weight > 0:
        return sum(v * w for v, w in items) / total_weight
    # Equal-weight fallback
    return sum(v for v, _ in items) / len(items)


async def _update_project_progress(db: AsyncSession, project_id: UUID) -> None:
    """Recalculate project progress + WBS roll-up from leaf-task percentages.

    Strategy (replaces the old simple arithmetic mean):
      1. Resolve the project's weighting method (per-project override →
         entity admin default → 'equal').
      2. Load all active tasks of the project.
      3. Build a parent-id → children index.
      4. Walk the tree depth-first from each leaf, computing each
         parent's progress as the weighted average of its children
         using the resolved method. Memoise to avoid recomputation.
      5. Persist the computed progress for non-leaf (parent) tasks
         only — leaves keep their manually-entered value untouched.
      6. Compute the project's progress as the weighted average of its
         root-level tasks (parent_id IS NULL) using the same method.
      7. Auto-update the project status from the task statuses (same
         logic as before).

    Edge cases handled:
      • Cycles in the parent_id graph → cycle detection via `visited`,
        cycles get value=0 (defensive — should not happen with the
        SET NULL ondelete on parent_id but cheaper than crashing).
      • A task with no children and progress=NULL → counted as 0.
      • All siblings have weight 0 → fallback to equal weighting at
        that level only (does not affect siblings at other levels).
    """
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        return

    method = await _resolve_project_progress_method(db, project)

    # Load every active task in one round-trip
    tasks_result = await db.execute(
        select(ProjectTask).where(
            ProjectTask.project_id == project_id,
            ProjectTask.active == True,
        )
    )
    tasks = list(tasks_result.scalars().all())
    if not tasks:
        return

    # parent_id (or None for roots) → list[ProjectTask]
    children_by_parent: dict[UUID | None, list[ProjectTask]] = {}
    tasks_by_id: dict[UUID, ProjectTask] = {}
    for t in tasks:
        children_by_parent.setdefault(t.parent_id, []).append(t)
        tasks_by_id[t.id] = t

    computed: dict[UUID, float] = {}
    in_progress: set[UUID] = set()  # cycle guard

    def compute(task_id: UUID) -> float:
        if task_id in computed:
            return computed[task_id]
        if task_id in in_progress:
            # Cycle — break with 0 to avoid infinite recursion
            return 0.0
        in_progress.add(task_id)
        task = tasks_by_id.get(task_id)
        if task is None:
            in_progress.discard(task_id)
            return 0.0
        children = children_by_parent.get(task_id, [])
        if not children:
            value = float(task.progress or 0)
        else:
            child_items = [
                (compute(c.id), _task_raw_weight(c, method))
                for c in children
            ]
            value = _weighted_average(child_items)
        computed[task_id] = value
        in_progress.discard(task_id)
        return value

    for t in tasks:
        compute(t.id)

    # Persist the computed progress on parent tasks ONLY. Leaf tasks
    # keep their stored value (which is what the user manually entered).
    # This is the core of the WBS roll-up: parents become read-only at
    # the UI level because their value is fully derived.
    for t in tasks:
        if children_by_parent.get(t.id):
            new_progress = max(0, min(100, round(computed[t.id])))
            if t.progress != new_progress:
                t.progress = new_progress

    # Project-level: weighted average of root-level tasks
    roots = children_by_parent.get(None, [])
    if roots:
        root_items = [(computed[r.id], _task_raw_weight(r, method)) for r in roots]
        project.progress = max(0, min(100, round(_weighted_average(root_items))))

    # ── Auto-update project status from task statuses (unchanged) ──
    statuses = [t.status for t in tasks]
    if all(s == "done" for s in statuses) and project.status == "active":
        project.status = "completed"
    elif any(s in ("in_progress", "review") for s in statuses) and project.status in ("draft", "planned"):
        project.status = "active"


async def _rollup_parent_dates(db: AsyncSession, task: ProjectTask) -> None:
    """Recursively update parent task dates from children's min(start)/max(end).

    Walks up the parent chain: for each ancestor, recompute start_date =
    min(children.start_date) and due_date = max(children.due_date). Stops
    when reaching a root task (parent_id is None) or when dates don't change.
    """
    current = task
    while current.parent_id:
        # Get all siblings (children of the same parent)
        siblings = (await db.execute(
            select(ProjectTask.start_date, ProjectTask.due_date)
            .where(
                ProjectTask.parent_id == current.parent_id,
                ProjectTask.active == True,  # noqa: E712
            )
        )).all()

        starts = [r[0] for r in siblings if r[0] is not None]
        ends = [r[1] for r in siblings if r[1] is not None]
        if not starts and not ends:
            break

        parent = (await db.execute(
            select(ProjectTask).where(ProjectTask.id == current.parent_id)
        )).scalar_one_or_none()
        if not parent:
            break

        changed = False
        if starts:
            new_start = min(starts)
            if parent.start_date != new_start:
                parent.start_date = new_start
                changed = True
        if ends:
            new_end = max(ends)
            if parent.due_date != new_end:
                parent.due_date = new_end
                changed = True

        if not changed:
            break  # no change → ancestors won't change either
        current = parent


async def _check_project_member_role(
    db: AsyncSession, project_id: UUID, user_id: UUID,
    required_roles: list[str] | None = None,
) -> bool:
    """Check if the user is a member of the project with an acceptable role.

    Returns True if:
    - required_roles is None (no role restriction)
    - The user is a member with a role in required_roles
    - The user is the project manager (always passes)

    This is a soft check — callers decide whether to raise 403 or just log.
    """
    # Check if user is project manager (always authorized)
    project = (await db.execute(select(Project).where(Project.id == project_id))).scalar_one_or_none()
    if project and project.manager_id == user_id:
        return True

    if required_roles is None:
        return True

    result = await db.execute(
        select(ProjectMember.role).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.active == True,  # noqa: E712
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return False
    return member in required_roles


async def _get_project_or_404(db: AsyncSession, project_id: UUID, entity_id: UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.entity_id == entity_id, Project.archived == False)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


async def _sync_linked_planner_activities_for_project_task(
    db: AsyncSession,
    *,
    entity_id: UUID,
    project: Project,
    task: ProjectTask,
    current_user: User,
    changed_fields: set[str],
) -> None:
    """Synchronize linked Planner activities after critical project task changes.

    Source-of-truth rules:
    - task title / description / dates are mirrored directly to linked Planner activities
    - task status is not force-mapped to Planner status, but it triggers a revision suggestion
    """
    if not changed_fields:
        return

    # Spec 1.5: any of dates / POB / status modifications must trigger a
    # planner revision notification to the arbiter. Title / description
    # are also mirrored as straight metadata updates.
    critical_fields = {"title", "description", "start_date", "due_date", "status", "pob_quota"}
    impacted_fields = sorted(changed_fields & critical_fields)
    if not impacted_fields:
        return

    from app.models.planner import PlannerActivity

    linked_activities = (
        await db.execute(
            select(PlannerActivity).where(
                PlannerActivity.project_id == project.id,
                PlannerActivity.source_task_id == task.id,
                PlannerActivity.active == True,
            )
        )
    ).scalars().all()
    if not linked_activities:
        return

    for activity in linked_activities:
        if "title" in changed_fields:
            activity.title = f"{project.code} — {task.title}"
        if "description" in changed_fields:
            activity.description = task.description
        if "start_date" in changed_fields:
            activity.start_date = task.start_date
        if "due_date" in changed_fields:
            activity.end_date = task.due_date
        if "pob_quota" in changed_fields:
            # Mirror the new POB to the activity. The arbiter is then
            # notified via the planner.revision flow downstream.
            activity.pax_quota = max(0, int(task.pob_quota or 0))

    await db.flush()

    await record_audit(
        db,
        action="project.task.planner_sync_required",
        resource_type="planner_activity",
        resource_id=str(linked_activities[0].id) if len(linked_activities) == 1 else str(task.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "project_id": str(project.id),
            "project_code": project.code,
            "project_name": project.name,
            "task_id": str(task.id),
            "task_title": task.title,
            "task_status": task.status,
            "changed_fields": impacted_fields,
            "planner_activity_ids": [str(activity.id) for activity in linked_activities],
            "planner_activity_count": len(linked_activities),
        },
    )

    await emit_event(
        "project.task.planner_sync_required",
        {
            "entity_id": str(entity_id),
            "project_id": str(project.id),
            "project_code": project.code,
            "project_name": project.name,
            "task_id": str(task.id),
            "task_title": task.title,
            "task_status": task.status,
            "changed_fields": impacted_fields,
            "planner_activity_ids": [str(activity.id) for activity in linked_activities],
            "planner_activity_count": len(linked_activities),
            "triggered_by": str(current_user.id),
        },
    )


# ── Projects CRUD ─────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    status: str | None = None,
    priority: str | None = None,
    manager_id: UUID | None = None,
    tier_id: UUID | None = None,
    asset_id: UUID | None = None,
    source: str | None = None,  # "opsflux" | "gouti" | None (all)
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    # Subqueries for counts
    task_count_sq = (
        select(ProjectTask.project_id, sqla_func.count(ProjectTask.id).label("task_count"))
        .where(ProjectTask.active == True)
        .group_by(ProjectTask.project_id)
        .subquery()
    )
    member_count_sq = (
        select(ProjectMember.project_id, sqla_func.count(ProjectMember.id).label("member_count"))
        .where(ProjectMember.active == True)
        .group_by(ProjectMember.project_id)
        .subquery()
    )

    children_count_sq = (
        select(Project.parent_id, sqla_func.count(Project.id).label("children_count"))
        .where(Project.archived == False, Project.parent_id.isnot(None))
        .group_by(Project.parent_id)
        .subquery()
    )
    ParentProject = Project.__table__.alias("parent_project")

    query = (
        select(
            Project,
            sqla_func.coalesce(task_count_sq.c.task_count, 0).label("task_count"),
            sqla_func.coalesce(member_count_sq.c.member_count, 0).label("member_count"),
            User.first_name.label("manager_first"),
            User.last_name.label("manager_last"),
            Tier.name.label("tier_name"),
            ParentProject.c.name.label("parent_name"),
            sqla_func.coalesce(children_count_sq.c.children_count, 0).label("children_count"),
            Installation.name.label("asset_name"),
        )
        .outerjoin(task_count_sq, Project.id == task_count_sq.c.project_id)
        .outerjoin(member_count_sq, Project.id == member_count_sq.c.project_id)
        .outerjoin(User, Project.manager_id == User.id)
        .outerjoin(Tier, Project.tier_id == Tier.id)
        .outerjoin(ParentProject, Project.parent_id == ParentProject.c.id)
        .outerjoin(children_count_sq, Project.id == children_count_sq.c.parent_id)
        .outerjoin(Installation, Project.asset_id == Installation.id)
        .where(Project.entity_id == entity_id, Project.archived == False)
    )

    if status:
        query = query.where(Project.status == status)
    if priority:
        query = query.where(Project.priority == priority)
    if manager_id:
        query = query.where(Project.manager_id == manager_id)
    if tier_id:
        query = query.where(Project.tier_id == tier_id)
    if asset_id:
        query = query.where(Project.asset_id == asset_id)
    if source == "gouti":
        query = query.where(Project.external_ref.startswith("gouti:"))
    elif source == "opsflux":
        query = query.where(
            (Project.external_ref.is_(None)) | (~Project.external_ref.startswith("gouti:"))
        )
    if search:
        like = f"%{search}%"
        query = query.where(Project.name.ilike(like) | Project.code.ilike(like))
    query = query.order_by(Project.created_at.desc())

    def _transform(row):
        proj = row[0]
        d = {c.key: getattr(proj, c.key) for c in proj.__table__.columns}
        d["task_count"] = row[1]
        d["member_count"] = row[2]
        d["manager_name"] = f"{row[3]} {row[4]}" if row[3] else None
        d["tier_name"] = row[5]
        d["parent_name"] = row[6]
        d["children_count"] = row[7]
        d["asset_name"] = row[8]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    body: ProjectCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.create"),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    if not payload.get("code"):
        payload["code"] = await generate_reference("PRJ", db, entity_id=entity_id)
    project = Project(entity_id=entity_id, **payload)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    d = {c.key: getattr(project, c.key) for c in project.__table__.columns}
    d["manager_name"] = None
    d["tier_name"] = None
    d["parent_name"] = None
    d["task_count"] = 0
    d["member_count"] = 0
    d["children_count"] = 0
    return d


# ── Cross-Project Tasks (spreadsheet view) ─────────────────────────────
# IMPORTANT: must be declared BEFORE /{project_id} to avoid UUID parsing error


@router.get("/tasks-all", response_model=PaginatedResponse[ProjectTaskEnriched])
async def list_all_tasks(
    project_id: UUID | None = None,
    status: str | None = None,
    priority: str | None = None,
    assignee_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks across all projects — for MS Project-like spreadsheet view."""
    query = (
        select(
            ProjectTask,
            User.first_name.label("assignee_first"),
            User.last_name.label("assignee_last"),
            Project.code.label("project_code"),
            Project.name.label("project_name"),
        )
        .join(Project, ProjectTask.project_id == Project.id)
        .outerjoin(User, ProjectTask.assignee_id == User.id)
        .where(Project.entity_id == entity_id, Project.archived == False, ProjectTask.active == True)
    )
    if project_id:
        query = query.where(ProjectTask.project_id == project_id)
    if status:
        query = query.where(ProjectTask.status == status)
    if priority:
        query = query.where(ProjectTask.priority == priority)
    if assignee_id:
        query = query.where(ProjectTask.assignee_id == assignee_id)
    if search:
        like = f"%{search}%"
        query = query.where(ProjectTask.title.ilike(like) | Project.code.ilike(like))
    query = query.order_by(Project.code, ProjectTask.order, ProjectTask.created_at)

    def _transform(row):
        task = row[0]
        d = {c.key: getattr(task, c.key) for c in task.__table__.columns}
        d["assignee_name"] = f"{row[1]} {row[2]}" if row[1] else None
        d["project_code"] = row[3]
        d["project_name"] = row[4]
        return d

    return await paginate(db, query, pagination, transform=_transform)


# ── Templates (MUST be before /{project_id} to avoid UUID parse error) ──

@router.get("/templates")
async def list_templates_early(
    category: str | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List project templates — declared early to avoid /{project_id} match."""
    from app.models.common import ProjectTemplate
    query = select(ProjectTemplate).where(ProjectTemplate.entity_id == entity_id, ProjectTemplate.active == True)  # noqa: E712
    if category:
        query = query.where(ProjectTemplate.category == category)
    query = query.order_by(ProjectTemplate.usage_count.desc(), ProjectTemplate.name)
    rows = (await db.execute(query)).scalars().all()
    return [{c.key: getattr(r, c.key) for c in r.__table__.columns} for r in rows]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    d = {c.key: getattr(project, c.key) for c in project.__table__.columns}
    # Counts
    tc = await db.execute(select(sqla_func.count()).select_from(ProjectTask).where(ProjectTask.project_id == project_id, ProjectTask.active == True))
    mc = await db.execute(select(sqla_func.count()).select_from(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.active == True))
    d["task_count"] = tc.scalar() or 0
    d["member_count"] = mc.scalar() or 0
    # Manager name
    if project.manager_id:
        mgr = await db.get(User, project.manager_id)
        d["manager_name"] = f"{mgr.first_name} {mgr.last_name}" if mgr else None
    else:
        d["manager_name"] = None
    # Tier name
    if project.tier_id:
        tier = await db.get(Tier, project.tier_id)
        d["tier_name"] = tier.name if tier else None
    else:
        d["tier_name"] = None
    # Parent name
    if project.parent_id:
        parent = await db.get(Project, project.parent_id)
        d["parent_name"] = parent.name if parent else None
    else:
        d["parent_name"] = None
    # Children count
    cc = await db.execute(select(sqla_func.count()).select_from(Project).where(Project.parent_id == project_id, Project.archived == False))
    d["children_count"] = cc.scalar() or 0
    # Asset name
    if project.asset_id:
        asset = await db.get(Installation, project.asset_id)
        d["asset_name"] = asset.name if asset else None
    else:
        d["asset_name"] = None
    return d


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    update_data = body.model_dump(exclude_unset=True)

    # Guard: project code is immutable after creation (CDC §2.3)
    if "code" in update_data and update_data["code"] != project.code:
        raise HTTPException(400, "Le code du projet est immutable après création.")

    # ── §9 CDC: Status transition validation by project role ──────────
    # Each status transition requires a specific project-level role.
    # System-level require_permission("project.update") is already checked
    # above — this adds the project-membership guard.
    if "status" in update_data and update_data["status"] != project.status:
        new_status = update_data["status"]
        old_status = project.status

        # Transition permission matrix:
        #   draft → planned        : manager, reviewer (CHEF_PROJET)
        #   planned → active       : manager (CHEF_PROJET only)
        #   active → on_hold       : manager, reviewer
        #   on_hold → active       : manager, reviewer
        #   active → completed     : manager (CHEF_PROJET only)
        #   any → cancelled        : manager (CHEF_PROJET only)
        #   any → draft            : manager (rollback, CHEF_PROJET only)
        TRANSITION_ROLES: dict[tuple[str, str], list[str]] = {
            ("draft", "planned"):     ["manager", "reviewer"],
            ("planned", "active"):    ["manager"],
            ("active", "on_hold"):    ["manager", "reviewer"],
            ("on_hold", "active"):    ["manager", "reviewer"],
            ("active", "completed"):  ["manager"],
            ("completed", "active"):  ["manager"],  # reopen
        }
        # Cancellation from any state: manager only
        cancel_roles = ["manager"]

        if new_status == "cancelled":
            required = cancel_roles
        elif new_status == "draft":
            required = ["manager"]  # rollback to draft
        else:
            required = TRANSITION_ROLES.get((old_status, new_status), ["manager"])

        is_authorized = await _check_project_member_role(db, project_id, current_user.id, required)
        if not is_authorized:
            role_labels = ", ".join(required)
            raise HTTPException(
                403,
                f"Transition {old_status} → {new_status} requiert le rôle projet : {role_labels}. "
                f"Contactez le chef de projet.",
            )

        try:
            instance = await fsm_service.get_instance(
                db,
                entity_type=PROJECT_ENTITY_TYPE,
                entity_id=str(project.id),
            )
            if not instance:
                await fsm_service.get_or_create_instance(
                    db,
                    workflow_slug=PROJECT_WORKFLOW_SLUG,
                    entity_type=PROJECT_ENTITY_TYPE,
                    entity_id=str(project.id),
                    initial_state=old_status,
                    entity_id_scope=entity_id,
                    created_by=current_user.id,
                )
            await fsm_service.transition(
                db,
                workflow_slug=PROJECT_WORKFLOW_SLUG,
                entity_type=PROJECT_ENTITY_TYPE,
                entity_id=str(project.id),
                to_state=new_status,
                actor_id=current_user.id,
                entity_id_scope=entity_id,
                skip_role_check=True,
            )
        except FSMError as exc:
            if "not found" not in str(exc).lower():
                raise HTTPException(400, str(exc)) from exc

    # ── Read-only lock for Gouti-imported projects ─────────────────────
    # Per the capability matrix probed at connector test time, Gouti does
    # NOT accept PATCH on projects. To stay consistent with the remote
    # source of truth, OpsFlux rejects writes to Gouti-owned fields on
    # any project whose external_ref starts with "gouti:". Locally-owned
    # metadata (tags via TagManager, notes, attachments, tier_id,
    # asset_id, manager_id, parent_id, weather) remains writable.
    if project.external_ref and project.external_ref.startswith("gouti:"):
        from app.services.connectors.gouti_capabilities import load_capabilities, is_field_writable
        capabilities = await load_capabilities(db, entity_id)
        # Map ProjectUpdate fields to the "project" resource in the matrix.
        # Fields Gouti owns on a project (synced at each sync) — never writable:
        GOUTI_OWNED = {"name", "code", "description", "status", "priority",
                       "progress", "start_date", "end_date", "actual_end_date",
                       "budget"}
        blocked = []
        for field in list(update_data.keys()):
            if field in GOUTI_OWNED and not is_field_writable(capabilities, "project", field):
                blocked.append(field)
                update_data.pop(field)
        if blocked:
            # If every requested change was blocked, refuse with 403.
            # Otherwise silently drop blocked fields and persist the rest
            # (locally-owned metadata).
            if not update_data:
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Projet importé de Gouti : les champs "
                        f"{', '.join(blocked)} sont en lecture seule. "
                        "Modifiez-les dans Gouti puis relancez la synchronisation."
                    ),
                )

    old_status = project.status
    method_changed = (
        "progress_weight_method" in update_data
        and update_data["progress_weight_method"] != project.progress_weight_method
    )
    for field, value in update_data.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)

    # If the weighting method changed, recalculate the project's progress
    # immediately so the UI reflects the new value without waiting for the
    # next task patch. _update_project_progress walks the WBS tree and
    # also rolls up parent task progresses, so the whole tree converges
    # to the new method on the spot.
    if method_changed:
        await _update_project_progress(db, project_id)
        await db.commit()
        await db.refresh(project)

    # Emit event if status changed
    if "status" in update_data and old_status != project.status:
        # Audit trail: log the status transition
        db.add(ProjectStatusHistory(
            project_id=project.id,
            from_status=old_status,
            to_status=project.status,
            changed_by=current_user.id,
            reason=update_data.get("status_change_reason"),
        ))
        await db.commit()
        await fsm_service.emit_transition_event(
            entity_type=PROJECT_ENTITY_TYPE,
            entity_id=str(project.id),
            from_state=old_status,
            to_state=project.status,
            actor_id=current_user.id,
            workflow_slug=PROJECT_WORKFLOW_SLUG,
        )
        await emit_event(PROJECT_STATUS_CHANGED_EVENT, {
            "project_id": str(project.id),
            "entity_id": str(entity_id),
            "old_status": old_status,
            "new_status": project.status,
        })

    d = {c.key: getattr(project, c.key) for c in project.__table__.columns}
    d["manager_name"] = None
    d["tier_name"] = None
    d["parent_name"] = None
    d["task_count"] = 0
    d["member_count"] = 0
    d["children_count"] = 0
    return d


@router.delete("/{project_id}")
async def archive_project(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.delete"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    await delete_entity(project, db, "project", entity_id=project.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Project archived"}


# ── Project Members ───────────────────────────────────────────────────────


@router.get("/{project_id}/members", response_model=list[ProjectMemberRead])
async def list_project_members(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id, ProjectMember.active == True)
        .order_by(ProjectMember.role, ProjectMember.created_at)
    )
    members = result.scalars().all()
    enriched = []
    for m in members:
        d = {c.key: getattr(m, c.key) for c in m.__table__.columns}
        if m.user_id:
            u = await db.get(User, m.user_id)
            d["member_name"] = f"{u.first_name} {u.last_name}" if u else None
        else:
            d["member_name"] = None
        enriched.append(d)
    return enriched


@router.post("/{project_id}/members", response_model=ProjectMemberRead, status_code=201)
async def add_project_member(
    project_id: UUID,
    body: ProjectMemberCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.member.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    member = ProjectMember(project_id=project_id, **body.model_dump())
    db.add(member)
    await db.commit()
    await db.refresh(member)
    d = {c.key: getattr(member, c.key) for c in member.__table__.columns}
    d["member_name"] = None
    return d


@router.delete("/{project_id}/members/{member_id}")
async def remove_project_member(
    project_id: UUID,
    member_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.member.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(404, "Member not found")
    await delete_entity(member, db, "project_member", entity_id=member.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Member removed"}


# ── Project Tasks ─────────────────────────────────────────────────────────


@router.get("/{project_id}/tasks", response_model=list[ProjectTaskRead])
async def list_project_tasks(
    project_id: UUID,
    status: str | None = None,
    assignee_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    query = select(ProjectTask).where(
        ProjectTask.project_id == project_id, ProjectTask.active == True
    )
    if status:
        query = query.where(ProjectTask.status == status)
    if assignee_id:
        query = query.where(ProjectTask.assignee_id == assignee_id)
    query = query.order_by(ProjectTask.order, ProjectTask.created_at)
    result = await db.execute(query)
    tasks = result.scalars().all()
    enriched = []
    from decimal import Decimal as _Decimal
    for t in tasks:
        d: dict = {}
        for c in t.__table__.columns:
            val = getattr(t, c.key)
            # Numeric(10,2) columns return Decimal — cast to float for JSON
            if isinstance(val, _Decimal):
                val = float(val)
            d[c.key] = val
        if t.assignee_id:
            u = await db.get(User, t.assignee_id)
            d["assignee_name"] = f"{u.first_name} {u.last_name}" if u else None
        else:
            d["assignee_name"] = None
        enriched.append(d)
    return enriched


@router.post("/{project_id}/tasks", response_model=ProjectTaskRead, status_code=201)
async def create_project_task(
    project_id: UUID,
    body: ProjectTaskCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.task.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    # Auto-assign order
    max_order = await db.execute(
        select(sqla_func.coalesce(sqla_func.max(ProjectTask.order), 0))
        .where(ProjectTask.project_id == project_id)
    )
    task = ProjectTask(project_id=project_id, order=(max_order.scalar() or 0) + 1, **body.model_dump())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    await _update_project_progress(db, project_id)
    await db.commit()
    from decimal import Decimal as _Decimal
    d: dict = {}
    for c in task.__table__.columns:
        val = getattr(task, c.key)
        if isinstance(val, _Decimal):
            val = float(val)
        d[c.key] = val
    d["assignee_name"] = None
    return d


@router.patch("/{project_id}/tasks/{task_id}", response_model=ProjectTaskRead)
async def update_project_task(
    project_id: UUID,
    task_id: UUID,
    body: ProjectTaskUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.task.update"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(404, "Task not found")

    # Track changes for historisation
    TRACKED_FIELDS = {"status", "priority", "start_date", "due_date", "assignee_id", "title", "description", "progress", "estimated_hours", "actual_hours", "pob_quota"}
    CHANGE_TYPES = {
        "start_date": "date_change", "due_date": "date_change", "status": "status_change",
        "priority": "priority_change", "assignee_id": "assignment_change",
        "title": "scope_change", "description": "scope_change",
        "progress": "progress_change", "estimated_hours": "scope_change", "actual_hours": "scope_change",
        "pob_quota": "pob_change",
    }
    for field, value in body.model_dump(exclude_unset=True).items():
        old_value = getattr(task, field)
        if field in TRACKED_FIELDS and str(old_value) != str(value):
            db.add(TaskChangeLog(
                task_id=task_id,
                change_type=CHANGE_TYPES.get(field, "other"),
                field_name=field,
                old_value=str(old_value) if old_value is not None else None,
                new_value=str(value) if value is not None else None,
                changed_by=current_user.id,
            ))
        setattr(task, field, value)

    await db.commit()
    await db.refresh(task)

    # §4 CDC: auto-rollup dates to ancestor chain when dates change
    update_fields = set(body.model_dump(exclude_unset=True).keys())
    if update_fields & {"start_date", "due_date"}:
        await _rollup_parent_dates(db, task)

    await _sync_linked_planner_activities_for_project_task(
        db,
        entity_id=entity_id,
        project=project,
        task=task,
        current_user=current_user,
        changed_fields=update_fields,
    )

    await _update_project_progress(db, project_id)
    await db.commit()
    from decimal import Decimal as _Decimal
    d: dict = {}
    for c in task.__table__.columns:
        val = getattr(task, c.key)
        if isinstance(val, _Decimal):
            val = float(val)
        d[c.key] = val
    if task.assignee_id:
        u = await db.get(User, task.assignee_id)
        d["assignee_name"] = f"{u.first_name} {u.last_name}" if u else None
    else:
        d["assignee_name"] = None
    return d


@router.delete("/{project_id}/tasks/{task_id}")
async def delete_project_task(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.task.delete"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(404, "Task not found")

    # Hard-delete owned child rows first (FKs have no ON DELETE CASCADE):
    # deliverables, actions, changelog entries. ProjectTaskDependency already
    # cascades. Sub-tasks have parent_id ON DELETE SET NULL so they survive.
    await db.execute(sql_delete(TaskDeliverable).where(TaskDeliverable.task_id == task_id))
    await db.execute(sql_delete(TaskAction).where(TaskAction.task_id == task_id))
    await db.execute(sql_delete(TaskChangeLog).where(TaskChangeLog.task_id == task_id))

    await delete_entity(task, db, "project_task", entity_id=task.id, user_id=current_user.id)
    await db.commit()
    await _update_project_progress(db, project_id)
    await db.commit()
    return {"detail": "Task deleted"}


@router.patch("/{project_id}/tasks/reorder")
async def reorder_project_tasks(
    project_id: UUID,
    body: list[dict],  # [{ "id": uuid, "order": int, "status": str? }]
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.task.reorder"),
    db: AsyncSession = Depends(get_db),
):
    """Batch reorder tasks (for kanban drag & drop)."""
    await _get_project_or_404(db, project_id, entity_id)
    for item in body:
        result = await db.execute(
            select(ProjectTask).where(ProjectTask.id == item["id"], ProjectTask.project_id == project_id)
        )
        task = result.scalars().first()
        if task:
            task.order = item.get("order", task.order)
            if "status" in item:
                task.status = item["status"]
    await db.commit()
    return {"detail": f"{len(body)} tasks reordered"}


# ── Project Milestones ────────────────────────────────────────────────────


@router.get("/{project_id}/milestones", response_model=list[ProjectMilestoneRead])
async def list_project_milestones(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMilestone)
        .where(ProjectMilestone.project_id == project_id, ProjectMilestone.active == True)
        .order_by(ProjectMilestone.due_date)
    )
    return result.scalars().all()


@router.post("/{project_id}/milestones", response_model=ProjectMilestoneRead, status_code=201)
async def create_project_milestone(
    project_id: UUID,
    body: ProjectMilestoneCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.milestone.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    ms = ProjectMilestone(project_id=project_id, **body.model_dump())
    db.add(ms)
    await db.commit()
    await db.refresh(ms)
    return ms


@router.patch("/{project_id}/milestones/{milestone_id}", response_model=ProjectMilestoneRead)
async def update_project_milestone(
    project_id: UUID,
    milestone_id: UUID,
    body: ProjectMilestoneUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.milestone.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.id == milestone_id, ProjectMilestone.project_id == project_id)
    )
    ms = result.scalars().first()
    if not ms:
        raise HTTPException(404, "Milestone not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ms, field, value)
    await db.commit()
    await db.refresh(ms)
    return ms


@router.delete("/{project_id}/milestones/{milestone_id}")
async def delete_project_milestone(
    project_id: UUID,
    milestone_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.milestone.delete"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.id == milestone_id, ProjectMilestone.project_id == project_id)
    )
    ms = result.scalars().first()
    if not ms:
        raise HTTPException(404, "Milestone not found")
    await delete_entity(ms, db, "project_milestone", entity_id=ms.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Milestone deleted"}




# ── Sub-projects (children of a macro-project) ─────────────────────────


@router.get("/{project_id}/children", response_model=list[ProjectRead])
async def list_sub_projects(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List sub-projects of a macro-project."""
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(Project)
        .where(Project.parent_id == project_id, Project.archived == False)
        .order_by(Project.code)
    )
    children = result.scalars().all()
    enriched = []
    for proj in children:
        d = {c.key: getattr(proj, c.key) for c in proj.__table__.columns}
        d["manager_name"] = None
        d["tier_name"] = None
        d["parent_name"] = None
        d["task_count"] = 0
        d["member_count"] = 0
        d["children_count"] = 0
        if proj.manager_id:
            mgr = await db.get(User, proj.manager_id)
            d["manager_name"] = f"{mgr.first_name} {mgr.last_name}" if mgr else None
        # Count tasks
        tc = await db.execute(select(sqla_func.count()).select_from(ProjectTask).where(ProjectTask.project_id == proj.id, ProjectTask.active == True))
        d["task_count"] = tc.scalar() or 0
        enriched.append(d)
    return enriched


# ── Planning Revisions ─────────────────────────────────────────────────────


@router.get("/{project_id}/revisions", response_model=list[PlanningRevisionRead])
async def list_revisions(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(PlanningRevision)
        .where(PlanningRevision.project_id == project_id, PlanningRevision.active == True)
        .order_by(PlanningRevision.revision_number.desc())
    )
    revisions = result.scalars().all()
    enriched = []
    for rev in revisions:
        d = {c.key: getattr(rev, c.key) for c in rev.__table__.columns}
        u = await db.get(User, rev.created_by)
        d["creator_name"] = f"{u.first_name} {u.last_name}" if u else None
        enriched.append(d)
    return enriched


@router.post("/{project_id}/revisions", response_model=PlanningRevisionRead, status_code=201)
async def create_revision(
    project_id: UUID,
    body: PlanningRevisionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.revision.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new planning revision — snapshots current tasks/milestones."""
    project = await _get_project_or_404(db, project_id, entity_id)

    # Next revision number
    max_rev = await db.execute(
        select(sqla_func.coalesce(sqla_func.max(PlanningRevision.revision_number), 0))
        .where(PlanningRevision.project_id == project_id)
    )
    next_num = (max_rev.scalar() or 0) + 1

    # Snapshot tasks + milestones
    tasks_result = await db.execute(
        select(ProjectTask).where(ProjectTask.project_id == project_id, ProjectTask.active == True)
    )
    milestones_result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.project_id == project_id, ProjectMilestone.active == True)
    )
    snapshot = {
        "project": {c.key: str(getattr(project, c.key)) if getattr(project, c.key) is not None else None for c in project.__table__.columns},
        "tasks": [
            {c.key: str(getattr(t, c.key)) if getattr(t, c.key) is not None else None for c in t.__table__.columns}
            for t in tasks_result.scalars().all()
        ],
        "milestones": [
            {c.key: str(getattr(m, c.key)) if getattr(m, c.key) is not None else None for c in m.__table__.columns}
            for m in milestones_result.scalars().all()
        ],
    }

    rev = PlanningRevision(
        project_id=project_id,
        revision_number=next_num,
        name=body.name,
        description=body.description,
        is_simulation=body.is_simulation,
        snapshot_data=snapshot,
        created_by=current_user.id,
    )
    db.add(rev)
    await db.commit()
    await db.refresh(rev)
    d = {c.key: getattr(rev, c.key) for c in rev.__table__.columns}
    d["creator_name"] = f"{current_user.first_name} {current_user.last_name}"
    return d


@router.patch("/{project_id}/revisions/{revision_id}", response_model=PlanningRevisionRead)
async def update_revision(
    project_id: UUID,
    revision_id: UUID,
    body: PlanningRevisionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.revision.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(PlanningRevision).where(PlanningRevision.id == revision_id, PlanningRevision.project_id == project_id)
    )
    rev = result.scalars().first()
    if not rev:
        raise HTTPException(404, "Revision not found")

    # If setting as active, deactivate others
    if body.is_active is True:
        others = await db.execute(
            select(PlanningRevision)
            .where(PlanningRevision.project_id == project_id, PlanningRevision.is_active == True, PlanningRevision.id != revision_id)
        )
        for other in others.scalars().all():
            other.is_active = False

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rev, field, value)
    await db.commit()
    await db.refresh(rev)
    d = {c.key: getattr(rev, c.key) for c in rev.__table__.columns}
    d["creator_name"] = None
    return d


@router.post("/{project_id}/revisions/{revision_id}/apply")
async def apply_revision(
    project_id: UUID,
    revision_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.revision.apply"),
    db: AsyncSession = Depends(get_db),
):
    """Apply a revision snapshot — commits a simulation as active revision."""
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(PlanningRevision).where(PlanningRevision.id == revision_id, PlanningRevision.project_id == project_id)
    )
    rev = result.scalars().first()
    if not rev:
        raise HTTPException(404, "Revision not found")
    if not rev.snapshot_data:
        raise HTTPException(400, "Revision has no snapshot data")

    # Mark as no longer simulation, set as active
    rev.is_simulation = False
    rev.is_active = True
    # Deactivate others
    others = await db.execute(
        select(PlanningRevision)
        .where(PlanningRevision.project_id == project_id, PlanningRevision.is_active == True, PlanningRevision.id != revision_id)
    )
    for other in others.scalars().all():
        other.is_active = False

    await db.commit()
    return {"detail": "Revision applied and set as active"}


@router.delete("/{project_id}/revisions/{revision_id}")
async def delete_revision(
    project_id: UUID,
    revision_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.revision.delete"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(PlanningRevision).where(PlanningRevision.id == revision_id, PlanningRevision.project_id == project_id)
    )
    rev = result.scalars().first()
    if not rev:
        raise HTTPException(404, "Revision not found")
    await delete_entity(rev, db, "planning_revision", entity_id=rev.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Revision deleted"}


# ── Task Deliverables ──────────────────────────────────────────────────────


@router.get("/{project_id}/tasks/{task_id}/deliverables", response_model=list[TaskDeliverableRead])
async def list_deliverables(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskDeliverable)
        .where(TaskDeliverable.task_id == task_id, TaskDeliverable.active == True)
        .order_by(TaskDeliverable.created_at)
    )
    return result.scalars().all()


@router.post("/{project_id}/tasks/{task_id}/deliverables", response_model=TaskDeliverableRead, status_code=201)
async def create_deliverable(
    project_id: UUID,
    task_id: UUID,
    body: TaskDeliverableCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.deliverable.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    deliv = TaskDeliverable(task_id=task_id, **body.model_dump())
    db.add(deliv)
    await db.commit()
    await db.refresh(deliv)
    return deliv


@router.patch("/{project_id}/tasks/{task_id}/deliverables/{deliverable_id}", response_model=TaskDeliverableRead)
async def update_deliverable(
    project_id: UUID,
    task_id: UUID,
    deliverable_id: UUID,
    body: TaskDeliverableUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.deliverable.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskDeliverable).where(TaskDeliverable.id == deliverable_id, TaskDeliverable.task_id == task_id)
    )
    deliv = result.scalars().first()
    if not deliv:
        raise HTTPException(404, "Deliverable not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(deliv, field, value)
    await db.commit()
    await db.refresh(deliv)
    return deliv


@router.delete("/{project_id}/tasks/{task_id}/deliverables/{deliverable_id}")
async def delete_deliverable(
    project_id: UUID,
    task_id: UUID,
    deliverable_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.deliverable.delete"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskDeliverable).where(TaskDeliverable.id == deliverable_id, TaskDeliverable.task_id == task_id)
    )
    deliv = result.scalars().first()
    if not deliv:
        raise HTTPException(404, "Deliverable not found")
    await delete_entity(deliv, db, "task_deliverable", entity_id=deliv.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Deliverable deleted"}


# ── Task Actions / Checklists ──────────────────────────────────────────────


@router.get("/{project_id}/tasks/{task_id}/actions", response_model=list[TaskActionRead])
async def list_actions(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskAction)
        .where(TaskAction.task_id == task_id, TaskAction.active == True)
        .order_by(TaskAction.order, TaskAction.created_at)
    )
    return result.scalars().all()


@router.post("/{project_id}/tasks/{task_id}/actions", response_model=TaskActionRead, status_code=201)
async def create_action(
    project_id: UUID,
    task_id: UUID,
    body: TaskActionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.action.create"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    max_order = await db.execute(
        select(sqla_func.coalesce(sqla_func.max(TaskAction.order), 0))
        .where(TaskAction.task_id == task_id)
    )
    action = TaskAction(
        task_id=task_id,
        title=body.title,
        completed=body.completed,
        order=(max_order.scalar() or 0) + 1,
    )
    if body.completed:
        action.completed_at = datetime.now(timezone.utc)
        action.completed_by = current_user.id
    db.add(action)
    await db.commit()
    await db.refresh(action)
    return action


@router.patch("/{project_id}/tasks/{task_id}/actions/{action_id}", response_model=TaskActionRead)
async def update_action(
    project_id: UUID,
    task_id: UUID,
    action_id: UUID,
    body: TaskActionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.action.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskAction).where(TaskAction.id == action_id, TaskAction.task_id == task_id)
    )
    action = result.scalars().first()
    if not action:
        raise HTTPException(404, "Action not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(action, field, value)
    if body.completed is True and not action.completed_at:
        action.completed_at = datetime.now(timezone.utc)
        action.completed_by = current_user.id
    elif body.completed is False:
        action.completed_at = None
        action.completed_by = None
    await db.commit()
    await db.refresh(action)
    return action


@router.delete("/{project_id}/tasks/{task_id}/actions/{action_id}")
async def delete_action(
    project_id: UUID,
    task_id: UUID,
    action_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.action.delete"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskAction).where(TaskAction.id == action_id, TaskAction.task_id == task_id)
    )
    action = result.scalars().first()
    if not action:
        raise HTTPException(404, "Action not found")
    await delete_entity(action, db, "task_action", entity_id=action.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Action deleted"}


# ── Task Change Log ────────────────────────────────────────────────────────


@router.get("/{project_id}/tasks/{task_id}/changelog", response_model=list[TaskChangeLogRead])
async def list_task_changelog(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(TaskChangeLog)
        .where(TaskChangeLog.task_id == task_id)
        .order_by(TaskChangeLog.created_at.desc())
    )
    logs = result.scalars().all()
    enriched = []
    for log in logs:
        d = {c.key: getattr(log, c.key) for c in log.__table__.columns}
        u = await db.get(User, log.changed_by)
        d["author_name"] = f"{u.first_name} {u.last_name}" if u else None
        enriched.append(d)
    return enriched


# ── Task Dependencies ──────────────────────────────────────────────────────


@router.get("/{project_id}/dependencies", response_model=list[TaskDependencyRead])
async def list_task_dependencies(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all task dependencies for a project."""
    # Get all task IDs for this project
    task_ids_result = await db.execute(
        select(ProjectTask.id).where(ProjectTask.project_id == project_id, ProjectTask.active == True)
    )
    task_ids = [r[0] for r in task_ids_result.all()]
    if not task_ids:
        return []

    result = await db.execute(
        select(ProjectTaskDependency)
        .where(
            ProjectTaskDependency.from_task_id.in_(task_ids),
            ProjectTaskDependency.active == True,
        )
        .order_by(ProjectTaskDependency.created_at)
    )
    return result.scalars().all()


@router.post("/{project_id}/dependencies", response_model=TaskDependencyRead, status_code=201)
async def create_task_dependency(
    project_id: UUID,
    body: TaskDependencyCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    """Create a dependency between two tasks."""
    # Verify both tasks belong to this project
    for tid in [body.from_task_id, body.to_task_id]:
        task_result = await db.execute(
            select(ProjectTask).where(ProjectTask.id == tid, ProjectTask.project_id == project_id)
        )
        if not task_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail=f"Task {tid} not found in project")

    if body.from_task_id == body.to_task_id:
        raise HTTPException(status_code=400, detail="A task cannot depend on itself")

    # Check for circular dependency
    visited = set()
    queue = [body.to_task_id]
    while queue:
        current = queue.pop(0)
        if current == body.from_task_id:
            raise HTTPException(status_code=400, detail="Circular dependency detected")
        if current in visited:
            continue
        visited.add(current)
        downstream = await db.execute(
            select(ProjectTaskDependency.to_task_id)
            .where(ProjectTaskDependency.from_task_id == current, ProjectTaskDependency.active == True)
        )
        queue.extend([r[0] for r in downstream.all()])

    # Check duplicate
    existing = await db.execute(
        select(ProjectTaskDependency).where(
            ProjectTaskDependency.from_task_id == body.from_task_id,
            ProjectTaskDependency.to_task_id == body.to_task_id,
            ProjectTaskDependency.active == True,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Dependency already exists")

    dep = ProjectTaskDependency(**body.model_dump())
    db.add(dep)
    await db.commit()
    await db.refresh(dep)
    return dep


@router.delete("/{project_id}/dependencies/{dep_id}", status_code=204)
async def delete_task_dependency(
    project_id: UUID,
    dep_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a task dependency."""
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTaskDependency).where(ProjectTaskDependency.id == dep_id)
    )
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
    await delete_entity(dep, db, "project_task_dependency", entity_id=dep.id, user_id=current_user.id)
    await db.commit()


# ── Project WBS (Work Breakdown Structure) ────────────────────────────────


def _wbs_node_to_dict(node: ProjectWBSNode, cost_center_name: str | None = None,
                      children_count: int = 0, task_count: int = 0) -> dict:
    d = {c.key: getattr(node, c.key) for c in node.__table__.columns}
    d["cost_center_name"] = cost_center_name
    d["children_count"] = children_count
    d["task_count"] = task_count
    return d


@router.get("/{project_id}/wbs", response_model=list[ProjectWBSNodeRead])
async def list_wbs_nodes(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return the full WBS tree of a project as a flat ordered list."""
    await _get_project_or_404(db, project_id, entity_id)
    rows = (await db.execute(
        select(
            ProjectWBSNode,
            CostCenter.name.label("cc_name"),
        )
        .outerjoin(CostCenter, ProjectWBSNode.cost_center_id == CostCenter.id)
        .where(ProjectWBSNode.project_id == project_id, ProjectWBSNode.active == True)  # noqa: E712
        .order_by(ProjectWBSNode.order, ProjectWBSNode.code)
    )).all()

    # Compute children/task counts in batch
    nodes = [r[0] for r in rows]
    node_ids = [n.id for n in nodes]
    child_counts: dict[UUID, int] = {}
    task_counts: dict[UUID, int] = {}
    if node_ids:
        cc_rows = (await db.execute(
            select(ProjectWBSNode.parent_id, sqla_func.count(ProjectWBSNode.id))
            .where(ProjectWBSNode.parent_id.in_(node_ids), ProjectWBSNode.active == True)  # noqa: E712
            .group_by(ProjectWBSNode.parent_id)
        )).all()
        child_counts = {r[0]: r[1] for r in cc_rows}
        tc_rows = (await db.execute(
            select(ProjectTask.wbs_node_id, sqla_func.count(ProjectTask.id))
            .where(ProjectTask.wbs_node_id.in_(node_ids), ProjectTask.active == True)  # noqa: E712
            .group_by(ProjectTask.wbs_node_id)
        )).all()
        task_counts = {r[0]: r[1] for r in tc_rows}

    return [
        _wbs_node_to_dict(
            r[0],
            cost_center_name=r[1],
            children_count=child_counts.get(r[0].id, 0),
            task_count=task_counts.get(r[0].id, 0),
        )
        for r in rows
    ]


@router.post("/{project_id}/wbs", response_model=ProjectWBSNodeRead, status_code=201)
async def create_wbs_node(
    project_id: UUID,
    body: ProjectWBSNodeCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.wbs.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    # Validate parent if given
    if body.parent_id:
        parent = (await db.execute(
            select(ProjectWBSNode).where(
                ProjectWBSNode.id == body.parent_id,
                ProjectWBSNode.project_id == project_id,
            )
        )).scalar_one_or_none()
        if parent is None:
            raise HTTPException(400, "parent_id must belong to the same project")
    node = ProjectWBSNode(project_id=project_id, **body.model_dump())
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return _wbs_node_to_dict(node)


@router.patch("/{project_id}/wbs/{node_id}", response_model=ProjectWBSNodeRead)
async def update_wbs_node(
    project_id: UUID,
    node_id: UUID,
    body: ProjectWBSNodeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.wbs.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectWBSNode).where(
            ProjectWBSNode.id == node_id, ProjectWBSNode.project_id == project_id
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(404, "WBS node not found")
    # Prevent setting its own parent to itself or a descendant (simple check: no self)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("parent_id") == node.id:
        raise HTTPException(400, "A WBS node cannot be its own parent")
    for k, v in payload.items():
        setattr(node, k, v)
    await db.commit()
    await db.refresh(node)
    return _wbs_node_to_dict(node)


@router.delete("/{project_id}/wbs/{node_id}", status_code=204)
async def delete_wbs_node(
    project_id: UUID,
    node_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.wbs.manage"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectWBSNode).where(
            ProjectWBSNode.id == node_id, ProjectWBSNode.project_id == project_id
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(404, "WBS node not found")
    # Soft-archive: set active=False so cascades don't wipe linked tasks
    node.active = False
    await db.commit()


# ── CPM (Critical Path Method) ────────────────────────────────────────────


@router.get("/{project_id}/cpm", response_model=CPMResult)
async def get_project_cpm(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """Run Critical Path Method on the project and return schedule analysis."""
    await _get_project_or_404(db, project_id, entity_id)
    return await compute_cpm(db, project_id)


# ── Task Assignees (multi-assignation) ─────────────────────────────────


@router.get("/{project_id}/tasks/{task_id}/assignees", response_model=list[TaskAssigneeRead])
async def list_task_assignees(
    project_id: UUID, task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    rows = (await db.execute(
        select(ProjectTaskAssignee, User.first_name, User.last_name)
        .outerjoin(User, ProjectTaskAssignee.user_id == User.id)
        .where(ProjectTaskAssignee.task_id == task_id)
        .order_by(ProjectTaskAssignee.created_at)
    )).all()
    return [{**{c.key: getattr(r[0], c.key) for c in r[0].__table__.columns}, "user_name": f"{r[1]} {r[2]}" if r[1] else None} for r in rows]


@router.post("/{project_id}/tasks/{task_id}/assignees", response_model=TaskAssigneeRead, status_code=201)
async def add_task_assignee(
    project_id: UUID, task_id: UUID, body: TaskAssigneeCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.task.assign"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    existing = (await db.execute(select(ProjectTaskAssignee).where(ProjectTaskAssignee.task_id == task_id, ProjectTaskAssignee.user_id == body.user_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "User already assigned")
    a = ProjectTaskAssignee(task_id=task_id, user_id=body.user_id, role=body.role)
    db.add(a); await db.commit(); await db.refresh(a)
    u = await db.get(User, body.user_id)

    # §4 CDC: notify the assigned user
    try:
        task = (await db.execute(select(ProjectTask).where(ProjectTask.id == task_id))).scalar_one_or_none()
        project = await _get_project_or_404(db, project_id, entity_id)
        if task and u:
            from app.core.notifications import send_in_app
            from app.core.email_templates import render_and_send_email
            await send_in_app(
                db, user_id=body.user_id, entity_id=entity_id,
                title=f"Nouvelle assignation : {task.title}",
                body=f"Vous avez été assigné(e) à la tâche « {task.title} » du projet {project.code} — {project.name}.",
                category="projets", link="/projets",
                event_type="project.task.assigned",
            )
            if u.email:
                await render_and_send_email(
                    db,
                    slug="project.task.assigned",
                    entity_id=entity_id,
                    language=u.language or "fr",
                    to=u.email,
                    variables={
                        "project_id": str(project.id),
                        "project_code": project.code,
                        "project_name": project.name,
                        "task_id": str(task.id),
                        "task_title": task.title,
                        "task_role": body.role or "",
                        "user": {"first_name": u.first_name},
                    },
                )
            await db.commit()
    except Exception:
        pass  # notification is best-effort

    d = {c.key: getattr(a, c.key) for c in a.__table__.columns}
    d["user_name"] = f"{u.first_name} {u.last_name}" if u else None
    return d


@router.delete("/{project_id}/tasks/{task_id}/assignees/{assignee_id}", status_code=204)
async def remove_task_assignee(
    project_id: UUID, task_id: UUID, assignee_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.task.assign"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    a = (await db.execute(select(ProjectTaskAssignee).where(ProjectTaskAssignee.id == assignee_id))).scalar_one_or_none()
    if not a: raise HTTPException(404, "Assignee not found")
    await db.delete(a); await db.commit()


# ── Comments (threaded, on tasks or projects) ──────────────────────────


async def _fetch_comments(db, owner_type: str, owner_id: UUID):
    rows = (await db.execute(
        select(ProjectComment, User.first_name, User.last_name)
        .outerjoin(User, ProjectComment.author_id == User.id)
        .where(ProjectComment.owner_type == owner_type, ProjectComment.owner_id == owner_id, ProjectComment.active == True)
        .order_by(ProjectComment.created_at)
    )).all()
    return [{**{c.key: getattr(r[0], c.key) for c in r[0].__table__.columns}, "author_name": f"{r[1]} {r[2]}" if r[1] else None} for r in rows]


@router.get("/{project_id}/comments", response_model=list[ProjectCommentRead])
async def list_project_comments(
    project_id: UUID, entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    return await _fetch_comments(db, "project", project_id)


@router.get("/{project_id}/tasks/{task_id}/comments", response_model=list[ProjectCommentRead])
async def list_task_comments(
    project_id: UUID, task_id: UUID, entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    return await _fetch_comments(db, "project_task", task_id)


@router.post("/{project_id}/tasks/{task_id}/comments", response_model=ProjectCommentRead, status_code=201)
async def create_task_comment(
    project_id: UUID, task_id: UUID, body: ProjectCommentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.comment.create"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    comment = ProjectComment(owner_type="project_task", owner_id=task_id, author_id=current_user.id, body=body.body, mentions=[str(m) for m in body.mentions] if body.mentions else None, parent_id=body.parent_id)
    db.add(comment); await db.commit(); await db.refresh(comment)
    d = {c.key: getattr(comment, c.key) for c in comment.__table__.columns}
    d["author_name"] = f"{current_user.first_name} {current_user.last_name}"
    return d


@router.post("/{project_id}/comments", response_model=ProjectCommentRead, status_code=201)
async def create_project_comment(
    project_id: UUID, body: ProjectCommentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.comment.create"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    comment = ProjectComment(owner_type="project", owner_id=project_id, author_id=current_user.id, body=body.body, mentions=[str(m) for m in body.mentions] if body.mentions else None, parent_id=body.parent_id)
    db.add(comment); await db.commit(); await db.refresh(comment)
    d = {c.key: getattr(comment, c.key) for c in comment.__table__.columns}
    d["author_name"] = f"{current_user.first_name} {current_user.last_name}"
    return d


@router.delete("/{project_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    project_id: UUID, comment_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.comment.delete"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    comment = (await db.execute(select(ProjectComment).where(ProjectComment.id == comment_id))).scalar_one_or_none()
    if not comment: raise HTTPException(404, "Comment not found")
    comment.active = False; await db.commit()


# ── Project Status History ─────────────────────────────────────────────


@router.get("/{project_id}/status-history", response_model=list[ProjectStatusHistoryRead])
async def list_status_history(
    project_id: UUID, entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"), db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    rows = (await db.execute(
        select(ProjectStatusHistory, User.first_name, User.last_name)
        .outerjoin(User, ProjectStatusHistory.changed_by == User.id)
        .where(ProjectStatusHistory.project_id == project_id)
        .order_by(ProjectStatusHistory.changed_at.desc())
    )).all()
    return [{"id": r[0].id, "project_id": r[0].project_id, "from_status": r[0].from_status, "to_status": r[0].to_status, "changed_by": r[0].changed_by, "reason": r[0].reason, "changed_at": r[0].changed_at, "changed_by_name": f"{r[1]} {r[2]}" if r[1] else None} for r in rows]



# ── Projets → Planner link ─────────────────────────────────────────────


class SendToPlannerItem(BaseModel):
    task_id: UUID
    # Optional pax_quota override — when None the PlannerActivity will
    # inherit the task's own pob_quota field (spec 1.5).
    pax_quota: int | None = Field(default=None, ge=0)
    priority: str = "medium"


class SendToPlannerRequest(BaseModel):
    items: list[SendToPlannerItem] = Field(..., min_length=1, max_length=200)
    asset_id: UUID | None = None  # override project asset if needed


class SendToPlannerResult(BaseModel):
    created: int
    skipped: int
    errors: list[str]


@router.get("/{project_id}/planner-links")
async def list_planner_links(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List which tasks of this project already have Planner activities."""
    await _get_project_or_404(db, project_id, entity_id)
    from app.models.planner import PlannerActivity
    rows = (await db.execute(
        select(PlannerActivity.source_task_id, PlannerActivity.id, PlannerActivity.status, PlannerActivity.title)
        .where(
            PlannerActivity.project_id == project_id,
            PlannerActivity.source_task_id.isnot(None),
            PlannerActivity.active == True,
        )
    )).all()
    return [
        {"task_id": str(r[0]), "activity_id": str(r[1]), "status": r[2], "title": r[3]}
        for r in rows
    ]


@router.delete("/{project_id}/tasks/{task_id}/planner-link", status_code=204)
async def unlink_task_from_planner(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.planner.send"),
    db: AsyncSession = Depends(get_db),
):
    """Spec 1.5 / 2.3: 'Retirer du Planner' toggle for a single task.

    Soft-deletes any PlannerActivity rows that were created from this
    project task (matched via source_task_id). The activities are flagged
    active=False so the Gantt no longer renders them and the heatmap no
    longer counts their POB. The sync hook on subsequent task updates
    will then no-op for this task because there are no active linked
    activities anymore.
    """
    await _get_project_or_404(db, project_id, entity_id)
    from app.models.planner import PlannerActivity

    linked_activities = (await db.execute(
        select(PlannerActivity).where(
            PlannerActivity.project_id == project_id,
            PlannerActivity.source_task_id == task_id,
            PlannerActivity.active == True,
        )
    )).scalars().all()
    if not linked_activities:
        return None

    for activity in linked_activities:
        activity.active = False

    await record_audit(
        db,
        action="project.task.planner_unlink",
        resource_type="planner_activity",
        resource_id=str(linked_activities[0].id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "project_id": str(project_id),
            "task_id": str(task_id),
            "planner_activity_ids": [str(a.id) for a in linked_activities],
            "count": len(linked_activities),
        },
    )
    await db.commit()
    return None


# ── Breakdown pending markers (spec §2.8) ──────────────────────────────


@router.get("/{project_id}/breakdown-pending")
async def list_breakdown_pending_tasks(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """List tasks of this project flagged as 'pending manual breakdown'.

    Spec §2.8: when a parent-task revision is accepted, the chef-de-projet
    must update each child task manually. Every affected child is tagged
    via an AuditLog row with action='project.task.breakdown_pending'
    (written by planner._apply_accepted_revision_request). We query those
    rows here and return the latest unresolved one per task so the
    frontend can badge the child tasks.
    """
    await _get_project_or_404(db, project_id, entity_id)

    # Only the latest unresolved marker per task_id counts. "Unresolved"
    # means details.resolved is not True. We query all breakdown events
    # for the project, then filter in Python (simpler than JSON-aware SQL).
    rows = (await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "project.task.breakdown_pending",
            AuditLog.resource_type == "project_task",
        )
        .order_by(AuditLog.created_at.desc())
    )).scalars().all()

    latest_per_task: dict[str, AuditLog] = {}
    for row in rows:
        task_id_str = row.resource_id
        if not task_id_str or task_id_str in latest_per_task:
            continue
        details = row.details if isinstance(row.details, dict) else {}
        if details.get("project_id") != str(project_id):
            continue
        latest_per_task[task_id_str] = row

    return [
        {
            "task_id": tid,
            "audit_id": str(audit.id),
            "parent_task_id": (audit.details or {}).get("parent_task_id") if isinstance(audit.details, dict) else None,
            "parent_task_title": (audit.details or {}).get("parent_task_title") if isinstance(audit.details, dict) else None,
            "proposed_start_date": (audit.details or {}).get("proposed_start_date") if isinstance(audit.details, dict) else None,
            "proposed_end_date": (audit.details or {}).get("proposed_end_date") if isinstance(audit.details, dict) else None,
            "proposed_status": (audit.details or {}).get("proposed_status") if isinstance(audit.details, dict) else None,
            "created_at": audit.created_at.isoformat() if audit.created_at else None,
            "resolved": bool(((audit.details or {}) if isinstance(audit.details, dict) else {}).get("resolved", False)),
        }
        for tid, audit in latest_per_task.items()
        if not bool(((audit.details or {}) if isinstance(audit.details, dict) else {}).get("resolved", False))
    ]


@router.post("/{project_id}/tasks/{task_id}/breakdown-resolve", status_code=204)
async def resolve_breakdown_pending(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.task.update"),
    db: AsyncSession = Depends(get_db),
):
    """Mark a task's breakdown_pending marker as resolved.

    Idempotent. Creates a new audit entry (action='project.task.
    breakdown_resolved') and writes a new breakdown_pending row with
    resolved=True so the list endpoint filters it out. We intentionally
    do NOT mutate the old AuditLog rows: audit logs are append-only.
    """
    await _get_project_or_404(db, project_id, entity_id)

    # Find the latest unresolved breakdown marker for this task
    latest = (await db.execute(
        select(AuditLog)
        .where(
            AuditLog.entity_id == entity_id,
            AuditLog.action == "project.task.breakdown_pending",
            AuditLog.resource_type == "project_task",
            AuditLog.resource_id == str(task_id),
        )
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    base_details = latest.details if latest and isinstance(latest.details, dict) else {}

    await record_audit(
        db,
        action="project.task.breakdown_resolved",
        resource_type="project_task",
        resource_id=str(task_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            **base_details,
            "project_id": str(project_id),
            "resolved": True,
            "resolved_by": str(current_user.id),
        },
    )
    # Also insert a fresh 'breakdown_pending' row with resolved=True so
    # the list endpoint above filters out this task on subsequent reads
    # (the endpoint reads the LATEST marker per task_id).
    await record_audit(
        db,
        action="project.task.breakdown_pending",
        resource_type="project_task",
        resource_id=str(task_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            **base_details,
            "project_id": str(project_id),
            "resolved": True,
            "resolved_by": str(current_user.id),
        },
    )
    await db.commit()
    return None


@router.post("/{project_id}/send-to-planner", response_model=SendToPlannerResult)
async def send_tasks_to_planner(
    project_id: UUID,
    body: SendToPlannerRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.planner.send"),
    db: AsyncSession = Depends(get_db),
):
    """Batch-create Planner activities from selected project tasks.

    Each task becomes one PlannerActivity with source_task_id set.
    Tasks already linked (source_task_id exists) are skipped.
    """
    project = await _get_project_or_404(db, project_id, entity_id)
    asset_id = body.asset_id or project.asset_id
    if not asset_id:
        raise HTTPException(400, "Le projet doit avoir un site (asset) pour envoyer au Planner.")

    from app.models.planner import PlannerActivity

    # Get already-linked task IDs
    existing = (await db.execute(
        select(PlannerActivity.source_task_id)
        .where(
            PlannerActivity.project_id == project_id,
            PlannerActivity.source_task_id.isnot(None),
            PlannerActivity.active == True,
        )
    )).scalars().all()
    linked = set(str(x) for x in existing)

    created = 0
    skipped = 0
    errors: list[str] = []

    for item in body.items:
        tid = str(item.task_id)
        if tid in linked:
            skipped += 1
            continue
        task = (await db.execute(
            select(ProjectTask).where(ProjectTask.id == item.task_id, ProjectTask.project_id == project_id, ProjectTask.active == True)
        )).scalar_one_or_none()
        if not task:
            errors.append(f"Tâche {tid} introuvable")
            continue
        # Inherit pob_quota from the task by default. The frontend can
        # override per item via item.pax_quota (spec 1.5 / 2.4).
        effective_pax_quota = item.pax_quota if item.pax_quota is not None else max(0, int(getattr(task, "pob_quota", 0) or 0))
        if effective_pax_quota <= 0:
            effective_pax_quota = 1
        activity = PlannerActivity(
            entity_id=entity_id,
            asset_id=asset_id,
            project_id=project_id,
            source_task_id=task.id,
            type="project",
            title=f"{project.code} — {task.title}",
            description=task.description,
            status="draft",
            priority=item.priority,
            pax_quota=effective_pax_quota,
            start_date=task.start_date,
            end_date=task.due_date,
            created_by=current_user.id,
        )
        db.add(activity)
        created += 1
        linked.add(tid)

    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(500, f"Erreur: {str(exc)[:300]}")

    return SendToPlannerResult(created=created, skipped=skipped, errors=errors)



# ── Project Templates ──────────────────────────────────────────────────


# list_templates moved above /{project_id} to avoid route conflict


@router.post("/templates", status_code=201)
async def save_as_template(
    project_id: UUID, name: str, description: str | None = None, category: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.create"),
    db: AsyncSession = Depends(get_db),
):
    """Snapshot a project into a reusable template."""
    from app.models.common import ProjectTemplate, ProjectWBSNode
    project = await _get_project_or_404(db, project_id, entity_id)
    tasks = (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id, ProjectTask.active == True))).scalars().all()
    milestones = (await db.execute(select(ProjectMilestone).where(ProjectMilestone.project_id == project_id, ProjectMilestone.active == True))).scalars().all()
    wbs = (await db.execute(select(ProjectWBSNode).where(ProjectWBSNode.project_id == project_id, ProjectWBSNode.active == True))).scalars().all()
    task_id_to_idx = {t.id: i for i, t in enumerate(tasks)}
    snapshot = {
        "project": {"name": project.name, "project_type": project.project_type, "priority": project.priority, "weather": project.weather, "description": project.description},
        "tasks": [{"title": t.title, "description": t.description, "status": "todo", "priority": t.priority, "estimated_hours": t.estimated_hours, "order": t.order, "parent_idx": task_id_to_idx.get(t.parent_id)} for t in tasks],
        "milestones": [{"name": m.name, "description": m.description} for m in milestones],
        "wbs_nodes": [{"code": w.code, "name": w.name, "description": w.description, "budget": w.budget, "order": w.order} for w in wbs],
    }
    tpl = ProjectTemplate(entity_id=entity_id, name=name, description=description, category=category, snapshot=snapshot, source_project_id=project_id, created_by=current_user.id)
    db.add(tpl); await db.commit(); await db.refresh(tpl)
    return {c.key: getattr(tpl, c.key) for c in tpl.__table__.columns}


@router.post("/from-template", status_code=201)
async def create_from_template(
    template_id: UUID, name: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.create"),
    db: AsyncSession = Depends(get_db),
):
    """Clone a project from a template."""
    from app.models.common import ProjectTemplate, ProjectWBSNode
    tpl = (await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id, ProjectTemplate.entity_id == entity_id))).scalar_one_or_none()
    if not tpl: raise HTTPException(404, "Template not found")
    snap = tpl.snapshot
    code = await generate_reference("PRJ", db, entity_id=entity_id)
    project = Project(entity_id=entity_id, code=code, name=name, project_type=snap.get("project", {}).get("project_type", "project"), priority=snap.get("project", {}).get("priority", "medium"), weather=snap.get("project", {}).get("weather", "sunny"), description=snap.get("project", {}).get("description"), status="draft")
    db.add(project); await db.flush()
    task_map: dict[int, UUID] = {}
    for i, td in enumerate(snap.get("tasks", [])):
        parent_id = task_map.get(td.get("parent_idx")) if td.get("parent_idx") is not None else None
        task = ProjectTask(project_id=project.id, parent_id=parent_id, title=td["title"], description=td.get("description"), status="todo", priority=td.get("priority", "medium"), estimated_hours=td.get("estimated_hours"), order=td.get("order", 0))
        db.add(task); await db.flush(); task_map[i] = task.id
    for md in snap.get("milestones", []):
        db.add(ProjectMilestone(project_id=project.id, name=md["name"], description=md.get("description")))
    for wd in snap.get("wbs_nodes", []):
        db.add(ProjectWBSNode(project_id=project.id, code=wd["code"], name=wd["name"], description=wd.get("description"), budget=wd.get("budget"), order=wd.get("order", 0)))
    tpl.usage_count += 1; await db.commit(); await db.refresh(project)
    d = {c.key: getattr(project, c.key) for c in project.__table__.columns}
    d["manager_name"] = None; d["tier_name"] = None; d["parent_name"] = None; d["department_name"] = None
    d["task_count"] = len(snap.get("tasks", [])); d["member_count"] = 0; d["children_count"] = 0
    return d


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(template_id: UUID, entity_id: UUID = Depends(get_current_entity), _: None = require_permission("project.delete"), db: AsyncSession = Depends(get_db)):
    from app.models.common import ProjectTemplate
    tpl = (await db.execute(select(ProjectTemplate).where(ProjectTemplate.id == template_id, ProjectTemplate.entity_id == entity_id))).scalar_one_or_none()
    if not tpl: raise HTTPException(404, "Template not found")
    tpl.active = False; await db.commit()


# ── Custom Fields ──────────────────────────────────────────────────────


@router.get("/{project_id}/custom-fields")
async def list_custom_fields(project_id: UUID, entity_id: UUID = Depends(get_current_entity), _: None = require_permission("project.read"), db: AsyncSession = Depends(get_db)):
    from app.models.common import CustomFieldDef, CustomFieldValue
    defs = (await db.execute(select(CustomFieldDef).where(CustomFieldDef.entity_id == entity_id, CustomFieldDef.target_type == "project", CustomFieldDef.active == True).order_by(CustomFieldDef.order))).scalars().all()
    values = (await db.execute(select(CustomFieldValue).where(CustomFieldValue.owner_type == "project", CustomFieldValue.owner_id == project_id))).scalars().all()
    val_map = {str(v.field_def_id): v for v in values}
    return [{"id": str(d.id), "slug": d.slug, "label": d.label, "field_type": d.field_type, "options": d.options, "required": d.required, "default_value": d.default_value, "order": d.order, "value_text": val_map[str(d.id)].value_text if str(d.id) in val_map else d.default_value, "value_json": val_map[str(d.id)].value_json if str(d.id) in val_map else None} for d in defs]


@router.put("/{project_id}/custom-fields/{field_def_id}")
async def set_custom_field_value(project_id: UUID, field_def_id: UUID, value_text: str | None = None, value_json: dict | None = None, entity_id: UUID = Depends(get_current_entity), _: None = require_permission("project.update"), db: AsyncSession = Depends(get_db)):
    from app.models.common import CustomFieldValue
    existing = (await db.execute(select(CustomFieldValue).where(CustomFieldValue.field_def_id == field_def_id, CustomFieldValue.owner_type == "project", CustomFieldValue.owner_id == project_id))).scalar_one_or_none()
    if existing: existing.value_text = value_text; existing.value_json = value_json
    else: db.add(CustomFieldValue(field_def_id=field_def_id, owner_type="project", owner_id=project_id, value_text=value_text, value_json=value_json))
    await db.commit()
    return {"ok": True}


# ── PDF Export ─────────────────────────────────────────────────────────


@router.get("/{project_id}/pdf")
async def export_project_pdf(project_id: UUID, entity_id: UUID = Depends(get_current_entity), current_user: User = Depends(get_current_user), _: None = require_permission("project.export"), db: AsyncSession = Depends(get_db)):
    """Generate a PDF report for the project."""
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf
    from app.models.common import ProjectWBSNode
    project = await _get_project_or_404(db, project_id, entity_id)
    tasks = (await db.execute(select(ProjectTask).where(ProjectTask.project_id == project_id, ProjectTask.active == True).order_by(ProjectTask.order))).scalars().all()
    milestones = (await db.execute(select(ProjectMilestone).where(ProjectMilestone.project_id == project_id, ProjectMilestone.active == True))).scalars().all()
    wbs = (await db.execute(select(ProjectWBSNode).where(ProjectWBSNode.project_id == project_id, ProjectWBSNode.active == True).order_by(ProjectWBSNode.code))).scalars().all()
    manager = await db.get(User, project.manager_id) if project.manager_id else None
    variables = {
        "project": {"code": project.code, "name": project.name, "status": project.status, "priority": project.priority, "progress": project.progress, "project_type": project.project_type, "weather": project.weather, "start_date": project.start_date.strftime("%d/%m/%Y") if project.start_date else "--", "end_date": project.end_date.strftime("%d/%m/%Y") if project.end_date else "--", "budget": f"{project.budget:,.0f} {project.currency or 'XAF'}" if project.budget else "--", "description": project.description or "", "manager_name": f"{manager.first_name} {manager.last_name}" if manager else "--"},
        "tasks": [{"title": t.title, "status": t.status, "priority": t.priority, "progress": t.progress, "start": t.start_date.strftime("%d/%m/%Y") if t.start_date else "--", "end": t.due_date.strftime("%d/%m/%Y") if t.due_date else "--"} for t in tasks],
        "milestones": [{"name": m.name, "due_date": m.due_date.strftime("%d/%m/%Y") if m.due_date else "--", "status": m.status} for m in milestones],
        "wbs_nodes": [{"code": w.code, "name": w.name, "budget": f"{w.budget:,.0f}" if w.budget else "--"} for w in wbs],
        "task_count": len(tasks), "milestone_count": len(milestones),
        "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }
    pdf_bytes = await render_pdf(db, slug="project.report", entity_id=entity_id, variables=variables, language="fr")
    if not pdf_bytes:
        raise HTTPException(404, "Template PDF 'project.report' introuvable. Créez-le dans Paramètres > Modèles PDF.")
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename={project.code}_report.pdf'})


# ── Gantt PDF export (A3 landscape) ──────────────────────────────────────
#
# This endpoint mirrors the planner one (POST /api/v1/planner/export/gantt-pdf)
# but uses the `project.read` permission and a "Projets — Gantt" title. It
# reuses the same shared `planner.gantt_export` PDF template (slug is generic
# — it just renders rows + columns + bars regardless of source module). The
# request payload schema is intentionally identical so the frontend ports
# the planner client code with minimal changes.


class ProjectGanttPdfColumn(BaseModel):
    key: str
    label: str
    group_label: str | None = None
    is_today: bool = False
    is_weekend: bool = False
    is_dim: bool = False


class ProjectGanttPdfHeatmapCell(BaseModel):
    value: str = ""
    bg: str | None = None
    fg: str | None = None


class ProjectGanttPdfBar(BaseModel):
    start_col: int
    end_col: int
    color: str
    text_color: str = "#ffffff"
    label: str | None = None
    is_draft: bool = False
    is_critical: bool = False
    progress: int | None = None
    cell_labels: list[str] | None = None


class ProjectGanttPdfRow(BaseModel):
    id: str
    label: str
    sublabel: str | None = None
    level: int = 0
    is_heatmap: bool = False
    heatmap_cells: list[ProjectGanttPdfHeatmapCell] = Field(default_factory=list)
    bar: ProjectGanttPdfBar | None = None


class ProjectGanttPdfExportRequest(BaseModel):
    """Server-side rendered Projets Gantt PDF payload — same shape as the
    planner export request. Uses the shared `planner.gantt_export` template."""
    title: str | None = None
    subtitle: str | None = None
    date_range: str | None = None
    scale: str | None = None
    columns: list[ProjectGanttPdfColumn] = Field(default_factory=list)
    rows: list[ProjectGanttPdfRow] = Field(default_factory=list)
    task_col_label: str = "Tâche"


@router.post("/export/gantt-pdf")
async def export_projects_gantt_pdf(
    payload: ProjectGanttPdfExportRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.read"),
    db: AsyncSession = Depends(get_db),
):
    """Render the Projets Gantt as an A3 landscape PDF (vector, server-side).

    Reuses the system PDF template `planner.gantt_export` — the slug is named
    after the planner module for historical reasons but the template itself is
    a generic gantt renderer that takes rows + columns + bars and produces
    crisp vector output via WeasyPrint.
    """
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf
    from app.models.common import Entity

    entity = await db.get(Entity, entity_id)
    generated_at = datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M")
    generated_by = getattr(current_user, "full_name", None) or current_user.email

    column_groups: list[dict] = []
    if payload.columns:
        current_label: str | None = None
        for col in payload.columns:
            if col.group_label and col.group_label != current_label:
                column_groups.append({"label": col.group_label, "span": 1})
                current_label = col.group_label
            elif column_groups:
                column_groups[-1]["span"] += 1

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="planner.gantt_export",
            entity_id=entity_id,
            language="fr",
            variables={
                "title": payload.title or "Projets — Gantt",
                "subtitle": payload.subtitle or "",
                "date_range": payload.date_range or "",
                "scale": payload.scale or "",
                "generated_at": generated_at,
                "generated_by": generated_by,
                "entity": {"name": entity.name if entity else ""},
                "task_col_label": payload.task_col_label,
                "columns": [c.model_dump() for c in payload.columns],
                "column_groups": column_groups,
                "rows": [r.model_dump() for r in payload.rows],
            },
        )
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")

    if pdf_bytes is None:
        raise HTTPException(
            404,
            "PDF template 'planner.gantt_export' not found. Run the seed_pdf_templates job.",
        )

    filename = f"projets-gantt-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Activity Feed ──────────────────────────────────────────────────────


@router.get("/{project_id}/activity-feed")
async def get_activity_feed(project_id: UUID, limit: int = 50, entity_id: UUID = Depends(get_current_entity), _: None = require_permission("project.read"), db: AsyncSession = Depends(get_db)):
    """Unified activity timeline — merges status changes, task modifications, comments."""
    await _get_project_or_404(db, project_id, entity_id)
    feed: list[dict] = []
    from app.models.common import ProjectStatusHistory, ProjectComment
    # Status history
    for r, fn, ln in (await db.execute(select(ProjectStatusHistory, User.first_name, User.last_name).outerjoin(User, ProjectStatusHistory.changed_by == User.id).where(ProjectStatusHistory.project_id == project_id).order_by(ProjectStatusHistory.changed_at.desc()).limit(limit))).all():
        feed.append({"type": "status_change", "date": r.changed_at.isoformat(), "user": f"{fn} {ln}" if fn else None, "detail": f"{r.from_status or chr(8212)} -> {r.to_status}", "reason": r.reason})
    # Task changelog
    task_ids = (await db.execute(select(ProjectTask.id).where(ProjectTask.project_id == project_id))).scalars().all()
    if task_ids:
        for cl, fn, ln, title in (await db.execute(select(TaskChangeLog, User.first_name, User.last_name, ProjectTask.title).outerjoin(User, TaskChangeLog.changed_by == User.id).outerjoin(ProjectTask, TaskChangeLog.task_id == ProjectTask.id).where(TaskChangeLog.task_id.in_(task_ids)).order_by(TaskChangeLog.created_at.desc()).limit(limit))).all():
            feed.append({"type": "task_change", "date": cl.created_at.isoformat(), "user": f"{fn} {ln}" if fn else None, "task_title": title, "field": cl.field_name, "old": cl.old_value, "new": cl.new_value, "change_type": cl.change_type})
    # Comments
    owner_ids = [project_id] + list(task_ids)
    for cm, fn, ln in (await db.execute(select(ProjectComment, User.first_name, User.last_name).outerjoin(User, ProjectComment.author_id == User.id).where(ProjectComment.owner_type.in_(["project", "project_task"]), ProjectComment.owner_id.in_(owner_ids), ProjectComment.active == True).order_by(ProjectComment.created_at.desc()).limit(limit))).all():
        feed.append({"type": "comment", "date": cm.created_at.isoformat(), "user": f"{fn} {ln}" if fn else None, "body": cm.body[:200], "owner_type": cm.owner_type})
    feed.sort(key=lambda x: x["date"], reverse=True)
    return feed[:limit]
