"""Seed service — create initial data for development."""

import hashlib
import json
import logging
import os
from uuid import UUID, uuid4, uuid5

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.common import (
    Asset,
    Entity,
    User,
    UserGroup,
    UserGroupMember,
    WorkflowDefinition,
)

# Namespace UUID for deterministic seed IDs (stable across runs)
_SEED_NS = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

logger = logging.getLogger(__name__)


async def seed_dev_data(db: AsyncSession) -> None:
    """Seed development data — idempotent."""

    # ── Entity: Perenco Cameroun ─────────────────────────────────
    result = await db.execute(select(Entity).where(Entity.code == "PER_CMR"))
    entity = result.scalar_one_or_none()
    if not entity:
        entity = Entity(
            code="PER_CMR",
            name="Perenco Cameroun",
            country="Cameroun",
            timezone="Africa/Douala",
        )
        db.add(entity)
        await db.flush()
        logger.info("Seed: created entity PER_CMR")

    # ── Admin user ───────────────────────────────────────────────
    result = await db.execute(select(User).where(User.email == "admin@opsflux.io"))
    admin = result.scalar_one_or_none()
    if not admin:
        admin = User(
            email="admin@opsflux.io",
            first_name="Admin",
            last_name="OpsFlux",
            hashed_password=hash_password(os.environ.get("FIRST_SUPERUSER_PASSWORD", "Admin@2026!")),
            default_entity_id=entity.id,
            language="fr",
        )
        db.add(admin)
        await db.flush()
        logger.info("Seed: created admin user admin@opsflux.io")

    # ── Assign SUPER_ADMIN role to admin ─────────────────────────
    result = await db.execute(
        select(UserGroup).where(
            UserGroup.entity_id == entity.id,
            UserGroup.role_code == "SUPER_ADMIN",
        )
    )
    admin_group = result.scalar_one_or_none()
    if not admin_group:
        admin_group = UserGroup(
            entity_id=entity.id,
            name="Super Administrators",
            role_code="SUPER_ADMIN",
        )
        db.add(admin_group)
        await db.flush()

        db.add(UserGroupMember(user_id=admin.id, group_id=admin_group.id))
        logger.info("Seed: assigned SUPER_ADMIN to admin")

    # ── Sample assets ────────────────────────────────────────────
    result = await db.execute(select(Asset).where(Asset.code == "EBOME"))
    if not result.scalar_one_or_none():
        # Field
        ebome = Asset(
            entity_id=entity.id,
            type="field",
            code="EBOME",
            name="Champ Ebome",
            path="per_cmr.ebome",
            latitude=2.8,
            longitude=9.8,
        )
        db.add(ebome)
        await db.flush()

        # Sites under field
        munja = Asset(
            entity_id=entity.id,
            parent_id=ebome.id,
            type="site",
            code="MUNJA",
            name="Munja",
            path="per_cmr.ebome.munja",
            latitude=2.82,
            longitude=9.78,
        )
        db.add(munja)
        await db.flush()

        # Platforms under Munja
        for pf_code, pf_name, lat, lon in [
            ("ESF1", "Plateforme ESF1", 2.83, 9.77),
            ("KLF3", "Plateforme KLF3", 2.81, 9.76),
        ]:
            db.add(Asset(
                entity_id=entity.id,
                parent_id=munja.id,
                type="platform",
                code=pf_code,
                name=pf_name,
                path=f"per_cmr.ebome.munja.{pf_code.lower()}",
                latitude=lat,
                longitude=lon,
            ))

        # Base logistique
        db.add(Asset(
            entity_id=entity.id,
            type="base",
            code="WOURI",
            name="Base Logistique Wouri",
            path="per_cmr.wouri",
            latitude=4.05,
            longitude=9.7,
        ))

        logger.info("Seed: created sample assets")

    # ── Workflow definitions ─────────────────────────────────────
    workflows = [
        {
            "slug": "project",
            "name": "Project Lifecycle",
            "entity_type": "project",
            "states": ["draft", "active", "on_hold", "completed", "cancelled"],
            "transitions": [
                {"from": "draft", "to": "active", "label": "Activer", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                {"from": "active", "to": "on_hold", "label": "Mettre en pause", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "completed", "label": "Terminer", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "active", "to": "cancelled", "label": "Annuler", "required_roles": ["DPROJ", "DO"]},
                {"from": "on_hold", "to": "active", "label": "Reprendre", "required_roles": ["CHEF_PROJET", "DPROJ"]},
                {"from": "on_hold", "to": "cancelled", "label": "Annuler", "required_roles": ["DPROJ", "DO"]},
            ],
        },
        {
            "slug": "ads",
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
                # Draft
                {"from": "draft", "to": "submitted", "label": "Soumettre"},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                # Step 0-A: initiator review (when created_by != requester_id)
                {"from": "submitted", "to": "pending_initiator_review", "label": "Vers validation initiateur"},
                {"from": "pending_initiator_review", "to": "pending_project_review", "label": "Valider", "required_roles": ["READER"]},
                {"from": "pending_initiator_review", "to": "rejected", "label": "Rejeter", "comment_required": True},
                # Step 0-B: project review (when linked to a project)
                {"from": "submitted", "to": "pending_project_review", "label": "Vers validation projet"},
                {"from": "pending_project_review", "to": "pending_compliance", "label": "Valider", "required_roles": ["CHEF_PROJET"]},
                {"from": "pending_project_review", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CHEF_PROJET"]},
                # Standard flow
                {"from": "submitted", "to": "pending_compliance", "label": "Vers vérification compliance"},
                {"from": "pending_compliance", "to": "pending_validation", "label": "Conforme", "required_roles": ["HSE_ADMIN", "HSE_ADMIN"]},
                {"from": "pending_compliance", "to": "rejected", "label": "Non conforme", "comment_required": True, "required_roles": ["HSE_ADMIN", "HSE_ADMIN"]},
                {"from": "pending_validation", "to": "approved", "label": "Approuver", "required_roles": ["CDS", "DPROD"]},
                {"from": "pending_validation", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CDS", "DPROD"]},
                {"from": "pending_validation", "to": "pending_arbitration", "label": "Escalader au DO", "required_roles": ["CDS", "DPROD"]},
                # DO arbitrage
                {"from": "pending_arbitration", "to": "approved", "label": "Approuver (DO)", "required_roles": ["DO"]},
                {"from": "pending_arbitration", "to": "rejected", "label": "Rejeter (DO)", "comment_required": True, "required_roles": ["DO"]},
                # Post-approval
                {"from": "approved", "to": "in_progress", "label": "Démarrer"},
                {"from": "approved", "to": "requires_review", "label": "Demander révision"},
                {"from": "approved", "to": "cancelled", "label": "Annuler", "required_roles": ["CDS", "DPROD", "DO"]},
                {"from": "in_progress", "to": "completed", "label": "Terminer"},
                {"from": "in_progress", "to": "requires_review", "label": "Demander révision"},
                # Review loop
                {"from": "requires_review", "to": "pending_validation", "label": "Re-soumettre"},
                {"from": "requires_review", "to": "cancelled", "label": "Annuler"},
            ],
        },
        {
            "slug": "planner_activity",
            "name": "Planner Activity",
            "entity_type": "activity",
            "states": ["draft", "submitted", "approved", "rejected", "cancelled", "in_progress", "completed"],
            "transitions": [
                {"from": "draft", "to": "submitted", "label": "Soumettre"},
                {"from": "draft", "to": "cancelled", "label": "Annuler"},
                {"from": "submitted", "to": "approved", "label": "Approuver", "required_roles": ["CDS", "DPROD"]},
                {"from": "submitted", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CDS", "DPROD"]},
                {"from": "approved", "to": "in_progress", "label": "Démarrer"},
                {"from": "approved", "to": "cancelled", "label": "Annuler", "required_roles": ["CDS", "DPROD", "DO"]},
                {"from": "in_progress", "to": "completed", "label": "Terminer"},
                {"from": "rejected", "to": "draft", "label": "Réviser"},
            ],
        },
    ]

    for wf in workflows:
        result = await db.execute(
            select(WorkflowDefinition).where(
                WorkflowDefinition.slug == wf["slug"],
                WorkflowDefinition.entity_id == entity.id,
            )
        )
        if not result.scalar_one_or_none():
            db.add(WorkflowDefinition(
                entity_id=entity.id,
                slug=wf["slug"],
                name=wf["name"],
                entity_type=wf["entity_type"],
                states=wf["states"],
                transitions=wf["transitions"],
                status="published",
            ))
            logger.info("Seed: created workflow definition '%s'", wf["slug"])

    # ── Sample test users with different roles ─────────────────
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

        # Create group for this role if not exists
        result = await db.execute(
            select(UserGroup).where(
                UserGroup.entity_id == entity.id,
                UserGroup.role_code == role_code,
            )
        )
        group = result.scalar_one_or_none()
        if not group:
            group = UserGroup(
                entity_id=entity.id,
                name=f"Groupe {role_code}",
                role_code=role_code,
            )
            db.add(group)
            await db.flush()

        # Add user to group if not member
        result = await db.execute(
            select(UserGroupMember).where(
                UserGroupMember.user_id == user.id,
                UserGroupMember.group_id == group.id,
            )
        )
        if not result.scalar_one_or_none():
            db.add(UserGroupMember(user_id=user.id, group_id=group.id))
            logger.info("Seed: assigned %s to group %s", email, role_code)

    # ── Dashboard mandatory tabs per role (spec section 11) ─────
    await seed_dashboard_tabs(db, entity.id)

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

    def _make_widget(widget_type: str, title: str, config: dict, position: dict) -> dict:
        """Build a widget dict matching the JSONB schema."""
        suffix = hashlib.md5(f"{entity_id_str}:{widget_type}:{title}".encode()).hexdigest()[:8]
        return {
            "id": f"w_{widget_type}_{suffix}",
            "type": widget_type,
            "title": title,
            "config": config,
            "position": position,
            "options": {"refreshInterval": 60000, "showHeader": True, "showLastRefreshed": True},
        }

    # ── Tab definitions per spec section 11 ──────────────────────────
    ROLE_TABS: list[dict] = [
        # CDS — Chef de Site
        {
            "name": "Mon site",
            "target_role": "CDS",
            "target_module": None,
            "tab_order": 0,
            "widgets": [
                _make_widget("pax_on_site", "PAX sur site",
                             {"source": "paxlog"},
                             {"x": 0, "y": 0, "w": 3, "h": 2}),
                _make_widget("ads_pending", "AdS en attente",
                             {"source": "paxlog", "status": "pending_validation"},
                             {"x": 3, "y": 0, "w": 3, "h": 2}),
                _make_widget("planner_gantt_mini", "Gantt compact",
                             {"source": "planner", "chart_type": "gantt"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes critiques",
                             {"source": "core"},
                             {"x": 0, "y": 2, "w": 6, "h": 4}),
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
                             {"source": "travelwiz"},
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
                             {"source": "planner", "chart_type": "heatmap"},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("alerts_urgent", "Alertes critiques",
                             {"source": "core"},
                             {"x": 6, "y": 0, "w": 6, "h": 3}),
                _make_widget("fleet_map", "Carte flotte",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 4, "w": 6, "h": 4}),
                _make_widget("signalements_actifs", "Signalements actifs",
                             {"source": "paxlog"},
                             {"x": 6, "y": 3, "w": 6, "h": 4}),
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
                             {"x": 8, "y": 0, "w": 4, "h": 2}),
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
        # Planner module dashboard
        {
            "name": "Planner",
            "target_role": None,
            "target_module": "planner",
            "tab_order": 0,
            "widgets": [
                _make_widget("capacity_heatmap", "Charge PAX par site",
                             {"source": "planner"},
                             {"x": 0, "y": 0, "w": 8, "h": 4}),
                _make_widget("planner_gantt_mini", "Gantt compact",
                             {"source": "planner"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
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
                _make_widget("ads_pending", "AdS en attente",
                             {"source": "paxlog"},
                             {"x": 3, "y": 0, "w": 5, "h": 4}),
                _make_widget("compliance_expiry", "Certifications expirant",
                             {"source": "paxlog"},
                             {"x": 8, "y": 0, "w": 4, "h": 4}),
            ],
        },
        # TravelWiz module dashboard
        {
            "name": "TravelWiz",
            "target_role": None,
            "target_module": "travelwiz",
            "tab_order": 0,
            "widgets": [
                _make_widget("trips_today", "Voyages du jour",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 0, "w": 6, "h": 4}),
                _make_widget("cargo_pending", "Cargo en attente",
                             {"source": "travelwiz"},
                             {"x": 6, "y": 0, "w": 6, "h": 4}),
                _make_widget("kpi_fleet", "KPIs flotte",
                             {"source": "travelwiz"},
                             {"x": 0, "y": 4, "w": 4, "h": 3}),
            ],
        },
    ]

    # ── Bulk INSERT via raw SQL — ON CONFLICT (id) DO NOTHING ─────────
    insert_sql = text("""
        INSERT INTO dashboard_tabs (id, entity_id, name, is_mandatory, target_role,
                                    target_module, tab_order, widgets, is_active)
        VALUES (:id, :entity_id, :name, TRUE, :target_role,
                :target_module, :tab_order, CAST(:widgets AS jsonb), TRUE)
        ON CONFLICT (id) DO NOTHING
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
