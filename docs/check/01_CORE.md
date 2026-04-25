# OpsFlux — 01_CORE.md
# Services Core — Spécification Complète avec Implémentations

> Ce fichier documente **tous les services horizontaux** du Core.
> Un module ne réimplémente jamais un service Core — il l'appelle via l'API définie ici.
> Claude Code lit ce fichier avant d'implémenter quoi que ce soit lié au Core.

---

## 1. EventBus — Hooks / Triggers / Webhooks

### Schéma DB

```sql
CREATE TABLE event_hooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    hook_type VARCHAR(20) NOT NULL,       -- internal | trigger | webhook
    name VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    -- webhook:  {url, method, headers, payload_template}
    -- trigger:  {action, params}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_event_hooks_type ON event_hooks(tenant_id, event_type, is_active);

CREATE TABLE event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    hooks_triggered INTEGER NOT NULL DEFAULT 0,
    hooks_failed INTEGER NOT NULL DEFAULT 0,
    processing_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Service Python

```python
# app/services/core/event_service.py
from typing import Any, Callable

_handlers: dict[str, list[Callable]] = {}

def subscribe(event_type: str, handler: Callable) -> None:
    """Modules appellent ceci au démarrage pour s'abonner à un event."""
    _handlers.setdefault(event_type, []).append(handler)

async def publish(
    event_type: str,
    payload: dict[str, Any],
    tenant_id: str,
    actor_id: str | None = None,
) -> None:
    """Publie un événement. Appelé depuis n'importe quel service ou module."""
    import time
    start = time.monotonic()
    failed = 0

    # 1. Handlers internes synchrones
    for handler in _handlers.get(event_type, []):
        try:
            await handler(payload, tenant_id, actor_id)
        except Exception as e:
            failed += 1
            logger.error(f"EventBus internal handler error [{event_type}]: {e}")

    # 2. Webhooks/triggers configurés par l'admin (via ARQ, non bloquant)
    from app.workers.settings import arq_pool
    await arq_pool.enqueue_job(
        "process_event_hooks",
        event_type=event_type, payload=payload,
        tenant_id=tenant_id, actor_id=actor_id,
    )

    # 3. Logger
    async with get_db() as db:
        db.add(EventLog(
            tenant_id=tenant_id, event_type=event_type, payload=payload,
            hooks_triggered=len(_handlers.get(event_type, [])),
            hooks_failed=failed,
            processing_ms=int((time.monotonic() - start) * 1000),
        ))
        await db.commit()
```

```python
# app/main.py — enregistrement des handlers au démarrage
@app.on_event("startup")
async def register_event_handlers():
    from app.services.core import event_service
    from app.services.modules.ai_service import on_document_published
    from app.services.modules.pid_service import on_tag_renamed

    event_service.subscribe("document.published", on_document_published)
    event_service.subscribe("tag.renamed", on_tag_renamed)
```

---

## 2. Notification Center

### Service Python

```python
# app/services/core/notification_service.py

async def notify(
    user_id: str,
    tenant_id: str,
    template_key: str,
    context: dict,
    channels: list[str] | None = None,   # None = utilise préférences user
    priority: str = "medium",             # low | medium | high | critical
) -> None:
    async with get_db() as db:
        # Résoudre les canaux selon préférences user si non fournis
        if channels is None:
            prefs = await get_notification_prefs(user_id, tenant_id, template_key, db)
            channels = prefs.channels if prefs else ["in_app"]

        # Heures de silence : garder seulement in_app
        if await is_in_quiet_hours(user_id, tenant_id, db):
            channels = [c for c in channels if c == "in_app"]

        if "in_app" in channels:
            notif = Notification(
                tenant_id=UUID(tenant_id), user_id=UUID(user_id),
                template_key=template_key, context=context,
                channel="in_app", priority=priority,
            )
            db.add(notif)
            # Push temps réel via WebSocket
            from app.services.core.realtime_service import broadcast_to_user
            await broadcast_to_user(user_id, {"type": "notification",
                "notification": {"id": str(notif.id), "template_key": template_key,
                                  "context": context, "priority": priority}})

        if "email" in channels:
            from app.services.core.email_service import queue_email
            await queue_email(tenant_id=tenant_id,
                to=[await get_user_email(user_id, db)],
                template_key=template_key, context=context)

        await db.commit()
```

### API FastAPI

```python
# app/api/routes/core/notifications.py

@router.get("/notifications")
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, le=100),
    request: Request = None, db=Depends(get_db),
):
    query = (select(Notification)
        .where(Notification.user_id == request.state.user_id,
               Notification.tenant_id == request.state.tenant_id)
        .order_by(Notification.created_at.desc())
        .limit(limit))
    if unread_only:
        query = query.where(Notification.is_read == False)
    result = await db.execute(query)
    notifs = result.scalars().all()
    unread_count = sum(1 for n in notifs if not n.is_read)
    return {"notifications": notifs, "unread_count": unread_count}

@router.patch("/notifications/{notif_id}/read")
async def mark_read(notif_id: str, request: Request, db=Depends(get_db)):
    notif = await db.get(Notification, UUID(notif_id))
    if notif and str(notif.user_id) == str(request.state.user_id):
        notif.is_read = True
        notif.read_at = datetime.utcnow()
        await db.commit()
    return {"status": "ok"}

@router.patch("/notifications/read-all")
async def mark_all_read(request: Request, db=Depends(get_db)):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == request.state.user_id,
               Notification.is_read == False)
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"status": "ok"}
```

---

## 3. Email System

### Service Python (queue + worker ARQ)

```python
# app/services/core/email_service.py

async def queue_email(
    tenant_id: str,
    to: list[str],
    template_key: str,
    context: dict,
    attachments: list[dict] | None = None,
    scheduled_at: datetime | None = None,
) -> None:
    """Ne jamais appeler send_email directement depuis un module. Toujours passer par ici."""
    async with get_db() as db:
        db.add(EmailQueue(
            tenant_id=UUID(tenant_id),
            to_addresses=to,
            template_key=template_key,
            context=context,
            attachments=attachments or [],
            scheduled_at=scheduled_at or datetime.utcnow(),
        ))
        await db.commit()
```

```python
# app/workers/email_worker.py

