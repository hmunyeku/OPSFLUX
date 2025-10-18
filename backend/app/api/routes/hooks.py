"""
Routes API pour le système de Hooks & Triggers.
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.core.rbac import require_permission
from app.models_hooks import (
    Hook,
    HookCreate,
    HookExecution,
    HookExecutionPublic,
    HookExecutionsPublic,
    HookPublic,
    HooksPublic,
    HookUpdate,
)
from app.services.hook_service import get_hook_executions

router = APIRouter(prefix="/hooks", tags=["hooks"])


@router.get("/", response_model=HooksPublic)
@require_permission("core.hooks.read")
async def read_hooks(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    event: str | None = None,
    is_active: bool | None = None,
) -> Any:
    """
    Récupère la liste des hooks.

    Filtres:
    - event: Filtrer par nom d'événement
    - is_active: Filtrer par statut actif/inactif

    Requiert la permission: core.hooks.read
    """
    # Base query
    statement = select(Hook).where(Hook.deleted_at == None)  # noqa: E711

    # Filtrer par événement
    if event:
        statement = statement.where(Hook.event == event)

    # Filtrer par statut
    if is_active is not None:
        statement = statement.where(Hook.is_active == is_active)

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination (tri par priorité puis date)
    statement = (
        statement
        .order_by(Hook.priority.desc(), Hook.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    hooks = session.exec(statement).all()

    # Convertir vers modèle public
    public_hooks = []
    for hook in hooks:
        public_hooks.append(
            HookPublic(
                id=hook.id,
                name=hook.name,
                event=hook.event,
                is_active=hook.is_active,
                priority=hook.priority,
                description=hook.description,
                conditions=hook.conditions,
                actions=hook.actions,
                created_at=hook.created_at.isoformat() if hook.created_at else None,
                updated_at=hook.updated_at.isoformat() if hook.updated_at else None,
            )
        )

    return HooksPublic(data=public_hooks, count=count)


@router.post("/", response_model=HookPublic)
@require_permission("core.hooks.create")
async def create_hook(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    hook_in: HookCreate,
) -> Any:
    """
    Créer un nouveau hook.

    Requiert la permission: core.hooks.create
    """
    # Valider qu'il y a au moins une action
    if not hook_in.actions or len(hook_in.actions) == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one action is required"
        )

    # Créer le hook
    db_hook = Hook(
        name=hook_in.name,
        event=hook_in.event,
        is_active=hook_in.is_active,
        priority=hook_in.priority,
        description=hook_in.description,
        conditions=hook_in.conditions,
        actions=hook_in.actions,
        created_by_id=current_user.id,
    )

    session.add(db_hook)
    session.commit()
    session.refresh(db_hook)

    return HookPublic(
        id=db_hook.id,
        name=db_hook.name,
        event=db_hook.event,
        is_active=db_hook.is_active,
        priority=db_hook.priority,
        description=db_hook.description,
        conditions=db_hook.conditions,
        actions=db_hook.actions,
        created_at=db_hook.created_at.isoformat() if db_hook.created_at else None,
        updated_at=db_hook.updated_at.isoformat() if db_hook.updated_at else None,
    )


@router.get("/{hook_id}", response_model=HookPublic)
@require_permission("core.hooks.read")
async def read_hook(
    hook_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupérer un hook spécifique par ID.

    Requiert la permission: core.hooks.read
    """
    hook = session.get(Hook, hook_id)
    if not hook or hook.deleted_at:
        raise HTTPException(status_code=404, detail="Hook not found")

    return HookPublic(
        id=hook.id,
        name=hook.name,
        event=hook.event,
        is_active=hook.is_active,
        priority=hook.priority,
        description=hook.description,
        conditions=hook.conditions,
        actions=hook.actions,
        created_at=hook.created_at.isoformat() if hook.created_at else None,
        updated_at=hook.updated_at.isoformat() if hook.updated_at else None,
    )


