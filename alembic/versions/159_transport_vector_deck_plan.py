"""Add deck plan storage to transport_vectors.

Each TravelWiz vector (vessel, helicopter, barge, etc.) gets a Draw.io-
authored floor plan that backs the visual cargo placement canvas. Three
columns carry the plan:

  * deck_plan_xml (TEXT, nullable)
        Raw mxGraph XML produced by the embedded Draw.io editor — kept
        so the admin can re-edit the plan later. Same format already
        used by the PID/PFD module.

  * deck_plan_svg (TEXT, nullable)
        SVG export of the same plan. Cached so the deck-layout canvas
        on the voyage page can render the background without round-
        tripping through the Draw.io iframe every time.

  * deck_plan_updated_at (TIMESTAMPTZ, nullable)
  * deck_plan_updated_by (UUID, nullable, FK users.id)
        Who/when last edited the plan, used for the audit chip in the
        editor header.

All four columns are NULL by default — the deck-layout canvas falls
back to a plain rectangle (length_m × width_m of the vector zone) when
no plan is set, so behaviour is preserved for existing data.
"""

from alembic import op
import sqlalchemy as sa


revision = "159_transport_vector_deck_plan"
down_revision = "158_planner_conflict_audit_action_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "transport_vectors",
        sa.Column("deck_plan_xml", sa.Text(), nullable=True),
    )
    op.add_column(
        "transport_vectors",
        sa.Column("deck_plan_svg", sa.Text(), nullable=True),
    )
    op.add_column(
        "transport_vectors",
        sa.Column("deck_plan_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "transport_vectors",
        sa.Column(
            "deck_plan_updated_by",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("transport_vectors", "deck_plan_updated_by")
    op.drop_column("transport_vectors", "deck_plan_updated_at")
    op.drop_column("transport_vectors", "deck_plan_svg")
    op.drop_column("transport_vectors", "deck_plan_xml")
