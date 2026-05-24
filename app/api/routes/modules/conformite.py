"""Conformite (compliance) module routes — types, rules, records."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, select, func as sqla_func, literal, any_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.api.deps import check_verified_lock, get_current_entity, get_current_user, require_module_enabled, require_permission
from app.core.database import get_db
from app.core.references import generate_reference
from app.services.core.audit_service import add_event as add_audit_event
from app.services.core.delete_service import delete_entity, get_delete_policy
from app.services.modules import compliance_service
from app.services.modules.compliance_audit_scoring import (
    audit_response_has_content,
    audit_thresholds_or_default,
    classify_audit_score,
    normalize_audit_score_thresholds,
)
from app.services.modules.compliance_audit_presets import (
    get_audit_template_preset,
    list_audit_template_presets,
    missing_audit_template_preset_codes,
)
from app.services.modules.moc_service import create_contextual_moc, transition as transition_moc
from app.services.connectors.compliance_connector import create_connector
from app.services.modules.compliance_external_verification import apply_external_certificate_result
from app.core.events import emit_event
from app.core.pagination import PaginationParams, paginate
from app.models.common import (
    ComplianceType, ComplianceTypeAuthorizedCenter, ComplianceRule, ComplianceRuleHistory, ComplianceRecord, ComplianceExemption,
    ComplianceAudit, ComplianceAuditAnswer, ComplianceAuditQuestion, ComplianceAuditTemplate, ComplianceAuditTheme,
    Entity, JobPosition, TierContactTransfer, TierContact, Tier, Attachment, ContactEmail,
    User, UserEmail, Phone, Setting, UserGroup, UserGroupMember,
)
from app.models.moc import MOCValidation
from app.schemas.common import (
    PaginatedResponse,
    ComplianceTypeCreate, ComplianceTypeRead, ComplianceTypeUpdate,
    ComplianceAuthorizedCenterCreate, ComplianceAuthorizedCenterRead, ComplianceAuthorizedCenterUpdate,
    ComplianceRuleCreate, ComplianceRuleRead, ComplianceRuleUpdate, ComplianceRuleHistoryRead,
    ComplianceRecordCreate, ComplianceRecordRead, ComplianceRecordUpdate,
    ComplianceCheckResult,
    ComplianceExemptionCreate, ComplianceExemptionRead, ComplianceExemptionUpdate,
    ComplianceAuditAnswerUpsert, ComplianceAuditCreate, ComplianceAuditRead, ComplianceAuditSubmit,
    ComplianceAuditTemplateCreate, ComplianceAuditTemplateRead, ComplianceAuditTemplateUpdate, ComplianceAuditUpdate,
    JobPositionCreate, JobPositionRead, JobPositionUpdate,
    TierContactTransferCreate, TierContactTransferRead,
    TierRead,
)
from app.schemas.moc import MOCContextCreate, MOCInitialValidator
router = APIRouter(
    prefix="/api/v1/conformite",
    tags=["conformite"],
    dependencies=[require_module_enabled("conformite")],
)

AUDIT_EDITABLE_STATUSES = {"draft", "in_progress", "rejected"}
AUDIT_LOCKED_STATUSES = {"submitted", "in_review", "validated", "closed"}


def _ensure_audit_can_be_edited(audit: ComplianceAudit) -> None:
    if audit.status not in AUDIT_EDITABLE_STATUSES:
        raise HTTPException(
            409,
            "This audit report is locked. Only draft, in-progress or rejected audits can be edited.",
        )


def _ensure_audit_can_be_submitted(audit: ComplianceAudit) -> None:
    if audit.status in AUDIT_LOCKED_STATUSES:
        raise HTTPException(
            409,
            "This audit report is already submitted, validated or closed.",
        )


def _audit_answer_is_answered(answer: ComplianceAuditAnswer) -> bool:
    return answer.score is not None or audit_response_has_content(answer.response_value)


def _snapshot_rule(rule: ComplianceRule) -> dict:
    """Create a JSON snapshot of a rule's current state for history."""
    return {
        "compliance_type_id": str(rule.compliance_type_id),
        "subject_scope": rule.subject_scope,
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description,
        "active": rule.active,
        "version": rule.version,
        "priority": rule.priority,
        "override_validity_days": rule.override_validity_days,
        "grace_period_days": rule.grace_period_days,
        "renewal_reminder_days": rule.renewal_reminder_days,
        "effective_from": str(rule.effective_from) if rule.effective_from else None,
        "effective_to": str(rule.effective_to) if rule.effective_to else None,
        "condition_json": rule.condition_json,
    }


async def _enrich_audit_target(db: AsyncSession, audit: ComplianceAudit) -> ComplianceAudit:
    if audit.target_type == "tier":
        tier = await db.get(Tier, audit.target_id)
        setattr(audit, "target_name", tier.name if tier else None)
    if audit.template:
        setattr(audit, "score_category", classify_audit_score(audit.score_percent, audit.template.score_thresholds))
    return audit


async def _enrich_audit_answer_attachment_counts(
    db: AsyncSession,
    audits: list[ComplianceAudit],
) -> None:
    answer_ids = [
        answer.id
        for audit in audits
        for answer in (audit.answers or [])
        if answer.id is not None
    ]
    if not answer_ids:
        return
    rows = await db.execute(
        select(
            Attachment.owner_id,
            sqla_func.count(Attachment.id).label("attachment_count"),
        )
        .where(
            Attachment.owner_type == "compliance_audit_answer",
            Attachment.owner_id.in_(answer_ids),
            Attachment.archived == False,  # noqa: E712
        )
        .group_by(Attachment.owner_id)
    )
    counts = {owner_id: int(count) for owner_id, count in rows.all()}
    for audit in audits:
        for answer in (audit.answers or []):
            setattr(answer, "attachment_count", counts.get(answer.id, 0))


async def _count_audit_answer_proofs(db: AsyncSession, audit: ComplianceAudit) -> int:
    """Count all proof attachments linked to answers of a supplier audit."""
    answer_ids = [answer.id for answer in (audit.answers or []) if answer.id is not None]
    if not answer_ids:
        return 0
    count = await db.scalar(
        select(sqla_func.count(Attachment.id)).where(
            Attachment.owner_type == "compliance_audit_answer",
            Attachment.owner_id.in_(answer_ids),
            Attachment.archived == False,  # noqa: E712
        )
    )
    return int(count or 0)


def _audit_read_options():
    return (
        selectinload(ComplianceAudit.template)
        .selectinload(ComplianceAuditTemplate.themes)
        .selectinload(ComplianceAuditTheme.questions),
        selectinload(ComplianceAudit.answers),
    )


async def _load_audit_for_read(db: AsyncSession, audit_id: UUID, entity_id: UUID) -> ComplianceAudit:
    result = await db.execute(
        select(ComplianceAudit)
        .options(*_audit_read_options())
        .where(ComplianceAudit.id == audit_id, ComplianceAudit.entity_id == entity_id)
    )
    audit = result.scalars().unique().one()
    await _enrich_audit_target(db, audit)
    await _enrich_audit_answer_attachment_counts(db, [audit])
    return audit


def _audit_pdf_date(value) -> str:
    if value is None:
        return "-"
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y %H:%M")
    if isinstance(value, date):
        return value.strftime("%d/%m/%Y")
    return str(value)


def _audit_answer_display(value: dict | None) -> str:
    if not value:
        return "-"
    raw = value.get("label") or value.get("value") or value.get("text")
    return str(raw).strip() if raw else "-"


def _audit_plain_text(value: str | None) -> str:
    if not value:
        return ""
    import re
    return re.sub(r"<[^>]+>", " ", value).replace("&nbsp;", " ").strip()


async def _build_audit_report_variables(
    db: AsyncSession,
    *,
    audit: ComplianceAudit,
    entity_id: UUID,
) -> dict:
    import math
    entity = await db.get(Entity, entity_id)
    tier = await db.get(Tier, audit.target_id) if audit.target_type == "tier" else None
    answers_by_question = {answer.question_id: answer for answer in audit.answers or []}
    themes = []
    total_questions = 0
    answered_questions = 0
    missing_required = 0
    missing_evidence = 0
    # Phase 2 : extraire les questions problematiques pour Plan d'action
    # (score < passing OR missing required OR missing evidence)
    passing_score_num = float(audit.template.passing_score) if audit.template and audit.template.passing_score is not None else 70.0
    action_items: list[dict] = []
    for theme in sorted(audit.template.themes if audit.template else [], key=lambda row: row.position):
        question_rows = []
        theme_score_sum = 0.0  # somme ponderee des scores
        theme_weight_sum = 0.0
        for question in sorted(theme.questions or [], key=lambda row: row.position):
            total_questions += 1
            answer = answers_by_question.get(question.id)
            answered = bool(answer and (answer.score is not None or answer.response_value is not None))
            if answered:
                answered_questions += 1
            if question.required and not answered:
                missing_required += 1
            attachment_count = int(getattr(answer, "attachment_count", 0) or 0) if answer else 0
            evidence_missing = bool(question.attachment_required and attachment_count <= 0)
            if evidence_missing:
                missing_evidence += 1
            question_score_num: float | None = float(answer.score) if answer and answer.score is not None else None
            # Phase 2 : agregation thème (ponderation par poids question)
            q_weight = float(question.weight or 1.0)
            if question_score_num is not None and q_weight > 0:
                theme_score_sum += question_score_num * q_weight
                theme_weight_sum += q_weight
            # Phase 2 : detection issue plan d'action
            issue_kind = None
            if question.required and not answered:
                issue_kind = "missing_required"
            elif evidence_missing:
                issue_kind = "missing_evidence"
            elif question_score_num is not None and question_score_num < passing_score_num:
                issue_kind = "below_passing"
            if issue_kind:
                action_items.append({
                    "kind": issue_kind,
                    "theme": theme.title,
                    "code": question.code or "",
                    "text": question.text,
                    "score": f"{question_score_num:.0f}%" if question_score_num is not None else "—",
                    "score_num": question_score_num,
                    "notes": _audit_plain_text(answer.notes if answer else None),
                    "required": question.required,
                    "attachment_required": question.attachment_required,
                    "attachment_count": attachment_count,
                })
            question_rows.append({
                "code": question.code or "",
                "text": question.text,
                "required": question.required,
                "attachment_required": question.attachment_required,
                "answer": _audit_answer_display(answer.response_value if answer else None),
                "score": f"{question_score_num:.0f}%" if question_score_num is not None else "-",
                "notes": _audit_plain_text(answer.notes if answer else None),
                "attachment_count": attachment_count,
            })
        # Score thème = moyenne ponderee, None si rien de note
        theme_score = (theme_score_sum / theme_weight_sum) if theme_weight_sum > 0 else None
        themes.append({
            "title": theme.title,
            "description": theme.description or "",
            "weight": float(theme.weight or 0),
            "questions": question_rows,
            "score_num": theme_score,
            "score": f"{theme_score:.0f}%" if theme_score is not None else "—",
        })
    # Tri Plan d'action : missing_required en premier, puis below_passing
    # par score croissant (les pires d'abord), puis missing_evidence.
    _kind_order = {"missing_required": 0, "below_passing": 1, "missing_evidence": 2}
    action_items.sort(key=lambda it: (_kind_order.get(it["kind"], 9), it["score_num"] if it["score_num"] is not None else 0))

    # Phase 2 : radar SVG pre-calcule (coords cote Python pour rendre le
    # template HTML lisible). Polygone regulier centre (200, 200), rayon 150.
    radar_axes: list[dict] = []
    radar_polygon_points: list[str] = []
    n = len(themes)
    if n >= 3:  # un radar a moins de 3 axes est degenere
        cx, cy, r_max = 200.0, 200.0, 150.0
        for i, theme in enumerate(themes):
            # Angle depart en haut (-pi/2), tournant horaire
            angle = -math.pi / 2 + (2 * math.pi * i / n)
            # Coord du bout d'axe (label) et de la valeur (polygone)
            ax = cx + r_max * math.cos(angle)
            ay = cy + r_max * math.sin(angle)
            value_pct = (theme["score_num"] or 0) / 100.0
            vx = cx + r_max * value_pct * math.cos(angle)
            vy = cy + r_max * value_pct * math.sin(angle)
            # Position label : un peu au-dela du bout d'axe
            lx = cx + (r_max + 18) * math.cos(angle)
            ly = cy + (r_max + 18) * math.sin(angle)
            # Anchor texte selon position relative
            if abs(math.cos(angle)) < 0.3:
                anchor = "middle"
            elif math.cos(angle) > 0:
                anchor = "start"
            else:
                anchor = "end"
            radar_axes.append({
                "label": theme["title"],
                "score": theme["score"],
                "ax": round(ax, 2), "ay": round(ay, 2),
                "lx": round(lx, 2), "ly": round(ly, 2),
                "anchor": anchor,
                "vx": round(vx, 2), "vy": round(vy, 2),
            })
            radar_polygon_points.append(f"{round(vx, 2)},{round(vy, 2)}")
    radar_polygon = " ".join(radar_polygon_points)

    # Phase 3 : validators MOC (si validation_moc_id existe)
    # Recupere les MOCValidation rows + leurs users pour bloc signatures dynamique.
    validators_data: list[dict] = []
    if audit.validation_moc_id:
        val_q = await db.execute(
            select(MOCValidation, User)
            .outerjoin(User, MOCValidation.validator_id == User.id)
            .where(MOCValidation.moc_id == audit.validation_moc_id)
            .order_by(MOCValidation.created_at)
        )
        for mv, user in val_q.all():
            # Status mapping : approved=True => "approved" ; approved=False => "rejected" ;
            # approved=None + completed=True => "abstained" ; sinon "pending"
            if mv.approved is True:
                status = "approved"
            elif mv.approved is False:
                status = "rejected"
            elif mv.completed:
                status = "abstained"
            else:
                status = "pending"
            display_name = mv.validator_name or (f"{user.first_name} {user.last_name}".strip() if user else "Validateur en attente")
            role_label = mv.role
            if mv.role == "metier" and mv.metier_name:
                role_label = mv.metier_name
            validators_data.append({
                "role": role_label,
                "role_raw": mv.role,
                "metier_code": mv.metier_code,
                "name": display_name,
                "status": status,
                "validated_at": _audit_pdf_date(mv.validated_at) if mv.validated_at else None,
                "comments": _audit_plain_text(mv.comments) if mv.comments else None,
                "signature": mv.signature,  # base64 data URL ou None
                "required": mv.required,
                "level": mv.level,
            })

    # Phase 2 : audit precedent (meme target, status validated, started_at < current)
    previous_audit_data: dict | None = None
    if audit.target_type and audit.target_id and audit.started_at:
        prev_q = await db.execute(
            select(ComplianceAudit)
            .where(
                ComplianceAudit.entity_id == entity_id,
                ComplianceAudit.target_type == audit.target_type,
                ComplianceAudit.target_id == audit.target_id,
                ComplianceAudit.id != audit.id,
                ComplianceAudit.status.in_(["validated", "submitted", "completed"]),
                ComplianceAudit.score_percent.isnot(None),
            )
            .order_by(ComplianceAudit.started_at.desc())
            .limit(1)
        )
        prev = prev_q.scalars().first()
        if prev:
            prev_score = float(prev.score_percent) if prev.score_percent is not None else None
            cur_score = float(audit.score_percent) if audit.score_percent is not None else None
            delta = None
            if prev_score is not None and cur_score is not None:
                delta = cur_score - prev_score
            previous_audit_data = {
                "reference": prev.reference,
                "score": f"{prev_score:.0f}%" if prev_score is not None else "—",
                "started_at": _audit_pdf_date(prev.started_at),
                "delta": f"{'+' if delta and delta > 0 else ''}{delta:.0f} pts" if delta is not None else None,
                "delta_num": delta,
            }
    return {
        "entity": {
            "name": entity.name if entity else "",
            "code": entity.code if entity else "",
            "logo_url": entity.logo_url if entity else None,
        },
        "audit": {
            "reference": audit.reference,
            "title": audit.title,
            "status": audit.status,
            "score": f"{float(audit.score_percent):.0f}%" if audit.score_percent is not None else "-",
            "score_category": (classify_audit_score(audit.score_percent, audit.template.score_thresholds) or {}).get("label", ""),
            "planned_at": _audit_pdf_date(audit.planned_at),
            "started_at": _audit_pdf_date(audit.started_at),
            "submitted_at": _audit_pdf_date(audit.submitted_at),
            "validated_at": _audit_pdf_date(audit.validated_at),
            "valid_until": _audit_pdf_date(audit.valid_until),
            "summary": _audit_plain_text(audit.summary),
            "validation_workflow_id": str(audit.validation_moc_id) if audit.validation_moc_id else "",
        },
        "template": {
            "code": audit.template.code if audit.template else "",
            "name": audit.template.name if audit.template else "",
            "audit_type": audit.template.audit_type if audit.template else "",
            "passing_score": f"{float(audit.template.passing_score):.0f}%" if audit.template else "-",
            "score_thresholds": audit_thresholds_or_default(audit.template.score_thresholds if audit.template else None),
        },
        "supplier": {
            "name": tier.name if tier else str(audit.target_id),
            "code": tier.code if tier else "",
            "type": tier.type if tier else "",
            "country": tier.country if tier else "",
            "logo_url": tier.logo_url if tier else None,
        },
        "metrics": {
            "total_questions": total_questions,
            "answered_questions": answered_questions,
            "missing_required": missing_required,
            "missing_evidence": missing_evidence,
        },
        "themes": themes,
        "action_items": action_items,
        "radar": {
            "axes": radar_axes,
            "polygon": radar_polygon,
            "available": len(radar_axes) >= 3,
        },
        "previous_audit": previous_audit_data,
        "validators": validators_data,
        "generated_at": _audit_pdf_date(datetime.now(timezone.utc)),
    }


