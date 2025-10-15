"""
Service pour la gestion des notifications.
"""

import json
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from sqlmodel import Session, col, select

from app.core.websocket_manager import manager
from app.models_notifications import (
    Notification,
    NotificationCreate,
    NotificationPriority,
    NotificationType,
    WebSocketMessage,
)


async def create_notification(
    session: Session,
    notification_data: NotificationCreate,
    send_websocket: bool = True,
) -> Notification:
    """
    Crée une notification et l'envoie via WebSocket si demandé.

    Args:
        session: Session de base de données
        notification_data: Données de la notification
        send_websocket: Si True, envoie la notification via WebSocket

    Returns:
        Notification créée
    """
    # Créer la notification en base de données
    notification = Notification.model_validate(notification_data)
    session.add(notification)
    session.commit()
    session.refresh(notification)

    # Envoyer via WebSocket si demandé
    if send_websocket:
        await send_notification_websocket(notification)

    return notification


async def send_notification_websocket(notification: Notification):
    """
    Envoie une notification via WebSocket à l'utilisateur concerné.

    Args:
        notification: Notification à envoyer
    """
    message = WebSocketMessage(
        type="notification",
        data={
            "id": str(notification.id),
            "title": notification.title,
            "message": notification.message,
            "type": notification.type,
            "priority": notification.priority,
            "read": notification.read,
            "notification_metadata": notification.notification_metadata,
            "action_url": notification.action_url,
            "created_at": notification.created_at.isoformat(),
            "expires_at": notification.expires_at.isoformat()
            if notification.expires_at
            else None,
        },
    )

    await manager.send_personal_message(message.model_dump_json(), notification.user_id)


def get_user_notifications(
    session: Session,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    notification_type: Optional[NotificationType] = None,
) -> tuple[list[Notification], int]:
    """
    Récupère les notifications d'un utilisateur avec pagination.

    Args:
        session: Session de base de données
        user_id: ID de l'utilisateur
        skip: Nombre de notifications à sauter
        limit: Nombre maximum de notifications à retourner
        unread_only: Si True, ne retourne que les notifications non lues
        notification_type: Filtre par type de notification

    Returns:
        Tuple (liste des notifications, nombre total)
    """
    # Base query
    statement = select(Notification).where(Notification.user_id == user_id)

    # Filtrer par statut de lecture
    if unread_only:
        statement = statement.where(Notification.read == False)  # noqa: E712

    # Filtrer par type
    if notification_type:
        statement = statement.where(Notification.type == notification_type)

    # Filtrer les notifications expirées
    statement = statement.where(
        (Notification.expires_at == None)  # noqa: E711
        | (Notification.expires_at > datetime.now(timezone.utc))
    )

    # Compter le total
    count_statement = statement
    total = session.exec(
        select(col(Notification.id)).select_from(count_statement.subquery())
    ).all()
    count = len(total)

    # Récupérer les notifications avec pagination
    statement = statement.order_by(Notification.created_at.desc()).offset(skip).limit(limit)  # type: ignore
    notifications = session.exec(statement).all()

    return list(notifications), count


def mark_notification_as_read(
    session: Session, notification_id: UUID, user_id: UUID
) -> Optional[Notification]:
    """
    Marque une notification comme lue.

    Args:
        session: Session de base de données
        notification_id: ID de la notification
        user_id: ID de l'utilisateur (pour vérification)

    Returns:
        Notification mise à jour ou None si non trouvée
    """
    statement = select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id
    )
    notification = session.exec(statement).first()

    if notification and not notification.read:
        notification.read = True
        notification.read_at = datetime.now(timezone.utc)
        session.add(notification)
        session.commit()
        session.refresh(notification)

    return notification


def mark_all_as_read(session: Session, user_id: UUID) -> int:
    """
    Marque toutes les notifications d'un utilisateur comme lues.

    Args:
        session: Session de base de données
        user_id: ID de l'utilisateur

    Returns:
        Nombre de notifications mises à jour
    """
    statement = select(Notification).where(
        Notification.user_id == user_id, Notification.read == False  # noqa: E712
    )
    notifications = session.exec(statement).all()

    count = 0
    now = datetime.now(timezone.utc)
    for notification in notifications:
        notification.read = True
        notification.read_at = now
        session.add(notification)
        count += 1

    session.commit()
    return count


def delete_notification(
    session: Session, notification_id: UUID, user_id: UUID
) -> bool:
    """
    Supprime une notification.

    Args:
        session: Session de base de données
        notification_id: ID de la notification
        user_id: ID de l'utilisateur (pour vérification)

    Returns:
        True si supprimée, False sinon
    """
    statement = select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id
    )
    notification = session.exec(statement).first()

    if notification:
        session.delete(notification)
        session.commit()
        return True

    return False


def get_unread_count(session: Session, user_id: UUID) -> int:
    """
    Compte le nombre de notifications non lues pour un utilisateur.

    Args:
        session: Session de base de données
        user_id: ID de l'utilisateur

    Returns:
        Nombre de notifications non lues
    """
    statement = select(Notification).where(
        Notification.user_id == user_id,
        Notification.read == False,  # noqa: E712
        (Notification.expires_at == None)  # noqa: E711
        | (Notification.expires_at > datetime.now(timezone.utc)),
    )
    notifications = session.exec(statement).all()
    return len(notifications)


async def create_system_notification(
    session: Session,
    user_id: UUID,
    title: str,
    message: str,
    priority: NotificationPriority = NotificationPriority.NORMAL,
    notification_metadata: Optional[dict] = None,
    action_url: Optional[str] = None,
) -> Notification:
    """
    Crée une notification système.

    Args:
        session: Session de base de données
        user_id: ID de l'utilisateur destinataire
        title: Titre de la notification
        message: Message de la notification
        priority: Priorité de la notification
        notification_metadata: Métadonnées additionnelles
        action_url: URL d'action optionnelle

    Returns:
        Notification créée
    """
    notification_data = NotificationCreate(
        user_id=user_id,
        title=title,
        message=message,
        type=NotificationType.SYSTEM,
        priority=priority,
        notification_metadata=notification_metadata,
        action_url=action_url,
    )

    return await create_notification(session, notification_data, send_websocket=True)
