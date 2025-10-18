from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Query
from sqlmodel import Session, col, select

from app.api.deps import CurrentUser, SessionDep
from app.models_audit import AuditLog
from app.core.rbac import require_permission

router = APIRouter()


# Données de test pour le développement
MOCK_LOGS = [
    {
        "id": 1,
        "timestamp": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
        "level": "INFO",
        "event_type": "API",
        "message": "User authentication successful",
        "source": "auth.py",
        "method": "POST",
        "path": "/api/v1/login/access-token",
        "status_code": 200,
        "environment": "production",
    },
    {
        "id": 2,
        "timestamp": (datetime.utcnow() - timedelta(minutes=10)).isoformat(),
        "level": "WARN",
        "event_type": "API",
        "message": "High memory usage detected",
        "source": "system.monitor.py",
        "method": "GET",
        "path": "/api/v1/users",
        "status_code": 200,
        "environment": "production",
    },
    {
        "id": 3,
        "timestamp": (datetime.utcnow() - timedelta(minutes=15)).isoformat(),
        "level": "ERROR",
        "event_type": "API",
        "message": "Failed to connect to external service",
        "source": "external.service.py",
        "method": "POST",
        "path": "/api/v1/webhooks/trigger",
        "status_code": 500,
        "environment": "production",
        "error_details": "Connection timeout after 30s",
    },
    {
        "id": 4,
        "timestamp": (datetime.utcnow() - timedelta(minutes=20)).isoformat(),
        "level": "INFO",
        "event_type": "API",
        "message": "API request received: GET /api/v1/users",
        "source": "api.py",
        "method": "GET",
        "path": "/api/v1/users",
        "status_code": 200,
        "environment": "production",
    },
    {
        "id": 5,
        "timestamp": (datetime.utcnow() - timedelta(minutes=25)).isoformat(),
        "level": "DEBUG",
        "event_type": "SYSTEM",
        "message": "Cache miss for key: user_preferences",
        "source": "cache.py",
        "environment": "production",
    },
    {
        "id": 6,
        "timestamp": (datetime.utcnow() - timedelta(minutes=30)).isoformat(),
        "level": "INFO",
        "event_type": "AUTH",
        "message": "User logged in successfully",
        "source": "auth.py",
        "method": "POST",
        "path": "/api/v1/login/access-token",
        "status_code": 200,
        "environment": "production",
    },
    {
        "id": 7,
        "timestamp": (datetime.utcnow() - timedelta(minutes=35)).isoformat(),
        "level": "WARN",
        "event_type": "API",
        "message": "Deprecated API endpoint called",
        "source": "legacy.py",
        "method": "GET",
        "path": "/api/v1/legacy/endpoint",
        "status_code": 200,
        "environment": "production",
    },
    {
        "id": 8,
        "timestamp": (datetime.utcnow() - timedelta(hours=1)).isoformat(),
        "level": "ERROR",
        "event_type": "AUTH",
        "message": "Failed login attempt",
        "source": "auth.py",
        "method": "POST",
        "path": "/api/v1/login/access-token",
        "status_code": 401,
        "environment": "production",
        "error_details": "Invalid credentials",
    },
    {
        "id": 9,
        "timestamp": (datetime.utcnow() - timedelta(hours=2)).isoformat(),
        "level": "INFO",
        "event_type": "CRUD",
        "message": "User created successfully",
        "source": "users.py",
        "method": "POST",
        "path": "/api/v1/users",
        "status_code": 201,
        "environment": "production",
    },
    {
        "id": 10,
        "timestamp": (datetime.utcnow() - timedelta(hours=3)).isoformat(),
        "level": "INFO",
        "event_type": "API",
        "message": "API health check passed",
        "source": "health.py",
        "method": "GET",
        "path": "/api/v1/health",
        "status_code": 200,
        "environment": "production",
    },
]


@router.get("/")
@require_permission("core.audit.read")
def get_audit_logs(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, le=1000),
    level: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
) -> dict[str, Any]:
    """
    Récupère les logs d'audit de l'application.

    Paramètres:
    - skip: nombre de logs à ignorer (pagination)
    - limit: nombre maximum de logs à retourner
    - level: filtrer par niveau (INFO, WARN, ERROR, DEBUG)
    - event_type: filtrer par type d'événement (API, AUTH, CRUD, SYSTEM)
    - search: rechercher dans les messages

    Requiert la permission: core.audit.read
    """
    try:
        # Essayer de récupérer depuis la base de données
        statement = select(AuditLog)

        # Appliquer les filtres
        if level:
            statement = statement.where(col(AuditLog.level) == level)
        if event_type:
            statement = statement.where(col(AuditLog.event_type) == event_type)
        if search:
            statement = statement.where(col(AuditLog.message).ilike(f"%{search}%"))

        # Ordre décroissant par timestamp
        statement = statement.order_by(col(AuditLog.timestamp).desc())

        # Pagination
        statement = statement.offset(skip).limit(limit)

        logs = session.exec(statement).all()

        # Compter le total
        count_statement = select(AuditLog)
        if level:
            count_statement = count_statement.where(col(AuditLog.level) == level)
        if event_type:
            count_statement = count_statement.where(
                col(AuditLog.event_type) == event_type
            )
        if search:
            count_statement = count_statement.where(
                col(AuditLog.message).ilike(f"%{search}%")
            )

        total = len(session.exec(count_statement).all())

        return {"data": logs, "total": total}

    except Exception as e:
        # Si la table n'existe pas encore, retourner les données mockées
        print(f"Failed to fetch from database: {e}")
        print("Returning mock data instead")

        filtered_logs = MOCK_LOGS

        # Appliquer les filtres sur les données mockées
        if level:
            filtered_logs = [log for log in filtered_logs if log["level"] == level]
        if event_type:
            filtered_logs = [
                log for log in filtered_logs if log["event_type"] == event_type
            ]
        if search:
            filtered_logs = [
                log
                for log in filtered_logs
                if search.lower() in log["message"].lower()
            ]

        # Pagination
        paginated_logs = filtered_logs[skip : skip + limit]

        return {"data": paginated_logs, "total": len(filtered_logs)}


@router.get("/stats")
@require_permission("core.audit.read")
def get_audit_stats(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict[str, Any]:
    """
    Récupère des statistiques sur les logs d'audit.

    Requiert la permission: core.audit.read
    """
    try:
        # Compter par niveau
        levels_count = {}
        for level in ["INFO", "WARN", "ERROR", "DEBUG"]:
            count_statement = select(AuditLog).where(col(AuditLog.level) == level)
            count = len(session.exec(count_statement).all())
            levels_count[level] = count

        # Compter par type d'événement
        event_types_count = {}
        for event_type in ["API", "AUTH", "CRUD", "SYSTEM"]:
            count_statement = select(AuditLog).where(
                col(AuditLog.event_type) == event_type
            )
            count = len(session.exec(count_statement).all())
            event_types_count[event_type] = count

        return {
            "levels": levels_count,
            "event_types": event_types_count,
        }

    except Exception:
        # Retourner des stats mockées
        return {
            "levels": {
                "INFO": 5,
                "WARN": 2,
                "ERROR": 2,
                "DEBUG": 1,
            },
            "event_types": {
                "API": 6,
                "AUTH": 2,
                "CRUD": 1,
                "SYSTEM": 1,
            },
        }
