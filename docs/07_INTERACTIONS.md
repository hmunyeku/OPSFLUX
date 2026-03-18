# Interactions inter-modules — Spécification Technique Complète

## 1. Architecture de communication

### 1.1 Principes

Les quatre modules (Projets, Planner, PaxLog, TravelWiz) communiquent via deux mécanismes :

1. **Appels API directs (synchrones)** — pour les vérifications en temps réel
2. **Événements asynchrones (event bus)** — pour les réactions post-commit

**Règle absolue** : les événements sont émis **APRÈS** le commit de la transaction. Jamais dans la transaction.

### 1.2 Implémentation de l'event bus

```python
# app/core/events.py

class EventBus:
    """Event bus PostgreSQL LISTEN/NOTIFY. Remplaçable par Redis Pub/Sub."""

    async def emit(
        self,
        event_name: str,
        payload: dict,
        db: AsyncSession,
        source_entity_type: str | None = None,
        source_entity_id: UUID | None = None,
    ) -> str:
        """Émet APRÈS db.commit(). Persiste dans event_store pour audit/replay."""
        event_id = str(uuid4())
        envelope = {
            "event_id": event_id,
            "event_name": event_name,
            "emitted_at": datetime.utcnow().isoformat(),
            "source_entity_type": source_entity_type,
            "source_entity_id": str(source_entity_id) if source_entity_id else None,
            "payload": payload,
        }
        await db.execute(
            "INSERT INTO event_store (id, event_name, payload, emitted_at) "
            "VALUES (:id, :name, :payload, NOW())",
            {"id": event_id, "name": event_name, "payload": json.dumps(envelope)}
        )
        notification = json.dumps({"event_id": event_id, "event_name": event_name})
        await db.execute(f"NOTIFY opsflux_events, '{notification}'")
        return event_id

event_bus = EventBus()
```

```sql
-- Table de persistance événements
CREATE TABLE event_store (
  id           VARCHAR(36) PRIMARY KEY,
  event_name   VARCHAR(100) NOT NULL,
  payload      JSONB NOT NULL,
  emitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  handler      VARCHAR(100),
  retry_count  SMALLINT DEFAULT 0,
  error        TEXT
);
CREATE INDEX idx_events_name    ON event_store(event_name);
CREATE INDEX idx_events_emitted ON event_store(emitted_at DESC);
CREATE INDEX idx_events_pending ON event_store(processed_at) WHERE processed_at IS NULL;
```

```python
# app/event_handlers/__init__.py — enregistrement au startup FastAPI

async def register_all_handlers():
    paxlog   = PaxLogEventHandler()
    travelwiz = TravelWizEventHandler()
    planner  = PlannerEventHandler()

    await event_bus.subscribe(
        ["activity.modified", "activity.cancelled", "activity.approved"],
        paxlog.on_planner_event
    )
    await event_bus.subscribe(
        ["project.status_changed", "project.schedule_updated"],
        paxlog.on_project_event
    )
    await event_bus.subscribe(
        ["ads.approved", "ads_pax.unblocked", "ads.cancelled",
         "ads.rejected", "stay_program.approved"],
        travelwiz.on_paxlog_event
    )
    await event_bus.subscribe(
        ["activity.modified", "activity.cancelled"],
        travelwiz.on_planner_event
    )
    await event_bus.subscribe(
        ["pax_manifest.closed"],
        paxlog.on_travelwiz_event
    )
    await event_bus.subscribe(
        ["project.schedule_updated"],
        planner.on_project_event
    )
    await event_bus.subscribe(
        ["intranet.employee_deactivated"],
        paxlog.on_intranet_event
    )
    await event_bus.subscribe(
        ["intranet.employee_deactivated"],
        travelwiz.on_intranet_event
    )
```

### 1.3 Idempotence des handlers

```python
# Chaque handler DOIT être idempotent (safe à rejouer en cas d'erreur)
async def on_ads_approved(self, event: dict) -> None:
    event_id = event["event_id"]
    handler_key = "travelwiz.on_ads_approved"

    # Vérifier si déjà traité
    already_processed = await db.execute(
        "SELECT 1 FROM event_store WHERE id = :id AND handler = :handler "
        "AND processed_at IS NOT NULL",
        {"id": event_id, "handler": handler_key}
    )
    if already_processed:
        return

    try:
        # Traitement...
        await self._process_ads_approved(event["payload"])

        # Marquer traité
        await db.execute(
            "UPDATE event_store SET processed_at = NOW(), handler = :handler "
            "WHERE id = :id",
            {"id": event_id, "handler": handler_key}
        )
        await db.commit()
    except Exception as e:
        await db.execute(
            "UPDATE event_store SET retry_count = retry_count + 1, error = :error "
            "WHERE id = :id",
            {"id": event_id, "error": str(e)}
        )
        raise
```

---

## 2. Flux 1 — Projets → Planner (synchrone)

### 2.1 Sélection projet lors de création activité Planner

```python
# Planner appelle Projets pour peupler la liste déroulante
GET /api/v1/projects?entity_id={eid}&status=active
# Filtre: status=active uniquement (cancelled/completed exclus)

# Données consommées par Planner à la sélection :
# project.id        → activity.project_id
# project.priority  → valeur initiale activity.priority
# project.start_date/end_date → suggestions
# project.code + name → affichage UI
```

### 2.2 Événement : project.status_changed

```python
# Payload
{
    "event_name": "project.status_changed",
    "payload": {
        "project_id": "uuid",
        "project_code": "CAM-2026-047",
        "old_status": "active",
        "new_status": "cancelled",  # ou completed
        "reason": "Projet annulé suite décision DG",
        "changed_by": "uuid",
        "entity_id": "uuid"
    }
}

# Handler PaxLog (app/event_handlers/paxlog_handlers.py)
async def on_project_status_changed(self, event: dict) -> None:
    payload = event["payload"]
    if payload["new_status"] not in ("cancelled", "completed"):
        return

    # Trouver AdS avec imputations sur ce projet
    ads_ids = await db.execute(
        "SELECT DISTINCT ads_id FROM ads_imputations WHERE project_id = :pid",
        {"pid": payload["project_id"]}
    )
    for ads_id in ads_ids:
        ads = await get_ads(ads_id)
        if ads.status in ("draft", "submitted", "pending_initiator_review", "pending_project_review", "pending_compliance", "pending_validation"):
            await add_ads_warning(
                ads_id=ads_id,
                warning_type="project_closed",
                message=(
                    f"Le projet {payload['project_code']} associé à cette AdS "
                    f"a été {payload['new_status']}. "
                    f"Vérifier la pertinence de la demande."
                )
            )
        # AdS approved/in_progress → journalisation uniquement, pas de blocage
        await audit_log.record(
            entity_type="ads", entity_id=ads_id,
            action="warning_added",
            new_values={"warning": "project_closed"},
            source_event="project.status_changed",
            source_module="projets",
            source_entity_id=payload["project_id"]
        )
```

### 2.3 Événement : project.schedule_updated

```python
# Payload complet
{
    "event_name": "project.schedule_updated",
    "payload": {
        "project_id": "uuid",
        "project_code": "CAM-2026-047",
        "new_schedule_id": "uuid",
        "old_schedule_id": "uuid",
        "is_first_activation": False,
        "activated_by": "uuid",
        "entity_id": "uuid",
        "changed_tasks": [
            {
                "task_id": "uuid",
                "wbs_code": "1.2.1",
                "name": "Installation équipements",
                "asset_id": "uuid",
                "old_start": "2026-05-01",
                "old_end": "2026-05-15",
                "new_start": "2026-06-01",
                "new_end": "2026-06-15",
                "delta_days": 31,
                "pax_estimated": 8,
                "pax_unit": "per_day"
            }
        ],
        "added_tasks": [
            {"task_id": "uuid", "asset_id": "uuid", "name": "Nouvelle tâche",
             "new_start": "2026-06-20", "new_end": "2026-07-01", "pax_estimated": 3}
        ],
        "removed_tasks": [
            {"task_id": "uuid", "asset_id": "uuid", "name": "Tâche supprimée"}
        ]
    }
}

# Handler Planner
async def on_project_schedule_updated(self, event: dict) -> None:
    payload = event["payload"]
    for task in payload["changed_tasks"]:
        if not task.get("asset_id"):
            continue

        # Chercher l'activité Planner liée
        activity = await find_activity_by_project_task(
            project_id=payload["project_id"],
            asset_id=task["asset_id"],
            approximate_start=task["old_start"]
        )

        if activity and activity.status == "approved":
            # Calculer l'impact sans appliquer
            impact = await activity_service.get_impact_preview(
                activity.id,
                ActivityUpdate(start_date=task["new_start"], end_date=task["new_end"])
            )
            # Créer une suggestion de modification visible par DO et CHEF_PROJET
            await create_schedule_change_suggestion(
                activity_id=activity.id,
                suggested_start=task["new_start"],
                suggested_end=task["new_end"],
                reason=(
                    f"Planning projet mis à jour "
                    f"(version {payload['new_schedule_id'][:8]})"
                ),
                impact_summary=impact
            )
        elif not activity and task.get("asset_id"):
            # Créer une suggestion d'activité pour cette tâche
            await create_activity_suggestion(
                project_id=payload["project_id"],
                task_data=task,
                entity_id=payload["entity_id"]
            )
```

