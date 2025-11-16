"""
Routes API REST pour les collaborateurs de rapports.
Gère le partage et les permissions par rapport.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    Report,
    ReportCollaborator,
    ReportCollaboratorCreate,
    ReportCollaboratorPublic,
    ReportCollaboratorsPublic,
    ReportCollaboratorUpdate,
)

router = APIRouter(prefix="/redacteur/reports/{report_id}/collaborators", tags=["redacteur"])


@router.get("/", response_model=ReportCollaboratorsPublic)
def list_collaborators(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Récupère la liste des collaborateurs d'un rapport.
    """
    # Verify report exists and user has access
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check access
    if report.created_by != current_user.id:
        collaborator = session.exec(
            select(ReportCollaborator)
            .where(ReportCollaborator.report_id == report_id)
            .where(ReportCollaborator.user_id == current_user.id)
        ).first()

        if not collaborator:
            raise HTTPException(
                status_code=403,
                detail="Vous n'avez pas accès à ce rapport",
            )

    # Get all collaborators
    statement = select(ReportCollaborator).where(
        ReportCollaborator.report_id == report_id
    )
    collaborators = session.exec(statement).all()

    return ReportCollaboratorsPublic(data=collaborators, count=len(collaborators))


@router.post("/", response_model=ReportCollaboratorPublic)
def add_collaborator(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    collaborator_in: ReportCollaboratorCreate,
) -> Any:
    """
    Ajoute un collaborateur à un rapport.
    Seul le propriétaire peut ajouter des collaborateurs.
    """
    # Verify report exists
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Only owner can add collaborators
    if report.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Seul le propriétaire peut ajouter des collaborateurs",
        )

    # Check if user is trying to add themselves
    if collaborator_in.user_id == current_user.id:
        raise HTTPException(
            status_code=400,
            detail="Vous ne pouvez pas vous ajouter comme collaborateur",
        )

    # Check if collaboration already exists
    existing = session.exec(
        select(ReportCollaborator)
        .where(ReportCollaborator.report_id == report_id)
        .where(ReportCollaborator.user_id == collaborator_in.user_id)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Cet utilisateur est déjà collaborateur",
        )

    # Verify user exists
    from app.models import User

    user = session.get(User, collaborator_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Create collaborator
    collaborator = ReportCollaborator(
        **collaborator_in.model_dump(),
        report_id=report_id,
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(collaborator)
    session.commit()
    session.refresh(collaborator)

    # TODO: Send notification to the new collaborator

    return collaborator


@router.put("/{collaborator_id}", response_model=ReportCollaboratorPublic)
def update_collaborator(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    collaborator_id: UUID,
    collaborator_in: ReportCollaboratorUpdate,
) -> Any:
    """
    Met à jour les permissions d'un collaborateur.
    Seul le propriétaire peut modifier les permissions.
    """
    # Verify report exists
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Only owner can update permissions
    if report.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Seul le propriétaire peut modifier les permissions",
        )

    # Get collaborator
    collaborator = session.get(ReportCollaborator, collaborator_id)
    if not collaborator or collaborator.report_id != report_id:
        raise HTTPException(status_code=404, detail="Collaborateur non trouvé")

    # Update fields
    update_data = collaborator_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(collaborator, field, value)

    collaborator.updated_by = current_user.id

    session.add(collaborator)
    session.commit()
    session.refresh(collaborator)

    return collaborator


@router.delete("/{collaborator_id}", response_model=Message)
def remove_collaborator(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    collaborator_id: UUID,
) -> Any:
    """
    Retire un collaborateur d'un rapport.
    Le propriétaire peut retirer n'importe qui, un collaborateur peut se retirer lui-même.
    """
    # Verify report exists
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Get collaborator
    collaborator = session.get(ReportCollaborator, collaborator_id)
    if not collaborator or collaborator.report_id != report_id:
        raise HTTPException(status_code=404, detail="Collaborateur non trouvé")

    # Check permissions
    is_owner = report.created_by == current_user.id
    is_self = collaborator.user_id == current_user.id

    if not (is_owner or is_self):
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de retirer ce collaborateur",
        )

    session.delete(collaborator)
    session.commit()

    return Message(message="Collaborateur retiré avec succès")