async def process_email_queue(ctx: dict) -> None:
    """Job ARQ planifié : traite la file d'attente email. Exécuté toutes les minutes."""
    async with get_db() as db:
        pending = await db.execute(
            select(EmailQueue)
            .where(EmailQueue.status == "pending",
                   EmailQueue.scheduled_at <= datetime.utcnow(),
                   EmailQueue.attempts < EmailQueue.max_attempts)
            .limit(50)
            .with_for_update(skip_locked=True)
        )
        for job in pending.scalars():
            job.status = "sending"
            job.attempts += 1
            await db.flush()

            try:
                smtp_cfg = await get_tenant_smtp_config(str(job.tenant_id), db)
                html = render_email_template(job.template_key, job.context)
                await _send_smtp(smtp_cfg, job.to_addresses, job.template_key, html, job.attachments)
                job.status = "sent"
                job.sent_at = datetime.utcnow()
            except Exception as e:
                job.last_error = str(e)
                job.status = "pending" if job.attempts < job.max_attempts else "failed"

        await db.commit()

async def _send_smtp(cfg: SMTPConfig, to: list[str], subject: str, html: str, attachments: list) -> None:
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg.from_name} <{cfg.from_address}>"
    msg["To"] = ", ".join(to)
    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(cfg.host, cfg.port, timeout=30) as server:
        if cfg.use_tls:
            server.starttls()
        if cfg.username:
            server.login(cfg.username, decrypt(cfg.password))
        server.sendmail(cfg.from_address, to, msg.as_string())
```

---

## 4. Workflow Engine

### FSM Python complet

```python
# app/services/core/workflow_service.py

