# OpsFlux — 07_MODULE_AI_MCP.md
# AI Engine + RAG + MCP Server — Spécification Complète avec Implémentation

---

## 1. Architecture globale

```
Utilisateur (langage naturel dans le panneau IA)
        ↓
OpsFlux AI Orchestrator (LiteLLM proxy)
        ↓ sélectionne les tools nécessaires
OpsFlux MCP Server (stdio ou SSE)
        ↓ RBAC + BU scope + rate limit + audit
FastAPI Backend → PostgreSQL / Storage / ARQ
```

**Règle fondamentale** : l'IA a exactement les droits de l'utilisateur qui l'invoque.
Aucun contournement du RBAC n'est possible via le MCP Server.

---

## 2. Configuration LiteLLM

### Settings par tenant

```python
# app/services/core/ai_service.py

from litellm import acompletion, aembedding
from app.core.security import decrypt

class AIService:
    """
    Service IA unifié. Tous les modules passent par cette classe.
    Ne jamais appeler OpenAI/Anthropic/Ollama directement depuis un module.
    """

    async def _get_provider_config(self, tenant_id: str, function: str) -> dict:
        """
        Retourne la configuration du provider pour une fonction donnée.
        function: "generation" | "embedding" | "suggestion" | "ocr_enhancement"
        """
        async with get_db() as db:
            # Settings IA du tenant
            config_raw = await get_tenant_setting("ai_providers", tenant_id, db)
            if not config_raw:
                # Défaut : Ollama local
                return {
                    "model": f"ollama/{settings.OLLAMA_DEFAULT_MODEL}",
                    "api_base": settings.OLLAMA_BASE_URL,
                    "api_key": "ollama",  # LiteLLM requiert une valeur non-vide
                }

            config = config_raw if isinstance(config_raw, dict) else {}
            providers = config.get("providers", [])

            # Trouver le provider assigné à cette fonction
            for p in providers:
                if function in p.get("functions", []) and p.get("is_active", True):
                    return {
                        "model": f"{p['slug']}/{p['model']}",
                        "api_base": p.get("api_url", ""),
                        "api_key": decrypt(p["api_key_encrypted"]) if p.get("api_key_encrypted") else "none",
                    }

            # Fallback : premier provider actif
            if providers:
                p = providers[0]
                return {
                    "model": f"{p['slug']}/{p['model']}",
                    "api_base": p.get("api_url", ""),
                    "api_key": decrypt(p["api_key_encrypted"]) if p.get("api_key_encrypted") else "none",
                }

            return {
                "model": f"ollama/{settings.OLLAMA_DEFAULT_MODEL}",
                "api_base": settings.OLLAMA_BASE_URL,
                "api_key": "ollama",
            }

    async def complete(
        self,
        prompt: str,
        system: str = "",
        context: list[dict] = None,
        tenant_id: str = None,
        function: str = "generation",
        max_tokens: int = 2000,
        temperature: float = 0.7,
    ) -> str:
        """Génère une complétion via le provider configuré."""
        provider = await self._get_provider_config(tenant_id, function)

        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        if context:
            messages.extend(context)
        messages.append({"role": "user", "content": prompt})

        start = time.time()
        response = await acompletion(
            model=provider["model"],
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            api_base=provider["api_base"] or None,
            api_key=provider["api_key"],
        )
        duration_ms = int((time.time() - start) * 1000)

        # Logger l'usage pour monitoring
        usage = response.usage
        await self._log_usage(
            tenant_id=tenant_id,
            provider=provider["model"].split("/")[0],
            model=provider["model"].split("/", 1)[1],
            function=function,
            prompt_tokens=usage.prompt_tokens if usage else 0,
            completion_tokens=usage.completion_tokens if usage else 0,
            duration_ms=duration_ms,
        )

        return response.choices[0].message.content

    async def embed(self, text: str, tenant_id: str) -> list[float]:
        """Génère un embedding pour le RAG."""
        provider = await self._get_provider_config(tenant_id, "embedding")

        # Pour Ollama : utiliser nomic-embed-text ou mxbai-embed-large
        embed_model = provider["model"].replace("ollama/", "ollama/nomic-embed-text")
        if "openai" in provider["model"]:
            embed_model = "openai/text-embedding-3-small"

        response = await aembedding(
            model=embed_model,
            input=[text],
            api_base=provider["api_base"] or None,
            api_key=provider["api_key"],
        )
        return response.data[0]["embedding"]

    async def _log_usage(self, tenant_id, provider, model, function,
                          prompt_tokens, completion_tokens, duration_ms):
        """Incrémente les compteurs Prometheus."""
        ai_tokens_used.labels(
            provider=provider, model=model,
            function=function, tenant_id=tenant_id
        ).inc(prompt_tokens + completion_tokens)
        ai_request_duration.labels(provider=provider, function=function).observe(duration_ms / 1000)


# Instance globale
ai_service = AIService()
```

### Tables DB settings IA

```sql
-- Les settings IA sont stockés dans module_settings_values
-- key = "ai_providers", scope = "tenant"
-- value = {
--   "providers": [
--     {
--       "slug": "ollama",
--       "label": "Ollama (on-premise)",
--       "api_url": "http://ollama-server:11434",
--       "model": "llama3",
--       "api_key_encrypted": "",
--       "functions": ["generation", "embedding", "suggestion"],
--       "is_active": true
--     },
--     {
--       "slug": "anthropic",
--       "label": "Claude (Anthropic Cloud)",
--       "api_url": "",
--       "model": "claude-sonnet-4-6",
--       "api_key_encrypted": "AES256GCM...",
--       "functions": ["generation"],
--       "is_active": false
--     }
--   ]
-- }
```

