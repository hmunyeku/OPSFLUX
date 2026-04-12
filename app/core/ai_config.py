"""AI provider configuration — DB integration settings with .env fallback."""

import logging

from sqlalchemy import text

logger = logging.getLogger(__name__)


async def get_ai_config() -> dict[str, str]:
    """Load AI config: DB integration.ai.* takes priority, .env as fallback."""
    from app.core.config import settings
    from app.core.database import async_session_factory

    cfg = {
        "provider": "anthropic",
        "api_key": settings.ANTHROPIC_API_KEY,
        "model": settings.ANTHROPIC_MODEL,
        "base_url": settings.OLLAMA_BASE_URL,
        "max_tokens": "4096",
        "temperature": "0.3",
    }

    try:
        async with async_session_factory() as db:
            result = await db.execute(text("SELECT key, value FROM settings WHERE key LIKE 'integration.ai.%'"))
            for row in result.all():
                field = row[0].replace("integration.ai.", "")
                val = row[1].get("v", "") if isinstance(row[1], dict) else str(row[1])
                if val and field in cfg:
                    cfg[field] = str(val)
    except Exception:
        logger.debug("Could not load AI settings from DB, using .env defaults")

    return cfg
