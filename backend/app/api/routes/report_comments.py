"""
Routes API REST pour les commentaires sur les rapports.
Gère les commentaires avec threading et mentions.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    Report,
    ReportComment,
    ReportCommentCreate,
    ReportCommentPublic,
    ReportCommentsPublic,
    ReportCommentUpdate,
    ReportCollaborator,
)

router = APIRouter(prefix="/redacteur/reports/{report_id}/comments", tags=["redacteur"])


@router.get("/", response_model=ReportCommentsPublic)
def list_comments(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    resolved: Optional[bool] = Query(None, description="Filter by resolved status"),
    parent_id: Optional[UUID] = Query(None, description="Filter by parent comment"),
) -> Any:
    """
    Récupère la liste des commentaires d'un rapport.
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

    # Build query
    statement = select(ReportComment).where(ReportComment.report_id == report_id)

    if resolved is not None:
        statement = statement.where(ReportComment.resolved == resolved)

    if parent_id is not None:
        statement = statement.where(ReportComment.parent_id == parent_id)
    else:
        # By default, only get top-level comments (no parent)
        statement = statement.where(ReportComment.parent_id.is_(None))

    # Order by creation date
    statement = statement.order_by(ReportComment.created_at.desc())

    comments = session.exec(statement).all()

    return ReportCommentsPublic(data=comments, count=len(comments))


@router.get("/{comment_id}", response_model=ReportCommentPublic)
def get_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
) -> Any:
    """
    Récupère un commentaire spécifique.
    """
    # Verify report access
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

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

    # Get comment
    comment = session.get(ReportComment, comment_id)
    if not comment or comment.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    return comment


@router.post("/", response_model=ReportCommentPublic)
def create_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_in: ReportCommentCreate,
) -> Any:
    """
    Ajoute un commentaire à un rapport.
    """
    # Verify report exists
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check comment permissions
    can_comment = False
    if report.created_by == current_user.id:
        can_comment = True
    else:
        collaborator = session.exec(
            select(ReportCollaborator)
            .where(ReportCollaborator.report_id == report_id)
            .where(ReportCollaborator.user_id == current_user.id)
        ).first()

        if collaborator and collaborator.can_comment:
            can_comment = True

    if not can_comment:
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de commenter ce rapport",
        )

    # If parent_id is provided, verify it exists and belongs to same report
    if comment_in.parent_id:
        parent = session.get(ReportComment, comment_in.parent_id)
        if not parent or parent.report_id != report_id:
            raise HTTPException(
                status_code=404,
                detail="Commentaire parent non trouvé",
            )

    # Create comment
    comment = ReportComment(
        **comment_in.model_dump(),
        report_id=report_id,
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(comment)
    session.commit()
    session.refresh(comment)

    # TODO: Send notifications to mentioned users

    return comment


@router.put("/{comment_id}", response_model=ReportCommentPublic)
def update_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
    comment_in: ReportCommentUpdate,
) -> Any:
    """
    Met à jour un commentaire.
    Seul l'auteur peut modifier le contenu.
    """
    # Verify report access
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Get comment
    comment = session.get(ReportComment, comment_id)
    if not comment or comment.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    # Check permissions
    # Only author can edit content, but anyone can resolve
    if comment_in.content is not None and comment.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Seul l'auteur peut modifier le contenu du commentaire",
        )

    # Update fields
    update_data = comment_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            if field == "resolved":
                setattr(comment, field, value)
                if value:
                    comment.resolved_by = current_user.id
                    comment.resolved_at = func.now()
                else:
                    comment.resolved_by = None
                    comment.resolved_at = None
            else:
                setattr(comment, field, value)

    comment.updated_by = current_user.id

    session.add(comment)
    session.commit()
    session.refresh(comment)

    return comment


@router.delete("/{comment_id}", response_model=Message)
def delete_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
) -> Any:
    """
    Supprime un commentaire.
    L'auteur ou le propriétaire du rapport peuvent supprimer.
    """
    # Verify report
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Get comment
    comment = session.get(ReportComment, comment_id)
    if not comment or comment.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    # Check permissions
    is_author = comment.created_by == current_user.id
    is_owner = report.created_by == current_user.id

    if not (is_author or is_owner):
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de supprimer ce commentaire",
        )

    # Check if comment has replies
    has_replies = session.exec(
        select(func.count(ReportComment.id)).where(
            ReportComment.parent_id == comment_id
        )
    ).one()

    if has_replies > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Ce commentaire a {has_replies} réponse(s) et ne peut pas être supprimé",
        )

    session.delete(comment)
    session.commit()

    return Message(message="Commentaire supprimé avec succès")


@router.get("/{comment_id}/replies", response_model=ReportCommentsPublic)
def get_comment_replies(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
) -> Any:
    """
    Récupère toutes les réponses à un commentaire.
    """
    # Verify access
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

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

    # Verify parent comment exists
    parent = session.get(ReportComment, comment_id)
    if not parent or parent.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    # Get replies
    statement = (
        select(ReportComment)
        .where(ReportComment.parent_id == comment_id)
        .order_by(ReportComment.created_at)
    )

    replies = session.exec(statement).all()

    return ReportCommentsPublic(data=replies, count=len(replies))


@router.post("/{comment_id}/resolve", response_model=ReportCommentPublic)
def resolve_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
) -> Any:
    """
    Marque un commentaire comme résolu.
    """
    # Verify report
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Get comment
    comment = session.get(ReportComment, comment_id)
    if not comment or comment.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    # Mark as resolved
    comment.resolved = True
    comment.resolved_by = current_user.id
    from datetime import datetime

    comment.resolved_at = datetime.utcnow()
    comment.updated_by = current_user.id

    session.add(comment)
    session.commit()
    session.refresh(comment)

    return comment


@router.post("/{comment_id}/unresolve", response_model=ReportCommentPublic)
def unresolve_comment(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    comment_id: UUID,
) -> Any:
    """
    Marque un commentaire comme non résolu.
    """
    # Verify report
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Get comment
    comment = session.get(ReportComment, comment_id)
    if not comment or comment.report_id != report_id:
        raise HTTPException(status_code=404, detail="Commentaire non trouvé")

    # Mark as unresolved
    comment.resolved = False
    comment.resolved_by = None
    comment.resolved_at = None
    comment.updated_by = current_user.id

    session.add(comment)
    session.commit()
    session.refresh(comment)

    return comment