---

## 3. Pipeline RAG — Indexation et Requête

### Indexation (job ARQ déclenché à chaque publication)

```python
# app/workers/ai_indexer.py

async def index_document_for_rag(ctx: dict, document_id: str, revision_id: str, tenant_id: str):
    """
    Job ARQ. Indexe un document publié dans pgvector.
    Appelé automatiquement via EventBus on "document.published".
    """
    async with get_db() as db:
        revision = await db.get(Revision, revision_id)
        doc = await db.get(Document, document_id)

        if not revision or not doc:
            return

        # 1. Extraire le texte brut depuis le contenu BlockNote JSON
        plain_text = extract_plain_text_from_blocknote(revision.content)

        if not plain_text.strip():
            return

        # 2. Chunking : 600 tokens, overlap 100 tokens
        chunks = chunk_text(plain_text, chunk_size=600, overlap=100)

        # 3. Supprimer les chunks existants (ré-indexation)
        await db.execute(
            delete(DocumentChunk).where(
                DocumentChunk.tenant_id == tenant_id,
                DocumentChunk.object_id == UUID(document_id),
            )
        )

        # 4. Embedding + stockage pour chaque chunk
        for i, chunk_text_content in enumerate(chunks):
            embedding = await ai_service.embed(chunk_text_content, tenant_id)

            db.add(DocumentChunk(
                tenant_id=tenant_id,
                object_type="document",
                object_id=UUID(document_id),
                chunk_index=i,
                content=chunk_text_content,
                embedding=embedding,
                metadata={
                    "document_number": doc.number,
                    "document_title": doc.title,
                    "doc_type": doc.doc_type.code,
                    "project": doc.project.code if doc.project else None,
                    "revision": revision.rev_code,
                    "date": revision.created_at.isoformat(),
                    "status": doc.status,
                },
            ))

        # 5. Indexer les faits structurés (form_data) séparément
        if revision.form_data:
            for fact_key, fact_value in revision.form_data.items():
                if fact_value is not None:
                    db.add(StructuredFact(
                        tenant_id=tenant_id,
                        object_type="document",
                        object_id=UUID(document_id),
                        fact_key=fact_key,
                        fact_value=str(fact_value),
                        fact_type=infer_fact_type(fact_value),
                    ))

        await db.commit()

def extract_plain_text_from_blocknote(content: dict) -> str:
    """Extrait le texte brut d'un document BlockNote JSON."""
    texts = []
    if isinstance(content, dict):
        blocks = content.get("content") or content.get("blocks") or []
        for block in blocks:
            _extract_from_block(block, texts)
    return " ".join(texts)

def _extract_from_block(block: dict, texts: list):
    if not isinstance(block, dict):
        return
    # Texte inline
    for inline in block.get("content", []):
        if isinstance(inline, dict) and inline.get("type") == "text":
            texts.append(inline.get("text", ""))
    # Blocs enfants récursifs
    for child in block.get("children", []):
        _extract_from_block(child, texts)
    # form_data des FormBlocks
    if block.get("type") == "form_block" and block.get("props", {}).get("values"):
        try:
            vals = json.loads(block["props"]["values"])
            for v in vals.values():
                if v:
                    texts.append(str(v))
        except Exception:
            pass

def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> list[str]:
    """Découpe le texte en chunks avec overlap."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks
```

### Requête RAG

```python
# app/services/core/rag_service.py

async def rag_query(
    question: str,
    tenant_id: str,
    filters: dict = None,
    top_k: int = 5,
    db: AsyncSession = None,
) -> dict:
    """
    Interroge le corpus en langage naturel.
    Retourne une réponse structurée avec sources.
    """
    # 1. Embedding de la question
    q_embedding = await ai_service.embed(question, tenant_id)

    # 2. Recherche de similarité cosinus dans pgvector
    filter_conditions = [
        DocumentChunk.tenant_id == tenant_id,
    ]

    # Filtres optionnels (projet, type de doc, BU...)
    if filters:
        if filters.get("project_code"):
            filter_conditions.append(
                DocumentChunk.metadata["project"].astext == filters["project_code"]
            )
        if filters.get("doc_type"):
            filter_conditions.append(
                DocumentChunk.metadata["doc_type"].astext == filters["doc_type"]
            )

    similar_chunks = await db.execute(
        select(DocumentChunk)
        .where(*filter_conditions)
        .order_by(
            DocumentChunk.embedding.cosine_distance(q_embedding)
        )
        .limit(top_k)
    ).scalars().all()

    if not similar_chunks:
        return {
            "answer": "Je n'ai pas trouvé d'information pertinente dans le corpus documentaire.",
            "sources": [],
            "confidence": "low",
        }

    # 3. Construire le contexte pour le LLM
    context_parts = []
    for chunk in similar_chunks:
        meta = chunk.metadata or {}
        source_label = f"[{meta.get('document_number', '?')} — {meta.get('date', '?')[:10]}]"
        context_parts.append(f"{source_label}\n{chunk.content}")

    context = "\n\n---\n\n".join(context_parts)

    # 4. Générer la réponse via LLM
    answer = await ai_service.complete(
        prompt=question,
        system=(
            "Tu es l'assistant documentaire OpsFlux de Perenco. "
            "Réponds UNIQUEMENT à partir des sources fournies ci-dessous. "
            "Cite toujours le numéro de document entre crochets [NUM] quand tu utilises une information. "
            "Si la réponse ne figure pas dans les sources, dis-le explicitement. "
            "Réponds en français. Sois concis et factuel.\n\n"
            f"Sources disponibles :\n{context}"
        ),
        tenant_id=tenant_id,
        function="generation",
        max_tokens=800,
        temperature=0.3,  # température basse pour réponses factuelles
    )

    # 5. Construire les sources citées
    sources = []
    for chunk in similar_chunks:
        meta = chunk.metadata or {}
        sources.append({
            "document_number": meta.get("document_number"),
            "document_title": meta.get("document_title"),
            "document_id": str(chunk.object_id),
            "revision": meta.get("revision"),
            "date": meta.get("date", "")[:10],
            "excerpt": chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content,
            "relevance_score": round(1 - float(chunk.embedding.cosine_distance(q_embedding) if hasattr(chunk, '_score') else 0.5), 2),
        })

    return {
        "answer": answer,
        "sources": sources,
        "question": question,
        "chunks_used": len(similar_chunks),
    }
```

