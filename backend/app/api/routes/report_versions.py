"""
Routes API REST pour les versions de rapports.
Gère l'historique et le versioning des rapports.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    Report,
    ReportVersion,
    ReportVersionPublic,
    ReportVersionsPublic,
    ReportCollaborator,
)

router = APIRouter(prefix="/redacteur/reports/{report_id}/versions", tags=["redacteur"])


@router.get("/", response_model=ReportVersionsPublic)
def list_versions(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère l'historique des versions d'un rapport.
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

    # Get versions
    statement = (
        select(ReportVersion)
        .where(ReportVersion.report_id == report_id)
        .order_by(ReportVersion.version_number.desc())
        .offset(skip)
        .limit(limit)
    )

    versions = session.exec(statement).all()

    return ReportVersionsPublic(data=versions, count=len(versions))


@router.get("/{version_id}", response_model=ReportVersionPublic)
def get_version(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    version_id: UUID,
) -> Any:
    """
    Récupère une version spécifique d'un rapport.
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

    # Get version
    version = session.get(ReportVersion, version_id)
    if not version or version.report_id != report_id:
        raise HTTPException(status_code=404, detail="Version non trouvée")

    return version


@router.get("/number/{version_number}", response_model=ReportVersionPublic)
def get_version_by_number(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    version_number: int,
) -> Any:
    """
    Récupère une version par son numéro.
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

    # Get version by number
    version = session.exec(
        select(ReportVersion)
        .where(ReportVersion.report_id == report_id)
        .where(ReportVersion.version_number == version_number)
    ).first()

    if not version:
        raise HTTPException(status_code=404, detail="Version non trouvée")

    return version


@router.post("/{version_id}/restore", response_model=dict[str, Any])
def restore_version(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    version_id: UUID,
) -> Any:
    """
    Restaure une version antérieure d'un rapport.
    Crée une nouvelle version avec le contenu de la version restaurée.
    """
    # Verify report
    report = session.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Rapport non trouvé")

    # Check edit permissions
    can_edit = False
    if report.created_by == current_user.id:
        can_edit = True
    else:
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

    # Get version to restore
    version = session.get(ReportVersion, version_id)
    if not version or version.report_id != report_id:
        raise HTTPException(status_code=404, detail="Version non trouvée")

    # Update report with version content
    report.content = version.content_snapshot
    report.metadata = version.metadata_snapshot
    report.version += 1
    report.updated_by = current_user.id

    # Create new version entry
    new_version = ReportVersion(
        report_id=report.id,
        version_number=report.version,
        content_snapshot=report.content,
        metadata_snapshot=report.metadata,
        change_summary=f"Restauration de la version {version.version_number}",
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(report)
    session.add(new_version)
    session.commit()
    session.refresh(report)

    return {
        "message": f"Version {version.version_number} restaurée avec succès",
        "new_version": report.version,
        "restored_from": version.version_number,
    }


@router.get("/{version_id}/compare/{compare_version_id}", response_model=dict[str, Any])
def compare_versions(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    version_id: UUID,
    compare_version_id: UUID,
) -> Any:
    """
    Compare deux versions d'un rapport.
    Retourne les différences entre les deux versions.
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

    # Get both versions
    version1 = session.get(ReportVersion, version_id)
    version2 = session.get(ReportVersion, compare_version_id)

    if not version1 or version1.report_id != report_id:
        raise HTTPException(status_code=404, detail="Première version non trouvée")

    if not version2 or version2.report_id != report_id:
        raise HTTPException(status_code=404, detail="Deuxième version non trouvée")

    # TODO: Implement actual diff logic
    # For now, just return both versions
    return {
        "version1": {
            "id": version1.id,
            "number": version1.version_number,
            "content": version1.content_snapshot,
            "metadata": version1.metadata_snapshot,
            "created_at": version1.created_at,
        },
        "version2": {
            "id": version2.id,
            "number": version2.version_number,
            "content": version2.content_snapshot,
            "metadata": version2.metadata_snapshot,
            "created_at": version2.created_at,
        },
        "differences": {
            "content": "TODO: Implement content diff",
            "metadata": "TODO: Implement metadata diff",
        },
    }
