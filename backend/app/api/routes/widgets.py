"""
API endpoints for widget management.
Handles widget catalog and registration.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models_dashboard import (
    Widget,
    WidgetCreate,
    WidgetPublic,
    WidgetsPublic,
    WidgetUpdate,
)
from app.models_rbac import Permission, RolePermissionLink, UserRoleLink

from pydantic import BaseModel

router = APIRouter(prefix="/widgets", tags=["widgets"])


class WidgetSyncData(BaseModel):
    """Widget data for synchronization from frontend modules"""
    widget_type: str
    name: str
    description: Optional[str] = None
    module_name: str
    category: Optional[str] = None
    icon: Optional[str] = None
    required_permission: Optional[str] = None
    is_active: bool = True
    default_config: dict = {}
    default_size: dict = {"w": 3, "h": 2, "minW": 2, "minH": 1, "maxW": 12, "maxH": 6}


class WidgetSyncRequest(BaseModel):
    """Request to sync widgets from frontend modules"""
    module_code: str
    widgets: list[WidgetSyncData]


def user_has_permission(user: CurrentUser, permission_code: str, session: SessionDep) -> bool:
    """
    Vérifie si un utilisateur a une permission donnée.

    Args:
        user: L'utilisateur à vérifier
        permission_code: Code de la permission (ex: "database:execute_query")
        session: Session database

    Returns:
        True si l'utilisateur a la permission, False sinon
    """
    # Superadmin a toutes les permissions
    if user.is_superuser:
        return True

    # Requête pour vérifier la permission via les rôles de l'utilisateur
    query = (
        select(Permission)
        .join(RolePermissionLink, Permission.id == RolePermissionLink.permission_id)
        .join(UserRoleLink, RolePermissionLink.role_id == UserRoleLink.role_id)
        .where(UserRoleLink.user_id == user.id)
        .where(Permission.code == permission_code)
        .where(Permission.is_active == True)
    )

    permission = session.exec(query).first()
    return permission is not None


@router.get("/", response_model=WidgetsPublic)
def read_widgets(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = Query(None, description="Filter by category"),
    module_name: Optional[str] = Query(None, description="Filter by module"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
) -> Any:
    """
    Retrieve all available widgets.
    Filters by user permissions automatically.
    """
    # Base query
    count_statement = select(func.count()).select_from(Widget).where(
        Widget.deleted_at.is_(None)
    )
    statement = select(Widget).where(Widget.deleted_at.is_(None))

    # Apply filters
    if category:
        statement = statement.where(Widget.category == category)
        count_statement = count_statement.where(Widget.category == category)

    if module_name:
        statement = statement.where(Widget.module_name == module_name)
        count_statement = count_statement.where(Widget.module_name == module_name)

    if is_active is not None:
        statement = statement.where(Widget.is_active == is_active)
        count_statement = count_statement.where(Widget.is_active == is_active)

    # Get all widgets first
    statement = statement.order_by(Widget.category, Widget.name)
    all_widgets = session.exec(statement).all()

    # Filter widgets based on user permissions
    filtered_widgets = []
    for widget in all_widgets:
        # Si le widget n'a pas de permission requise, il est accessible à tous
        if not widget.required_permission:
            filtered_widgets.append(widget)
        # Sinon, vérifier si l'utilisateur a la permission
        elif user_has_permission(current_user, widget.required_permission, session):
            filtered_widgets.append(widget)

    # Apply pagination on filtered results
    total_count = len(filtered_widgets)
    paginated_widgets = filtered_widgets[skip:skip + limit]

    return WidgetsPublic(data=paginated_widgets, count=total_count)


@router.post("/", response_model=WidgetPublic)
def create_widget(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    widget_in: WidgetCreate
) -> Any:
    """
    Create a new widget type.
    Admin only.
    """
    # TODO: Check if user is admin or has widget.create permission

    # Check if widget_type already exists
    existing = session.exec(
        select(Widget).where(
            Widget.widget_type == widget_in.widget_type,
            Widget.deleted_at.is_(None)
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Widget type '{widget_in.widget_type}' already exists"
        )

    widget = Widget.model_validate(widget_in, update={"created_by_id": current_user.id})
    session.add(widget)
    session.commit()
    session.refresh(widget)
    return widget


@router.get("/{widget_id}", response_model=WidgetPublic)
def read_widget(
    widget_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """
    Get widget by ID.
    """
    widget = session.get(Widget, widget_id)
    if not widget or widget.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Widget not found")

    return widget


@router.get("/type/{widget_type}", response_model=WidgetPublic)
def read_widget_by_type(
    widget_type: str,
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """
    Get widget by type string.
    """
    widget = session.exec(
        select(Widget).where(
            Widget.widget_type == widget_type,
            Widget.deleted_at.is_(None)
        )
    ).first()

    if not widget:
        raise HTTPException(status_code=404, detail=f"Widget type '{widget_type}' not found")

    return widget


@router.patch("/{widget_id}", response_model=WidgetPublic)
def update_widget(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    widget_id: uuid.UUID,
    widget_in: WidgetUpdate
) -> Any:
    """
    Update a widget.
    Admin only.
    """
    # TODO: Check if user is admin or has widget.update permission

    widget = session.get(Widget, widget_id)
    if not widget or widget.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Widget not found")

    update_dict = widget_in.model_dump(exclude_unset=True)
    widget.sqlmodel_update(update_dict)
    widget.updated_by_id = current_user.id

    session.add(widget)
    session.commit()
    session.refresh(widget)
    return widget


@router.delete("/{widget_id}")
def delete_widget(
    session: SessionDep,
    current_user: CurrentUser,
    widget_id: uuid.UUID
) -> Any:
    """
    Delete a widget (soft delete).
    Admin only.
    This will not affect existing dashboards using this widget.
    """
    # TODO: Check if user is admin or has widget.delete permission

    widget = session.get(Widget, widget_id)
    if not widget or widget.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Widget not found")

    widget.soft_delete(deleted_by_id=current_user.id)
    session.add(widget)
    session.commit()
    return {"ok": True}


@router.post("/sync")
def sync_module_widgets(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    sync_request: WidgetSyncRequest
) -> Any:
    """
    Synchronize widgets from a frontend module to the database.

    This endpoint is called automatically by the ModuleLoader when a module
    is loaded in the frontend. It ensures that all widgets defined in the
    module's registry are available in the database for dashboard usage.

    Security:
    - Only authenticated users can sync widgets
    - Widget permissions are preserved and enforced
    """
    module_code = sync_request.module_code
    widgets_data = sync_request.widgets

    if not widgets_data:
        return {
            "message": "No widgets to sync",
            "created": 0,
            "updated": 0,
            "total": 0
        }

    created_count = 0
    updated_count = 0
    errors = []

    for widget_data in widgets_data:
        try:
            # Vérifier que le module_name correspond
            if widget_data.module_name != module_code:
                widget_data.module_name = module_code

            # Vérifier si le widget existe déjà
            existing = session.exec(
                select(Widget).where(
                    Widget.widget_type == widget_data.widget_type,
                    Widget.deleted_at.is_(None)
                )
            ).first()

            if existing:
                # Mettre à jour le widget existant
                existing.name = widget_data.name
                existing.description = widget_data.description
                existing.module_name = widget_data.module_name
                existing.category = widget_data.category
                existing.icon = widget_data.icon
                existing.required_permission = widget_data.required_permission
                existing.is_active = widget_data.is_active
                existing.default_config = widget_data.default_config
                existing.default_size = widget_data.default_size
                existing.updated_by_id = current_user.id

                session.add(existing)
                updated_count += 1
            else:
                # Créer un nouveau widget
                new_widget = Widget(
                    widget_type=widget_data.widget_type,
                    name=widget_data.name,
                    description=widget_data.description,
                    module_name=widget_data.module_name,
                    category=widget_data.category,
                    icon=widget_data.icon,
                    required_permission=widget_data.required_permission,
                    is_active=widget_data.is_active,
                    default_config=widget_data.default_config,
                    default_size=widget_data.default_size,
                    created_by_id=current_user.id
                )
                session.add(new_widget)
                created_count += 1

        except Exception as e:
            errors.append({
                "widget_type": widget_data.widget_type,
                "error": str(e)
            })

    # Commit toutes les modifications
    try:
        session.commit()
    except Exception as e:
        session.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to sync widgets: {str(e)}"
        )

    result = {
        "message": f"Widgets synchronized for module '{module_code}'",
        "created": created_count,
        "updated": updated_count,
        "total": created_count + updated_count,
        "module_code": module_code
    }

    if errors:
        result["errors"] = errors

    return result


@router.get("/categories/list", response_model=list[str])
def list_widget_categories(
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """
    Get list of all widget categories.
    """
    statement = (
        select(Widget.category)
        .where(
            Widget.deleted_at.is_(None),
            Widget.is_active == True,
            Widget.category.is_not(None)
        )
        .distinct()
    )
    categories = session.exec(statement).all()
    return list(categories)


@router.get("/modules/list", response_model=list[str])
def list_widget_modules(
    session: SessionDep,
    current_user: CurrentUser
) -> Any:
    """
    Get list of all modules that provide widgets.
    """
    statement = (
        select(Widget.module_name)
        .where(
            Widget.deleted_at.is_(None),
            Widget.is_active == True
        )
        .distinct()
    )
    modules = session.exec(statement).all()
    return list(modules)
