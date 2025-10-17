"""
Service pour le système de Hooks & Triggers.
Permet d'exécuter des actions automatiquement lorsqu'un événement se produit.
"""

import time
import logging
from typing import Any, Optional
from uuid import UUID

from sqlmodel import Session, select
from app.models_hooks import Hook, HookExecution, HookExecutionCreate
from app.services.notification_service import create_system_notification
from app.models_notifications import NotificationPriority
from app.core.email_service import EmailService

logger = logging.getLogger(__name__)


async def trigger_event(
    session: Session,
    event_name: str,
    context: dict[str, Any]
) -> list[HookExecution]:
    """
    Déclenche un événement et exécute tous les hooks actifs qui correspondent.

    Args:
        session: Session de base de données
        event_name: Nom de l'événement (ex: 'incident.created', 'user.login')
        context: Contexte de l'événement (données passées aux actions)

    Returns:
        Liste des exécutions de hooks (succès et échecs)

    Exemple:
        await trigger_event(
            session=session,
            event_name='incident.created',
            context={
                'incident_id': str(incident.id),
                'title': incident.title,
                'severity': incident.severity,
                'created_by': user.email
            }
        )
    """
    logger.info(f"Triggering event: {event_name}")

    # Récupérer tous les hooks actifs pour cet événement, triés par priorité
    statement = (
        select(Hook)
        .where(Hook.event == event_name)
        .where(Hook.is_active == True)  # noqa: E712
        .where(Hook.deleted_at == None)  # noqa: E711
        .order_by(Hook.priority.desc())  # Priorité élevée en premier
    )
    hooks = session.exec(statement).all()

    logger.info(f"Found {len(hooks)} active hooks for event '{event_name}'")

    executions: list[HookExecution] = []

    for hook in hooks:
        start_time = time.time()

        try:
            # Vérifier les conditions si elles existent
            if hook.conditions and not _check_conditions(hook.conditions, context):
                logger.debug(f"Hook {hook.id} ({hook.name}): conditions not met, skipping")
                continue

            logger.info(f"Executing hook {hook.id} ({hook.name})")

            # Exécuter toutes les actions du hook
            for action in hook.actions:
                await _execute_action(session, action, context)

            # Logger le succès
            duration_ms = int((time.time() - start_time) * 1000)
            execution = HookExecution(
                hook_id=hook.id,
                event_context=context,
                success=True,
                duration_ms=duration_ms
            )
            session.add(execution)
            executions.append(execution)

            logger.info(f"Hook {hook.id} executed successfully in {duration_ms}ms")

        except Exception as e:
            # Logger l'échec
            duration_ms = int((time.time() - start_time) * 1000)
            error_message = str(e)
            execution = HookExecution(
                hook_id=hook.id,
                event_context=context,
                success=False,
                duration_ms=duration_ms,
                error_message=error_message[:2000]  # Limiter la taille
            )
            session.add(execution)
            executions.append(execution)

            logger.error(f"Hook {hook.id} failed: {error_message}", exc_info=True)

    # Commit toutes les exécutions
    session.commit()

    return executions


def _check_conditions(conditions: dict[str, Any], context: dict[str, Any]) -> bool:
    """
    Vérifie si les conditions du hook sont satisfaites par le contexte.

    Supporte:
    - Égalité simple: {"severity": "critical"}
    - Comparaison: {"amount": {">=": 1000}, "count": {"<": 10}}
    - In: {"status": {"in": ["pending", "approved"]}}
    - Not in: {"type": {"not_in": ["spam", "test"]}}

    Args:
        conditions: Conditions du hook (dict JSON)
        context: Contexte de l'événement

    Returns:
        True si toutes les conditions sont satisfaites, False sinon
    """
    for key, expected in conditions.items():
        actual = context.get(key)

        # Égalité simple
        if not isinstance(expected, dict):
            if actual != expected:
                return False

        # Opérateurs de comparaison
        else:
            # Opérateur >=
            if ">=" in expected:
                if actual is None or actual < expected[">="]:
                    return False

            # Opérateur >
            if ">" in expected:
                if actual is None or actual <= expected[">"]:
                    return False

            # Opérateur <=
            if "<=" in expected:
                if actual is None or actual > expected["<="]:
                    return False

            # Opérateur <
            if "<" in expected:
                if actual is None or actual >= expected["<"]:
                    return False

            # Opérateur !=
            if "!=" in expected:
                if actual == expected["!="]:
                    return False

            # Opérateur in (appartenance à liste)
            if "in" in expected:
                if actual not in expected["in"]:
                    return False

            # Opérateur not_in
            if "not_in" in expected:
                if actual in expected["not_in"]:
                    return False

    return True