class WorkflowService:

    async def submit(self, object_type: str, object_id: str,
                     workflow_definition_id: str, tenant_id: str,
                     actor_id: str, db: AsyncSession) -> WorkflowInstance:
        """Soumet un objet au workflow. Crée l'instance et passe au premier nœud actif."""
        definition = await db.get(WorkflowDefinition, UUID(workflow_definition_id))
        graph = definition.graph_json
        start_node = next(n for n in graph["nodes"] if n["type"] == "start")
        first_node_id = self._next_node_id(graph, start_node["id"], "default")

        instance = WorkflowInstance(
            tenant_id=UUID(tenant_id), object_type=object_type,
            object_id=UUID(object_id), definition_id=UUID(workflow_definition_id),
            current_node_id=first_node_id, status="in_progress",
        )
        db.add(instance)
        db.add(WorkflowTransition(
            tenant_id=UUID(tenant_id), instance_id=instance.id,
            from_node="start", to_node=first_node_id,
            action="submit", actor_id=UUID(actor_id),
        ))
        await db.flush()
        await self._notify_node_actors(instance, first_node_id, graph, tenant_id, db)
        await db.commit()

        from app.services.core.event_service import publish
        await publish("workflow.submitted", {
            "object_type": object_type, "object_id": object_id,
            "instance_id": str(instance.id),
        }, tenant_id, actor_id)
        return instance

    async def transition(self, instance_id: str, action: str, actor: User,
                         comment: str | None, db: AsyncSession) -> WorkflowInstance:
        """Effectue approve | reject | cancel sur une instance en cours."""
        instance = await db.get(WorkflowInstance, UUID(instance_id))
        if not instance or instance.status != "in_progress":
            raise ValueError("Instance introuvable ou non modifiable")

        # Résoudre délégation
        effective_actor = await self._resolve_delegation(actor, instance, db)
        if not effective_actor:
            raise PermissionError("Non autorisé à agir sur ce nœud")

        definition = await db.get(WorkflowDefinition, instance.definition_id)
        graph = definition.graph_json
        current_node = next(n for n in graph["nodes"] if n["id"] == instance.current_node_id)

        # Nœud parallèle : vérifier le seuil avant d'avancer
        if current_node["type"] == "parallel" and action == "approve":
            await self._record_parallel_vote(instance, effective_actor, comment, db)
            threshold = current_node.get("data", {}).get("threshold", "all")
            total = len(current_node.get("data", {}).get("assignees", []))
            votes = await self._count_parallel_votes(instance, db)
            required = total if threshold == "all" else (total // 2 + 1)
            if votes < required:
                await db.commit()
                return instance   # attendre d'autres votes

        # Calculer le prochain nœud
        if action == "approve":
            next_id = self._next_node_id(graph, current_node["id"], "approved")
        elif action == "reject":
            next_id = current_node.get("data", {}).get("rejection_target", "start")
        elif action == "cancel":
            next_id = "end_cancelled"
        else:
            raise ValueError(f"Action inconnue : {action}")

        db.add(WorkflowTransition(
            tenant_id=instance.tenant_id, instance_id=instance.id,
            from_node=instance.current_node_id, to_node=next_id,
            action=action, actor_id=effective_actor.id, comment=comment,
        ))
        instance.current_node_id = next_id
        next_node = next((n for n in graph["nodes"] if n["id"] == next_id), None)

        if next_node and next_node["type"].startswith("end_"):
            instance.status = "approved" if next_node["type"] == "end_approved" else "rejected"
            instance.completed_at = datetime.utcnow()
            from app.services.core.event_service import publish
            await publish(f"workflow.{instance.status}", {
                "object_type": instance.object_type,
                "object_id": str(instance.object_id),
                "instance_id": str(instance.id),
            }, str(instance.tenant_id), str(effective_actor.id))
        else:
            await self._notify_node_actors(instance, next_id, graph, str(instance.tenant_id), db)

        await db.commit()
        return instance

    def _next_node_id(self, graph: dict, from_id: str, label: str) -> str:
        for edge in graph["edges"]:
            if edge["source"] == from_id and edge.get("label", "default") == label:
                return edge["target"]
        # Fallback : premier edge sans label
        for edge in graph["edges"]:
            if edge["source"] == from_id:
                return edge["target"]
        raise ValueError(f"Pas d'edge depuis {from_id} avec label {label}")

    async def _notify_node_actors(self, instance, node_id: str,
                                   graph: dict, tenant_id: str, db: AsyncSession):
        node = next((n for n in graph["nodes"] if n["id"] == node_id), None)
        if not node:
            return
        data = node.get("data", {})
        actor_ids = []
        if role := data.get("assignee_role"):
            users = await get_users_by_role(role, tenant_id, db)
            actor_ids.extend(str(u.id) for u in users)
        actor_ids.extend(data.get("assignee_users", []))
        deadline_days = data.get("deadline_days")

        from app.services.core.notification_service import notify
        for uid in actor_ids:
            await notify(uid, tenant_id, "workflow.validation_required", {
                "object_type": instance.object_type,
                "object_id": str(instance.object_id),
                "instance_id": str(instance.id),
                "deadline_date": (datetime.utcnow() + timedelta(days=deadline_days)).strftime("%d/%m/%Y")
                    if deadline_days else None,
            }, priority="high")

    async def _resolve_delegation(self, actor: User, instance: WorkflowInstance,
                                   db: AsyncSession) -> User | None:
        """Vérifie si l'actor ou son délégant peut agir sur le nœud courant."""
        definition = await db.get(WorkflowDefinition, instance.definition_id)
        node = next(n for n in definition.graph_json["nodes"]
                    if n["id"] == instance.current_node_id)
        data = node.get("data", {})
        required_role = data.get("assignee_role")
        required_users = data.get("assignee_users", [])

        if required_role and required_role in getattr(actor, "roles", []):
            return actor
        if str(actor.id) in required_users:
            return actor

        now = datetime.utcnow()
        delegation = await db.execute(
            select(Delegation).where(
                Delegation.delegate_id == actor.id,
                Delegation.tenant_id == instance.tenant_id,
                Delegation.is_active == True,
                Delegation.valid_from <= now,
                Delegation.valid_to >= now,
            )
        ).scalar_one_or_none()

        if delegation:
            delegator = await db.get(User, delegation.delegator_id)
            if required_role and required_role in getattr(delegator, "roles", []):
                return delegator
            if str(delegator.id) in required_users:
                return delegator

        return None
```

### API FastAPI workflow

```python
# app/api/routes/core/workflow.py

@router.post("/workflow/instances/{instance_id}/approve")
async def approve_workflow(instance_id: str, body: WorkflowActionBody,
                            request: Request, db=Depends(get_db)):
    return await workflow_service.transition(
        instance_id, "approve", request.state.user, body.comment, db)

@router.post("/workflow/instances/{instance_id}/reject")
async def reject_workflow(instance_id: str, body: WorkflowActionBody,
                           request: Request, db=Depends(get_db)):
    return await workflow_service.transition(
        instance_id, "reject", request.state.user, body.comment, db)

@router.get("/workflow/my-pending")
async def my_pending_validations(request: Request, db=Depends(get_db)):
    """Liste toutes les instances en attente de l'user courant (tenant-filtré)."""
    return await workflow_service.get_pending_for_user(
        user=request.state.user, tenant_id=request.state.tenant_id, db=db)

@router.get("/workflow/my-pending-count")
async def my_pending_count(request: Request, db=Depends(get_db)):
    """Endpoint léger pour le badge sidebar."""
    count = await workflow_service.count_pending_for_user(
        request.state.user_id, request.state.tenant_id, db)
    return {"count": count}

@router.post("/workflow/delegations")
async def create_delegation(body: DelegationCreateSchema, request: Request, db=Depends(get_db)):
    db.add(Delegation(
        tenant_id=UUID(request.state.tenant_id),
        delegator_id=UUID(request.state.user_id),
        delegate_id=UUID(body.delegate_id),
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        reason=body.reason,
    ))
    await db.commit()
    return {"status": "created"}
```

---

## 5. Custom Fields Engine

### Service Python complet

```python
# app/services/core/extrafield_service.py

async def get_definitions(object_type: str, tenant_id: str, db: AsyncSession):
    result = await db.execute(
        select(ExtrafieldDefinition)
        .where(ExtrafieldDefinition.tenant_id == UUID(tenant_id),
               ExtrafieldDefinition.object_type == object_type)
        .order_by(ExtrafieldDefinition.display_order)
    )
    return result.scalars().all()

async def get_values(object_type: str, object_id: str, tenant_id: str, db: AsyncSession) -> dict:
    """Retourne toutes les valeurs d'un objet sous forme {field_key: value}."""
    definitions = await get_definitions(object_type, tenant_id, db)
    values_result = await db.execute(
        select(ExtrafieldValue).where(
            ExtrafieldValue.tenant_id == UUID(tenant_id),
            ExtrafieldValue.object_type == object_type,
            ExtrafieldValue.object_id == UUID(object_id),
        )
    )
    vals = {str(v.definition_id): v for v in values_result.scalars()}

    output = {}
    for d in definitions:
        rec = vals.get(str(d.id))
        if rec:
            output[d.field_key] = _extract(d.field_type, rec)
        elif d.field_type == "formula":
            output[d.field_key] = _compute_formula(d, output)
        else:
            output[d.field_key] = None
    return output

async def set_value(object_type: str, object_id: str, field_key: str,
                    value, tenant_id: str, updated_by: str, db: AsyncSession):
    defn = await db.execute(
        select(ExtrafieldDefinition).where(
            ExtrafieldDefinition.tenant_id == UUID(tenant_id),
            ExtrafieldDefinition.object_type == object_type,
            ExtrafieldDefinition.field_key == field_key,
        )
    ).scalar_one_or_none()
    if not defn:
        raise ValueError(f"Champ '{field_key}' inconnu sur '{object_type}'")

    existing = await db.execute(
        select(ExtrafieldValue).where(
            ExtrafieldValue.definition_id == defn.id,
            ExtrafieldValue.object_id == UUID(object_id),
        )
    ).scalar_one_or_none()

    target = existing or ExtrafieldValue(
        tenant_id=UUID(tenant_id), definition_id=defn.id,
        object_type=object_type, object_id=UUID(object_id),
        updated_by=UUID(updated_by),
    )
    _set_typed(target, defn.field_type, value)
    if not existing:
        db.add(target)
    await db.commit()

def _extract(field_type: str, rec: ExtrafieldValue):
    if field_type in ("text_short","text_long","select_static","select_dynamic"):
        return rec.value_text
    elif field_type in ("number_int","number_decimal"):
        return rec.value_number
    elif field_type in ("date","datetime"):
        return rec.value_date
    return rec.value_json

def _set_typed(rec, field_type: str, value):
    rec.value_text = rec.value_number = rec.value_date = rec.value_json = None
    if field_type in ("text_short","text_long","select_static","select_dynamic"):
        rec.value_text = str(value) if value is not None else None
    elif field_type == "number_int":
        rec.value_number = int(value) if value is not None else None
    elif field_type == "number_decimal":
        rec.value_number = float(value) if value is not None else None
    elif field_type in ("date","datetime"):
        rec.value_date = value
    else:
        rec.value_json = value

def _compute_formula(defn, current_values: dict):
    import re
    expr = defn.options.get("expression","")
    resolved = re.sub(r'\{(\w+)\}', lambda m: str(current_values.get(m.group(1),0) or 0), expr)
    try:
        return eval(resolved, {"__builtins__": {}})
    except:
        return None
```

### Composant React ExtrafieldsForm

```tsx
// src/components/core/ExtrafieldsForm.tsx

export const ExtrafieldsForm = ({
    objectType, objectId, readOnly = false, groupFilter,
}: {
    objectType: string; objectId: string; readOnly?: boolean; groupFilter?: string
}) => {
    const { data: definitions } = useQuery({
        queryKey: ["extrafield-definitions", objectType],
        queryFn: () => api.get(`/api/v1/extrafields/definitions/${objectType}`).then(r => r.data),
    })
    const { data: values } = useQuery({
        queryKey: ["extrafield-values", objectType, objectId],
        queryFn: () => api.get(`/api/v1/extrafields/${objectType}/${objectId}`).then(r => r.data),
        enabled: !!objectId,
    })
    const queryClient = useQueryClient()
    const save = useMutation({
        mutationFn: ({ field_key, value }: { field_key: string; value: any }) =>
            api.patch(`/api/v1/extrafields/${objectType}/${objectId}`, { field_key, value }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["extrafield-values", objectType, objectId] }),
    })

    if (!definitions) return <Skeleton className="h-32" />

    const filtered = groupFilter ? definitions.filter((d: any) => d.display_group === groupFilter) : definitions
    const groups = Object.groupBy(filtered, (d: any) => d.display_group || "Informations")

    return (
        <div className="space-y-5">
            {Object.entries(groups).map(([group, fields]: [string, any[]]) => (
                <div key={group} className="space-y-3">
                    {Object.keys(groups).length > 1 && (
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group}
                        </p>
                    )}
                    {fields.map((field: any) => (
                        <ExtraFieldRow
                            key={field.id}
                            field={field}
                            value={values?.[field.field_key]}
                            readOnly={readOnly}
                            onChange={(value) => save.mutate({ field_key: field.field_key, value })}
                        />
                    ))}
                </div>
            ))}
        </div>
    )
}