@router.patch("/{hook_id}", response_model=HookPublic)
@require_permission("core.hooks.update")
async def update_hook(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    hook_id: uuid.UUID,
    hook_in: HookUpdate,
) -> Any:
    """
    Mettre à jour un hook.

    Requiert la permission: core.hooks.update
    """
    db_hook = session.get(Hook, hook_id)
    if not db_hook or db_hook.deleted_at:
        raise HTTPException(status_code=404, detail="Hook not found")

    # Mettre à jour uniquement les champs fournis
    update_data = hook_in.model_dump(exclude_unset=True)

    # Valider les actions si fournies
    if "actions" in update_data and (not update_data["actions"] or len(update_data["actions"]) == 0):
        raise HTTPException(
            status_code=400,
            detail="At least one action is required"
        )

    db_hook.sqlmodel_update(update_data)
    db_hook.update_audit_trail(current_user.id)

    session.add(db_hook)
    session.commit()
    session.refresh(db_hook)

    return HookPublic(
        id=db_hook.id,
        name=db_hook.name,
        event=db_hook.event,
        is_active=db_hook.is_active,
        priority=db_hook.priority,
        description=db_hook.description,
        conditions=db_hook.conditions,
        actions=db_hook.actions,
        created_at=db_hook.created_at.isoformat() if db_hook.created_at else None,
        updated_at=db_hook.updated_at.isoformat() if db_hook.updated_at else None,
    )


@router.delete("/{hook_id}", response_model=Message)
@require_permission("core.hooks.delete")
async def delete_hook(
    session: SessionDep,
    current_user: CurrentUser,
    hook_id: uuid.UUID,
) -> Message:
    """
    Supprimer un hook (soft delete).

    Requiert la permission: core.hooks.delete
    """
    hook = session.get(Hook, hook_id)
    if not hook or hook.deleted_at:
        raise HTTPException(status_code=404, detail="Hook not found")

    # Soft delete
    hook.soft_delete(current_user.id)
    session.add(hook)
    session.commit()

    return Message(message="Hook deleted successfully")


@router.get("/{hook_id}/executions", response_model=HookExecutionsPublic)
@require_permission("core.hooks.read")
async def read_hook_executions(
    hook_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    success: bool | None = None,
) -> Any:
    """
    Récupérer l'historique d'exécution d'un hook.

    Filtres:
    - success: Filtrer par succès (True) ou échec (False)

    Requiert la permission: core.hooks.read
    """
    # Vérifier que le hook existe
    hook = session.get(Hook, hook_id)
    if not hook or hook.deleted_at:
        raise HTTPException(status_code=404, detail="Hook not found")

    # Utiliser le service pour récupérer les exécutions
    executions, count = get_hook_executions(
        session=session,
        hook_id=hook_id,
        success=success,
        skip=skip,
        limit=limit
    )

    # Convertir vers modèle public
    public_executions = []
    for execution in executions:
        public_executions.append(
            HookExecutionPublic(
                id=execution.id,
                hook_id=execution.hook_id,
                success=execution.success,
                duration_ms=execution.duration_ms,
                error_message=execution.error_message,
                event_context=execution.event_context,
                created_at=execution.created_at.isoformat() if execution.created_at else None,
            )
        )

    return HookExecutionsPublic(data=public_executions, count=count)


@router.get("/executions/all", response_model=HookExecutionsPublic)
@require_permission("core.hooks.read")
async def read_all_executions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    success: bool | None = None,
) -> Any:
    """
    Récupérer l'historique d'exécution de tous les hooks.

    Filtres:
    - success: Filtrer par succès (True) ou échec (False)

    Requiert la permission: core.hooks.read
    """
    # Utiliser le service pour récupérer toutes les exécutions
    executions, count = get_hook_executions(
        session=session,
        hook_id=None,  # Toutes les exécutions
        success=success,
        skip=skip,
        limit=limit
    )

    # Convertir vers modèle public
    public_executions = []
    for execution in executions:
        public_executions.append(
            HookExecutionPublic(
                id=execution.id,
                hook_id=execution.hook_id,
                success=execution.success,
                duration_ms=execution.duration_ms,
                error_message=execution.error_message,
                event_context=execution.event_context,
                created_at=execution.created_at.isoformat() if execution.created_at else None,
            )
        )

    return HookExecutionsPublic(data=public_executions, count=count)
