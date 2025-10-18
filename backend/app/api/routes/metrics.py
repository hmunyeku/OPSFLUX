"""
Routes API pour le Metrics Service.
"""

from typing import Any
from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, SessionDep
from app.core.metrics_service import metrics_service
from app.core.rbac import require_permission
from app.core.hook_trigger_service import hook_trigger
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
@require_permission("core.metrics.read")
async def get_metrics_stats(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Récupère les statistiques de toutes les métriques.

    Requiert la permission: core.metrics.read
    """
    stats = metrics_service.get_stats()
    return stats


@router.post("/reset")
@require_permission("core.metrics.delete")
async def reset_metrics(
    current_user: CurrentUser,
    session: SessionDep,
) -> Any:
    """
    Réinitialise toutes les métriques.

    ATTENTION: Opération destructive!

    Requiert la permission: core.metrics.delete
    """
    metrics_service.reset_all()

    # Trigger hook: metrics.reset
    try:
        await hook_trigger.trigger_event(
            event="metrics.reset",
            context={
                "user_id": str(current_user.id),
                "reset_by": str(current_user.id),
            },
            db=session,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to trigger metrics.reset hook: {e}")

    return {
        "success": True,
        "message": "All metrics reset",
    }
