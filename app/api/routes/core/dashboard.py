"""Dashboard routes — tabs (mandatory + personal) and widget data endpoints.

Permissions:
  dashboard.read       — view tabs and widget data
  dashboard.customize  — create/update/delete personal tabs
  dashboard.admin      — manage mandatory (admin-defined) tabs
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import distinct, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.common import (
    Asset,
    AuditLog,
    Tier,
    User,
    UserGroup,
    UserGroupMember,
    WorkflowInstance,
)
from app.models.dashboard import DashboardTab, UserDashboardTab
from app.schemas.dashboard import (
    ActivityEntry,
    AdminTabCreate,
    AdminTabRead,
    AdminTabUpdate,
    DashboardStats,
    DashboardTabRead,
    PendingItem,
    PersonalTabCreate,
    PersonalTabRead,
    PersonalTabUpdate,
)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


# ═══════════════════════════════════════════════════════════════════════════
#  Helper: get user role codes for the current entity
# ═══════════════════════════════════════════════════════════════════════════

async def _get_user_role_codes(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> set[str]:
    """Return the set of role codes the user holds in the given entity."""
    stmt = (
        select(distinct(UserGroup.role_code))
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    result = await db.execute(stmt)
    return {row[0] for row in result.all()}


# ═══════════════════════════════════════════════════════════════════════════
#  TABS — combined view (mandatory + personal)
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/tabs",
    response_model=list[DashboardTabRead],
    dependencies=[require_permission("dashboard.read")],
)
async def list_tabs(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get all dashboard tabs for the current user.

    Returns mandatory tabs matching the user's role(s) merged with
    the user's personal tabs, all sorted by tab_order.
    """
    user_roles = await _get_user_role_codes(current_user.id, entity_id, db)

    # Mandatory tabs: active, matching entity, and either no target_role (visible
    # to everyone) or target_role matching one of the user's roles.
    mandatory_stmt = (
        select(DashboardTab)
        .where(
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
        )
    )
    if user_roles:
        mandatory_stmt = mandatory_stmt.where(
            or_(
                DashboardTab.target_role.is_(None),
                DashboardTab.target_role.in_(user_roles),
            )
        )
    else:
        mandatory_stmt = mandatory_stmt.where(DashboardTab.target_role.is_(None))

    mandatory_stmt = mandatory_stmt.order_by(DashboardTab.tab_order)
    mandatory_result = await db.execute(mandatory_stmt)
    mandatory_tabs = mandatory_result.scalars().all()

    # Personal tabs
    personal_stmt = (
        select(UserDashboardTab)
        .where(
            UserDashboardTab.user_id == current_user.id,
            UserDashboardTab.entity_id == entity_id,
        )
        .order_by(UserDashboardTab.tab_order)
    )
    personal_result = await db.execute(personal_stmt)
    personal_tabs = personal_result.scalars().all()

    # Merge: mandatory first, then personal, each group sorted by tab_order
    combined: list[DashboardTabRead] = []

    for tab in mandatory_tabs:
        combined.append(
            DashboardTabRead(
                id=tab.id,
                name=tab.name,
                tab_order=tab.tab_order,
                widgets=tab.widgets or [],
                is_mandatory=True,
                is_closable=False,
                target_role=tab.target_role,
                created_at=tab.created_at,
                updated_at=tab.updated_at,
            )
        )

    for tab in personal_tabs:
        combined.append(
            DashboardTabRead(
                id=tab.id,
                name=tab.name,
                tab_order=tab.tab_order,
                widgets=tab.widgets or [],
                is_mandatory=False,
                is_closable=True,
                target_role=None,
                created_at=tab.created_at,
                updated_at=tab.updated_at,
            )
        )

    return combined


