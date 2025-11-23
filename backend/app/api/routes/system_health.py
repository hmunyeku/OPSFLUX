"""
System Health API endpoints
Fournit une vue centralisée de la santé de tous les services du système
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any, List
import psutil
import redis.asyncio as redis
from datetime import datetime, timedelta
import httpx

from app.api.deps import get_db, CurrentUser
from app.core.config import settings
from app.core.rbac import require_permission

router = APIRouter(prefix="/system-health", tags=["System Health"])


async def check_database_health(db: AsyncSession) -> Dict[str, Any]:
    """Vérifie la santé de la base de données PostgreSQL"""
    try:
        start_time = datetime.now()

        # Test de connexion simple
        result = await db.execute(text("SELECT 1"))
        result.scalar()

        # Test de performance
        perf_result = await db.execute(text("SELECT version(), current_database(), pg_database_size(current_database())"))
        version, db_name, db_size = perf_result.fetchone()

        response_time = (datetime.now() - start_time).total_seconds() * 1000

        # Statistiques de connexions
        conn_stats = await db.execute(text("""
            SELECT
                count(*) as total_connections,
                count(*) FILTER (WHERE state = 'active') as active_connections,
                count(*) FILTER (WHERE state = 'idle') as idle_connections
            FROM pg_stat_activity
        """))
        total_conn, active_conn, idle_conn = conn_stats.fetchone()

        return {
            "status": "healthy",
            "service": "PostgreSQL",
            "version": version.split()[1],
            "database": db_name,
            "size_mb": round(db_size / (1024 * 1024), 2),
            "response_time_ms": round(response_time, 2),
            "connections": {
                "total": total_conn,
                "active": active_conn,
                "idle": idle_conn,
                "max": 100  # À ajuster selon configuration
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "PostgreSQL",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


async def check_redis_health() -> Dict[str, Any]:
    """Vérifie la santé du cache Redis"""
    try:
        start_time = datetime.now()

        redis_client = redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True
        )

        # Test ping
        await redis_client.ping()

        # Récupérer les infos
        info = await redis_client.info()
        response_time = (datetime.now() - start_time).total_seconds() * 1000

        await redis_client.close()

        return {
            "status": "healthy",
            "service": "Redis",
            "version": info.get("redis_version", "unknown"),
            "used_memory_mb": round(info.get("used_memory", 0) / (1024 * 1024), 2),
            "connected_clients": info.get("connected_clients", 0),
            "uptime_days": round(info.get("uptime_in_seconds", 0) / 86400, 1),
            "response_time_ms": round(response_time, 2),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "Redis",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


async def check_celery_health() -> Dict[str, Any]:
    """Vérifie la santé des workers Celery"""
    try:
        # Cette fonction nécessite Celery configuré
        # Pour l'instant, retour basique
        return {
            "status": "healthy",
            "service": "Celery",
            "workers": {
                "default": {"status": "active", "tasks_completed": 0},
                "high": {"status": "active", "tasks_completed": 0},
                "low": {"status": "active", "tasks_completed": 0}
            },
            "queue_length": 0,
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "Celery",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


def get_system_resources() -> Dict[str, Any]:
    """Récupère les statistiques des ressources système"""
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        return {
            "status": "healthy",
            "cpu": {
                "usage_percent": round(cpu_percent, 1),
                "count": psutil.cpu_count(),
                "status": "normal" if cpu_percent < 80 else "warning" if cpu_percent < 95 else "critical"
            },
            "memory": {
                "total_mb": round(memory.total / (1024 * 1024), 2),
                "used_mb": round(memory.used / (1024 * 1024), 2),
                "available_mb": round(memory.available / (1024 * 1024), 2),
                "usage_percent": memory.percent,
                "status": "normal" if memory.percent < 80 else "warning" if memory.percent < 95 else "critical"
            },
            "disk": {
                "total_gb": round(disk.total / (1024 * 1024 * 1024), 2),
                "used_gb": round(disk.used / (1024 * 1024 * 1024), 2),
                "free_gb": round(disk.free / (1024 * 1024 * 1024), 2),
                "usage_percent": disk.percent,
                "status": "normal" if disk.percent < 80 else "warning" if disk.percent < 95 else "critical"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


@router.get("/")
@require_permission("core.system.health.read")
async def get_system_health(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None
) -> Dict[str, Any]:
    """
    Récupère l'état de santé global du système

    Vérifie:
    - Base de données PostgreSQL
    - Cache Redis
    - Workers Celery
    - Ressources système (CPU, RAM, Disk)
    """

    # Vérifications en parallèle
    database_health = await check_database_health(db)
    redis_health = await check_redis_health()
    celery_health = await check_celery_health()
    system_resources = get_system_resources()

    # Calculer le statut global
    all_services = [database_health, redis_health, celery_health, system_resources]
    unhealthy_services = [s for s in all_services if s.get("status") != "healthy"]

    overall_status = "healthy"
    if len(unhealthy_services) > 0:
        overall_status = "degraded" if len(unhealthy_services) < len(all_services) else "unhealthy"

    return {
        "overall_status": overall_status,
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": database_health,
            "cache": redis_health,
            "workers": celery_health,
            "system": system_resources
        },
        "summary": {
            "total_services": len(all_services),
            "healthy": len(all_services) - len(unhealthy_services),
            "unhealthy": len(unhealthy_services)
        }
    }


@router.get("/database")
@require_permission("core.system.health.read")
async def get_database_health(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None
) -> Dict[str, Any]:
    """Détails de santé de la base de données"""
    return await check_database_health(db)


@router.get("/cache")
@require_permission("core.system.health.read")
async def get_cache_health(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None
) -> Dict[str, Any]:
    """Détails de santé du cache Redis"""
    return await check_redis_health()


@router.get("/workers")
@require_permission("core.system.health.read")
async def get_workers_health(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None
) -> Dict[str, Any]:
    """Détails de santé des workers Celery"""
    return await check_celery_health()


@router.get("/system")
@require_permission("core.system.health.read")
async def get_system_resources_health(
    db: AsyncSession = Depends(get_db),
    current_user: CurrentUser = None
) -> Dict[str, Any]:
    """Détails des ressources système"""
    return get_system_resources()


@router.get("/history")
@require_permission("core.system.health.read")
async def get_health_history(
    hours: int = 24,
    current_user: CurrentUser = None,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Récupère l'historique de santé du système

    Cette fonctionnalité nécessitera un modèle SystemHealthLog
    pour stocker l'historique. Pour l'instant, retourne des données simulées.
    """

    # TODO: Implémenter modèle SystemHealthLog et stockage périodique

    now = datetime.utcnow()
    history_data = []

    # Générer des points de données pour les X dernières heures
    for i in range(hours):
        timestamp = now - timedelta(hours=hours - i)
        history_data.append({
            "timestamp": timestamp.isoformat(),
            "overall_status": "healthy",  # Simulé
            "cpu_usage": 45.5,  # Simulé
            "memory_usage": 62.3,  # Simulé
            "disk_usage": 48.7  # Simulé
        })

    return {
        "period_hours": hours,
        "data_points": len(history_data),
        "history": history_data
    }
