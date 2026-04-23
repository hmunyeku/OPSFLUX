"""Create integration_connections table for heavy external connectors.

OPSFLUX currently stores most integrations as `Settings` scope=entity rows
keyed `integration.<provider>.<field>`. That pattern is great for simple
OAuth2 providers, API keys and map engines, but it does not scale to the
"heavy" connectors we need for the autonomous maintenance agent feature:

  * GitHub (App or PAT, with per-repo config + webhook secret)
  * Dokploy (api_url + project_id + application_id + env label, possibly
    several instances for staging/prod/QA)
  * Agent Runner (Claude Code or Codex, with budget + model preference)

Those connectors need:
  * A row per instance (multiple Dokploy envs for the same entity),
  * A lifecycle (active / suspended / error / disabled),
  * Test metadata (`last_tested_at`, `last_test_result`),
  * A clean separation between structured non-sensitive config (JSONB)
    and encrypted credentials.

Hence this dedicated table living next to the existing Settings-based
integrations. Light integrations (social OAuth, single API keys) stay in
Settings; heavy ones land here.

Credentials are encrypted at rest with pgcrypto `pgp_sym_encrypt` using
the existing `ENCRYPTION_KEY` env var (same key as the GDPR field
encryption) — no new crypto primitive introduced, consistent with the
rest of the codebase.

Revision ID: 150_integration_connections
Revises: 149_moc_pdf_template_subheader_fix
Create Date: 2026-04-23
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "150_integration_connections"
down_revision = "149_moc_pdf_template_subheader_fix"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_connections",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "entity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("entities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("connection_type", sa.String(32), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        # pgcrypto pgp_sym_encrypt output is bytea
        sa.Column("credentials_encrypted", postgresql.BYTEA(), nullable=True),
        sa.Column(
            "status",
            sa.String(16),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column(
            "last_tested_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "last_test_result",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.CheckConstraint(
            "connection_type IN ('github', 'dokploy', 'agent_runner')",
            name="ck_integration_connection_type",
        ),
        sa.CheckConstraint(
            "status IN ('active', 'suspended', 'error', 'disabled')",
            name="ck_integration_connection_status",
        ),
    )
    op.create_index(
        "uq_integration_connection_entity_name",
        "integration_connections",
        ["entity_id", "name"],
        unique=True,
    )
    op.create_index(
        "idx_integration_connection_type",
        "integration_connections",
        ["connection_type"],
    )
    op.create_index(
        "idx_integration_connection_entity_type",
        "integration_connections",
        ["entity_id", "connection_type"],
    )


def downgrade() -> None:
    op.drop_index("idx_integration_connection_entity_type", table_name="integration_connections")
    op.drop_index("idx_integration_connection_type", table_name="integration_connections")
    op.drop_index("uq_integration_connection_entity_name", table_name="integration_connections")
    op.drop_table("integration_connections")
