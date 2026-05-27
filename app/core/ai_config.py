"""AI provider configuration — DB integration settings with .env fallback."""

import logging
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


async def get_ai_config(
    *,
    entity_id: UUID | None = None,
    db: AsyncSession | None = None,
    connection_id: UUID | None = None,
) -> dict[str, str]:
    """Load AI config.

    Priority:
      1. Active `ai_provider` integration connection for the entity.
      2. Legacy DB settings `integration.ai.*`.
      3. Environment variables.
    """
    from app.core.config import settings

    cfg = {
        "provider": "anthropic",
        "api_key": settings.ANTHROPIC_API_KEY,
        "model": settings.ANTHROPIC_MODEL,
        "base_url": settings.OLLAMA_BASE_URL,
        "max_tokens": "4096",
        "temperature": "0.3",
    }

    if entity_id is not None and db is not None:
        try:
            from app.models.common import IntegrationConnection
            from app.services.core.integration_connection_service import load_credentials

            stmt = select(IntegrationConnection).where(
                IntegrationConnection.entity_id == entity_id,
                IntegrationConnection.connection_type == "ai_provider",
                IntegrationConnection.status == "active",
            )
            if connection_id is not None:
                stmt = stmt.where(IntegrationConnection.id == connection_id)
            stmt = stmt.order_by(IntegrationConnection.created_at.desc()).limit(1)
            conn = (await db.execute(stmt)).scalar_one_or_none()
            if conn is not None:
                credentials = await load_credentials(db, conn.id)
                conn_cfg = conn.config or {}
                cfg.update({
                    "provider": str(conn_cfg.get("provider") or cfg["provider"]),
                    "model": str(conn_cfg.get("model") or cfg["model"]),
                    "base_url": str(conn_cfg.get("base_url") or cfg["base_url"] or ""),
                    "max_tokens": str(conn_cfg.get("max_tokens") or cfg["max_tokens"]),
                    "temperature": str(conn_cfg.get("temperature") or cfg["temperature"]),
                    "connection_id": str(conn.id),
                    "connection_name": conn.name,
                })
                if credentials.get("api_key_value"):
                    cfg["api_key"] = str(credentials["api_key_value"])
                return cfg
        except Exception:
            logger.exception("Could not load AI provider integration connection")

    from app.core.database import async_session_factory

    try:
        async with async_session_factory() as db:
            result = await db.execute(
                text("SELECT key, value FROM settings WHERE key LIKE 'integration.ai.%'")
            )
            for row in result.all():
                field = row[0].replace("integration.ai.", "")
                val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
                if val and field in cfg:
                    cfg[field] = str(val)
    except Exception:
        logger.debug("Could not load AI settings from DB, using .env defaults")

    return cfg
