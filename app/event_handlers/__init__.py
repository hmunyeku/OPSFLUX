"""Event handlers registration."""

import logging

from app.core.events import EventBus

logger = logging.getLogger(__name__)


def register_all_handlers(event_bus: EventBus) -> None:
    """Register all inter-module event handlers on the given EventBus."""
    from app.event_handlers.core_handlers import register_core_handlers

    register_core_handlers(event_bus)
    logger.info("EventHandlers: all handlers registered")
