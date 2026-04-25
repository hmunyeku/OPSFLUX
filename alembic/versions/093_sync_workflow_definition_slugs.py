"""sync workflow definition slugs and defaults

Revision ID: 093_sync_workflow_definition_slugs
Revises: 092_add_ads_allowed_companies
Create Date: 2026-04-05 00:00:00.000000
"""

from __future__ import annotations

import json
import uuid

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "093_sync_workflow_definition_slugs"
down_revision = "092_add_ads_allowed_companies"
branch_labels = None
depends_on = None


ADS_STATES = [
    "draft", "submitted",
    "pending_initiator_review", "pending_project_review",
    "pending_compliance", "pending_validation",
    "pending_arbitration", "approved", "rejected", "cancelled",
    "requires_review", "in_progress", "completed",
]

ADS_TRANSITIONS = [
    {"from": "draft", "to": "submitted", "label": "Soumettre", "required_permission": "paxlog.ads.submit"},
    {"from": "draft", "to": "cancelled", "label": "Annuler", "required_permission": "paxlog.ads.cancel"},
    {"from": "submitted", "to": "pending_initiator_review", "label": "Vers validation initiateur"},
    {"from": "pending_initiator_review", "to": "pending_project_review", "label": "Valider"},
    {"from": "pending_initiator_review", "to": "pending_compliance", "label": "Valider"},
    {"from": "pending_initiator_review", "to": "cancelled", "label": "Annuler", "comment_required": True},
    {"from": "submitted", "to": "pending_project_review", "label": "Vers validation projet"},
    {"from": "pending_project_review", "to": "pending_compliance", "label": "Valider"},
    {"from": "pending_project_review", "to": "rejected", "label": "Rejeter", "comment_required": True},
    {"from": "submitted", "to": "pending_compliance", "label": "Vers vérification compliance"},
    {"from": "pending_compliance", "to": "pending_validation", "label": "Valider conformité", "required_permission": "paxlog.compliance.manage"},
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
    {"from": "requires_review", "to": "cancelled", "label": "Annuler", "required_permission": "paxlog.ads.cancel"},
    {"from": "requires_review", "to": "submitted", "label": "Re-soumettre à l'étape nominale", "required_permission": "paxlog.ads.submit"},
]

PLANNER_STATES = ["draft", "submitted", "approved", "rejected", "cancelled", "in_progress", "completed"]

PLANNER_TRANSITIONS = [
    {"from": "draft", "to": "submitted", "label": "Soumettre"},
    {"from": "draft", "to": "cancelled", "label": "Annuler"},
    {"from": "submitted", "to": "approved", "label": "Approuver", "required_roles": ["CDS", "DPROD"]},
    {"from": "submitted", "to": "rejected", "label": "Rejeter", "comment_required": True, "required_roles": ["CDS", "DPROD"]},
    {"from": "approved", "to": "in_progress", "label": "Démarrer"},
    {"from": "approved", "to": "cancelled", "label": "Annuler", "required_roles": ["CDS", "DPROD", "DO"]},
    {"from": "in_progress", "to": "completed", "label": "Terminer"},
    {"from": "rejected", "to": "draft", "label": "Réviser"},
]

VOYAGE_STATES = ["planned", "confirmed", "boarding", "departed", "delayed", "arrived", "closed", "cancelled"]

VOYAGE_TRANSITIONS = [
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
]


def _sync_definition(connection, *, slug: str, legacy_slug: str | None, name: str, entity_type: str, states: list[str], transitions: list[dict]) -> None:
    if legacy_slug:
        connection.execute(
            sa.text(
                """
                UPDATE workflow_definitions wd
                SET slug = :slug,
                    name = :name,
                    entity_type = :entity_type,
                    states = CAST(:states AS jsonb),
                    transitions = CAST(:transitions AS jsonb),
                    status = 'published',
                    active = true,
                    updated_at = now()
                WHERE wd.slug = :legacy_slug
                  AND wd.entity_type IN (:entity_type, :legacy_entity_type)
                  AND NOT EXISTS (
                    SELECT 1 FROM workflow_definitions existing
                    WHERE existing.entity_id = wd.entity_id
                      AND existing.slug = :slug
                  )
                """
            ),
            {
                "slug": slug,
                "legacy_slug": legacy_slug,
                "name": name,
                "entity_type": entity_type,
                "legacy_entity_type": "activity" if entity_type == "planner_activity" else entity_type,
                "states": json.dumps(states),
                "transitions": json.dumps(transitions),
            },
        )

    connection.execute(
        sa.text(
            """
            UPDATE workflow_definitions
            SET name = :name,
                entity_type = :entity_type,
                states = CAST(:states AS jsonb),
                transitions = CAST(:transitions AS jsonb),
                status = 'published',
                active = true,
                updated_at = now()
            WHERE slug = :slug
            """
        ),
        {
            "slug": slug,
            "name": name,
            "entity_type": entity_type,
            "states": json.dumps(states),
            "transitions": json.dumps(transitions),
        },
    )


def upgrade() -> None:
    connection = op.get_bind()

    _sync_definition(
        connection,
        slug="ads-workflow",
        legacy_slug="ads",
        name="Avis de Séjour",
        entity_type="ads",
        states=ADS_STATES,
        transitions=ADS_TRANSITIONS,
    )
    _sync_definition(
        connection,
        slug="planner-activity",
        legacy_slug="planner_activity",
        name="Planner Activity",
        entity_type="planner_activity",
        states=PLANNER_STATES,
        transitions=PLANNER_TRANSITIONS,
    )

    entity_ids = connection.execute(sa.text("SELECT id FROM entities")).fetchall()
    for row in entity_ids:
        entity_id = row[0]
        exists = connection.execute(
            sa.text(
                "SELECT 1 FROM workflow_definitions WHERE entity_id = :entity_id AND slug = 'voyage-workflow' LIMIT 1"
            ),
            {"entity_id": entity_id},
        ).scalar()
        if exists:
            continue
        connection.execute(
            sa.text(
                """
                INSERT INTO workflow_definitions (
                    id, entity_id, slug, name, entity_type, version, status,
                    states, transitions, active, created_at, updated_at
                ) VALUES (
                    :id, :entity_id, 'voyage-workflow', 'TravelWiz Voyage', 'voyage', 1, 'published',
                    CAST(:states AS jsonb), CAST(:transitions AS jsonb), true, now(), now()
                )
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "entity_id": entity_id,
                "states": json.dumps(VOYAGE_STATES),
                "transitions": json.dumps(VOYAGE_TRANSITIONS),
            },
        )


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            """
            UPDATE workflow_definitions
            SET slug = 'ads',
                updated_at = now()
            WHERE slug = 'ads-workflow' AND entity_type = 'ads'
            """
        )
    )
    connection.execute(
        sa.text(
            """
            UPDATE workflow_definitions
            SET slug = 'planner_activity',
                entity_type = 'activity',
                updated_at = now()
            WHERE slug = 'planner-activity' AND entity_type = 'planner_activity'
            """
        )
    )
    connection.execute(
        sa.text("DELETE FROM workflow_definitions WHERE slug = 'voyage-workflow'")
    )