_SUPPLIER_AUDIT_REPORT_FALLBACK_HTML = """
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page {
      size: A4; margin: 22mm 13mm 18mm;
      @top-left {
        content: "{{ entity.name }} &middot; Audit {{ template.audit_type|capitalize }}";
        font-family: Arial, sans-serif; font-size: 8px; color: #475569;
        font-weight: 600; border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4mm; vertical-align: top;
      }
      @top-right {
        content: "{{ supplier.name }}";
        font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 4mm; vertical-align: top;
      }
      @bottom-left {
        content: "OpsFlux &middot; Confidentiel &middot; " counter(page) " / " counter(pages);
        font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8;
      }
      @bottom-right {
        content: "{{ audit.reference }}";
        font-family: Arial, sans-serif; font-size: 8px; color: #94a3b8;
      }
    }
    @page :first {
      margin: 0;
      @top-left { content: ""; border-bottom: none; }
      @top-right { content: ""; border-bottom: none; }
      @bottom-left { content: ""; }
      @bottom-right { content: ""; }
    }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10px; line-height: 1.42; }
    /* Phase 3 : logos dans la cover */
    .cover-head { position: relative; }
    .cover-entity-logo {
      position: absolute; top: 12mm; right: 16mm;
      max-height: 22mm; max-width: 50mm; opacity: .95;
    }
    .cover-supplier-logo {
      max-height: 18mm; max-width: 40mm;
      vertical-align: middle; margin-right: 10px;
      border: 1px solid #e2e8f0; padding: 4px; background: #fff; border-radius: 3px;
    }
    .supplier-row { display: table; width: 100%; margin-bottom: 6px; }
    .supplier-row .logo-cell { display: table-cell; vertical-align: middle; width: 50mm; }
    .supplier-row .name-cell { display: table-cell; vertical-align: middle; }
    /* Phase 3 : validators dynamiques */
    .validators-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .validators-table th {
      background: #f1f5f9; color: #475569; font-size: 8px; text-transform: uppercase;
      letter-spacing: .5px; padding: 7px; border: 1px solid #d7dde8; text-align: left;
    }
    .validators-table td {
      padding: 8px; border: 1px solid #e5e7eb; vertical-align: top;
    }
    .v-name { font-weight: 700; color: #0f172a; }
    .v-role { font-size: 8px; color: #64748b; text-transform: uppercase; letter-spacing: .5px; margin-top: 2px; }
    .v-comments { font-size: 9px; color: #475569; font-style: italic; margin-top: 3px; }
    .v-status { padding: 3px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; display: inline-block; }
    .v-status.approved { color: #166534; background: #dcfce7; }
    .v-status.rejected { color: #991b1b; background: #fee2e2; }
    .v-status.pending  { color: #92400e; background: #fef3c7; }
    .v-status.abstained { color: #334155; background: #e2e8f0; }
    .v-signature { max-height: 22mm; max-width: 60mm; vertical-align: middle; }
    .v-sig-empty { color: #cbd5e1; font-size: 8px; font-style: italic; }
    .cover { page-break-after: always; min-height: 265mm; position: relative; }
    .cover-head { background: #0f2f57; color: #fff; padding: 28mm 16mm 16mm; border-bottom: 7px solid #2563eb; }
    .eyebrow { font-size: 8px; letter-spacing: 1.8px; text-transform: uppercase; color: #bfdbfe; }
    .cover h1 { margin: 8px 0 0; font-size: 32px; line-height: 1.05; }
    .cover-sub { margin-top: 8px; font-size: 13px; color: #dbeafe; }
    .cover-body { padding: 14mm 16mm; }
    .supplier { font-size: 24px; font-weight: 800; margin: 4px 0; }
    .muted { color: #64748b; }
    .grid { display: table; width: 100%; border-collapse: separate; border-spacing: 8px; }
    .cell { display: table-cell; vertical-align: top; }
    .card { border: 1px solid #d7dde8; background: #fff; border-radius: 5px; padding: 12px; }
    .card.blue { background: #eff6ff; border-color: #bfdbfe; }
    .card.red { background: #fff1f2; border-color: #fecdd3; }
    .card.green { background: #ecfdf5; border-color: #bbf7d0; }
    .label { color: #64748b; font-size: 8px; letter-spacing: 1px; text-transform: uppercase; font-weight: 700; }
    .value { margin-top: 4px; font-size: 19px; font-weight: 800; color: #0f172a; }
    .section { margin: 0 0 10px; padding-bottom: 6px; border-bottom: 2px solid #1d4ed8; color: #0f2f57; font-size: 17px; }
    .section-small { margin: 18px 0 8px; color: #0f2f57; font-size: 13px; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; page-break-inside: auto; }
    thead { display: table-header-group; }
    th { background: #f1f5f9; color: #475569; text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: .5px; padding: 7px; border: 1px solid #d7dde8; }
    td { padding: 7px; border: 1px solid #e5e7eb; vertical-align: top; }
    tr { page-break-inside: avoid; }
    .qcode { font-family: Consolas, "Courier New", monospace; color: #64748b; font-size: 8px; }
    .qtext { font-weight: 700; }
    .qrequired { display: inline-block; font-size: 7px; padding: 2px 5px; background: #fef3c7; color: #92400e; border-radius: 3px; margin-left: 4px; }
    .badge { display: inline-block; padding: 3px 7px; border-radius: 999px; font-size: 9px; font-weight: 700; }
    .badge.ok { color: #166534; background: #dcfce7; }
    .badge.warn { color: #92400e; background: #fef3c7; }
    .badge.bad { color: #991b1b; background: #fee2e2; }
    .badge.unk, .badge.neutral { color: #334155; background: #e2e8f0; }
    .finding { border-left: 4px solid #dc2626; background: #fff7ed; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; }
    .finding-title { font-weight: 800; color: #991b1b; }
    .theme-title { background: #f8fafc; border-left: 4px solid #2563eb; padding: 8px 10px; margin-top: 14px; font-size: 13px; font-weight: 800; }
    .theme-title span { font-size: 9px; font-weight: 600; color: #64748b; margin-left: 6px; }
    .signatures { page-break-inside: avoid; margin-top: 20px; }
    .sig { display: table; width: 100%; border-spacing: 12px 0; }
    .sig-box { display: table-cell; width: 33.33%; height: 78px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 10px; }
    .small { font-size: 8px; }
    .footer-note { position: absolute; left: 16mm; right: 16mm; bottom: 12mm; color: #64748b; font-size: 8px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  {%- set score_num = audit.score|replace('%','')|trim -%}
  {%- set passing_num = template.passing_score|replace('%','')|trim -%}
  {%- if score_num and score_num != '-' -%}
    {%- set score_f = score_num|float -%}
    {%- set passing_f = passing_num|float if passing_num and passing_num != '-' else 70.0 -%}
    {%- if score_f >= passing_f -%}{%- set verdict_class = 'ok' -%}
    {%- elif score_f >= passing_f - 15 -%}{%- set verdict_class = 'warn' -%}
    {%- else -%}{%- set verdict_class = 'bad' -%}
    {%- endif -%}
  {%- else -%}
    {%- set score_f = 0 -%}{%- set passing_f = 70.0 -%}{%- set verdict_class = 'unk' -%}
  {%- endif -%}

  <div class="cover">
    <div class="cover-head">
      {% if entity.logo_url %}<img class="cover-entity-logo" src="{{ entity.logo_url }}" alt="{{ entity.name }}"/>{% endif %}
      <div class="eyebrow">{{ entity.name or 'OpsFlux' }} &middot; conformit&eacute; fournisseurs</div>
      <h1>Rapport d&rsquo;audit fournisseur</h1>
      <div class="cover-sub">{{ template.name or template.audit_type or 'Audit fournisseur' }}</div>
    </div>
    <div class="cover-body">
      <div class="label">Fournisseur audit&eacute;</div>
      <div class="supplier-row">
        {% if supplier.logo_url %}
        <div class="logo-cell">
          <img class="cover-supplier-logo" src="{{ supplier.logo_url }}" alt="{{ supplier.name }}"/>
        </div>
        {% endif %}
        <div class="name-cell">
          <div class="supplier">{{ supplier.name }}</div>
          <div class="muted">
            {{ supplier.code or 'Sans code' }}{% if supplier.type %} &middot; {{ supplier.type|capitalize }}{% endif %}{% if supplier.country %} &middot; {{ supplier.country }}{% endif %}
          </div>
        </div>
      </div>
      <div class="grid" style="margin-top:20px">
        <div class="cell card {{ 'green' if verdict_class == 'ok' else ('red' if verdict_class == 'bad' else 'blue') }}">
          <div class="label">Score global</div><div class="value">{{ audit.score }}</div><div class="muted">Seuil: {{ template.passing_score }}</div>
        </div>
        <div class="cell card">
          <div class="label">D&eacute;cision</div>
          <div class="value" style="font-size:15px">{{ audit.score_category if audit.score_category else ('Conforme' if verdict_class == 'ok' else ('Sous surveillance' if verdict_class == 'warn' else ('Non conforme' if verdict_class == 'bad' else 'En attente'))) }}</div>
          <div class="muted">{{ metrics.answered_questions }}/{{ metrics.total_questions }} questions trait&eacute;es</div>
        </div>
        <div class="cell card {{ 'red' if metrics.missing_required or metrics.missing_evidence else 'green' }}">
          <div class="label">Points bloquants</div><div class="value">{{ metrics.missing_required + metrics.missing_evidence }}</div><div class="muted">{{ metrics.missing_required }} obligatoire(s), {{ metrics.missing_evidence }} preuve(s)</div>
        </div>
      </div>
      <table style="margin-top:20px">
        <tr><td><strong>R&eacute;f&eacute;rence audit</strong></td><td>{{ audit.reference }}</td></tr>
        <tr><td><strong>Type / mod&egrave;le</strong></td><td>{{ template.audit_type|capitalize }} &mdash; {{ template.name }}</td></tr>
        <tr><td><strong>Statut</strong></td><td>{{ audit.status|capitalize }}</td></tr>
        <tr><td><strong>Validit&eacute;</strong></td><td>{{ audit.valid_until or 'A d&eacute;finir' }}</td></tr>
        <tr><td><strong>Workflow de validation</strong></td><td>{{ audit.validation_workflow_id or 'Non lanc&eacute;' }}</td></tr>
      </table>
    </div>
    <div class="footer-note">Document confidentiel, g&eacute;n&eacute;r&eacute; par OpsFlux le {{ generated_at }}. Les preuves et r&eacute;ponses sont archiv&eacute;es dans le dossier audit; ce rapport est une restitution exploitable pour revue ISO, qualification fournisseur et d&eacute;cision contractuelle.</div>
  </div>

  <h1 class="section">1. Synth&egrave;se d&eacute;cisionnelle</h1>
  <div class="grid">
    <div class="cell card"><div class="label">Score</div><div class="value">{{ audit.score }}</div></div>
    <div class="cell card"><div class="label">Seuil</div><div class="value">{{ template.passing_score }}</div></div>
    <div class="cell card"><div class="label">Traitement</div><div class="value">{{ metrics.answered_questions }}/{{ metrics.total_questions }}</div></div>
    <div class="cell card"><div class="label">Preuves manquantes</div><div class="value">{{ metrics.missing_evidence }}</div></div>
  </div>
  {% if audit.summary %}<div class="card blue"><strong>Synth&egrave;se auditeur</strong><br>{{ audit.summary }}</div>{% endif %}

  <h2 class="section-small">Seuils de qualification</h2>
  <table>
    <thead><tr><th>Cat&eacute;gorie</th><th>Score minimum</th><th>Effet</th></tr></thead>
    <tbody>
      {% for threshold in template.score_thresholds %}
        <tr><td><strong>{{ threshold.label or threshold.code }}</strong></td><td>{{ threshold.min_score }}%</td><td>{% if threshold.blocks_assignment %}Bloquant{% else %}Qualification{% endif %}</td></tr>
      {% endfor %}
    </tbody>
  </table>

  <h1 class="section">2. P&eacute;rim&egrave;tre et tra&ccedil;abilit&eacute;</h1>
  <table>
    <tr><td><strong>Entit&eacute;</strong></td><td>{{ entity.name }}{% if entity.code %} ({{ entity.code }}){% endif %}</td></tr>
    <tr><td><strong>Fournisseur</strong></td><td>{{ supplier.name }}{% if supplier.code %} &mdash; {{ supplier.code }}{% endif %}</td></tr>
    <tr><td><strong>Audit planifi&eacute;</strong></td><td>{{ audit.planned_at or '-' }}</td></tr>
    <tr><td><strong>D&eacute;marr&eacute;</strong></td><td>{{ audit.started_at or '-' }}</td></tr>
    <tr><td><strong>Soumis</strong></td><td>{{ audit.submitted_at or '-' }}</td></tr>
    <tr><td><strong>Valid&eacute;</strong></td><td>{{ audit.validated_at or '-' }}</td></tr>
    <tr><td><strong>Ech&eacute;ance de validit&eacute;</strong></td><td>{{ audit.valid_until or '-' }}</td></tr>
  </table>

  <h1 class="section">3. Ecarts, preuves et plan d&rsquo;action</h1>
  {% if action_items %}
    {% for item in action_items %}
      <div class="finding">
        <div class="finding-title">{% if item.kind == 'missing_required' %}R&eacute;ponse obligatoire manquante{% elif item.kind == 'missing_evidence' %}Preuve obligatoire manquante{% else %}Score sous le seuil de validation{% endif %} &middot; {{ item.theme }}{% if item.code %} &middot; {{ item.code }}{% endif %}</div>
        <div><strong>{{ item.text }}</strong></div>
        <div class="muted">Score: {{ item.score }} &middot; Preuves jointes: {{ item.attachment_count }}</div>
        {% if item.notes %}<div class="small">Notes: {{ item.notes }}</div>{% endif %}
      </div>
    {% endfor %}
  {% else %}
    <div class="card green">Aucun &eacute;cart bloquant ou preuve obligatoire manquante n&rsquo;a &eacute;t&eacute; identifi&eacute; dans les r&eacute;ponses saisies.</div>
  {% endif %}

  <h1 class="section">4. R&eacute;sultats par th&egrave;me</h1>
  {% for theme in themes %}
    <div class="theme-title">{{ theme.title }} <span>score {{ theme.score }}{% if theme.weight %} &middot; poids {{ '%g'|format(theme.weight) }}{% endif %}</span></div>
    {% if theme.description %}<p class="muted small" style="margin:0 0 2mm">{{ theme.description }}</p>{% endif %}
    <table>
      <thead><tr><th style="width:45%">Question</th><th style="width:18%">R&eacute;ponse</th><th style="width:10%; text-align:center">Score</th><th style="width:10%; text-align:center">Preuves</th><th>Notes</th></tr></thead>
      <tbody>
      {% for q in theme.questions %}
        {%- set q_score_num = q.score|replace('%','')|trim -%}
        {%- if q_score_num and q_score_num != '-' -%}{%- set qsf = q_score_num|float -%}{%- if qsf >= 80 -%}{%- set q_class = 'ok' -%}{%- elif qsf >= 50 -%}{%- set q_class = 'warn' -%}{%- else -%}{%- set q_class = 'bad' -%}{%- endif -%}{%- else -%}{%- set q_class = 'unk' -%}{%- endif -%}
        <tr>
          <td>{% if q.code %}<span class="qcode">{{ q.code }}</span> {% endif %}<span class="qtext">{{ q.text }}</span>{% if q.required %}<span class="qrequired">obligatoire</span>{% endif %}</td>
          <td>{{ q.answer or '-' }}</td>
          <td style="text-align:center"><span class="badge {{ q_class }}">{{ q.score }}</span></td>
          <td style="text-align:center">{% if q.attachment_required %}{% if q.attachment_count > 0 %}<span class="badge ok">OK {{ q.attachment_count }}</span>{% else %}<span class="badge bad">Manquante</span>{% endif %}{% else %}{% if q.attachment_count > 0 %}{{ q.attachment_count }}{% else %}-{% endif %}{% endif %}</td>
          <td class="small muted">{{ q.notes or '-' }}</td>
        </tr>
      {% endfor %}
      </tbody>
    </table>
  {% endfor %}

  <div class="signatures">
    <h1 class="section">5. Validation et signatures</h1>
    {% if validators and validators|length > 0 %}
      <p class="muted small" style="margin:0 0 6px">Acteurs du circuit de validation MOC ({{ validators|length }} intervenant{{ 's' if validators|length > 1 else '' }}). R&eacute;f&eacute;rence workflow: <span class="qcode">{{ audit.validation_workflow_id }}</span></p>
      <table class="validators-table">
        <thead>
          <tr>
            <th style="width:30%">Acteur</th>
            <th style="width:15%">Statut</th>
            <th style="width:15%">Date</th>
            <th>Commentaires &amp; signature</th>
          </tr>
        </thead>
        <tbody>
          {% for v in validators %}
            {%- set st = v.status -%}
            {%- if st == 'approved' -%}{%- set lbl = 'Approuv&eacute;' -%}
            {%- elif st == 'rejected' -%}{%- set lbl = 'Rejet&eacute;' -%}
            {%- elif st == 'abstained' -%}{%- set lbl = 'Abstenu' -%}
            {%- else -%}{%- set lbl = 'En attente' -%}
            {%- endif -%}
            <tr>
              <td>
                <div class="v-name">{{ v.name }}</div>
                <div class="v-role">{{ v.role|capitalize }}{% if v.required %} &middot; obligatoire{% endif %}{% if v.level %} &middot; niveau {{ v.level }}{% endif %}</div>
              </td>
              <td><span class="v-status {{ st }}">{{ lbl }}</span></td>
              <td class="small">{{ v.validated_at or '&mdash;' }}</td>
              <td>
                {% if v.comments %}<div class="v-comments">&laquo; {{ v.comments }} &raquo;</div>{% endif %}
                {% if v.signature %}
                  <img class="v-signature" src="{{ v.signature }}" alt="Signature {{ v.name }}"/>
                {% else %}
                  <div class="v-sig-empty">(signature non d&eacute;pos&eacute;e)</div>
                {% endif %}
              </td>
            </tr>
          {% endfor %}
        </tbody>
      </table>
    {% else %}
      <p class="muted small" style="margin:0 0 6px">Workflow de validation non encore d&eacute;clench&eacute; ({{ 'r&eacute;f. ' + audit.validation_workflow_id if audit.validation_workflow_id else 'aucun MOC associ&eacute;' }}). Cases r&eacute;serv&eacute;es pour signature manuelle :</p>
      <div class="sig">
        <div class="sig-box"><div class="label">Auditeur</div><br><br>Date: ___________________</div>
        <div class="sig-box"><div class="label">Validateur</div><br><br>Date: ___________________</div>
        <div class="sig-box"><div class="label">Repr&eacute;sentant fournisseur</div><br><br>Date: ___________________</div>
      </div>
    {% endif %}
    <p class="small muted" style="margin-top:4mm">Les pi&egrave;ces jointes, photos, preuves documentaires et commentaires d&eacute;taill&eacute;s restent les enregistrements ma&icirc;tres dans OpsFlux.</p>
  </div>
</body>
</html>
"""


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_basic_audit_pdf(variables: dict) -> bytes:
    """Small dependency-free PDF fallback for dev hosts without WeasyPrint."""
    import textwrap

    lines: list[str] = [
        "RAPPORT D'AUDIT FOURNISSEUR",
        f"Reference: {variables['audit']['reference']}",
        f"Titre: {variables['audit']['title']}",
        f"Fournisseur: {variables['supplier']['name']} {variables['supplier']['code']}".strip(),
        f"Type: {variables['template']['audit_type']} - Modele: {variables['template']['name']}",
        f"Statut: {variables['audit']['status']} - Score: {variables['audit']['score']} - Seuil: {variables['template']['passing_score']} - Categorie: {variables['audit']['score_category'] or '-'}",
        f"Questions: {variables['metrics']['answered_questions']}/{variables['metrics']['total_questions']} - Preuves manquantes: {variables['metrics']['missing_evidence']}",
        f"Workflow validation: {variables['audit']['validation_workflow_id'] or '-'}",
        f"Validite: {variables['audit']['valid_until'] or '-'}",
        f"Generation: {variables['generated_at']}",
        "",
    ]
    lines.append("Seuils de qualification:")
    for threshold in variables["template"].get("score_thresholds") or []:
        effect = "bloquant" if threshold.get("blocks_assignment") else "qualification"
        lines.append(f"- {threshold.get('label') or threshold.get('code')}: >= {threshold.get('min_score')}% ({effect})")
    lines.append("")
    if variables["audit"]["summary"]:
        lines.append("Synthese:")
        lines.extend(textwrap.wrap(str(variables["audit"]["summary"]), width=92) or ["-"])
        lines.append("")
    if variables.get("action_items"):
        lines.append("Ecarts et plan d'action:")
        for item in variables["action_items"]:
            if item["kind"] == "missing_required":
                label = "Reponse obligatoire manquante"
            elif item["kind"] == "missing_evidence":
                label = "Preuve obligatoire manquante"
            else:
                label = "Score sous seuil"
            header = f"- {label}: {item['theme']} {item['code']}".strip()
            lines.extend(textwrap.wrap(header, width=92))
            lines.extend(textwrap.wrap(f"  {item['text']}", width=92))
            lines.append(f"  Score: {item['score']} | Preuves: {item['attachment_count']}")
        lines.append("")
    for theme in variables["themes"]:
        lines.append(f"Theme: {theme['title']} - score {theme.get('score', '-')} - poids {theme['weight']}%")
        for question in theme["questions"]:
            prefix = f"- {question['code']} {question['text']}".strip()
            lines.extend(textwrap.wrap(prefix, width=92) or ["-"])
            detail = (
                f"  Reponse: {question['answer']} | Score: {question['score']} | "
                f"Preuves: {question['attachment_count']}"
            )
            lines.extend(textwrap.wrap(detail, width=92))
            if question["notes"]:
                lines.extend(textwrap.wrap(f"  Notes: {question['notes']}", width=92))
        lines.append("")
    lines.extend([
        "Validation:",
        "Auditeur: ____________________  Date: __________",
        "Validateur: __________________  Date: __________",
        "Representant fournisseur: _____ Date: __________",
        "",
        "Les pieces jointes, photos, preuves documentaires et commentaires detailles restent",
        "les enregistrements maitres dans OpsFlux.",
    ])

    pages = [lines[index:index + 46] for index in range(0, max(len(lines), 1), 46)]
    objects: list[bytes] = []

    def add_object(payload: str | bytes) -> int:
        if isinstance(payload, str):
            payload = payload.encode("latin-1", "replace")
        objects.append(payload)
        return len(objects)

    catalog_id = add_object("<< /Type /Catalog /Pages 2 0 R >>")
    pages_id = add_object("<< /Type /Pages /Kids [] /Count 0 >>")
    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_refs: list[int] = []
    for page_lines in pages:
        commands = ["BT", "/F1 12 Tf", "48 792 Td", "14 TL"]
        for line in page_lines:
            commands.append(f"({_pdf_escape(line)}) Tj")
            commands.append("T*")
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1", "replace")
        content_id = add_object(
            b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        )
        page_id = add_object(
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_refs.append(page_id)
    objects[pages_id - 1] = (
        f"<< /Type /Pages /Kids [{' '.join(f'{ref} 0 R' for ref in page_refs)}] /Count {len(page_refs)} >>"
    ).encode("latin-1", "replace")

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, payload in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii"))
        output.extend(payload)
        output.extend(b"\nendobj\n")
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_id} 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


