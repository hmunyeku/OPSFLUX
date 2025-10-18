"""
Routes API pour le Metrics Service.
"""

from typing import Any
from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, get_current_active_superuser
from app.core.metrics_service import metrics_service
from app.models import User


router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("")
async def get_metrics_prometheus(
    response: Response,
) -> str:
    """
    Exporte les métriques au format Prometheus.

    Cet endpoint est appelé par Prometheus pour scraper les métriques.
    Public (pas d'auth) pour Prometheus.
    """
    prometheus_output = metrics_service.export_prometheus()

    # Content-Type pour Prometheus
    response.headers["Content-Type"] = "text/plain; version=0.0.4"

    return prometheus_output


@router.get("/stats")
async def get_metrics_stats(
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Récupère les statistiques de toutes les métriques.

    Requiert les privilèges superuser.
    """
    stats = metrics_service.get_stats()
    return stats


@router.post("/reset")
async def reset_metrics(
    current_user: CurrentUser,
    _: User = Depends(get_current_active_superuser),
) -> Any:
    """
    Réinitialise toutes les métriques.

    ATTENTION: Opération destructive!

    Requiert les privilèges superuser.
    """
    metrics_service.reset_all()

    return {
        "success": True,
        "message": "All metrics reset",
    }