const ExtraFieldRow = ({ field, value, readOnly, onChange }: any) => {
    const label = field.label?.fr || field.field_key
    const input = (() => {
        switch (field.field_type) {
            case "text_short": return (
                <Input value={value || ""} onChange={e => onChange(e.target.value)}
                    disabled={readOnly} className="h-8 text-sm" />
            )
            case "number_int": case "number_decimal": return (
                <div className="flex items-center gap-2">
                    <Input type="number" value={value ?? ""} onChange={e => onChange(Number(e.target.value))}
                        disabled={readOnly} className="h-8 text-sm" />
                    {field.options?.unit && <span className="text-xs text-muted-foreground">{field.options.unit}</span>}
                </div>
            )
            case "boolean": return (
                <Switch checked={!!value} onCheckedChange={onChange} disabled={readOnly} />
            )
            case "date": return (
                <DatePicker value={value} onChange={onChange} disabled={readOnly} />
            )
            case "select_static": return (
                <Select value={value || ""} onValueChange={onChange} disabled={readOnly}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                    <SelectContent>
                        {field.options?.options?.map((o: any) => (
                            <SelectItem key={o.value} value={o.value}>
                                {typeof o.label === "object" ? o.label.fr : o.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
            case "formula": return <span className="text-sm font-medium">{value ?? "—"}</span>
            default: return <Input value={value || ""} onChange={e => onChange(e.target.value)} disabled={readOnly} />
        }
    })()

    return (
        <div className="flex items-start gap-3 py-0.5">
            <label className="text-sm text-muted-foreground w-[140px] flex-shrink-0 pt-1.5">
                {label}
                {field.is_required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <div className="flex-1 min-w-0">{input}</div>
        </div>
    )
}
```

---

## 6. Scheduler / Cron Engine

```python
# app/workers/settings.py — Configuration ARQ complète

import arq
from arq.connections import RedisSettings
from app.core.config import settings

# ─── Import de tous les handlers ────────────────────────────────
from app.workers.email_worker import process_email_queue
from app.workers.ai_indexer import index_published_document, generate_document_embeddings
from app.workers.recommendation_worker import generate_daily_recommendations
from app.workers.event_worker import process_event_hooks
from app.workers.deadline_worker import check_workflow_deadlines
from app.workers.export_worker import generate_document_pdf, generate_export_file

async def startup(ctx):
    ctx["db_pool"] = await create_async_engine(settings.DATABASE_URL)

async def shutdown(ctx):
    await ctx["db_pool"].dispose()

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)
    max_jobs = 20
    job_timeout = 300       # 5 minutes max par job
    keep_result = 3600

    functions = [
        process_email_queue,
        index_published_document,
        generate_document_embeddings,
        process_event_hooks,
        generate_daily_recommendations,
        check_workflow_deadlines,
        generate_document_pdf,
        generate_export_file,
    ]

    cron_jobs = [
        # Email : toutes les 2 minutes
        arq.cron(process_email_queue, minute={0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,
                                              32,34,36,38,40,42,44,46,48,50,52,54,56,58}),
        # Deadlines workflow : chaque matin à 8h
        arq.cron(check_workflow_deadlines, hour={8}, minute={0}),
        # Recommandations : 6h30
        arq.cron(generate_daily_recommendations, hour={6}, minute={30}),
    ]

    on_startup = startup
    on_shutdown = shutdown
```

---

## 7. Background Job Queue — Pattern polling

```python
# app/api/routes/core/jobs.py

@router.post("/documents/{doc_id}/export/pdf")
async def request_pdf_export(doc_id: str, request: Request):
    from app.workers.settings import arq_pool
    job = await arq_pool.enqueue_job(
        "generate_document_pdf",
        document_id=doc_id,
        tenant_id=request.state.tenant_id,
        user_id=request.state.user_id,
    )
    return {"job_id": job.job_id}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, request: Request):
    from app.workers.settings import arq_pool
    info = await arq_pool.job_info(job_id)
    if not info:
        raise HTTPException(404)
    return {"status": info.status, "result": info.result if info.status == "complete" else None,
            "error": info.error if info.status == "failed" else None}
```

```tsx
// src/hooks/useJobStatus.ts
export const useJobStatus = (jobId: string | null) => {
    return useQuery({
        queryKey: ["job", jobId],
        queryFn: () => api.get(`/api/v1/jobs/${jobId}`).then(r => r.data),
        enabled: !!jobId,
        refetchInterval: (data) =>
            !data || ["queued","in_progress"].includes(data?.status) ? 2000 : false,
    })
}
```

---

## 8. Personalization Engine

### Service Python

```python
# app/services/core/preference_service.py

async def get_preference(user_id: str, tenant_id: str, key: str, default=None, db=None):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == UUID(user_id),
            UserPreference.tenant_id == UUID(tenant_id),
            UserPreference.preference_key == key,
        )
    )
    p = result.scalar_one_or_none()
    return p.preference_value if p else default

async def set_preference(user_id: str, tenant_id: str, key: str, value, db):
    stmt = insert(UserPreference).values(
        user_id=UUID(user_id), tenant_id=UUID(tenant_id),
        preference_key=key, preference_value=value,
    ).on_conflict_do_update(
        index_elements=["user_id","tenant_id","preference_key"],
        set_={"preference_value": value, "updated_at": datetime.utcnow()}
    )
    await db.execute(stmt)
    await db.commit()
```

### API FastAPI préférences

```python
# app/api/routes/core/preferences.py

@router.get("/me/preferences")
async def get_all_preferences(request: Request, db=Depends(get_db)):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == request.state.user_id,
            UserPreference.tenant_id == request.state.tenant_id,
        )
    )
    return {p.preference_key: p.preference_value for p in result.scalars()}

