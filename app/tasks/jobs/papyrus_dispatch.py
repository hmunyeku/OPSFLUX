"""Scheduled job for Papyrus automated dispatches."""

import logging

from app.core.database import async_session_factory
from app.services.modules.papyrus_dispatch_service import process_due_papyrus_dispatches

logger = logging.getLogger(__name__)


async def process_papyrus_dispatches() -> None:
    """Evaluate due Papyrus schedules and dispatch matching reports."""
    async with async_session_factory() as db:
        summary = await process_due_papyrus_dispatches(db=db)
        logger.info(
            "papyrus_dispatch: checked=%s dispatched=%s skipped=%s failed=%s",
            summary["checked"],
            summary["dispatched"],
            summary["skipped"],
            summary["failed"],
        )