---

## 4. MCP Server — Implémentation complète

### Point d'entrée

```python
# app/mcp/server.py

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import asyncio

app = Server("opsflux")

# Registry des tools (chargé au démarrage)
TOOL_REGISTRY: dict[str, "MCPTool"] = {}

def register_tool(tool: "MCPTool"):
    TOOL_REGISTRY[tool.name] = tool

@app.list_tools()
async def list_tools() -> list[Tool]:
    return [tool.definition() for tool in TOOL_REGISTRY.values()]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    tool = TOOL_REGISTRY.get(name)
    if not tool:
        return [TextContent(type="text", text=f"Tool inconnu : {name}")]

    # Contexte utilisateur (injecté par l'appelant via le transport)
    user_context = arguments.pop("_user_context", {})

    result = await security_layer.execute_tool(tool, arguments, user_context)
    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())

if __name__ == "__main__":
    asyncio.run(main())
```

### Couche de sécurité

```python
# app/mcp/security.py

class MCPSecurityLayer:
    MAX_CALLS_PER_MINUTE = 50

    # Permissions requises par tool
    TOOL_PERMISSIONS = {
        "search_documents": "document.read",
        "get_document": "document.read",
        "create_document": "document.create",
        "update_document_field": "document.edit",
        "submit_document_for_validation": "document.submit",
        "approve_document": "document.approve",
        "reject_document": "document.approve",
        "summarize_document": "document.read",
        "generate_from_template": "document.create",
        "get_similar_documents": "document.read",
        "get_pending_validations": "document.read",
        "delegate_validation": "document.submit",
        "query_connector": "connector.read",
        "get_kpi_value": "dashboard.read",
        "search_assets": "asset.read",
        "create_asset": "asset.create",
        "search_equipment": "pid.read",
        "trace_process_line": "pid.read",
        "suggest_tag_name": "tag.read",
        "validate_tag_name": "tag.read",
        "rag_query": "document.read",
        "send_notification": "notification.send",
        "get_my_recommendations": None,  # Aucune permission requise
    }

    # Tools nécessitant une confirmation explicite avant exécution
    CONFIRMATION_REQUIRED = {
        "submit_document_for_validation",
        "approve_document",
        "reject_document",
        "delegate_validation",
        "create_document",
        "create_asset",
        "send_notification",
    }

    async def execute_tool(
        self,
        tool: "MCPTool",
        params: dict,
        user_context: dict,
    ) -> dict:
        """Pipeline de sécurité complet avant exécution d'un tool."""
        user_id = user_context.get("user_id")
        tenant_id = user_context.get("tenant_id")
        bu_id = user_context.get("bu_id")

        if not user_id or not tenant_id:
            return {"error": "Contexte utilisateur manquant", "success": False}

        async with get_db() as db:
            user = await db.get(User, user_id)
            if not user or not user.is_active:
                return {"error": "Utilisateur invalide", "success": False}

            # 1. Vérification RBAC
            required_perm = self.TOOL_PERMISSIONS.get(tool.name)
            if required_perm:
                has_perm = await check_user_permission(db, user_id, tenant_id, required_perm)
                if not has_perm:
                    return {
                        "error": f"Permission '{required_perm}' requise pour cette action",
                        "success": False,
                    }

            # 2. Injection BU scope
            params = self._inject_bu_scope(params, tenant_id, bu_id)
            params["_tenant_id"] = tenant_id
            params["_user_id"] = user_id

            # 3. Rate limiting
            rate_key = f"mcp_rate:{user_id}"
            count = await redis_client.incr(rate_key)
            if count == 1:
                await redis_client.expire(rate_key, 60)
            if count > self.MAX_CALLS_PER_MINUTE:
                return {
                    "error": "Trop d'appels en 1 minute. Réessayez dans un instant.",
                    "success": False,
                    "retry_after_seconds": 60,
                }

            # 4. Confirmation requise (pour actions critiques)
            if tool.name in self.CONFIRMATION_REQUIRED:
                confirmed = params.pop("_confirmed", False)
                if not confirmed:
                    return {
                        "requires_confirmation": True,
                        "confirmation_message": tool.confirmation_message(params),
                        "confirm_by": "Relancer la commande avec confirmed=true",
                        "success": False,
                    }

            # 5. Exécution
            try:
                result = await tool.execute(params, db)
            except PermissionError as e:
                return {"error": str(e), "success": False}
            except Exception as e:
                logger.error(f"MCP tool error [{tool.name}]: {e}", exc_info=True)
                return {"error": "Erreur interne. Vérifiez les logs.", "success": False}

            # 6. Audit Log (actor = AI:{user_id})
            await log_activity(
                tenant_id=tenant_id,
                actor_id=f"AI:{user_id}",
                object_type="mcp_tool",
                object_id=tool.name,
                action=f"mcp.{tool.name}",
                payload={
                    "params": {k: v for k, v in params.items()
                               if not k.startswith("_")},
                    "success": result.get("success", True),
                },
            )

            return result

    def _inject_bu_scope(self, params: dict, tenant_id: str, bu_id: str) -> dict:
        """Injecte le scope BU dans les paramètres si applicable."""
        if "bu_id" not in params and bu_id:
            params["_bu_id"] = bu_id
        return params


security_layer = MCPSecurityLayer()
```