async def _resolve_audit_validator_ids(
    db: AsyncSession,
    *,
    entity_id: UUID,
    requested_ids: list[UUID],
) -> list[UUID]:
    unique_ids = list(dict.fromkeys(requested_ids))
    if not unique_ids:
        return []
    membership_exists = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(
            UserGroupMember.user_id == User.id,
            UserGroup.entity_id == entity_id,
            UserGroup.active == True,  # noqa: E712
        )
        .exists()
    )
    result = await db.execute(
        select(User.id).where(
            User.id.in_(unique_ids),
            User.active == True,  # noqa: E712
            or_(User.default_entity_id == entity_id, membership_exists),
        )
    )
    allowed = set(result.scalars().all())
    return [user_id for user_id in unique_ids if user_id in allowed]


def _audit_score(answers: list[ComplianceAuditAnswer]) -> Decimal | None:
    total_weight = Decimal("0")
    weighted_score = Decimal("0")
    for answer in answers:
        if answer.score is None or not answer.question:
            continue
        question_weight = Decimal(str(answer.question.weight or 1))
        theme_weight = Decimal(str(answer.question.theme.weight or 1)) if answer.question.theme else Decimal("1")
        weight = question_weight * theme_weight
        total_weight += weight
        weighted_score += Decimal(str(answer.score)) * weight
    if total_weight <= 0:
        return None
    return (weighted_score / total_weight).quantize(Decimal("0.01"))


async def _recompute_audit_score(db: AsyncSession, audit: ComplianceAudit) -> None:
    result = await db.execute(
        select(ComplianceAuditAnswer)
        .options(
            selectinload(ComplianceAuditAnswer.question).selectinload(ComplianceAuditQuestion.theme)
        )
        .where(ComplianceAuditAnswer.audit_id == audit.id)
    )
    audit.score_percent = _audit_score(list(result.scalars().all()))

async def _count_record_proof(
    db: AsyncSession,
    *,
    record_type: str,
    record: object,
) -> int:
    """Count supporting proof for a verifiable record.

    Proof can come from polymorphic attachments or from legacy document_url fields
    still used by several compliance-related sub-models.
    """
    attachment_count = 0
    record_id = getattr(record, "id", None)
    if record_id is not None:
        attachment_count = int(
            (
                await db.scalar(
                    select(sqla_func.count()).select_from(Attachment).where(
                        Attachment.owner_type == record_type,
                        Attachment.owner_id == record_id,
                        Attachment.archived == False,
                    )
                )
            )
            or 0
        )
    legacy_document_count = 1 if getattr(record, "document_url", None) else 0
    return attachment_count + legacy_document_count


async def _get_external_user_tier_ids(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
) -> set[UUID] | None:
    if current_user.user_type != "external":
        return None
    from app.models.common import UserTierLink

    linked = await db.execute(
        select(UserTierLink.tier_id)
        .join(Tier, Tier.id == UserTierLink.tier_id)
        .where(
            UserTierLink.user_id == current_user.id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
        )
    )
    return {row[0] for row in linked.all()}


async def _assert_external_owner_access(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
    *,
    owner_type: str,
    owner_id: UUID,
) -> None:
    if current_user.user_type != "external":
        return
    if owner_type == "user":
        if owner_id != current_user.id:
            raise StructuredHTTPException(
                404,
                code="OWNER_NOT_FOUND",
                message="Owner not found",
            )
        return
    if owner_type != "tier_contact":
        raise StructuredHTTPException(
            403,
            code="EXTERNAL_USERS_CANNOT_ACCESS_OWNER_TYPE",
            message="External users cannot access this owner type",
        )

    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if not linked_tier_ids:
        raise StructuredHTTPException(
            404,
            code="OWNER_NOT_FOUND",
            message="Owner not found",
        )
    result = await db.execute(
        select(TierContact.id).where(
            TierContact.id == owner_id,
            TierContact.tier_id.in_(linked_tier_ids),
        )
    )
    if result.scalar_one_or_none() is None:
        raise StructuredHTTPException(
            404,
            code="OWNER_NOT_FOUND",
            message="Owner not found",
        )


def _apply_external_record_scope(query, current_user: User, entity_id: UUID):
    if current_user.user_type != "external":
        return query

    from app.models.common import UserTierLink

    linked_contact_ids = (
        select(TierContact.id)
        .join(Tier, Tier.id == TierContact.tier_id)
        .join(UserTierLink, UserTierLink.tier_id == Tier.id)
        .where(
            UserTierLink.user_id == current_user.id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
        )
    )
    return query.where(
        or_(
            and_(ComplianceRecord.owner_type == "user", ComplianceRecord.owner_id == current_user.id),
            and_(ComplianceRecord.owner_type == "tier_contact", ComplianceRecord.owner_id.in_(linked_contact_ids)),
        )
    )


# ── Dashboard KPIs ─────────────────────────────────────────────────────────


