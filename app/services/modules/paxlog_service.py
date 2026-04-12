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
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.events import OpsFluxEvent, event_bus
from app.services.modules import compliance_service
from app.services.core.fsm_service import fsm_service, FSMError
from app.models.common import Address, Setting, TierContact, User
from app.models.paxlog import (
    Ads,
    AdsEvent,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    MissionAllowanceRequest,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    MissionVisaFollowup,
    PaxCredential,
    PaxIncident,
)

logger = logging.getLogger(__name__)
AVM_WORKFLOW_SLUG = "avm-workflow"
AVM_ENTITY_TYPE = "avm"


async def _try_avm_workflow_transition(
    db: AsyncSession,
    *,
    avm: MissionNotice,
    to_state: str,
    actor_id: UUID,
) -> None:
    try:
        instance = await fsm_service.get_instance(
            db,
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
        )
        if not instance:
            await fsm_service.get_or_create_instance(
                db,
                workflow_slug=AVM_WORKFLOW_SLUG,
                entity_type=AVM_ENTITY_TYPE,
                entity_id=str(avm.id),
                initial_state=avm.status,
                entity_id_scope=avm.entity_id,
                created_by=actor_id,
            )
        await fsm_service.transition(
            db,
            workflow_slug=AVM_WORKFLOW_SLUG,
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
            to_state=to_state,
            actor_id=actor_id,
            entity_id_scope=avm.entity_id,
            skip_role_check=True,
        )
    except FSMError as exc:
        if "not found" not in str(exc).lower():
            raise

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
NON_TRAVELWIZ_TRANSPORT_MODES = {"", "walking"}
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
DEFAULT_COMPLIANCE_SEQUENCE = compliance_service.DEFAULT_COMPLIANCE_SEQUENCE


def build_external_compliance_blockers(compliance_summary: dict | None) -> list[dict[str, object | None]]:
    compliance_results = [
        item for item in ((compliance_summary or {}).get("results") or [])
        if isinstance(item, dict)
    ]
    return [
        {
            "credential_type_code": item.get("credential_type_code"),
            "credential_type_name": item.get("credential_type_name"),
            "status": item.get("status"),
            "message": item.get("message"),
            "expiry_date": item.get("expiry_date"),
            "layer_label": item.get("layer_label") or item.get("layer"),
        }
        for item in compliance_results
        if item.get("status") in {"missing", "expired", "pending", "error", "pending_validation"}
    ]


def build_external_required_actions(
    *,
    missing_identity_fields: list[str],
    compliance_blockers: list[dict[str, object | None]],
) -> list[dict[str, object | None]]:
    required_actions: list[dict[str, object | None]] = []
    for field_name in missing_identity_fields:
        required_actions.append({
            "code": f"identity_missing:{field_name}",
            "kind": "identity",
            "field": field_name,
            "credential_type_code": None,
            "status": "missing",
            "label": field_name,
            "message": f"Compléter le champ {field_name}",
        })
    for blocker in compliance_blockers:
        blocker_status = str(blocker.get("status") or "")
        action_kind = "credential"
        if blocker_status == "pending_validation":
            action_kind = "followup"
        required_actions.append({
            "code": f"compliance:{blocker.get('credential_type_code') or blocker.get('credential_type_name') or 'unknown'}:{blocker_status}",
            "kind": action_kind,
            "field": blocker.get("credential_type_code"),
            "credential_type_code": blocker.get("credential_type_code"),
            "status": blocker_status,
            "label": blocker.get("credential_type_name") or blocker.get("credential_type_code"),
            "message": blocker.get("message"),
            "layer_label": blocker.get("layer_label"),
            "expiry_date": blocker.get("expiry_date"),
        })
    return required_actions


def build_external_pax_summary(allowed_pax: list[dict[str, object | None]]) -> dict[str, int]:
    return {
        "total": len(allowed_pax),
        "pending_check": sum(1 for item in allowed_pax if item.get("status") == "pending_check"),
        "compliant": sum(1 for item in allowed_pax if item.get("status") == "compliant"),
        "blocked": sum(1 for item in allowed_pax if item.get("status") == "blocked"),
        "approved": sum(1 for item in allowed_pax if item.get("status") == "approved"),
    }