### Catalogue complet des tools — Implémentation

```python
# app/mcp/tools/documents.py

class SearchDocumentsTool:
    name = "search_documents"
    description = "Recherche des documents dans OpsFlux par mot-clé, projet, type ou statut"

    def definition(self) -> Tool:
        return Tool(
            name=self.name,
            description=self.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Mot-clé de recherche"},
                    "project_code": {"type": "string", "description": "Filtrer par code projet"},
                    "doc_type": {"type": "string", "description": "Filtrer par type (RPT, PRC, ...)"},
                    "status": {"type": "string", "description": "Filtrer par statut (draft, approved, published...)"},
                    "limit": {"type": "integer", "default": 10, "description": "Nombre max de résultats"},
                },
                "required": [],
            }
        )

    async def execute(self, params: dict, db: AsyncSession) -> dict:
        tenant_id = params["_tenant_id"]
        bu_id = params.get("_bu_id")

        results = await report_service.search_documents(
            tenant_id=tenant_id,
            bu_id=bu_id,
            search=params.get("query"),
            doc_type=params.get("doc_type"),
            status=params.get("status"),
            page_size=min(params.get("limit", 10), 20),
        )

        return {
            "success": True,
            "count": results["total"],
            "documents": [
                {
                    "id": str(d.id),
                    "number": d.number,
                    "title": d.title,
                    "status": d.status,
                    "doc_type": d.doc_type.code,
                    "project": d.project.code if d.project else None,
                    "updated_at": d.updated_at.isoformat(),
                    "url": f"/documents/{d.id}",
                }
                for d in results["items"]
            ],
        }


class GenerateFromTemplateTool:
    name = "generate_from_template"
    description = "Génère un brouillon de document à partir d'un template et de données contextuelles"

    def confirmation_message(self, params: dict) -> str:
        return f"Je vais créer un nouveau document depuis le template '{params.get('template_id')}'. Confirmer ?"

    def definition(self) -> Tool:
        return Tool(
            name=self.name,
            description=self.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "template_id": {"type": "string", "description": "ID du template à utiliser"},
                    "project_id": {"type": "string", "description": "ID du projet"},
                    "context_data": {
                        "type": "object",
                        "description": "Données contextuelles pour remplir le document",
                    },
                    "title": {"type": "string", "description": "Titre du document"},
                    "_confirmed": {"type": "boolean", "default": False},
                },
                "required": ["template_id", "project_id"],
            }
        )

    async def execute(self, params: dict, db: AsyncSession) -> dict:
        tenant_id = params["_tenant_id"]
        user_id = params["_user_id"]

        template = await get_template(params["template_id"], tenant_id, db)
        project = await db.get(Project, params["project_id"])

        if not template:
            return {"error": f"Template '{params['template_id']}' introuvable", "success": False}

        # Générer le contenu via LLM
        context_data = params.get("context_data", {})
        ai_prompt = (
            f"Génère le contenu d'un {template.name} pour le projet {project.name}. "
            f"Données disponibles : {json.dumps(context_data, ensure_ascii=False)}. "
            f"Structure attendue : {json.dumps(template.structure.get('sections', []), ensure_ascii=False)}. "
            f"Réponds avec le contenu structuré pour chaque section, en JSON avec les clés section_id et content."
        )

        ai_content = await ai_service.complete(
            prompt=ai_prompt,
            system="Tu es un assistant de rédaction technique pour Perenco. Génère des contenus précis et professionnels.",
            tenant_id=tenant_id,
            function="generation",
        )

        # Créer le document
        doc_number = await nomenclature_service.generate_document_number(
            template.doc_type, project, await get_tenant(tenant_id, db),
            None, db=db,
        )

        doc = Document(
            tenant_id=tenant_id,
            doc_type_id=template.doc_type_id,
            project_id=UUID(params["project_id"]),
            number=doc_number,
            title=params.get("title", f"{template.name} — {datetime.now().strftime('%d/%m/%Y')}"),
            status="draft",
            created_by=UUID(user_id),
        )
        db.add(doc)
        await db.flush()

        # Créer la révision avec le contenu généré
        revision = Revision(
            tenant_id=tenant_id,
            document_id=doc.id,
            rev_code="0",
            content=build_blocknote_from_template(template, ai_content),
            form_data=context_data,
            created_by=UUID(user_id),
        )
        db.add(revision)
        doc.current_revision_id = revision.id
        await db.commit()

        return {
            "success": True,
            "document_id": str(doc.id),
            "document_number": doc.number,
            "document_title": doc.title,
            "status": "draft",
            "message": f"Document {doc.number} créé en brouillon",
            "actions": [
                {"label": "Ouvrir le document", "url": f"/documents/{doc.id}"},
                {"label": "Soumettre pour validation",
                 "tool": "submit_document_for_validation",
                 "params": {"document_id": str(doc.id)}},
            ],
        }


# ─── Tools Workflow ─────────────────────────────────────────────

class GetPendingValidationsTool:
    name = "get_pending_validations"
    description = "Liste les documents en attente de validation pour l'utilisateur courant"

    def definition(self) -> Tool:
        return Tool(
            name=self.name,
            description=self.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "include_overdue": {"type": "boolean", "default": True,
                                       "description": "Inclure les validations en retard uniquement"},
                    "limit": {"type": "integer", "default": 20},
                },
            }
        )

    async def execute(self, params: dict, db: AsyncSession) -> dict:
        tenant_id = params["_tenant_id"]
        user_id = params["_user_id"]

        # Trouver les instances de workflow où l'user est assigné au nœud courant
        pending = await db.execute(
            select(WorkflowInstance)
            .join(WorkflowDefinition)
            .where(
                WorkflowInstance.tenant_id == tenant_id,
                WorkflowInstance.status == "in_progress",
            )
            .limit(params.get("limit", 20))
        ).scalars().all()

        # Filtrer celles où l'user courant peut agir
        result = []
        for instance in pending:
            if await workflow_fsm.can_current_user_act(instance, user_id, db):
                obj = await get_object_for_instance(instance, db)
                entered_at = await get_node_entry_time(instance.id, instance.current_node_id, db)
                days_waiting = (datetime.utcnow() - entered_at).days if entered_at else 0

                result.append({
                    "instance_id": str(instance.id),
                    "object_type": instance.object_type,
                    "object_id": str(instance.object_id),
                    "object_title": getattr(obj, "title", "") if obj else "",
                    "object_number": getattr(obj, "number", "") if obj else "",
                    "current_step": instance.current_node_id,
                    "days_waiting": days_waiting,
                    "is_overdue": days_waiting > 3,
                    "url": f"/{instance.object_type}s/{instance.object_id}",
                })

        if params.get("include_overdue"):
            result.sort(key=lambda x: (-x["is_overdue"], -x["days_waiting"]))

        return {
            "success": True,
            "count": len(result),
            "pending_validations": result,
            "overdue_count": sum(1 for r in result if r["is_overdue"]),
        }


class DelegateValidationTool:
    name = "delegate_validation"
    description = "Délègue une validation à un autre utilisateur pour une durée limitée"

    def confirmation_message(self, params: dict) -> str:
        return (f"Je vais déléguer la validation du document '{params.get('document_id')}' "
                f"à l'utilisateur '{params.get('delegate_user_id')}' "
                f"jusqu'au {params.get('valid_until', 'vendredi')}. Confirmer ?")

    def definition(self) -> Tool:
        return Tool(
            name=self.name,
            description=self.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "document_id": {"type": "string"},
                    "delegate_user_id": {"type": "string",
                                        "description": "ID ou email de l'utilisateur destinataire"},
                    "valid_until": {"type": "string",
                                   "description": "Date de fin de délégation (ex: '2025-03-20' ou 'vendredi')"},
                    "reason": {"type": "string"},
                    "_confirmed": {"type": "boolean", "default": False},
                },
                "required": ["document_id", "delegate_user_id"],
            }
        )

    async def execute(self, params: dict, db: AsyncSession) -> dict:
        # Résoudre l'utilisateur delegate (par ID ou email)
        delegate_id = params["delegate_user_id"]
        if "@" in delegate_id:
            delegate = await db.execute(
                select(User).where(User.email == delegate_id)
            ).scalar_one_or_none()
            if not delegate:
                return {"error": f"Utilisateur '{delegate_id}' introuvable", "success": False}
            delegate_id = str(delegate.id)

        # Résoudre la date de fin
        valid_until = parse_delegation_date(params.get("valid_until", ""))
        if not valid_until:
            valid_until = datetime.utcnow() + timedelta(days=7)  # défaut 1 semaine

        db.add(Delegation(
            tenant_id=params["_tenant_id"],
            delegator_id=UUID(params["_user_id"]),
            delegate_id=UUID(delegate_id),
            valid_from=datetime.utcnow(),
            valid_to=valid_until,
            reason=params.get("reason"),
            scope={"object_ids": [params["document_id"]]},
        ))
        await db.commit()

        # Notifier le délégué
        await notify(
            user_id=delegate_id,
            template_key="workflow.delegation_received",
            context={
                "delegator_name": (await db.get(User, params["_user_id"])).full_name,
                "document_id": params["document_id"],
                "valid_until": valid_until.strftime("%d/%m/%Y"),
            },
            tenant_id=params["_tenant_id"],
        )

        return {
            "success": True,
            "message": f"Délégation créée jusqu'au {valid_until.strftime('%d/%m/%Y')}",
            "delegate_id": delegate_id,
            "valid_until": valid_until.isoformat(),
        }


# ─── Tool RAG ────────────────────────────────────────────────────

class RAGQueryTool:
    name = "rag_query"
    description = "Interroge le corpus documentaire OpsFlux en langage naturel"

    def definition(self) -> Tool:
        return Tool(
            name=self.name,
            description=self.description,
            inputSchema={
                "type": "object",
                "properties": {
                    "question": {"type": "string", "description": "Question en langage naturel"},
                    "project_code": {"type": "string",
                                    "description": "Restreindre la recherche à un projet"},
                    "doc_type": {"type": "string",
                                "description": "Restreindre la recherche à un type de document"},
                    "top_k": {"type": "integer", "default": 5,
                             "description": "Nombre de chunks à utiliser comme contexte"},
                },
                "required": ["question"],
            }
        )

    async def execute(self, params: dict, db: AsyncSession) -> dict:
        result = await rag_service.rag_query(
            question=params["question"],
            tenant_id=params["_tenant_id"],
            filters={
                "project_code": params.get("project_code"),
                "doc_type": params.get("doc_type"),
            },
            top_k=params.get("top_k", 5),
            db=db,
        )
        return {"success": True, **result}


# ─── Enregistrement de tous les tools ────────────────────────────

def register_all_tools():
    for tool_class in [
        SearchDocumentsTool, GenerateFromTemplateTool,
        GetPendingValidationsTool, DelegateValidationTool,
        RAGQueryTool,
        # ... autres tools
    ]:
        register_tool(tool_class())

register_all_tools()
```

