"""Add entity_id to article_catalog (per-entity SAP catalog).

The packlog SAP article catalog can be either:
  - shared globally across all entities (entity_id NULL), or
  - scoped per-entity (entity_id set)

The choice is controlled at runtime by the admin setting
`packlog.article_catalog_global` (entity-scoped, defaults to False = per-entity
with NULL fallback for shared seed data).

Revision ID: 121_add_entity_id_to_article_catalog
Revises: 120_add_doc_type_scope_to_papyrus_forms
Create Date: 2026-04-11
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "121_add_entity_id_to_article_catalog"
down_revision = "120_add_doc_type_scope_to_papyrus_forms"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "article_catalog",
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_article_catalog_entity_id",
        "article_catalog",
        "entities",
        ["entity_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_article_catalog_entity_id",
        "article_catalog",
        ["entity_id"],
    )
    # Composite index used by the per-entity list query (entity_id, sap_code)
    op.create_index(
        "idx_article_catalog_entity_sap",
        "article_catalog",
        ["entity_id", "sap_code"],
    )


def downgrade() -> None:
    op.drop_index("idx_article_catalog_entity_sap", table_name="article_catalog")
    op.drop_index("idx_article_catalog_entity_id", table_name="article_catalog")
    op.drop_constraint("fk_article_catalog_entity_id", "article_catalog", type_="foreignkey")
    op.drop_column("article_catalog", "entity_id")
