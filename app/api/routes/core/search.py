"""Global search route — powers the Command-K search bar.

Covers the full operational surface:
    • Assets, Tiers, Users  (foundation)
    • MOC, Projects, Planner activities
    • ADS, PaxIncidents
    • Voyages, CargoRequests
    • ComplianceRecords

Each module is isolated in its own try/except so a single broken table
cannot 500 the entire bar. Empty sections are preferable to hard failures.
Each query is entity-scoped and respects soft-delete / archived flags.
Per-type cap = 5, total cap = 40.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_entity, get_current_user, has_user_permission
from app.core.database import get_db
from app.models.asset_registry import Installation
from app.models.common import ComplianceRecord, Project, Tier, User, UserGroup, UserGroupMember
from app.models.moc import MOC
from app.models.packlog import CargoRequest
from app.models.paxlog import Ads, PaxIncident
from app.models.planner import PlannerActivity
from app.models.travelwiz import Voyage
from app.schemas.common import SearchResult, SearchResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["search"])

PER_TYPE_LIMIT = 5
DEFAULT_TOTAL_LIMIT = 40
MIN_QUERY_LENGTH = 2


def _user_access_predicate(entity_id: UUID):
    """Predicate for users the caller can see within an entity."""
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
    return (User.default_entity_id == entity_id) | membership_exists


async def _can(user: User, entity_id: UUID, perm: str, db: AsyncSession) -> bool:
    """Best-effort permission check that never raises (fail-closed)."""
    try:
        return await has_user_permission(user, entity_id, perm, db)
    except Exception:
        return False


@router.get("/search", response_model=SearchResponse)
async def global_search(
    q: str = Query(..., min_length=MIN_QUERY_LENGTH, description="Search query"),
    types: str | None = Query(
        None,
        description="Comma-separated list of types to limit the search to "
        "(asset, tier, user, moc, project, activity, ads, incident, voyage, cargo, compliance). "
        "Omit for all.",
    ),
    current_user: User = Depends(get_current_user),
    entity_id: UUID = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db),
):
    """Search across all operational entities the caller has access to.

    Results are grouped by type in a stable order (assets → tiers → users →
    mocs → projects → activities → ads → incidents → voyages → cargo →
    compliance). Truncated to 40 items total.
    """
    pattern = f"%{q}%"
    allowed_types: set[str] | None = (
        {t.strip() for t in types.split(",") if t.strip()} if types else None
    )

    def want(t: str) -> bool:
        return allowed_types is None or t in allowed_types

    results: list[SearchResult] = []

    # ── Permissions (computed once, fail-closed) ───────────────────────
    can_read_assets = await _can(current_user, entity_id, "asset.read", db)
    can_read_tiers = await _can(current_user, entity_id, "tier.read", db)
    can_read_users = (
        await _can(current_user, entity_id, "user.read", db)
        or await _can(current_user, entity_id, "core.users.read", db)
    )
    can_read_moc = await _can(current_user, entity_id, "moc.read", db) or await _can(
        current_user, entity_id, "moc.manage", db
    )
    can_read_projects = await _can(
        current_user, entity_id, "projets.project.read", db
    ) or await _can(current_user, entity_id, "projets.read", db)
    can_read_planner = await _can(
        current_user, entity_id, "planner.activity.read", db
    ) or await _can(current_user, entity_id, "planner.activity.read_all", db)
    can_read_ads = await _can(
        current_user, entity_id, "paxlog.ads.read", db
    ) or await _can(current_user, entity_id, "paxlog.ads.read_all", db)
    can_read_incidents = await _can(
        current_user, entity_id, "paxlog.incident.read", db
    ) or await _can(current_user, entity_id, "paxlog.read", db)
    can_read_voyages = await _can(
        current_user, entity_id, "travelwiz.voyage.read", db
    ) or await _can(current_user, entity_id, "travelwiz.voyage.read_all", db)
    can_read_cargo = await _can(
        current_user, entity_id, "packlog.cargo.read", db
    ) or await _can(current_user, entity_id, "packlog.read", db)
    can_read_compliance = await _can(
        current_user, entity_id, "conformite.record.read", db
    ) or await _can(current_user, entity_id, "conformite.read", db)

    # ── Assets ─────────────────────────────────────────────────────────
    if want("asset") and can_read_assets:
        try:
            stmt = (
                select(Installation)
                .where(
                    Installation.entity_id == entity_id,
                    Installation.archived == False,  # noqa: E712
                    or_(
                        Installation.name.ilike(pattern),
                        Installation.code.ilike(pattern),
                    ),
                )
                .order_by(Installation.name)
                .limit(PER_TYPE_LIMIT)
            )
            for a in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="asset",
                        id=str(a.id),
                        title=a.name,
                        subtitle=a.code,
                        # Deep-linked to AssetRegistryPage which opens the
                        # installation detail panel from this URL.
                        url=f"/assets/installation/{a.id}",
                    )
                )
        except Exception:
            logger.exception("search: assets section failed")

    # ── Tiers ──────────────────────────────────────────────────────────
    if want("tier") and can_read_tiers:
        try:
            stmt = (
                select(Tier)
                .where(
                    Tier.entity_id == entity_id,
                    Tier.archived == False,  # noqa: E712
                    or_(Tier.name.ilike(pattern), Tier.code.ilike(pattern)),
                )
                .order_by(Tier.name)
                .limit(PER_TYPE_LIMIT)
            )
            for t in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="tier",
                        id=str(t.id),
                        title=t.name,
                        subtitle=t.code,
                        url=f"/tiers/{t.id}",
                    )
                )
        except Exception:
            logger.exception("search: tiers section failed")

    # ── Users ──────────────────────────────────────────────────────────
    if want("user") and can_read_users:
        try:
            stmt = (
                select(User)
                .where(
                    User.active == True,  # noqa: E712
                    _user_access_predicate(entity_id),
                    or_(
                        User.first_name.ilike(pattern),
                        User.last_name.ilike(pattern),
                        User.email.ilike(pattern),
                    ),
                )
                .order_by(User.last_name, User.first_name)
                .limit(PER_TYPE_LIMIT)
            )
            for u in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="user",
                        id=str(u.id),
                        title=f"{u.first_name} {u.last_name}".strip() or u.email,
                        subtitle=u.email,
                        url=f"/users/{u.id}",
                    )
                )
        except Exception:
            logger.exception("search: users section failed")

    # ── MOC ────────────────────────────────────────────────────────────
    if want("moc") and can_read_moc:
        try:
            stmt = (
                select(MOC)
                .where(
                    MOC.entity_id == entity_id,
                    MOC.deleted_at.is_(None),
                    or_(
                        MOC.reference.ilike(pattern),
                        MOC.title.ilike(pattern),
                    ),
                )
                .order_by(MOC.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for m in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="moc",
                        id=str(m.id),
                        title=m.reference,
                        subtitle=(m.title or m.status),
                        url=f"/moc/{m.id}",
                    )
                )
        except Exception:
            logger.exception("search: moc section failed")

    # ── Projects ───────────────────────────────────────────────────────
    if want("project") and can_read_projects:
        try:
            stmt = (
                select(Project)
                .where(
                    Project.entity_id == entity_id,
                    Project.archived == False,  # noqa: E712
                    or_(
                        Project.code.ilike(pattern),
                        Project.name.ilike(pattern),
                    ),
                )
                .order_by(Project.name)
                .limit(PER_TYPE_LIMIT)
            )
            for p in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="project",
                        id=str(p.id),
                        title=p.name,
                        subtitle=f"{p.code} · {p.status}",
                        url=f"/projets/{p.id}",
                    )
                )
        except Exception:
            logger.exception("search: projects section failed")

    # ── Planner Activities ─────────────────────────────────────────────
    if want("activity") and can_read_planner:
        try:
            stmt = (
                select(PlannerActivity)
                .where(
                    PlannerActivity.entity_id == entity_id,
                    PlannerActivity.deleted_at.is_(None),
                    PlannerActivity.title.ilike(pattern),
                )
                .order_by(PlannerActivity.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for pa in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="activity",
                        id=str(pa.id),
                        title=pa.title,
                        subtitle=f"{pa.type} · {pa.status}",
                        url=f"/planner/activity/{pa.id}",
                    )
                )
        except Exception:
            logger.exception("search: planner section failed")

    # ── ADS ────────────────────────────────────────────────────────────
    if want("ads") and can_read_ads:
        try:
            stmt = (
                select(Ads)
                .where(
                    Ads.entity_id == entity_id,
                    Ads.deleted_at.is_(None),
                    Ads.reference.ilike(pattern),
                )
                .order_by(Ads.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for a in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="ads",
                        id=str(a.id),
                        title=a.reference,
                        subtitle=f"{a.type} · {a.status}",
                        url=f"/paxlog/ads/{a.id}",
                    )
                )
        except Exception:
            logger.exception("search: ads section failed")

    # ── Pax Incidents ──────────────────────────────────────────────────
    if want("incident") and can_read_incidents:
        try:
            stmt = (
                select(PaxIncident)
                .where(
                    PaxIncident.entity_id == entity_id,
                    PaxIncident.description.ilike(pattern),
                )
                .order_by(PaxIncident.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for inc in (await db.execute(stmt)).scalars().all():
                snippet = (inc.description or "")[:80]
                results.append(
                    SearchResult(
                        type="incident",
                        id=str(inc.id),
                        title=snippet or "Incident",
                        subtitle=inc.severity,
                        url=f"/paxlog/incidents/{inc.id}",
                    )
                )
        except Exception:
            logger.exception("search: incident section failed")

    # ── Voyages ────────────────────────────────────────────────────────
    if want("voyage") and can_read_voyages:
        try:
            stmt = (
                select(Voyage)
                .where(
                    Voyage.entity_id == entity_id,
                    Voyage.deleted_at.is_(None),
                    Voyage.code.ilike(pattern),
                )
                .order_by(Voyage.scheduled_departure.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for v in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="voyage",
                        id=str(v.id),
                        title=v.code,
                        subtitle=v.status,
                        url=f"/travelwiz/voyages/{v.id}",
                    )
                )
        except Exception:
            logger.exception("search: voyage section failed")

    # ── Cargo Requests ─────────────────────────────────────────────────
    if want("cargo") and can_read_cargo:
        try:
            stmt = (
                select(CargoRequest)
                .where(
                    CargoRequest.entity_id == entity_id,
                    CargoRequest.deleted_at.is_(None),
                    or_(
                        CargoRequest.request_code.ilike(pattern),
                        CargoRequest.title.ilike(pattern),
                    ),
                )
                .order_by(CargoRequest.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for c in (await db.execute(stmt)).scalars().all():
                results.append(
                    SearchResult(
                        type="cargo",
                        id=str(c.id),
                        title=c.title,
                        subtitle=f"{c.request_code} · {c.status}",
                        url=f"/packlog/cargo-requests/{c.id}",
                    )
                )
        except Exception:
            logger.exception("search: cargo section failed")

    # ── Compliance Records ─────────────────────────────────────────────
    if want("compliance") and can_read_compliance:
        try:
            stmt = (
                select(ComplianceRecord)
                .where(
                    ComplianceRecord.entity_id == entity_id,
                    or_(
                        ComplianceRecord.reference_number.ilike(pattern),
                        ComplianceRecord.issuer.ilike(pattern),
                        ComplianceRecord.notes.ilike(pattern),
                    ),
                )
                .order_by(ComplianceRecord.created_at.desc())
                .limit(PER_TYPE_LIMIT)
            )
            for cr in (await db.execute(stmt)).scalars().all():
                title = cr.reference_number or cr.issuer or "Record"
                results.append(
                    SearchResult(
                        type="compliance",
                        id=str(cr.id),
                        title=title,
                        subtitle=cr.status,
                        url=f"/conformite/records/{cr.id}",
                    )
                )
        except Exception:
            logger.exception("search: compliance section failed")

    return SearchResponse(results=results[:DEFAULT_TOTAL_LIMIT])
