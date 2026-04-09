"""AI Chat — Streaming assistant endpoint using LiteLLM.

Provides a server-sent-events (SSE) chat endpoint that uses the AI
provider configured in integration settings (Anthropic / OpenAI /
Mistral / Ollama).  Includes a system prompt that gives the assistant
awareness of OpsFlux modules and the caller's permissions.
"""

import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_entity
from app.core.ai_config import get_ai_config
from app.core.database import get_db
from app.models.common import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai-chat", tags=["ai-chat"])


# ── Schemas ──────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1, max_length=20_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1, max_length=50)
    context_module: str | None = Field(None, description="Current page module slug")


class ChatResponseNonStream(BaseModel):
    response: str
    model: str
    usage: dict | None = None


# ── System prompt builder ────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """\
Tu es l'assistant OpsFlux, un ERP industriel pour la gestion des opérations.
Tu aides l'utilisateur avec le module en cours et ses questions sur l'application.

Modules disponibles:
- Dashboard: KPIs et vue d'ensemble
- Users: Gestion des comptes, rôles, groupes (RBAC)
- Projets: Gestion de projets, tâches, Gantt, budget, équipe
- PaxLog: Gestion des passagers, avis de séjour, conformité, rotations
- Planner: Planification des activités sur les assets
- Tiers: Annuaire entreprises et contacts
- Conformité: Certifications, habilitations, formations obligatoires
- TravelWiz: Voyages et transport
- Support: Tickets, annonces, feedback
- Paramètres: Configuration de l'application

Utilisateur connecté: {user_name} ({user_email})
Module actuel: {current_module}

Règles:
- Réponds en français sauf si l'utilisateur écrit en anglais.
- Sois concis et précis.
- Si tu ne connais pas la réponse, dis-le clairement.
- Ne révèle jamais d'informations techniques internes (clés API, mots de passe, etc.).
- Guide l'utilisateur étape par étape quand il pose une question d'utilisation.
"""


def build_system_prompt(user: User, module: str | None) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_name=f"{user.first_name} {user.last_name}".strip() or "Utilisateur",
        user_email=user.email,
        current_module=module or "non spécifié",
    )


# ── Streaming SSE generator ─────────────────────────────────────

async def _stream_chat(messages: list[dict], ai_cfg: dict):
    """Yield SSE events from LiteLLM streaming completion."""
    import litellm

    # Map provider → model prefix for litellm
    provider = ai_cfg.get("provider", "anthropic")
    model = ai_cfg.get("model", "claude-sonnet-4-6")
    api_key = ai_cfg.get("api_key", "")
    base_url = ai_cfg.get("base_url", "")
    max_tokens = int(ai_cfg.get("max_tokens", "4096"))
    temperature = float(ai_cfg.get("temperature", "0.3"))

    # litellm model naming: anthropic/model, openai/model, ollama/model, etc.
    if provider == "anthropic" and not model.startswith("anthropic/"):
        model = f"anthropic/{model}"
    elif provider == "openai" and not model.startswith("openai/"):
        model = f"openai/{model}"
    elif provider == "mistral" and not model.startswith("mistral/"):
        model = f"mistral/{model}"
    elif provider == "ollama" and not model.startswith("ollama/"):
        model = f"ollama/{model}"

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "stream": True,
    }

    if api_key and provider != "ollama":
        kwargs["api_key"] = api_key
    if base_url and provider == "ollama":
        kwargs["api_base"] = base_url

    try:
        response = await litellm.acompletion(**kwargs)
        async for chunk in response:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield f"data: {json.dumps({'type': 'content', 'text': delta.content})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.exception("AI chat streaming error")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:300]})}\n\n"


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Stream an AI chat response via SSE."""
    ai_cfg = await get_ai_config()

    if not ai_cfg.get("api_key") and ai_cfg.get("provider") != "ollama":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider not configured. Please set an API key in Settings > Integrations.",
        )

    system_prompt = build_system_prompt(current_user, body.context_module)

    messages = [{"role": "system", "content": system_prompt}]
    for msg in body.messages:
        messages.append({"role": msg.role, "content": msg.content})

    return StreamingResponse(
        _stream_chat(messages, ai_cfg),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=ChatResponseNonStream)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming AI chat response (for simple queries)."""
    import litellm

    ai_cfg = await get_ai_config()

    if not ai_cfg.get("api_key") and ai_cfg.get("provider") != "ollama":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider not configured.",
        )

    provider = ai_cfg.get("provider", "anthropic")
    model = ai_cfg.get("model", "claude-sonnet-4-6")
    api_key = ai_cfg.get("api_key", "")
    base_url = ai_cfg.get("base_url", "")

    if provider == "anthropic" and not model.startswith("anthropic/"):
        model = f"anthropic/{model}"
    elif provider == "openai" and not model.startswith("openai/"):
        model = f"openai/{model}"
    elif provider == "mistral" and not model.startswith("mistral/"):
        model = f"mistral/{model}"
    elif provider == "ollama" and not model.startswith("ollama/"):
        model = f"ollama/{model}"

    system_prompt = build_system_prompt(current_user, body.context_module)
    messages = [{"role": "system", "content": system_prompt}]
    for msg in body.messages:
        messages.append({"role": msg.role, "content": msg.content})

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": int(ai_cfg.get("max_tokens", "4096")),
        "temperature": float(ai_cfg.get("temperature", "0.3")),
    }
    if api_key and provider != "ollama":
        kwargs["api_key"] = api_key
    if base_url and provider == "ollama":
        kwargs["api_base"] = base_url

    try:
        response = await litellm.acompletion(**kwargs)
        return ChatResponseNonStream(
            response=response.choices[0].message.content or "",
            model=model,
            usage=dict(response.usage) if response.usage else None,
        )
    except Exception as e:
        logger.exception("AI chat error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {str(e)[:300]}",
        )