async def _execute_action(
    session: Session,
    action: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Exécute une action du hook.

    Args:
        session: Session de base de données
        action: Configuration de l'action (dict JSON)
        context: Contexte de l'événement

    Raises:
        ValueError: Si le type d'action est inconnu
        Exception: Si l'exécution de l'action échoue
    """
    action_type = action.get("type")
    config = action.get("config", {})

    if action_type == "send_notification":
        await _action_send_notification(session, config, context)

    elif action_type == "send_email":
        await _action_send_email(session, config, context)

    elif action_type == "call_webhook":
        await _action_call_webhook(config, context)

    elif action_type == "execute_code":
        await _action_execute_code(config, context)

    elif action_type == "create_task":
        await _action_create_task(session, config, context)

    else:
        raise ValueError(f"Unknown action type: {action_type}")


async def _action_send_notification(
    session: Session,
    config: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Action: Envoyer une notification.

    Config attendue:
    {
        "user_ids": ["uuid1", "uuid2"],  # ou "user_id": "uuid" pour un seul
        "title": "Titre avec {variable}",
        "message": "Message avec {variable}",
        "priority": "high",  # low, normal, high, urgent
        "action_url": "/path/{variable}"
    }
    """
    # Récupérer les destinataires
    user_ids: list[UUID] = []
    if "user_ids" in config:
        user_ids = [UUID(uid) for uid in config["user_ids"]]
    elif "user_id" in config:
        user_ids = [UUID(config["user_id"])]
    else:
        raise ValueError("Missing 'user_id' or 'user_ids' in notification config")

    # Formater le titre et le message avec le contexte
    title = config["title"].format(**context)
    message = config["message"].format(**context)

    # Mapper la priorité
    priority_map = {
        "low": NotificationPriority.LOW,
        "normal": NotificationPriority.NORMAL,
        "high": NotificationPriority.HIGH,
        "urgent": NotificationPriority.URGENT,
    }
    priority = priority_map.get(
        config.get("priority", "normal"),
        NotificationPriority.NORMAL
    )

    # Action URL optionnelle
    action_url = None
    if "action_url" in config:
        action_url = config["action_url"].format(**context)

    # Envoyer la notification à chaque utilisateur
    for user_id in user_ids:
        await create_system_notification(
            session=session,
            user_id=user_id,
            title=title,
            message=message,
            priority=priority,
            notification_metadata={"hook_context": context},
            action_url=action_url
        )

    logger.info(f"Sent notifications to {len(user_ids)} users")


async def _action_send_email(
    session: Session,
    config: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Action: Envoyer un email.

    Config attendue:
    {
        "to_emails": ["email1@example.com", "email2@example.com"],  # ou "to_email": "email@example.com" pour un seul
        "subject": "Sujet avec {variable}",
        "body": "Corps de l'email avec {variable}",  # Texte simple ou HTML
        "template": "nom_template"  # Optionnel, template prédéfini
    }
    """
    # Récupérer les destinataires
    to_emails: list[str] = []
    if "to_emails" in config:
        to_emails = config["to_emails"]
    elif "to_email" in config:
        to_emails = [config["to_email"]]
    else:
        raise ValueError("Missing 'to_email' or 'to_emails' in email config")

    # Formater le sujet avec le contexte
    subject = config.get("subject", "Notification")
    subject = subject.format(**context)

    # Gérer le corps de l'email (body ou template)
    if "template" in config:
        # TODO: Implémenter le système de templates email
        # Pour l'instant, utiliser le body si fourni, sinon template basique
        logger.warning(f"Email template '{config['template']}' requested but not implemented yet")
        body = config.get("body", f"<p>Event triggered: {context}</p>")
    else:
        body = config.get("body", "<p>Notification</p>")

    # Formater le corps avec le contexte
    body = body.format(**context)

    # Si le corps ne contient pas de HTML, l'envelopper dans un template simple
    if not body.strip().startswith("<"):
        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    {body}
                </div>
            </body>
        </html>
        """

    # Envoyer l'email à chaque destinataire
    success_count = 0
    failed_emails = []

    for to_email in to_emails:
        success = EmailService.send_email(
            email_to=to_email,
            subject=subject,
            html_content=body,
            db=session,
        )
        if success:
            success_count += 1
        else:
            failed_emails.append(to_email)

    if failed_emails:
        logger.error(f"Failed to send emails to: {', '.join(failed_emails)}")
        raise Exception(f"Failed to send emails to {len(failed_emails)} recipients: {', '.join(failed_emails)}")

    logger.info(f"Sent emails to {success_count} recipients")


async def _action_call_webhook(
    config: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Action: Appeler un webhook externe.

    TODO: Implémenter quand WebhookService sera créé.

    Config attendue:
    {
        "url": "https://api.external.com/webhook",
        "headers": {"Authorization": "Bearer {token}"},
        "payload": {...}  # optionnel, sinon context entier
    }
    """
    logger.warning("Webhook action not implemented yet - WebhookService pending")
    # TODO: Appeler WebhookService.send() quand disponible


async def _action_execute_code(
    config: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Action: Exécuter du code Python.

    ATTENTION: Cette action est potentiellement dangereuse et nécessite
    un sandboxing approprié pour la production.

    Config attendue:
    {
        "code": "print('Hello from hook')"
    }
    """
    logger.warning("Execute code action is disabled for security reasons")
    # TODO: Implémenter avec sandboxing (RestrictedPython ou similaire)
    raise NotImplementedError(
        "Execute code action is disabled for security. "
        "Use other action types or implement proper sandboxing."
    )


async def _action_create_task(
    session: Session,
    config: dict[str, Any],
    context: dict[str, Any]
) -> None:
    """
    Action: Créer une tâche Celery asynchrone.

    TODO: Implémenter quand Celery sera configuré.

    Config attendue:
    {
        "task_name": "my_module.tasks.process_data",
        "kwargs": {...}  # optionnel, sinon context entier
    }
    """
    logger.warning("Create task action not implemented yet - Celery pending")
    # TODO: Appeler celery_app.send_task() quand disponible


def get_hook_executions(
    session: Session,
    hook_id: Optional[UUID] = None,
    success: Optional[bool] = None,
    skip: int = 0,
    limit: int = 100
) -> tuple[list[HookExecution], int]:
    """
    Récupère l'historique d'exécution des hooks avec filtres et pagination.

    Args:
        session: Session de base de données
        hook_id: Filtrer par hook spécifique
        success: Filtrer par succès (True) ou échec (False)
        skip: Nombre d'enregistrements à sauter
        limit: Nombre maximum d'enregistrements à retourner

    Returns:
        Tuple (liste des exécutions, nombre total)
    """
    statement = select(HookExecution)

    # Filtrer par hook
    if hook_id is not None:
        statement = statement.where(HookExecution.hook_id == hook_id)

    # Filtrer par succès/échec
    if success is not None:
        statement = statement.where(HookExecution.success == success)

    # Compter le total
    count_statement = select(HookExecution.id).select_from(statement.subquery())
    total = len(session.exec(count_statement).all())

    # Récupérer avec pagination (tri par date décroissante)
    statement = (
        statement
        .order_by(HookExecution.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    executions = session.exec(statement).all()

    return list(executions), total
