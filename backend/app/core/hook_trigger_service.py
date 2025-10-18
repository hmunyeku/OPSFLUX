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
                # TODO: Implémenter l'envoi d'email via email_service
                logger.info(f"Email action triggered (not yet implemented): {action_config}")
                return True, "Email action (placeholder)"

            elif action_type == "send_notification":
                # TODO: Implémenter les notifications
                logger.info(f"Notification action triggered (not yet implemented): {action_config}")
                return True, "Notification action (placeholder)"

            elif action_type == "create_task":
                # TODO: Implémenter la création de tâche
                logger.info(f"Create task action triggered (not yet implemented): {action_config}")
                return True, "Create task action (placeholder)"

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