---

## 5. Catalogue complet des tools MCP

| Tool | Permission | Confirmation | Description |
|---|---|---|---|
| `search_documents` | `document.read` | Non | Recherche documents par mot-clé, projet, type, statut |
| `get_document` | `document.read` | Non | Détail complet d'un document avec métadonnées |
| `create_document` | `document.create` | **Oui** | Créer un document vide depuis un template |
| `update_document_field` | `document.edit` | Non | Modifier un champ form_data d'un document |
| `submit_document_for_validation` | `document.submit` | **Oui** | Soumettre un document au workflow |
| `approve_document` | `document.approve` | **Oui** | Approuver une étape de validation |
| `reject_document` | `document.approve` | **Oui** | Rejeter avec motif obligatoire |
| `summarize_document` | `document.read` | Non | Résumé exécutif LLM d'un document |
| `get_similar_documents` | `document.read` | Non | Documents similaires via RAG |
| `list_templates` | `document.read` | Non | Lister les templates disponibles |
| `generate_from_template` | `document.create` | **Oui** | Générer un brouillon via LLM |
| `get_pending_validations` | `document.read` | Non | Validations en attente de l'user courant |
| `get_workflow_status` | `document.read` | Non | Statut workflow d'un document |
| `delegate_validation` | `document.submit` | **Oui** | Déléguer une validation |
| `query_connector` | `connector.read` | Non | Lire données d'un connecteur configuré |
| `get_kpi_value` | `dashboard.read` | Non | Valeur actuelle d'un KPI |
| `compare_periods` | `dashboard.read` | Non | Comparer deux périodes sur une métrique |
| `search_assets` | `asset.read` | Non | Chercher des assets dans le registre |
| `get_asset` | `asset.read` | Non | Fiche complète d'un asset |
| `create_asset` | `asset.create` | **Oui** | Créer un asset |
| `search_equipment` | `pid.read` | Non | Chercher un équipement par tag ou description |
| `trace_process_line` | `pid.read` | Non | Tracer une ligne de procédé sur tous les PID |
| `get_pid_for_equipment` | `pid.read` | Non | PID(s) où apparaît un équipement |
| `suggest_tag_name` | `tag.read` | Non | Suggestions de noms de tags conformes aux règles |
| `validate_tag_name` | `tag.read` | Non | Vérifier la conformité d'un nom de tag |
| `rag_query` | `document.read` | Non | Interroger le corpus en langage naturel |
| `get_my_recommendations` | — | Non | Recommandations du jour pour l'user courant |
| `send_notification` | `notification.send` | **Oui** | Envoyer une notification à un utilisateur |