# ═══════════════════════════════════════════════════════════════════════════
#  PERSONAL TABS — CRUD
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/tabs",
    response_model=PersonalTabRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("dashboard.customize")],
)
async def create_personal_tab(
    body: PersonalTabCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create a personal dashboard tab for the current user."""
    tab = UserDashboardTab(
        user_id=current_user.id,
        entity_id=entity_id,
        name=body.name,
        tab_order=body.tab_order,
        widgets=[w.model_dump() for w in body.widgets],
    )
    db.add(tab)
    await db.commit()
    await db.refresh(tab)
    return PersonalTabRead(
        id=tab.id,
        user_id=tab.user_id,
        entity_id=tab.entity_id,
        name=tab.name,
        tab_order=tab.tab_order,
        widgets=tab.widgets or [],
        created_at=tab.created_at,
        updated_at=tab.updated_at,
        is_mandatory=False,
    )


@router.put(
    "/tabs/{tab_id}",
    response_model=PersonalTabRead,
    dependencies=[require_permission("dashboard.customize")],
)
async def update_personal_tab(
    tab_id: UUID,
    body: PersonalTabUpdate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update a personal dashboard tab. Only the owner can update."""
    result = await db.execute(
        select(UserDashboardTab).where(
            UserDashboardTab.id == tab_id,
            UserDashboardTab.user_id == current_user.id,
            UserDashboardTab.entity_id == entity_id,
        )
    )
    tab = result.scalar_one_or_none()
    if not tab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personal tab not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    if "widgets" in update_data and update_data["widgets"] is not None:
        update_data["widgets"] = [w.model_dump() for w in body.widgets]

    for field, value in update_data.items():
        setattr(tab, field, value)

    await db.commit()
    await db.refresh(tab)
    return PersonalTabRead(
        id=tab.id,
        user_id=tab.user_id,
        entity_id=tab.entity_id,
        name=tab.name,
        tab_order=tab.tab_order,
        widgets=tab.widgets or [],
        created_at=tab.created_at,
        updated_at=tab.updated_at,
        is_mandatory=False,
    )


@router.delete(
    "/tabs/{tab_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("dashboard.customize")],
)
async def delete_personal_tab(
    tab_id: UUID,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete a personal dashboard tab. Only own tabs, never mandatory."""
    result = await db.execute(
        select(UserDashboardTab).where(
            UserDashboardTab.id == tab_id,
            UserDashboardTab.user_id == current_user.id,
            UserDashboardTab.entity_id == entity_id,
        )
    )
    tab = result.scalar_one_or_none()
    if not tab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personal tab not found",
        )

    await db.delete(tab)
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  ADMIN — mandatory tabs management
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/admin/tabs",
    response_model=list[AdminTabRead],
    dependencies=[require_permission("dashboard.admin")],
)
async def list_admin_tabs(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all mandatory tabs for the current entity (admin only)."""
    result = await db.execute(
        select(DashboardTab)
        .where(
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
        )
        .order_by(DashboardTab.tab_order)
    )
    return result.scalars().all()


@router.post(
    "/admin/tabs",
    response_model=AdminTabRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("dashboard.admin")],
)
async def create_admin_tab(
    body: AdminTabCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create a mandatory dashboard tab (admin only)."""
    tab = DashboardTab(
        entity_id=entity_id,
        name=body.name,
        is_mandatory=body.is_mandatory,
        target_role=body.target_role,
        tab_order=body.tab_order,
        widgets=[w.model_dump() for w in body.widgets],
        created_by=current_user.id,
    )
    db.add(tab)
    await db.commit()
    await db.refresh(tab)
    return tab


@router.put(
    "/admin/tabs/{tab_id}",
    response_model=AdminTabRead,
    dependencies=[require_permission("dashboard.admin")],
)
async def update_admin_tab(
    tab_id: UUID,
    body: AdminTabUpdate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update a mandatory dashboard tab (admin only)."""
    result = await db.execute(
        select(DashboardTab).where(
            DashboardTab.id == tab_id,
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
        )
    )
    tab = result.scalar_one_or_none()
    if not tab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin tab not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    if "widgets" in update_data and update_data["widgets"] is not None:
        update_data["widgets"] = [w.model_dump() for w in body.widgets]

    for field, value in update_data.items():
        setattr(tab, field, value)

    await db.commit()
    await db.refresh(tab)
    return tab


@router.delete(
    "/admin/tabs/{tab_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("dashboard.admin")],
)
async def delete_admin_tab(
    tab_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a mandatory dashboard tab (admin only)."""
    result = await db.execute(
        select(DashboardTab).where(
            DashboardTab.id == tab_id,
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
        )
    )
    tab = result.scalar_one_or_none()
    if not tab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin tab not found",
        )

    tab.is_active = False
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  WIDGET DATA — stats, activity, pending items
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/widgets/stats",
    response_model=DashboardStats,
    dependencies=[require_permission("dashboard.read")],
)
async def get_widget_stats(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Global stats: total assets, tiers, users, active workflows, recent activity."""
    # Total assets (non-archived, in entity)
    assets_count = await db.execute(
        select(func.count(Asset.id)).where(
            Asset.entity_id == entity_id,
            Asset.active == True,
        )
    )
    total_assets = assets_count.scalar() or 0

    # Total tiers (non-archived, in entity)
    tiers_count = await db.execute(
        select(func.count(Tier.id)).where(
            Tier.entity_id == entity_id,
            Tier.active == True,
            Tier.archived == False,
        )
    )
    total_tiers = tiers_count.scalar() or 0

    # Total active users in entity (via user groups)
    users_count = await db.execute(
        select(func.count(distinct(UserGroupMember.user_id)))
        .join(UserGroup, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    total_users = users_count.scalar() or 0

    # Active workflow instances (not in terminal states, in this entity)
    workflows_count = await db.execute(
        select(func.count(WorkflowInstance.id)).where(
            WorkflowInstance.entity_id == entity_id,
            WorkflowInstance.current_state.notin_(["completed", "cancelled", "rejected"]),
        )
    )
    active_workflows = workflows_count.scalar() or 0

    # Recent activity count (last 24 hours)
    recent_count_result = await db.execute(
        select(func.count(AuditLog.id)).where(
            AuditLog.entity_id == entity_id,
            AuditLog.created_at >= func.now() - text("interval '24 hours'"),
        )
    )
    recent_activity_count = recent_count_result.scalar() or 0

    return DashboardStats(
        total_assets=total_assets,
        total_tiers=total_tiers,
        total_users=total_users,
        active_workflows=active_workflows,
        recent_activity_count=recent_activity_count,
    )


@router.get(
    "/widgets/activity",
    response_model=list[ActivityEntry],
    dependencies=[require_permission("dashboard.read")],
)
async def get_widget_activity(
    limit: int = 20,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Recent activity feed from audit_log (last N entries)."""
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.entity_id == entity_id)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 50))
    )
    return result.scalars().all()


@router.get(
    "/widgets/pending",
    response_model=list[PendingItem],
    dependencies=[require_permission("dashboard.read")],
)
async def get_widget_pending(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Pending workflow instances waiting for action by the current user.

    Returns workflow instances that are not in terminal states.
    In a full implementation, this would also check step assignments.
    """
    result = await db.execute(
        select(WorkflowInstance)
        .where(
            WorkflowInstance.current_state.notin_(
                ["completed", "cancelled", "rejected"]
            ),
        )
        .order_by(WorkflowInstance.created_at.desc())
        .limit(20)
    )
    instances = result.scalars().all()

    return [
        PendingItem(
            id=inst.id,
            workflow_definition_id=inst.workflow_definition_id,
            entity_type=inst.entity_type,
            entity_id_ref=inst.entity_id_ref,
            current_state=inst.current_state,
            metadata=inst.metadata_,
            created_at=inst.created_at,
        )
        for inst in instances
    ]
