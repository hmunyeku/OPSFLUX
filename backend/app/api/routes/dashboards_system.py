"""
OpsFlux Dashboard System Routes
Routes API pour la gestion complète des dashboards
"""

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_dashboards import (
    Dashboard,
    DashboardFavorite,
    DashboardShare,
    DashboardView,
    MenuParentEnum,
    DashboardSystemWidget,
    WidgetTemplate,
)
from app.schemas_dashboards import (
    DashboardClone,
    DashboardCreate,
    DashboardMenuItem,
    DashboardPublic,
    DashboardsPublic,
    DashboardShareCreate,
    DashboardSharePublic,
    DashboardSharesPublic,
    DashboardShareUpdate,
    DashboardStats,
    DashboardUpdate,
    DashboardViewCreate,
    DashboardWithWidgets,
    MenuInfo,
    MenuWithDashboards,
    NavigationStructure,
    WidgetCreate,
    WidgetPublic,
    WidgetsPublic,
    WidgetTemplateCreate,
    WidgetTemplatePublic,
    WidgetTemplatesPublic,
    WidgetTemplateUpdate,
    WidgetUpdate,
)

router = APIRouter(prefix="/dashboards-system", tags=["Dashboard System"])


# ============================================================================
# OPSFLUX MENUS CONFIGURATION
# ============================================================================

OPSFLUX_MENUS = [
    MenuInfo(id="pilotage", label="Pilotage", icon="Target", description="Tableaux de bord et indicateurs de pilotage"),
    MenuInfo(id="tiers", label="Tiers", icon="Building2", description="Gestion des clients, fournisseurs et partenaires"),
    MenuInfo(id="projects", label="Projects", icon="FolderKanban", description="Gestion de projets et suivi"),
    MenuInfo(id="organizer", label="Organizer", icon="CalendarDays", description="Planification et organisation"),
    MenuInfo(id="redacteur", label="Rédacteur", icon="FilePen", description="Rédaction et gestion documentaire"),
    MenuInfo(id="pobvue", label="POBVue", icon="UserCheck", description="Point Of Business - Gestion opérationnelle"),
    MenuInfo(id="travelwiz", label="TravelWiz", icon="Plane", description="Gestion des déplacements et missions"),
    MenuInfo(id="mocvue", label="MOCVue", icon="FileCheck", description="Management Of Change"),
    MenuInfo(id="cleanvue", label="CleanVue", icon="Sparkles", description="Nettoyage et maintenance"),
    MenuInfo(id="powertrace", label="PowerTrace", icon="Zap", description="Traçabilité énergétique et consommation"),
]


# ============================================================================
# DASHBOARD CRUD
# ============================================================================

@router.get("/", response_model=DashboardsPublic)
def read_dashboards(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    menu_parent: MenuParentEnum | None = None,
    is_archived: bool = False,
    is_template: bool | None = None,
) -> Any:
    """
    Retrieve dashboards with pagination and optional filtering.
    """
    count_statement = select(func.count()).select_from(Dashboard).where(
        Dashboard.deleted_at.is_(None),
        Dashboard.is_archived == is_archived
    )
    if menu_parent:
        count_statement = count_statement.where(Dashboard.menu_parent == menu_parent)
    if is_template is not None:
        count_statement = count_statement.where(Dashboard.is_template == is_template)

    count = session.exec(count_statement).one()

    statement = select(Dashboard).where(
        Dashboard.deleted_at.is_(None),
        Dashboard.is_archived == is_archived
    )
    if menu_parent:
        statement = statement.where(Dashboard.menu_parent == menu_parent)
    if is_template is not None:
        statement = statement.where(Dashboard.is_template == is_template)

    statement = statement.offset(skip).limit(limit).order_by(Dashboard.menu_order.asc(), Dashboard.created_at.desc())
    dashboards = session.exec(statement).all()

    return DashboardsPublic(data=dashboards, count=count)


