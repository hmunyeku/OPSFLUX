# Module AI & MCP -- Specification Fusionnee

## 1. Architecture -- MCP embarque dans le Core

Il n'y a qu'un seul serveur MCP dans OpsFlux, **embarque dans le core**. Les modules (Projets, Planner, PaxLog, TravelWiz) enregistrent leurs outils comme **plugins** dans ce serveur au demarrage de l'application via `ModuleRegistry`.

**Multi-tenancy :** Tenant (schema PG) > Entity (entity_id) > BU.
**ORM :** SQLAlchemy 2.0 async.
**Event bus :** PostgreSQL LISTEN/NOTIFY.
**LLM :** API Claude (Anthropic) -- pas de LiteLLM.
**Embeddings :** pgvector + modeles sentence-transformers.
**Domaines :** *.opsflux.io

```
+----------------------------------------------------------+
|                    Clients MCP                             |
|  Claude Desktop | Claude.ai | App OpsFlux | Agents IA     |
+----------------------------+-----------------------------+
                             | MCP Protocol (SSE / stdio)
                             v
+----------------------------------------------------------+
|         OpsFlux MCP Server (Core -- unique)                |
|  URL: https://api.opsflux.io/mcp                          |
|                                                            |
|  Plugins enregistres au startup:                           |
|  common + projets + planner + paxlog + travelwiz           |
|                                                            |
|  Auth: JWT user -> droits RBAC identiques a l'API REST     |
|  Audit: chaque appel logge dans audit_log (source=mcp)     |
+----------------------------+-----------------------------+
                             | Appels internes FastAPI
                             v
+----------------------------------------------------------+
|              OpsFlux API (FastAPI)                         |
|           Tous les endpoints existants                     |
+----------------------------------------------------------+
```

**Regle fondamentale :** l'IA a exactement les droits de l'utilisateur qui l'invoque. Aucun contournement du RBAC n'est possible via le MCP Server.

---

## 2. Enregistrement des plugins MCP

```python
# app/mcp/register.py

from app.core.module_registry import module_registry

async def register_mcp_plugins():
    """Appele dans app/main.py lifespan startup."""
    from app.mcp.tools import common, projets, planner, paxlog, travelwiz

    module_registry.register_mcp_tools("common",    common.get_tools())
    module_registry.register_mcp_tools("projets",   projets.get_tools())
    module_registry.register_mcp_tools("planner",   planner.get_tools())
    module_registry.register_mcp_tools("paxlog",    paxlog.get_tools())
    module_registry.register_mcp_tools("travelwiz", travelwiz.get_tools())


# app/mcp/tools/base.py -- classe de base pour les outils
class OpsFluxTool:
    """
    Classe de base pour les outils MCP OpsFlux.
    Injecte automatiquement l'entity_id et audite chaque appel.
    """

    def __init__(self, name: str, description: str, readonly: bool = True):
        self.name = name
        self.description = description
        self.readonly = readonly

    async def __call__(self, **kwargs) -> dict:
        ctx = module_registry.get_mcp_context()
        user = ctx.user
        entity_id = kwargs.pop("entity_id", ctx.default_entity_id)

        # Audit
        await audit_log.record(
            entity_type="mcp_tool", entity_id=None,
            action="called",
            new_values={"tool": self.name, "params": kwargs},
            performed_by=user.id, source="mcp", mcp_tool=self.name
        )

        # Execution avec timeout
        try:
            result = await asyncio.wait_for(
                self._execute(user=user, entity_id=entity_id, **kwargs),
                timeout=30.0
            )
            return {"success": True, "data": result}
        except HTTPException as e:
            return {"success": False, "error": e.detail, "status_code": e.status_code}
        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _execute(self, **kwargs):
        raise NotImplementedError
```

---

## 3. Service IA unifie -- API Claude (Anthropic)

```python
# app/services/core/ai_service.py

import anthropic

class AIService:
    """
    Service IA unifie. Tous les modules passent par cette classe.
    Ne jamais appeler l'API Anthropic directement depuis un module.
    Utilise l'API Claude (Anthropic) comme LLM principal.
    """

    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = settings.ANTHROPIC_MODEL  # ex: claude-sonnet-4-6

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
        """Genere une completion via l'API Claude."""
        messages = []
        if context:
            messages.extend(context)
        messages.append({"role": "user", "content": prompt})

        start = time.time()
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system if system else anthropic.NOT_GIVEN,
            messages=messages,
            temperature=temperature,
        )
        duration_ms = int((time.time() - start) * 1000)

        # Logger l'usage
        usage = response.usage
        await self._log_usage(
            tenant_id=tenant_id,
            model=self.model,
            function=function,
            prompt_tokens=usage.input_tokens,
            completion_tokens=usage.output_tokens,
            duration_ms=duration_ms,
        )

        return response.content[0].text

    async def embed(self, text: str, tenant_id: str) -> list[float]:
        """Genere un embedding pour le RAG via sentence-transformers ou pgvector."""
        # Utilise un modele local sentence-transformers pour les embeddings
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-MiniLM-L6-v2')
        return model.encode(text).tolist()

    async def _log_usage(self, tenant_id, model, function,
                          prompt_tokens, completion_tokens, duration_ms):
        """Incremente les compteurs Prometheus."""
        ai_tokens_used.labels(
            model=model, function=function, tenant_id=tenant_id
        ).inc(prompt_tokens + completion_tokens)
        ai_request_duration.labels(model=model, function=function).observe(duration_ms / 1000)


# Instance globale
ai_service = AIService()
```

---

## 4. Pipeline RAG -- Indexation et Requete

### 4.1 Indexation (job APScheduler declenche a chaque publication)

```python
# app/workers/ai_indexer.py

async def index_document_for_rag(ctx: dict, document_id: str, revision_id: str, tenant_id: str):
    """
    Job APScheduler. Indexe un document publie dans pgvector.
    Declenche automatiquement via EventBus sur "document.published".
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

        # 3. Supprimer les chunks existants (re-indexation)
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

        # 5. Indexer les faits structures (form_data) separement
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


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 100) -> list[str]:
    """Decoupe le texte en chunks avec overlap."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i:i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks
```

