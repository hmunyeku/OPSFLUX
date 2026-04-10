"""PaxLog API routes — PAX profiles, credentials, compliance, AdS, incidents.

Integrates with:
- Compliance Matrix: auto-checks PAX credentials on AdS submit
- Planner: links AdS to planner activities via planner_activity_id
- TravelWiz: emits ads.approved event for auto-manifest creation
- Workflow Engine: FSM service manages AdS status transitions (D-014)
"""

import logging
import hashlib
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request, status
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import and_, bindparam, func, literal, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_current_entity,
    get_current_user,
    has_user_permission,
    require_module_enabled,
    require_any_permission,
    require_permission,
)
from app.core.acting_context import get_effective_actor_user_id
from app.core.audit import record_audit
from app.core.config import settings
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginate
from app.core.references import generate_reference
from app.models.common import (
    Address,
    AuditLog,
    CostCenter,
    CostImputation,
    Entity,
    ImputationAssignment,
    ImputationReference,
    JobPosition,
    Project,
    Setting,
    Tier,
    TierContact,
    User,
    UserGroup,
    UserGroupMember,
    UserTierLink,
    WorkflowDefinition,
)
from app.models.paxlog import (
    Ads,
    AdsAllowedCompany,
    AdsEvent,
    AdsPax,
    ComplianceMatrixEntry,
    CredentialType,
    ExternalAccessLink,
    MissionNotice,
    MissionPreparationTask,
    MissionProgram,
    MissionProgramPax,
    MissionStakeholder,
    PaxCredential,
    PaxGroup,
    PaxIncident,
    StayProgram,
)
from app.models.planner import PlannerActivity
from app.models.travelwiz import ManifestPassenger, Voyage, VoyageManifest
from app.schemas.paxlog import (
    AdsBoardingContextRead,
    AdsBoardingManifestRead,
    AdsBoardingPassengerRead,
    AdsBoardingPassengerUpdate,
    AdsBoardingUnassignedPaxRead,
    AdsCreate,
    AdsExternalLinkSecurityRead,
    ExternalAdsDossierRead,
    AdsImputationSuggestionRead,
    AdsEventRead,
    AdsManualDepartureRequest,
    AdsPaxEntry,
    AdsRead,
    AdsStayChangeRequest,
    AdsSummary,
    AdsValidationQueueItemRead,
    AdsWaitlistPriorityUpdate,
    AdsUpdate,
    ComplianceCheckResult,
    ComplianceMatrixCreate,
    ComplianceMatrixRead,
    CredentialTypeCreate,
    CredentialTypeRead,
    MissionNoticeCreate,
    MissionNoticeModifyRequest,
    MissionNoticeRead,
    MissionNoticeSummary,
    MissionNoticeUpdate,
    MissionPreparationTaskRead,
    MissionPreparationTaskUpdate,
    MissionProgramRead,
    ExternalAccessEventRead,
    PaxCredentialCreate,
    PaxCredentialRead,
    PaxCredentialValidate,
    PaxGroupRead,
    PaxIncidentCreate,
    PaxIncidentRead,
    PaxIncidentResolve,
    PaxProfileRead,
    AdsPaxDecision,
    PaxProfileSummary,
    PaxSitePresenceRead,
    PaxProfileUpdate,
    RotationCycleRead,
)
from app.models.asset_registry import Installation
from app.schemas.common import JobPositionRead
from app.schemas.common import PaginatedResponse
from app.services.core.fsm_service import fsm_service, FSMError, FSMPermissionError
from app.services.modules import paxlog_service

router = APIRouter(prefix="/api/v1/pax", tags=["paxlog"], dependencies=[require_module_enabled("paxlog")])
logger = logging.getLogger(__name__)

ADS_WORKFLOW_SLUG = "ads-workflow"
ADS_ENTITY_TYPE = "ads"
AVM_WORKFLOW_SLUG = "avm-workflow"
AVM_ENTITY_TYPE = "avm"
EXTERNAL_OTP_TTL_MINUTES = 10
EXTERNAL_SESSION_TTL_MINUTES = 30
EXTERNAL_OTP_MAX_ATTEMPTS = 3
ADS_READ_ENTRY_PERMISSIONS = (
    "paxlog.ads.read",
    "paxlog.ads.create",
    "paxlog.ads.update",
    "paxlog.ads.approve",
    "paxlog.ads.submit",
    "paxlog.ads.cancel",
)


def _build_external_portal_url(token: str) -> str:
    return f"{settings.external_paxlog_url}/?token={token}"


def _build_ads_boarding_token(ads: Ads) -> str:
    expiry = datetime.combine(
        ads.end_date + timedelta(days=14),
        datetime.min.time(),
        tzinfo=timezone.utc,
    )
    payload = {
        "purpose": "ads_boarding_qr",
        "ads_id": str(ads.id),
        "entity_id": str(ads.entity_id),
        "reference": ads.reference,
        "exp": expiry,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode_ads_boarding_token(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="QR AdS invalide ou expiré") from exc
    if payload.get("purpose") != "ads_boarding_qr":
        raise HTTPException(status_code=401, detail="QR AdS invalide")
    return payload


def _build_ads_boarding_url(token: str) -> str:
    return f"{settings.APP_URL.rstrip('/')}/paxlog/ads-boarding/{token}"


def _json_safe(value: object | None) -> object | None:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _transport_mode_requires_travelwiz(mode: str | None) -> bool:
    normalized = (mode or "").strip().lower()
    return normalized not in {"", "walking"}


def _build_ads_transport_flags(ads: Ads) -> dict[str, bool]:
    outbound_requested = _transport_mode_requires_travelwiz(ads.outbound_transport_mode)
    return_requested = _transport_mode_requires_travelwiz(ads.return_transport_mode)
    return {
        "outbound_transport_requested": outbound_requested,
        "return_transport_requested": return_requested,
        "transport_requested": outbound_requested or return_requested,
    }


def _classify_ads_stay_change(
    *,
    previous_start: date | None,
    previous_end: date | None,
    final_start: date | None,
    final_end: date | None,
    changed_fields: dict[str, dict[str, object | None]],
) -> tuple[list[str], str | None]:
    change_kinds: list[str] = []

    if final_end and previous_end:
        if final_end > previous_end:
            change_kinds.append("extension")
        elif final_end < previous_end:
            change_kinds.append("early_return")

    window_fields = {"start_date", "end_date"}
    if (
        any(field in changed_fields for field in window_fields)
        and not any(kind in change_kinds for kind in {"extension", "early_return"})
    ):
        change_kinds.append("window_change")

    transport_fields = {
        "outbound_transport_mode",
        "outbound_departure_base_id",
        "outbound_notes",
        "return_transport_mode",
        "return_departure_base_id",
        "return_notes",
    }
    if any(field in changed_fields for field in transport_fields):
        change_kinds.append("transport_change")

    return change_kinds, (change_kinds[0] if change_kinds else None)


def _incident_row_to_read(row) -> PaxIncidentRead:
    incident = row[0] if isinstance(row, tuple) else row.PaxIncident
    user_first_name = row[1] if len(row) > 1 else None
    user_last_name = row[2] if len(row) > 2 else None
    contact_first_name = row[3] if len(row) > 3 else None
    contact_last_name = row[4] if len(row) > 4 else None
    company_name = row[5] if len(row) > 5 else None
    group_name = row[6] if len(row) > 6 else None
    asset_name = row[7] if len(row) > 7 else None
    return PaxIncidentRead(
        id=incident.id,
        entity_id=incident.entity_id,
        user_id=incident.user_id,
        contact_id=incident.contact_id,
        company_id=incident.company_id,
        pax_group_id=getattr(incident, "pax_group_id", None),
        asset_id=incident.asset_id,
        severity=incident.severity,
        description=incident.description,
        incident_date=incident.incident_date,
        ban_start_date=incident.ban_start_date,
        ban_end_date=incident.ban_end_date,
        recorded_by=incident.recorded_by,
        resolved_at=incident.resolved_at,
        resolved_by=incident.resolved_by,
        resolution_notes=incident.resolution_notes,
        created_at=incident.created_at,
        reference=getattr(incident, "reference", None),
        category=getattr(incident, "category", None),
        decision=getattr(incident, "decision", None),
        decision_duration_days=getattr(incident, "decision_duration_days", None),
        decision_end_date=getattr(incident, "decision_end_date", None),
        evidence_urls=getattr(incident, "evidence_urls", None),
        pax_first_name=user_first_name or contact_first_name,
        pax_last_name=user_last_name or contact_last_name,
        company_name=company_name,
        group_name=group_name,
        asset_name=asset_name,
    )


def _expiring_alert_bucket(days_remaining: int) -> str:
    if days_remaining <= 0:
        return "j0"
    if days_remaining <= 7:
        return "j7"
    if days_remaining <= 30:
        return "j30"
    return "future"


async def _get_external_user_tier_ids(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
) -> set[UUID] | None:
    if current_user.user_type != "external":
        return None
    result = await db.execute(
        select(UserTierLink.tier_id)
        .join(Tier, Tier.id == UserTierLink.tier_id)
        .where(
            UserTierLink.user_id == current_user.id,
            Tier.entity_id == entity_id,
            Tier.archived == False,
        )
    )
    return {row[0] for row in result.all()}


async def _assert_external_tier_access(
    db: AsyncSession,
    current_user: User,
    entity_id: UUID,
    tier_id: UUID,
) -> None:
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if linked_tier_ids is None:
        return
    if tier_id not in linked_tier_ids:
        raise HTTPException(status_code=404, detail="Company not found")


async def _resolve_ads_imputation_suggestion(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> AdsImputationSuggestionRead:
    """Resolve the default imputation suggestion for an AdS.

    Resolution order:
    - project attached to the AdS
    - explicit user default (not modelled yet)
    - explicit group default (not modelled yet)
    - requester's business unit cost center
    - entity fallback cost center
    """
    notes: list[str] = []
    project_id: UUID | None = ads.project_id
    project_name: str | None = None
    project_source = "none"
    cost_center_id: UUID | None = None
    cost_center_name: str | None = None
    cost_center_source = "none"
    imputation_reference_id: UUID | None = None
    imputation_reference_code: str | None = None
    imputation_reference_name: str | None = None
    imputation_type: str | None = None
    otp_policy: str | None = None
    today = date.today()

    def _apply_reference(reference: ImputationReference, *, source: str) -> None:
        nonlocal project_id, project_name, project_source
        nonlocal cost_center_id, cost_center_name, cost_center_source
        nonlocal imputation_reference_id, imputation_reference_code
        nonlocal imputation_reference_name, imputation_type, otp_policy

        imputation_reference_id = reference.id
        imputation_reference_code = reference.code
        imputation_reference_name = reference.name
        imputation_type = reference.imputation_type
        otp_policy = reference.otp_policy

        if not project_id and reference.default_project_id:
            project_id = reference.default_project_id
            if reference.default_project:
                project_name = f"{reference.default_project.code} — {reference.default_project.name}"
            project_source = source

        if not cost_center_id and reference.default_cost_center_id:
            cost_center_id = reference.default_cost_center_id
            if reference.default_cost_center:
                cost_center_name = f"{reference.default_cost_center.code} — {reference.default_cost_center.name}"
            cost_center_source = source

    async def _find_assignment_reference(
        *,
        target_type: str,
        target_id: UUID,
    ) -> ImputationReference | None:
        result = await db.execute(
            select(ImputationAssignment, ImputationReference)
            .join(
                ImputationReference,
                ImputationReference.id == ImputationAssignment.imputation_reference_id,
            )
            .where(
                ImputationAssignment.entity_id == entity_id,
                ImputationAssignment.target_type == target_type,
                ImputationAssignment.target_id == target_id,
                ImputationAssignment.active == True,  # noqa: E712
                ImputationReference.entity_id == entity_id,
                ImputationReference.active == True,  # noqa: E712
            )
            .order_by(ImputationAssignment.priority.asc(), ImputationAssignment.created_at.asc())
        )
        for assignment, reference in result.all():
            if assignment.valid_from and assignment.valid_from > today:
                continue
            if assignment.valid_to and assignment.valid_to < today:
                continue
            if reference.valid_from and reference.valid_from > today:
                continue
            if reference.valid_to and reference.valid_to < today:
                continue
            return reference
        return None

    requester = await db.get(User, ads.requester_id)
    if not requester:
        notes.append("Demandeur introuvable pour la résolution d'imputation.")
    else:
        if requester.business_unit_id:
            notes.append("BU du demandeur détectée.")
        else:
            notes.append("Aucune BU rattachée au demandeur.")

    if project_id:
        project = await db.get(Project, project_id)
        if project and project.entity_id == entity_id:
            project_name = f"{project.code} — {project.name}"
            project_source = "project"
            notes.append("Projet de dossier retenu comme première source d'imputation.")
            project_reference = await _find_assignment_reference(target_type="project", target_id=project.id)
            if project_reference:
                _apply_reference(project_reference, source="project_assignment")
                notes.append("Référence d'imputation appliquée via l'affectation du projet.")
        else:
            project_id = None
            notes.append("Projet rattaché non résolu dans l'entité courante.")
    else:
        notes.append("Aucun projet rattaché au dossier.")

    if requester:
        user_reference = await _find_assignment_reference(target_type="user", target_id=requester.id)
        if user_reference:
            _apply_reference(user_reference, source="user_assignment")
            notes.append("Référence d'imputation appliquée via l'affectation utilisateur.")

        user_setting_result = await db.execute(
            select(Setting).where(
                Setting.key == "core.default_imputation",
                Setting.scope == "user",
                Setting.scope_id == str(requester.id),
            )
        )
        user_setting = user_setting_result.scalar_one_or_none()
        if user_setting:
            user_value = user_setting.value or {}
            if not project_id and user_value.get("project_id"):
                user_project_id = UUID(str(user_value["project_id"]))
                project = await db.get(Project, user_project_id)
                if project and project.entity_id == entity_id:
                    project_id = project.id
                    project_name = f"{project.code} — {project.name}"
                    project_source = "user"
                    notes.append("Projet par défaut appliqué depuis le profil utilisateur.")
            if user_value.get("cost_center_id"):
                user_cc_id = UUID(str(user_value["cost_center_id"]))
                cc = await db.get(CostCenter, user_cc_id)
                if cc and cc.entity_id == entity_id and cc.active:
                    cost_center_id = cc.id
                    cost_center_name = f"{cc.code} — {cc.name}"
                    cost_center_source = "user"
                    notes.append("Centre de coût par défaut appliqué depuis le profil utilisateur.")
        else:
            notes.append("Aucun défaut explicite utilisateur configuré.")

    group_count = 0
    if requester:
        group_ids_result = await db.execute(
            select(UserGroup.id)
            .select_from(UserGroupMember)
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(
                UserGroupMember.user_id == requester.id,
                UserGroup.entity_id == entity_id,
                UserGroup.active == True,  # noqa: E712
            )
            .order_by(UserGroup.name.asc(), UserGroup.created_at.asc())
        )
        group_ids = list(group_ids_result.scalars().all())
        group_count = len(group_ids)
        for group_id in group_ids:
            group_reference = await _find_assignment_reference(
                target_type="user_group",
                target_id=group_id,
            )
            if group_reference:
                _apply_reference(group_reference, source="group_assignment")
                notes.append("Référence d'imputation appliquée via une affectation de groupe.")
                break
    if group_count > 0:
        if not imputation_reference_id:
            notes.append("Groupes utilisateur détectés, mais aucune référence active n'est affectée.")
    else:
        notes.append("Aucun groupe utilisateur exploitable pour l'imputation.")

    if requester and requester.business_unit_id:
        bu_reference = await _find_assignment_reference(
            target_type="business_unit",
            target_id=requester.business_unit_id,
        )
        if bu_reference:
            _apply_reference(bu_reference, source="business_unit_assignment")
            notes.append("Référence d'imputation appliquée via l'affectation de BU.")

        cc_result = await db.execute(
            select(CostCenter)
            .where(
                CostCenter.entity_id == entity_id,
                CostCenter.department_id == requester.business_unit_id,
                CostCenter.active == True,  # noqa: E712
            )
            .order_by(CostCenter.name, CostCenter.code)
        )
        bu_cc = cc_result.scalars().first()
        if bu_cc:
            cost_center_id = bu_cc.id
            cost_center_name = f"{bu_cc.code} — {bu_cc.name}"
            cost_center_source = "business_unit"
            notes.append("Centre de coût par défaut trouvé via la BU du demandeur.")

    if not cost_center_id:
        entity_setting_result = await db.execute(
            select(Setting).where(
                Setting.key == "core.default_imputation",
                Setting.scope == "entity",
                Setting.scope_id == str(entity_id),
            )
        )
        entity_setting = entity_setting_result.scalar_one_or_none()
        if entity_setting:
            entity_value = entity_setting.value or {}
            if not project_id and entity_value.get("project_id"):
                entity_project_id = UUID(str(entity_value["project_id"]))
                project = await db.get(Project, entity_project_id)
                if project and project.entity_id == entity_id:
                    project_id = project.id
                    project_name = f"{project.code} — {project.name}"
                    project_source = "entity"
                    notes.append("Projet par défaut appliqué depuis les paramètres entité.")
            if not cost_center_id and entity_value.get("cost_center_id"):
                entity_cc_id = UUID(str(entity_value["cost_center_id"]))
                cc = await db.get(CostCenter, entity_cc_id)
                if cc and cc.entity_id == entity_id and cc.active:
                    cost_center_id = cc.id
                    cost_center_name = f"{cc.code} — {cc.name}"
                    cost_center_source = "entity"
                    notes.append("Centre de coût par défaut appliqué depuis les paramètres entité.")

    if not cost_center_id:
        cc_result = await db.execute(
            select(CostCenter)
            .where(
                CostCenter.entity_id == entity_id,
                CostCenter.active == True,  # noqa: E712
            )
            .order_by(CostCenter.name, CostCenter.code)
        )
        entity_cc = cc_result.scalars().first()
        if entity_cc:
            cost_center_id = entity_cc.id
            cost_center_name = f"{entity_cc.code} — {entity_cc.name}"
            cost_center_source = "entity_fallback"
            notes.append("Fallback sur le premier centre de coût actif de l'entité.")
        else:
            notes.append("Aucun centre de coût actif disponible sur l'entité.")

    return AdsImputationSuggestionRead(
        owner_id=ads.id,
        project_id=project_id,
        project_name=project_name,
        project_source=project_source,
        cost_center_id=cost_center_id,
        cost_center_name=cost_center_name,
        cost_center_source=cost_center_source,
        imputation_reference_id=imputation_reference_id,
        imputation_reference_code=imputation_reference_code,
        imputation_reference_name=imputation_reference_name,
        imputation_type=imputation_type,
        otp_policy=otp_policy,
        resolution_notes=notes,
    )


async def _ensure_ads_default_imputation(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
    author_id: UUID,
) -> None:
    """Create a default 100% imputation line for an AdS if possible and absent."""
    existing_result = await db.execute(
        select(CostImputation.id).where(
            CostImputation.owner_type == "ads",
            CostImputation.owner_id == ads.id,
        )
    )
    if existing_result.scalar_one_or_none():
        return

    suggestion = await _resolve_ads_imputation_suggestion(db, ads=ads, entity_id=entity_id)
    if not suggestion.project_id and not suggestion.cost_center_id:
        return
    if suggestion.imputation_type == "CAPEX" or suggestion.otp_policy not in (None, "forbidden"):
        logger.warning(
            "Skipped default AdS imputation for %s because suggested reference is not allowed for ads",
            ads.id,
        )
        return

    db.add(
        CostImputation(
            owner_type="ads",
            owner_id=ads.id,
            imputation_reference_id=suggestion.imputation_reference_id,
            project_id=suggestion.project_id,
            cost_center_id=suggestion.cost_center_id,
            percentage=100.0,
            created_by=author_id,
            notes=f"Default imputation applied from {suggestion.project_source}/{suggestion.cost_center_source}",
        )
    )


async def _sync_ads_project_from_imputations(
    db: AsyncSession,
    *,
    ads: Ads,
) -> None:
    """Reflect mono-project imputations into ads.project_id.

    Rules:
    - no project imputation: ads.project_id = None
    - one distinct project across imputations: ads.project_id = that project
    - several distinct projects: ads.project_id = None
    """
    project_rows = (
        await db.execute(
            select(CostImputation.project_id)
            .where(
                CostImputation.owner_type == "ads",
                CostImputation.owner_id == ads.id,
                CostImputation.project_id.isnot(None),
            )
            .distinct()
        )
    ).all()
    project_ids = [row[0] for row in project_rows if row[0] is not None]
    ads.project_id = project_ids[0] if len(project_ids) == 1 else None


async def _get_paxlog_setting(db: AsyncSession, entity_id: UUID, key: str, default: Any = None) -> Any:
    """Read a PaxLog module setting from the settings table."""
    from app.models.common import Setting
    result = await db.execute(
        select(Setting.value).where(
            Setting.key == key,
            Setting.scope == "entity",
            Setting.scope_id == str(entity_id),
        )
    )
    raw = result.scalar_one_or_none()
    if raw is None:
        return default
    return raw.get("v", raw) if isinstance(raw, dict) else raw


async def _try_ads_workflow_transition(
    db: AsyncSession,
    *,
    entity_id_str: str,
    to_state: str,
    actor_id: UUID,
    entity_id_scope: UUID,
    comment: str | None = None,
    runtime_context: dict | None = None,
) -> tuple[str | None, object | None]:
    """Attempt FSM transition for an AdS.

    Returns (current_state, instance) if workflow definition exists.
    Returns (None, None) if no definition found (graceful fallback).
    Raises HTTPException on permission errors.
    """
    try:
        instance = await fsm_service.transition(
            db,
            workflow_slug=ADS_WORKFLOW_SLUG,
            entity_type=ADS_ENTITY_TYPE,
            entity_id=entity_id_str,
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
            entity_id_scope=entity_id_scope,
            runtime_context=runtime_context,
        )
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        if "not found" in str(e).lower():
            logger.debug(
                "No workflow definition '%s' found — direct status update",
                ADS_WORKFLOW_SLUG,
            )
            return None, None
        raise HTTPException(400, str(e))


async def _try_avm_workflow_transition(
    db: AsyncSession,
    *,
    avm: MissionNotice,
    to_state: str,
    actor_id: UUID,
    comment: str | None = None,
) -> tuple[str | None, object | None]:
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
        instance = await fsm_service.transition(
            db,
            workflow_slug=AVM_WORKFLOW_SLUG,
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
            to_state=to_state,
            actor_id=actor_id,
            comment=comment,
            entity_id_scope=avm.entity_id,
            skip_role_check=True,
        )
        return instance.current_state, instance
    except FSMPermissionError as e:
        raise HTTPException(403, str(e))
    except FSMError as e:
        if "not found" in str(e).lower():
            logger.debug(
                "No workflow definition '%s' found — direct status update",
                AVM_WORKFLOW_SLUG,
            )
            return None, None
        raise HTTPException(400, str(e))


async def _run_ads_submission_checks(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> tuple[list[AdsPax], bool, str]:
    """Run compliance checks and determine the next submission status for an AdS."""
    from app.services.modules.paxlog_service import build_compliance_issues_summary, check_pax_compliance

    pax_entries_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads.id)
    )
    pax_entries = pax_entries_result.scalars().all()
    if len(pax_entries) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="L'AdS doit contenir au moins un PAX.",
        )

    has_compliance_issues = False
    issues_for_summary: list[dict] = []
    for pax_entry in pax_entries:
        compliance = await check_pax_compliance(
            db,
            asset_id=ads.site_entry_asset_id,
            entity_id=entity_id,
            user_id=pax_entry.user_id,
            contact_id=pax_entry.contact_id,
        )

        pax_label = None
        if pax_entry.user_id:
            u = await db.get(User, pax_entry.user_id)
            pax_label = f"{u.first_name} {u.last_name}".strip() if u else "PAX interne"
        elif pax_entry.contact_id:
            c = await db.get(TierContact, pax_entry.contact_id)
            pax_label = f"{c.first_name} {c.last_name}".strip() if c else "PAX externe"

        blocking_items = [
            {
                **item,
                "pax_label": pax_label,
                "layer_label": item.get("layer_label") or item.get("layer"),
            }
            for item in compliance.get("results", [])
            if item.get("blocking")
        ]

        pax_entry.compliance_checked_at = func.now()
        pax_entry.compliance_summary = {
            **compliance,
            "pax_label": pax_label,
            "issues_summary": build_compliance_issues_summary(blocking_items),
        }
        if blocking_items:
            pax_entry.status = "blocked"
            has_compliance_issues = True
            issues_for_summary.extend(blocking_items)
        else:
            pax_entry.status = "compliant"

    # Compliance review is now always an explicit workflow step before final validation.
    target_status = "pending_compliance"
    ads.rejection_reason = build_compliance_issues_summary(issues_for_summary) if has_compliance_issues else None
    return pax_entries, has_compliance_issues, target_status


async def _apply_ads_planner_waitlist_if_needed(
    db: AsyncSession,
    *,
    ads: Ads,
    pax_entries: list[AdsPax],
    entity_id: UUID,
) -> dict[str, object]:
    """Apply waitlist state when a linked Planner activity has no remaining capacity."""
    if not ads.planner_activity_id:
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": None,
            "reserved_pax_count": 0,
            "remaining_capacity": None,
        }

    activity_result = await db.execute(
        select(PlannerActivity.pax_quota).where(
            PlannerActivity.id == ads.planner_activity_id,
            PlannerActivity.entity_id == entity_id,
        )
    )
    activity_quota = activity_result.scalar_one_or_none()
    if activity_quota is None:
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": None,
            "reserved_pax_count": 0,
            "remaining_capacity": None,
        }

    reserved_statuses = (
        "submitted",
        "pending_initiator_review",
        "pending_project_review",
        "pending_compliance",
        "pending_validation",
        "pending_arbitration",
        "approved",
        "in_progress",
    )
    reserved_result = await db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM ads_pax ap
            JOIN ads a ON a.id = ap.ads_id
            WHERE a.entity_id = :entity_id
              AND a.planner_activity_id = :activity_id
              AND a.id <> :ads_id
              AND a.status IN :ads_statuses
              AND ap.status NOT IN ('blocked', 'waitlisted', 'rejected', 'no_show')
            """
        ).bindparams(bindparam("ads_statuses", expanding=True)),
        {
            "entity_id": entity_id,
            "activity_id": ads.planner_activity_id,
            "ads_id": ads.id,
            "ads_statuses": reserved_statuses,
        },
    )
    reserved_pax_count = int(reserved_result.scalar() or 0)

    candidate_entries = [
        entry for entry in pax_entries
        if entry.status not in {"blocked", "waitlisted", "rejected", "no_show"}
    ]
    requested_pax_count = len(candidate_entries)
    remaining_capacity = int(activity_quota) - reserved_pax_count

    if requested_pax_count == 0 or reserved_pax_count + requested_pax_count <= int(activity_quota):
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": int(activity_quota),
            "reserved_pax_count": reserved_pax_count,
            "remaining_capacity": remaining_capacity,
        }

    from app.services.modules.paxlog_service import compute_pax_priority

    for entry in candidate_entries:
        entry.status = "waitlisted"
        await compute_pax_priority(db, entry.id)

    return {
        "waitlist_applied": True,
        "waitlisted_count": requested_pax_count,
        "activity_quota": int(activity_quota),
        "reserved_pax_count": reserved_pax_count,
        "remaining_capacity": max(remaining_capacity, 0),
    }


async def _count_reserved_site_pax_for_day(
    db: AsyncSession,
    *,
    entity_id: UUID,
    site_asset_id: UUID,
    target_date: date,
    exclude_ads_id: UUID | None = None,
) -> int:
    reserved_statuses = (
        "submitted",
        "pending_initiator_review",
        "pending_project_review",
        "pending_compliance",
        "pending_validation",
        "pending_arbitration",
        "approved",
        "in_progress",
    )
    filters = [
        "a.entity_id = :entity_id",
        "a.site_entry_asset_id = :site_asset_id",
        "a.status IN :ads_statuses",
        "a.start_date <= :target_date",
        "a.end_date >= :target_date",
        "ap.status NOT IN ('blocked', 'waitlisted', 'rejected', 'no_show')",
    ]
    params: dict[str, object] = {
        "entity_id": entity_id,
        "site_asset_id": site_asset_id,
        "ads_statuses": reserved_statuses,
        "target_date": target_date,
    }
    if exclude_ads_id:
        filters.append("a.id <> :exclude_ads_id")
        params["exclude_ads_id"] = exclude_ads_id

    result = await db.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM ads_pax ap
            JOIN ads a ON a.id = ap.ads_id
            WHERE {' AND '.join(filters)}
            """
        ).bindparams(bindparam("ads_statuses", expanding=True)),
        params,
    )
    return int(result.scalar() or 0)


async def _apply_ads_site_waitlist_if_needed(
    db: AsyncSession,
    *,
    ads: Ads,
    pax_entries: list[AdsPax],
    entity_id: UUID,
) -> dict[str, object]:
    """Apply waitlist state against site capacity for AdS not linked to Planner."""
    if ads.planner_activity_id or not ads.site_entry_asset_id or not ads.start_date or not ads.end_date:
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": None,
            "reserved_pax_count": 0,
            "remaining_capacity": None,
        }

    from app.services.modules.paxlog_service import compute_pax_priority
    from app.services.modules.planner_service import get_effective_capacity

    candidate_entries = [
        entry for entry in pax_entries
        if entry.status not in {"blocked", "waitlisted", "rejected", "no_show"}
    ]
    requested_pax_count = len(candidate_entries)
    if requested_pax_count == 0:
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": None,
            "reserved_pax_count": 0,
            "remaining_capacity": None,
        }

    current_day = ads.start_date
    min_remaining_capacity: int | None = None
    min_capacity_limit: int | None = None
    reserved_pax_peak = 0
    has_capacity_configured = False
    while current_day <= ads.end_date:
        capacity_limit = int(await get_effective_capacity(db, ads.site_entry_asset_id, current_day) or 0)
        if capacity_limit > 0:
            has_capacity_configured = True
        reserved_pax_count = await _count_reserved_site_pax_for_day(
            db,
            entity_id=entity_id,
            site_asset_id=ads.site_entry_asset_id,
            target_date=current_day,
            exclude_ads_id=ads.id,
        )
        remaining_capacity = capacity_limit - reserved_pax_count
        reserved_pax_peak = max(reserved_pax_peak, reserved_pax_count)
        min_capacity_limit = capacity_limit if min_capacity_limit is None else min(min_capacity_limit, capacity_limit)
        min_remaining_capacity = remaining_capacity if min_remaining_capacity is None else min(min_remaining_capacity, remaining_capacity)
        current_day += timedelta(days=1)

    # Check admin setting for behavior when capacity is not configured
    if not has_capacity_configured:
        null_capacity_behavior = await _get_paxlog_setting(
            db, entity_id, "paxlog.null_capacity_behavior", default="unlimited"
        )
        if null_capacity_behavior == "blocking":
            raise HTTPException(
                status_code=400,
                detail="La capacité du site n'est pas configurée. Veuillez configurer la capacité POB dans le registre des assets avant de soumettre cette AdS."
            )
        # "unlimited" = no limit, skip waitlist
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": None,
            "reserved_pax_count": reserved_pax_peak,
            "remaining_capacity": None,
        }

    if min_remaining_capacity is None or requested_pax_count <= min_remaining_capacity:
        return {
            "waitlist_applied": False,
            "waitlisted_count": 0,
            "activity_quota": min_capacity_limit,
            "reserved_pax_count": reserved_pax_peak,
            "remaining_capacity": min_remaining_capacity,
        }

    for entry in candidate_entries:
        entry.status = "waitlisted"
        await compute_pax_priority(db, entry.id)

    return {
        "waitlist_applied": True,
        "waitlisted_count": requested_pax_count,
        "activity_quota": min_capacity_limit,
        "reserved_pax_count": reserved_pax_peak,
        "remaining_capacity": max(min_remaining_capacity, 0),
    }


