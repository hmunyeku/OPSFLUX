"""Projets (project management) module routes — projects, tasks, members, milestones."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.models.common import Project, ProjectMember, ProjectTask, ProjectMilestone, User, Tier
from app.schemas.common import (
    PaginatedResponse,
    ProjectCreate, ProjectRead, ProjectUpdate,
    ProjectMemberCreate, ProjectMemberRead,
    ProjectTaskCreate, ProjectTaskRead, ProjectTaskUpdate,
    ProjectMilestoneCreate, ProjectMilestoneRead, ProjectMilestoneUpdate,
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


# ── Helpers ───────────────────────────────────────────────────────────────


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

    query = (
        select(
            Project,
            sqla_func.coalesce(task_count_sq.c.task_count, 0).label("task_count"),
            sqla_func.coalesce(member_count_sq.c.member_count, 0).label("member_count"),
            User.first_name.label("manager_first"),
            User.last_name.label("manager_last"),
            Tier.name.label("tier_name"),
        )
        .outerjoin(task_count_sq, Project.id == task_count_sq.c.project_id)
        .outerjoin(member_count_sq, Project.id == member_count_sq.c.project_id)
        .outerjoin(User, Project.manager_id == User.id)
        .outerjoin(Tier, Project.tier_id == Tier.id)
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
    d["task_count"] = 0
    d["member_count"] = 0
    return d


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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    d = {c.key: getattr(project, c.key) for c in project.__table__.columns}
    d["manager_name"] = None
    d["tier_name"] = None
    d["task_count"] = 0
    d["member_count"] = 0
    return d


@router.delete("/{project_id}")
async def archive_project(
    project_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.delete"),
    db: AsyncSession = Depends(get_db),
):
    project = await _get_project_or_404(db, project_id, entity_id)
    project.archived = True
    project.active = False
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
    _: None = require_permission("project.update"),
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
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
    )
    member = result.scalars().first()
    if not member:
        raise HTTPException(404, "Member not found")
    member.active = False
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
    _: None = require_permission("project.update"),
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
    d = {c.key: getattr(task, c.key) for c in task.__table__.columns}
    d["assignee_name"] = None
    return d


@router.patch("/{project_id}/tasks/{task_id}", response_model=ProjectTaskRead)
async def update_project_task(
    project_id: UUID,
    task_id: UUID,
    body: ProjectTaskUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(404, "Task not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    await db.commit()
    await db.refresh(task)
    d = {c.key: getattr(task, c.key) for c in task.__table__.columns}
    d["assignee_name"] = None
    return d


@router.delete("/{project_id}/tasks/{task_id}")
async def delete_project_task(
    project_id: UUID,
    task_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectTask).where(ProjectTask.id == task_id, ProjectTask.project_id == project_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(404, "Task not found")
    task.active = False
    await db.commit()
    return {"detail": "Task deleted"}


@router.patch("/{project_id}/tasks/reorder")
async def reorder_project_tasks(
    project_id: UUID,
    body: list[dict],  # [{ "id": uuid, "order": int, "status": str? }]
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("project.update"),
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
    _: None = require_permission("project.update"),
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
    _: None = require_permission("project.update"),
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
    _: None = require_permission("project.update"),
    db: AsyncSession = Depends(get_db),
):
    await _get_project_or_404(db, project_id, entity_id)
    result = await db.execute(
        select(ProjectMilestone).where(ProjectMilestone.id == milestone_id, ProjectMilestone.project_id == project_id)
    )
    ms = result.scalars().first()
    if not ms:
        raise HTTPException(404, "Milestone not found")
    ms.active = False
    await db.commit()
    return {"detail": "Milestone deleted"}
