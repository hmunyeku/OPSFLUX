"""
Hook Trigger Service - Déclenche automatiquement les hooks lors d'événements CRUD.

Ce service permet de:
1. Déclencher les hooks correspondant à un événement donné
2. Évaluer les conditions des hooks
3. Exécuter les actions appropriées (webhooks, emails, etc.)
4. Logger les exécutions
"""

import logging
import time
from typing import Any
from uuid import UUID

from sqlmodel import Session, select

from app.models_hooks import Hook, HookExecution


logger = logging.getLogger(__name__)


class HookTriggerService:
    """Service pour déclencher les hooks lors d'événements"""

    def __init__(self):
        pass

    def evaluate_conditions(self, conditions: dict | None, context: dict[str, Any]) -> bool:
        """
        Évalue si les conditions d'un hook sont satisfaites.

        Args:
            conditions: Conditions JSON du hook (None = toujours vrai)
            context: Contexte de l'événement

        Returns:
            bool: True si les conditions sont satisfaites

        Example conditions:
            {"severity": "critical"}  # context["severity"] == "critical"
            {"amount": {">=": 1000}}  # context["amount"] >= 1000
            {"status": {"in": ["pending", "approved"]}}  # context["status"] in liste
        """
        # Pas de conditions = toujours exécuter
        if not conditions:
            return True

        try:
            for key, value in conditions.items():
                # Vérifier que la clé existe dans le contexte
                if key not in context:
                    return False

                context_value = context[key]

                # Comparaison simple (égalité)
                if not isinstance(value, dict):
                    if context_value != value:
                        return False
                    continue

                # Comparaison avancée (opérateurs)
                for operator, operand in value.items():
                    if operator == "==":
                        if context_value != operand:
                            return False
                    elif operator == "!=":
                        if context_value == operand:
                            return False
                    elif operator == ">":
                        if not (context_value > operand):
                            return False
                    elif operator == ">=":
                        if not (context_value >= operand):
                            return False
                    elif operator == "<":
                        if not (context_value < operand):
                            return False
                    elif operator == "<=":
                        if not (context_value <= operand):
                            return False
                    elif operator == "in":
                        if context_value not in operand:
                            return False
                    elif operator == "not_in":
                        if context_value in operand:
                            return False
                    elif operator == "contains":
                        if operand not in str(context_value):
                            return False
                    else:
                        logger.warning(f"Unknown operator: {operator}")
                        return False

            return True

        except Exception as e:
            logger.error(f"Error evaluating conditions: {e}")
            return False

    async def execute_action(
        self,
        action: dict[str, Any],
        context: dict[str, Any],
        db: Session,
    ) -> tuple[bool, str]:
        """
        Exécute une action de hook.

        Args:
            action: Configuration de l'action {"type": "...", "config": {...}}
            context: Contexte de l'événement
            db: Session database

        Returns:
            tuple[bool, str]: (success, message)
        """
        action_type = action.get("type")
        action_config = action.get("config", {})

        try:
            if action_type == "call_webhook":
                # Importer et exécuter le webhook
                from app.core.webhook_executor_service import webhook_executor
                return await webhook_executor.execute_hook_webhook_action(
                    action_config=action_config,
                    event_context=context,
                    db=db,
                )

            elif action_type == "send_email":
                # Envoyer un email via email_service
                from app.core.email_service import email_service

                email_to = action_config.get("email_to")
                template_id = action_config.get("template_id")

                if not email_to:
                    return False, "email_to manquant dans la configuration"

                # Si template_id fourni, utiliser send_templated_email
                if template_id:
                    from uuid import UUID
                    try:
                        template_uuid = UUID(template_id) if isinstance(template_id, str) else template_id
                        # Préparer les variables pour le template
                        variables = action_config.get("variables", {})
                        variables.update(context)  # Ajouter le contexte de l'événement

                        success = email_service.send_templated_email(
                            email_to=email_to,
                            template_id=template_uuid,
                            variables=variables,
                            db=db,
                        )
                        if success:
                            return True, f"Email envoyé à {email_to} via template {template_id}"
                        else:
                            return False, f"Échec de l'envoi d'email à {email_to}"
                    except Exception as e:
                        return False, f"Erreur lors de l'envoi d'email: {str(e)}"
                else:
                    # Envoi d'email simple
                    subject = action_config.get("subject", "Notification")
                    html_content = action_config.get("html_content", "")

                    if not html_content:
                        return False, "html_content manquant dans la configuration"

                    success = email_service.send_email(
                        email_to=email_to,
                        subject=subject,
                        html_content=html_content,
                        db=db,
                    )
                    if success:
                        return True, f"Email envoyé à {email_to}"
                    else:
                        return False, f"Échec de l'envoi d'email à {email_to}"

            elif action_type == "send_notification":
                # Créer une notification in-app
                # Note: Nécessite un modèle Notification dans la DB
                try:
                    notification_data = {
                        "user_id": action_config.get("user_id") or context.get("user_id"),
                        "title": action_config.get("title", "Notification"),
                        "message": action_config.get("message", ""),
                        "type": action_config.get("notification_type", "info"),
                        "link": action_config.get("link"),
                        "event_context": context,
                    }

                    # TODO: Créer l'entrée Notification si le modèle existe
                    # from app.models_notifications import Notification
                    # notification = Notification(**notification_data)
                    # db.add(notification)
                    # db.commit()

                    logger.info(f"Notification créée: {notification_data}")
                    return True, f"Notification envoyée à user_id={notification_data['user_id']}"
                except Exception as e:
                    return False, f"Erreur lors de la création de notification: {str(e)}"

            elif action_type == "create_task":
                # Créer une tâche automatiquement
                # Note: Nécessite un modèle Task dans la DB
                try:
                    task_data = {
                        "title": action_config.get("title", "Tâche automatique"),
                        "description": action_config.get("description", ""),
                        "assigned_to": action_config.get("assigned_to") or context.get("user_id"),
                        "priority": action_config.get("priority", "normal"),
                        "due_date": action_config.get("due_date"),
                        "event_context": context,
                    }

                    # TODO: Créer l'entrée Task si le modèle existe
                    # from app.models_tasks import Task
                    # task = Task(**task_data)
                    # db.add(task)
                    # db.commit()

                    logger.info(f"Tâche créée: {task_data}")
                    return True, f"Tâche créée: {task_data['title']}"
                except Exception as e:
                    return False, f"Erreur lors de la création de tâche: {str(e)}"

            else:
                logger.warning(f"Unknown action type: {action_type}")
                return False, f"Unknown action type: {action_type}"

        except Exception as e:
            logger.error(f"Error executing action {action_type}: {e}")
            return False, f"Error: {str(e)}"

    async def trigger_event(
        self,
        *,
        event: str,
        context: dict[str, Any],
        db: Session,
    ) -> int:
        """
        Déclenche un événement et exécute tous les hooks correspondants.

        Cette fonction est appelée depuis les routes CRUD pour déclencher les hooks.

        Args:
            event: Nom de l'événement (ex: "user.created", "incident.approved")
            context: Contexte de l'événement (données de l'objet, user_id, etc.)
            db: Session database

        Returns:
            int: Nombre de hooks exécutés avec succès

        Example:
            >>> await trigger_event(
            ...     event="incident.created",
            ...     context={"incident_id": "...", "severity": "critical", "user_id": "..."},
            ...     db=session
            ... )
            2  # 2 hooks exécutés
        """
        logger.info(f"Triggering event: {event}")

        # Récupérer tous les hooks actifs pour cet événement
        try:
            statement = select(Hook).where(
                Hook.event == event,
                Hook.is_active == True
            ).order_by(Hook.priority.desc())  # Trier par priorité (plus élevé en premier)

            result = db.exec(statement)
            hooks = result.all()

            if not hooks:
                logger.debug(f"No active hooks found for event: {event}")
                return 0

            logger.info(f"Found {len(hooks)} hook(s) for event {event}")

            executed_count = 0

            for hook in hooks:
                start_time = time.time()

                try:
                    # Évaluer les conditions
                    if not self.evaluate_conditions(hook.conditions, context):
                        logger.debug(f"Hook {hook.name} conditions not met, skipping")
                        continue

                    logger.info(f"Executing hook: {hook.name}")

                    # Exécuter toutes les actions du hook
                    all_actions_success = True
                    errors = []

                    for action in hook.actions:
                        success, message = await self.execute_action(action, context, db)
                        if not success:
                            all_actions_success = False
                            errors.append(message)
                        else:
                            logger.info(f"Action {action.get('type')} succeeded: {message}")

                    duration_ms = int((time.time() - start_time) * 1000)

                    # Logger l'exécution dans hook_execution
                    execution_log = HookExecution(
                        hook_id=hook.id,
                        event_context=context,
                        success=all_actions_success,
                        duration_ms=duration_ms,
                        error_message="; ".join(errors) if errors else None,
                    )
                    db.add(execution_log)
                    db.commit()

                    if all_actions_success:
                        executed_count += 1

                except Exception as e:
                    duration_ms = int((time.time() - start_time) * 1000)
                    logger.error(f"Error executing hook {hook.name}: {e}")

                    # Logger l'échec
                    execution_log = HookExecution(
                        hook_id=hook.id,
                        event_context=context,
                        success=False,
                        duration_ms=duration_ms,
                        error_message=str(e),
                    )
                    db.add(execution_log)
                    db.commit()

            logger.info(f"Event {event} completed: {executed_count}/{len(hooks)} hooks executed successfully")
            return executed_count

        except Exception as e:
            logger.error(f"Error triggering event {event}: {e}")
            return 0


# Instance singleton
hook_trigger = HookTriggerService()
