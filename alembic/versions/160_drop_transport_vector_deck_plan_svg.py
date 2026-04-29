"""Drop the unused deck_plan_svg cache column.

Migration 159 added two complementary columns on transport_vectors :

  * deck_plan_xml  TEXT — Draw.io mxGraph XML (source of truth)
  * deck_plan_svg  TEXT — cached SVG export

The SVG cache was meant to back the cargo placement canvas (faster than
re-rendering the XML). After review the canvas will use Draw.io's
`viewer-static.min.js` to render the XML to inline SVG on demand —
that script is shipped with the Draw.io image, ~150 KB cached after
the first load, and avoids the XML/SVG sync issue + the postMessage
roundtrip needed to capture the SVG on every save.

Drops `deck_plan_svg`. The XML column stays in place. Existing data is
not affected (nothing was ever written to deck_plan_svg yet).
"""

from alembic import op
import sqlalchemy as sa


revision = "160_drop_transport_vector_deck_plan_svg"
down_revision = "159_transport_vector_deck_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("transport_vectors", "deck_plan_svg")


def downgrade() -> None:
    op.add_column(
        "transport_vectors",
        sa.Column("deck_plan_svg", sa.Text(), nullable=True),
    )