### 4.2 Requete RAG

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
    Retourne une reponse structuree avec sources.
    """
    # 1. Embedding de la question
    q_embedding = await ai_service.embed(question, tenant_id)

    # 2. Recherche de similarite cosinus dans pgvector
    filter_conditions = [DocumentChunk.tenant_id == tenant_id]

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
        .order_by(DocumentChunk.embedding.cosine_distance(q_embedding))
        .limit(top_k)
    )
    similar_chunks = similar_chunks.scalars().all()

    if not similar_chunks:
        return {
            "answer": "Je n'ai pas trouve d'information pertinente dans le corpus documentaire.",
            "sources": [],
            "confidence": "low",
        }

    # 3. Construire le contexte pour le LLM
    context_parts = []
    for chunk in similar_chunks:
        meta = chunk.metadata or {}
        source_label = f"[{meta.get('document_number', '?')} -- {meta.get('date', '?')[:10]}]"
        context_parts.append(f"{source_label}\n{chunk.content}")

    context = "\n\n---\n\n".join(context_parts)

    # 4. Generer la reponse via Claude
    answer = await ai_service.complete(
        prompt=question,
        system=(
            "Tu es l'assistant documentaire OpsFlux. "
            "Reponds UNIQUEMENT a partir des sources fournies ci-dessous. "
            "Cite toujours le numero de document entre crochets [NUM] quand tu utilises une information. "
            "Si la reponse ne figure pas dans les sources, dis-le explicitement. "
            "Reponds en francais. Sois concis et factuel.\n\n"
            f"Sources disponibles :\n{context}"
        ),
        tenant_id=tenant_id,
        function="generation",
        max_tokens=800,
        temperature=0.3,
    )

    # 5. Construire les sources citees
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
        })

    return {
        "answer": answer,
        "sources": sources,
        "question": question,
        "chunks_used": len(similar_chunks),
    }
```

---

## 5. MCP Server -- Implementation

### 5.1 Point d'entree

```python
# app/mcp/server.py

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent
import asyncio

app = Server("opsflux")

# Registry des tools (charge au demarrage via ModuleRegistry)
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

    user_context = arguments.pop("_user_context", {})
    result = await security_layer.execute_tool(tool, arguments, user_context)
    return [TextContent(type="text", text=json.dumps(result, ensure_ascii=False, default=str))]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())
```

### 5.2 Couche de securite

```python
# app/mcp/security.py

class MCPSecurityLayer:
    MAX_CALLS_PER_MINUTE = 50

    # Permissions requises par tool (resource.action)
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
        "rag_query": "document.read",
        "send_notification": "notification.send",
        "get_my_recommendations": None,
    }

    # Tools necessitant une confirmation explicite
    CONFIRMATION_REQUIRED = {
        "submit_document_for_validation",
        "approve_document", "reject_document",
        "delegate_validation",
        "create_document", "create_asset",
        "send_notification",
    }

    async def execute_tool(self, tool, params: dict, user_context: dict) -> dict:
        """Pipeline de securite complet avant execution d'un tool."""
        user_id = user_context.get("user_id")
        tenant_id = user_context.get("tenant_id")
        bu_id = user_context.get("bu_id")

        if not user_id or not tenant_id:
            return {"error": "Contexte utilisateur manquant", "success": False}

        async with get_db() as db:
            user = await db.get(User, user_id)
            if not user or not user.is_active:
                return {"error": "Utilisateur invalide", "success": False}

            # 1. Verification RBAC (permissions granulaires)
            required_perm = self.TOOL_PERMISSIONS.get(tool.name)
            if required_perm:
                has_perm = await check_user_permission(db, user_id, tenant_id, required_perm)
                if not has_perm:
                    return {"error": f"Permission '{required_perm}' requise", "success": False}

            # 2. Injection BU scope
            if "bu_id" not in params and bu_id:
                params["_bu_id"] = bu_id
            params["_tenant_id"] = tenant_id
            params["_user_id"] = user_id

            # 3. Rate limiting (Redis)
            rate_key = f"mcp_rate:{user_id}"
            count = await redis_client.incr(rate_key)
            if count == 1:
                await redis_client.expire(rate_key, 60)
            if count > self.MAX_CALLS_PER_MINUTE:
                return {"error": "Trop d'appels en 1 minute.", "success": False, "retry_after_seconds": 60}

            # 4. Confirmation requise (actions critiques)
            if tool.name in self.CONFIRMATION_REQUIRED:
                confirmed = params.pop("_confirmed", False)
                if not confirmed:
                    return {
                        "requires_confirmation": True,
                        "confirmation_message": tool.confirmation_message(params),
                        "success": False,
                    }

            # 5. Execution
            try:
                result = await tool.execute(params, db)
            except Exception as e:
                logger.error(f"MCP tool error [{tool.name}]: {e}", exc_info=True)
                return {"error": "Erreur interne.", "success": False}

            # 6. Audit Log (actor = AI:{user_id})
            await log_activity(
                tenant_id=tenant_id,
                actor_id=f"AI:{user_id}",
                object_type="mcp_tool",
                object_id=tool.name,
                action=f"mcp.{tool.name}",
                payload={"params": {k: v for k, v in params.items() if not k.startswith("_")},
                         "success": result.get("success", True)},
            )

            return result


security_layer = MCPSecurityLayer()
```

---

## 6. Catalogue complet des outils MCP

### 6.1 Outils communs (referentiels)

```python
# app/mcp/tools/common.py

class GetAssets(OpsFluxTool):
    name = "get_assets"
    description = "Recherche des assets OpsFlux (filiales, champs, sites, plateformes, puits)."

class GetProjects(OpsFluxTool):
    name = "get_projects"
    description = "Liste ou recherche des projets OpsFlux de l'entite courante."

class GetUsers(OpsFluxTool):
    name = "get_users"
    description = "Recherche des utilisateurs OpsFlux par nom ou role."

class GetCostCenters(OpsFluxTool):
    name = "get_cost_centers"
    description = "Liste les centres de cout disponibles."

def get_tools() -> list[OpsFluxTool]:
    return [GetAssets(), GetProjects(), GetUsers(), GetCostCenters()]
```

### 6.2 Outils Projets

```python
# app/mcp/tools/projets.py

class GetProjectDetail(OpsFluxTool):
    name = "get_project_detail"
    description = "Detail complet d'un projet: informations, WBS, planning, chemin critique."

class GetScheduleCriticalPath(OpsFluxTool):
    name = "get_schedule_critical_path"
    description = "Chemin critique du planning actif d'un projet."

class SimulateScheduleChange(OpsFluxTool):
    name = "simulate_schedule_change"
    readonly = True  # simulation uniquement
    description = "Simule un decalage de taches et montre l'impact en cascade SANS enregistrer."

class PushTasksToPlanner(OpsFluxTool):
    name = "push_tasks_to_planner"
    readonly = False
    description = "Cree des fenetres d'activite dans Planner pour les taches du planning projet."

def get_tools() -> list[OpsFluxTool]:
    return [GetProjectDetail(), GetScheduleCriticalPath(),
            SimulateScheduleChange(), PushTasksToPlanner()]
```

### 6.3 Outils Planner

```python
# app/mcp/tools/planner.py

class GetPlannerAvailability(OpsFluxTool):
    name = "get_planner_availability"
    description = "Capacite PAX disponible sur un asset pour une periode."

class GetPlannerConflicts(OpsFluxTool):
    name = "get_planner_conflicts"
    description = "Conflits de scheduling en attente d'arbitrage DO."

class GetPlannerGantt(OpsFluxTool):
    name = "get_planner_gantt"
    description = "Donnees du planning Gantt pour un asset ou un projet."

class CheckSitePaxLoad(OpsFluxTool):
    name = "check_site_pax_load"
    description = "Charge PAX actuelle sur un ou plusieurs sites."

class ResolveConflict(OpsFluxTool):
    name = "resolve_conflict"
    readonly = False
    description = "Resout un conflit Planner (DO uniquement)."

def get_tools() -> list[OpsFluxTool]:
    return [GetPlannerAvailability(), GetPlannerConflicts(), GetPlannerGantt(),
            CheckSitePaxLoad(), ResolveConflict()]
```

### 6.4 Outils PaxLog

```python
# app/mcp/tools/paxlog.py

class SearchPax(OpsFluxTool):
    name = "search_pax"
    description = "Recherche un profil PAX par nom avec deduplication fuzzy."

class GetPaxCompliance(OpsFluxTool):
    name = "get_pax_compliance"
    description = "Verifie si un PAX satisfait les prerequis HSE pour un site."

class CreateAds(OpsFluxTool):
    name = "create_ads"
    readonly = False
    description = "Cree un Avis de Sejour pour un ou plusieurs PAX."

class GetPendingValidationAds(OpsFluxTool):
    name = "get_pending_validation_ads"
    description = "AdS en attente de validation pour l'utilisateur connecte."

class ValidateAds(OpsFluxTool):
    name = "validate_ads"
    readonly = False
    description = "Valide ou rejette une AdS."

class GetPaxIncidents(OpsFluxTool):
    name = "get_pax_incidents"
    description = "Incidents actifs pour un PAX, une entreprise ou un site."

class GetLiveOperations(OpsFluxTool):
    name = "get_live_operations_pax"
    description = "Vue temps reel des operations PAX."

def get_tools() -> list[OpsFluxTool]:
    return [SearchPax(), GetPaxCompliance(), CreateAds(),
            GetPendingValidationAds(), ValidateAds(),
            GetPaxIncidents(), GetLiveOperations()]
```

### 6.5 Outils TravelWiz

```python
# app/mcp/tools/travelwiz.py

class GetVehiclePositions(OpsFluxTool):
    name = "get_vehicle_positions"
    description = "Position actuelle des vecteurs actifs avec statut et ETA."

class GetTripTimeline(OpsFluxTool):
    name = "get_trip_timeline"
    description = "Timeline complete d'un voyage: evenements, meteo, PAX, KPIs."

class AnalyzeRoute(OpsFluxTool):
    name = "analyze_route"
    description = "Analyse historique d'une route: duree, variabilite, impact meteo."

class GetFleetKPIs(OpsFluxTool):
    name = "get_fleet_kpis"
    description = "KPIs de la flotte sur une periode: productivite, consommation, ponctualite."

class SearchCargo(OpsFluxTool):
    name = "search_cargo"
    description = "Recherche un colis par numero de tracking, reference ou statut."

class GetCargoHistory(OpsFluxTool):
    name = "get_cargo_history"
    description = "Historique complet des mouvements d'un colis."

class MatchSapCode(OpsFluxTool):
    name = "match_sap_code"
    description = "Identifie le code SAP probable d'un article via IA."

class GetCurrentWeather(OpsFluxTool):
    name = "get_current_weather"
    description = "Meteo actuelle et previsions 48h pour un asset ou un vecteur."

class RunDeckOptimization(OpsFluxTool):
    name = "run_deck_optimization"
    readonly = False
    description = "Optimise le placement des colis sur le pont d'un vecteur."

