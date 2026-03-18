# OpsFlux — 01_CORE.md
# Services Core — Specification Complète avec Implementations

> Ce fichier documente **tous les services horizontaux** du Core.
> Un module ne reimplemente jamais un service Core — il l'appelle via l'API definie ici.
> Claude Code lit ce fichier avant d'implementer quoi que ce soit lie au Core.

> **Modele multi-tenancy a 3 niveaux** :
> - **Tenant** = isolation par schema PostgreSQL. Chaque tenant possede son propre schema. Le routage se fait via `SET search_path = '{tenant_schema}';` resolu a partir du sous-domaine.
> - **Entity** = colonne `entity_id` pour le filtrage au niveau des lignes a l'interieur d'un tenant. Un utilisateur peut appartenir a plusieurs entites.
> - **BU/Departement** = sous-division d'une entite. Filtrage hybride (certaines tables filtrees par `department_id`, d'autres transversales a toutes les BU).
>
> Dans les schemas SQL ci-dessous, l'isolation tenant est au niveau du schema PostgreSQL (pas de colonne `tenant_id`). Le filtrage intra-tenant se fait via `entity_id UUID NOT NULL REFERENCES entities(id)`.

---

## 1. EventBus — Hooks / Triggers / Webhooks

### Architecture

L'EventBus utilise **PostgreSQL LISTEN/NOTIFY** pour la diffusion d'evenements en temps reel, combine avec une table `event_store` pour l'audit et le replay. Chaque evenement publie est persiste dans `event_store` avec un `event_id` unique. Les handlers verifient l'idempotence via cet `event_id` avant traitement.

### Schema DB

```sql
-- Table event_store : journal immuable de tous les evenements (audit + replay)
CREATE TABLE event_store (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),  -- cle d'idempotence
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_event_store_type ON event_store(entity_id, event_type, created_at DESC);
CREATE INDEX idx_event_store_event_id ON event_store(event_id);

-- Table event_hooks : configuration des hooks par les admins
CREATE TABLE event_hooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
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
CREATE INDEX idx_event_hooks_type ON event_hooks(entity_id, event_type, is_active);

-- Table event_log : resume de traitement par evenement
CREATE TABLE event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_id UUID NOT NULL REFERENCES event_store(event_id),
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
import asyncpg
import json
import uuid

# Registre interne des handlers (peuple au demarrage)
_handlers: dict[str, list[Callable]] = {}

def subscribe(event_type: str, handler: Callable) -> None:
    """Les modules appellent ceci au demarrage pour s'abonner a un event."""
    _handlers.setdefault(event_type, []).append(handler)

async def publish(
    event_type: str,
    payload: dict[str, Any],
    entity_id: str,
    actor_id: str | None = None,
) -> None:
    """Publie un evenement. Appele depuis n'importe quel service ou module.

    Implementation via PostgreSQL LISTEN/NOTIFY + event_store pour audit/replay.
    L'event_id assure l'idempotence cote handlers.
    """
    import time
    start = time.monotonic()
    failed = 0
    event_id = str(uuid.uuid4())

    async with get_db() as db:
        # 1. Persister dans event_store (audit + replay)
        db.add(EventStore(
            event_id=uuid.UUID(event_id),
            entity_id=uuid.UUID(entity_id),
            event_type=event_type,
            payload=payload,
            actor_id=uuid.UUID(actor_id) if actor_id else None,
        ))
        await db.flush()

        # 2. Handlers internes (verifient l'idempotence via event_id)
        for handler in _handlers.get(event_type, []):
            try:
                await handler(payload, entity_id, actor_id, event_id=event_id)
            except Exception as e:
                failed += 1
                logger.error(f"EventBus handler interne erreur [{event_type}]: {e}")

        # 3. Publier via PG NOTIFY pour les listeners externes
        notification_payload = json.dumps({
            "event_id": event_id,
            "event_type": event_type,
            "entity_id": entity_id,
            "payload": payload,
            "actor_id": actor_id,
        })
        await db.execute(
            text(f"NOTIFY event_channel, :payload"),
            {"payload": notification_payload}
        )

        # 4. Planifier le traitement des webhooks/triggers via APScheduler
        from app.core.scheduler import scheduler
        scheduler.add_job(
            process_event_hooks,
            trigger="date",  # execution immediate en arriere-plan
            kwargs={
                "event_type": event_type,
                "payload": payload,
                "entity_id": entity_id,
                "actor_id": actor_id,
                "event_id": event_id,
            },
            id=f"event_hook_{event_id}",
            replace_existing=True,
        )

        # 5. Logger le resume
        db.add(EventLog(
            entity_id=uuid.UUID(entity_id),
            event_type=event_type,
            event_id=uuid.UUID(event_id),
            payload=payload,
            hooks_triggered=len(_handlers.get(event_type, [])),
            hooks_failed=failed,
            processing_ms=int((time.monotonic() - start) * 1000),
        ))
        await db.commit()
```

```python
# app/core/pg_listener.py — Listener PG NOTIFY pour evenements distribues

import asyncpg
import json

async def start_pg_listener(dsn: str):
    """Demarre un listener PostgreSQL LISTEN/NOTIFY pour les evenements.
    Appele au demarrage de l'application."""
    conn = await asyncpg.connect(dsn)
    await conn.add_listener("event_channel", _on_notification)

async def _on_notification(conn, pid, channel, payload_str):
    """Callback PG NOTIFY : dispatch aux handlers internes."""
    data = json.loads(payload_str)
    event_type = data["event_type"]
    for handler in _handlers.get(event_type, []):
        try:
            await handler(
                data["payload"],
                data["entity_id"],
                data["actor_id"],
                event_id=data["event_id"],
            )
        except Exception as e:
            logger.error(f"PG NOTIFY handler erreur [{event_type}]: {e}")
```

```python
# app/main.py — enregistrement des handlers au demarrage
@app.on_event("startup")
async def register_event_handlers():
    from app.services.core import event_service
    from app.services.modules.ai_service import on_document_published
    from app.services.modules.pid_service import on_tag_renamed

    event_service.subscribe("document.published", on_document_published)
    event_service.subscribe("tag.renamed", on_tag_renamed)

    # Demarrer le listener PG NOTIFY
    from app.core.pg_listener import start_pg_listener
    await start_pg_listener(settings.DATABASE_URL)
```