---

## 6. Interface AI Panel React (composants complets)

```tsx
// src/components/core/AIPanel.tsx

export const AIPanel = () => {
    const { aiPanelOpen, toggleAIPanel } = useUIStore()
    const [messages, setMessages] = useState<AIMessage[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [pendingConfirmation, setPendingConfirmation] = useState<ConfirmationRequest | null>(null)
    const { data: briefing } = useAIBriefing()
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const sendMessage = async (text: string) => {
        if (!text.trim() || isLoading) return

        const userMsg: AIMessage = { id: uuid(), role: "user", content: text }
        setMessages(prev => [...prev, userMsg])
        setInput("")
        setIsLoading(true)

        try {
            const response = await api.post("/api/v1/ai/chat", {
                message: text,
                history: messages.slice(-10),  // 10 derniers messages comme contexte
                confirmed: pendingConfirmation?.confirmed,
            })

            const aiMsg: AIMessage = {
                id: uuid(),
                role: "assistant",
                content: response.data.answer,
                sources: response.data.sources,
                actions: response.data.actions,
                requires_confirmation: response.data.requires_confirmation,
                confirmation_message: response.data.confirmation_message,
            }

            if (response.data.requires_confirmation) {
                setPendingConfirmation({
                    message: response.data.confirmation_message,
                    original_message: text,
                    confirmed: false,
                })
            } else {
                setPendingConfirmation(null)
            }

            setMessages(prev => [...prev, aiMsg])
        } catch (err) {
            setMessages(prev => [...prev, {
                id: uuid(), role: "assistant",
                content: "Une erreur s'est produite. Réessayez.",
            }])
        } finally {
            setIsLoading(false)
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
        }
    }

    if (!aiPanelOpen) return null

    return (
        <aside className="w-[260px] flex-shrink-0 border-l border-border bg-background flex flex-col">
            {/* En-tête */}
            <div className="flex items-center h-[40px] border-b border-border px-3 gap-2 flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-sm font-medium flex-1">Assistant OpsFlux</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleAIPanel}>
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            {/* Zone de messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {messages.length === 0 && briefing && (
                    <AIBriefing briefing={briefing} onAction={sendMessage} />
                )}

                {messages.map(msg => (
                    <AIMessageBubble
                        key={msg.id}
                        message={msg}
                        onAction={(action) => sendMessage(action)}
                    />
                ))}

                {/* Demande de confirmation */}
                {pendingConfirmation && (
                    <ConfirmationCard
                        message={pendingConfirmation.confirmation_message}
                        onConfirm={() => {
                            setPendingConfirmation(prev => prev ? {...prev, confirmed: true} : null)
                            sendMessage(pendingConfirmation.original_message)
                        }}
                        onCancel={() => setPendingConfirmation(null)}
                    />
                )}

                {isLoading && <AITypingIndicator />}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-2 flex gap-2">
                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Demander à OpsFlux..."
                    className="h-8 text-sm"
                    onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault()
                            sendMessage(input)
                        }
                    }}
                />
                <Button size="icon" className="h-8 w-8 flex-shrink-0"
                    disabled={!input.trim() || isLoading}
                    onClick={() => sendMessage(input)}>
                    <Send className="h-3.5 w-3.5" />
                </Button>
            </div>
        </aside>
    )
}

const AIMessageBubble = ({ message, onAction }: { message: AIMessage; onAction: (a: string) => void }) => (
    <div className={cn("space-y-1.5", message.role === "user" && "flex justify-end")}>
        {message.role === "assistant" ? (
            <div className="space-y-2">
                <div className="text-xs bg-muted rounded-md p-2.5 text-foreground leading-relaxed">
                    {message.content}
                </div>

                {/* Sources citées */}
                {message.sources && message.sources.length > 0 && (
                    <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                            Sources
                        </p>
                        {message.sources.map((s, i) => (
                            <a key={i}
                                href={`/documents/${s.document_id}`}
                                className="flex items-center gap-1.5 text-[11px] text-primary hover:underline">
                                <FileText className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{s.document_number}</span>
                            </a>
                        ))}
                    </div>
                )}

                {/* Actions proposées */}
                {message.actions && message.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {message.actions.map((action, i) => (
                            <Button key={i} variant="outline" size="sm"
                                className="h-6 text-[11px] px-2"
                                onClick={() => action.url
                                    ? window.location.href = action.url
                                    : onAction(action.label)
                                }>
                                {action.label}
                            </Button>
                        ))}
                    </div>
                )}
            </div>
        ) : (
            <div className="bg-primary/10 rounded-md px-2.5 py-1.5 text-xs text-foreground max-w-[85%]">
                {message.content}
            </div>
        )}
    </div>
)

const ConfirmationCard = ({ message, onConfirm, onCancel }) => (
    <div className="border border-amber-200 bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 space-y-2">
        <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">{message}</p>
        </div>
        <div className="flex gap-1.5">
            <Button size="sm" className="h-6 text-[11px] px-2 bg-amber-600 hover:bg-amber-700"
                onClick={onConfirm}>
                Confirmer
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2"
                onClick={onCancel}>
                Annuler
            </Button>
        </div>
    </div>
)
```

