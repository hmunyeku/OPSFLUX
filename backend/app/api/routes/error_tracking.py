"""
Error Tracking API endpoints
Gestion des logs d'erreurs et statistiques
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_
from datetime import datetime, timedelta
from typing import Optional
import uuid
import hashlib

from app.api.deps import get_db, CurrentUser
from app.core.rbac import require_permission
from app.models_error_tracking import (
    ErrorLog,
    ErrorLogCreate,
    ErrorLogUpdate,
    ErrorLogPublic,
    ErrorLogsPublic,
    ErrorStatsResponse,
    ErrorStatus,
    ErrorSeverity,
    ErrorSource,
)

router = APIRouter(prefix="/error-tracking", tags=["Error Tracking"])


def generate_error_hash(error_type: str, file_path: Optional[str], line_number: Optional[int]) -> str:
    """Génère un hash unique pour grouper les erreurs similaires"""
    hash_input = f"{error_type}:{file_path or 'unknown'}:{line_number or 0}"
    return hashlib.sha256(hash_input.encode()).hexdigest()


@router.post("/", response_model=ErrorLogPublic)
@require_permission("core.errors.create")
async def create_error_log(
    error_in: ErrorLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
) -> ErrorLog:
    """
    Crée un nouveau log d'erreur

    Si une erreur similaire existe (même hash), incrémente occurrence_count
    """
    # Générer hash si non fourni
    if not error_in.error_hash:
        error_hash = generate_error_hash(
            error_in.error_type,
            error_in.file_path,
            error_in.line_number
        )
    else:
        error_hash = error_in.error_hash

    # Vérifier si erreur similaire existe déjà (dernières 24h)
    since = datetime.utcnow() - timedelta(days=1)
    statement = select(ErrorLog).where(
        and_(
            ErrorLog.error_hash == error_hash,
            ErrorLog.created_at >= since,
            ErrorLog.status != ErrorStatus.RESOLVED
        )
    )
    result = await db.execute(statement)
    existing_error = result.scalar_one_or_none()

    if existing_error:
        # Incrémenter le compteur d'occurrences
        existing_error.occurrence_count += 1
        existing_error.last_seen_at = datetime.utcnow()
        db.add(existing_error)
        await db.commit()
        await db.refresh(existing_error)
        return existing_error

    # Créer nouvelle erreur
    error_data = error_in.model_dump(exclude_unset=True)
    error_data["error_hash"] = error_hash
    error_data["last_seen_at"] = datetime.utcnow()

    if current_user:
        error_data["created_by_id"] = current_user.id

    error = ErrorLog(**error_data)
    db.add(error)
    await db.commit()
    await db.refresh(error)
    return error


@router.get("/", response_model=ErrorLogsPublic)
@require_permission("core.errors.read")
async def get_error_logs(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
    skip: int = 0,
    limit: int = Query(default=50, le=100),
    severity: Optional[ErrorSeverity] = None,
    source: Optional[ErrorSource] = None,
    status: Optional[ErrorStatus] = None,
    search: Optional[str] = None,
) -> ErrorLogsPublic:
    """
    Liste les logs d'erreurs avec filtres
    """
    conditions = []

    if severity:
        conditions.append(ErrorLog.severity == severity)
    if source:
        conditions.append(ErrorLog.source == source)
    if status:
        conditions.append(ErrorLog.status == status)
    if search:
        conditions.append(
            ErrorLog.message.ilike(f"%{search}%") |
            ErrorLog.error_type.ilike(f"%{search}%")
        )

    # Query avec filtres
    statement = select(ErrorLog)
    if conditions:
        statement = statement.where(and_(*conditions))

    # Count total
    count_statement = select(func.count()).select_from(ErrorLog)
    if conditions:
        count_statement = count_statement.where(and_(*conditions))
    count_result = await db.execute(count_statement)
    total_count = count_result.scalar()

    # Fetch errors
    statement = statement.order_by(desc(ErrorLog.last_seen_at)).offset(skip).limit(limit)
    result = await db.execute(statement)
    errors = result.scalars().all()

    return ErrorLogsPublic(data=list(errors), count=total_count)


@router.get("/stats", response_model=ErrorStatsResponse)
@require_permission("core.errors.read")
async def get_error_stats(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
    days: int = Query(default=7, le=90),
) -> ErrorStatsResponse:
    """
    Statistiques des erreurs
    """
    since = datetime.utcnow() - timedelta(days=days)

    # Total errors
    total_statement = select(func.count()).select_from(ErrorLog).where(
        ErrorLog.created_at >= since
    )
    total_result = await db.execute(total_statement)
    total_errors = total_result.scalar()

    # Open errors
    open_statement = select(func.count()).select_from(ErrorLog).where(
        and_(
            ErrorLog.status == ErrorStatus.OPEN,
            ErrorLog.created_at >= since
        )
    )
    open_result = await db.execute(open_statement)
    open_errors = open_result.scalar()

    # Resolved errors
    resolved_statement = select(func.count()).select_from(ErrorLog).where(
        and_(
            ErrorLog.status == ErrorStatus.RESOLVED,
            ErrorLog.created_at >= since
        )
    )
    resolved_result = await db.execute(resolved_statement)
    resolved_errors = resolved_result.scalar()

    # Critical errors
    critical_statement = select(func.count()).select_from(ErrorLog).where(
        and_(
            ErrorLog.severity == ErrorSeverity.CRITICAL,
            ErrorLog.created_at >= since
        )
    )
    critical_result = await db.execute(critical_statement)
    critical_errors = critical_result.scalar()

    # Errors by severity
    severity_statement = select(
        ErrorLog.severity,
        func.count(ErrorLog.id)
    ).where(
        ErrorLog.created_at >= since
    ).group_by(ErrorLog.severity)
    severity_result = await db.execute(severity_statement)
    errors_by_severity = {row[0]: row[1] for row in severity_result.all()}

    # Errors by source
    source_statement = select(
        ErrorLog.source,
        func.count(ErrorLog.id)
    ).where(
        ErrorLog.created_at >= since
    ).group_by(ErrorLog.source)
    source_result = await db.execute(source_statement)
    errors_by_source = {row[0]: row[1] for row in source_result.all()}

    # Errors by status
    status_statement = select(
        ErrorLog.status,
        func.count(ErrorLog.id)
    ).where(
        ErrorLog.created_at >= since
    ).group_by(ErrorLog.status)
    status_result = await db.execute(status_statement)
    errors_by_status = {row[0]: row[1] for row in status_result.all()}

    # Recent errors (10 dernières)
    recent_statement = select(ErrorLog).where(
        ErrorLog.created_at >= since
    ).order_by(desc(ErrorLog.created_at)).limit(10)
    recent_result = await db.execute(recent_statement)
    recent_errors = recent_result.scalars().all()

    # Top errors (plus fréquentes)
    top_statement = select(ErrorLog).where(
        ErrorLog.created_at >= since
    ).order_by(desc(ErrorLog.occurrence_count)).limit(10)
    top_result = await db.execute(top_statement)
    top_errors_raw = top_result.scalars().all()
    top_errors = [
        {
            "error_type": e.error_type,
            "message": e.message[:100],  # Truncate
            "occurrence_count": e.occurrence_count,
            "severity": e.severity,
            "source": e.source,
        }
        for e in top_errors_raw
    ]

    return ErrorStatsResponse(
        total_errors=total_errors,
        open_errors=open_errors,
        resolved_errors=resolved_errors,
        critical_errors=critical_errors,
        errors_by_severity=errors_by_severity,
        errors_by_source=errors_by_source,
        errors_by_status=errors_by_status,
        recent_errors=list(recent_errors),
        top_errors=top_errors,
    )


@router.get("/{error_id}", response_model=ErrorLogPublic)
@require_permission("core.errors.read")
async def get_error_log(
    error_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
) -> ErrorLog:
    """Récupère un log d'erreur par ID"""
    statement = select(ErrorLog).where(ErrorLog.id == error_id)
    result = await db.execute(statement)
    error = result.scalar_one_or_none()

    if not error:
        raise HTTPException(status_code=404, detail="Error log not found")

    return error