def _serialize_pickup_address(address: Address | None) -> dict[str, str | None]:
    if not address:
        return {
            "pickup_address_line1": None,
            "pickup_address_line2": None,
            "pickup_city": None,
            "pickup_state_province": None,
            "pickup_postal_code": None,
            "pickup_country": None,
        }
    return {
        "pickup_address_line1": address.address_line1,
        "pickup_address_line2": address.address_line2,
        "pickup_city": address.city,
        "pickup_state_province": address.state_province,
        "pickup_postal_code": address.postal_code,
        "pickup_country": address.country,
    }


def normalize_pax_name(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_str = nfkd.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9 ]", "", ascii_str.lower()).strip()


def phonetic_pax_name_key(name: str) -> str:
    normalized = normalize_pax_name(name).replace(" ", "")
    if not normalized:
        return ""
    normalized = (
        normalized.replace("ph", "f")
        .replace("ck", "k")
        .replace("qu", "k")
        .replace("ou", "u")
        .replace("x", "s")
    )
    first = normalized[0]
    tail = re.sub(r"[aeiouyhw]", "", normalized[1:])
    tail = re.sub(r"(.)\1+", r"\1", tail)
    return f"{first}{tail}"


def compare_pax_names(
    first_name: str,
    last_name: str,
    candidate_first_name: str,
    candidate_last_name: str,
) -> str | None:
    first_norm = normalize_pax_name(first_name)
    last_norm = normalize_pax_name(last_name)
    candidate_first_norm = normalize_pax_name(candidate_first_name)
    candidate_last_norm = normalize_pax_name(candidate_last_name)
    if first_norm == candidate_first_norm and last_norm == candidate_last_norm:
        return "name_exact"
    if (
        phonetic_pax_name_key(first_name) == phonetic_pax_name_key(candidate_first_name)
        and phonetic_pax_name_key(last_name) == phonetic_pax_name_key(candidate_last_name)
    ):
        return "name_phonetic"
    return None