### Retention audit — 7 ans

Politique de retention appliquee a la table `event_store` et aux logs d'audit :

- **7 ans minimum** de retention (obligation reglementaire Oil & Gas)
- Partitionnement via `pg_partman` par mois pour optimiser les requetes et faciliter l'archivage
- Les logs d'audit sont **immuables** : pas de UPDATE, pas de DELETE physique
- Export CSV des logs d'audit pour les auditeurs externes

```sql
-- Partitionnement de event_store par mois via pg_partman
-- La table parent est convertie en table partitionnee par RANGE sur created_at

CREATE TABLE event_store (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    actor_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Configuration pg_partman : partitions mensuelles, retention 7 ans (84 mois)
SELECT partman.create_parent(
    p_parent_table := 'public.event_store',
    p_control := 'created_at',
    p_type := 'native',
    p_interval := '1 month',
    p_premake := 3
);

UPDATE partman.part_config
SET retention = '84 months',       -- 7 ans de retention minimum
    retention_keep_table = true    -- conserver les anciennes partitions (archivage)
WHERE parent_table = 'public.event_store';

-- Immutabilite : trigger qui empeche UPDATE et DELETE sur event_store
CREATE OR REPLACE FUNCTION prevent_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Les logs d''audit sont immuables : UPDATE et DELETE interdits';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_store_immutable
    BEFORE UPDATE OR DELETE ON event_store
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

```python
# app/api/routes/core/audit.py — Export CSV des logs d'audit

@router.get("/audit/export")
async def export_audit_logs(
    date_from: date = Query(...),
    date_to: date = Query(...),
    event_type: str | None = Query(None),
    entity_id: UUID = Depends(get_current_entity),
    _: None = Depends(require_permission("admin.audit.export")),
    db=Depends(get_db),
):
    """Export CSV des logs d'audit pour les auditeurs externes.
    Necessite la permission admin.audit.export.
    Periode maximale : 1 an par export."""
    if (date_to - date_from).days > 365:
        raise HTTPException(400, "Periode maximale : 1 an par export")

    query = (
        select(EventStore)
        .where(
            EventStore.entity_id == entity_id,
            EventStore.created_at >= date_from,
            EventStore.created_at <= date_to,
        )
        .order_by(EventStore.created_at.asc())
    )
    if event_type:
        query = query.where(EventStore.event_type == event_type)

    result = await db.execute(query)
    events = result.scalars().all()

    # Generation CSV en streaming
    from fastapi.responses import StreamingResponse
    import csv, io

    def generate_csv():
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["event_id", "event_type", "actor_id", "payload", "created_at"])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
        for evt in events:
            writer.writerow([
                str(evt.event_id), evt.event_type, str(evt.actor_id),
                json.dumps(evt.payload, default=str), evt.created_at.isoformat(),
            ])
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    return StreamingResponse(
        generate_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_{date_from}_{date_to}.csv"},
    )
```

---

## 2. Notification Center

### Service Python

```python
# app/services/core/notification_service.py

