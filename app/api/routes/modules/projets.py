"""Projets (project management) module routes — projects, tasks, members, milestones,
planning revisions, deliverables, actions, change logs."""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.services.core.delete_service import delete_entity
from app.core.events import emit_event
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    Project, ProjectMember, ProjectTask, ProjectMilestone,
    PlanningRevision, TaskDeliverable, TaskAction, TaskChangeLog,
    ProjectTaskDependency,
    User, Tier,
)
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
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── Helpers ───────────────────────────────────────────────────────────────


async def _update_project_progress(db: AsyncSession, project_id: UUID) -> None:
    """Recalculate project progress from task completion percentages."""
    result = await db.execute(
        select(ProjectTask.progress)
        .where(ProjectTask.project_id == project_id, ProjectTask.active == True)
    )
    tasks = result.scalars().all()
    if not tasks:
        return
    avg_progress = sum(tasks) / len(tasks)

    # Also derive project status from task statuses
    task_statuses_result = await db.execute(
        select(ProjectTask.status)
        .where(ProjectTask.project_id == project_id, ProjectTask.active == True)
    )
    statuses = task_statuses_result.scalars().all()

    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()
    if not project:
        return

    project.progress = round(avg_progress)

    # Auto-complete project if all tasks are done
    if all(s == "done" for s in statuses) and project.status == "active":
        project.status = "completed"
    # If any task moves to in_progress and project is still planned/draft
    elif any(s in ("in_progress", "review") for s in statuses) and project.status in ("draft", "planned"):
        project.status = "active"


async def _get_project_or_404(db: AsyncSession, project_id: UUID, entity_id: UUID) -> Project:
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.entity_id == entity_id, Project.archived == False)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(404, "Project not found")
    return project


# ── Projects CRUD ─────────────────────────────────────────────────────────


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    status: str | None = None,
    priority: str | None = None,
    manager_id: UUID | None = None,
    tier_id: UUID | None = None,
    asset_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
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
        )
        .outerjoin(task_count_sq, Project.id == task_count_sq.c.project_id)
        .outerjoin(member_count_sq, Project.id == member_count_sq.c.project_id)
        .outerjoin(User, Project.manager_id == User.id)
        .outerjoin(Tier, Project.tier_id == Tier.id)
        .outerjoin(ParentProject, Project.parent_id == ParentProject.c.id)
        .outerjoin(children_count_sq, Project.id == children_count_sq.c.parent_id)
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
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(
    body: ProjectCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.create"),
    db: AsyncSession = Depends(get_db),
):
    project = Project(entity_id=entity_id, **body.model_dump())
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


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
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
    return d


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: UUID,
    body: ProjectUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    update_data = body.model_dump(exclude_unset=True)
    old_status = project.status
    for field, value in update_data.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)

    # Emit event if status changed
    if "status" in update_data and old_status != project.status:
        await emit_event("project.status.changed", {
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
    for t in tasks:
        d = {c.key: getattr(t, c.key) for c in t.__table__.columns}
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
    d = {c.key: getattr(task, c.key) for c in task.__table__.columns}
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
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(404, "Task not found")

    # Track changes for historisation
    TRACKED_FIELDS = {"status", "priority", "start_date", "due_date", "assignee_id", "title", "description", "progress", "estimated_hours", "actual_hours"}
    CHANGE_TYPES = {
        "start_date": "date_change", "due_date": "date_change", "status": "status_change",
        "priority": "priority_change", "assignee_id": "assignment_change",
        "title": "scope_change", "description": "scope_change",
        "progress": "progress_change", "estimated_hours": "scope_change", "actual_hours": "scope_change",
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
    await _update_project_progress(db, project_id)
    await db.commit()
    d = {c.key: getattr(task, c.key) for c in task.__table__.columns}
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
    current_user: User = Depends(get_current_user),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a task dependency."""
    result = await db.execute(
        select(ProjectTaskDependency).where(ProjectTaskDependency.id == dep_id)
    )
    dep = result.scalar_one_or_none()
    if not dep:
        raise HTTPException(status_code=404, detail="Dependency not found")
    await delete_entity(dep, db, "project_task_dependency", entity_id=dep.id, user_id=current_user.id)
    await db.commit()