@router.get("/dashboard-kpis", dependencies=[require_permission("conformite.record.read")])
async def get_compliance_dashboard_kpis(
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Return aggregated compliance KPIs for the entity dashboard."""
    now = datetime.now(timezone.utc)
    soon = now + timedelta(days=30)

    # ── Aggregate counts by status ──
    status_q = (
        select(
            ComplianceRecord.status,
            sqla_func.count().label("cnt"),
        )
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
        )
        .group_by(ComplianceRecord.status)
    )
    status_rows = (await db.execute(status_q)).all()
    counts = {row.status: row.cnt for row in status_rows}

    total_records = sum(counts.values())
    valid_count = counts.get("valid", 0)
    expired_count = counts.get("expired", 0)
    pending_count = counts.get("pending", 0)

    # Compliance rate: valid / (valid + expired), avoid div-by-zero
    denom = valid_count + expired_count
    compliance_rate = round((valid_count / denom) * 100, 1) if denom > 0 else 0.0

    # ── Expiring soon (valid records with expires_at in next 30 days) ──
    expiring_soon_q = (
        select(sqla_func.count())
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at >= now,
            ComplianceRecord.expires_at <= soon,
        )
    )
    expiring_soon_count = (await db.execute(expiring_soon_q)).scalar() or 0

    # ── Breakdown by category ──
    cat_q = (
        select(
            ComplianceType.category,
            sqla_func.count().label("total"),
            sqla_func.sum(case((ComplianceRecord.status == "valid", 1), else_=0)).label("valid"),
            sqla_func.sum(case((ComplianceRecord.status == "expired", 1), else_=0)).label("expired"),
            sqla_func.sum(case((ComplianceRecord.status == "pending", 1), else_=0)).label("pending"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
        )
        .group_by(ComplianceType.category)
        .order_by(ComplianceType.category)
    )
    cat_rows = (await db.execute(cat_q)).all()
    by_category = [
        {
            "category": r.category,
            "total": r.total,
            "valid": r.valid or 0,
            "expired": r.expired or 0,
            "pending": r.pending or 0,
        }
        for r in cat_rows
    ]

    by_status = [
        {"status": s, "count": counts.get(s, 0)}
        for s in ("valid", "expired", "pending", "rejected")
    ]

    # ── Recent expirations (last 10 expired records) ──
    recent_q = (
        select(
            ComplianceRecord.id,
            ComplianceType.name.label("type_name"),
            ComplianceRecord.owner_type,
            ComplianceRecord.expires_at,
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "expired",
        )
        .order_by(ComplianceRecord.expires_at.desc())
        .limit(10)
    )
    recent_rows = (await db.execute(recent_q)).all()
    recent_expirations = [
        {
            "id": str(r.id),
            "type_name": r.type_name,
            "owner_type": r.owner_type,
            "expired_at": r.expires_at.isoformat() if r.expires_at else None,
            "days_overdue": (now - r.expires_at).days if r.expires_at else 0,
        }
        for r in recent_rows
    ]

    # ── Upcoming expirations (next 10 to expire) ──
    upcoming_q = (
        select(
            ComplianceRecord.id,
            ComplianceType.name.label("type_name"),
            ComplianceRecord.owner_type,
            ComplianceRecord.expires_at,
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at >= now,
        )
        .order_by(ComplianceRecord.expires_at.asc())
        .limit(10)
    )
    upcoming_rows = (await db.execute(upcoming_q)).all()
    upcoming_expirations = [
        {
            "id": str(r.id),
            "type_name": r.type_name,
            "owner_type": r.owner_type,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "days_remaining": (r.expires_at - now).days if r.expires_at else 0,
        }
        for r in upcoming_rows
    ]

    return {
        "total_records": total_records,
        "valid_count": valid_count,
        "expired_count": expired_count,
        "pending_count": pending_count,
        "expiring_soon_count": expiring_soon_count,
        "compliance_rate": compliance_rate,
        "by_category": by_category,
        "by_status": by_status,
        "recent_expirations": recent_expirations,
        "upcoming_expirations": upcoming_expirations,
    }


# ── Compliance Types (referentiel) ────────────────────────────────────────


@router.get("/types", response_model=PaginatedResponse[ComplianceTypeRead], dependencies=[require_permission("conformite.type.read")])
async def list_compliance_types(
    category: str | None = None,
    search: str | None = None,
    owner_type: str | None = None,
    subject_scope: str | None = None,
    include_audit: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ComplianceType).where(
        ComplianceType.entity_id == entity_id,
        ComplianceType.active == True,
    )
    if not include_audit:
        query = query.where(ComplianceType.category != "audit")
    effective_scope = subject_scope
    if owner_type:
        try:
            effective_scope = compliance_service._owner_subject_scope(owner_type)
        except Exception:
            raise StructuredHTTPException(
                400,
                code="OWNER_TYPE_NON_SUPPORTE",
                message="Contexte de conformité non supporté",
            )
    if effective_scope in {"company", "asset", "cargo"}:
        scoped_type_ids = select(ComplianceRule.compliance_type_id).where(
            ComplianceRule.entity_id == entity_id,
            ComplianceRule.active == True,
            or_(
                ComplianceRule.subject_scope == effective_scope,
                ComplianceRule.subject_scope == "all",
            ),
        )
        if not include_audit:
            scoped_type_ids = scoped_type_ids.where(
                or_(
                    ComplianceRule.condition_json == None,  # noqa: E711
                    ComplianceRule.condition_json["audit_template_id"].as_string() == None,  # noqa: E711
                )
            )
        query = query.where(ComplianceType.id.in_(scoped_type_ids))
    if category:
        query = query.where(ComplianceType.category == category)
    if search:
        like = f"%{search}%"
        query = query.where(ComplianceType.name.ilike(like) | ComplianceType.code.ilike(like))
    query = query.order_by(ComplianceType.category, ComplianceType.name)
    return await paginate(db, query, pagination)


@router.post("/types", response_model=ComplianceTypeRead, status_code=201)
async def create_compliance_type(
    body: ComplianceTypeCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.type.create"),
    db: AsyncSession = Depends(get_db),
):
    ct = ComplianceType(entity_id=entity_id, **body.model_dump())
    db.add(ct)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.patch("/types/{type_id}", response_model=ComplianceTypeRead)
async def update_compliance_type(
    type_id: UUID,
    body: ComplianceTypeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.type.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceType).where(ComplianceType.id == type_id, ComplianceType.entity_id == entity_id)
    )
    ct = result.scalars().first()
    if not ct:
        raise StructuredHTTPException(
            404,
            code="COMPLIANCE_TYPE_NOT_FOUND",
            message="Compliance type not found",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(ct, field, value)
    await db.commit()
    await db.refresh(ct)
    return ct


@router.delete("/types/{type_id}")
async def delete_compliance_type(
    type_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.type.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceType).where(ComplianceType.id == type_id, ComplianceType.entity_id == entity_id)
    )
    ct = result.scalars().first()
    if not ct:
        raise StructuredHTTPException(
            404,
            code="COMPLIANCE_TYPE_NOT_FOUND",
            message="Compliance type not found",
        )
    await delete_entity(ct, db, "compliance_type", entity_id=ct.id, user_id=current_user.id)
    await db.commit()
    return {"detail": "Compliance type archived"}


# ── Compliance Rules ──────────────────────────────────────────────────────


def _authorized_center_payload(link: ComplianceTypeAuthorizedCenter, tier: Tier) -> dict:
    return {
        "id": link.id,
        "entity_id": link.entity_id,
        "compliance_type_id": link.compliance_type_id,
        "tier_id": link.tier_id,
        "tier_name": tier.name,
        "tier_code": tier.code,
        "authorization_center_code": tier.authorization_center_code,
        "certificate_verification_url": tier.certificate_verification_url,
        "active": link.active,
        "accreditation_starts_at": link.accreditation_starts_at,
        "accreditation_ends_at": link.accreditation_ends_at,
        "notes": link.notes,
        "created_at": link.created_at,
    }


def _authorized_center_validity_filters(reference_date: date):
    return (
        ComplianceTypeAuthorizedCenter.active == True,
        or_(
            ComplianceTypeAuthorizedCenter.accreditation_starts_at == None,  # noqa: E711
            ComplianceTypeAuthorizedCenter.accreditation_starts_at <= reference_date,
        ),
        or_(
            ComplianceTypeAuthorizedCenter.accreditation_ends_at == None,  # noqa: E711
            ComplianceTypeAuthorizedCenter.accreditation_ends_at >= reference_date,
        ),
    )


async def _get_compliance_type_or_404(db: AsyncSession, type_id: UUID, entity_id: UUID) -> ComplianceType:
    result = await db.execute(
        select(ComplianceType).where(
            ComplianceType.id == type_id,
            ComplianceType.entity_id == entity_id,
            ComplianceType.active == True,
        )
    )
    ct = result.scalars().first()
    if not ct or ct.entity_id != entity_id:
        raise HTTPException(status_code=404, detail="Compliance type not found")
    return ct


async def _get_authorization_center_tier_or_422(db: AsyncSession, tier_id: UUID, entity_id: UUID) -> Tier:
    result = await db.execute(
        select(Tier).where(
            Tier.id == tier_id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
            Tier.active == True,
            Tier.is_authorization_center == True,
        )
    )
    tier = result.scalars().first()
    if not tier:
        raise HTTPException(status_code=422, detail="Le tiers selectionne n'est pas un centre d'habilitation actif.")
    return tier


async def _validate_record_issuer(
    db: AsyncSession,
    *,
    entity_id: UUID,
    compliance_type_id: UUID,
    issuer_tier_id: UUID | None,
) -> Tier | None:
    if issuer_tier_id is None:
        return None
    tier = await _get_authorization_center_tier_or_422(db, issuer_tier_id, entity_id)
    configured_count = int(
        await db.scalar(
            select(sqla_func.count()).select_from(ComplianceTypeAuthorizedCenter).where(
                ComplianceTypeAuthorizedCenter.entity_id == entity_id,
                ComplianceTypeAuthorizedCenter.compliance_type_id == compliance_type_id,
                ComplianceTypeAuthorizedCenter.active == True,
            )
        )
        or 0
    )
    if configured_count > 0:
        allowed = await db.scalar(
            select(ComplianceTypeAuthorizedCenter.id).where(
                ComplianceTypeAuthorizedCenter.entity_id == entity_id,
                ComplianceTypeAuthorizedCenter.compliance_type_id == compliance_type_id,
                ComplianceTypeAuthorizedCenter.tier_id == issuer_tier_id,
                *_authorized_center_validity_filters(datetime.now(timezone.utc).date()),
            )
        )
        if not allowed:
            raise HTTPException(status_code=422, detail="Ce centre n'est pas habilite ou son accreditation n'est pas valide pour ce referentiel.")
    return tier


async def _validate_riseup_issuer(
    db: AsyncSession,
    *,
    entity_id: UUID,
    compliance_type: ComplianceType,
    issuer: str | None,
) -> None:
    if (issuer or "").strip().lower().replace(" ", "") != "riseup":
        return
    if compliance_type.external_provider != "riseup" or compliance_type.compliance_source not in {"external", "both"}:
        raise HTTPException(
            status_code=422,
            detail="RiseUp ne peut etre choisi que pour un referentiel raccorde au provider RiseUp.",
        )
    result = await db.execute(
        select(Setting).where(
            Setting.key.in_(["integration.riseup.public_key", "integration.riseup.secret_key"]),
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    values = []
    for setting in result.scalars().all():
        raw = setting.value.get("v", "") if isinstance(setting.value, dict) else setting.value
        if raw:
            values.append(str(raw))
    if not values:
        raise HTTPException(
            status_code=422,
            detail="Le connecteur RiseUp doit etre configure avant de choisir RiseUp comme emetteur.",
        )


async def _resolve_external_record_owner_identity(
    db: AsyncSession,
    record: ComplianceRecord,
) -> tuple[str, str | None]:
    """Return the best email / RH id identity for an external compliance API."""
    if record.owner_type == "user":
        user = await db.get(User, record.owner_id)
        if not user:
            raise HTTPException(status_code=422, detail="Utilisateur introuvable pour la verification externe.")
        return user.email, user.intranet_id

    if record.owner_type == "tier_contact":
        contact = await db.get(TierContact, record.owner_id)
        if not contact:
            raise HTTPException(status_code=422, detail="Contact introuvable pour la verification externe.")
        linked_user = (
            await db.execute(select(User).where(User.tier_contact_id == contact.id).limit(1))
        ).scalar_one_or_none()
        if linked_user:
            return linked_user.email, linked_user.intranet_id
        email = contact.email
        if not email:
            email = (
                await db.execute(
                    select(ContactEmail.email)
                    .where(ContactEmail.owner_type == "tier_contact", ContactEmail.owner_id == contact.id)
                    .order_by(ContactEmail.is_default.desc(), ContactEmail.created_at.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
        if email:
            return email, None

    raise HTTPException(
        status_code=422,
        detail="Aucune identite compatible avec le connecteur externe n'a ete trouvee pour ce certificat.",
    )


async def _fetch_external_certificate_record(
    db: AsyncSession,
    *,
    entity_id: UUID,
    compliance_type: ComplianceType,
    record: ComplianceRecord,
):
    provider_id = compliance_type.external_provider
    if not provider_id or compliance_type.compliance_source not in {"external", "both"}:
        raise HTTPException(status_code=422, detail="Ce referentiel n'est pas raccorde a un connecteur externe.")

    mapping = compliance_type.external_mapping or {}
    external_type_id = mapping.get("certificate_id") or mapping.get("training_id")
    if not external_type_id:
        raise HTTPException(status_code=422, detail="Aucun identifiant externe n'est configure pour ce referentiel.")

    cfg = await compliance_service._get_connector_settings(  # type: ignore[attr-defined]
        db,
        entity_id=entity_id,
        prefix=f"integration.{provider_id}",
    )
    connector = await create_connector(provider_id, cfg)
    if not connector:
        raise HTTPException(status_code=422, detail="Connecteur externe indisponible ou mal configure.")

    email, intranet_id = await _resolve_external_record_owner_identity(db, record)
    match = await connector.match_user(email=email, intranet_id=intranet_id)
    if not match:
        raise HTTPException(status_code=404, detail="Aucun utilisateur correspondant trouve chez l'emetteur.")

    if mapping.get("certificate_id"):
        external = await connector.get_certificate_status(
            external_user_id=match.external_user_id,
            external_certificate_id=str(external_type_id),
        )
        if external:
            return external

    external_records = await connector.get_user_compliance(
        external_user_id=match.external_user_id,
        type_mapping={str(compliance_type.id): str(external_type_id)},
    )
    for external in external_records:
        if external.type_external_id == str(external_type_id):
            return external

    raise HTTPException(status_code=404, detail="Certificat introuvable chez l'emetteur.")


@router.get(
    "/authorization-centers",
    response_model=PaginatedResponse[TierRead],
    dependencies=[require_permission("conformite.type.read")],
)
async def list_authorization_centers(
    compliance_type_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    query = select(Tier).where(
        Tier.entity_id == entity_id,
        Tier.archived == False,
        Tier.active == True,
        Tier.is_authorization_center == True,
    )
    if compliance_type_id:
        query = query.join(
            ComplianceTypeAuthorizedCenter,
            and_(
                ComplianceTypeAuthorizedCenter.tier_id == Tier.id,
                ComplianceTypeAuthorizedCenter.compliance_type_id == compliance_type_id,
                ComplianceTypeAuthorizedCenter.entity_id == entity_id,
                *_authorized_center_validity_filters(datetime.now(timezone.utc).date()),
            ),
        )
    if search:
        like = f"%{search}%"
        query = query.where(
            Tier.name.ilike(like)
            | Tier.code.ilike(like)
            | Tier.authorization_center_code.ilike(like)
        )
    query = query.order_by(Tier.name)

    def _transform(row) -> dict:
        tier = row[0] if hasattr(row, "__getitem__") else row
        return {c.key: getattr(tier, c.key) for c in tier.__table__.columns} | {
            "contact_count": 0,
            "logo_attachment_id": None,
        }

    return await paginate(db, query, pagination, transform=_transform)


@router.get(
    "/types/{type_id}/authorized-centers",
    response_model=list[ComplianceAuthorizedCenterRead],
    dependencies=[require_permission("conformite.type.read")],
)
async def list_type_authorized_centers(
    type_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    await _get_compliance_type_or_404(db, type_id, entity_id)
    result = await db.execute(
        select(ComplianceTypeAuthorizedCenter, Tier)
        .join(Tier, ComplianceTypeAuthorizedCenter.tier_id == Tier.id)
        .where(
            ComplianceTypeAuthorizedCenter.entity_id == entity_id,
            ComplianceTypeAuthorizedCenter.compliance_type_id == type_id,
            Tier.archived == False,
        )
        .order_by(ComplianceTypeAuthorizedCenter.active.desc(), Tier.name)
    )
    return [_authorized_center_payload(link, tier) for link, tier in result.all()]


@router.post(
    "/types/{type_id}/authorized-centers",
    response_model=ComplianceAuthorizedCenterRead,
    status_code=201,
    dependencies=[require_permission("conformite.type.update")],
)
async def add_type_authorized_center(
    type_id: UUID,
    body: ComplianceAuthorizedCenterCreate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    await _get_compliance_type_or_404(db, type_id, entity_id)
    tier = await _get_authorization_center_tier_or_422(db, body.tier_id, entity_id)
    result = await db.execute(
        select(ComplianceTypeAuthorizedCenter).where(
            ComplianceTypeAuthorizedCenter.entity_id == entity_id,
            ComplianceTypeAuthorizedCenter.compliance_type_id == type_id,
            ComplianceTypeAuthorizedCenter.tier_id == body.tier_id,
        )
    )
    link = result.scalars().first()
    if link:
        link.active = True
        link.notes = body.notes
        link.accreditation_starts_at = body.accreditation_starts_at
        link.accreditation_ends_at = body.accreditation_ends_at
    else:
        link = ComplianceTypeAuthorizedCenter(
            entity_id=entity_id,
            compliance_type_id=type_id,
            tier_id=body.tier_id,
            notes=body.notes,
            accreditation_starts_at=body.accreditation_starts_at,
            accreditation_ends_at=body.accreditation_ends_at,
            active=True,
        )
        db.add(link)
    await db.commit()
    await db.refresh(link)
    return _authorized_center_payload(link, tier)


@router.patch(
    "/types/{type_id}/authorized-centers/{link_id}",
    response_model=ComplianceAuthorizedCenterRead,
    dependencies=[require_permission("conformite.type.update")],
)
async def update_type_authorized_center(
    type_id: UUID,
    link_id: UUID,
    body: ComplianceAuthorizedCenterUpdate,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceTypeAuthorizedCenter, Tier)
        .join(Tier, ComplianceTypeAuthorizedCenter.tier_id == Tier.id)
        .where(
            ComplianceTypeAuthorizedCenter.id == link_id,
            ComplianceTypeAuthorizedCenter.entity_id == entity_id,
            ComplianceTypeAuthorizedCenter.compliance_type_id == type_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Authorized center not found")
    link, tier = row
    updates = body.model_dump(exclude_unset=True)
    next_start = updates.get("accreditation_starts_at", link.accreditation_starts_at)
    next_end = updates.get("accreditation_ends_at", link.accreditation_ends_at)
    if next_start and next_end and next_start > next_end:
        raise HTTPException(status_code=422, detail="La date de debut d'accreditation doit etre avant la date de fin.")
    for field, value in updates.items():
        setattr(link, field, value)
    await db.commit()
    await db.refresh(link)
    return _authorized_center_payload(link, tier)


@router.delete(
    "/types/{type_id}/authorized-centers/{link_id}",
    dependencies=[require_permission("conformite.type.update")],
)
async def remove_type_authorized_center(
    type_id: UUID,
    link_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceTypeAuthorizedCenter).where(
            ComplianceTypeAuthorizedCenter.id == link_id,
            ComplianceTypeAuthorizedCenter.entity_id == entity_id,
            ComplianceTypeAuthorizedCenter.compliance_type_id == type_id,
        )
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(status_code=404, detail="Authorized center not found")
    link.active = False
    await db.commit()
    return {"detail": "Authorized center removed"}


@router.get("/rules", response_model=list[ComplianceRuleRead], dependencies=[require_permission("conformite.rule.read")])
async def list_compliance_rules(
    compliance_type_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(ComplianceRule).where(
        ComplianceRule.entity_id == entity_id,
        ComplianceRule.active == True,
    )
    if compliance_type_id:
        query = query.where(ComplianceRule.compliance_type_id == compliance_type_id)
    result = await db.execute(query.order_by(ComplianceRule.created_at))
    return result.scalars().all()


@router.post("/rules", response_model=ComplianceRuleRead, status_code=201)
async def create_compliance_rule(
    body: ComplianceRuleCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.create"),
    db: AsyncSession = Depends(get_db),
):
    rule = ComplianceRule(entity_id=entity_id, changed_by=current_user.id, **body.model_dump())
    db.add(rule)
    await db.flush()
    # Log creation in history
    db.add(ComplianceRuleHistory(
        rule_id=rule.id, version=1, action="created",
        snapshot=_snapshot_rule(rule),
        changed_by=current_user.id,
    ))
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="create", resource_type="compliance_rule", resource_id=rule.id,
        details={
            "subject_scope": rule.subject_scope,
            "target_type": rule.target_type,
            "target_value": rule.target_value,
            "description": (rule.description or "")[:120],
        },
    )
    await db.commit()
    await db.refresh(rule)

    # Emit event for notification handlers (after commit)
    await emit_event("conformite.rule.created", {
        "rule_id": str(rule.id),
        "entity_id": str(entity_id),
        "subject_scope": rule.subject_scope,
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description or "",
        "created_by": str(current_user.id),
    })

    return rule


@router.patch("/rules/{rule_id}", response_model=ComplianceRuleRead)
async def update_compliance_rule(
    rule_id: UUID,
    body: ComplianceRuleUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise StructuredHTTPException(
            404,
            code="RULE_NOT_FOUND",
            message="Rule not found",
        )
    # Snapshot before update
    db.add(ComplianceRuleHistory(
        rule_id=rule.id, version=rule.version, action="updated",
        snapshot=_snapshot_rule(rule),
        change_reason=body.change_reason,
        changed_by=current_user.id,
    ))
    # Apply changes
    update_data = body.model_dump(exclude_unset=True, exclude={"change_reason"})
    for field, value in update_data.items():
        setattr(rule, field, value)
    rule.version += 1
    rule.changed_by = current_user.id
    rule.change_reason = body.change_reason
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="update", resource_type="compliance_rule", resource_id=rule.id,
        details={
            "version": rule.version,
            "fields_changed": sorted(update_data.keys()),
            "change_reason": (body.change_reason or "")[:200],
        },
    )
    await db.commit()
    await db.refresh(rule)

    # Emit event for notification handlers (after commit)
    await emit_event("conformite.rule.updated", {
        "rule_id": str(rule.id),
        "entity_id": str(entity_id),
        "subject_scope": rule.subject_scope,
        "target_type": rule.target_type,
        "target_value": rule.target_value,
        "description": rule.description or "",
        "updated_by": str(current_user.id),
    })

    return rule


@router.delete("/rules/{rule_id}")
async def delete_compliance_rule(
    rule_id: UUID,
    force: bool = False,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.rule.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRule).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    rule = result.scalars().first()
    if not rule:
        raise StructuredHTTPException(
            404,
            code="RULE_NOT_FOUND",
            message="Rule not found",
        )

    # Determine if this is a draft (v1, never modified, no children) — can always be hard-deleted
    is_draft = rule.version <= 1 and not rule.change_reason

    if is_draft or force:
        # Draft/force: hard delete — no history needed for unused errors/drafts
        await delete_entity(rule, db, "compliance_rule", entity_id=rule.id, user_id=current_user.id)
        add_audit_event(
            db, user=current_user, entity_id=entity_id,
            action="hard_delete", resource_type="compliance_rule", resource_id=rule.id,
            details={"version": rule.version, "is_draft": is_draft, "force": force},
        )
        await db.commit()
        return {"detail": "Rule deleted"}

    # Published rule: respect configurable delete policy
    policy = await get_delete_policy("compliance_rule", db, entity_id=entity_id)
    mode = policy.get("mode", "soft")

    if mode == "hard":
        # Policy says hard delete even for published rules
        db.add(ComplianceRuleHistory(
            rule_id=rule.id, version=rule.version, action="archived",
            snapshot=_snapshot_rule(rule), changed_by=current_user.id,
        ))
        await db.flush()
        await delete_entity(rule, db, "compliance_rule", entity_id=rule.id, user_id=current_user.id)
        add_audit_event(
            db, user=current_user, entity_id=entity_id,
            action="hard_delete_with_history", resource_type="compliance_rule", resource_id=rule.id,
            details={"version": rule.version, "policy_mode": mode},
        )
        await db.commit()
        return {"detail": "Rule deleted (with history snapshot)"}
    else:
        # soft / soft_purge: archive with history snapshot
        db.add(ComplianceRuleHistory(
            rule_id=rule.id, version=rule.version, action="archived",
            snapshot=_snapshot_rule(rule), changed_by=current_user.id,
        ))
        rule.active = False
        rule.effective_to = datetime.now(timezone.utc).date()
        rule.changed_by = current_user.id
        rule.change_reason = "Archived"
        add_audit_event(
            db, user=current_user, entity_id=entity_id,
            action="archive", resource_type="compliance_rule", resource_id=rule.id,
            details={"version": rule.version, "policy_mode": mode},
        )
        await db.commit()
        return {"detail": "Rule archived"}


@router.get("/rules/{rule_id}/history", response_model=list[ComplianceRuleHistoryRead], dependencies=[require_permission("conformite.rule.read")])
async def get_rule_history(
    rule_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the change history for a specific compliance rule."""
    # Verify the rule belongs to this entity
    rule_check = await db.execute(
        select(ComplianceRule.id).where(ComplianceRule.id == rule_id, ComplianceRule.entity_id == entity_id)
    )
    if not rule_check.scalar_one_or_none():
        raise StructuredHTTPException(
            404,
            code="RULE_NOT_FOUND",
            message="Rule not found",
        )
    result = await db.execute(
        select(ComplianceRuleHistory)
        .where(ComplianceRuleHistory.rule_id == rule_id)
        .order_by(ComplianceRuleHistory.changed_at.desc())
    )
    return result.scalars().all()


# ── Compliance Records ────────────────────────────────────────────────────


@router.get("/records", response_model=PaginatedResponse[ComplianceRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_compliance_records(
    owner_type: str | None = None,
    owner_id: UUID | None = None,
    compliance_type_id: UUID | None = None,
    status: str | None = None,
    category: str | None = None,
    search: str | None = None,
    history: bool = False,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    IssuerTier = aliased(Tier)
    attachment_sq = (
        select(
            Attachment.owner_id.label("record_id"),
            sqla_func.count(Attachment.id).label("attachment_count"),
        )
        .where(
            Attachment.owner_type == "compliance_record",
            Attachment.archived == False,
        )
        .group_by(Attachment.owner_id)
        .subquery()
    )
    query = (
        select(
            ComplianceRecord,
            ComplianceType.name.label("type_name"),
            ComplianceType.category.label("type_category"),
            ComplianceType.compliance_source.label("type_compliance_source"),
            ComplianceType.external_provider.label("type_external_provider"),
            IssuerTier.name.label("issuer_tier_name"),
            sqla_func.coalesce(attachment_sq.c.attachment_count, 0).label("attachment_count"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .outerjoin(IssuerTier, ComplianceRecord.issuer_tier_id == IssuerTier.id)
        .outerjoin(attachment_sq, attachment_sq.c.record_id == ComplianceRecord.id)
        .where(ComplianceRecord.entity_id == entity_id)
    )
    if not history:
        query = query.where(ComplianceRecord.active == True)
    query = _apply_external_record_scope(query, current_user, entity_id)
    # The default list is the operational view. The history view is read-only and
    # intentionally includes rejected/archived records for auditability.
    if status:
        query = query.where(ComplianceRecord.status == status)
    elif not history:
        query = query.where(ComplianceRecord.status != "rejected")
    if owner_type:
        query = query.where(ComplianceRecord.owner_type == owner_type)
    if owner_id:
        query = query.where(ComplianceRecord.owner_id == owner_id)
    if compliance_type_id:
        query = query.where(ComplianceRecord.compliance_type_id == compliance_type_id)
    if category:
        query = query.where(ComplianceType.category == category)
    if search:
        like = f"%{search}%"
        query = query.where(
            ComplianceType.name.ilike(like)
            | ComplianceRecord.title.ilike(like)
            | ComplianceRecord.reference_number.ilike(like)
            | ComplianceRecord.issuer.ilike(like)
            | IssuerTier.name.ilike(like)
            | ComplianceRecord.notes.ilike(like)
        )
    query = query.order_by(ComplianceRecord.created_at.desc())

    # Auto-expire records that are past their expiry date
    now = datetime.now(timezone.utc)
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    expired_result = await db.execute(expire_stmt)
    expired_ids: list[UUID] = []
    for rec in expired_result.scalars().all():
        rec.status = "expired"
        expired_ids.append(rec.id)
    await db.flush()

    # Emit events for newly expired records
    if expired_ids:
        for eid in expired_ids:
            await emit_event("conformite.record.expired", {"record_id": str(eid), "entity_id": str(entity_id)})

    def _transform(row):
        try:
            rec = row[0] if hasattr(row, '__getitem__') else getattr(row, 'ComplianceRecord', row)
            d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
            d["type_name"] = row[1] if hasattr(row, '__getitem__') else getattr(row, 'type_name', None)
            d["type_category"] = row[2] if hasattr(row, '__getitem__') else getattr(row, 'type_category', None)
            d["type_compliance_source"] = row[3] if hasattr(row, '__getitem__') else getattr(row, 'type_compliance_source', None)
            d["type_external_provider"] = row[4] if hasattr(row, '__getitem__') else getattr(row, 'type_external_provider', None)
            d["issuer_tier_name"] = row[5] if hasattr(row, '__getitem__') else getattr(row, 'issuer_tier_name', None)
            d["attachment_count"] = int((row[6] if hasattr(row, '__getitem__') else getattr(row, 'attachment_count', 0)) or 0)
            return d
        except (IndexError, AttributeError):
            # Fallback: return the record as-is if row format is unexpected
            if hasattr(row, '__table__'):
                return {c.key: getattr(row, c.key) for c in row.__table__.columns}
            return row

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/records", response_model=ComplianceRecordRead, status_code=201)
async def create_compliance_record(
    body: ComplianceRecordCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.create"),
    db: AsyncSession = Depends(get_db),
):
    data = body.model_dump()
    staging_ref = data.pop("staging_ref", None)
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=data["owner_type"],
        owner_id=data["owner_id"],
    )

    # ── Pre-submission validation against ComplianceType + ComplianceRule ──
    ct = await db.get(ComplianceType, data["compliance_type_id"])
    if not ct:
        raise StructuredHTTPException(
            400,
            code="TYPE_DE_CONFORMIT_INTROUVABLE",
            message="Type de conformité introuvable",
        )
    if ct.category == "audit":
        raise StructuredHTTPException(
            400,
            code="AUDIT_DOIT_UTILISER_LE_MOTEUR_AUDIT",
            message="Les audits tiers doivent être créés depuis la section Audits, pas comme référentiel.",
        )
    issuer_tier = await _validate_record_issuer(
        db,
        entity_id=entity_id,
        compliance_type_id=ct.id,
        issuer_tier_id=data.get("issuer_tier_id"),
    )
    if issuer_tier and not data.get("issuer"):
        data["issuer"] = issuer_tier.name
    await _validate_riseup_issuer(db, entity_id=entity_id, compliance_type=ct, issuer=data.get("issuer"))

    now = datetime.now(timezone.utc)
    errors: list[str] = []

    # 1. Already expired at submission?
    if data.get("expires_at"):
        expires = data["expires_at"]
        if hasattr(expires, 'tzinfo') and expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now:
            errors.append("Le document est déjà expiré à la date de soumission.")

    # 2. Check validity_days from type (or rule override): issued_at + validity_days < now?
    issued_at = data.get("issued_at")
    if issued_at and ct.validity_days:
        if hasattr(issued_at, 'tzinfo') and issued_at.tzinfo is None:
            issued_at = issued_at.replace(tzinfo=timezone.utc)
        # Find applicable rule for potential override
        subject_scope = compliance_service._owner_subject_scope(data["owner_type"])
        rule_q = await db.execute(
            select(ComplianceRule).where(
                ComplianceRule.compliance_type_id == ct.id,
                ComplianceRule.entity_id == entity_id,
                ComplianceRule.active == True,
                or_(
                    ComplianceRule.subject_scope == subject_scope,
                    ComplianceRule.subject_scope == "all",
                ),
            ).limit(1)
        )
        rule = rule_q.scalar_one_or_none()
        effective_validity = (rule.override_validity_days if rule and rule.override_validity_days else ct.validity_days)
        grace_days = (rule.grace_period_days if rule and rule.grace_period_days else 0) or 0

        from datetime import timedelta
        max_expiry = issued_at + timedelta(days=effective_validity + grace_days)
        if max_expiry < now:
            errors.append(
                f"Le document a dépassé la validité maximale ({effective_validity}j"
                + (f" + {grace_days}j de grâce" if grace_days else "")
                + f") depuis la date d'émission."
            )

        # 3. Auto-compute expires_at if not provided
        if not data.get("expires_at") and effective_validity:
            data["expires_at"] = issued_at + timedelta(days=effective_validity)

    if errors:
        raise HTTPException(422, detail={"message": "Validation échouée", "errors": errors})

    # Security: force status to pending at creation — only verification promotes to valid
    data["status"] = "pending"
    data["verification_status"] = "pending"
    rec = ComplianceRecord(
        entity_id=entity_id,
        created_by=current_user.id,
        **data,
    )
    db.add(rec)
    await db.flush()
    if staging_ref:
        from app.services.core.staging_service import commit_staging_children
        await commit_staging_children(
            db,
            staging_owner_type="compliance_record_staging",
            final_owner_type="compliance_record",
            staging_ref=staging_ref,
            final_owner_id=rec.id,
            uploader_id=current_user.id,
            entity_id=entity_id,
        )
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="create", resource_type="compliance_record", resource_id=rec.id,
        details={
            "compliance_type_id": str(rec.compliance_type_id),
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "status": rec.status,
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
        },
    )
    await db.commit()
    await db.refresh(rec)
    # Enrich with type info
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    d["type_compliance_source"] = ct.compliance_source if ct else None
    d["type_external_provider"] = ct.external_provider if ct else None
    d["issuer_tier_name"] = issuer_tier.name if issuer_tier else None
    d["attachment_count"] = await _count_record_proof(db, record_type="compliance_record", record=rec)
    return d


@router.patch("/records/{record_id}", response_model=ComplianceRecordRead)
async def update_compliance_record(
    record_id: UUID,
    body: ComplianceRecordUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise StructuredHTTPException(
            404,
            code="RECORD_NOT_FOUND",
            message="Record not found",
        )
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=rec.owner_type,
        owner_id=rec.owner_id,
    )
    # Block updates on verified records unless user has conformite.verify permission
    await check_verified_lock(rec, current_user, entity_id=entity_id, db=db)
    updates = body.model_dump(exclude_unset=True)
    issuer_tier = None
    if "issuer_tier_id" in updates:
        issuer_tier = await _validate_record_issuer(
            db,
            entity_id=entity_id,
            compliance_type_id=rec.compliance_type_id,
            issuer_tier_id=updates.get("issuer_tier_id"),
        )
        if issuer_tier and "issuer" not in updates:
            updates["issuer"] = issuer_tier.name
    if "issuer" in updates:
        ct = await db.get(ComplianceType, rec.compliance_type_id)
        if ct:
            await _validate_riseup_issuer(db, entity_id=entity_id, compliance_type=ct, issuer=updates.get("issuer"))
    for field, value in updates.items():
        setattr(rec, field, value)
    # Auto-fix status when expiry date is corrected
    if "expires_at" in updates and rec.status == "expired":
        new_expires = updates["expires_at"]
        now = datetime.now(timezone.utc)
        if new_expires is None or new_expires > now:
            # Date corrected to future — restore to valid (if verified) or pending
            rec.status = "valid" if rec.verification_status == "verified" else "pending"
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="update", resource_type="compliance_record", resource_id=rec.id,
        details={
            "status": rec.status,
            "fields_changed": sorted(updates.keys()),
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
        },
    )
    await db.commit()
    await db.refresh(rec)
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name if ct else None
    d["type_category"] = ct.category if ct else None
    d["type_compliance_source"] = ct.compliance_source if ct else None
    d["type_external_provider"] = ct.external_provider if ct else None
    if issuer_tier is None and rec.issuer_tier_id:
        issuer_tier = await db.get(Tier, rec.issuer_tier_id)
    d["issuer_tier_name"] = issuer_tier.name if issuer_tier else None
    d["attachment_count"] = 0
    return d


@router.post("/records/{record_id}/external-verify", response_model=ComplianceRecordRead)
async def verify_compliance_record_with_external_issuer(
    record_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise StructuredHTTPException(
            404,
            code="RECORD_NOT_FOUND",
            message="Record not found",
        )
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=rec.owner_type,
        owner_id=rec.owner_id,
    )
    ct = await db.get(ComplianceType, rec.compliance_type_id)
    if not ct:
        raise HTTPException(status_code=422, detail="Type de conformite introuvable.")
    external = await _fetch_external_certificate_record(
        db,
        entity_id=entity_id,
        compliance_type=ct,
        record=rec,
    )
    apply_external_certificate_result(
        rec,
        external,
        provider_id=ct.external_provider or "",
        checked_by=current_user.id,
        checked_at=datetime.now(timezone.utc),
    )
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="external_verify", resource_type="compliance_record", resource_id=rec.id,
        details={
            "provider": ct.external_provider,
            "external_id": rec.external_verification_id,
            "result_status": rec.status,
        },
    )
    await db.commit()
    await db.refresh(rec)
    issuer_tier = await db.get(Tier, rec.issuer_tier_id) if rec.issuer_tier_id else None
    d = {c.key: getattr(rec, c.key) for c in rec.__table__.columns}
    d["type_name"] = ct.name
    d["type_category"] = ct.category
    d["type_compliance_source"] = ct.compliance_source
    d["type_external_provider"] = ct.external_provider
    d["issuer_tier_name"] = issuer_tier.name if issuer_tier else None
    d["attachment_count"] = await _count_record_proof(db, record_type="compliance_record", record=rec)
    return d


@router.delete("/records/{record_id}")
async def delete_compliance_record(
    record_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceRecord).where(ComplianceRecord.id == record_id, ComplianceRecord.entity_id == entity_id)
    )
    rec = result.scalars().first()
    if not rec:
        raise StructuredHTTPException(
            404,
            code="RECORD_NOT_FOUND",
            message="Record not found",
        )
    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=rec.owner_type,
        owner_id=rec.owner_id,
    )
    await delete_entity(rec, db, "compliance_record", entity_id=rec.id, user_id=current_user.id)
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="archive", resource_type="compliance_record", resource_id=rec.id,
        details={
            "compliance_type_id": str(rec.compliance_type_id),
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
        },
    )
    await db.commit()
    return {"detail": "Record archived"}


