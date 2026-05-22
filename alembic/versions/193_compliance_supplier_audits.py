"""Add supplier audit engine for compliance.

Revision ID: 193_compliance_supplier_audits
Revises: 192_compliance_rule_subject_scope
Create Date: 2026-05-22
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "193_compliance_supplier_audits"
down_revision = "192_compliance_rule_subject_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "compliance_audit_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("audit_type", sa.String(length=50), nullable=False),
        sa.Column("target_scope", sa.String(length=20), server_default="company", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("passing_score", sa.Numeric(5, 2), server_default="70", nullable=False),
        sa.Column("validity_days", sa.Integer(), nullable=True),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "code", name="uq_compliance_audit_template_code"),
    )
    op.create_index("idx_compliance_audit_templates_entity", "compliance_audit_templates", ["entity_id"])
    op.create_index("idx_compliance_audit_templates_type", "compliance_audit_templates", ["audit_type"])

    op.create_table(
        "compliance_audit_themes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("weight", sa.Numeric(8, 2), server_default="1", nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["template_id"], ["compliance_audit_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_compliance_audit_themes_template", "compliance_audit_themes", ["template_id"])

    op.create_table(
        "compliance_audit_questions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("theme_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("response_type", sa.String(length=30), server_default="score", nullable=False),
        sa.Column("weight", sa.Numeric(8, 2), server_default="1", nullable=False),
        sa.Column("required", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("attachment_required", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("options_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["theme_id"], ["compliance_audit_themes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_compliance_audit_questions_theme", "compliance_audit_questions", ["theme_id"])

    op.create_table(
        "compliance_audits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_type", sa.String(length=30), server_default="tier", nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reference", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="draft", nullable=False),
        sa.Column("planned_at", sa.Date(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("score_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("validation_moc_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("archived", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"]),
        sa.ForeignKeyConstraint(["template_id"], ["compliance_audit_templates.id"]),
        sa.ForeignKeyConstraint(["validation_moc_id"], ["mocs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_compliance_audits_entity", "compliance_audits", ["entity_id"])
    op.create_index("idx_compliance_audits_target", "compliance_audits", ["target_type", "target_id"])
    op.create_index("idx_compliance_audits_status", "compliance_audits", ["status"])

    op.create_table(
        "compliance_audit_answers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("audit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("response_value", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("score", sa.Numeric(5, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("answered_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["answered_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["audit_id"], ["compliance_audits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["compliance_audit_questions.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("audit_id", "question_id", name="uq_compliance_audit_answer_question"),
    )
    op.create_index("idx_compliance_audit_answers_audit", "compliance_audit_answers", ["audit_id"])


def downgrade() -> None:
    op.drop_index("idx_compliance_audit_answers_audit", table_name="compliance_audit_answers")
    op.drop_table("compliance_audit_answers")
    op.drop_index("idx_compliance_audits_status", table_name="compliance_audits")
    op.drop_index("idx_compliance_audits_target", table_name="compliance_audits")
    op.drop_index("idx_compliance_audits_entity", table_name="compliance_audits")
    op.drop_table("compliance_audits")
    op.drop_index("idx_compliance_audit_questions_theme", table_name="compliance_audit_questions")
    op.drop_table("compliance_audit_questions")
    op.drop_index("idx_compliance_audit_themes_template", table_name="compliance_audit_themes")
    op.drop_table("compliance_audit_themes")
    op.drop_index("idx_compliance_audit_templates_type", table_name="compliance_audit_templates")
    op.drop_index("idx_compliance_audit_templates_entity", table_name="compliance_audit_templates")
    op.drop_table("compliance_audit_templates")