async def _get_ads_waitlist_capacity_summary(
    db: AsyncSession,
    *,
    entity_id: UUID,
    planner_activity_id: UUID | None,
    site_entry_asset_id: UUID | None,
    start_date: date | None,
    end_date: date | None,
) -> dict[str, int | str | None]:
    if planner_activity_id:
        activity_result = await db.execute(
            select(PlannerActivity.pax_quota).where(
                PlannerActivity.id == planner_activity_id,
                PlannerActivity.entity_id == entity_id,
            )
        )
        activity_quota = activity_result.scalar_one_or_none()
        if activity_quota is None:
            return {
                "capacity_scope": "planner_activity",
                "capacity_limit": None,
                "reserved_pax_count": None,
                "remaining_capacity": None,
            }

        reserved_statuses = (
            "submitted",
            "pending_initiator_review",
            "pending_project_review",
            "pending_compliance",
            "pending_validation",
            "pending_arbitration",
            "approved",
            "in_progress",
        )
        reserved_result = await db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.planner_activity_id = :activity_id
                  AND a.status IN :ads_statuses
                  AND ap.status NOT IN ('blocked', 'waitlisted', 'rejected', 'no_show')
                """
            ).bindparams(bindparam("ads_statuses", expanding=True)),
            {
                "entity_id": entity_id,
                "activity_id": planner_activity_id,
                "ads_statuses": reserved_statuses,
            },
        )
        reserved_pax_count = int(reserved_result.scalar() or 0)
        return {
            "capacity_scope": "planner_activity",
            "capacity_limit": int(activity_quota),
            "reserved_pax_count": reserved_pax_count,
            "remaining_capacity": max(int(activity_quota) - reserved_pax_count, 0),
        }

    if not site_entry_asset_id or not start_date or not end_date:
        return {
            "capacity_scope": None,
            "capacity_limit": None,
            "reserved_pax_count": None,
            "remaining_capacity": None,
        }

    from app.services.modules.planner_service import get_effective_capacity

    current_day = start_date
    min_remaining_capacity: int | None = None
    min_capacity_limit: int | None = None
    reserved_pax_peak = 0
    while current_day <= end_date:
        capacity_limit = int(await get_effective_capacity(db, site_entry_asset_id, current_day) or 0)
        reserved_pax_count = await _count_reserved_site_pax_for_day(
            db,
            entity_id=entity_id,
            site_asset_id=site_entry_asset_id,
            target_date=current_day,
        )
        remaining_capacity = capacity_limit - reserved_pax_count
        reserved_pax_peak = max(reserved_pax_peak, reserved_pax_count)
        min_capacity_limit = capacity_limit if min_capacity_limit is None else min(min_capacity_limit, capacity_limit)
        min_remaining_capacity = remaining_capacity if min_remaining_capacity is None else min(min_remaining_capacity, remaining_capacity)
        current_day += timedelta(days=1)

    return {
        "capacity_scope": "site",
        "capacity_limit": min_capacity_limit,
        "reserved_pax_count": reserved_pax_peak,
        "remaining_capacity": min_remaining_capacity,
    }


async def _get_ads_validation_context(
    db: AsyncSession,
    *,
    entity_id: UUID,
    ads: Ads,
) -> dict[str, int | str | None]:
    capacity_summary = await _get_ads_waitlist_capacity_summary(
        db,
        entity_id=entity_id,
        planner_activity_id=ads.planner_activity_id,
        site_entry_asset_id=ads.site_entry_asset_id,
        start_date=ads.start_date if not ads.planner_activity_id else None,
        end_date=ads.end_date if not ads.planner_activity_id else None,
    )

    if ads.planner_activity_id:
        real_pob_result = await db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.planner_activity_id = :activity_id
                  AND ap.current_onboard = TRUE
                """
            ),
            {"entity_id": entity_id, "activity_id": ads.planner_activity_id},
        )
    else:
        real_pob_result = await db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.site_entry_asset_id = :site_asset_id
                  AND ap.current_onboard = TRUE
                  AND a.start_date <= :end_date
                  AND a.end_date >= :start_date
                """
            ),
            {
                "entity_id": entity_id,
                "site_asset_id": ads.site_entry_asset_id,
                "start_date": ads.start_date,
                "end_date": ads.end_date,
            },
        )

    real_pob = int(real_pob_result.scalar() or 0)
    forecast_pax = capacity_summary["reserved_pax_count"]
    return {
        **capacity_summary,
        "forecast_pax": forecast_pax,
        "real_pob": real_pob,
    }


async def _build_ads_validation_daily_preview(
    db: AsyncSession,
    *,
    entity_id: UUID,
    ads: Ads,
    max_days: int = 5,
) -> list[dict[str, object]]:
    if not ads.start_date or not ads.end_date:
        return []

    preview: list[dict[str, object]] = []
    current_day = ads.start_date
    end_day = ads.end_date
    preview_limit = max(1, min(max_days, 7))

    while current_day <= end_day and len(preview) < preview_limit:
        if ads.planner_activity_id:
            activity_result = await db.execute(
                select(PlannerActivity.pax_quota).where(
                    PlannerActivity.id == ads.planner_activity_id,
                    PlannerActivity.entity_id == entity_id,
                )
            )
            capacity_limit = activity_result.scalar_one_or_none()
            if capacity_limit is None:
                preview.append(
                    {
                        "date": current_day,
                        "forecast_pax": None,
                        "real_pob": None,
                        "capacity_limit": None,
                        "remaining_capacity": None,
                        "saturation_pct": None,
                        "is_critical": False,
                    }
                )
                current_day += timedelta(days=1)
                continue

            reserved_statuses = (
                "submitted",
                "pending_initiator_review",
                "pending_project_review",
                "pending_compliance",
                "pending_validation",
                "pending_arbitration",
                "approved",
                "in_progress",
            )
            reserved_result = await db.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM ads_pax ap
                    JOIN ads a ON a.id = ap.ads_id
                    WHERE a.entity_id = :entity_id
                      AND a.planner_activity_id = :activity_id
                      AND a.status IN :ads_statuses
                      AND a.start_date <= :target_date
                      AND a.end_date >= :target_date
                      AND ap.status NOT IN ('blocked', 'waitlisted', 'rejected', 'no_show')
                    """
                ).bindparams(bindparam("ads_statuses", expanding=True)),
                {
                    "entity_id": entity_id,
                    "activity_id": ads.planner_activity_id,
                    "ads_statuses": reserved_statuses,
                    "target_date": current_day,
                },
            )
            forecast_pax = int(reserved_result.scalar() or 0)
            real_pob_result = await db.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM ads_pax ap
                    JOIN ads a ON a.id = ap.ads_id
                    WHERE a.entity_id = :entity_id
                      AND a.planner_activity_id = :activity_id
                      AND a.start_date <= :target_date
                      AND a.end_date >= :target_date
                      AND ap.current_onboard = TRUE
                    """
                ),
                {
                    "entity_id": entity_id,
                    "activity_id": ads.planner_activity_id,
                    "target_date": current_day,
                },
            )
            real_pob = int(real_pob_result.scalar() or 0)
            capacity_limit = int(capacity_limit)
        else:
            if not ads.site_entry_asset_id:
                break

            from app.services.modules.planner_service import get_effective_capacity

            capacity_limit = int(await get_effective_capacity(db, ads.site_entry_asset_id, current_day) or 0)
            forecast_pax = await _count_reserved_site_pax_for_day(
                db,
                entity_id=entity_id,
                site_asset_id=ads.site_entry_asset_id,
                target_date=current_day,
            )
            real_pob_result = await db.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM ads_pax ap
                    JOIN ads a ON a.id = ap.ads_id
                    WHERE a.entity_id = :entity_id
                      AND a.site_entry_asset_id = :site_asset_id
                      AND a.start_date <= :target_date
                      AND a.end_date >= :target_date
                      AND ap.current_onboard = TRUE
                    """
                ),
                {
                    "entity_id": entity_id,
                    "site_asset_id": ads.site_entry_asset_id,
                    "target_date": current_day,
                },
            )
            real_pob = int(real_pob_result.scalar() or 0)

        remaining_capacity = max(capacity_limit - forecast_pax, 0) if capacity_limit >= 0 else None
        saturation_pct = round((forecast_pax / capacity_limit * 100), 2) if capacity_limit > 0 else None
        preview.append(
            {
                "date": current_day,
                "forecast_pax": forecast_pax,
                "real_pob": real_pob,
                "capacity_limit": capacity_limit,
                "remaining_capacity": remaining_capacity,
                "saturation_pct": saturation_pct,
                "is_critical": bool(remaining_capacity is not None and remaining_capacity <= 0),
            }
        )
        current_day += timedelta(days=1)

    return preview


async def _promote_waitlisted_ads_pax_if_capacity_available(
    db: AsyncSession,
    *,
    entity_id: UUID,
    ads: Ads,
    actor_id: UUID,
) -> list[dict[str, object]]:
    planner_activity_id = ads.planner_activity_id
    if not planner_activity_id and (not ads.site_entry_asset_id or not ads.start_date or not ads.end_date):
        return []

    site_mode = planner_activity_id is None
    if site_mode:
        waitlisted_result = await db.execute(
            text(
                """
                SELECT ap.id, ap.ads_id, a.reference, a.requester_id, a.start_date, a.end_date
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.site_entry_asset_id = :site_asset_id
                  AND a.status = 'pending_arbitration'
                  AND ap.status = 'waitlisted'
                  AND a.start_date <= :released_end_date
                  AND a.end_date >= :released_start_date
                ORDER BY
                  CASE WHEN ap.priority_source = 'manual_override' THEN 0 ELSE 1 END ASC,
                  ap.priority_score DESC,
                  COALESCE(a.submitted_at, a.created_at) ASC,
                  ap.created_at ASC
                """
            ),
            {
                "entity_id": str(entity_id),
                "site_asset_id": str(ads.site_entry_asset_id),
                "released_start_date": ads.start_date,
                "released_end_date": ads.end_date,
            },
        )
    else:
        activity_result = await db.execute(
            select(PlannerActivity.pax_quota).where(
                PlannerActivity.id == planner_activity_id,
                PlannerActivity.entity_id == entity_id,
            )
        )
        activity_quota = activity_result.scalar_one_or_none()
        if activity_quota is None:
            return []

        reserved_statuses = (
            "submitted",
            "pending_initiator_review",
            "pending_project_review",
            "pending_compliance",
            "pending_validation",
            "pending_arbitration",
            "approved",
            "in_progress",
        )
        reserved_result = await db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.planner_activity_id = :activity_id
                  AND a.status IN :ads_statuses
                  AND ap.status NOT IN ('blocked', 'waitlisted', 'rejected', 'no_show')
                """
            ).bindparams(bindparam("ads_statuses", expanding=True)),
            {
                "entity_id": entity_id,
                "activity_id": planner_activity_id,
                "ads_statuses": reserved_statuses,
            },
        )
        reserved_pax_count = int(reserved_result.scalar() or 0)
        slots_available = max(int(activity_quota) - reserved_pax_count, 0)
        if slots_available <= 0:
            return []

        waitlisted_result = await db.execute(
            text(
                """
                SELECT ap.id, ap.ads_id, a.reference, a.requester_id
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                WHERE a.entity_id = :entity_id
                  AND a.planner_activity_id = :activity_id
                  AND a.status = 'pending_arbitration'
                  AND ap.status = 'waitlisted'
                ORDER BY
                  CASE WHEN ap.priority_source = 'manual_override' THEN 0 ELSE 1 END ASC,
                  ap.priority_score DESC,
                  COALESCE(a.submitted_at, a.created_at) ASC,
                  ap.created_at ASC
                LIMIT :limit
                """
            ),
            {
                "entity_id": str(entity_id),
                "activity_id": str(planner_activity_id),
                "limit": slots_available,
            },
        )
    waitlisted_rows = waitlisted_result.all()
    if not waitlisted_rows:
        return []

    promoted_ads_ids: set[UUID] = set()
    promoted_entries: list[dict[str, object]] = []
    from app.services.modules.planner_service import get_effective_capacity

    for row in waitlisted_rows:
        if site_mode:
            ads_pax_id, ads_id, ads_reference, requester_id, candidate_start_date, candidate_end_date = row
            can_promote = True
            current_day = candidate_start_date
            while current_day <= candidate_end_date:
                capacity_limit = int(await get_effective_capacity(db, ads.site_entry_asset_id, current_day) or 0)
                reserved_pax_count = await _count_reserved_site_pax_for_day(
                    db,
                    entity_id=entity_id,
                    site_asset_id=ads.site_entry_asset_id,
                    target_date=current_day,
                )
                if reserved_pax_count + 1 > capacity_limit:
                    can_promote = False
                    break
                current_day += timedelta(days=1)
            if not can_promote:
                continue
        else:
            ads_pax_id, ads_id, ads_reference, requester_id = row
        await db.execute(
            update(AdsPax)
            .where(AdsPax.id == ads_pax_id)
            .values(status="compliant", booking_request_sent=False)
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads_id,
            ads_pax_id=ads_pax_id,
            event_type="pax_waitlist_promoted",
            old_status="waitlisted",
            new_status="compliant",
            actor_id=actor_id,
            metadata_json={
                "planner_activity_id": str(planner_activity_id) if planner_activity_id else None,
                "site_entry_asset_id": str(ads.site_entry_asset_id) if ads.site_entry_asset_id else None,
            },
        ))
        promoted_ads_ids.add(ads_id)
        promoted_entries.append(
            {
                "ads_id": ads_id,
                "ads_pax_id": ads_pax_id,
                "reference": ads_reference,
                "requester_id": requester_id,
            }
        )

    for ads_id in promoted_ads_ids:
        await db.execute(
            update(Ads)
            .where(Ads.id == ads_id, Ads.entity_id == entity_id, Ads.status == "pending_arbitration")
            .values(status="pending_validation", rejection_reason=None)
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads_id,
            event_type="waitlist_released",
            old_status="pending_arbitration",
            new_status="pending_validation",
            actor_id=actor_id,
            metadata_json={
                "planner_activity_id": str(planner_activity_id) if planner_activity_id else None,
                "site_entry_asset_id": str(ads.site_entry_asset_id) if ads.site_entry_asset_id else None,
            },
        ))

    if promoted_entries:
        from app.core.notifications import send_in_app

        notified_ads_ids: set[UUID] = set()
        for item in promoted_entries:
            ads_id = item["ads_id"]
            if ads_id in notified_ads_ids or not item["requester_id"]:
                continue
            notified_ads_ids.add(ads_id)
            release_message = (
                "Une place s'est libérée sur l'activité liée."
                if planner_activity_id
                else "Une place s'est libérée sur le site concerné."
            )
            await send_in_app(
                db,
                user_id=item["requester_id"],
                entity_id=entity_id,
                title="Place libérée sur activité Planner" if planner_activity_id else "Place libérée sur site",
                body=(
                    f"{release_message} "
                    f"L'AdS {item['reference']} revient dans le flux de validation."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{ads_id}",
            )

    return promoted_entries


async def _get_ads_workflow_definition(db: AsyncSession, *, entity_id: UUID) -> WorkflowDefinition | None:
    return await fsm_service.get_definition(
        db,
        workflow_slug=ADS_WORKFLOW_SLUG,
        entity_id_scope=entity_id,
    )


async def _resolve_ads_auto_transition(
    db: AsyncSession,
    *,
    entity_id: UUID,
    from_state: str,
    ads: Ads,
    project_reviewer: Project | None = None,
) -> str | None:
    definition = await _get_ads_workflow_definition(db, entity_id=entity_id)
    if not definition:
        return None

    transition = fsm_service.resolve_next_transition(
        transitions=definition.transitions,
        from_state=from_state,
        context={
            "created_by": str(ads.created_by) if ads.created_by else None,
            "requester_id": str(ads.requester_id) if ads.requester_id else None,
            "project_reviewer_id": str(project_reviewer.manager_id) if project_reviewer and getattr(project_reviewer, "manager_id", None) else None,
        },
    )
    return transition.to_state if transition else None


def _build_ads_workflow_runtime_context(
    *,
    ads: Ads,
    entity_id: UUID,
    project_reviewer: Project | None = None,
) -> dict:
    return {
        "entity_id": str(entity_id),
        "created_by": str(ads.created_by) if ads.created_by else None,
        "requester_id": str(ads.requester_id) if ads.requester_id else None,
        "project_reviewer_id": (
            str(project_reviewer.manager_id)
            if project_reviewer and getattr(project_reviewer, "manager_id", None)
            else None
        ),
    }


async def _can_manage_avm(
    *,
    db: AsyncSession,
    avm: MissionNotice,
    current_user: User,
    entity_id: UUID,
) -> bool:
    """Whether the current user may manage this AVM.

    Owners can manage their own AVM. Arbitrators may override through stronger
    approval/completion permissions.
    """
    if avm.created_by == current_user.id:
        return True

    can_approve = await has_user_permission(current_user, entity_id, "paxlog.avm.approve", db)
    if can_approve:
        return True

    can_complete = await has_user_permission(current_user, entity_id, "paxlog.avm.complete", db)
    return can_complete


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


EXTERNAL_OTP_SEND_WINDOW_MINUTES = 15
EXTERNAL_OTP_SEND_MAX_PER_WINDOW = 3
EXTERNAL_OTP_VERIFY_WINDOW_MINUTES = 15
EXTERNAL_OTP_VERIFY_MAX_PER_WINDOW = 5
EXTERNAL_PUBLIC_ACCESS_WINDOW_MINUTES = 15
EXTERNAL_PUBLIC_ACCESS_MAX_PER_WINDOW = 20
EXTERNAL_LINK_ANOMALY_ACTIONS = {
    "otp_rate_limited",
    "otp_verify_rate_limited",
    "otp_locked",
    "session_invalid",
    "session_expired",
    "session_context_mismatch",
    "session_ip_changed",
    "public_access_rate_limited",
}


def _get_external_request_context(request: Request | None) -> dict[str, str | None]:
    ip = request.client.host if request and request.client else None
    user_agent = request.headers.get("user-agent") if request else None
    normalized_user_agent = (user_agent or "").strip().lower()
    return {
        "ip": ip,
        "user_agent": user_agent,
        "ip_hash": _hash_secret(ip) if ip else None,
        "user_agent_hash": _hash_secret(normalized_user_agent) if normalized_user_agent else None,
    }


def _get_latest_external_session_context(link: ExternalAccessLink) -> dict | None:
    for item in reversed(link.access_log or []):
        if item.get("action") in {"session_opened", "otp_validated"} and isinstance(item.get("session_context"), dict):
            return item["session_context"]
    return None


def _count_recent_external_actions(
    link: ExternalAccessLink,
    *,
    action: str,
    window_minutes: int,
) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    for item in link.access_log or []:
        if item.get("action") != action:
            continue
        timestamp_raw = item.get("timestamp")
        if not isinstance(timestamp_raw, str):
            continue
        try:
            ts = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00"))
        except ValueError:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts >= now - timedelta(minutes=window_minutes):
            count += 1
    return count


def _append_external_access_log(
    link: ExternalAccessLink,
    *,
    action: str,
    request: Request | None = None,
    otp_validated: bool | None = None,
    metadata: dict | None = None,
) -> None:
    context = _get_external_request_context(request)
    log = list(link.access_log or [])
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "ip": context["ip"],
        "user_agent": context["user_agent"],
        "ip_hash": context["ip_hash"],
        "user_agent_hash": context["user_agent_hash"],
        "otp_validated": otp_validated,
    }
    if action in {"session_opened", "otp_validated"}:
        entry["session_context"] = {
            "ip_hash": context["ip_hash"],
            "user_agent_hash": context["user_agent_hash"],
        }
    if metadata:
        entry["metadata"] = metadata
    log.append(entry)
    link.access_log = log[-50:]


def _build_external_link_security_read(link: ExternalAccessLink) -> AdsExternalLinkSecurityRead:
    anomaly_actions: dict[str, int] = {}
    recent_events: list[ExternalAccessEventRead] = []
    for item in reversed(link.access_log or []):
        action = str(item.get("action") or "")
        if not action:
            continue
        if action in EXTERNAL_LINK_ANOMALY_ACTIONS:
            anomaly_actions[action] = anomaly_actions.get(action, 0) + 1
        timestamp_raw = item.get("timestamp")
        timestamp = None
        if isinstance(timestamp_raw, str):
            try:
                timestamp = datetime.fromisoformat(timestamp_raw.replace("Z", "+00:00"))
            except ValueError:
                timestamp = None
        if len(recent_events) < 8:
            recent_events.append(
                ExternalAccessEventRead(
                    timestamp=timestamp,
                    action=action,
                    otp_validated=item.get("otp_validated"),
                    metadata=item.get("metadata") if isinstance(item.get("metadata"), dict) else None,
                )
            )
    expires_at = link.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    active = (not link.revoked) and expires_at >= datetime.now(timezone.utc)
    remaining_uses = max(link.max_uses - link.use_count, 0) if link.max_uses else None
    return AdsExternalLinkSecurityRead(
        id=link.id,
        ads_id=link.ads_id,
        created_by=link.created_by,
        otp_required=link.otp_required,
        otp_destination_masked=_mask_contact_value(link.otp_sent_to),
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        remaining_uses=remaining_uses,
        revoked=link.revoked,
        active=active,
        created_at=link.created_at,
        session_expires_at=link.session_expires_at,
        last_validated_at=link.last_validated_at,
        anomaly_count=sum(anomaly_actions.values()),
        anomaly_actions=anomaly_actions,
        recent_events=recent_events,
    )


async def _get_external_link_or_404(db: AsyncSession, token: str) -> ExternalAccessLink:
    result = await db.execute(
        select(ExternalAccessLink).where(
            ExternalAccessLink.token == token,
            ExternalAccessLink.revoked == False,  # noqa: E712
        )
    )
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Lien invalide ou expiré")

    expires_at = link.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Ce lien a expiré")
    if link.max_uses and link.use_count >= link.max_uses:
        raise HTTPException(status_code=410, detail="Ce lien a atteint le nombre maximum d'utilisations")
    return link


async def _require_external_session(
    db: AsyncSession,
    *,
    token: str,
    session_token: str | None,
    request: Request | None = None,
) -> ExternalAccessLink:
    link = await _get_external_link_or_404(db, token)
    if not link.otp_required:
        return link
    if not session_token or not link.session_token_hash:
        raise HTTPException(status_code=401, detail="Session externe requise")
    if _hash_secret(session_token) != link.session_token_hash:
        if request:
            _append_external_access_log(
                link,
                action="session_invalid",
                request=request,
                otp_validated=False,
                metadata={"reason": "token_hash_mismatch"},
            )
            await db.commit()
        raise HTTPException(status_code=401, detail="Session externe invalide")
    if not link.session_expires_at:
        raise HTTPException(status_code=401, detail="Session externe expirée")
    session_expires_at = link.session_expires_at
    if session_expires_at.tzinfo is None:
        session_expires_at = session_expires_at.replace(tzinfo=timezone.utc)
    if session_expires_at < datetime.now(timezone.utc):
        link.session_token_hash = None
        link.session_expires_at = None
        if request:
            _append_external_access_log(
                link,
                action="session_expired",
                request=request,
                otp_validated=False,
            )
            await db.commit()
        raise HTTPException(status_code=401, detail="Session externe expirée")
    if request:
        expected_context = _get_latest_external_session_context(link)
        current_context = _get_external_request_context(request)
        expected_user_agent_hash = (expected_context or {}).get("user_agent_hash")
        if expected_user_agent_hash and current_context.get("user_agent_hash") != expected_user_agent_hash:
            link.session_token_hash = None
            link.session_expires_at = None
            _append_external_access_log(
                link,
                action="session_context_mismatch",
                request=request,
                otp_validated=False,
                metadata={"reason": "user_agent_changed"},
            )
            await db.commit()
            raise HTTPException(status_code=401, detail="Contexte navigateur invalide pour cette session externe")
        expected_ip_hash = (expected_context or {}).get("ip_hash")
        if expected_ip_hash and current_context.get("ip_hash") and current_context.get("ip_hash") != expected_ip_hash:
            _append_external_access_log(
                link,
                action="session_ip_changed",
                request=request,
                otp_validated=True,
            )
            await db.commit()
    return link


async def _get_external_ads_and_context(
    db: AsyncSession,
    *,
    link: ExternalAccessLink,
) -> tuple[Ads, UUID, UUID | None]:
    ads = await db.get(Ads, link.ads_id)
    if not ads:
        raise HTTPException(status_code=404, detail="AdS introuvable")
    preconfigured = link.preconfigured_data or {}
    fallback_company_id: UUID | None = None
    raw_company_id = preconfigured.get("target_company_id") or preconfigured.get("company_id")
    if raw_company_id:
        try:
            fallback_company_id = UUID(str(raw_company_id))
        except ValueError:
            fallback_company_id = None
    return ads, ads.entity_id, fallback_company_id


async def _get_ads_allowed_company_scope(
    db: AsyncSession,
    *,
    ads_id: UUID,
) -> tuple[list[UUID], list[str]]:
    rows = (
        await db.execute(
            select(AdsAllowedCompany.company_id, Tier.name)
            .select_from(AdsAllowedCompany)
            .outerjoin(Tier, Tier.id == AdsAllowedCompany.company_id)
            .where(AdsAllowedCompany.ads_id == ads_id)
            .order_by(AdsAllowedCompany.created_at.asc())
        )
    ).all()
    return [row[0] for row in rows if row[0] is not None], [row[1] for row in rows if row[1]]


async def _replace_ads_allowed_companies(
    db: AsyncSession,
    *,
    ads_id: UUID,
    entity_id: UUID,
    company_ids: list[UUID],
) -> tuple[list[UUID], list[str]]:
    unique_company_ids = list(dict.fromkeys(company_ids))
    if unique_company_ids:
        valid_rows = (
            await db.execute(
                select(Tier.id, Tier.name)
                .where(
                    Tier.entity_id == entity_id,
                    Tier.id.in_(unique_company_ids),
                    Tier.archived == False,  # noqa: E712
                )
            )
        ).all()
        valid_ids = {row[0] for row in valid_rows}
        missing = [company_id for company_id in unique_company_ids if company_id not in valid_ids]
        if missing:
            raise HTTPException(status_code=400, detail="Une ou plusieurs entreprises autorisées sont invalides pour cette entité.")
    await db.execute(text("DELETE FROM ads_allowed_companies WHERE ads_id = :ads_id"), {"ads_id": str(ads_id)})
    for company_id in unique_company_ids:
        db.add(AdsAllowedCompany(ads_id=ads_id, company_id=company_id))
    return await _get_ads_allowed_company_scope(db, ads_id=ads_id)


async def _resolve_external_allowed_companies(
    db: AsyncSession,
    *,
    ads: Ads,
    link: ExternalAccessLink,
    fallback_company_id: UUID | None = None,
) -> tuple[list[UUID], list[str], UUID | None, str | None]:
    preconfigured = getattr(link, "preconfigured_data", None) or {}
    raw_allowed_ids = preconfigured.get("allowed_company_ids")
    raw_company_id = preconfigured.get("target_company_id") or preconfigured.get("company_id")
    if fallback_company_id is not None and not raw_allowed_ids and not raw_company_id:
        return [fallback_company_id], [], fallback_company_id, None
    allowed_company_ids: list[UUID] = []
    allowed_company_names: list[str] = []
    try:
        allowed_company_ids, allowed_company_names = await _get_ads_allowed_company_scope(db, ads_id=ads.id)
    except AssertionError:
        allowed_company_ids, allowed_company_names = [], []
    if isinstance(raw_allowed_ids, list):
        parsed_ids: list[UUID] = []
        for raw_value in raw_allowed_ids:
            try:
                parsed_ids.append(UUID(str(raw_value)))
            except ValueError:
                continue
            if parsed_ids:
                allowed_company_ids = parsed_ids
    primary_company_id: UUID | None = None
    if raw_company_id:
        try:
            parsed = UUID(str(raw_company_id))
            if not allowed_company_ids or parsed in allowed_company_ids:
                primary_company_id = parsed
        except ValueError:
            primary_company_id = None
    if primary_company_id is None and len(allowed_company_ids) == 1:
        primary_company_id = allowed_company_ids[0]
    if primary_company_id is None and not allowed_company_ids and fallback_company_id is not None:
        primary_company_id = fallback_company_id
    if not allowed_company_ids and fallback_company_id is not None:
        allowed_company_ids = [fallback_company_id]
    primary_company_name: str | None = None
    if primary_company_id and hasattr(db, "scalar"):
        try:
            primary_company_name = await db.scalar(select(Tier.name).where(Tier.id == primary_company_id))
        except (AssertionError, AttributeError):
            primary_company_name = None
    if not allowed_company_names and allowed_company_ids:
        rows = (
            await db.execute(
                select(Tier.id, Tier.name).where(Tier.id.in_(allowed_company_ids))
            )
        ).all()
        name_map = {row[0]: row[1] for row in rows}
        allowed_company_names = [name_map[company_id] for company_id in allowed_company_ids if company_id in name_map]
    return allowed_company_ids, allowed_company_names, primary_company_id, primary_company_name


async def _require_external_scope(
    db: AsyncSession,
    *,
    token: str,
    request: Request = None,
    session_token: str | None,
) -> tuple[ExternalAccessLink, Ads, UUID, list[UUID], list[str], UUID | None, str | None]:
    link = await _require_external_session(db, token=token, session_token=session_token, request=request)
    ads, entity_id, fallback_company_id = await _get_external_ads_and_context(db, link=link)
    allowed_company_ids, allowed_company_names, primary_company_id, primary_company_name = await _resolve_external_allowed_companies(
        db,
        ads=ads,
        link=link,
        fallback_company_id=fallback_company_id,
    )
    return (
        link,
        ads,
        entity_id,
        allowed_company_ids,
        allowed_company_names,
        primary_company_id,
        primary_company_name,
    )


def _compare_pax_names(
    first_name: str,
    last_name: str,
    candidate_first_name: str,
    candidate_last_name: str,
) -> str | None:
    return paxlog_service.compare_pax_names(
        first_name,
        last_name,
        candidate_first_name,
        candidate_last_name,
    )


def _compute_completeness(
    entity: User | TierContact,
    has_credentials: bool = False,
) -> int:
    """Calculate PAX profile completeness as a percentage (0-100).

    Works for both User and TierContact objects.
    Weights: first_name 15%, last_name 15%, birth_date 15%, nationality 15%,
    badge_number 15%, pax_group_id 10%, at least 1 credential 15%.
    """
    score = 0
    if getattr(entity, "first_name", None):
        score += 15
    if getattr(entity, "last_name", None):
        score += 15
    if getattr(entity, "birth_date", None):
        score += 15
    if getattr(entity, "nationality", None):
        score += 15
    if getattr(entity, "badge_number", None):
        score += 15
    if getattr(entity, "pax_group_id", None):
        score += 10
    if has_credentials:
        score += 15
    return min(score, 100)


def _user_to_pax_summary(u: User, company_name: str | None = None) -> PaxProfileSummary:
    """Build a PaxProfileSummary from a User row."""
    return PaxProfileSummary(
        id=u.id,
        pax_source="user",
        entity_id=u.default_entity_id,
        pax_type=u.pax_type,
        first_name=u.first_name,
        last_name=u.last_name,
        company_id=None,
        company_name=company_name,
        badge_number=u.badge_number,
        active=u.active,
        created_at=u.created_at,
    )


def _contact_to_pax_summary(c: TierContact, company_name: str | None = None) -> PaxProfileSummary:
    """Build a PaxProfileSummary from a TierContact row."""
    return PaxProfileSummary(
        id=c.id,
        pax_source="contact",
        entity_id=None,
        pax_type="external",
        first_name=c.first_name,
        last_name=c.last_name,
        company_id=c.tier_id,
        company_name=company_name,
        badge_number=c.badge_number,
        active=c.active,
        created_at=c.created_at,
    )


def _user_to_pax_read(u: User, company_name: str | None = None) -> PaxProfileRead:
    """Build a PaxProfileRead from a User row."""
    return PaxProfileRead(
        id=u.id,
        pax_source="user",
        entity_id=u.default_entity_id,
        pax_type=u.pax_type,
        first_name=u.first_name,
        last_name=u.last_name,
        birth_date=u.birth_date,
        nationality=u.nationality,
        company_id=None,
        company_name=company_name,
        group_id=u.pax_group_id,
        badge_number=u.badge_number,
        photo_url=u.avatar_url,
        email=u.email,
        linked_user_id=None,
        linked_user_email=None,
        linked_user_active=None,
        active=u.active,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )


def _contact_to_pax_read(c: TierContact, company_name: str | None = None) -> PaxProfileRead:
    """Build a PaxProfileRead from a TierContact row."""
    return PaxProfileRead(
        id=c.id,
        pax_source="contact",
        entity_id=None,
        pax_type="external",
        first_name=c.first_name,
        last_name=c.last_name,
        birth_date=c.birth_date,
        nationality=c.nationality,
        company_id=c.tier_id,
        company_name=company_name,
        group_id=c.pax_group_id,
        badge_number=c.badge_number,
        photo_url=c.photo_url,
        email=c.email,
        linked_user_id=c.linked_user_id,
        linked_user_email=c.linked_user.email if c.linked_user else None,
        linked_user_active=c.linked_user.active if c.linked_user else None,
        active=c.active,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


async def _resolve_pax_identity(
    db: AsyncSession,
    profile_id: UUID,
    pax_source: str,
    *,
    entity_id: UUID | None = None,
    current_user: User | None = None,
) -> tuple[User | TierContact, str | None]:
    """Resolve a PAX entity (User or TierContact) by id and source.

    Returns (entity, company_name) or raises 404.
    """
    if pax_source == "user":
        result = await db.execute(select(User).where(User.id == profile_id))
        entity = result.scalar_one_or_none()
        if not entity:
            raise HTTPException(status_code=404, detail="PAX user not found")
        if current_user is not None and current_user.user_type == "external" and entity.id != current_user.id:
            raise HTTPException(status_code=404, detail="PAX user not found")
        return entity, None
    elif pax_source == "contact":
        result = await db.execute(
            select(TierContact, Tier.name.label("company_name"))
            .outerjoin(Tier, Tier.id == TierContact.tier_id)
            .where(TierContact.id == profile_id)
        )
        row = result.one_or_none()
        if not row:
            raise HTTPException(status_code=404, detail="PAX contact not found")
        if current_user is not None and entity_id is not None and row[0].tier_id:
            await _assert_external_tier_access(db, current_user, entity_id, row[0].tier_id)
        return row[0], row[1]
    else:
        raise HTTPException(status_code=400, detail="pax_source must be 'user' or 'contact'")


# ═══════════════════════════════════════════════════════════════════════════════
# PAX PROFILES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profiles", response_model=PaginatedResponse[PaxProfileSummary])
async def list_profiles(
    search: str | None = None,
    type_filter: str | None = None,
    company_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """List PAX profiles — virtual UNION of Users + TierContacts."""
    like = f"%{search}%" if search else None
    items: list[PaxProfileSummary] = []
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)

    # ── 1. Internal PAX (Users belonging to this entity) ──
    if type_filter in (None, "internal") and current_user.user_type != "external":
        user_q = (
            select(User)
            .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
        )
        if like:
            user_q = user_q.where(
                User.first_name.ilike(like)
                | User.last_name.ilike(like)
                | User.badge_number.ilike(like)
                | User.email.ilike(like)
            )
        user_q = user_q.order_by(User.last_name, User.first_name)
        user_rows = (await db.execute(user_q)).scalars().all()
        for u in user_rows:
            items.append(_user_to_pax_summary(u))

    # ── 2. External PAX (TierContacts linked to entity's Tiers) ──
    if type_filter in (None, "external"):
        contact_q = (
            select(TierContact, Tier.name.label("company_name"))
            .join(Tier, Tier.id == TierContact.tier_id)
            .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
        )
        if linked_tier_ids is not None:
            contact_q = contact_q.where(TierContact.tier_id.in_(linked_tier_ids))
        if like:
            contact_q = contact_q.where(
                TierContact.first_name.ilike(like)
                | TierContact.last_name.ilike(like)
                | TierContact.badge_number.ilike(like)
                | Tier.name.ilike(like)
            )
        if company_id:
            contact_q = contact_q.where(TierContact.tier_id == company_id)
        contact_q = contact_q.order_by(TierContact.last_name, TierContact.first_name)
        contact_rows = (await db.execute(contact_q)).all()
        for c, comp_name in contact_rows:
            items.append(_contact_to_pax_summary(c, comp_name))

    # ── Sort combined results by last_name, first_name ──
    items.sort(key=lambda x: (x.last_name.lower(), x.first_name.lower()))

    # ── Manual pagination ──
    total = len(items)
    offset = (pagination.page - 1) * pagination.page_size
    page_items = items[offset : offset + pagination.page_size]

    return {
        "items": page_items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.get("/pax-groups", response_model=list[PaxGroupRead])
async def list_pax_groups(
    company_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """List PAX groups visible in the current entity."""
    query = (
        select(PaxGroup, Tier.name.label("company_name"))
        .outerjoin(Tier, Tier.id == PaxGroup.company_id)
        .where(PaxGroup.entity_id == entity_id)
        .order_by(PaxGroup.name)
    )
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if linked_tier_ids is not None:
        query = query.where(or_(PaxGroup.company_id == None, PaxGroup.company_id.in_(linked_tier_ids)))  # noqa: E711
    if company_id:
        await _assert_external_tier_access(db, current_user, entity_id, company_id)
        query = query.where(PaxGroup.company_id == company_id)

    result = await db.execute(query)
    return [
        PaxGroupRead(
            id=group.id,
            entity_id=group.entity_id,
            name=group.name,
            company_id=group.company_id,
            company_name=company_name,
            active=group.active,
        )
        for group, company_name in result.all()
    ]


class _ExternalPaxCreate(BaseModel):
    """Body to create an external PAX (TierContact)."""
    first_name: str
    last_name: str
    company_id: UUID
    birth_date: date | None = None
    nationality: str | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    pax_group_id: UUID | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None


@router.post("/profiles", response_model=PaxProfileRead, status_code=201)
async def create_profile(
    body: _ExternalPaxCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create an external PAX (TierContact). Internal PAX are created via user management."""
    await _assert_external_tier_access(db, current_user, entity_id, body.company_id)
    # ── Duplicate detection ──
    dup_query = (
        select(TierContact.id, TierContact.first_name, TierContact.last_name, TierContact.badge_number)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if linked_tier_ids is not None:
        dup_query = dup_query.where(TierContact.tier_id.in_(linked_tier_ids))
    dup_result = await db.execute(dup_query)
    duplicates = [
        d for d in dup_result.all()
        if _compare_pax_names(body.first_name, body.last_name, d.first_name, d.last_name)
    ]

    if duplicates:
        dup_info = [
            {"id": str(d.id), "name": f"{d.first_name} {d.last_name}", "badge": d.badge_number}
            for d in duplicates
        ]
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DUPLICATE_PAX_PROFILE",
                "message": f"Un contact PAX similaire existe déjà ({len(duplicates)} doublon(s) détecté(s)).",
                "duplicates": dup_info,
            },
        )

    contact = TierContact(
        tier_id=body.company_id,
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        nationality=body.nationality,
        badge_number=body.badge_number,
        photo_url=body.photo_url,
        pax_group_id=body.pax_group_id,
        email=body.email,
        phone=body.phone,
        position=body.position,
    )
    db.add(contact)
    await db.commit()
    await db.refresh(contact)

    # Fetch company name
    tier_result = await db.execute(select(Tier.name).where(Tier.id == body.company_id))
    company_name = tier_result.scalar()

    await record_audit(
        db,
        action="paxlog.profile.create",
        resource_type="tier_contact",
        resource_id=str(contact.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"name": f"{body.first_name} {body.last_name}", "type": "external"},
    )
    await db.commit()
    return _contact_to_pax_read(contact, company_name)


