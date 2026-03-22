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
    UserGroupRole,
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
            trade_name="Perenco Cameroun S.A.",
            legal_form="SA",
            country="CM",
            timezone="Africa/Douala",
            language="fr",
            currency="XAF",
            fiscal_year_start=1,
            industry="Oil & Gas — Exploration & Production",
            address_line1="Rue de la Chambre de Commerce",
            city="Douala",
            state="Littoral",
            zip_code="BP 2199",
            phone="+237 233 42 64 80",
            email="contact@perenco-cam.com",
            website="https://www.perenco.com",
            social_networks={"linkedin": "https://www.linkedin.com/company/perenco"},
            opening_hours={
                "mon": {"open": "07:30", "close": "17:00"},
                "tue": {"open": "07:30", "close": "17:00"},
                "wed": {"open": "07:30", "close": "17:00"},
                "thu": {"open": "07:30", "close": "17:00"},
                "fri": {"open": "07:30", "close": "16:00"},
            },
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
            UserGroup.name == "Super Administrators",
        )
    )
    admin_group = result.scalar_one_or_none()
    if not admin_group:
        admin_group = UserGroup(
            entity_id=entity.id,
            name="Super Administrators",
        )
        db.add(admin_group)
        await db.flush()
        db.add(UserGroupRole(group_id=admin_group.id, role_code="SUPER_ADMIN"))
        logger.info("Seed: created SUPER_ADMIN group")

    # Always ensure admin is a member (handles user recreation with new UUID)
    result = await db.execute(
        select(UserGroupMember).where(
            UserGroupMember.user_id == admin.id,
            UserGroupMember.group_id == admin_group.id,
        )
    )
    if not result.scalar_one_or_none():
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
                UserGroup.name == f"Groupe {role_code}",
            )
        )
        group = result.scalar_one_or_none()
        if not group:
            group = UserGroup(
                entity_id=entity.id,
                name=f"Groupe {role_code}",
            )
            db.add(group)
            await db.flush()
            db.add(UserGroupRole(group_id=group.id, role_code=role_code))

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

    # ── Email templates ────────────────────────────────────────────
    await seed_email_templates(db, entity.id, admin.id)

    # ── PDF templates ──────────────────────────────────────────────
    await seed_pdf_templates(db, entity.id, admin.id)

    # ── Reference numbering defaults ───────────────────────────────
    await seed_reference_numbering(db, entity.id)

    # ── Dictionary entries (visa types, health conditions, etc.) ──
    await seed_dictionary_entries(db)

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


async def seed_email_templates(db: AsyncSession, entity_id, admin_id) -> None:
    """Seed default email templates — idempotent."""
    from app.core.email_templates import DEFAULT_TEMPLATES
    from app.models.common import EmailTemplate, EmailTemplateVersion

    created = 0
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
    """Seed default PDF templates — idempotent."""
    from app.core.pdf_templates import DEFAULT_PDF_TEMPLATES
    from app.models.common import PdfTemplate, PdfTemplateVersion

    created = 0
    for tpl_def in DEFAULT_PDF_TEMPLATES:
        result = await db.execute(
            select(PdfTemplate.id).where(
                PdfTemplate.entity_id == entity_id,
                PdfTemplate.slug == tpl_def["slug"],
            )
        )
        if result.scalar_one_or_none():
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
            margin_right=tpl_def.get("margin_right", 15),
            margin_bottom=tpl_def.get("margin_bottom", 15),
            margin_left=tpl_def.get("margin_left", 15),
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

    if created:
        logger.info("Seed: created %d PDF templates", created)
    else:
        logger.info("Seed: all PDF templates already exist")


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
        # Documents
        ("DOC", "{entity_code}-{prefix}-{YYYY}-{####}"),
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
        # ── Driving license types ──
        ("license_type", "A", "A — Moto", 1),
        ("license_type", "B", "B — Véhicule léger", 2),
        ("license_type", "C", "C — Poids lourd", 3),
        ("license_type", "D", "D — Transport en commun", 4),
        ("license_type", "E", "E — Remorque", 5),
        ("license_type", "F", "F — Véhicule spécial", 6),
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
        # ── Clothing sizes ──
        ("clothing_size", "XS", "XS", 1),
        ("clothing_size", "S", "S", 2),
        ("clothing_size", "M", "M", 3),
        ("clothing_size", "L", "L", 4),
        ("clothing_size", "XL", "XL", 5),
        ("clothing_size", "XXL", "XXL", 6),
        ("clothing_size", "3XL", "3XL", 7),
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

    created = 0
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

    # Nationality entries with country + nationality metadata columns
    updated = 0
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

    if created:
        logger.info("Seed: created %d dictionary entries", created)
    if updated:
        logger.info("Seed: updated %d nationality entries with country/nationality metadata", updated)
    if not created and not updated:
        logger.info("Seed: all dictionary entries already up to date")