---

## 7. API Endpoints IA

```python
# app/api/routes/core/ai.py

router = APIRouter(prefix="/ai", tags=["ai"])

@router.post("/chat")
async def chat(body: AIChatRequest, request: Request):
    """
    Point d'entrée du chat IA. Combine RAG + MCP tools selon la question.
    """
    tenant_id = request.state.tenant_id
    user_id = request.state.user_id

    # Analyser l'intention (RAG ou action MCP ?)
    intent = await classify_intent(body.message, body.history, tenant_id)

    if intent["type"] == "question":
        # RAG : répondre depuis le corpus
        result = await rag_service.rag_query(
            question=body.message,
            tenant_id=tenant_id,
            filters=intent.get("filters", {}),
        )
        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "actions": [],
        }

    elif intent["type"] == "action":
        # MCP : exécuter un tool
        tool_name = intent["tool"]
        tool_params = intent["params"]
        tool_params["_confirmed"] = body.confirmed

        user_context = {
            "user_id": user_id,
            "tenant_id": tenant_id,
            "bu_id": request.state.bu_id,
        }

        result = await security_layer.execute_tool(
            TOOL_REGISTRY[tool_name],
            tool_params,
            user_context,
        )
        return result

    else:
        # Conversation générale
        answer = await ai_service.complete(
            prompt=body.message,
            system=(
                "Tu es l'assistant OpsFlux de Perenco. "
                "Aide les utilisateurs à utiliser la plateforme. "
                "Réponds en français."
            ),
            context=[{"role": m.role, "content": m.content} for m in body.history[-5:]],
            tenant_id=tenant_id,
        )
        return {"answer": answer, "sources": [], "actions": []}


@router.get("/briefing")
async def get_briefing(request: Request):
    """Briefing journalier pour le panneau IA."""
    user_id = request.state.user_id
    tenant_id = request.state.tenant_id

    recommendations = await get_user_recommendations(user_id, tenant_id, limit=5)
    pending = await get_pending_validations_count(user_id, tenant_id)

    return {
        "date": datetime.now().strftime("%A %d %B %Y"),
        "pending_validations": pending,
        "urgent": [r for r in recommendations if r.priority == "critical"],
        "today": [r for r in recommendations if r.priority == "high"],
        "suggestions": [r for r in recommendations if r.priority in ("medium", "low")],
    }


@router.post("/extract-legacy")
async def extract_from_legacy_document(
    file: UploadFile,
    template_id: str,
    request: Request,
):
    """
    Extrait des données structurées d'un document legacy (PDF ou Word).
    Utilise OCR si nécessaire puis LLM pour extraire les form_data.
    """
    tenant_id = request.state.tenant_id

    # 1. Extraire le texte (OCR si PDF scanné)
    content = await file.read()
    if file.content_type == "application/pdf":
        # Essayer d'abord extraction directe (si PDF natif)
        text = await extract_text_from_pdf_native(content)
        if len(text.strip()) < 100:
            # PDF scanné → OCR
            text = await ocr_service.extract_text(content, file.content_type)
    else:
        text = content.decode("utf-8", errors="replace")

    # 2. Récupérer les champs attendus du template
    template = await get_template(template_id, tenant_id)
    expected_fields = [
        f for section in template.structure.get("sections", [])
        for f in section.get("fields", [])
        if section.get("type") == "form"
    ]

    # 3. LLM extrait les valeurs
    fields_desc = json.dumps([
        {"key": f["key"], "label": f["label"]["fr"], "type": f["type"]}
        for f in expected_fields
    ], ensure_ascii=False)

    prompt = (
        f"Extrait les valeurs des champs suivants depuis le texte du document.\n"
        f"Champs à extraire : {fields_desc}\n\n"
        f"Texte du document :\n{text[:8000]}\n\n"
        f"Réponds UNIQUEMENT avec un JSON valide avec les valeurs extraites. "
        f"Utilise null si une valeur n'est pas trouvée."
    )

    extracted_json = await ai_service.complete(
        prompt=prompt,
        system="Tu es un extracteur de données structurées. Réponds uniquement en JSON valide.",
        tenant_id=tenant_id,
        function="generation",
        temperature=0.1,
    )

    try:
        extracted = json.loads(extracted_json)
    except json.JSONDecodeError:
        # Tenter de nettoyer le JSON
        cleaned = re.search(r'\{.*\}', extracted_json, re.DOTALL)
        extracted = json.loads(cleaned.group()) if cleaned else {}

    return {
        "extracted_fields": extracted,
        "fields_count": len([v for v in extracted.values() if v is not None]),
        "total_fields": len(expected_fields),
        "text_length": len(text),
        "template_id": template_id,
    }
```