@router.post("/profiles/check-duplicates")
async def check_profile_duplicates(
    first_name: str,
    last_name: str,
    birth_date: date | None = None,
    badge_number: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """Check for potential duplicate PAX (Users + TierContacts) before creation.

    Returns a list of similar profiles so the frontend can warn the user.
    """
    matches: list[dict] = []

    # ── Users with matching names ──
    user_q = (
        select(User.id, User.first_name, User.last_name, User.birth_date, User.badge_number)
        .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
    )
    if current_user.user_type == "external":
        user_q = user_q.where(User.id == current_user.id)
    user_rows = (await db.execute(user_q)).all()
    for r in user_rows:
        match_type = _compare_pax_names(first_name, last_name, r.first_name, r.last_name)
        if match_type:
            matches.append({
                "id": str(r.id),
                "first_name": r.first_name,
                "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number,
                "pax_source": "user",
                "match_type": match_type,
            })

    # ── TierContacts with matching names ──
    contact_q = (
        select(TierContact.id, TierContact.first_name, TierContact.last_name,
               TierContact.birth_date, TierContact.badge_number)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if linked_tier_ids is not None:
        contact_q = contact_q.where(TierContact.tier_id.in_(linked_tier_ids))
    contact_rows = (await db.execute(contact_q)).all()
    for r in contact_rows:
        match_type = _compare_pax_names(first_name, last_name, r.first_name, r.last_name)
        if match_type:
            matches.append({
                "id": str(r.id),
                "first_name": r.first_name,
                "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number,
                "pax_source": "contact",
                "match_type": match_type,
            })

    # ── Badge number match (if provided and no name match found) ──
    if badge_number and not matches:
        badge_user_q = (
            select(User.id, User.first_name, User.last_name, User.birth_date, User.badge_number)
            .where(
                User.default_entity_id == entity_id,
                User.badge_number == badge_number,
                User.active == True,  # noqa: E712
            )
        )
        if current_user.user_type == "external":
            badge_user_q = badge_user_q.where(User.id == current_user.id)
        for r in (await db.execute(badge_user_q)).all():
            matches.append({
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number, "pax_source": "user", "match_type": "badge_number",
            })

        badge_contact_q = (
            select(TierContact.id, TierContact.first_name, TierContact.last_name,
                   TierContact.birth_date, TierContact.badge_number)
            .join(Tier, Tier.id == TierContact.tier_id)
            .where(
                Tier.entity_id == entity_id,
                TierContact.badge_number == badge_number,
                TierContact.active == True,  # noqa: E712
            )
        )
        if linked_tier_ids is not None:
            badge_contact_q = badge_contact_q.where(TierContact.tier_id.in_(linked_tier_ids))
        for r in (await db.execute(badge_contact_q)).all():
            matches.append({
                "id": str(r.id), "first_name": r.first_name, "last_name": r.last_name,
                "birth_date": str(r.birth_date) if r.birth_date else None,
                "badge_number": r.badge_number, "pax_source": "contact", "match_type": "badge_number",
            })

    return {"has_duplicates": len(matches) > 0, "matches": matches}


@router.get("/profiles/{profile_id}", response_model=PaxProfileRead)
async def get_profile(
    profile_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get a PAX profile by ID. Use pax_source=user or pax_source=contact."""
    entity, company_name = await _resolve_pax_identity(
        db,
        profile_id,
        pax_source,
        entity_id=entity_id,
        current_user=current_user,
    )
    if pax_source == "user":
        return _user_to_pax_read(entity, company_name)  # type: ignore[arg-type]
    return _contact_to_pax_read(entity, company_name)  # type: ignore[arg-type]


@router.get("/profiles/{profile_id}/site-presence-history", response_model=list[PaxSitePresenceRead])
async def get_profile_site_presence_history(
    profile_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """Return the known on-site presence history for a PAX based on AdS participation."""
    from sqlalchemy import text as sa_text

    await _resolve_pax_identity(
        db,
        profile_id,
        pax_source,
        entity_id=entity_id,
        current_user=current_user,
    )

    pax_filter = "ap.user_id = :profile_id" if pax_source == "user" else "ap.contact_id = :profile_id"
    # Use raw SQL so we can join travel and site context without adding fake ORM models in PaxLog.
    raw_result = await db.execute(
        sa_text(
            """
        SELECT DISTINCT ON (a.id)
            a.id,
            a.reference,
            a.status,
            ap.status AS pax_status,
            a.site_entry_asset_id,
            site.name AS site_name,
            a.start_date,
            a.end_date,
            a.visit_purpose,
            a.visit_category,
            mp.boarding_status,
            mp.boarded_at,
            a.approved_at,
            CASE WHEN a.status = 'completed' THEN COALESCE(mp.boarded_at, a.updated_at) ELSE NULL END AS completed_at
        FROM ads a
        JOIN ads_pax ap ON ap.ads_id = a.id
        LEFT JOIN ar_installations site ON site.id = a.site_entry_asset_id
        LEFT JOIN manifest_passengers mp ON mp.ads_pax_id = ap.id AND mp.active = true
        WHERE a.entity_id = :eid
          AND """
            + pax_filter
            + """
        ORDER BY a.id, mp.boarded_at DESC NULLS LAST, mp.created_at DESC NULLS LAST, a.start_date DESC
        """
        ),
        {"eid": str(entity_id), "profile_id": str(profile_id)},
    )

    items = []
    for row in raw_result.all():
        items.append(
            PaxSitePresenceRead(
                ads_id=row[0],
                ads_reference=row[1],
                ads_status=row[2],
                pax_status=row[3],
                site_asset_id=row[4],
                site_name=row[5],
                start_date=row[6],
                end_date=row[7],
                visit_purpose=row[8],
                visit_category=row[9],
                boarding_status=row[10],
                boarded_at=row[11],
                approved_at=row[12],
                completed_at=row[13],
            )
        )
    return items


@router.patch("/profiles/{profile_id}", response_model=PaxProfileRead)
async def update_profile(
    profile_id: UUID,
    body: PaxProfileUpdate,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update PAX-specific fields on a User or TierContact."""
    entity, company_name = await _resolve_pax_identity(
        db,
        profile_id,
        pax_source,
        entity_id=entity_id,
        current_user=current_user,
    )

    update_data = body.model_dump(exclude_unset=True)
    # Map PaxProfileUpdate fields to entity fields
    field_mapping = {
        "birth_date": "birth_date",
        "nationality": "nationality",
        "badge_number": "badge_number",
        "photo_url": "photo_url" if pax_source == "contact" else "avatar_url",
        "pax_group_id": "pax_group_id",
    }
    for schema_field, model_field in field_mapping.items():
        if schema_field in update_data:
            setattr(entity, model_field, update_data[schema_field])

    await db.commit()
    await db.refresh(entity)

    if pax_source == "user":
        return _user_to_pax_read(entity, company_name)  # type: ignore[arg-type]
    return _contact_to_pax_read(entity, company_name)  # type: ignore[arg-type]


# ═══════════════════════════════════════════════════════════════════════════════
# CREDENTIAL TYPES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/credential-types", response_model=list[CredentialTypeRead])
async def list_credential_types(
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential_type.read"),
    db: AsyncSession = Depends(get_db),
):
    """List all credential types (global reference)."""
    query = select(CredentialType).where(CredentialType.active == True)
    if category:
        query = query.where(CredentialType.category == category)
    query = query.order_by(CredentialType.category, CredentialType.name)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/credential-types", response_model=CredentialTypeRead, status_code=201)
async def create_credential_type(
    body: CredentialTypeCreate,
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credtype.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a credential type."""
    existing = await db.execute(
        select(CredentialType).where(CredentialType.code == body.code)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Credential type with code '{body.code}' already exists",
        )

    cred_type = CredentialType(
        code=body.code,
        name=body.name,
        category=body.category,
        has_expiry=body.has_expiry,
        validity_months=body.validity_months,
        proof_required=body.proof_required,
        booking_service_id=body.booking_service_id,
    )
    db.add(cred_type)
    await db.commit()
    await db.refresh(cred_type)
    return cred_type


# ═══════════════════════════════════════════════════════════════════════════════
# PAX CREDENTIALS
# ═══════════════════════════════════════════════════════════════════════════════


def _cred_pax_filter(profile_id: UUID, pax_source: str):
    """Return an or_() filter for PaxCredential matching user_id or contact_id."""
    if pax_source == "user":
        return PaxCredential.user_id == profile_id
    return PaxCredential.contact_id == profile_id


@router.get(
    "/profiles/{profile_id}/credentials",
    response_model=list[PaxCredentialRead],
)
async def list_credentials(
    profile_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.read"),
    db: AsyncSession = Depends(get_db),
):
    """List credentials for a PAX (user or contact)."""
    result = await db.execute(
        select(PaxCredential)
        .where(_cred_pax_filter(profile_id, pax_source))
        .order_by(PaxCredential.created_at.desc())
    )
    return result.scalars().all()


@router.post(
    "/profiles/{profile_id}/credentials",
    response_model=PaxCredentialRead,
    status_code=201,
)
async def create_credential(
    profile_id: UUID,
    body: PaxCredentialCreate,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.create"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential to a PAX (status=pending_validation)."""
    credential = PaxCredential(
        user_id=profile_id if pax_source == "user" else None,
        contact_id=profile_id if pax_source == "contact" else None,
        credential_type_id=body.credential_type_id,
        obtained_date=body.obtained_date,
        expiry_date=body.expiry_date,
        proof_url=body.proof_url,
        notes=body.notes,
        status="pending_validation",
    )
    db.add(credential)
    await db.commit()
    await db.refresh(credential)
    return credential


@router.patch(
    "/profiles/{profile_id}/credentials/{credential_id}/validate",
    response_model=PaxCredentialRead,
)
async def validate_credential(
    profile_id: UUID,
    credential_id: UUID,
    body: PaxCredentialValidate,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.credential.validate"),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a credential."""
    result = await db.execute(
        select(PaxCredential).where(
            PaxCredential.id == credential_id,
            _cred_pax_filter(profile_id, pax_source),
        )
    )
    credential = result.scalar_one_or_none()
    if not credential:
        raise HTTPException(status_code=404, detail="Credential not found")

    if body.action == "approve":
        credential.status = "valid"
    else:
        credential.status = "rejected"
        credential.rejection_reason = body.rejection_reason

    credential.validated_by = current_user.id
    credential.validated_at = func.now()
    await db.commit()
    await db.refresh(credential)
    return credential


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE MATRIX
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/compliance-matrix", response_model=list[ComplianceMatrixRead])
async def list_compliance_matrix(
    asset_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """List compliance matrix entries for an entity."""
    query = select(ComplianceMatrixEntry).where(
        ComplianceMatrixEntry.entity_id == entity_id
    )
    if asset_id:
        query = query.where(ComplianceMatrixEntry.asset_id == asset_id)
    query = query.order_by(ComplianceMatrixEntry.effective_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post(
    "/compliance-matrix",
    response_model=ComplianceMatrixRead,
    status_code=201,
)
async def create_compliance_entry(
    body: ComplianceMatrixCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a compliance requirement to the HSE matrix."""
    entry = ComplianceMatrixEntry(
        entity_id=entity_id,
        asset_id=body.asset_id,
        credential_type_id=body.credential_type_id,
        mandatory=body.mandatory,
        scope=body.scope,
        defined_by=body.defined_by,
        set_by=current_user.id,
        effective_date=body.effective_date or date.today(),
        notes=body.notes,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/compliance-matrix/{entry_id}", status_code=204)
async def delete_compliance_entry(
    entry_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a compliance matrix entry."""
    result = await db.execute(
        select(ComplianceMatrixEntry).where(
            ComplianceMatrixEntry.id == entry_id,
            ComplianceMatrixEntry.entity_id == entity_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Compliance entry not found")
    # Junction record — physical delete (not policy-managed)
    await db.delete(entry)
    await db.commit()
    return None


@router.get(
    "/profiles/{profile_id}/compliance/{asset_id}",
    response_model=ComplianceCheckResult,
)
async def check_compliance(
    profile_id: UUID,
    asset_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """Check a PAX's compliance against a specific asset's requirements."""
    await _resolve_pax_identity(
        db,
        profile_id,
        pax_source,
        entity_id=entity_id,
        current_user=current_user,
    )

    compliance = await paxlog_service.check_pax_compliance(
        db,
        asset_id=asset_id,
        entity_id=entity_id,
        user_id=profile_id if pax_source == "user" else None,
        contact_id=profile_id if pax_source == "contact" else None,
    )

    results = compliance.get("results", [])
    missing = [item["credential_type_name"] for item in results if item.get("status") == "missing"]
    expired = [item["credential_type_name"] for item in results if item.get("status") == "expired"]
    pending = [
        item["credential_type_name"]
        for item in results
        if item.get("status") in {"pending", "pending_validation"}
    ]

    return ComplianceCheckResult(
        user_id=profile_id if pax_source == "user" else None,
        contact_id=profile_id if pax_source == "contact" else None,
        asset_id=asset_id,
        compliant=bool(compliance.get("compliant", False)),
        missing_credentials=missing,
        expired_credentials=expired,
        pending_credentials=pending,
        results=results,
        covered_layers=compliance.get("covered_layers", []),
        summary_by_status=compliance.get("summary_by_status", {}),
    )


# ═══════════════════════════════════════════════════════════════════════════════
# AVIS DE SÉJOUR (AdS)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads", response_model=PaginatedResponse[AdsSummary])
async def list_ads(
    request: Request = None,
    status_filter: str | None = None,
    visit_category: str | None = None,
    site_asset_id: UUID | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Séjour for the current entity.

    Scope parameter controls data visibility:
      - scope=my  → only ADS where requester_id or created_by == current user
      - scope=all → all ADS in the entity (requires paxlog.ads.read_all)
      - omitted   → auto-detected: if user has read_all → all, else → my
    """
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    query = (
        select(Ads)
        .where(Ads.entity_id == entity_id, Ads.archived == False)
    )

    # ── User-scoped data visibility ──
    if scope == "my":
        query = query.where(or_(Ads.requester_id == acting_user_id, Ads.created_by == acting_user_id))
    elif scope == "all":
        # Explicit "all" requires read_all permission
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.ads.read_all", db
        )
        if not can_read_all:
            query = query.where(or_(Ads.requester_id == acting_user_id, Ads.created_by == acting_user_id))
    else:
        # Auto-detect: default to own data unless user has read_all
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.ads.read_all", db
        )
        if not can_read_all:
            query = query.where(or_(Ads.requester_id == acting_user_id, Ads.created_by == acting_user_id))

    if status_filter:
        query = query.where(Ads.status == status_filter)
    if visit_category:
        query = query.where(Ads.visit_category == visit_category)
    if site_asset_id:
        query = query.where(Ads.site_entry_asset_id == site_asset_id)
    query = query.order_by(Ads.created_at.desc())

    # ── Enriched pagination with pax_display_name + imputation_label ──
    async def _enrich_ads(row):
        ads_obj = row[0]
        ads_dict = {c.key: getattr(ads_obj, c.key) for c in ads_obj.__table__.columns}

        # --- pax_display_name ---
        pax_result = await db.execute(
            text("""
                SELECT
                    COALESCE(u.last_name || ' ' || u.first_name, tc.last_name || ' ' || tc.first_name) AS pax_name,
                    (SELECT COUNT(*) FROM ads_pax WHERE ads_id = :ads_id) AS total_pax
                FROM ads_pax ap
                LEFT JOIN users u ON u.id = ap.user_id
                LEFT JOIN tier_contacts tc ON tc.id = ap.contact_id
                WHERE ap.ads_id = :ads_id
                ORDER BY ap.created_at ASC
                LIMIT 1
            """),
            {"ads_id": ads_obj.id},
        )
        pax_row = pax_result.first()
        if pax_row:
            name = pax_row[0] or ""
            total = int(pax_row[1] or 0)
            if ads_obj.type == "team" and total > 1:
                ads_dict["pax_display_name"] = f"{name} (+{total - 1})"
            else:
                ads_dict["pax_display_name"] = name or None
        else:
            ads_dict["pax_display_name"] = None

        # --- imputation_label ---
        imp_result = await db.execute(
            text("""
                SELECT
                    COALESCE(p.name, ir.code || ' — ' || ir.name, cc.name) AS label
                FROM cost_imputations ci
                LEFT JOIN projects p ON p.id = ci.project_id
                LEFT JOIN imputation_references ir ON ir.id = ci.imputation_reference_id
                LEFT JOIN cost_centers cc ON cc.id = ci.cost_center_id
                WHERE ci.owner_type = 'ads' AND ci.owner_id = :ads_id
                ORDER BY ci.percentage DESC
                LIMIT 1
            """),
            {"ads_id": ads_obj.id},
        )
        imp_row = imp_result.scalar()
        ads_dict["imputation_label"] = imp_row or None

        return ads_dict

    return await paginate(db, query, pagination, transform=_enrich_ads)


@router.get("/ads-validation-queue", response_model=PaginatedResponse[AdsValidationQueueItemRead])
async def list_ads_validation_queue(
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Validator-oriented AdS queue with capacity and POB context."""
    statuses = (
        "submitted",
        "pending_project_review",
        "pending_compliance",
        "pending_validation",
        "requires_review",
    )
    total_result = await db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM ads a
            WHERE a.entity_id = :entity_id
              AND a.archived = FALSE
              AND a.status IN :statuses
            """
        ).bindparams(bindparam("statuses", expanding=True)),
        {"entity_id": entity_id, "statuses": statuses},
    )
    total = int(total_result.scalar() or 0)

    rows = (
        await db.execute(
            text(
                """
                SELECT
                    a.id,
                    a.reference,
                    a.status,
                    a.requester_id,
                    CONCAT_WS(' ', requester.first_name, requester.last_name) AS requester_name,
                    a.site_entry_asset_id,
                    site.name AS site_name,
                    a.visit_category,
                    a.start_date,
                    a.end_date,
                    COUNT(ap.id) FILTER (WHERE ap.id IS NOT NULL) AS pax_count,
                    COUNT(ap.id) FILTER (WHERE ap.status = 'blocked') AS blocked_pax_count,
                    COUNT(DISTINCT ci.project_id) FILTER (WHERE ci.project_id IS NOT NULL) AS linked_project_count,
                    ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), NULL) AS linked_project_names,
                    COUNT(DISTINCT sp.id) FILTER (WHERE sp.id IS NOT NULL) AS stay_program_count,
                    a.planner_activity_id,
                    pa.title AS planner_activity_title,
                    a.created_at
                FROM ads a
                LEFT JOIN users requester ON requester.id = a.requester_id
                LEFT JOIN ar_installations site ON site.id = a.site_entry_asset_id
                LEFT JOIN planner_activities pa ON pa.id = a.planner_activity_id
                LEFT JOIN ads_pax ap ON ap.ads_id = a.id
                LEFT JOIN cost_imputations ci ON ci.owner_type = 'ads' AND ci.owner_id = a.id
                LEFT JOIN projects p ON p.id = ci.project_id
                LEFT JOIN stay_programs sp ON sp.ads_id = a.id
                WHERE a.entity_id = :entity_id
                  AND a.archived = FALSE
                  AND a.status IN :statuses
                GROUP BY
                    a.id, a.reference, a.status, a.requester_id, requester.first_name, requester.last_name,
                    a.site_entry_asset_id, site.name, a.visit_category, a.start_date, a.end_date,
                    a.planner_activity_id, pa.title, a.created_at
                ORDER BY a.submitted_at ASC NULLS LAST, a.created_at ASC
                LIMIT :limit OFFSET :offset
                """
            ).bindparams(bindparam("statuses", expanding=True)),
            {
                "entity_id": entity_id,
                "statuses": statuses,
                "limit": pagination.page_size,
                "offset": (pagination.page - 1) * pagination.page_size,
            },
        )
    ).all()

    items = []
    for row in rows:
        ads_stub = Ads(
            id=row[0],
            entity_id=entity_id,
            reference=row[1],
            status=row[2],
            requester_id=row[3],
            site_entry_asset_id=row[5],
            visit_category=row[7],
            start_date=row[8],
            end_date=row[9],
            planner_activity_id=row[15],
            created_by=row[3],
            type="team",
            visit_purpose="",
            created_at=row[17],
            updated_at=row[17],
        )
        context = await _get_ads_validation_context(db, entity_id=entity_id, ads=ads_stub)
        daily_preview = await _build_ads_validation_daily_preview(db, entity_id=entity_id, ads=ads_stub)
        items.append(
            {
                "id": str(row[0]),
                "reference": row[1],
                "status": row[2],
                "requester_id": str(row[3]),
                "requester_name": row[4],
                "site_entry_asset_id": str(row[5]),
                "site_name": row[6],
                "visit_category": row[7],
                "start_date": row[8],
                "end_date": row[9],
                "pax_count": int(row[10] or 0),
                "blocked_pax_count": int(row[11] or 0),
                "linked_project_count": int(row[12] or 0),
                "linked_project_names": list(row[13] or []),
                "stay_program_count": int(row[14] or 0),
                "planner_activity_id": str(row[15]) if row[15] else None,
                "planner_activity_title": row[16],
                "capacity_scope": context["capacity_scope"],
                "capacity_limit": context["capacity_limit"],
                "reserved_pax_count": context["reserved_pax_count"],
                "remaining_capacity": context["remaining_capacity"],
                "forecast_pax": context["forecast_pax"],
                "real_pob": context["real_pob"],
                "daily_capacity_preview": daily_preview,
                "created_at": row[17],
            }
        )

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.get("/ads-waitlist")
async def list_ads_waitlist(
    search: str | None = None,
    planner_activity_id: UUID | None = None,
    site_asset_id: UUID | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """List waitlisted PAX entries pending manual arbitration."""
    filters = [
        "a.entity_id = :entity_id",
        "a.status = 'pending_arbitration'",
        "ap.status = 'waitlisted'",
    ]
    params: dict[str, object] = {
        "entity_id": str(entity_id),
        "limit": pagination.page_size,
        "offset": (pagination.page - 1) * pagination.page_size,
    }
    if planner_activity_id:
        filters.append("a.planner_activity_id = :planner_activity_id")
        params["planner_activity_id"] = str(planner_activity_id)
    if site_asset_id:
        filters.append("a.site_entry_asset_id = :site_asset_id")
        params["site_asset_id"] = str(site_asset_id)
    if search:
        filters.append(
            "("
            "a.reference ILIKE :search OR "
            "pa.title ILIKE :search OR "
            "COALESCE(u.first_name, tc.first_name, '') ILIKE :search OR "
            "COALESCE(u.last_name, tc.last_name, '') ILIKE :search OR "
            "COALESCE(tier.name, '') ILIKE :search"
            ")"
        )
        params["search"] = f"%{search}%"

    where_clause = " AND ".join(filters)
    count_result = await db.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM ads_pax ap
            JOIN ads a ON a.id = ap.ads_id
            LEFT JOIN users u ON u.id = ap.user_id
            LEFT JOIN tier_contacts tc ON tc.id = ap.contact_id
            LEFT JOIN tiers tier ON tier.id = tc.tier_id
            LEFT JOIN planner_activities pa ON pa.id = a.planner_activity_id
            WHERE {where_clause}
            """
        ),
        params,
    )
    total = int(count_result.scalar() or 0)

    rows = (
        await db.execute(
            text(
                f"""
                SELECT
                    a.id,
                    a.reference,
                    a.status,
                    ap.id,
                    a.planner_activity_id,
                    pa.title,
                    a.site_entry_asset_id,
                    asset.name,
                    a.requester_id,
                    CONCAT_WS(' ', requester.first_name, requester.last_name) AS requester_name,
                    ap.user_id,
                    ap.contact_id,
                    COALESCE(u.first_name, tc.first_name, '') AS pax_first_name,
                    COALESCE(u.last_name, tc.last_name, '') AS pax_last_name,
                    tier.name AS pax_company_name,
                    ap.priority_score,
                    ap.priority_source,
                    a.start_date,
                    a.end_date,
                    a.submitted_at,
                    ap.updated_at
                FROM ads_pax ap
                JOIN ads a ON a.id = ap.ads_id
                LEFT JOIN users u ON u.id = ap.user_id
                LEFT JOIN tier_contacts tc ON tc.id = ap.contact_id
                LEFT JOIN tiers tier ON tier.id = tc.tier_id
                LEFT JOIN planner_activities pa ON pa.id = a.planner_activity_id
                LEFT JOIN ar_installations asset ON asset.id = a.site_entry_asset_id
                LEFT JOIN users requester ON requester.id = a.requester_id
                WHERE {where_clause}
                ORDER BY
                  CASE WHEN ap.priority_source = 'manual_override' THEN 0 ELSE 1 END ASC,
                  ap.priority_score DESC,
                  COALESCE(a.submitted_at, a.created_at) ASC,
                  ap.updated_at ASC
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        )
    ).all()

    items = []
    for row in rows:
        capacity_summary = await _get_ads_waitlist_capacity_summary(
            db,
            entity_id=entity_id,
            planner_activity_id=row[4],
            site_entry_asset_id=row[6],
            start_date=row[17] if not row[4] else None,
            end_date=row[18] if not row[4] else None,
        )
        items.append(
            {
                "ads_id": str(row[0]),
                "ads_reference": row[1],
                "ads_status": row[2],
                "ads_pax_id": str(row[3]),
                "planner_activity_id": str(row[4]) if row[4] else None,
                "planner_activity_title": row[5],
                "site_entry_asset_id": str(row[6]) if row[6] else None,
                "site_name": row[7],
                "requester_id": str(row[8]) if row[8] else None,
                "requester_name": row[9],
                "user_id": str(row[10]) if row[10] else None,
                "contact_id": str(row[11]) if row[11] else None,
                "pax_first_name": row[12] or "",
                "pax_last_name": row[13] or "",
                "pax_company_name": row[14],
                "priority_score": int(row[15] or 0),
                "priority_source": row[16],
                "capacity_scope": capacity_summary["capacity_scope"],
                "capacity_limit": capacity_summary["capacity_limit"],
                "reserved_pax_count": capacity_summary["reserved_pax_count"],
                "remaining_capacity": capacity_summary["remaining_capacity"],
                "submitted_at": row[19],
                "waitlisted_at": row[20],
            }
        )
    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.post("/ads-waitlist/{entry_id}/priority")
async def update_ads_waitlist_priority(
    entry_id: UUID,
    body: AdsWaitlistPriorityUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Override the priority score of a waitlisted PAX entry."""
    result = await db.execute(
        select(AdsPax, Ads)
        .join(Ads, Ads.id == AdsPax.ads_id)
        .where(
            AdsPax.id == entry_id,
            Ads.entity_id == entity_id,
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Entrée de liste d'attente introuvable.")

    entry, ads = row
    if ads.status != "pending_arbitration" or entry.status != "waitlisted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les PAX actuellement en liste d'attente peuvent etre repriorises.",
        )

    old_priority_score = int(entry.priority_score or 0)
    old_priority_source = entry.priority_source
    entry.priority_score = body.priority_score
    entry.priority_source = "manual_override"

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        ads_pax_id=entry.id,
        event_type="pax_waitlist_priority_updated",
        old_status=entry.status,
        new_status=entry.status,
        actor_id=current_user.id,
        reason=body.reason,
        metadata_json={
            "old_priority_score": old_priority_score,
            "new_priority_score": body.priority_score,
            "old_priority_source": old_priority_source,
            "new_priority_source": "manual_override",
        },
    ))

    await record_audit(
        db,
        entity_id=entity_id,
        actor_id=current_user.id,
        action="paxlog.ads.waitlist_priority_update",
        module="paxlog",
        target_type="ads_pax",
        target_id=str(entry.id),
        details={
            "ads_id": str(ads.id),
            "old_priority_score": old_priority_score,
            "new_priority_score": body.priority_score,
            "old_priority_source": old_priority_source,
            "new_priority_source": "manual_override",
            "reason": body.reason,
        },
    )

    await db.commit()
    return {
        "ads_pax_id": str(entry.id),
        "ads_id": str(ads.id),
        "priority_score": int(entry.priority_score or 0),
        "priority_source": entry.priority_source,
    }


@router.post("/ads", response_model=AdsRead, status_code=201)
async def create_ads(
    body: AdsCreate,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create an Avis de Séjour (draft)."""
    reference = await generate_reference("ADS", db, entity_id=entity_id)
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    requester_id = body.requester_id or acting_user_id
    requester = await db.get(User, requester_id)
    if not requester or not requester.active:
        raise HTTPException(status_code=400, detail="Demandeur invalide pour cette entité.")

    ads = Ads(
        entity_id=entity_id,
        reference=reference,
        type=body.type,
        status="draft",
        created_by=current_user.id,
        requester_id=requester_id,
        site_entry_asset_id=body.site_entry_asset_id,
        visit_purpose=body.visit_purpose,
        visit_category=body.visit_category,
        start_date=body.start_date,
        end_date=body.end_date,
        planner_activity_id=body.planner_activity_id,
        project_id=body.project_id,
        outbound_transport_mode=body.outbound_transport_mode,
        outbound_departure_base_id=body.outbound_departure_base_id,
        outbound_notes=body.outbound_notes,
        return_transport_mode=body.return_transport_mode,
        return_departure_base_id=body.return_departure_base_id,
        return_notes=body.return_notes,
        is_round_trip_no_overnight=body.is_round_trip_no_overnight,
    )
    db.add(ads)
    await db.flush()
    await _replace_ads_allowed_companies(
        db,
        ads_id=ads.id,
        entity_id=entity_id,
        company_ids=body.allowed_company_ids,
    )

    # Add PAX entries (dual FK: user_id or contact_id)
    for entry in body.pax_entries:
        ads_pax = AdsPax(
            ads_id=ads.id,
            user_id=entry.user_id,
            contact_id=entry.contact_id,
            status="pending_check",
        )
        db.add(ads_pax)

    await _ensure_ads_default_imputation(
        db,
        ads=ads,
        entity_id=entity_id,
        author_id=current_user.id,
    )

    await db.commit()
    await db.refresh(ads)

    await record_audit(
        db,
        action="paxlog.ads.create",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": reference,
            "type": body.type,
            "site_asset_id": str(body.site_entry_asset_id),
            "dates": f"{body.start_date} → {body.end_date}",
            "pax_count": len(body.pax_entries),
        },
    )
    await db.commit()

    logger.info("AdS %s created by %s", reference, current_user.id)
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.get("/ads/{ads_id}", response_model=AdsRead)
async def get_ads(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Get an AdS by ID."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, entity_id=entity_id, db=db)
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.patch("/ads/{ads_id}", response_model=AdsRead)
async def update_ads(
    ads_id: UUID,
    body: AdsUpdate,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AdS while it is still editable by the requester."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
    if ads.requester_id != acting_user_id and not can_approve:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier cette AdS.")
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Seuls les brouillons ou dossiers en correction peuvent être modifiés.",
        )

    update_data = body.model_dump(exclude_unset=True)
    final_start = update_data.get("start_date", ads.start_date)
    final_end = update_data.get("end_date", ads.end_date)
    if final_start and final_end and final_end < final_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date de fin doit être postérieure ou égale à la date de début.",
        )

    previous_start = ads.start_date
    previous_end = ads.end_date
    changed_fields: dict[str, dict[str, object | None]] = {}
    allowed_company_ids_payload = update_data.pop("allowed_company_ids", None)
    for field_name, value in update_data.items():
        previous = getattr(ads, field_name)
        if previous != value:
            changed_fields[field_name] = {"from": _json_safe(previous), "to": _json_safe(value)}
        setattr(ads, field_name, value)

    if allowed_company_ids_payload is not None:
        previous_allowed_company_ids, previous_allowed_company_names = await _get_ads_allowed_company_scope(
            db,
            ads_id=ads.id,
        )
        new_allowed_company_ids, new_allowed_company_names = await _replace_ads_allowed_companies(
            db,
            ads_id=ads.id,
            entity_id=entity_id,
            company_ids=allowed_company_ids_payload,
        )
        if previous_allowed_company_ids != new_allowed_company_ids:
            changed_fields["allowed_company_ids"] = {
                "from": [str(company_id) for company_id in previous_allowed_company_ids],
                "to": [str(company_id) for company_id in new_allowed_company_ids],
            }
            changed_fields["allowed_company_names"] = {
                "from": previous_allowed_company_names,
                "to": new_allowed_company_names,
            }

    if changed_fields:
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="updated",
            old_status=ads.status,
            new_status=ads.status,
            actor_id=current_user.id,
            metadata_json={"changes": changed_fields},
        ))

    if "project_id" in update_data and ads.project_id:
        await _ensure_ads_default_imputation(
            db,
            ads=ads,
            entity_id=entity_id,
            author_id=current_user.id,
        )

    await db.commit()
    await db.refresh(ads)
    return ads


@router.post("/ads/{ads_id}/request-stay-change", response_model=AdsRead)
async def request_ads_stay_change(
    ads_id: UUID,
    body: AdsStayChangeRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Request a controlled change on an AdS already engaged in workflow/execution.

    The change is applied on the dossier and the AdS is sent back to
    `requires_review` with a full change snapshot for validators.
    """
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    allowed_statuses = {"submitted", "pending_compliance", "pending_validation", "approved", "in_progress"}
    if ads.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de demander une modification de séjour pour un AdS avec le statut '{ads.status}'.",
        )

    can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
    if ads.requester_id != current_user.id and not can_approve:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seul le demandeur ou un valideur peut demander une modification de séjour.",
        )

    update_data = body.model_dump(exclude={"reason"}, exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucune modification de séjour fournie.",
        )

    final_start = update_data.get("start_date", ads.start_date)
    final_end = update_data.get("end_date", ads.end_date)
    if final_end < final_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La date de fin doit être postérieure ou égale à la date de début.",
        )

    previous_start = ads.start_date
    previous_end = ads.end_date
    changed_fields: dict[str, dict[str, object | None]] = {}
    for field_name, value in update_data.items():
        previous = getattr(ads, field_name)
        if previous != value:
            changed_fields[field_name] = {"from": _json_safe(previous), "to": _json_safe(value)}
            setattr(ads, field_name, value)

    if not changed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La demande ne contient aucun changement effectif.",
        )
    change_kinds, primary_change_kind = _classify_ads_stay_change(
        previous_start=previous_start,
        previous_end=previous_end,
        final_start=final_start,
        final_end=final_end,
        changed_fields=changed_fields,
    )

    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="requires_review",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        comment=body.reason,
    )

    ads.status = "requires_review"
    ads.rejection_reason = body.reason

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="stay_change_requested",
        old_status=from_state,
        new_status="requires_review",
        actor_id=current_user.id,
        reason=body.reason,
        metadata_json={
            "changes": changed_fields,
            "change_kinds": change_kinds,
            "primary_change_kind": primary_change_kind,
        },
    ))

    await db.commit()
    await db.refresh(ads)

    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="requires_review",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={
            "reason": body.reason,
            "changes": changed_fields,
            "change_kinds": change_kinds,
            "primary_change_kind": primary_change_kind,
        },
    )

    await record_audit(
        db,
        action="paxlog.ads.request_stay_change",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": ads.reference,
            "from_status": from_state,
            "to_status": "requires_review",
            "reason": body.reason,
            "changes": changed_fields,
            "change_kinds": change_kinds,
            "primary_change_kind": primary_change_kind,
        },
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.stay_change_requested",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "actor_id": str(current_user.id),
            "reason": body.reason,
            "changes": changed_fields,
            "change_kinds": change_kinds,
            "primary_change_kind": primary_change_kind,
        },
    ))

    logger.info("AdS %s stay change requested by %s", ads.reference, current_user.id)
    return ads


