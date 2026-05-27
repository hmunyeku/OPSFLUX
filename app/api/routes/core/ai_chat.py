"""AI Chat — Streaming assistant endpoint using LiteLLM.

Provides a server-sent-events (SSE) chat endpoint that uses the AI
provider configured in integration settings (Anthropic / OpenAI /
Mistral / Ollama).  Includes a system prompt that gives the assistant
awareness of OpsFlux modules and the caller's permissions.
"""

import json
import logging
import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func as sqla_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_entity, has_user_permission
from app.core.ai_config import get_ai_config
from app.core.audit import record_audit
from app.core.rbac import get_user_permissions
from app.core.database import get_db
from app.mcp.mcp_native import NativeToolContext, get_or_create_backend
from app.models.common import (
    IntegrationConnection,
    Project,
    ProjectChange,
    ProjectMember,
    ProjectMilestone,
    ProjectTask,
    ProjectTaskLoss,
    Setting,
    Tier,
    TierContact,
    User,
)

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

CANONICAL_ASSISTANT_ROUTE_ALIASES: dict[str, str] = {
    "/projects": "/projets",
    "/report-editor": "/papyrus",
    "/assets-legacy": "/assets",
    "/comptes": "/users",
}


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


class ModuleAIStatus(BaseModel):
    module: Literal["tiers", "projets"]
    enabled: bool
    configured: bool
    provider: str | None = None
    model: str | None = None
    connection_name: str | None = None
    missing_reason: str | None = None
    intents: list[str] = Field(default_factory=list)


class ModuleAIInsightRequest(BaseModel):
    module: Literal["tiers", "projets"]
    owner_type: Literal["tier", "tier_contact", "project"]
    owner_id: UUID
    intent: Literal["summary", "risks", "next_actions", "data_quality"] = "summary"


class ModuleAIInsightResponse(BaseModel):
    response: str
    model: str
    provider: str
    intent: str


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
- Réponds dans la même langue que la question de l'utilisateur.
- Si la question mélange plusieurs langues, utilise la langue dominante de la demande.
- Sois concis, direct et précis.
- N'utilise pas d'introduction inutile comme "Parfait", "Bien sûr" ou "Voici".
- Si tu ne connais pas la réponse, dis-le clairement.
- Ne révèle jamais d'informations techniques internes (clés API, mots de passe, etc.).
- Guide l'utilisateur étape par étape quand il pose une question d'utilisation.
- Tu agis strictement dans les permissions de l'utilisateur courant, jamais au-delà.
- Si une action demandée dépasse ses droits, dis-le explicitement.
- Quand une navigation UI aiderait, propose au maximum 3 actions cliquables en fin de réponse.
- Format des actions cliquables: [[action:go:/route|Libellé bouton]]
- Pour demander une confirmation explicite avant une écriture, utilise: [[action:confirm-write|Confirmer l'action]]
- Utilise les routes canoniques OpsFlux. Exemples: /projets et non /projects, /papyrus et non /report-editor, /assets et non /assets-legacy, /users et non /comptes.
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
- pour une confirmation explicite d'écriture, utilise uniquement: [[action:confirm-write|Confirmer l'action]]
- privilégie toujours les routes canoniques OpsFlux, par exemple /projets, /papyrus, /assets, /users
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
        target = CANONICAL_ASSISTANT_ROUTE_ALIASES.get(target, target)
        if not target.startswith("/"):
            return ""
        if not any(target == prefix or target.startswith(prefix + "/") for prefix in SAFE_ASSISTANT_ROUTE_PREFIXES):
            return ""
        safe_label = re.sub(r"[\r\n\[\]\|]+", " ", label).strip()[:60]
        if not safe_label:
            return ""
        return f"[[action:go:{target}|{safe_label}]]"

    sanitized = re.sub(r"\[\[action:go:([^|\]]+)\|([^\]]+)\]\]", _replace, text)
    sanitized = re.sub(
        r"\[\[action:confirm-write\|([^\]]+)\]\]",
        lambda match: f"[[action:confirm-write|{re.sub(r'[\r\n\[\]\|]+', ' ', match.group(1)).strip()[:60] or 'Confirmer l action'}]]",
        sanitized,
    )
    return sanitized


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


def _has_explicit_write_confirmation(question: str) -> bool:
    q = question.lower()
    markers = (
        "je confirme",
        "confirme",
        "oui fais-le",
        "oui fais le",
        "vas-y",
        "go",
        "execute",
        "exécute",
        "applique",
        "tu peux le faire",
        "fais-le maintenant",
        "fais le maintenant",
    )
    return any(marker in q for marker in markers)


