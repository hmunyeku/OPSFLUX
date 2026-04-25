"""Add PaxLog module tables — pax_groups, pax_profiles, credential_types,
pax_credentials, compliance_matrix, ads, ads_pax, pax_incidents.

Revision ID: 015b_add_paxlog_tables
Revises: 015_add_planning_revisions_deliverables_actions_changelog
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "015b_add_paxlog_tables"
down_revision: Union[str, None] = "015_add_planning_revisions_deliverables_actions_changelog"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # PAX GROUPS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_groups",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
    )
    op.create_index("idx_pax_groups_entity", "pax_groups", ["entity_id"])

    # ══════════════════════════════════════════════════════════════
    # PAX PROFILES
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("first_name_normalized", sa.String(100), nullable=False),
        sa.Column("last_name_normalized", sa.String(100), nullable=False),
        sa.Column("birth_date", sa.Date, nullable=True),
        sa.Column("nationality", sa.String(100), nullable=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=True),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("pax_groups.id"), nullable=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("badge_number", sa.String(100), nullable=True),
        sa.Column("photo_url", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("profile_completeness", sa.SmallInteger, nullable=False, server_default="0"),
        sa.Column("synced_from_intranet", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("intranet_id", sa.String(100), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('active','incomplete','suspended','archived')",
            name="ck_pax_status",
        ),
        sa.CheckConstraint("type IN ('internal','external')", name="ck_pax_type"),
        sa.CheckConstraint(
            "profile_completeness BETWEEN 0 AND 100",
            name="ck_pax_completeness",
        ),
    )
    op.create_index("idx_pax_entity", "pax_profiles", ["entity_id"])
    op.create_index("idx_pax_company", "pax_profiles", ["company_id"])
    op.create_index("idx_pax_user", "pax_profiles", ["user_id"])
    # Duplicate-prevention constraints (also in 021 but needed baseline)
    op.create_unique_constraint(
        "uq_pax_identity",
        "pax_profiles",
        ["entity_id", "first_name_normalized", "last_name_normalized", "birth_date"],
    )
    op.create_index(
        "uq_pax_badge_entity",
        "pax_profiles",
        ["entity_id", "badge_number"],
        unique=True,
        postgresql_where=sa.text("badge_number IS NOT NULL AND archived = false"),
    )

    # ══════════════════════════════════════════════════════════════
    # CREDENTIAL TYPES
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "credential_types",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(50), unique=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("has_expiry", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("validity_months", sa.SmallInteger, nullable=True),
        sa.Column("proof_required", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("booking_service_id", UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=True),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "category IN ('safety','medical','technical','administrative')",
            name="ck_credtype_category",
        ),
    )

    # ══════════════════════════════════════════════════════════════
    # PAX CREDENTIALS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_credentials",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=False),
        sa.Column("credential_type_id", UUID(as_uuid=True), sa.ForeignKey("credential_types.id"), nullable=False),
        sa.Column("obtained_date", sa.Date, nullable=False),
        sa.Column("expiry_date", sa.Date, nullable=True),
        sa.Column("proof_url", sa.Text, nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_validation"),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("pax_id", "credential_type_id", name="uq_pax_credential"),
        sa.CheckConstraint(
            "status IN ('valid','expired','pending_validation','rejected')",
            name="ck_cred_status",
        ),
    )
    op.create_index("idx_creds_pax", "pax_credentials", ["pax_id"])
    op.create_index("idx_creds_status", "pax_credentials", ["status"])

    # ══════════════════════════════════════════════════════════════
    # COMPLIANCE MATRIX
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "compliance_matrix",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("credential_type_id", UUID(as_uuid=True), sa.ForeignKey("credential_types.id"), nullable=False),
        sa.Column("mandatory", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("scope", sa.String(30), nullable=False, server_default="all_visitors"),
        sa.Column("defined_by", sa.String(20), nullable=False),
        sa.Column("set_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("effective_date", sa.Date, nullable=False),
        sa.Column("notes", sa.Text, nullable=True),
        sa.UniqueConstraint(
            "entity_id", "asset_id", "credential_type_id", "scope",
            name="uq_compliance_matrix",
        ),
        sa.CheckConstraint(
            "scope IN ('all_visitors','contractors_only','permanent_staff_only')",
            name="ck_matrix_scope",
        ),
        sa.CheckConstraint(
            "defined_by IN ('hse_central','site')",
            name="ck_matrix_defined_by",
        ),
    )
    op.create_index("idx_matrix_asset", "compliance_matrix", ["asset_id"])

    # ══════════════════════════════════════════════════════════════
    # ADS (Avis de Séjour)
    # Note: planner_activity_id and project_id are added in migration 017
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "ads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("reference", sa.String(50), unique=True, nullable=False),
        sa.Column("type", sa.String(20), nullable=False, server_default="individual"),
        sa.Column("status", sa.String(40), nullable=False, server_default="draft"),
        sa.Column("workflow_id", UUID(as_uuid=True), nullable=True),
        sa.Column("requester_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("site_entry_asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=False),
        sa.Column("visit_purpose", sa.Text, nullable=False),
        sa.Column("visit_category", sa.String(50), nullable=False),
        sa.Column("visit_category_requires_planner", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("start_date", sa.Date, nullable=False),
        sa.Column("end_date", sa.Date, nullable=False),
        sa.Column("outbound_transport_mode", sa.String(50), nullable=True),
        sa.Column("outbound_departure_base_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("outbound_notes", sa.Text, nullable=True),
        sa.Column("return_transport_mode", sa.String(50), nullable=True),
        sa.Column("return_departure_base_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("return_notes", sa.Text, nullable=True),
        sa.Column("cross_company_flag", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text, nullable=True),
        sa.Column("archived", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("end_date >= start_date", name="ck_ads_dates"),
        sa.CheckConstraint(
            "status IN ('draft','submitted','pending_initiator_review',"
            "'pending_project_review','pending_compliance','pending_validation',"
            "'approved','rejected','cancelled','requires_review',"
            "'pending_arbitration','in_progress','completed')",
            name="ck_ads_status",
        ),
        sa.CheckConstraint(
            "type IN ('individual','team')",
            name="ck_ads_type",
        ),
        sa.CheckConstraint(
            "visit_category IN ('project_work','maintenance','inspection',"
            "'visit','permanent_ops','other')",
            name="ck_ads_visit_category",
        ),
    )
    op.create_index("idx_ads_entity", "ads", ["entity_id"])
    op.create_index("idx_ads_status", "ads", ["entity_id", "status"])
    op.create_index("idx_ads_asset", "ads", ["site_entry_asset_id"])
    op.create_index("idx_ads_dates", "ads", ["start_date", "end_date"])
    op.create_index("idx_ads_requester", "ads", ["requester_id"])

    # ══════════════════════════════════════════════════════════════
    # ADS PAX (junction: PAX in an AdS)
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "ads_pax",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("ads_id", UUID(as_uuid=True), sa.ForeignKey("ads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_check"),
        sa.Column("compliance_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("compliance_summary", JSONB, nullable=True),
        sa.Column("booking_request_sent", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("current_onboard", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("priority_score", sa.Integer, nullable=False, server_default="0"),
        sa.Column("priority_source", sa.String(50), nullable=True),
        sa.UniqueConstraint("ads_id", "pax_id", name="uq_ads_pax"),
        sa.CheckConstraint(
            "status IN ('pending_check','compliant','blocked','approved','rejected','no_show')",
            name="ck_ads_pax_status",
        ),
    )
    op.create_index("idx_ads_pax_ads", "ads_pax", ["ads_id"])
    op.create_index("idx_ads_pax_pax", "ads_pax", ["pax_id"])
    op.create_index("idx_ads_pax_status", "ads_pax", ["status"])

    # ══════════════════════════════════════════════════════════════
    # PAX INCIDENTS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "pax_incidents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("pax_id", UUID(as_uuid=True), sa.ForeignKey("pax_profiles.id"), nullable=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("tiers.id"), nullable=True),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("incident_date", sa.Date, nullable=False),
        sa.Column("ban_start_date", sa.Date, nullable=True),
        sa.Column("ban_end_date", sa.Date, nullable=True),
        sa.Column("recorded_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("resolution_notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "severity IN ('info','warning','temp_ban','permanent_ban')",
            name="ck_incident_severity",
        ),
    )
    op.create_index("idx_incidents_pax", "pax_incidents", ["pax_id"])
    op.create_index("idx_incidents_company", "pax_incidents", ["company_id"])


def downgrade() -> None:
    op.drop_table("pax_incidents")
    op.drop_table("ads_pax")
    op.drop_table("ads")
    op.drop_table("compliance_matrix")
    op.drop_table("pax_credentials")
    op.drop_table("credential_types")
    op.drop_table("pax_profiles")
    op.drop_table("pax_groups")