def normalize_external_phone(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[^0-9+]", "", value)


def score_external_contact_match(
    *,
    first_name: str,
    last_name: str,
    birth_date: date | None,
    nationality: str | None,
    badge_number: str | None,
    email: str | None,
    phone: str | None,
    candidate: TierContact,
) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    name_match = compare_pax_names(first_name, last_name, candidate.first_name, candidate.last_name)
    if name_match == "name_exact":
        score += 60
        reasons.append("name_exact")
    elif name_match == "name_phonetic":
        score += 35
        reasons.append("name_phonetic")

    if birth_date and candidate.birth_date and birth_date == candidate.birth_date:
        score += 25
        reasons.append("birth_date")

    if badge_number and candidate.badge_number and badge_number.strip().lower() == candidate.badge_number.strip().lower():
        score += 35
        reasons.append("badge_number")

    if email and candidate.email and email.strip().lower() == candidate.email.strip().lower():
        score += 20
        reasons.append("email")

    if phone and candidate.phone and normalize_external_phone(phone) == normalize_external_phone(candidate.phone):
        score += 20
        reasons.append("phone")

    if nationality and candidate.nationality and nationality.strip().lower() == candidate.nationality.strip().lower():
        score += 10
        reasons.append("nationality")

    return score, reasons


def is_external_contact_match_strong(*, score: int, reasons: list[str]) -> bool:
    return score >= 50 or any(reason in {"badge_number", "email", "phone"} for reason in reasons)


async def find_external_contact_matches(
    db: AsyncSession,
    *,
    ads_id: UUID,
    allowed_company_ids: list[UUID],
    first_name: str,
    last_name: str,
    birth_date: date | None,
    nationality: str | None,
    badge_number: str | None,
    email: str | None,
    phone: str | None,
) -> list[dict[str, object | None]]:
    if not allowed_company_ids:
        return []
    candidates = (
        await db.execute(
            select(TierContact)
            .where(
                TierContact.tier_id.in_(allowed_company_ids),
                TierContact.active == True,  # noqa: E712
            )
            .order_by(TierContact.last_name.asc(), TierContact.first_name.asc())
        )
    ).scalars().all()
    linked_contact_ids = set(
        (
            await db.execute(
                select(AdsPax.contact_id).where(
                    AdsPax.ads_id == ads_id,
                    AdsPax.contact_id.is_not(None),
                )
            )
        ).scalars().all()
    )

    matches: list[dict[str, object | None]] = []
    for contact in candidates:
        score, reasons = score_external_contact_match(
            first_name=first_name,
            last_name=last_name,
            birth_date=birth_date,
            nationality=nationality,
            badge_number=badge_number,
            email=email,
            phone=phone,
            candidate=contact,
        )
        if not is_external_contact_match_strong(score=score, reasons=reasons):
            continue
        matches.append({
            "contact_id": contact.id,
            "first_name": contact.first_name,
            "last_name": contact.last_name,
            "birth_date": contact.birth_date,
            "nationality": contact.nationality,
            "badge_number": contact.badge_number,
            "email": contact.email,
            "phone": contact.phone,
            "position": contact.position,
            "job_position_id": contact.job_position_id,
            "job_position_name": contact.job_position.name if getattr(contact, "job_position", None) else None,
            "match_score": score,
            "match_reasons": reasons,
            "already_linked_to_ads": contact.id in linked_contact_ids,
        })
    matches.sort(key=lambda item: (-int(item["match_score"]), str(item["last_name"]).lower(), str(item["first_name"]).lower()))
    return matches[:5]


async def build_external_dossier_pax_data(
    db: AsyncSession,
    *,
    ads_id: UUID,
    allowed_company_ids: list[UUID],
) -> tuple[list[dict[str, object | None]], dict[str, int]]:
    pax_entries = (
        await db.execute(
            select(AdsPax, TierContact, User)
            .outerjoin(User, User.id == AdsPax.user_id)
            .outerjoin(
                TierContact,
                or_(
                    TierContact.id == AdsPax.contact_id,
                    TierContact.id == User.tier_contact_id,
                ),
            )
            .where(AdsPax.ads_id == ads_id)
            .order_by(
                func.coalesce(TierContact.last_name, User.last_name),
                func.coalesce(TierContact.first_name, User.first_name),
            )
        )
    ).all()

    allowed_pax: list[dict[str, object | None]] = []
    for entry, contact, user in pax_entries:
        if not contact:
            continue
        if allowed_company_ids and contact.tier_id not in allowed_company_ids:
            continue

        compliance_summary = entry.compliance_summary or {}
        compliance_blockers = build_external_compliance_blockers(compliance_summary)
        missing_identity_fields = [
            field_name
            for field_name, field_value in (
                ("birth_date", contact.birth_date),
                ("nationality", contact.nationality),
                ("badge_number", contact.badge_number),
            )
            if not field_value
        ]
        required_actions = build_external_required_actions(
            missing_identity_fields=missing_identity_fields,
            compliance_blockers=compliance_blockers,
        )
        allowed_pax.append({
            "entry_id": str(entry.id),
            "contact_id": str(contact.id),
            "user_id": str(user.id) if user else None,
            "pax_source": "user" if getattr(entry, "user_id", None) else "contact",
            "first_name": contact.first_name or (user.first_name if user else None),
            "last_name": contact.last_name or (user.last_name if user else None),
            "birth_date": (contact.birth_date or (user.birth_date if user else None)).isoformat() if (contact.birth_date or (user.birth_date if user else None)) else None,
            "nationality": contact.nationality or (user.nationality if user else None),
            "badge_number": contact.badge_number or (user.badge_number if user else None),
            "photo_url": contact.photo_url,
            "email": contact.email or (user.email if user else None),
            "phone": contact.phone,
            "contractual_airport": getattr(contact, "contractual_airport", None) or (getattr(user, "contractual_airport", None) if user else None),
            "nearest_airport": getattr(contact, "nearest_airport", None) or (getattr(user, "nearest_airport", None) if user else None),
            "nearest_station": getattr(contact, "nearest_station", None) or (getattr(user, "nearest_station", None) if user else None),
            "job_position_id": str(getattr(contact, "job_position_id", None)) if getattr(contact, "job_position_id", None) else (str(getattr(user, "job_position_id", None)) if user and getattr(user, "job_position_id", None) else None),
            "job_position_name": (contact.job_position.name if getattr(contact, "job_position", None) else None) or (user.job_position_name if user else None),
            "position": contact.position or (user.job_position_name if user else None),
            "status": entry.status,
            "company_id": str(contact.tier_id),
            "compliance_ok": bool(compliance_summary.get("compliant")),
            "compliance_blocker_count": len(compliance_blockers),
            "compliance_blockers": compliance_blockers[:5],
            "missing_identity_fields": missing_identity_fields,
            "required_actions": required_actions[:8],
            "credentials": [],
            "pickup_address_line1": None,
            "pickup_address_line2": None,
            "pickup_city": None,
            "pickup_state_province": None,
            "pickup_postal_code": None,
            "pickup_country": None,
            "linked_user_id": str(user.id) if user else None,
            "linked_user_email": user.email if user else getattr(contact, "linked_user_email", None),
            "linked_user_active": user.active if user else getattr(contact, "linked_user_active", None),
        })

    visible_contact_ids = [UUID(str(item["contact_id"])) for item in allowed_pax]
    visible_user_ids = [UUID(str(item["user_id"])) for item in allowed_pax if item.get("user_id")]
    credentials_by_contact: dict[UUID, list[dict[str, object | None]]] = {}
    if visible_contact_ids:
        credential_rows = (
            await db.execute(
                select(PaxCredential, CredentialType)
                .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
                .where(PaxCredential.contact_id.in_(visible_contact_ids))
                .order_by(CredentialType.name.asc(), PaxCredential.obtained_date.desc())
            )
        ).all()
        for credential, credential_type in credential_rows:
            if not credential.contact_id:
                continue
            credentials_by_contact.setdefault(credential.contact_id, []).append(
                {
                    "id": str(credential.id),
                    "credential_type_code": credential_type.code,
                    "credential_type_name": credential_type.name,
                    "status": credential.status,
                    "obtained_date": credential.obtained_date.isoformat() if credential.obtained_date else None,
                    "expiry_date": credential.expiry_date.isoformat() if credential.expiry_date else None,
                    "proof_url": credential.proof_url,
                }
            )

    pickup_addresses_by_owner: dict[tuple[str, UUID], Address] = {}
    if visible_contact_ids or visible_user_ids:
        address_rows = (
            await db.execute(
                select(Address)
                .where(
                    Address.label == "pickup",
                    or_(
                        and_(Address.owner_type == "tier_contact", Address.owner_id.in_(visible_contact_ids or [UUID(int=0)])),
                        and_(Address.owner_type == "user", Address.owner_id.in_(visible_user_ids or [UUID(int=0)])),
                    ),
                )
                .order_by(Address.is_default.desc(), Address.created_at.desc())
            )
        ).scalars().all()
        for address in address_rows:
            pickup_addresses_by_owner.setdefault((address.owner_type, address.owner_id), address)

    for item in allowed_pax:
        item["credentials"] = credentials_by_contact.get(UUID(str(item["contact_id"])), [])[:8]
        contact_address = pickup_addresses_by_owner.get(("tier_contact", UUID(str(item["contact_id"]))))
        user_address = (
            pickup_addresses_by_owner.get(("user", UUID(str(item["user_id"]))))
            if item.get("user_id")
            else None
        )
        item.update(_serialize_pickup_address(contact_address or user_address))

    return allowed_pax, build_external_pax_summary(allowed_pax)


def mask_contact_value(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    if "@" in value:
        local, domain = value.split("@", 1)
        if len(local) <= 2:
            masked_local = local[0] + "*" * max(len(local) - 1, 0)
        else:
            masked_local = local[:2] + "*" * max(len(local) - 2, 0)
        return f"{masked_local}@{domain}"
    if len(value) <= 4:
        return "*" * len(value)
    return "*" * (len(value) - 4) + value[-4:]


def build_external_session_open_payload(*, session_token: str, ttl_minutes: int) -> dict[str, object]:
    return {"session_token": session_token, "expires_in_seconds": ttl_minutes * 60}


def verify_external_otp_code(
    *,
    expected_hash: str | None,
    provided_hash: str,
    otp_expires_at: datetime | None,
    otp_attempt_count: int,
    max_attempts: int,
    now: datetime,
) -> tuple[bool, str | None]:
    if not expected_hash or not otp_expires_at:
        return False, "missing_otp"
    normalized_expiry = otp_expires_at if otp_expires_at.tzinfo else otp_expires_at.replace(tzinfo=timezone.utc)
    if normalized_expiry < now:
        return False, "expired"
    if otp_attempt_count >= max_attempts:
        return False, "locked"
    if provided_hash != expected_hash:
        return False, "invalid"
    return True, None


def ads_requires_travelwiz_transport(
    outbound_transport_mode: str | None,
    return_transport_mode: str | None = None,
) -> bool:
    """Return whether AdS approval should trigger TravelWiz manifest lookup."""
    outbound_mode = (outbound_transport_mode or "").strip().lower()
    return_mode = (return_transport_mode or "").strip().lower()
    return (
        outbound_mode not in NON_TRAVELWIZ_TRANSPORT_MODES
        or return_mode not in NON_TRAVELWIZ_TRANSPORT_MODES
    )


async def get_compliance_verification_sequence(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> list[str]:
    return await compliance_service.get_compliance_verification_sequence(
        db,
        entity_id=entity_id,
    )


def build_compliance_issues_summary(
    compliance_items: list[dict],
    *,
    max_items: int = 6,
) -> str:
    return compliance_service.build_compliance_issues_summary(
        compliance_items,
        max_items=max_items,
    )


async def complete_ads_operationally(
    db: AsyncSession,
    ads: Ads,
    *,
    source: str,
    actor_id: UUID | None = None,
    reason: str | None = None,
    extra_metadata: dict | None = None,
) -> Ads:
    """Complete an in-progress AdS with consistent event/FSM/module emission."""
    if ads.status != "in_progress":
        raise ValueError(f"Cannot complete AdS with status '{ads.status}'")

    old_status = ads.status
    metadata = {"source": source}
    if reason:
        metadata["reason"] = reason
    if extra_metadata:
        metadata.update(extra_metadata)

    ads.status = "completed"
    db.add(AdsEvent(
        entity_id=ads.entity_id,
        ads_id=ads.id,
        event_type="completed",
        old_status=old_status,
        new_status="completed",
        actor_id=actor_id,
        reason=reason,
        metadata_json=metadata,
    ))

    await db.commit()
    await db.refresh(ads)

    await fsm_service.emit_transition_event(
        entity_type="ads",
        entity_id=str(ads.id),
        from_state=old_status,
        to_state="completed",
        actor_id=actor_id,
        workflow_slug="ads-workflow",
        extra_payload=metadata,
    )

    await event_bus.publish(OpsFluxEvent(
        event_type="ads.completed",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(ads.entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "source": source,
            "reason": reason,
            **(extra_metadata or {}),
        },
    ))

    return ads


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
    return await compliance_service.check_pax_asset_compliance(
        db,
        asset_id,
        entity_id,
        user_id=user_id,
        contact_id=contact_id,
    )


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
            "outbound_transport_requested": ads_requires_travelwiz_transport(
                ads.outbound_transport_mode
            ),
            "return_transport_requested": ads_requires_travelwiz_transport(
                None,
                ads.return_transport_mode,
            ),
            "transport_requested": ads_requires_travelwiz_transport(
                ads.outbound_transport_mode,
                ads.return_transport_mode,
            ),
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
            SELECT id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                   next_on_date, ads_lead_days, default_project_id, default_cc_id, created_by
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
        cycle_created_by = cycle[10]

        try:
            # Generate reference
            reference = await generate_ads_reference(db, entity_id)

            # Compute end date
            end_date = next_on_date + timedelta(days=days_on - 1)

            # Internal cycles use the PAX as requester. External cycles use the
            # cycle creator as internal sponsor while keeping the contact on AdsPax.
            sponsor_user_id = cycle_user_id or cycle_created_by
            if not sponsor_user_id:
                logger.warning(
                    "Rotation cycle %s skipped: no internal sponsor available for auto-created AdS",
                    cycle_id,
                )
                continue

            # Create draft AdS
            ads_id_result = await db.execute(
                text(
                    """
                    INSERT INTO ads (
                        entity_id, reference, type, status,
                        created_by, requester_id, site_entry_asset_id,
                        visit_purpose, visit_category,
                        start_date, end_date,
                        project_id, created_at, updated_at
                    ) VALUES (
                        :entity_id, :reference, 'individual', 'draft',
                        :created_by, :requester_id, :site_asset_id,
                        :purpose, 'permanent_ops',
                        :start_date, :end_date,
                        :project_id, NOW(), NOW()
                    ) RETURNING id
                    """
                ),
                {
                    "entity_id": str(entity_id),
                    "reference": reference,
                    "created_by": str(sponsor_user_id),
                    "requester_id": str(sponsor_user_id),
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
    inc_pax_group_id = data.get("pax_group_id")
    inc_asset_id = data.get("asset_id")
    severity = data["severity"]
    recorded_by = data["recorded_by"]

    scope_count = sum(1 for value in (inc_user_id, inc_contact_id, inc_company_id, inc_pax_group_id) if value)
    if scope_count != 1:
        raise ValueError("Signalement target must be exactly one of user, contact, company or pax group.")

    # Create PaxIncident
    incident = PaxIncident(
        entity_id=entity_id,
        user_id=inc_user_id,
        contact_id=inc_contact_id,
        company_id=data.get("company_id"),
        pax_group_id=inc_pax_group_id,
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
            "pax_group_id": str(inc_pax_group_id) if inc_pax_group_id else None,
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
        "pax_group_id": incident.pax_group_id,
        "severity": incident.severity,
        "description": incident.description,
        "incident_date": incident.incident_date,
        "ban_start_date": incident.ban_start_date,
        "ban_end_date": incident.ban_end_date,
        "recorded_by": incident.recorded_by,
        "created_at": incident.created_at,
        "ads_rejected": impacted_ads["rejected"],
        "ads_flagged_for_review": impacted_ads["requires_review"],
        # Spec §3.10: pass rejected ADS list so the caller can trigger
        # waitlist promotion for freed capacity
        "_rejected_ads": impacted_ads.get("rejected_ads", []),
    }


async def _apply_signalement_ads_effects(
    db: AsyncSession,
    *,
    entity_id: UUID,
    incident: PaxIncident,
) -> dict[str, int]:
    incident_pax_group_id = getattr(incident, "pax_group_id", None)
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
    elif incident_pax_group_id:
        query = (
            query
            .outerjoin(User, User.id == AdsPax.user_id)
            .outerjoin(TierContact, TierContact.id == AdsPax.contact_id)
            .where(
                and_(
                    or_(
                        User.pax_group_id == incident_pax_group_id,
                        TierContact.pax_group_id == incident_pax_group_id,
                    ),
                )
            )
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
        "pax_group_id": str(incident_pax_group_id) if incident_pax_group_id else None,
        "user_id": str(incident.user_id) if incident.user_id else None,
        "contact_id": str(incident.contact_id) if incident.contact_id else None,
    }

    rejected_ads_list: list[Ads] = []
    for ads in impacted_ads:
        from_state = ads.status
        if from_state in ADS_PENDING_SIGNALLEMENT_REJECTION_STATUSES:
            ads.status = "rejected"
            ads.rejected_at = now
            ads.rejection_reason = reason
            rejected_count += 1
            rejected_ads_list.append(ads)
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

    return {
        "rejected": rejected_count,
        "requires_review": review_count,
        "rejected_ads": rejected_ads_list,
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

    global_attachments_config = getattr(avm, "global_attachments_config", None) or []
    per_pax_attachments_config = getattr(avm, "per_pax_attachments_config", None) or []

    if global_attachments_config or per_pax_attachments_config:
        global_count = len(global_attachments_config)
        per_pax_count = len(per_pax_attachments_config)
        title = "Collecte documentaire mission"
        if global_count and per_pax_count:
            title = f"Collecte documentaire mission ({global_count} mission, {per_pax_count} PAX)"
        elif global_count:
            title = f"Collecte documentaire mission ({global_count} mission)"
        elif per_pax_count:
            title = f"Collecte documentaire mission ({per_pax_count} PAX)"
        tasks_to_create.append(MissionPreparationTask(
            mission_notice_id=avm.id,
            title=title,
            task_type="document_collection",
            status="pending",
            auto_generated=True,
            notes=(
                f"Mission docs: {', '.join(global_attachments_config)}\n"
                f"PAX docs: {', '.join(per_pax_attachments_config)}"
            ).strip(),
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

    await db.flush()

    unique_pax_keys: set[tuple[str, UUID]] = set()
    unique_pax_entries: list[tuple[UUID | None, UUID | None]] = []
    for prog in programs:
        pax_rows = (
            await db.execute(
                select(MissionProgramPax.user_id, MissionProgramPax.contact_id).where(
                    MissionProgramPax.mission_program_id == prog.id
                )
            )
        ).all()
        for user_id, contact_id in pax_rows:
            if user_id:
                key = ("user", user_id)
                if key not in unique_pax_keys:
                    unique_pax_keys.add(key)
                    unique_pax_entries.append((user_id, None))
            elif contact_id:
                key = ("contact", contact_id)
                if key not in unique_pax_keys:
                    unique_pax_keys.add(key)
                    unique_pax_entries.append((None, contact_id))

    visa_task = next((task for task in tasks_to_create if task.task_type == "visa"), None)
    allowance_task = next((task for task in tasks_to_create if task.task_type == "allowance"), None)

    if avm.requires_visa:
        for user_id, contact_id in unique_pax_entries:
            db.add(MissionVisaFollowup(
                mission_notice_id=avm.id,
                preparation_task_id=visa_task.id if visa_task else None,
                user_id=user_id,
                contact_id=contact_id,
                status="to_initiate",
            ))

    if avm.eligible_displacement_allowance:
        for user_id, contact_id in unique_pax_entries:
            db.add(MissionAllowanceRequest(
                mission_notice_id=avm.id,
                preparation_task_id=allowance_task.id if allowance_task else None,
                user_id=user_id,
                contact_id=contact_id,
                status="draft",
            ))

    prep_summary = _summarize_preparation_tasks(tasks_to_create)

    # ── Transition to in_preparation / ready ─────────────────────
    previous_status = avm.status
    next_status = "ready" if prep_summary["ready_for_approval"] else "in_preparation"
    await _try_avm_workflow_transition(
        db,
        avm=avm,
        to_state=next_status,
        actor_id=user_id,
    )
    avm.status = next_status
    await db.commit()
    await db.refresh(avm)
    await fsm_service.emit_transition_event(
        entity_type=AVM_ENTITY_TYPE,
        entity_id=str(avm.id),
        from_state=previous_status,
        to_state=avm.status,
        actor_id=user_id,
        workflow_slug=AVM_WORKFLOW_SLUG,
    )

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

    previous_status = avm.status
    await _try_avm_workflow_transition(
        db,
        avm=avm,
        to_state="active",
        actor_id=user_id,
    )
    avm.status = "active"
    await db.commit()
    await db.refresh(avm)
    await fsm_service.emit_transition_event(
        entity_type=AVM_ENTITY_TYPE,
        entity_id=str(avm.id),
        from_state=previous_status,
        to_state=avm.status,
        actor_id=user_id,
        workflow_slug=AVM_WORKFLOW_SLUG,
    )

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

    previous_status = avm.status
    await _try_avm_workflow_transition(
        db,
        avm=avm,
        to_state="completed",
        actor_id=user_id,
    )
    avm.status = "completed"
    await db.commit()
    await db.refresh(avm)
    await fsm_service.emit_transition_event(
        entity_type=AVM_ENTITY_TYPE,
        entity_id=str(avm.id),
        from_state=previous_status,
        to_state=avm.status,
        actor_id=user_id,
        workflow_slug=AVM_WORKFLOW_SLUG,
    )

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


def _derive_preparation_task_status(values: list[str], terminal_values: set[str], in_progress_values: set[str]) -> str:
    if not values:
        return "na"
    if all(value in terminal_values for value in values):
        return "completed"
    if any(value in in_progress_values for value in values):
        return "in_progress"
    return "pending"


async def sync_mission_operational_followup_tasks(db: AsyncSession, mission_notice_id: UUID) -> None:
    visa_task = (
        await db.execute(
            select(MissionPreparationTask).where(
                MissionPreparationTask.mission_notice_id == mission_notice_id,
                MissionPreparationTask.task_type == "visa",
            ).limit(1)
        )
    ).scalar_one_or_none()
    if visa_task:
        visa_values = list((
            await db.execute(
                select(MissionVisaFollowup.status).where(
                    MissionVisaFollowup.mission_notice_id == mission_notice_id
                )
            )
        ).scalars().all())
        visa_task.status = _derive_preparation_task_status(
            visa_values,
            terminal_values={"obtained"},
            in_progress_values={"submitted", "in_review"},
        )
        visa_task.completed_at = datetime.now(timezone.utc) if visa_task.status == "completed" else None

    allowance_task = (
        await db.execute(
            select(MissionPreparationTask).where(
                MissionPreparationTask.mission_notice_id == mission_notice_id,
                MissionPreparationTask.task_type == "allowance",
            ).limit(1)
        )
    ).scalar_one_or_none()
    if allowance_task:
        allowance_values = list((
            await db.execute(
                select(MissionAllowanceRequest.status).where(
                    MissionAllowanceRequest.mission_notice_id == mission_notice_id
                )
            )
        ).scalars().all())
        allowance_task.status = _derive_preparation_task_status(
            allowance_values,
            terminal_values={"paid"},
            in_progress_values={"submitted", "approved"},
        )
        allowance_task.completed_at = datetime.now(timezone.utc) if allowance_task.status == "completed" else None
