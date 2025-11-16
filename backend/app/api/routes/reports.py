"""
Routes API REST pour le module rédacteur - Rapports (Reports).
Gère les opérations CRUD sur les rapports/documents.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select, func, or_, and_

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    Report,
    ReportCreate,
    ReportPublic,
    ReportsPublic,
    ReportUpdate,
    ReportVersion,
    ReportCollaborator,
    ReportAuditLog,
)

router = APIRouter(prefix="/redacteur/reports", tags=["redacteur"])


@router.get("/", response_model=ReportsPublic)
def list_reports(
    session: SessionDep,
    current_user: CurrentUser,
    status: Optional[str] = Query(None, description="Filter by status"),
    type: Optional[str] = Query(None, description="Filter by type"),
    template_id: Optional[UUID] = Query(None, description="Filter by template"),
    search: Optional[str] = Query(None, description="Search in title and metadata"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère la liste des rapports accessibles par l'utilisateur.
    Retourne les rapports créés par l'utilisateur ou partagés avec lui.
    """
    # Base query: reports created by user or shared with user
    statement = select(Report).where(
        or_(
            Report.created_by == current_user.id,
            Report.id.in_(
                select(ReportCollaborator.report_id).where(
                    ReportCollaborator.user_id == current_user.id
                )
            ),
        )
    )

    # Apply filters
    if status:
        statement = statement.where(Report.status == status)
    if type:
        statement = statement.where(Report.type == type)
    if template_id:
        statement = statement.where(Report.template_id == template_id)
    if search:
        search_pattern = f"%{search}%"
        statement = statement.where(
            or_(
                Report.title.ilike(search_pattern),
                Report.metadata["description"].astext.ilike(search_pattern),
            )
        )

    # Get total count
    count_statement = select(func.count()).select_from(statement.subquery())
    total_count = session.exec(count_statement).one()

    # Apply pagination and ordering
    statement = (
        statement.order_by(Report.updated_at.desc()).offset(skip).limit(limit)
    )

    reports = session.exec(statement).all()

    return ReportsPublic(data=reports, count=total_count)