---

## 3. Flux 2 — Planner → PaxLog

### 3.1 Vérification disponibilité (synchrone — lors création AdS)

```python
# PaxLog → Planner : appel direct pendant remplissage formulaire AdS
GET /api/v1/planner/availability/{asset_id}?start_date={s}&end_date={e}&entity_id={eid}

# Réponse consommée par PaxLog :
# residual_capacity  → vérifier pax_count <= residual
# activities_on_period → liste pour choisir planner_activity_id
# is_overbooked      → alerte visuelle

# Règle : si visit_category_requires_planner=True et planner_activity_id absent → 400
```

### 3.2 Vérification quota à la validation (synchrone)

```python
# app/services/paxlog/ads_service.py
async def check_planner_quota(
    self, ads: AdS, pax_count_to_approve: int, db: AsyncSession
) -> tuple[bool, int]:
    """Appelé juste avant d'approuver. Retourne (within_quota, overflow_amount)."""
    if not ads.planner_activity_id:
        return True, 0

    activity = await planner_client.get_activity(ads.planner_activity_id)
    new_total = activity.pax_actual + pax_count_to_approve

    if new_total > activity.pax_quota:
        # Déclencher arbitrage DO
        await planner_client.escalate_to_arbitrage(
            activity_id=ads.planner_activity_id,
            overflow_amount=new_total - activity.pax_quota,
            ads_id=ads.id,
            ads_reference=ads.reference
        )
        return False, new_total - activity.pax_quota

    return True, 0

# Si overflow → ads.status = "pending_arbitration"
# DO notifié avec le détail
```

### 3.3 Événement : activity.approved

```python
# Payload
{
    "event_name": "activity.approved",
    "payload": {
        "activity_id": "uuid",
        "activity_title": "Installation E-LINE ESF1",
        "asset_id": "uuid",
        "project_id": "uuid",
        "start_date": "2026-05-01",
        "end_date": "2026-05-15",
        "pax_quota": 8,
        "approved_by": "uuid",
        "entity_id": "uuid"
    }
}

# Handler PaxLog
async def on_activity_approved(self, event: dict) -> None:
    payload = event["payload"]
    ads_list = await db.query(AdS).filter(
        AdS.entity_id == payload["entity_id"],
        AdS.planner_activity_id == payload["activity_id"],
        AdS.status.in_(["draft", "submitted", "pending_initiator_review", "pending_project_review", "pending_compliance"])
    ).all()

    for ads in ads_list:
        if ads.visit_category_requires_planner:
            await notification_service.send(
                user_id=ads.requester_id,
                title="Activité Planner approuvée",
                message=(
                    f"L'activité Planner '{payload['activity_title']}' "
                    f"associée à votre AdS {ads.reference} vient d'être approuvée. "
                    f"Votre demande peut maintenant progresser."
                ),
                link=f"/pax/ads/{ads.id}"
            )
```

### 3.4 Événement : activity.modified

```python
# Payload
{
    "event_name": "activity.modified",
    "payload": {
        "activity_id": "uuid",
        "activity_title": "Installation E-LINE ESF1",
        "asset_id": "uuid",
        "project_id": "uuid",
        "entity_id": "uuid",
        "changed_fields": ["start_date", "end_date"],
        "old_values": {"start_date": "2026-05-01", "end_date": "2026-05-15"},
        "new_values": {"start_date": "2026-06-01", "end_date": "2026-06-15"},
        "delta_days": 31,
        "notify_ads_requesters": True,
        "notify_travel_coordinators": True,
        "modifier_message": "Décalage suite retard livraison matériel",
        "modifier_id": "uuid"
    }
}

# Handler PaxLog
async def on_activity_modified(self, event: dict) -> None:
    payload = event["payload"]
    affected_ads = await db.query(AdS).filter(
        AdS.entity_id == payload["entity_id"],
        AdS.planner_activity_id == payload["activity_id"],
        AdS.status.notin_(["cancelled", "completed", "rejected"])
    ).all()

    for ads in affected_ads:
        old_status = ads.status
        ads.status = "requires_review"
        await db.flush()

        await audit_log.record(
            entity_type="ads", entity_id=ads.id,
            action="status_changed",
            old_values={"status": old_status},
            new_values={"status": "requires_review"},
            source_event="activity.modified",
            source_module="planner",
            source_entity_id=payload["activity_id"]
        )

        if payload["notify_ads_requesters"]:
            await notification_service.send(
                user_id=ads.requester_id,
                title="Votre AdS requiert une révision",
                message=(
                    f"L'activité Planner associée à {ads.reference} a été modifiée. "
                    f"{payload['modifier_message']}. "
                    f"Veuillez vérifier et resoumettre si nécessaire."
                ),
                link=f"/pax/ads/{ads.id}"
            )
    await db.commit()

# Handler TravelWiz (en parallèle)
async def on_activity_modified_tw(self, event: dict) -> None:
    payload = event["payload"]
    # Remonter la chaîne : Activity → AdS → AdSPax → PaxManifestEntry → PaxManifest
    affected_manifests = await db.execute(text("""
        SELECT DISTINCT pm.id, pm.reference, t.departure_datetime
        FROM pax_manifests pm
        JOIN trips t ON t.id = pm.trip_id
        JOIN pax_manifest_entries pme ON pme.manifest_id = pm.id
        JOIN ads_pax ap ON ap.id = pme.ads_pax_id
        JOIN ads a ON a.id = ap.ads_id
        WHERE a.planner_activity_id = :act_id
          AND a.entity_id = :eid
          AND pm.status NOT IN ('cancelled', 'closed')
    """), {"act_id": payload["activity_id"], "eid": payload["entity_id"]})

    for row in affected_manifests:
        await update_manifest_status(row["id"], "requires_review")
        if payload["notify_travel_coordinators"]:
            await notify_log_coord(
                entity_id=payload["entity_id"],
                message=(
                    f"Manifeste {row['reference']} impacté par modification Planner. "
                    f"Activité: {payload['activity_title']}. "
                    f"Décalage: +{payload.get('delta_days', '?')} jours."
                ),
                link=f"/travelwiz/manifests/{row['id']}",
                action_required=True
            )
```

### 3.5 Événement : activity.cancelled

```python
# Payload
{
    "event_name": "activity.cancelled",
    "payload": {
        "activity_id": "uuid",
        "activity_title": "Installation E-LINE ESF1",
        "asset_id": "uuid",
        "reason": "Projet suspendu",
        "cancelled_by": "uuid",
        "entity_id": "uuid"
    }
}

# Handler PaxLog — même logique que modified
async def on_activity_cancelled(self, event: dict) -> None:
    payload = event["payload"]
    affected_ads = await db.query(AdS).filter(
        AdS.entity_id == payload["entity_id"],
        AdS.planner_activity_id == payload["activity_id"],
        AdS.status.notin_(["cancelled", "completed", "rejected"])
    ).all()

    for ads in affected_ads:
        ads.status = "requires_review"
        await notification_service.send(
            user_id=ads.requester_id,
            title="Activité Planner annulée",
            message=(
                f"L'activité Planner associée à {ads.reference} a été annulée : "
                f"{payload['reason']}. Confirmez ou annulez votre demande."
            ),
            action_required=True,
            link=f"/pax/ads/{ads.id}"
        )
    await db.commit()
```

---

## 4. Flux 3 — PaxLog → TravelWiz

### 4.1 Événement : ads.approved