# ── Expiring & Non-Compliant ─────────────────────────────────────────────


from datetime import timedelta
from app.core.errors import StructuredHTTPException


class ExpiringRecordRead(BaseModel):
    id: UUID
    compliance_type_id: UUID
    type_name: str | None = None
    type_category: str | None = None
    owner_type: str
    owner_id: UUID
    status: str
    expires_at: datetime | None = None
    days_remaining: int | None = None


@router.get("/expiring", response_model=list[ExpiringRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_expiring_records(
    days: int = 30,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List compliance records expiring within N days (default 30)."""
    now = datetime.now(timezone.utc)
    cutoff = now + timedelta(days=days)

    # First auto-expire overdue records
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    for rec in (await db.execute(expire_stmt)).scalars().all():
        rec.status = "expired"
    await db.flush()

    # Then fetch expiring-soon + already-expired
    query = (
        select(ComplianceRecord, ComplianceType.name.label("type_name"), ComplianceType.category.label("type_category"))
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at <= cutoff,
        )
        .order_by(ComplianceRecord.expires_at)
        .limit(100)
    )
    query = _apply_external_record_scope(query, current_user, entity_id)
    result = await db.execute(query)
    await db.commit()

    items = []
    for row in result.all():
        rec = row[0]
        remaining = (rec.expires_at - now).days if rec.expires_at and rec.expires_at > now else 0
        items.append(ExpiringRecordRead(
            id=rec.id,
            compliance_type_id=rec.compliance_type_id,
            type_name=row[1],
            type_category=row[2],
            owner_type=rec.owner_type,
            owner_id=rec.owner_id,
            status=rec.status,
            expires_at=rec.expires_at,
            days_remaining=remaining,
        ))

    # Emit events for records expiring within 30 days
    for item in items:
        if item.days_remaining is not None and 0 < item.days_remaining <= 30:
            await emit_event("pax.credential.expiring", {
                "record_id": str(item.id),
                "entity_id": str(entity_id),
                "owner_type": item.owner_type,
                "owner_id": str(item.owner_id),
                "days_remaining": item.days_remaining,
                "type_name": item.type_name,
            })

    return items


@router.get("/non-compliant", response_model=list[ExpiringRecordRead], dependencies=[require_permission("conformite.record.read")])
async def list_non_compliant_records(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all compliance records that are expired (most overdue first)."""
    now = datetime.now(timezone.utc)

    # Auto-expire overdue records
    expire_stmt = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "valid",
            ComplianceRecord.expires_at != None,  # noqa: E711
            ComplianceRecord.expires_at < now,
        )
    )
    for rec in (await db.execute(expire_stmt)).scalars().all():
        rec.status = "expired"
    await db.flush()

    # Fetch expired records
    query = (
        select(
            ComplianceRecord,
            ComplianceType.name.label("type_name"),
            ComplianceType.category.label("type_category"),
        )
        .join(ComplianceType, ComplianceRecord.compliance_type_id == ComplianceType.id)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,  # noqa: E712
            ComplianceRecord.status == "expired",
        )
        .order_by(ComplianceRecord.expires_at.asc())
        .limit(100)
    )
    query = _apply_external_record_scope(query, current_user, entity_id)
    result = await db.execute(query)
    await db.commit()

    items = []
    for row in result.all():
        rec = row[0]
        remaining = (rec.expires_at - now).days if rec.expires_at and rec.expires_at > now else 0
        items.append(ExpiringRecordRead(
            id=rec.id,
            compliance_type_id=rec.compliance_type_id,
            type_name=row[1],
            type_category=row[2],
            owner_type=rec.owner_type,
            owner_id=rec.owner_id,
            status=rec.status,
            expires_at=rec.expires_at,
            days_remaining=remaining,
        ))
    return items


# ── Compliance Check ──────────────────────────────────────────────────────