@router.get("/{dashboard_id}", response_model=DashboardWithWidgets)
def read_dashboard(
    dashboard_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
    include_widgets: bool = True,
) -> Any:
    """
    Get a specific dashboard by ID with optional widgets.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # TODO: Check permissions

    if include_widgets:
        # Load widgets
        widgets_statement = select(DashboardSystemWidget).where(
            DashboardSystemWidget.dashboard_id == dashboard_id,
            DashboardSystemWidget.deleted_at.is_(None)
        ).order_by(DashboardSystemWidget.order.asc())
        widgets = session.exec(widgets_statement).all()

        return DashboardWithWidgets(**dashboard.model_dump(), widgets=widgets)

    return DashboardWithWidgets(**dashboard.model_dump(), widgets=[])


@router.post("/", response_model=DashboardPublic)
def create_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_in: DashboardCreate,
) -> Any:
    """
    Create new dashboard.
    """
    # Check if another dashboard is already set as homepage
    if dashboard_in.is_home_page:
        existing_home = session.exec(
            select(Dashboard).where(
                Dashboard.is_home_page == True,
                Dashboard.author_id == current_user.id,
                Dashboard.deleted_at.is_(None)
            )
        ).first()
        if existing_home:
            existing_home.is_home_page = False
            session.add(existing_home)

    dashboard = Dashboard(
        **dashboard_in.model_dump(),
        author_id=current_user.id,
        created_by=str(current_user.id)
    )
    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.patch("/{dashboard_id}", response_model=DashboardPublic)
def update_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: UUID,
    dashboard_in: DashboardUpdate,
) -> Any:
    """
    Update a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # TODO: Check permissions (can_edit)

    # Handle homepage toggle
    if dashboard_in.is_home_page and dashboard_in.is_home_page != dashboard.is_home_page:
        existing_home = session.exec(
            select(Dashboard).where(
                Dashboard.is_home_page == True,
                Dashboard.author_id == current_user.id,
                Dashboard.id != dashboard_id,
                Dashboard.deleted_at.is_(None)
            )
        ).first()
        if existing_home:
            existing_home.is_home_page = False
            session.add(existing_home)

    dashboard_data = dashboard_in.model_dump(exclude_unset=True)
    dashboard.sqlmodel_update(dashboard_data)
    session.add(dashboard)
    session.commit()
    session.refresh(dashboard)
    return dashboard