```python
# Payload complet
{
    "event_name": "ads.approved",
    "payload": {
        "ads_id": "uuid",
        "ads_reference": "ADS-2026-04521",
        "entity_id": "uuid",
        "site_entry_asset_id": "uuid",
        "site_entry_asset_name": "ESF1",
        "start_date": "2026-05-10",
        "end_date": "2026-05-20",
        "outbound_transport_mode": "helicopter",    # null si pas de préférence
        "outbound_departure_base_id": "uuid-wouri-base",
        "outbound_notes": "Hélico de préférence, départ Wouri base 07h",
        "return_transport_mode": "boat",             # peut être différent de l'aller
        "return_departure_base_id": "uuid-munja",    # pré-rempli avec le site AdS
        "return_notes": null,
        "planner_activity_id": "uuid",
        "visit_category": "project_work",
        "pax_list": [
            {
                "ads_pax_id": "uuid",
                "pax_id": "uuid",
                "pax_name": "Jean DUPONT",
                "pax_company": "PERENCO",
                "pax_type": "internal",
                "weight_kg": None,
                "priority_score": 52,
                "priority_source": "project_work+high"
            }
        ]
    }
}

# Handler TravelWiz
async def on_ads_approved(self, event: dict) -> None:
    payload = event["payload"]

    # Chercher un Trip compatible (même destination, départ dans la fenêtre)
    existing_trip = await db.query(Trip).filter(
        Trip.entity_id == payload["entity_id"],
        Trip.destination_asset_id == payload["site_entry_asset_id"],
        Trip.status.in_(["planned", "confirmed"]),
        Trip.departure_datetime >= payload["start_date"],
        Trip.departure_datetime <= payload["end_date"]
    ).first()

    if existing_trip:
        manifest = await get_or_create_pax_manifest(existing_trip.id, payload["entity_id"])
        pax_status = "standby" if manifest.status == "validated" else "confirmed"
        for pax in payload["pax_list"]:
            await add_pax_to_manifest(
                manifest_id=manifest.id,
                ads_pax_id=pax["ads_pax_id"],
                pax_id=pax["pax_id"],
                status=pax_status,
                priority_score=pax["priority_score"],
                priority_source=pax["priority_source"]
            )
        if pax_status == "standby":
            await notify_log_coord(
                entity_id=payload["entity_id"],
                message=(
                    f"{len(payload['pax_list'])} PAX en standby — manifeste "
                    f"{manifest.reference} déjà validé. Action requise."
                ),
                link=f"/travelwiz/manifests/{manifest.id}"
            )
    else:
        # Créer Trip planned + PaxManifest draft
        trip = await create_trip(
            entity_id=payload["entity_id"],
            destination_asset_id=payload["site_entry_asset_id"],
            origin_asset_id=payload.get("outbound_departure_base_id"),
            departure_datetime=None,  # à compléter par le coordinateur
            status="planned",
            preferred_vehicle_type=payload.get("outbound_transport_mode"),
            notes=payload.get("outbound_notes")
        )
        manifest = await create_pax_manifest(
            trip_id=trip.id,
            entity_id=payload["entity_id"],
            generated_from_ads=True
        )
        for pax in payload["pax_list"]:
            await add_pax_to_manifest(
                manifest_id=manifest.id,
                ads_pax_id=pax["ads_pax_id"],
                pax_id=pax["pax_id"],
                status="confirmed",
                priority_score=pax["priority_score"],
                priority_source=pax["priority_source"]
            )

    # Notifier coordinateur logistique dans tous les cas
    # Inclure les préférences transport structurées (aller ET retour si spécifiés)
    transport_hint = ""
    if payload.get("outbound_transport_mode"):
        transport_hint += f" | Aller: {payload['outbound_transport_mode']}"
    if payload.get("return_transport_mode"):
        transport_hint += f" | Retour: {payload['return_transport_mode']}"

    await notify_log_coord(
        entity_id=payload["entity_id"],
        message=(
            f"{len(payload['pax_list'])} PAX ajouté(s) → {payload['site_entry_asset_name']} "
            f"({payload['start_date']} / {payload['end_date']}). "
            f"AdS: {payload['ads_reference']}."
            + transport_hint
        ),
        link=f"/travelwiz/manifests/{manifest.id}"
    )
    await db.commit()
```

### 4.2 Événement : ads_pax.unblocked

```python
# Payload
{
    "event_name": "ads_pax.unblocked",
    "payload": {
        "ads_pax_id": "uuid",
        "pax_id": "uuid",
        "pax_name": "Marie FOTSO",
        "ads_id": "uuid",
        "ads_reference": "ADS-2026-04521",
        "site_entry_asset_id": "uuid",
        "start_date": "2026-05-10",
        "priority_score": 30,
        "entity_id": "uuid"
    }
}

# Handler TravelWiz
async def on_ads_pax_unblocked(self, event: dict) -> None:
    payload = event["payload"]
    manifest = await find_manifest_by_ads(payload["ads_id"])
    if manifest:
        existing = await get_manifest_entry(manifest.id, payload["pax_id"])
        if not existing:
            await add_pax_to_manifest(
                manifest_id=manifest.id,
                ads_pax_id=payload["ads_pax_id"],
                pax_id=payload["pax_id"],
                status="confirmed",
                priority_score=payload["priority_score"]
            )
            await notify_log_coord(
                entity_id=payload["entity_id"],
                message=(
                    f"{payload['pax_name']} ajouté au manifeste "
                    f"{manifest.reference} (prérequis HSE complétés)."
                )
            )
            await db.commit()
```

### 4.3 Événement : ads.cancelled / ads.rejected

```python
# Payload
{
    "event_name": "ads.cancelled",  # ou ads.rejected
    "payload": {
        "ads_id": "uuid",
        "ads_reference": "ADS-2026-04521",
        "ads_pax_ids": ["uuid1", "uuid2"],
        "reason": "Annulation par le demandeur",
        "entity_id": "uuid"
    }
}

# Handler TravelWiz
async def on_ads_cancelled_or_rejected(self, event: dict) -> None:
    payload = event["payload"]
    affected_manifests = set()

    for ads_pax_id in payload["ads_pax_ids"]:
        entries = await db.query(PaxManifestEntry).filter(
            PaxManifestEntry.ads_pax_id == ads_pax_id,
            PaxManifestEntry.status.notin_(["cancelled", "no_show"])
        ).all()
        for entry in entries:
            entry.status = "cancelled"
            affected_manifests.add(entry.manifest_id)

    for manifest_id in affected_manifests:
        await recalculate_manifest_capacity(manifest_id)
        manifest = await get_manifest(manifest_id)
        await notify_log_coord(
            entity_id=payload["entity_id"],
            message=(
                f"AdS {payload['ads_reference']} annulée — "
                f"PAX retirés du manifeste {manifest.reference}."
            )
        )
    await db.commit()
```

### 4.4 Événement : stay_program.approved (Phase 2 — surfeur)

```python
# Payload
{
    "event_name": "stay_program.approved",
    "payload": {
        "stay_program_id": "uuid",
        "pax_id": "uuid",
        "pax_name": "Jean DUPONT",
        "ads_id": "uuid",
        "entity_id": "uuid",
        "current_asset_id": "uuid",
        "movements": [
            {
                "asset_id": "uuid",
                "asset_name": "KLF-3",
                "date": "2026-05-12",
                "purpose": "Inspection puits KLF-3-A",
                "compliance_ok": True
            }
        ]
    }
}

# Handler TravelWiz
async def on_stay_program_approved(self, event: dict) -> None:
    payload = event["payload"]
    for movement in payload["movements"]:
        surfer = await find_surfer_for_field(
            origin_asset_id=payload["current_asset_id"],
            destination_asset_id=movement["asset_id"],
            travel_date=movement["date"],
            entity_id=payload["entity_id"]
        )
        if surfer:
            trip = await get_or_create_intrafield_trip(
                vehicle_id=surfer.id,
                origin_asset_id=payload["current_asset_id"],
                destination_asset_id=movement["asset_id"],
                travel_date=movement["date"],
                entity_id=payload["entity_id"]
            )
            await add_pax_to_manifest(
                manifest_id=trip.pax_manifest_id,
                pax_id=payload["pax_id"],
                status="confirmed",
                notes=movement["purpose"]
            )
    await notify_log_coord_onsite(
        entity_id=payload["entity_id"],
        message=(
            f"Programme séjour approuvé pour {payload['pax_name']} — "
            f"{len(payload['movements'])} déplacements intra-champ à planifier."
        )
    )
    await db.commit()
```

---

## 5. Flux 4 — TravelWiz → PaxLog

### 5.1 Événement : pax_manifest.closed

**Deux cas selon la direction du manifeste :**
- `direction = "outbound"` : manifeste aller (PAX arrivent sur site) → PaxLog passe les AdS en `in_progress`
- `direction = "inbound"` : manifeste retour (PAX quittent le site) → **TravelWiz clôture les AdS** en `completed`

