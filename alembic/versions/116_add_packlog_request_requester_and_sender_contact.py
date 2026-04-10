"""add packlog request requester and sender contact

Revision ID: 116_add_packlog_request_requester_and_sender_contact
Revises: 115_paxlog_ads_round_trip_no_overnight
Create Date: 2026-04-10
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "116_add_packlog_request_requester_and_sender_contact"
down_revision: str | Sequence[str] | None = "115_paxlog_ads_round_trip_no_overnight"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cargo_requests",
        sa.Column("requester_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "cargo_requests",
        sa.Column("sender_contact_tier_contact_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_cargo_requests_requester_user_id_users",
        "cargo_requests",
        "users",
        ["requester_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_cargo_requests_sender_contact_tier_contact_id_tier_contacts",
        "cargo_requests",
        "tier_contacts",
        ["sender_contact_tier_contact_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_cargo_requests_sender_contact_tier_contact_id_tier_contacts",
        "cargo_requests",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_cargo_requests_requester_user_id_users",
        "cargo_requests",
        type_="foreignkey",
    )
    op.drop_column("cargo_requests", "sender_contact_tier_contact_id")
    op.drop_column("cargo_requests", "requester_user_id")
