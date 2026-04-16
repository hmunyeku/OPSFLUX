"""Seed service — create initial data for development."""

import hashlib
import json
import logging
import os
from uuid import UUID, uuid4, uuid5

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.asset_registry import Installation
from app.models.common import (

    Entity,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupRole,
    WorkflowDefinition,
)

# Namespace UUID for deterministic seed IDs (stable across runs)
_SEED_NS = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

logger = logging.getLogger(__name__)


def _default_workflow_definitions() -> list[dict]:
    return [
        {
            "slug": "project",
            "legacy_slugs": [],
            "name": "Project Lifecycle",
            "entity_type": "project",
            "states": ["draft", "planned", "active", "on_hold", "completed", "cancelled"],
            "transitions": [
                {"from": "draft", "to": "planned", "label": "Planifier", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "draft", "to": "cancelled", "label": "Annuler", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "planned", "to": "active", "label": "Activer", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "planned", "to": "draft", "label": "Revenir en brouillon", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "planned", "to": "cancelled", "label": "Annuler", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "on_hold", "label": "Mettre en pause", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "completed", "label": "Terminer", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "draft", "label": "Revenir en brouillon", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "cancelled", "label": "Annuler", "required_roles": ["DPROJ", "DO"]},
                {"from": "on_hold", "to": "active", "label": "Reprendre", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "on_hold", "to": "draft", "label": "Revenir en brouillon", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "on_hold", "to": "cancelled", "label": "Annuler", "required_roles": ["DPROJ", "DO"]},
                {"from": "completed", "to": "active", "label": "Reouvrir", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "completed", "to": "draft", "label": "Revenir en brouillon", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "completed", "to": "cancelled", "label": "Annuler", "required_roles": ["DPROJ", "DO"]},
            ],
        },
        {
            "slug": "ads-workflow",
            "legacy_slugs": ["ads"],
            "name": "Avis de Séjour",
            "entity_type": "ads",
            "states": [
                "draft", "submitted",
                "pending_initiator_review", "pending_project_review",
                "pending_compliance", "pending_validation",
                "pending_arbitration", "approved", "rejected", "cancelled",
                "requires_review", "in_progress", "completed",
            ],
            "transitions": [
                {"from": "draft", "to": "submitted", "label": "Soumettre", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "pending_compliance", "label": "Soumettre (compliance)", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "pending_validation", "label": "Soumettre (validation)", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "pending_initiator_review", "label": "Soumettre (initiateur)", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "pending_project_review", "label": "Soumettre (projet)", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "pending_arbitration", "label": "Soumettre (arbitrage)", "required_permission": "paxlog.ads.submit"},
                {"from": "draft", "to": "cancelled", "label": "Annuler", "required_permission": "paxlog.ads.cancel"},
                {
                    "from": "submitted",
                    "to": "pending_initiator_review",
                    "label": "Vers validation initiateur",
                    "condition": {"field": "created_by", "op": "ne", "value_from": "requester_id"},
                    "assignee": {"resolver": "field", "field": "requester_id"},
                },
                {
                    "from": "pending_initiator_review",
                    "to": "pending_project_review",
                    "label": "Valider",
                    "condition": {"field": "project_reviewer_id", "op": "truthy"},
                    "assignee": {"resolver": "field", "field": "project_reviewer_id"},
                },
                {
                    "from": "pending_initiator_review",
                    "to": "pending_compliance",
                    "label": "Valider",
                    "assignee": {"resolver": "role", "role_code": "HSE_ADMIN"},
                },
                {"from": "pending_initiator_review", "to": "cancelled", "label": "Annuler", "comment_required": True},
                {
                    "from": "submitted",
                    "to": "pending_project_review",
                    "label": "Vers validation projet",
                    "condition": {
                        "all": [
                            {"field": "created_by", "op": "eq", "value_from": "requester_id"},
                            {"field": "project_reviewer_id", "op": "truthy"},
                        ]
                    },
                    "assignee": {"resolver": "field", "field": "project_reviewer_id"},
                },
                {
                    "from": "pending_project_review",
                    "to": "pending_compliance",
                    "label": "Valider",
                    "assignee": {"resolver": "role", "role_code": "HSE_ADMIN"},
                },
                {"from": "pending_project_review", "to": "rejected", "label": "Rejeter", "comment_required": True},
                {
                    "from": "submitted",
                    "to": "pending_compliance",
                    "label": "Vers vérification compliance",
                    "assignee": {"resolver": "role", "role_code": "HSE_ADMIN"},
                },
                {
                    "from": "pending_compliance",
                    "to": "pending_validation",
                    "label": "Valider conformité",
                    "required_permission": "paxlog.compliance.manage",
                    "assignee": {"resolver": "role", "role_code": "CDS"},
                },
                {"from": "pending_compliance", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_permission": "paxlog.compliance.manage"},
                {"from": "pending_validation", "to": "approved", "label": "Approuver", "required_permission": "paxlog.ads.approve"},
                {"from": "pending_validation", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_permission": "paxlog.ads.approve"},
                {"from": "pending_validation", "to": "pending_arbitration", "label": "Escalader", "required_permission": "paxlog.ads.approve"},
                {"from": "pending_arbitration", "to": "approved", "label": "Approuver (DO)", "required_permission": "paxlog.ads.approve"},
                {"from": "pending_arbitration", "to": "rejected", "label": "Rejeter (DO)", "comment_required": True, "required_permission": "paxlog.ads.approve"},
                {"from": "approved", "to": "in_progress", "label": "Démarrer", "required_permission": "paxlog.ads.approve"},
                {"from": "approved", "to": "requires_review", "label": "Demander révision"},
                {"from": "approved", "to": "cancelled", "label": "Annuler", "required_permission": "paxlog.ads.cancel"},
                {"from": "in_progress", "to": "completed", "label": "Terminer", "required_permission": "paxlog.ads.approve"},
                {"from": "in_progress", "to": "requires_review", "label": "Demander révision"},
                {"from": "requires_review", "to": "pending_compliance", "label": "Re-soumettre", "required_permission": "paxlog.ads.submit"},
                {"from": "requires_review", "to": "pending_validation", "label": "Re-soumettre (validation)", "required_permission": "paxlog.ads.submit"},
                {"from": "requires_review", "to": "pending_initiator_review", "label": "Re-soumettre (initiateur)", "required_permission": "paxlog.ads.submit"},
                {"from": "requires_review", "to": "pending_project_review", "label": "Re-soumettre (projet)", "required_permission": "paxlog.ads.submit"},
                {"from": "requires_review", "to": "pending_arbitration", "label": "Re-soumettre (arbitrage)", "required_permission": "paxlog.ads.submit"},
                {"from": "requires_review", "to": "cancelled", "label": "Annuler", "required_permission": "paxlog.ads.cancel"},
                {"from": "requires_review", "to": "submitted", "label": "Re-soumettre à l'étape nominale", "required_permission": "paxlog.ads.submit"},
            ],
        },
        {
            "slug": "planner-activity",
            "legacy_slugs": ["planner_activity"],
            "name": "Planner Activity",
            "entity_type": "planner_activity",
            # NOTE: state name MUST be "validated" (not "approved") to match the
            # PlannerActivity model + the planner backend code (which writes
            # activity.status = "validated", reads validated_by/_at, etc.).
            # The previous "approved" name caused FSM transitions to fail with
            # 400 Bad Request on every validate / cancel attempt.
            "states": ["draft", "submitted", "validated", "rejected", "cancelled", "in_progress", "completed"],
            "transitions": [
                {"from": "draft", "to": "submitted", "label": "Soumettre"},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                {"from": "submitted", "to": "validated", "label": "Valider", "required_roles": ["CDS", "DPROD"]},
                {"from": "submitted", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CDS", "DPROD"]},
                {"from": "submitted", "to": "cancelled", "label": "Annuler"},
                {"from": "validated", "to": "in_progress", "label": "Démarrer"},
                {"from": "validated", "to": "cancelled", "label": "Annuler", "required_roles": ["CDS", "DPROD", "DO"]},
                {"from": "in_progress", "to": "completed", "label": "Terminer"},
                {"from": "in_progress", "to": "cancelled", "label": "Annuler", "required_roles": ["CDS", "DPROD", "DO"]},
                {"from": "rejected", "to": "draft", "label": "Réviser"},
            ],
        },
        {
            "slug": "voyage-workflow",
            "legacy_slugs": [],
            "name": "TravelWiz Voyage",
            "entity_type": "voyage",
            "states": ["planned", "confirmed", "boarding", "departed", "delayed", "arrived", "closed", "cancelled"],
            "transitions": [
                {"from": "planned", "to": "confirmed", "label": "Confirmer"},
                {"from": "planned", "to": "cancelled", "label": "Annuler"},
                {"from": "confirmed", "to": "boarding", "label": "Embarquement"},
                {"from": "confirmed", "to": "delayed", "label": "Retarder"},
                {"from": "confirmed", "to": "cancelled", "label": "Annuler"},
                {"from": "boarding", "to": "departed", "label": "Départ"},
                {"from": "boarding", "to": "cancelled", "label": "Annuler"},
                {"from": "departed", "to": "arrived", "label": "Arrivée"},
                {"from": "departed", "to": "delayed", "label": "Retarder"},
                {"from": "delayed", "to": "confirmed", "label": "Reconfirmer"},
                {"from": "delayed", "to": "boarding", "label": "Embarquement"},
                {"from": "delayed", "to": "departed", "label": "Départ"},
                {"from": "delayed", "to": "cancelled", "label": "Annuler"},
                {"from": "arrived", "to": "closed", "label": "Clôturer"},
            ],
        },
        {
            "slug": "packlog-cargo-workflow",
            "legacy_slugs": [],
            "name": "PackLog Cargo Workflow",
            "entity_type": "cargo_item_workflow",
            "states": [
                "draft",
                "prepared",
                "ready_for_review",
                "approved",
                "rejected",
                "assigned",
                "in_transit",
                "delivered",
                "cancelled",
            ],
            "transitions": [
                {"from": "draft", "to": "prepared", "label": "Préparer"},
                {"from": "draft", "to": "ready_for_review", "label": "Soumettre à revue"},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                {"from": "prepared", "to": "ready_for_review", "label": "Soumettre à revue"},
                {"from": "prepared", "to": "draft", "label": "Revenir en brouillon"},
                {"from": "prepared", "to": "cancelled", "label": "Annuler"},
                {"from": "ready_for_review", "to": "approved", "label": "Approuver"},
                {"from": "ready_for_review", "to": "rejected", "label": "Rejeter", "comment_required": True},
                {"from": "ready_for_review", "to": "draft", "label": "Revenir en brouillon"},
                {"from": "approved", "to": "assigned", "label": "Assigner"},
                {"from": "approved", "to": "cancelled", "label": "Annuler"},
                {"from": "rejected", "to": "draft", "label": "Réviser"},
                {"from": "assigned", "to": "in_transit", "label": "Passer en transit"},
                {"from": "assigned", "to": "cancelled", "label": "Annuler"},
                {"from": "in_transit", "to": "delivered", "label": "Livrer"},
            ],
        },
        {
            "slug": "avm-workflow",
            "legacy_slugs": [],
            "name": "Avis de Mission",
            "entity_type": "avm",
            "states": ["draft", "in_preparation", "ready", "active", "completed", "cancelled"],
            "transitions": [
                {"from": "draft", "to": "in_preparation", "label": "Lancer la préparation"},
                {"from": "draft", "to": "ready", "label": "Prêt pour approbation"},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                {"from": "in_preparation", "to": "ready", "label": "Marquer prêt"},
                {"from": "in_preparation", "to": "active", "label": "Approuver"},
                {"from": "in_preparation", "to": "cancelled", "label": "Annuler"},
                {"from": "ready", "to": "active", "label": "Approuver"},
                {"from": "ready", "to": "cancelled", "label": "Annuler"},
                {"from": "active", "to": "completed", "label": "Clôturer"},
                {"from": "active", "to": "cancelled", "label": "Annuler"},
            ],
        },
    ]


async def _sync_default_workflow_definition(db: AsyncSession, *, entity_id: UUID, definition_data: dict) -> None:
    lookup_slugs = [definition_data["slug"], *definition_data.get("legacy_slugs", [])]
    result = await db.execute(
        select(WorkflowDefinition).where(
            WorkflowDefinition.entity_id == entity_id,
            WorkflowDefinition.slug.in_(lookup_slugs),
        ).order_by(WorkflowDefinition.created_at)
    )
    definition = result.scalars().first()
    if not definition:
        db.add(WorkflowDefinition(
            entity_id=entity_id,
            slug=definition_data["slug"],
            name=definition_data["name"],
            entity_type=definition_data["entity_type"],
            states=definition_data["states"],
            transitions=definition_data["transitions"],
            status="published",
        ))
        logger.info("Seed: created workflow definition '%s'", definition_data["slug"])
        return

    changed = False
    for field, value in (
        ("slug", definition_data["slug"]),
        ("name", definition_data["name"]),
        ("entity_type", definition_data["entity_type"]),
        ("states", definition_data["states"]),
        ("transitions", definition_data["transitions"]),
        ("status", "published"),
        ("active", True),
    ):
        if getattr(definition, field) != value:
            setattr(definition, field, value)
            changed = True
    if changed:
        logger.info("Seed: synced workflow definition '%s'", definition_data["slug"])


async def seed_production_essentials(db: AsyncSession) -> None:
    """Seed production-essential data — idempotent, runs on EVERY startup.

    Creates ONLY what the application needs to function:
    - Default entity (from env vars)
    - Admin superuser (from env vars)
    - SUPER_ADMIN group + assignment
    - Workflow definitions
    - Dashboard tabs
    - Email & PDF templates
    - Reference numbering sequences
    - Dictionary entries (visa types, health conditions, etc.)
    - Compliance matrix
    """

    # ── Entity ──────────────────────────────────────────────────
    entity_code = os.environ.get("FIRST_ENTITY_CODE", "CM")
    entity_name = os.environ.get("FIRST_ENTITY_NAME", "Perenco Cameroun")

    result = await db.execute(
        select(Entity).where(Entity.code.in_([entity_code, "CM", "PER_CMR"])).order_by(Entity.created_at)
    )
    entity = result.scalars().first()
    if not entity:
        entity = Entity(
            code=entity_code,
            name=entity_name,
            country=os.environ.get("FIRST_ENTITY_COUNTRY", "CM"),
            timezone=os.environ.get("FIRST_ENTITY_TIMEZONE", "Africa/Douala"),
            language="fr",
            currency=os.environ.get("FIRST_ENTITY_CURRENCY", "XAF"),
            fiscal_year_start=1,
        )
        db.add(entity)
        await db.flush()
        logger.info("Seed: created entity %s", entity_code)

    # ── Admin user ──────────────────────────────────────────────
    admin_email = os.environ.get("FIRST_SUPERUSER", "admin@opsflux.io")
    superuser_password = os.environ.get("FIRST_SUPERUSER_PASSWORD", "Admin@2026!")

    result = await db.execute(select(User).where(User.email == admin_email))
    admin = result.scalar_one_or_none()
    if not admin:
        admin = User(
            email=admin_email,
            first_name="Admin",
            last_name="OpsFlux",
            hashed_password=hash_password(superuser_password),
            default_entity_id=entity.id,
            language="fr",
        )
        db.add(admin)
        await db.flush()
        logger.info("Seed: created admin user %s", admin_email)
    else:
        # Validate hash integrity — fix if corrupted (e.g. shell $ escaping)
        pw_hash = admin.hashed_password or ""
        if not pw_hash.startswith("$2b$") or len(pw_hash) != 60:
            admin.hashed_password = hash_password(superuser_password)
            logger.warning("Seed: admin password hash was corrupted — reset")

    # ── SUPER_ADMIN group ───────────────────────────────────────
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.entity_id == entity.id,
            UserGroup.name == "Super Administrators",
        )
    )
    admin_group = result.scalars().first()
    if not admin_group:
        admin_group = UserGroup(entity_id=entity.id, name="Super Administrators")
        db.add(admin_group)
        await db.flush()
        db.add(UserGroupRole(group_id=admin_group.id, role_code="SUPER_ADMIN"))
        logger.info("Seed: created SUPER_ADMIN group")

    result = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.user_id == admin.id,
            UserGroupMember.group_id == admin_group.id,
        )
    )
    if not result.scalar_one_or_none():
        db.add(UserGroupMember(user_id=admin.id, group_id=admin_group.id))
        logger.info("Seed: assigned SUPER_ADMIN to admin")

    # ── Workflow definitions ────────────────────────────────────
    for workflow_definition in _default_workflow_definitions():
        await _sync_default_workflow_definition(db, entity_id=entity.id, definition_data=workflow_definition)

    # ── Dashboard tabs ──────────────────────────────────────────
    await seed_dashboard_tabs(db, entity.id)

    # ── Email templates ─────────────────────────────────────────
    await seed_email_templates(db, entity.id, admin.id)

    # ── PDF templates ───────────────────────────────────────────
    await seed_pdf_templates(db, entity.id, admin.id)

    # ── Reference numbering ─────────────────────────────────────
    await seed_reference_numbering(db, entity.id)

    # ── Dictionary entries ──────────────────────────────────────
    await seed_dictionary_entries(db)

    # ── Compliance matrix ───────────────────────────────────────
    await seed_compliance_matrix(db, entity.id)

    await db.commit()
    logger.info("Seed: production essentials seeded successfully")