def get_tools() -> list[OpsFluxTool]:
    return [GetVehiclePositions(), GetTripTimeline(), AnalyzeRoute(),
            GetFleetKPIs(), SearchCargo(), GetCargoHistory(),
            MatchSapCode(), GetCurrentWeather(), RunDeckOptimization()]
```

### 6.6 Tableau recapitulatif

| Tool | Permission | Confirmation | Description |
|---|---|---|---|
| `search_documents` | `document.read` | Non | Recherche documents |
| `get_document` | `document.read` | Non | Detail d'un document |
| `create_document` | `document.create` | **Oui** | Creer un document |
| `update_document_field` | `document.edit` | Non | Modifier un champ |
| `submit_document_for_validation` | `document.submit` | **Oui** | Soumettre au workflow |
| `approve_document` | `document.approve` | **Oui** | Approuver |
| `reject_document` | `document.approve` | **Oui** | Rejeter |
| `summarize_document` | `document.read` | Non | Resume LLM |
| `get_similar_documents` | `document.read` | Non | Documents similaires via RAG |
| `generate_from_template` | `document.create` | **Oui** | Generer brouillon via LLM |
| `get_pending_validations` | `document.read` | Non | Validations en attente |
| `delegate_validation` | `document.submit` | **Oui** | Deleguer une validation |
| `search_assets` | `asset.read` | Non | Chercher des assets |
| `create_asset` | `asset.create` | **Oui** | Creer un asset |
| `rag_query` | `document.read` | Non | Interroger le corpus |
| `get_my_recommendations` | -- | Non | Recommandations du jour |
| `send_notification` | `notification.send` | **Oui** | Envoyer une notification |

---

## 7. Services IA embarques

### 7.1 SAP Matcher

```python
# app/services/ai/sap_matcher.py

class SAPMatcher:
    """
    Phase 1: TF-IDF pour le matching textuel rapide.
    Phase 2: Embeddings sentence-transformers (pgvector) pour la semantique.
    """

    async def build_index(self, db: AsyncSession) -> None:
        """Construit l'index TF-IDF depuis la base articles. Appele au startup."""
        articles = await db.query(ArticleCatalog).filter(ArticleCatalog.active == True).all()
        if not articles:
            return
        descriptions = [a.description_normalized for a in articles]
        self.tfidf_vectorizer = TfidfVectorizer(
            analyzer='word', ngram_range=(1, 2),
            max_features=10000, sublinear_tf=True
        )
        self.tfidf_matrix = self.tfidf_vectorizer.fit_transform(descriptions)

    async def suggest(self, description: str, packaging_type: str = None,
                      db: AsyncSession = None) -> list[SAPSuggestion]:
        """Top-k suggestions. Combine TF-IDF (rapide) et embeddings pgvector."""
        # 1. TF-IDF (synchrone, rapide)
        # 2. Recherche vectorielle pgvector (si embeddings disponibles)
        # 3. Tri par confiance decroissante
        ...

    async def confirm_suggestion(self, cargo_item_id: UUID, confirmed: bool,
                                  db: AsyncSession) -> None:
        """Feedback loop: confirmation ou rejet d'une suggestion IA."""
        ...

sap_matcher = SAPMatcher()
```

### 7.2 Detecteur d'anomalies

```python
# app/services/ai/anomaly_detector.py
# Batch quotidien: 0 2 * * *

class AnomalyDetector:

    ANOMALY_TYPES = {
        "pax_expired_credential": {
            "severity": "warning",
            "description_template": "PAX {pax_name} a une certification {cred_type} "
                                    "qui expire dans {days} jours -- AdS {ads_ref} en cours",
        },
        "cargo_stalled": {
            "severity": "warning",
            "description_template": "Colis {tracking} immobile depuis {days} jours (statut: {status})",
        },
        "manifest_weight_exceeded": {
            "severity": "critical",
            "description_template": "Manifeste {manifest_ref}: poids total {actual}kg "
                                    "depasse la capacite {capacity}kg du vecteur",
        },
        "ads_without_manifest": {
            "severity": "info",
            "description_template": "AdS {ads_ref} approuvee depuis {days} jours "
                                    "sans manifeste TravelWiz associe",
        },
        "potential_pax_duplicate": {
            "severity": "warning",
            "description_template": "Profils PAX similaires: {pax1} ({company1}) et {pax2} ({company2})",
        },
        "vehicle_signal_stale": {
            "severity": "warning",
            "description_template": "Vecteur {vehicle_name} sans signal GPS depuis {hours}h",
        },
        "voyage_consolidation": {
            "severity": "info",
            "description_template": "2 voyages vers {destination} le {date} avec {pax1} et {pax2} PAX "
                                    "respectivement. Consolidation possible pour optimiser le vecteur.",
        },
        "cargo_grouping": {
            "severity": "info",
            "description_template": "{count} colis en attente pour {destination} ({total_weight}kg). "
                                    "Groupage possible sur le prochain voyage du {next_voyage_date}.",
        },
    }

    async def run_daily_batch(self, db: AsyncSession) -> int:
        """Lance toutes les verifications d'anomalies."""
        total = 0
        total += await self._check_expiring_credentials(db)
        total += await self._check_stalled_cargo(db)
        total += await self._check_manifest_weights(db)
        total += await self._check_ads_without_manifests(db)
        total += await self._check_pax_duplicates_cross_company(db)
        total += await self._check_voyage_consolidation(db)
        total += await self._check_cargo_grouping(db)
        return total

anomaly_detector = AnomalyDetector()
```

### 7.3 Generateur de rapports narratifs

```python
# app/services/ai/report_generator.py

class ReportGenerator:
    """
    Genere des rapports narratifs en langage naturel via l'API Claude.
    Utilise pour: resumes hebdomadaires, rapports de voyage, analyses de performance.
    """

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    model = settings.ANTHROPIC_MODEL

    async def generate_trip_summary(self, trip_id: UUID, db: AsyncSession,
                                     language: str = "fr") -> str:
        """Rapport narratif d'un voyage termine."""
        ...

    async def generate_weekly_ops_summary(self, entity_id: UUID, week_start: date,
                                           db: AsyncSession) -> str:
        """Resume hebdomadaire des operations (PAX + cargo + flotte)."""
        ...

report_generator = ReportGenerator()
```

**Types de rapports narratifs supportes :**

| Type | Slug | Description |
|---|---|---|
| Rapport de fin de voyage | `trip_summary` | Resume narratif d'un voyage termine : PAX transportes, escales, incidents, duree, conditions meteo |
| Resume hebdomadaire | `weekly_ops_summary` | Resume des operations de la semaine : mouvements PAX, voyages, cargo, anomalies detectees |
| Rapport HSE mensuel | `monthly_hse_report` | Compile les incidents, signalements, certifications expirees, anomalies detectees, statistiques compliance par site. Genere un rapport structure avec sections : synthese, incidents, conformite, recommandations. |
| Rapport d'avancement projet | `project_status_report` | Resume les taches terminees/en cours/en retard, chemin critique, risques identifies, prochaines etapes. Inclut les KPIs projet (SPI, CPI si disponibles). |

Les endpoints correspondants sont :

```
POST   /api/v1/ai/reports/trip-summary/:trip_id       Rapport de voyage
POST   /api/v1/ai/reports/weekly-summary               Resume hebdomadaire
POST   /api/v1/ai/reports/monthly-hse                  Rapport HSE mensuel
       Body: { "entity_id": "...", "month": "2026-03", "sites": ["site_id_1", "site_id_2"] }
POST   /api/v1/ai/reports/project-status/:project_id   Rapport d'avancement projet
```

---

## 8. Assistant IA integre (in-app)

### 8.1 Comportement

L'assistant est disponible depuis un panneau lateral retractable dans chaque module. Il repond en langue naturelle et utilise les outils MCP du module courant.

**Regles de comportement :**
1. **L'IA ne valide jamais seule** -- toute action irreversible necessite une confirmation explicite
2. **L'IA opere dans le contexte user** -- droits RBAC identiques, pas de contournement
3. **L'IA annonce ses actions** -- avant d'appeler un outil: "Je verifie la compliance de ce PAX..."
4. **L'IA memorise le contexte de session** -- entites mentionnees restent disponibles
5. **L'IA demande de clarifier** -- si une recherche retourne plusieurs candidats ambigus

### 8.2 Exemples d'interactions

```
# PaxLog -- verification compliance
User: "Verifie si Amadou Nzie peut monter sur Munja la semaine prochaine"
-> search_pax("Amadou Nzie") -> get_pax_compliance(pax_id, asset="Munja")
-> "Amadou Nzie est conforme pour Munja: toutes ses certifications sont valides.
   Voulez-vous que je prepare un Avis de Sejour ?"

