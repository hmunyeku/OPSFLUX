"""add mission visa and allowance followups

Revision ID: 088_add_mission_visa_and_allowance_followups
Revises: 087_pax_incidents_add_pax_group_scope
Create Date: 2026-04-05
"""

from alembic import op


revision = "088_add_mission_visa_and_allowance_followups"
down_revision = "087_pax_incidents_add_pax_group_scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS mission_visa_followups (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            mission_notice_id UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
            preparation_task_id UUID NULL REFERENCES mission_preparation_tasks(id) ON DELETE SET NULL,
            user_id UUID NULL REFERENCES users(id),
            contact_id UUID NULL REFERENCES tier_contacts(id),
            status VARCHAR(30) NOT NULL DEFAULT 'to_initiate',
            visa_type VARCHAR(100),
            country VARCHAR(100),
            submitted_at TIMESTAMPTZ NULL,
            obtained_at TIMESTAMPTZ NULL,
            refused_at TIMESTAMPTZ NULL,
            notes TEXT NULL,
            CONSTRAINT ck_mission_visa_followups_pax_xor
                CHECK (
                    (user_id IS NOT NULL AND contact_id IS NULL) OR
                    (user_id IS NULL AND contact_id IS NOT NULL)
                ),
            CONSTRAINT ck_mission_visa_followups_status
                CHECK (status IN ('to_initiate','submitted','in_review','obtained','refused'))
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_mission_visa_followups_notice ON mission_visa_followups (mission_notice_id, status)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_visa_followup_user ON mission_visa_followups (mission_notice_id, user_id) WHERE user_id IS NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_visa_followup_contact ON mission_visa_followups (mission_notice_id, contact_id) WHERE contact_id IS NOT NULL")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS mission_allowance_requests (
            id UUID PRIMARY KEY,
            created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
            mission_notice_id UUID NOT NULL REFERENCES mission_notices(id) ON DELETE CASCADE,
            preparation_task_id UUID NULL REFERENCES mission_preparation_tasks(id) ON DELETE SET NULL,
            user_id UUID NULL REFERENCES users(id),
            contact_id UUID NULL REFERENCES tier_contacts(id),
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            amount NUMERIC(12,2) NULL,
            currency VARCHAR(10) NULL,
            submitted_at TIMESTAMPTZ NULL,
            approved_at TIMESTAMPTZ NULL,
            paid_at TIMESTAMPTZ NULL,
            payment_reference VARCHAR(100) NULL,
            notes TEXT NULL,
            CONSTRAINT ck_mission_allowance_requests_pax_xor
                CHECK (
                    (user_id IS NOT NULL AND contact_id IS NULL) OR
                    (user_id IS NULL AND contact_id IS NOT NULL)
                ),
            CONSTRAINT ck_mission_allowance_requests_status
                CHECK (status IN ('draft','submitted','approved','paid'))
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_mission_allowance_requests_notice ON mission_allowance_requests (mission_notice_id, status)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_allowance_request_user ON mission_allowance_requests (mission_notice_id, user_id) WHERE user_id IS NOT NULL")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_mission_allowance_request_contact ON mission_allowance_requests (mission_notice_id, contact_id) WHERE contact_id IS NOT NULL")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_mission_allowance_request_contact")
    op.execute("DROP INDEX IF EXISTS uq_mission_allowance_request_user")
    op.execute("DROP INDEX IF EXISTS idx_mission_allowance_requests_notice")
    op.execute("DROP TABLE IF EXISTS mission_allowance_requests")
    op.execute("DROP INDEX IF EXISTS uq_mission_visa_followup_contact")
    op.execute("DROP INDEX IF EXISTS uq_mission_visa_followup_user")
    op.execute("DROP INDEX IF EXISTS idx_mission_visa_followups_notice")
    op.execute("DROP TABLE IF EXISTS mission_visa_followups")