def _is_write_tool(tool_name: str) -> bool:
    return tool_name in SAFE_OPSFLUX_WRITE_TOOL_ALLOWLIST


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
) -> dict:
    import litellm

    result: dict = {
        "tool_output": None,
        "executed_tool": None,
        "blocked_write_tool": None,
    }
    context = await _build_tool_context(current_user=current_user, entity_id=entity_id, request=request, db=db)
    candidates = await _select_candidate_tools(context, body.messages[-1].content)
    if not candidates:
        return result

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
        return result
    tool_name = str(plan["tool_name"])
    allowed_tools = _allowed_tools_for_question(body.messages[-1].content)
    if tool_name not in allowed_tools:
        logger.warning("AI chat rejected non-whitelisted MCP tool: %s", tool_name)
        await record_audit(
            db,
            action="ai.assistant.tool_rejected",
            resource_type="ai_assistant",
            resource_id=body.context_module or "global",
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "tool_name": tool_name,
                "reason": "not_whitelisted",
                "question_preview": body.messages[-1].content[:300],
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        return result

    backend = await get_or_create_backend("opsflux", {})
    if backend is None:
        return result

    if _is_write_tool(tool_name) and not _has_explicit_write_confirmation(body.messages[-1].content):
        logger.info(
            "AI chat blocked MCP write tool pending confirmation user=%s entity=%s tool=%s",
            current_user.id,
            entity_id,
            tool_name,
        )
        await record_audit(
            db,
            action="ai.assistant.write_blocked",
            resource_type="ai_assistant",
            resource_id=body.context_module or "global",
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "tool_name": tool_name,
                "reason": "missing_confirmation",
                "question_preview": body.messages[-1].content[:300],
                "arguments": plan.get("arguments") if isinstance(plan.get("arguments"), dict) else {},
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        result["blocked_write_tool"] = tool_name
        return result

    try:
        logger.info(
            "AI chat MCP tool call user=%s entity=%s tool=%s",
            current_user.id,
            entity_id,
            tool_name,
        )
        await record_audit(
            db,
            action="ai.assistant.tool_call",
            resource_type="ai_assistant",
            resource_id=body.context_module or "global",
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "tool_name": tool_name,
                "write_tool": _is_write_tool(tool_name),
                "question_preview": body.messages[-1].content[:300],
                "arguments": plan.get("arguments") if isinstance(plan.get("arguments"), dict) else {},
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
        tool_result = await backend.execute_tool(
            tool_name,
            plan.get("arguments") if isinstance(plan.get("arguments"), dict) else {},
            context,
        )
        content = tool_result.get("content", [])
        if content and isinstance(content, list) and isinstance(content[0], dict):
            result["tool_output"] = str(content[0].get("text", ""))[:12000]
            result["executed_tool"] = tool_name
            return result
    except Exception:
        logger.exception("AI chat tool execution failed")
        await record_audit(
            db,
            action="ai.assistant.tool_failed",
            resource_type="ai_assistant",
            resource_id=body.context_module or "global",
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "tool_name": tool_name,
                "write_tool": _is_write_tool(tool_name),
                "question_preview": body.messages[-1].content[:300],
            },
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    return result


async def _generate_chat_response(
    *,
    body: ChatRequest,
    current_user: User,
    entity_id: UUID,
    request: Request,
    db: AsyncSession,
) -> tuple[str, str]:
    import litellm

    ai_cfg = await get_ai_config(entity_id=entity_id, db=db)
    if not ai_cfg.get("api_key") and ai_cfg.get("provider") != "ollama":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI provider not configured. Please set an API key in Settings > Integrations.",
        )

    provider, llm_kwargs = _normalize_model_config(ai_cfg)
    system_prompt = build_system_prompt(current_user, body.context_module)
    tool_result = await _run_opsflux_tool_if_needed(
        ai_cfg=ai_cfg,
        current_user=current_user,
        entity_id=entity_id,
        request=request,
        db=db,
        body=body,
    )
    live_tool_context = tool_result.get("tool_output")
    blocked_write_tool = tool_result.get("blocked_write_tool")

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": FINAL_RESPONSE_PROMPT},
    ]
    if live_tool_context:
        messages.append({
            "role": "system",
            "content": f"Contexte live MCP OpsFlux disponible:\n{live_tool_context}",
        })
    if blocked_write_tool:
        messages.append({
            "role": "system",
            "content": (
                "Un outil MCP d'écriture pertinent a été identifié mais son exécution a été bloquée "
                f"faute de confirmation explicite de l'utilisateur. Outil bloqué: {blocked_write_tool}. "
                "N'affirme pas que l'action a été faite. Explique brièvement ce qui peut être fait et "
                "demande une confirmation explicite avant exécution. Termine par [[action:confirm-write|Confirmer l'action]] si pertinent."
            ),
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
        bool(tool_result.get("executed_tool")),
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

MODULE_AI_INTENTS = ["summary", "risks", "next_actions", "data_quality"]


async def _setting_value(db: AsyncSession, entity_id: UUID, key: str) -> object | None:
    row = (
        await db.execute(
            select(Setting.value).where(
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
                Setting.key == key,
            )
        )
    ).first()
    if not row:
        return None
    value = row[0]
    if isinstance(value, dict) and "v" in value:
        return value["v"]
    return value


async def _module_ai_enabled(db: AsyncSession, entity_id: UUID, module: str) -> bool:
    return bool(await _setting_value(db, entity_id, f"ai.modules.{module}.enabled"))


async def _module_ai_connection(
    db: AsyncSession,
    entity_id: UUID,
    module: str,
) -> IntegrationConnection | None:
    configured_id = await _setting_value(db, entity_id, f"ai.modules.{module}.connection_id")
    stmt = select(IntegrationConnection).where(
        IntegrationConnection.entity_id == entity_id,
        IntegrationConnection.connection_type == "ai_provider",
        IntegrationConnection.status == "active",
    )
    if isinstance(configured_id, str) and configured_id:
        stmt = stmt.where(IntegrationConnection.id == configured_id)
    stmt = stmt.order_by(IntegrationConnection.created_at.desc()).limit(1)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _require_module_ai_permission(
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
    module: str,
) -> None:
    permission = "project.read" if module == "projets" else "tier.tier.read"
    if not await has_user_permission(current_user, entity_id, permission, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")


def _intent_label(intent: str) -> str:
    return {
        "summary": "synthese operationnelle",
        "risks": "risques, alertes et points de controle",
        "next_actions": "prochaines actions recommandees",
        "data_quality": "qualite des donnees et informations manquantes",
    }.get(intent, intent)


async def _build_module_context(
    db: AsyncSession,
    entity_id: UUID,
    owner_type: str,
    owner_id: UUID,
) -> dict:
    if owner_type == "tier":
        tier = await db.scalar(select(Tier).where(Tier.id == owner_id, Tier.entity_id == entity_id))
        if not tier:
            raise HTTPException(status_code=404, detail="Tier not found")
        contact_count = await db.scalar(
            select(sqla_func.count(TierContact.id)).where(
                TierContact.tier_id == owner_id,
                TierContact.active == True,
            )
        )
        return {
            "type": "tier",
            "name": tier.name,
            "code": tier.code,
            "tier_type": tier.type,
            "country": tier.country,
            "industry": tier.industry,
            "registration_number": tier.registration_number,
            "blocked": tier.is_blocked,
            "authorization_center": tier.is_authorization_center,
            "contact_count": int(contact_count or 0),
        }
    if owner_type == "tier_contact":
        contact = await db.scalar(
            select(TierContact).join(Tier, Tier.id == TierContact.tier_id).where(
                TierContact.id == owner_id,
                Tier.entity_id == entity_id,
            )
        )
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found")
        tier = await db.scalar(select(Tier).where(Tier.id == contact.tier_id))
        return {
            "type": "tier_contact",
            "name": f"{contact.first_name} {contact.last_name}".strip(),
            "position": contact.position,
            "department": contact.department,
            "job_position_id": str(contact.job_position_id) if contact.job_position_id else None,
            "company": tier.name if tier else None,
            "company_code": tier.code if tier else None,
            "is_primary": contact.is_primary,
            "linked_user_id": str(contact.linked_user_id) if contact.linked_user_id else None,
        }
    if owner_type == "project":
        project = await db.scalar(select(Project).where(Project.id == owner_id, Project.entity_id == entity_id))
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        task_count = await db.scalar(select(sqla_func.count(ProjectTask.id)).where(ProjectTask.project_id == owner_id, ProjectTask.active == True))
        milestone_count = await db.scalar(select(sqla_func.count(ProjectMilestone.id)).where(ProjectMilestone.project_id == owner_id, ProjectMilestone.active == True))
        member_count = await db.scalar(select(sqla_func.count(ProjectMember.id)).where(ProjectMember.project_id == owner_id, ProjectMember.active == True))
        loss_count = await db.scalar(select(sqla_func.count(ProjectTaskLoss.id)).where(ProjectTaskLoss.project_id == owner_id))
        change_count = await db.scalar(select(sqla_func.count(ProjectChange.id)).where(ProjectChange.project_id == owner_id))
        return {
            "type": "project",
            "name": project.name,
            "code": project.code,
            "status": project.status,
            "priority": project.priority,
            "progress": project.progress,
            "weather": project.weather,
            "trend": project.trend,
            "start_date": project.start_date.isoformat() if project.start_date else None,
            "end_date": project.end_date.isoformat() if project.end_date else None,
            "budget": float(project.budget or 0),
            "currency": project.currency,
            "task_count": int(task_count or 0),
            "milestone_count": int(milestone_count or 0),
            "member_count": int(member_count or 0),
            "loss_count": int(loss_count or 0),
            "change_count": int(change_count or 0),
        }
    raise HTTPException(status_code=422, detail="Unsupported owner_type")


@router.get("/module-status", response_model=ModuleAIStatus)
async def module_ai_status(
    module: Literal["tiers", "projets"],
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return module-level AI availability for the current entity."""
    await _require_module_ai_permission(current_user, entity_id, db, module)
    enabled = await _module_ai_enabled(db, entity_id, module)
    conn = await _module_ai_connection(db, entity_id, module)
    configured = conn is not None
    missing_reason = None
    if not enabled:
        missing_reason = "module_ai_disabled"
    elif not configured:
        missing_reason = "ai_provider_connector_missing"
    return ModuleAIStatus(
        module=module,
        enabled=enabled,
        configured=configured,
        provider=str((conn.config or {}).get("provider")) if conn else None,
        model=str((conn.config or {}).get("model")) if conn else None,
        connection_name=conn.name if conn else None,
        missing_reason=missing_reason,
        intents=MODULE_AI_INTENTS if enabled and configured else [],
    )


@router.post("/module-insight", response_model=ModuleAIInsightResponse)
async def module_ai_insight(
    body: ModuleAIInsightRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Generate a read-only business insight for Tiers or Projets."""
    import litellm

    await _require_module_ai_permission(current_user, entity_id, db, body.module)
    if body.module == "tiers" and body.owner_type not in {"tier", "tier_contact"}:
        raise HTTPException(status_code=422, detail="Invalid owner_type for tiers")
    if body.module == "projets" and body.owner_type != "project":
        raise HTTPException(status_code=422, detail="Invalid owner_type for projets")
    if not await _module_ai_enabled(db, entity_id, body.module):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Module AI is disabled")
    conn = await _module_ai_connection(db, entity_id, body.module)
    if not conn:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI provider connector not configured")

    context = await _build_module_context(db, entity_id, body.owner_type, body.owner_id)
    ai_cfg = await get_ai_config(entity_id=entity_id, db=db, connection_id=conn.id)
    if not ai_cfg.get("api_key") and ai_cfg.get("provider") != "ollama":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="AI provider missing credentials")
    provider, llm_kwargs = _normalize_model_config(ai_cfg)
    messages = [
        {
            "role": "system",
            "content": (
                "Tu es l'assistant metier OpsFlux pour un ERP industriel. "
                "Tu fournis une analyse courte, actionnable et prudente. "
                "Tu ne proposes aucune modification automatique. "
                "Tu respectes strictement le contexte fourni et tu signales les donnees manquantes."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "module": body.module,
                    "objectif": _intent_label(body.intent),
                    "contexte": context,
                    "format": "Markdown court en francais, 3 a 6 puces maximum, avec priorites si utile.",
                },
                ensure_ascii=False,
            ),
        },
    ]
    response = await litellm.acompletion(messages=messages, **llm_kwargs)
    text = (response.choices[0].message.content or "").strip()
    await record_audit(
        db,
        action="ai.module.insight",
        resource_type=f"{body.module}.{body.owner_type}",
        resource_id=str(body.owner_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "module": body.module,
            "intent": body.intent,
            "connection_id": str(conn.id),
            "provider": provider,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return ModuleAIInsightResponse(
        response=text,
        model=str(llm_kwargs["model"]),
        provider=provider,
        intent=body.intent,
    )


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
