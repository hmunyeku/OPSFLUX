"""AI Chat — Streaming assistant endpoint using LiteLLM.

Provides a server-sent-events (SSE) chat endpoint that uses the AI
provider configured in integration settings (Anthropic / OpenAI /
Mistral / Ollama).  Includes a system prompt that gives the assistant
awareness of OpsFlux modules and the caller's permissions.
"""

import json
import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_entity
from app.core.ai_config import get_ai_config
from app.core.rbac import get_user_permissions
from app.core.database import get_db
from app.mcp.mcp_native import NativeToolContext, get_or_create_backend
from app.models.common import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/ai-chat", tags=["ai-chat"])

SAFE_OPSFLUX_TOOL_ALLOWLIST = frozenset({
    "list_tiers", "get_tier", "list_contacts", "get_contact",
    "list_sites", "list_assets", "get_asset", "list_fields", "get_field",
    "list_equipment", "get_equipment", "get_asset_hierarchy",
    "list_ads", "get_ads", "list_pax_groups",
    "list_planner_activities", "get_planner_activity", "list_planner_conflicts",
    "list_vectors", "get_vector", "list_voyages", "get_voyage",
    "list_cost_centers", "list_imputation_references", "list_imputations",
    "list_users", "get_user",
    "list_projects", "get_project", "list_project_tasks", "list_project_milestones",
    "get_project_cpm", "get_project_activity_feed", "list_project_templates",
    "list_compliance_records", "list_compliance_types", "list_compliance_rules", "check_compliance",
})

SAFE_OPSFLUX_WRITE_TOOL_ALLOWLIST = frozenset({
    "create_tier",
    "update_tier",
    "create_contact",
    "update_contact",
    "create_project",
    "update_project",
    "create_project_task",
    "add_compliance_record",
    "create_compliance_type",
    "create_compliance_rule",
    "add_imputation",
})

SAFE_ASSISTANT_ROUTE_PREFIXES = (
    "/dashboard",
    "/users",
    "/projets",
    "/projects",
    "/paxlog",
    "/planner",
    "/tiers",
    "/conformite",
    "/travelwiz",
    "/support",
    "/settings",
    "/papyrus",
    "/assets",
    "/imputations",
)


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
- Sois concis, direct et précis.
- N'utilise pas d'introduction inutile comme "Parfait", "Bien sûr" ou "Voici".
- Si tu ne connais pas la réponse, dis-le clairement.
- Ne révèle jamais d'informations techniques internes (clés API, mots de passe, etc.).
- Guide l'utilisateur étape par étape quand il pose une question d'utilisation.
- Tu agis strictement dans les permissions de l'utilisateur courant, jamais au-delà.
- Si une action demandée dépasse ses droits, dis-le explicitement.
- Quand une navigation UI aiderait, propose au maximum 3 actions cliquables en fin de réponse.
- Format des actions cliquables: [[action:go:/route|Libellé bouton]]
- N'affiche jamais d'action inventée ou impossible.
"""

TOOL_PLANNER_PROMPT = """\
Tu es le planificateur d'outils OpsFlux.
Décide s'il faut interroger un outil MCP OpsFlux pour répondre correctement.

Réponds STRICTEMENT en JSON avec ce schéma:
{
  "use_tool": true|false,
  "tool_name": "nom_outil_ou_vide",
  "arguments": {},
  "reason": "courte raison"
}

Règles:
- utilise un outil seulement si la question demande une donnée live, une vérification réelle, une recherche précise, ou une action métier
- n'utilise un outil d'écriture que si l'utilisateur demande explicitement une création, modification, ajout ou mise à jour
- tu ne peux utiliser que les outils déjà autorisés par les permissions réelles de l'utilisateur courant
- n'invente pas de nom d'outil
- si aucun outil n'est nécessaire, retourne use_tool=false
"""

FINAL_RESPONSE_PROMPT = """\
Tu es l'assistant OpsFlux.