@router.get("/{report_id}", response_model=ReportPublic)
def get_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Récupère un rapport spécifique par son ID.
    Vérifie les permissions d'accès.
    """
    report = session.get(Report, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check access permissions
    if report.created_by != current_user.id:
        # Check if user is a collaborator
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

    return report


@router.post("/", response_model=ReportPublic)
def create_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_in: ReportCreate,
) -> Any:
    """
    Crée un nouveau rapport.
    L'utilisateur devient automatiquement le propriétaire.
    """
    # If template_id is provided, verify it exists
    if report_in.template_id:
        from app.models_redacteur import ReportTemplate

        template = session.get(ReportTemplate, report_in.template_id)
        if not template or not template.is_active:
            raise HTTPException(
                status_code=404,
                detail="Gabarit non trouvé ou inactif",
            )

    # Create report
    report = Report(
        **report_in.model_dump(),
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(report)
    session.commit()
    session.refresh(report)

    # Create initial version snapshot
    version = ReportVersion(
        report_id=report.id,
        version_number=1,
        content_snapshot=report.content,
        metadata_snapshot=report.metadata,
        change_summary="Création initiale du rapport",
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(version)

    # Create audit log entry
    audit = ReportAuditLog(
        report_id=report.id,
        action="created",
        changes={"title": report.title, "type": report.type},
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(audit)

    session.commit()

    return report


@router.put("/{report_id}", response_model=ReportPublic)
def update_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    report_in: ReportUpdate,
) -> Any:
    """
    Met à jour un rapport existant.
    Crée automatiquement une nouvelle version si le contenu change.
    """
    report = session.get(Report, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check edit permissions
    can_edit = False
    if report.created_by == current_user.id:
        can_edit = True
    else:
        # Check collaborator permissions
        collaborator = session.exec(
            select(ReportCollaborator)
            .where(ReportCollaborator.report_id == report_id)
            .where(ReportCollaborator.user_id == current_user.id)
        ).first()

        if collaborator and collaborator.can_edit:
            can_edit = True

    if not can_edit:
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de modifier ce rapport",
        )

    # Track changes for audit
    changes = {}
    content_changed = False

    # Update fields
    update_data = report_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            old_value = getattr(report, field)
            if old_value != value:
                changes[field] = {"old": old_value, "new": value}
                if field == "content":
                    content_changed = True
                setattr(report, field, value)

    report.updated_by = current_user.id

    # Create new version if content changed
    if content_changed:
        report.version += 1
        version = ReportVersion(
            report_id=report.id,
            version_number=report.version,
            content_snapshot=report.content,
            metadata_snapshot=report.metadata,
            change_summary=f"Modification du contenu (v{report.version})",
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        session.add(version)

    # Create audit log entry
    if changes:
        audit = ReportAuditLog(
            report_id=report.id,
            action="updated",
            changes=changes,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        session.add(audit)

    session.add(report)
    session.commit()
    session.refresh(report)

    return report


@router.delete("/{report_id}", response_model=Message)
def delete_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    permanent: bool = Query(
        False, description="Si True, suppression définitive, sinon soft delete"
    ),
) -> Any:
    """
    Supprime un rapport (soft delete par défaut).
    Seul le propriétaire peut supprimer un rapport.
    """
    report = session.get(Report, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Only owner can delete
    if report.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Seul le propriétaire peut supprimer ce rapport",
        )

    if permanent:
        # Permanent delete
        session.delete(report)
        audit_action = "permanently_deleted"
        message = "Rapport supprimé définitivement"
    else:
        # Soft delete
        report.status = "deleted"
        report.updated_by = current_user.id
        session.add(report)
        audit_action = "soft_deleted"
        message = "Rapport supprimé"

    # Create audit log entry
    audit = ReportAuditLog(
        report_id=report.id,
        action=audit_action,
        changes={"status": "deleted"},
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(audit)

    session.commit()

    return Message(message=message)


@router.post("/{report_id}/publish", response_model=ReportPublic)
def publish_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Publie un rapport (change le statut de 'draft' à 'published').
    """
    report = session.get(Report, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check permissions
    can_publish = False
    if report.created_by == current_user.id:
        can_publish = True
    else:
        collaborator = session.exec(
            select(ReportCollaborator)
            .where(ReportCollaborator.report_id == report_id)
            .where(ReportCollaborator.user_id == current_user.id)
        ).first()

        if collaborator and collaborator.can_edit:
            can_publish = True

    if not can_publish:
        raise HTTPException(
            status_code=403,
            detail="Vous n'avez pas la permission de publier ce rapport",
        )

    old_status = report.status
    report.status = "published"
    report.updated_by = current_user.id

    # Create audit log entry
    audit = ReportAuditLog(
        report_id=report.id,
        action="published",
        changes={"status": {"old": old_status, "new": "published"}},
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(audit)

    session.add(report)
    session.commit()
    session.refresh(report)

    return report


@router.post("/{report_id}/archive", response_model=ReportPublic)
def archive_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Archive un rapport (change le statut à 'archived').
    """
    report = session.get(Report, report_id)

    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Only owner can archive
    if report.created_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Seul le propriétaire peut archiver ce rapport",
        )

    old_status = report.status
    report.status = "archived"
    report.updated_by = current_user.id

    # Create audit log entry
    audit = ReportAuditLog(
        report_id=report.id,
        action="archived",
        changes={"status": {"old": old_status, "new": "archived"}},
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(audit)

    session.add(report)
    session.commit()
    session.refresh(report)

    return report


@router.post("/{report_id}/duplicate", response_model=ReportPublic)
def duplicate_report(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    new_title: Optional[str] = Query(None, description="Titre du nouveau rapport"),
) -> Any:
    """
    Duplique un rapport existant.
    """
    original_report = session.get(Report, report_id)

    if not original_report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check access
    if original_report.created_by != current_user.id:
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

    # Create duplicate
    duplicate = Report(
        title=new_title or f"{original_report.title} (Copie)",
        type=original_report.type,
        content=original_report.content,
        status="draft",
        template_id=original_report.template_id,
        metadata=original_report.metadata,
        tags=original_report.tags,
        version=1,
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(duplicate)
    session.commit()
    session.refresh(duplicate)

    # Create initial version for duplicate
    version = ReportVersion(
        report_id=duplicate.id,
        version_number=1,
        content_snapshot=duplicate.content,
        metadata_snapshot=duplicate.metadata,
        change_summary=f"Duplication du rapport '{original_report.title}'",
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    session.add(version)
    session.commit()

    return duplicate


@router.get("/{report_id}/stats", response_model=dict[str, Any])
def get_report_stats(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Récupère les statistiques d'un rapport (nombre de versions, commentaires, etc.).
    """
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

    # Get counts
    from app.models_redacteur import ReportComment

    versions_count = session.exec(
        select(func.count(ReportVersion.id)).where(
            ReportVersion.report_id == report_id
        )
    ).one()

    comments_count = session.exec(
        select(func.count(ReportComment.id))
        .where(ReportComment.report_id == report_id)
        .where(ReportComment.resolved == False)
    ).one()

    collaborators_count = session.exec(
        select(func.count(ReportCollaborator.id)).where(
            ReportCollaborator.report_id == report_id
        )
    ).one()

    audit_count = session.exec(
        select(func.count(ReportAuditLog.id)).where(
            ReportAuditLog.report_id == report_id
        )
    ).one()

    return {
        "report_id": report_id,
        "versions_count": versions_count,
        "comments_count": comments_count,
        "collaborators_count": collaborators_count,
        "audit_logs_count": audit_count,
        "current_version": report.version,
        "status": report.status,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
    }
