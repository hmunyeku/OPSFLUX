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
    AdsEvent,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    PaxCredential,
    PaxIncident,
)
from app.models.common import TierContact

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
NON_TRAVELWIZ_OUTBOUND_MODES = {"", "walking"}
ADS_PENDING_SIGNALLEMENT_REJECTION_STATUSES = {
    "submitted",
    "pending_initiator_review",
    "pending_project_review",
    "pending_compliance",
    "pending_validation",
    "pending_arbitration",
}
ADS_ACTIVE_SIGNALLEMENT_REVIEW_STATUSES = {
    "approved",
    "in_progress",
}


def ads_requires_travelwiz_transport(
    outbound_transport_mode: str | None,
) -> bool:
    """Return whether AdS approval should trigger TravelWiz manifest lookup."""
    mode = (outbound_transport_mode or "").strip().lower()
    return mode not in NON_TRAVELWIZ_OUTBOUND_MODES


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE CHECKING
# ═══════════════════════════════════════════════════════════════════════════════


async def check_pax_compliance(
    db: AsyncSession,
    asset_id: UUID,
    entity_id: UUID,
    *,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
) -> dict:
    """Check a PAX against the compliance matrix for a specific asset.

    Exactly one of user_id / contact_id must be provided.

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
    if not user_id and not contact_id:
        return {"compliant": False, "results": [{"credential_type_code": "N/A", "status": "error", "message": "No PAX identifier provided", "expiry_date": None}]}

    # Determine PAX type (internal vs external)
    pax_type = "internal" if user_id else "external"

    # ── 1. Asset-level compliance matrix ─────────────────────────────────
    # Recursive CTE to get asset + all parent assets in hierarchy
    asset_hierarchy = await db.execute(
        text("""
            WITH RECURSIVE asset_tree AS (
                SELECT id, parent_id FROM ar_installations WHERE id = :asset_id
                UNION ALL
                SELECT a.id, a.parent_id
                FROM ar_installations a
                JOIN asset_tree t ON a.id = t.parent_id
            )
            SELECT id FROM asset_tree
        """),
        {"asset_id": str(asset_id)},
    )
    ancestor_ids = [row[0] for row in asset_hierarchy.all()]
    if not ancestor_ids:
        ancestor_ids = [asset_id]

    matrix_result = await db.execute(
        select(ComplianceMatrixEntry).where(
            ComplianceMatrixEntry.entity_id == entity_id,
            ComplianceMatrixEntry.asset_id.in_(ancestor_ids),
            ComplianceMatrixEntry.mandatory == True,  # noqa: E712
        )
    )
    requirements = matrix_result.scalars().all()

    # Filter by scope
    applicable_reqs: list[ComplianceMatrixEntry] = []
    for req in requirements:
        if req.scope == "all_visitors":
            applicable_reqs.append(req)
        elif req.scope == "contractors_only" and pax_type == "external":
            applicable_reqs.append(req)
        elif req.scope == "permanent_staff_only" and pax_type == "internal":
            applicable_reqs.append(req)

    # ── 2. Profile-level habilitation matrix ─────────────────────────────
    pax_fk_col = "user_id" if user_id else "contact_id"
    pax_fk_val = str(user_id or contact_id)
    hab_rows = await db.execute(
        text(
            f"""
            SELECT hm.credential_type_id, hm.mandatory
            FROM pax_profile_types ppta
            JOIN habilitation_matrix hm ON hm.profile_type_id = ppta.profile_type_id
            WHERE ppta.{pax_fk_col} = :pax_fk AND hm.mandatory = true
            """
        ),
        {"pax_fk": pax_fk_val},
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
    cred_filter = PaxCredential.user_id == user_id if user_id else PaxCredential.contact_id == contact_id
    creds_result = await db.execute(
        select(PaxCredential).where(cred_filter)
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
            asset_id=ads.site_entry_asset_id,
            entity_id=entity_id,
            user_id=pax_entry.user_id,
            contact_id=pax_entry.contact_id,
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
            "user_id": str(pax_entry.user_id) if pax_entry.user_id else None,
            "contact_id": str(pax_entry.contact_id) if pax_entry.contact_id else None,
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
            "return_transport_mode": ads.return_transport_mode,
            "transport_requested": ads_requires_travelwiz_transport(ads.outbound_transport_mode),
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
            SELECT id, user_id, contact_id, site_asset_id, days_on, days_off,
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
        cycle_user_id = cycle[1]
        cycle_contact_id = cycle[2]
        site_asset_id = cycle[3]
        days_on = cycle[4]
        days_off = cycle[5]
        next_on_date = cycle[6]
        ads_lead_days = cycle[7]
        default_project_id = cycle[8]
        default_cc_id = cycle[9]

        try:
            # Generate reference
            reference = await generate_ads_reference(db, entity_id)

            # Compute end date
            end_date = next_on_date + timedelta(days=days_on - 1)

            # Determine requester_id: use user_id if internal, else fallback
            requester_id = cycle_user_id or cycle_contact_id

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
                    "requester_id": str(requester_id),
                    "site_asset_id": str(site_asset_id),
                    "purpose": f"Rotation automatique (cycle {cycle_id})",
                    "start_date": next_on_date,
                    "end_date": end_date,
                    "project_id": str(default_project_id) if default_project_id else None,
                },
            )
            new_ads_id = ads_id_result.scalar()

            # Add PAX to AdS (dual FK)
            pax_col = "user_id" if cycle_user_id else "contact_id"
            pax_val = str(cycle_user_id or cycle_contact_id)
            await db.execute(
                text(
                    f"""
                    INSERT INTO ads_pax (ads_id, {pax_col}, status, priority_score)
                    VALUES (:ads_id, :pax_fk, 'pending_check', 0)
                    """
                ),
                {"ads_id": str(new_ads_id), "pax_fk": pax_val},
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
            pax_label = f"user={cycle_user_id}" if cycle_user_id else f"contact={cycle_contact_id}"
            logger.info(
                "Rotation cycle %s: created AdS %s for %s (%s -> %s)",
                cycle_id, reference, pax_label, next_on_date, end_date,
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

    # ── Determine PAX FK column for raw SQL ─────────────────────────────
    pax_fk_col = "user_id" if ads_pax.user_id else "contact_id"
    pax_fk_val = str(ads_pax.user_id or ads_pax.contact_id)

    # ── Role-based scoring ───────────────────────────────────────────────
    role_result = await db.execute(
        text(
            f"""
            SELECT pt.code FROM profile_types pt
            JOIN pax_profile_types ppt ON ppt.profile_type_id = pt.id
            WHERE ppt.{pax_fk_col} = :pax_fk
            ORDER BY pt.code
            LIMIT 1
            """
        ),
        {"pax_fk": pax_fk_val},
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
            f"SELECT 1 FROM pax_profile_types ppt "
            f"JOIN profile_types pt ON pt.id = ppt.profile_type_id "
            f"WHERE ppt.{pax_fk_col} = :pax_fk AND pt.code ILIKE '%vip%' "
            f"LIMIT 1"
        ),
        {"pax_fk": pax_fk_val},
    )
    if vip_result.first():
        score += PRIORITY_WEIGHTS["vip_flag"]

    # ── First-time visitor penalty ───────────────────────────────────────
    entity_id = ads_row[1] if ads_row else None
    if entity_id:
        prev_ads_count = await db.execute(
            text(
                f"SELECT COUNT(*) FROM ads_pax ap "
                f"JOIN ads a ON a.id = ap.ads_id "
                f"WHERE ap.{pax_fk_col} = :pax_fk AND a.entity_id = :eid "
                f"AND a.status IN ('approved', 'completed')"
            ),
            {"pax_fk": pax_fk_val, "eid": str(entity_id)},
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
    """Create a formal signalement (incident, HSE violation, sanction).

    If severity is ``temp_ban`` or ``permanent_ban``, auto-blocks PAX from
    future AdS by updating their profile status to ``suspended``. Ban-like
    severities also propagate immediate effects to impacted AdS.

    ``data`` keys:
        pax_id, asset_id, severity, description, incident_date,
        ban_start_date, ban_end_date, recorded_by

    Returns the created signalement as a dict.
    """
    inc_user_id = data.get("user_id")
    inc_contact_id = data.get("contact_id")
    inc_company_id = data.get("company_id")
    inc_asset_id = data.get("asset_id")
    severity = data["severity"]
    recorded_by = data["recorded_by"]

    # Create PaxIncident
    incident = PaxIncident(
        entity_id=entity_id,
        user_id=inc_user_id,
        contact_id=inc_contact_id,
        company_id=data.get("company_id"),
        asset_id=inc_asset_id,
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
    if severity in ("temp_ban", "permanent_ban"):
        if inc_user_id:
            await db.execute(
                text("UPDATE users SET pax_status = 'suspended' WHERE id = :uid"),
                {"uid": str(inc_user_id)},
            )
            logger.info("User %s suspended due to %s signalement %s", inc_user_id, severity, incident.id)
        elif inc_contact_id:
            await db.execute(
                text("UPDATE tier_contacts SET pax_status = 'suspended' WHERE id = :cid"),
                {"cid": str(inc_contact_id)},
            )
            logger.info("Contact %s suspended due to %s signalement %s", inc_contact_id, severity, incident.id)

    impacted_ads = await _apply_signalement_ads_effects(
        db,
        entity_id=entity_id,
        incident=incident,
    )

    await db.commit()
    await db.refresh(incident)

    # ── Emit event ───────────────────────────────────────────────────────
    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.created",
        payload={
            "incident_id": str(incident.id),
            "entity_id": str(entity_id),
            "user_id": str(inc_user_id) if inc_user_id else None,
            "contact_id": str(inc_contact_id) if inc_contact_id else None,
            "company_id": str(inc_company_id) if inc_company_id else None,
            "severity": severity,
            "asset_id": str(inc_asset_id) if inc_asset_id else None,
            "recorded_by": str(recorded_by),
            "ads_rejected": impacted_ads["rejected"],
            "ads_flagged_for_review": impacted_ads["requires_review"],
        },
    ))

    return {
        "id": incident.id,
        "entity_id": incident.entity_id,
        "user_id": incident.user_id,
        "contact_id": incident.contact_id,
        "company_id": incident.company_id,
        "severity": incident.severity,
        "description": incident.description,
        "incident_date": incident.incident_date,
        "ban_start_date": incident.ban_start_date,
        "ban_end_date": incident.ban_end_date,
        "recorded_by": incident.recorded_by,
        "created_at": incident.created_at,
        "ads_rejected": impacted_ads["rejected"],
        "ads_flagged_for_review": impacted_ads["requires_review"],
    }


async def _apply_signalement_ads_effects(
    db: AsyncSession,
    *,
    entity_id: UUID,
    incident: PaxIncident,
) -> dict[str, int]:
    if incident.severity not in {"site_ban", "temp_ban", "permanent_ban"}:
        return {"rejected": 0, "requires_review": 0}

    query = (
        select(Ads)
        .join(AdsPax, AdsPax.ads_id == Ads.id)
        .where(
            Ads.entity_id == entity_id,
            Ads.archived == False,  # noqa: E712
        )
        .distinct()
    )

    if incident.user_id:
        query = query.where(AdsPax.user_id == incident.user_id)
    elif incident.contact_id:
        query = query.where(AdsPax.contact_id == incident.contact_id)
    elif incident.company_id:
        query = (
            query
            .join(TierContact, TierContact.id == AdsPax.contact_id)
            .where(TierContact.tier_id == incident.company_id)
        )
    else:
        return {"rejected": 0, "requires_review": 0}

    if incident.severity == "site_ban":
        if not incident.asset_id:
            return {"rejected": 0, "requires_review": 0}
        query = query.where(Ads.site_entry_asset_id == incident.asset_id)

    result = await db.execute(query)
    impacted_ads = result.scalars().all()

    rejected_count = 0
    review_count = 0
    now = datetime.now(timezone.utc)
    reason = incident.description
    target_scope = {
        "incident_id": str(incident.id),
        "severity": incident.severity,
        "asset_id": str(incident.asset_id) if incident.asset_id else None,
        "company_id": str(incident.company_id) if incident.company_id else None,
        "user_id": str(incident.user_id) if incident.user_id else None,
        "contact_id": str(incident.contact_id) if incident.contact_id else None,
    }

    for ads in impacted_ads:
        from_state = ads.status
        if from_state in ADS_PENDING_SIGNALLEMENT_REJECTION_STATUSES:
            ads.status = "rejected"
            ads.rejected_at = now
            ads.rejection_reason = reason
            rejected_count += 1
            db.add(AdsEvent(
                entity_id=entity_id,
                ads_id=ads.id,
                event_type="signalement_rejected",
                old_status=from_state,
                new_status="rejected",
                actor_id=incident.recorded_by,
                reason=reason,
                metadata_json=target_scope,
            ))
        elif from_state in ADS_ACTIVE_SIGNALLEMENT_REVIEW_STATUSES:
            ads.status = "requires_review"
            ads.rejection_reason = reason
            review_count += 1
            db.add(AdsEvent(
                entity_id=entity_id,
                ads_id=ads.id,
                event_type="signalement_requires_review",
                old_status=from_state,
                new_status="requires_review",
                actor_id=incident.recorded_by,
                reason=reason,
                metadata_json=target_scope,
            ))

    return {"rejected": rejected_count, "requires_review": review_count}


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

    prep_summary = _summarize_preparation_tasks(tasks_to_create)

    # ── Transition to in_preparation / ready ─────────────────────
    avm.status = "ready" if prep_summary["ready_for_approval"] else "in_preparation"
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

    logger.info("AVM %s submitted (%s) by %s", avm.reference, avm.status, user_id)

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
    1. Validate AVM is ready for approval
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
    if avm.status not in ("in_preparation", "ready"):
        raise ValueError(f"Cannot approve AVM with status '{avm.status}'")

    blocking_tasks_result = await db.execute(
        select(MissionPreparationTask.title, MissionPreparationTask.status)
        .where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.task_type != "ads_creation",
            MissionPreparationTask.status.in_(("pending", "in_progress", "blocked")),
        )
        .order_by(MissionPreparationTask.created_at)
    )
    blocking_tasks = blocking_tasks_result.all()
    if blocking_tasks:
        blocking_titles = ", ".join(task[0] for task in blocking_tasks)
        raise ValueError(
            f"Cannot approve AVM while preparation tasks remain open: {blocking_titles}"
        )

    # Load programs
    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm_id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()

    prep_tasks_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.task_type == "ads_creation",
            MissionPreparationTask.status == "pending",
        ).order_by(MissionPreparationTask.created_at)
    )
    ads_creation_tasks = prep_tasks_result.scalars().all()
    ads_creation_task_index = 0

    ads_created_count = 0
    for prog in programs:
        if prog.site_asset_id and not prog.generated_ads_id:
            # Load PAX for this program line (dual FK)
            pax_result = await db.execute(
                select(MissionProgramPax.user_id, MissionProgramPax.contact_id).where(
                    MissionProgramPax.mission_program_id == prog.id,
                )
            )
            pax_rows = pax_result.all()

            # Generate AdS reference
            ads_ref = await generate_ads_reference(db, entity_id)

            # Create draft AdS
            ads = Ads(
                entity_id=entity_id,
                reference=ads_ref,
                type="team" if len(pax_rows) > 1 else "individual",
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

            # Add PAX entries (dual FK)
            for row_uid, row_cid in pax_rows:
                db.add(AdsPax(ads_id=ads.id, user_id=row_uid, contact_id=row_cid, status="pending_check"))

            prog.generated_ads_id = ads.id
            if ads_creation_task_index < len(ads_creation_tasks):
                prep_task = ads_creation_tasks[ads_creation_task_index]
                prep_task.linked_ads_id = ads.id
                prep_task.status = "completed"
                prep_task.completed_at = datetime.now(timezone.utc)
                ads_creation_task_index += 1
            ads_created_count += 1

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


async def complete_avm(
    db: AsyncSession,
    avm_id: UUID,
    entity_id: UUID,
    user_id: UUID,
) -> dict:
    """Complete an active AVM once all generated AdS reached a terminal state."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise ValueError(f"AVM {avm_id} not found")
    if avm.status != "active":
        raise ValueError(f"Cannot complete AVM with status '{avm.status}'")

    programs_result = await db.execute(
        select(
            MissionProgram.id,
            MissionProgram.activity_description,
            MissionProgram.site_asset_id,
            MissionProgram.generated_ads_id,
        )
        .where(MissionProgram.mission_notice_id == avm_id)
        .order_by(MissionProgram.order_index)
    )
    programs = programs_result.all()

    missing_generated_ads = [
        program[1]
        for program in programs
        if program[2] and not program[3]
    ]
    if missing_generated_ads:
        raise ValueError(
            "Cannot complete AVM while some program lines have no generated AdS: "
            + ", ".join(missing_generated_ads)
        )

    generated_ads_ids = [program[3] for program in programs if program[3]]
    if generated_ads_ids:
        linked_ads_result = await db.execute(
            select(Ads.id, Ads.reference, Ads.status)
            .where(
                Ads.entity_id == entity_id,
                Ads.id.in_(generated_ads_ids),
            )
            .order_by(Ads.reference.asc())
        )
        linked_ads_rows = linked_ads_result.all()
        linked_ads_by_id = {row[0]: row for row in linked_ads_rows}
        if len(linked_ads_by_id) != len(set(generated_ads_ids)):
            raise ValueError("Cannot complete AVM because some generated AdS are missing in the current entity")

        terminal_statuses = {"completed", "cancelled", "rejected"}
        non_terminal_ads = [
            f"{row[1]} ({row[2]})"
            for row in linked_ads_rows
            if row[2] not in terminal_statuses
        ]
        if non_terminal_ads:
            raise ValueError(
                "Cannot complete AVM while generated AdS are still active: "
                + ", ".join(non_terminal_ads)
            )

    avm.status = "completed"
    await db.commit()
    await db.refresh(avm)

    await event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.completed",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "completed_by": str(user_id),
            "generated_ads_count": len(generated_ads_ids),
        },
    ))

    logger.info("AVM %s completed by %s", avm.reference, user_id)

    return {
        "avm_id": avm.id,
        "reference": avm.reference,
        "status": avm.status,
        "generated_ads_count": len(generated_ads_ids),
    }