@router.get("/check/{owner_type}/{owner_id}", response_model=ComplianceCheckResult, dependencies=[require_permission("conformite.record.check")])
async def check_compliance(
    owner_type: str,
    owner_id: UUID,
    include_contextual: bool = False,
    asset_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Check compliance status for an object.

    Compliance hierarchy:
    1. Account must be verified (at least one verified email or phone)
    2. Permanent rules must be satisfied (records with verification_status='verified')
    3. Contextual rules checked only when include_contextual=true
    4. is_compliant = account_verified AND no missing AND no expired AND no unverified records

    Records with verification_status != 'verified' count as unverified — they don't
    contribute to compliance even if their status is 'valid'.
    """
    # Bug #159 (QA modules round 41) : owner_type non valide ('INVALID',
    # 'tier', 'asset', typo…) passait silencieusement -> le service ne
    # matche aucune branche -> verdict vide -> faux "compliant" en 200.
    # Dangereux : un appelant pourrait croire un objet conforme alors que
    # le type n'est tout simplement pas supporte. On rejette explicitement.
    _VALID_COMPLIANCE_OWNER_TYPES = {"user", "tier_contact"}
    if owner_type not in _VALID_COMPLIANCE_OWNER_TYPES:
        raise StructuredHTTPException(
            422,
            code="INVALID_OWNER_TYPE",
            message=(
                f"owner_type '{owner_type}' non supporte pour le check de "
                f"conformite. Valeurs acceptees : {', '.join(sorted(_VALID_COMPLIANCE_OWNER_TYPES))}."
            ),
        )

    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type=owner_type,
        owner_id=owner_id,
    )
    verdict = await compliance_service.check_owner_compliance(
        db,
        owner_type=owner_type,
        owner_id=owner_id,
        entity_id=entity_id,
        include_contextual=include_contextual,
        asset_id=asset_id,
    )

    return ComplianceCheckResult(**verdict)


# ── Supplier audits / audits tiers ──────────────────────────────────────

def _audit_template_options():
    return selectinload(ComplianceAuditTemplate.themes).selectinload(ComplianceAuditTheme.questions)


async def _read_audit_template(db: AsyncSession, template_id: UUID) -> ComplianceAuditTemplate:
    result = await db.execute(
        select(ComplianceAuditTemplate)
        .options(_audit_template_options())
        .where(ComplianceAuditTemplate.id == template_id)
    )
    return result.scalars().unique().one()


async def _create_audit_template_from_preset(
    db: AsyncSession,
    entity_id: UUID,
    preset: dict,
) -> ComplianceAuditTemplate:
    template = ComplianceAuditTemplate(
        entity_id=entity_id,
        code=preset["code"],
        name=preset["name"],
        audit_type=preset["audit_type"],
        target_scope=preset.get("target_scope", "company"),
        description=preset.get("description"),
        passing_score=Decimal(str(preset.get("passing_score", 70))),
        score_thresholds=audit_thresholds_or_default(preset.get("score_thresholds")),
        validity_days=preset.get("validity_days"),
    )
    db.add(template)
    await db.flush()

    for theme_position, theme_in in enumerate(preset.get("themes", []), start=1):
        theme = ComplianceAuditTheme(
            template_id=template.id,
            title=theme_in["title"],
            description=theme_in.get("description"),
            weight=Decimal(str(theme_in.get("weight", 1))),
            position=theme_in.get("position", theme_position),
        )
        db.add(theme)
        await db.flush()
        for question_position, question_in in enumerate(theme_in.get("questions", []), start=1):
            db.add(ComplianceAuditQuestion(
                theme_id=theme.id,
                code=question_in.get("code"),
                text=question_in["text"],
                response_type=question_in.get("response_type", "choice"),
                weight=Decimal(str(question_in.get("weight", 1))),
                required=question_in.get("required", True),
                attachment_required=question_in.get("attachment_required", False),
                options_json=question_in.get("options_json"),
                position=question_in.get("position", question_position),
            ))
    await db.commit()
    return await _read_audit_template(db, template.id)


async def _ensure_default_audit_template_presets(db: AsyncSession, entity_id: UUID) -> None:
    existing_result = await db.execute(
        select(ComplianceAuditTemplate).where(ComplianceAuditTemplate.entity_id == entity_id)
    )
    existing_by_code = {template.code: template for template in existing_result.scalars().all()}
    missing_codes = missing_audit_template_preset_codes(set(existing_by_code.keys()))
    for code in missing_codes:
        preset = get_audit_template_preset(code)
        if preset:
            await _create_audit_template_from_preset(db, entity_id, preset)
    changed = False
    for code, template in existing_by_code.items():
        if template.score_thresholds:
            continue
        preset = get_audit_template_preset(code)
        if not preset:
            continue
        template.score_thresholds = audit_thresholds_or_default(preset.get("score_thresholds"))
        changed = True
    if changed:
        await db.commit()


@router.get(
    "/audit-template-presets",
    dependencies=[require_permission("conformite.audit.template.read")],
)
async def list_audit_template_presets_route(
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    existing_result = await db.execute(
        select(ComplianceAuditTemplate.code).where(ComplianceAuditTemplate.entity_id == entity_id)
    )
    installed_codes = set(existing_result.scalars().all())
    presets = []
    for preset in list_audit_template_presets():
        presets.append({
            "code": preset["code"],
            "name": preset["name"],
            "audit_type": preset["audit_type"],
            "target_scope": preset.get("target_scope", "company"),
            "description": preset.get("description"),
            "passing_score": preset.get("passing_score"),
            "score_thresholds": audit_thresholds_or_default(preset.get("score_thresholds")),
            "validity_days": preset.get("validity_days"),
            "theme_count": len(preset.get("themes", [])),
            "question_count": sum(len(theme.get("questions", [])) for theme in preset.get("themes", [])),
            "installed": preset["code"] in installed_codes,
        })
    return presets


@router.post(
    "/audit-template-presets/{preset_code}/install",
    response_model=ComplianceAuditTemplateRead,
)
async def install_audit_template_preset(
    preset_code: str,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.audit.template.create"),
    db: AsyncSession = Depends(get_db),
):
    preset = get_audit_template_preset(preset_code)
    if not preset:
        raise HTTPException(404, "Audit template preset not found")

    existing = await db.execute(
        select(ComplianceAuditTemplate)
        .options(_audit_template_options())
        .where(
            ComplianceAuditTemplate.entity_id == entity_id,
            ComplianceAuditTemplate.code == preset["code"],
        )
    )
    template = existing.scalars().unique().one_or_none()
    if template:
        return template

    return await _create_audit_template_from_preset(db, entity_id, preset)


@router.get(
    "/audit-templates",
    response_model=list[ComplianceAuditTemplateRead],
    dependencies=[require_permission("conformite.audit.template.read")],
)
async def list_audit_templates(
    include_inactive: bool = False,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_default_audit_template_presets(db, entity_id)
    conditions = [ComplianceAuditTemplate.entity_id == entity_id]
    if not include_inactive:
        conditions.append(ComplianceAuditTemplate.active == True)  # noqa: E712
    result = await db.execute(
        select(ComplianceAuditTemplate)
        .options(
            selectinload(ComplianceAuditTemplate.themes)
            .selectinload(ComplianceAuditTheme.questions)
        )
        .where(*conditions)
        .order_by(ComplianceAuditTemplate.audit_type, ComplianceAuditTemplate.code)
    )
    return result.scalars().unique().all()


@router.post(
    "/audit-templates",
    response_model=ComplianceAuditTemplateRead,
    status_code=201,
)
async def create_audit_template(
    body: ComplianceAuditTemplateCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.audit.template.create"),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(ComplianceAuditTemplate.id).where(
            ComplianceAuditTemplate.entity_id == entity_id,
            ComplianceAuditTemplate.code == body.code,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Audit template code already exists")

    template = ComplianceAuditTemplate(
        entity_id=entity_id,
        code=body.code,
        name=body.name,
        audit_type=body.audit_type,
        target_scope=body.target_scope,
        description=body.description,
        passing_score=Decimal(str(body.passing_score)),
        score_thresholds=audit_thresholds_or_default([
            threshold.model_dump()
            for threshold in body.score_thresholds
        ]),
        validity_days=body.validity_days,
    )
    db.add(template)
    await db.flush()
    for theme_in in body.themes:
        theme = ComplianceAuditTheme(
            template_id=template.id,
            title=theme_in.title,
            description=theme_in.description,
            weight=Decimal(str(theme_in.weight)),
            position=theme_in.position,
        )
        db.add(theme)
        await db.flush()
        for question_in in theme_in.questions:
            db.add(ComplianceAuditQuestion(
                theme_id=theme.id,
                code=question_in.code,
                text=question_in.text,
                response_type=question_in.response_type,
                weight=Decimal(str(question_in.weight)),
                required=question_in.required,
                attachment_required=question_in.attachment_required,
                options_json=question_in.options_json,
                position=question_in.position,
            ))
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="create", resource_type="compliance_audit_template", resource_id=template.id,
        details={
            "code": template.code,
            "name": template.name[:120],
            "audit_type": template.audit_type,
            "theme_count": len(body.themes),
            "question_count": sum(len(t.questions) for t in body.themes),
            "passing_score": float(template.passing_score),
        },
    )
    await db.commit()
    result = await db.execute(
        select(ComplianceAuditTemplate)
        .options(selectinload(ComplianceAuditTemplate.themes).selectinload(ComplianceAuditTheme.questions))
        .where(ComplianceAuditTemplate.id == template.id)
    )
    return result.scalars().unique().one()


async def _question_answer_count(db: AsyncSession, question_ids: set[UUID]) -> int:
    if not question_ids:
        return 0
    result = await db.execute(
        select(sqla_func.count(ComplianceAuditAnswer.id)).where(
            ComplianceAuditAnswer.question_id.in_(question_ids)
        )
    )
    return int(result.scalar_one() or 0)


async def _replace_audit_template_themes(
    db: AsyncSession,
    template: ComplianceAuditTemplate,
    themes_in: list,
) -> None:
    existing_themes = {theme.id: theme for theme in template.themes}
    existing_questions = {
        question.id: question
        for theme in template.themes
        for question in theme.questions
    }
    incoming_theme_ids = {theme_in.id for theme_in in themes_in if theme_in.id}
    incoming_question_ids = {
        question_in.id
        for theme_in in themes_in
        for question_in in theme_in.questions
        if question_in.id
    }

    unknown_theme_ids = incoming_theme_ids - set(existing_themes)
    if unknown_theme_ids:
        raise HTTPException(400, "Unknown audit theme in template payload")
    unknown_question_ids = incoming_question_ids - set(existing_questions)
    if unknown_question_ids:
        raise HTTPException(400, "Unknown audit question in template payload")

    omitted_question_ids = set(existing_questions) - incoming_question_ids
    used_omitted_count = await _question_answer_count(db, omitted_question_ids)
    if used_omitted_count:
        raise HTTPException(
            409,
            "Cannot remove audit questions already used by audit answers. Disable the template or create a new version.",
        )

    next_themes: list[ComplianceAuditTheme] = []
    for theme_position, theme_in in enumerate(themes_in):
        theme = existing_themes.get(theme_in.id) if theme_in.id else ComplianceAuditTheme(template_id=template.id)
        theme.title = theme_in.title
        theme.description = theme_in.description
        theme.weight = Decimal(str(theme_in.weight))
        theme.position = theme_in.position if theme_in.position is not None else theme_position
        if not theme.id:
            db.add(theme)
            await db.flush()

        theme_questions = {question.id: question for question in theme.questions}
        next_questions: list[ComplianceAuditQuestion] = []
        for question_position, question_in in enumerate(theme_in.questions):
            question = (
                existing_questions.get(question_in.id)
                if question_in.id
                else ComplianceAuditQuestion(theme_id=theme.id)
            )
            if question_in.id and question.theme_id != theme.id:
                question.theme_id = theme.id
            question.code = question_in.code
            question.text = question_in.text
            question.response_type = question_in.response_type
            question.weight = Decimal(str(question_in.weight))
            question.required = question_in.required
            question.attachment_required = question_in.attachment_required
            question.options_json = question_in.options_json
            question.position = question_in.position if question_in.position is not None else question_position
            if not question.id:
                db.add(question)
            next_questions.append(question)

        removable_theme_questions = set(theme_questions) - {question.id for question in next_questions if question.id}
        theme.questions = [
            question
            for question in next_questions
            if question.id not in removable_theme_questions
        ]
        next_themes.append(theme)

    removable_theme_ids = set(existing_themes) - incoming_theme_ids
    template.themes = [
        theme
        for theme in next_themes
        if theme.id not in removable_theme_ids
    ]


@router.patch(
    "/audit-templates/{template_id}",
    response_model=ComplianceAuditTemplateRead,
)
async def update_audit_template(
    template_id: UUID,
    body: ComplianceAuditTemplateUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.audit.template.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceAuditTemplate)
        .options(selectinload(ComplianceAuditTemplate.themes).selectinload(ComplianceAuditTheme.questions))
        .where(ComplianceAuditTemplate.id == template_id, ComplianceAuditTemplate.entity_id == entity_id)
    )
    template = result.scalars().unique().one_or_none()
    if not template:
        raise HTTPException(404, "Audit template not found")
    if body.code and body.code != template.code:
        existing = await db.execute(
            select(ComplianceAuditTemplate.id).where(
                ComplianceAuditTemplate.entity_id == entity_id,
                ComplianceAuditTemplate.code == body.code,
                ComplianceAuditTemplate.id != template.id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(409, "Audit template code already exists")
    payload = body.model_dump(exclude_unset=True, exclude={"themes"})
    for key, value in payload.items():
        if key == "passing_score" and value is not None:
            value = Decimal(str(value))
        elif key == "score_thresholds" and value is not None:
            value = normalize_audit_score_thresholds(value)
        setattr(template, key, value)
    if body.themes is not None:
        await _replace_audit_template_themes(db, template, body.themes)
    await db.commit()
    result = await db.execute(
        select(ComplianceAuditTemplate)
        .options(selectinload(ComplianceAuditTemplate.themes).selectinload(ComplianceAuditTheme.questions))
        .where(ComplianceAuditTemplate.id == template.id)
    )
    return result.scalars().unique().one()


@router.get(
    "/audits",
    response_model=list[ComplianceAuditRead],
    dependencies=[require_permission("conformite.audit.read")],
)
async def list_compliance_audits(
    target_type: str | None = None,
    target_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ComplianceAudit)
        .options(*_audit_read_options())
        .where(ComplianceAudit.entity_id == entity_id)
        .order_by(ComplianceAudit.created_at.desc())
    )
    if target_type:
        query = query.where(ComplianceAudit.target_type == target_type)
    if target_id:
        query = query.where(ComplianceAudit.target_id == target_id)
    audits = list((await db.execute(query)).scalars().unique().all())
    for audit in audits:
        await _enrich_audit_target(db, audit)
    await _enrich_audit_answer_attachment_counts(db, audits)
    return audits


@router.post("/audits", response_model=ComplianceAuditRead, status_code=201)
async def create_compliance_audit(
    body: ComplianceAuditCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.audit.create"),
    db: AsyncSession = Depends(get_db),
):
    template = await db.get(ComplianceAuditTemplate, body.template_id)
    if not template or template.entity_id != entity_id or not template.active:
        raise HTTPException(404, "Audit template not found")
    if body.target_type != "tier":
        raise HTTPException(400, "Only tier audits are supported in this release")
    tier = await db.get(Tier, body.target_id)
    if not tier or tier.entity_id != entity_id:
        raise HTTPException(404, "Supplier not found")
    ref = await generate_reference("AUD", db, entity_id=entity_id)
    audit = ComplianceAudit(
        entity_id=entity_id,
        template_id=template.id,
        target_type=body.target_type,
        target_id=body.target_id,
        reference=ref,
        title=body.title or f"{template.name} - {tier.name}",
        planned_at=body.planned_at,
        summary=body.summary,
        created_by=current_user.id,
    )
    db.add(audit)
    await db.flush()
    await db.commit()
    return await _load_audit_for_read(db, audit.id, entity_id)


@router.patch("/audits/{audit_id}", response_model=ComplianceAuditRead)
async def update_compliance_audit(
    audit_id: UUID,
    body: ComplianceAuditUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.audit.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceAudit)
        .options(*_audit_read_options())
        .where(ComplianceAudit.id == audit_id, ComplianceAudit.entity_id == entity_id)
    )
    audit = result.scalars().unique().one_or_none()
    if not audit:
        raise HTTPException(404, "Audit not found")
    _ensure_audit_can_be_edited(audit)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("status") in AUDIT_LOCKED_STATUSES:
        raise HTTPException(409, "Use the audit submission and validation workflow to lock this report")
    for key, value in payload.items():
        setattr(audit, key, value)
    await db.commit()
    return await _load_audit_for_read(db, audit.id, entity_id)


@router.put("/audits/{audit_id}/answers", response_model=ComplianceAuditRead)
async def upsert_audit_answers(
    audit_id: UUID,
    answers: list[ComplianceAuditAnswerUpsert],
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.audit.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceAudit)
        .options(
            selectinload(ComplianceAudit.template)
            .selectinload(ComplianceAuditTemplate.themes)
            .selectinload(ComplianceAuditTheme.questions),
            selectinload(ComplianceAudit.answers),
        )
        .where(ComplianceAudit.id == audit_id, ComplianceAudit.entity_id == entity_id)
    )
    audit = result.scalars().unique().one_or_none()
    if not audit:
        raise HTTPException(404, "Audit not found")
    _ensure_audit_can_be_edited(audit)
    question_ids = {
        question.id
        for theme in (audit.template.themes if audit.template else [])
        for question in theme.questions
    }
    if any(item.question_id not in question_ids for item in answers):
        raise HTTPException(400, "Answer references a question outside this audit template")

    existing_result = await db.execute(
        select(ComplianceAuditAnswer).where(ComplianceAuditAnswer.audit_id == audit.id)
    )
    existing = {answer.question_id: answer for answer in existing_result.scalars().all()}
    now = datetime.now(timezone.utc)
    for item in answers:
        row = existing.get(item.question_id)
        if row is None:
            row = ComplianceAuditAnswer(audit_id=audit.id, question_id=item.question_id)
            db.add(row)
        row.response_value = item.response_value
        row.score = Decimal(str(item.score)) if item.score is not None else None
        row.notes = item.notes
        row.answered_by = current_user.id
        row.answered_at = now
    audit.status = "in_progress" if audit.status == "draft" else audit.status
    audit.started_at = audit.started_at or now
    await db.flush()
    await _recompute_audit_score(db, audit)
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="update_answers", resource_type="compliance_audit", resource_id=audit.id,
        details={
            "answers_count": len(answers),
            "status": audit.status,
            "score_percent": float(audit.score_percent) if audit.score_percent is not None else None,
        },
    )
    await db.commit()
    return await _load_audit_for_read(db, audit.id, entity_id)


@router.post("/audits/{audit_id}/submit", response_model=ComplianceAuditRead)
async def submit_compliance_audit(
    audit_id: UUID,
    body: ComplianceAuditSubmit,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.audit.submit"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceAudit)
        .options(
            selectinload(ComplianceAudit.template)
            .selectinload(ComplianceAuditTemplate.themes)
            .selectinload(ComplianceAuditTheme.questions),
            selectinload(ComplianceAudit.answers),
        )
        .where(ComplianceAudit.id == audit_id, ComplianceAudit.entity_id == entity_id)
    )
    audit = result.scalars().unique().one_or_none()
    if not audit:
        raise HTTPException(404, "Audit not found")
    _ensure_audit_can_be_submitted(audit)
    if audit.validation_moc_id:
        raise HTTPException(409, "Audit validation workflow already exists")

    required_question_ids = {
        question.id
        for theme in (audit.template.themes if audit.template else [])
        for question in theme.questions
        if question.required
    }
    answered_question_ids = {
        answer.question_id
        for answer in audit.answers
        if _audit_answer_is_answered(answer)
    }
    missing = required_question_ids - answered_question_ids
    if missing:
        raise HTTPException(422, f"Audit has {len(missing)} required unanswered question(s)")
    await _enrich_audit_answer_attachment_counts(db, [audit])
    answer_by_question = {answer.question_id: answer for answer in audit.answers}
    missing_proof = [
        question.id
        for theme in (audit.template.themes if audit.template else [])
        for question in theme.questions
        if question.attachment_required
        and (answer_by_question.get(question.id) is None or getattr(answer_by_question[question.id], "attachment_count", 0) <= 0)
    ]
    if missing_proof:
        raise HTTPException(422, f"Audit has {len(missing_proof)} required proof attachment(s) missing")
    validator_ids = await _resolve_audit_validator_ids(
        db,
        entity_id=entity_id,
        requested_ids=body.validator_user_ids,
    )
    if not validator_ids:
        raise HTTPException(422, "At least one active validator from the current entity is required")

    await _recompute_audit_score(db, audit)
    moc_payload = MOCContextCreate(
        title=f"Validation audit {audit.reference}",
        description=body.comment or audit.summary,
        impact_analysis=f"Score audit: {audit.score_percent if audit.score_percent is not None else 'N/A'}%",
        workflow_profile="audit_validation",
        context_module="conformite",
        context_payload={
            "audit_id": str(audit.id),
            "audit_reference": audit.reference,
            "target_type": audit.target_type,
            "target_id": str(audit.target_id),
        },
        initial_validators=[
            MOCInitialValidator(user_id=user_id, role="metier", metier_code="AUDIT", metier_name="Audit")
            for user_id in validator_ids
        ],
    )
    moc = await create_contextual_moc(
        db,
        entity_id=entity_id,
        actor=current_user,
        context_type="compliance_audit",
        context_id=audit.id,
        context_module="conformite",
        payload=moc_payload,
        context_payload=moc_payload.context_payload,
    )
    await transition_moc(db, moc=moc, to_status="submitted", actor=current_user, comment=body.comment)
    audit.validation_moc_id = moc.id
    audit.status = "submitted"
    audit.submitted_at = datetime.now(timezone.utc)
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="submit", resource_type="compliance_audit", resource_id=audit.id,
        details={
            "reference": audit.reference,
            "target_type": audit.target_type,
            "target_id": str(audit.target_id),
            "score_percent": float(audit.score_percent) if audit.score_percent is not None else None,
            "validators_count": len(validator_ids),
            "validation_moc_id": str(moc.id),
        },
    )
    await db.commit()
    return await _load_audit_for_read(db, audit.id, entity_id)


@router.get(
    "/audits/{audit_id}/report.pdf",
    dependencies=[require_permission("conformite.audit.read")],
)
async def download_compliance_audit_report_pdf(
    audit_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ComplianceAudit)
        .options(
            selectinload(ComplianceAudit.template)
            .selectinload(ComplianceAuditTemplate.themes)
            .selectinload(ComplianceAuditTheme.questions),
            selectinload(ComplianceAudit.answers)
            .selectinload(ComplianceAuditAnswer.question)
            .selectinload(ComplianceAuditQuestion.theme),
        )
        .where(ComplianceAudit.id == audit_id, ComplianceAudit.entity_id == entity_id)
    )
    audit = result.scalars().unique().one_or_none()
    if not audit:
        raise HTTPException(404, "Audit not found")
    await _enrich_audit_answer_attachment_counts(db, [audit])
    variables = await _build_audit_report_variables(db, audit=audit, entity_id=entity_id)
    from app.core.pdf_templates import _html_to_pdf, render_pdf, render_template_string

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="compliance.supplier_audit_report",
            entity_id=entity_id,
            language=language,
            variables=variables,
        )
        if not pdf_bytes:
            html = render_template_string(_SUPPLIER_AUDIT_REPORT_FALLBACK_HTML, variables)
            pdf_bytes = _html_to_pdf(html)
    except RuntimeError:
        pdf_bytes = _build_basic_audit_pdf(variables)
    safe_ref = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in audit.reference)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="audit-fournisseur-{safe_ref}.pdf"'},
    )


# ── Job Positions (fiches de poste) ─────────────────────────────────────


@router.get("/job-positions", response_model=PaginatedResponse[JobPositionRead], dependencies=[require_permission("conformite.job_position.read")])
async def list_job_positions(
    department: str | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(JobPosition).where(
        JobPosition.entity_id == entity_id,
        JobPosition.active == True,
    )
    if department:
        query = query.where(JobPosition.department == department)
    if search:
        like = f"%{search}%"
        query = query.where(JobPosition.name.ilike(like) | JobPosition.code.ilike(like))
    query = query.order_by(JobPosition.department, JobPosition.name)
    return await paginate(db, query, pagination)


@router.post("/job-positions", response_model=JobPositionRead, status_code=201)
async def create_job_position(
    body: JobPositionCreate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.job_position.create"),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    payload["code"] = (payload.get("code") or "").strip() or await generate_reference("JBP", db, entity_id=entity_id)
    jp = JobPosition(entity_id=entity_id, **payload)
    db.add(jp)
    await db.commit()
    await db.refresh(jp)
    return jp


@router.patch("/job-positions/{jp_id}", response_model=JobPositionRead)
async def update_job_position(
    jp_id: UUID,
    body: JobPositionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.job_position.update"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobPosition).where(JobPosition.id == jp_id, JobPosition.entity_id == entity_id)
    )
    jp = result.scalars().first()
    if not jp:
        raise StructuredHTTPException(
            404,
            code="JOB_POSITION_NOT_FOUND",
            message="Job position not found",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(jp, field, value)
    await db.commit()
    await db.refresh(jp)
    return jp


@router.delete("/job-positions/{jp_id}")
async def delete_job_position(
    jp_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.job_position.delete"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobPosition).where(JobPosition.id == jp_id, JobPosition.entity_id == entity_id)
    )
    jp = result.scalars().first()
    if not jp:
        raise StructuredHTTPException(
            404,
            code="JOB_POSITION_NOT_FOUND",
            message="Job position not found",
        )
    await delete_entity(jp, db, "job_position", entity_id=jp.id, user_id=current_user.id)
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="archive", resource_type="job_position", resource_id=jp.id,
        details={"code": jp.code, "name": (jp.name or "")[:120], "department": jp.department},
    )
    await db.commit()
    return {"detail": "Job position archived"}


# ── Employee Transfers ───────────────────────────────────────────────────


async def _invalidate_compliance_on_transfer(db: AsyncSession, contact_id: UUID) -> None:
    """
    SUP-0038: Invalidate existing compliance records when an employee is transferred.

    When an employee changes tier (company) or job position, their compliance
    requirements may change (different HSE certifications, different contextual rules).
    We mark existing compliance records as inactive to force re-verification in the new context.

    This ensures:
    1. Old compliance records from previous context don't count as valid
    2. New compliance checks reflect the current tier/job requirements
    3. Compliance officers must re-verify/re-issue documents for the new context

    Note: We mark records as active=False rather than deleting them to preserve audit trail.
    """
    await db.execute(
        update(ComplianceRecord)
        .where(
            ComplianceRecord.owner_type == "tier_contact",
            ComplianceRecord.owner_id == contact_id,
            ComplianceRecord.active == True,
        )
        .values(active=False)
    )
    # Emit event for audit trail (optional, if event system is enabled)
    await emit_event(
        event_type="compliance.invalidated_on_transfer",
        entity_type="tier_contact",
        entity_id=contact_id,
        data={"reason": "Employee transfer - context changed"},
    )


@router.get("/transfers", response_model=PaginatedResponse[TierContactTransferRead], dependencies=[require_permission("conformite.transfer.read")])
async def list_transfers(
    contact_id: UUID | None = None,
    from_tier_id: UUID | None = None,
    to_tier_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List employee transfers with enriched names."""
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    from_tier = Tier.__table__.alias("from_tier")
    to_tier = Tier.__table__.alias("to_tier")

    query = (
        select(
            TierContactTransfer,
            (TierContact.first_name + " " + TierContact.last_name).label("contact_name"),
            from_tier.c.name.label("from_tier_name"),
            to_tier.c.name.label("to_tier_name"),
        )
        .join(TierContact, TierContactTransfer.contact_id == TierContact.id)
        .join(from_tier, TierContactTransfer.from_tier_id == from_tier.c.id)
        .join(to_tier, TierContactTransfer.to_tier_id == to_tier.c.id)
        # Filter by entity via the contact's tier
        .where(TierContact.tier_id.in_(
            select(Tier.id).where(Tier.entity_id == entity_id)
        ))
    )
    if linked_tier_ids is not None:
        query = query.where(
            or_(
                TierContactTransfer.from_tier_id.in_(linked_tier_ids),
                TierContactTransfer.to_tier_id.in_(linked_tier_ids),
                TierContact.tier_id.in_(linked_tier_ids),
            )
        )
    if contact_id:
        query = query.where(TierContactTransfer.contact_id == contact_id)
    if from_tier_id:
        query = query.where(TierContactTransfer.from_tier_id == from_tier_id)
    if to_tier_id:
        query = query.where(TierContactTransfer.to_tier_id == to_tier_id)
    query = query.order_by(TierContactTransfer.transfer_date.desc())

    def _transform(row):
        transfer = row[0]
        d = {c.key: getattr(transfer, c.key) for c in transfer.__table__.columns}
        d["contact_name"] = row[1]
        d["from_tier_name"] = row[2]
        d["to_tier_name"] = row[3]
        return d

    return await paginate(db, query, pagination, transform=_transform)


@router.post("/transfers", response_model=TierContactTransferRead, status_code=201)
async def create_transfer(
    body: TierContactTransferCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.transfer.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a transfer record and update the contact's tier_id (and optionally job_position_id).

    SUP-0038: Also invalidates existing compliance records and triggers re-verification
    in the new context (new tier + new job position if provided).
    """
    # Validate contact exists AND belongs to the caller's entity (via parent tier)
    contact_row = await db.execute(
        select(TierContact)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(TierContact.id == body.contact_id, Tier.entity_id == entity_id)
    )
    contact = contact_row.scalar_one_or_none()
    if not contact:
        raise StructuredHTTPException(
            404,
            code="CONTACT_NOT_FOUND",
            message="Contact not found",
        )
    # Also validate from/to tiers belong to caller's entity.
    tier_check = await db.execute(
        select(Tier.id).where(
            Tier.id.in_([body.from_tier_id, body.to_tier_id]),
            Tier.entity_id == entity_id,
        )
    )
    allowed = {row[0] for row in tier_check.all()}
    if body.from_tier_id not in allowed or body.to_tier_id not in allowed:
        raise StructuredHTTPException(
            404,
            code="TIER_NOT_FOUND",
            message="Tier not found",
        )

    # Validate new job position if provided (SUP-0038)
    if body.new_job_position_id:
        jp_check = await db.execute(
            select(JobPosition).where(
                JobPosition.id == body.new_job_position_id,
                JobPosition.entity_id == entity_id,
                JobPosition.active == True,
            )
        )
        new_job_position = jp_check.scalar_one_or_none()
        if not new_job_position:
            raise StructuredHTTPException(
                404,
                code="JOB_POSITION_NOT_FOUND",
                message="Job position not found",
            )

    await _assert_external_owner_access(
        db,
        current_user,
        entity_id,
        owner_type="tier_contact",
        owner_id=body.contact_id,
    )
    if current_user.user_type == "external":
        linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
        if not linked_tier_ids or body.from_tier_id not in linked_tier_ids or body.to_tier_id not in linked_tier_ids:
            raise StructuredHTTPException(
                403,
                code="EXTERNAL_USERS_CANNOT_TRANSFER_CONTACTS_OUTSIDE",
                message="External users cannot transfer contacts outside their company scope",
            )

    # Create transfer log
    transfer = TierContactTransfer(
        transferred_by=current_user.id,
        **body.model_dump(),
    )
    db.add(transfer)

    # Actually move the contact to the new tier
    contact.tier_id = body.to_tier_id

    # Update job position if provided (SUP-0038)
    if body.new_job_position_id:
        contact.job_position_id = body.new_job_position_id

    # SUP-0038: Invalidate existing compliance records when context changes
    # (tier or job position changed → compliance requirements may differ)
    await _invalidate_compliance_on_transfer(db, contact.id)

    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="create", resource_type="tier_contact_transfer", resource_id=transfer.id,
        details={
            "contact_id": str(transfer.contact_id),
            "from_tier_id": str(transfer.from_tier_id),
            "to_tier_id": str(transfer.to_tier_id),
            "new_job_position_id": str(transfer.new_job_position_id) if transfer.new_job_position_id else None,
            "transfer_date": transfer.transfer_date.isoformat() if transfer.transfer_date else None,
        },
    )

    await db.commit()
    await db.refresh(transfer)

    # Enrich response
    from_tier = await db.get(Tier, transfer.from_tier_id)
    to_tier = await db.get(Tier, transfer.to_tier_id)
    new_job_pos = await db.get(JobPosition, transfer.new_job_position_id) if transfer.new_job_position_id else None
    d = {c.key: getattr(transfer, c.key) for c in transfer.__table__.columns}
    d["contact_name"] = f"{contact.first_name} {contact.last_name}"
    d["from_tier_name"] = from_tier.name if from_tier else None
    d["to_tier_name"] = to_tier.name if to_tier else None
    d["new_job_position_name"] = new_job_pos.name if new_job_pos else None
    return d


# ── Compliance Exemptions ────────────────────────────────────────────────


async def _enrich_exemption(db: AsyncSession, exemption) -> dict:
    """Build enriched dict for a ComplianceExemption row."""
    d = {c.key: getattr(exemption, c.key) for c in exemption.__table__.columns}
    # Record type info
    record = await db.get(ComplianceRecord, exemption.compliance_record_id)
    if record:
        ct = await db.get(ComplianceType, record.compliance_type_id)
        d["record_type_name"] = ct.name if ct else None
        d["record_type_category"] = ct.category if ct else None
        # Owner name
        if record.owner_type == "tier_contact":
            contact = await db.get(TierContact, record.owner_id)
            d["owner_name"] = f"{contact.first_name} {contact.last_name}" if contact else None
        elif record.owner_type == "tier":
            tier = await db.get(Tier, record.owner_id)
            d["owner_name"] = tier.name if tier else None
        elif record.owner_type == "user":
            user = await db.get(User, record.owner_id)
            d["owner_name"] = f"{user.first_name} {user.last_name}" if user else None
        else:
            d["owner_name"] = None
    else:
        d["record_type_name"] = None
        d["record_type_category"] = None
        d["owner_name"] = None
    # Approver / creator names
    if exemption.approved_by:
        approver = await db.get(User, exemption.approved_by)
        d["approver_name"] = f"{approver.first_name} {approver.last_name}" if approver else None
    else:
        d["approver_name"] = None
    creator = await db.get(User, exemption.created_by)
    d["creator_name"] = f"{creator.first_name} {creator.last_name}" if creator else None
    return d


@router.get("/exemptions", response_model=PaginatedResponse[ComplianceExemptionRead], dependencies=[require_permission("conformite.exemption.read")])
async def list_exemptions(
    status: str | None = None,
    compliance_type_id: UUID | None = None,
    search: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List compliance exemptions with filters and pagination."""
    from datetime import date as date_type

    # Auto-expire exemptions past their end date
    today = date_type.today()
    expire_stmt = (
        select(ComplianceExemption)
        .where(
            ComplianceExemption.entity_id == entity_id,
            ComplianceExemption.active == True,  # noqa: E712
            ComplianceExemption.status == "approved",
            ComplianceExemption.end_date < today,
        )
    )
    for ex in (await db.execute(expire_stmt)).scalars().all():
        ex.status = "expired"
    await db.flush()

    query = (
        select(ComplianceExemption)
        .where(ComplianceExemption.entity_id == entity_id, ComplianceExemption.active == True)  # noqa: E712
    )
    if status:
        query = query.where(ComplianceExemption.status == status)
    if compliance_type_id:
        query = query.where(
            ComplianceExemption.compliance_record_id.in_(
                select(ComplianceRecord.id).where(ComplianceRecord.compliance_type_id == compliance_type_id)
            )
        )
    if search:
        like = f"%{search}%"
        query = query.where(ComplianceExemption.reason.ilike(like))
    query = query.order_by(ComplianceExemption.created_at.desc())

    # Count total
    count_query = select(sqla_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0
    pages = (total + pagination.page_size - 1) // pagination.page_size if total > 0 else 0

    # Fetch page
    paginated = query.offset(pagination.offset).limit(pagination.page_size)
    result = await db.execute(paginated)
    exemptions = result.scalars().all()

    # Enrich each item (async)
    items = [await _enrich_exemption(db, ex) for ex in exemptions]

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": pages,
    }


@router.post("/exemptions", response_model=ComplianceExemptionRead, status_code=201)
async def create_exemption(
    body: ComplianceExemptionCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new compliance exemption (status=pending)."""
    # Validate the compliance record exists and belongs to entity
    rec = await db.get(ComplianceRecord, body.compliance_record_id)
    if not rec or rec.entity_id != entity_id:
        raise StructuredHTTPException(
            404,
            code="COMPLIANCE_RECORD_NOT_FOUND",
            message="Compliance record not found",
        )

    if body.end_date <= body.start_date:
        raise StructuredHTTPException(
            400,
            code="END_DATE_MUST_AFTER_START_DATE",
            message="end_date must be after start_date",
        )

    exemption = ComplianceExemption(
        entity_id=entity_id,
        created_by=current_user.id,
        status="pending",
        **body.model_dump(),
    )
    db.add(exemption)
    await db.flush()
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="create", resource_type="compliance_exemption", resource_id=exemption.id,
        details={
            "compliance_record_id": str(exemption.compliance_record_id),
            "start_date": exemption.start_date.isoformat() if exemption.start_date else None,
            "end_date": exemption.end_date.isoformat() if exemption.end_date else None,
        },
    )
    await db.commit()
    await db.refresh(exemption)
    return await _enrich_exemption(db, exemption)


@router.patch("/exemptions/{exemption_id}", response_model=ComplianceExemptionRead)
async def update_exemption(
    exemption_id: UUID,
    body: ComplianceExemptionUpdate,
    entity_id: UUID = Depends(get_current_entity),
    _: None = require_permission("conformite.exemption.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an exemption (change status, extend end_date, update conditions)."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise StructuredHTTPException(
            404,
            code="EXEMPTION_NOT_FOUND",
            message="Exemption not found",
        )
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(exemption, field, value)
    await db.commit()
    await db.refresh(exemption)
    return await _enrich_exemption(db, exemption)


@router.post("/exemptions/{exemption_id}/approve", response_model=ComplianceExemptionRead)
async def approve_exemption(
    exemption_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve a pending exemption."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise StructuredHTTPException(
            404,
            code="EXEMPTION_NOT_FOUND",
            message="Exemption not found",
        )
    if exemption.status != "pending":
        raise StructuredHTTPException(
            400,
            code="CANNOT_APPROVE_EXEMPTION_STATUS",
            message="Cannot approve exemption with status '{status}'",
            params={
                "status": exemption.status,
            },
        )
    exemption.status = "approved"
    exemption.approved_by = current_user.id
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="approve", resource_type="compliance_exemption", resource_id=exemption.id,
        details={
            "compliance_record_id": str(exemption.compliance_record_id),
            "start_date": exemption.start_date.isoformat() if exemption.start_date else None,
            "end_date": exemption.end_date.isoformat() if exemption.end_date else None,
        },
    )
    await db.commit()
    await db.refresh(exemption)

    await emit_event("conformite.exemption.approved", {
        "exemption_id": str(exemption.id),
        "entity_id": str(entity_id),
        "record_id": str(exemption.compliance_record_id),
        "approved_by": str(current_user.id),
    })

    return await _enrich_exemption(db, exemption)


class RejectExemptionBody(BaseModel):
    reason: str = Field(..., min_length=1)


@router.post("/exemptions/{exemption_id}/reject", response_model=ComplianceExemptionRead)
async def reject_exemption(
    exemption_id: UUID,
    body: RejectExemptionBody,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Reject a pending exemption (requires reason)."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise StructuredHTTPException(
            404,
            code="EXEMPTION_NOT_FOUND",
            message="Exemption not found",
        )
    if exemption.status != "pending":
        raise StructuredHTTPException(
            400,
            code="CANNOT_REJECT_EXEMPTION_STATUS",
            message="Cannot reject exemption with status '{status}'",
            params={
                "status": exemption.status,
            },
        )
    exemption.status = "rejected"
    exemption.approved_by = current_user.id
    exemption.rejection_reason = body.reason
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="reject", resource_type="compliance_exemption", resource_id=exemption.id,
        details={
            "compliance_record_id": str(exemption.compliance_record_id),
            "reason": body.reason[:200],  # Cap to avoid bloated audit payloads
        },
    )
    await db.commit()
    await db.refresh(exemption)

    await emit_event("conformite.exemption.rejected", {
        "exemption_id": str(exemption.id),
        "entity_id": str(entity_id),
        "record_id": str(exemption.compliance_record_id),
        "rejected_by": str(current_user.id),
    })

    return await _enrich_exemption(db, exemption)


@router.delete("/exemptions/{exemption_id}")
async def delete_exemption(
    exemption_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.exemption.delete"),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete an exemption."""
    result = await db.execute(
        select(ComplianceExemption).where(
            ComplianceExemption.id == exemption_id,
            ComplianceExemption.entity_id == entity_id,
        )
    )
    exemption = result.scalars().first()
    if not exemption:
        raise StructuredHTTPException(
            404,
            code="EXEMPTION_NOT_FOUND",
            message="Exemption not found",
        )
    await delete_entity(exemption, db, "compliance_exemption", entity_id=exemption.id, user_id=current_user.id)
    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="archive", resource_type="compliance_exemption", resource_id=exemption.id,
        details={
            "compliance_record_id": str(exemption.compliance_record_id),
            "previous_status": exemption.status,
        },
    )
    await db.commit()
    return {"detail": "Exemption archived"}


# ── Verification / Validation workflow ───────────────────────────────────


class PendingVerificationItem(BaseModel):
    id: str
    record_type: str  # passport, visa, medical_check, compliance_record, etc.
    owner_type: str | None = None
    owner_id: str | None = None
    owner_name: str | None = None
    description: str
    submitted_at: str
    verification_status: str


class VerifyAction(BaseModel):
    action: str = Field(..., pattern="^(verify|reject)$")
    rejection_reason: str | None = None


@router.get("/pending-verifications")
async def list_pending_verifications(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.verify"),
    db: AsyncSession = Depends(get_db),
):
    """List all records across verifiable models that are pending verification.

    Scoped to current entity: ComplianceRecords by entity_id,
    user sub-models by users belonging to the entity via group membership.
    """
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense, UserGroup, UserGroupMember,
    )

    items: list[dict] = []

    # Subquery: user IDs belonging to the current entity
    entity_user_ids = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id, UserGroup.active == True)
        .distinct()
    )

    # ComplianceRecords (entity-scoped directly)
    cr_result = await db.execute(
        select(ComplianceRecord).where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.verification_status == "pending",
        ).order_by(ComplianceRecord.created_at.desc())
    )
    for rec in cr_result.scalars().all():
        ct = await db.get(ComplianceType, rec.compliance_type_id)
        pj_required = True
        rule_q = await db.execute(
            select(ComplianceRule).where(
                ComplianceRule.compliance_type_id == rec.compliance_type_id,
                ComplianceRule.entity_id == entity_id,
                ComplianceRule.active == True,
                or_(
                    ComplianceRule.subject_scope == compliance_service._owner_subject_scope(rec.owner_type),
                    ComplianceRule.subject_scope == "all",
                ),
            ).limit(1)
        )
        rule = rule_q.scalar_one_or_none()
        if rule:
            pj_required = rule.attachment_required
        items.append({
            "id": str(rec.id),
            "record_type": "compliance_record",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"{ct.name if ct else rec.compliance_type_id} — {rec.issuer or 'N/A'}",
            "submitted_at": rec.created_at.isoformat(),
            "verification_status": rec.verification_status,
            "issued_at": rec.issued_at.isoformat() if rec.issued_at else None,
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
            "issuer": rec.issuer or None,
            "reference_number": rec.reference_number or None,
            "category": ct.category if ct else None,
            "type_name": ct.name if ct else None,
            "attachment_count": await _count_record_proof(db, record_type="compliance_record", record=rec),
            "attachment_required": pj_required,
        })

    # User sub-models — scoped to users in current entity
    # Each entry: (Model, record_type, desc_fn, extra_fields_fn)
    sub_models = [
        (
            UserPassport, "passport",
            lambda r: f"Passeport {r.number} — {r.country}",
            lambda r: {
                "issued_at": r.issue_date.isoformat() if r.issue_date else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": r.number,
            },
        ),
        (
            UserVisa, "visa",
            lambda r: f"Visa {r.visa_type} — {r.country}",
            lambda r: {
                "issued_at": r.issue_date.isoformat() if r.issue_date else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": r.number or None,
            },
        ),
        (
            SocialSecurity, "social_security",
            lambda r: f"Sécu sociale {r.country} — {r.number}",
            lambda r: {
                "issued_at": None,
                "expires_at": None,
                "issuer": r.country,
                "reference_number": r.number,
            },
        ),
        (
            UserVaccine, "vaccine",
            lambda r: f"Vaccin {r.vaccine_type}",
            lambda r: {
                "issued_at": r.date_administered.isoformat() if r.date_administered else None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": None,
                "reference_number": r.batch_number or None,
            },
        ),
        (
            DrivingLicense, "driving_license",
            lambda r: f"Permis {r.license_type} — {r.country}",
            lambda r: {
                "issued_at": None,
                "expires_at": r.expiry_date.isoformat() if r.expiry_date else None,
                "issuer": r.country,
                "reference_number": None,
            },
        ),
    ]

    for Model, rtype, desc_fn, extra_fn in sub_models:
        result = await db.execute(
            select(Model).where(
                Model.verification_status == "pending",
                Model.user_id.in_(entity_user_ids),
            ).order_by(Model.created_at.desc())
        )
        for rec in result.scalars().all():
            item = {
                "id": str(rec.id),
                "record_type": rtype,
                "owner_type": "user",
                "owner_id": str(rec.user_id),
                "owner_name": None,
                "description": desc_fn(rec),
                "submitted_at": rec.created_at.isoformat(),
                "verification_status": rec.verification_status,
                "category": None,
                "type_name": None,
                "attachment_count": await _count_record_proof(db, record_type=rtype, record=rec),
                "attachment_required": True,
            }
            item.update(extra_fn(rec))
            items.append(item)

    # MedicalChecks (polymorphic) — scope owner to entity users
    mc_result = await db.execute(
        select(MedicalCheck).where(
            MedicalCheck.verification_status == "pending",
            MedicalCheck.owner_id.in_(entity_user_ids),
        ).order_by(MedicalCheck.created_at.desc())
    )
    for rec in mc_result.scalars().all():
        items.append({
            "id": str(rec.id),
            "record_type": "medical_check",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"Visite {rec.check_type} — {rec.provider or 'N/A'}",
            "submitted_at": rec.created_at.isoformat(),
            "verification_status": rec.verification_status,
            "issued_at": rec.check_date.isoformat() if rec.check_date else None,
            "expires_at": rec.expiry_date.isoformat() if rec.expiry_date else None,
            "issuer": rec.provider or None,
            "reference_number": None,
            "category": None,
            "type_name": None,
            "attachment_count": await _count_record_proof(db, record_type="medical_check", record=rec),
            "attachment_required": True,
        })

    # Supplier audits use the MOC engine for approval. Surface them here so
    # compliance validators can find the work queue from the Conformite module,
    # while the action still opens the underlying validation workflow.
    audit_result = await db.execute(
        select(ComplianceAudit)
        .options(selectinload(ComplianceAudit.template), selectinload(ComplianceAudit.answers))
        .where(
            ComplianceAudit.entity_id == entity_id,
            ComplianceAudit.archived == False,  # noqa: E712
            ComplianceAudit.validation_moc_id.is_not(None),
            ComplianceAudit.status.in_(["submitted", "in_review"]),
        )
        .order_by(ComplianceAudit.submitted_at.desc().nullslast(), ComplianceAudit.created_at.desc())
    )
    for audit in audit_result.scalars().unique().all():
        template = audit.template
        submitted_at = audit.submitted_at or audit.updated_at or audit.created_at
        items.append({
            "id": str(audit.id),
            "record_type": "supplier_audit",
            "owner_type": audit.target_type,
            "owner_id": str(audit.target_id),
            "owner_name": None,
            "description": audit.title or (template.name if template else audit.reference),
            "submitted_at": submitted_at.isoformat(),
            "verification_status": "pending",
            "issued_at": audit.submitted_at.isoformat() if audit.submitted_at else None,
            "expires_at": audit.valid_until.isoformat() if audit.valid_until else None,
            "issuer": template.audit_type if template else None,
            "reference_number": audit.reference,
            "category": "audit",
            "type_name": template.name if template else None,
            "attachment_count": await _count_audit_answer_proofs(db, audit),
            "attachment_required": False,
            "validation_moc_id": str(audit.validation_moc_id),
            "audit_status": audit.status,
            "score_percent": float(audit.score_percent) if audit.score_percent is not None else None,
        })

    # Enrich owner names
    user_ids = set()
    tier_ids = set()
    for item in items:
        if item["owner_type"] == "user" and item["owner_id"]:
            user_ids.add(item["owner_id"])
        if item["owner_type"] == "tier" and item["owner_id"]:
            tier_ids.add(item["owner_id"])
    if user_ids:
        users_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(
                User.id.in_([UUID(uid) for uid in user_ids])
            )
        )
        user_names = {str(r[0]): f"{r[1]} {r[2]}" for r in users_result.all()}
        for item in items:
            if item["owner_type"] == "user":
                item["owner_name"] = user_names.get(item["owner_id"])
    if tier_ids:
        tiers_result = await db.execute(
            select(Tier.id, Tier.name).where(
                Tier.id.in_([UUID(tid) for tid in tier_ids]),
                Tier.entity_id == entity_id,
            )
        )
        tier_names = {str(r[0]): r[1] for r in tiers_result.all()}
        for item in items:
            if item["owner_type"] == "tier":
                item["owner_name"] = tier_names.get(item["owner_id"])

    # Sort by submitted_at desc
    items.sort(key=lambda x: x["submitted_at"], reverse=True)

    return {"items": items, "total": len(items)}


