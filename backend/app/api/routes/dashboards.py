"""
API endpoints for dashboard management.
Handles dashboard CRUD operations, widget management, and user preferences.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select, or_

from app.api.deps import CurrentUser, SessionDep
from app.models_dashboard import (
    Dashboard,
    DashboardCreate,
    DashboardPublic,
    DashboardsPublic,
    DashboardUpdate,
    DashboardWithWidgets,
    DashboardWidget,
    DashboardWidgetCreate,
    DashboardWidgetPublic,
    DashboardWidgetUpdate,
    DashboardLayoutUpdate,
    UserDashboard,
    UserDashboardCreate,
    UserDashboardUpdate,
    UserDashboardPublic,
    UserDashboardsResponse,
    Widget,
)

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


@router.get("/", response_model=UserDashboardsResponse)
def read_dashboards(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve all dashboards accessible by the current user.
    Returns dashboards grouped by type: my_dashboards, mandatory_dashboards, shared_dashboards.
    """
    # 1. Dashboards créés par l'utilisateur
    my_dashboards_stmt = (
        select(Dashboard)
        .where(
            Dashboard.deleted_at.is_(None),
            Dashboard.created_by_id == current_user.id
        )
        .order_by(Dashboard.order, Dashboard.created_at.desc())
    )
    my_dashboards = session.exec(my_dashboards_stmt).all()

    # 2. Dashboards obligatoires
    # - Global
    # - Pour les groupes de l'utilisateur
    # - Pour les rôles de l'utilisateur
    # - Pour l'utilisateur spécifiquement

    # Get user's group and role IDs
    user_group_ids = [str(g.id) for g in current_user.groups] if hasattr(current_user, 'groups') else []
    user_role_ids = [str(r.id) for r in current_user.roles] if hasattr(current_user, 'roles') else []

    mandatory_dashboards_stmt = select(Dashboard).where(
        Dashboard.deleted_at.is_(None),
        Dashboard.is_mandatory == True,
        Dashboard.is_active == True,
        or_(
            Dashboard.scope == "global",
            (Dashboard.scope == "group") & (Dashboard.scope_id.in_(user_group_ids) if user_group_ids else False),
            (Dashboard.scope == "role") & (Dashboard.scope_id.in_(user_role_ids) if user_role_ids else False),
            (Dashboard.scope == "user") & (Dashboard.scope_id == current_user.id),
        )
    ).order_by(Dashboard.order, Dashboard.created_at.desc())

    mandatory_dashboards = session.exec(mandatory_dashboards_stmt).all()

    # 3. Dashboards publics partagés (non créés par l'utilisateur)
    shared_dashboards_stmt = (
        select(Dashboard)
        .where(
            Dashboard.deleted_at.is_(None),
            Dashboard.is_public == True,
            Dashboard.is_active == True,
            Dashboard.created_by_id != current_user.id
        )
        .order_by(Dashboard.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    shared_dashboards = session.exec(shared_dashboards_stmt).all()

    total_count = len(my_dashboards) + len(mandatory_dashboards) + len(shared_dashboards)

    return UserDashboardsResponse(
        my_dashboards=my_dashboards,
        mandatory_dashboards=mandatory_dashboards,
        shared_dashboards=shared_dashboards,
        total_count=total_count
    )


@router.post("/", response_model=DashboardPublic)
def create_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_in: DashboardCreate
) -> Any:
    """
    Create a new dashboard.
    """
    # Create dashboard
    dashboard = Dashboard.model_validate(dashboard_in, update={"created_by_id": current_user.id})
    session.add(dashboard)
    session.flush()  # Get the dashboard ID

    # Add widgets if provided
    if dashboard_in.widgets:
        for widget_data in dashboard_in.widgets:
            widget_id = widget_data.get("widget_id")

            # Verify widget exists
            widget = session.get(Widget, widget_id)
            if not widget:
                raise HTTPException(status_code=404, detail=f"Widget {widget_id} not found")

            dashboard_widget = DashboardWidget(
                dashboard_id=dashboard.id,
                widget_id=widget_id,
                x=widget_data.get("x", 0),
                y=widget_data.get("y", 0),
                w=widget_data.get("w", 3),
                h=widget_data.get("h", 2),
                config=widget_data.get("config", {}),
                created_by_id=current_user.id
            )
            session.add(dashboard_widget)

    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.get("/{dashboard_id}", response_model=DashboardWithWidgets)
def read_dashboard(
    dashboard_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """
    Get dashboard by ID with all its widgets.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check access rights
    # User can access if:
    # 1. They created it
    # 2. It's a mandatory dashboard for them
    # 3. It's public
    has_access = (
        dashboard.created_by_id == current_user.id or
        dashboard.is_public or
        (dashboard.is_mandatory and dashboard.scope == "global")
        # TODO: Add group/role/user scope checks
    )

    if not has_access:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Load widgets with their widget details
    widgets_stmt = (
        select(DashboardWidget)
        .where(
            DashboardWidget.dashboard_id == dashboard_id,
            DashboardWidget.deleted_at.is_(None)
        )
        .order_by(DashboardWidget.order, DashboardWidget.y, DashboardWidget.x)
    )
    dashboard_widgets = session.exec(widgets_stmt).all()

    # Manually load widget details for each dashboard_widget
    widgets_with_details = []
    for dw in dashboard_widgets:
        widget = session.get(Widget, dw.widget_id)
        widget_public = DashboardWidgetPublic(
            id=dw.id,
            dashboard_id=dw.dashboard_id,
            widget_id=dw.widget_id,
            x=dw.x,
            y=dw.y,
            w=dw.w,
            h=dw.h,
            is_visible=dw.is_visible,
            order=dw.order,
            config=dw.config,
            widget=widget
        )
        widgets_with_details.append(widget_public)

    return DashboardWithWidgets(
        id=dashboard.id,
        name=dashboard.name,
        description=dashboard.description,
        is_default=dashboard.is_default,
        is_mandatory=dashboard.is_mandatory,
        scope=dashboard.scope,
        scope_id=dashboard.scope_id,
        is_active=dashboard.is_active,
        is_public=dashboard.is_public,
        order=dashboard.order,
        layout_config=dashboard.layout_config,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
        created_by_id=dashboard.created_by_id,
        widgets=widgets_with_details
    )


@router.patch("/{dashboard_id}", response_model=DashboardPublic)
def update_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    dashboard_in: DashboardUpdate
) -> Any:
    """
    Update a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        # Only allow if user is admin (TODO: check permissions)
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Don't allow modifying mandatory dashboards unless admin
    if dashboard.is_mandatory and dashboard_in.is_mandatory is not None:
        raise HTTPException(status_code=403, detail="Cannot modify mandatory dashboard settings")

    update_dict = dashboard_in.model_dump(exclude_unset=True)
    dashboard.sqlmodel_update(update_dict)
    dashboard.updated_by_id = current_user.id

    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.put("/{dashboard_id}/layout", response_model=DashboardPublic)
def update_dashboard_layout(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    layout_update: DashboardLayoutUpdate
) -> Any:
    """
    Update only the layout (widget positions) of a dashboard.
    This is called frequently during drag & drop operations.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Update widget positions
    for widget_data in layout_update.widgets:
        widget_id = widget_data.get("id")
        dashboard_widget = session.exec(
            select(DashboardWidget).where(
                DashboardWidget.id == widget_id,
                DashboardWidget.dashboard_id == dashboard_id
            )
        ).first()

        if dashboard_widget:
            dashboard_widget.x = widget_data.get("x", dashboard_widget.x)
            dashboard_widget.y = widget_data.get("y", dashboard_widget.y)
            dashboard_widget.w = widget_data.get("w", dashboard_widget.w)
            dashboard_widget.h = widget_data.get("h", dashboard_widget.h)
            dashboard_widget.updated_by_id = current_user.id
            session.add(dashboard_widget)

    dashboard.updated_by_id = current_user.id
    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.delete("/{dashboard_id}")
def delete_dashboard(
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID
) -> Any:
    """
    Delete a dashboard (soft delete).
    Cannot delete mandatory dashboards.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Cannot delete mandatory dashboards
    if dashboard.is_mandatory:
        raise HTTPException(status_code=403, detail="Cannot delete mandatory dashboard")

    dashboard.soft_delete(deleted_by_id=current_user.id)
    session.add(dashboard)
    session.commit()
    return {"ok": True}


@router.post("/{dashboard_id}/clone", response_model=DashboardPublic)
def clone_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    name: str = Query(..., description="Name for the cloned dashboard")
) -> Any:
    """
    Clone an existing dashboard with all its widgets.
    """
    original = session.get(Dashboard, dashboard_id)
    if not original or original.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Create new dashboard
    new_dashboard = Dashboard(
        name=name,
        description=f"Clone of {original.name}",
        layout_config=original.layout_config,
        is_public=False,  # Clones are always private initially
        is_mandatory=False,  # Clones cannot be mandatory
        created_by_id=current_user.id
    )
    session.add(new_dashboard)
    session.flush()

    # Clone widgets
    widgets_stmt = select(DashboardWidget).where(
        DashboardWidget.dashboard_id == dashboard_id,
        DashboardWidget.deleted_at.is_(None)
    )
    widgets = session.exec(widgets_stmt).all()

    for widget in widgets:
        new_widget = DashboardWidget(
            dashboard_id=new_dashboard.id,
            widget_id=widget.widget_id,
            x=widget.x,
            y=widget.y,
            w=widget.w,
            h=widget.h,
            config=widget.config,
            order=widget.order,
            created_by_id=current_user.id
        )
        session.add(new_widget)

    session.commit()
    session.refresh(new_dashboard)
    return new_dashboard


# ==================== WIDGET MANAGEMENT IN DASHBOARD ====================

@router.post("/{dashboard_id}/widgets", response_model=DashboardWidgetPublic)
def add_widget_to_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    widget_in: DashboardWidgetCreate
) -> Any:
    """
    Add a widget to a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Verify widget exists
    widget = session.get(Widget, widget_in.widget_id)
    if not widget or widget.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Widget not found")

    # Check if widget already in dashboard
    existing = session.exec(
        select(DashboardWidget).where(
            DashboardWidget.dashboard_id == dashboard_id,
            DashboardWidget.widget_id == widget_in.widget_id,
            DashboardWidget.deleted_at.is_(None)
        )
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Widget already in dashboard")

    # Create dashboard_widget
    dashboard_widget = DashboardWidget(
        dashboard_id=dashboard_id,
        widget_id=widget_in.widget_id,
        x=widget_in.x,
        y=widget_in.y,
        w=widget_in.w,
        h=widget_in.h,
        config=widget_in.config,
        order=widget_in.order,
        created_by_id=current_user.id
    )
    session.add(dashboard_widget)
    session.commit()
    session.refresh(dashboard_widget)
    return dashboard_widget


@router.delete("/{dashboard_id}/widgets/{widget_id}")
def remove_widget_from_dashboard(
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    widget_id: uuid.UUID
) -> Any:
    """
    Remove a widget from a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Find dashboard_widget association
    dashboard_widget = session.exec(
        select(DashboardWidget).where(
            DashboardWidget.dashboard_id == dashboard_id,
            DashboardWidget.widget_id == widget_id,
            DashboardWidget.deleted_at.is_(None)
        )
    ).first()

    if not dashboard_widget:
        raise HTTPException(status_code=404, detail="Widget not in dashboard")

    dashboard_widget.soft_delete(deleted_by_id=current_user.id)
    session.add(dashboard_widget)
    session.commit()
    return {"ok": True}


@router.patch("/{dashboard_id}/widgets/{widget_id}/config", response_model=DashboardWidgetPublic)
def update_widget_config(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: uuid.UUID,
    widget_id: int,
    config_update: dict
) -> Any:
    """
    Update the configuration of a widget instance in a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # Check permissions
    if dashboard.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    # Find dashboard_widget association by id
    dashboard_widget = session.exec(
        select(DashboardWidget).where(
            DashboardWidget.id == widget_id,
            DashboardWidget.dashboard_id == dashboard_id,
            DashboardWidget.deleted_at.is_(None)
        )
    ).first()

    if not dashboard_widget:
        raise HTTPException(status_code=404, detail="Widget not in dashboard")

    # Update config - merge with existing config
    new_config = config_update.get("config", {})
    dashboard_widget.config = {**dashboard_widget.config, **new_config}
    dashboard_widget.updated_by_id = current_user.id

    session.add(dashboard_widget)
    session.commit()
    session.refresh(dashboard_widget)
    return dashboard_widget