async def seed_dev_data(db: AsyncSession) -> None:
    """Seed development data — calls production essentials + adds test data.

    Only runs when DEV_SEED_ON_STARTUP is enabled in development.
    """
    # First, seed all production essentials
    await seed_production_essentials(db)

    # ── Get entity + admin for test data ────────────────────────
    entity_code = os.environ.get("FIRST_ENTITY_CODE", "CM")
    result = await db.execute(select(Entity).where(Entity.code == entity_code))
    entity = result.scalars().first()
    if not entity:
        return

    # ── Sample test users with different roles ──────────────────
    test_users = [
        ("cds@opsflux.io", "Chef", "De Site", "CDS"),
        ("hse@opsflux.io", "Coordinateur", "HSE", "HSE_ADMIN"),
        ("dprod@opsflux.io", "Directeur", "Production", "DPROD"),
        ("chef.projet@opsflux.io", "Chef", "Projet", "CHEF_PROJET"),
        ("demandeur@opsflux.io", "Jean", "Dupont", "READER"),
    ]

    for email, first, last, role_code in test_users:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if not user:
            user = User(
                email=email,
                first_name=first,
                last_name=last,
                hashed_password=hash_password("Test@2026!"),
                default_entity_id=entity.id,
                language="fr",
            )
            db.add(user)
            await db.flush()
            logger.info("Seed: created test user %s", email)

        result = await db.execute(
            select(UserGroup).where(
                UserGroup.entity_id == entity.id,
                UserGroup.name == f"Groupe {role_code}",
            )
        )
        group = result.scalars().first()
        if not group:
            group = UserGroup(entity_id=entity.id, name=f"Groupe {role_code}")
            db.add(group)
            await db.flush()
            db.add(UserGroupRole(group_id=group.id, role_code=role_code))

        result = await db.execute(
            select(UserGroupMember).where(
                UserGroupMember.user_id == user.id,
                UserGroupMember.group_id == group.id,
            )
        )
        if not result.scalar_one_or_none():
            db.add(UserGroupMember(user_id=user.id, group_id=group.id))

    # ── Sample assets ───────────────────────────────────────────
    from app.models.asset_registry import OilField as Field, OilSite as Site

    result = await db.execute(select(Installation).where(Installation.code == "EBOME"))
    if not result.scalar_one_or_none():
        field = Field(entity_id=entity.id, code="PCM", name="Perenco Cameroon",
                      country="CM", operator="Perenco", environment="OFFSHORE", status="OPERATIONAL")
        db.add(field)
        await db.flush()
        site_ebome = Site(entity_id=entity.id, field_id=field.id, code="EBOME", name="Site Ebome",
                          site_type="PRODUCTION", environment="OFFSHORE", country="CM", manned=True, status="OPERATIONAL")
        site_munja = Site(entity_id=entity.id, field_id=field.id, code="MUNJA", name="Site Munja",
                          site_type="PRODUCTION", environment="ONSHORE", country="CM", manned=True, status="OPERATIONAL")
        site_wouri = Site(entity_id=entity.id, field_id=field.id, code="WOURI", name="Base Wouri",
                          site_type="SHORE_BASE", environment="ONSHORE", country="CM", manned=True, status="OPERATIONAL")
        db.add_all([site_ebome, site_munja, site_wouri])
        await db.flush()
        for site, code, name, itype, env, lat, lon in [
            (site_ebome, "EBOME", "Champ Ebome", "CPF", "OFFSHORE", 2.8, 9.8),
            (site_ebome, "ESF1", "Plateforme ESF1", "FIXED_PLATFORM", "OFFSHORE", 2.83, 9.77),
            (site_ebome, "KLF3", "Plateforme KLF3", "FIXED_PLATFORM", "OFFSHORE", 2.81, 9.76),
            (site_munja, "MUNJA", "Munja", "ONSHORE_PLANT", "ONSHORE", 2.82, 9.78),
            (site_wouri, "WOURI", "Base Logistique Wouri", "ONSHORE_PLANT", "ONSHORE", 4.05, 9.7),
        ]:
            db.add(Installation(entity_id=entity.id, site_id=site.id, code=code, name=name,
                                installation_type=itype, environment=env, status="OPERATIONAL",
                                is_manned=True, latitude=lat, longitude=lon))
        logger.info("Seed: created sample assets")

    await db.commit()
    logger.info("Seed: development data seeded successfully")