@router.get("/verification-history", dependencies=[require_permission("conformite.record.verify")])
async def list_verification_history(
    page: int = 1,
    page_size: int = 50,
    owner_id: UUID | None = None,
    record_type: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return recently verified/rejected records across all verifiable models.

    Shows the last N actions with verifier name, date, and action taken.
    """
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense, UserGroup, UserGroupMember,
    )

    items: list[dict] = []

    # Entity user IDs
    entity_user_ids = (
        select(UserGroupMember.user_id)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .where(UserGroup.entity_id == entity_id, UserGroup.active == True)
        .distinct()
    )

    # ComplianceRecords — verified or rejected
    cr_q = (
        select(ComplianceRecord)
        .where(
            ComplianceRecord.entity_id == entity_id,
            ComplianceRecord.active == True,
            ComplianceRecord.verification_status.in_(["verified", "rejected"]),
        )
        .order_by(ComplianceRecord.verified_at.desc().nullslast())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    cr_q = _apply_external_record_scope(cr_q, current_user, entity_id)
    if record_type and record_type != "compliance_record":
        # Skip compliance records if filtering for a sub-model type
        cr_q = cr_q.where(False)
    if owner_id:
        cr_q = cr_q.where(ComplianceRecord.owner_id == owner_id)
    for rec in (await db.execute(cr_q)).scalars().all():
        ct = await db.get(ComplianceType, rec.compliance_type_id)
        items.append({
            "id": str(rec.id),
            "record_type": "compliance_record",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"{ct.name if ct else 'N/A'} — {rec.issuer or 'N/A'}",
            "verification_status": rec.verification_status,
            "verified_by": str(rec.verified_by) if rec.verified_by else None,
            "verified_by_name": None,
            "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
            "verification_notes": getattr(rec, "verification_notes", None) or getattr(rec, "notes", None),
            "issued_at": rec.issued_at.isoformat() if rec.issued_at else None,
            "expires_at": rec.expires_at.isoformat() if rec.expires_at else None,
            "reference_number": rec.reference_number,
        })

    # User sub-models
    sub_models = [
        (UserPassport, "passport", lambda r: f"Passeport {r.number} — {r.country}"),
        (UserVisa, "visa", lambda r: f"Visa {r.visa_type} — {r.country}"),
        (SocialSecurity, "social_security", lambda r: f"Sécu {r.country} — {r.number}"),
        (UserVaccine, "vaccine", lambda r: f"Vaccin {r.vaccine_type}"),
        (DrivingLicense, "driving_license", lambda r: f"Permis {r.license_type} — {r.country}"),
    ]
    if current_user.user_type == "external":
        entity_user_ids = select(literal(current_user.id))
    for Model, rtype, desc_fn in sub_models:
        if record_type and record_type != rtype:
            continue
        q = (
            select(Model)
            .where(
                Model.verification_status.in_(["verified", "rejected"]),
                Model.user_id.in_(entity_user_ids),
            )
            .order_by(Model.verified_at.desc().nullslast())
            .limit(page_size)
        )
        if owner_id:
            q = q.where(Model.user_id == owner_id)
        for rec in (await db.execute(q)).scalars().all():
            items.append({
                "id": str(rec.id),
                "record_type": rtype,
                "owner_type": "user",
                "owner_id": str(rec.user_id),
                "owner_name": None,
                "description": desc_fn(rec),
                "verification_status": rec.verification_status,
                "verified_by": str(rec.verified_by) if rec.verified_by else None,
                "verified_by_name": None,
                "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
                "verification_notes": rec.verification_notes,
                "issued_at": None,
                "expires_at": None,
                "reference_number": None,
            })

    # MedicalChecks
    if not record_type or record_type == "medical_check":
        mc_q = (
            select(MedicalCheck)
            .where(
                MedicalCheck.verification_status.in_(["verified", "rejected"]),
                MedicalCheck.owner_id.in_(entity_user_ids),
            )
            .order_by(MedicalCheck.verified_at.desc().nullslast())
            .limit(page_size)
        )
        if owner_id:
            mc_q = mc_q.where(MedicalCheck.owner_id == owner_id)
    else:
        mc_q = None
    for rec in ((await db.execute(mc_q)).scalars().all() if mc_q is not None else []):
        items.append({
            "id": str(rec.id),
            "record_type": "medical_check",
            "owner_type": rec.owner_type,
            "owner_id": str(rec.owner_id),
            "owner_name": None,
            "description": f"Visite {rec.check_type} — {rec.provider or 'N/A'}",
            "verification_status": rec.verification_status,
            "verified_by": str(rec.verified_by) if rec.verified_by else None,
            "verified_by_name": None,
            "verified_at": rec.verified_at.isoformat() if rec.verified_at else None,
            "verification_notes": getattr(rec, "verification_notes", None) or getattr(rec, "notes", None),
            "issued_at": rec.check_date.isoformat() if hasattr(rec, 'check_date') and rec.check_date else None,
            "expires_at": rec.expiry_date.isoformat() if hasattr(rec, 'expiry_date') and rec.expiry_date else None,
            "reference_number": None,
        })

    # Enrich owner names
    user_ids = {i["owner_id"] for i in items if i["owner_type"] == "user" and i["owner_id"]}
    verifier_ids = {i["verified_by"] for i in items if i["verified_by"]}
    all_ids = user_ids | verifier_ids
    if all_ids:
        from sqlalchemy.dialects.postgresql import UUID as PgUUID
        users_q = select(User.id, User.first_name, User.last_name).where(
            User.id.in_([UUID(uid) for uid in all_ids])
        )
        user_map = {str(r.id): f"{r.first_name} {r.last_name}" for r in (await db.execute(users_q)).all()}
        for item in items:
            if item["owner_type"] == "user":
                item["owner_name"] = user_map.get(item["owner_id"], "Inconnu")
            if item["verified_by"]:
                item["verified_by_name"] = user_map.get(item["verified_by"], "Inconnu")

    # Sort by verified_at desc
    items.sort(key=lambda x: x["verified_at"] or "", reverse=True)

    # Paginate
    total = len(items)
    items = items[:page_size]

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/verify/{record_type}/{record_id}")
async def verify_record(
    record_type: str,
    record_id: UUID,
    body: VerifyAction,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("conformite.record.verify"),
    db: AsyncSession = Depends(get_db),
):
    """Verify or reject a pending record."""
    from app.models.common import (
        UserPassport, UserVisa, SocialSecurity, UserVaccine,
        MedicalCheck, DrivingLicense,
    )

    MODEL_MAP = {
        "compliance_record": ComplianceRecord,
        "passport": UserPassport,
        "visa": UserVisa,
        "social_security": SocialSecurity,
        "vaccine": UserVaccine,
        "driving_license": DrivingLicense,
        "medical_check": MedicalCheck,
    }

    Model = MODEL_MAP.get(record_type)
    if not Model:
        raise StructuredHTTPException(
            400,
            code="UNKNOWN_RECORD_TYPE",
            message="Unknown record type: {record_type}",
            params={
                "record_type": record_type,
            },
        )

    result = await db.execute(select(Model).where(Model.id == record_id))
    record = result.scalar_one_or_none()
    if not record:
        raise StructuredHTTPException(
            404,
            code="RECORD_NOT_FOUND",
            message="Record not found",
        )

    if record.verification_status != "pending":
        raise StructuredHTTPException(
            400,
            code="RECORD_ALREADY",
            message="Record is already {verification_status}",
            params={
                "verification_status": record.verification_status,
            },
        )

    # ── Check attachment_required rule before allowing verification ──
    if body.action == "verify":
        # Find applicable rule to check attachment_required
        pj_required = True  # default: PJ required
        if record_type == "compliance_record" and hasattr(record, "compliance_type_id"):
            rule_q = await db.execute(
                select(ComplianceRule).where(
                    ComplianceRule.compliance_type_id == record.compliance_type_id,
                    ComplianceRule.entity_id == entity_id,
                    ComplianceRule.active == True,
                    or_(
                        ComplianceRule.subject_scope == compliance_service._owner_subject_scope(record.owner_type),
                        ComplianceRule.subject_scope == "all",
                    ),
                ).limit(1)
            )
            rule = rule_q.scalar_one_or_none()
            if rule:
                pj_required = rule.attachment_required

        if pj_required:
            proof_count = await _count_record_proof(db, record_type=record_type, record=record)
            if proof_count <= 0:
                raise StructuredHTTPException(
                    422,
                    code="IMPOSSIBLE_DE_V_RIFIER_AUCUNE_PI",
                    message="Impossible de vérifier : aucune pièce jointe. La règle exige au moins un document attaché.",
                )

    now = datetime.now(timezone.utc)

    if body.action == "verify":
        record.verification_status = "verified"
        record.verified_by = current_user.id
        record.verified_at = now
        record.rejection_reason = None
        # For ComplianceRecord: promote status from pending to valid
        if record_type == "compliance_record" and hasattr(record, 'status') and record.status == "pending":
            record.status = "valid"
        await emit_event("conformite.record.verified", {
            "record_type": record_type, "record_id": str(record_id),
            "verified_by": str(current_user.id), "entity_id": str(entity_id),
        })
    else:
        if not body.rejection_reason:
            raise StructuredHTTPException(
                400,
                code="REJECTION_REASON_REQUIRED_WHEN_REJECTING",
                message="rejection_reason is required when rejecting",
            )
        record.verification_status = "rejected"
        record.verified_by = current_user.id
        record.verified_at = now
        record.rejection_reason = body.rejection_reason
        # For ComplianceRecord: mark status as rejected too
        if record_type == "compliance_record" and hasattr(record, 'status'):
            record.status = "rejected"
        await emit_event("conformite.record.rejected", {
            "record_type": record_type, "record_id": str(record_id),
            "rejected_by": str(current_user.id), "reason": body.rejection_reason,
            "entity_id": str(entity_id),
        })

    add_audit_event(
        db, user=current_user, entity_id=entity_id,
        action="verify" if body.action == "verify" else "reject",
        resource_type=record_type, resource_id=record_id,
        details={
            "verification_status": record.verification_status,
            "rejection_reason": (body.rejection_reason or "")[:200] if body.action != "verify" else None,
        },
    )

    await db.commit()

    # ── Send email notification to record owner ──────────────────────────────
    try:
        from app.core.email_templates import render_and_send_email

        # Determine owner user
        owner_user = None
        if record_type == "compliance_record":
            if record.owner_type == "user" and record.owner_id:
                owner_user = await db.get(User, record.owner_id)
        elif record_type == "medical_check":
            if hasattr(record, "owner_id") and record.owner_id:
                owner_user = await db.get(User, record.owner_id)
        else:
            # User sub-models (passport, visa, social_security, vaccine, driving_license)
            if hasattr(record, "user_id") and record.user_id:
                owner_user = await db.get(User, record.user_id)

        if owner_user and owner_user.email:
            # Build human-readable description
            DESCRIPTION_MAP = {
                "compliance_record": lambda r: f"{r.issuer or 'N/A'}",
                "passport": lambda r: f"Passeport {getattr(r, 'number', '')} — {getattr(r, 'country', '')}",
                "visa": lambda r: f"Visa {getattr(r, 'visa_type', '')} — {getattr(r, 'country', '')}",
                "social_security": lambda r: f"Sécu sociale {getattr(r, 'country', '')} — {getattr(r, 'number', '')}",
                "vaccine": lambda r: f"Vaccin {getattr(r, 'vaccine_type', '')}",
                "driving_license": lambda r: f"Permis {getattr(r, 'license_type', '')} — {getattr(r, 'country', '')}",
                "medical_check": lambda r: f"Visite {getattr(r, 'check_type', '')} — {getattr(r, 'provider', 'N/A')}",
            }
            desc_fn = DESCRIPTION_MAP.get(record_type, lambda r: "")
            record_description = desc_fn(record)

            # For compliance_record, fetch the type name
            record_type_label = record_type.replace("_", " ").title()
            if record_type == "compliance_record" and hasattr(record, "compliance_type_id"):
                ct = await db.get(ComplianceType, record.compliance_type_id)
                if ct:
                    record_type_label = ct.name

            # Get entity name
            entity = await db.get(Entity, entity_id)
            entity_name = entity.name if entity else "OpsFlux"

            # Determine action labels (localized for FR, English for EN)
            language = getattr(owner_user, "language", None) or "fr"
            if language == "en":
                action_label = "verified" if body.action == "verify" else "rejected"
            else:
                action_label = "vérifié" if body.action == "verify" else "rejeté"

            await render_and_send_email(
                db,
                slug="record_verified",
                entity_id=entity_id,
                language=language,
                to=owner_user.email,
                variables={
                    "user": {"first_name": owner_user.first_name, "email": owner_user.email},
                    "record_type": record_type_label,
                    "record_description": record_description,
                    "action": action_label,
                    "verifier_name": f"{current_user.first_name} {current_user.last_name}",
                    "rejection_reason": body.rejection_reason or "",
                    "entity": {"name": entity_name},
                },
            )
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Failed to send verification email", exc_info=True)

    return {
        "detail": f"Record {body.action}d",
        "verification_status": record.verification_status,
    }


# ─── Matrix view: owner × compliance_type ─────────────────────────────
#
# Gives ops a grid-level overview of where each owner (user/tier/asset)
# stands on each compliance requirement. Each cell encodes the latest
# record status + nearest expiration so front-end can render colour-
# coded dots and click through to the record.

class MatrixCell(BaseModel):
    status: str  # valid | expiring | expired | missing | pending | rejected
    expires_at: datetime | None = None
    record_id: UUID | None = None


class MatrixRow(BaseModel):
    owner_type: str
    owner_id: UUID
    owner_name: str
    owner_extra: str | None = None  # e.g. job title / tier code — purely display
    cells: dict[str, MatrixCell]  # keyed by compliance_type_id


class MatrixResponse(BaseModel):
    compliance_types: list[ComplianceTypeRead]
    rows: list[MatrixRow]
    total: int
    limit: int
    offset: int


@router.get(
    "/matrix",
    response_model=MatrixResponse,
    dependencies=[require_permission("conformite.record.read")],
)
async def get_compliance_matrix(
    owner_type: str = "user",
    search: str | None = None,
    category: str | None = None,
    expiring_within_days: int = 30,
    limit: int = 50,
    offset: int = 0,
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Matrix view: rows = owners, cols = compliance types.

    - owner_type: one of `user`, `tier_contact`, `tier`, `asset`.
      Each renders a slightly different label (e.g. user → full name).
    - category: restrict to one compliance category (formation/medical/…).
    - expiring_within_days: records expiring before now+N days are
      flagged 'expiring' (orange) instead of 'valid' (green).

    Return shape lets the frontend render a sticky-header table with
    one column per compliance_type (ordered by category then name)
    and one row per owner. A missing entry in `cells[type_id]` means
    no record yet — frontend renders an empty '—' cell as 'missing'.
    """
    if owner_type not in {"user", "tier_contact", "tier"}:
        raise HTTPException(400, "owner_type must be one of: user, tier_contact, tier")

    # 1) Load applicable compliance types, optionally filtered by category
    types_q = select(ComplianceType).where(
        ComplianceType.entity_id == entity_id,
        ComplianceType.active == True,  # noqa: E712
        # Supplier audits are managed by ComplianceAudit, not by the legacy
        # referential matrix. Keep audit templates out of record grids.
        ComplianceType.category != "audit",
    )
    if owner_type == "tier":
        company_type_ids = select(ComplianceRule.compliance_type_id).where(
            ComplianceRule.entity_id == entity_id,
            ComplianceRule.active == True,  # noqa: E712
            or_(
                ComplianceRule.subject_scope == "company",
                ComplianceRule.subject_scope == "all",
            ),
            or_(
                ComplianceRule.condition_json == None,  # noqa: E711
                ComplianceRule.condition_json["audit_template_id"].as_string() == None,  # noqa: E711
            ),
        )
        types_q = types_q.where(ComplianceType.id.in_(company_type_ids))
    if category:
        types_q = types_q.where(ComplianceType.category == category)
    types_q = types_q.order_by(ComplianceType.category, ComplianceType.name)
    types = list((await db.execute(types_q)).scalars().all())
    type_ids = [t.id for t in types]

    # 2) Resolve owner list (paginated, per owner_type)
    owners: list[tuple[UUID, str, str | None]] = []
    total_owners = 0
    if owner_type == "user":
        # Active users whose default entity matches. Users may belong
        # to multiple entities via groups, but for matrix display we
        # anchor on default_entity_id which is what the Ops UI
        # already filters by.
        base = select(User).where(
            User.default_entity_id == entity_id,
            User.active == True,  # noqa: E712
        )
        if search:
            like = f"%{search.lower()}%"
            base = base.where(sqla_func.lower(User.first_name + " " + User.last_name).like(like))
        count_stmt = select(sqla_func.count()).select_from(base.subquery())
        total_owners = int((await db.execute(count_stmt)).scalar_one())
        rows = (
            await db.execute(
                base.order_by(User.last_name, User.first_name).limit(limit).offset(offset)
            )
        ).scalars().all()
        for u in rows:
            owners.append((u.id, f"{u.first_name or ''} {u.last_name or ''}".strip() or u.email, u.email))
    elif owner_type == "tier":
        base = select(Tier).where(Tier.entity_id == entity_id, Tier.active == True)  # noqa: E712
        if search:
            like = f"%{search.lower()}%"
            base = base.where(sqla_func.lower(Tier.name).like(like))
        count_stmt = select(sqla_func.count()).select_from(base.subquery())
        total_owners = int((await db.execute(count_stmt)).scalar_one())
        rows = (
            await db.execute(base.order_by(Tier.name).limit(limit).offset(offset))
        ).scalars().all()
        for t in rows:
            owners.append((t.id, t.name, t.code))
    elif owner_type == "tier_contact":
        base = (
            select(TierContact, Tier)
            .join(Tier, Tier.id == TierContact.tier_id)
            .where(Tier.entity_id == entity_id)
        )
        if search:
            like = f"%{search.lower()}%"
            base = base.where(
                sqla_func.lower(TierContact.first_name + " " + TierContact.last_name).like(like)
            )
        count_stmt = select(sqla_func.count()).select_from(base.subquery())
        total_owners = int((await db.execute(count_stmt)).scalar_one())
        rows = (
            await db.execute(
                base.order_by(TierContact.last_name).limit(limit).offset(offset)
            )
        ).all()
        for row in rows:
            c, tier = row[0], row[1]
            owners.append((c.id, f"{c.first_name or ''} {c.last_name or ''}".strip(), tier.name))
    owner_ids = [o[0] for o in owners]

    # 3) Bulk-load the latest record per (owner, type) for this page
    recs_by_owner_type: dict[tuple[UUID, UUID], ComplianceRecord] = {}
    if owner_ids and type_ids:
        recs_q = (
            select(ComplianceRecord)
            .where(
                ComplianceRecord.entity_id == entity_id,
                ComplianceRecord.owner_type == owner_type,
                ComplianceRecord.owner_id.in_(owner_ids),
                ComplianceRecord.compliance_type_id.in_(type_ids),
                ComplianceRecord.active == True,  # noqa: E712
            )
            # Latest issued_at first → later inserts overwrite so the
            # cell reflects the most recent record.
            .order_by(ComplianceRecord.issued_at.asc().nullsfirst())
        )
        for rec in (await db.execute(recs_q)).scalars().all():
            recs_by_owner_type[(rec.owner_id, rec.compliance_type_id)] = rec

    # 4) Build the cell grid
    from datetime import timezone as _tz
    now = datetime.now(_tz.utc)
    expiring_cutoff = now + timedelta(days=expiring_within_days)

    def _cell_for(rec: ComplianceRecord | None) -> MatrixCell:
        if rec is None:
            return MatrixCell(status="missing")
        # Record statuses from the model: valid / expired / pending / rejected.
        # We additionally derive 'expiring' for valid records whose
        # expires_at falls within the cutoff window.
        status = rec.status or "valid"
        if status == "valid" and rec.expires_at and rec.expires_at <= expiring_cutoff:
            status = "expired" if rec.expires_at <= now else "expiring"
        return MatrixCell(status=status, expires_at=rec.expires_at, record_id=rec.id)

    result_rows: list[MatrixRow] = []
    for (oid, name, extra) in owners:
        cells = {
            str(t.id): _cell_for(recs_by_owner_type.get((oid, t.id)))
            for t in types
        }
        result_rows.append(MatrixRow(
            owner_type=owner_type, owner_id=oid, owner_name=name,
            owner_extra=extra, cells=cells,
        ))

    return MatrixResponse(
        compliance_types=[ComplianceTypeRead.model_validate(t) for t in types],
        rows=result_rows,
        total=total_owners,
        limit=limit,
        offset=offset,
    )