@router.patch("/me/preferences")
async def update_preferences(body: dict, request: Request, db=Depends(get_db)):
    for key, value in body.items():
        await set_preference(str(request.state.user_id), str(request.state.tenant_id), key, value, db)
    return {"updated": list(body.keys())}
```

### Hook React useUserPreference

```tsx
// src/hooks/useUserPreference.ts
export const useUserPreference = <T>(key: string, defaultValue: T) => {
    const queryClient = useQueryClient()
    const { data: prefs } = useQuery({
        queryKey: ["user-preferences"],
        queryFn: () => api.get("/api/v1/me/preferences").then(r => r.data),
        staleTime: Infinity,
    })
    const value = (prefs?.[key] ?? defaultValue) as T
    const setValue = useMutation({
        mutationFn: (v: T) => api.patch("/api/v1/me/preferences", { [key]: v }),
        onMutate: async (v) => {
            await queryClient.cancelQueries({ queryKey: ["user-preferences"] })
            queryClient.setQueryData(["user-preferences"], (old: any) => ({...old, [key]: v}))
        },
    })
    return [value, (v: T) => setValue.mutate(v)] as const
}
```

### Bookmarks — Service, API et Worker

```python
# app/services/core/bookmark_service.py

async def track_visit(user_id: str, tenant_id: str, url_path: str, page_title: str, db) -> None:
    """Appelé à chaque navigation. Suggère un bookmark si seuils atteints."""
    stmt = insert(UserBookmark).values(
        user_id=UUID(user_id), tenant_id=UUID(tenant_id),
        url_path=url_path, title=page_title, visit_count=1,
        last_visited_at=datetime.utcnow(),
    ).on_conflict_do_update(
        index_elements=["user_id","tenant_id","url_path"],
        set_={"visit_count": UserBookmark.visit_count + 1,
              "last_visited_at": datetime.utcnow()}
    )
    await db.execute(stmt)
    await db.commit()

    # Vérifier seuils de suggestion
    bm = await db.execute(
        select(UserBookmark).where(
            UserBookmark.user_id == UUID(user_id),
            UserBookmark.url_path == url_path,
        )
    ).scalar_one_or_none()

    if bm and bm.visit_count >= 3 and not bm.suggestion_dismissed:
        from app.services.core.realtime_service import broadcast_to_user
        await broadcast_to_user(user_id, {
            "type": "bookmark_suggestion",
            "url_path": url_path,
            "title": page_title,
        })
```

```python
# app/api/routes/core/bookmarks.py

@router.get("/me/bookmarks")
async def list_bookmarks(request: Request, db=Depends(get_db)):
    result = await db.execute(
        select(UserBookmark).where(
            UserBookmark.user_id == request.state.user_id,
            UserBookmark.tenant_id == request.state.tenant_id,
            UserBookmark.suggestion_dismissed == False,
        ).order_by(UserBookmark.display_order, UserBookmark.last_visited_at.desc())
    )
    return result.scalars().all()

@router.post("/me/bookmarks")
async def add_bookmark(body: BookmarkCreateSchema, request: Request, db=Depends(get_db)):
    db.add(UserBookmark(
        user_id=UUID(request.state.user_id),
        tenant_id=UUID(request.state.tenant_id),
        url_path=body.url_path, title=body.title,
        custom_title=body.custom_title, custom_icon=body.custom_icon,
    ))
    await db.commit()
    return {"status": "created"}

@router.post("/me/bookmarks/track")
async def track_page_visit(body: TrackVisitSchema, request: Request, db=Depends(get_db)):
    await track_visit(str(request.state.user_id), str(request.state.tenant_id),
                      body.url_path, body.title, db)
    return {"status": "tracked"}

@router.patch("/me/bookmarks/{bookmark_id}/dismiss-suggestion")
async def dismiss_bookmark_suggestion(bookmark_id: str, request: Request, db=Depends(get_db)):
    bm = await db.get(UserBookmark, UUID(bookmark_id))
    if bm and str(bm.user_id) == str(request.state.user_id):
        bm.suggestion_dismissed = True
        await db.commit()
    return {"status": "dismissed"}
```

---

## 9. Recommendation Engine

```python
# app/workers/recommendation_worker.py

async def generate_daily_recommendations(ctx: dict) -> None:
    """Job ARQ planifié 6h30 : génère les recommandations pour tous les tenants."""
    async with get_db() as db:
        for tenant in await get_active_tenants(db):
            for user in await get_active_users(str(tenant.id), db):
                await _generate_for_user(str(user.id), str(tenant.id), db)

