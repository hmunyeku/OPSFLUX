"""EventBus — PostgreSQL LISTEN/NOTIFY with event_store persistence."""

import json
import logging
from collections.abc import Callable, Coroutine
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


@dataclass
class OpsFluxEvent:
    event_type: str
    payload: dict[str, Any]
    id: str = field(default_factory=lambda: str(uuid4()))
    emitted_at: datetime = field(default_factory=lambda: datetime.now(UTC))


EventHandler = Callable[[OpsFluxEvent], Coroutine[Any, Any, None]]


class EventBus:
    """In-process event bus with PostgreSQL persistence for audit and replay."""

    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = {}

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)
        logger.info("EventBus: subscribed %s to %s", handler.__name__, event_type)

    async def publish(self, event: OpsFluxEvent, db: AsyncSession | None = None) -> None:
        """Persist event to event_store then dispatch to handlers.

        IMPORTANT: Call AFTER db.commit() — never inside a transaction.
        """
        # Persist to event_store
        if db:
            await self._persist(event, db)
        else:
            async with async_session_factory() as session:
                await self._persist(event, session)
                await session.commit()

        # Dispatch to registered handlers
        handlers = self._handlers.get(event.event_type, [])
        for handler in handlers:
            try:
                await handler(event)
                logger.debug("EventBus: %s handled by %s", event.event_type, handler.__name__)
            except Exception:
                logger.exception(
                    "EventBus: handler %s failed for event %s",
                    handler.__name__,
                    event.event_type,
                )

    async def _persist(self, event: OpsFluxEvent, db: AsyncSession) -> None:
        await db.execute(
            text(
                "INSERT INTO event_store (id, event_name, payload, emitted_at) "
                "VALUES (:id, :event_name, :payload, :emitted_at)"
            ),
            {
                "id": event.id,
                "event_name": event.event_type,
                "payload": json.dumps(event.payload),
                "emitted_at": event.emitted_at,
            },
        )


# Singleton
event_bus = EventBus()


async def emit_event(event_type: str, payload: dict[str, Any]) -> None:
    """Convenience wrapper — publish an event without passing db.

    Call AFTER db.commit() in route handlers.
    """
    await event_bus.publish(OpsFluxEvent(event_type=event_type, payload=payload))
