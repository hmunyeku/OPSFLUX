"""
Routes API REST pour les exports de rapports.
Gère l'export en PDF, Word, Excel avec queue de traitement.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models_redacteur import (
    Report,
    ReportExport,
    ReportExportCreate,
    ReportExportPublic,
    ReportExportsPublic,
    ReportCollaborator,
)

router = APIRouter(prefix="/redacteur/reports/{report_id}/exports", tags=["redacteur"])


@router.get("/", response_model=ReportExportsPublic)
def list_exports(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    format: Optional[str] = Query(None, description="Filter by format"),
    status: Optional[str] = Query(None, description="Filter by status"),
) -> Any:
    """
    Récupère la liste des exports d'un rapport.
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
    statement = select(ReportExport).where(ReportExport.report_id == report_id)

    if format:
        statement = statement.where(ReportExport.format == format)
    if status:
        statement = statement.where(ReportExport.status == status)

    statement = statement.order_by(ReportExport.created_at.desc())

    exports = session.exec(statement).all()

    return ReportExportsPublic(data=exports, count=len(exports))


@router.get("/{export_id}", response_model=ReportExportPublic)
def get_export(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    export_id: UUID,
) -> Any:
    """
    Récupère un export spécifique.
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

    # Get export
    export = session.get(ReportExport, export_id)
    if not export or export.report_id != report_id:
        raise HTTPException(status_code=404, detail="Export non trouvé")

    return export


@router.post("/", response_model=ReportExportPublic)
def create_export(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    export_in: ReportExportCreate,
) -> Any:
    """
    Crée une demande d'export pour un rapport.
    L'export sera traité de manière asynchrone.
    """
    # Verify report exists
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

    # Validate format
    valid_formats = ["pdf", "docx", "xlsx"]
    if export_in.format not in valid_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Format invalide. Formats acceptés: {', '.join(valid_formats)}",
        )

    # Create export request
    export = ReportExport(
        **export_in.model_dump(),
        report_id=report_id,
        status="pending",
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(export)
    session.commit()
    session.refresh(export)

    # TODO: Queue export job for background processing
    # Example: send_to_export_queue(export.id, report.content, export.format)

    return export


@router.post("/{export_id}/retry", response_model=ReportExportPublic)
def retry_export(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    export_id: UUID,
) -> Any:
    """
    Relance un export qui a échoué.
    """
    # Verify report
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

    # Get export
    export = session.get(ReportExport, export_id)
    if not export or export.report_id != report_id:
        raise HTTPException(status_code=404, detail="Export non trouvé")

    # Check if export can be retried
    if export.status not in ["failed", "completed"]:
        raise HTTPException(
            status_code=400,
            detail="Seuls les exports échoués ou terminés peuvent être relancés",
        )

    # Reset export status
    export.status = "pending"
    export.error_message = None
    export.file_url = None
    export.file_size = None
    export.completed_at = None
    export.updated_by = current_user.id

    session.add(export)
    session.commit()
    session.refresh(export)

    # TODO: Queue export job again

    return export


@router.get("/formats/supported", response_model=dict[str, Any])
def get_supported_formats(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Retourne la liste des formats d'export supportés avec leurs options.
    """
    return {
        "formats": [
            {
                "format": "pdf",
                "name": "PDF",
                "description": "Document PDF avec mise en page préservée",
                "options": [
                    {
                        "name": "page_size",
                        "type": "select",
                        "values": ["A4", "Letter", "Legal"],
                        "default": "A4",
                    },
                    {
                        "name": "orientation",
                        "type": "select",
                        "values": ["portrait", "landscape"],
                        "default": "portrait",
                    },
                    {
                        "name": "include_toc",
                        "type": "boolean",
                        "default": True,
                        "description": "Inclure la table des matières",
                    },
                ],
            },
            {
                "format": "docx",
                "name": "Word",
                "description": "Document Microsoft Word éditable",
                "options": [
                    {
                        "name": "include_comments",
                        "type": "boolean",
                        "default": False,
                        "description": "Inclure les commentaires",
                    },
                    {
                        "name": "track_changes",
                        "type": "boolean",
                        "default": False,
                        "description": "Activer le suivi des modifications",
                    },
                ],
            },
            {
                "format": "xlsx",
                "name": "Excel",
                "description": "Feuille de calcul Excel (pour données tabulaires)",
                "options": [
                    {
                        "name": "include_charts",
                        "type": "boolean",
                        "default": True,
                        "description": "Inclure les graphiques",
                    },
                    {
                        "name": "freeze_header",
                        "type": "boolean",
                        "default": True,
                        "description": "Figer la ligne d'en-tête",
                    },
                ],
            },
        ]
    }
