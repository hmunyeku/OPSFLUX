"""Add Report Editor module — doc types, documents, revisions, templates,
template fields, document sequences, arborescence nodes, distribution lists,
document signatures, document access grants, share links.

Revision ID: 019_add_report_editor_module
Revises: 018_add_dashboard_target_module
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "019_add_report_editor_module"
down_revision: Union[str, None] = "018_add_dashboard_target_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. doc_types ─────────────────────────────────────────────────────
    op.create_table(
        "doc_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("name", JSONB, nullable=False),
        sa.Column("nomenclature_pattern", sa.String(255), nullable=False),
        sa.Column("discipline", sa.String(50), nullable=True),
        sa.Column("default_template_id", UUID(as_uuid=True), nullable=True),
        sa.Column("default_workflow_id", UUID(as_uuid=True), nullable=True),
        sa.Column("default_language", sa.String(10), nullable=False, server_default="fr"),
        sa.Column("revision_scheme", sa.String(20), nullable=False, server_default="alpha"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint("entity_id", "code", name="uq_doc_type_entity_code"),
        sa.CheckConstraint(
            "revision_scheme IN ('alpha','numeric','semver')",
            name="ck_doc_type_revision_scheme",
        ),
    )

    # ── 2. templates ─────────────────────────────────────────────────────
    op.create_table(
        "templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("doc_type_id", UUID(as_uuid=True), sa.ForeignKey("doc_types.id"), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("structure", JSONB, nullable=False),
        sa.Column("styles", JSONB, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Now add the deferred FK from doc_types.default_template_id → templates.id
    op.create_foreign_key(
        "fk_doc_types_default_template_id",
        "doc_types",
        "templates",
        ["default_template_id"],
        ["id"],
        use_alter=True,
    )

    # ── 3. template_fields ───────────────────────────────────────────────
    op.create_table(
        "template_fields",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("templates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("section_id", sa.String(100), nullable=False),
        sa.Column("field_key", sa.String(100), nullable=False),
        sa.Column("field_type", sa.String(50), nullable=False),
        sa.Column("label", JSONB, nullable=False),
        sa.Column("is_required", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("is_locked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("options", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("validation_rules", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.UniqueConstraint("template_id", "section_id", "field_key", name="uq_template_field_section_key"),
        sa.CheckConstraint(
            "field_type IN ('text_short','text_long','number_decimal','number_integer',"
            "'date','datetime','select_static','reference','toggle','rich_text')",
            name="ck_template_field_type",
        ),
    )

    # ── 4. arborescence_nodes ────────────────────────────────────────────
    op.create_table(
        "arborescence_nodes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_id", UUID(as_uuid=True), sa.ForeignKey("arborescence_nodes.id"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("node_level", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("display_order", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("nomenclature_override", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_arborescence_project", "arborescence_nodes", ["project_id"])
    op.create_index("idx_arborescence_parent", "arborescence_nodes", ["parent_id"])

    # ── 5. documents ─────────────────────────────────────────────────────
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("bu_id", UUID(as_uuid=True), nullable=True),
        sa.Column("doc_type_id", UUID(as_uuid=True), sa.ForeignKey("doc_types.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("arborescence_node_id", UUID(as_uuid=True), sa.ForeignKey("arborescence_nodes.id"), nullable=True),
        sa.Column("number", sa.String(100), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("language", sa.String(10), nullable=False, server_default="fr"),
        sa.Column("current_revision_id", UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("search_vector", sa.Text, nullable=True),
        sa.Column("classification", sa.String(4), nullable=False, server_default="INT"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entity_id", "number", name="uq_document_entity_number"),
        sa.CheckConstraint(
            "status IN ('draft','in_review','approved','published','obsolete','archived')",
            name="ck_document_status",
        ),
        sa.CheckConstraint(
            "classification IN ('PUB','INT','REST','CONF')",
            name="ck_document_classification",
        ),
    )
    op.create_index("idx_documents_entity_status_bu", "documents", ["entity_id", "status", "bu_id"])
    op.create_index("idx_documents_project", "documents", ["project_id"])

    # ── 6. revisions ─────────────────────────────────────────────────────
    op.create_table(
        "revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rev_code", sa.String(20), nullable=False),
        sa.Column("content", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("form_data", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("yjs_state", sa.LargeBinary, nullable=True),
        sa.Column("word_count", sa.Integer, nullable=True),
        sa.Column("is_locked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_revisions_document_created", "revisions", ["document_id", "created_at"])

    # Now add the deferred FK from documents.current_revision_id → revisions.id
    op.create_foreign_key(
        "fk_documents_current_revision_id",
        "documents",
        "revisions",
        ["current_revision_id"],
        ["id"],
        use_alter=True,
    )

    # ── 7. document_sequences ────────────────────────────────────────────
    op.create_table(
        "document_sequences",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("doc_type_id", UUID(as_uuid=True), sa.ForeignKey("doc_types.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("current_value", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.UniqueConstraint("doc_type_id", "project_id", name="uq_doc_sequence_type_project"),
    )

    # ── 8. distribution_lists ────────────────────────────────────────────
    op.create_table(
        "distribution_lists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("doc_type_filter", UUID(as_uuid=True), sa.ForeignKey("doc_types.id"), nullable=True),
        sa.Column("recipients", JSONB, nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # ── 9. document_signatures ───────────────────────────────────────────
    op.create_table(
        "document_signatures",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("revision_id", UUID(as_uuid=True), sa.ForeignKey("revisions.id"), nullable=False),
        sa.Column("signer_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("signer_role", sa.String(100), nullable=False),
        sa.Column("content_hash", sa.String(128), nullable=False),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_doc_signatures_document", "document_signatures", ["document_id"])

    # ── 10. document_access_grants ───────────────────────────────────────
    op.create_table(
        "document_access_grants",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("granted_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("document_id", "user_id", name="uq_doc_access_grant_document_user"),
    )

    # ── 11. share_links ──────────────────────────────────────────────────
    op.create_table(
        "share_links",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), sa.ForeignKey("documents.id"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("otp_required", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("password_hash", sa.String(200), nullable=True),
        sa.Column("access_count", sa.Integer, nullable=False, server_default=sa.text("0")),
        sa.Column("max_accesses", sa.Integer, nullable=True),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("token", name="uq_share_link_token"),
    )
    op.create_index("idx_share_links_token", "share_links", ["token"])


def downgrade() -> None:
    # Drop in reverse order of creation, respecting FK dependencies.

    # Drop deferred FKs first to avoid circular dependency issues.
    op.drop_constraint("fk_documents_current_revision_id", "documents", type_="foreignkey")
    op.drop_constraint("fk_doc_types_default_template_id", "doc_types", type_="foreignkey")

    # 11. share_links
    op.drop_index("idx_share_links_token", table_name="share_links")
    op.drop_table("share_links")

    # 10. document_access_grants
    op.drop_table("document_access_grants")

    # 9. document_signatures
    op.drop_index("idx_doc_signatures_document", table_name="document_signatures")
    op.drop_table("document_signatures")

    # 8. distribution_lists
    op.drop_table("distribution_lists")

    # 7. document_sequences
    op.drop_table("document_sequences")

    # 6. revisions
    op.drop_index("idx_revisions_document_created", table_name="revisions")
    op.drop_table("revisions")

    # 5. documents
    op.drop_index("idx_documents_project", table_name="documents")
    op.drop_index("idx_documents_entity_status_bu", table_name="documents")
    op.drop_table("documents")

    # 4. arborescence_nodes
    op.drop_index("idx_arborescence_parent", table_name="arborescence_nodes")
    op.drop_index("idx_arborescence_project", table_name="arborescence_nodes")
    op.drop_table("arborescence_nodes")

    # 3. template_fields
    op.drop_table("template_fields")

    # 2. templates
    op.drop_table("templates")

    # 1. doc_types
    op.drop_table("doc_types")
