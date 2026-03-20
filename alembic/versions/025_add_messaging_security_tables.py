"""Add messaging system and login security tables.

Tables:
- announcements: system broadcasts from admin
- announcement_receipts: per-user read tracking
- login_events: security audit journal for login attempts
- security_rules: admin-configurable login rules

Revision ID: 025_add_messaging_security_tables
Revises: 024_add_audit_user_columns
Create Date: 2026-03-19
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "025_add_messaging_security_tables"
down_revision: Union[str, None] = "024_add_audit_user_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ══════════════════════════════════════════════════════════════
    # ANNOUNCEMENTS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "announcements",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("body_html", sa.Text, nullable=True),
        sa.Column("priority", sa.String(20), nullable=False, server_default="info"),
        sa.Column("target_type", sa.String(20), nullable=False, server_default="all"),
        sa.Column("target_value", sa.String(200), nullable=True),
        sa.Column("display_location", sa.String(20), nullable=False, server_default="dashboard"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("send_email", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sender_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("pinned", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("dismissed_by", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "priority IN ('info','warning','critical','maintenance')",
            name="ck_announcement_priority",
        ),
        sa.CheckConstraint(
            "target_type IN ('all','entity','role','module','user')",
            name="ck_announcement_target_type",
        ),
        sa.CheckConstraint(
            "display_location IN ('dashboard','login','banner','modal','logout','all')",
            name="ck_announcement_display_location",
        ),
    )
    op.create_index("idx_announcements_entity", "announcements", ["entity_id"])
    op.create_index("idx_announcements_active", "announcements", ["active", "published_at", "expires_at"])
    op.create_index("idx_announcements_location", "announcements", ["display_location"])

    # ══════════════════════════════════════════════════════════════
    # ANNOUNCEMENT RECEIPTS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "announcement_receipts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("announcement_id", UUID(as_uuid=True), sa.ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("dismissed", sa.Boolean, nullable=False, server_default=sa.text("false")),
    )
    op.create_index("idx_receipts_announcement", "announcement_receipts", ["announcement_id"])
    op.create_index("idx_receipts_user", "announcement_receipts", ["user_id"])
    op.create_index("uq_announcement_receipt", "announcement_receipts", ["announcement_id", "user_id"], unique=True)

    # ══════════════════════════════════════════════════════════════
    # LOGIN EVENTS
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "login_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("browser", sa.String(100), nullable=True),
        sa.Column("os", sa.String(100), nullable=True),
        sa.Column("device_type", sa.String(20), nullable=False, server_default="desktop"),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("country_code", sa.String(5), nullable=True),
        sa.Column("city", sa.String(200), nullable=True),
        sa.Column("success", sa.Boolean, nullable=False),
        sa.Column("failure_reason", sa.String(100), nullable=True),
        sa.Column("suspicious", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("suspicious_reasons", JSONB, nullable=True),
        sa.Column("blocked", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("blocked_reason", sa.String(200), nullable=True),
        sa.Column("mfa_used", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_login_events_user", "login_events", ["user_id"])
    op.create_index("idx_login_events_ip", "login_events", ["ip_address"])
    op.create_index("idx_login_events_created", "login_events", ["created_at"])
    op.create_index("idx_login_events_success", "login_events", ["success"])
    op.create_index("idx_login_events_email", "login_events", ["email"])

    # ══════════════════════════════════════════════════════════════
    # SECURITY RULES
    # ══════════════════════════════════════════════════════════════
    op.create_table(
        "security_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=True),
        sa.Column("rule_type", sa.String(30), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("config", JSONB, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("priority", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "rule_type IN ('geo_block','ip_whitelist','ip_blacklist',"
            "'max_attempts','time_window','device_trust','mfa_enforce')",
            name="ck_security_rule_type",
        ),
    )
    op.create_index("idx_security_rules_entity", "security_rules", ["entity_id"])


def downgrade() -> None:
    op.drop_table("security_rules")
    op.drop_table("login_events")
    op.drop_table("announcement_receipts")
    op.drop_table("announcements")