```python
# Payload (outbound — arrivée sur site)
{
    "event_name": "pax_manifest.closed",
    "payload": {
        "manifest_id": "uuid",
        "manifest_reference": "MAN-PAX-2026-03412",
        "direction": "outbound",           # ← nouveau champ clé
        "trip_id": "uuid",
        "trip_reference": "TRIP-2026-03412",
        "origin_asset_id": "uuid",
        "origin_asset_name": "Wouri Base",
        "destination_asset_id": "uuid",
        "destination_asset_name": "ESF1",
        "arrival_actual": "2026-05-10T14:32:00Z",
        "entity_id": "uuid",
        "boarded_pax": [
            {"ads_pax_id": "uuid", "pax_id": "uuid", "pax_name": "Jean DUPONT",
             "disembark_asset_id": "uuid", "disembark_date": "2026-05-10"}
        ],
        "no_show_pax": [
            {"ads_pax_id": "uuid", "pax_id": "uuid", "pax_name": "Paul MBALLA",
             "reason": "Absent au départ sans justification"}
        ]
    }
}

# Payload (inbound — départ du site, clôture AdS)
{
    "event_name": "pax_manifest.closed",
    "payload": {
        "manifest_id": "uuid",
        "manifest_reference": "MAN-PAX-2026-03445",
        "direction": "inbound",            # ← manifeste retour
        "trip_id": "uuid",
        "trip_reference": "TRIP-2026-03445",
        "origin_asset_id": "uuid",         # le site d'où ils partent (Munja)
        "origin_asset_name": "Munja",
        "destination_asset_id": "uuid",
        "destination_asset_name": "Wouri Base",
        "departure_actual": "2026-05-20T16:00:00Z",  # heure de départ réelle
        "entity_id": "uuid",
        "boarded_pax": [
            {"ads_pax_id": "uuid", "pax_id": "uuid", "pax_name": "Jean DUPONT",
             "disembark_date": "2026-05-20"}
        ],
        "no_show_pax": [
            {"ads_pax_id": "uuid", "pax_id": "uuid", "pax_name": "Marie FOTSO",
             "reason": "Non présente au départ — peut-être encore sur site"}
        ]
    }
}

# Handler PaxLog
async def on_pax_manifest_closed(self, event: dict) -> None:
    """
    Traite la clôture d'un manifeste PAX TravelWiz.

    Deux cas selon la direction du manifeste :
    - outbound (vers le site)  : PAX boarded → AdS in_progress
    - inbound  (retour du site): PAX boarded → AdS completed ← TravelWiz clôture l'AdS
    """
    payload = event["payload"]
    direction = payload.get("direction", "outbound")  # défaut outbound si absent

    # --- PAX embarqués ---
    for pax_entry in payload["boarded_pax"]:
        ads_pax = await get_ads_pax_by_id(pax_entry["ads_pax_id"])
        if not ads_pax:
            continue

        ads = await get_ads(ads_pax.ads_id)

        if direction == "outbound":
            # Manifeste aller : PAX arrive sur site → AdS in_progress
            ads_pax.current_onboard = True
            if pax_entry.get("disembark_asset_id"):
                ads_pax.disembark_asset_id = pax_entry["disembark_asset_id"]
            if ads.status == "approved":
                ads.status = "in_progress"
                await audit_log.record(
                    entity_type="ads", entity_id=ads.id,
                    action="status_changed",
                    old_values={"status": "approved"},
                    new_values={"status": "in_progress"},
                    source_event="pax_manifest.closed",
                    source_module="travelwiz",
                    notes=f"Embarquement confirmé — manifeste {payload['manifest_reference']}"
                )

        elif direction == "inbound":
            # Manifeste retour : PAX quitte le site → AdS completed
            # TravelWiz est la source de vérité pour la clôture
            ads_pax.current_onboard = False
            ads_pax.departed_at = payload.get("departure_actual") or datetime.utcnow()
            ads_pax.departed_via_manifest_id = payload["manifest_id"]

            if ads.status in ("in_progress", "approved"):
                old_status = ads.status
                ads.status = "completed"
                ads.actual_end_date = pax_entry.get("disembark_date") or date.today()
                await audit_log.record(
                    entity_type="ads", entity_id=ads.id,
                    action="status_changed",
                    old_values={"status": old_status},
                    new_values={"status": "completed"},
                    source_event="pax_manifest.closed",
                    source_module="travelwiz",
                    notes=(
                        f"Départ site confirmé — manifeste retour "
                        f"{payload['manifest_reference']}"
                    )
                )

    # --- No-shows (valable pour outbound et inbound) ---
    for no_show in payload["no_show_pax"]:
        ads_pax = await get_ads_pax_by_id(no_show["ads_pax_id"])
        if not ads_pax:
            continue

        if direction == "outbound":
            # No-show aller = PAX n'est jamais monté
            ads_pax.status = "no_show"
            ads_pax.current_onboard = False
        elif direction == "inbound":
            # No-show retour = PAX prévu de partir mais pas sur le manifeste
            # Il est peut-être encore sur site — alerte à l'OMAA et au CDS
            ads_pax.missed_return_manifest = True
            await notification_service.send(
                roles=["OMAA", "CDS"],
                asset_id=payload.get("origin_asset_id"),
                message=(
                    f"⚠ {no_show['pax_name']} non présent au manifeste retour "
                    f"{payload['manifest_reference']}. Toujours sur site ?"
                )
            )

        await audit_log.record(
            entity_type="ads_pax", entity_id=ads_pax.id,
            action="no_show",
            new_values={
                "direction": direction,
                "reason": no_show.get("reason"),
                "manifest_reference": payload["manifest_reference"]
            },
            source_event="pax_manifest.closed",
            source_module="travelwiz"
        )
        await notification_service.send_to_manager(
            pax_id=no_show["pax_id"],
            message=(
                f"{no_show['pax_name']} absent au manifeste "
                f"{'aller' if direction == 'outbound' else 'retour'} "
                f"{payload['manifest_reference']}."
            )
        )

    await db.commit()
```

### 5.2 Événement : trip.closed

```python
# Payload
{
    "event_name": "trip.closed",
    "payload": {
        "trip_id": "uuid",
        "trip_reference": "TRIP-2026-03412",
        "entity_id": "uuid"
    }
}

# Handler TravelWiz interne
async def on_trip_closed(self, event: dict) -> None:
    await kpi_service.calculate_trip_kpis(event["payload"]["trip_id"])
```

---

## 6. Flux 5 — Intranet → OpsFlux

### 6.1 Batch de synchronisation

```python
# app/services/intranet/sync_service.py
# Cron : 0 */4 * * *  (toutes les 4h, configurable)

async def sync_employees(config: IntranetSyncConfig) -> SyncResult:
    employees = await fetch_employees(config)  # api/ldap/csv selon config.mode
    result = SyncResult()

    for emp in employees:
        mapped = map_fields(emp, config.api_field_mapping or config.ldap_field_mapping)
        existing = await find_user_by_intranet_id(mapped["intranet_id"])

        if existing:
            changes = {k: v for k, v in mapped.items()
                       if getattr(existing, k, None) != v}
            if changes:
                await update_user(existing.id, changes)
                await update_pax_profile_internal(existing.id, changes)
                result.updated += 1
        else:
            user = await create_user_from_intranet(mapped)
            await create_pax_profile(
                entity_id=config.entity_id,
                user_id=user.id,
                data=mapped,
                type="internal"
            )
            result.created += 1

    # Désactiver les absents depuis N cycles
    deactivated = await deactivate_missing_employees(
        known_intranet_ids=[e.get("intranet_id") for e in employees],
        entity_id=config.entity_id
    )
    for user_id, pax_id in deactivated:
        await event_bus.emit(
            "intranet.employee_deactivated",
            {
                "user_id": str(user_id),
                "pax_id": str(pax_id),
                "pax_name": await get_pax_name(pax_id),
                "entity_id": str(config.entity_id)
            },
            db
        )
        result.deactivated += 1

    await log_sync(config.id, result)
    return result
```

### 6.2 Événement : intranet.employee_deactivated

```python
# Payload
{
    "event_name": "intranet.employee_deactivated",
    "payload": {
        "user_id": "uuid",
        "pax_id": "uuid",
        "pax_name": "Jean DUPONT",
        "entity_id": "uuid"
    }
}

# Handler PaxLog
async def on_employee_deactivated(self, event: dict) -> None:
    payload = event["payload"]
    active_ads_pax = await db.query(AdSPax).filter(
        AdSPax.pax_id == payload["pax_id"],
        AdSPax.status.notin_(["rejected", "no_show", "cancelled"])
    ).all()

    for ads_pax in active_ads_pax:
        ads = await get_ads(ads_pax.ads_id)
        if ads.entity_id == payload["entity_id"] and \
                ads.status not in ("cancelled", "completed", "rejected"):
            old_status = ads.status
            ads.status = "requires_review"
            await audit_log.record(
                entity_type="ads", entity_id=ads.id,
                action="status_changed",
                old_values={"status": old_status},
                new_values={"status": "requires_review"},
                source_event="intranet.employee_deactivated",
                source_module="intranet"
            )
            await notify_validator(
                ads_id=ads.id,
                entity_id=payload["entity_id"],
                message=(
                    f"{payload['pax_name']} désactivé RH. "
                    f"AdS {ads.reference} à réviser."
                )
            )
    await db.commit()

# Handler TravelWiz
async def on_employee_deactivated_tw(self, event: dict) -> None:
    payload = event["payload"]
    entries = await db.query(PaxManifestEntry).join(PaxManifest).join(Trip).filter(
        PaxManifestEntry.pax_id == payload["pax_id"],
        PaxManifestEntry.status == "confirmed",
        PaxManifest.status.notin_(["closed", "cancelled"])
    ).all()

    for entry in entries:
        entry.standby_reason = f"PAX désactivé RH: {payload['pax_name']}"
        entry.status = "standby"
        manifest = await get_manifest(entry.manifest_id)
        await notify_log_coord(
            entity_id=payload["entity_id"],
            message=(
                f"{payload['pax_name']} désactivé RH — "
                f"présent dans manifeste {manifest.reference}. Action requise."
            )
        )
    await db.commit()
```

