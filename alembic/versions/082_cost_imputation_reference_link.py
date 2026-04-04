"""link cost imputations to imputation references

Revision ID: 082_cost_imputation_reference_link
Revises: 081_imputation_reference_module
Create Date: 2026-04-04 12:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "082_cost_imputation_reference_link"
down_revision: str | None = "081_imputation_reference_module"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cost_imputations",
        sa.Column("imputation_reference_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "idx_cost_imp_reference",
        "cost_imputations",
        ["imputation_reference_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_cost_imputations_imputation_reference_id",
        "cost_imputations",
        "imputation_references",
        ["imputation_reference_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_cost_imputations_imputation_reference_id",
        "cost_imputations",
        type_="foreignkey",
    )
    op.drop_index("idx_cost_imp_reference", table_name="cost_imputations")
    op.drop_column("cost_imputations", "imputation_reference_id")