async def _generate_for_user(user_id: str, tenant_id: str, db) -> None:
    recos = []

    # 1. Validations en attente
    for p in await get_pending_validations(user_id, tenant_id, db):
        days = (datetime.utcnow() - p.submitted_at).days
        recos.append(Recommendation(
            tenant_id=UUID(tenant_id), user_id=UUID(user_id),
            rec_type="validation_pending",
            priority="critical" if days >= (p.deadline_days or 99) else "high",
            title=f"{'⚠️ En retard : ' if days >= (p.deadline_days or 99) else ''}{p.document_title}",
            body=f"En attente depuis {days} jour(s)" if days > 0 else "Soumis aujourd'hui",
            action_label="Valider", action_url=f"/documents/{p.document_id}/workflow",
            source="workflow", expires_at=datetime.utcnow() + timedelta(days=7),
        ))

    # 2. Deadlines J-2
    for d in await get_approaching_deadlines(user_id, tenant_id, days=2, db=db):
        recos.append(Recommendation(
            tenant_id=UUID(tenant_id), user_id=UUID(user_id),
            rec_type="deadline_approaching", priority="high",
            title=f"Délai dans {d.days_remaining}j : {d.document_title}",
            action_label="Traiter", action_url=f"/documents/{d.document_id}/workflow",
            source="workflow",
        ))

    # 3. Rapport journalier manquant (si fenêtre 7h-12h)
    hour = datetime.utcnow().hour
    if 7 <= hour < 12:
        last = await get_last_doc_of_type(user_id, tenant_id, "rapport_journalier", db)
        if not last or last.created_at.date() < date.today():
            recos.append(Recommendation(
                tenant_id=UUID(tenant_id), user_id=UUID(user_id),
                rec_type="document_due", priority="high",
                title="Rapport journalier non créé aujourd'hui",
                action_label="Créer", action_url="/documents/new?template=rapport_journalier",
                source="behavior", expires_at=datetime.utcnow() + timedelta(hours=8),
            ))

    # Dédoublonner et sauvegarder
    for reco in recos:
        dup = await db.execute(
            select(Recommendation).where(
                Recommendation.user_id == UUID(user_id),
                Recommendation.tenant_id == UUID(tenant_id),
                Recommendation.rec_type == reco.rec_type,
                Recommendation.action_url == reco.action_url,
                Recommendation.is_dismissed == False,
                Recommendation.expires_at > datetime.utcnow(),
            )
        ).scalar_one_or_none()
        if not dup:
            db.add(reco)

    await db.commit()
```

### API FastAPI recommandations

```python
# app/api/routes/core/recommendations.py

@router.get("/me/recommendations")
async def list_recommendations(
    priority: str | None = Query(None),
    request: Request = None, db=Depends(get_db),
):
    query = (select(Recommendation)
        .where(Recommendation.user_id == request.state.user_id,
               Recommendation.tenant_id == request.state.tenant_id,
               Recommendation.is_dismissed == False,
               Recommendation.is_acted_on == False,
               or_(Recommendation.expires_at.is_(None), Recommendation.expires_at > datetime.utcnow()))
        .order_by(
            case({"critical":0,"high":1,"medium":2,"low":3}, value=Recommendation.priority),
            Recommendation.created_at.desc()
        ))
    if priority:
        query = query.where(Recommendation.priority == priority)
    result = await db.execute(query)
    return result.scalars().all()

@router.patch("/me/recommendations/{rec_id}/dismiss")
async def dismiss_recommendation(rec_id: str, body: DismissSchema, request: Request, db=Depends(get_db)):
    rec = await db.get(Recommendation, UUID(rec_id))
    if rec and str(rec.user_id) == str(request.state.user_id):
        if body.snooze_minutes:
            rec.snoozed_until = datetime.utcnow() + timedelta(minutes=body.snooze_minutes)
        else:
            rec.is_dismissed = True
        await db.commit()
    return {"status": "dismissed"}
```

---

## 10. Map Engine

### Provider configurable — Composant React complet

```tsx
// src/components/core/MapView.tsx
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet.markercluster/dist/leaflet.markercluster.js"
import "leaflet.markercluster/dist/MarkerCluster.css"

export interface MapMarker {
    id: string; lat: number; lng: number; label: string
    iconColor?: string; popup?: React.ReactNode; onClick?: () => void
}

export const MapView = ({
    containerId, center, zoom = 8, markers = [], clustering = true, height = "400px",
}: {
    containerId: string; center?: {lat: number; lng: number}; zoom?: number
    markers?: MapMarker[]; clustering?: boolean; height?: string
}) => {
    const mapRef = useRef<L.Map | null>(null)
    const clusterRef = useRef<any>(null)
    const { data: config } = useMapConfig()  // GET /api/v1/map/config

    useEffect(() => {
        if (mapRef.current || !config) return

        const defaultCenter = config.default_center || {lat: 3.848, lng: 10.497}
        const map = L.map(containerId, {
            center: [center?.lat ?? defaultCenter.lat, center?.lng ?? defaultCenter.lng],
            zoom,
        })

        switch (config.provider) {
            case "mapbox":
                L.tileLayer(
                    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${config.api_key}`,
                    { attribution: "© Mapbox" }
                ).addTo(map)
                break
            default: // leaflet_osm
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "© OpenStreetMap contributors", maxZoom: 19,
                }).addTo(map)
        }

        mapRef.current = map
        return () => { map.remove(); mapRef.current = null }
    }, [containerId, config])

    useEffect(() => {
        if (!mapRef.current) return
        clusterRef.current?.clearLayers()

        if (clustering && !clusterRef.current) {
            clusterRef.current = (L as any).markerClusterGroup({ maxClusterRadius: 60 })
            mapRef.current.addLayer(clusterRef.current)
        }

        markers.forEach(m => {
            const icon = L.divIcon({
                html: `<div style="background:${m.iconColor||'#2E86AB'};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
                className: "", iconSize: [24,24], iconAnchor: [12,12],
            })
            const marker = L.marker([m.lat, m.lng], { icon })
            if (m.popup) {
                const container = document.createElement("div")
                ReactDOM.createRoot(container).render(m.popup)
                marker.bindPopup(container)
            }
            if (m.onClick) marker.on("click", m.onClick)
            clustering ? clusterRef.current.addLayer(marker) : mapRef.current!.addLayer(marker)
        })
    }, [markers, clustering])

    return <div id={containerId} style={{ height }} className="rounded-md overflow-hidden border border-border" />
}
```

---

## 11. Export / Generation Engine

```python
# app/workers/export_worker.py

