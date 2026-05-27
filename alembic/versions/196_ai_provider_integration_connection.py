"""Allow AI provider integration connections.

Revision ID: 196_ai_provider_integration_connection
Revises: 195_compliance_audit_score_thresholds
Create Date: 2026-05-27
"""
from __future__ import annotations

from alembic import op

revision = "196_ai_provider_integration_connection"
down_revision = "195_compliance_audit_score_thresholds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_integration_connection_type",
        "integration_connections",
        type_="check",
    )
    op.create_check_constraint(
        "ck_integration_connection_type",
        "integration_connections",
        "connection_type IN ('github', 'dokploy', 'agent_runner', 'ai_provider')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_integration_connection_type",
        "integration_connections",
        type_="check",
    )
    op.create_check_constraint(
        "ck_integration_connection_type",
        "integration_connections",
        "connection_type IN ('github', 'dokploy', 'agent_runner')",
    )
