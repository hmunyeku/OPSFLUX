"""Event handlers registration."""

import logging

from app.core.events import EventBus

logger = logging.getLogger(__name__)


def register_all_handlers(event_bus: EventBus) -> None:
    """Register all inter-module event handlers on the given EventBus."""
    from app.event_handlers.core_handlers import register_core_handlers
    from app.event_handlers.module_handlers import register_module_handlers
    from app.event_handlers.papyrus_pid_core_handlers import register_report_pid_handlers
    from app.event_handlers.paxlog_handlers import register_paxlog_handlers
    from app.event_handlers.travelwiz_handlers import register_travelwiz_handlers

    register_core_handlers(event_bus)
    register_module_handlers(event_bus)
    register_report_pid_handlers(event_bus)
    register_paxlog_handlers(event_bus)
    register_travelwiz_handlers(event_bus)
    logger.info("EventHandlers: all handlers registered (core + modules + report/pid + paxlog + travelwiz)")
