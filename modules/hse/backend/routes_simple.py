"""
Routes API pour le module HSE - Version HOT RELOAD.

IMPORTANT: Ce fichier N'IMPORTE PAS models.py pour éviter les conflits SQLAlchemy.
Les modèles sont importés depuis app.models (ajoutés via migration Alembic).
"""

from typing import Any
from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/api/v1/hse", tags=["hse"])


@router.get("/")
def hse_root(
    current_user: CurrentUser,
) -> Any:
    """
    Endpoint racine du module HSE.
    Retourne les informations sur le module.
    """
    return {
        "module": "HSE Reports",
        "version": "1.0.0",
        "description": "Gestion des incidents et rapports HSE",
        "status": "active",
        "endpoints": [
            "/api/v1/hse/",
            "/api/v1/hse/health",
        ]
    }


@router.get("/health")
def hse_health() -> Any:
    """
    Health check du module HSE.
    """
    return {
        "status": "healthy",
        "module": "hse",
        "version": "1.0.0"
    }


# TODO: Ajouter les endpoints CRUD pour les incidents
# Une fois que les modèles seront dans app.models via migration:
# - GET /incidents/ - Liste des incidents
# - POST /incidents/ - Créer un incident
# - GET /incidents/{id} - Détails d'un incident
# - PATCH /incidents/{id} - Mettre à jour un incident
# - DELETE /incidents/{id} - Supprimer un incident
# - GET /incidents/stats - Statistiques HSE