---

## 7. Flux 6 — IoT → TravelWiz → Clients SSE

### 7.1 Réception de position GPS

```python
# POST /api/v1/iot/vehicle-position
# Auth: clé API device via header X-Device-API-Key (pas de JWT)

class VehiclePositionPayload(BaseModel):
    vehicle_external_id: str | None = None  # alternative à vehicle_id
    timestamp:           datetime
    latitude:            float = Field(..., ge=-90, le=90)
    longitude:           float = Field(..., ge=-180, le=180)
    speed_knots:         float | None = None
    heading_deg:         float | None = None
    altitude_m:          float | None = None
    status:              str | None = None
    # underway|anchored|moored|drifting|on_deck
    fuel_level_pct:      int | None = Field(None, ge=0, le=100)
    custom_data:         dict | None = None

async def receive_vehicle_position(
    payload: VehiclePositionPayload,
    api_key: str = Header(..., alias="X-Device-API-Key"),
    db: AsyncSession = Depends(get_db)
) -> dict:
    # 1. Valider la clé API
    device = await validate_device_key(api_key, db)
    if not device:
        raise HTTPException(401, "Clé API device invalide")

    # 2. Détecter le trip actif
    active_trip = await find_active_trip_for_vehicle(device.vehicle_id, db)

    # 3. Insérer position (append-only, partitionné par semaine)
    await db.execute(insert(VehiclePosition).values(
        vehicle_id=device.vehicle_id,
        device_id=device.device_id,
        recorded_at=payload.timestamp,
        received_at=datetime.utcnow(),
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_knots=payload.speed_knots,
        heading_deg=payload.heading_deg,
        altitude_m=payload.altitude_m,
        status=payload.status,
        fuel_level_pct=payload.fuel_level_pct,
        trip_id=active_trip.id if active_trip else None,
        custom_data=payload.custom_data
    ))

    # 4. Mettre à jour cache Redis (TTL 24h)
    position_cache = {
        "lat": payload.latitude, "lon": payload.longitude,
        "speed": payload.speed_knots, "heading": payload.heading_deg,
        "status": payload.status, "fuel": payload.fuel_level_pct,
        "updated_at": datetime.utcnow().isoformat(),
        "stale": False
    }
    await redis.setex(
        f"vehicle:position:{device.vehicle_id}",
        86400,
        json.dumps(position_cache)
    )

    # 5. Broadcast SSE aux clients connectés
    await sse_manager.broadcast(
        channel=f"vehicle:{device.vehicle_id}",
        data={
            "vehicle_id": str(device.vehicle_id),
            "lat": payload.latitude, "lon": payload.longitude,
            "speed": payload.speed_knots, "heading": payload.heading_deg,
            "status": payload.status,
            "ts": payload.timestamp.isoformat(),
            "trip_id": str(active_trip.id) if active_trip else None
        }
    )

    # 6. Anomalie detection (vitesse anormale, zone interdite, etc.)
    await anomaly_detector.check_vehicle_position(device.vehicle_id, payload)

    # 7. Mettre à jour last_seen_at du device
    device.last_seen_at = datetime.utcnow()
    await db.commit()
    return {"received": True, "vehicle_id": str(device.vehicle_id)}
```

### 7.2 Endpoint SSE pour clients web

```python
# GET /api/v1/iot/stream?vehicle_ids=uuid1,uuid2
# Accept: text/event-stream

async def stream_vehicle_positions(
    vehicle_ids: str,
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    ids = [UUID(v) for v in vehicle_ids.split(",")]

    async def event_generator():
        # 1. Envoyer les positions actuelles depuis Redis
        for vid in ids:
            cached = await redis.get(f"vehicle:position:{vid}")
            if cached:
                data = json.loads(cached)
                data["vehicle_id"] = str(vid)
                yield f"data: {json.dumps(data)}\n\n"

        # 2. S'abonner aux mises à jour temps réel
        async with sse_manager.subscribe(
            channels=[f"vehicle:{vid}" for vid in ids]
        ) as subscription:
            # Heartbeat toutes les 30s pour maintenir la connexion
            heartbeat_interval = int(settings.IOT_STREAM_HEARTBEAT_SECONDS)
            async for message in subscription.with_heartbeat(heartbeat_interval):
                if message is None:
                    yield ": heartbeat\n\n"
                else:
                    yield f"data: {json.dumps(message)}\n\n"

    return EventSourceResponse(event_generator())
```

### 7.3 Détection signal stale

```python
# app/services/travelwiz/iot_monitor.py
# Exécuté toutes les 5 minutes par un background task FastAPI

async def check_stale_signals(db: AsyncSession) -> None:
    stale_minutes = int(settings.IOT_POSITION_STALE_MINUTES)  # défaut: 15

    vehicles = await db.execute(text("""
        SELECT v.id, v.name,
               MAX(vp.recorded_at) as last_signal,
               t.id as active_trip_id, t.reference as trip_ref,
               v.entity_id
        FROM vehicles v
        LEFT JOIN vehicle_positions vp ON vp.vehicle_id = v.id
        LEFT JOIN trips t ON t.vehicle_id = v.id AND t.status = 'departed'
        WHERE v.active = TRUE
        GROUP BY v.id, v.name, t.id, t.reference, v.entity_id
        HAVING MAX(vp.recorded_at) < NOW() - :threshold
            OR MAX(vp.recorded_at) IS NULL
    """), {"threshold": f"{stale_minutes} minutes"})

    for vehicle in vehicles:
        # Marquer stale dans Redis
        cached = await redis.get(f"vehicle:position:{vehicle.id}")
        if cached:
            data = json.loads(cached)
            if not data.get("stale"):
                data["stale"] = True
                data["stale_since"] = datetime.utcnow().isoformat()
                await redis.setex(f"vehicle:position:{vehicle.id}", 86400,
                                  json.dumps(data))

        # Si en voyage → émettre événement et notifier
        if vehicle.active_trip_id:
            await event_bus.emit(
                "vehicle.signal_lost",
                {
                    "vehicle_id": str(vehicle.id),
                    "vehicle_name": vehicle.name,
                    "trip_id": str(vehicle.active_trip_id),
                    "trip_reference": vehicle.trip_ref,
                    "last_signal": (vehicle.last_signal.isoformat()
                                    if vehicle.last_signal else None),
                    "entity_id": str(vehicle.entity_id)
                },
                db
            )
```

---

## 8. Flux 7 — PaxLog → PaxLog (rotations automatiques)