async def generate_document_pdf(ctx: dict, document_id: str, tenant_id: str, user_id: str) -> dict:
    """
    Job ARQ : génère un PDF et retourne une URL de téléchargement signée.
    Appelé via arq_pool.enqueue_job("generate_document_pdf", ...)
    """
    from app.services.modules.report_service import get_document_for_export
    from app.services.core.storage_service import StorageService
    from app.services.core.export_service import generate_pdf

    doc = await get_document_for_export(document_id, tenant_id)
    pdf_bytes = await generate_pdf("document_export", {"document": doc}, tenant_id)

    storage = StorageService()
    async with get_db() as db:
        stored = await storage.upload(
            file_bytes=pdf_bytes,
            filename=f"{doc.number}_Rev{doc.current_revision.rev_code}.pdf",
            mime_type="application/pdf",
            tenant_id=tenant_id,
            created_by=user_id,
            db=db,
        )
        url = await storage.get_signed_url(str(stored.id), expires_in=3600, db=db)

    return {"download_url": url, "filename": stored.original_filename, "file_id": str(stored.id)}
```

---

## 12. Storage Service

```python
# app/services/core/storage_service.py

class StorageService:
    async def upload(self, file_bytes: bytes, filename: str, mime_type: str,
                     tenant_id: str, created_by: str, db, folder: str = "general") -> StoredFile:
        import hashlib
        checksum = hashlib.sha256(file_bytes).hexdigest()
        backend = settings.STORAGE_BACKEND

        if backend == "local":
            path = await self._save_local(file_bytes, filename, tenant_id, folder)
        elif backend == "minio":
            path = await self._save_minio(file_bytes, filename, tenant_id, folder)
        else:
            raise ValueError(f"Backend inconnu : {backend}")

        stored = StoredFile(
            tenant_id=UUID(tenant_id), original_filename=filename,
            storage_backend=backend, storage_path=path,
            mime_type=mime_type, size_bytes=len(file_bytes),
            checksum=checksum, created_by=UUID(created_by),
        )
        db.add(stored)
        await db.commit()
        await db.refresh(stored)
        return stored

    async def _save_local(self, data: bytes, filename: str, tenant_id: str, folder: str) -> str:
        from pathlib import Path
        safe = "".join(c for c in filename if c.isalnum() or c in ".-_")
        path = Path(settings.STORAGE_LOCAL_PATH) / tenant_id / folder / safe
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path)

    async def get_signed_url(self, file_id: str, expires_in: int = 3600, db=None) -> str:
        file = await db.get(StoredFile, UUID(file_id))
        if file.storage_backend == "local":
            from app.core.security import generate_signed_token
            token = generate_signed_token(file_id, expires_in)
            return f"{settings.API_BASE_URL}/api/v1/files/{file_id}/download?token={token}"
        # minio/azure : utiliser leurs APIs de presigned URLs
        raise NotImplementedError
```

---

## 13. OCR Engine

```python
# app/services/core/ocr_service.py

async def extract_text(file_bytes: bytes, mime_type: str, language: str = "fra+eng") -> str:
    """Extrait le texte d'un PDF ou d'une image via OCR."""
    if mime_type == "application/pdf":
        # Essayer extraction native d'abord
        try:
            import pypdf, io
            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            if len(text.strip()) > 100:
                return text
        except Exception:
            pass
        # OCR sur images
        from pdf2image import convert_from_bytes
        images = convert_from_bytes(file_bytes, dpi=200)
    elif mime_type.startswith("image/"):
        from PIL import Image
        import io
        images = [Image.open(io.BytesIO(file_bytes))]
    else:
        raise ValueError(f"Type de fichier non supporté pour OCR : {mime_type}")

    import pytesseract
    return "\n\n--- PAGE ---\n\n".join(
        pytesseract.image_to_string(img, lang=language, config="--psm 3")
        for img in images
    )
```

---

## 14. External Share Links

```python
# app/api/routes/core/share_links.py
import secrets

@router.post("/share-links", dependencies=[requires_permission("document.read")])
async def create_share_link(body: ShareLinkCreateSchema, request: Request, db=Depends(get_db)):
    token = secrets.token_urlsafe(32)
    link = ShareLink(
        token=token, tenant_id=UUID(request.state.tenant_id),
        object_type=body.object_type, object_id=UUID(body.object_id),
        permission=body.permission,
        created_by=UUID(request.state.user_id),
        expires_at=datetime.utcnow() + timedelta(hours=body.expires_in_hours) if body.expires_in_hours else None,
        max_uses=body.max_uses, ip_whitelist=body.ip_whitelist or [],
    )
    db.add(link)
    await db.commit()
    return {"url": f"{settings.FRONTEND_URL}/share/{token}", "expires_at": link.expires_at}

@router.get("/share/{token}")
async def access_share_link(token: str, request: Request, db=Depends(get_db)):
    """Endpoint public (sans auth). Valide le token et retourne les données."""
    link = await db.execute(
        select(ShareLink).where(ShareLink.token == token, ShareLink.is_active == True)
    ).scalar_one_or_none()

    if not link: raise HTTPException(404)
    if link.expires_at and link.expires_at < datetime.utcnow(): raise HTTPException(410, "Lien expiré")
    if link.max_uses and link.current_uses >= link.max_uses: raise HTTPException(410, "Quota atteint")
    if link.ip_whitelist and request.client.host not in link.ip_whitelist:
        raise HTTPException(403)

    db.add(ShareLinkAccess(link_id=link.id, ip_address=request.client.host,
                            user_agent=request.headers.get("user-agent")))
    link.current_uses += 1
    link.last_accessed_at = datetime.utcnow()
    await db.commit()
    return await get_shared_object_data(link, db)
```

---

## 15. Global Search

```python
# app/services/core/search_service.py

async def global_search(query: str, tenant_id: str, bu_id: str | None,
                         user, limit: int = 20, db=None) -> list:
    results = []
    q = query.strip()
    if len(q) < 2:
        return []

    # Documents (PostgreSQL full-text)
    docs = await db.execute(
        select(Document.id, Document.number, Document.title, Document.status,
               func.ts_rank(
                   func.to_tsvector("french", Document.title),
                   func.plainto_tsquery("french", q)
               ).label("rank"))
        .where(Document.tenant_id == UUID(tenant_id),
               func.to_tsvector("french", Document.title)
               .op("@@")(func.plainto_tsquery("french", q)))
        .order_by(desc("rank")).limit(5)
    )
    results.extend([{"type":"document","id":str(r.id),"title":r.title,
                     "subtitle":r.number,"url":f"/documents/{r.id}","rank":float(r.rank)}
                    for r in docs])

    # Assets
    assets = await db.execute(
        select(Asset.id, Asset.name, Asset.code,
               func.ts_rank(func.to_tsvector("french", Asset.name),
                            func.plainto_tsquery("french", q)).label("rank"))
        .where(Asset.tenant_id == UUID(tenant_id),
               func.to_tsvector("french", Asset.name)
               .op("@@")(func.plainto_tsquery("french", q)))
        .order_by(desc("rank")).limit(5)
    )
    results.extend([{"type":"asset","id":str(r.id),"title":r.name,
                     "subtitle":r.code,"url":f"/assets/{r.id}","rank":float(r.rank)}
                    for r in assets])

    results.sort(key=lambda x: x["rank"], reverse=True)
    return results[:limit]
