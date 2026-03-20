"""PaxLog service — AdS workflow, compliance checking, rotation cycles,
inter-module integration with Planner and TravelWiz.

Implements:
- Compliance checking (asset matrix + profile habilitation matrix)
- AdS reference generation
- AdS submission with Planner capacity check
- AdS approval with TravelWiz notification
- Rotation cycle management (APScheduler daily job)
- Priority scoring (for TravelWiz manifest ordering)
- Signalement creation (incident, HSE violation, ban)
"""

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import OpsFluxEvent, event_bus
from app.models.paxlog import (
    Ads,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    PaxCredential,
    PaxIncident,
    PaxProfile,
)

logger = logging.getLogger(__name__)

# ── Priority scoring weights ────────────────────────────────────────────────

PRIORITY_WEIGHTS = {
    "activity_critical": 50,
    "activity_high": 30,
    "activity_medium": 15,
    "activity_low": 0,
    "role_cds": 40,
    "role_supervisor": 25,
    "role_operator": 10,
    "role_default": 0,
    "vip_flag": 20,
    "first_time_penalty": -10,
}

# ── AdS reference prefix ────────────────────────────────────────────────────

ADS_REF_PREFIX = "ADS"


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE CHECKING
# ═══════════════════════════════════════════════════════════════════════════════


async def check_pax_compliance(
    db: AsyncSession,
    pax_id: UUID,
    asset_id: UUID,
    entity_id: UUID,
) -> dict:
    """Check a PAX against the compliance matrix for a specific asset.

    Returns::

        {
            "compliant": bool,
            "results": [
                {
                    "credential_type_code": str,
                    "credential_type_name": str,
                    "status": "valid" | "missing" | "expired" | "pending",
                    "message": str,
                    "expiry_date": date | None,
                }
            ]
        }

    Checks both:
    1. Asset-level compliance matrix (mandatory creds per site)
    2. Profile-level habilitation matrix (creds per job profile)
    """
    # Load PAX profile
    pax_result = await db.execute(
        select(PaxProfile).where(
            PaxProfile.id == pax_id,
            PaxProfile.entity_id == entity_id,
        )
    )
    profile = pax_result.scalar_one_or_none()
    if not profile:
        return {"compliant": False, "results": [{"credential_type_code": "N/A", "status": "error", "message": "PAX profile not found", "expiry_date": None}]}

    # ── 1. Asset-level compliance matrix ─────────────────────────────────
    matrix_result = await db.execute(
        select(ComplianceMatrixEntry).where(
            ComplianceMatrixEntry.entity_id == entity_id,
            ComplianceMatrixEntry.asset_id == asset_id,
            ComplianceMatrixEntry.mandatory == True,  # noqa: E712
        )
    )
    requirements = matrix_result.scalars().all()

    # Filter by scope
    applicable_reqs: list[ComplianceMatrixEntry] = []
    for req in requirements:
        if req.scope == "all_visitors":
            applicable_reqs.append(req)
        elif req.scope == "contractors_only" and profile.type == "external":
            applicable_reqs.append(req)
        elif req.scope == "permanent_staff_only" and profile.type == "internal":
            applicable_reqs.append(req)

    # ── 2. Profile-level habilitation matrix ─────────────────────────────
    # Fetch profile type assignments for this PAX
    hab_rows = await db.execute(
        text(
            """
            SELECT hm.credential_type_id, hm.mandatory
            FROM pax_profile_type_assignments ppta
            JOIN habilitation_matrix hm ON hm.profile_type_id = ppta.profile_type_id
            WHERE ppta.pax_id = :pax_id AND hm.mandatory = true
            """
        ),
        {"pax_id": str(pax_id)},
    )
    hab_requirements = hab_rows.all()

    # Merge habilitation requirements into the applicable set (deduplicate)
    existing_ct_ids = {r.credential_type_id for r in applicable_reqs}
    hab_credential_type_ids = set()
    for row in hab_requirements:
        ct_id = row[0]
        if ct_id not in existing_ct_ids:
            hab_credential_type_ids.add(ct_id)

    # ── Load PAX credentials ─────────────────────────────────────────────
    creds_result = await db.execute(
        select(PaxCredential).where(PaxCredential.pax_id == pax_id)
    )
    credentials = {c.credential_type_id: c for c in creds_result.scalars().all()}

    # ── Build credential type lookup ─────────────────────────────────────
    all_ct_ids = {r.credential_type_id for r in applicable_reqs} | hab_credential_type_ids
    ct_lookup: dict[UUID, CredentialType] = {}
    if all_ct_ids:
        ct_result = await db.execute(
            select(CredentialType).where(CredentialType.id.in_(all_ct_ids))
        )
        for ct in ct_result.scalars().all():
            ct_lookup[ct.id] = ct

    # ── Check each requirement ───────────────────────────────────────────
    results = []
    overall_compliant = True
    today = date.today()

    def _check_credential(ct_id: UUID) -> dict:
        nonlocal overall_compliant
        ct = ct_lookup.get(ct_id)
        code = ct.code if ct else str(ct_id)
        name = ct.name if ct else str(ct_id)

        cred = credentials.get(ct_id)
        if not cred:
            overall_compliant = False
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "missing",
                "message": f"Habilitation manquante : {name}",
                "expiry_date": None,
            }
        elif cred.status == "expired" or (cred.expiry_date and cred.expiry_date < today):
            overall_compliant = False
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "expired",
                "message": f"Habilitation expirée : {name} (exp. {cred.expiry_date})",
                "expiry_date": cred.expiry_date,
            }
        elif cred.status == "pending_validation":
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "pending",
                "message": f"En attente de validation : {name}",
                "expiry_date": cred.expiry_date,
            }
        else:
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "valid",
                "message": "OK",
                "expiry_date": cred.expiry_date,
            }

    # Asset-level matrix requirements
    for req in applicable_reqs:
        results.append(_check_credential(req.credential_type_id))

    # Profile-level habilitation requirements (extras)
    for ct_id in hab_credential_type_ids:
        results.append(_check_credential(ct_id))

    return {"compliant": overall_compliant, "results": results}


