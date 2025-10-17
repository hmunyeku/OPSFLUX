"""
Routes API pour le module HSE.

Expose les endpoints REST pour la gestion des incidents HSE.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Message, User

# Import des modèles et services du module
# NOTE: Imports absolus car le module est chargé dynamiquement
import models
import service as hse_service

Incident = models.Incident
IncidentType = models.IncidentType
IncidentSeverity = models.IncidentSeverity
IncidentCreate = models.IncidentCreate
IncidentUpdate = models.IncidentUpdate
IncidentPublic = models.IncidentPublic
IncidentsPublic = models.IncidentsPublic
HSEService = hse_service.HSEService


router = APIRouter(prefix="/hse", tags=["hse"])


@router.get("/incidents/", response_model=IncidentsPublic)
def read_incidents(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    type: IncidentType | None = None,
    severity_level: IncidentSeverity | None = None,
    is_closed: bool | None = None,
) -> Any:
    """
    Récupère la liste des incidents HSE.

    Filtres:
    - type: Type d'incident (near_miss, injury, environmental, etc.)
    - severity_level: Niveau de sévérité (low, medium, high, critical)
    - is_closed: Statut fermé ou non
    """
    # TODO: Vérifier permission hse.view.incident

    incidents, count = HSEService.get_incidents(
        session=session,
        skip=skip,
        limit=limit,
        type=type,
        severity_level=severity_level,
        is_closed=is_closed,
    )

    # Convertir vers modèle public
    public_incidents = [
        IncidentPublic(
            id=incident.id,
            number=incident.number,
            type=incident.type,
            severity=incident.severity,
            severity_level=incident.severity_level,
            title=incident.title,
            description=incident.description,
            location=incident.location,
            site_id=incident.site_id,
            incident_date=incident.incident_date,
            witnesses=incident.witnesses,
            injured_persons=incident.injured_persons,
            requires_investigation=incident.requires_investigation,
            is_closed=incident.is_closed,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
        )
        for incident in incidents
    ]

    return IncidentsPublic(data=public_incidents, count=count)


@router.get("/incidents/stats")
def get_incidents_stats(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère les statistiques HSE.
    """
    # TODO: Vérifier permission hse.view.dashboard
    return HSEService.get_statistics(session)


@router.post("/incidents/", response_model=IncidentPublic)
def create_incident(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    incident_in: IncidentCreate,
) -> Any:
    """
    Crée un nouvel incident HSE.

    Déclenche automatiquement :
    - Génération du numéro (HSE-YYYY-NNN)
    - Notification des managers HSE
    - Email si critique
    - Hooks hse.incident.created
    """
    # TODO: Vérifier permission hse.create.incident

    incident = HSEService.create_incident(
        session=session,
        incident_data=incident_in,
        created_by=current_user
    )

    return IncidentPublic(
        id=incident.id,
        number=incident.number,
        type=incident.type,
        severity=incident.severity,
        severity_level=incident.severity_level,
        title=incident.title,
        description=incident.description,
        location=incident.location,
        site_id=incident.site_id,
        incident_date=incident.incident_date,
        witnesses=incident.witnesses,
        injured_persons=incident.injured_persons,
        requires_investigation=incident.requires_investigation,
        is_closed=incident.is_closed,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.get("/incidents/{incident_id}", response_model=IncidentPublic)
def read_incident(
    incident_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère un incident spécifique par ID.
    """
    # TODO: Vérifier permission hse.view.incident

    incident = session.get(Incident, incident_id)
    if not incident or incident.deleted_at:
        raise HTTPException(status_code=404, detail="Incident not found")

    return IncidentPublic(
        id=incident.id,
        number=incident.number,
        type=incident.type,
        severity=incident.severity,
        severity_level=incident.severity_level,
        title=incident.title,
        description=incident.description,
        location=incident.location,
        site_id=incident.site_id,
        incident_date=incident.incident_date,
        witnesses=incident.witnesses,
        injured_persons=incident.injured_persons,
        requires_investigation=incident.requires_investigation,
        is_closed=incident.is_closed,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.patch("/incidents/{incident_id}", response_model=IncidentPublic)
def update_incident(
    *,
    incident_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    incident_in: IncidentUpdate,
) -> Any:
    """
    Met à jour un incident HSE.

    Déclenche automatiquement :
    - Audit log des modifications
    - Hooks hse.incident.updated
    """
    # TODO: Vérifier permission hse.edit.incident

    incident = HSEService.update_incident(
        session=session,
        incident_id=incident_id,
        incident_data=incident_in,
        updated_by=current_user
    )

    return IncidentPublic(
        id=incident.id,
        number=incident.number,
        type=incident.type,
        severity=incident.severity,
        severity_level=incident.severity_level,
        title=incident.title,
        description=incident.description,
        location=incident.location,
        site_id=incident.site_id,
        incident_date=incident.incident_date,
        witnesses=incident.witnesses,
        injured_persons=incident.injured_persons,
        requires_investigation=incident.requires_investigation,
        is_closed=incident.is_closed,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.delete("/incidents/{incident_id}", response_model=Message)
def delete_incident(
    incident_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Supprime un incident HSE (soft delete).
    """
    # TODO: Vérifier permission hse.delete.incident

    HSEService.delete_incident(
        session=session,
        incident_id=incident_id,
        deleted_by=current_user
    )

    return Message(message="Incident deleted successfully")
