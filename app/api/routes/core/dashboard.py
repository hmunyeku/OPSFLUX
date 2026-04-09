"""Dashboard routes — full dashboards, tabs, widgets, SQL, TV mode, SSE.

Permissions:
  dashboard.read       — view tabs and widget data
  dashboard.customize  — create/update/delete personal tabs
  dashboard.admin      — manage mandatory (admin-defined) tabs and full dashboards
"""

import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import distinct, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, require_permission
from app.core.database import get_db
from app.models.asset_registry import Installation
from app.models.common import (
    AuditLog,
    Tier,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    WorkflowInstance,
)
from app.models.dashboard import (
    Dashboard,
    DashboardTab,
    UserDashboardTab,
)
from app.schemas.dashboard import (
    ActivityEntry,
    AdminTabCreate,
    AdminTabRead,
    AdminTabUpdate,
    DashboardCreate,
    DashboardExport,
    DashboardImport,
    DashboardRead,
    DashboardStats,
    DashboardTabRead,
    DashboardUpdate,
    HomePageSettingCreate,
    HomePageSettingRead,
    PendingItem,
    PersonalTabCreate,
    PersonalTabRead,
    PersonalTabUpdate,
    SQLWidgetRequest,
    SQLWidgetResponse,
    TVLinkCreate,
    TVLinkRead,
    WidgetCatalogEntry,
    WidgetDataRequest,
    WidgetDataResponse,
)
from app.services.core.delete_service import delete_entity
from app.services.modules.dashboard_service import (
    create_dashboard as svc_create_dashboard,
    delete_dashboard as svc_delete_dashboard,
    export_dashboard_json,
    generate_tv_link,
    get_dashboard as svc_get_dashboard,
    get_dashboard_by_tv_token,
    get_home_page_for_user,
    get_widget_catalog,
    get_widget_data,
    import_dashboard_json,
    list_dashboards as svc_list_dashboards,
    log_dashboard_access,
    revoke_tv_link,
    set_home_page,
    update_dashboard as svc_update_dashboard,
    validate_and_execute_widget_sql,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["dashboard"])


def _normalize_module_slug(module: str | None) -> str | None:
    if module in {"report_editor", "report-editor"}:
        return "papyrus"
    return module


# ═══════════════════════════════════════════════════════════════════════════
#  Helper: get user role codes for the current entity
# ═══════════════════════════════════════════════════════════════════════════