# ═══════════════════════════════════════════════════════════════════════════════
# AdS REFERENCE GENERATION
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_ads_reference(db: AsyncSession, entity_id: UUID) -> str:
    """Generate sequential AdS reference: ADS-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("ADS", db, entity_id=entity_id)


# ═══════════════════════════════════════════════════════════════════════════════
# AdS SUBMISSION (with Planner capacity check)
# ═══════════════════════════════════════════════════════════════════════════════


async def submit_ads(
    db: AsyncSession,
    ads_id: UUID,
    entity_id: UUID,
    user_id: UUID,
) -> dict:
    """Submit an AdS.

    Steps:
    1. Check if visit_category requires planner link
    2. If planner_activity_id set, verify capacity via Planner service
    3. Run compliance check on all PAX
    4. Update status draft -> submitted
    5. Emit event 'paxlog.ads.submitted'

    Returns::

        {
            "ads_id": UUID,
            "reference": str,
            "status": str,
            "compliance_issues": bool,
            "planner_capacity_ok": bool | None,
            "pax_results": [...]
        }
    """
    # Load AdS
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise ValueError(f"AdS {ads_id} not found")
    if ads.status != "draft":
        raise ValueError(f"Cannot submit AdS with status '{ads.status}'")

    # Load PAX entries
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    pax_entries = pax_result.scalars().all()
    if not pax_entries:
        raise ValueError("AdS must contain at least one PAX")

    # ── 1. Planner capacity check (if applicable) ───────────────────────
    planner_capacity_ok: bool | None = None
    if ads.planner_activity_id:
        try:
            from app.services.modules.planner_service import check_capacity_for_pax

            capacity_result = await check_capacity_for_pax(
                db,
                activity_id=ads.planner_activity_id,
                pax_count=len(pax_entries),
                entity_id=entity_id,
            )
            planner_capacity_ok = capacity_result.get("has_capacity", True)
            if not planner_capacity_ok:
                logger.warning(
                    "AdS %s: Planner capacity exceeded for activity %s",
                    ads.reference, ads.planner_activity_id,
                )
        except (ImportError, AttributeError):
            logger.debug("Planner service not available for capacity check")
            planner_capacity_ok = None
        except Exception as e:
            logger.warning("Planner capacity check failed: %s", e)
            planner_capacity_ok = None

    # ── 2. Compliance check on all PAX ───────────────────────────────────
    has_compliance_issues = False
    pax_results = []

    for pax_entry in pax_entries:
        compliance = await check_pax_compliance(
            db,
            pax_id=pax_entry.pax_id,
            asset_id=ads.site_entry_asset_id,
            entity_id=entity_id,
        )

        pax_entry.compliance_checked_at = func.now()
        pax_entry.compliance_summary = {
            "compliant": compliance["compliant"],
            "results": compliance["results"],
        }

        if not compliance["compliant"]:
            pax_entry.status = "blocked"
            has_compliance_issues = True
        else:
            pax_entry.status = "compliant"

        pax_results.append({
            "pax_id": str(pax_entry.pax_id),
            "compliant": compliance["compliant"],
            "results": compliance["results"],
        })

    # ── 3. Update AdS status ─────────────────────────────────────────────
    target_status = "pending_compliance" if has_compliance_issues else "submitted"
    ads.status = target_status
    ads.submitted_at = func.now()

    await db.commit()
    await db.refresh(ads)

    # ── 4. Emit event ────────────────────────────────────────────────────
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.ads.submitted",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "submitter_id": str(user_id),
            "site_asset_id": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "pax_count": len(pax_entries),
            "compliance_issues": has_compliance_issues,
            "planner_capacity_ok": planner_capacity_ok,
        },
    ))

    logger.info(
        "AdS %s submitted (compliance: %s, planner: %s)",
        ads.reference,
        "issues" if has_compliance_issues else "ok",
        planner_capacity_ok,
    )

    return {
        "ads_id": ads.id,
        "reference": ads.reference,
        "status": target_status,
        "compliance_issues": has_compliance_issues,
        "planner_capacity_ok": planner_capacity_ok,
        "pax_results": pax_results,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AdS APPROVAL (with TravelWiz notification + Planner update)
# ═══════════════════════════════════════════════════════════════════════════════


async def approve_ads(
    db: AsyncSession,
    ads_id: UUID,
    entity_id: UUID,
    user_id: UUID,
) -> dict:
    """Approve an AdS.

    Steps:
    1. Verify all PAX are compliant
    2. Update Planner pax_actual if linked
    3. Emit 'paxlog.ads.approved' (consumed by TravelWiz for manifest creation)

    Returns::

        {
            "ads_id": UUID,
            "reference": str,
            "status": "approved",
            "approved_pax_count": int,
            "planner_updated": bool,
        }
    """
    # Load AdS
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise ValueError(f"AdS {ads_id} not found")
    if ads.status not in ("pending_validation", "submitted"):
        raise ValueError(f"Cannot approve AdS with status '{ads.status}'")

    # Load PAX entries
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    pax_entries = pax_result.scalars().all()

    # Verify all PAX are compliant (or re-run compliance check)
    blocked_pax = [p for p in pax_entries if p.status == "blocked"]
    if blocked_pax:
        raise ValueError(
            f"Cannot approve: {len(blocked_pax)} PAX have compliance issues"
        )

    # Mark all as approved
    approved_count = 0
    for entry in pax_entries:
        if entry.status in ("compliant", "pending_check"):
            entry.status = "approved"
            approved_count += 1

    # ── Update Planner pax_actual ────────────────────────────────────────
    planner_updated = False
    if ads.planner_activity_id:
        try:
            await db.execute(
                text(
                    "UPDATE planner_activities SET pax_actual = COALESCE(pax_actual, 0) + :count "
                    "WHERE id = :aid"
                ),
                {"count": approved_count, "aid": str(ads.planner_activity_id)},
            )
            planner_updated = True
        except Exception as e:
            logger.warning("Failed to update planner pax_actual: %s", e)

    # Update AdS
    ads.status = "approved"
    ads.approved_at = func.now()

    await db.commit()
    await db.refresh(ads)

    # ── Emit event (consumed by TravelWiz for auto-manifest) ────────────
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.ads.approved",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "approver_id": str(user_id),
            "site_asset_id": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "outbound_transport_mode": ads.outbound_transport_mode,
            "outbound_departure_base_id": str(ads.outbound_departure_base_id) if ads.outbound_departure_base_id else None,
            "approved_pax_count": approved_count,
            "planner_activity_id": str(ads.planner_activity_id) if ads.planner_activity_id else None,
        },
    ))

    logger.info("AdS %s approved (%d PAX) by %s", ads.reference, approved_count, user_id)

    return {
        "ads_id": ads.id,
        "reference": ads.reference,
        "status": "approved",
        "approved_pax_count": approved_count,
        "planner_updated": planner_updated,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ROTATION CYCLE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════


async def process_rotation_cycles(db: AsyncSession, entity_id: UUID) -> int:
    """APScheduler daily job: create AdS from active rotation cycles.

    For each active cycle where ``next_on_date - ads_lead_days <= today``:
    1. Create draft AdS for the next ON period
    2. Add the PAX to the AdS
    3. Link to default project/cost center
    4. Advance cycle to next period

    Returns the number of AdS created.
    """
    today = date.today()
    created_count = 0

    # Fetch active rotation cycles that need AdS creation
    cycles_result = await db.execute(
        text(
            """
            SELECT id, pax_id, site_asset_id, days_on, days_off,
                   next_on_date, ads_lead_days, default_project_id, default_cc_id
            FROM pax_rotation_cycles
            WHERE entity_id = :eid
              AND status = 'active'
              AND auto_create_ads = true
              AND next_on_date - ads_lead_days <= :today
              AND next_on_date > :today
            """
        ),
        {"eid": str(entity_id), "today": today},
    )
    cycles = cycles_result.all()

    for cycle in cycles:
        cycle_id = cycle[0]
        pax_id = cycle[1]
        site_asset_id = cycle[2]
        days_on = cycle[3]
        days_off = cycle[4]
        next_on_date = cycle[5]
        ads_lead_days = cycle[6]
        default_project_id = cycle[7]
        default_cc_id = cycle[8]

        try:
            # Generate reference
            reference = await generate_ads_reference(db, entity_id)

            # Compute end date
            end_date = next_on_date + timedelta(days=days_on - 1)

            # Create draft AdS
            ads_id_result = await db.execute(
                text(
                    """
                    INSERT INTO ads (
                        entity_id, reference, type, status,
                        requester_id, site_entry_asset_id,
                        visit_purpose, visit_category,
                        start_date, end_date,
                        project_id, created_at, updated_at
                    ) VALUES (
                        :entity_id, :reference, 'individual', 'draft',
                        :requester_id, :site_asset_id,
                        :purpose, 'permanent_ops',
                        :start_date, :end_date,
                        :project_id, NOW(), NOW()
                    ) RETURNING id
                    """
                ),
                {
                    "entity_id": str(entity_id),
                    "reference": reference,
                    "requester_id": str(pax_id),  # PAX is the requester for auto-created
                    "site_asset_id": str(site_asset_id),
                    "purpose": f"Rotation automatique (cycle {cycle_id})",
                    "start_date": next_on_date,
                    "end_date": end_date,
                    "project_id": str(default_project_id) if default_project_id else None,
                },
            )
            new_ads_id = ads_id_result.scalar()

            # Add PAX to AdS
            await db.execute(
                text(
                    """
                    INSERT INTO ads_pax (ads_id, pax_id, status, priority_score)
                    VALUES (:ads_id, :pax_id, 'pending_check', 0)
                    """
                ),
                {"ads_id": str(new_ads_id), "pax_id": str(pax_id)},
            )

            # Advance cycle to next period
            next_off_start = end_date + timedelta(days=1)
            next_on = next_off_start + timedelta(days=days_off)
            await db.execute(
                text(
                    "UPDATE pax_rotation_cycles SET next_on_date = :next_on WHERE id = :cid"
                ),
                {"next_on": next_on, "cid": str(cycle_id)},
            )

            created_count += 1
            logger.info(
                "Rotation cycle %s: created AdS %s for PAX %s (%s -> %s)",
                cycle_id, reference, pax_id, next_on_date, end_date,
            )

        except Exception as e:
            logger.error("Rotation cycle %s: failed to create AdS — %s", cycle_id, e)
            continue

    if created_count:
        await db.commit()
        logger.info("Rotation cycles: created %d AdS for entity %s", created_count, entity_id)

    return created_count


# ═══════════════════════════════════════════════════════════════════════════════
# PRIORITY SCORING (for TravelWiz manifest ordering)
# ═══════════════════════════════════════════════════════════════════════════════


async def compute_pax_priority(db: AsyncSession, ads_pax_id: UUID) -> int:
    """Compute priority score for PAX manifest ordering.

    Factors:
    - Activity priority (from linked planner activity)
    - Role (CDS, supervisor, operator)
    - VIP flag
    - First-time visitor penalty

    Returns the computed integer priority score.
    """
    # Load AdsPax with related Ads
    result = await db.execute(
        select(AdsPax).where(AdsPax.id == ads_pax_id)
    )
    ads_pax = result.scalar_one_or_none()
    if not ads_pax:
        return 0

    score = 0

    # ── Activity priority (via linked planner activity) ──────────────────
    ads_result = await db.execute(
        select(Ads.planner_activity_id, Ads.entity_id).where(Ads.id == ads_pax.ads_id)
    )
    ads_row = ads_result.first()

    if ads_row and ads_row[0]:
        activity_result = await db.execute(
            text("SELECT priority FROM planner_activities WHERE id = :aid"),
            {"aid": str(ads_row[0])},
        )
        activity_row = activity_result.first()
        if activity_row:
            priority = activity_row[0]
            score += PRIORITY_WEIGHTS.get(f"activity_{priority}", 0)

    # ── Role-based scoring ───────────────────────────────────────────────
    # Check PAX profile type assignments for role information
    role_result = await db.execute(
        text(
            """
            SELECT pt.code FROM pax_profile_types pt
            JOIN pax_profile_type_assignments ppta ON ppta.profile_type_id = pt.id
            WHERE ppta.pax_id = :pax_id
            ORDER BY pt.code
            LIMIT 1
            """
        ),
        {"pax_id": str(ads_pax.pax_id)},
    )
    role_row = role_result.first()
    if role_row:
        role_code = (role_row[0] or "").lower()
        if "cds" in role_code or "chef_de_site" in role_code:
            score += PRIORITY_WEIGHTS["role_cds"]
        elif "supervisor" in role_code or "chef" in role_code:
            score += PRIORITY_WEIGHTS["role_supervisor"]
        elif "operator" in role_code or "operateur" in role_code:
            score += PRIORITY_WEIGHTS["role_operator"]
        else:
            score += PRIORITY_WEIGHTS["role_default"]

    # ── VIP flag ─────────────────────────────────────────────────────────
    vip_result = await db.execute(
        text(
            "SELECT 1 FROM pax_profile_type_assignments ppta "
            "JOIN pax_profile_types pt ON pt.id = ppta.profile_type_id "
            "WHERE ppta.pax_id = :pax_id AND pt.code ILIKE '%vip%' "
            "LIMIT 1"
        ),
        {"pax_id": str(ads_pax.pax_id)},
    )
    if vip_result.first():
        score += PRIORITY_WEIGHTS["vip_flag"]

    # ── First-time visitor penalty ───────────────────────────────────────
    entity_id = ads_row[1] if ads_row else None
    if entity_id:
        prev_ads_count = await db.execute(
            text(
                "SELECT COUNT(*) FROM ads_pax ap "
                "JOIN ads a ON a.id = ap.ads_id "
                "WHERE ap.pax_id = :pax_id AND a.entity_id = :eid "
                "AND a.status IN ('approved', 'completed')"
            ),
            {"pax_id": str(ads_pax.pax_id), "eid": str(entity_id)},
        )
        count = prev_ads_count.scalar() or 0
        if count == 0:
            score += PRIORITY_WEIGHTS["first_time_penalty"]

    # Persist the score
    ads_pax.priority_score = max(score, 0)
    ads_pax.priority_source = "auto_computed"
    await db.flush()

    return ads_pax.priority_score


# ═══════════════════════════════════════════════════════════════════════════════
# SIGNALEMENT CREATION
# ═══════════════════════════════════════════════════════════════════════════════


async def create_signalement(
    db: AsyncSession,
    entity_id: UUID,
    data: dict,
) -> dict:
    """Create a formal signalement (incident, HSE violation, ban).

    If severity is ``temp_ban`` or ``permanent_ban``, auto-blocks PAX from
    future AdS by updating their profile status to ``suspended``.

    ``data`` keys:
        pax_id, asset_id, severity, description, incident_date,
        ban_start_date, ban_end_date, recorded_by

    Returns the created signalement as a dict.
    """
    pax_id = data.get("pax_id")
    severity = data["severity"]
    recorded_by = data["recorded_by"]

    # Create PaxIncident
    incident = PaxIncident(
        entity_id=entity_id,
        pax_id=pax_id,
        company_id=data.get("company_id"),
        asset_id=data.get("asset_id"),
        severity=severity,
        description=data["description"],
        incident_date=data["incident_date"],
        ban_start_date=data.get("ban_start_date"),
        ban_end_date=data.get("ban_end_date"),
        recorded_by=recorded_by,
    )
    db.add(incident)
    await db.flush()

    # ── Auto-block PAX on ban severity ───────────────────────────────────
    if severity in ("temp_ban", "permanent_ban") and pax_id:
        pax_result = await db.execute(
            select(PaxProfile).where(
                PaxProfile.id == pax_id,
                PaxProfile.entity_id == entity_id,
            )
        )
        profile = pax_result.scalar_one_or_none()
        if profile:
            profile.status = "suspended"
            logger.info(
                "PAX %s suspended due to %s signalement %s",
                pax_id, severity, incident.id,
            )

    await db.commit()
    await db.refresh(incident)

    # ── Emit event ───────────────────────────────────────────────────────
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.created",
        payload={
            "incident_id": str(incident.id),
            "entity_id": str(entity_id),
            "pax_id": str(pax_id) if pax_id else None,
            "severity": severity,
            "asset_id": str(data.get("asset_id")) if data.get("asset_id") else None,
            "recorded_by": str(recorded_by),
        },
    ))

    return {
        "id": incident.id,
        "entity_id": incident.entity_id,
        "pax_id": incident.pax_id,
        "severity": incident.severity,
        "description": incident.description,
        "incident_date": incident.incident_date,
        "ban_start_date": incident.ban_start_date,
        "ban_end_date": incident.ban_end_date,
        "recorded_by": incident.recorded_by,
        "created_at": incident.created_at,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# AVIS DE MISSION (AVM) SERVICES
# ═══════════════════════════════════════════════════════════════════════════════

AVM_REF_PREFIX = "AVM"


async def generate_avm_reference(db: AsyncSession, entity_id: UUID) -> str:
    """Generate sequential AVM reference: AVM-YYYY-NNNNN.

    Delegates to the centralized reference generator (app.core.references)
    which uses PostgreSQL advisory locks and admin-configurable templates.
    """
    from app.core.references import generate_reference

    return await generate_reference("AVM", db, entity_id=entity_id)


async def submit_avm(
    db: AsyncSession,
    avm_id: UUID,
    entity_id: UUID,
    user_id: UUID,
) -> dict:
    """Submit an AVM — triggers preparation checklist generation.

    Steps:
    1. Validate AVM is in draft status
    2. Ensure at least one program line with site_asset_id
    3. Create auto-generated preparation tasks based on indicators
    4. Transition status → in_preparation
    5. Emit event
    """
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise ValueError(f"AVM {avm_id} not found")
    if avm.status != "draft":
        raise ValueError(f"Cannot submit AVM with status '{avm.status}'")

    # Load programs
    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm_id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()
    if not programs:
        raise ValueError("AVM must have at least one program line")

    has_site = any(p.site_asset_id for p in programs)
    if not has_site:
        raise ValueError("At least one program line must have a site_asset_id")

    # ── Create preparation tasks based on indicators ─────────────
    tasks_to_create: list[MissionPreparationTask] = []

    if avm.requires_visa:
        tasks_to_create.append(MissionPreparationTask(
            mission_notice_id=avm.id,
            title="Demande de visa",
            task_type="visa",
            status="pending",
            auto_generated=True,
        ))

    if avm.requires_badge:
        tasks_to_create.append(MissionPreparationTask(
            mission_notice_id=avm.id,
            title="Demande de badge site",
            task_type="badge",
            status="pending",
            auto_generated=True,
        ))

    if avm.requires_epi:
        tasks_to_create.append(MissionPreparationTask(
            mission_notice_id=avm.id,
            title="Commande EPI",
            task_type="epi_order",
            status="pending",
            auto_generated=True,
        ))

    if avm.eligible_displacement_allowance:
        tasks_to_create.append(MissionPreparationTask(
            mission_notice_id=avm.id,
            title="Indemnites de deplacement",
            task_type="allowance",
            status="pending",
            auto_generated=True,
        ))

    # Create AdS creation tasks per program line with site_asset_id
    for prog in programs:
        if prog.site_asset_id:
            tasks_to_create.append(MissionPreparationTask(
                mission_notice_id=avm.id,
                title=f"Creation AdS — {prog.activity_description[:80]}",
                task_type="ads_creation",
                status="pending",
                auto_generated=True,
            ))

    for task in tasks_to_create:
        db.add(task)

    # ── Transition to in_preparation ─────────────────────────────
    avm.status = "in_preparation"
    await db.commit()
    await db.refresh(avm)

    # ── Emit event ───────────────────────────────────────────────
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.launched",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "created_by": str(avm.created_by),
            "submitted_by": str(user_id),
        },
    ))

    logger.info("AVM %s submitted (in_preparation) by %s", avm.reference, user_id)

    return {
        "avm_id": avm.id,
        "reference": avm.reference,
        "status": avm.status,
        "preparation_tasks_created": len(tasks_to_create),
    }


async def approve_avm(
    db: AsyncSession,
    avm_id: UUID,
    entity_id: UUID,
    user_id: UUID,
) -> dict:
    """Approve an AVM — auto-creates draft AdS for each program line with a site.

    Steps:
    1. Validate AVM is in_preparation or active
    2. For each program line with site_asset_id, create a draft AdS
    3. Mark related preparation tasks as completed
    4. Transition status → active
    5. Emit event
    """
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise ValueError(f"AVM {avm_id} not found")
    if avm.status not in ("in_preparation",):
        raise ValueError(f"Cannot approve AVM with status '{avm.status}'")

    # Load programs
    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm_id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()

    ads_created_count = 0
    for prog in programs:
        if prog.site_asset_id and not prog.generated_ads_id:
            # Load PAX for this program line
            pax_result = await db.execute(
                select(MissionProgramPax.pax_id).where(
                    MissionProgramPax.mission_program_id == prog.id,
                )
            )
            pax_ids = [row[0] for row in pax_result.all()]

            # Generate AdS reference
            ads_ref = await generate_ads_reference(db, entity_id)

            # Create draft AdS
            ads = Ads(
                entity_id=entity_id,
                reference=ads_ref,
                type="team" if len(pax_ids) > 1 else "individual",
                status="draft",
                requester_id=avm.created_by,
                site_entry_asset_id=prog.site_asset_id,
                visit_purpose=prog.activity_description,
                visit_category="project_work",
                start_date=prog.planned_start_date or avm.planned_start_date or date.today(),
                end_date=prog.planned_end_date or avm.planned_end_date or date.today(),
                project_id=prog.project_id,
            )
            db.add(ads)
            await db.flush()

            # Add PAX entries
            for pid in pax_ids:
                db.add(AdsPax(ads_id=ads.id, pax_id=pid, status="pending_check"))

            prog.generated_ads_id = ads.id
            ads_created_count += 1

    # Mark ads_creation prep tasks as completed
    await db.execute(
        update(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.task_type == "ads_creation",
            MissionPreparationTask.status == "pending",
        ).values(status="completed", completed_at=func.now())
    )

    avm.status = "active"
    await db.commit()
    await db.refresh(avm)

    # Emit event
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.approved",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "approved_by": str(user_id),
            "ads_created": ads_created_count,
        },
    ))

    logger.info("AVM %s approved by %s — %d AdS created", avm.reference, user_id, ads_created_count)

    return {
        "avm_id": avm.id,
        "reference": avm.reference,
        "status": avm.status,
        "ads_created": ads_created_count,
    }


async def get_avm_preparation_status(
    db: AsyncSession,
    avm_id: UUID,
) -> dict:
    """Get preparation progress for an AVM.

    Returns percentage of completed tasks and task breakdown.
    """
    result = await db.execute(
        select(
            func.count(MissionPreparationTask.id).label("total"),
            func.count(MissionPreparationTask.id).filter(
                MissionPreparationTask.status == "completed"
            ).label("completed"),
            func.count(MissionPreparationTask.id).filter(
                MissionPreparationTask.status == "na"
            ).label("na"),
        ).where(MissionPreparationTask.mission_notice_id == avm_id)
    )
    row = result.first()
    total = row[0] or 0
    completed = row[1] or 0
    na = row[2] or 0

    applicable = total - na
    progress = round(completed / applicable * 100) if applicable > 0 else 100

    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "na_tasks": na,
        "applicable_tasks": applicable,
        "progress_percent": progress,
    }
