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

router = APIRouter(prefix="/widgets", tags=["widgets"])


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

    # TODO: Filter by required_permission based on user's permissions
    # For now, show all widgets

    count = session.exec(count_statement).one()

    statement = (
        statement
        .order_by(Widget.category, Widget.name)
        .offset(skip)
        .limit(limit)
    )
    widgets = session.exec(statement).all()

    return WidgetsPublic(data=widgets, count=count)


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