# Planner -- simulation
User: "Que se passe-t-il si on decale la campagne E-LINE de 3 semaines ?"
-> get_projects(q="E-LINE") -> simulate_schedule_change(...)
-> "Simulation uniquement (non enregistree):
   - 5 taches impactees, nouveau chemin critique: 12 semaines
   - 3 AdS approuvees seraient affectees
   Voulez-vous enregistrer ce scenario ?"

# TravelWiz -- meteo
User: "Peut-on faire voler le HERA P demain matin ?"
-> get_vehicle_positions() -> get_current_weather(asset_id=destination)
-> "Vent: 12 noeuds (Force 3 Beaufort) -- conditions normales.
   Aucune alerte meteo. Les conditions permettent les operations."
```

### 8.3 Gestion des elements du briefing

Chaque element du briefing propose 3 actions a l'utilisateur :

| Action | Comportement |
|---|---|
| **Traiter** | Ouvre le contexte associe (ex: ouvrir l'AdS a valider, le conflit a resoudre, la certification a renouveler) |
| **Reporter** | Masque l'element pendant 4 heures, reapparait ensuite automatiquement |
| **Ignorer** | Masque definitivement l'element pour ce jour (reapparait le lendemain si toujours pertinent) |

**3 niveaux de priorite visuels :**

| Niveau | Couleur | Exemples | Contraintes |
|---|---|---|---|
| 🔴 **Urgent** | Rouge (`destructive`) | Actions bloquantes, certifications expirees, conflits non resolus | Maximum 3 elements. **Ne peuvent pas etre reportes ni ignores.** |
| 🟠 **Aujourd'hui** | Orange (`warning`) | Validations en attente, taches du jour, documents a soumettre | Reportables et ignorables |
| 🔵 **Suggestions** | Bleu (`info`) | Recommandations, rappels, informations, optimisations possibles | Reportables et ignorables |

**Regles d'affichage :**
- Les elements URGENT sont toujours affiches en premier, non compressibles.
- Si plus de 5 elements "Aujourd'hui", les suivants sont replies dans un expandable "Voir {N} autres".
- Les elements "Suggestions" sont affiches uniquement si l'utilisateur developpe la section.

---

## 9. Interface AI Panel React

```tsx
// src/components/core/AIPanel.tsx