@router.post("/ads/{ads_id}/submit", response_model=AdsRead)
async def submit_ads(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Submit an AdS for validation.

    Runs automatic compliance check against site's compliance matrix.
    - If any PAX has missing/expired mandatory credentials → pending_compliance
    - If all PAX are compliant → pending_validation (ready for CDS review)
    """
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if not await _can_manage_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez pas soumettre cette AdS.",
        )

    if ads.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de soumettre un AdS avec le statut '{ads.status}'.",
        )

    pending_project_review_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
    project_reviewer = await _get_ads_project_reviewer(db, ads=ads, entity_id=entity_id)
    workflow_runtime_context = _build_ads_workflow_runtime_context(
        ads=ads,
        entity_id=entity_id,
        project_reviewer=project_reviewer,
    )
    next_review_state = await _resolve_ads_auto_transition(
        db,
        entity_id=entity_id,
        from_state=ads.status,
        ads=ads,
        project_reviewer=project_reviewer,
    )

    if next_review_state == "pending_initiator_review" and current_user.id != ads.requester_id:
        from_state = ads.status
        transition_result = await _try_ads_workflow_transition(
            db,
            entity_id_str=str(ads.id),
            to_state=next_review_state,
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            runtime_context=workflow_runtime_context,
        )
        workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None
        ads.status = next_review_state
        ads.submitted_at = func.now()
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="submitted_for_initiator_review",
            old_status=from_state,
            new_status=next_review_state,
            actor_id=current_user.id,
            metadata_json={
                "requester_id": str(ads.requester_id),
                "created_by": str(ads.created_by),
            },
        ))
        await db.commit()
        await db.refresh(ads)
        await fsm_service.emit_transition_event(
            entity_type=ADS_ENTITY_TYPE,
            entity_id=str(ads.id),
            from_state=from_state,
            to_state=next_review_state,
            actor_id=current_user.id,
            workflow_slug=ADS_WORKFLOW_SLUG,
            extra_payload={
                "reference": ads.reference,
                "requester_id": str(ads.requester_id),
                "created_by": str(ads.created_by),
                "entity_scope_id": str(entity_id),
                "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
                "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
            },
        )
        await record_audit(
            db,
            action="paxlog.ads.submit",
            resource_type="ads",
            resource_id=str(ads.id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "reference": ads.reference,
                "initiator_review_required": True,
                "requester_id": str(ads.requester_id),
                "created_by": str(ads.created_by),
            },
        )
        await db.commit()
        return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

    pending_reviewer_ids = {
        target["project_manager_id"]
        for target in pending_project_review_targets
        if target.get("project_manager_id")
    }
    if next_review_state == "pending_project_review" and pending_reviewer_ids - {current_user.id}:
        from_state = ads.status
        transition_result = await _try_ads_workflow_transition(
            db,
            entity_id_str=str(ads.id),
            to_state=next_review_state,
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            runtime_context=workflow_runtime_context,
        )
        workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None
        ads.status = next_review_state
        ads.submitted_at = func.now()
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="submitted_for_project_review",
            old_status=from_state,
            new_status=next_review_state,
            actor_id=current_user.id,
            metadata_json={
                "project_id": str(project_reviewer.id) if project_reviewer else None,
                "project_manager_id": str(project_reviewer.manager_id) if project_reviewer and project_reviewer.manager_id else None,
                "pending_project_ids": [str(target["project_id"]) for target in pending_project_review_targets],
                "pending_project_manager_ids": [str(target["project_manager_id"]) for target in pending_project_review_targets if target.get("project_manager_id")],
            },
        ))
        await db.commit()
        await db.refresh(ads)
        await fsm_service.emit_transition_event(
            entity_type=ADS_ENTITY_TYPE,
            entity_id=str(ads.id),
            from_state=from_state,
            to_state=next_review_state,
            actor_id=current_user.id,
            workflow_slug=ADS_WORKFLOW_SLUG,
            extra_payload={
                "reference": ads.reference,
                "project_id": str(project_reviewer.id) if project_reviewer else None,
                "next_approver_id": str(project_reviewer.manager_id) if project_reviewer and project_reviewer.manager_id else None,
                "pending_project_ids": [str(target["project_id"]) for target in pending_project_review_targets],
                "pending_project_manager_ids": [str(target["project_manager_id"]) for target in pending_project_review_targets if target.get("project_manager_id")],
                "entity_scope_id": str(entity_id),
                "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
                "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
            },
        )
        await record_audit(
            db,
            action="paxlog.ads.submit",
            resource_type="ads",
            resource_id=str(ads.id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "reference": ads.reference,
                "project_review_required": True,
                "project_id": str(project_reviewer.id) if project_reviewer else None,
                "project_manager_id": str(project_reviewer.manager_id) if project_reviewer and project_reviewer.manager_id else None,
                "pending_project_count": len(pending_project_review_targets),
            },
        )
        await db.commit()
        return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

    pax_entries, has_compliance_issues, target_status = await _run_ads_submission_checks(
        db,
        ads=ads,
        entity_id=entity_id,
    )
    waitlist_meta = {
        "waitlist_applied": False,
        "waitlisted_count": 0,
        "activity_quota": None,
        "reserved_pax_count": 0,
        "remaining_capacity": None,
    }
    if not has_compliance_issues:
        waitlist_meta = await _apply_ads_planner_waitlist_if_needed(
            db,
            ads=ads,
            pax_entries=pax_entries,
            entity_id=entity_id,
        )
        if not waitlist_meta["waitlist_applied"]:
            waitlist_meta = await _apply_ads_site_waitlist_if_needed(
                db,
                ads=ads,
                pax_entries=pax_entries,
                entity_id=entity_id,
            )
        if waitlist_meta["waitlist_applied"]:
            target_status = "pending_arbitration"
            ads.rejection_reason = (
                "Capacité Planner atteinte. Les PAX de cette AdS sont placés en liste d'attente."
                if ads.planner_activity_id
                else "Capacité site atteinte. Les PAX de cette AdS sont placés en liste d'attente."
            )

    # FSM transition: draft → pending_compliance or pending_validation
    from_state = ads.status
    transition_result = await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state=target_status,
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        runtime_context=workflow_runtime_context,
    )
    workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None

    ads.status = target_status
    ads.submitted_at = func.now()

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="submitted",
        old_status=from_state,
        new_status=target_status,
        actor_id=current_user.id,
        metadata_json={
            "waitlist_applied": waitlist_meta["waitlist_applied"],
            "waitlisted_pax_count": waitlist_meta["waitlisted_count"],
            "activity_quota": waitlist_meta["activity_quota"],
            "reserved_pax_count": waitlist_meta["reserved_pax_count"],
            "remaining_capacity": waitlist_meta["remaining_capacity"],
        },
    ))

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state=target_status,
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={
            "reference": ads.reference,
            "compliance_issues": has_compliance_issues,
            "waitlist_applied": waitlist_meta["waitlist_applied"],
            "waitlisted_pax_count": waitlist_meta["waitlisted_count"],
            "entity_scope_id": str(entity_id),
            "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
            "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
        },
    )

    await record_audit(
        db,
        action="paxlog.ads.submit",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": ads.reference,
            "pax_count": len(pax_entries),
            "compliance_issues": has_compliance_issues,
            "waitlist_applied": waitlist_meta["waitlist_applied"],
            "waitlisted_pax_count": waitlist_meta["waitlisted_count"],
        },
    )
    await db.commit()

    # Emit module-level events AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus

    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.submitted",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "site_name": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "pax_count": len(pax_entries),
            "waitlist_applied": waitlist_meta["waitlist_applied"],
            "waitlisted_pax_count": waitlist_meta["waitlisted_count"],
        },
    ))

    if waitlist_meta["waitlist_applied"] and ads.requester_id:
        from app.core.notifications import send_in_app

        await send_in_app(
            db,
            user_id=ads.requester_id,
            entity_id=entity_id,
            title="AdS en liste d'attente",
            body=(
                f"L'AdS {ads.reference} dépasse la capacité validée de l'activité liée. "
                "Les passagers ont été placés en liste d'attente."
            ),
            category="paxlog",
            link=f"/paxlog/ads/{ads.id}",
        )
        await _event_bus.publish(OpsFluxEvent(
            event_type="ads.waitlisted",
            payload={
                "ads_id": str(ads.id),
                "entity_id": str(entity_id),
                "reference": ads.reference,
                "requester_id": str(ads.requester_id),
                "planner_activity_id": str(ads.planner_activity_id) if ads.planner_activity_id else None,
                "waitlisted_pax_count": waitlist_meta["waitlisted_count"],
                "activity_quota": waitlist_meta["activity_quota"],
                "remaining_capacity": waitlist_meta["remaining_capacity"],
            },
        ))

    if has_compliance_issues:
        # Count blocked PAX
        blocked_count = sum(
            1 for p in pax_entries
            if p.status == "blocked"
        )
        await _event_bus.publish(OpsFluxEvent(
            event_type="ads.compliance_failed",
            payload={
                "ads_id": str(ads.id),
                "entity_id": str(entity_id),
                "reference": ads.reference,
                "requester_id": str(ads.requester_id),
                "blocked_pax_count": blocked_count,
                "total_pax_count": len(pax_entries),
                "issues_summary": ads.rejection_reason or "",
            },
        ))

    logger.info(
        "AdS %s submitted by %s (compliance: %s)",
        ads.reference, current_user.id,
        "issues" if has_compliance_issues else "ok",
    )
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.post("/ads/{ads_id}/approve", response_model=AdsRead)
async def approve_ads(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Approve an AdS (pending_validation → approved).

    Emits ads.approved event which triggers TravelWiz auto-manifest.
    """
    from app.services.modules.paxlog_service import ads_requires_travelwiz_transport

    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status == "pending_initiator_review":
        await _assert_ads_initiator_review_access(
            ads,
            current_user=current_user,
            request=request,
            entity_id=entity_id,
            db=db,
        )

        pending_project_review_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
        project_reviewer = await _get_ads_project_reviewer(db, ads=ads, entity_id=entity_id)
        workflow_runtime_context = _build_ads_workflow_runtime_context(
            ads=ads,
            entity_id=entity_id,
            project_reviewer=project_reviewer,
        )
        target_status = await _resolve_ads_auto_transition(
            db,
            entity_id=entity_id,
            from_state=ads.status,
            ads=ads,
            project_reviewer=project_reviewer,
        )
        pending_reviewer_ids = {
            target["project_manager_id"]
            for target in pending_project_review_targets
            if target.get("project_manager_id")
        }
        if target_status == "pending_project_review" and pending_reviewer_ids - {current_user.id}:
            has_compliance_issues = False
            pax_entries = []
        else:
            pax_entries, has_compliance_issues, target_status = await _run_ads_submission_checks(
                db,
                ads=ads,
                entity_id=entity_id,
            )

        from_state = ads.status
        transition_result = await _try_ads_workflow_transition(
            db,
            entity_id_str=str(ads.id),
            to_state=target_status,
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            runtime_context=workflow_runtime_context,
        )
        workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None
        ads.status = target_status
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="initiator_review_approved",
            old_status=from_state,
            new_status=target_status,
            actor_id=current_user.id,
            metadata_json={
                "requester_id": str(ads.requester_id),
                "created_by": str(ads.created_by),
            },
        ))
        await db.commit()
        await db.refresh(ads)
        await fsm_service.emit_transition_event(
            entity_type=ADS_ENTITY_TYPE,
            entity_id=str(ads.id),
            from_state=from_state,
            to_state=target_status,
            actor_id=current_user.id,
            workflow_slug=ADS_WORKFLOW_SLUG,
            extra_payload={
                "reference": ads.reference,
                "requester_id": str(ads.requester_id),
                "entity_scope_id": str(entity_id),
                "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
                "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
            },
        )
        await record_audit(
            db,
            action="paxlog.ads.initiator_approve",
            resource_type="ads",
            resource_id=str(ads.id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "reference": ads.reference,
                "target_status": target_status,
                "compliance_issues": has_compliance_issues,
                "pax_count": len(pax_entries),
            },
        )
        await db.commit()
        return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

    if ads.status == "pending_project_review":
        project_reviewer = await _assert_ads_project_review_access(
            ads,
            current_user=current_user,
            request=request,
            entity_id=entity_id,
            db=db,
        )
        pending_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
        can_update_project = await has_user_permission(current_user, entity_id, "project.update", db)
        can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
        if can_update_project or can_approve:
            approved_targets = pending_targets
        else:
            approved_targets = [
                target for target in pending_targets
                if target.get("project_manager_id") == current_user.id
            ]
        remaining_targets = [
            target for target in pending_targets
            if target["project_id"] not in {item["project_id"] for item in approved_targets}
        ]

        workflow_runtime_context = _build_ads_workflow_runtime_context(
            ads=ads,
            entity_id=entity_id,
            project_reviewer=project_reviewer,
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="project_review_approved",
            old_status=ads.status,
            new_status=ads.status if remaining_targets else "pending_compliance",
            actor_id=current_user.id,
            metadata_json={
                "project_id": str(project_reviewer.id) if project_reviewer else None,
                "project_ids": [str(item["project_id"]) for item in approved_targets],
                "remaining_project_ids": [str(item["project_id"]) for item in remaining_targets],
            },
        ))
        if remaining_targets:
            await db.commit()
            await db.refresh(ads)
            await record_audit(
                db,
                action="paxlog.ads.project_approve",
                resource_type="ads",
                resource_id=str(ads.id),
                user_id=current_user.id,
                entity_id=entity_id,
                details={
                    "reference": ads.reference,
                    "approved_project_ids": [str(item["project_id"]) for item in approved_targets],
                    "remaining_project_ids": [str(item["project_id"]) for item in remaining_targets],
                    "pending_project_count": len(remaining_targets),
                    "partial_project_review": True,
                },
            )
            await db.commit()
            return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

        target_status = await _resolve_ads_auto_transition(
            db,
            entity_id=entity_id,
            from_state=ads.status,
            ads=ads,
            project_reviewer=project_reviewer,
        ) or "pending_compliance"
        pax_entries, has_compliance_issues, target_status = await _run_ads_submission_checks(
            db,
            ads=ads,
            entity_id=entity_id,
        )
        from_state = ads.status
        transition_result = await _try_ads_workflow_transition(
            db,
            entity_id_str=str(ads.id),
            to_state=target_status,
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            runtime_context=workflow_runtime_context,
        )
        workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None
        ads.status = target_status
        await db.commit()
        await db.refresh(ads)
        await fsm_service.emit_transition_event(
            entity_type=ADS_ENTITY_TYPE,
            entity_id=str(ads.id),
            from_state=from_state,
            to_state=target_status,
            actor_id=current_user.id,
            workflow_slug=ADS_WORKFLOW_SLUG,
            extra_payload={
                "reference": ads.reference,
                "project_id": str(project_reviewer.id),
                "entity_scope_id": str(entity_id),
                "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
                "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
            },
        )
        await record_audit(
            db,
            action="paxlog.ads.project_approve",
            resource_type="ads",
            resource_id=str(ads.id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={
                "reference": ads.reference,
                "project_id": str(project_reviewer.id),
                "compliance_issues": has_compliance_issues,
                "pax_count": len(pax_entries),
            },
        )
        await db.commit()
        return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

    if ads.status == "pending_compliance":
        await _assert_ads_compliance_review_access(
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )

        blocked_entries = (
            await db.execute(
                select(AdsPax).where(
                    AdsPax.ads_id == ads_id,
                    AdsPax.status == "blocked",
                )
            )
        ).scalars().all()
        if blocked_entries:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un ou plusieurs PAX restent non conformes. Corrigez ou rejetez le dossier avant validation HSE.",
            )

        from_state = ads.status
        workflow_runtime_context = _build_ads_workflow_runtime_context(
            ads=ads,
            entity_id=entity_id,
        )
        transition_result = await _try_ads_workflow_transition(
            db,
            entity_id_str=str(ads.id),
            to_state="pending_validation",
            actor_id=current_user.id,
            entity_id_scope=entity_id,
            runtime_context=workflow_runtime_context,
        )
        workflow_instance = transition_result[1] if isinstance(transition_result, tuple) else None

        ads.status = "pending_validation"
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=ads.id,
            event_type="compliance_approved",
            old_status=from_state,
            new_status="pending_validation",
            actor_id=current_user.id,
        ))

        await db.commit()
        await db.refresh(ads)

        await fsm_service.emit_transition_event(
            entity_type=ADS_ENTITY_TYPE,
            entity_id=str(ads.id),
            from_state=from_state,
            to_state="pending_validation",
            actor_id=current_user.id,
            workflow_slug=ADS_WORKFLOW_SLUG,
            extra_payload={
                "reference": ads.reference,
                "entity_scope_id": str(entity_id),
                "assigned_to": workflow_instance.metadata_.get("assigned_to") if workflow_instance and workflow_instance.metadata_ else None,
                "assigned_role_code": workflow_instance.metadata_.get("assigned_role_code") if workflow_instance and workflow_instance.metadata_ else None,
            },
        )
        await record_audit(
            db,
            action="paxlog.ads.compliance_approve",
            resource_type="ads",
            resource_id=str(ads.id),
            user_id=current_user.id,
            entity_id=entity_id,
            details={"reference": ads.reference},
        )
        await db.commit()
        return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))

    if ads.status not in ("pending_validation", "submitted"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible d'approuver un AdS avec le statut '{ads.status}'.",
        )

    await _assert_ads_final_approval_access(
        current_user=current_user,
        entity_id=entity_id,
        db=db,
    )

    # Mark all compliant PAX as approved
    pax_result = await db.execute(
        select(AdsPax).where(
            AdsPax.ads_id == ads_id,
            AdsPax.status.in_(["compliant", "pending_check"]),
        )
    )
    pax_entries = pax_result.scalars().all()
    for entry in pax_entries:
        entry.status = "approved"

    # FSM transition: pending_validation → approved
    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="approved",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    ads.status = "approved"
    ads.approved_at = func.now()

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="approved",
        old_status=from_state,
        new_status="approved",
        actor_id=current_user.id,
    ))

    await db.commit()
    await db.refresh(ads)

    # FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="approved",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"reference": ads.reference},
    )

    await record_audit(
        db,
        action="paxlog.ads.approve",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference, "approved_pax": len(pax_entries)},
    )
    await db.commit()

    # Emit module-level event AFTER commit → triggers TravelWiz auto-manifest
    from app.core.events import OpsFluxEvent, event_bus
    await event_bus.publish(OpsFluxEvent(
        event_type="ads.approved",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "site_asset_id": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
            "outbound_transport_mode": ads.outbound_transport_mode,
            "return_transport_mode": ads.return_transport_mode,
            **_build_ads_transport_flags(ads),
            "outbound_departure_base_id": str(ads.outbound_departure_base_id) if ads.outbound_departure_base_id else None,
            "requester_id": str(ads.requester_id),
            "reference": ads.reference,
        },
    ))

    logger.info("AdS %s approved by %s", ads.reference, current_user.id)
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.post("/ads/{ads_id}/reject", response_model=AdsRead)
async def reject_ads(
    ads_id: UUID,
    request: Request = None,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Reject an AdS."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    if ads.status == "pending_initiator_review":
        await _assert_ads_initiator_review_access(
            ads,
            current_user=current_user,
            request=request,
            entity_id=entity_id,
            db=db,
        )
    elif ads.status == "pending_project_review":
        await _assert_ads_project_review_access(
            ads,
            current_user=current_user,
            request=request,
            entity_id=entity_id,
            db=db,
        )
    elif ads.status == "pending_compliance":
        await _assert_ads_compliance_review_access(
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )
    else:
        await _assert_ads_final_approval_access(
            current_user=current_user,
            entity_id=entity_id,
            db=db,
        )

    if ads.status in ("cancelled", "completed", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de rejeter un AdS avec le statut '{ads.status}'.",
        )

    # Mark all PAX as rejected
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    release_slot = False
    for entry in pax_result.scalars().all():
        if entry.status not in {"blocked", "waitlisted", "rejected", "no_show"}:
            release_slot = True
        entry.status = "rejected"

    target_state = "cancelled" if ads.status == "pending_initiator_review" else "rejected"

    # FSM transition: * → cancelled/rejected
    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state=target_state,
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        comment=reason,
    )

    ads.status = target_state
    ads.rejected_at = func.now() if target_state == "rejected" else None
    ads.rejection_reason = reason

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="initiator_review_rejected" if target_state == "cancelled" else "rejected",
        old_status=from_state,
        new_status=target_state,
        actor_id=current_user.id,
        reason=reason,
    ))

    if release_slot:
        await _promote_waitlisted_ads_pax_if_capacity_available(
            db,
            entity_id=entity_id,
            ads=ads,
            actor_id=current_user.id,
        )

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state=target_state,
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"rejection_reason": reason},
    )

    # Emit module-level event AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.cancelled" if target_state == "cancelled" else "ads.rejected",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "rejection_reason": reason or "",
        },
    ))

    logger.info("AdS %s %s by %s", ads.reference, target_state, current_user.id)
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.post("/ads/{ads_id}/request-review", response_model=AdsRead)
async def request_ads_review(
    ads_id: UUID,
    reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Send an AdS back for correction without terminal rejection."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    allowed_statuses = {"submitted", "pending_compliance", "pending_validation", "approved", "in_progress"}
    if ads.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de renvoyer en correction un AdS avec le statut '{ads.status}'.",
        )

    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="requires_review",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
        comment=reason,
    )

    ads.status = "requires_review"
    # Reuse the existing feedback field until a dedicated review_comment field is modelled.
    ads.rejection_reason = reason

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="requires_review",
        old_status=from_state,
        new_status="requires_review",
        actor_id=current_user.id,
        reason=reason,
    ))

    await db.commit()
    await db.refresh(ads)

    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="requires_review",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"review_reason": reason},
    )

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.requires_review",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "review_reason": reason,
        },
    ))

    logger.info("AdS %s sent back for review by %s", ads.reference, current_user.id)
    return ads


@router.post("/ads/{ads_id}/cancel", response_model=AdsRead)
async def cancel_ads(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.cancel"),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an AdS."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if not await _can_manage_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Vous ne pouvez pas annuler cette AdS.",
        )

    if ads.status in ("cancelled", "completed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible d'annuler un AdS avec le statut '{ads.status}'.",
        )

    pax_result = await db.execute(select(AdsPax).where(AdsPax.ads_id == ads_id))
    release_slot = any(
        entry.status not in {"blocked", "waitlisted", "rejected", "no_show"}
        for entry in pax_result.scalars().all()
    )

    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="cancelled",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )

    ads.status = "cancelled"

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="cancelled",
        old_status=from_state,
        new_status="cancelled",
        actor_id=current_user.id,
    ))

    if release_slot:
        await _promote_waitlisted_ads_pax_if_capacity_available(
            db,
            entity_id=entity_id,
            ads=ads,
            actor_id=current_user.id,
        )

    await db.commit()
    await db.refresh(ads)

    # Emit FSM event AFTER commit
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="cancelled",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
    )

    # Emit module-level event AFTER commit → triggers PaxLog notification handlers
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.cancelled",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
            "site_name": str(ads.site_entry_asset_id),
            "start_date": str(ads.start_date),
            "end_date": str(ads.end_date),
        },
    ))

    return ads


@router.post("/ads/{ads_id}/manual-departure", response_model=AdsRead)
async def complete_ads_manual_departure(
    ads_id: UUID,
    body: AdsManualDepartureRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Complete an in-progress AdS from a manual OMAA departure declaration."""
    result = await db.execute(select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id))
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    await paxlog_service.complete_ads_operationally(
        db,
        ads,
        source="omaa.manual_departure",
        actor_id=current_user.id,
        reason=body.reason,
    )
    await record_audit(
        db,
        action="paxlog.ads.manual_departure",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference, "reason": body.reason},
    )
    await db.commit()
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.post("/ads/{ads_id}/start-progress", response_model=AdsRead)
async def start_ads_progress(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Move an approved AdS into operational execution."""
    result = await db.execute(select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id))
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if ads.status != "approved":
        raise HTTPException(status_code=400, detail=f"Cannot start AdS with status '{ads.status}'")

    from_state = ads.status
    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state="in_progress",
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )
    ads.status = "in_progress"
    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="in_progress",
        old_status=from_state,
        new_status="in_progress",
        actor_id=current_user.id,
    ))
    await db.commit()
    await db.refresh(ads)
    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=from_state,
        to_state="in_progress",
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
    )
    await record_audit(
        db,
        action="paxlog.ads.start_progress",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference},
    )
    await db.commit()
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="ads.in_progress",
        payload={
            "ads_id": str(ads.id),
            "entity_id": str(entity_id),
            "reference": ads.reference,
            "requester_id": str(ads.requester_id),
        },
    ))
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.post("/ads/{ads_id}/complete", response_model=AdsRead)
async def complete_ads(
    ads_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Manually complete an in-progress AdS."""
    result = await db.execute(select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id))
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    await paxlog_service.complete_ads_operationally(
        db,
        ads,
        source="paxlog.manual_completion",
        actor_id=current_user.id,
    )
    await record_audit(
        db,
        action="paxlog.ads.complete",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={"reference": ads.reference},
    )
    await db.commit()
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.get("/ads/{ads_id}/events", response_model=list[AdsEventRead])
async def list_ads_events(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    result = await db.execute(
        select(AdsEvent).where(
            AdsEvent.ads_id == ads_id,
            AdsEvent.entity_id == entity_id,
        ).order_by(AdsEvent.recorded_at.desc())
    )
    return result.scalars().all()


@router.post("/ads/{ads_id}/resubmit", response_model=AdsRead)
async def resubmit_ads(
    ads_id: UUID,
    request: Request = None,
    reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Resubmit an AdS after requires_review — motif obligatoire."""
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if not await _can_manage_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas re-soumettre cette AdS.")
    if ads.status != "requires_review":
        raise HTTPException(status_code=400, detail=f"Cannot resubmit AdS with status '{ads.status}'")

    old_status = ads.status
    pax_entries, has_compliance_issues, target_status = await _run_ads_submission_checks(
        db,
        ads=ads,
        entity_id=entity_id,
    )
    ads.status = target_status
    ads.rejection_reason = None
    ads.submitted_at = func.now()

    # Log event
    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type="resubmitted",
        old_status=old_status,
        new_status=target_status,
        actor_id=current_user.id,
        reason=reason,
    ))

    await _try_ads_workflow_transition(
        db,
        entity_id_str=str(ads.id),
        to_state=target_status,
        actor_id=current_user.id,
        entity_id_scope=entity_id,
    )
    await db.commit()
    await db.refresh(ads)

    await fsm_service.emit_transition_event(
        entity_type=ADS_ENTITY_TYPE,
        entity_id=str(ads.id),
        from_state=old_status,
        to_state=target_status,
        actor_id=current_user.id,
        workflow_slug=ADS_WORKFLOW_SLUG,
        extra_payload={"reference": ads.reference, "compliance_issues": has_compliance_issues},
    )

    await record_audit(
        db,
        action="paxlog.ads.resubmit",
        resource_type="ads",
        resource_id=str(ads.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "reference": ads.reference,
            "pax_count": len(pax_entries),
            "compliance_issues": has_compliance_issues,
            "reason": reason,
        },
    )
    await db.commit()
    return ads


# ═══════════════════════════════════════════════════════════════════════════════
# AdS PAX ENTRIES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/{ads_id}/pax", response_model=list[dict])
async def list_ads_pax(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List PAX entries for an AdS with profile details (User + TierContact)."""
    from app.core.sms_service import resolve_user_contact

    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads_id)
    )
    entries = pax_result.scalars().all()

    status_rank = {
        "waitlisted": 0,
        "approved": 1,
        "compliant": 2,
        "pending_check": 3,
        "blocked": 4,
        "rejected": 5,
        "no_show": 6,
    }

    items = []
    for ads_pax in entries:
        if ads_pax.user_id:
            u = await db.get(User, ads_pax.user_id)
            linked_contact = None
            linked_company_name = None
            if u and getattr(u, "tier_contact_id", None):
                linked_contact = await db.get(TierContact, u.tier_contact_id)
                if linked_contact:
                    linked_company_name = await db.scalar(
                        select(Tier.name).where(Tier.id == linked_contact.tier_id)
                    )
            pax_email = None
            pax_phone = None
            if u:
                pax_email = await resolve_user_contact(db, str(u.id), "email") or u.email
                pax_phone = await resolve_user_contact(db, str(u.id), "sms")
            items.append({
                "id": str(ads_pax.id),
                "ads_id": str(ads_pax.ads_id),
                "user_id": str(ads_pax.user_id),
                "contact_id": None,
                "pax_source": "user",
                "status": ads_pax.status,
                "compliance_summary": ads_pax.compliance_summary,
                "priority_score": ads_pax.priority_score,
                "priority_source": getattr(ads_pax, "priority_source", None),
                "pax_first_name": u.first_name if u else "?",
                "pax_last_name": u.last_name if u else "?",
                "pax_company_id": str(linked_contact.tier_id) if linked_contact else None,
                "pax_company_name": linked_company_name,
                "pax_badge": u.badge_number if u else None,
                "pax_type": "external" if linked_contact else (u.pax_type if u else "internal"),
                "pax_email": pax_email,
                "pax_phone": pax_phone,
            })
        elif ads_pax.contact_id:
            c = await db.get(TierContact, ads_pax.contact_id)
            items.append({
                "id": str(ads_pax.id),
                "ads_id": str(ads_pax.ads_id),
                "user_id": None,
                "contact_id": str(ads_pax.contact_id),
                "pax_source": "contact",
                "status": ads_pax.status,
                "compliance_summary": ads_pax.compliance_summary,
                "priority_score": ads_pax.priority_score,
                "priority_source": getattr(ads_pax, "priority_source", None),
                "pax_first_name": c.first_name if c else "?",
                "pax_last_name": c.last_name if c else "?",
                "pax_company_id": str(c.tier_id) if c else None,
                "pax_badge": c.badge_number if c else None,
                "pax_type": "external",
                "pax_email": c.email if c else None,
                "pax_phone": c.phone if c else None,
            })

    # Waitlisted PAX are surfaced first, then ordered by priority.
    items.sort(
        key=lambda x: (
            status_rank.get(x["status"], 99),
            -(x.get("priority_score") or 0),
            x["pax_last_name"].lower(),
            x["pax_first_name"].lower(),
        )
    )
    return items


@router.post("/ads/{ads_id}/pax/{entry_id}/decision", response_model=AdsRead)
async def decide_ads_pax(
    ads_id: UUID,
    entry_id: UUID,
    body: AdsPaxDecision,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve or reject a single PAX inside an AdS."""
    from app.services.modules.paxlog_service import ads_requires_travelwiz_transport

    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if ads.status not in {"submitted", "pending_validation", "pending_arbitration", "approved"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de traiter un PAX avec le statut AdS '{ads.status}'.",
        )

    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.id == entry_id, AdsPax.ads_id == ads_id)
    )
    entry = pax_result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="PAX entry not found in this AdS")
    if entry.status in {"approved", "rejected", "no_show"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Impossible de traiter un PAX avec le statut '{entry.status}'.",
        )
    if body.action in {"approve", "waitlist"} and entry.status == "blocked":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un PAX bloque en conformite ne peut pas etre approuve ou place en attente individuellement.",
        )

    previous_ads_status = ads.status
    old_status = entry.status
    release_slot = old_status not in {"blocked", "waitlisted", "rejected", "no_show"}
    if body.action == "approve":
        new_status = "approved"
    elif body.action == "waitlist":
        new_status = "waitlisted"
    else:
        new_status = "rejected"
    entry.status = new_status

    if body.action == "waitlist":
        from app.services.modules.paxlog_service import compute_pax_priority

        await compute_pax_priority(db, entry.id)

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        ads_pax_id=entry.id,
        event_type=(
            "pax_approved"
            if body.action == "approve"
            else "pax_waitlisted"
            if body.action == "waitlist"
            else "pax_rejected"
        ),
        old_status=old_status,
        new_status=new_status,
        actor_id=current_user.id,
        reason=body.reason,
    ))

    await _finalize_ads_after_pax_decision(
        db=db,
        ads=ads,
        entity_id=entity_id,
        actor_id=current_user.id,
    )
    if release_slot and new_status in {"waitlisted", "rejected", "no_show"}:
        await _promote_waitlisted_ads_pax_if_capacity_available(
            db,
            entity_id=entity_id,
            ads=ads,
            actor_id=current_user.id,
        )
    await db.commit()
    await db.refresh(ads)
    if previous_ads_status != ads.status:
        from app.core.events import OpsFluxEvent, event_bus as _event_bus

        if ads.status == "approved":
            approved_result = await db.execute(
                select(AdsPax).where(AdsPax.ads_id == ads.id, AdsPax.status == "approved")
            )
            approved_count = len(approved_result.scalars().all())
            await _event_bus.publish(OpsFluxEvent(
                event_type="ads.approved",
                payload={
                    "ads_id": str(ads.id),
                    "entity_id": str(entity_id),
                    "site_asset_id": str(ads.site_entry_asset_id),
                    "start_date": str(ads.start_date),
                    "end_date": str(ads.end_date),
                    "outbound_transport_mode": ads.outbound_transport_mode,
                    "return_transport_mode": ads.return_transport_mode,
                    **_build_ads_transport_flags(ads),
                    "outbound_departure_base_id": str(ads.outbound_departure_base_id) if ads.outbound_departure_base_id else None,
                    "requester_id": str(ads.requester_id),
                    "reference": ads.reference,
                    "approved_pax_count": approved_count,
                },
            ))
        elif ads.status == "rejected":
            await _event_bus.publish(OpsFluxEvent(
                event_type="ads.rejected",
                payload={
                    "ads_id": str(ads.id),
                    "entity_id": str(entity_id),
                    "reference": ads.reference,
                    "requester_id": str(ads.requester_id),
                    "rejection_reason": ads.rejection_reason or "",
                },
            ))
    return ads


class AddPaxBody(BaseModel):
    """Body to add a PAX to an AdS. Provide exactly one of user_id or contact_id."""
    user_id: UUID | None = None
    contact_id: UUID | None = None


