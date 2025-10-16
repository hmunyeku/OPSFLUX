"""
Service pour le module HSE.

Ce service EXPLOITE les services CORE :
- NotificationService (notifications)
- EmailService (emails)
- AuditService (audit logs)
- FileManager (gestion fichiers)
"""

from datetime import datetime
from uuid import UUID

from sqlmodel import Session, select, func
from fastapi import HTTPException

from app.models import User

# Import du modèle du module
from .models import (
    Incident,
    IncidentType,
    IncidentSeverity,
    IncidentCreate,
    IncidentUpdate,
)


class HSEService:
    """
    Service métier pour le module HSE.

    EXPLOITE les services CORE pour toutes les fonctionnalités transversales.
    """

    @staticmethod
    def _calculate_severity_level(severity: int) -> IncidentSeverity:
        """Calcule le niveau de sévérité basé sur le score"""
        if severity <= 3:
            return IncidentSeverity.LOW
        elif severity <= 6:
            return IncidentSeverity.MEDIUM
        elif severity <= 8:
            return IncidentSeverity.HIGH
        else:
            return IncidentSeverity.CRITICAL

    @staticmethod
    def _generate_incident_number(session: Session) -> str:
        """
        Génère un numéro d'incident unique.

        Format: HSE-YYYY-NNN
        Exemple: HSE-2024-001

        EXPLOITE le service Settings CORE pour obtenir le préfixe configuré.
        """
        # TODO: Intégrer avec SettingsService CORE pour obtenir le préfixe
        prefix = "HSE-"
        year = datetime.now().year

        # Compter les incidents de l'année
        count_statement = select(func.count()).select_from(Incident).where(
            Incident.number.like(f"{prefix}{year}-%")
        )
        count = session.exec(count_statement).one()

        # Générer le numéro
        number = f"{prefix}{year}-{str(count + 1).zfill(3)}"
        return number

    @staticmethod
    def create_incident(
        session: Session,
        incident_data: IncidentCreate,
        created_by: User
    ) -> Incident:
        """
        Crée un nouvel incident HSE.

        EXPLOITE les services CORE :
        - NotificationService pour notifier les managers HSE
        - EmailService pour envoyer des emails si critique
        - AuditService pour logger l'action
        - HookService pour déclencher les hooks (hse.incident.created)

        Args:
            session: Session DB
            incident_data: Données de l'incident
            created_by: Utilisateur créateur

        Returns:
            Incident créé
        """
        # Générer le numéro
        number = HSEService._generate_incident_number(session)

        # Calculer le niveau de sévérité
        severity_level = HSEService._calculate_severity_level(incident_data.severity)

        # Déterminer si investigation requise (sévérité >= 7)
        requires_investigation = incident_data.severity >= 7

        # Créer l'incident
        incident = Incident(
            number=number,
            type=incident_data.type,
            severity=incident_data.severity,
            severity_level=severity_level,
            title=incident_data.title,
            description=incident_data.description,
            location=incident_data.location,
            site_id=incident_data.site_id,
            incident_date=incident_data.incident_date,
            reported_by_id=created_by.id,
            witnesses=incident_data.witnesses,
            injured_persons=incident_data.injured_persons,
            requires_investigation=requires_investigation,
            created_by_id=created_by.id,
        )

        session.add(incident)
        session.commit()
        session.refresh(incident)

        # TODO: EXPLOITER NotificationService CORE
        # NotificationService.send(
        #     user_ids=[...managers_hse...],
        #     title="Nouvel incident HSE",
        #     message=f"Incident {incident.number} : {incident.title}",
        #     type="info" if severity_level != IncidentSeverity.CRITICAL else "alert"
        # )

        # TODO: EXPLOITER EmailService CORE si critique
        # if severity_level == IncidentSeverity.CRITICAL:
        #     EmailService.send(
        #         to=["hse-team@company.com"],
        #         template="hse_critical_incident",
        #         context={"incident": incident}
        #     )

        # TODO: EXPLOITER AuditService CORE
        # AuditService.log(
        #     action="hse.incident.created",
        #     resource_type="incident",
        #     resource_id=incident.id,
        #     user_id=created_by.id,
        #     details={"number": incident.number, "severity": incident.severity}
        # )

        # TODO: EXPLOITER HookService CORE pour déclencher les hooks
        # HookService.trigger_event(
        #     session=session,
        #     event="hse.incident.created",
        #     context={
        #         "incident": {
        #             "id": str(incident.id),
        #             "number": incident.number,
        #             "title": incident.title,
        #             "severity": incident.severity,
        #             "type": incident.type
        #         }
        #     }
        # )

        return incident

    @staticmethod
    def update_incident(
        session: Session,
        incident_id: UUID,
        incident_data: IncidentUpdate,
        updated_by: User
    ) -> Incident:
        """
        Met à jour un incident HSE.

        EXPLOITE AuditService CORE pour logger toutes les modifications.
        """
        incident = session.get(Incident, incident_id)
        if not incident or incident.deleted_at:
            raise HTTPException(status_code=404, detail="Incident not found")

        # Mettre à jour les champs fournis
        update_dict = incident_data.model_dump(exclude_unset=True)

        # Recalculer severity_level si severity change
        if "severity" in update_dict:
            update_dict["severity_level"] = HSEService._calculate_severity_level(
                update_dict["severity"]
            )

        # Gérer la clôture
        if update_dict.get("is_closed") and not incident.is_closed:
            update_dict["closed_at"] = datetime.utcnow()
            update_dict["closed_by_id"] = updated_by.id

        for key, value in update_dict.items():
            setattr(incident, key, value)

        incident.updated_by_id = updated_by.id

        session.add(incident)
        session.commit()
        session.refresh(incident)

        # TODO: EXPLOITER AuditService CORE
        # AuditService.log(
        #     action="hse.incident.updated",
        #     resource_type="incident",
        #     resource_id=incident.id,
        #     user_id=updated_by.id,
        #     details=update_dict
        # )

        # TODO: EXPLOITER HookService CORE
        # HookService.trigger_event(
        #     session=session,
        #     event="hse.incident.updated",
        #     context={"incident": {...}}
        # )

        return incident

    @staticmethod
    def get_incidents(
        session: Session,
        skip: int = 0,
        limit: int = 100,
        type: IncidentType | None = None,
        severity_level: IncidentSeverity | None = None,
        is_closed: bool | None = None,
    ) -> tuple[list[Incident], int]:
        """
        Récupère la liste des incidents avec filtres.

        Returns:
            Tuple (incidents, count)
        """
        statement = select(Incident).where(Incident.deleted_at == None)  # noqa: E711

        if type:
            statement = statement.where(Incident.type == type)
        if severity_level:
            statement = statement.where(Incident.severity_level == severity_level)
        if is_closed is not None:
            statement = statement.where(Incident.is_closed == is_closed)

        # Compter le total
        count_statement = select(func.count()).select_from(statement.subquery())
        count = session.exec(count_statement).one()

        # Récupérer avec pagination
        statement = (
            statement
            .order_by(Incident.incident_date.desc())
            .offset(skip)
            .limit(limit)
        )
        incidents = session.exec(statement).all()

        return list(incidents), count

    @staticmethod
    def delete_incident(
        session: Session,
        incident_id: UUID,
        deleted_by: User
    ) -> None:
        """
        Supprime (soft delete) un incident.

        EXPLOITE AuditService CORE pour logger la suppression.
        """
        incident = session.get(Incident, incident_id)
        if not incident or incident.deleted_at:
            raise HTTPException(status_code=404, detail="Incident not found")

        # Soft delete
        incident.deleted_at = datetime.utcnow()
        incident.deleted_by_id = deleted_by.id

        session.add(incident)
        session.commit()

        # TODO: EXPLOITER AuditService CORE
        # AuditService.log(
        #     action="hse.incident.deleted",
        #     resource_type="incident",
        #     resource_id=incident.id,
        #     user_id=deleted_by.id
        # )

    @staticmethod
    def get_statistics(session: Session) -> dict:
        """
        Récupère les statistiques HSE.

        Returns:
            Dictionnaire avec les stats
        """
        total = session.exec(
            select(func.count()).select_from(Incident).where(Incident.deleted_at == None)
        ).one()

        open_incidents = session.exec(
            select(func.count()).select_from(Incident).where(
                Incident.deleted_at == None,
                Incident.is_closed == False
            )
        ).one()

        critical = session.exec(
            select(func.count()).select_from(Incident).where(
                Incident.deleted_at == None,
                Incident.severity_level == IncidentSeverity.CRITICAL,
                Incident.is_closed == False
            )
        ).one()

        pending_investigation = session.exec(
            select(func.count()).select_from(Incident).where(
                Incident.deleted_at == None,
                Incident.requires_investigation == True,
                Incident.investigation_completed_at == None
            )
        ).one()

        return {
            "total": total,
            "open": open_incidents,
            "closed": total - open_incidents,
            "critical": critical,
            "pending_investigation": pending_investigation,
        }