export const AIPanel = () => {
    const { aiPanelOpen, toggleAIPanel } = useUIStore()
    const [messages, setMessages] = useState<AIMessage[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [pendingConfirmation, setPendingConfirmation] = useState(null)
    const { data: briefing } = useAIBriefing()

    const sendMessage = async (text: string) => {
        // POST /api/v1/ai/chat avec l'historique
        // Gestion des confirmations (actions critiques)
        // Affichage sources et actions proposees
    }

    return (
        <aside className="w-[260px] flex-shrink-0 border-l">
            {/* En-tete + zone messages + briefing journalier */}
            {/* Sources citees cliquables */}
            {/* Actions proposees en boutons */}
            {/* Carte de confirmation pour actions critiques */}
            {/* Input de saisie */}
        </aside>
    )
}
```

---

## 10. Modele de donnees IA

```sql
-- Anomalies detectees par le systeme
CREATE TABLE ai_anomalies (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id         UUID REFERENCES entities(id),
    type              VARCHAR(50) NOT NULL,
    severity          VARCHAR(20) NOT NULL,  -- critical | warning | info
    entity_type       VARCHAR(50),
    entity_obj_id     UUID,
    description       TEXT NOT NULL,
    suggested_action  TEXT,
    status            VARCHAR(20) DEFAULT 'open',
    -- open | acknowledged | resolved | false_positive
    acknowledged_by   UUID REFERENCES users(id),
    acknowledged_at   TIMESTAMPTZ,
    resolved_at       TIMESTAMPTZ,
    detected_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_anomalies_status   ON ai_anomalies(entity_id, status);
CREATE INDEX idx_anomalies_severity ON ai_anomalies(severity, status);

-- Suggestions IA (matching SAP, deduplication PAX)
CREATE TABLE ai_suggestions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suggestion_type     VARCHAR(30) NOT NULL,  -- sap_match | pax_dedup
    entity_id           UUID,
    entity_type         VARCHAR(50),
    suggested_value     VARCHAR(200) NOT NULL,
    confidence_score    DECIMAL(4,3) NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending',
    -- pending | confirmed | rejected
    reviewed_by         UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_suggestions_entity ON ai_suggestions(entity_type, entity_id);

-- Sessions MCP (audit des conversations IA)
CREATE TABLE mcp_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    entity_id       UUID REFERENCES entities(id),
    client_type     VARCHAR(50),  -- claude_desktop | in_app | api_agent
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    tool_call_count INTEGER DEFAULT 0,
    mutation_count  INTEGER DEFAULT 0
);

-- Appels d'outils MCP (audit detaille)
CREATE TABLE mcp_tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID REFERENCES mcp_sessions(id),
    tool_name       VARCHAR(100) NOT NULL,
    input_params    JSONB NOT NULL,
    output_summary  TEXT,
    success         BOOLEAN NOT NULL,
    error_message   TEXT,
    duration_ms     INTEGER,
    called_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_mcp_calls_session ON mcp_tool_calls(session_id);
CREATE INDEX idx_mcp_calls_tool    ON mcp_tool_calls(tool_name, called_at DESC);
```

---

## 11. API Endpoints IA

```
# Chat IA
POST   /api/v1/ai/chat                    Chat IA (classification intention + RAG + MCP routing)
GET    /api/v1/ai/briefing                Briefing journalier

# RAG
POST   /api/v1/ai/rag/query              Interrogation corpus en langage naturel

# Extraction legacy
POST   /api/v1/ai/extract-legacy         PDF/Word -> OCR si necessaire -> LLM -> form_data

# Processus UX complet — Extraction legacy :
# 1. L'utilisateur uploade un fichier Word/PDF dans un template OpsFlux
# 2. Le systeme effectue l'OCR si necessaire (PDF scanne → Tesseract)
# 3. Le LLM analyse le document et extrait les valeurs correspondant aux champs du formulaire
# 4. Apercu cote utilisateur : chaque champ extrait affiche avec son score de confiance (0-100%)
# 5. L'utilisateur valide, corrige ou rejette chaque valeur individuellement
# 6. Les valeurs validees sont injectees dans le formulaire
#
# Regle : le LLM ne fabrique JAMAIS de donnees — si une information n'est pas trouvee,
#          le champ reste vide avec confiance 0%
# Gestion des echecs : si le document est illisible ou dans un format non supporte,
#          message explicite "Extraction impossible — format non reconnu ou document illisible"

# Anomalies
GET    /api/v1/ai/anomalies              Liste des anomalies (filtrable)
PATCH  /api/v1/ai/anomalies/:id/acknowledge  Accuser reception
PATCH  /api/v1/ai/anomalies/:id/resolve      Resoudre

# Matching SAP
POST   /api/v1/ai/sap-match              Suggestion code SAP pour une description
POST   /api/v1/ai/sap-match/rebuild-index  Reconstruire l'index TF-IDF

# Catalogue SAP
POST   /api/v1/ai/article-catalog/import  Import CSV/Excel du catalogue
GET    /api/v1/ai/article-catalog          Liste articles (filtrable)

# Rapports narratifs
POST   /api/v1/ai/reports/trip-summary/:trip_id    Rapport de voyage
POST   /api/v1/ai/reports/weekly-summary           Resume hebdomadaire

# Sessions MCP (admin)
GET    /api/v1/ai/mcp-sessions            Historique sessions MCP
```

---

## 12. Configuration Claude Desktop

```json
{
  "mcpServers": {
    "opsflux": {
      "command": "npx",
      "args": ["-y", "@opsflux/mcp-client"],
      "env": {
        "OPSFLUX_URL": "https://api.opsflux.io",
        "OPSFLUX_TOKEN": "<jwt_token_de_lutilisateur>"
      }
    }
  }
}
```

Le package `@opsflux/mcp-client` est un thin client qui proxy les appels MCP vers le serveur OpsFlux. Pas de logique metier cote client.

---

## 13. Enregistrement module

```python
# Au startup de l'application
from app.core.module_registry import module_registry

module_registry.register("ai_mcp", MODULE_MANIFEST)
```

---

## 14. AI Assist — Framework d'assistance intelligente

### 14.1 Concept

AI Assist est un service **transversal** du Core qui permet a chaque module d'enregistrer des **fonctions d'assistance IA**. Quand l'IA est activee dans la configuration, ces fonctions interviennent pour pre-remplir des formulaires, suggerer des valeurs, detecter des anomalies ou generer du contenu — **toujours sous controle de l'utilisateur**.

```
+---------------------------------------------------------------+
|                     AI Assist Registry                         |
|  Enregistrement au startup via ModuleRegistry                  |
|                                                                |
|  core.tiers.detect_duplicates          (detect)                |
|  paxlog.ads.prefill_from_description   (prefill)    ← LLM     |
|  planner.activity.suggest_duration     (suggest)               |
|  travelwiz.cargo.match_sap             (suggest)    ← LLM     |
|  projets.wbs.generate_skeleton         (generate)   ← LLM     |
|  ...                                                           |
+-------------------------------+-------------------------------+
                                |
          ai_assist_service.is_enabled(slug, entity_id)
                                |
                   +-----------+-----------+
                   |                       |
              Settings DB            RBAC check
         (toggle par fonction)    (droits utilisateur)
```

**Principes fondamentaux :**

1. **Opt-in granulaire** — Chaque fonction IA est desactivable individuellement par l'admin. 3 niveaux de controle : global → categorie → fonction.
2. **Transparence** — L'utilisateur voit toujours que c'est l'IA qui a pre-rempli (badge "IA", couleur distincte). Il peut modifier ou ignorer.
3. **RBAC respecte** — L'IA ne propose que ce que l'utilisateur a le droit de voir/faire.
4. **Cout maitrise** — Les fonctions qui appellent le LLM sont marquees (`requires_llm = True`). L'admin peut desactiver les fonctions couteuses.
5. **Feedback loop** — L'utilisateur peut accepter/modifier/rejeter chaque suggestion. Le feedback est stocke pour ameliorer les suggestions futures.

---

### 14.2 Categories de fonctions

| Categorie | Slug | Description | Icone UI |
|---|---|---|---|
| **Prefill** | `prefill` | Pre-remplir des champs de formulaire depuis le contexte (description libre, entite parente, historique) | `Sparkles` |
| **Suggest** | `suggest` | Suggerer des valeurs pendant la saisie (autocomplete, valeurs probables, match fuzzy) | `Lightbulb` |
| **Detect** | `detect` | Detecter proactivement des problemes (doublons, anomalies, compliance, conflits) | `ShieldAlert` |
| **Generate** | `generate` | Generer du contenu textuel (rapports, resumes, descriptions, WBS) | `FileText` |
| **Analyze** | `analyze` | Analyser des patterns (tendances, previsions, optimisation) | `TrendingUp` |

---

### 14.3 Enregistrement des fonctions AI Assist

```python
# app/core/ai_assist/registry.py

from dataclasses import dataclass, field
from typing import Callable, Any

@dataclass
class AIAssistFunction:
    """Definition d'une fonction AI Assist enregistree par un module."""
    slug: str                    # ex: "paxlog.ads.prefill_from_description"
    module: str                  # ex: "paxlog"
    category: str                # prefill | suggest | detect | generate | analyze
    label_fr: str                # "Pre-remplir l'AdS depuis une description"
    label_en: str                # "Pre-fill ADS from description"
    description_fr: str          # Description complete pour l'admin
    requires_llm: bool = False   # True = appel API Claude (cout tokens)
    default_enabled: bool = True # Etat par defaut si non configure
    target_form: str = None      # Formulaire cible (ex: "ads_create", "tiers_create")
    handler: Callable = None     # Fonction async qui execute l'assistance

class AIAssistRegistry:
    """Registre central des fonctions AI Assist."""

    _functions: dict[str, AIAssistFunction] = {}

    def register(self, func: AIAssistFunction):
        self._functions[func.slug] = func

    def get_by_module(self, module: str) -> list[AIAssistFunction]:
        return [f for f in self._functions.values() if f.module == module]

    def get_by_category(self, category: str) -> list[AIAssistFunction]:
        return [f for f in self._functions.values() if f.category == category]

    def get_catalog(self) -> list[dict]:
        """Catalogue complet pour l'UI d'administration."""
        return [
            {
                "slug": f.slug,
                "module": f.module,
                "category": f.category,
                "label": {"fr": f.label_fr, "en": f.label_en},
                "description": f.description_fr,
                "requires_llm": f.requires_llm,
                "default_enabled": f.default_enabled,
            }
            for f in self._functions.values()
        ]

ai_assist_registry = AIAssistRegistry()
```

```python
# app/core/ai_assist/service.py

class AIAssistService:
    """Service principal AI Assist. Verifie l'activation avant execution."""

    async def is_enabled(self, slug: str, entity_id: UUID, db: AsyncSession) -> bool:
        """Verifie si une fonction AI Assist est activee pour cette entite."""
        func = ai_assist_registry._functions.get(slug)
        if not func:
            return False

        # 1. Toggle global IA
        global_enabled = await get_module_setting(
            "core", "ai_enabled", entity_id, db
        )
        if not global_enabled:
            return False

        # 2. Toggle par categorie
        category_enabled = await get_module_setting(
            "core", f"ai_category_{func.category}_enabled", entity_id, db
        )
        if category_enabled is False:
            return False

        # 3. Toggle individuel de la fonction
        func_setting = await get_module_setting(
            "ai_assist", slug, entity_id, db
        )
        if func_setting is not None:
            return func_setting
        return func.default_enabled

    async def execute(
        self, slug: str, context: dict,
        entity_id: UUID, user_id: UUID, db: AsyncSession
    ) -> dict | None:
        """Execute une fonction AI Assist si activee. Retourne None si desactivee."""
        if not await self.is_enabled(slug, entity_id, db):
            return None

        func = ai_assist_registry._functions[slug]

        # Verifier permission RBAC du user sur le module
        # (l'IA ne propose que ce que le user peut voir/faire)

        result = await func.handler(context=context, entity_id=entity_id, db=db)

        # Logger l'utilisation
        await self._log_assist(
            slug=slug, entity_id=entity_id, user_id=user_id,
            result_type=type(result).__name__, db=db
        )

        return result

    async def record_feedback(
        self, slug: str, accepted: bool,
        original: dict, modified: dict | None,
        entity_id: UUID, user_id: UUID, db: AsyncSession
    ):
        """Enregistre le feedback utilisateur sur une suggestion IA."""
        db.add(AIAssistFeedback(
            function_slug=slug,
            entity_id=entity_id,
            user_id=user_id,
            accepted=accepted,
            original_suggestion=original,
            user_modification=modified,
        ))
        await db.commit()

ai_assist_service = AIAssistService()
```

---

### 14.4 Catalogue complet des fonctions AI Assist

#### Core

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `core.tiers.detect_duplicates` | detect | Non | Detecter les entreprises/contacts en doublon lors de la creation (fuzzy pg_trgm) |
| `core.tiers.prefill_from_name` | prefill | Oui | Suggerer categorie, secteur, pays depuis le nom d'entreprise |
| `core.asset.suggest_parent` | suggest | Non | Suggerer le parent dans la hierarchie lors de la creation d'un asset |
| `core.workflow.suggest_template` | suggest | Non | Suggerer le template de workflow adapte au type d'objet |
| `core.dashboard.nlq_to_widget` | generate | Oui | Generer une requete KPI depuis une question en langage naturel |
| `core.notifications.smart_digest` | analyze | Oui | Regrouper et prioriser les notifications en digest intelligent |
| `core.ai.habit_recommendations` | analyze | Non | Recommandations proactives basees sur les habitudes de l'utilisateur |

**Specification detaillee — `core.ai.habit_recommendations` :**

Le systeme apprend les comportements recurrents de chaque utilisateur a partir de l'historique d'audit (pas de LLM) :

- **Documents crees a intervalles reguliers** : detection de periodicite (ex: rapport hebdomadaire le lundi matin, rapport HSE le 1er du mois).
- **Workflows habituels** : sequences d'actions recurrentes (ex: toujours valider les AdS en debut de matinee, consulter le briefing puis les anomalies).
- **Documents/assets frequemment consultes** : les 10 documents et assets les plus consultes sur les 30 derniers jours.

**Suggestions proactives personnalisees dans le briefing :**

- "Vous creez habituellement votre rapport hebdomadaire le lundi. Voulez-vous le preparer ?"
- "3 AdS en attente de votre validation — vous les traitez habituellement avant 10h"
- "Le rapport HSE mensuel est du pour le 1er du mois — basculer vers la generation ?"

**Algorithme :** detection de patterns temporels sur les 90 derniers jours d'audit. Seuil de declenchement : au moins 3 occurrences du meme pattern avec une regularite > 70%. Les recommandations sont generees par le batch quotidien du briefing (`0 5 * * *`) et stockees dans `ai_briefing_items`.

#### PaxLog (v1)

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `paxlog.ads.prefill_from_description` | prefill | Oui | Parser une description libre → champs AdS (site, categorie, dates, PAX, objet) |
| `paxlog.ads.enrich_from_avm` | prefill | Non | Enrichir l'AdS auto-creee par l'AVM (transport, imputation, historique site) |
| `paxlog.ads.suggest_from_history` | suggest | Non | Suggerer site, transport, imputation depuis l'historique du PAX/demandeur |
| `paxlog.compliance.proactive_alerts` | detect | Non | Alerter sur les certifications qui expirent dans les N prochains jours |
| `paxlog.pax.detect_duplicates` | detect | Non | Detecter les profils PAX en doublon cross-entreprise (fuzzy + embeddings) |
| `paxlog.ads.estimate_duration` | suggest | Non | Suggerer la duree de sejour basee sur la categorie + historique site |

#### Planner (v1)

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `planner.activity.suggest_resources` | suggest | Non | Suggerer ressources et duree depuis des activites similaires passees |
| `planner.conflict.suggest_resolution` | suggest | Oui | Proposer une resolution de conflit de planning optimale |
| `planner.capacity.forecast` | analyze | Non | Prevoir la charge PAX sur un site pour les N prochaines semaines |

#### Projets (v1)

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `projets.wbs.generate_skeleton` | generate | Oui | Generer une structure WBS depuis la description du projet |
| `projets.risk.identify` | detect | Oui | Identifier les risques probables selon le type de projet et l'historique |
| `projets.schedule.suggest_durations` | suggest | Non | Suggerer les durees de taches basees sur l'historique de taches similaires |

#### TravelWiz (v1)

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `travelwiz.cargo.match_sap` | suggest | Oui | Identifier le code SAP probable d'un article (existant, renomme) |
| `travelwiz.cargo.prefill_from_description` | prefill | Oui | Pre-remplir la declaration cargo (poids, dimensions, categorie) depuis description |
| `travelwiz.manifest.suggest_grouping` | suggest | Non | Suggerer le regroupement PAX par transport selon destination + horaires |
| `travelwiz.route.suggest_transport` | suggest | Non | Suggerer le mode de transport (helico/bateau/bus) depuis l'historique du site |

#### ReportEditor (v2)

| Slug | Categorie | LLM | Description |
|---|---|---|---|
| `report.autocomplete` | suggest | Oui | Completion automatique dans l'editeur BlockNote |
| `report.generate_section` | generate | Oui | Generer une section de rapport depuis des donnees structurees |
| `report.suggest_template` | suggest | Non | Suggerer le template adapte au contexte (projet, type de rapport) |

**Specification detaillee — `report.autocomplete` :**

- **Declenchement :** apres 1 seconde d'inactivite dans une section texte libre de l'editeur BlockNote (debounce configurable via setting `ai_mcp.autocomplete_debounce_ms`, defaut 1000ms).
- **Affichage :** texte suggere en gris clair (`text-muted-foreground/50`) apres le curseur, inline dans l'editeur.
- **Acceptation :** touche `Tab` → le texte suggere est insere dans le document.
- **Rejet :** touche `Echap` ou continuer a taper → la suggestion disparait immediatement.
- **Contexte envoye au LLM :** les 200 derniers mots du texte courant + titre du document + champs formulaire renseignes + type de document (doc_type).
- **Desactivable par l'utilisateur :** setting utilisateur `ai.autocomplete_enabled` (defaut `true`). Toggle accessible dans la barre d'outils de l'editeur.
- **Limites :** la suggestion est tronquee a 100 tokens maximum. Pas de suggestion si le curseur est dans un champ formulaire (uniquement les blocs texte libre).

---

### 14.5 Implementation — Exemple complet : Pre-remplissage AdS

#### Enregistrement au startup (PaxLog)

```python
# app/modules/paxlog/ai_assist.py

from app.core.ai_assist.registry import ai_assist_registry, AIAssistFunction

def register_ai_assist():
    """Appele par ModuleRegistry au startup."""

    ai_assist_registry.register(AIAssistFunction(
        slug="paxlog.ads.prefill_from_description",
        module="paxlog",
        category="prefill",
        label_fr="Pre-remplir l'AdS depuis une description",
        label_en="Pre-fill ADS from description",
        description_fr=(
            "L'utilisateur saisit une description en langage naturel "
            "(ex: 'Mission maintenance pompes P-301, Kome Nord, 3 techniciens Schlumberger, 20-27 mars'). "
            "L'IA extrait et pre-remplit : site, categorie, dates, PAX, objet de visite, "
            "activite Planner, transport probable."
        ),
        requires_llm=True,
        default_enabled=True,
        target_form="ads_create",
        handler=prefill_ads_from_description,
    ))

    ai_assist_registry.register(AIAssistFunction(
        slug="paxlog.ads.enrich_from_avm",
        module="paxlog",
        category="prefill",
        label_fr="Enrichir l'AdS creee depuis un AVM",
        label_en="Enrich ADS created from AVM",
        description_fr=(
            "Quand un AVM cree automatiquement des AdS en draft, cette fonction enrichit "
            "les champs manquants : mode de transport (historique du site), "
            "imputation detaillee, duree estimee."
        ),
        requires_llm=False,
        default_enabled=True,
        target_form="ads_create",
        handler=enrich_ads_from_avm,
    ))

    ai_assist_registry.register(AIAssistFunction(
        slug="paxlog.ads.suggest_from_history",
        module="paxlog",
        category="suggest",
        label_fr="Suggestions basees sur l'historique",
        label_en="Suggestions based on history",
        description_fr=(
            "Suggere les valeurs les plus probables pour un PAX donne "
            "selon ses precedentes AdS : site habituel, transport prefere, "
            "duree moyenne, projets recurrents."
        ),
        requires_llm=False,
        default_enabled=True,
        target_form="ads_create",
        handler=suggest_ads_from_history,
    ))
```

#### Handler : pre-remplissage depuis description libre

```python
# app/modules/paxlog/ai_assist.py (suite)

async def prefill_ads_from_description(
    context: dict, entity_id: UUID, db: AsyncSession
) -> dict:
    """
    Parse une description en langage naturel et retourne les champs pre-remplis.
    context = {"description": "Mission maintenance pompes P-301, Kome Nord, ..."}
    """
    description = context["description"]

    # 1. Appel LLM pour extraction structuree
    extraction_prompt = f"""Extrais les informations suivantes de cette description de mission.
Retourne un JSON strict avec les champs trouves (null si absent) :

{{
  "site_name": "nom du site ou plateforme",
  "visit_category": "project_work|maintenance|inspection|visit|permanent_ops|other",
  "visit_purpose": "objet de la visite (texte court)",
  "date_start": "YYYY-MM-DD",
  "date_end": "YYYY-MM-DD",
  "pax_names": ["nom1", "nom2"],
  "company_name": "nom de l'entreprise",
  "pax_count": nombre_si_mentionne,
  "transport_preference": "helicopter|boat|bus|null",
  "project_name": "nom du projet si mentionne"
}}

Description : "{description}"
"""
    raw = await ai_service.complete(
        prompt=extraction_prompt,
        system="Tu es un assistant d'extraction de donnees pour OpsFlux (ERP Oil & Gas).",
        tenant_id=str(entity_id),
        function="ai_assist.prefill",
        max_tokens=500,
        temperature=0.1,
    )
    extracted = json.loads(raw)

    # 2. Resoudre les references (fuzzy match contre la DB)
    result = {"_source": "ai_assist", "_confidence": {}}

    # Site → match Asset Registry
    if extracted.get("site_name"):
        assets = await asset_service.search_fuzzy(
            extracted["site_name"], entity_id, db, limit=3
        )
        if assets:
            result["site_asset_id"] = str(assets[0].id)
            result["site_asset_name"] = assets[0].name
            result["_confidence"]["site"] = assets[0].match_score

    # Categorie
    if extracted.get("visit_category"):
        result["visit_category"] = extracted["visit_category"]
        result["_confidence"]["visit_category"] = 0.9

    # Dates
    if extracted.get("date_start"):
        result["date_start"] = extracted["date_start"]
    if extracted.get("date_end"):
        result["date_end"] = extracted["date_end"]

    # Objet de visite
    if extracted.get("visit_purpose"):
        result["visit_purpose"] = extracted["visit_purpose"]

    # PAX → match profils existants
    if extracted.get("pax_names"):
        result["pax_suggestions"] = []
        for name in extracted["pax_names"]:
            matches = await pax_service.search_fuzzy(name, entity_id, db, limit=3)
            result["pax_suggestions"].append({
                "query": name,
                "matches": [
                    {"id": str(m.id), "name": m.full_name,
                     "company": m.company_name, "score": m.match_score}
                    for m in matches
                ],
            })

    # Entreprise → match Tiers
    if extracted.get("company_name"):
        companies = await tiers_service.search_fuzzy(
            extracted["company_name"], entity_id, db, limit=3
        )
        if companies:
            result["company_id"] = str(companies[0].id)
            result["company_name"] = companies[0].name
            result["_confidence"]["company"] = companies[0].match_score

    # Projet → match Projets
    if extracted.get("project_name"):
        projects = await project_service.search_fuzzy(
            extracted["project_name"], entity_id, db, limit=3
        )
        if projects:
            result["project_id"] = str(projects[0].id)
            result["project_name"] = projects[0].name

    # Transport → historique du site
    if not extracted.get("transport_preference") and result.get("site_asset_id"):
        most_used = await ads_service.get_most_used_transport(
            result["site_asset_id"], entity_id, db
        )
        if most_used:
            result["transport_mode"] = most_used
            result["_confidence"]["transport"] = 0.7

    return result
```

#### Handler : enrichissement depuis AVM (sans LLM)

```python
async def enrich_ads_from_avm(
    context: dict, entity_id: UUID, db: AsyncSession
) -> dict:
    """
    Enrichit une AdS auto-creee par un AVM.
    context = {"avm_id": "...", "avm_line_index": 0, "ads_id": "..."}
    """
    avm = await avm_service.get(context["avm_id"], entity_id, db)
    line = avm.program_lines[context["avm_line_index"]]
    result = {}

    # Transport : mode le plus utilise pour ce site
    most_used = await ads_service.get_most_used_transport(
        str(line.site_asset_id), entity_id, db
    )
    if most_used:
        result["transport_outbound_mode"] = most_used
        result["transport_return_mode"] = most_used

    # Imputation : depuis la ligne AVM
    if line.project_id:
        project = await db.get(Project, line.project_id)
        if project and project.default_cost_center_id:
            result["allocations"] = [{
                "project_id": str(line.project_id),
                "cost_center_id": str(project.default_cost_center_id),
                "percentage": 100,
            }]

    # Duree estimee : moyenne des AdS precedentes pour ce type d'activite sur ce site
    avg_duration = await ads_service.get_avg_duration(
        site_asset_id=str(line.site_asset_id),
        visit_category=line.activity_type,
        entity_id=entity_id, db=db
    )
    if avg_duration:
        result["estimated_duration_days"] = avg_duration

    result["_source"] = "ai_assist_avm"
    return result
```

#### Composant React : formulaire AdS avec AI Assist

```tsx
// src/modules/paxlog/components/AdsCreateForm.tsx

import { useAIAssist } from "@/hooks/useAIAssist"

export const AdsCreateForm = () => {
    const [form, setForm] = useState<AdsFormData>(initialValues)
    const [aiFields, setAiFields] = useState<Set<string>>(new Set())

    // Hook AI Assist — verifie si la fonction est activee pour l'entite
    const aiPrefill = useAIAssist("paxlog.ads.prefill_from_description")
    const aiSuggest = useAIAssist("paxlog.ads.suggest_from_history")

    // Pre-remplissage depuis description libre
    const handleDescriptionPrefill = async () => {
        if (!aiPrefill.enabled || !form.description) return
        const result = await aiPrefill.execute({ description: form.description })
        if (result) {
            const newForm = { ...form }
            const filled = new Set<string>()
            // Appliquer les champs pre-remplis
            if (result.site_asset_id) {
                newForm.site_asset_id = result.site_asset_id
                filled.add("site_asset_id")
            }
            if (result.visit_category) {
                newForm.visit_category = result.visit_category
                filled.add("visit_category")
            }
            if (result.date_start) {
                newForm.date_start = result.date_start
                filled.add("date_start")
            }
            if (result.date_end) {
                newForm.date_end = result.date_end
                filled.add("date_end")
            }
            if (result.visit_purpose) {
                newForm.visit_purpose = result.visit_purpose
                filled.add("visit_purpose")
            }
            setForm(newForm)
            setAiFields(filled) // Marquer les champs pre-remplis par l'IA
        }
    }

    return (
        <form>
            {/* Zone description libre + bouton AI */}
            <div className="space-y-2">
                <Label>Description de la mission</Label>
                <Textarea
                    value={form.description}
                    onChange={(e) => setForm(f => ({...f, description: e.target.value}))}
                    placeholder="Ex: Mission maintenance pompes P-301, Kome Nord, 3 techniciens..."
                />
                {aiPrefill.enabled && (
                    <Button
                        variant="outline" size="sm"
                        onClick={handleDescriptionPrefill}
                        disabled={aiPrefill.loading || !form.description}
                    >
                        <Sparkles className="h-4 w-4 mr-1" />
                        Pre-remplir avec l'IA
                    </Button>
                )}
            </div>

            {/* Champs du formulaire — badge IA si pre-rempli */}
            <FormField label="Site d'entree" aiFilled={aiFields.has("site_asset_id")}>
                <AssetSelect value={form.site_asset_id} onChange={...} />
            </FormField>

            <FormField label="Categorie" aiFilled={aiFields.has("visit_category")}>
                <Select value={form.visit_category} options={visitCategories} onChange={...} />
            </FormField>

            {/* ... autres champs ... */}
        </form>
    )
}

// Composant wrapper qui affiche le badge "IA" sur les champs pre-remplis
const FormField = ({ label, aiFilled, children }) => (
    <div className="space-y-1">
        <div className="flex items-center gap-1.5">
            <Label>{label}</Label>
            {aiFilled && (
                <Badge variant="secondary" className="text-xs bg-violet-50 text-violet-700">
                    <Sparkles className="h-3 w-3 mr-0.5" /> IA
                </Badge>
            )}
        </div>
        {children}
    </div>
)
```

#### Hook React generique

```tsx
// src/hooks/useAIAssist.ts

export function useAIAssist(slug: string) {
    const entityId = useCurrentEntity()
    const [loading, setLoading] = useState(false)

    // Verifier si la fonction est activee (cache React Query)
    const { data: enabled } = useQuery({
        queryKey: ["ai-assist", "enabled", slug, entityId],
        queryFn: () => api.get(`/api/v1/ai/assist/enabled/${slug}`).then(r => r.data.enabled),
        staleTime: 5 * 60 * 1000, // 5 min cache
    })

    const execute = async (context: Record<string, any>) => {
        setLoading(true)
        try {
            const { data } = await api.post(`/api/v1/ai/assist/execute`, {
                slug,
                context,
            })
            return data
        } finally {
            setLoading(false)
        }
    }

    const sendFeedback = async (accepted: boolean, original: any, modified?: any) => {
        await api.post(`/api/v1/ai/assist/feedback`, {
            slug, accepted, original, modified,
        })
    }

    return { enabled: !!enabled, loading, execute, sendFeedback }
}
```

---

### 14.6 API Endpoints AI Assist

```
# Catalogue (admin)
GET    /api/v1/ai/assist/catalog              Catalogue complet des fonctions AI Assist
GET    /api/v1/ai/assist/catalog/:module       Fonctions d'un module

# Activation (verifie per-entity)
GET    /api/v1/ai/assist/enabled/:slug         Verifier si une fonction est activee

# Execution
POST   /api/v1/ai/assist/execute              Executer une fonction AI Assist
       Body: { "slug": "paxlog.ads.prefill_from_description", "context": { ... } }
       Response: { "success": true, "data": { ...champs pre-remplis... }, "_source": "ai_assist" }

# Feedback
POST   /api/v1/ai/assist/feedback             Enregistrer le feedback utilisateur
       Body: { "slug": "...", "accepted": true, "original": {...}, "modified": {...} }

# Stats (admin)
GET    /api/v1/ai/assist/stats                Statistiques d'utilisation et taux d'acceptation
       Response: { "functions": [{ "slug": "...", "call_count": 42, "accept_rate": 0.78, ... }] }
```

---

### 14.7 Modele de donnees AI Assist

```sql
-- Feedback utilisateur sur les suggestions AI Assist
CREATE TABLE ai_assist_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id           UUID NOT NULL REFERENCES entities(id),
    function_slug       VARCHAR(100) NOT NULL,
    user_id             UUID NOT NULL REFERENCES users(id),
    accepted            BOOLEAN NOT NULL,
    original_suggestion JSONB NOT NULL,
    user_modification   JSONB,      -- null si accepte tel quel ou rejete
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_feedback_func ON ai_assist_feedback(function_slug, entity_id);
CREATE INDEX idx_ai_feedback_user ON ai_assist_feedback(user_id, created_at DESC);
```

---

### 14.8 UI Administration — Configuration AI Assist

L'ecran **Settings > IA & Assistance** presente une arborescence a 3 niveaux :

```
☐ IA activee (toggle global)
│
├─ ☐ Pre-remplissage (prefill)
│  ├─ ☐ Pre-remplir l'AdS depuis une description          🔮 LLM
│  ├─ ☑ Enrichir l'AdS creee depuis un AVM
│  ├─ ☐ Pre-remplir la categorie tiers depuis le nom       🔮 LLM
│  ├─ ☐ Pre-remplir cargo depuis description               🔮 LLM
│  └─ ...
│
├─ ☐ Suggestions (suggest)
│  ├─ ☑ Suggestions basees sur l'historique PAX
│  ├─ ☑ Suggerer la duree d'activite (Planner)
│  ├─ ☐ Matching SAP                                       🔮 LLM
│  ├─ ☑ Suggerer le mode de transport
│  └─ ...
│
├─ ☐ Detection (detect)
│  ├─ ☑ Detecter les doublons PAX
│  ├─ ☑ Detecter les doublons Tiers
│  ├─ ☑ Alertes compliance proactives
│  ├─ ☐ Identifier les risques projet                      🔮 LLM
│  └─ ...
│
├─ ☐ Generation (generate)
│  ├─ ☐ Generer un squelette WBS                           🔮 LLM
│  ├─ ☐ Generer widget KPI depuis question                 🔮 LLM
│  └─ ...
│
└─ ☐ Analyse (analyze)
   ├─ ☑ Prevision de charge PAX
   ├─ ☐ Digest intelligent des notifications               🔮 LLM
   └─ ...
```

L'icone 🔮 LLM indique les fonctions qui consomment des tokens API (cout). L'admin peut activer les fonctions sans LLM (gratuites, basees sur l'historique/regles) et desactiver celles avec LLM pour maitriser les couts.

---

### 14.9 Degradation gracieuse — Mode IA indisponible

Si le provider LLM est indisponible (timeout, erreur reseau, quota depasse), le systeme bascule automatiquement en mode degrade :

| Composant | Comportement en mode degrade |
|---|---|
| **Chat IA** | Message "L'assistant IA est temporairement indisponible. Recherche par mots-cles uniquement." |
| **RAG** | Fallback sur recherche full-text PostgreSQL (`pg_trgm`) sans generation de reponse narrative |
| **Auto-completion** | Desactivee silencieusement (pas d'erreur visible pour l'utilisateur) |
| **Suggestions AI Assist** | Desactivees, les formulaires fonctionnent normalement sans pre-remplissage |
| **Tags DCS** | Suggestions par regles de nommage uniquement (pas de LLM) |
| **Briefing** | Elements affiches sans resume narratif (donnees brutes uniquement) |

**Indicateur visuel :** un badge "Mode degrade" s'affiche dans le panneau IA avec un tooltip explicatif ("Le service IA est temporairement indisponible. Les fonctions non-IA restent operationnelles.").

**Reconnexion automatique :** tentative de reconnexion toutes les 60 secondes. Des que le provider repond, le badge disparait et les fonctions IA sont retablies.

**Monitoring :** un evenement `ai.provider.unavailable` est emis sur l'event bus a chaque detection d'indisponibilite, avec les informations suivantes :
- `provider` : nom du provider (anthropic, ollama)
- `error_type` : timeout | network_error | quota_exceeded | server_error
- `last_success_at` : timestamp du dernier appel reussi
- `retry_count` : nombre de tentatives depuis la derniere indisponibilite

---

### 14.10 Politique de filtrage des donnees sensibles

Les donnees sensibles ne doivent **jamais** etre envoyees aux services cloud (Anthropic, OpenAI) sans filtrage prealable.

**Regles de filtrage :**

1. **Donnees medicales** (aptitude medicale, resultats d'examens, restrictions medicales) : **JAMAIS** envoyees aux services cloud, quelle que soit la configuration.
2. **Donnees personnelles sensibles** (numero de passeport, date de naissance, coordonnees personnelles) : anonymisees avant envoi au LLM.

**Implementation — `DataSanitizer` :**

Le `DataSanitizer` est insere dans le pipeline avant chaque appel `ai_service.complete()` :

```python
# app/services/core/data_sanitizer.py

class DataSanitizer:
    """Filtre les donnees sensibles avant envoi au LLM cloud."""

    PATTERNS = {
        "PASSPORT_NUM": r"\b[A-Z]{1,2}\d{6,9}\b",
        "DOB": r"\b\d{2}/\d{2}/\d{4}\b|\b\d{4}-\d{2}-\d{2}\b",
        "PERSONAL_EMAIL": r"\b[a-zA-Z0-9._%+-]+@(?!opsflux\.io|perenco\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b",
        "MEDICAL_DATA": r"(?i)(aptitude|inapte|restriction medicale|examen medical|certificat medical)",
    }

    def sanitize(self, text: str) -> tuple[str, dict]:
        """Retourne (texte_nettoye, mapping_placeholders)."""
        mapping = {}
        for label, pattern in self.PATTERNS.items():
            for match in re.finditer(pattern, text):
                placeholder = f"[{label}_{len(mapping)}]"
                mapping[placeholder] = match.group()
                text = text.replace(match.group(), placeholder, 1)
        return text, mapping

    def restore(self, text: str, mapping: dict) -> str:
        """Reinjecte les donnees originales dans la reponse du LLM."""
        for placeholder, original in mapping.items():
            text = text.replace(placeholder, original)
        return text
```

**Classification par fonction AI Assist :**

Chaque fonction AI Assist declare une classification de donnees :

| Classification | Comportement |
|---|---|
| `public` | Aucun filtrage — donnees non sensibles |
| `internal` | Filtrage des donnees personnelles (passeport, DOB, email) |
| `restricted` | Filtrage complet — provider local uniquement (Ollama) |
| `medical` | Provider local **obligatoire** — aucun envoi cloud autorise |

Configuration dans la definition `AIAssistFunction` :

```python
AIAssistFunction(
    slug="paxlog.compliance.check",
    # ...
    data_classification="medical",  # Force provider local
)
```

**Provider local :** si le provider est `local` (Ollama on-premise), le filtrage est desactive car les donnees restent dans l'infrastructure de l'organisation.

---

## 15. PDCA -- Phase IA & MCP (Phase 9)

| Etape | Tache detaillee | Critere mesurable | Effort |
|---|---|---|---|
| PLAN | Configurer API Claude + pgvector. Tester endpoint Anthropic | Reponse Claude en < 5s | 1j |
| PLAN | Documenter catalogue des tools MCP avec permissions | Fichier `mcp/tools_catalog.json` complet | 1j |
| DO | Service AIService avec API Claude Anthropic | Generation + embeddings fonctionnels | 2j |
| DO | Job APScheduler `index_document_for_rag` : chunking + embedding + pgvector | Document publie -> vecteurs en DB en < 30s | 4j |
| DO | API `/api/v1/ai/chat` : classification intention + RAG + MCP routing | Question -> reponse avec source citee | 4j |
| DO | Interface AI Panel React : messages + sources + actions + confirmation | Cycle complet question -> reponse -> action avec confirmation | 4j |
| DO | MCP Server : server.py + security_layer + plugins modules | Tous les tools enregistres et fonctionnels | 6j |
| DO | Services IA : SAP matcher + detecteur anomalies + generateur rapports | Batch anomalies quotidien + matching SAP | 5j |
| DO | Briefing journalier (`/api/v1/ai/briefing`) | Ouvrir OpsFlux le matin -> briefing affiche | 2j |
| DO | Extraction legacy : PDF/Word -> OCR -> LLM -> form_data | Upload rapport Word -> 7 valeurs extraites sur 8 | 5j |
| CHECK | RAG : 20 questions sur 50 documents. Evaluation manuelle | Score pertinence >= 70% (14/20 correctes) | 3j |
| CHECK | MCP : scenario complet via MCP uniquement | Rapport cree + soumis via tools MCP, 0 erreur 403 | 2j |
| ACT | Dashboard monitoring : tokens/jour, latence p95, taux erreur | Dashboard actif, alerte si cost > seuil | 2j |