async def _get_user_role_codes(
    user_id: UUID, entity_id: UUID, db: AsyncSession
) -> set[str]:
    """Return the set of role codes the user holds in the given entity."""
    stmt = (
        select(distinct(UserGroupRole.role_code))
        .join(UserGroup, UserGroup.id == UserGroupRole.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(
            UserGroupMember.user_id == user_id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,
        )
    )
    result = await db.execute(stmt)
    return {row[0] for row in result.all()}


async def _get_tenant_id(entity_id: UUID, db: AsyncSession) -> UUID:
    """Resolve tenant_id from entity_id.

    In the current schema entities ARE the tenant boundary,
    so tenant_id == entity_id.
    """
    return entity_id


# ═══════════════════════════════════════════════════════════════════════════
#  FULL DASHBOARD CRUD
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/dashboards",
    response_model=DashboardRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("dashboard.admin")],
)
async def create_dashboard(
    body: DashboardCreate,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Create a new dashboard with GridStack layout."""
    tenant_id = await _get_tenant_id(entity_id, db)
    dashboard = await svc_create_dashboard(
        data=body,
        owner_id=current_user.id,
        tenant_id=tenant_id,
        entity_id=entity_id,
        db=db,
    )
    return dashboard


@router.get(
    "/dashboards",
    response_model=list[DashboardRead],
    dependencies=[require_permission("dashboard.read")],
)
async def list_dashboards(
    owner: UUID | None = None,
    public_only: bool = False,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List dashboards visible to the current user."""
    tenant_id = await _get_tenant_id(entity_id, db)
    dashboards = await svc_list_dashboards(
        tenant_id=tenant_id,
        entity_id=entity_id,
        db=db,
        owner_id=owner,
        is_public=True if public_only else None,
    )
    return dashboards


@router.get(
    "/dashboards/widget-catalog",
    response_model=list[WidgetCatalogEntry],
    dependencies=[require_permission("dashboard.read")],
)
async def widget_catalog(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get the widget catalog filtered by the current user's roles."""
    roles = await _get_user_role_codes(current_user.id, entity_id, db)
    return get_widget_catalog(list(roles))


@router.get(
    "/dashboards/home",
    response_model=DashboardRead | None,
    dependencies=[require_permission("dashboard.read")],
)
async def get_home_page(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Resolve the user's home page dashboard (user > role > BU > global)."""
    tenant_id = await _get_tenant_id(entity_id, db)
    roles = await _get_user_role_codes(current_user.id, entity_id, db)

    # Resolve BU for user (if assigned)
    bu_id = None  # TODO: resolve from user's group/BU assignment

    dashboard = await get_home_page_for_user(
        user_id=current_user.id,
        roles=list(roles),
        bu_id=bu_id,
        tenant_id=tenant_id,
        db=db,
    )
    return dashboard


@router.post(
    "/dashboards/home",
    response_model=HomePageSettingRead,
    dependencies=[require_permission("dashboard.admin")],
)
async def set_home_page_setting(
    body: HomePageSettingCreate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Set the home page dashboard for a given scope (user/role/BU/global)."""
    tenant_id = await _get_tenant_id(entity_id, db)
    setting = await set_home_page(data=body, tenant_id=tenant_id, db=db)
    return setting


@router.post(
    "/dashboards/widget-data",
    response_model=WidgetDataResponse,
    dependencies=[require_permission("dashboard.read")],
)
async def fetch_widget_data(
    body: WidgetDataRequest,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get data for a specific widget instance."""
    tenant_id = await _get_tenant_id(entity_id, db)
    response = await get_widget_data(
        widget_id=body.widget_id,
        widget_config={"type": body.widget_type, **body.config, **body.filters},
        tenant_id=tenant_id,
        entity_id=entity_id,
        user=current_user,
        db=db,
    )
    return response


@router.post(
    "/dashboards/widget-sql",
    response_model=SQLWidgetResponse,
    dependencies=[require_permission("dashboard.admin")],
)
async def execute_sql_widget(
    body: SQLWidgetRequest,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Execute a validated SQL query for a custom widget (admin only)."""
    tenant_id = await _get_tenant_id(entity_id, db)
    result = await validate_and_execute_widget_sql(
        query=body.query,
        params=body.params,
        user=current_user,
        tenant_id=tenant_id,
        max_rows=body.max_rows,
        timeout_seconds=body.timeout_seconds,
    )
    return SQLWidgetResponse(**result)


@router.post(
    "/dashboards/import",
    response_model=DashboardRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[require_permission("dashboard.admin")],
)
async def import_dashboard(
    body: DashboardImport,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Import a dashboard from a JSON export payload."""
    tenant_id = await _get_tenant_id(entity_id, db)
    dashboard = await import_dashboard_json(
        data=body,
        owner_id=current_user.id,
        tenant_id=tenant_id,
        entity_id=entity_id,
        db=db,
    )
    return dashboard


@router.get(
    "/dashboards/tv/{token}",
)
async def get_tv_dashboard(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Access a dashboard via TV token (no authentication required)."""
    dashboard = await get_dashboard_by_tv_token(token, db)
    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired TV token",
        )

    # Log access
    ip_address = request.client.host if request.client else None
    await log_dashboard_access(
        dashboard_id=dashboard.id,
        tenant_id=dashboard.tenant_id,
        user_id=None,
        access_type="tv",
        ip_address=ip_address,
        db=db,
    )
    await db.commit()

    return DashboardRead.model_validate(dashboard)


@router.get(
    "/dashboards/sse/{widget_type}",
    dependencies=[require_permission("dashboard.read")],
)
async def sse_widget_stream(
    widget_type: str,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """SSE stream for real-time widget updates.

    The client connects and receives periodic data pushes.
    Widget types: 'pax_count', 'alerts', 'fleet_position', etc.
    """
    tenant_id = await _get_tenant_id(entity_id, db)

    async def event_generator():
        """Stream dashboard widget updates via SSE.

        Pushes real widget data every 30 seconds (or widget-specific interval).
        Heartbeat events keep the connection alive between data pushes.
        """
        import json as _json
        from app.services.modules.dashboard_service import get_widget_data
        from app.core.database import async_session_factory as _session_factory

        # Widget refresh intervals (seconds)
        _INTERVALS = {
            'pax_count': 30, 'pax_on_site': 30,
            'alerts': 60, 'alerts_urgent': 60,
            'fleet_position': 15, 'fleet_map': 15,
            'pickup_progress': 30,
            'trips_today': 60,
        }
        interval = _INTERVALS.get(widget_type, 30)

        try:
            while True:
                # Fetch real widget data with a fresh DB session
                try:
                    async with _session_factory() as sse_db:
                        result = await get_widget_data(
                            widget_id=widget_type,
                            widget_config={"type": widget_type, "source": widget_type},
                            tenant_id=tenant_id,
                            entity_id=entity_id,
                            user=current_user,
                            db=sse_db,
                        )
                    payload = _json.dumps({
                        "widget_id": result.widget_id,
                        "widget_type": result.widget_type,
                        "data": result.data,
                        "row_count": result.row_count,
                        "error": result.error,
                    }, default=str, ensure_ascii=False)
                    yield f"event: widget_data\ndata: {payload}\n\n"
                except Exception as exc:
                    logger.debug("SSE widget %s data error: %s", widget_type, exc)
                    yield f"event: error\ndata: {{\"error\": \"{str(exc)[:200]}\"}}\n\n"

                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            logger.debug("SSE stream cancelled for widget %s", widget_type)
            return

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/dashboards/{dashboard_id}",
    response_model=DashboardRead,
    dependencies=[require_permission("dashboard.read")],
)
async def get_dashboard(
    dashboard_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get a single dashboard by ID."""
    tenant_id = await _get_tenant_id(entity_id, db)
    dashboard = await svc_get_dashboard(dashboard_id, tenant_id, db)

    # Log access
    ip_address = request.client.host if request.client else None
    await log_dashboard_access(
        dashboard_id=dashboard.id,
        tenant_id=tenant_id,
        user_id=current_user.id,
        access_type="view",
        ip_address=ip_address,
        db=db,
    )
    await db.commit()

    return dashboard


@router.put(
    "/dashboards/{dashboard_id}",
    response_model=DashboardRead,
    dependencies=[require_permission("dashboard.admin")],
)
async def update_dashboard(
    dashboard_id: UUID,
    body: DashboardUpdate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Update an existing dashboard."""
    tenant_id = await _get_tenant_id(entity_id, db)
    dashboard = await svc_update_dashboard(dashboard_id, body, tenant_id, db)
    return dashboard


@router.delete(
    "/dashboards/{dashboard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("dashboard.admin")],
)
async def delete_dashboard(
    dashboard_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Delete a dashboard."""
    tenant_id = await _get_tenant_id(entity_id, db)
    await svc_delete_dashboard(dashboard_id, tenant_id, db)


@router.post(
    "/dashboards/{dashboard_id}/export",
    response_model=DashboardExport,
    dependencies=[require_permission("dashboard.read")],
)
async def export_dashboard(
    dashboard_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Export a dashboard as JSON."""
    tenant_id = await _get_tenant_id(entity_id, db)
    return await export_dashboard_json(dashboard_id, tenant_id, db)


@router.post(
    "/dashboards/{dashboard_id}/tv-link",
    response_model=TVLinkRead,
    dependencies=[require_permission("dashboard.admin")],
)
async def create_tv_link(
    dashboard_id: UUID,
    body: TVLinkCreate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Generate a TV access link for a dashboard."""
    tenant_id = await _get_tenant_id(entity_id, db)
    result = await generate_tv_link(
        dashboard_id=dashboard_id,
        tenant_id=tenant_id,
        expires_hours=body.expires_hours,
        refresh_seconds=body.refresh_seconds,
        db=db,
    )
    return TVLinkRead(**result)


@router.delete(
    "/dashboards/{dashboard_id}/tv-link",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[require_permission("dashboard.admin")],
)
async def delete_tv_link(
    dashboard_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Revoke a dashboard's TV access token."""
    tenant_id = await _get_tenant_id(entity_id, db)
    await revoke_tv_link(dashboard_id, tenant_id, db)


# ═══════════════════════════════════════════════════════════════════════════
#  TABS — combined view (mandatory + personal)
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/dashboard/tabs",
    response_model=list[DashboardTabRead],
    dependencies=[require_permission("dashboard.read")],
)
async def list_tabs(
    module: str | None = None,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Get all dashboard tabs for the current user.

    Returns mandatory tabs matching the user's role(s) merged with
    the user's personal tabs, all sorted by tab_order.

    Optional ``module`` query parameter filters by target_module slug
    (e.g. "planner", "paxlog", "travelwiz"). If omitted returns global
    (target_module IS NULL) tabs only for backward compatibility.
    """
    module = _normalize_module_slug(module)
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

    # Module filter
    if module:
        mandatory_stmt = mandatory_stmt.where(DashboardTab.target_module == module)
    else:
        mandatory_stmt = mandatory_stmt.where(DashboardTab.target_module.is_(None))

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
                target_module=tab.target_module,
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
                target_module=module,
                created_at=tab.created_at,
                updated_at=tab.updated_at,
            )
        )

    return combined


@router.get(
    "/dashboard/module/{module_slug}/tabs",
    response_model=list[DashboardTabRead],
    dependencies=[require_permission("dashboard.read")],
)
async def list_module_tabs(
    module_slug: str,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Convenience endpoint: get dashboard tabs scoped to a specific module.

    Each module page calls this on mount to render its configurable dashboard.
    The admin defines module-specific tabs via POST /admin/tabs with target_module.
    """
    module_slug = _normalize_module_slug(module_slug) or module_slug
    user_roles = await _get_user_role_codes(current_user.id, entity_id, db)

    stmt = (
        select(DashboardTab)
        .where(
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
            DashboardTab.target_module == module_slug,
        )
    )
    if user_roles:
        stmt = stmt.where(
            or_(
                DashboardTab.target_role.is_(None),
                DashboardTab.target_role.in_(user_roles),
            )
        )
    else:
        stmt = stmt.where(DashboardTab.target_role.is_(None))

    stmt = stmt.order_by(DashboardTab.tab_order)
    result = await db.execute(stmt)
    tabs = result.scalars().all()

    return [
        DashboardTabRead(
            id=tab.id,
            name=tab.name,
            tab_order=tab.tab_order,
            widgets=tab.widgets or [],
            is_mandatory=True,
            is_closable=False,
            target_role=tab.target_role,
            target_module=tab.target_module,
            created_at=tab.created_at,
            updated_at=tab.updated_at,
        )
        for tab in tabs
    ]


# ═══════════════════════════════════════════════════════════════════════════
#  PERSONAL TABS — CRUD
# ═══════════════════════════════════════════════════════════════════════════

@router.post(
    "/dashboard/tabs",
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
    "/dashboard/tabs/{tab_id}",
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

    # Fallback: if not a personal tab, try mandatory tabs (admin edit)
    is_mandatory = False
    if not tab:
        mandatory_result = await db.execute(
            select(DashboardTab).where(
                DashboardTab.id == tab_id,
                DashboardTab.entity_id == entity_id,
                DashboardTab.is_active == True,
            )
        )
        tab = mandatory_result.scalar_one_or_none()
        is_mandatory = tab is not None

    if not tab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tab not found",
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
        if hasattr(tab, field):
            setattr(tab, field, value)

    await db.commit()
    await db.refresh(tab)

    if is_mandatory:
        return PersonalTabRead(
            id=tab.id,
            user_id=None,
            entity_id=tab.entity_id,
            name=tab.name,
            tab_order=tab.tab_order,
            widgets=tab.widgets or [],
            created_at=tab.created_at.isoformat() if tab.created_at else None,
        )

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
    "/dashboard/tabs/{tab_id}",
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

    # Hard delete personal tabs (they have no archived/active flags)
    await db.delete(tab)
    await db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  ADMIN — mandatory tabs management
# ═══════════════════════════════════════════════════════════════════════════

@router.get(
    "/dashboard/admin/tabs",
    response_model=list[AdminTabRead],
    dependencies=[require_permission("dashboard.admin")],
)
async def list_admin_tabs(
    module: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """List all mandatory tabs for the current entity (admin only).

    Optional ``module`` filter: "planner", "paxlog", etc.
    Pass "global" to get tabs with target_module IS NULL.
    """
    module = _normalize_module_slug(module)
    stmt = (
        select(DashboardTab)
        .where(
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_active == True,
        )
    )
    if module == "global":
        stmt = stmt.where(DashboardTab.target_module.is_(None))
    elif module:
        stmt = stmt.where(DashboardTab.target_module == module)
    # If module is None -> return all tabs (no filter)

    result = await db.execute(stmt.order_by(DashboardTab.tab_order))
    return result.scalars().all()


@router.post(
    "/dashboard/admin/tabs",
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
    target_module = _normalize_module_slug(body.target_module)
    tab = DashboardTab(
        entity_id=entity_id,
        name=body.name,
        is_mandatory=body.is_mandatory,
        target_role=body.target_role,
        target_module=target_module,
        tab_order=body.tab_order,
        widgets=[w.model_dump() for w in body.widgets],
        created_by=current_user.id,
    )
    db.add(tab)
    await db.commit()
    await db.refresh(tab)
    return tab


@router.put(
    "/dashboard/admin/tabs/{tab_id}",
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
    if "target_module" in update_data:
        update_data["target_module"] = _normalize_module_slug(update_data["target_module"])

    if "widgets" in update_data and update_data["widgets"] is not None:
        update_data["widgets"] = [w.model_dump() for w in body.widgets]

    for field, value in update_data.items():
        setattr(tab, field, value)

    await db.commit()
    await db.refresh(tab)
    return tab


@router.delete(
    "/dashboard/admin/tabs/{tab_id}",
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
    "/dashboard/widgets/stats",
    response_model=DashboardStats,
    dependencies=[require_permission("dashboard.read")],
)
async def get_widget_stats(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Global stats: total assets, tiers, users, active workflows, recent activity."""
    # Total installations (non-deleted, in entity)
    assets_count = await db.execute(
        select(func.count(Installation.id)).where(
            Installation.entity_id == entity_id,
            Installation.archived == False,
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
    "/dashboard/widgets/activity",
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
    "/dashboard/widgets/pending",
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


# ═══════════════════════════════════════════════════════════════════════════
#  GRIDSTACK LAYOUT PERSISTENCE
# ═══════════════════════════════════════════════════════════════════════════

@router.patch(
    "/dashboards/{dashboard_id}/layout",
    dependencies=[require_permission("dashboard.customize")],
    summary="Persist widget layout for a specific breakpoint",
)
async def update_dashboard_layout(
    dashboard_id: UUID,
    body: dict,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Persist the GridStack widget layout for a responsive breakpoint.

    Body should contain:
      - ``breakpoint``: one of ``"desktop"``, ``"tablet"``, ``"mobile"``
        (defaults to ``"desktop"``).
      - ``layout``: list of widget position objects, each with
        ``{id, x, y, w, h}`` (and optionally ``minW``, ``minH``).

    The corresponding ``layout_<breakpoint>`` JSONB column on the
    Dashboard model is updated.
    """
    VALID_BREAKPOINTS = {"desktop", "tablet", "mobile"}

    breakpoint_name = body.get("breakpoint", "desktop")
    layout = body.get("layout", [])

    if breakpoint_name not in VALID_BREAKPOINTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid breakpoint '{breakpoint_name}'. Must be one of: {', '.join(sorted(VALID_BREAKPOINTS))}",
        )

    if not isinstance(layout, list):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="layout must be an array of widget positions",
        )

    # Resolve the column name: layout_desktop, layout_tablet, layout_mobile
    field = f"layout_{breakpoint_name}"

    tenant_id = await _get_tenant_id(entity_id, db)

    # Verify dashboard exists and belongs to the tenant
    result = await db.execute(
        select(Dashboard).where(
            Dashboard.id == dashboard_id,
            Dashboard.tenant_id == tenant_id,
        )
    )
    dashboard = result.scalar_one_or_none()
    if not dashboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard not found",
        )

    # Update the layout field
    setattr(dashboard, field, layout)

    await db.commit()
    await db.refresh(dashboard)

    return {
        "status": "saved",
        "dashboard_id": str(dashboard_id),
        "breakpoint": breakpoint_name,
        "widgets": len(layout),
    }


# ── Seed mandatory tabs ──────────────────────────────────────────────────

@router.post(
    "/dashboard/seed-tabs",
    status_code=201,
    dependencies=[require_permission("dashboard.admin")],
)
async def seed_mandatory_dashboard_tabs(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Seed default mandatory dashboard tabs for the current entity.

    Idempotent — only creates tabs that don't already exist.
    """
    from app.services.core.seed_service import seed_dashboard_tabs

    await seed_dashboard_tabs(db, entity_id)
    await db.commit()

    # Count how many mandatory tabs exist now
    result = await db.execute(
        select(func.count(DashboardTab.id)).where(
            DashboardTab.entity_id == entity_id,
            DashboardTab.is_mandatory == True,  # noqa: E712
            DashboardTab.is_active == True,  # noqa: E712
        )
    )
    total = result.scalar() or 0
    return {"seeded": True, "mandatory_tab_count": total}