@router.get("/candidates")
async def search_pax_candidates(
    search: str = Query("", min_length=0),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Search for PAX candidates: Users + TierContacts.

    Returns a unified list for the PAX picker in the AdS detail panel.
    """
    candidates = []
    like = f"%{search}%"

    # 1. Users (internal PAX)
    user_q = select(User).where(User.active == True)  # noqa: E712
    if current_user.user_type == "external":
        user_q = user_q.where(User.id == current_user.id)
    if search:
        user_q = user_q.where(
            or_(
                User.first_name.ilike(like),
                User.last_name.ilike(like),
                User.email.ilike(like),
                User.badge_number.ilike(like),
            )
        )
    user_result = await db.execute(user_q.limit(15))
    for u in user_result.scalars().all():
        candidates.append({
            "id": str(u.id),
            "source": "user",
            "user_id": str(u.id),
            "first_name": u.first_name,
            "last_name": u.last_name,
            "type": u.pax_type,
            "badge": u.badge_number,
            "company_id": None,
            "email": u.email,
        })

    # 2. Tier contacts (external PAX)
    contact_q = (
        select(TierContact)
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    linked_tier_ids = await _get_external_user_tier_ids(db, current_user, entity_id)
    if linked_tier_ids is not None:
        contact_q = contact_q.where(TierContact.tier_id.in_(linked_tier_ids))
    if search:
        contact_q = contact_q.where(
            or_(
                TierContact.first_name.ilike(like),
                TierContact.last_name.ilike(like),
                TierContact.email.ilike(like),
                TierContact.badge_number.ilike(like),
            )
        )
    contact_result = await db.execute(contact_q.limit(15))
    for c in contact_result.scalars().all():
        candidates.append({
            "id": str(c.id),
            "source": "contact",
            "contact_id": str(c.id),
            "first_name": c.first_name,
            "last_name": c.last_name,
            "type": "external",
            "badge": c.badge_number,
            "company_id": str(c.tier_id) if c.tier_id else None,
            "position": c.position,
        })

    return candidates[:30]


@router.post("/ads/{ads_id}/add-pax", status_code=201)
async def add_pax_to_ads(
    ads_id: UUID,
    body: AddPaxBody,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a PAX to an AdS. Provide exactly one of user_id or contact_id."""
    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if not await _can_manage_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier les PAX de cette AdS.")
    if ads.status not in ("draft", "requires_review"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="PAX can only be added to draft or review-pending AdS.",
        )

    if not body.user_id and not body.contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")
    if body.user_id and body.contact_id:
        raise HTTPException(status_code=400, detail="Provide only one of user_id or contact_id")

    # Verify the PAX entity exists
    if body.user_id:
        u = await db.get(User, body.user_id)
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
        if current_user.user_type == "external" and u.id != acting_user_id:
            raise HTTPException(status_code=404, detail="User not found")
        pax_name = f"{u.first_name} {u.last_name}"
        # Check not already in this AdS
        existing = await db.execute(
            select(AdsPax.id).where(AdsPax.ads_id == ads_id, AdsPax.user_id == body.user_id)
        )
    else:
        c = await db.get(TierContact, body.contact_id)
        if not c:
            raise HTTPException(status_code=404, detail="Contact not found")
        await _assert_external_tier_access(db, current_user, entity_id, c.tier_id)
        pax_name = f"{c.first_name} {c.last_name}"
        existing = await db.execute(
            select(AdsPax.id).where(AdsPax.ads_id == ads_id, AdsPax.contact_id == body.contact_id)
        )

    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce PAX est déjà dans cet AdS")

    entry = AdsPax(
        ads_id=ads_id,
        user_id=body.user_id,
        contact_id=body.contact_id,
        status="pending_check",
    )
    db.add(entry)
    await db.commit()

    return {
        "status": "added",
        "user_id": str(body.user_id) if body.user_id else None,
        "contact_id": str(body.contact_id) if body.contact_id else None,
        "name": pax_name,
    }


@router.delete("/ads/{ads_id}/pax/{entry_id}", status_code=204)
async def remove_pax_from_ads(
    ads_id: UUID,
    entry_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a PAX entry from an AdS by AdsPax id."""
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if not await _can_manage_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier les PAX de cette AdS.")
    result = await db.execute(
        select(AdsPax).where(
            AdsPax.id == entry_id,
            AdsPax.ads_id == ads_id,
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="PAX entry not found in this AdS")
    release_slot = entry.status not in {"blocked", "waitlisted", "rejected", "no_show"}
    # Junction record — physical delete (not policy-managed)
    await db.delete(entry)
    if release_slot:
        await _promote_waitlisted_ads_pax_if_capacity_available(
            db,
            entity_id=entity_id,
            ads=ads,
            actor_id=current_user.id,
        )
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# ADS — Lookup by reference + PDF ticket
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/by-reference/{reference}", response_model=AdsRead)
async def get_ads_by_reference(
    reference: str,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Lookup an AdS by its unique reference number (e.g. ADS-2026-0001)."""
    result = await db.execute(
        select(Ads).where(
            Ads.entity_id == entity_id,
            Ads.reference == reference,
        )
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail=f"AdS «{reference}» introuvable")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)
    return AdsRead(**(await _build_ads_read_data(db, ads=ads, entity_id=entity_id)))


@router.get("/ads/{ads_id}/pdf")
async def download_ads_pdf(
    ads_id: UUID,
    request: Request,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Generate and download the canonical AdS PDF ticket."""
    ads = await _get_ads_pdf_accessible(
        db,
        ads_id=ads_id,
        entity_id=entity_id,
        current_user=current_user,
        request=request,
    )
    return await _build_ads_pdf_response(
        db,
        ads=ads,
        entity_id=entity_id,
        language=language,
    )


async def _get_ads_pdf_accessible(
    db: AsyncSession,
    *,
    ads_id: UUID,
    entity_id: UUID,
    current_user: User,
    request: Request | None = None,
) -> Ads:
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS introuvable")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)
    return ads


async def _build_ads_pdf_response(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
    language: str = "fr",
):
    """Render the shared `ads.ticket` PDF response for internal and external flows."""
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf

    variables = await _build_ads_pdf_template_variables(
        db,
        ads=ads,
        entity_id=entity_id,
    )

    try:
        pdf_bytes = await render_pdf(
            db,
            slug="ads.ticket",
            entity_id=entity_id,
            language=language,
            variables=variables,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))

    filename = f"ADS_{ads.reference.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


async def _build_ads_pdf_template_variables(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> dict:
    from sqlalchemy import text as sql_text

    # Load PAX entries with profile details (User + TierContact)
    pax_result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads.id)
    )
    pax_rows = pax_result.scalars().all()
    passengers = []
    for ads_pax in pax_rows:
        if ads_pax.user_id:
            u = await db.get(User, ads_pax.user_id)
            passengers.append({
                "first_name": u.first_name if u else "?",
                "last_name": u.last_name if u else "?",
                "badge_number": (u.badge_number if u else None) or "—",
                "company": "",
                "type": u.pax_type if u else "internal",
                "status": ads_pax.status or "pending",
                "compliant": (ads_pax.compliance_summary or {}).get("compliant", False),
            })
        elif ads_pax.contact_id:
            c = await db.get(TierContact, ads_pax.contact_id)
            passengers.append({
                "first_name": c.first_name if c else "?",
                "last_name": c.last_name if c else "?",
                "badge_number": (c.badge_number if c else None) or "—",
                "company": "",
                "type": "external",
                "status": ads_pax.status or "pending",
                "compliant": (ads_pax.compliance_summary or {}).get("compliant", False),
            })

    # Load requester info
    req_row = await db.execute(
        sql_text("SELECT first_name, last_name, email FROM users WHERE id = :uid"),
        {"uid": ads.requester_id},
    )
    requester = req_row.first()
    requester_name = f"{requester[0]} {requester[1]}" if requester else "—"

    # Load site name
    site_row = await db.execute(
        sql_text("SELECT name FROM ar_installations WHERE id = :aid"),
        {"aid": ads.site_entry_asset_id},
    )
    site = site_row.first()
    site_name = site[0] if site else "—"

    # Load entity name
    entity_row = await db.execute(
        sql_text("SELECT name, code FROM entities WHERE id = :eid"),
        {"eid": entity_id},
    )
    entity = entity_row.first()
    entity_name = entity[0] if entity else "OpsFlux"
    entity_code = entity[1] if entity and len(entity) > 1 else None
    boarding_token = _build_ads_boarding_token(ads)
    boarding_url = _build_ads_boarding_url(boarding_token)

    variables = {
        "reference": ads.reference,
        "status": ads.status,
        "start_date": str(ads.start_date) if ads.start_date else "—",
        "end_date": str(ads.end_date) if ads.end_date else "—",
        "site_name": site_name,
        "visit_purpose": ads.visit_purpose or "—",
        "visit_category": ads.visit_category or "—",
        "outbound_transport_mode": ads.outbound_transport_mode or "—",
        "return_transport_mode": ads.return_transport_mode or "—",
        "requester_name": requester_name,
        "pax_count": len(passengers),
        "passengers": passengers,
        "entity": {
            "name": entity_name,
            "code": entity_code,
        },
        "entity_name": entity_name,
        "qr_data": boarding_url,
        "qr_url": boarding_url,
    }
    return variables


async def _resolve_ads_boarding_context(
    db: AsyncSession,
    *,
    token: str,
    current_entity_id: UUID,
) -> tuple[Ads, str]:
    payload = _decode_ads_boarding_token(token)
    ads_id = UUID(str(payload["ads_id"]))
    token_entity_id = UUID(str(payload["entity_id"]))
    if token_entity_id != current_entity_id:
        raise HTTPException(status_code=404, detail="QR AdS non disponible dans cette entité")
    result = await db.execute(
        select(Ads).where(
            Ads.id == ads_id,
            Ads.entity_id == current_entity_id,
        )
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS introuvable")
    return ads, _build_ads_boarding_url(token)


async def _build_ads_boarding_context(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
    qr_url: str,
) -> AdsBoardingContextRead:
    ads_data = await _build_ads_read_data(db, ads=ads, entity_id=entity_id)
    pax_rows = (
        await db.execute(
            select(
                ManifestPassenger,
                AdsPax.status.label("ads_pax_status"),
                VoyageManifest,
                Voyage,
                User.badge_number.label("user_badge_number"),
                TierContact.badge_number.label("contact_badge_number"),
            )
            .join(AdsPax, AdsPax.id == ManifestPassenger.ads_pax_id)
            .join(VoyageManifest, VoyageManifest.id == ManifestPassenger.manifest_id)
            .join(Voyage, Voyage.id == VoyageManifest.voyage_id)
            .outerjoin(User, User.id == ManifestPassenger.user_id)
            .outerjoin(TierContact, TierContact.id == ManifestPassenger.contact_id)
            .where(
                AdsPax.ads_id == ads.id,
                ManifestPassenger.active == True,  # noqa: E712
                VoyageManifest.active == True,  # noqa: E712
            )
            .order_by(Voyage.scheduled_departure.asc(), ManifestPassenger.created_at.asc())
        )
    ).all()

    manifests_index: dict[UUID, dict[str, Any]] = {}
    for row in pax_rows:
        passenger: ManifestPassenger = row[0]
        pax_status = row[1]
        manifest: VoyageManifest = row[2]
        voyage: Voyage = row[3]
        badge_number = row[4] or row[5]
        if manifest.id not in manifests_index:
            manifests_index[manifest.id] = {
                "manifest_id": manifest.id,
                "manifest_status": manifest.status,
                "voyage_id": voyage.id,
                "voyage_code": voyage.code,
                "voyage_status": voyage.status,
                "scheduled_departure": voyage.scheduled_departure,
                "scheduled_arrival": voyage.scheduled_arrival,
                "passengers": [],
            }
        manifests_index[manifest.id]["passengers"].append(
            AdsBoardingPassengerRead(
                id=passenger.id,
                ads_pax_id=passenger.ads_pax_id,
                manifest_id=manifest.id,
                voyage_id=voyage.id,
                user_id=passenger.user_id,
                contact_id=passenger.contact_id,
                name=passenger.name,
                company=passenger.company,
                badge_number=badge_number,
                pax_status=pax_status,
                boarding_status=passenger.boarding_status,
                boarded_at=passenger.boarded_at,
                standby=passenger.standby,
            )
        )

    manifests = [
        AdsBoardingManifestRead(
            **manifest_row,
            passenger_count=len(manifest_row["passengers"]),
            boarded_count=sum(1 for passenger in manifest_row["passengers"] if passenger.boarding_status == "boarded"),
        )
        for manifest_row in manifests_index.values()
    ]

    unassigned_rows = (
        await db.execute(
            select(
                AdsPax,
                User.first_name.label("user_first_name"),
                User.last_name.label("user_last_name"),
                User.badge_number.label("user_badge_number"),
                TierContact.first_name.label("contact_first_name"),
                TierContact.last_name.label("contact_last_name"),
                TierContact.badge_number.label("contact_badge_number"),
                Tier.name.label("company_name"),
            )
            .outerjoin(User, User.id == AdsPax.user_id)
            .outerjoin(TierContact, TierContact.id == AdsPax.contact_id)
            .outerjoin(Tier, Tier.id == User.company_id)
            .outerjoin(
                ManifestPassenger,
                and_(
                    ManifestPassenger.ads_pax_id == AdsPax.id,
                    ManifestPassenger.active == True,  # noqa: E712
                ),
            )
            .where(
                AdsPax.ads_id == ads.id,
                ManifestPassenger.id.is_(None),
            )
            .order_by(AdsPax.created_at.asc())
        )
    ).all()

    unassigned_pax = [
        AdsBoardingUnassignedPaxRead(
            ads_pax_id=row[0].id,
            user_id=row[0].user_id,
            contact_id=row[0].contact_id,
            name=" ".join(
                part for part in [
                    row[1] if row[0].user_id else row[4],
                    row[2] if row[0].user_id else row[5],
                ]
                if part
            ) or "PAX",
            company=row[7] or None,
            badge_number=row[3] or row[6],
            pax_status=row[0].status,
        )
        for row in unassigned_rows
    ]

    declared_rows = (
        await db.execute(
            select(
                AdsPax,
                User.first_name.label("user_first_name"),
                User.last_name.label("user_last_name"),
                User.badge_number.label("user_badge_number"),
                TierContact.first_name.label("contact_first_name"),
                TierContact.last_name.label("contact_last_name"),
                TierContact.badge_number.label("contact_badge_number"),
                Tier.name.label("company_name"),
                ManifestPassenger.id.label("manifest_passenger_id"),
                ManifestPassenger.manifest_id.label("assigned_manifest_id"),
                ManifestPassenger.boarding_status.label("manifest_boarding_status"),
                ManifestPassenger.boarded_at.label("manifest_boarded_at"),
            )
            .outerjoin(User, User.id == AdsPax.user_id)
            .outerjoin(TierContact, TierContact.id == AdsPax.contact_id)
            .outerjoin(Tier, Tier.id == User.company_id)
            .outerjoin(
                ManifestPassenger,
                and_(
                    ManifestPassenger.ads_pax_id == AdsPax.id,
                    ManifestPassenger.active == True,  # noqa: E712
                ),
            )
            .where(AdsPax.ads_id == ads.id)
            .order_by(AdsPax.created_at.asc())
        )
    ).all()

    declared_pax = [
        AdsBoardingDeclaredPaxRead(
            ads_pax_id=row[0].id,
            user_id=row[0].user_id,
            contact_id=row[0].contact_id,
            name=" ".join(
                part for part in [
                    row[1] if row[0].user_id else row[4],
                    row[2] if row[0].user_id else row[5],
                ]
                if part
            ) or "PAX",
            company=row[7] or None,
            badge_number=row[3] or row[6],
            pax_status=row[0].status,
            assigned_to_manifest=bool(row[8]),
            manifest_id=row[9],
            boarding_status=row[10],
            boarded_at=row[11],
        )
        for row in declared_rows
    ]

    return AdsBoardingContextRead(
        ads_id=ads.id,
        entity_id=entity_id,
        reference=ads.reference,
        status=ads.status,
        requester_name=ads_data.get("requester_name"),
        site_name=ads_data.get("site_name"),
        project_name=ads_data.get("project_name"),
        visit_purpose=ads.visit_purpose,
        visit_category=ads.visit_category,
        start_date=ads.start_date,
        end_date=ads.end_date,
        submitted_at=ads.submitted_at,
        approved_at=ads.approved_at,
        allowed_company_names=list(ads_data.get("allowed_company_names") or []),
        outbound_transport_mode=ads.outbound_transport_mode,
        return_transport_mode=ads.return_transport_mode,
        planner_activity_title=ads_data.get("planner_activity_title"),
        pax_count=len(manifests and [p for m in manifests for p in m.passengers] or []) + len(unassigned_pax),
        qr_url=qr_url,
        manifests=manifests,
        unassigned_pax=unassigned_pax,
        declared_pax=declared_pax,
    )


@router.get("/external/{token}/pdf")
async def download_external_ads_pdf(
    token: str,
    language: str = "fr",
    x_external_session: str | None = Header(default=None, alias="X-External-Session"),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Download the same canonical AdS ticket from the external portal."""
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    external_context = await _get_external_ads_and_context(db, link=link)
    if len(external_context) == 3:
        ads, _entity_id, _allowed_company_id = external_context
    else:
        ads, _legacy_company = external_context
    return await _build_ads_pdf_response(
        db,
        ads=ads,
        entity_id=ads.entity_id,
        language=language,
    )


@router.get("/ads/boarding/scan/{token}", response_model=AdsBoardingContextRead)
async def get_ads_boarding_scan_context(
    token: str,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.boarding.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a signed AdS boarding QR into a boarding-ready context."""
    ads, qr_url = await _resolve_ads_boarding_context(
        db,
        token=token,
        current_entity_id=entity_id,
    )
    return await _build_ads_boarding_context(
        db,
        ads=ads,
        entity_id=entity_id,
        qr_url=qr_url,
    )


@router.post(
    "/ads/boarding/scan/{token}/passengers/{passenger_id}",
    response_model=AdsBoardingPassengerRead,
)
async def update_ads_boarding_scan_passenger(
    token: str,
    passenger_id: UUID,
    body: AdsBoardingPassengerUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("travelwiz.boarding.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update boarding status for a manifest passenger reached from an AdS QR scan."""
    ads, _qr_url = await _resolve_ads_boarding_context(
        db,
        token=token,
        current_entity_id=entity_id,
    )
    result = await db.execute(
        select(
            ManifestPassenger,
            AdsPax.status.label("ads_pax_status"),
            VoyageManifest,
            Voyage,
            User.badge_number.label("user_badge_number"),
            TierContact.badge_number.label("contact_badge_number"),
        )
        .join(AdsPax, AdsPax.id == ManifestPassenger.ads_pax_id)
        .join(VoyageManifest, VoyageManifest.id == ManifestPassenger.manifest_id)
        .join(Voyage, Voyage.id == VoyageManifest.voyage_id)
        .outerjoin(User, User.id == ManifestPassenger.user_id)
        .outerjoin(TierContact, TierContact.id == ManifestPassenger.contact_id)
        .where(
            ManifestPassenger.id == passenger_id,
            AdsPax.ads_id == ads.id,
            ManifestPassenger.active == True,  # noqa: E712
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Passager manifeste introuvable pour cet AdS")

    passenger: ManifestPassenger = row[0]
    passenger.boarding_status = body.boarding_status
    passenger.boarded_at = datetime.now(timezone.utc) if body.boarding_status == "boarded" else None
    await db.flush()
    await record_audit(
        db,
        action="paxlog.ads.boarding.update",
        resource_type="manifest_passenger",
        resource_id=str(passenger.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "ads_id": str(ads.id),
            "ads_reference": ads.reference,
            "manifest_id": str(passenger.manifest_id),
            "boarding_status": body.boarding_status,
        },
    )
    await db.commit()
    await db.refresh(passenger)

    return AdsBoardingPassengerRead(
        id=passenger.id,
        ads_pax_id=passenger.ads_pax_id,
        manifest_id=row[2].id,
        voyage_id=row[3].id,
        user_id=passenger.user_id,
        contact_id=passenger.contact_id,
        name=passenger.name,
        company=passenger.company,
        badge_number=row[4] or row[5],
        pax_status=row[1],
        boarding_status=passenger.boarding_status,
        boarded_at=passenger.boarded_at,
        standby=passenger.standby,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# PAX INCIDENTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/incidents", response_model=PaginatedResponse[PaxIncidentRead])
async def list_incidents(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    active_only: bool = True,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.read"),
    db: AsyncSession = Depends(get_db),
):
    """List PAX incidents."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)
    if user_id:
        query = query.where(PaxIncident.user_id == user_id)
    if contact_id:
        query = query.where(PaxIncident.contact_id == contact_id)
    if active_only:
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711
    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/incidents", response_model=PaxIncidentRead, status_code=201)
async def create_incident(
    body: PaxIncidentCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Record a PAX incident."""
    from app.services.modules.paxlog_service import create_signalement as svc_create

    result = await svc_create(
        db,
        entity_id=entity_id,
        data={
            "user_id": body.user_id,
            "contact_id": body.contact_id,
            "company_id": body.company_id,
            "pax_group_id": body.pax_group_id,
            "asset_id": body.asset_id,
            "severity": body.severity,
            "description": body.description,
            "incident_date": body.incident_date,
            "ban_start_date": body.ban_start_date,
            "ban_end_date": body.ban_end_date,
            "category": body.category,
            "decision": body.decision,
            "decision_duration_days": body.decision_duration_days,
            "recorded_by": current_user.id,
        },
    )

    await record_audit(
        db,
        action="paxlog.incident.create",
        resource_type="pax_incident",
        resource_id=str(result["id"]),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": body.severity,
            "user_id": str(body.user_id) if body.user_id else None,
            "contact_id": str(body.contact_id) if body.contact_id else None,
            "company_id": str(body.company_id) if body.company_id else None,
            "pax_group_id": str(body.pax_group_id) if body.pax_group_id else None,
        },
    )
    await db.commit()

    incident_result = await db.execute(
        select(
            PaxIncident,
            User.first_name.label("user_first_name"),
            User.last_name.label("user_last_name"),
            TierContact.first_name.label("contact_first_name"),
            TierContact.last_name.label("contact_last_name"),
            Tier.name.label("company_name"),
            PaxGroup.name.label("group_name"),
            literal(None).label("asset_name"),
        )
        .outerjoin(User, User.id == PaxIncident.user_id)
        .outerjoin(TierContact, TierContact.id == PaxIncident.contact_id)
        .outerjoin(Tier, Tier.id == PaxIncident.company_id)
        .outerjoin(PaxGroup, PaxGroup.id == PaxIncident.pax_group_id)
        .where(PaxIncident.id == result["id"], PaxIncident.entity_id == entity_id)
    )
    row = incident_result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")

    logger.info("PAX incident created (%s) by %s", body.severity, current_user.id)
    return _incident_row_to_read(row)


@router.patch("/incidents/{incident_id}/resolve", response_model=PaxIncidentRead)
async def resolve_incident(
    incident_id: UUID,
    body: PaxIncidentResolve,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve an active PAX incident."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == incident_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cet incident est déjà résolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = body.resolution_notes
    await db.commit()
    await db.refresh(incident)
    return incident


# ═══════════════════════════════════════════════════════════════════════════════
# AdS IMPUTATIONS (multi-project cost allocation)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/ads/{ads_id}/imputations")
async def list_imputations(
    ads_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List cost imputations for an AdS — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import list_cost_imputations

    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    return await list_cost_imputations(
        owner_type="ads", owner_id=ads_id, current_user=current_user, db=db
    )


@router.get("/ads/{ads_id}/imputation-suggestion", response_model=AdsImputationSuggestionRead)
async def get_imputation_suggestion(
    ads_id: UUID,
    request: Request,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """Return the default imputation suggestion for an AdS."""
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)

    return await _resolve_ads_imputation_suggestion(db, ads=ads, entity_id=entity_id)


@router.post("/ads/{ads_id}/imputations", status_code=201)
async def add_imputation(
    ads_id: UUID,
    project_id: UUID | None = None,
    cost_center_id: UUID | None = None,
    percentage: float = 100.0,
    wbs_id: UUID | None = None,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Add a cost imputation line — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import create_cost_imputation
    from app.schemas.common import CostImputationCreate

    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if request is not None:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, request=request, entity_id=entity_id, db=db
        )
    else:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, entity_id=entity_id, db=db
        )
    if not can_manage_ads:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier les imputations de cette AdS.")

    body = CostImputationCreate(
        owner_type="ads",
        owner_id=ads_id,
        project_id=project_id,
        cost_center_id=cost_center_id,
        percentage=percentage,
        wbs_id=wbs_id,
    )
    result = await create_cost_imputation(body=body, current_user=current_user, db=db)

    if project_id is not None:
        await _sync_ads_project_from_imputations(db, ads=ads)
        await db.commit()

    return result


@router.delete("/ads/{ads_id}/imputations/{imputation_id}", status_code=204)
async def delete_imputation(
    ads_id: UUID,
    imputation_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Remove a cost imputation line — delegates to core cost_imputations."""
    from app.api.routes.core.cost_imputations import delete_cost_imputation

    # Verify AdS belongs to entity
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    if request is not None:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, request=request, entity_id=entity_id, db=db
        )
    else:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, entity_id=entity_id, db=db
        )
    if not can_manage_ads:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas modifier les imputations de cette AdS.")

    await delete_cost_imputation(
        imputation_id=imputation_id, current_user=current_user, db=db
    )
    await _sync_ads_project_from_imputations(db, ads=ads)
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# ROTATION CYCLES
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/rotation-cycles", response_model=PaginatedResponse[RotationCycleRead])
async def list_rotation_cycles(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    site_asset_id: UUID | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List rotation cycles for the entity."""
    from app.services.modules import paxlog_service
    from sqlalchemy import text as sa_text

    conditions = ["entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}

    if user_id:
        conditions.append("user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if site_asset_id:
        conditions.append("site_asset_id = :site_id")
        params["site_id"] = str(site_asset_id)
    if status_filter:
        conditions.append("status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    count_result = await db.execute(
        sa_text(
            f"""
            SELECT COUNT(*)
            FROM pax_rotation_cycles
            WHERE {where_clause}
            """
        ),
        params,
    )
    total = count_result.scalar() or 0

    offset = (pagination.page - 1) * pagination.page_size
    list_result = await db.execute(
        sa_text(
            f"""
            SELECT id, entity_id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                   cycle_start_date, next_on_date, status,
                   auto_create_ads, ads_lead_days,
                   default_project_id, default_cc_id, notes, created_at, updated_at,
                   pax_first_name, pax_last_name, site_name, company_name
            FROM pax_rotation_cycles
            WHERE {where_clause}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {**params, "limit": pagination.page_size, "offset": offset},
    )
    items: list[RotationCycleRead] = []
    for row in list_result.all():
        pax_user_id = row[2]
        pax_contact_id = row[3]
        compliance_result = await paxlog_service.check_pax_compliance(
            db,
            row[4],
            entity_id,
            user_id=pax_user_id,
            contact_id=pax_contact_id,
        )
        issues = [item["message"] for item in compliance_result.get("results", []) if item.get("status") != "valid"]
        risk_level = "clear" if compliance_result.get("compliant") else "blocked"
        items.append(
            RotationCycleRead(
                id=row[0],
                entity_id=row[1],
                user_id=pax_user_id,
                contact_id=pax_contact_id,
                site_asset_id=row[4],
                days_on=row[5],
                days_off=row[6],
                start_date=row[7],
                next_rotation_date=row[8],
                status=row[9],
                auto_create_ads=row[10],
                ads_lead_days=row[11],
                default_project_id=row[12],
                default_cc_id=row[13],
                notes=row[14],
                created_at=row[15],
                updated_at=row[16],
                pax_first_name=row[18],
                pax_last_name=row[19],
                site_name=row[20],
                company_name=row[21],
                compliance_risk_level=risk_level,
                compliance_issue_count=len(issues),
                compliance_issue_preview=issues[:3],
            )
        )

    return PaginatedResponse[RotationCycleRead](
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        pages=max(1, -(-total // pagination.page_size)) if pagination.page_size else 1,
    )


@router.post("/rotation-cycles", status_code=201)
async def create_rotation_cycle(
    site_asset_id: UUID,
    days_on: int,
    days_off: int,
    cycle_start_date: date,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    auto_create_ads: bool = True,
    ads_lead_days: int = 7,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a rotation cycle for a PAX on a site."""
    from sqlalchemy import text as sa_text

    if not user_id and not contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_rotation_cycles (
                entity_id, user_id, contact_id, site_asset_id, rotation_days_on, rotation_days_off,
                cycle_start_date, next_on_date, status,
                auto_create_ads, ads_lead_days,
                default_project_id, default_cc_id, created_by, created_at
            ) VALUES (
                :eid, :user_id, :contact_id, :site_id, :days_on, :days_off,
                :start_date, :start_date, 'active',
                :auto_ads, :lead_days,
                :project_id, :cc_id, :created_by, NOW()
            ) RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
            "start_date": cycle_start_date,
            "auto_ads": auto_create_ads,
            "lead_days": ads_lead_days,
            "project_id": str(default_project_id) if default_project_id else None,
            "cc_id": str(default_cc_id) if default_cc_id else None,
            "created_by": str(current_user.id),
        },
    )
    new_id = result.scalar()
    await db.commit()

    await record_audit(
        db,
        action="paxlog.rotation.create",
        resource_type="pax_rotation_cycle",
        resource_id=str(new_id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "site_asset_id": str(site_asset_id),
            "days_on": days_on,
            "days_off": days_off,
        },
    )
    await db.commit()

    return {
        "id": str(new_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "site_asset_id": str(site_asset_id),
        "days_on": days_on,
        "days_off": days_off,
        "cycle_start_date": str(cycle_start_date),
        "status": "active",
    }


@router.patch("/rotation-cycles/{cycle_id}")
async def update_rotation_cycle(
    cycle_id: UUID,
    status_val: str | None = None,
    days_on: int | None = None,
    days_off: int | None = None,
    ads_lead_days: int | None = None,
    auto_create_ads: bool | None = None,
    default_project_id: UUID | None = None,
    default_cc_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Update a rotation cycle."""
    from sqlalchemy import text as sa_text

    # Verify cycle exists
    check = await db.execute(
        sa_text("SELECT id FROM pax_rotation_cycles WHERE id = :cid AND entity_id = :eid"),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not check.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")

    updates = []
    params: dict = {"cid": str(cycle_id)}

    if status_val is not None:
        updates.append("status = :status")
        params["status"] = status_val
    if days_on is not None:
        updates.append("rotation_days_on = :days_on")
        params["days_on"] = days_on
    if days_off is not None:
        updates.append("rotation_days_off = :days_off")
        params["days_off"] = days_off
    if ads_lead_days is not None:
        updates.append("ads_lead_days = :lead")
        params["lead"] = ads_lead_days
    if auto_create_ads is not None:
        updates.append("auto_create_ads = :auto")
        params["auto"] = auto_create_ads
    if default_project_id is not None:
        updates.append("default_project_id = :proj")
        params["proj"] = str(default_project_id)
    if default_cc_id is not None:
        updates.append("default_cc_id = :cc")
        params["cc"] = str(default_cc_id)

    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    set_clause = ", ".join(updates)
    await db.execute(
        sa_text(f"UPDATE pax_rotation_cycles SET {set_clause} WHERE id = :cid"),
        params,
    )
    await db.commit()

    return {"id": str(cycle_id), "updated_fields": list(params.keys() - {"cid"})}


@router.delete("/rotation-cycles/{cycle_id}", status_code=204)
async def end_rotation_cycle(
    cycle_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.rotation.manage"),
    db: AsyncSession = Depends(get_db),
):
    """End (deactivate) a rotation cycle."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            "UPDATE pax_rotation_cycles SET status = 'ended' "
            "WHERE id = :cid AND entity_id = :eid RETURNING id"
        ),
        {"cid": str(cycle_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise HTTPException(status_code=404, detail="Rotation cycle not found")
    await db.commit()
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# EXTERNAL ACCESS LINKS (portail externe Tiers)
# ═══════════════════════════════════════════════════════════════════════════════


class ExternalOtpVerifyBody(BaseModel):
    code: str


class ExternalPaxUpsertBody(BaseModel):
    first_name: str
    last_name: str
    birth_date: date | None = None
    nationality: str | None = None
    badge_number: str | None = None
    photo_url: str | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    job_position_id: UUID | None = None
    contractual_airport: str | None = None
    nearest_airport: str | None = None
    nearest_station: str | None = None
    pickup_address_line1: str | None = None
    pickup_address_line2: str | None = None
    pickup_city: str | None = None
    pickup_state_province: str | None = None
    pickup_postal_code: str | None = None
    pickup_country: str | None = None


class ExternalPaxMatchRead(BaseModel):
    contact_id: UUID
    first_name: str
    last_name: str
    birth_date: date | None = None
    nationality: str | None = None
    badge_number: str | None = None
    email: str | None = None
    phone: str | None = None
    position: str | None = None
    job_position_id: UUID | None = None
    job_position_name: str | None = None
    match_score: int
    match_reasons: list[str] = []
    already_linked_to_ads: bool = False


class ExternalCredentialCreateBody(BaseModel):
    credential_type_id: UUID
    obtained_date: date
    expiry_date: date | None = None
    proof_url: str | None = None
    notes: str | None = None


class ExternalLinkCreateBody(BaseModel):
    otp_required: bool = True
    otp_sent_to: str | None = None
    recipient_user_id: UUID | None = None
    recipient_contact_id: UUID | None = None
    expires_hours: int = 72
    max_uses: int = 1
    preconfigured_data: dict | None = None


class ExternalDepartureBaseRead(BaseModel):
    id: UUID
    code: str
    name: str
    installation_type: str


class ExternalTransportPreferencesBody(BaseModel):
    outbound_departure_base_id: UUID | None = None
    outbound_notes: str | None = None
    return_departure_base_id: UUID | None = None
    return_notes: str | None = None


def _mask_contact_value(value: str | None) -> str | None:
    return paxlog_service.mask_contact_value(value)


def _score_external_contact_match(
    *,
    contact: TierContact,
    body: ExternalPaxUpsertBody,
) -> tuple[int, list[str]]:
    return paxlog_service.score_external_contact_match(
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        nationality=body.nationality,
        badge_number=body.badge_number,
        email=body.email,
        phone=body.phone,
        candidate=contact,
    )


def _is_external_contact_match_strong(*, score: int, reasons: list[str]) -> bool:
    return paxlog_service.is_external_contact_match_strong(score=score, reasons=reasons)


async def _find_external_contact_matches(
    db: AsyncSession,
    *,
    ads_id: UUID,
    allowed_company_id: UUID | None = None,
    allowed_company_ids: list[UUID] | None = None,
    body: ExternalPaxUpsertBody,
) -> list[ExternalPaxMatchRead]:
    resolved_allowed_company_ids = allowed_company_ids or ([allowed_company_id] if allowed_company_id else [])
    matches = await paxlog_service.find_external_contact_matches(
        db,
        ads_id=ads_id,
        allowed_company_ids=resolved_allowed_company_ids,
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        nationality=body.nationality,
        badge_number=body.badge_number,
        email=body.email,
        phone=body.phone,
    )
    return [ExternalPaxMatchRead(**item) for item in matches]


async def _resolve_external_job_position(
    db: AsyncSession,
    *,
    entity_id: UUID,
    job_position_id: UUID | None,
) -> JobPosition | None:
    if not job_position_id:
        return None
    job_position = (
        await db.execute(
            select(JobPosition).where(
                JobPosition.id == job_position_id,
                JobPosition.entity_id == entity_id,
                JobPosition.active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not job_position:
        raise HTTPException(status_code=400, detail="Le poste sélectionné n'est pas valide pour cette entité")
    return job_position


async def _resolve_external_departure_base(
    db: AsyncSession,
    *,
    entity_id: UUID,
    base_id: UUID | None,
) -> Installation | None:
    if not base_id:
        return None
    installation = (
        await db.execute(
            select(Installation).where(
                Installation.id == base_id,
                Installation.entity_id == entity_id,
                Installation.archived == False,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if not installation:
        raise HTTPException(status_code=400, detail="Le point de départ sélectionné n'est pas valide pour cette entité")
    return installation


def _normalize_external_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


async def _load_pickup_address(
    db: AsyncSession,
    *,
    owner_type: str,
    owner_id: UUID | None,
) -> Address | None:
    if not owner_id:
        return None
    rows = (
        await db.execute(
            select(Address)
            .where(
                Address.owner_type == owner_type,
                Address.owner_id == owner_id,
                Address.label == "pickup",
            )
            .order_by(Address.is_default.desc(), Address.created_at.desc())
        )
    ).scalars().all()
    return rows[0] if rows else None


async def _upsert_pickup_address(
    db: AsyncSession,
    *,
    owner_type: str,
    owner_id: UUID | None,
    body: ExternalPaxUpsertBody,
) -> None:
    if not owner_id:
        return
    address_fields = {
        "address_line1": _normalize_external_text(body.pickup_address_line1),
        "address_line2": _normalize_external_text(body.pickup_address_line2),
        "city": _normalize_external_text(body.pickup_city),
        "state_province": _normalize_external_text(body.pickup_state_province),
        "postal_code": _normalize_external_text(body.pickup_postal_code),
        "country": _normalize_external_text(body.pickup_country),
    }
    existing = await _load_pickup_address(db, owner_type=owner_type, owner_id=owner_id)
    has_meaningful_pickup = any(
        value for key, value in address_fields.items() if key != "address_line2"
    )
    if not has_meaningful_pickup:
        if existing:
            await db.delete(existing)
        return
    if existing:
        existing.address_line1 = address_fields["address_line1"] or existing.address_line1
        existing.address_line2 = address_fields["address_line2"]
        existing.city = address_fields["city"] or existing.city
        existing.state_province = address_fields["state_province"]
        existing.postal_code = address_fields["postal_code"]
        existing.country = address_fields["country"] or existing.country
        return
    db.add(
        Address(
            owner_type=owner_type,
            owner_id=owner_id,
            label="pickup",
            address_line1=address_fields["address_line1"] or "",
            address_line2=address_fields["address_line2"],
            city=address_fields["city"] or "",
            state_province=address_fields["state_province"],
            postal_code=address_fields["postal_code"],
            country=address_fields["country"] or "",
            is_default=True,
        )
    )


async def _sync_external_pax_travel_profile(
    db: AsyncSession,
    *,
    contact: TierContact,
    body: ExternalPaxUpsertBody,
    linked_user: User | None = None,
) -> None:
    contact.contractual_airport = _normalize_external_text(body.contractual_airport)
    contact.nearest_airport = _normalize_external_text(body.nearest_airport)
    contact.nearest_station = _normalize_external_text(body.nearest_station)
    await _upsert_pickup_address(
        db,
        owner_type="tier_contact",
        owner_id=contact.id,
        body=body,
    )
    if not linked_user:
        return
    linked_user.contractual_airport = contact.contractual_airport
    linked_user.nearest_airport = contact.nearest_airport
    linked_user.nearest_station = contact.nearest_station
    await _upsert_pickup_address(
        db,
        owner_type="user",
        owner_id=linked_user.id,
        body=body,
    )


async def _apply_external_pax_contact_updates(
    db: AsyncSession,
    *,
    contact: TierContact,
    body: ExternalPaxUpsertBody,
    entity_id: UUID,
    linked_user: User | None = None,
) -> None:
    job_position = await _resolve_external_job_position(
        db,
        entity_id=entity_id,
        job_position_id=body.job_position_id,
    )
    contact.first_name = body.first_name
    contact.last_name = body.last_name
    contact.birth_date = body.birth_date
    contact.nationality = body.nationality
    contact.badge_number = body.badge_number
    contact.photo_url = body.photo_url
    contact.email = body.email
    contact.phone = body.phone
    contact.position = job_position.name if job_position else body.position
    contact.job_position_id = job_position.id if job_position else None
    await _sync_external_pax_travel_profile(db, contact=contact, linked_user=linked_user, body=body)


async def _send_external_link_otp(db: AsyncSession, *, link: ExternalAccessLink) -> None:
    if not link.otp_sent_to:
        raise HTTPException(status_code=400, detail="Aucun destinataire OTP n'est configuré pour ce lien")

    code = f"{secrets.randbelow(1000000):06d}"
    link.otp_code_hash = _hash_secret(code)
    link.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=EXTERNAL_OTP_TTL_MINUTES)
    link.otp_attempt_count = 0
    link.session_token_hash = None
    link.session_expires_at = None

    destination = link.otp_sent_to.strip()
    if "@" in destination:
        from app.core.email_templates import render_and_send_email

        ads = await db.get(Ads, link.ads_id)
        template_sent = False
        if ads:
            template_sent = await render_and_send_email(
                db,
                slug="paxlog_external_link_otp",
                entity_id=ads.entity_id,
                language="fr",
                to=destination,
                variables={
                    "otp_code": code,
                    "external_link_url": _build_external_portal_url(link.token),
                    "otp_expires_minutes": EXTERNAL_OTP_TTL_MINUTES,
                    "ads": {
                        "reference": ads.reference,
                        "visit_purpose": ads.visit_purpose,
                        "start_date": str(ads.start_date) if ads.start_date else "",
                        "end_date": str(ads.end_date) if ads.end_date else "",
                    },
                },
            )
        if not template_sent:
            raise RuntimeError("Template email OTP externe PaxLog indisponible")
        return

    from app.core.sms_service import send_whatsapp_otp

    sent, _channel = await send_whatsapp_otp(db, to=destination, otp_code=code)
    if not sent:
        raise HTTPException(status_code=503, detail="Impossible d'envoyer le code OTP")


async def _resolve_external_link_recipients(
    db: AsyncSession,
    *,
    ads_id: UUID,
) -> list[dict]:
    from app.core.sms_service import _get_admin_channel_default, _get_user_preferred_channel, _resolve_channel, resolve_user_contact

    rows = (
        await db.execute(select(AdsPax).where(AdsPax.ads_id == ads_id))
    ).scalars().all()

    admin_default = await _get_admin_channel_default(db, "otp")
    candidates: list[dict] = []

    for entry in rows:
        if entry.user_id:
            user = await db.get(User, entry.user_id)
            if not user:
                continue
            effective_channel = _resolve_channel(await _get_user_preferred_channel(db, str(user.id)), admin_default)
            email = await resolve_user_contact(db, str(user.id), "email") or user.email
            phone = await resolve_user_contact(db, str(user.id), "sms")
            preferred_destination = None
            if effective_channel == "email":
                preferred_destination = email or phone
            elif effective_channel in {"sms", "whatsapp"}:
                preferred_destination = phone or email
            else:
                preferred_destination = phone or email
            candidates.append({
                "user_id": user.id,
                "contact_id": None,
                "pax_source": "user",
                "label": f"{user.first_name} {user.last_name}",
                "email": email,
                "phone": phone,
                "effective_channel": effective_channel,
                "preferred_destination": preferred_destination,
            })
            continue

        if entry.contact_id:
            contact = await db.get(TierContact, entry.contact_id)
            if not contact:
                continue
            effective_channel = admin_default
            email = contact.email
            phone = contact.phone
            if effective_channel == "email":
                preferred_destination = email or phone
            elif effective_channel in {"sms", "whatsapp"}:
                preferred_destination = phone or email
            else:
                preferred_destination = phone or email
            candidates.append({
                "user_id": None,
                "contact_id": contact.id,
                "pax_source": "contact",
                "label": f"{contact.first_name} {contact.last_name}",
                "email": email,
                "phone": phone,
                "effective_channel": effective_channel,
                "preferred_destination": preferred_destination,
            })

    return [candidate for candidate in candidates if candidate["preferred_destination"]]


async def _resolve_external_link_destination(
    db: AsyncSession,
    *,
    ads_id: UUID,
    body: ExternalLinkCreateBody,
) -> tuple[str | None, dict | None]:
    if not body.otp_required:
        return None, None
    if body.otp_sent_to:
        destination = body.otp_sent_to.strip()
        if destination:
            return destination, {"source": "manual"}

    candidates = await _resolve_external_link_recipients(db, ads_id=ads_id)
    selected = None

    if body.recipient_user_id or body.recipient_contact_id:
        for candidate in candidates:
            if body.recipient_user_id and candidate["user_id"] == body.recipient_user_id:
                selected = candidate
                break
            if body.recipient_contact_id and candidate["contact_id"] == body.recipient_contact_id:
                selected = candidate
                break
        if not selected:
            raise HTTPException(status_code=400, detail="Le destinataire OTP sélectionné n'est pas valide pour cette AdS.")
    elif len(candidates) == 1:
        selected = candidates[0]
    elif len(candidates) > 1:
        raise HTTPException(status_code=400, detail="Plusieurs destinataires OTP sont disponibles. Sélectionnez le PAX destinataire.")
    else:
        raise HTTPException(status_code=400, detail="Aucun destinataire OTP exploitable n'est disponible sur les PAX de cette AdS.")

    return selected["preferred_destination"], {
        "source": "ads_pax",
        "effective_channel": selected["effective_channel"],
        "recipient_user_id": str(selected["user_id"]) if selected["user_id"] else None,
        "recipient_contact_id": str(selected["contact_id"]) if selected["contact_id"] else None,
        "recipient_label": selected["label"],
    }


@router.post("/ads/{ads_id}/external-link", status_code=201)
async def create_external_link(
    ads_id: UUID,
    body: ExternalLinkCreateBody,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.ads.update"),
    db: AsyncSession = Depends(get_db),
):
    """Generate a one-time external link for a Tiers to fill PAX data."""
    import secrets

    # Verify AdS
    ads_result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")

    # External links require at least one allowed company (for contact matching)
    allowed_ids, _ = await _get_ads_allowed_company_scope(db, ads_id=ads.id)
    if not allowed_ids:
        raise HTTPException(
            status_code=400,
            detail="Impossible de creer un lien externe : aucune entreprise autorisee n'est configuree sur cette AdS. "
                   "Ajoutez au moins une entreprise dans les parametres de l'AdS avant de generer un lien.",
        )

    if request is not None:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, request=request, entity_id=entity_id, db=db
        )
    else:
        can_manage_ads = await _can_manage_ads(
            ads, current_user=current_user, entity_id=entity_id, db=db
        )
    if not can_manage_ads:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas créer de lien externe pour cette AdS.")

    otp_sent_to, otp_meta = await _resolve_external_link_destination(
        db,
        ads_id=ads_id,
        body=body,
    )
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)
    link = ExternalAccessLink(
        ads_id=ads_id,
        token=token,
        created_by=current_user.id,
        preconfigured_data=body.preconfigured_data,
        otp_required=body.otp_required,
        otp_sent_to=otp_sent_to,
        expires_at=expires_at,
        max_uses=body.max_uses,
        use_count=0,
        revoked=False,
        access_log=[],
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)

    await record_audit(
        db,
        action="paxlog.external_link.create",
        resource_type="external_access_link",
        resource_id=str(link.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "ads_id": str(ads_id),
            "expires_hours": body.expires_hours,
            "otp_required": body.otp_required,
            "otp_sent_to": otp_sent_to,
            "otp_resolution": otp_meta,
        },
    )
    await db.commit()

    logger.info("External link created for AdS %s by %s", ads.reference, current_user.id)

    return {
        "id": str(link.id),
        "ads_id": str(ads_id),
        "token": token,
        "url": _build_external_portal_url(token),
        "otp_required": body.otp_required,
        "otp_sent_to": otp_sent_to,
        "expires_at": expires_at.isoformat(),
        "max_uses": body.max_uses,
        "use_count": link.use_count,
        "active": not link.revoked,
        "created_at": link.created_at.isoformat() if getattr(link, "created_at", None) else datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ads/{ads_id}/external-links", response_model=list[AdsExternalLinkSecurityRead])
async def list_ads_external_links(
    ads_id: UUID,
    request: Request = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    ads_result = await db.execute(select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id))
    ads = ads_result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    await _assert_ads_read_access(ads, current_user=current_user, request=request, entity_id=entity_id, db=db)
    result = await db.execute(
        select(ExternalAccessLink)
        .where(ExternalAccessLink.ads_id == ads_id)
        .order_by(ExternalAccessLink.created_at.desc())
    )
    return [_build_external_link_security_read(link) for link in result.scalars().all()]


@router.get("/external/{token}")
async def access_external_link(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint — returns link metadata without exposing internal dossier fields."""
    link = await _get_external_link_or_404(db, token)
    authenticated = False
    if link.otp_required and x_external_session:
        try:
            await _require_external_session(db, token=token, session_token=x_external_session, request=request)
            authenticated = True
        except HTTPException:
            authenticated = False
    if not authenticated and link.otp_required:
        if _count_recent_external_actions(
            link,
            action="public_access",
            window_minutes=EXTERNAL_PUBLIC_ACCESS_WINDOW_MINUTES,
        ) >= EXTERNAL_PUBLIC_ACCESS_MAX_PER_WINDOW:
            _append_external_access_log(
                link,
                action="public_access_rate_limited",
                request=request,
                otp_validated=False,
                metadata={
                    "window_minutes": EXTERNAL_PUBLIC_ACCESS_WINDOW_MINUTES,
                    "max_per_window": EXTERNAL_PUBLIC_ACCESS_MAX_PER_WINDOW,
                },
            )
            await db.commit()
            raise HTTPException(status_code=429, detail="Trop de consultations publiques récentes pour ce lien")
        _append_external_access_log(link, action="public_access", request=request, otp_validated=False)
        await db.commit()
    elif authenticated:
        _append_external_access_log(link, action="authenticated_access", request=request, otp_validated=True)
        await db.commit()

    return {
        "ads_id": str(link.ads_id),
        "authenticated": authenticated or not link.otp_required,
        "otp_required": link.otp_required,
        "otp_destination_masked": _mask_contact_value(link.otp_sent_to),
        "preconfigured_data": link.preconfigured_data if authenticated or not link.otp_required else None,
        "remaining_uses": max(link.max_uses - link.use_count, 0) if link.max_uses else None,
        "expires_at": link.expires_at.isoformat(),
    }


@router.post("/external/{token}/otp/send")
async def send_external_link_otp(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    link = await _get_external_link_or_404(db, token)
    if not link.otp_required:
        return {"otp_required": False, "message": "OTP non requis pour ce lien"}
    if _count_recent_external_actions(
        link,
        action="otp_sent",
        window_minutes=EXTERNAL_OTP_SEND_WINDOW_MINUTES,
    ) >= EXTERNAL_OTP_SEND_MAX_PER_WINDOW:
        _append_external_access_log(
            link,
            action="otp_rate_limited",
            request=request,
            otp_validated=False,
            metadata={
                "window_minutes": EXTERNAL_OTP_SEND_WINDOW_MINUTES,
                "max_per_window": EXTERNAL_OTP_SEND_MAX_PER_WINDOW,
            },
        )
        await db.commit()
        raise HTTPException(status_code=429, detail="Trop de demandes OTP récentes pour ce lien")

    await _send_external_link_otp(db, link=link)
    _append_external_access_log(link, action="otp_sent", request=request, otp_validated=False)
    await db.commit()
    return {
        "otp_required": True,
        "destination_masked": _mask_contact_value(link.otp_sent_to),
        "expires_in_seconds": EXTERNAL_OTP_TTL_MINUTES * 60,
    }


@router.post("/external/{token}/otp/verify")
async def verify_external_link_otp(
    token: str,
    body: ExternalOtpVerifyBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    link = await _get_external_link_or_404(db, token)
    if not link.otp_required:
        session_token = secrets.token_urlsafe(32)
        link.session_token_hash = _hash_secret(session_token)
        link.session_expires_at = datetime.now(timezone.utc) + timedelta(minutes=EXTERNAL_SESSION_TTL_MINUTES)
        link.last_validated_at = datetime.now(timezone.utc)
        _append_external_access_log(link, action="session_opened", request=request, otp_validated=True)
        await db.commit()
        return paxlog_service.build_external_session_open_payload(
            session_token=session_token,
            ttl_minutes=EXTERNAL_SESSION_TTL_MINUTES,
        )

    if _count_recent_external_actions(
        link,
        action="otp_failed",
        window_minutes=EXTERNAL_OTP_VERIFY_WINDOW_MINUTES,
    ) >= EXTERNAL_OTP_VERIFY_MAX_PER_WINDOW:
        _append_external_access_log(
            link,
            action="otp_verify_rate_limited",
            request=request,
            otp_validated=False,
            metadata={
                "window_minutes": EXTERNAL_OTP_VERIFY_WINDOW_MINUTES,
                "max_per_window": EXTERNAL_OTP_VERIFY_MAX_PER_WINDOW,
            },
        )
        await db.commit()
        raise HTTPException(status_code=429, detail="Trop de tentatives OTP récentes pour ce lien")

    otp_ok, otp_error = paxlog_service.verify_external_otp_code(
        expected_hash=link.otp_code_hash,
        provided_hash=_hash_secret(body.code.strip()),
        otp_expires_at=link.otp_expires_at,
        otp_attempt_count=link.otp_attempt_count,
        max_attempts=EXTERNAL_OTP_MAX_ATTEMPTS,
        now=datetime.now(timezone.utc),
    )
    if otp_error == "missing_otp":
        raise HTTPException(status_code=400, detail="Aucun OTP actif pour ce lien")
    if otp_error == "expired":
        raise HTTPException(status_code=410, detail="Le code OTP a expiré")
    if otp_error == "locked":
        _append_external_access_log(
            link,
            action="otp_locked",
            request=request,
            otp_validated=False,
            metadata={"max_attempts": EXTERNAL_OTP_MAX_ATTEMPTS},
        )
        await db.commit()
        raise HTTPException(status_code=429, detail="Nombre maximal de tentatives OTP atteint")
    if not otp_ok:
        link.otp_attempt_count += 1
        _append_external_access_log(link, action="otp_failed", request=request, otp_validated=False)
        await db.commit()
        raise HTTPException(status_code=400, detail="Code OTP invalide")

    session_token = secrets.token_urlsafe(32)
    link.otp_code_hash = None
    link.otp_expires_at = None
    link.otp_attempt_count = 0
    link.session_token_hash = _hash_secret(session_token)
    link.session_expires_at = datetime.now(timezone.utc) + timedelta(minutes=EXTERNAL_SESSION_TTL_MINUTES)
    link.last_validated_at = datetime.now(timezone.utc)
    link.use_count += 1
    _append_external_access_log(link, action="otp_validated", request=request, otp_validated=True)
    await db.commit()
    return paxlog_service.build_external_session_open_payload(
        session_token=session_token,
        ttl_minutes=EXTERNAL_SESSION_TTL_MINUTES,
    )


@router.get("/external/{token}/dossier", response_model=ExternalAdsDossierRead)
async def get_external_ads_dossier(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    ads, _entity_id, fallback_company_id = await _get_external_ads_and_context(db, link=link)
    allowed_company_ids, allowed_company_names, primary_company_id, primary_company_name = await _resolve_external_allowed_companies(
        db,
        ads=ads,
        link=link,
        fallback_company_id=fallback_company_id,
    )
    preconfigured_data = link.preconfigured_data or {}
    site_name_result = await db.execute(
        text("SELECT name FROM ar_installations WHERE id = :asset_id"),
        {"asset_id": str(ads.site_entry_asset_id)},
    )
    site_name = site_name_result.scalar_one_or_none()
    departure_base_names: dict[UUID, str] = {}
    departure_base_ids = [
        base_id for base_id in (ads.outbound_departure_base_id, ads.return_departure_base_id) if base_id
    ]
    if departure_base_ids:
        departure_base_rows = (
            await db.execute(
                select(Installation.id, Installation.code, Installation.name)
                .where(Installation.id.in_(departure_base_ids))
            )
        ).all()
        departure_base_names = {
            row[0]: f"{row[1]} — {row[2]}" if row[1] else row[2]
            for row in departure_base_rows
        }
    linked_project_rows = (
        await db.execute(
            select(Project.id, Project.code, Project.name)
            .where(
                Project.id.in_(
                    select(CostImputation.project_id).where(
                        CostImputation.owner_type == "ads",
                        CostImputation.owner_id == ads.id,
                        CostImputation.project_id.isnot(None),
                    )
                )
            )
            .order_by(Project.code, Project.name)
        )
    ).all()
    linked_projects = [
        {
            "project_id": str(row[0]),
            "project_name": f"{row[1]} — {row[2]}" if row[1] else row[2],
        }
        for row in linked_project_rows
    ]
    if not linked_projects and ads.project_id:
        project_result = await db.execute(
            select(Project.id, Project.code, Project.name).where(Project.id == ads.project_id)
        )
        project_row = project_result.first()
        if project_row:
            linked_projects = [{
                "project_id": str(project_row[0]),
                "project_name": f"{project_row[1]} — {project_row[2]}" if project_row[1] else project_row[2],
            }]
    primary_project = linked_projects[0] if len(linked_projects) == 1 else None
    allowed_pax, pax_summary = await paxlog_service.build_external_dossier_pax_data(
        db,
        ads_id=ads.id,
        allowed_company_ids=allowed_company_ids,
    )
    submission_blockers = _build_external_submission_blockers(
        ads=ads,
        pax_summary=pax_summary,
        allowed_pax=allowed_pax,
    )
    ready_for_submission = len(submission_blockers) == 0
    _append_external_access_log(link, action="view_dossier", request=request, otp_validated=True)
    await db.commit()
    return {
        "ads": {
            "id": str(ads.id),
            "reference": ads.reference,
            "status": ads.status,
            "visit_purpose": ads.visit_purpose,
            "visit_category": ads.visit_category,
            "start_date": ads.start_date.isoformat(),
            "end_date": ads.end_date.isoformat(),
            "site_entry_asset_id": str(ads.site_entry_asset_id),
            "site_name": site_name,
            "project_id": primary_project["project_id"] if primary_project else None,
            "project_name": primary_project["project_name"] if primary_project else None,
            "linked_projects": linked_projects,
            "outbound_transport_mode": getattr(ads, "outbound_transport_mode", None),
            "outbound_departure_base_id": str(getattr(ads, "outbound_departure_base_id", None)) if getattr(ads, "outbound_departure_base_id", None) else None,
            "outbound_departure_base_name": departure_base_names.get(getattr(ads, "outbound_departure_base_id", None)) if getattr(ads, "outbound_departure_base_id", None) else None,
            "outbound_notes": getattr(ads, "outbound_notes", None),
            "return_transport_mode": getattr(ads, "return_transport_mode", None),
            "return_departure_base_id": str(getattr(ads, "return_departure_base_id", None)) if getattr(ads, "return_departure_base_id", None) else None,
            "return_departure_base_name": departure_base_names.get(getattr(ads, "return_departure_base_id", None)) if getattr(ads, "return_departure_base_id", None) else None,
            "return_notes": getattr(ads, "return_notes", None),
            "rejection_reason": ads.rejection_reason,
        },
        "preconfigured_data": preconfigured_data,
        "allowed_company_id": str(primary_company_id) if primary_company_id else None,
        "allowed_company_name": primary_company_name or preconfigured_data.get("company_name"),
        "allowed_company_ids": [str(company_id) for company_id in allowed_company_ids],
        "allowed_company_names": allowed_company_names,
        "scope_label": ", ".join(allowed_company_names) if allowed_company_names else None,
        "ready_for_submission": ready_for_submission,
        "submission_blockers": submission_blockers,
        "can_submit": ads.status == "draft" and ready_for_submission,
        "can_resubmit": ads.status == "requires_review" and ready_for_submission,
        "pax_summary": pax_summary,
        "pax": allowed_pax,
    }


@router.get("/external/{token}/credential-types", response_model=list[CredentialTypeRead])
async def list_external_credential_types(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    result = await db.execute(
        select(CredentialType)
        .where(CredentialType.active == True)  # noqa: E712
        .order_by(CredentialType.category, CredentialType.name)
    )
    return result.scalars().all()


@router.get("/external/{token}/job-positions", response_model=list[JobPositionRead])
async def list_external_job_positions(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    ads, entity_id, _allowed_company_id = await _get_external_ads_and_context(db, link=link)
    result = await db.execute(
        select(JobPosition)
        .where(
            JobPosition.entity_id == entity_id,
            JobPosition.active == True,  # noqa: E712
        )
        .order_by(JobPosition.department.asc(), JobPosition.name.asc())
    )
    return result.scalars().all()


@router.get("/external/{token}/departure-bases", response_model=list[ExternalDepartureBaseRead])
async def list_external_departure_bases(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    _ads, entity_id, _allowed_company_id = await _get_external_ads_and_context(db, link=link)
    result = await db.execute(
        select(Installation)
        .where(
            Installation.entity_id == entity_id,
            Installation.archived == False,  # noqa: E712
        )
        .order_by(Installation.code.asc(), Installation.name.asc())
    )
    return result.scalars().all()


@router.patch("/external/{token}/transport-preferences")
async def update_external_transport_preferences(
    token: str,
    body: ExternalTransportPreferencesBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    ads, entity_id, _allowed_company_id = await _get_external_ads_and_context(db, link=link)
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(status_code=400, detail="Le dossier n'accepte plus de modification externe")

    outbound_base = await _resolve_external_departure_base(
        db,
        entity_id=entity_id,
        base_id=body.outbound_departure_base_id,
    )
    return_base = await _resolve_external_departure_base(
        db,
        entity_id=entity_id,
        base_id=body.return_departure_base_id,
    )

    ads.outbound_departure_base_id = outbound_base.id if outbound_base else None
    ads.outbound_notes = _normalize_external_text(body.outbound_notes)
    ads.return_departure_base_id = return_base.id if return_base else None
    ads.return_notes = _normalize_external_text(body.return_notes)
    _append_external_access_log(link, action="update_transport_preferences", request=request, otp_validated=True)
    await db.commit()

    await record_audit(
        db,
        action="paxlog.external.transport_preferences.update",
        resource_type="ads",
        resource_id=str(ads.id),
        entity_id=entity_id,
        details={
            "link_id": str(link.id),
            "outbound_departure_base_id": str(ads.outbound_departure_base_id) if ads.outbound_departure_base_id else None,
            "return_departure_base_id": str(ads.return_departure_base_id) if ads.return_departure_base_id else None,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return {"ads_id": str(ads.id)}


@router.post("/external/{token}/pax/matches", response_model=list[ExternalPaxMatchRead])
async def find_external_ads_pax_matches(
    token: str,
    body: ExternalPaxUpsertBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link, ads, _entity_id, allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _require_external_scope(
        db,
        token=token,
        request=request,
        session_token=x_external_session,
    )
    if not allowed_company_ids:
        raise HTTPException(status_code=400, detail="Aucune entreprise cible n'est configurée sur ce lien externe")
    has_lookup_signal = (
        (body.first_name.strip() and body.last_name.strip())
        or bool(body.badge_number)
        or bool(body.email)
        or bool(body.phone)
    )
    if not has_lookup_signal:
        return []
    if len(allowed_company_ids) == 1:
        return await _find_external_contact_matches(
            db,
            ads_id=ads.id,
            allowed_company_id=allowed_company_ids[0],
            body=body,
        )
    return await _find_external_contact_matches(
        db,
        ads_id=ads.id,
        allowed_company_ids=allowed_company_ids,
        body=body,
    )


@router.post("/external/{token}/pax", status_code=201)
async def create_external_ads_pax(
    token: str,
    body: ExternalPaxUpsertBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link, ads, entity_id, allowed_company_ids, _allowed_company_names, primary_company_id, _primary_company_name = await _require_external_scope(
        db,
        token=token,
        request=request,
        session_token=x_external_session,
    )
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(status_code=400, detail="Le dossier n'accepte plus de modification externe")
    if not allowed_company_ids:
        raise HTTPException(status_code=400, detail="Aucune entreprise cible n'est configurée sur ce lien externe")
    if len(allowed_company_ids) == 1:
        matches = await _find_external_contact_matches(
            db,
            ads_id=ads.id,
            allowed_company_id=allowed_company_ids[0],
            body=body,
        )
    else:
        matches = await _find_external_contact_matches(
            db,
            ads_id=ads.id,
            allowed_company_ids=allowed_company_ids,
            body=body,
        )
    if matches:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "EXTERNAL_PAX_DUPLICATE_MATCH",
                "message": "Un contact similaire existe déjà pour cette entreprise. Confirmez le candidat existant au lieu de créer un doublon.",
                "matches": [match.model_dump(mode="json") for match in matches],
            },
        )

    contact = TierContact(
        tier_id=primary_company_id or allowed_company_ids[0],
        first_name=body.first_name,
        last_name=body.last_name,
        birth_date=body.birth_date,
        nationality=body.nationality,
        badge_number=body.badge_number,
        photo_url=body.photo_url,
        email=body.email,
        phone=body.phone,
        position=body.position,
        job_position_id=None,
    )
    db.add(contact)
    await db.flush()
    await _apply_external_pax_contact_updates(
        db,
        contact=contact,
        body=body,
        entity_id=entity_id,
    )
    db.add(AdsPax(ads_id=ads.id, contact_id=contact.id, status="pending_check"))
    _append_external_access_log(link, action="create_pax", request=request, otp_validated=True)
    await db.commit()

    await record_audit(
        db,
        action="paxlog.external.pax.create",
        resource_type="tier_contact",
        resource_id=str(contact.id),
        entity_id=entity_id,
        details={"ads_id": str(ads.id), "link_id": str(link.id)},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return {"contact_id": str(contact.id), "ads_id": str(ads.id)}


@router.post("/external/{token}/pax/{contact_id}/attach-existing", status_code=201)
async def attach_existing_external_ads_pax(
    token: str,
    contact_id: UUID,
    body: ExternalPaxUpsertBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link, ads, entity_id, allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _require_external_scope(
        db,
        token=token,
        request=request,
        session_token=x_external_session,
    )
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(status_code=400, detail="Le dossier n'accepte plus de modification externe")
    if not allowed_company_ids:
        raise HTTPException(status_code=400, detail="Aucune entreprise cible n'est configurée sur ce lien externe")

    contact = await db.get(TierContact, contact_id)
    if not contact or contact.tier_id not in allowed_company_ids or not contact.active:
        raise HTTPException(status_code=404, detail="Contact externe introuvable pour l'entreprise autorisée")
    match_score, match_reasons = _score_external_contact_match(contact=contact, body=body)
    if not _is_external_contact_match_strong(score=match_score, reasons=match_reasons):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "EXTERNAL_PAX_ATTACH_REQUIRES_MATCH",
                "message": "Ce contact ne correspond pas suffisamment aux informations saisies",
                "match_score": match_score,
                "match_reasons": match_reasons,
            },
        )

    existing_entry = (
        await db.execute(
            select(AdsPax).where(
                AdsPax.ads_id == ads.id,
                AdsPax.contact_id == contact.id,
            )
        )
    ).scalar_one_or_none()
    if not existing_entry:
        db.add(AdsPax(ads_id=ads.id, contact_id=contact.id, status="pending_check"))
    linked_user = (
        await db.execute(select(User).where(User.tier_contact_id == contact.id))
    ).scalar_one_or_none()

    await _apply_external_pax_contact_updates(
        db,
        contact=contact,
        body=body,
        entity_id=entity_id,
        linked_user=linked_user,
    )
    _append_external_access_log(link, action="attach_existing_pax", request=request, otp_validated=True)
    await db.commit()

    await record_audit(
        db,
        action="paxlog.external.pax.attach_existing",
        resource_type="tier_contact",
        resource_id=str(contact.id),
        entity_id=entity_id,
        details={"ads_id": str(ads.id), "link_id": str(link.id), "already_linked": existing_entry is not None},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return {"contact_id": str(contact.id), "ads_id": str(ads.id), "already_linked": existing_entry is not None}


@router.patch("/external/{token}/pax/{contact_id}")
async def update_external_ads_pax(
    token: str,
    contact_id: UUID,
    body: ExternalPaxUpsertBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link, ads, entity_id, allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _require_external_scope(
        db,
        token=token,
        request=request,
        session_token=x_external_session,
    )
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(status_code=400, detail="Le dossier n'accepte plus de modification externe")

    result = await db.execute(
        select(AdsPax, TierContact)
        .join(TierContact, TierContact.id == AdsPax.contact_id)
        .where(AdsPax.ads_id == ads.id, TierContact.id == contact_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="PAX externe introuvable sur cette AdS")
    _entry, contact = row
    if allowed_company_ids and contact.tier_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="Ce PAX n'appartient pas à l'entreprise autorisée")
    linked_user = (
        await db.execute(select(User).where(User.tier_contact_id == contact.id))
    ).scalar_one_or_none()

    await _apply_external_pax_contact_updates(
        db,
        contact=contact,
        body=body,
        entity_id=entity_id,
        linked_user=linked_user,
    )
    _append_external_access_log(link, action="update_pax", request=request, otp_validated=True)
    await db.commit()

    await record_audit(
        db,
        action="paxlog.external.pax.update",
        resource_type="tier_contact",
        resource_id=str(contact.id),
        entity_id=entity_id,
        details={"ads_id": str(ads.id), "link_id": str(link.id)},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return {"contact_id": str(contact.id), "ads_id": str(ads.id)}


@router.post("/external/{token}/pax/{contact_id}/credentials", status_code=201)
async def create_external_ads_pax_credential(
    token: str,
    contact_id: UUID,
    body: ExternalCredentialCreateBody,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link, ads, entity_id, allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _require_external_scope(
        db,
        token=token,
        request=request,
        session_token=x_external_session,
    )
    if ads.status not in {"draft", "requires_review"}:
        raise HTTPException(status_code=400, detail="Le dossier n'accepte plus de modification externe")

    result = await db.execute(
        select(AdsPax, TierContact)
        .join(TierContact, TierContact.id == AdsPax.contact_id)
        .where(AdsPax.ads_id == ads.id, TierContact.id == contact_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="PAX externe introuvable sur cette AdS")
    _entry, contact = row
    if allowed_company_ids and contact.tier_id not in allowed_company_ids:
        raise HTTPException(status_code=403, detail="Ce PAX n'appartient pas à l'entreprise autorisée")

    credential = PaxCredential(
        contact_id=contact.id,
        credential_type_id=body.credential_type_id,
        obtained_date=body.obtained_date,
        expiry_date=body.expiry_date,
        proof_url=body.proof_url,
        notes=body.notes,
        status="pending_validation",
    )
    db.add(credential)
    _append_external_access_log(link, action="create_credential", request=request, otp_validated=True)
    await db.commit()
    await db.refresh(credential)

    await record_audit(
        db,
        action="paxlog.external.credential.create",
        resource_type="pax_credential",
        resource_id=str(credential.id),
        entity_id=entity_id,
        details={"ads_id": str(ads.id), "contact_id": str(contact.id), "link_id": str(link.id)},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return credential


async def _finalize_external_ads_submission(
    *,
    link: ExternalAccessLink,
    ads: Ads,
    entity_id: UUID,
    reason: str | None,
    event_type: str,
    old_status: str,
    request: Request,
    db: AsyncSession,
) -> Ads:
    pax_entries, has_compliance_issues, target_status = await _run_ads_submission_checks(
        db,
        ads=ads,
        entity_id=entity_id,
    )
    ads.status = target_status
    ads.submitted_at = func.now()

    db.add(AdsEvent(
        entity_id=entity_id,
        ads_id=ads.id,
        event_type=event_type,
        old_status=old_status,
        new_status=target_status,
        actor_id=None,
        reason=reason,
    ))
    _append_external_access_log(link, action=event_type, request=request, otp_validated=True)
    await db.commit()
    await db.refresh(ads)

    await record_audit(
        db,
        action=f"paxlog.external.{event_type}",
        resource_type="ads",
        resource_id=str(ads.id),
        entity_id=entity_id,
        details={
            "reference": ads.reference,
            "pax_count": len(pax_entries),
            "compliance_issues": has_compliance_issues,
            "link_id": str(link.id),
            "reason": reason,
        },
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    await db.commit()
    return ads


def _build_external_submission_blockers(
    *,
    ads: Ads,
    pax_summary: dict | None,
    allowed_pax: list[dict[str, object | None]] | None = None,
) -> list[str]:
    summary = pax_summary or {}
    blockers: list[str] = []
    pax_items = allowed_pax or []
    if int(summary.get("total") or 0) <= 0:
        blockers.append("Ajoutez au moins un PAX au dossier.")
    blocked_pax = [
        f"{str(item.get('first_name') or '').strip()} {str(item.get('last_name') or '').strip()}".strip()
        for item in pax_items
        if str(item.get("status") or "") == "blocked"
    ]
    pending_pax = [
        f"{str(item.get('first_name') or '').strip()} {str(item.get('last_name') or '').strip()}".strip()
        for item in pax_items
        if str(item.get("status") or "") == "pending_check"
    ]
    if blocked_pax:
        blockers.append(f"PAX bloqués en conformité: {', '.join(name for name in blocked_pax if name) }.")
    elif int(summary.get("blocked") or 0) > 0:
        blockers.append("Au moins un PAX présente des blocages de conformité.")
    if pending_pax:
        blockers.append(f"PAX encore en attente de vérification: {', '.join(name for name in pending_pax if name)}.")
    elif int(summary.get("pending_check") or 0) > 0:
        blockers.append("Certains PAX ont encore des éléments en attente de vérification.")
    if getattr(ads, "outbound_transport_mode", None) and not getattr(ads, "outbound_departure_base_id", None):
        blockers.append("Renseignez le point de départ aller.")
    if getattr(ads, "return_transport_mode", None) and not getattr(ads, "return_departure_base_id", None):
        blockers.append("Renseignez le point de départ retour.")
    return blockers


@router.post("/external/{token}/submit", response_model=AdsRead)
async def submit_external_ads(
    token: str,
    request: Request,
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    ads, entity_id, _allowed_company_id = await _get_external_ads_and_context(db, link=link)
    if ads.status != "draft":
        raise HTTPException(status_code=400, detail=f"Impossible de soumettre ce dossier avec le statut '{ads.status}'")
    allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _resolve_external_allowed_companies(
        db,
        ads=ads,
        link=link,
        fallback_company_id=None,
    )
    allowed_pax, pax_summary = await paxlog_service.build_external_dossier_pax_data(
        db,
        ads_id=ads.id,
        allowed_company_ids=allowed_company_ids,
    )
    blockers = _build_external_submission_blockers(ads=ads, pax_summary=pax_summary, allowed_pax=allowed_pax)
    if blockers:
        raise HTTPException(status_code=400, detail={"message": "Le dossier externe n'est pas prêt pour soumission.", "blockers": blockers})
    return await _finalize_external_ads_submission(
        link=link,
        ads=ads,
        entity_id=entity_id,
        reason=None,
        event_type="external_submitted",
        old_status="draft",
        request=request,
        db=db,
    )


@router.post("/external/{token}/resubmit", response_model=AdsRead)
async def resubmit_external_ads(
    token: str,
    request: Request,
    reason: str = Body(..., min_length=1, embed=True),
    x_external_session: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    link = await _require_external_session(db, token=token, session_token=x_external_session, request=request)
    ads, entity_id, _allowed_company_id = await _get_external_ads_and_context(db, link=link)
    if ads.status != "requires_review":
        raise HTTPException(status_code=400, detail=f"Impossible de re-soumettre ce dossier avec le statut '{ads.status}'")
    allowed_company_ids, _allowed_company_names, _primary_company_id, _primary_company_name = await _resolve_external_allowed_companies(
        db,
        ads=ads,
        link=link,
        fallback_company_id=None,
    )
    allowed_pax, pax_summary = await paxlog_service.build_external_dossier_pax_data(
        db,
        ads_id=ads.id,
        allowed_company_ids=allowed_company_ids,
    )
    blockers = _build_external_submission_blockers(ads=ads, pax_summary=pax_summary, allowed_pax=allowed_pax)
    if blockers:
        raise HTTPException(status_code=400, detail={"message": "Le dossier externe n'est pas prêt pour re-soumission.", "blockers": blockers})
    return await _finalize_external_ads_submission(
        link=link,
        ads=ads,
        entity_id=entity_id,
        reason=reason,
        event_type="external_resubmitted",
        old_status="requires_review",
        request=request,
        db=db,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# STAY PROGRAMS (deplacements intra-champ)
# ═══════════════════════════════════════════════════════════════════════════════

STAY_PROGRAM_ACTIVE_ADS_STATUSES = {"approved", "in_progress"}


def _ensure_stay_program_ads_status(ads_status: str) -> None:
    if ads_status not in STAY_PROGRAM_ACTIVE_ADS_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Le programme de sejour n'est autorise que pour une AdS approuvee ou en cours.",
        )


async def _get_stay_program_ads_or_404(
    ads_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
) -> Ads:
    result = await db.execute(
        select(Ads).where(Ads.id == ads_id, Ads.entity_id == entity_id)
    )
    ads = result.scalar_one_or_none()
    if not ads:
        raise HTTPException(status_code=404, detail="AdS not found")
    return ads


async def _ensure_stay_program_target_belongs_to_ads(
    ads_id: UUID,
    db: AsyncSession,
    *,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
) -> None:
    conditions = [AdsPax.ads_id == ads_id]
    if user_id:
        conditions.append(AdsPax.user_id == user_id)
    elif contact_id:
        conditions.append(AdsPax.contact_id == contact_id)
    else:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    pax_result = await db.execute(select(AdsPax.id).where(*conditions))
    if not pax_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Le PAX cible doit deja appartenir a cette AdS.",
        )


async def _can_read_ads(
    ads: Ads,
    *,
    current_user: User,
    request: Request | None = None,
    entity_id: UUID,
    db: AsyncSession,
) -> bool:
    acting_user_id = current_user.id
    if request is not None:
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    if ads.requester_id == acting_user_id:
        return True
    if ads.created_by == acting_user_id:
        return True
    return await has_user_permission(current_user, entity_id, "paxlog.ads.read_all", db)


async def _assert_ads_read_access(
    ads: Ads,
    *,
    current_user: User,
    request: Request | None = None,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    if not await _can_read_ads(ads, current_user=current_user, request=request, entity_id=entity_id, db=db):
        raise HTTPException(status_code=404, detail="AdS not found")


async def _can_manage_ads(
    ads: Ads,
    *,
    current_user: User,
    request: Request | None = None,
    entity_id: UUID,
    db: AsyncSession,
) -> bool:
    acting_user_id = current_user.id
    if request is not None:
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    if ads.requester_id == acting_user_id:
        return True
    if ads.created_by == acting_user_id:
        return True
    return await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)


async def _assert_ads_initiator_review_access(
    ads: Ads,
    *,
    current_user: User,
    request: Request | None = None,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    acting_user_id = current_user.id
    if request is not None:
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
    if acting_user_id != ads.requester_id and not can_approve:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas valider cette revue initiateur.")


async def _assert_ads_project_review_access(
    ads: Ads,
    *,
    current_user: User,
    request: Request | None = None,
    entity_id: UUID,
    db: AsyncSession,
) -> Project | None:
    acting_user_id = current_user.id
    if request is not None:
        acting_user_id = await get_effective_actor_user_id(request, current_user, entity_id, db)
    pending_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
    if not pending_targets:
        raise HTTPException(status_code=400, detail="Aucune validation projet n'est attendue sur cette AdS.")
    can_update_project = await has_user_permission(current_user, entity_id, "project.update", db)
    can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
    current_target = next(
        (target for target in pending_targets if target.get("project_manager_id") == acting_user_id),
        None,
    )
    if current_target is None and not can_update_project and not can_approve:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas valider cette revue projet.")
    if current_target is None:
        return None
    return await db.get(Project, current_target["project_id"])


async def _assert_ads_compliance_review_access(
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    can_manage_compliance = await has_user_permission(current_user, entity_id, "paxlog.compliance.manage", db)
    if not can_manage_compliance:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas valider cette revue conformité.")


async def _assert_ads_final_approval_access(
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    can_approve = await has_user_permission(current_user, entity_id, "paxlog.ads.approve", db)
    if not can_approve:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas approuver cette AdS.")


async def _get_ads_linked_project_details(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> list[dict]:
    linked_project_rows = (
        await db.execute(
            select(
                Project.id,
                Project.manager_id,
                Project.code,
                Project.name,
                User.first_name,
                User.last_name,
            )
            .outerjoin(User, Project.manager_id == User.id)
            .where(
                Project.entity_id == entity_id,
                Project.id.in_(
                    select(CostImputation.project_id).where(
                        CostImputation.owner_type == "ads",
                        CostImputation.owner_id == ads.id,
                        CostImputation.project_id.isnot(None),
                    )
                ),
            )
            .order_by(Project.code, Project.name)
        )
    ).all()

    linked_projects = [
        {
            "project_id": row[0],
            "project_name": f"{row[2]} — {row[3]}" if row[2] else row[3],
            "project_manager_id": row[1],
            "project_manager_name": f"{row[4]} {row[5]}".strip() if row[4] else None,
        }
        for row in linked_project_rows
    ]

    if not linked_projects and ads.project_id:
        project_result = await db.execute(
            select(Project.id, Project.manager_id, Project.code, Project.name, User.first_name, User.last_name)
            .outerjoin(User, Project.manager_id == User.id)
            .where(Project.id == ads.project_id, Project.entity_id == entity_id)
        )
        project_row = project_result.first()
        if project_row:
            linked_projects = [{
                "project_id": project_row[0],
                "project_name": f"{project_row[2]} — {project_row[3]}" if project_row[2] else project_row[3],
                "project_manager_id": project_row[1],
                "project_manager_name": f"{project_row[4]} {project_row[5]}".strip() if project_row[4] else None,
            }]
    return linked_projects


async def _get_ads_project_review_approved_ids(
    db: AsyncSession,
    *,
    ads_id: UUID,
) -> set[UUID]:
    approved_events = (
        await db.execute(
            select(AdsEvent.metadata_json).where(
                AdsEvent.ads_id == ads_id,
                AdsEvent.event_type == "project_review_approved",
            )
        )
    ).all()
    approved_ids: set[UUID] = set()
    for (metadata,) in approved_events:
        if not isinstance(metadata, dict):
            continue
        project_id = metadata.get("project_id")
        if project_id:
            try:
                approved_ids.add(UUID(str(project_id)))
            except (TypeError, ValueError):
                pass
        for item in metadata.get("project_ids", []) or []:
            try:
                approved_ids.add(UUID(str(item)))
            except (TypeError, ValueError):
                continue
    return approved_ids


async def _get_ads_pending_project_review_targets(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> list[dict]:
    origin_result = await db.execute(
        select(MissionProgram.id).where(MissionProgram.generated_ads_id == ads.id).limit(1)
    )
    if origin_result.scalar_one_or_none():
        return []
    linked_projects = await _get_ads_linked_project_details(db, ads=ads, entity_id=entity_id)
    review_targets = [item for item in linked_projects if item.get("project_manager_id")]
    if not review_targets:
        return []
    approved_ids = await _get_ads_project_review_approved_ids(db, ads_id=ads.id)
    return [item for item in review_targets if item["project_id"] not in approved_ids]


async def _get_ads_project_reviewer(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> Project | None:
    pending_targets = await _get_ads_pending_project_review_targets(db, ads=ads, entity_id=entity_id)
    if not pending_targets:
        return None
    return await db.get(Project, pending_targets[0]["project_id"])


async def _build_ads_read_data(
    db: AsyncSession,
    *,
    ads: Ads,
    entity_id: UUID,
) -> dict:
    data = AdsRead.model_validate(ads).model_dump()
    allowed_company_ids, allowed_company_names = await _get_ads_allowed_company_scope(db, ads_id=ads.id)
    data.update({
        "allowed_company_ids": allowed_company_ids,
        "allowed_company_names": allowed_company_names,
    })

    people_result = await db.execute(
        select(User.id, User.first_name, User.last_name).where(
            User.id.in_([ads.requester_id, ads.created_by])
        )
    )
    people = {
        row[0]: f"{row[1]} {row[2]}".strip()
        for row in people_result.all()
        if row[1] or row[2]
    }
    data.update({
        "requester_name": people.get(ads.requester_id),
        "created_by_name": people.get(ads.created_by),
    })

    avm_origin_result = await db.execute(
        select(
            MissionProgram.id,
            MissionProgram.activity_description,
            MissionNotice.id,
            MissionNotice.reference,
            MissionNotice.title,
        )
        .join(MissionNotice, MissionNotice.id == MissionProgram.mission_notice_id)
        .where(MissionProgram.generated_ads_id == ads.id)
        .limit(1)
    )
    avm_origin = avm_origin_result.first()
    if avm_origin:
        data.update({
            "origin_mission_program_id": avm_origin[0],
            "origin_mission_program_activity": avm_origin[1],
            "origin_mission_notice_id": avm_origin[2],
            "origin_mission_notice_reference": avm_origin[3],
            "origin_mission_notice_title": avm_origin[4],
        })

    linked_projects = await _get_ads_linked_project_details(db, ads=ads, entity_id=entity_id)

    data["linked_projects"] = [
        {
            "project_id": item["project_id"],
            "project_name": item["project_name"],
            "project_manager_id": item["project_manager_id"],
            "project_manager_name": item["project_manager_name"],
        }
        for item in linked_projects
    ]

    if len(linked_projects) == 1:
        data.update({
            "project_id": linked_projects[0]["project_id"],
            "project_name": linked_projects[0]["project_name"],
            "project_manager_id": linked_projects[0]["project_manager_id"],
            "project_manager_name": linked_projects[0]["project_manager_name"],
        })
    elif len(linked_projects) > 1:
        data.update({
            "project_id": None,
            "project_name": None,
            "project_manager_id": None,
            "project_manager_name": None,
        })

    site_result = await db.execute(
        select(Installation.code, Installation.name).where(
            Installation.id == ads.site_entry_asset_id,
            Installation.entity_id == entity_id,
        )
    )
    site_row = site_result.first()
    if site_row:
        data["site_name"] = f"{site_row[0]} — {site_row[1]}" if site_row[0] else site_row[1]

    if ads.planner_activity_id:
        planner_result = await db.execute(
            select(PlannerActivity.title, PlannerActivity.status).where(
                PlannerActivity.id == ads.planner_activity_id,
                PlannerActivity.entity_id == entity_id,
            )
        )
        planner_row = planner_result.first()
        if planner_row:
            data.update({
                "planner_activity_title": planner_row[0],
                "planner_activity_status": planner_row[1],
            })

    return data


async def _finalize_ads_after_pax_decision(
    *,
    db: AsyncSession,
    ads: Ads,
    entity_id: UUID,
    actor_id: UUID,
) -> Ads:
    result = await db.execute(
        select(AdsPax).where(AdsPax.ads_id == ads.id)
    )
    pax_entries = result.scalars().all()
    terminal_statuses = {"approved", "waitlisted", "rejected", "no_show"}
    if not pax_entries or any(entry.status not in terminal_statuses for entry in pax_entries):
        return ads

    approved_entries = [entry for entry in pax_entries if entry.status == "approved"]
    waitlisted_entries = [entry for entry in pax_entries if entry.status == "waitlisted"]
    from_state = ads.status
    if approved_entries:
        ads.status = "approved"
        ads.approved_at = func.now()
        ads.rejected_at = None
        ads.rejection_reason = None
        if from_state != "approved":
            db.add(AdsEvent(
                entity_id=entity_id,
                ads_id=ads.id,
                event_type="approved",
                old_status=from_state,
                new_status="approved",
                actor_id=actor_id,
                metadata_json={
                    "approved_pax_count": len(approved_entries),
                    "waitlisted_pax_count": len(waitlisted_entries),
                },
            ))
            await _try_ads_workflow_transition(
                db,
                entity_id_str=str(ads.id),
                to_state="approved",
                actor_id=actor_id,
                entity_id_scope=entity_id,
            )
    elif waitlisted_entries:
        ads.status = "pending_arbitration"
        ads.rejected_at = None
        ads.rejection_reason = "Tous les PAX restants sont en liste d'attente."
        if from_state != "pending_arbitration":
            db.add(AdsEvent(
                entity_id=entity_id,
                ads_id=ads.id,
                event_type="pending_arbitration",
                old_status=from_state,
                new_status="pending_arbitration",
                actor_id=actor_id,
                metadata_json={"waitlisted_pax_count": len(waitlisted_entries)},
                reason=ads.rejection_reason,
            ))
            await _try_ads_workflow_transition(
                db,
                entity_id_str=str(ads.id),
                to_state="pending_arbitration",
                actor_id=actor_id,
                entity_id_scope=entity_id,
                comment=ads.rejection_reason,
            )
    else:
        ads.status = "rejected"
        ads.rejected_at = func.now()
        ads.rejection_reason = "Tous les PAX de l'AdS ont été rejetés."
        if from_state != "rejected":
            db.add(AdsEvent(
                entity_id=entity_id,
                ads_id=ads.id,
                event_type="rejected",
                old_status=from_state,
                new_status="rejected",
                actor_id=actor_id,
                reason=ads.rejection_reason,
            ))
            await _try_ads_workflow_transition(
                db,
                entity_id_str=str(ads.id),
                to_state="rejected",
                actor_id=actor_id,
                entity_id_scope=entity_id,
                comment=ads.rejection_reason,
            )
    return ads


async def _can_read_avm(
    avm: MissionNotice,
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> bool:
    if avm.created_by == current_user.id:
        return True
    return await has_user_permission(current_user, entity_id, "paxlog.avm.read_all", db)


async def _assert_avm_read_access(
    avm: MissionNotice,
    *,
    current_user: User,
    entity_id: UUID,
    db: AsyncSession,
) -> None:
    if not await _can_read_avm(avm, current_user=current_user, entity_id=entity_id, db=db):
        raise HTTPException(status_code=404, detail="AVM not found")


async def _get_stay_program_context_or_404(
    program_id: UUID,
    entity_id: UUID,
    db: AsyncSession,
):
    result = await db.execute(
        select(
            StayProgram.id,
            StayProgram.status,
            StayProgram.ads_id,
            StayProgram.user_id,
            StayProgram.contact_id,
            Ads.status,
        )
        .join(Ads, Ads.id == StayProgram.ads_id)
        .where(
            StayProgram.id == program_id,
            StayProgram.entity_id == entity_id,
            Ads.entity_id == entity_id,
        )
    )
    context = result.first()
    if not context:
        raise HTTPException(status_code=404, detail="Programme de sejour introuvable")
    return context


@router.get("/stay-programs")
async def list_stay_programs(
    ads_id: UUID | None = None,
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    status_filter: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_any_permission(*ADS_READ_ENTRY_PERMISSIONS),
    db: AsyncSession = Depends(get_db),
):
    """List stay programs (intra-field movement plans)."""
    from sqlalchemy import text as sa_text

    conditions = ["sp.entity_id = :eid"]
    params: dict = {"eid": str(entity_id)}
    can_read_all = await has_user_permission(
        current_user, entity_id, "paxlog.ads.read_all", db
    )
    if not can_read_all:
        conditions.append("ads.requester_id = :requester_id")
        params["requester_id"] = str(current_user.id)

    if ads_id:
        conditions.append("sp.ads_id = :ads_id")
        params["ads_id"] = str(ads_id)
    if user_id:
        conditions.append("sp.user_id = :user_id")
        params["user_id"] = str(user_id)
    if contact_id:
        conditions.append("sp.contact_id = :contact_id")
        params["contact_id"] = str(contact_id)
    if status_filter:
        conditions.append("sp.status = :status")
        params["status"] = status_filter

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT sp.id, sp.ads_id, sp.user_id, sp.contact_id, sp.status, sp.movements, sp.created_at
            FROM stay_programs sp
            JOIN ads ON ads.id = sp.ads_id
            WHERE {where_clause}
            ORDER BY sp.created_at DESC
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "ads_id": str(r[1]),
            "user_id": str(r[2]) if r[2] else None,
            "contact_id": str(r[3]) if r[3] else None,
            "status": r[4],
            "movements": r[5],
            "created_at": str(r[6]),
        }
        for r in rows
    ]


@router.post("/stay-programs", status_code=201)
async def create_stay_program(
    ads_id: UUID,
    movements: list[dict],
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a stay program (intra-field movement plan for a PAX in an AdS)."""
    from sqlalchemy import text as sa_text
    import json

    if not user_id and not contact_id:
        raise HTTPException(status_code=400, detail="Provide user_id or contact_id")

    ads = await _get_stay_program_ads_or_404(ads_id, entity_id, db)
    _ensure_stay_program_ads_status(ads.status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO stay_programs (entity_id, ads_id, user_id, contact_id, status, movements, created_by, created_at)
            VALUES (:eid, :ads_id, :user_id, :contact_id, 'draft', :movements, :created_by, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "ads_id": str(ads_id),
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
            "movements": json.dumps(movements),
            "created_by": str(current_user.id),
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "ads_id": str(ads_id),
        "user_id": str(user_id) if user_id else None,
        "contact_id": str(contact_id) if contact_id else None,
        "status": "draft",
    }


@router.post("/stay-programs/{program_id}/submit")
async def submit_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.create"),
    db: AsyncSession = Depends(get_db),
):
    """Submit a stay program for approval."""
    from sqlalchemy import text as sa_text

    context = await _get_stay_program_context_or_404(program_id, entity_id, db)
    _, current_status, ads_id, user_id, contact_id, ads_status = context
    if current_status != "draft":
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-soumettable (doit etre en brouillon).",
        )
    _ensure_stay_program_ads_status(ads_status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'submitted', submitted_at = NOW() "
            "WHERE id = :pid AND entity_id = :eid AND status = 'draft' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id)},
    )
    if not result.scalar():
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-soumettable (doit etre en brouillon).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "submitted"}


@router.post("/stay-programs/{program_id}/approve")
async def approve_stay_program(
    program_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.stay.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve a submitted stay program."""
    from sqlalchemy import text as sa_text

    context = await _get_stay_program_context_or_404(program_id, entity_id, db)
    _, current_status, ads_id, user_id, contact_id, ads_status = context
    if current_status != "submitted":
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-approvable (doit etre soumis).",
        )
    _ensure_stay_program_ads_status(ads_status)
    await _ensure_stay_program_target_belongs_to_ads(
        ads_id,
        db,
        user_id=user_id,
        contact_id=contact_id,
    )

    result = await db.execute(
        sa_text(
            "UPDATE stay_programs SET status = 'approved', approved_by = :uid, approved_at = NOW() "
            "WHERE id = :pid AND entity_id = :eid AND status = 'submitted' "
            "RETURNING id"
        ),
        {"pid": str(program_id), "eid": str(entity_id), "uid": str(current_user.id)},
    )
    if not result.scalar():
        raise HTTPException(
            status_code=400,
            detail="Programme introuvable ou non-approvable (doit etre soumis).",
        )
    await db.commit()
    return {"id": str(program_id), "status": "approved"}


# ═══════════════════════════════════════════════════════════════════════════════
# PROFILE TYPES & HABILITATIONS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/profile-types")
async def list_profile_types(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List all PAX profile types (job roles/categories)."""
    from sqlalchemy import text as sa_text

    result = await db.execute(
        sa_text(
            """
            SELECT id, code, name, description, created_at
            FROM pax_profile_types
            WHERE entity_id = :eid OR entity_id IS NULL
            ORDER BY name
            """
        ),
        {"eid": str(entity_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "created_at": str(r[4]),
        }
        for r in rows
    ]


@router.post("/profile-types", status_code=201)
async def create_profile_type(
    code: str,
    name: str,
    description: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Create a PAX profile type (job role/category)."""
    from sqlalchemy import text as sa_text

    # Check uniqueness
    existing = await db.execute(
        sa_text(
            "SELECT id FROM pax_profile_types WHERE code = :code AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"code": code, "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Profile type with code '{code}' already exists",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO pax_profile_types (entity_id, code, name, description, created_at)
            VALUES (:eid, :code, :name, :desc, NOW())
            RETURNING id
            """
        ),
        {"eid": str(entity_id), "code": code, "name": name, "desc": description},
    )
    new_id = result.scalar()
    await db.commit()

    return {"id": str(new_id), "code": code, "name": name, "description": description}


@router.get("/pax/{pax_id}/profile-types")
async def list_pax_profile_types(
    pax_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.read"),
    db: AsyncSession = Depends(get_db),
):
    """List profile types assigned to a PAX (user or contact)."""
    from sqlalchemy import text as sa_text

    fk_col = "user_id" if pax_source == "user" else "contact_id"
    result = await db.execute(
        sa_text(
            f"""
            SELECT pt.id, pt.code, pt.name, pt.description, ppt.created_at
            FROM pax_profile_types ppt
            JOIN pax_profile_types pt ON pt.id = ppt.profile_type_id
            WHERE ppt.{fk_col} = :pax_id
            ORDER BY pt.name
            """
        ),
        {"pax_id": str(pax_id)},
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "code": r[1],
            "name": r[2],
            "description": r[3],
            "assigned_at": str(r[4]) if r[4] else None,
        }
        for r in rows
    ]


@router.post("/pax/{pax_id}/profile-types/{profile_type_id}", status_code=201)
async def assign_profile_type(
    pax_id: UUID,
    profile_type_id: UUID,
    pax_source: str = Query("user", pattern=r"^(user|contact)$"),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile.update"),
    db: AsyncSession = Depends(get_db),
):
    """Assign a profile type to a PAX (user or contact)."""
    from sqlalchemy import text as sa_text
    from app.models.paxlog import PaxProfileType

    fk_col = "user_id" if pax_source == "user" else "contact_id"

    # Check if already assigned
    existing = await db.execute(
        sa_text(
            f"SELECT 1 FROM pax_profile_types WHERE {fk_col} = :pax_id AND profile_type_id = :pt_id"
        ),
        {"pax_id": str(pax_id), "pt_id": str(profile_type_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Profile type already assigned to this PAX",
        )

    ppt = PaxProfileType(
        user_id=pax_id if pax_source == "user" else None,
        contact_id=pax_id if pax_source == "contact" else None,
        profile_type_id=profile_type_id,
    )
    db.add(ppt)
    await db.commit()

    return {"pax_id": str(pax_id), "pax_source": pax_source, "profile_type_id": str(profile_type_id), "status": "assigned"}


@router.get("/habilitation-matrix")
async def list_habilitation_matrix(
    profile_type_id: UUID | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.profile_type.manage"),
    db: AsyncSession = Depends(get_db),
):
    """List habilitation matrix entries (credentials required per profile type)."""
    from sqlalchemy import text as sa_text

    conditions = ["(hm.entity_id = :eid OR hm.entity_id IS NULL)"]
    params: dict = {"eid": str(entity_id)}

    if profile_type_id:
        conditions.append("hm.profile_type_id = :pt_id")
        params["pt_id"] = str(profile_type_id)

    where_clause = " AND ".join(conditions)
    result = await db.execute(
        sa_text(
            f"""
            SELECT hm.id, hm.profile_type_id, pt.code AS profile_code, pt.name AS profile_name,
                   hm.credential_type_id, ct.code AS cred_code, ct.name AS cred_name,
                   hm.mandatory
            FROM habilitation_matrix hm
            JOIN pax_profile_types pt ON pt.id = hm.profile_type_id
            JOIN credential_types ct ON ct.id = hm.credential_type_id
            WHERE {where_clause}
            ORDER BY pt.name, ct.name
            """
        ),
        params,
    )
    rows = result.all()
    return [
        {
            "id": str(r[0]),
            "profile_type_id": str(r[1]),
            "profile_code": r[2],
            "profile_name": r[3],
            "credential_type_id": str(r[4]),
            "credential_code": r[5],
            "credential_name": r[6],
            "mandatory": r[7],
        }
        for r in rows
    ]


@router.post("/habilitation-matrix", status_code=201)
async def add_habilitation_requirement(
    profile_type_id: UUID,
    credential_type_id: UUID,
    mandatory: bool = True,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.manage"),
    db: AsyncSession = Depends(get_db),
):
    """Add a credential requirement to a profile type in the habilitation matrix."""
    from sqlalchemy import text as sa_text

    # Check uniqueness
    existing = await db.execute(
        sa_text(
            "SELECT id FROM habilitation_matrix "
            "WHERE profile_type_id = :pt_id AND credential_type_id = :ct_id "
            "AND (entity_id = :eid OR entity_id IS NULL)"
        ),
        {"pt_id": str(profile_type_id), "ct_id": str(credential_type_id), "eid": str(entity_id)},
    )
    if existing.scalar():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This credential requirement already exists for this profile type",
        )

    result = await db.execute(
        sa_text(
            """
            INSERT INTO habilitation_matrix (entity_id, profile_type_id, credential_type_id, mandatory, created_at)
            VALUES (:eid, :pt_id, :ct_id, :mandatory, NOW())
            RETURNING id
            """
        ),
        {
            "eid": str(entity_id),
            "pt_id": str(profile_type_id),
            "ct_id": str(credential_type_id),
            "mandatory": mandatory,
        },
    )
    new_id = result.scalar()
    await db.commit()

    return {
        "id": str(new_id),
        "profile_type_id": str(profile_type_id),
        "credential_type_id": str(credential_type_id),
        "mandatory": mandatory,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# COMPLIANCE DASHBOARD DATA
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/compliance/expiring")
async def get_expiring_credentials(
    days_ahead: int = 30,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get PAX credentials expiring within N days. Used by dashboard widget."""
    from datetime import timedelta as td

    today = date.today()
    cutoff = today + td(days=days_ahead)

    # Credentials linked to Users
    user_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.user_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            User.first_name,
            User.last_name,
            User.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(User, User.id == PaxCredential.user_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            User.default_entity_id == entity_id,
            PaxCredential.user_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )
    # Credentials linked to TierContacts
    contact_creds = await db.execute(
        select(
            PaxCredential.id,
            PaxCredential.contact_id,
            PaxCredential.credential_type_id,
            PaxCredential.expiry_date,
            PaxCredential.status,
            TierContact.first_name,
            TierContact.last_name,
            TierContact.badge_number,
            CredentialType.code.label("cred_code"),
            CredentialType.name.label("cred_name"),
        )
        .join(TierContact, TierContact.id == PaxCredential.contact_id)
        .join(Tier, Tier.id == TierContact.tier_id)
        .join(CredentialType, CredentialType.id == PaxCredential.credential_type_id)
        .where(
            Tier.entity_id == entity_id,
            PaxCredential.contact_id.isnot(None),
            PaxCredential.expiry_date.isnot(None),
            PaxCredential.expiry_date <= cutoff,
            PaxCredential.expiry_date >= today,
            PaxCredential.status == "valid",
        )
        .order_by(PaxCredential.expiry_date)
    )

    items = []
    for r in user_creds.all():
        days_remaining = (r[3] - today).days
        items.append({
            "credential_id": str(r[0]),
            "user_id": str(r[1]),
            "contact_id": None,
            "pax_source": "user",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": days_remaining,
            "alert_bucket": _expiring_alert_bucket(days_remaining),
        })
    for r in contact_creds.all():
        days_remaining = (r[3] - today).days
        items.append({
            "credential_id": str(r[0]),
            "user_id": None,
            "contact_id": str(r[1]),
            "pax_source": "contact",
            "credential_type_id": str(r[2]),
            "expiry_date": str(r[3]),
            "status": r[4],
            "pax_first_name": r[5],
            "pax_last_name": r[6],
            "pax_badge": r[7],
            "credential_code": r[8],
            "credential_name": r[9],
            "days_remaining": days_remaining,
            "alert_bucket": _expiring_alert_bucket(days_remaining),
        })

    items.sort(key=lambda x: x["expiry_date"])
    return items


@router.get("/compliance/stats")
async def get_compliance_stats(
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.compliance.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get compliance statistics per site. Used by dashboard widget."""
    from sqlalchemy import text as sa_text

    today = date.today()

    # Total active PAX count (Users in entity + TierContacts of entity's Tiers)
    user_count = await db.execute(
        select(func.count(User.id))
        .where(User.default_entity_id == entity_id, User.active == True)  # noqa: E712
    )
    contact_count = await db.execute(
        select(func.count(TierContact.id))
        .join(Tier, Tier.id == TierContact.tier_id)
        .where(Tier.entity_id == entity_id, TierContact.active == True)  # noqa: E712
    )
    total_pax_value = (user_count.scalar() or 0) + (contact_count.scalar() or 0)

    # Expired credentials count
    expired_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(
            PaxCredential.expiry_date < today,
            PaxCredential.status == "valid",
        )
    )

    # Pending validation count
    pending_count = await db.execute(
        select(func.count(PaxCredential.id))
        .where(PaxCredential.status == "pending_validation")
    )

    # Active incidents count
    active_incidents = await db.execute(
        select(func.count(PaxIncident.id)).where(
            PaxIncident.entity_id == entity_id,
            PaxIncident.resolved_at == None,  # noqa: E711
        )
    )

    # Per-site stats (top 10 sites by AdS count)
    site_stats = await db.execute(
        sa_text(
            """
            SELECT a.site_entry_asset_id, ast.name AS site_name,
                   COUNT(DISTINCT a.id) AS ads_count,
                   COUNT(DISTINCT ap.id) AS pax_count,
                   COUNT(DISTINCT CASE WHEN ap.status = 'blocked' THEN ap.id END) AS blocked_count
            FROM ads a
            JOIN ads_pax ap ON ap.ads_id = a.id
            LEFT JOIN ar_installations ast ON ast.id = a.site_entry_asset_id
            WHERE a.entity_id = :eid
              AND a.status IN ('submitted', 'pending_validation', 'approved', 'in_progress')
              AND a.archived = false
            GROUP BY a.site_entry_asset_id, ast.name
            ORDER BY ads_count DESC
            LIMIT 10
            """
        ),
        {"eid": str(entity_id)},
    )
    sites = site_stats.all()

    return {
        "total_active_pax": total_pax_value,
        "expired_credentials": expired_count.scalar() or 0,
        "pending_validations": pending_count.scalar() or 0,
        "active_incidents": active_incidents.scalar() or 0,
        "site_stats": [
            {
                "site_asset_id": str(s[0]),
                "site_name": s[1] or "N/A",
                "ads_count": s[2],
                "pax_count": s[3],
                "blocked_count": s[4],
            }
            for s in sites
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SIGNALEMENTS (formal incident reporting — via service layer)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/signalements")
async def list_signalements(
    pax_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str | None = None,
    status_filter: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.read"),
    db: AsyncSession = Depends(get_db),
):
    """List formal signalements (incidents, HSE violations, bans)."""
    query = select(PaxIncident).where(PaxIncident.entity_id == entity_id)

    if pax_id:
        query = query.where(or_(PaxIncident.user_id == pax_id, PaxIncident.contact_id == pax_id))
    if asset_id:
        query = query.where(PaxIncident.asset_id == asset_id)
    if severity:
        query = query.where(PaxIncident.severity == severity)
    if status_filter == "resolved":
        query = query.where(PaxIncident.resolved_at != None)  # noqa: E711
    elif status_filter == "active":
        query = query.where(PaxIncident.resolved_at == None)  # noqa: E711

    query = query.order_by(PaxIncident.created_at.desc())
    return await paginate(db, query, pagination)


@router.post("/signalements", response_model=PaxIncidentRead, status_code=201)
async def create_signalement(
    user_id: UUID | None = None,
    contact_id: UUID | None = None,
    company_id: UUID | None = None,
    asset_id: UUID | None = None,
    severity: str = "info",
    description: str = "",
    incident_date: date | None = None,
    ban_start_date: date | None = None,
    ban_end_date: date | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a formal signalement (incident, HSE violation, sanction).

    Ban-like severities can suspend the PAX and immediately impact related AdS.
    """
    from app.services.modules.paxlog_service import create_signalement as svc_create

    if not description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required",
        )

    result = await svc_create(
        db,
        entity_id=entity_id,
        data={
            "user_id": user_id,
            "contact_id": contact_id,
            "company_id": company_id,
            "asset_id": asset_id,
            "severity": severity,
            "description": description,
            "incident_date": incident_date or date.today(),
            "ban_start_date": ban_start_date,
            "ban_end_date": ban_end_date,
            "recorded_by": current_user.id,
        },
    )

    await record_audit(
        db,
        action="paxlog.signalement.create",
        resource_type="pax_incident",
        resource_id=str(result["id"]),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "severity": severity,
            "user_id": str(user_id) if user_id else None,
            "contact_id": str(contact_id) if contact_id else None,
        },
    )
    await db.commit()

    # Re-fetch for response model
    incident_result = await db.execute(
        select(PaxIncident).where(PaxIncident.id == result["id"])
    )
    return incident_result.scalar_one()


@router.post("/signalements/{signalement_id}/resolve", response_model=PaxIncidentRead)
async def resolve_signalement(
    signalement_id: UUID,
    resolution_notes: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a formal signalement with optional notes."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")
    if incident.resolved_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ce signalement est deja resolu.",
        )

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = resolution_notes

    # If PAX was suspended due to a ban, check if they can be re-activated
    pax_filter = None
    if incident.severity in ("temp_ban", "permanent_ban"):
        if incident.user_id:
            pax_filter = PaxIncident.user_id == incident.user_id
        elif incident.contact_id:
            pax_filter = PaxIncident.contact_id == incident.contact_id

    if pax_filter is not None:
        # Check if there are other unresolved bans
        other_bans = await db.execute(
            select(func.count(PaxIncident.id)).where(
                PaxIncident.entity_id == entity_id,
                pax_filter,
                PaxIncident.id != signalement_id,
                PaxIncident.severity.in_(["temp_ban", "permanent_ban"]),
                PaxIncident.resolved_at == None,  # noqa: E711
            )
        )
        if (other_bans.scalar() or 0) == 0:
            # No other active bans — log re-activation
            pax_id_str = str(incident.user_id or incident.contact_id)
            logger.info("PAX %s eligible for re-activation after signalement %s resolved", pax_id_str, signalement_id)

    await db.commit()
    await db.refresh(incident)

    await record_audit(
        db,
        action="paxlog.signalement.resolve",
        resource_type="pax_incident",
        resource_id=str(signalement_id),
        user_id=current_user.id,
        entity_id=entity_id,
    )
    await db.commit()

    # Emit event
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.resolved",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "user_id": str(incident.user_id) if incident.user_id else None,
            "contact_id": str(incident.contact_id) if incident.contact_id else None,
            "severity": incident.severity,
            "resolved_by": str(current_user.id),
        },
    ))

    return incident


@router.post("/signalements/{signalement_id}/validate", response_model=PaxIncidentRead)
async def validate_signalement(
    signalement_id: UUID,
    decision: str | None = None,
    decision_duration_days: int | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Validate a signalement — confirms the decision (ban, warning, etc.)."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")

    if decision:
        incident.decision = decision
    if decision_duration_days:
        incident.decision_duration_days = decision_duration_days
        incident.decision_end_date = date.today() + timedelta(days=decision_duration_days)

    await db.commit()
    await db.refresh(incident)
    return incident


@router.post("/signalements/{signalement_id}/lift", response_model=PaxIncidentRead)
async def lift_signalement(
    signalement_id: UUID,
    lift_reason: str = Body(..., min_length=1, embed=True),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.incident.resolve"),
    db: AsyncSession = Depends(get_db),
):
    """Lift a signalement — removes the ban/sanction with justification."""
    result = await db.execute(
        select(PaxIncident).where(
            PaxIncident.id == signalement_id,
            PaxIncident.entity_id == entity_id,
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Signalement not found")

    incident.resolved_at = func.now()
    incident.resolved_by = current_user.id
    incident.resolution_notes = f"[LEVEE] {lift_reason}"

    # Re-activate PAX if no other active bans
    if incident.severity in ("temp_ban", "permanent_ban"):
        pax_col = "user_id" if incident.user_id else "contact_id"
        pax_val = str(incident.user_id or incident.contact_id)
        if pax_val:
            other_bans = await db.execute(
                text(
                    f"SELECT COUNT(*) FROM pax_incidents "
                    f"WHERE entity_id = :eid AND {pax_col} = :pax_fk "
                    f"AND id != :sig_id "
                    f"AND severity IN ('temp_ban', 'permanent_ban') "
                    f"AND resolved_at IS NULL"
                ),
                {"eid": str(entity_id), "pax_fk": pax_val, "sig_id": str(signalement_id)},
            )
            if (other_bans.scalar() or 0) == 0:
                table = "users" if incident.user_id else "tier_contacts"
                await db.execute(
                    text(f"UPDATE {table} SET pax_status = 'active' WHERE id = :pid"),
                    {"pid": pax_val},
                )

    await db.commit()
    await db.refresh(incident)

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.signalement.lifted",
        payload={
            "incident_id": str(signalement_id),
            "entity_id": str(entity_id),
            "lifted_by": str(current_user.id),
            "lift_reason": lift_reason,
        },
    ))

    return incident


# ═══════════════════════════════════════════════════════════════════════════════
# AVIS DE MISSION (AVM)
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/avm", response_model=PaginatedResponse[MissionNoticeSummary])
async def list_avm(
    search: str | None = None,
    status_filter: str | None = None,
    mission_type: str | None = None,
    scope: str | None = None,
    pagination: PaginationParams = Depends(),
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """List Avis de Mission (AVM) for the current entity."""
    query = (
        select(
            MissionNotice,
            User.first_name.label("creator_first"),
            User.last_name.label("creator_last"),
        )
        .outerjoin(User, User.id == MissionNotice.created_by)
        .where(MissionNotice.entity_id == entity_id, MissionNotice.archived == False)  # noqa: E712
    )
    if scope == "my":
        query = query.where(MissionNotice.created_by == current_user.id)
    elif scope == "all":
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.avm.read_all", db
        )
        if not can_read_all:
            query = query.where(MissionNotice.created_by == current_user.id)
    else:
        can_read_all = await has_user_permission(
            current_user, entity_id, "paxlog.avm.read_all", db
        )
        if not can_read_all:
            query = query.where(MissionNotice.created_by == current_user.id)
    if search:
        like = f"%{search}%"
        query = query.where(
            MissionNotice.reference.ilike(like)
            | MissionNotice.title.ilike(like)
        )
    if status_filter:
        query = query.where(MissionNotice.status == status_filter)
    if mission_type:
        query = query.where(MissionNotice.mission_type == mission_type)
    query = query.order_by(MissionNotice.created_at.desc())

    count_query = select(func.count()).select_from(
        query.with_only_columns(MissionNotice.id).subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0
    offset = (pagination.page - 1) * pagination.page_size
    rows = (await db.execute(query.offset(offset).limit(pagination.page_size))).all()

    items = []
    for avm, creator_first, creator_last in rows:
        # Count PAX across all program lines
        pax_count_result = await db.execute(
            select(func.count(func.distinct(MissionProgramPax.id))).select_from(
                MissionProgramPax
            ).join(
                MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id
            ).where(MissionProgram.mission_notice_id == avm.id)
        )
        pax_count = pax_count_result.scalar() or 0

        # Preparation progress
        from app.services.modules.paxlog_service import get_avm_preparation_status
        prep_status = await get_avm_preparation_status(db, avm.id)

        effective_status = avm.status
        if avm.status in ("in_preparation", "ready"):
            effective_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"

        d = MissionNoticeSummary.model_validate(avm)
        d.status = effective_status
        d.creator_name = f"{creator_first or ''} {creator_last or ''}".strip() or None
        d.pax_count = pax_count
        d.preparation_progress = prep_status["progress_percent"]
        d.open_preparation_tasks = prep_status["open_preparation_tasks"]
        d.ready_for_approval = prep_status["ready_for_approval"]
        items.append(d)

    return {
        "items": items,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.post("/avm", response_model=MissionNoticeRead, status_code=201)
async def create_avm(
    body: MissionNoticeCreate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.create"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Avis de Mission (AVM) in draft status."""
    from app.services.modules.paxlog_service import generate_avm_reference

    reference = await generate_avm_reference(db, entity_id)

    avm = MissionNotice(
        entity_id=entity_id,
        reference=reference,
        title=body.title,
        description=body.description,
        created_by=current_user.id,
        status="draft",
        planned_start_date=body.planned_start_date,
        planned_end_date=body.planned_end_date,
        mission_type=body.mission_type,
        requires_badge=body.requires_badge,
        requires_epi=body.requires_epi,
        requires_visa=body.requires_visa,
        eligible_displacement_allowance=body.eligible_displacement_allowance,
        epi_measurements=body.epi_measurements,
        pax_quota=body.pax_quota,
    )
    db.add(avm)
    await db.flush()

    # ── PAX capacity validation ──────────────────────────────────────────
    # Count total unique non-cancelled PAX across all program lines
    if avm.pax_quota > 0:
        total_pax_count = sum(len(prog_data.pax_entries) for prog_data in body.programs)
        if total_pax_count > avm.pax_quota:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Mission PAX quota exceeded ({total_pax_count}/{avm.pax_quota})",
            )

    # Create program lines
    for idx, prog_data in enumerate(body.programs):
        prog = MissionProgram(
            mission_notice_id=avm.id,
            order_index=idx,
            activity_description=prog_data.activity_description,
            activity_type=prog_data.activity_type,
            site_asset_id=prog_data.site_asset_id,
            planned_start_date=prog_data.planned_start_date,
            planned_end_date=prog_data.planned_end_date,
            project_id=prog_data.project_id,
            notes=prog_data.notes,
        )
        db.add(prog)
        await db.flush()

        # ── PAX conflict detection — same PAX on overlapping missions ────
        for pax_entry in prog_data.pax_entries:
            if prog.planned_start_date and prog.planned_end_date:
                # Build filter for matching PAX
                if pax_entry.user_id:
                    pax_match = MissionProgramPax.user_id == pax_entry.user_id
                else:
                    pax_match = MissionProgramPax.contact_id == pax_entry.contact_id

                conflict_query = (
                    select(
                        MissionNotice.reference,
                        MissionProgram.planned_start_date,
                        MissionProgram.planned_end_date,
                    )
                    .select_from(MissionProgramPax)
                    .join(MissionProgram, MissionProgram.id == MissionProgramPax.mission_program_id)
                    .join(MissionNotice, MissionNotice.id == MissionProgram.mission_notice_id)
                    .where(
                        pax_match,
                        MissionNotice.id != avm.id,
                        MissionNotice.status != "cancelled",
                        MissionProgram.planned_start_date.isnot(None),
                        MissionProgram.planned_end_date.isnot(None),
                        MissionProgram.planned_start_date <= prog.planned_end_date,
                        MissionProgram.planned_end_date >= prog.planned_start_date,
                    )
                )
                conflict_result = await db.execute(conflict_query)
                conflict = conflict_result.first()
                if conflict:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail=(
                            f"PAX already assigned to mission {conflict[0]} "
                            f"({conflict[1]} - {conflict[2]})"
                        ),
                    )

            db.add(MissionProgramPax(
                mission_program_id=prog.id,
                user_id=pax_entry.user_id,
                contact_id=pax_entry.contact_id,
            ))

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.create", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.get("/avm/{avm_id}", response_model=MissionNoticeRead)
async def get_avm(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """Get AVM detail with programs, preparation tasks, and progress."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    await _assert_avm_read_access(avm, current_user=current_user, entity_id=entity_id, db=db)
    return await _build_avm_read(db, avm)


@router.get("/avm/{avm_id}/pdf")
async def get_avm_pdf(
    avm_id: UUID,
    language: str = "fr",
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.read"),
    db: AsyncSession = Depends(get_db),
):
    """Render an AVM PDF via the centralized PDF template engine."""
    from fastapi.responses import Response
    from app.core.pdf_templates import render_pdf

    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    await _assert_avm_read_access(avm, current_user=current_user, entity_id=entity_id, db=db)

    variables = await _build_avm_pdf_template_variables(db=db, avm=avm, entity_id=entity_id)
    pdf_bytes = await render_pdf(
        db,
        slug="avm.ticket",
        entity_id=entity_id,
        language=language,
        variables=variables,
    )
    if not pdf_bytes:
        raise HTTPException(404, "Template PDF 'avm.ticket' introuvable. Creez-le dans Parametres > Modeles PDF.")

    filename = f"AVM_{avm.reference.replace(' ', '_')}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.put("/avm/{avm_id}", response_model=MissionNoticeRead)
async def update_avm(
    avm_id: UUID,
    body: MissionNoticeUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AVM (only if draft or in_preparation)."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status not in ("draft", "in_preparation"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only update your own AVM unless you can arbitrate it.",
        )

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(avm, key, value)

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.update", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/submit", response_model=dict)
async def submit_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.submit"),
    db: AsyncSession = Depends(get_db),
):
    """Submit AVM — triggers preparation checklist generation."""
    from app.services.modules.paxlog_service import submit_avm as _submit_avm

    try:
        result_check = await db.execute(
            select(MissionNotice).where(
                MissionNotice.id == avm_id,
                MissionNotice.entity_id == entity_id,
            )
        )
        avm = result_check.scalar_one_or_none()
        if not avm:
            raise HTTPException(status_code=404, detail="AVM not found")
        if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You may only submit your own AVM unless you can arbitrate it.",
            )
        result = await _submit_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.submit", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/approve", response_model=dict)
async def approve_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.approve"),
    db: AsyncSession = Depends(get_db),
):
    """Approve AVM — auto-creates draft AdS for each program line."""
    from app.services.modules.paxlog_service import approve_avm as _approve_avm

    try:
        result = await _approve_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.approve", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/complete", response_model=dict)
async def complete_avm_route(
    avm_id: UUID,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.complete"),
    db: AsyncSession = Depends(get_db),
):
    """Complete AVM once all generated AdS are terminal."""
    from app.services.modules.paxlog_service import complete_avm as _complete_avm

    try:
        result = await _complete_avm(db, avm_id, entity_id, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await record_audit(
        db, action="paxlog.avm.complete", resource_type="mission_notice",
        resource_id=str(avm_id), user_id=current_user.id, entity_id=entity_id,
    )
    await db.commit()

    return result


@router.post("/avm/{avm_id}/cancel", response_model=MissionNoticeRead)
async def cancel_avm(
    avm_id: UUID,
    reason: str | None = None,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.cancel"),
    db: AsyncSession = Depends(get_db),
):
    """Cancel an AVM. Cancels all pending preparation tasks."""
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only cancel your own AVM unless you can arbitrate it.",
        )
    if avm.status in ("completed", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot cancel AVM with status '{avm.status}'",
        )

    linked_ads_cancelled = 0
    linked_ads_reviewed = 0
    linked_ads_refs: list[str] = []
    linked_ads_result = await db.execute(
        select(Ads.id, Ads.reference, Ads.status, Ads.requester_id)
        .join(MissionProgram, MissionProgram.generated_ads_id == Ads.id)
        .where(
            MissionProgram.mission_notice_id == avm.id,
            Ads.entity_id == entity_id,
            Ads.status.not_in(("completed", "cancelled", "rejected")),
        )
    )
    linked_ads_rows = linked_ads_result.all()
    for linked_ads_id, linked_ads_ref, linked_ads_status, linked_ads_requester_id in linked_ads_rows:
        if linked_ads_status in {"draft", "requires_review", "submitted", "pending_compliance", "pending_validation"}:
            target_status = "cancelled"
            values = {
                "status": "cancelled",
                "updated_at": func.now(),
                "rejection_reason": reason or "AVM annulée",
            }
            linked_ads_cancelled += 1
        else:
            target_status = "requires_review"
            values = {
                "status": "requires_review",
                "updated_at": func.now(),
                "rejection_reason": reason or "AVM annulée",
            }
            linked_ads_reviewed += 1

        await db.execute(
            Ads.__table__.update()
            .where(Ads.id == linked_ads_id)
            .values(**values)
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=linked_ads_id,
            event_type="avm_cancelled",
            old_status=linked_ads_status,
            new_status=target_status,
            actor_id=current_user.id,
            reason=reason,
            metadata_json={
                "avm_id": str(avm.id),
                "avm_reference": avm.reference,
            },
        ))
        linked_ads_refs.append(linked_ads_ref)
        if linked_ads_requester_id:
            from app.core.notifications import send_in_app
            await send_in_app(
                db,
                user_id=linked_ads_requester_id,
                entity_id=entity_id,
                title="AVM annulée — AdS impactée",
                body=(
                    f"L'AVM {avm.reference} a été annulée. "
                    f"L'AdS {linked_ads_ref} passe en {target_status}."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{linked_ads_id}",
            )

    previous_status = avm.status
    await _try_avm_workflow_transition(
        db,
        avm=avm,
        to_state="cancelled",
        actor_id=current_user.id,
        comment=reason,
    )
    avm.status = "cancelled"
    avm.cancellation_reason = reason

    # Cancel all pending preparation tasks
    from sqlalchemy import update as sql_update
    await db.execute(
        sql_update(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm_id,
            MissionPreparationTask.status.in_(["pending", "in_progress"]),
        ).values(status="cancelled")
    )

    await db.commit()
    await db.refresh(avm)
    await fsm_service.emit_transition_event(
        entity_type=AVM_ENTITY_TYPE,
        entity_id=str(avm.id),
        from_state=previous_status,
        to_state=avm.status,
        actor_id=current_user.id,
        workflow_slug=AVM_WORKFLOW_SLUG,
        extra_payload={
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )

    await record_audit(
        db, action="paxlog.avm.cancel", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
        details={
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )
    await db.commit()

    # Emit event
    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.cancelled",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "cancelled_by": str(current_user.id),
            "reason": reason,
            "linked_ads_cancelled": linked_ads_cancelled,
            "linked_ads_reviewed": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    ))

    return await _build_avm_read(db, avm)


@router.post("/avm/{avm_id}/modify", response_model=MissionNoticeRead)
async def modify_active_avm(
    avm_id: UUID,
    body: MissionNoticeModifyRequest,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Modify an active AVM (PAX potentially on site).

    Allowed on status: active, in_preparation.
    Logs modification reason and notifies stakeholders.
    """
    result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status not in ("active", "in_preparation", "ready"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot modify AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only modify your own AVM unless you can arbitrate it.",
        )

    update_data = body.model_dump(exclude_unset=True, exclude={"reason"})
    if not update_data:
        raise HTTPException(status_code=400, detail="No AVM changes provided")

    before_values = {key: getattr(avm, key, None) for key in update_data}
    if "planned_start_date" in update_data or "planned_end_date" in update_data:
        start_value = update_data.get("planned_start_date", avm.planned_start_date)
        end_value = update_data.get("planned_end_date", avm.planned_end_date)
        if start_value and end_value and start_value > end_value:
            raise HTTPException(
                status_code=400,
                detail="planned_end_date must be greater than or equal to planned_start_date",
            )

    for key, value in update_data.items():
        setattr(avm, key, value)

    changes = {}
    for key, old_value in before_values.items():
        new_value = getattr(avm, key, None)
        if old_value != new_value:
            changes[key] = {
                "before": _json_safe(old_value),
                "after": _json_safe(new_value),
            }
    if not changes:
        raise HTTPException(status_code=400, detail="No AVM changes detected")

    linked_ads_reviewed = 0
    linked_ads_refs: list[str] = []
    linked_ads_result = await db.execute(
        select(Ads.id, Ads.reference, Ads.status, Ads.requester_id)
        .join(MissionProgram, MissionProgram.generated_ads_id == Ads.id)
        .where(
            MissionProgram.mission_notice_id == avm.id,
            Ads.entity_id == entity_id,
            Ads.status.in_((
                "submitted",
                "pending_compliance",
                "pending_validation",
                "approved",
                "in_progress",
            )),
        )
    )
    linked_ads_rows = linked_ads_result.all()
    for linked_ads_id, linked_ads_ref, linked_ads_status, linked_ads_requester_id in linked_ads_rows:
        await db.execute(
            Ads.__table__.update()
            .where(Ads.id == linked_ads_id)
            .values(status="requires_review", updated_at=func.now())
        )
        db.add(AdsEvent(
            entity_id=entity_id,
            ads_id=linked_ads_id,
            event_type="avm_modified_requires_review",
            old_status=linked_ads_status,
            new_status="requires_review",
            actor_id=current_user.id,
            reason=body.reason,
            metadata_json={
                "avm_id": str(avm.id),
                "avm_reference": avm.reference,
                "changes": changes,
            },
        ))
        linked_ads_reviewed += 1
        linked_ads_refs.append(linked_ads_ref)
        if linked_ads_requester_id:
            from app.core.notifications import send_in_app
            await send_in_app(
                db,
                user_id=linked_ads_requester_id,
                entity_id=entity_id,
                title="AdS à revoir suite à une modification d'AVM",
                body=(
                    f"L'AVM {avm.reference} a été modifiée. "
                    f"L'AdS {linked_ads_ref} repasse en revue. "
                    f"Motif: {body.reason}."
                ),
                category="paxlog",
                link=f"/paxlog/ads/{linked_ads_id}",
            )

    await db.commit()
    await db.refresh(avm)

    await record_audit(
        db, action="paxlog.avm.modify_active", resource_type="mission_notice",
        resource_id=str(avm.id), user_id=current_user.id, entity_id=entity_id,
        details={
            "reason": body.reason,
            "modified_fields": list(changes.keys()),
            "changes": changes,
            "linked_ads_set_to_review": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    )
    await db.commit()

    from app.core.events import OpsFluxEvent, event_bus as _event_bus
    await _event_bus.publish(OpsFluxEvent(
        event_type="paxlog.mission_notice.modified",
        payload={
            "avm_id": str(avm.id),
            "entity_id": str(entity_id),
            "reference": avm.reference,
            "modified_by": str(current_user.id),
            "modified_fields": list(changes.keys()),
            "reason": body.reason,
            "changes": changes,
            "linked_ads_set_to_review": linked_ads_reviewed,
            "linked_ads_references": linked_ads_refs,
        },
    ))

    return await _build_avm_read(db, avm)


# ── AVM helper ─────────────────────────────────────────────────

async def _build_avm_read(db: AsyncSession, avm: MissionNotice) -> MissionNoticeRead:
    """Build enriched AVM read response with programs, tasks, and progress."""
    # Creator name
    creator_result = await db.execute(
        select(User.first_name, User.last_name).where(User.id == avm.created_by)
    )
    cr = creator_result.first()
    creator_name = f"{cr[0] or ''} {cr[1] or ''}".strip() if cr else None

    latest_modification_result = await db.execute(
        select(
            AuditLog.created_at,
            AuditLog.details,
            User.first_name,
            User.last_name,
        )
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(
            AuditLog.entity_id == avm.entity_id,
            AuditLog.resource_type == "mission_notice",
            AuditLog.resource_id == str(avm.id),
            AuditLog.action == "paxlog.avm.modify_active",
        )
        .order_by(AuditLog.created_at.desc())
        .limit(1)
    )
    latest_modification = latest_modification_result.first()
    last_modification_reason = None
    last_modified_at = None
    last_modified_by_name = None
    last_modified_fields: list[str] = []
    last_modification_changes = None
    last_linked_ads_set_to_review = 0
    last_linked_ads_references: list[str] = []
    if latest_modification:
        last_modified_at = latest_modification[0]
        details = latest_modification[1] or {}
        last_modification_reason = details.get("reason")
        last_modification_changes = details.get("changes")
        last_modified_fields = details.get("modified_fields") or []
        last_linked_ads_set_to_review = details.get("linked_ads_set_to_review") or 0
        last_linked_ads_references = details.get("linked_ads_references") or []
        modifier_name = f"{latest_modification[2] or ''} {latest_modification[3] or ''}".strip()
        last_modified_by_name = modifier_name or None

    # Programs with PAX IDs
    prog_result = await db.execute(
        select(MissionProgram).where(
            MissionProgram.mission_notice_id == avm.id,
        ).order_by(MissionProgram.order_index)
    )
    programs = prog_result.scalars().all()

    program_reads = []
    for prog in programs:
        pax_result = await db.execute(
            select(MissionProgramPax.user_id, MissionProgramPax.contact_id).where(
                MissionProgramPax.mission_program_id == prog.id,
            )
        )
        pax_entries = [
            AdsPaxEntry(user_id=row[0], contact_id=row[1])
            for row in pax_result.all()
        ]

        # Get site name if available
        site_name = None
        generated_ads_reference = None
        generated_ads_status = None
        if prog.site_asset_id:
            from sqlalchemy import text as sql_text
            name_result = await db.execute(
                sql_text("SELECT name FROM ar_installations WHERE id = :aid"),
                {"aid": str(prog.site_asset_id)},
            )
            name_row = name_result.first()
            site_name = name_row[0] if name_row else None
        if prog.generated_ads_id:
            ads_result = await db.execute(
                select(Ads.reference, Ads.status).where(Ads.id == prog.generated_ads_id)
            )
            ads_row = ads_result.first()
            if ads_row:
                generated_ads_reference = ads_row[0]
                generated_ads_status = ads_row[1]

        pr = MissionProgramRead.model_validate(prog)
        pr.pax_entries = pax_entries
        pr.site_name = site_name
        pr.generated_ads_reference = generated_ads_reference
        pr.generated_ads_status = generated_ads_status
        program_reads.append(pr)

    # Preparation tasks
    task_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.mission_notice_id == avm.id,
        ).order_by(MissionPreparationTask.created_at)
    )
    tasks = task_result.scalars().all()
    assigned_user_ids = list({task.assigned_to_user_id for task in tasks if task.assigned_to_user_id})
    assigned_names: dict[UUID, str] = {}
    if assigned_user_ids:
        assigned_users_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(User.id.in_(assigned_user_ids))
        )
        assigned_names = {
            row[0]: f"{row[1] or ''} {row[2] or ''}".strip()
            for row in assigned_users_result.all()
        }

    linked_ads_ids = list({task.linked_ads_id for task in tasks if task.linked_ads_id})
    linked_ads_refs: dict[UUID, str] = {}
    if linked_ads_ids:
        linked_ads_result = await db.execute(
            select(Ads.id, Ads.reference).where(Ads.id.in_(linked_ads_ids))
        )
        linked_ads_refs = {row[0]: row[1] for row in linked_ads_result.all()}

    task_reads = []
    for task in tasks:
        task_payload = MissionPreparationTaskRead.model_validate(task).model_dump()
        task_payload["assigned_to_user_name"] = assigned_names.get(task.assigned_to_user_id) if task.assigned_to_user_id else None
        task_payload["linked_ads_reference"] = linked_ads_refs.get(task.linked_ads_id) if task.linked_ads_id else None
        task_reads.append(MissionPreparationTaskRead(**task_payload))

    # Preparation progress
    from app.services.modules.paxlog_service import get_avm_preparation_status
    prep_status = await get_avm_preparation_status(db, avm.id)
    effective_status = avm.status
    if avm.status in ("in_preparation", "ready"):
        effective_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"

    return MissionNoticeRead(
        id=avm.id,
        entity_id=avm.entity_id,
        reference=avm.reference,
        title=avm.title,
        description=avm.description,
        created_by=avm.created_by,
        status=effective_status,
        planned_start_date=avm.planned_start_date,
        planned_end_date=avm.planned_end_date,
        requires_badge=avm.requires_badge,
        requires_epi=avm.requires_epi,
        requires_visa=avm.requires_visa,
        eligible_displacement_allowance=avm.eligible_displacement_allowance,
        epi_measurements=avm.epi_measurements,
        mission_type=avm.mission_type,
        pax_quota=avm.pax_quota,
        archived=avm.archived,
        cancellation_reason=avm.cancellation_reason,
        created_at=avm.created_at,
        updated_at=avm.updated_at,
        creator_name=creator_name,
        programs=program_reads,
        preparation_tasks=task_reads,
        preparation_progress=prep_status["progress_percent"],
        open_preparation_tasks=prep_status["open_preparation_tasks"],
        ready_for_approval=prep_status["ready_for_approval"],
        last_modification_reason=last_modification_reason,
        last_modified_at=last_modified_at,
        last_modified_by_name=last_modified_by_name,
        last_modified_fields=last_modified_fields,
        last_modification_changes=last_modification_changes,
        last_linked_ads_set_to_review=last_linked_ads_set_to_review,
        last_linked_ads_references=last_linked_ads_references,
    )


async def _build_avm_pdf_template_variables(
    db: AsyncSession,
    *,
    avm: MissionNotice,
    entity_id: UUID,
) -> dict[str, Any]:
    entity = await db.get(Entity, entity_id)
    avm_read = await _build_avm_read(db, avm)

    generated_ads_references = [
        program.generated_ads_reference
        for program in avm_read.programs
        if getattr(program, "generated_ads_reference", None)
    ]

    programs = []
    for program in avm_read.programs:
        programs.append(
            {
                "activity_description": program.activity_description,
                "site_name": program.site_name,
                "planned_start_date": program.planned_start_date.strftime("%d/%m/%Y") if program.planned_start_date else "--",
                "planned_end_date": program.planned_end_date.strftime("%d/%m/%Y") if program.planned_end_date else "--",
                "generated_ads_reference": program.generated_ads_reference,
                "pax_count": len(program.pax_entries or []),
            }
        )

    return {
        "reference": avm.reference,
        "title": avm.title,
        "description": avm.description or "",
        "status": avm.status,
        "mission_type": avm.mission_type,
        "planned_start_date": avm.planned_start_date.strftime("%d/%m/%Y") if avm.planned_start_date else "--",
        "planned_end_date": avm.planned_end_date.strftime("%d/%m/%Y") if avm.planned_end_date else "--",
        "creator_name": avm_read.creator_name or "--",
        "pax_quota": avm.pax_quota,
        "requires_badge": avm.requires_badge,
        "requires_epi": avm.requires_epi,
        "requires_visa": avm.requires_visa,
        "eligible_displacement_allowance": avm.eligible_displacement_allowance,
        "preparation_progress": avm_read.preparation_progress,
        "open_preparation_tasks": avm_read.open_preparation_tasks,
        "programs": programs,
        "generated_ads_references": generated_ads_references,
        "entity": {
            "name": entity.name if entity else "",
            "code": entity.code if entity else "",
        },
        "generated_at": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }


@router.patch("/avm/{avm_id}/preparation-tasks/{task_id}", response_model=MissionPreparationTaskRead)
async def update_avm_preparation_task(
    avm_id: UUID,
    task_id: UUID,
    body: MissionPreparationTaskUpdate,
    entity_id: UUID = Depends(get_current_entity),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("paxlog.avm.update"),
    db: AsyncSession = Depends(get_db),
):
    """Update an AVM preparation task within the current entity."""
    avm_result = await db.execute(
        select(MissionNotice).where(
            MissionNotice.id == avm_id,
            MissionNotice.entity_id == entity_id,
        )
    )
    avm = avm_result.scalar_one_or_none()
    if not avm:
        raise HTTPException(status_code=404, detail="AVM not found")
    if avm.status not in ("in_preparation", "ready", "active"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot update preparation tasks for AVM with status '{avm.status}'",
        )
    if not await _can_manage_avm(db=db, avm=avm, current_user=current_user, entity_id=entity_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You may only manage preparation for your own AVM unless you can arbitrate it.",
        )

    task_result = await db.execute(
        select(MissionPreparationTask).where(
            MissionPreparationTask.id == task_id,
            MissionPreparationTask.mission_notice_id == avm_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Preparation task not found")

    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No preparation task changes provided")

    if "assigned_to_user_id" in update_data and update_data["assigned_to_user_id"]:
        assigned_user_id = update_data["assigned_to_user_id"]
        assigned_user_result = await db.execute(
            select(User.id)
            .join(UserGroupMember, UserGroupMember.user_id == User.id)
            .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
            .where(
                User.id == assigned_user_id,
                User.active == True,  # noqa: E712
                UserGroup.entity_id == entity_id,
                UserGroup.active == True,  # noqa: E712
            )
            .limit(1)
        )
        if not assigned_user_result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="Assigned user must be active and belong to the current entity",
            )

    for key, value in update_data.items():
        setattr(task, key, value)

    if "status" in update_data:
        task.completed_at = datetime.now(timezone.utc) if task.status == "completed" else None

    previous_avm_status = avm.status
    if avm.status in ("in_preparation", "ready"):
        from app.services.modules.paxlog_service import get_avm_preparation_status
        await db.flush()
        prep_status = await get_avm_preparation_status(db, avm.id)
        next_avm_status = "ready" if prep_status["ready_for_approval"] else "in_preparation"
        if next_avm_status != avm.status:
            await _try_avm_workflow_transition(
                db,
                avm=avm,
                to_state=next_avm_status,
                actor_id=current_user.id,
            )
            avm.status = next_avm_status

    await db.commit()
    await db.refresh(task)
    if avm.status != previous_avm_status:
        await fsm_service.emit_transition_event(
            entity_type=AVM_ENTITY_TYPE,
            entity_id=str(avm.id),
            from_state=previous_avm_status,
            to_state=avm.status,
            actor_id=current_user.id,
            workflow_slug=AVM_WORKFLOW_SLUG,
        )

    await record_audit(
        db,
        action="paxlog.avm.preparation_task.update",
        resource_type="mission_notice",
        resource_id=str(avm.id),
        user_id=current_user.id,
        entity_id=entity_id,
        details={
            "task_id": str(task.id),
            "task_type": task.task_type,
            "changes": {
                key: _json_safe(value)
                for key, value in update_data.items()
            },
        },
    )
    await db.commit()

    assigned_to_user_name = None
    if task.assigned_to_user_id:
        assigned_user_result = await db.execute(
            select(User.first_name, User.last_name).where(User.id == task.assigned_to_user_id)
        )
        assigned_user = assigned_user_result.first()
        if assigned_user:
            assigned_to_user_name = f"{assigned_user[0] or ''} {assigned_user[1] or ''}".strip() or None

    linked_ads_reference = None
    if task.linked_ads_id:
        linked_ads_result = await db.execute(
            select(Ads.reference).where(Ads.id == task.linked_ads_id)
        )
        linked_ads_reference = linked_ads_result.scalar_one_or_none()

    task_payload = MissionPreparationTaskRead.model_validate(task).model_dump()
    task_payload["assigned_to_user_name"] = assigned_to_user_name
    task_payload["linked_ads_reference"] = linked_ads_reference
    return MissionPreparationTaskRead(**task_payload)
