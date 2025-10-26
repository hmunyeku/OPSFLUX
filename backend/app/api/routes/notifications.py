"""
Routes API REST pour les notifications.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.models import Message
from app.models_notifications import (
    NotificationCreate,
    NotificationPriority,
    NotificationPublic,
    NotificationsPublic,
    NotificationType,
    NotificationUpdate,
    NotificationPreferencesPublic,
    NotificationPreferencesUpdate,
    UserNotificationPreferences,
)
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=NotificationsPublic)
def get_notifications(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    notification_type: Optional[NotificationType] = None,
) -> Any:
    """
    Récupère les notifications de l'utilisateur connecté.

    Args:
        skip: Nombre de notifications à sauter (pagination)
        limit: Nombre maximum de notifications à retourner
        unread_only: Si True, ne retourne que les notifications non lues
        notification_type: Filtre optionnel par type de notification
    """
    notifications, count = notification_service.get_user_notifications(
        session=session,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        unread_only=unread_only,
        notification_type=notification_type,
    )

    return NotificationsPublic(data=notifications, count=count)


@router.get("/unread-count", response_model=dict)
def get_unread_count(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Retourne le nombre de notifications non lues.
    """
    count = notification_service.get_unread_count(
        session=session,
        user_id=current_user.id,
    )

    return {"count": count}


@router.post(
    "/",
    dependencies=[Depends(get_current_active_superuser)],
    response_model=NotificationPublic,
)
async def create_notification(
    session: SessionDep,
    notification_in: NotificationCreate,
) -> Any:
    """
    Crée une nouvelle notification (admin uniquement).

    La notification sera automatiquement envoyée via WebSocket
    à l'utilisateur concerné s'il est connecté.
    """
    notification = await notification_service.create_notification(
        session=session,
        notification_data=notification_in,
        send_websocket=True,
    )

    return notification


@router.patch("/{notification_id}", response_model=NotificationPublic)
def update_notification(
    session: SessionDep,
    current_user: CurrentUser,
    notification_id: UUID,
    notification_in: NotificationUpdate,
) -> Any:
    """
    Met à jour une notification (actuellement, seul le statut 'read' peut être modifié).
    """
    if notification_in.read is not None:
        notification = notification_service.mark_notification_as_read(
            session=session,
            notification_id=notification_id,
            user_id=current_user.id,
        )

        if not notification:
            raise HTTPException(
                status_code=404,
                detail="Notification non trouvée",
            )

        return notification

    raise HTTPException(
        status_code=400,
        detail="Aucune mise à jour valide fournie",
    )


@router.post("/mark-all-read", response_model=Message)
def mark_all_notifications_as_read(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Marque toutes les notifications de l'utilisateur comme lues.
    """
    count = notification_service.mark_all_as_read(
        session=session,
        user_id=current_user.id,
    )

    return Message(message=f"{count} notification(s) marquée(s) comme lue(s)")


@router.delete("/{notification_id}", response_model=Message)
def delete_notification(
    session: SessionDep,
    current_user: CurrentUser,
    notification_id: UUID,
) -> Any:
    """
    Supprime une notification.
    """
    deleted = notification_service.delete_notification(
        session=session,
        notification_id=notification_id,
        user_id=current_user.id,
    )

    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Notification non trouvée",
        )

    return Message(message="Notification supprimée avec succès")


@router.post("/test", response_model=NotificationPublic)
async def create_test_notification(
    session: SessionDep,
    current_user: CurrentUser,
    notification_type: NotificationType = NotificationType.INFO,
    priority: NotificationPriority = NotificationPriority.NORMAL,
) -> Any:
    """
    Crée une notification de test pour l'utilisateur connecté.
    Utile pour tester le système de notifications.
    """
    test_messages = {
        NotificationType.INFO: "Ceci est une notification d'information de test",
        NotificationType.SUCCESS: "Opération de test réussie !",
        NotificationType.WARNING: "Ceci est un avertissement de test",
        NotificationType.ERROR: "Ceci est une erreur de test",
        NotificationType.SYSTEM: "Notification système de test",
    }

    notification_data = NotificationCreate(
        user_id=current_user.id,
        title=f"Test - {notification_type.value.capitalize()}",
        message=test_messages[notification_type],
        type=notification_type,
        priority=priority,
        notification_metadata={"test": True},
    )

    notification = await notification_service.create_notification(
        session=session,
        notification_data=notification_data,
        send_websocket=True,
    )

    return notification


# ========================================
# Notification Preferences Routes
# ========================================

@router.get("/preferences", response_model=NotificationPreferencesPublic)
def get_notification_preferences(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère les préférences de notifications de l'utilisateur connecté.
    Si aucune préférence n'existe, retourne les valeurs par défaut.
    """
    from sqlmodel import select

    # Chercher les préférences existantes
    statement = select(UserNotificationPreferences).where(
        UserNotificationPreferences.user_id == current_user.id
    )
    preferences = session.exec(statement).first()

    # Si aucune préférence n'existe, créer avec les valeurs par défaut
    if not preferences:
        preferences = UserNotificationPreferences(
            user_id=current_user.id,
            notification_type="mentions",
            mobile_enabled=False,
            communication_emails=False,
            social_emails=True,
            marketing_emails=False,
            security_emails=True,
        )
        session.add(preferences)
        session.commit()
        session.refresh(preferences)

    return preferences


@router.put("/preferences", response_model=NotificationPreferencesPublic)
def update_notification_preferences(
    session: SessionDep,
    current_user: CurrentUser,
    preferences_in: NotificationPreferencesUpdate,
) -> Any:
    """
    Met à jour les préférences de notifications de l'utilisateur.
    Crée les préférences si elles n'existent pas encore.
    """
    from sqlmodel import select
    from datetime import datetime

    # Chercher les préférences existantes
    statement = select(UserNotificationPreferences).where(
        UserNotificationPreferences.user_id == current_user.id
    )
    preferences = session.exec(statement).first()

    if not preferences:
        # Créer de nouvelles préférences
        preferences = UserNotificationPreferences(
            user_id=current_user.id,
        )
        session.add(preferences)

    # Mettre à jour les champs fournis
    update_data = preferences_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(preferences, key, value)

    # Toujours forcer security_emails à True
    preferences.security_emails = True
    preferences.updated_at = datetime.utcnow()

    session.add(preferences)
    session.commit()
    session.refresh(preferences)

    return preferences


@router.delete("/preferences", response_model=Message)
def reset_notification_preferences(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Réinitialise les préférences de notifications aux valeurs par défaut.
    """
    from sqlmodel import select

    statement = select(UserNotificationPreferences).where(
        UserNotificationPreferences.user_id == current_user.id
    )
    preferences = session.exec(statement).first()

    if preferences:
        session.delete(preferences)
        session.commit()

    return Message(message="Préférences réinitialisées aux valeurs par défaut")