Style de réponse attendu:
- pas d'introduction inutile
- réponse courte, structurée, orientée action
- sections courtes uniquement si elles apportent de la clarté
- pas de bavardage
- n'affirme jamais qu'une action a été faite si aucun outil autorisé n'a pu l'exécuter
- si l'utilisateur n'a pas les droits suffisants, indique-le clairement
- si tu proposes une navigation concrète dans l'application, termine par 1 à 3 actions cliquables
- format obligatoire des actions: [[action:go:/route|Libellé bouton]]
- n'utilise ce format que pour de vraies routes OpsFlux
"""


def build_system_prompt(user: User, module: str | None) -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_name=f"{user.first_name} {user.last_name}".strip() or "Utilisateur",
        user_email=user.email,
        current_module=module or "non spécifié",
    )


def _normalize_model_config(ai_cfg: dict) -> tuple[str, dict]:
    provider = ai_cfg.get("provider", "anthropic")
    model = ai_cfg.get("model", "claude-sonnet-4-6")
    api_key = ai_cfg.get("api_key", "")
    base_url = ai_cfg.get("base_url", "")
    kwargs: dict = {
        "model": model,
        "max_tokens": int(ai_cfg.get("max_tokens", "4096")),
        "temperature": float(ai_cfg.get("temperature", "0.3")),
    }
    if provider == "anthropic" and not model.startswith("anthropic/"):
        kwargs["model"] = f"anthropic/{model}"
    elif provider == "openai" and not model.startswith("openai/"):
        kwargs["model"] = f"openai/{model}"
    elif provider == "mistral" and not model.startswith("mistral/"):
        kwargs["model"] = f"mistral/{model}"
    elif provider == "ollama" and not model.startswith("ollama/"):
        kwargs["model"] = f"ollama/{model}"
    if api_key and provider != "ollama":
        kwargs["api_key"] = api_key
    if base_url and provider == "ollama":
        kwargs["api_base"] = base_url
    return provider, kwargs


def _strip_action_tokens(text: str) -> str:
    return re.sub(r"\[\[action:go:[^|\]]+\|[^\]]+\]\]", "", text).strip()


def _sanitize_action_tokens(text: str) -> str:
    def _replace(match: re.Match[str]) -> str:
        target = match.group(1).strip()
        label = match.group(2).strip()
        if not target.startswith("/"):
            return ""
        if not any(target == prefix or target.startswith(prefix + "/") for prefix in SAFE_ASSISTANT_ROUTE_PREFIXES):
            return ""
        safe_label = re.sub(r"[\r\n\[\]\|]+", " ", label).strip()[:60]
        if not safe_label:
            return ""
        return f"[[action:go:{target}|{safe_label}]]"

    return re.sub(r"\[\[action:go:([^|\]]+)\|([^\]]+)\]\]", _replace, text)


def _compact_history(messages: list[ChatMessage], limit: int = 8) -> list[dict]:
    trimmed = messages[-limit:]
    return [{"role": msg.role, "content": _strip_action_tokens(msg.content)} for msg in trimmed]


async def _build_tool_context(
    *,
    current_user: User,
    entity_id: UUID,
    request: Request,
    db: AsyncSession,
) -> NativeToolContext:
    tenant_schema = getattr(request.state, "tenant_schema", None)
    if not isinstance(tenant_schema, str) or not tenant_schema:
        tenant_schema = "public"
    permissions = await get_user_permissions(current_user.id, entity_id, db)
    return NativeToolContext(
        user_id=str(current_user.id),
        entity_id=str(entity_id),
        tenant_schema=tenant_schema,
        permissions=permissions,
    )


def _tool_preview(tool: dict) -> dict:
    return {
        "name": tool.get("name"),
        "description": tool.get("description", "")[:240],
        "inputSchema": tool.get("inputSchema", {}),
    }


def _score_tool(question: str, tool: dict) -> int:
    haystack = f"{tool.get('name', '')} {tool.get('description', '')}".lower()
    words = {w for w in re.findall(r"[a-zA-Z0-9_:-]{3,}", question.lower())}
    if not words:
        return 0
    score = sum(1 for word in words if word in haystack)
    if tool.get("name", "").lower() in question.lower():
        score += 3
    return score


def _has_explicit_write_intent(question: str) -> bool:
    q = question.lower()
    markers = (
        "crée", "cree", "créé", "creer", "créer",
        "ajoute", "ajouter", "modifie", "modifier", "mets à jour", "met à jour",
        "mettre à jour", "update", "change", "changer", "renseigne", "complète", "complete",
        "bloque", "débloque", "debloque", "archive", "assigne",
    )
    return any(marker in q for marker in markers)


def _allowed_tools_for_question(question: str) -> set[str]:
    allowed = set(SAFE_OPSFLUX_TOOL_ALLOWLIST)
    if _has_explicit_write_intent(question):
        allowed.update(SAFE_OPSFLUX_WRITE_TOOL_ALLOWLIST)
    return allowed


async def _select_candidate_tools(context: NativeToolContext, question: str) -> list[dict]:
    backend = await get_or_create_backend("opsflux", {})
    if backend is None:
        return []
    tools = await backend.list_tools(context)
    allowed_tools = _allowed_tools_for_question(question)
    tools = [tool for tool in tools if tool.get("name") in allowed_tools]
    ranked = sorted(tools, key=lambda t: _score_tool(question, t), reverse=True)
    chosen = [t for t in ranked if _score_tool(question, t) > 0][:12]
    if not chosen:
        chosen = ranked[:8]
    return [_tool_preview(t) for t in chosen]


def _extract_json_object(text: str) -> dict | None:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        match = re.search(r"\{.*\}", raw, flags=re.S)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None


async def _run_opsflux_tool_if_needed(
    *,
    ai_cfg: dict,
    current_user: User,
    entity_id: UUID,
    request: Request,
    db: AsyncSession,
    body: ChatRequest,
) -> str | None:
    import litellm

    context = await _build_tool_context(current_user=current_user, entity_id=entity_id, request=request, db=db)
    candidates = await _select_candidate_tools(context, body.messages[-1].content)
    if not candidates:
        return None

    _, llm_kwargs = _normalize_model_config(ai_cfg)
    planner_messages = [
        {"role": "system", "content": TOOL_PLANNER_PROMPT},
        {
            "role": "user",
            "content": json.dumps({
                "module": body.context_module,
                "question": body.messages[-1].content,
                "available_tools": candidates,
            }, ensure_ascii=False),
        },
    ]
    response = await litellm.acompletion(
        messages=planner_messages,
        **llm_kwargs,
    )
    plan = _extract_json_object(response.choices[0].message.content or "")
    if not plan or not plan.get("use_tool") or not plan.get("tool_name"):
        return None
    tool_name = str(plan["tool_name"])
    allowed_tools = _allowed_tools_for_question(body.messages[-1].content)
    if tool_name not in allowed_tools:
        logger.warning("AI chat rejected non-whitelisted MCP tool: %s", tool_name)
        return None

    backend = await get_or_create_backend("opsflux", {})
    if backend is None:
        return None

    try:
        logger.info(
            "AI chat MCP tool call user=%s entity=%s tool=%s",
            current_user.id,
            entity_id,
            tool_name,
        )
        tool_result = await backend.execute_tool(
            tool_name,
            plan.get("arguments") if isinstance(plan.get("arguments"), dict) else {},
            context,
        )
        content = tool_result.get("content", [])
        if content and isinstance(content, list) and isinstance(content[0], dict):
            return str(content[0].get("text", ""))[:12000]
    except Exception:
        logger.exception("AI chat tool execution failed")
    return None


async def _generate_chat_response(
    *,
    body: ChatRequest,
    current_user: User,
    entity_id: UUID,
    request: Request,
    db: AsyncSession,
) -> tuple[str, str]:
    import litellm

    ai_cfg = await get_ai_config()
    if not ai_cfg.get("api_key") and ai_cfg.get("provider") != "ollama":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider not configured. Please set an API key in Settings > Integrations.",
        )

    provider, llm_kwargs = _normalize_model_config(ai_cfg)
    system_prompt = build_system_prompt(current_user, body.context_module)
    live_tool_context = await _run_opsflux_tool_if_needed(
        ai_cfg=ai_cfg,
        current_user=current_user,
        entity_id=entity_id,
        request=request,
        db=db,
        body=body,
    )

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": FINAL_RESPONSE_PROMPT},
    ]
    if live_tool_context:
        messages.append({
            "role": "system",
            "content": f"Contexte live MCP OpsFlux disponible:\n{live_tool_context}",
        })
    messages.extend(_compact_history(body.messages))

    response = await litellm.acompletion(
        messages=messages,
        **llm_kwargs,
    )
    text = _sanitize_action_tokens((response.choices[0].message.content or "").strip())
    logger.info(
        "AI chat response user=%s entity=%s module=%s used_tool=%s",
        current_user.id,
        entity_id,
        body.context_module or "",
        bool(live_tool_context),
    )
    return text, str(llm_kwargs["model"])


# ── Streaming SSE generator ─────────────────────────────────────

async def _stream_text(text: str):
    try:
        chunk_size = 120
        for i in range(0, len(text), chunk_size):
            yield f"data: {json.dumps({'type': 'content', 'text': text[i:i + chunk_size]})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"
    except Exception as e:
        logger.exception("AI chat streaming error")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)[:300]})}\n\n"


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Stream an AI chat response via SSE."""
    text, _model = await _generate_chat_response(
        body=body,
        current_user=current_user,
        entity_id=entity_id,
        request=request,
        db=db,
    )

    return StreamingResponse(
        _stream_text(text),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("", response_model=ChatResponseNonStream)
async def chat(
    body: ChatRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming AI chat response (for simple queries)."""
    try:
        text, model = await _generate_chat_response(
            body=body,
            current_user=current_user,
            entity_id=entity_id,
            request=request,
            db=db,
        )
        return ChatResponseNonStream(
            response=text,
            model=model,
            usage=None,
        )
    except Exception as e:
        logger.exception("AI chat error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI provider error: {str(e)[:300]}",
        )