async def get_avm_preparation_status(
    db: AsyncSession,
    avm_id: UUID,
) -> dict:
    """Get preparation progress for an AVM.

    Returns percentage of completed tasks and task breakdown.
    """
    result = await db.execute(
        select(MissionPreparationTask).where(MissionPreparationTask.mission_notice_id == avm_id)
    )
    tasks = list(result.scalars().all())
    return _summarize_preparation_tasks(tasks)


def _summarize_preparation_tasks(tasks: list[MissionPreparationTask]) -> dict:
    """Summarize AVM preparation progress and readiness.

    `ads_creation` tasks are operational outputs generated on approval, so they do not
    block the transition from `in_preparation` to `ready`.
    """
    total = len(tasks)
    completed = sum(1 for task in tasks if task.status == "completed")
    na = sum(1 for task in tasks if task.status == "na")
    applicable = total - na
    progress = round(completed / applicable * 100) if applicable > 0 else 100

    blocking_statuses = {"pending", "in_progress", "blocked"}
    open_preparation_tasks = [
        task for task in tasks
        if task.task_type != "ads_creation" and task.status in blocking_statuses
    ]
    ready_for_approval = len(open_preparation_tasks) == 0

    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "na_tasks": na,
        "applicable_tasks": applicable,
        "progress_percent": progress,
        "open_preparation_tasks": len(open_preparation_tasks),
        "blocking_task_titles": [task.title for task in open_preparation_tasks],
        "ready_for_approval": ready_for_approval,
    }