async def notify(
    user_id: str,
    entity_id: str,
    template_key: str,
    context: dict,
    channels: list[str] | None = None,   # None = utilise preferences user
    priority: str = "medium",             # low | medium | high | critical
) -> None:
    async with get_db() as db:
        # Resoudre les canaux selon preferences user si non fournis
        if channels is None:
            prefs = await get_notification_prefs(user_id, entity_id, template_key, db)
            channels = prefs.channels if prefs else ["in_app"]

        # Heures de silence : garder seulement in_app
        if await is_in_quiet_hours(user_id, entity_id, db):
            channels = [c for c in channels if c == "in_app"]

        if "in_app" in channels:
            notif = Notification(
                entity_id=UUID(entity_id), user_id=UUID(user_id),
                template_key=template_key, context=context,
                channel="in_app", priority=priority,
            )
            db.add(notif)
            # Push temps reel via WebSocket
            from app.services.core.realtime_service import broadcast_to_user
            await broadcast_to_user(user_id, {"type": "notification",
                "notification": {"id": str(notif.id), "template_key": template_key,
                                  "context": context, "priority": priority}})

        if "email" in channels:
            from app.services.core.email_service import queue_email
            await queue_email(entity_id=entity_id,
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
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    query = (select(Notification)
        .where(Notification.user_id == current_user.id,
               Notification.entity_id == entity_id)
        .order_by(Notification.created_at.desc())
        .limit(limit))
    if unread_only:
        query = query.where(Notification.is_read == False)
    result = await db.execute(query)
    notifs = result.scalars().all()
    unread_count = sum(1 for n in notifs if not n.is_read)
    return {"notifications": notifs, "unread_count": unread_count}

@router.patch("/notifications/{notif_id}/read")
async def mark_read(
    notif_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    notif = await db.get(Notification, UUID(notif_id))
    if notif and str(notif.user_id) == str(current_user.id):
        notif.is_read = True
        notif.read_at = datetime.utcnow()
        await db.commit()
    return {"status": "ok"}

@router.patch("/notifications/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id,
               Notification.is_read == False)
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    return {"status": "ok"}
```

---

## 3. Email System

### Service Python (queue + job APScheduler)

```python
# app/services/core/email_service.py

async def queue_email(
    entity_id: str,
    to: list[str],
    template_key: str,
    context: dict,
    attachments: list[dict] | None = None,
    scheduled_at: datetime | None = None,
) -> None:
    """Ne jamais appeler send_email directement depuis un module. Toujours passer par ici."""
    async with get_db() as db:
        db.add(EmailQueue(
            entity_id=UUID(entity_id),
            to_addresses=to,
            template_key=template_key,
            context=context,
            attachments=attachments or [],
            scheduled_at=scheduled_at or datetime.utcnow(),
        ))
        await db.commit()
```

```python
# app/tasks/email_task.py

async def process_email_queue() -> None:
    """Job APScheduler planifie : traite la file d'attente email. Execute toutes les 2 minutes."""
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
                smtp_cfg = await get_entity_smtp_config(str(job.entity_id), db)
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
                     workflow_definition_id: str, entity_id: str,
                     actor_id: str, db: AsyncSession) -> WorkflowInstance:
        """Soumet un objet au workflow. Cree l'instance et passe au premier noeud actif."""
        definition = await db.get(WorkflowDefinition, UUID(workflow_definition_id))
        graph = definition.graph_json
        start_node = next(n for n in graph["nodes"] if n["type"] == "start")
        first_node_id = self._next_node_id(graph, start_node["id"], "default")

        instance = WorkflowInstance(
            entity_id=UUID(entity_id), object_type=object_type,
            object_id=UUID(object_id), definition_id=UUID(workflow_definition_id),
            current_node_id=first_node_id, status="in_progress",
        )
        db.add(instance)
        db.add(WorkflowTransition(
            entity_id=UUID(entity_id), instance_id=instance.id,
            from_node="start", to_node=first_node_id,
            action="submit", actor_id=UUID(actor_id),
        ))
        await db.flush()
        await self._notify_node_actors(instance, first_node_id, graph, entity_id, db)
        await db.commit()

        from app.services.core.event_service import publish
        await publish("workflow.submitted", {
            "object_type": object_type, "object_id": object_id,
            "instance_id": str(instance.id),
        }, entity_id, actor_id)
        return instance

    async def transition(self, instance_id: str, action: str, actor: User,
                         comment: str | None, db: AsyncSession) -> WorkflowInstance:
        """Effectue approve | reject | cancel sur une instance en cours."""
        instance = await db.get(WorkflowInstance, UUID(instance_id))
        if not instance or instance.status != "in_progress":
            raise ValueError("Instance introuvable ou non modifiable")

        # Resoudre delegation
        effective_actor = await self._resolve_delegation(actor, instance, db)
        if not effective_actor:
            raise PermissionError("Non autorise a agir sur ce noeud")

        definition = await db.get(WorkflowDefinition, instance.definition_id)
        graph = definition.graph_json
        current_node = next(n for n in graph["nodes"] if n["id"] == instance.current_node_id)

        # Noeud parallele : verifier le seuil avant d'avancer
        if current_node["type"] == "parallel" and action == "approve":
            await self._record_parallel_vote(instance, effective_actor, comment, db)
            threshold = current_node.get("data", {}).get("threshold", "all")
            total = len(current_node.get("data", {}).get("assignees", []))
            votes = await self._count_parallel_votes(instance, db)
            required = total if threshold == "all" else (total // 2 + 1)
            if votes < required:
                await db.commit()
                return instance   # attendre d'autres votes

        # Calculer le prochain noeud
        if action == "approve":
            next_id = self._next_node_id(graph, current_node["id"], "approved")
        elif action == "reject":
            next_id = current_node.get("data", {}).get("rejection_target", "start")
        elif action == "cancel":
            next_id = "end_cancelled"
        else:
            raise ValueError(f"Action inconnue : {action}")

        db.add(WorkflowTransition(
            entity_id=instance.entity_id, instance_id=instance.id,
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
            }, str(instance.entity_id), str(effective_actor.id))
        else:
            await self._notify_node_actors(instance, next_id, graph, str(instance.entity_id), db)

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
                                   graph: dict, entity_id: str, db: AsyncSession):
        node = next((n for n in graph["nodes"] if n["id"] == node_id), None)
        if not node:
            return
        data = node.get("data", {})
        actor_ids = []
        if role := data.get("assignee_role"):
            users = await get_users_by_role(role, entity_id, db)
            actor_ids.extend(str(u.id) for u in users)
        actor_ids.extend(data.get("assignee_users", []))
        deadline_days = data.get("deadline_days")

        from app.services.core.notification_service import notify
        for uid in actor_ids:
            await notify(uid, entity_id, "workflow.validation_required", {
                "object_type": instance.object_type,
                "object_id": str(instance.object_id),
                "instance_id": str(instance.id),
                "deadline_date": (datetime.utcnow() + timedelta(days=deadline_days)).strftime("%d/%m/%Y")
                    if deadline_days else None,
            }, priority="high")

    async def _resolve_delegation(self, actor: User, instance: WorkflowInstance,
                                   db: AsyncSession) -> User | None:
        """Verifie si l'actor ou son delegant peut agir sur le noeud courant."""
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
                Delegation.entity_id == instance.entity_id,
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
async def approve_workflow(
    instance_id: str,
    body: WorkflowActionBody,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    return await workflow_service.transition(
        instance_id, "approve", current_user, body.comment, db)

@router.post("/workflow/instances/{instance_id}/reject")
async def reject_workflow(
    instance_id: str,
    body: WorkflowActionBody,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    return await workflow_service.transition(
        instance_id, "reject", current_user, body.comment, db)

@router.get("/workflow/my-pending")
async def my_pending_validations(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Liste toutes les instances en attente de l'user courant (filtre par entite)."""
    return await workflow_service.get_pending_for_user(
        user=current_user, entity_id=entity_id, db=db)

@router.get("/workflow/my-pending-count")
async def my_pending_count(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    """Endpoint leger pour le badge sidebar."""
    count = await workflow_service.count_pending_for_user(
        current_user.id, entity_id, db)
    return {"count": count}

@router.post("/workflow/delegations")
async def create_delegation(
    body: DelegationCreateSchema,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db.add(Delegation(
        entity_id=entity_id,
        delegator_id=current_user.id,
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

async def get_definitions(object_type: str, entity_id: str, db: AsyncSession):
    result = await db.execute(
        select(ExtrafieldDefinition)
        .where(ExtrafieldDefinition.entity_id == UUID(entity_id),
               ExtrafieldDefinition.object_type == object_type)
        .order_by(ExtrafieldDefinition.display_order)
    )
    return result.scalars().all()

async def get_values(object_type: str, object_id: str, entity_id: str, db: AsyncSession) -> dict:
    """Retourne toutes les valeurs d'un objet sous forme {field_key: value}."""
    definitions = await get_definitions(object_type, entity_id, db)
    values_result = await db.execute(
        select(ExtrafieldValue).where(
            ExtrafieldValue.entity_id == UUID(entity_id),
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
                    value, entity_id: str, updated_by: str, db: AsyncSession):
    defn = await db.execute(
        select(ExtrafieldDefinition).where(
            ExtrafieldDefinition.entity_id == UUID(entity_id),
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
        entity_id=UUID(entity_id), definition_id=defn.id,
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
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selectionner..." /></SelectTrigger>
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
# app/core/scheduler.py — Configuration APScheduler

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

scheduler = AsyncIOScheduler()

def setup_scheduler():
    """Configure et demarre APScheduler. Appele au demarrage de l'application.
    Pas de conteneur worker separe : le scheduler tourne dans le processus FastAPI."""

    # ---- Import de tous les handlers ----
    from app.tasks.email_task import process_email_queue
    from app.tasks.ai_indexer import index_published_document, generate_document_embeddings
    from app.tasks.recommendation_task import generate_daily_recommendations
    from app.tasks.event_task import process_event_hooks
    from app.tasks.deadline_task import check_workflow_deadlines
    from app.tasks.export_task import generate_document_pdf, generate_export_file

    # ---- Jobs periodiques (cron) ----

    # Email : toutes les 2 minutes
    scheduler.add_job(
        process_email_queue,
        CronTrigger(minute="*/2"),
        id="process_email_queue",
        replace_existing=True,
    )

    # Deadlines workflow : chaque matin a 8h
    scheduler.add_job(
        check_workflow_deadlines,
        CronTrigger(hour=8, minute=0),
        id="check_workflow_deadlines",
        replace_existing=True,
    )

    # Recommandations : 6h30
    scheduler.add_job(
        generate_daily_recommendations,
        CronTrigger(hour=6, minute=30),
        id="generate_daily_recommendations",
        replace_existing=True,
    )

    # Synchronisation intranet Perenco : toutes les 4 heures
    from app.tasks.intranet_sync_task import sync_employees_from_intranet
    scheduler.add_job(
        sync_employees_from_intranet,
        CronTrigger(hour="*/4", minute=0),
        id="sync_employees_from_intranet",
        replace_existing=True,
    )

    # Desactivation comptes externes expires : chaque jour a minuit
    from app.tasks.account_expiry_task import deactivate_expired_accounts
    scheduler.add_job(
        deactivate_expired_accounts,
        CronTrigger(hour=0, minute=0),
        id="deactivate_expired_accounts",
        replace_existing=True,
    )

    scheduler.start()
```

```python
# app/main.py — Demarrage du scheduler

@app.on_event("startup")
async def startup_scheduler():
    from app.core.scheduler import setup_scheduler
    setup_scheduler()

@app.on_event("shutdown")
async def shutdown_scheduler():
    from app.core.scheduler import scheduler
    scheduler.shutdown(wait=False)
```

### 6.1 Synchronisation intranet planifiee

Job APScheduler toutes les **4 heures** pour synchroniser les employes depuis l'intranet Perenco.

- Detection des departs : si un employe est absent de l'intranet pendant **2 cycles consecutifs**, le compte est automatiquement suspendu (garde-fou contre les erreurs ponctuelles de synchro)
- Notification au chef de departement lors de la desactivation d'un compte employe
- Le job met a jour les donnees RH (poste, departement, entite) en plus de la detection des departs

```python
# app/tasks/intranet_sync_task.py

async def sync_employees_from_intranet():
    """Job APScheduler planifie toutes les 4h : synchronise les employes depuis l'intranet Perenco.

    Logique de detection des departs :
    - Chaque synchro marque les employes presents avec `intranet_last_seen = NOW()`
    - Si un employe est absent pendant 2 cycles consecutifs (8h sans mise a jour),
      son compte est automatiquement suspendu.
    - Garde-fou : 2 cycles requis pour eviter les faux positifs (erreur ponctuelle de synchro).
    """
    async with get_db() as db:
        # 1. Recuperer la liste des employes depuis l'API intranet Perenco
        employees = await intranet_client.fetch_employees()

        for emp in employees:
            # 2. Upsert employe : creer ou mettre a jour (poste, departement, entite)
            await upsert_employee(
                db, external_id=emp["id"],
                full_name=emp["full_name"],
                job_title=emp["job_title"],
                department=emp["department"],
                entity=emp["entity"],
                intranet_last_seen=datetime.utcnow(),
            )

        # 3. Detecter les departs : employes absents depuis 2 cycles (8h)
        threshold = datetime.utcnow() - timedelta(hours=8)
        departed = await db.execute(
            select(User).where(
                User.source == "intranet",
                User.is_active == True,
                User.intranet_last_seen < threshold,
            )
        )
        for user in departed.scalars():
            user.is_active = False
            user.suspended_at = datetime.utcnow()
            user.suspension_reason = "absent_intranet_2_cycles"

            # 4. Notifier le chef de departement
            dept_head = await get_department_head(db, user.department_id)
            if dept_head:
                await notification_service.send(
                    user_id=str(dept_head.id),
                    entity_id=str(user.entity_id),
                    title="Compte employe desactive",
                    body=f"{user.full_name} a ete desactive (absent de l'intranet pendant 2 cycles consecutifs).",
                    category="admin",
                    link=f"/admin/users/{user.id}",
                    db=db,
                )

        await db.commit()
```

### 6.2 Batch desactivation automatique des comptes expires

Job APScheduler quotidien (minuit) : verifie les comptes externes avec `account_expires_at < NOW()` et les desactive automatiquement.

- Notification envoyee au createur du compte lors de la desactivation automatique
- Les sessions actives de l'utilisateur desactive sont revoquees immediatement (invalidation JWT via Redis blacklist)

```python
# app/tasks/account_expiry_task.py

async def deactivate_expired_accounts():
    """Job APScheduler quotidien (minuit) : desactive les comptes externes expires.

    - Verifie account_expires_at < NOW() sur les comptes externes actifs
    - Revoque les sessions actives via Redis blacklist (invalidation JWT immediate)
    - Notifie le createur du compte
    """
    async with get_db() as db:
        expired = await db.execute(
            select(User).where(
                User.account_type == "external",
                User.is_active == True,
                User.account_expires_at < datetime.utcnow(),
            )
        )
        for user in expired.scalars():
            # 1. Desactiver le compte
            user.is_active = False
            user.suspended_at = datetime.utcnow()
            user.suspension_reason = "account_expired"

            # 2. Revoquer les sessions actives (invalidation JWT via Redis blacklist)
            await redis.sadd(
                "jwt:blacklist",
                *[str(s.token_jti) for s in user.active_sessions]
            )
            # Expiration auto de la blacklist apres la duree de vie max du JWT
            for session in user.active_sessions:
                await redis.expire(f"jwt:blacklist:{session.token_jti}", 86400)
                session.is_active = False

            # 3. Notifier le createur du compte
            if user.created_by:
                await notification_service.send(
                    user_id=str(user.created_by),
                    entity_id=str(user.entity_id),
                    title="Compte externe expire",
                    body=f"Le compte de {user.full_name} a ete automatiquement desactive (date d'expiration atteinte).",
                    category="admin",
                    link=f"/admin/users/{user.id}",
                    db=db,
                )

        await db.commit()
        logger.info(f"Comptes expires desactives : {len(expired.all())}")
```

---

## 7. Background Job Queue — Pattern polling

Les jobs asynchrones (export PDF, webhooks, notifications) sont planifies via **APScheduler** avec `trigger='date'` pour les executions immediates en arriere-plan. Pas de conteneur worker separe.

```python
# app/api/routes/core/jobs.py

@router.post("/documents/{doc_id}/export/pdf")
async def request_pdf_export(
    doc_id: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
):
    from app.core.scheduler import scheduler
    from app.tasks.export_task import generate_document_pdf
    import uuid

    job_id = str(uuid.uuid4())
    scheduler.add_job(
        generate_document_pdf,
        trigger="date",  # execution immediate
        kwargs={
            "document_id": doc_id,
            "entity_id": str(entity_id),
            "user_id": str(current_user.id),
            "job_id": job_id,
        },
        id=job_id,
        replace_existing=True,
    )
    return {"job_id": job_id}

@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, db=Depends(get_db)):
    """Interroge le statut d'un job via la table background_jobs."""
    result = await db.execute(
        select(BackgroundJob).where(BackgroundJob.job_id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404)
    return {
        "status": job.status,
        "result": job.result if job.status == "complete" else None,
        "error": job.error if job.status == "failed" else None,
    }
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

async def get_preference(user_id: str, entity_id: str, key: str, default=None, db=None):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == UUID(user_id),
            UserPreference.entity_id == UUID(entity_id),
            UserPreference.preference_key == key,
        )
    )
    p = result.scalar_one_or_none()
    return p.preference_value if p else default

async def set_preference(user_id: str, entity_id: str, key: str, value, db):
    stmt = insert(UserPreference).values(
        user_id=UUID(user_id), entity_id=UUID(entity_id),
        preference_key=key, preference_value=value,
    ).on_conflict_do_update(
        index_elements=["user_id","entity_id","preference_key"],
        set_={"preference_value": value, "updated_at": datetime.utcnow()}
    )
    await db.execute(stmt)
    await db.commit()
```

### API FastAPI preferences

```python
# app/api/routes/core/preferences.py

@router.get("/me/preferences")
async def get_all_preferences(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == current_user.id,
            UserPreference.entity_id == entity_id,
        )
    )
    return {p.preference_key: p.preference_value for p in result.scalars()}

@router.patch("/me/preferences")
async def update_preferences(
    body: dict,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    for key, value in body.items():
        await set_preference(str(current_user.id), str(entity_id), key, value, db)
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

async def track_visit(user_id: str, entity_id: str, url_path: str, page_title: str, db) -> None:
    """Appele a chaque navigation. Suggere un bookmark si seuils atteints."""
    stmt = insert(UserBookmark).values(
        user_id=UUID(user_id), entity_id=UUID(entity_id),
        url_path=url_path, title=page_title, visit_count=1,
        last_visited_at=datetime.utcnow(),
    ).on_conflict_do_update(
        index_elements=["user_id","entity_id","url_path"],
        set_={"visit_count": UserBookmark.visit_count + 1,
              "last_visited_at": datetime.utcnow()}
    )
    await db.execute(stmt)
    await db.commit()

    # Verifier seuils de suggestion
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
async def list_bookmarks(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    result = await db.execute(
        select(UserBookmark).where(
            UserBookmark.user_id == current_user.id,
            UserBookmark.entity_id == entity_id,
            UserBookmark.suggestion_dismissed == False,
        ).order_by(UserBookmark.display_order, UserBookmark.last_visited_at.desc())
    )
    return result.scalars().all()

@router.post("/me/bookmarks")
async def add_bookmark(
    body: BookmarkCreateSchema,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    db.add(UserBookmark(
        user_id=current_user.id,
        entity_id=entity_id,
        url_path=body.url_path, title=body.title,
        custom_title=body.custom_title, custom_icon=body.custom_icon,
    ))
    await db.commit()
    return {"status": "created"}

@router.post("/me/bookmarks/track")
async def track_page_visit(
    body: TrackVisitSchema,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    await track_visit(str(current_user.id), str(entity_id),
                      body.url_path, body.title, db)
    return {"status": "tracked"}

@router.patch("/me/bookmarks/{bookmark_id}/dismiss-suggestion")
async def dismiss_bookmark_suggestion(
    bookmark_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    bm = await db.get(UserBookmark, UUID(bookmark_id))
    if bm and str(bm.user_id) == str(current_user.id):
        bm.suggestion_dismissed = True
        await db.commit()
    return {"status": "dismissed"}
```

---

## 9. Recommendation Engine

```python
# app/tasks/recommendation_task.py

async def generate_daily_recommendations() -> None:
    """Job APScheduler planifie a 6h30 : genere les recommandations pour toutes les entites."""
    async with get_db() as db:
        for entity in await get_active_entities(db):
            for user in await get_active_users(str(entity.id), db):
                await _generate_for_user(str(user.id), str(entity.id), db)

async def _generate_for_user(user_id: str, entity_id: str, db) -> None:
    recos = []

    # 1. Validations en attente
    for p in await get_pending_validations(user_id, entity_id, db):
        days = (datetime.utcnow() - p.submitted_at).days
        recos.append(Recommendation(
            entity_id=UUID(entity_id), user_id=UUID(user_id),
            rec_type="validation_pending",
            priority="critical" if days >= (p.deadline_days or 99) else "high",
            title=f"En retard : {p.document_title}" if days >= (p.deadline_days or 99) else p.document_title,
            body=f"En attente depuis {days} jour(s)" if days > 0 else "Soumis aujourd'hui",
            action_label="Valider", action_url=f"/documents/{p.document_id}/workflow",
            source="workflow", expires_at=datetime.utcnow() + timedelta(days=7),
        ))

    # 2. Deadlines J-2
    for d in await get_approaching_deadlines(user_id, entity_id, days=2, db=db):
        recos.append(Recommendation(
            entity_id=UUID(entity_id), user_id=UUID(user_id),
            rec_type="deadline_approaching", priority="high",
            title=f"Delai dans {d.days_remaining}j : {d.document_title}",
            action_label="Traiter", action_url=f"/documents/{d.document_id}/workflow",
            source="workflow",
        ))

    # 3. Rapport journalier manquant (si fenetre 7h-12h)
    hour = datetime.utcnow().hour
    if 7 <= hour < 12:
        last = await get_last_doc_of_type(user_id, entity_id, "rapport_journalier", db)
        if not last or last.created_at.date() < date.today():
            recos.append(Recommendation(
                entity_id=UUID(entity_id), user_id=UUID(user_id),
                rec_type="document_due", priority="high",
                title="Rapport journalier non cree aujourd'hui",
                action_label="Creer", action_url="/documents/new?template=rapport_journalier",
                source="behavior", expires_at=datetime.utcnow() + timedelta(hours=8),
            ))

    # Dedoublonner et sauvegarder
    for reco in recos:
        dup = await db.execute(
            select(Recommendation).where(
                Recommendation.user_id == UUID(user_id),
                Recommendation.entity_id == UUID(entity_id),
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
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    query = (select(Recommendation)
        .where(Recommendation.user_id == current_user.id,
               Recommendation.entity_id == entity_id,
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
async def dismiss_recommendation(
    rec_id: str,
    body: DismissSchema,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    rec = await db.get(Recommendation, UUID(rec_id))
    if rec and str(rec.user_id) == str(current_user.id):
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
                    { attribution: "Mapbox" }
                ).addTo(map)
                break
            default: // leaflet_osm
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "OpenStreetMap contributors", maxZoom: 19,
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
# app/tasks/export_task.py

async def generate_document_pdf(document_id: str, entity_id: str, user_id: str, job_id: str) -> dict:
    """
    Job APScheduler : genere un PDF et retourne une URL de telechargement signee.
    Planifie via scheduler.add_job(generate_document_pdf, trigger="date", ...)
    """
    from app.services.modules.report_service import get_document_for_export
    from app.services.core.storage_service import StorageService
    from app.services.core.export_service import generate_pdf

    doc = await get_document_for_export(document_id, entity_id)
    pdf_bytes = await generate_pdf("document_export", {"document": doc}, entity_id)

    storage = StorageService()
    async with get_db() as db:
        stored = await storage.upload(
            file_bytes=pdf_bytes,
            filename=f"{doc.number}_Rev{doc.current_revision.rev_code}.pdf",
            mime_type="application/pdf",
            entity_id=entity_id,
            created_by=user_id,
            db=db,
        )
        url = await storage.get_signed_url(str(stored.id), expires_in=3600, db=db)

        # Mettre a jour le statut du job
        await db.execute(
            update(BackgroundJob)
            .where(BackgroundJob.job_id == job_id)
            .values(status="complete", result={
                "download_url": url,
                "filename": stored.original_filename,
                "file_id": str(stored.id),
            })
        )
        await db.commit()

    return {"download_url": url, "filename": stored.original_filename, "file_id": str(stored.id)}
```

---

## 12. Storage Service

Le stockage utilise un backend **S3-compatible** : MinIO en developpement, AWS S3 en production. L'acces aux fichiers se fait via des **presigned URLs** generees avec boto3/aioboto3.

```python
# app/services/core/storage_service.py
import aioboto3

class StorageService:
    def __init__(self):
        self.session = aioboto3.Session()

    async def upload(self, file_bytes: bytes, filename: str, mime_type: str,
                     entity_id: str, created_by: str, db, folder: str = "general") -> StoredFile:
        import hashlib
        checksum = hashlib.sha256(file_bytes).hexdigest()

        # Upload vers S3-compatible (MinIO en dev, AWS S3 en prod)
        s3_key = f"{entity_id}/{folder}/{checksum}_{filename}"
        async with self.session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,      # MinIO: http://localhost:9000, S3: None
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        ) as s3:
            await s3.put_object(
                Bucket=settings.S3_BUCKET,
                Key=s3_key,
                Body=file_bytes,
                ContentType=mime_type,
            )

        stored = StoredFile(
            entity_id=UUID(entity_id), original_filename=filename,
            storage_backend="s3", storage_path=s3_key,
            mime_type=mime_type, size_bytes=len(file_bytes),
            checksum=checksum, created_by=UUID(created_by),
        )
        db.add(stored)
        await db.commit()
        await db.refresh(stored)
        return stored

    async def get_signed_url(self, file_id: str, expires_in: int = 3600, db=None) -> str:
        """Genere une presigned URL pour le telechargement d'un fichier."""
        file = await db.get(StoredFile, UUID(file_id))
        async with self.session.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
        ) as s3:
            url = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.S3_BUCKET, "Key": file.storage_path},
                ExpiresIn=expires_in,
            )
        return url
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
        raise ValueError(f"Type de fichier non supporte pour OCR : {mime_type}")

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

@router.post("/share-links", dependencies=[Depends(require_permission("sharelink.sharelink.create"))])
async def create_share_link(
    body: ShareLinkCreateSchema,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    token = secrets.token_urlsafe(32)
    link = ShareLink(
        token=token, entity_id=entity_id,
        object_type=body.object_type, object_id=UUID(body.object_id),
        permission=body.permission,
        created_by=current_user.id,
        expires_at=datetime.utcnow() + timedelta(hours=body.expires_in_hours) if body.expires_in_hours else None,
        max_uses=body.max_uses, ip_whitelist=body.ip_whitelist or [],
    )
    db.add(link)
    await db.commit()
    return {"url": f"{settings.FRONTEND_URL}/share/{token}", "expires_at": link.expires_at}

@router.get("/share/{token}")
async def access_share_link(token: str, request: Request, db=Depends(get_db)):
    """Endpoint public (sans auth). Valide le token et retourne les donnees."""
    link = await db.execute(
        select(ShareLink).where(ShareLink.token == token, ShareLink.is_active == True)
    ).scalar_one_or_none()

    if not link: raise HTTPException(404)
    if link.expires_at and link.expires_at < datetime.utcnow(): raise HTTPException(410, "Lien expire")
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

async def global_search(query: str, entity_id: str, bu_id: str | None,
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
        .where(Document.entity_id == UUID(entity_id),
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
        .where(Asset.entity_id == UUID(entity_id),
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
async def search(
    q: str = Query(..., min_length=2),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    return await global_search(
        query=q, entity_id=str(entity_id),
        bu_id=None, user=current_user,
        db=db,
    )
```

```tsx
// Le composant GlobalSearch est documente dans 09_DESIGN_SYSTEM.md section 3
// (CommandDialog shadcn/ui avec resultats groupes)
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
                entity_id = str(get_entity_for_user(user))
                await track_visit(str(user.id), entity_id,
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

## 17. Object Capabilities API — Endpoint generique

```python
# app/api/routes/core/objects.py

@router.get("/objects/{object_type}/{object_id}/context")
async def get_object_context(
    object_type: str, object_id: str,
    include: str | None = Query(None, description="Capacites separees par virgule"),
    entity_id: UUID = Depends(get_current_entity),
    db=Depends(get_db),
):
    """
    Endpoint generique utilise par le Panneau Dynamique.
    Retourne toutes les capacites Core activees pour un objet.
    include ex: "activity,attachments,extrafields"
    """
    parts = include.split(",") if include else None
    result = {"object_type": object_type, "object_id": object_id}

    if not parts or "extrafields" in parts:
        result["extra_fields"] = await extrafield_service.get_values(object_type, object_id, str(entity_id), db)

    if not parts or "activity" in parts:
        acts = await db.execute(
            select(ObjectActivity)
            .where(ObjectActivity.entity_id == entity_id,
                   ObjectActivity.object_type == object_type,
                   ObjectActivity.object_id == UUID(object_id))
            .order_by(ObjectActivity.created_at.desc()).limit(10)
        )
        result["activity"] = acts.scalars().all()

    if not parts or "attachments" in parts:
        atts = await db.execute(
            select(ObjectAttachment)
            .where(ObjectAttachment.entity_id == entity_id,
                   ObjectAttachment.object_type == object_type,
                   ObjectAttachment.object_id == UUID(object_id))
        )
        result["attachments"] = atts.scalars().all()

    if not parts or "comments" in parts:
        cmts = await db.execute(
            select(ObjectComment)
            .where(ObjectComment.entity_id == entity_id,
                   ObjectComment.object_type == object_type,
                   ObjectComment.object_id == UUID(object_id))
            .order_by(ObjectComment.created_at.desc()).limit(20)
        )
        result["comments"] = cmts.scalars().all()

    if not parts or "workflow" in parts:
        wf = await db.execute(
            select(WorkflowInstance)
            .where(WorkflowInstance.entity_id == entity_id,
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
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    from app.services.core.storage_service import StorageService
    storage = StorageService()
    stored = await storage.upload(
        await file.read(), file.filename, file.content_type,
        str(entity_id), str(current_user.id), db,
    )
    db.add(ObjectAttachment(
        entity_id=entity_id, object_type=object_type,
        object_id=UUID(object_id), file_id=stored.id, label=label,
        created_by=current_user.id,
    ))
    await db.commit()
    return {"file_id": str(stored.id), "filename": file.filename}
```

---

## 18. RBAC — Modele de permissions

Le systeme RBAC utilise un modele de permissions granulaires au format `{module}.{resource}.{action}`. Les roles sont des regroupements de permissions definis par les modules via le `ModuleRegistry`.

### Structure des permissions

```
{module}.{resource}.{action}

Exemples :
  projets.project.create
  projets.project.read
  projets.project.update
  projets.project.delete
  projets.wbs.read
  planner.activity.create
  paxlog.ads.approve
  travelwiz.voyage.read
  admin.user.manage
  workflow.instance.approve
  sharelink.sharelink.create
```

### ModuleRegistry — Declaration des permissions par module

```python
# app/core/module_registry.py

class ModuleRegistry:
    """Chaque module declare ses permissions au demarrage.
    Les roles sont des groupements de permissions."""

    _modules: dict[str, dict] = {}

    @classmethod
    def register(cls, module_name: str, permissions: list[str], default_roles: dict[str, list[str]]):
        """
        permissions: liste de permissions au format '{module}.{resource}.{action}'
        default_roles: mapping role_name -> liste de permissions
        """
        cls._modules[module_name] = {
            "permissions": permissions,
            "default_roles": default_roles,
        }

    @classmethod
    def get_all_permissions(cls) -> list[str]:
        perms = []
        for mod in cls._modules.values():
            perms.extend(mod["permissions"])
        return perms

    @classmethod
    def get_role_permissions(cls, role_name: str) -> list[str]:
        perms = []
        for mod in cls._modules.values():
            perms.extend(mod["default_roles"].get(role_name, []))
        return perms
```

### Dependance FastAPI pour verifier les permissions

```python
# app/core/rbac.py

def require_permission(permission: str):
    """Dependance FastAPI : verifie qu'un utilisateur possede la permission requise."""
    async def checker(current_user: User = Depends(get_current_user), db=Depends(get_db)):
        user_permissions = await get_user_permissions(current_user.id, db)
        if permission not in user_permissions:
            raise HTTPException(403, f"Permission requise : {permission}")
        return current_user
    return Depends(checker)

def require_any_permission(*permissions: str):
    """Dependance FastAPI : verifie qu'un utilisateur possede au moins une des permissions."""
    async def checker(current_user: User = Depends(get_current_user), db=Depends(get_db)):
        user_permissions = await get_user_permissions(current_user.id, db)
        if not any(p in user_permissions for p in permissions):
            raise HTTPException(403, f"Une des permissions requises : {', '.join(permissions)}")
        return current_user
    return Depends(checker)
```

---

## 19. Dashboard sante systeme

Dashboard de monitoring accessible aux `platform_admin` et `tenant_admin` pour superviser l'etat de sante de la plateforme.

### Statut granulaire par service

| Service | Metriques surveillees | Seuil critique |
|---------|----------------------|----------------|
| **PostgreSQL** | Connexions actives, taille DB, latence p95 | Latence p95 > 500ms |
| **Redis** | Memoire utilisee, connexions actives | Memoire > 80% |
| **Stockage S3** | Espace utilise / quota | Stockage > 80% |
| **IA** | Provider disponible, latence p95, tokens/jour | Provider indisponible |
| **Backup** | Age du dernier backup | Backup > 24h |

### Alertes automatiques

- Stockage S3 > **80%** du quota : alerte `warning`
- Backup age > **24h** : alerte `critical`
- Latence DB p95 > **500ms** : alerte `warning`
- Provider IA indisponible : alerte `critical`
- Redis memoire > **80%** : alerte `warning`

```python
# app/api/routes/core/system_health.py

@router.get("/admin/system/health")
async def get_system_health(
    _: None = Depends(require_any_permission("platform.admin", "tenant.admin")),
    db=Depends(get_db),
):
    """Dashboard sante systeme. Accessible aux platform_admin et tenant_admin.
    Retourne le statut de chaque service avec metriques detaillees."""
    health = {}

    # 1. PostgreSQL
    pg_stats = await db.execute(text("""
        SELECT
            numbackends AS active_connections,
            pg_database_size(current_database()) AS db_size_bytes,
            (SELECT extract(milliseconds FROM max(duration))
             FROM pg_stat_statements
             ORDER BY mean_exec_time DESC LIMIT 1) AS latency_p95_ms
        FROM pg_stat_database
        WHERE datname = current_database()
    """))
    pg = pg_stats.mappings().first()
    health["database"] = {
        "status": "healthy" if (pg["latency_p95_ms"] or 0) < 500 else "degraded",
        "active_connections": pg["active_connections"],
        "size_bytes": pg["db_size_bytes"],
        "latency_p95_ms": pg["latency_p95_ms"],
    }

    # 2. Redis
    redis_info = await redis.info("memory", "clients")
    redis_max_memory = int(redis_info.get("maxmemory", 0)) or 1
    redis_used_memory = int(redis_info.get("used_memory", 0))
    redis_memory_pct = (redis_used_memory / redis_max_memory) * 100 if redis_max_memory > 1 else 0
    health["redis"] = {
        "status": "healthy" if redis_memory_pct < 80 else "degraded",
        "used_memory_bytes": redis_used_memory,
        "connected_clients": redis_info.get("connected_clients"),
        "memory_usage_pct": round(redis_memory_pct, 1),
    }

    # 3. Stockage S3
    storage_stats = await storage_service.get_usage_stats()
    storage_pct = (storage_stats["used_bytes"] / storage_stats["quota_bytes"]) * 100
    health["storage"] = {
        "status": "healthy" if storage_pct < 80 else "degraded",
        "used_bytes": storage_stats["used_bytes"],
        "quota_bytes": storage_stats["quota_bytes"],
        "usage_pct": round(storage_pct, 1),
    }

    # 4. IA
    ai_status = await ai_service.check_provider_health()
    health["ai"] = {
        "status": "healthy" if ai_status["available"] else "critical",
        "provider": ai_status["provider"],
        "available": ai_status["available"],
        "latency_p95_ms": ai_status.get("latency_p95_ms"),
        "tokens_today": ai_status.get("tokens_today", 0),
    }

    # 5. Backup
    last_backup = await db.execute(text("""
        SELECT MAX(completed_at) AS last_backup_at
        FROM system_backups
        WHERE status = 'success'
    """))
    backup_row = last_backup.mappings().first()
    backup_age_hours = None
    if backup_row and backup_row["last_backup_at"]:
        backup_age_hours = (datetime.utcnow() - backup_row["last_backup_at"]).total_seconds() / 3600
    health["backup"] = {
        "status": "healthy" if backup_age_hours and backup_age_hours < 24 else "critical",
        "last_backup_at": backup_row["last_backup_at"].isoformat() if backup_row and backup_row["last_backup_at"] else None,
        "age_hours": round(backup_age_hours, 1) if backup_age_hours else None,
    }

    # 6. Alertes globales
    alerts = []
    if health["storage"]["status"] != "healthy":
        alerts.append({"level": "warning", "message": f"Stockage S3 a {health['storage']['usage_pct']}% du quota"})
    if health["backup"]["status"] != "healthy":
        alerts.append({"level": "critical", "message": f"Dernier backup il y a {health['backup']['age_hours']}h (seuil : 24h)"})
    if health["database"]["status"] != "healthy":
        alerts.append({"level": "warning", "message": f"Latence DB p95 : {health['database']['latency_p95_ms']}ms (seuil : 500ms)"})
    if health["ai"]["status"] != "healthy":
        alerts.append({"level": "critical", "message": f"Provider IA ({health['ai']['provider']}) indisponible"})
    if health["redis"]["status"] != "healthy":
        alerts.append({"level": "warning", "message": f"Redis memoire a {health['redis']['memory_usage_pct']}% (seuil : 80%)"})

    return {"services": health, "alerts": alerts, "checked_at": datetime.utcnow().isoformat()}
```

---

## References vers les specs de modules

Les specifications detaillees de chaque module sont disponibles dans les fichiers suivants :

| Module | Fichier spec |
|--------|-------------|
| Asset Registry | `modules/core/ASSET_REGISTRY.md` |
| Tiers | `modules/core/TIERS.md` |
| AI / MCP | `modules/core/AI_MCP.md` |
| Dashboard | `modules/core/DASHBOARD.md` |
| Projets | `01_MODULE_PROJETS.md` |
| Planner | `02_MODULE_PLANNER.md` |
| PaxLog | `03_MODULE_PAXLOG.md` |
| TravelWiz | `04_MODULE_TRAVELWIZ.md` |