async def seed_dashboard_tabs(db: AsyncSession, entity_id) -> None:
    """Seed mandatory dashboard tabs per role — raw SQL, idempotent via ON CONFLICT.

    Uses uuid5 with a fixed namespace so the same entity always produces the same
    tab IDs.  Re-running the seed is a no-op (ON CONFLICT (id) DO NOTHING).
    """
    entity_id_str = str(entity_id)

    def _make_tab_id(tab_name: str, role: str | None, module: str | None) -> str:
        """Deterministic UUID for a seed tab — stable across runs."""
        key = f"tab:{entity_id_str}:{tab_name}:{role or ''}:{module or ''}"
        return str(uuid5(_SEED_NS, key))

    # Map widget IDs → render types (must match WidgetCard.tsx switch cases)
    _RENDER_TYPES: dict[str, str] = {
        "alerts_urgent": "kpi", "pax_on_site": "kpi", "kpi_fleet": "kpi",
        "pickup_progress": "kpi", "weather_sites": "kpi",
        "ads_pending": "kpi", "compliance_expiry": "table", "signalements_actifs": "table",
        "project_status": "table", "my_ads": "table", "trips_today": "table", "cargo_pending": "table",
        "planner_gantt_mini": "chart", "capacity_heatmap": "chart",
        "fleet_map": "map",
        # Projets module
        "projets_kpis": "kpi", "projets_weather": "chart",
        "projets_deadlines": "table", "projets_top_volume": "table",
        # Asset Registry module
        "assets_overview": "kpi", "assets_equipment_by_class": "chart",
        "assets_by_status": "chart", "assets_sites_by_type": "chart", "assets_map": "map",
        # PaxLog module
        "paxlog_compliance_rate": "kpi", "paxlog_ads_by_status": "chart",
        "paxlog_expiring_credentials": "table", "paxlog_incidents": "kpi",
        # Conformité module
        "conformite_kpis": "kpi", "conformite_by_category": "chart",
        # Tiers module
        "tiers_overview": "kpi", "tiers_by_type": "chart", "tiers_recent": "table",
        # Users module
        "users_overview": "kpi", "users_by_role": "chart", "users_by_group": "chart",
        "users_recent_activity": "table", "users_mfa_stats": "kpi", "users_orphans": "table",
        # Support module
        "support_overview": "kpi", "support_tickets_recent": "table", "support_by_status": "chart",
        "support_by_type": "chart", "support_by_priority": "chart", "support_trend": "chart",
        # Conformité (advanced)
        "conformite_urgency": "chart", "conformite_by_status": "chart",
        "conformite_matrix": "table", "conformite_trend": "chart",
        # Planner (advanced)
        "planner_overview": "kpi", "planner_by_type": "chart", "planner_by_status": "chart",
        "planner_conflicts_kpi": "kpi", "planner_pax_by_site": "chart",
        # Papyrus
        "papyrus_overview": "kpi", "papyrus_by_status": "chart", "papyrus_by_type": "chart",
        "papyrus_recent_documents": "table", "papyrus_forms_overview": "kpi",
        # Workflow
        "workflow_overview": "kpi", "workflow_by_definition": "chart", "workflow_pending": "table",
        # PackLog module
        "packlog_overview": "kpi", "packlog_catalog_overview": "kpi",
        "packlog_requests_by_status": "chart", "packlog_cargo_by_status": "chart",
        "packlog_tracking": "table", "packlog_alerts": "table",
    }

    def _make_widget(widget_type: str, title: str, config: dict, position: dict) -> dict:
        """Build a widget dict matching the JSONB schema."""
        suffix = hashlib.md5(f"{entity_id_str}:{widget_type}:{title}".encode()).hexdigest()[:8]
        render_type = _RENDER_TYPES.get(widget_type, "table")
        return {
            "id": f"w_{widget_type}_{suffix}",
            "type": render_type,
            "title": title,
            "config": {**config, "widget_id": widget_type},
            "position": position,
            "options": {"refreshInterval": 60000, "showHeader": True, "showLastRefreshed": True},
        }

    # ── Tab definitions per spec section 11 ──────────────────────────
    ROLE_TABS: list[dict] = [
        # Universal — visible to all users (no role/module filter)
        {
            "name": "Vue d'ensemble",
            "target_role": None,
            "target_module": None,
            "tab_order": -1,
            "widgets": [
                _make_widget("alerts_urgent", "Alertes critiques",
                             {"source": "core"},
                             {"x": 0, "y": 0, "w": 3, "h": 3}),
                _make_widget("pax_on_site", "PAX sur site",
                             {"source": "paxlog"},
                             {"x": 3, "y": 0, "w": 3, "h": 3}),
                _make_widget("kpi_fleet", "Flotte active",
                             {"source": "travelwiz"},
                             {"x": 6, "y": 0, "w": 3, "h": 3}),
                _make_widget("pickup_progress", "Ramassage",
                             {"source": "travelwiz"},
                             {"x": 9, "y": 0, "w": 3, "h": 3}),
                _make_widget("ads_pending", "AdS en attente",
                             {"source": "paxlog", "status": "pending_validation"},
                             {"x": 0, "y": 3, "w": 3, "h": 4}),
                _make_widget("project_status", "Projets actifs",
                             {"source": "projets", "hidden_columns": ["manager_name", "start_date"]},
                             {"x": 3, "y": 3, "w": 5, "h": 4}),
                _make_widget("signalements_actifs", "Signalements",
                             {"source": "paxlog", "hidden_columns": ["description"]},
                             {"x": 8, "y": 3, "w": 4, "h": 4}),
                _make_widget("compliance_expiry", "Certifications expirant",
                             {"source": "paxlog", "days_ahead": 30, "hidden_columns": ["badge_number", "category"]},
                             {"x": 0, "y": 7, "w": 6, "h": 4}),
                _make_widget("trips_today", "Voyages du jour",
                             {"source": "travelwiz", "hidden_columns": ["vector_type", "scheduled_arrival"]},
                             {"x": 6, "y": 7, "w": 6, "h": 4}),
            ],
        },
        # CDS — Chef de Site
        {
            "name": "Mon site",
            "target_role": "CDS",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("pax_on_site", "PAX sur site",
                             {"source": "paxlog"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("ads_pending", "AdS en attente",
                             {"source": "paxlog", "status": "pending_validation"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("planner_gantt_mini", "Gantt compact",
                             {"source": "planner", "chart_type": "gantt"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes critiques",
                             {"source": "core"},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
            ],
        },
        # LOG_BASE — Logistique Base
        {
            "name": "Opérations",
            "target_role": "LOG_BASE",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("fleet_map", "Carte flotte temps réel",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("trips_today", "Voyages du jour",
                             {"source": "travelwiz", "hidden_columns": ["vector_type", "scheduled_arrival"]},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("cargo_pending", "Cargo en attente",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 4, "w": 6, "h": 3}),
                _make_widget("pickup_progress", "Ramassage en cours",
                             {"source": "travelwiz"},
                             {"x": 6, "y": 4, "w": 6, "h": 3}),
            ],
        },
        # DO — Directeur Opérations
        {
            "name": "Vue globale",
            "target_role": "DO",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("capacity_heatmap", "Charge PAX par site",
                             {"source": "planner", "chart_type": "heatmap", "x_field": "date", "y_fields": ["asset_name", "percentage"]},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes critiques",
                             {"source": "core"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("fleet_map", "Carte flotte",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("signalements_actifs", "Signalements actifs",
                             {"source": "paxlog"},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
            ],
        },
        # DEMANDEUR
        {
            "name": "Mes demandes",
            "target_role": "DEMANDEUR",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("my_ads", "Mes AdS en cours",
                             {"source": "paxlog", "scope": "my"},
                             {"x": 0, "y": 0, "w": 8, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
            ],
        },
        # CHEF_PROJET
        {
            "name": "Mes projets",
            "target_role": "CHEF_PROJET",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("project_status", "Projets actifs",
                             {"source": "projets"},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("planner_gantt_mini", "Gantt compact",
                             {"source": "planner"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core"},
                             {"x": 0, "y": 4, "w": 12, "h": 3}),
            ],
        },
        # CHSE (Compliance HSE) — mapped to HSE_ADMIN role
        {
            "name": "Compliance & HSE",
            "target_role": "HSE_ADMIN",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("compliance_expiry", "Certifications expirant 30j",
                             {"source": "paxlog", "days_ahead": 30},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("signalements_actifs", "Signalements actifs",
                             {"source": "paxlog"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core"},
                             {"x": 0, "y": 4, "w": 12, "h": 3}),
            ],
        },
        # ── Module-specific dashboard tabs ────────────────────────────
        # ── Module-specific dashboard tabs with contextual widgets ────
        # Planner module dashboard — BI professional layout
        {
            "name": "Planner",
            "target_role": None,
            "target_module": "planner",
            "tab_order": 0,
            "widgets": [
                _make_widget("planner_overview", "Activites",
                             {"source": "planner", "icon_color": "blue"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("planner_conflicts_kpi", "Conflits",
                             {"source": "planner", "icon_color": "red"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("planner_by_type", "Par type",
                             {"source": "planner", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("planner_by_status", "Par statut",
                             {"source": "planner", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("planner_pax_by_site", "PAX par site",
                             {"source": "planner", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("capacity_heatmap", "Charge PAX journalière",
                             {"source": "planner", "chart_type": "heatmap", "x_field": "date", "y_fields": ["asset_name", "percentage"]},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
                _make_widget("planner_gantt_mini", "Gantt compact",
                             {"source": "planner", "chart_type": "gantt"},
                             {"x": 0, "y": 8, "w": 12, "h": 5}),
            ],
        },
        # PaxLog module dashboard
        {
            "name": "PaxLog",
            "target_role": None,
            "target_module": "paxlog",
            "tab_order": 0,
            "widgets": [
                _make_widget("pax_on_site", "PAX sur site",
                             {"source": "paxlog"},
                             {"x": 0, "y": 0, "w": 3, "h": 3}),
                _make_widget("paxlog_compliance_rate", "Taux de conformité",
                             {"source": "paxlog"},
                             {"x": 3, "y": 0, "w": 3, "h": 3}),
                _make_widget("paxlog_incidents", "Incidents actifs",
                             {"source": "paxlog"},
                             {"x": 6, "y": 0, "w": 3, "h": 3}),
                _make_widget("ads_pending", "AdS en attente",
                             {"source": "paxlog"},
                             {"x": 9, "y": 0, "w": 3, "h": 3}),
                _make_widget("paxlog_ads_by_status", "AdS par statut",
                             {"source": "paxlog"},
                             {"x": 0, "y": 3, "w": 6, "h": 4}),
                _make_widget("paxlog_expiring_credentials", "Certifications expirant",
                             {"source": "paxlog", "days_ahead": 30, "hidden_columns": ["badge_number", "category"]},
                             {"x": 6, "y": 3, "w": 6, "h": 4}),
            ],
        },
        # TravelWiz module dashboard
        {
            "name": "TravelWiz",
            "target_role": None,
            "target_module": "travelwiz",
            "tab_order": 0,
            "widgets": [
                _make_widget("kpi_fleet", "Flotte active",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 0, "w": 3, "h": 3}),
                _make_widget("pickup_progress", "Ramassage",
                             {"source": "travelwiz"},
                             {"x": 3, "y": 0, "w": 3, "h": 3}),
                _make_widget("weather_sites", "Meteo sites",
                             {"source": "travelwiz"},
                             {"x": 6, "y": 0, "w": 3, "h": 3}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core"},
                             {"x": 9, "y": 0, "w": 3, "h": 3}),
                _make_widget("trips_today", "Voyages du jour",
                             {"source": "travelwiz", "hidden_columns": ["vector_type", "scheduled_arrival"]},
                             {"x": 0, "y": 3, "w": 6, "h": 4}),
                _make_widget("cargo_pending", "Cargo en attente",
                             {"source": "travelwiz"},
                             {"x": 6, "y": 3, "w": 6, "h": 4}),
                _make_widget("fleet_map", "Carte flotte",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 7, "w": 12, "h": 5}),
            ],
        },
        # PackLog module dashboard
        {
            "name": "PackLog",
            "target_role": None,
            "target_module": "packlog",
            "tab_order": 0,
            "widgets": [
                _make_widget("packlog_overview", "Vue d'ensemble",
                             {"source": "packlog"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("packlog_catalog_overview", "Catalogue SAP",
                             {"source": "packlog"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("packlog_requests_by_status", "Demandes par statut",
                             {"source": "packlog", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("packlog_cargo_by_status", "Colis par statut",
                             {"source": "packlog", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("packlog_tracking", "Tracking récent",
                             {"source": "packlog"},
                             {"x": 0, "y": 4, "w": 6, "h": 5}),
                _make_widget("packlog_alerts", "Alertes",
                             {"source": "packlog"},
                             {"x": 6, "y": 4, "w": 6, "h": 5}),
            ],
        },
        # Projets module dashboard
        {
            "name": "Projets",
            "target_role": None,
            "target_module": "projets",
            "tab_order": 0,
            "widgets": [
                _make_widget("projets_kpis", "KPIs Projets",
                             {"source": "projets"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("project_status", "Projets actifs",
                             {"source": "projets"},
                             {"x": 3, "y": 0, "w": 5, "h": 4}),
                _make_widget("projets_weather", "Santé projets",
                             {"source": "projets", "chart_type": "bar"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
                _make_widget("projets_deadlines", "Échéances 14 jours",
                             {"source": "projets"},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("projets_top_volume", "Top projets par volume",
                             {"source": "projets"},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
            ],
        },
        # Asset Registry module dashboard
        {
            "name": "Asset Registry",
            "target_role": None,
            "target_module": "asset_registry",
            "tab_order": 0,
            "widgets": [
                _make_widget("assets_overview", "Vue d'ensemble",
                             {"source": "asset_registry"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("assets_equipment_by_class", "Equipements par classe",
                             {"source": "asset_registry", "chart_type": "pie"},
                             {"x": 3, "y": 0, "w": 5, "h": 4}),
                _make_widget("assets_by_status", "Equipements par statut",
                             {"source": "asset_registry", "chart_type": "bar"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
                _make_widget("assets_sites_by_type", "Sites par type",
                             {"source": "asset_registry", "chart_type": "pie"},
                             {"x": 0, "y": 4, "w": 4, "h": 4}),
                _make_widget("assets_map", "Carte des assets",
                             {"source": "asset_registry"},
                             {"x": 4, "y": 4, "w": 8, "h": 5}),
            ],
        },
        # Conformité module dashboard — BI professional layout
        {
            "name": "Conformité",
            "target_role": None,
            "target_module": "conformite",
            "tab_order": 0,
            "widgets": [
                _make_widget("conformite_kpis", "Score conformité",
                             {"source": "conformite", "icon_color": "green"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("paxlog_compliance_rate", "Taux PAX",
                             {"source": "paxlog", "icon_color": "cyan"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("conformite_by_status", "Par statut",
                             {"source": "conformite", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("conformite_urgency", "Expirations par urgence",
                             {"source": "conformite", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("conformite_trend", "Tendance score",
                             {"source": "conformite", "chart_type": "area", "x_field": "month", "y_fields": ["score"]},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("compliance_expiry", "Certifications expirant 30j",
                             {"source": "paxlog", "days_ahead": 30},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
                _make_widget("conformite_matrix", "Matrice type x statut",
                             {"source": "conformite"},
                             {"x": 0, "y": 8, "w": 12, "h": 4}),
            ],
        },
        # Tiers module dashboard
        {
            "name": "Tiers",
            "target_role": None,
            "target_module": "tiers",
            "tab_order": 0,
            "widgets": [
                _make_widget("tiers_overview", "Vue d'ensemble",
                             {"source": "tiers"},
                             {"x": 0, "y": 0, "w": 4, "h": 4}),
                _make_widget("tiers_by_type", "Entreprises par type",
                             {"source": "tiers", "chart_type": "pie"},
                             {"x": 4, "y": 0, "w": 4, "h": 4}),
                _make_widget("tiers_recent", "Tiers récents",
                             {"source": "tiers"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core"},
                             {"x": 0, "y": 4, "w": 12, "h": 3}),
            ],
        },
        # Users module dashboard — intelligent widgets
        {
            "name": "Comptes",
            "target_role": None,
            "target_module": "users",
            "tab_order": 0,
            "widgets": [
                _make_widget("users_overview", "Utilisateurs",
                             {"source": "users"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("users_mfa_stats", "Sécurité MFA",
                             {"source": "users"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("users_by_role", "Par rôle",
                             {"source": "users", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("users_by_group", "Par groupe",
                             {"source": "users", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("users_recent_activity", "Connexions récentes",
                             {"source": "users"},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("users_orphans", "Sans groupe",
                             {"source": "users"},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
            ],
        },
        # Support module dashboard — BI professional layout
        {
            "name": "Support",
            "target_role": None,
            "target_module": "support",
            "tab_order": 0,
            "widgets": [
                _make_widget("support_overview", "Tickets",
                             {"source": "support", "icon_color": "orange"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core", "icon_color": "red"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("support_by_status", "Par statut",
                             {"source": "support", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("support_by_priority", "Par priorité",
                             {"source": "support", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("support_trend", "Tendance ouverture/resolution",
                             {"source": "support", "chart_type": "area", "x_field": "week", "y_fields": ["opened", "resolved"]},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("support_by_type", "Par type",
                             {"source": "support", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 4, "w": 6, "h": 4}),
                _make_widget("support_tickets_recent", "Derniers tickets",
                             {"source": "support"},
                             {"x": 0, "y": 8, "w": 12, "h": 4}),
            ],
        },
        # Papyrus module dashboard
        {
            "name": "Papyrus",
            "target_role": None,
            "target_module": "papyrus",
            "tab_order": 0,
            "widgets": [
                _make_widget("papyrus_overview", "Documents",
                             {"source": "papyrus", "icon_color": "yellow"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("papyrus_forms_overview", "Collecte externe",
                             {"source": "papyrus", "icon_color": "green"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("papyrus_by_status", "Par statut",
                             {"source": "papyrus", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 3, "h": 4}),
                _make_widget("papyrus_by_type", "Par type",
                             {"source": "papyrus", "chart_type": "bar", "x_field": "name", "y_fields": ["value"]},
                             {"x": 9, "y": 0, "w": 3, "h": 4}),
                _make_widget("papyrus_recent_documents", "Documents recents",
                             {"source": "papyrus"},
                             {"x": 0, "y": 4, "w": 12, "h": 5}),
            ],
        },
        # Workflow module dashboard — BI professional layout
        {
            "name": "Workflow",
            "target_role": None,
            "target_module": "workflow",
            "tab_order": 0,
            "widgets": [
                _make_widget("workflow_overview", "Workflows",
                             {"source": "workflow", "icon_color": "violet"},
                             {"x": 0, "y": 0, "w": 3, "h": 4}),
                _make_widget("alerts_urgent", "Alertes",
                             {"source": "core", "icon_color": "red"},
                             {"x": 3, "y": 0, "w": 3, "h": 4}),
                _make_widget("workflow_by_definition", "Par workflow",
                             {"source": "workflow", "chart_type": "pie", "x_field": "name", "y_fields": ["value"]},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("workflow_pending", "En attente d'action",
                             {"source": "workflow"},
                             {"x": 0, "y": 4, "w": 12, "h": 5}),
            ],
        },
    ]

    # ── Bulk UPSERT via raw SQL — updates widgets on re-seed ──────────
    insert_sql = text("""
        INSERT INTO dashboard_tabs (id, entity_id, name, is_mandatory, target_role,
                                    target_module, tab_order, widgets, is_active)
        VALUES (:id, :entity_id, :name, TRUE, :target_role,
                :target_module, :tab_order, CAST(:widgets AS jsonb), TRUE)
        ON CONFLICT (id) DO UPDATE SET widgets = EXCLUDED.widgets, name = EXCLUDED.name
    """)

    inserted = 0
    for tab_def in ROLE_TABS:
        tab_id = _make_tab_id(
            tab_def["name"], tab_def.get("target_role"), tab_def.get("target_module"),
        )
        result = await db.execute(insert_sql, {
            "id": tab_id,
            "entity_id": entity_id_str,
            "name": tab_def["name"],
            "target_role": tab_def.get("target_role"),
            "target_module": tab_def.get("target_module"),
            "tab_order": tab_def["tab_order"],
            "widgets": json.dumps(tab_def["widgets"]),
        })
        inserted += result.rowcount

    if inserted:
        logger.info("Seed: inserted %d / %d mandatory dashboard tabs", inserted, len(ROLE_TABS))
    else:
        logger.info("Seed: all %d mandatory dashboard tabs already exist", len(ROLE_TABS))


async def seed_email_templates(db: AsyncSession, entity_id, admin_id) -> None:
    """Seed default email templates — idempotent."""
    from app.core.email_templates import DEFAULT_TEMPLATES
    from app.models.common import EmailTemplate, EmailTemplateVersion

    created = 0
    updated = 0
    for tpl_def in DEFAULT_TEMPLATES:
        result = await db.execute(
            select(EmailTemplate.id).where(
                EmailTemplate.entity_id == entity_id,
                EmailTemplate.slug == tpl_def["slug"],
            )
        )
        if result.scalar_one_or_none():
            continue

        template = EmailTemplate(
            entity_id=entity_id,
            slug=tpl_def["slug"],
            name=tpl_def["name"],
            description=tpl_def.get("description"),
            object_type=tpl_def.get("object_type", "system"),
            enabled=True,
            variables_schema=tpl_def.get("variables_schema"),
        )
        db.add(template)
        await db.flush()

        for lang, content in tpl_def.get("default_versions", {}).items():
            db.add(EmailTemplateVersion(
                template_id=template.id,
                version=1,
                language=lang,
                subject=content["subject"],
                body_html=content["body_html"],
                is_active=True,
                created_by=admin_id,
            ))
        created += 1

    if created:
        logger.info("Seed: created %d email templates", created)
    else:
        logger.info("Seed: all email templates already exist")


async def seed_pdf_templates(db: AsyncSession, entity_id, admin_id) -> None:
    """Seed default PDF templates — idempotent.

    For templates that already exist but only have the default v1 (never
    customised by the admin), the body_html / page_size / margins are
    kept in sync with DEFAULT_PDF_TEMPLATES so code changes to the
    built-in templates propagate automatically on deploy. Templates that
    have a v2+ are considered customised and are left alone.
    """
    from app.core.pdf_templates import DEFAULT_PDF_TEMPLATES
    from app.models.common import PdfTemplate, PdfTemplateVersion

    created = 0
    upgraded = 0
    for tpl_def in DEFAULT_PDF_TEMPLATES:
        result = await db.execute(
            select(PdfTemplate).where(
                PdfTemplate.entity_id == entity_id,
                PdfTemplate.slug == tpl_def["slug"],
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            # Count published versions to detect customisation
            versions_result = await db.execute(
                select(PdfTemplateVersion).where(
                    PdfTemplateVersion.template_id == existing.id,
                )
            )
            versions = versions_result.scalars().all()
            max_version = max((v.version_number for v in versions), default=0)
            # Only auto-upgrade when no v2+ has been created by the admin
            if max_version > 1:
                continue
            # Refresh the page settings on the template row
            existing.name = tpl_def["name"]
            existing.description = tpl_def.get("description")
            existing.page_size = tpl_def.get("page_size", "A4")
            existing.orientation = tpl_def.get("orientation", "portrait")
            existing.margin_top = tpl_def.get("margin_top", 15)
            existing.margin_right = tpl_def.get("margin_right", 12)
            existing.margin_bottom = tpl_def.get("margin_bottom", 15)
            existing.margin_left = tpl_def.get("margin_left", 12)
            existing.variables_schema = tpl_def.get("variables_schema")
            # Refresh the v1 body for each language in the default set
            changed = False
            for lang, content in tpl_def.get("default_versions", {}).items():
                v = next((x for x in versions if x.language == lang and x.version_number == 1), None)
                new_body = content.get("body_html", "")
                new_header = content.get("header_html")
                new_footer = content.get("footer_html")
                if v is None:
                    db.add(PdfTemplateVersion(
                        template_id=existing.id,
                        version_number=1,
                        language=lang,
                        body_html=new_body,
                        header_html=new_header,
                        footer_html=new_footer,
                        is_published=True,
                        created_by=admin_id,
                    ))
                    changed = True
                elif (v.body_html != new_body
                      or v.header_html != new_header
                      or v.footer_html != new_footer):
                    v.body_html = new_body
                    v.header_html = new_header
                    v.footer_html = new_footer
                    v.is_published = True
                    changed = True
            if changed:
                upgraded += 1
            continue

        template = PdfTemplate(
            entity_id=entity_id,
            slug=tpl_def["slug"],
            name=tpl_def["name"],
            description=tpl_def.get("description"),
            object_type=tpl_def.get("object_type", "system"),
            enabled=True,
            variables_schema=tpl_def.get("variables_schema"),
            page_size=tpl_def.get("page_size", "A4"),
            orientation=tpl_def.get("orientation", "portrait"),
            margin_top=tpl_def.get("margin_top", 15),
            margin_right=tpl_def.get("margin_right", 12),
            margin_bottom=tpl_def.get("margin_bottom", 15),
            margin_left=tpl_def.get("margin_left", 12),
        )
        db.add(template)
        await db.flush()

        for lang, content in tpl_def.get("default_versions", {}).items():
            db.add(PdfTemplateVersion(
                template_id=template.id,
                version_number=1,
                language=lang,
                body_html=content.get("body_html", ""),
                header_html=content.get("header_html", ""),
                footer_html=content.get("footer_html", ""),
                is_published=True,
                created_by=admin_id,
            ))
        created += 1

    if created or upgraded:
        logger.info("Seed: created %d PDF templates, upgraded %d v1 bodies", created, upgraded)
    else:
        logger.info("Seed: all PDF templates already exist and are up-to-date")


async def seed_reference_numbering(db: AsyncSession, entity_id) -> None:
    """Seed default reference numbering patterns via Settings — idempotent.

    Creates Setting rows for reference_template:{PREFIX} with default patterns.
    Value is JSONB: {"template": "ADS-{YYYY}-{####}"}
    """
    from app.models.common import Setting

    entity_id_str = str(entity_id)

    # Default numbering patterns per module
    numbering_defaults = [
        # PaxLog
        ("ADS", "{prefix}-{YYYY}-{####}"),
        ("PRF", "{prefix}-{YYYY}-{####}"),
        ("INC", "{prefix}-{YYYY}-{####}"),
        ("ROT", "{prefix}-{YYYY}-{####}"),
        # Planner
        ("ACT", "{prefix}-{YYYY}-{####}"),
        # Projets
        ("PRJ", "{prefix}-{YY}-{######}"),
        # TravelWiz
        ("VYG", "{prefix}-{YYYY}-{######}"),
        ("MAN", "{prefix}-{YYYY}-{####}"),
        # Conformité
        ("AUD", "{prefix}-{YYYY}-{####}"),
        ("NCR", "{prefix}-{YYYY}-{####}"),
        ("JBP", "{prefix}-{YYYY}-{####}"),
        # Documents
        ("DOC", "{entity_code}-{prefix}-{YYYY}-{####}"),
        # Tiers (companies)
        ("TIR", "{prefix}-{YYYY}-{####}"),
    ]

    created = 0
    for prefix, template in numbering_defaults:
        setting_key = f"reference_template:{prefix}"
        result = await db.execute(
            select(Setting).where(Setting.key == setting_key)
        )
        if result.scalar_one_or_none():
            continue

        db.add(Setting(
            key=setting_key,
            value={"template": template},
            scope="entity",
            scope_id=entity_id_str,
        ))
        created += 1

    if created:
        logger.info("Seed: created %d reference numbering patterns", created)
    else:
        logger.info("Seed: all reference numbering patterns already exist")


async def seed_dictionary_entries(db: AsyncSession) -> None:
    """Seed default dictionary entries — idempotent via ON CONFLICT."""
    from app.models.common import DictionaryEntry

    entries = [
        # ── Visa types ──
        ("visa_type", "tourist", "Touriste", 1),
        ("visa_type", "business", "Affaires", 2),
        ("visa_type", "work", "Travail", 3),
        ("visa_type", "transit", "Transit", 4),
        ("visa_type", "diplomatic", "Diplomatique", 5),
        ("visa_type", "resident", "Résident", 6),
        ("visa_type", "student", "Étudiant", 7),
        ("visa_type", "crew", "Équipage", 8),
        # ── Vaccine types ──
        ("vaccine_type", "yellow_fever", "Fièvre jaune", 1),
        ("vaccine_type", "hepatitis_a", "Hépatite A", 2),
        ("vaccine_type", "hepatitis_b", "Hépatite B", 3),
        ("vaccine_type", "typhoid", "Typhoïde", 4),
        ("vaccine_type", "meningitis", "Méningite", 5),
        ("vaccine_type", "rabies", "Rage", 6),
        ("vaccine_type", "cholera", "Choléra", 7),
        ("vaccine_type", "covid_19", "COVID-19", 8),
        ("vaccine_type", "tetanus", "Tétanos", 9),
        ("vaccine_type", "polio", "Polio", 10),
        ("vaccine_type", "diphtheria", "Diphtérie", 11),
        ("vaccine_type", "measles", "Rougeole", 12),
        # ── Passport types ──
        ("passport_type", "ordinary", "Ordinaire", 1),
        ("passport_type", "diplomatic", "Diplomatique", 2),
        ("passport_type", "service", "Service", 3),
        ("passport_type", "special", "Spécial", 4),
        ("passport_type", "temporary", "Temporaire", 5),
        ("passport_type", "collective", "Collectif", 6),
        # ── Medical check types ──
        ("medical_check_type", "standard", "Visite médicale standard", 1),
        ("medical_check_type", "international", "Visite médicale internationale", 2),
        ("medical_check_type", "subsidiary", "Visite médicale filiale", 3),
        ("medical_check_type", "offshore", "Aptitude offshore", 4),
        ("medical_check_type", "pre_employment", "Visite d'embauche", 5),
        ("medical_check_type", "return_to_work", "Visite de reprise", 6),
        # ── Relationship types (emergency contacts) ──
        ("relationship", "spouse", "Conjoint(e)", 1),
        ("relationship", "parent", "Parent", 2),
        ("relationship", "child", "Enfant", 3),
        ("relationship", "sibling", "Frère/Sœur", 4),
        ("relationship", "friend", "Ami(e)", 5),
        ("relationship", "colleague", "Collègue", 6),
        ("relationship", "other", "Autre", 10),
        # ── Driving license types (user module) ──
        ("license_type", "A", "A — Moto", 1),
        ("license_type", "B", "B — Véhicule léger", 2),
        ("license_type", "C", "C — Poids lourd", 3),
        ("license_type", "D", "D — Transport en commun", 4),
        ("license_type", "E", "E — Remorque", 5),
        ("license_type", "F", "F — Véhicule spécial", 6),
        # ── Oil field license/permit types (asset registry) ──
        ("field_license_type", "PSC", "PSC (Contrat de Partage de Production)", 1),
        ("field_license_type", "CONCESSION", "Concession", 2),
        ("field_license_type", "JOA", "JOA (Accord d'opération conjointe)", 3),
        ("field_license_type", "SERVICE_CONTRACT", "Contrat de service", 4),
        ("field_license_type", "EXPLORATION", "Permis d'exploration", 5),
        ("field_license_type", "EXPLOITATION", "Permis d'exploitation", 6),
        ("field_license_type", "RECONNAISSANCE", "Autorisation de reconnaissance", 7),
        ("field_license_type", "TRANSPORT", "Autorisation de transport", 8),
        ("field_license_type", "ENVIRONMENTAL", "Permis environnemental", 9),
        # ── Language proficiency ──
        ("proficiency_level", "native", "Langue maternelle", 1),
        ("proficiency_level", "fluent", "Courant", 2),
        ("proficiency_level", "advanced", "Avancé", 3),
        ("proficiency_level", "intermediate", "Intermédiaire", 4),
        ("proficiency_level", "beginner", "Débutant", 5),
        # ── Phone labels ──
        ("phone_label", "mobile", "Mobile", 1),
        ("phone_label", "office", "Bureau", 2),
        ("phone_label", "home", "Domicile", 3),
        ("phone_label", "fax", "Fax", 4),
        ("phone_label", "satellite", "Satellite", 5),
        # ── Email labels ──
        ("email_label", "professional", "Professionnel", 1),
        ("email_label", "personal", "Personnel", 2),
        ("email_label", "other", "Autre", 3),
        # ── Gender ──
        ("gender", "M", "Masculin", 1),
        ("gender", "F", "Féminin", 2),
        ("gender", "X", "Non spécifié", 3),
        # ── User type ──
        ("user_type", "internal", "Interne", 1),
        ("user_type", "external", "Externe", 2),
        # ── PaxLog dictionaries ──
        ("pax_type", "internal", "Interne", 1),
        ("pax_type", "external", "Externe", 2),
        ("visit_category", "project_work", "Travaux projet", 1),
        ("visit_category", "maintenance", "Maintenance", 2),
        ("visit_category", "inspection", "Inspection", 3),
        ("visit_category", "visit", "Visite", 4),
        ("visit_category", "permanent_ops", "Operations permanentes", 5),
        ("visit_category", "other", "Autre", 6),
        ("transport_mode", "helicopter", "Helicoptere", 1),
        ("transport_mode", "boat", "Bateau", 2),
        ("transport_mode", "vehicle", "Vehicule", 3),
        ("transport_mode", "plane", "Avion", 4),
        ("transport_mode", "walking", "A pied", 5),
        ("transport_mode", "other", "Autre", 6),
        ("travelwiz_cargo_type", "unit", "Colis unitaire", 1),
        ("packlog_cargo_type", "unit", "Colis unitaire", 1),
        ("travelwiz_cargo_type", "bulk", "Vrac", 2),
        ("packlog_cargo_type", "bulk", "Vrac", 2),
        ("travelwiz_cargo_type", "consumable", "Consommable", 3),
        ("packlog_cargo_type", "consumable", "Consommable", 3),
        ("travelwiz_cargo_type", "packaging", "Conditionnement", 4),
        ("packlog_cargo_type", "packaging", "Conditionnement", 4),
        ("travelwiz_cargo_type", "waste", "Déchet", 5),
        ("packlog_cargo_type", "waste", "Déchet", 5),
        ("travelwiz_cargo_type", "hazmat", "Matière dangereuse", 6),
        ("packlog_cargo_type", "hazmat", "Matière dangereuse", 6),
        ("travelwiz_cargo_ownership_type", "rental", "Matériel en location", 1),
        ("packlog_cargo_ownership_type", "rental", "Matériel en location", 1),
        ("travelwiz_cargo_ownership_type", "purchased", "Matériel acheté", 2),
        ("packlog_cargo_ownership_type", "purchased", "Matériel acheté", 2),
        ("travelwiz_cargo_ownership_type", "customer", "Fourni par le client", 3),
        ("packlog_cargo_ownership_type", "customer", "Fourni par le client", 3),
        ("travelwiz_cargo_ownership_type", "internal", "Matériel interne", 4),
        ("packlog_cargo_ownership_type", "internal", "Matériel interne", 4),
        ("travelwiz_cargo_workflow_status", "draft", "Brouillon", 1),
        ("packlog_cargo_workflow_status", "draft", "Brouillon", 1),
        ("travelwiz_cargo_workflow_status", "prepared", "Préparé", 2),
        ("packlog_cargo_workflow_status", "prepared", "Préparé", 2),
        ("travelwiz_cargo_workflow_status", "ready_for_review", "Prêt pour validation", 3),
        ("packlog_cargo_workflow_status", "ready_for_review", "Prêt pour validation", 3),
        ("travelwiz_cargo_workflow_status", "approved", "Validé", 4),
        ("packlog_cargo_workflow_status", "approved", "Validé", 4),
        ("travelwiz_cargo_workflow_status", "rejected", "Rejeté", 5),
        ("packlog_cargo_workflow_status", "rejected", "Rejeté", 5),
        ("travelwiz_cargo_workflow_status", "assigned", "Affecté au voyage", 6),
        ("packlog_cargo_workflow_status", "assigned", "Affecté au voyage", 6),
        ("travelwiz_cargo_workflow_status", "in_transit", "En transit", 7),
        ("packlog_cargo_workflow_status", "in_transit", "En transit", 7),
        ("travelwiz_cargo_workflow_status", "delivered", "Livré", 8),
        ("packlog_cargo_workflow_status", "delivered", "Livré", 8),
        ("travelwiz_cargo_workflow_status", "cancelled", "Annulé", 9),
        ("packlog_cargo_workflow_status", "cancelled", "Annulé", 9),
        ("travelwiz_voyage_status", "planned", "Planifié", 1),
        ("travelwiz_voyage_status", "confirmed", "Confirmé", 2),
        ("travelwiz_voyage_status", "boarding", "Embarquement", 3),
        ("travelwiz_voyage_status", "departed", "En route", 4),
        ("travelwiz_voyage_status", "arrived", "Arrivé", 5),
        ("travelwiz_voyage_status", "closed", "Clôturé", 6),
        ("travelwiz_voyage_status", "cancelled", "Annulé", 7),
        ("travelwiz_voyage_status", "delayed", "Retardé", 8),
        ("travelwiz_manifest_status", "draft", "Brouillon", 1),
        ("travelwiz_manifest_status", "pending_validation", "En validation", 2),
        ("travelwiz_manifest_status", "validated", "Validé", 3),
        ("travelwiz_manifest_status", "requires_review", "À revoir", 4),
        ("travelwiz_manifest_status", "closed", "Clôturé", 5),
        ("travelwiz_pickup_status", "planned", "Planifié", 1),
        ("travelwiz_pickup_status", "in_progress", "En cours", 2),
        ("travelwiz_pickup_status", "completed", "Terminé", 3),
        ("travelwiz_pickup_status", "cancelled", "Annulé", 4),
        ("travelwiz_cargo_status", "registered", "Enregistré", 1),
        ("packlog_cargo_status", "registered", "Enregistré", 1),
        ("travelwiz_cargo_status", "ready", "Prêt", 2),
        ("packlog_cargo_status", "ready", "Prêt", 2),
        ("travelwiz_cargo_status", "ready_for_loading", "Prêt au chargement", 3),
        ("packlog_cargo_status", "ready_for_loading", "Prêt au chargement", 3),
        ("travelwiz_cargo_status", "loaded", "Chargé", 4),
        ("packlog_cargo_status", "loaded", "Chargé", 4),
        ("travelwiz_cargo_status", "in_transit", "En transit", 5),
        ("packlog_cargo_status", "in_transit", "En transit", 5),
        ("travelwiz_cargo_status", "delivered_intermediate", "Livré en escale", 6),
        ("packlog_cargo_status", "delivered_intermediate", "Livré en escale", 6),
        ("travelwiz_cargo_status", "delivered_final", "Livré destination finale", 7),
        ("packlog_cargo_status", "delivered_final", "Livré destination finale", 7),
        ("travelwiz_cargo_status", "damaged", "Signalé endommagé", 8),
        ("packlog_cargo_status", "damaged", "Signalé endommagé", 8),
        ("travelwiz_cargo_status", "missing", "Signalé manquant", 9),
        ("packlog_cargo_status", "missing", "Signalé manquant", 9),
        ("travelwiz_cargo_status", "return_declared", "Retour déclaré", 10),
        ("packlog_cargo_status", "return_declared", "Retour déclaré", 10),
        ("travelwiz_cargo_status", "return_in_transit", "Retour en transit", 11),
        ("packlog_cargo_status", "return_in_transit", "Retour en transit", 11),
        ("travelwiz_cargo_status", "returned", "Retourné base", 12),
        ("packlog_cargo_status", "returned", "Retourné base", 12),
        ("travelwiz_cargo_status", "reintegrated", "Réintégré stock", 13),
        ("packlog_cargo_status", "reintegrated", "Réintégré stock", 13),
        ("travelwiz_cargo_status", "scrapped", "Mis au rebut", 14),
        ("packlog_cargo_status", "scrapped", "Mis au rebut", 14),
        ("travelwiz_cargo_request_status", "draft", "Brouillon", 1),
        ("packlog_cargo_request_status", "draft", "Brouillon", 1),
        ("travelwiz_cargo_request_status", "submitted", "Soumis", 2),
        ("packlog_cargo_request_status", "submitted", "Soumis", 2),
        ("travelwiz_cargo_request_status", "approved", "Validé", 3),
        ("packlog_cargo_request_status", "approved", "Validé", 3),
        ("travelwiz_cargo_request_status", "assigned", "Affecté", 4),
        ("packlog_cargo_request_status", "assigned", "Affecté", 4),
        ("travelwiz_cargo_request_status", "in_progress", "En cours", 5),
        ("packlog_cargo_request_status", "in_progress", "En cours", 5),
        ("travelwiz_cargo_request_status", "closed", "Clôturé", 6),
        ("packlog_cargo_request_status", "closed", "Clôturé", 6),
        ("travelwiz_cargo_request_status", "cancelled", "Annulé", 7),
        ("packlog_cargo_request_status", "cancelled", "Annulé", 7),
        ("travelwiz_back_cargo_return_type", "waste", "Déchet", 1),
        ("packlog_back_cargo_return_type", "waste", "Déchet", 1),
        ("travelwiz_back_cargo_return_type", "contractor_return", "Retour sous-traitant", 2),
        ("packlog_back_cargo_return_type", "contractor_return", "Retour sous-traitant", 2),
        ("travelwiz_back_cargo_return_type", "stock_reintegration", "Réintégration stock", 3),
        ("packlog_back_cargo_return_type", "stock_reintegration", "Réintégration stock", 3),
        ("travelwiz_back_cargo_return_type", "scrap", "Ferraille", 4),
        ("packlog_back_cargo_return_type", "scrap", "Ferraille", 4),
        ("travelwiz_back_cargo_return_type", "yard_storage", "Stockage yard", 5),
        ("packlog_back_cargo_return_type", "yard_storage", "Stockage yard", 5),
        ("travelwiz_package_return_status", "pending", "Aucun retour", 1),
        ("packlog_package_return_status", "pending", "Aucun retour", 1),
        ("travelwiz_package_return_status", "partial", "Retour partiel", 2),
        ("packlog_package_return_status", "partial", "Retour partiel", 2),
        ("travelwiz_package_return_status", "returned", "Retourné base", 3),
        ("packlog_package_return_status", "returned", "Retourné base", 3),
        ("travelwiz_package_return_status", "reintegrated", "Réintégré stock", 4),
        ("packlog_package_return_status", "reintegrated", "Réintégré stock", 4),
        ("travelwiz_package_return_status", "scrapped", "Mis au rebut", 5),
        ("packlog_package_return_status", "scrapped", "Mis au rebut", 5),
        ("travelwiz_package_return_status", "yard_storage", "Stockage yard", 6),
        ("packlog_package_return_status", "yard_storage", "Stockage yard", 6),
        ("travelwiz_cargo_evidence_type", "cargo_photo", "Photo du colis", 1),
        ("packlog_cargo_evidence_type", "cargo_photo", "Photo du colis", 1),
        ("travelwiz_cargo_evidence_type", "weight_ticket", "Ticket de pesée", 2),
        ("packlog_cargo_evidence_type", "weight_ticket", "Ticket de pesée", 2),
        ("travelwiz_cargo_evidence_type", "lifting_certificate", "Certification levage", 3),
        ("packlog_cargo_evidence_type", "lifting_certificate", "Certification levage", 3),
        ("travelwiz_cargo_evidence_type", "transport_document", "Document de transport", 4),
        ("packlog_cargo_evidence_type", "transport_document", "Document de transport", 4),
        ("travelwiz_cargo_evidence_type", "hazmat_document", "Document HAZMAT", 5),
        ("packlog_cargo_evidence_type", "hazmat_document", "Document HAZMAT", 5),
        ("travelwiz_cargo_evidence_type", "delivery_proof", "Preuve de livraison", 6),
        ("packlog_cargo_evidence_type", "delivery_proof", "Preuve de livraison", 6),
        ("travelwiz_cargo_evidence_type", "other", "Autre", 7),
        ("packlog_cargo_evidence_type", "other", "Autre", 7),
        ("mission_type", "standard", "Standard", 1),
        ("mission_type", "vip", "VIP", 2),
        ("mission_type", "regulatory", "Reglementaire", 3),
        ("mission_type", "emergency", "Urgence", 4),
        ("mission_activity_type", "visit", "Visite", 1),
        ("mission_activity_type", "meeting", "Reunion", 2),
        ("mission_activity_type", "inspection", "Inspection", 3),
        ("mission_activity_type", "training", "Formation", 4),
        ("mission_activity_type", "handover", "Passation", 5),
        ("mission_activity_type", "other", "Autre", 6),
        # ── UI Languages ──
        ("language", "fr", "Français", 1),
        ("language", "en", "English", 2),
        ("language", "es", "Español", 3),
        ("language", "pt", "Português", 4),
        ("language", "de", "Deutsch", 5),
        ("language", "it", "Italiano", 6),
        ("language", "ar", "العربية", 7),
        ("language", "zh", "中文", 8),
        # ── Clothing sizes ──
        ("clothing_size", "XS", "XS", 1),
        ("clothing_size", "S", "S", 2),
        ("clothing_size", "M", "M", 3),
        ("clothing_size", "L", "L", 4),
        ("clothing_size", "XL", "XL", 5),
        ("clothing_size", "XXL", "XXL", 6),
        ("clothing_size", "3XL", "3XL", 7),
        # ── Shoe sizes (EU) ──
        ("shoe_size", "38", "38", 1),
        ("shoe_size", "39", "39", 2),
        ("shoe_size", "40", "40", 3),
        ("shoe_size", "41", "41", 4),
        ("shoe_size", "42", "42", 5),
        ("shoe_size", "43", "43", 6),
        ("shoe_size", "44", "44", 7),
        ("shoe_size", "45", "45", 8),
        ("shoe_size", "46", "46", 9),
        ("shoe_size", "47", "47", 10),
        # ── Health conditions ──
        ("health_condition", "diabetes", "Diabète", 1),
        ("health_condition", "hypertension", "Hypertension", 2),
        ("health_condition", "asthma", "Asthme", 3),
        ("health_condition", "epilepsy", "Épilepsie", 4),
        ("health_condition", "heart_disease", "Maladie cardiaque", 5),
        ("health_condition", "allergy_severe", "Allergie sévère", 6),
        ("health_condition", "color_blindness", "Daltonisme", 7),
        ("health_condition", "vertigo", "Vertige", 8),
        ("health_condition", "hearing_impairment", "Déficience auditive", 9),
        ("health_condition", "vision_impairment", "Déficience visuelle", 10),
        ("health_condition", "mobility_impairment", "Déficience motrice", 11),
        ("health_condition", "claustrophobia", "Claustrophobie", 12),
        # ── Address types ──
        ("address_type", "home", "Domicile", 1),
        ("address_type", "office", "Bureau", 2),
        ("address_type", "site", "Site", 3),
        ("address_type", "headquarters", "Siège", 4),
        ("address_type", "pickup", "Ramassage", 5),
        ("address_type", "postal", "Adresse postale", 6),
        ("address_type", "billing", "Facturation", 7),
        ("address_type", "delivery", "Livraison", 8),
        ("address_type", "temporary", "Temporaire", 9),
        ("address_type", "other", "Autre", 10),
        # ── Legal forms ──
        ("legal_form", "SA", "SA — Société Anonyme", 1),
        ("legal_form", "SARL", "SARL — Société à Responsabilité Limitée", 2),
        ("legal_form", "SAS", "SAS — Société par Actions Simplifiée", 3),
        ("legal_form", "SNC", "SNC — Société en Nom Collectif", 4),
        ("legal_form", "GIE", "GIE — Groupement d'Intérêt Économique", 5),
        ("legal_form", "BRANCH", "Succursale", 6),
        ("legal_form", "SUBSIDIARY", "Filiale", 7),
        ("legal_form", "OTHER", "Autre", 8),
        # ── Currencies ──
        ("currency", "XAF", "XAF — Franc CFA (CEMAC)", 1),
        ("currency", "XOF", "XOF — Franc CFA (BCEAO)", 2),
        ("currency", "EUR", "EUR — Euro", 3),
        ("currency", "USD", "USD — Dollar US", 4),
        ("currency", "GBP", "GBP — Livre Sterling", 5),
        ("currency", "AOA", "AOA — Kwanza angolais", 6),
        ("currency", "PEN", "PEN — Sol péruvien", 7),
        ("currency", "COP", "COP — Peso colombien", 8),
        ("currency", "GTQ", "GTQ — Quetzal guatémaltèque", 9),
        ("currency", "AUD", "AUD — Dollar australien", 10),
        ("currency", "NGN", "NGN — Naira nigérian", 11),
        ("currency", "MAD", "MAD — Dirham marocain", 12),
        ("currency", "TND", "TND — Dinar tunisien", 13),
        # ── Industries / Sectors ──
        ("industry", "oil_gas", "Pétrole & Gaz", 1),
        ("industry", "mining", "Mines & Extraction", 2),
        ("industry", "energy", "Énergie & Électricité", 3),
        ("industry", "construction", "BTP / Construction", 4),
        ("industry", "logistics", "Logistique & Transport", 5),
        ("industry", "manufacturing", "Industrie / Manufacture", 6),
        ("industry", "services", "Services", 7),
        ("industry", "telecom", "Télécommunications", 8),
        ("industry", "agriculture", "Agriculture & Agroalimentaire", 9),
        ("industry", "finance", "Finance & Assurance", 10),
        ("industry", "health", "Santé", 11),
        ("industry", "education", "Éducation & Formation", 12),
        ("industry", "public", "Secteur public", 13),
        ("industry", "other", "Autre", 14),
        # ── Countries (ISO 3166-1 alpha-2) ──
        # NOTE: legal_identifier_type entries are seeded separately below (with metadata_json)
        ("country", "CM", "Cameroun", 1),
        ("country", "CG", "Congo (RC)", 2),
        ("country", "CD", "Congo (RDC)", 3),
        ("country", "GA", "Gabon", 4),
        ("country", "GQ", "Guinée Équatoriale", 5),
        ("country", "TD", "Tchad", 6),
        ("country", "TN", "Tunisie", 7),
        ("country", "AO", "Angola", 8),
        ("country", "NG", "Nigéria", 9),
        ("country", "SN", "Sénégal", 10),
        ("country", "CI", "Côte d'Ivoire", 11),
        ("country", "GB", "Royaume-Uni", 12),
        ("country", "FR", "France", 13),
        ("country", "US", "États-Unis", 14),
        ("country", "PE", "Pérou", 15),
        ("country", "CO", "Colombie", 16),
        ("country", "GT", "Guatemala", 17),
        ("country", "AU", "Australie", 18),
        # ── Airports (IATA codes — oil & gas hubs, Central/West Africa + global) ──
        # Cameroon
        ("airport", "DLA", "Douala — DLA (Cameroun)", 1),
        ("airport", "NSI", "Yaoundé Nsimalen — NSI (Cameroun)", 2),
        ("airport", "GOU", "Garoua — GOU (Cameroun)", 3),
        ("airport", "MVR", "Maroua Salak — MVR (Cameroun)", 4),
        # Gabon
        ("airport", "LBV", "Libreville — LBV (Gabon)", 5),
        ("airport", "POG", "Port-Gentil — POG (Gabon)", 6),
        ("airport", "MVB", "Franceville — MVB (Gabon)", 7),
        # Congo (RC)
        ("airport", "BZV", "Brazzaville — BZV (Congo)", 8),
        ("airport", "PNR", "Pointe-Noire — PNR (Congo)", 9),
        # Congo (RDC)
        ("airport", "FIH", "Kinshasa — FIH (RDC)", 10),
        ("airport", "FBM", "Lubumbashi — FBM (RDC)", 11),
        # Chad
        ("airport", "NDJ", "N'Djamena — NDJ (Tchad)", 12),
        # Equatorial Guinea
        ("airport", "SSG", "Malabo — SSG (Guinée Eq.)", 13),
        ("airport", "BSG", "Bata — BSG (Guinée Eq.)", 14),
        # Angola
        ("airport", "LAD", "Luanda — LAD (Angola)", 15),
        ("airport", "CAB", "Cabinda — CAB (Angola)", 16),
        ("airport", "SZA", "Soyo — SZA (Angola)", 17),
        # Nigeria
        ("airport", "LOS", "Lagos — LOS (Nigéria)", 18),
        ("airport", "ABV", "Abuja — ABV (Nigéria)", 19),
        ("airport", "PHC", "Port Harcourt — PHC (Nigéria)", 20),
        ("airport", "QRW", "Warri — QRW (Nigéria)", 21),
        # Senegal
        ("airport", "DSS", "Dakar Blaise Diagne — DSS (Sénégal)", 22),
        # Côte d'Ivoire
        ("airport", "ABJ", "Abidjan — ABJ (Côte d'Ivoire)", 23),
        # Ghana
        ("airport", "ACC", "Accra — ACC (Ghana)", 24),
        # Togo
        ("airport", "LFW", "Lomé — LFW (Togo)", 25),
        # Benin
        ("airport", "COO", "Cotonou — COO (Bénin)", 26),
        # São Tomé
        ("airport", "TMS", "São Tomé — TMS (São Tomé)", 27),
        # France
        ("airport", "CDG", "Paris CDG — CDG (France)", 28),
        ("airport", "ORY", "Paris Orly — ORY (France)", 29),
        ("airport", "MRS", "Marseille — MRS (France)", 30),
        ("airport", "LYS", "Lyon — LYS (France)", 31),
        ("airport", "TLS", "Toulouse — TLS (France)", 32),
        ("airport", "NCE", "Nice — NCE (France)", 33),
        ("airport", "BOD", "Bordeaux — BOD (France)", 34),
        # United Kingdom
        ("airport", "LHR", "Londres Heathrow — LHR (UK)", 35),
        ("airport", "LGW", "Londres Gatwick — LGW (UK)", 36),
        ("airport", "ABZ", "Aberdeen — ABZ (UK)", 37),
        ("airport", "EDI", "Édimbourg — EDI (UK)", 38),
        # United States
        ("airport", "JFK", "New York JFK — JFK (USA)", 39),
        ("airport", "IAH", "Houston — IAH (USA)", 40),
        ("airport", "EWR", "Newark — EWR (USA)", 41),
        ("airport", "LAX", "Los Angeles — LAX (USA)", 42),
        ("airport", "ATL", "Atlanta — ATL (USA)", 43),
        # Middle East / Asia hubs
        ("airport", "DXB", "Dubai — DXB (EAU)", 44),
        ("airport", "AUH", "Abu Dhabi — AUH (EAU)", 45),
        ("airport", "DOH", "Doha — DOH (Qatar)", 46),
        ("airport", "SIN", "Singapore — SIN (Singapour)", 47),
        ("airport", "KUL", "Kuala Lumpur — KUL (Malaisie)", 48),
        # Other global hubs
        ("airport", "AMS", "Amsterdam — AMS (Pays-Bas)", 49),
        ("airport", "FRA", "Francfort — FRA (Allemagne)", 50),
        ("airport", "IST", "Istanbul — IST (Turquie)", 51),
        ("airport", "JNB", "Johannesburg — JNB (Afrique du Sud)", 52),
        ("airport", "NBO", "Nairobi — NBO (Kenya)", 53),
        ("airport", "ADD", "Addis-Abeba — ADD (Éthiopie)", 54),
        ("airport", "CMN", "Casablanca — CMN (Maroc)", 55),
        # ── Compliance categories (referentiel types) ──
        ("compliance_category", "formation", "Formation", 1),
        ("compliance_category", "certification", "Certification", 2),
        ("compliance_category", "habilitation", "Habilitation", 3),
        ("compliance_category", "audit", "Audit", 4),
        ("compliance_category", "medical", "Médical", 5),
        ("compliance_category", "epi", "EPI", 6),
        # ── EPI types ──
        ("epi_type", "helmet", "Casque de sécurité", 1),
        ("epi_type", "goggles", "Lunettes de protection", 2),
        ("epi_type", "gloves", "Gants de protection", 3),
        ("epi_type", "boots", "Chaussures de sécurité", 4),
        ("epi_type", "coverall", "Combinaison de travail", 5),
        ("epi_type", "harness", "Harnais antichute", 6),
        ("epi_type", "ear_protection", "Protection auditive", 7),
        ("epi_type", "respirator", "Masque respiratoire", 8),
        ("epi_type", "life_jacket", "Gilet de sauvetage", 9),
        # ── Support ticket types ──
        ("ticket_type", "bug", "Bug / Anomalie", 1),
        ("ticket_type", "improvement", "Amélioration", 2),
        ("ticket_type", "question", "Question", 3),
        ("ticket_type", "other", "Autre", 4),
        # ── Support ticket priorities ──
        ("ticket_priority", "low", "Faible", 1),
        ("ticket_priority", "medium", "Moyenne", 2),
        ("ticket_priority", "high", "Haute", 3),
        ("ticket_priority", "critical", "Critique", 4),
        # ── Support ticket statuses ──
        ("ticket_status", "open", "Ouvert", 1),
        ("ticket_status", "in_progress", "En cours", 2),
        ("ticket_status", "waiting_info", "En attente d'info", 3),
        ("ticket_status", "resolved", "Résolu", 4),
        ("ticket_status", "closed", "Fermé", 5),
        ("ticket_status", "rejected", "Rejeté", 6),
        # ── Asset registry statuses ──
        ("ar_status", "OPERATIONAL", "Opérationnel", 1),
        ("ar_status", "STANDBY", "En attente", 2),
        ("ar_status", "UNDER_CONSTRUCTION", "En construction", 3),
        ("ar_status", "SUSPENDED", "Suspendu", 4),
        ("ar_status", "DECOMMISSIONED", "Décommissionné", 5),
        ("ar_status", "ABANDONED", "Abandonné", 6),
        # ── Pipeline services ──
        ("pipeline_service", "OIL", "Pétrole", 1),
        ("pipeline_service", "GAS", "Gaz", 2),
        ("pipeline_service", "WATER", "Eau", 3),
        ("pipeline_service", "CONDENSATE", "Condensat", 4),
        ("pipeline_service", "MULTIPHASE", "Multiphase", 5),
        ("pipeline_service", "GAS_LIFT", "Gas-lift", 6),
        ("pipeline_service", "CHEMICAL", "Chimique", 7),
        ("pipeline_service", "HYDRAULIC", "Hydraulique", 8),
        ("pipeline_service", "INJECTION", "Injection", 9),
        ("pipeline_service", "OTHER", "Autre", 10),
        # ── Pipe materials ──
        ("pipe_material", "CARBON_STEEL", "Acier carbone", 1),
        ("pipe_material", "STAINLESS_STEEL", "Acier inoxydable", 2),
        ("pipe_material", "DUPLEX", "Duplex", 3),
        ("pipe_material", "SUPER_DUPLEX", "Super Duplex", 4),
        ("pipe_material", "CRA_LINED", "Revêtu CRA", 5),
        ("pipe_material", "HDPE", "PEHD", 6),
        ("pipe_material", "GRP", "PRV (fibre de verre)", 7),
        ("pipe_material", "FLEXIBLE", "Flexible", 8),
        # ── Announcement priorities ──
        ("announcement_priority", "info", "Information", 1),
        ("announcement_priority", "warning", "Avertissement", 2),
        ("announcement_priority", "critical", "Critique", 3),
        ("announcement_priority", "maintenance", "Maintenance", 4),
    ]

    # ── Nationality entries with country + nationality metadata columns ──
    # Format: (iso_code, country_name, nationality_label, sort_order, flag_emoji)
    # metadata_json stores: {country, nationality, flag, iso_code}
    nationality_entries = [
        ("CM", "Cameroun", "Camerounaise", 1, "🇨🇲"),
        ("FR", "France", "Française", 2, "🇫🇷"),
        ("GB", "Royaume-Uni", "Britannique", 3, "🇬🇧"),
        ("US", "États-Unis", "Américaine", 4, "🇺🇸"),
        ("GA", "Gabon", "Gabonaise", 5, "🇬🇦"),
        ("CG", "Congo (RC)", "Congolaise (RC)", 6, "🇨🇬"),
        ("CD", "Congo (RDC)", "Congolaise (RDC)", 7, "🇨🇩"),
        ("GQ", "Guinée équatoriale", "Équato-guinéenne", 8, "🇬🇶"),
        ("TD", "Tchad", "Tchadienne", 9, "🇹🇩"),
        ("NG", "Nigéria", "Nigériane", 10, "🇳🇬"),
        ("SN", "Sénégal", "Sénégalaise", 11, "🇸🇳"),
        ("CI", "Côte d'Ivoire", "Ivoirienne", 12, "🇨🇮"),
        ("MA", "Maroc", "Marocaine", 13, "🇲🇦"),
        ("DZ", "Algérie", "Algérienne", 14, "🇩🇿"),
        ("TN", "Tunisie", "Tunisienne", 15, "🇹🇳"),
        ("BE", "Belgique", "Belge", 16, "🇧🇪"),
        ("CH", "Suisse", "Suisse", 17, "🇨🇭"),
        ("DE", "Allemagne", "Allemande", 18, "🇩🇪"),
        ("IT", "Italie", "Italienne", 19, "🇮🇹"),
        ("ES", "Espagne", "Espagnole", 20, "🇪🇸"),
        ("PT", "Portugal", "Portugaise", 21, "🇵🇹"),
        ("NL", "Pays-Bas", "Néerlandaise", 22, "🇳🇱"),
        ("BR", "Brésil", "Brésilienne", 23, "🇧🇷"),
        ("CA", "Canada", "Canadienne", 24, "🇨🇦"),
        ("CN", "Chine", "Chinoise", 25, "🇨🇳"),
        ("IN", "Inde", "Indienne", 26, "🇮🇳"),
        ("JP", "Japon", "Japonaise", 27, "🇯🇵"),
        ("RU", "Russie", "Russe", 28, "🇷🇺"),
        ("AU", "Australie", "Australienne", 29, "🇦🇺"),
        ("ZA", "Afrique du Sud", "Sud-africaine", 30, "🇿🇦"),
        ("EG", "Égypte", "Égyptienne", 31, "🇪🇬"),
        ("GH", "Ghana", "Ghanéenne", 32, "🇬🇭"),
        ("ML", "Mali", "Malienne", 33, "🇲🇱"),
        ("BF", "Burkina Faso", "Burkinabè", 34, "🇧🇫"),
        ("NE", "Niger", "Nigérienne", 35, "🇳🇪"),
        ("BJ", "Bénin", "Béninoise", 36, "🇧🇯"),
        ("TG", "Togo", "Togolaise", 37, "🇹🇬"),
        ("MG", "Madagascar", "Malgache", 38, "🇲🇬"),
        ("LB", "Liban", "Libanaise", 39, "🇱🇧"),
        ("TR", "Turquie", "Turque", 40, "🇹🇷"),
        ("AO", "Angola", "Angolaise", 41, "🇦🇴"),
        ("MZ", "Mozambique", "Mozambicaine", 42, "🇲🇿"),
        ("KE", "Kenya", "Kényane", 43, "🇰🇪"),
        ("TZ", "Tanzanie", "Tanzanienne", 44, "🇹🇿"),
        ("UG", "Ouganda", "Ougandaise", 45, "🇺🇬"),
        ("ET", "Éthiopie", "Éthiopienne", 46, "🇪🇹"),
        ("PH", "Philippines", "Philippine", 47, "🇵🇭"),
        ("ID", "Indonésie", "Indonésienne", 48, "🇮🇩"),
        ("MY", "Malaisie", "Malaisienne", 49, "🇲🇾"),
        ("TH", "Thaïlande", "Thaïlandaise", 50, "🇹🇭"),
    ]

    translated_entries = [
        # ── Compliance categories (with translations) ──
        ("compliance_category", "formation", "Formation", 1, {"en": "Training"}),
        ("compliance_category", "certification", "Certification", 2, {"en": "Certification"}),
        ("compliance_category", "habilitation", "Habilitation", 3, {"en": "Authorization"}),
        ("compliance_category", "audit", "Audit", 4, {"en": "Audit"}),
        ("compliance_category", "medical", "Médical", 5, {"en": "Medical"}),
        ("compliance_category", "epi", "EPI", 6, {"en": "PPE"}),
        # ── Compliance record statuses ──
        ("compliance_status", "valid", "Valide", 1, {"en": "Valid"}),
        ("compliance_status", "expired", "Expiré", 2, {"en": "Expired"}),
        ("compliance_status", "pending", "En attente", 3, {"en": "Pending"}),
        ("compliance_status", "rejected", "Rejeté", 4, {"en": "Rejected"}),
        # ── Exemption statuses ──
        ("compliance_exemption_status", "pending", "En attente", 1, {"en": "Pending"}),
        ("compliance_exemption_status", "approved", "Approuvée", 2, {"en": "Approved"}),
        ("compliance_exemption_status", "rejected", "Rejetée", 3, {"en": "Rejected"}),
        ("compliance_exemption_status", "expired", "Expirée", 4, {"en": "Expired"}),
        # ── Rule target types ──
        ("compliance_rule_target", "all", "Tous", 1, {"en": "All"}),
        ("compliance_rule_target", "tier_type", "Type de tiers", 2, {"en": "Tier type"}),
        ("compliance_rule_target", "asset", "Asset", 3, {"en": "Asset"}),
        ("compliance_rule_target", "department", "Département", 4, {"en": "Department"}),
        ("compliance_rule_target", "job_position", "Fiche de poste", 5, {"en": "Job position"}),
        ("compliance_rule_target", "packlog_cargo", "Colis PackLog", 6, {"en": "PackLog cargo"}),
        # ── Rule priorities ──
        ("compliance_rule_priority", "high", "Haute", 1, {"en": "High"}),
        ("compliance_rule_priority", "normal", "Normale", 2, {"en": "Normal"}),
        ("compliance_rule_priority", "low", "Basse", 3, {"en": "Low"}),
        # ── Rule applicability ──
        ("compliance_rule_applicability", "permanent", "Permanente", 1, {"en": "Permanent"}),
        ("compliance_rule_applicability", "contextual", "Contextuelle", 2, {"en": "Contextual"}),
        # ── Verification statuses ──
        ("compliance_verification_status", "pending", "En attente", 1, {"en": "Pending"}),
        ("compliance_verification_status", "verified", "Vérifié", 2, {"en": "Verified"}),
        ("compliance_verification_status", "rejected", "Rejeté", 3, {"en": "Rejected"}),
        # ── Pax incident severities ──
        ("pax_incident_severity", "info", "Information", 1, {"en": "Information"}),
        ("pax_incident_severity", "warning", "Avertissement", 2, {"en": "Warning"}),
        ("pax_incident_severity", "site_ban", "Interdiction site", 3, {"en": "Site ban"}),
        ("pax_incident_severity", "temp_ban", "Suspension temporaire", 4, {"en": "Temporary ban"}),
        ("pax_incident_severity", "permanent_ban", "Exclusion permanente", 5, {"en": "Permanent ban"}),
        ("pax_profile_status", "active", "Actif", 1, {"en": "Active"}),
        ("pax_profile_status", "incomplete", "Incomplet", 2, {"en": "Incomplete"}),
        ("pax_profile_status", "suspended", "Suspendu", 3, {"en": "Suspended"}),
        ("pax_profile_status", "archived", "Archivé", 4, {"en": "Archived"}),
        ("pax_ads_status", "draft", "Brouillon", 1, {"en": "Draft"}),
        ("pax_ads_status", "submitted", "Soumis", 2, {"en": "Submitted"}),
        ("pax_ads_status", "pending_compliance", "En conformité", 3, {"en": "Pending compliance"}),
        ("pax_ads_status", "pending_validation", "En validation", 4, {"en": "Pending validation"}),
        ("pax_ads_status", "approved", "Approuvé", 5, {"en": "Approved"}),
        ("pax_ads_status", "rejected", "Rejeté", 6, {"en": "Rejected"}),
        ("pax_ads_status", "requires_review", "À revoir", 7, {"en": "Requires review"}),
        ("pax_ads_status", "in_progress", "En cours", 8, {"en": "In progress"}),
        ("pax_ads_status", "completed", "Terminé", 9, {"en": "Completed"}),
        ("pax_ads_status", "cancelled", "Annulé", 10, {"en": "Cancelled"}),
        ("pax_preparation_task_type", "visa", "Visa", 1, {"en": "Visa"}),
        ("pax_preparation_task_type", "badge", "Badge site", 2, {"en": "Site badge"}),
        ("pax_preparation_task_type", "epi_order", "Commande EPI", 3, {"en": "PPE order"}),
        ("pax_preparation_task_type", "allowance", "Indemnité de déplacement", 4, {"en": "Travel allowance"}),
        ("pax_preparation_task_type", "document_collection", "Collecte documentaire", 5, {"en": "Document collection"}),
        ("pax_preparation_task_type", "ads_creation", "Création AdS", 6, {"en": "AdS creation"}),
        ("pax_preparation_task_type", "meeting_booking", "Réservation de réunion", 7, {"en": "Meeting booking"}),
        ("pax_preparation_task_type", "briefing", "Briefing", 8, {"en": "Briefing"}),
        ("pax_preparation_task_type", "other", "Autre", 9, {"en": "Other"}),
        ("pax_rotation_status", "active", "Actif", 1, {"en": "Active"}),
        ("pax_rotation_status", "paused", "Suspendu", 2, {"en": "Paused"}),
        ("pax_rotation_status", "completed", "Terminé", 3, {"en": "Completed"}),
        ("pax_avm_status", "draft", "Brouillon", 1, {"en": "Draft"}),
        ("pax_avm_status", "in_preparation", "En préparation", 2, {"en": "In preparation"}),
        ("pax_avm_status", "active", "Active", 3, {"en": "Active"}),
        ("pax_avm_status", "ready", "Prête", 4, {"en": "Ready"}),
        ("pax_avm_status", "completed", "Terminée", 5, {"en": "Completed"}),
        ("pax_avm_status", "cancelled", "Annulée", 6, {"en": "Cancelled"}),
        ("project_status", "draft", "Brouillon", 1, {"en": "Draft"}),
        ("project_status", "planned", "Planifié", 2, {"en": "Planned"}),
        ("project_status", "active", "Actif", 3, {"en": "Active"}),
        ("project_status", "on_hold", "Suspendu", 4, {"en": "On hold"}),
        ("project_status", "completed", "Terminé", 5, {"en": "Completed"}),
        ("project_status", "cancelled", "Annulé", 6, {"en": "Cancelled"}),
        ("project_priority", "low", "Basse", 1, {"en": "Low"}),
        ("project_priority", "medium", "Moyenne", 2, {"en": "Medium"}),
        ("project_priority", "high", "Haute", 3, {"en": "High"}),
        ("project_priority", "critical", "Critique", 4, {"en": "Critical"}),
        ("project_weather", "sunny", "Ensoleillé", 1, {"en": "Sunny"}),
        ("project_weather", "cloudy", "Nuageux", 2, {"en": "Cloudy"}),
        ("project_weather", "rainy", "Pluvieux", 3, {"en": "Rainy"}),
        ("project_weather", "stormy", "Orageux", 4, {"en": "Stormy"}),
        ("project_task_status", "todo", "À faire", 1, {"en": "To do"}),
        ("project_task_status", "in_progress", "En cours", 2, {"en": "In progress"}),
        ("project_task_status", "review", "Revue", 3, {"en": "Review"}),
        ("project_task_status", "done", "Terminée", 4, {"en": "Done"}),
        ("project_task_status", "cancelled", "Annulée", 5, {"en": "Cancelled"}),
        ("project_member_role", "manager", "Chef de projet", 1, {"en": "Project manager"}),
        ("project_member_role", "member", "Membre", 2, {"en": "Member"}),
        ("project_member_role", "reviewer", "Réviseur", 3, {"en": "Reviewer"}),
        ("project_member_role", "stakeholder", "Partie prenante", 4, {"en": "Stakeholder"}),
        ("project_deliverable_status", "pending", "En attente", 1, {"en": "Pending"}),
        ("project_deliverable_status", "in_progress", "En cours", 2, {"en": "In progress"}),
        ("project_deliverable_status", "delivered", "Livré", 3, {"en": "Delivered"}),
        ("project_deliverable_status", "accepted", "Accepté", 4, {"en": "Accepted"}),
        ("project_deliverable_status", "rejected", "Rejeté", 5, {"en": "Rejected"}),
        ("planner_activity_status", "draft", "Brouillon", 1, {"en": "Draft"}),
        ("planner_activity_status", "submitted", "Soumis", 2, {"en": "Submitted"}),
        ("planner_activity_status", "validated", "Validé", 3, {"en": "Validated"}),
        ("planner_activity_status", "in_progress", "En cours", 4, {"en": "In progress"}),
        ("planner_activity_status", "completed", "Terminé", 5, {"en": "Completed"}),
        ("planner_activity_status", "rejected", "Rejeté", 6, {"en": "Rejected"}),
        ("planner_activity_status", "cancelled", "Annulé", 7, {"en": "Cancelled"}),
        ("planner_activity_type", "project", "Projet", 1, {"en": "Project"}),
        ("planner_activity_type", "workover", "Workover", 2, {"en": "Workover"}),
        ("planner_activity_type", "drilling", "Forage", 3, {"en": "Drilling"}),
        ("planner_activity_type", "integrity", "Intégrité", 4, {"en": "Integrity"}),
        ("planner_activity_type", "maintenance", "Maintenance", 5, {"en": "Maintenance"}),
        ("planner_activity_type", "permanent_ops", "Ops permanentes", 6, {"en": "Permanent operations"}),
        ("planner_activity_type", "inspection", "Inspection", 7, {"en": "Inspection"}),
        ("planner_activity_type", "event", "Événement", 8, {"en": "Event"}),
        ("planner_activity_priority", "low", "Basse", 1, {"en": "Low"}),
        ("planner_activity_priority", "medium", "Moyenne", 2, {"en": "Medium"}),
        ("planner_activity_priority", "high", "Haute", 3, {"en": "High"}),
        ("planner_activity_priority", "critical", "Critique", 4, {"en": "Critical"}),
        ("planner_conflict_status", "open", "Ouvert", 1, {"en": "Open"}),
        ("planner_conflict_status", "resolved", "Résolu", 2, {"en": "Resolved"}),
        ("planner_conflict_status", "deferred", "Différé", 3, {"en": "Deferred"}),
        ("planner_conflict_resolution", "approve_both", "Approuver les deux", 1, {"en": "Approve both"}),
        ("planner_conflict_resolution", "reschedule", "Replanifier", 2, {"en": "Reschedule"}),
        ("planner_conflict_resolution", "reduce_pax", "Réduire PAX", 3, {"en": "Reduce PAX"}),
        ("planner_conflict_resolution", "cancel", "Annuler une activité", 4, {"en": "Cancel an activity"}),
        ("planner_conflict_resolution", "deferred", "Reporter la décision", 5, {"en": "Defer decision"}),
        ("planner_dependency_type", "FS", "Fin-Début (FS)", 1, {"en": "Finish-Start (FS)"}),
        ("planner_dependency_type", "SS", "Début-Début (SS)", 2, {"en": "Start-Start (SS)"}),
        ("planner_dependency_type", "FF", "Fin-Fin (FF)", 3, {"en": "Finish-Finish (FF)"}),
        ("pax_mission_visa_status", "to_initiate", "À initier", 1, {"en": "To initiate"}),
        ("pax_mission_visa_status", "submitted", "Soumis", 2, {"en": "Submitted"}),
        ("pax_mission_visa_status", "in_review", "En revue", 3, {"en": "In review"}),
        ("pax_mission_visa_status", "obtained", "Obtenu", 4, {"en": "Obtained"}),
        ("pax_mission_visa_status", "refused", "Refusé", 5, {"en": "Refused"}),
        ("pax_mission_allowance_status", "draft", "Brouillon", 1, {"en": "Draft"}),
        ("pax_mission_allowance_status", "submitted", "Soumis", 2, {"en": "Submitted"}),
        ("pax_mission_allowance_status", "approved", "Approuvé", 3, {"en": "Approved"}),
        ("pax_mission_allowance_status", "paid", "Payé", 4, {"en": "Paid"}),
    ]

    created = 0
    updated = 0
    for category, code, label, sort_order in entries:
        existing = await db.execute(
            select(DictionaryEntry).where(
                DictionaryEntry.category == category,
                DictionaryEntry.code == code,
            )
        )
        if existing.scalar_one_or_none():
            continue

        db.add(DictionaryEntry(
            category=category,
            code=code,
            label=label,
            sort_order=sort_order,
            active=True,
        ))
        created += 1

    for category, code, label, sort_order, translations in translated_entries:
        existing = await db.execute(
            select(DictionaryEntry).where(
                DictionaryEntry.category == category,
                DictionaryEntry.code == code,
            )
        )
        entry = existing.scalar_one_or_none()
        if entry:
            changed = False
            if not entry.translations:
                entry.translations = translations
                changed = True
            if not entry.label:
                entry.label = label
                changed = True
            if changed:
                updated += 1
            continue

        db.add(DictionaryEntry(
            category=category,
            code=code,
            label=label,
            sort_order=sort_order,
            active=True,
            translations=translations,
        ))
        created += 1

    # Nationality entries with country + nationality metadata columns
    for iso_code, country, nationality, sort_order, flag in nationality_entries:
        expected_meta = {"flag": flag, "iso_code": iso_code, "country": country, "nationality": nationality}
        result = await db.execute(
            select(DictionaryEntry).where(
                DictionaryEntry.category == "nationality",
                DictionaryEntry.code == iso_code,
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Update metadata if missing country/nationality columns (migration from old format)
            meta = existing.metadata_json or {}
            if "country" not in meta or "nationality" not in meta:
                existing.metadata_json = expected_meta
                updated += 1
            continue

        db.add(DictionaryEntry(
            category="nationality",
            code=iso_code,
            label=nationality,
            sort_order=sort_order,
            active=True,
            metadata_json=expected_meta,
        ))
        created += 1

    # ── Legal identifier types (with country + required metadata) ──
    legal_ident_entries = [
        # Cameroon (CM)
        ("legal_identifier_type", "rccm", "RCCM", 1, {"country": "CM", "required": True}),
        ("legal_identifier_type", "niu", "NIU", 2, {"country": "CM", "required": True}),
        ("legal_identifier_type", "cnps", "CNPS", 3, {"country": "CM", "required": False}),
        ("legal_identifier_type", "patente", "Patente", 4, {"country": "CM", "required": False}),
        # France (FR)
        ("legal_identifier_type", "siret", "SIRET", 10, {"country": "FR", "required": True}),
        ("legal_identifier_type", "siren", "SIREN", 11, {"country": "FR", "required": True}),
        ("legal_identifier_type", "tva_intra", "TVA Intracommunautaire", 12, {"country": "FR", "required": False}),
        ("legal_identifier_type", "naf", "Code NAF", 13, {"country": "FR", "required": False}),
        # Gabon (GA)
        ("legal_identifier_type", "nif_ga", "NIF", 20, {"country": "GA", "required": True}),
        ("legal_identifier_type", "rccm_ga", "RCCM", 21, {"country": "GA", "required": True}),
        # Congo (CG)
        ("legal_identifier_type", "rccm_cg", "RCCM", 30, {"country": "CG", "required": True}),
        ("legal_identifier_type", "nif_cg", "NIF", 31, {"country": "CG", "required": True}),
        # Senegal (SN)
        ("legal_identifier_type", "ninea", "NINEA", 40, {"country": "SN", "required": True}),
        ("legal_identifier_type", "rccm_sn", "RCCM", 41, {"country": "SN", "required": True}),
        # International / generic
        ("legal_identifier_type", "tax_id", "Tax ID", 90, {"country": "*", "required": False}),
        ("legal_identifier_type", "vat_number", "VAT Number", 91, {"country": "*", "required": False}),
        ("legal_identifier_type", "registration_number", "N° Immatriculation", 92, {"country": "*", "required": False}),
        ("legal_identifier_type", "other", "Autre", 99, {"country": "*", "required": False}),
    ]
    for category, code, label, sort_order, meta in legal_ident_entries:
        existing = await db.execute(
            select(DictionaryEntry).where(
                DictionaryEntry.category == category,
                DictionaryEntry.code == code,
            )
        )
        if existing.scalar_one_or_none():
            continue
        db.add(DictionaryEntry(
            category=category,
            code=code,
            label=label,
            sort_order=sort_order,
            active=True,
            metadata_json=meta,
        ))
        created += 1

    if created:
        logger.info("Seed: created %d dictionary entries", created)
    if updated:
        logger.info("Seed: updated %d nationality entries with country/nationality metadata", updated)
    if not created and not updated:
        logger.info("Seed: all dictionary entries already up to date")


async def seed_compliance_matrix(db: AsyncSession, entity_id) -> None:
    """Seed job positions, compliance types, and compliance rules from Perenco HSE matrix.

    Idempotent: checks by code before inserting.
    """
    from app.models.common import JobPosition, ComplianceType, ComplianceRule

    # ── 1. Job Positions (32 postes) ──────────────────────────────────────
    positions = [
        ("ASST_POMP", "Assistant Pompiste"),
        ("BOSCO", "BOSCO"),
        ("CARISTE", "Cariste"),
        ("CATERING", "Catering"),
        ("CQM", "Chef de Quart Machine"),
        ("CORDISTE", "Cordiste"),
        ("DRILLER_WO", "Driller WO"),
        ("ECHAFAUDEUR", "Echafaudeur"),
        ("ELEC_HVAC", "Électricien/HVAC"),
        ("GRUTIER", "Grutier"),
        ("HSE", "HSE"),
        ("HTM_CARGO", "HTM Cargo"),
        ("HTM_PONT", "HTM Pont"),
        ("INSTRUM", "Instrumentiste"),
        ("MARIN", "Marin"),
        ("MECA", "Mécanicien"),
        ("MECA_MACH", "Mécanicien Machine"),
        ("OMAA", "OMAA"),
        ("OP_MACHINE", "Opérateur machine"),
        ("OP_PROD", "Opérateur Prod"),
        ("PLONGEUR", "Plongeur Scaphandrier"),
        ("POMP_HTM", "Pompiers (HTM)"),
        ("POMPISTE", "Pompiste"),
        ("ROVISTE", "Roviste"),
        ("SONDEUR_WO", "Sondeurs WO"),
        ("SOUDEUR", "Soudeur"),
        ("SUP_CARGO", "Sup Cargo"),
        ("SUP_PROJET", "Superviseur Projet"),
        ("SUP_WO", "Superviseur Workover"),
        ("TOOLPUSH", "Toolpusher WO"),
        ("VEILLEUR", "Veilleur"),
        ("ZODIACMAN", "Zodiacman"),
    ]

    jp_map: dict[str, object] = {}  # code → JobPosition
    for code, name in positions:
        result = await db.execute(
            select(JobPosition).where(JobPosition.entity_id == entity_id, JobPosition.code == code)
        )
        jp = result.scalar_one_or_none()
        if not jp:
            jp = JobPosition(entity_id=entity_id, code=code, name=name, department="Offshore")
            db.add(jp)
            await db.flush()
        jp_map[code] = jp

    # ── 2. Compliance Types (24 referentiels) ─────────────────────────────
    # (category, code, name, validity_days, is_mandatory)
    types_data = [
        ("formation", "INDUCTION", "Induction", 730, True),
        ("medical", "VISITE_MED", "Visite Médicale", 365, True),
        ("formation", "SURVIE_MER", "Survie en mer", 1095, True),
        ("habilitation", "ATEX", "ATEX", 1095, True),
        ("habilitation", "HABILEC_H0B0", "Habilitation Électrique H0B0", 1095, False),
        ("habilitation", "HABILEC_SUP", "Habilitation Électrique >H0B0", 1095, False),
        ("certification", "WELL_CTRL", "Well Control (IWCF/IADC)", 730, False),
        ("formation", "BST", "Basic Safety Training", 1825, False),
        ("certification", "MONTEUR_ECHAF", "Monteur échafaudage", 1095, False),
        ("certification", "VERIF_ECHAF", "Vérificateur échafaudage", 1095, False),
        ("certification", "GRUTIER", "Grutier", 1095, False),
        ("certification", "CACES", "CACES", 1825, False),
        ("formation", "ESPACE_CONF", "Espace Confiné", 1095, False),
        ("formation", "PROTECT_RESP", "Protection Respiratoire", 1825, False),
        ("certification", "HLO", "HLO", 1095, False),
        ("formation", "ELINGAGE", "Technique d'élingage", 1095, False),
        ("certification", "IRATA", "IRATA 1, 2, 3", 1095, False),
        ("certification", "APT_HYPERBARE", "Certificat aptitude hyperbare", None, False),
        ("medical", "MED_HYPERBARE", "Visite médicale hyperbare", 365, False),
        ("certification", "SOUDEUR_HOM", "Homologation Soudeur 3G-6G", 1095, False),
        ("certification", "PIROGUE_MOT", "Capacité pirogues à moteur", 1825, False),
        ("certification", "ROVISTE", "Certificat Roviste", None, False),
        ("certification", "RTSH", "RTSH", 1825, False),
    ]

    ct_map: dict[str, object] = {}  # code → ComplianceType
    for cat, code, name, validity, mandatory in types_data:
        result = await db.execute(
            select(ComplianceType).where(ComplianceType.entity_id == entity_id, ComplianceType.code == code)
        )
        ct = result.scalar_one_or_none()
        if not ct:
            ct = ComplianceType(
                entity_id=entity_id, category=cat, code=code, name=name,
                validity_days=validity, is_mandatory=mandatory,
            )
            db.add(ct)
            await db.flush()
        ct_map[code] = ct

    # ── 3. Compliance Rules (matrix: position → required types) ───────────
    # Matrix: position_code → list of required type_codes
    # X = required, special values like N0/2E/2M for ATEX levels are treated as required
    matrix: dict[str, list[str]] = {
        "ASST_POMP": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ESPACE_CONF"],
        "BOSCO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "GRUTIER", "ESPACE_CONF", "PROTECT_RESP"],
        "CARISTE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "CACES"],
        "CATERING": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0"],
        "CQM": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST"],
        "CORDISTE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "IRATA"],
        "DRILLER_WO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "WELL_CTRL", "ELINGAGE"],
        "ECHAFAUDEUR": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "MONTEUR_ECHAF", "ESPACE_CONF", "ELINGAGE"],
        "ELEC_HVAC": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_SUP", "ESPACE_CONF"],
        "GRUTIER": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "GRUTIER", "ELINGAGE"],
        "HSE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "VERIF_ECHAF", "ESPACE_CONF", "PROTECT_RESP", "HLO", "ELINGAGE", "RTSH"],
        "HTM_CARGO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "MONTEUR_ECHAF", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "HTM_PONT": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "MONTEUR_ECHAF", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "INSTRUM": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_SUP", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "MARIN": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0"],
        "MECA": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "GRUTIER", "ESPACE_CONF", "ELINGAGE"],
        "MECA_MACH": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "OMAA": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "HLO", "ELINGAGE"],
        "OP_MACHINE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "OP_PROD": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "GRUTIER", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE", "RTSH"],
        "PLONGEUR": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "APT_HYPERBARE", "MED_HYPERBARE"],
        "POMP_HTM": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE"],
        "POMPISTE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "ESPACE_CONF", "ELINGAGE"],
        "ROVISTE": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ROVISTE"],
        "SONDEUR_WO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ELINGAGE"],
        "SOUDEUR": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "PROTECT_RESP", "ELINGAGE", "SOUDEUR_HOM"],
        "SUP_CARGO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "ESPACE_CONF", "PROTECT_RESP"],
        "SUP_PROJET": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "ELINGAGE", "RTSH"],
        "SUP_WO": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "WELL_CTRL"],
        "TOOLPUSH": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "WELL_CTRL", "ELINGAGE"],
        "VEILLEUR": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0"],
        "ZODIACMAN": ["INDUCTION", "VISITE_MED", "SURVIE_MER", "ATEX", "HABILEC_H0B0", "BST", "MONTEUR_ECHAF", "ESPACE_CONF", "PROTECT_RESP", "ELINGAGE", "PIROGUE_MOT"],
    }

    rules_created = 0
    for pos_code, type_codes in matrix.items():
        jp = jp_map.get(pos_code)
        if not jp:
            continue
        for type_code in type_codes:
            ct = ct_map.get(type_code)
            if not ct:
                continue
            # Check if rule already exists
            result = await db.execute(
                select(ComplianceRule).where(
                    ComplianceRule.entity_id == entity_id,
                    ComplianceRule.compliance_type_id == ct.id,
                    ComplianceRule.target_type == "job_position",
                    ComplianceRule.target_value == str(jp.id),
                )
            )
            if not result.scalars().first():
                db.add(ComplianceRule(
                    entity_id=entity_id,
                    compliance_type_id=ct.id,
                    target_type="job_position",
                    target_value=str(jp.id),
                    description=f"{ct.name} requis pour {jp.name}",
                ))
                rules_created += 1

    await db.flush()
    logger.info(
        "Seed: compliance matrix — %d positions, %d types, %d rules created",
        len(jp_map), len(ct_map), rules_created,
    )

    # ── Planner: ensure a reference scenario exists ──────────────────────────
    # On first boot (or after adding the is_reference column) create a
    # "Plan de référence" scenario for the default entity if none exists yet.
    # This gives the UI a stable reference plan from day one.
    try:
        from app.models.planner import PlannerActivity, PlannerScenario, PlannerScenarioActivity

        ref_check = await db.execute(
            select(PlannerScenario).where(
                PlannerScenario.entity_id == entity.id,
                PlannerScenario.is_reference == True,  # noqa: E712
                PlannerScenario.active == True,  # noqa: E712
            )
        )
        if not ref_check.scalar_one_or_none():
            # Count existing scenarios — only create if no reference has been
            # set yet (avoids clobbering a freshly promoted scenario on restart).
            existing_check = await db.execute(
                select(PlannerScenario).where(
                    PlannerScenario.entity_id == entity.id,
                    PlannerScenario.active == True,  # noqa: E712
                )
            )
            if not existing_check.scalars().first():
                # Brand-new install — create the initial reference scenario.
                from datetime import datetime, timezone as _tz
                ref_scenario = PlannerScenario(
                    entity_id=entity.id,
                    title="Plan de référence",
                    description="Plan opérationnel actif — toutes les activités validées font partie de ce plan.",
                    created_by=admin.id,
                    is_reference=True,
                    status="promoted",
                    baseline_snapshot={"total_activities": 0, "captured_at": datetime.now(_tz.utc).isoformat()},
                    baseline_snapshot_at=datetime.now(_tz.utc),
                )
                db.add(ref_scenario)
                await db.flush()

                # Auto-seed: link every existing live activity to the reference scenario.
                live_acts_res = await db.execute(
                    select(PlannerActivity).where(
                        PlannerActivity.entity_id == entity.id,
                        PlannerActivity.active == True,  # noqa: E712
                    )
                )
                for act in live_acts_res.scalars().all():
                    db.add(PlannerScenarioActivity(
                        scenario_id=ref_scenario.id,
                        source_activity_id=act.id,
                    ))

                await db.flush()
                logger.info("Seed: created initial reference scenario for entity %s", entity.code)
    except Exception as _exc:
        logger.warning("Seed: could not create reference scenario — %s", _exc)