```python
# app/services/paxlog/rotation_service.py
# Cron : 0 6 * * *  (6h00 chaque jour)

async def process_rotation_cycles(db: AsyncSession) -> dict:
    result = {"created": 0, "skipped": 0, "errors": []}
    today = date.today()

    active_cycles = await db.query(PaxRotationCycle).filter(
        PaxRotationCycle.status == "active",
        PaxRotationCycle.auto_create_ads == True
    ).all()

    for cycle in active_cycles:
        try:
            next_on = compute_next_on_period(cycle, today)
            if not next_on:
                continue

            days_until = (next_on.start - today).days
            if days_until > cycle.ads_lead_days:
                result["skipped"] += 1
                continue

            # Vérifier qu'aucune AdS active n'existe déjà
            existing = await db.query(AdS).join(AdSPax).filter(
                AdSPax.pax_id == cycle.pax_id,
                AdS.site_entry_asset_id == cycle.site_asset_id,
                AdS.start_date <= next_on.end,
                AdS.end_date >= next_on.start,
                AdS.entity_id == cycle.entity_id,
                AdS.status.notin_(["cancelled", "rejected"])
            ).first()

            if existing:
                result["skipped"] += 1
                continue

            # Construire l'AdS
            needs_completion = not (cycle.default_project_id and cycle.default_cc_id)
            imputations = []
            if not needs_completion:
                imputations = [ImputationLine(
                    project_id=cycle.default_project_id,
                    cost_center_id=cycle.default_cc_id,
                    percentage=100.0
                )]

            ads_data = AdSCreate(
                entity_id=cycle.entity_id,
                type="individual",
                pax_ids=[cycle.pax_id],
                site_entry_asset_id=cycle.site_asset_id,
                visit_purpose=(
                    f"Rotation automatique — "
                    f"{next_on.start.strftime('%d/%m/%Y')} au {next_on.end.strftime('%d/%m/%Y')}"
                ),
                visit_category="permanent_ops",
                start_date=next_on.start,
                end_date=next_on.end,
                imputations=imputations
            )

            ads = await ads_service.create_ads(
                data=ads_data, actor=SYSTEM_USER, db=db
            )

            await event_bus.emit(
                "rotation.ads_auto_created",
                {
                    "cycle_id": str(cycle.id),
                    "pax_id": str(cycle.pax_id),
                    "pax_name": await get_pax_name(cycle.pax_id, db),
                    "ads_id": str(ads.id),
                    "ads_reference": ads.reference,
                    "period_start": next_on.start.isoformat(),
                    "period_end": next_on.end.isoformat(),
                    "needs_completion": needs_completion,
                    "entity_id": str(cycle.entity_id)
                },
                db
            )

            # Notifier le PAX
            pax = await get_pax_profile(cycle.pax_id, db)
            if pax.user_id:
                await notification_service.send(
                    user_id=pax.user_id,
                    title="Demande de séjour automatique créée",
                    message=(
                        f"Votre AdS de rotation {next_on.start} → {next_on.end} "
                        f"a été pré-créée. "
                        + ("Complétez les informations manquantes et soumettez."
                           if needs_completion
                           else "Vérifiez et soumettez.")
                    ),
                    link=f"/pax/ads/{ads.id}"
                )

            result["created"] += 1

        except Exception as e:
            result["errors"].append({"cycle_id": str(cycle.id), "error": str(e)})
            logger.error(f"Erreur cycle rotation {cycle.id}: {e}", exc_info=True)

    return result

def compute_next_on_period(
    cycle: PaxRotationCycle, from_date: date
) -> RotationPeriod | None:
    """
    Calcule la prochaine période 'on' à partir de from_date.
    Algorithme:
      cycle_length = days_on + days_off
      days_since_start = (from_date - cycle_start_date).days
      position_in_cycle = days_since_start % cycle_length
      is_currently_on = position_in_cycle < days_on
      Si on → retourner la période courante
      Si off → calculer le début de la prochaine période on
    """
    cycle_length = cycle.rotation_days_on + cycle.rotation_days_off
    days_since = (from_date - cycle.cycle_start_date).days

    if days_since < 0:
        # Le cycle n'a pas encore commencé
        return RotationPeriod(
            start=cycle.cycle_start_date,
            end=cycle.cycle_start_date + timedelta(days=cycle.rotation_days_on - 1),
            is_on=True
        )

    pos = days_since % cycle_length

    if pos < cycle.rotation_days_on:
        # Actuellement en période ON
        period_start = from_date - timedelta(days=pos)
        period_end = period_start + timedelta(days=cycle.rotation_days_on - 1)
    else:
        # Actuellement en période OFF → calculer prochain ON
        days_until_next_on = cycle_length - pos
        period_start = from_date + timedelta(days=days_until_next_on)
        period_end = period_start + timedelta(days=cycle.rotation_days_on - 1)

    return RotationPeriod(start=period_start, end=period_end, is_on=True)
```

---

## 9. Tableau récapitulatif complet des événements

| Événement | Émetteur | Consommateurs | Section |
|---|---|---|---|
| `project.status_changed` | Projets | PaxLog | §2.2 |
| `project.schedule_updated` | Projets | Planner | §2.3 |
| `activity.approved` | Planner | PaxLog | §3.3 |
| `activity.modified` | Planner | PaxLog, TravelWiz | §3.4 |
| `activity.cancelled` | Planner | PaxLog, TravelWiz | §3.5 |
| `activity.created` | Planner | — | — |
| `conflict.created` | Planner | Notif DO | §3.2 |
| `conflict.resolved` | Planner | PaxLog, Projets notif | §3.2 |
| `ads.created` | PaxLog | — | — |
| `ads.submitted` | PaxLog | — | — |
| `ads.approved` | PaxLog | TravelWiz | §4.1 |
| `ads_pax.unblocked` | PaxLog | TravelWiz | §4.2 |
| `ads.cancelled` | PaxLog | TravelWiz | §4.3 |
| `ads.rejected` | PaxLog | TravelWiz | §4.3 |
| `stay_program.approved` | PaxLog | TravelWiz | §4.4 |
| `rotation.ads_auto_created` | PaxLog batch | PaxLog notif | §8 |
| `pax_manifest.closed` | TravelWiz | PaxLog | §5.1 |
| `trip.closed` | TravelWiz | TravelWiz KPIs | §5.2 |
| `vehicle.signal_lost` | TravelWiz IoT | TravelWiz notif | §7.3 |
| `intranet.employee_deactivated` | SyncService | PaxLog, TravelWiz | §6.2 |

---

## 10. Règles de cohérence transverses

### RC-01 — Pas de DELETE physique
```python
# JAMAIS : await db.delete(entity)
# TOUJOURS : entity.archived = True ; entity.status = "cancelled"
```

### RC-02 — Audit log sur tout changement inter-modules
```python
await audit_log.record(
    entity_type="ads",
    entity_id=ads.id,
    action="status_changed",
    old_values={"status": old_status},
    new_values={"status": "requires_review"},
    source_event="activity.modified",
    source_module="planner",
    source_entity_id=payload["activity_id"]
)
```

### RC-03 — Isolation par entity_id
```python
# Tout handler inter-modules filtre TOUJOURS par entity_id
# Un événement d'une entité A ne déclenche jamais d'actions sur l'entité B
AdS.entity_id == payload["entity_id"]  # OBLIGATOIRE dans chaque requête
```

### RC-04 — Idempotence des handlers
```python
# Utiliser event_id + handler_name pour détecter les doublons
# Voir §1.3 pour l'implémentation complète
```

### RC-05 — Unicité des références lisibles
```sql
-- Génération atomique via LOCK + INSERT ON CONFLICT
-- Format: {PREFIX}-{YYYY}-{NNNNN}
-- Préfixes: ADS, TRIP, MAN-PAX, MAN-CGO, CGO, CYCLE
CREATE TABLE reference_sequences (
    prefix      VARCHAR(20) NOT NULL,
    year        SMALLINT NOT NULL,
    last_value  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (prefix, year)
);
```

### RC-06 — Cohérence des dates cross-modules
- `AdS.start_date` ≥ `aujourd'hui + délai_préavis` (configurable, défaut 24h)
- `Trip.departure_datetime` doit être dans la fenêtre `[AdS.start_date, AdS.end_date]`
- `Activity.start_date ≤ AdS.start_date` et `Activity.end_date ≥ AdS.end_date`

---

## 9. Événements manquants — Addendum

Trois événements inter-modules absents de la table de référence initiale
et de leurs handlers respectifs.

---

### 9.1 Événement : ads.completed

Émis par PaxLog quand une AdS passe en `completed` (départ confirmé via
manifeste retour TravelWiz, OMAA, ou batch).

**Consommateur : Planner** — libération du quota PAX sur l'activité associée.

```python
# Payload
{
    "event_name": "ads.completed",
    "payload": {
        "ads_id": "uuid",
        "ads_reference": "ADS-2026-04521",
        "planner_activity_id": "uuid",  # null si AdS non liée à une activité
        "pax_count_completed": 4,       # PAX ayant effectivement séjourné
        "pax_no_show_count": 1,         # PAX jamais arrivés
        "actual_end_date": "2026-05-22",
        "entity_id": "uuid"
    }
}

# Handler Planner — on_ads_completed
async def on_ads_completed(self, event: dict) -> None:
    """
    Libère le quota PAX consommé par cette AdS sur l'activité Planner.
    Permet à d'autres AdS d'utiliser la capacité résiduelle libérée.
    """
    payload = event["payload"]

    if not payload.get("planner_activity_id"):
        return  # AdS non liée à une activité Planner → rien à faire

    activity = await db.get(Activity, payload["planner_activity_id"])
    if not activity:
        return

    # Décrémenter pax_actual de l'activité
    pax_completed = payload["pax_count_completed"]
    activity.pax_actual = max(0, (activity.pax_actual or 0) - pax_completed)

    await db.commit()
    await audit_log.record(
        entity_type="activity", entity_id=activity.id,
        action="pax_actual_updated",
        new_values={"pax_actual": activity.pax_actual,
                    "reason": f"AdS {payload['ads_reference']} clôturée"},
        source_event="ads.completed",
        source_module="paxlog"
    )
```

