"""MOC — distinct signatures for hierarchy review and final closure.

Revision ID: 141_moc_hierarchy_close_sig
Revises: 140_moc_full_daxium_parity

The form has three separate CDS-style visas: the hierarchy review (row 8 of
the Demande table — often but not always the Chef de Site), the CDS
"Accord de Principe" (row 12, which uses `site_chief_signature`) and the
final closure after execution (not modelled before — we used to reuse
`site_chief_signature` or `process_engineer_signature`). Each needs its
own column so the PDF mirrors the paper form and the closure signer
is captured distinctly in the audit trail.

Backward-compatible: both columns are nullable text.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "141_moc_hierarchy_close_sig"
down_revision = "140_moc_full_daxium_parity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mocs",
        sa.Column(
            "hierarchy_reviewer_signature",
            sa.Text(),
            nullable=True,
            comment="Signature of the hierarchy reviewer (row 8 of the form).",
        ),
    )
    op.add_column(
        "mocs",
        sa.Column(
            "close_signature",
            sa.Text(),
            nullable=True,
            comment=(
                "Signature of the Chef de Site at final MOC closure "
                "(after execution, PID/ESD updated)."
            ),
        ),
    )
    op.add_column(
        "mocs",
        sa.Column(
            "close_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
            comment="User who performed the final closure.",
        ),
    )
    op.add_column(
        "mocs",
        sa.Column(
            "closed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("mocs", "closed_at")
    op.drop_column("mocs", "close_by")
    op.drop_column("mocs", "close_signature")
    op.drop_column("mocs", "hierarchy_reviewer_signature")
