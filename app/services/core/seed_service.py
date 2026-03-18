"""Seed service — create initial data for development."""

import logging
from uuid import uuid4

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
            hashed_password=hash_password("Admin@2026!"),
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
                {"from": "pending_initiator_review", "to": "pending_project_review", "label": "Valider", "required_roles": ["DEMANDEUR"]},
                {"from": "pending_initiator_review", "to": "rejected", "label": "Rejeter", "comment_required": True},
                # Step 0-B: project review (when linked to a project)
                {"from": "submitted", "to": "pending_project_review", "label": "Vers validation projet"},
                {"from": "pending_project_review", "to": "pending_compliance", "label": "Valider", "required_roles": ["CHEF_PROJET"]},
                {"from": "pending_project_review", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CHEF_PROJET"]},
                # Standard flow
                {"from": "submitted", "to": "pending_compliance", "label": "Vers vérification compliance"},
                {"from": "pending_compliance", "to": "pending_validation", "label": "Conforme", "required_roles": ["CHSE", "HSE_SITE"]},
                {"from": "pending_compliance", "to": "rejected", "label": "Non conforme", "comment_required": True, "required_roles": ["CHSE", "HSE_SITE"]},
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
        ("chse@opsflux.io", "Coordinateur", "HSE", "CHSE"),
        ("dprod@opsflux.io", "Directeur", "Production", "DPROD"),
        ("chef.projet@opsflux.io", "Chef", "Projet", "CHEF_PROJET"),
        ("demandeur@opsflux.io", "Jean", "Dupont", "DEMANDEUR"),
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

    await db.commit()
    logger.info("Seed: development data seeded successfully")
