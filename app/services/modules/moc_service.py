"""MOC workflow service — FSM transitions + notifications + reference generation.

The state machine matches CDC rev 00 §5 (Diagramme d'évolution des statuts):

  created → approved → submitted_to_confirm → approved_to_study
      ↓                         ↘ cancelled
   (any)                          ↘ stand_by
                                  ↓
                          under_study → study_in_validation → validated
                                                                  ↓
                                                             execution → executed_docs_pending
                                                                              ↓
                                                                          closed

Allowed transitions are enumerated below; permission requirements and
required-field checks are enforced per-transition.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.common import User
from app.models.moc import (
    MOC,
    MOCStatusHistory,
    MOCType,
    MOCTypeValidationRule,
    MOCValidation,
)

logger = logging.getLogger(__name__)


# ─── FSM definition ───────────────────────────────────────────────────────────

# Map: from_status → { to_status: required_permission }
# A single source status can transition to several targets depending on the
# role of the acting user. The permission matches the acting role per CDC §5.
FSM: dict[str, dict[str, str]] = {
    "created": {
        "approved": "moc.site_chief.approve",
        "cancelled": "moc.initiator.cancel",
    },
    "approved": {
        "submitted_to_confirm": "moc.site_chief.submit",
        "cancelled": "moc.site_chief.cancel",
    },
    "submitted_to_confirm": {
        "approved_to_study": "moc.director.confirm",
        "cancelled": "moc.director.cancel",
        "stand_by": "moc.director.stand_by",
    },
    "stand_by": {
        "submitted_to_confirm": "moc.director.resume",
        "cancelled": "moc.director.cancel",
    },
    "approved_to_study": {
        "under_study": "moc.lead_process.start_study",
    },
    "under_study": {
        "study_in_validation": "moc.responsible.submit_study",
        "cancelled": "moc.responsible.cancel",
    },
    "study_in_validation": {
        "validated": "moc.director.validate_study",
        "under_study": "moc.director.return_for_rework",
        "cancelled": "moc.director.cancel",
    },
    "validated": {
        "execution": "moc.site_chief.start_execution",
        "cancelled": "moc.director.cancel",
    },
    "execution": {
        "executed_docs_pending": "moc.site_chief.complete_execution",
    },
    "executed_docs_pending": {
        # Per SOW: the Chef de Site formally closes the MOC once
        # every PID/ESD update has landed, not the process engineer. We
        # keep `moc.responsible.close` as an alias for backward compat
        # (granted to both roles below) but the canonical permission is
        # `moc.site_chief.close`.
        "closed": "moc.site_chief.close",
    },
}


def allowed_transitions(current_status: str) -> list[str]:
    return list(FSM.get(current_status, {}).keys())


# ─── Reference generation ─────────────────────────────────────────────────────


async def generate_reference(
    db: AsyncSession, *, entity_id: UUID, platform_code: str
) -> str:
    """Generate the next MOC reference: `MOC_<NNN>_<PF>`.

    Numbering is per-entity sequential. We count existing MOCs in the entity
    (including soft-deleted ones to keep numbers stable) and zero-pad to 3.
    """
    result = await db.execute(
        select(func.count()).select_from(MOC).where(MOC.entity_id == entity_id)
    )
    count = result.scalar() or 0
    next_num = count + 1
    pf = (platform_code or "").strip().upper().replace(" ", "") or "UNK"
    return f"MOC_{next_num:03d}_{pf}"


# ─── Status transition ────────────────────────────────────────────────────────


async def transition(
    db: AsyncSession,
    *,
    moc: MOC,
    to_status: str,
    actor: User,
    comment: str | None = None,
    payload: dict | None = None,
) -> MOC:
    """Fire an FSM transition on a MOC. Records audit + triggers notifications.

    The caller is responsible for the route-level permission gate;
    this function handles FSM validity, field side-effects, and history.
    """
    if to_status == moc.status:
        raise HTTPException(400, f"MOC is already in status '{to_status}'")
    allowed = FSM.get(moc.status, {})
    if to_status not in allowed:
        raise HTTPException(
            400,
            f"Invalid transition {moc.status} → {to_status}. "
            f"Allowed targets: {', '.join(allowed) or '(none)'}.",
        )

    old_status = moc.status
    now = datetime.now(UTC)
    payload = payload or {}

    # ── Per-transition preconditions + side-effects ──
    # Each branch first validates the business rules (hard gate, raises 400
    # with a human-readable explanation) and only then mutates the record.
    # This mirrors the Daxium workflow: no step can be skipped without
    # filling the prerequisite fields that will be rendered on the PDF.
    if to_status == "approved":
        # "Approuver" = accord de principe du Chef de Site (étape 2 Daxium).
        # Prérequis : le demandeur a signé, la revue hiérarchie a répondu
        # oui/non sur le caractère "véritable MOC", et le commentaire
        # d'accord de principe est renseigné.
        errors: list[str] = []
        if not moc.initiator_signature:
            errors.append("la signature du demandeur est requise")
        if moc.is_real_change is None:
            errors.append(
                "la revue hiérarchie doit répondre "
                "« véritable Changement au sens MOC ? » (Oui/Non)"
            )
        if not (moc.site_chief_comment or (comment and comment.strip())):
            errors.append(
                "un commentaire ou avis du Chef de Site est attendu "
                "avant l'accord de principe"
            )
        if errors:
            raise HTTPException(
                400,
                "Approbation impossible — il manque : "
                + "; ".join(errors) + ".",
            )
        moc.site_chief_id = actor.id
        moc.site_chief_approved_at = now
        moc.site_chief_approved = True
        if comment:
            moc.site_chief_comment = comment
    elif to_status == "submitted_to_confirm":
        # Le CDS transmet à la Direction pour confirmation. Prérequis :
        # une signature CDS est apposée (sinon le PDF n'a pas de visa).
        if not moc.site_chief_signature:
            raise HTTPException(
                400,
                "Transmission à la Direction impossible — "
                "la signature du Chef de Site est manquante.",
            )
    elif to_status == "approved_to_study":
        # Directeur confirme la mise à l'étude + fixe la priorité.
        if not payload.get("priority") or payload.get("priority") not in {"1", "2", "3"}:
            raise HTTPException(
                400,
                "Confirmation à étudier impossible — la priorité "
                "(1=haute, 2=normale, 3=basse) doit être renseignée.",
            )
        moc.director_id = actor.id
        moc.director_confirmed_at = now
        if comment:
            moc.director_comment = comment
        moc.priority = payload["priority"]
    elif to_status == "stand_by":
        moc.director_id = moc.director_id or actor.id
        if comment:
            moc.director_comment = comment
    elif to_status == "under_study":
        # Lead process designates the responsible engineer (payload.responsible_id)
        moc.lead_process_id = actor.id
        moc.study_started_at = now
        if payload.get("responsible_id"):
            try:
                moc.responsible_id = UUID(str(payload["responsible_id"]))
            except (ValueError, TypeError):
                raise HTTPException(400, "Invalid responsible_id") from None
    elif to_status == "study_in_validation":
        moc.study_completed_at = now
        if payload.get("estimated_cost_mxaf") is not None:
            try:
                moc.estimated_cost_mxaf = float(payload["estimated_cost_mxaf"])
            except (ValueError, TypeError):
                raise HTTPException(400, "Invalid estimated_cost_mxaf") from None
        if payload.get("cost_bucket") in {"lt_20", "20_to_50", "50_to_100", "gt_100"}:
            moc.cost_bucket = payload["cost_bucket"]
    elif to_status == "validated":
        # All required validations must be completed
        missing = [
            v for v in (moc.validations or [])
            if v.required and not v.approved
        ]
        if missing:
            raise HTTPException(
                400,
                f"Cannot validate: {len(missing)} required role(s) have not approved yet.",
            )
    elif to_status == "execution":
        # CDC / paper form p.5 — "Réalisation du MOC" requires explicit
        # Accord from BOTH DO and DG before execution can start.
        if moc.do_execution_accord is not True:
            raise HTTPException(
                400,
                "Accord du Directeur Opérations requis avant de lancer l'exécution.",
            )
        if moc.dg_execution_accord is not True:
            raise HTTPException(
                400,
                "Accord du Directeur Gaz requis avant de lancer l'exécution.",
            )
        moc.execution_started_at = now
        moc.execution_supervisor_id = actor.id
    elif to_status == "executed_docs_pending":
        moc.execution_completed_at = now
        if payload.get("actual_implementation_date"):
            try:
                from datetime import date as _date
                moc.actual_implementation_date = _date.fromisoformat(
                    str(payload["actual_implementation_date"])
                )
            except ValueError:
                raise HTTPException(400, "Invalid actual_implementation_date") from None
    elif to_status == "closed":
        # CDS closure: PID/ESD must be up to date AND the CDS must have
        # apposed their closing signature at some point. The signature can
        # either be set via POST /moc/{id}/signature (slot=close) before
        # the transition, or captured inline in the transition payload.
        if moc.pid_update_required and not moc.pid_update_completed:
            raise HTTPException(400, "Cannot close: PID update still required.")
        if moc.esd_update_required and not moc.esd_update_completed:
            raise HTTPException(400, "Cannot close: ESD update still required.")
        inline_sig = payload.get("close_signature") if isinstance(payload, dict) else None
        if inline_sig:
            moc.close_signature = inline_sig
        if not moc.close_signature:
            raise HTTPException(
                400,
                "Clôture impossible — la signature de clôture du Chef de Site "
                "est requise (slot=close).",
            )
        moc.close_by = actor.id
        moc.closed_at = now

    moc.status = to_status
    moc.status_changed_at = now

    db.add(MOCStatusHistory(
        moc_id=moc.id,
        old_status=old_status,
        new_status=to_status,
        changed_by=actor.id,
        note=comment,
    ))

    await db.flush()

    # Fire-and-forget notifications (best-effort — failures don't block).
    try:
        await _notify_transition(db, moc=moc, old_status=old_status, actor=actor)
    except Exception:
        logger.exception("MOC notification failed for %s", moc.reference)

    return moc


# ─── Validation matrix upsert ─────────────────────────────────────────────────


async def upsert_validation(
    db: AsyncSession,
    *,
    moc: MOC,
    role: str,
    metier_code: str | None,
    validator: User | None,
    required: bool | None = None,
    completed: bool | None = None,
    approved: bool | None = None,
    level: str | None = None,
    comments: str | None = None,
    signature: str | None = None,
    return_requested: bool | None = None,
    return_reason: str | None = None,
    target_validator_id: UUID | None = None,
) -> MOCValidation:
    """Create or update a validation entry.

    Keyed by (moc_id, role, metier_code, validator_id). When
    `target_validator_id` is provided, the upsert targets the ad-hoc
    invited row for that user — needed once invitations landed in the
    same matrix, otherwise multiple rows for the same (role, metier)
    would surface a MultipleResultsFound error.

    Defaults to the NULL-validator row (i.e. the template/manual row).
    """
    existing_q = select(MOCValidation).where(
        MOCValidation.moc_id == moc.id,
        MOCValidation.role == role,
        (MOCValidation.metier_code == metier_code) if metier_code
        else MOCValidation.metier_code.is_(None),
        (MOCValidation.validator_id == target_validator_id) if target_validator_id
        else MOCValidation.validator_id.is_(None),
    )
    result = await db.execute(existing_q)
    row = result.scalar_one_or_none()
    if row is None:
        row = MOCValidation(
            moc_id=moc.id,
            role=role,
            metier_code=metier_code,
            required=bool(required) if required is not None else False,
            completed=bool(completed) if completed is not None else False,
            approved=approved,
            level=level,
            comments=comments,
        )
        db.add(row)
    else:
        if required is not None:
            row.required = required
        if completed is not None:
            row.completed = completed
        if approved is not None:
            row.approved = approved
        if level is not None:
            row.level = level
        if comments is not None:
            row.comments = comments
    if signature is not None:
        row.signature = signature
    if return_requested is not None:
        row.return_requested = return_requested
    if return_reason is not None:
        row.return_reason = return_reason
    if approved is not None or completed or signature is not None:
        row.validated_at = datetime.now(UTC)
        if validator:
            row.validator_id = validator.id
            row.validator_name = validator.full_name
    await db.flush()
    return row


# ─── Type-driven matrix seeding ───────────────────────────────────────────────


async def seed_matrix_from_type(
    db: AsyncSession, *, moc: MOC, moc_type_id: UUID,
) -> int:
    """Create one MOCValidation row per active rule of the given type.

    Idempotent: if a row already exists for (moc_id, role, metier_code,
    validator_id=NULL), it is left alone. Returns the number of rows
    inserted.
    """
    moc_type = (await db.execute(
        select(MOCType).where(
            MOCType.id == moc_type_id,
            MOCType.entity_id == moc.entity_id,
        )
    )).scalar_one_or_none()
    if moc_type is None:
        return 0

    rules = (await db.execute(
        select(MOCTypeValidationRule)
        .where(
            MOCTypeValidationRule.moc_type_id == moc_type.id,
            MOCTypeValidationRule.active == True,  # noqa: E712
        )
        .order_by(MOCTypeValidationRule.position)
    )).scalars().all()

    existing = (await db.execute(
        select(MOCValidation.role, MOCValidation.metier_code).where(
            MOCValidation.moc_id == moc.id,
            MOCValidation.validator_id.is_(None),
        )
    )).all()
    already = {(r, m) for r, m in existing}

    count = 0
    for rule in rules:
        key = (rule.role, rule.metier_code)
        if key in already:
            continue
        db.add(MOCValidation(
            moc_id=moc.id,
            role=rule.role,
            metier_code=rule.metier_code,
            metier_name=rule.metier_name,
            required=rule.required,
            level=rule.level,
            source="matrix",
        ))
        count += 1
    if count:
        await db.flush()
    return count


async def invite_validator(
    db: AsyncSession,
    *,
    moc: MOC,
    user: User,
    invited_by: User,
    role: str,
    metier_code: str | None = None,
    metier_name: str | None = None,
    level: str | None = None,
    required: bool = True,
    comments: str | None = None,
) -> MOCValidation:
    """Add an ad-hoc validator row pointing at a specific user.

    Distinct from `upsert_validation` because each invite materialises a
    row keyed by validator_id — so multiple users can be invited for the
    same role (e.g. two lead_process reviewers).
    """
    existing = (await db.execute(
        select(MOCValidation).where(
            MOCValidation.moc_id == moc.id,
            MOCValidation.role == role,
            (MOCValidation.metier_code == metier_code) if metier_code
            else MOCValidation.metier_code.is_(None),
            MOCValidation.validator_id == user.id,
        )
    )).scalar_one_or_none()
    if existing:
        # Refresh metadata but don't duplicate
        if level is not None:
            existing.level = level
        if required is not None:
            existing.required = required
        if comments is not None:
            existing.comments = comments
        await db.flush()
        return existing

    row = MOCValidation(
        moc_id=moc.id,
        role=role,
        metier_code=metier_code,
        metier_name=metier_name,
        validator_id=user.id,
        validator_name=user.full_name or user.email,
        level=level,
        required=required,
        comments=comments,
        source="invite",
        invited_by=invited_by.id,
        invited_at=datetime.now(UTC),
    )
    db.add(row)
    await db.flush()
    return row


# ─── Notifications ────────────────────────────────────────────────────────────


# Map destination roles per target status. Notifications are sent to every
# user holding the corresponding OpsFlux role on the MOC's entity.
NOTIFY_ROLES_BY_STATUS: dict[str, list[str]] = {
    "created": ["SITE_CHIEF"],
    "approved": ["DIRECTOR"],
    "submitted_to_confirm": ["DIRECTOR"],
    "approved_to_study": ["LEAD_PROCESS"],
    "under_study": ["PROCESS_ENGINEER"],
    "study_in_validation": [
        "HSE", "MAINTENANCE_MANAGER", "DIRECTOR", "LEAD_PROCESS",
    ],
    "validated": ["SITE_CHIEF"],
    "execution": ["SITE_CHIEF"],
    "executed_docs_pending": ["PROCESS_ENGINEER"],
}


async def _notify_transition(
    db: AsyncSession, *, moc: MOC, old_status: str | None, actor: User
) -> None:
    """Dispatch in-app + email notifications to the recipients of the new status.

    The email template is picked by status: `moc.created`, `moc.validated`,
    `moc.cancelled`, `moc.closed` have dedicated templates; every other
    transition uses the generic `moc.awaiting_validation` template.
    """
    target_roles = NOTIFY_ROLES_BY_STATUS.get(moc.status, [])
    if not target_roles:
        return

    # Resolve users holding any of the MOC roles on this entity. We check each
    # user for *any* matching OpsFlux role code — defensive in case customers
    # haven't seeded the canonical MOC_* roles.
    from app.api.deps import has_user_permission

    active_users = await db.execute(
        select(User).where(User.active == True, User.id != actor.id)  # noqa: E712
    )
    user_list = active_users.scalars().all()

    # Map role → permission we test: we can't test role membership directly
    # without touching UserGroupRole tables here. Fall back to permission-
    # based addressing using canonical permissions.
    ROLE_TO_PERM = {
        "SITE_CHIEF": "moc.site_chief.approve",
        "DIRECTOR": "moc.director.confirm",
        "LEAD_PROCESS": "moc.lead_process.start_study",
        "PROCESS_ENGINEER": "moc.responsible.submit_study",
        "HSE": "moc.hse.validate",
        "MAINTENANCE_MANAGER": "moc.maintenance.validate",
    }
    # Map MOC_* role → moc_site_assignments role (for site-scoped filtering)
    ROLE_TO_SITE_ROLE = {
        "SITE_CHIEF": "site_chief",
        "DIRECTOR": "director",
        "LEAD_PROCESS": "lead_process",
        "HSE": "hse",
        "MAINTENANCE_MANAGER": "maintenance_manager",
    }
    perms_to_test = {ROLE_TO_PERM[r] for r in target_roles if r in ROLE_TO_PERM}
    site_roles = {
        ROLE_TO_SITE_ROLE[r] for r in target_roles if r in ROLE_TO_SITE_ROLE
    }

    # Prefer site assignments when at least one explicit mapping exists for
    # this site. Falls back to permission-scan if no assignment is registered
    # (keeps the module usable out of the box).
    from app.models.moc import MOCSiteAssignment

    site_assignment_user_ids: set[UUID] = set()
    if site_roles:
        r = await db.execute(
            select(MOCSiteAssignment.user_id).where(
                MOCSiteAssignment.entity_id == moc.entity_id,
                MOCSiteAssignment.site_label == moc.site_label,
                MOCSiteAssignment.role.in_(site_roles),
                MOCSiteAssignment.active == True,  # noqa: E712
            )
        )
        site_assignment_user_ids = {row[0] for row in r.all()}

    recipients: list[User] = []
    if site_assignment_user_ids:
        # Use explicit site assignments — precise targeting
        for user in user_list:
            if user.id in site_assignment_user_ids:
                recipients.append(user)
    else:
        # Fallback: permission-based broadcast on the entity
        for user in user_list:
            for perm in perms_to_test:
                try:
                    if await has_user_permission(user, moc.entity_id, perm, db):
                        recipients.append(user)
                        break
                except Exception:
                    continue

    # For cancelled / closed, always include the initiator (they may not hold
    # any of the MOC_* permissions but must be kept in the loop).
    if moc.status in ("cancelled", "closed"):
        initiator = await db.get(User, moc.initiator_id)
        if initiator and initiator.id != actor.id and initiator not in recipients:
            recipients.append(initiator)

    if not recipients:
        return

    status_label = _humanise_status(moc.status)
    title = f"MOC {moc.reference} — {status_label}"
    body = (
        f"Le MOC « {(moc.objectives or moc.description or moc.reference)[:120]} » "
        f"est passé de {_humanise_status(old_status or 'created')} à "
        f"{status_label} par {actor.full_name or actor.email}."
    )
    link_path = f"/moc?id={moc.id}"

    # 1. In-app notifications (bulk, fast) ─────────────────────────────────
    try:
        from app.core.notifications import send_in_app_bulk
        await send_in_app_bulk(
            db,
            user_ids=[u.id for u in recipients],
            entity_id=moc.entity_id,
            title=title,
            body=body,
            category="info",
            link=link_path,
            event_type=f"moc.{moc.status}",
        )
    except Exception:
        logger.exception("send_in_app_bulk failed for MOC %s", moc.reference)

    # 2. Email notifications (per-user — best effort) ─────────────────────
    # Template slug per transition. The generic `moc.awaiting_validation`
    # covers every mid-flow step; dedicated templates for milestones.
    template_slug = {
        "created": "moc.created",
        "validated": "moc.validated",
        "cancelled": "moc.cancelled",
        "closed": "moc.closed",
    }.get(moc.status, "moc.awaiting_validation")

    try:
        from app.core.email_templates import render_and_send_email
    except Exception:
        return

    origin = "https://app.opsflux.io"  # overriden by entity setting in template engine
    variables = {
        "reference": moc.reference,
        "objectives": (moc.objectives or moc.description or "")[:300],
        "site_label": moc.site_label,
        "platform_code": moc.platform_code,
        "status_label": status_label,
        "actor_name": actor.full_name or actor.email,
        "comment": None,  # populated by caller if relevant
        "link": f"{origin}{link_path}",
    }

    for user in recipients:
        if not user.email:
            continue
        try:
            await render_and_send_email(
                db,
                slug=template_slug,
                entity_id=moc.entity_id,
                language=user.language or "fr",
                to=user.email,
                variables=variables,
                category="moc",
            )
        except Exception:
            logger.debug(
                "MOC email failed for %s (slug=%s, user=%s)",
                moc.reference, template_slug, user.email,
                exc_info=True,
            )


def _humanise_status(s: str) -> str:
    mapping = {
        "created": "Créé",
        "approved": "Approuvé",
        "submitted_to_confirm": "Soumis à confirmer",
        "cancelled": "Annulé",
        "stand_by": "Stand-by",
        "approved_to_study": "Confirmé à étudier",
        "under_study": "En étude Process",
        "study_in_validation": "Étudié en validation",
        "validated": "Validé à exécuter",
        "execution": "Exécution",
        "executed_docs_pending": "Exécuté, PID/ESD à mettre à jour",
        "closed": "Clôturé",
    }
    return mapping.get(s, s)