---

### 9.2 Événement : cargo_manifest.closed

Émis par TravelWiz quand un manifeste cargo est clôturé (après le déchargement
physique sur le site de destination).

**Consommateur : TravelWiz interne** — mise à jour des statuts des colis.

```python
# Payload
{
    "event_name": "cargo_manifest.closed",
    "payload": {
        "manifest_id": "uuid",
        "manifest_reference": "MAN-CGO-2026-01832",
        "trip_id": "uuid",
        "direction": "outbound",       # outbound | inbound (retour)
        "destination_asset_id": "uuid",
        "closed_at": "2026-09-14T17:30:00Z",
        "entity_id": "uuid",
        "entries": [
            {
                "cargo_item_id": "uuid",
                "status": "unloaded",          # unloaded | missing
                "quantity_received": 340.0,    # null si unloaded sans écart
                "has_anomaly": false
            },
            {
                "cargo_item_id": "uuid",
                "status": "missing",
                "has_anomaly": true,
                "anomaly_notes": "Non retrouvé au déchargement"
            }
        ]
    }
}

# Handler TravelWiz interne — on_cargo_manifest_closed
async def on_cargo_manifest_closed(self, event: dict) -> None:
    """
    Met à jour le statut des colis selon les résultats du déchargement.
    """
    payload = event["payload"]
    direction = payload["direction"]

    for entry in payload["entries"]:
        item = await db.get(CargoItem, entry["cargo_item_id"])
        if not item:
            continue

        if entry["status"] == "unloaded":
            if direction == "outbound":
                # Arrivé sur site de destination
                if item.current_location_asset_id == item.destination_asset_id:
                    item.status = "delivered"
                else:
                    item.status = "delivered_intermediate"
            elif direction == "inbound":
                # Retour à la base
                item.status = "returned"

            item.current_location_asset_id = payload["destination_asset_id"]

            if entry.get("has_anomaly"):
                item.has_anomaly = True

        elif entry["status"] == "missing":
            # Colis non retrouvé — passe en requires_investigation
            # (pas directement 'lost' — une investigation est requise)
            item.has_anomaly = True
            await notification_service.send(
                roles=["LOG_BASE", "DO"],
                message=(
                    f"Colis {item.tracking_number} introuvable au déchargement "
                    f"{payload['manifest_reference']} — investigation requise"
                )
            )

        await self._create_movement(
            item.id,
            "delivered" if direction == "outbound" else "return_arrived",
            from_asset=None,
            to_asset=payload["destination_asset_id"],
            actor=None,  # système
            db=db
        )

    await db.commit()
```

---

### 9.3 Événement : signalement.validated

Émis par PaxLog quand un signalement passe de `under_review` à `validated`.

**Consommateur : PaxLog interne** — application des sanctions automatiques.

```python
# Payload
{
    "event_name": "signalement.validated",
    "payload": {
        "signalement_id": "uuid",
        "target_type": "pax",             # pax | team | company
        "target_id": "uuid",              # pax_id | group_id | company_id
        "decision": "blacklist_temporaire",
        -- avertissement | exclusion_site | blacklist_temporaire | blacklist_permanent
        "asset_scope_id": "uuid",         # null = toutes les plateformes
        "ban_until": "2026-12-31",        # null si permanent
        "validated_by": "uuid",
        "entity_id": "uuid"
    }
}

# Handler PaxLog interne — on_signalement_validated
async def on_signalement_validated(self, event: dict) -> None:
    """
    Applique automatiquement les effets d'un signalement validé :
    - blacklist_temporaire / blacklist_permanent → rejeter les AdS actives
    - exclusion_site → passer les AdS en requires_review
    - avertissement → notification seulement
    """
    payload = event["payload"]
    decision = payload["decision"]
    target_type = payload["target_type"]
    target_id = payload["target_id"]

    # Récupérer les AdS actives concernées par ce PAX ou cette entreprise
    active_ads = await get_active_ads_for_target(
        target_type=target_type,
        target_id=target_id,
        db=db
    )

    for ads in active_ads:
        if decision in ("blacklist_temporaire", "blacklist_permanent"):
            # Rejet automatique des AdS en attente de validation
            if ads.status in ("submitted", "pending_initiator_review",
                              "pending_project_review", "pending_compliance",
                              "pending_validation", "approved"):
                ads.status = "rejected"
                ads.rejection_reason = (
                    f"Rejet automatique — signalement {decision} validé"
                )
                await audit_log.record(
                    entity_type="ads", entity_id=ads.id,
                    action="auto_rejected",
                    new_values={"reason": f"signalement.{decision}"},
                    source_event="signalement.validated",
                    source_module="paxlog"
                )

        elif decision == "exclusion_site":
            # Passage en requires_review (pas un rejet automatique)
            if ads.status not in ("completed", "cancelled", "rejected"):
                ads.status = "requires_review"
                await notification_service.send(
                    user_id=ads.requester_id,
                    message=(
                        f"AdS {ads.reference} requiert une révision : "
                        f"signalement d'exclusion site validé pour un PAX de cette demande"
                    )
                )

    await db.commit()
```

---

### 9.4 Mise à jour de la table de référence

```
| Événement                  | Émetteur         | Consommateur         | Section |
|----------------------------|------------------|----------------------|---------|
| ...                        | ...              | ...                  | ...     |
| `ads.completed`            | PaxLog           | Planner              | §9.1    |
| `cargo_manifest.closed`    | TravelWiz        | TravelWiz (interne)  | §9.2    |
| `signalement.validated`    | PaxLog           | PaxLog (interne)     | §9.3    |
```

---

## 10. Événements AVM — Avis de Mission

### 10.1 Tableau de référence — événements AVM

```
| Événement                      | Émetteur   | Consommateur                   | Section |
|--------------------------------|------------|--------------------------------|---------|
| `mission_notice.created`       | PaxLog     | —                              | —       |
| `mission_notice.launched`      | PaxLog     | Notifs RH, Achats, LOG_BASE    | §10.2   |
| `mission_notice.ads_created`   | PaxLog     | PaxLog (lien AVM→AdS tracé)    | —       |
| `mission_notice.ads_rejected`  | PaxLog     | PaxLog (tâche prépa bloquée)   | §10.3   |
| `mission_notice.ready`         | PaxLog     | Notif créateur + stakeholders  | —       |
| `mission_notice.completed`     | PaxLog     | Archivage                      | —       |
```

---

### 10.2 Handler : mission_notice.launched

```python
async def on_mission_notice_launched(self, event: dict) -> None:
    """
    Déclenché au lancement de l'AVM.
    Notifie les parties prenantes selon leur rôle.
    """
    payload = event["payload"]

    # Notifier RH si visa requis
    if payload.get("requires_visa"):
        await notification_service.send(
            roles=["RH"],
            message=f"Demande visa requise pour AVM {payload['reference']}",
            link=f"/pax/mission-notices/{payload['mission_id']}"
        )

    # Notifier LOG_BASE si badge requis
    if payload.get("requires_badge"):
        await notification_service.send(
            roles=["LOG_BASE"],
            message=f"Demande badge requise pour AVM {payload['reference']}",
            link=f"/pax/mission-notices/{payload['mission_id']}"
        )

    # Notifier Achats si EPI requis
    if payload.get("requires_epi"):
        await notification_service.send(
            roles=["ACHAT"],
            message=(
                f"Commande EPI requise pour AVM {payload['reference']} — "
                f"mensurations disponibles dans la fiche"
            ),
            link=f"/pax/mission-notices/{payload['mission_id']}"
        )
```

---

### 10.3 Handler : ads.rejected → AVM (lien inverse)

```python
async def on_ads_rejected_check_avm(self, event: dict) -> None:
    """
    Quand une AdS est rejetée, vérifier si elle est liée à un AVM.
    Si oui → l'AVM reste active, simple alerte à l'initiateur pour qu'il
    gère la relance manuellement depuis la fiche AVM.
    La tâche prépa 'ads_creation' reste en 'completed' — elle a bien été
    créée, c'est la validation qui a échoué. L'initiateur crée une nouvelle AdS
    ou modifie la ligne de programme et recrée depuis la fiche AVM.
    """
    payload = event["payload"]
    ads_id = payload["ads_id"]

    # Chercher si cette AdS vient d'un AVM
    line = await db.execute(
        select(MissionProgram).where(
            MissionProgram.generated_ads_id == ads_id
        )
    )
    line = line.scalar_one_or_none()
    if not line:
        return  # AdS indépendante, rien à faire

    mission = await db.get(MissionNotice, line.mission_notice_id)

    # L'AVM reste active — alerter l'initiateur pour action manuelle
    await notification_service.send(
        user_id=mission.created_by,
        message=(
            f"⚠ AdS {payload['ads_reference']} rejetée dans votre mission {mission.reference}. "
            f"Motif : {payload.get('reason', '—')}. "
            f"Vous pouvez relancer une AdS depuis la fiche mission."
        ),
        link=f"/pax/mission-notices/{mission.id}"
    )
    # Note : la tâche prépa 'ads_creation' reste en 'completed'
    # L'initiateur recréera une AdS manuellement via le bouton
    # "Recréer l'AdS" sur la ligne de programme concernée
    await db.commit()
```