@router.patch("/{error_id}", response_model=ErrorLogPublic)
@require_permission("core.errors.update")
async def update_error_log(
    error_id: uuid.UUID,
    error_update: ErrorLogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
) -> ErrorLog:
    """
    Met à jour un log d'erreur (statut, notes de résolution)
    """
    statement = select(ErrorLog).where(ErrorLog.id == error_id)
    result = await db.execute(statement)
    error = result.scalar_one_or_none()

    if not error:
        raise HTTPException(status_code=404, detail="Error log not found")

    # Update fields
    update_data = error_update.model_dump(exclude_unset=True)

    # Si status change à RESOLVED, enregistrer date et user
    if update_data.get("status") == ErrorStatus.RESOLVED and error.status != ErrorStatus.RESOLVED:
        error.resolved_at = datetime.utcnow()
        if current_user:
            error.resolved_by_id = current_user.id

    for key, value in update_data.items():
        setattr(error, key, value)

    error.updated_at = datetime.utcnow()
    if current_user:
        error.updated_by_id = current_user.id

    db.add(error)
    await db.commit()
    await db.refresh(error)
    return error


@router.delete("/{error_id}")
@require_permission("core.errors.delete")
async def delete_error_log(
    error_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
) -> dict:
    """Supprime un log d'erreur"""
    statement = select(ErrorLog).where(ErrorLog.id == error_id)
    result = await db.execute(statement)
    error = result.scalar_one_or_none()

    if not error:
        raise HTTPException(status_code=404, detail="Error log not found")

    await db.delete(error)
    await db.commit()

    return {"message": "Error log deleted successfully"}


@router.delete("/bulk/resolved")
@require_permission("core.errors.delete")
async def delete_resolved_errors(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None,
    older_than_days: int = Query(default=30, ge=1, le=365),
) -> dict:
    """Supprime en masse les erreurs résolues depuis X jours"""
    cutoff_date = datetime.utcnow() - timedelta(days=older_than_days)

    statement = select(ErrorLog).where(
        and_(
            ErrorLog.status == ErrorStatus.RESOLVED,
            ErrorLog.resolved_at <= cutoff_date
        )
    )
    result = await db.execute(statement)
    errors_to_delete = result.scalars().all()

    count = len(errors_to_delete)

    for error in errors_to_delete:
        await db.delete(error)

    await db.commit()

    return {"message": f"Deleted {count} resolved error logs"}