```

### API + composant React GlobalSearch

```python
# app/api/routes/core/search.py

@router.get("/search")
async def search(q: str = Query(..., min_length=2), request: Request = None, db=Depends(get_db)):
    return await global_search(
        query=q, tenant_id=request.state.tenant_id,
        bu_id=request.state.bu_id, user=request.state.user,
        db=db,
    )
```

```tsx
// Le composant GlobalSearch est documenté dans 09_DESIGN_SYSTEM.md section 3
// (CommandDialog shadcn/ui avec résultats groupés)
```

---

## 16. Real-time Engine (WebSocket)

```python
# app/services/core/realtime_service.py
from fastapi import WebSocket

_connections: dict[str, list[WebSocket]] = {}

async def connect(ws: WebSocket, user_id: str) -> None:
    await ws.accept()
    _connections.setdefault(user_id, []).append(ws)

def disconnect(ws: WebSocket, user_id: str) -> None:
    if user_id in _connections:
        _connections[user_id] = [c for c in _connections[user_id] if c != ws]

async def broadcast_to_user(user_id: str, message: dict) -> None:
    dead = []
    for ws in _connections.get(user_id, []):
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections[user_id].remove(ws)
```

```python
# app/api/routes/core/websocket.py

@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    await connect(websocket, str(user.id))
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            elif data.get("type") == "track_visit":
                await track_visit(str(user.id), str(user.tenant_id),
                                   data["url_path"], data["title"])
    except WebSocketDisconnect:
        disconnect(websocket, str(user.id))
```

```tsx
// src/lib/websocket.ts

class OpsFluxWS {
    private ws: WebSocket | null = null
    private handlers = new Map<string, ((d: any) => void)[]>()

    connect(token: string) {
        const url = `${import.meta.env.VITE_WS_URL}/ws?token=${token}`
        this.ws = new WebSocket(url)
        this.ws.onmessage = e => {
            const msg = JSON.parse(e.data)
            ;(this.handlers.get(msg.type) || []).forEach(h => h(msg))
        }
        this.ws.onclose = () => setTimeout(() => this.connect(token), 3000)
        setInterval(() => this.ws?.readyState === WebSocket.OPEN &&
            this.ws.send(JSON.stringify({type:"ping"})), 30000)
    }

    on(type: string, handler: (d: any) => void) {
        this.handlers.set(type, [...(this.handlers.get(type)||[]), handler])
        return () => this.handlers.set(type, (this.handlers.get(type)||[]).filter(h => h !== handler))
    }
}

export const wsClient = new OpsFluxWS()

export const useWebSocketEvent = <T>(type: string, handler: (d: T) => void) => {
    useEffect(() => wsClient.on(type, handler), [type])
}
```

---

## 17. Object Capabilities API — Endpoint générique

```python
# app/api/routes/core/objects.py

@router.get("/objects/{object_type}/{object_id}/context")
async def get_object_context(
    object_type: str, object_id: str,
    include: str | None = Query(None, description="Capacités séparées par virgule"),
    request: Request = None, db=Depends(get_db),
):
    """
    Endpoint générique utilisé par le Panneau Dynamique.
    Retourne toutes les capacités Core activées pour un objet.
    include ex: "activity,attachments,extrafields"
    """
    parts = include.split(",") if include else None
    tenant_id = request.state.tenant_id
    result = {"object_type": object_type, "object_id": object_id}

    if not parts or "extrafields" in parts:
        result["extra_fields"] = await extrafield_service.get_values(object_type, object_id, tenant_id, db)

    if not parts or "activity" in parts:
        acts = await db.execute(
            select(ObjectActivity)
            .where(ObjectActivity.tenant_id == UUID(tenant_id),
                   ObjectActivity.object_type == object_type,
                   ObjectActivity.object_id == UUID(object_id))
            .order_by(ObjectActivity.created_at.desc()).limit(10)
        )
        result["activity"] = acts.scalars().all()

    if not parts or "attachments" in parts:
        atts = await db.execute(
            select(ObjectAttachment)
            .where(ObjectAttachment.tenant_id == UUID(tenant_id),
                   ObjectAttachment.object_type == object_type,
                   ObjectAttachment.object_id == UUID(object_id))
        )
        result["attachments"] = atts.scalars().all()

    if not parts or "comments" in parts:
        cmts = await db.execute(
            select(ObjectComment)
            .where(ObjectComment.tenant_id == UUID(tenant_id),
                   ObjectComment.object_type == object_type,
                   ObjectComment.object_id == UUID(object_id))
            .order_by(ObjectComment.created_at.desc()).limit(20)
        )
        result["comments"] = cmts.scalars().all()

    if not parts or "workflow" in parts:
        wf = await db.execute(
            select(WorkflowInstance)
            .where(WorkflowInstance.tenant_id == UUID(tenant_id),
                   WorkflowInstance.object_type == object_type,
                   WorkflowInstance.object_id == UUID(object_id))
            .order_by(WorkflowInstance.started_at.desc()).limit(1)
        )
        result["workflow"] = wf.scalar_one_or_none()

    return result

@router.post("/objects/{object_type}/{object_id}/attachments")
async def upload_attachment(
    object_type: str, object_id: str,
    file: UploadFile, label: str | None = Form(None),
    request: Request = None, db=Depends(get_db),
):
    from app.services.core.storage_service import StorageService
    storage = StorageService()
    stored = await storage.upload(
        await file.read(), file.filename, file.content_type,
        request.state.tenant_id, request.state.user_id, db,
    )
    db.add(ObjectAttachment(
        tenant_id=UUID(request.state.tenant_id), object_type=object_type,
        object_id=UUID(object_id), file_id=stored.id, label=label,
        created_by=UUID(request.state.user_id),
    ))
    await db.commit()
    return {"file_id": str(stored.id), "filename": file.filename}
```