---

### 10.4 Précision sur l'étape 0-A — exclusion des créations automatiques

L'étape 0-A (validation initiateur) **ne s'applique pas** aux AdS créées
automatiquement par des processus système :

- AdS créées par le **batch de rotation** (`created_by = SYSTEM`) → pas d'étape 0-A,
  l'AdS est créée en `draft` et le PAX ou son superviseur la confirme manuellement
  comme avant (logique inchangée)
- AdS créées depuis un **AVM** (`source_avm_id ≠ null`) → pas d'étape 0-A,
  l'AVM lui-même sert de validation d'intention par l'initiateur
- AdS créées **par le PAX lui-même** (`created_by == requester_id`) → pas d'étape 0-A

La règle précise :
```python
def should_apply_step_0A(ads: AdS) -> bool:
    """Étape 0-A active seulement si :"""
    return (
        ads.created_by != ads.requester_id    # créé pour quelqu'un d'autre
        and ads.source_avm_id is None          # pas depuis un AVM
        and not ads.is_auto_rotation           # pas un batch rotation
    )
```

---

## 11. Transitions FSM AVM et handlers

### 11.1 FSM AVM — transitions

```
draft
  ↓ launch_mission() appelée par créateur | CHEF_PROJET | DO
in_preparation
  ↓ automatique : quand première AdS liée passe en 'approved'
active
  ↓ automatique : quand toutes les AdS liées sont clôturées (pax_manifest.closed inbound)
completed

* → cancelled : action manuelle avec motif obligatoire (créateur | DO)
```

### 11.2 Handler : ads.approved → mise à jour AVM

```python
async def on_ads_approved_check_avm(self, event: dict) -> None:
    """
    Si l'AdS approuvée vient d'un AVM en in_preparation,
    passer l'AVM en 'active'.
    """
    ads_id = event["payload"]["ads_id"]
    line = await db.execute(
        select(MissionProgram).where(MissionProgram.generated_ads_id == ads_id)
    )
    line = line.scalar_one_or_none()
    if not line:
        return

    mission = await db.get(MissionNotice, line.mission_notice_id)
    if mission and mission.status == "in_preparation":
        mission.status = "active"
        await notification_service.send(
            user_id=mission.created_by,
            message=f"Mission {mission.reference} — première AdS approuvée. Mission active."
        )
        await db.commit()
```

### 11.3 Handler : pax_manifest.closed (inbound) → clôture AVM

```python
async def on_pax_manifest_closed_check_avm(self, event: dict) -> None:
    """
    Quand un manifeste retour est clôturé, vérifier si toutes les AdS
    liées à l'AVM sont clôturées → passer en 'completed'.
    """
    if event["payload"].get("direction") != "inbound":
        return

    # Trouver les AdS clôturées par ce manifeste
    for ads_pax in event["payload"].get("boarded_pax", []):
        ads_id = await get_ads_from_ads_pax(ads_pax["ads_pax_id"])
        line = await db.execute(
            select(MissionProgram).where(MissionProgram.generated_ads_id == ads_id)
        )
        line = line.scalar_one_or_none()
        if not line:
            continue

        mission = await db.get(MissionNotice, line.mission_notice_id)
        if not mission or mission.status != "active":
            continue

        # Vérifier si TOUTES les AdS de cette AVM sont clôturées
        all_lines = await db.execute(
            select(MissionProgram).where(
                MissionProgram.mission_notice_id == mission.id,
                MissionProgram.generated_ads_id.isnot(None)
            )
        )
        all_ads_closed = all(
            await is_ads_completed(l.generated_ads_id)
            for l in all_lines.scalars()
        )
        if all_ads_closed:
            mission.status = "completed"
            await notification_service.send(
                user_id=mission.created_by,
                message=f"Mission {mission.reference} clôturée — tous les retours confirmés."
            )
            await db.commit()
```

### 11.4 Mise à jour table de référence événements

```
| Événement                        | Émetteur   | Consommateur            | Section |
|----------------------------------|------------|-------------------------|---------|
| `mission_notice.created`         | PaxLog     | —                       | —       |
| `mission_notice.launched`        | PaxLog     | Notifs parties prenantes| §10.2   |
| `mission_notice.ads_rejected`    | PaxLog     | Notif initiateur AVM    | §10.3   |
| `mission_notice.ready`           | PaxLog     | Notif créateur          | §10.2   |
| `mission_notice.completed`       | PaxLog     | Archivage               | §11.3   |
```

---

## 12. Transition AVM active → ready

```python
async def check_avm_ready(mission_id: UUID, db: AsyncSession) -> None:
    """
    Vérifie si la mission peut passer en 'ready'.
    Appelé à chaque fois qu'une tâche prépa est complétée ou qu'une AdS est approuvée.

    Conditions :
    - Toutes les mission_preparation_tasks sont en 'completed' ou 'na'
    - Toutes les mission_programs avec site_asset_id ont leur AdS en 'approved'
    """
    mission = await db.get(MissionNotice, mission_id)
    if not mission or mission.status != "active":
        return

    # Vérifier tâches prépa
    tasks = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == mission_id
        )
    )
    all_tasks_done = all(
        t.status in ("completed", "na") for t in tasks.scalars()
    )

    # Vérifier AdS liées
    lines = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == mission_id,
            MissionProgram.generated_ads_id.isnot(None)
        )
    )
    all_ads_approved = all(
        await get_ads_status(l.generated_ads_id) == "approved"
        for l in lines.scalars()
    )

    if all_tasks_done and all_ads_approved:
        mission.status = "ready"
        await notification_service.send(
            user_id=mission.created_by,
            message=(
                f"✅ Mission {mission.reference} — Tout est prêt ! "
                f"Toutes les actions préparatoires sont complétées et "
                f"toutes les AdS sont approuvées. La mission peut partir."
            ),
            link=f"/pax/mission-notices/{mission_id}"
        )
        await db.commit()
```

---

## 13. Notifications inter-projets Planner

### 13.1 Handler : activity.modified avec liens inter-projets

Quand une activité Planner est modifiée et qu'elle a des successeurs via
`activity_links` dans d'autres projets, les chefs de projet concernés
sont notifiés :

```python
async def on_activity_modified_notify_linked_projects(
    self, event: dict, db: AsyncSession
) -> None:
    """
    Notifie les chefs des projets impactés par un décalage inter-projet.
    """
    payload = event["payload"]
    activity_id = payload["activity_id"]

    # Chercher les liens vers d'autres activités (inter-projets)
    links = await db.execute(
        select(ActivityLink).where(ActivityLink.predecessor_id == activity_id)
    )
    for link in links.scalars():
        successor = await db.get(Activity, link.successor_id)
        if not successor:
            continue

        # Calculer le décalage propagé
        lag_days = payload.get("date_shift_days", 0)
        if lag_days == 0:
            continue

        # Notifier le responsable du projet impacté
        project = await get_project_for_activity(successor.id, db)
        if not project:
            continue

        await notification_service.send(
            user_id=project.owner_id,
            message=(
                f"⚠ Décalage inter-projets : "
                f"'{payload['activity_name']}' ({payload['project_name']}) "
                f"décalé de {lag_days}j → impact sur "
                f"'{successor.name}' dans votre projet"
            ),
            link=f"/planner/activities/{successor.id}"
        )
```

---

## 14. Règle annulation AVM — résumé des transitions

```
AVM status          AdS associées             Action possible
──────────────────────────────────────────────────────────────────
draft               toutes null               Annulation libre
in_preparation      toutes draft/pending      Annulation libre → cascade
active              mix approved + pending    Annulation libre → cascade
active              ≥1 in_progress            BLOCAGE annulation → modification seulement
ready               toutes approved           Annulation libre → cascade (mission n'a pas encore démarré physiquement)
completed           toutes closed             Annulation impossible (mission terminée)
──────────────────────────────────────────────────────────────────
```

**Comportement PATCH /modify-active quand AdS in_progress :**
- Modification date fin → AdS passe en `requires_review` (motif affiché)
- Ajout PAX → nouvelle AdS ou ajout sur l'AdS existante selon le cas
- Retrait PAX déjà sur site → blocage `CANNOT_REMOVE_PAX_ON_SITE`
- Retrait PAX pas encore arrivé → retrait normal de l'AdS
