"""Add score thresholds to compliance audit templates.

Revision ID: 195_compliance_audit_score_thresholds
Revises: 194_moc_audit_validation_profile
Create Date: 2026-05-23
"""

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "195_compliance_audit_score_thresholds"
down_revision = "194_moc_audit_validation_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "compliance_audit_templates",
        sa.Column("score_thresholds", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    thresholds = json.dumps([
        {"code": "preferred", "label": "Privilegie", "min_score": 90, "color": "success", "blocks_assignment": False},
        {"code": "qualified", "label": "Qualifie", "min_score": 75, "color": "primary", "blocks_assignment": False},
        {"code": "watch", "label": "Sous surveillance", "min_score": 60, "color": "warning", "blocks_assignment": False},
        {"code": "blocked", "label": "Bloque", "min_score": 0, "color": "danger", "blocks_assignment": True},
    ])
    op.get_bind().execute(
        sa.text(
            "UPDATE compliance_audit_templates "
            "SET score_thresholds = CAST(:thresholds AS jsonb) "
            "WHERE code IN ('CIS-AUDIT-ADMIN', 'CIS-AUDIT-HSE', 'CIS-AUDIT-METIER') "
            "AND score_thresholds IS NULL"
        ),
        {"thresholds": thresholds},
    )


def downgrade() -> None:
    op.drop_column("compliance_audit_templates", "score_thresholds")