@router.delete("/{dashboard_id}")
def delete_dashboard(
    dashboard_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Soft delete a dashboard.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    # TODO: Check permissions (can_delete)

    dashboard.deleted_at = datetime.now(timezone.utc)
    session.add(dashboard)
    session.commit()
    return Message(message="Dashboard deleted successfully")


# ============================================================================
# WIDGET CRUD
# ============================================================================

@router.get("/{dashboard_id}/widgets", response_model=WidgetsPublic)
def read_dashboard_widgets(
    dashboard_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get all widgets for a dashboard.
    """
    count_statement = select(func.count()).select_from(DashboardSystemWidget).where(
        DashboardSystemWidget.dashboard_id == dashboard_id,
        DashboardSystemWidget.deleted_at.is_(None)
    )
    count = session.exec(count_statement).one()

    statement = select(DashboardSystemWidget).where(
        DashboardSystemWidget.dashboard_id == dashboard_id,
        DashboardSystemWidget.deleted_at.is_(None)
    ).order_by(DashboardSystemWidget.order.asc())
    widgets = session.exec(statement).all()

    return WidgetsPublic(data=widgets, count=count)


@router.post("/widgets", response_model=WidgetPublic)
def create_widget(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    widget_in: WidgetCreate,
) -> Any:
    """
    Create new widget.
    """
    # Verify dashboard exists
    dashboard = session.get(Dashboard, widget_in.dashboard_id)
    if not dashboard or dashboard.deleted_at:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    widget = DashboardSystemWidget(**widget_in.model_dump(), created_by=str(current_user.id))
    session.add(widget)
    session.commit()
    session.refresh(widget)
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetPublic)
def update_widget(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    widget_id: UUID,
    widget_in: WidgetUpdate,
) -> Any:
    """
    Update a widget.
    """
    widget = session.get(DashboardSystemWidget, widget_id)
    if not widget or widget.deleted_at:
        raise HTTPException(status_code=404, detail="DashboardSystemWidget not found")

    widget_data = widget_in.model_dump(exclude_unset=True)
    widget.sqlmodel_update(widget_data)
    session.add(widget)
    session.commit()
    session.refresh(widget)
    return widget


@router.delete("/widgets/{widget_id}")
def delete_widget(
    widget_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Soft delete a widget.
    """
    widget = session.get(DashboardSystemWidget, widget_id)
    if not widget or widget.deleted_at:
        raise HTTPException(status_code=404, detail="DashboardSystemWidget not found")

    widget.deleted_at = datetime.now(timezone.utc)
    session.add(widget)
    session.commit()
    return Message(message="DashboardSystemWidget deleted successfully")


# ============================================================================
# WIDGET TEMPLATES
# ============================================================================

@router.get("/widget-templates", response_model=WidgetTemplatesPublic)
def read_widget_templates(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, le=1000),
    category: str | None = None,
) -> Any:
    """
    Get widget templates.
    """
    count_statement = select(func.count()).select_from(WidgetTemplate).where(
        WidgetTemplate.deleted_at.is_(None)
    )
    if category:
        count_statement = count_statement.where(WidgetTemplate.category == category)

    count = session.exec(count_statement).one()

    statement = select(WidgetTemplate).where(WidgetTemplate.deleted_at.is_(None))
    if category:
        statement = statement.where(WidgetTemplate.category == category)

    statement = statement.offset(skip).limit(limit).order_by(WidgetTemplate.created_at.desc())
    templates = session.exec(statement).all()

    return WidgetTemplatesPublic(data=templates, count=count)


@router.post("/widget-templates", response_model=WidgetTemplatePublic)
def create_widget_template(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    template_in: WidgetTemplateCreate,
) -> Any:
    """
    Create new widget template.
    """
    template = WidgetTemplate(**template_in.model_dump(), author_id=current_user.id, created_by=str(current_user.id))
    session.add(template)
    session.commit()
    session.refresh(template)
    return template


# ============================================================================
# NAVIGATION & MENUS
# ============================================================================

@router.get("/navigation/structure", response_model=NavigationStructure)
def get_navigation_structure(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get complete navigation structure with menus and dashboards.
    """
    menus_with_dashboards = []

    for menu in OPSFLUX_MENUS:
        # Get dashboards for this menu
        dashboards_statement = select(Dashboard).where(
            Dashboard.menu_parent == menu.id,
            Dashboard.show_in_sidebar == True,
            Dashboard.deleted_at.is_(None),
            Dashboard.is_archived == False
        ).order_by(Dashboard.menu_order.asc())

        dashboards = session.exec(dashboards_statement).all()

        dashboard_items = [
            DashboardMenuItem(
                id=d.id,
                label=d.menu_label,
                icon=d.menu_icon,
                order=d.menu_order,
                is_home_page=d.is_home_page
            )
            for d in dashboards
        ]

        menus_with_dashboards.append(
            MenuWithDashboards(**menu.model_dump(), dashboards=dashboard_items)
        )

    return NavigationStructure(menus=menus_with_dashboards)


@router.get("/navigation/menus/{menu_id}", response_model=MenuWithDashboards)
def get_menu_dashboards(
    menu_id: str,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get dashboards for a specific menu.
    """
    # Find menu info
    menu_info = next((m for m in OPSFLUX_MENUS if m.id == menu_id), None)
    if not menu_info:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Get dashboards
    dashboards_statement = select(Dashboard).where(
        Dashboard.menu_parent == menu_id,
        Dashboard.show_in_sidebar == True,
        Dashboard.deleted_at.is_(None),
        Dashboard.is_archived == False
    ).order_by(Dashboard.menu_order.asc())

    dashboards = session.exec(dashboards_statement).all()

    dashboard_items = [
        DashboardMenuItem(
            id=d.id,
            label=d.menu_label,
            icon=d.menu_icon,
            order=d.menu_order,
            is_home_page=d.is_home_page
        )
        for d in dashboards
    ]

    return MenuWithDashboards(**menu_info.model_dump(), dashboards=dashboard_items)


# ============================================================================
# DASHBOARD SHARING
# ============================================================================

@router.post("/{dashboard_id}/share", response_model=DashboardSharePublic)
def share_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: UUID,
    share_in: DashboardShareCreate,
) -> Any:
    """
    Share a dashboard with user/role/organization.
    """
    dashboard = session.get(Dashboard, dashboard_id)
    if not dashboard or dashboard.deleted_at:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    share = DashboardShare(
        **share_in.model_dump(),
        shared_by_user_id=current_user.id,
        created_by=str(current_user.id)
    )
    session.add(share)
    session.commit()
    session.refresh(share)
    return share


@router.get("/{dashboard_id}/shares", response_model=DashboardSharesPublic)
def get_dashboard_shares(
    dashboard_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get all shares for a dashboard.
    """
    count_statement = select(func.count()).select_from(DashboardShare).where(
        DashboardShare.dashboard_id == dashboard_id,
        DashboardShare.deleted_at.is_(None)
    )
    count = session.exec(count_statement).one()

    statement = select(DashboardShare).where(
        DashboardShare.dashboard_id == dashboard_id,
        DashboardShare.deleted_at.is_(None)
    ).order_by(DashboardShare.created_at.desc())
    shares = session.exec(statement).all()

    return DashboardSharesPublic(data=shares, count=count)


# ============================================================================
# DASHBOARD ANALYTICS
# ============================================================================

@router.post("/{dashboard_id}/view")
def record_dashboard_view(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: UUID,
    view_in: DashboardViewCreate,
) -> Message:
    """
    Record a dashboard view for analytics.
    """
    view = DashboardView(
        **view_in.model_dump(),
        user_id=current_user.id,
        viewed_at=datetime.now(timezone.utc),
        created_by=str(current_user.id)
    )
    session.add(view)
    session.commit()
    return Message(message="View recorded")


@router.get("/{dashboard_id}/stats", response_model=DashboardStats)
def get_dashboard_stats(
    dashboard_id: UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get analytics stats for a dashboard.
    """
    # Total views
    total_views = session.exec(
        select(func.count()).select_from(DashboardView).where(
            DashboardView.dashboard_id == dashboard_id
        )
    ).one()

    # Unique viewers
    unique_viewers = session.exec(
        select(func.count(func.distinct(DashboardView.user_id))).select_from(DashboardView).where(
            DashboardView.dashboard_id == dashboard_id
        )
    ).one()

    # Average duration
    avg_duration = session.exec(
        select(func.avg(DashboardView.duration_seconds)).where(
            DashboardView.dashboard_id == dashboard_id,
            DashboardView.duration_seconds.is_not(None)
        )
    ).one() or 0.0

    # Last viewed
    last_view = session.exec(
        select(DashboardView).where(
            DashboardView.dashboard_id == dashboard_id
        ).order_by(DashboardView.viewed_at.desc()).limit(1)
    ).first()

    # Favorite count
    favorite_count = session.exec(
        select(func.count()).select_from(DashboardFavorite).where(
            DashboardFavorite.dashboard_id == dashboard_id
        )
    ).one()

    return DashboardStats(
        total_views=total_views,
        unique_viewers=unique_viewers,
        avg_duration_seconds=avg_duration,
        last_viewed_at=last_view.viewed_at if last_view else None,
        favorite_count=favorite_count
    )


# ============================================================================
# DASHBOARD CLONE
# ============================================================================

@router.post("/clone", response_model=DashboardPublic)
def clone_dashboard(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    clone_in: DashboardClone,
) -> Any:
    """
    Clone an existing dashboard with optional widgets.
    """
    source = session.get(Dashboard, clone_in.source_dashboard_id)
    if not source or source.deleted_at:
        raise HTTPException(status_code=404, detail="Source dashboard not found")

    # Create new dashboard
    new_dashboard_data = source.model_dump(exclude={"id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by"})
    new_dashboard_data["name"] = clone_in.new_name
    if clone_in.menu_parent:
        new_dashboard_data["menu_parent"] = clone_in.menu_parent
    new_dashboard_data["is_home_page"] = False  # Never clone as homepage

    new_dashboard = Dashboard(**new_dashboard_data, author_id=current_user.id, created_by=str(current_user.id))
    session.add(new_dashboard)
    session.flush()

    # Clone widgets if requested
    if clone_in.copy_widgets:
        widgets_statement = select(DashboardSystemWidget).where(
            DashboardSystemWidget.dashboard_id == source.id,
            DashboardSystemWidget.deleted_at.is_(None)
        )
        source_widgets = session.exec(widgets_statement).all()

        for widget in source_widgets:
            widget_data = widget.model_dump(exclude={"id", "dashboard_id", "created_at", "updated_at", "deleted_at", "created_by", "updated_by"})
            new_widget = DashboardSystemWidget(**widget_data, dashboard_id=new_dashboard.id, created_by=str(current_user.id))
            session.add(new_widget)

    session.commit()
    session.refresh(new_dashboard)
    return new_dashboard


# ============================================================================
# FAVORITES
# ============================================================================

@router.post("/{dashboard_id}/favorite")
def add_to_favorites(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: UUID,
) -> Message:
    """
    Add dashboard to user's favorites.
    """
    # Check if already favorited
    existing = session.exec(
        select(DashboardFavorite).where(
            DashboardFavorite.dashboard_id == dashboard_id,
            DashboardFavorite.user_id == current_user.id
        )
    ).first()

    if existing:
        return Message(message="Dashboard already in favorites")

    favorite = DashboardFavorite(
        dashboard_id=dashboard_id,
        user_id=current_user.id,
        created_by=str(current_user.id)
    )
    session.add(favorite)
    session.commit()
    return Message(message="Dashboard added to favorites")


@router.delete("/{dashboard_id}/favorite")
def remove_from_favorites(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    dashboard_id: UUID,
) -> Message:
    """
    Remove dashboard from user's favorites.
    """
    favorite = session.exec(
        select(DashboardFavorite).where(
            DashboardFavorite.dashboard_id == dashboard_id,
            DashboardFavorite.user_id == current_user.id
        )
    ).first()

    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")

    session.delete(favorite)
    session.commit()
    return Message(message="Dashboard removed from favorites")


@router.get("/favorites", response_model=DashboardsPublic)
def get_user_favorites(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get user's favorite dashboards.
    """
    favorites_statement = select(Dashboard).join(
        DashboardFavorite,
        Dashboard.id == DashboardFavorite.dashboard_id
    ).where(
        DashboardFavorite.user_id == current_user.id,
        Dashboard.deleted_at.is_(None)
    ).order_by(DashboardFavorite.order.asc())

    dashboards = session.exec(favorites_statement).all()
    return DashboardsPublic(data=dashboards, count=len(dashboards))