---

## 8. PDCA — Phase IA & MCP (Phase 9)

| Étape | Tâche détaillée | Critère mesurable | Effort |
|---|---|---|---|
| PLAN | Configurer LiteLLM + Ollama + pgvector. Tester endpoint Ollama | `curl localhost:11434/api/generate -d '{"model":"llama3","prompt":"test"}'` répond en < 5s | 1j |
| PLAN | Documenter catalogue des 27 tools MCP avec leurs paramètres et permissions | Fichier `mcp/tools_catalog.json` complet et validé | 1j |
| DO | UI Configuration IA admin : ajouter/modifier/supprimer providers par tenant | Ajouter Ollama → test de connexion → "OK 847ms" | 3j |
| DO | Job ARQ `index_document_for_rag` : chunking + embedding + stockage pgvector | Document publié → job déclenché → vecteurs en DB en < 30s | 4j |
| DO | Job batch `reindex_documents_for_rag` : ré-indexer tous les docs publiés existants | 100 documents réindexés en < 10 min | 2j |
| DO | API `/api/v1/ai/chat` : classification intention + RAG + MCP routing | Question sur production BIPAGA → réponse avec source citée | 4j |
| DO | Interface AI Panel React complète : messages + sources + actions + confirmation | Cycle complet : question → réponse → source cliquable → action avec confirmation | 4j |
| DO | MCP Server Python : server.py + security_layer + 10 premiers tools | `rag_query`, `search_documents`, `get_pending_validations`, `generate_from_template` fonctionnent | 5j |
| DO | MCP Server : 17 tools restants (voir catalogue §5) | Tous les 27 tools testés avec scénarios réels | 6j |
| DO | Auto-complétion BlockNote : debounce 1s → LLM → suggestion inline au Tab | Taper 5 mots → Tab → suggestion contextuelle affichée en < 2s | 3j |
| DO | Briefing journalier (`/api/v1/ai/briefing`) : recommandations + validations en attente | Ouvrir OpsFlux le matin → briefing avec 2 validations urgentes affiché | 2j |
| DO | Extraction legacy : PDF/Word → OCR si nécessaire → LLM → form_data | Upload rapport Word 2023 → 7 valeurs extraites sur 8 champs | 5j |
| CHECK | RAG : 20 questions/réponses sur 50 documents réels Perenco. Évaluation manuelle | Score pertinence ≥ 70% (14/20 réponses correctes avec bonne source) | 3j |
| CHECK | MCP Server : scénario complet via MCP uniquement : générer rapport BIPAGA + soumettre | Rapport créé en brouillon + soumis en workflow via tools MCP, 0 erreur 403 | 2j |
| ACT | Dashboard Grafana : tokens/jour par tenant, latence p95, taux d'erreur IA | Dashboard actif, alerte si cost/jour > seuil configuré | 2j |
