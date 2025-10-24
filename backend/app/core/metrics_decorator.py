"""
Décorateurs pour tracker les événements business dans les métriques.

Utilisation:
    @track_business_event("user.created", module="users")
    def create_user(...):
        ...
"""
from functools import wraps
from typing import Callable, Any
import logging

from app.core.metrics_service import metrics_service

logger = logging.getLogger(__name__)


def track_business_event(event_type: str, module: str = "core"):
    """
    Décorateur pour tracker automatiquement un événement business.

    Args:
        event_type: Type d'événement (ex: "user.created", "dashboard.updated", "company.deleted")
        module: Module concerné (ex: "users", "dashboards", "companies")

    Usage:
        @track_business_event("user.created", module="users")
        def create_user(session: Session, user_create: UserCreate) -> User:
            user = User.model_validate(user_create)
            session.add(user)
            session.commit()
            return user

    Note: L'événement est tracké APRÈS l'exécution de la fonction (si elle réussit).
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def sync_wrapper(*args, **kwargs) -> Any:
            try:
                # Exécuter la fonction
                result = func(*args, **kwargs)

                # Si la fonction réussit, tracker l'événement
                metrics_service.increment(
                    "business_events_total",
                    labels={"event_type": event_type, "module": module}
                )

                return result

            except Exception as e:
                # En cas d'erreur, ne pas tracker l'événement (rollback probable)
                raise

        @wraps(func)
        async def async_wrapper(*args, **kwargs) -> Any:
            try:
                # Exécuter la fonction async
                result = await func(*args, **kwargs)

                # Si la fonction réussit, tracker l'événement
                metrics_service.increment(
                    "business_events_total",
                    labels={"event_type": event_type, "module": module}
                )

                return result

            except Exception as e:
                # En cas d'erreur, ne pas tracker l'événement (rollback probable)
                raise

        # Retourner le bon wrapper selon si la fonction est async ou sync
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper

    return decorator


def track_crud_operation(resource: str, operation: str):
    """
    Décorateur raccourci pour les opérations CRUD standard.

    Args:
        resource: Le nom de la ressource (ex: "user", "dashboard", "company")
        operation: L'opération CRUD ("create", "read", "update", "delete")

    Usage:
        @track_crud_operation("user", "create")
        def create_user(...):
            ...

    C'est équivalent à:
        @track_business_event("user.create", module=resource+"s")
    """
    event_type = f"{resource}.{operation}"
    module = resource + "s"  # user -> users, dashboard -> dashboards
    return track_business_event(event_type, module)
