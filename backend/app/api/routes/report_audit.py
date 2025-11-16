"""
Routes API REST pour l'audit et les suggestions IA des rapports.
"""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep
from app.models_redacteur import (
    Report,
    ReportAuditLog,
    ReportAuditLogPublic,
    ReportAuditLogsPublic,
    ReportCollaborator,
    AISuggestion,
    AISuggestionCreate,
    AISuggestionPublic,
    AISuggestionsPublic,
)

router = APIRouter(prefix="/redacteur/reports/{report_id}", tags=["redacteur"])


# ============================================================================
# AUDIT LOG ENDPOINTS
# ============================================================================


@router.get("/audit-logs", response_model=ReportAuditLogsPublic)
def list_audit_logs(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    action: Optional[str] = Query(None, description="Filter by action type"),
    user_id: Optional[UUID] = Query(None, description="Filter by user"),
    start_date: Optional[datetime] = Query(None, description="Start date filter"),
    end_date: Optional[datetime] = Query(None, description="End date filter"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère le journal d'audit d'un rapport.
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
    statement = select(ReportAuditLog).where(ReportAuditLog.report_id == report_id)

    if action:
        statement = statement.where(ReportAuditLog.action == action)
    if user_id:
        statement = statement.where(ReportAuditLog.created_by == user_id)
    if start_date:
        statement = statement.where(ReportAuditLog.created_at >= start_date)
    if end_date:
        statement = statement.where(ReportAuditLog.created_at <= end_date)

    # Order by most recent first
    statement = statement.order_by(ReportAuditLog.created_at.desc()).offset(skip).limit(
        limit
    )

    logs = session.exec(statement).all()

    return ReportAuditLogsPublic(data=logs, count=len(logs))


@router.get("/audit-logs/{log_id}", response_model=ReportAuditLogPublic)
def get_audit_log(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    log_id: UUID,
) -> Any:
    """
    Récupère une entrée d'audit spécifique.
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

    # Get log
    log = session.get(ReportAuditLog, log_id)
    if not log or log.report_id != report_id:
        raise HTTPException(status_code=404, detail="Entrée d'audit non trouvée")

    return log


@router.get("/audit-logs/actions/types", response_model=dict[str, Any])
def get_audit_action_types(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
) -> Any:
    """
    Retourne la liste des types d'actions disponibles dans l'audit.
    """
    return {
        "action_types": [
            {"value": "created", "label": "Création", "icon": "plus"},
            {"value": "updated", "label": "Modification", "icon": "edit"},
            {"value": "published", "label": "Publication", "icon": "send"},
            {"value": "archived", "label": "Archivage", "icon": "archive"},
            {"value": "soft_deleted", "label": "Suppression", "icon": "trash"},
            {"value": "permanently_deleted", "label": "Suppression définitive", "icon": "x"},
            {"value": "restored", "label": "Restauration", "icon": "rotate-ccw"},
            {"value": "shared", "label": "Partage", "icon": "share"},
            {"value": "permission_changed", "label": "Changement de permission", "icon": "shield"},
            {"value": "comment_added", "label": "Commentaire ajouté", "icon": "message-square"},
            {"value": "export_requested", "label": "Export demandé", "icon": "download"},
        ]
    }


# ============================================================================
# AI SUGGESTIONS ENDPOINTS
# ============================================================================


@router.get("/ai-suggestions", response_model=AISuggestionsPublic)
def list_ai_suggestions(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    suggestion_type: Optional[str] = Query(None, description="Filter by type"),
    applied: Optional[bool] = Query(None, description="Filter by applied status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère les suggestions IA pour un rapport.
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
    statement = select(AISuggestion).where(AISuggestion.report_id == report_id)

    if suggestion_type:
        statement = statement.where(AISuggestion.suggestion_type == suggestion_type)
    if applied is not None:
        statement = statement.where(AISuggestion.applied == applied)

    statement = statement.order_by(AISuggestion.created_at.desc()).offset(skip).limit(
        limit
    )

    suggestions = session.exec(statement).all()

    return AISuggestionsPublic(data=suggestions, count=len(suggestions))


@router.post("/ai-suggestions", response_model=AISuggestionPublic)
def create_ai_suggestion(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    suggestion_in: AISuggestionCreate,
) -> Any:
    """
    Crée une nouvelle suggestion IA pour un rapport.
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

    # Validate suggestion type
    valid_types = [
        "completion",
        "correction",
        "translation",
        "summary",
        "analysis",
        "anomaly_detection",
    ]
    if suggestion_in.suggestion_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Type de suggestion invalide. Types acceptés: {', '.join(valid_types)}",
        )

    suggestion = AISuggestion(
        **suggestion_in.model_dump(),
        report_id=report_id,
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(suggestion)
    session.commit()
    session.refresh(suggestion)

    return suggestion


@router.post("/ai-suggestions/{suggestion_id}/apply", response_model=AISuggestionPublic)
def apply_ai_suggestion(
    session: SessionDep,
    current_user: CurrentUser,
    report_id: UUID,
    suggestion_id: UUID,
) -> Any:
    """
    Applique une suggestion IA au rapport.
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

    # Get suggestion
    suggestion = session.get(AISuggestion, suggestion_id)
    if not suggestion or suggestion.report_id != report_id:
        raise HTTPException(status_code=404, detail="Suggestion non trouvée")

    if suggestion.applied:
        raise HTTPException(
            status_code=400,
            detail="Cette suggestion a déjà été appliquée",
        )

    # Mark as applied
    suggestion.applied = True
    suggestion.applied_at = datetime.utcnow()
    suggestion.updated_by = current_user.id

    # TODO: Actually apply the suggestion to the report content
    # This would require parsing the report content and inserting the suggestion

    session.add(suggestion)
    session.commit()
    session.refresh(suggestion)

    return suggestion


@router.get("/ai-suggestions/types/available", response_model=dict[str, Any])
def get_ai_suggestion_types(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Retourne la liste des types de suggestions IA disponibles.
    """
    return {
        "suggestion_types": [
            {
                "type": "completion",
                "name": "Auto-complétion",
                "description": "Suggestions de texte basées sur le contexte",
                "icon": "wand-2",
            },
            {
                "type": "correction",
                "name": "Correction",
                "description": "Correction orthographique et grammaticale",
                "icon": "check-circle",
            },
            {
                "type": "translation",
                "name": "Traduction",
                "description": "Traduction automatique du texte",
                "icon": "languages",
            },
            {
                "type": "summary",
                "name": "Résumé",
                "description": "Génération automatique de résumé",
                "icon": "file-text",
            },
            {
                "type": "analysis",
                "name": "Analyse",
                "description": "Analyse du contenu et suggestions d'amélioration",
                "icon": "bar-chart",
            },
            {
                "type": "anomaly_detection",
                "name": "Détection d'anomalies",
                "description": "Détection d'incohérences dans les données",
                "icon": "alert-triangle",
            },
        ]
    }
