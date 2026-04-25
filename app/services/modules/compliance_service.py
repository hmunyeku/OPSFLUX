"""Central compliance decision service.

This service owns compliance verdict computation so feature modules such as
PaxLog only consume verdicts and apply business consequences.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import any_, func as sqla_func, literal, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import (
    ComplianceExemption,
    ComplianceRecord,
    ComplianceRule,
    ComplianceType,
    Phone,
    Setting,
    TierContact,
    User,
    UserEmail,
)
from app.models.paxlog import ComplianceMatrixEntry, CredentialType, PaxCredential
from app.services.connectors.compliance_connector import create_connector

logger = logging.getLogger(__name__)

DEFAULT_COMPLIANCE_SEQUENCE = [
    "site_requirements",
    "job_profile",
    "self_declaration",
]


def _coerce_number(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _evaluate_structured_condition(condition: dict | None, facts: dict) -> bool:
    if not condition:
        return True
    if "all" in condition:
        return all(_evaluate_structured_condition(item, facts) for item in condition["all"] or [])
    if "any" in condition:
        return any(_evaluate_structured_condition(item, facts) for item in condition["any"] or [])
    if "not" in condition:
        nested = condition.get("not")
        return not _evaluate_structured_condition(nested, facts) if isinstance(nested, dict) else False

    field = condition.get("field")
    op = str(condition.get("op") or "eq").lower()
    expected = condition.get("value")
    actual = facts.get(field)

    if op == "exists":
        return actual is not None and actual != ""
    if op == "missing":
        return actual is None or actual == ""
    if op == "true":
        return bool(actual) is True
    if op == "false":
        return bool(actual) is False
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "in":
        return actual in (expected or [])
    if op == "not_in":
        return actual not in (expected or [])
    if op == "contains":
        if isinstance(actual, (list, tuple, set)):
            return expected in actual
        if isinstance(actual, str):
            return str(expected) in actual
        return False

    actual_num = _coerce_number(actual)
    expected_num = _coerce_number(expected)
    if actual_num is None or expected_num is None:
        return False
    if op == "gt":
        return actual_num > expected_num
    if op == "gte":
        return actual_num >= expected_num
    if op == "lt":
        return actual_num < expected_num
    if op == "lte":
        return actual_num <= expected_num
    return False


async def get_compliance_verification_sequence(
    db: AsyncSession,
    *,
    entity_id: UUID,
) -> list[str]:
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == "paxlog.compliance_sequence",
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    raw = result.scalar_one_or_none()
    value = raw.get("v") if isinstance(raw, dict) else raw
    if not isinstance(value, list):
        return DEFAULT_COMPLIANCE_SEQUENCE.copy()

    normalized: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        key = item.strip()
        if key in DEFAULT_COMPLIANCE_SEQUENCE and key not in normalized:
            normalized.append(key)
    for key in DEFAULT_COMPLIANCE_SEQUENCE:
        if key not in normalized:
            normalized.append(key)
    return normalized


async def _get_connector_settings(
    db: AsyncSession,
    *,
    entity_id: UUID,
    prefix: str,
) -> dict[str, str]:
    result = await db.execute(
        select(Setting).where(
            Setting.key.startswith(prefix),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    values: dict[str, str] = {}
    for setting in result.scalars().all():
        field = setting.key.replace(prefix + ".", "")
        raw = setting.value.get("v", "") if isinstance(setting.value, dict) else setting.value
        values[field] = str(raw) if raw else ""
    return values


def build_compliance_issues_summary(
    compliance_items: list[dict],
    *,
    max_items: int = 6,
) -> str:
    if not compliance_items:
        return ""

    lines: list[str] = []
    for item in compliance_items[:max_items]:
        pax_label = item.get("pax_label") or "PAX"
        layer_label = item.get("layer_label") or item.get("layer") or ""
        message = item.get("message") or ""
        prefix = f"{pax_label}"
        if layer_label:
            prefix += f" [{layer_label}]"
        if message:
            prefix += f": {message}"
        lines.append(prefix)
    remaining = len(compliance_items) - len(lines)
    if remaining > 0:
        lines.append(f"+{remaining} autre(s) motif(s)")
    return " | ".join(lines)


async def check_pax_asset_compliance(
    db: AsyncSession,
    asset_id: UUID,
    entity_id: UUID,
    *,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
) -> dict:
    """Compute an asset-aware compliance verdict for one PAX."""
    if not user_id and not contact_id:
        return {
            "compliant": False,
            "results": [
                {
                    "credential_type_code": "N/A",
                    "status": "error",
                    "message": "No PAX identifier provided",
                    "expiry_date": None,
                }
            ],
            "covered_layers": [],
            "summary_by_status": {"error": 1},
            "verification_sequence": DEFAULT_COMPLIANCE_SEQUENCE.copy(),
        }

    sequence = await get_compliance_verification_sequence(db, entity_id=entity_id)
    layer_rank = {layer: index for index, layer in enumerate(sequence)}
    layer_labels = {
        "site_requirements": "Règles site",
        "job_profile": "Profil / habilitations",
        "self_declaration": "Auto-déclarations",
    }

    pax_type = "internal" if user_id else "external"

    # Build asset hierarchy: Installation → Site → Field
    # ar_installations has site_id (FK to ar_sites), ar_sites has field_id (FK to ar_fields)
    asset_hierarchy = await db.execute(
        text(
            """
            SELECT i.id FROM ar_installations i WHERE i.id = :asset_id
            UNION
            SELECT s.id FROM ar_sites s
            JOIN ar_installations i ON i.site_id = s.id
            WHERE i.id = :asset_id
            UNION
            SELECT f.id FROM ar_fields f
            JOIN ar_sites s ON s.field_id = f.id
            JOIN ar_installations i ON i.site_id = s.id
            WHERE i.id = :asset_id
            """
        ),
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

    applicable_reqs: list[ComplianceMatrixEntry] = []
    for req in requirements:
        if req.scope == "all_visitors":
            applicable_reqs.append(req)
        elif req.scope == "contractors_only" and pax_type == "external":
            applicable_reqs.append(req)
        elif req.scope == "permanent_staff_only" and pax_type == "internal":
            applicable_reqs.append(req)

    pax_fk_col = "user_id" if user_id else "contact_id"
    pax_fk_val = str(user_id or contact_id)
    hab_rows = await db.execute(
        text(
            f"""
            SELECT hm.credential_type_id, hm.mandatory
            FROM pax_profile_types ppta
            JOIN profile_habilitation_matrix hm ON hm.profile_type_id = ppta.profile_type_id
            WHERE ppta.{pax_fk_col} = :pax_fk AND hm.mandatory = true
            """
        ),
        {"pax_fk": pax_fk_val},
    )
    hab_requirements = hab_rows.all()

    existing_ct_ids = {r.credential_type_id for r in applicable_reqs}
    hab_credential_type_ids = set()
    for row in hab_requirements:
        ct_id = row[0]
        if ct_id not in existing_ct_ids:
            hab_credential_type_ids.add(ct_id)

    cred_filter = PaxCredential.user_id == user_id if user_id else PaxCredential.contact_id == contact_id
    creds_result = await db.execute(select(PaxCredential).where(cred_filter))
    credentials = {c.credential_type_id: c for c in creds_result.scalars().all()}

    all_ct_ids = {r.credential_type_id for r in applicable_reqs} | hab_credential_type_ids
    ct_lookup: dict[UUID, CredentialType] = {}
    if all_ct_ids:
        ct_result = await db.execute(select(CredentialType).where(CredentialType.id.in_(all_ct_ids)))
        for ct in ct_result.scalars().all():
            ct_lookup[ct.id] = ct

    results = []
    overall_compliant = True
    today = date.today()

    def _check_credential(ct_id: UUID, *, layer: str) -> dict:
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
                "layer": layer,
                "layer_label": layer_labels.get(layer, layer),
                "blocking": True,
            }
        if cred.status == "expired" or (cred.expiry_date and cred.expiry_date < today):
            overall_compliant = False
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "expired",
                "message": f"Habilitation expirée : {name} (exp. {cred.expiry_date})",
                "expiry_date": cred.expiry_date,
                "layer": layer,
                "layer_label": layer_labels.get(layer, layer),
                "blocking": True,
            }
        if cred.status == "pending_validation":
            return {
                "credential_type_code": code,
                "credential_type_name": name,
                "status": "pending_validation",
                "message": f"En attente de validation : {name}",
                "expiry_date": cred.expiry_date,
                "layer": layer,
                "layer_label": layer_labels.get(layer, layer),
                "blocking": False,
            }
        return {
            "credential_type_code": code,
            "credential_type_name": name,
            "status": "valid",
            "message": "OK",
            "expiry_date": cred.expiry_date,
            "layer": layer,
            "layer_label": layer_labels.get(layer, layer),
            "blocking": False,
        }

    layered_requirement_ids: dict[str, list[UUID]] = {
        "site_requirements": [req.credential_type_id for req in applicable_reqs],
        "job_profile": list(hab_credential_type_ids),
        "self_declaration": [],
    }

    for layer in sequence:
        if layer == "self_declaration":
            continue
        for ct_id in layered_requirement_ids.get(layer, []):
            results.append(_check_credential(ct_id, layer=layer))

    summary_by_status: dict[str, int] = {}
    for item in results:
        summary_by_status[item["status"]] = summary_by_status.get(item["status"], 0) + 1

    covered_layers: list[str] = []
    if applicable_reqs:
        covered_layers.append("site_requirements")
    if hab_credential_type_ids:
        covered_layers.append("job_profile")
    if any(item["status"] == "pending_validation" for item in results):
        covered_layers.append("self_declaration")
    covered_layers.sort(key=lambda layer: layer_rank.get(layer, len(sequence)))

    results.sort(
        key=lambda item: (
            layer_rank.get(item.get("layer") or "", len(sequence)),
            0 if item["status"] in {"missing", "expired"} else 1,
            item["credential_type_name"],
        )
    )

    return {
        "compliant": overall_compliant,
        "results": results,
        "covered_layers": covered_layers,
        "summary_by_status": summary_by_status,
        "verification_sequence": sequence,
    }


async def check_owner_compliance(
    db: AsyncSession,
    *,
    owner_type: str,
    owner_id: UUID,
    entity_id: UUID,
    include_contextual: bool = False,
    asset_id: UUID | None = None,
) -> dict:
    """Compute the canonical compliance verdict for one owner."""
    if asset_id and owner_type in {"user", "tier_contact"}:
        verdict = await check_pax_asset_compliance(
            db,
            asset_id,
            entity_id,
            user_id=owner_id if owner_type == "user" else None,
            contact_id=owner_id if owner_type == "tier_contact" else None,
        )
        details = verdict.get("results", [])
        return {
            "owner_type": owner_type,
            "owner_id": owner_id,
            "account_verified": True,
            "total_required": len(details),
            "total_valid": sum(1 for item in details if item.get("status") == "valid"),
            "total_expired": sum(1 for item in details if item.get("status") == "expired"),
            "total_missing": sum(1 for item in details if item.get("status") == "missing"),
            "total_unverified": sum(1 for item in details if item.get("status") == "pending_validation"),
            "is_compliant": bool(verdict.get("compliant")),
            "details": [
                {
                    "type_name": item.get("credential_type_name"),
                    "type_category": item.get("layer"),
                    "category": item.get("layer"),
                    "status": item.get("status"),
                    "layer": item.get("layer"),
                    "layer_label": item.get("layer_label"),
                    "message": item.get("message"),
                    "blocking": item.get("status") in {"missing", "expired"},
                    "verification_sequence": verdict.get("verification_sequence", []),
                }
                for item in details
            ],
        }

    now = datetime.now(timezone.utc)

    account_verified = True
    if owner_type == "user":
        require_acct_verif_row = await db.execute(
            select(Setting.value).where(
                Setting.key == "auth.require_account_verification",
                Setting.scope == "tenant",
            )
        )
        require_acct_verif = require_acct_verif_row.scalar()
        require_verification = True
        if require_acct_verif is not None:
            require_verification = bool(
                require_acct_verif.get("v", True)
                if isinstance(require_acct_verif, dict)
                else require_acct_verif
            )
        if require_verification:
            email_verified = await db.execute(
                select(sqla_func.count()).select_from(UserEmail).where(
                    UserEmail.user_id == owner_id,
                    UserEmail.verified == True,  # noqa: E712
                )
            )
            phone_verified = await db.execute(
                select(sqla_func.count()).select_from(Phone).where(
                    Phone.owner_type == "user",
                    Phone.owner_id == owner_id,
                    Phone.verified == True,  # noqa: E712
                )
            )
            account_verified = (email_verified.scalar() or 0) > 0 or (phone_verified.scalar() or 0) > 0

    applicability_filter = True  # noqa: E712
    if not include_contextual:
        applicability_filter = ComplianceRule.applicability == "permanent"

    all_rules = await db.execute(
        select(ComplianceRule.compliance_type_id)
        .where(ComplianceRule.entity_id == entity_id, ComplianceRule.active == True)  # noqa: E712
        .where(ComplianceRule.target_type == "all")
        .where(applicability_filter)
    )
    required_type_ids = set(row[0] for row in all_rules.all())

    job_position_id = None
    if owner_type == "tier_contact":
        contact_result = await db.execute(select(TierContact.job_position_id).where(TierContact.id == owner_id))
        job_position_id = contact_result.scalar()
    elif owner_type == "user":
        user_result = await db.execute(select(User.job_position_id).where(User.id == owner_id))
        job_position_id = user_result.scalar()

    if job_position_id:
        jp_id_str = str(job_position_id)
        jp_rules = await db.execute(
            select(ComplianceRule.compliance_type_id).where(
                ComplianceRule.entity_id == entity_id,
                ComplianceRule.active == True,  # noqa: E712
                ComplianceRule.target_type == "job_position",
                literal(jp_id_str) == any_(sqla_func.string_to_array(ComplianceRule.target_value, ",")),
                applicability_filter,
            )
        )
        required_type_ids |= set(row[0] for row in jp_rules.all())

    records_result = await db.execute(
        select(ComplianceRecord).where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.owner_type == owner_type,
            ComplianceRecord.owner_id == owner_id,
            ComplianceRecord.active == True,  # noqa: E712
        )
    )
    records = records_result.scalars().all()

    record_ids = [record.id for record in records]
    exempted_record_ids: set = set()
    if record_ids:
        today = now.date()
        exemptions_result = await db.execute(
            select(ComplianceExemption.compliance_record_id).where(
                ComplianceExemption.compliance_record_id.in_(record_ids),
                ComplianceExemption.status == "approved",
                ComplianceExemption.active == True,  # noqa: E712
                ComplianceExemption.start_date <= today,
                ComplianceExemption.end_date >= today,
            )
        )
        exempted_record_ids = set(row[0] for row in exemptions_result.all())

    valid_type_ids = set()
    exempted_type_ids = set()
    expired_count = 0
    unverified_count = 0

    for record in records:
        is_expired = record.expires_at and record.expires_at < now
        is_exempted = record.id in exempted_record_ids
        is_record_verified = getattr(record, "verification_status", "verified") == "verified"

        if is_exempted:
            exempted_type_ids.add(record.compliance_type_id)
        elif not is_record_verified:
            unverified_count += 1
        elif is_expired:
            expired_count += 1
            record.status = "expired"
        elif record.status == "valid":
            valid_type_ids.add(record.compliance_type_id)

    type_objects: dict = {}
    for type_id in required_type_ids:
        type_obj = await db.get(ComplianceType, type_id)
        if type_obj:
            type_objects[type_id] = type_obj

    external_valid_type_ids: set = set()
    external_results: dict[str, str] = {}
    external_types = [
        (type_id, type_obj)
        for type_id, type_obj in type_objects.items()
        if type_obj.compliance_source in ("external", "both") and type_obj.external_provider
    ]

    if external_types and owner_type == "user":
        user_obj = await db.get(User, owner_id)
        if user_obj:
            by_provider: dict[str, list[tuple]] = {}
            for type_id, type_obj in external_types:
                by_provider.setdefault(type_obj.external_provider, []).append((type_id, type_obj))

            for provider_id, types_for_provider in by_provider.items():
                try:
                    cfg = await _get_connector_settings(
                        db,
                        entity_id=entity_id,
                        prefix=f"integration.{provider_id}",
                    )
                    connector = await create_connector(provider_id, cfg)
                    if not connector:
                        continue
                    match = await connector.match_user(
                        email=user_obj.email,
                        intranet_id=user_obj.intranet_id,
                    )
                    if not match:
                        continue

                    type_mapping = {}
                    for type_id, type_obj in types_for_provider:
                        if type_obj.external_mapping:
                            ext_id = type_obj.external_mapping.get("certificate_id") or type_obj.external_mapping.get("training_id")
                            if ext_id:
                                type_mapping[str(type_id)] = str(ext_id)

                    ext_records = await connector.get_user_compliance(
                        external_user_id=match.external_user_id,
                        type_mapping=type_mapping if type_mapping else None,
                    )

                    for type_id, type_obj in types_for_provider:
                        if not type_obj.external_mapping:
                            continue
                        ext_id = str(
                            type_obj.external_mapping.get("certificate_id")
                            or type_obj.external_mapping.get("training_id")
                            or ""
                        )
                        matching_ext = [record for record in ext_records if record.type_external_id == ext_id]
                        if any(record.status == "valid" for record in matching_ext):
                            external_valid_type_ids.add(type_id)
                            external_results[str(type_id)] = "valid"
                        elif any(record.status == "expired" for record in matching_ext):
                            external_results[str(type_id)] = "expired"
                        elif any(record.status == "pending" for record in matching_ext):
                            external_results[str(type_id)] = "pending"
                except Exception:
                    logger.exception("External compliance check failed for provider %s", provider_id)

    details: list[dict] = []
    for type_id in required_type_ids:
        type_obj = type_objects.get(type_id) or await db.get(ComplianceType, type_id)
        matching = [record for record in records if record.compliance_type_id == type_id]
        is_exempted = type_id in exempted_type_ids
        source = type_obj.compliance_source if type_obj else "opsflux"

        local_valid = any(
            record.status == "valid"
            and not (record.expires_at and record.expires_at < now)
            and getattr(record, "verification_status", "verified") == "verified"
            for record in matching
        )
        has_unverified = any(
            getattr(record, "verification_status", "verified") != "verified"
            and record.status == "valid"
            for record in matching
        )

        ext_status = external_results.get(str(type_id))
        ext_valid = type_id in external_valid_type_ids

        if source == "external":
            valid_match = ext_valid
        elif source == "both":
            valid_match = local_valid or ext_valid
        else:
            valid_match = local_valid

        if is_exempted:
            detail_status = "exempted"
        elif valid_match:
            detail_status = "valid"
            if valid_match and not local_valid:
                valid_type_ids.add(type_id)
        elif has_unverified:
            detail_status = "unverified"
        elif ext_status == "expired" or any(record.expires_at and record.expires_at < now for record in matching):
            detail_status = "expired"
        elif ext_status == "pending":
            detail_status = "unverified"
        else:
            detail_status = "missing"

        detail = {
            "compliance_type_id": str(type_id),
            "type_id": str(type_id),
            "type_name": type_obj.name if type_obj else None,
            "type_category": type_obj.category if type_obj else None,
            "category": type_obj.category if type_obj else None,
            "status": detail_status,
            "record_count": len(matching),
            "source": source,
        }
        if ext_status:
            detail["external_status"] = ext_status
        details.append(detail)

    compliant_type_ids = (valid_type_ids | external_valid_type_ids | exempted_type_ids) & required_type_ids
    missing_type_ids = required_type_ids - valid_type_ids - external_valid_type_ids - exempted_type_ids
    await db.commit()

    return {
        "owner_type": owner_type,
        "owner_id": owner_id,
        "account_verified": account_verified,
        "total_required": len(required_type_ids),
        "total_valid": len(compliant_type_ids),
        "total_expired": expired_count,
        "total_missing": len(missing_type_ids),
        "total_unverified": unverified_count,
        "is_compliant": account_verified and len(missing_type_ids) == 0 and expired_count == 0 and unverified_count == 0,
        "details": details,
    }


async def evaluate_packlog_cargo_compliance(
    db: AsyncSession,
    *,
    entity_id: UUID,
    cargo_context: dict,
    include_contextual: bool = True,
) -> dict:
    """Evaluate configurable compliance rules for PackLog cargo dossiers.

    Rules use target_type='packlog_cargo'. target_value may be empty/'all' or match
    the cargo_type. condition_json supports:
    - when: structured applicability condition
    - required_fields: list[str]
    - required_flags: list[str]
    - required_evidence_types: list[str]
    - min_values / max_values: {field: number}
    """
    applicability_filter = True  # noqa: E712
    if not include_contextual:
        applicability_filter = ComplianceRule.applicability == "permanent"

    cargo_type = str(cargo_context.get("cargo_type") or "").strip().lower() or None
    rules_result = await db.execute(
        select(ComplianceRule, ComplianceType)
        .join(ComplianceType, ComplianceType.id == ComplianceRule.compliance_type_id)
        .where(
            ComplianceRule.entity_id == entity_id,
            ComplianceRule.active == True,  # noqa: E712
            ComplianceRule.target_type == "packlog_cargo",
            applicability_filter,
        )
        .order_by(ComplianceRule.created_at.asc())
    )
    now_date = datetime.now(timezone.utc).date()
    blockers: list[dict] = []
    evaluated_rules = 0

    for rule, compliance_type in rules_result.all():
        if rule.effective_from and rule.effective_from > now_date:
            continue
        if rule.effective_to and rule.effective_to < now_date:
            continue

        target_value = (rule.target_value or "").strip().lower()
        if target_value and target_value not in {"all", cargo_type or ""}:
            continue

        config = rule.condition_json or {}
        when = config.get("when") if isinstance(config, dict) else None
        if when and not _evaluate_structured_condition(when, cargo_context):
            continue

        evaluated_rules += 1
        missing_fields = [
            field for field in (config.get("required_fields") or [])
            if cargo_context.get(field) in (None, "", [], {})
        ]
        missing_flags = [
            field for field in (config.get("required_flags") or [])
            if not bool(cargo_context.get(field))
        ]
        evidence_counts = cargo_context.get("_evidence_counts") or {}
        missing_evidence = [
            evidence_type for evidence_type in (config.get("required_evidence_types") or [])
            if int(evidence_counts.get(evidence_type, 0) or 0) <= 0
        ]
        min_failures = []
        for field, minimum in (config.get("min_values") or {}).items():
            value = _coerce_number(cargo_context.get(field))
            threshold = _coerce_number(minimum)
            if value is None or threshold is None or value < threshold:
                min_failures.append({"field": field, "minimum": threshold, "actual": value})
        max_failures = []
        for field, maximum in (config.get("max_values") or {}).items():
            value = _coerce_number(cargo_context.get(field))
            threshold = _coerce_number(maximum)
            if value is None or threshold is None or value > threshold:
                max_failures.append({"field": field, "maximum": threshold, "actual": value})

        if missing_fields or missing_flags or missing_evidence or min_failures or max_failures:
            blockers.append(
                {
                    "rule_id": str(rule.id),
                    "compliance_type_id": str(compliance_type.id),
                    "compliance_type_code": compliance_type.code,
                    "compliance_type_name": compliance_type.name,
                    "priority": rule.priority,
                    "description": rule.description,
                    "missing_fields": missing_fields,
                    "missing_flags": missing_flags,
                    "missing_evidence_types": missing_evidence,
                    "min_failures": min_failures,
                    "max_failures": max_failures,
                }
            )

    return {
        "is_compliant": len(blockers) == 0,
        "evaluated_rules": evaluated_rules,
        "blockers": blockers,
    }
