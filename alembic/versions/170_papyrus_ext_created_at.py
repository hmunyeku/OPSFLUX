"""Add missing created_at to papyrus_external_submissions.

PapyrusExternalSubmission herite de TimestampMixin qui declare
`created_at` automatiquement, mais la migration originale n'avait pas
ajoute cette colonne en BDD (`submitted_at` faisait office de timestamp
de creation en pratique). Bug latent : un SELECT * via l'ORM ou un
SELECT avec model.created_at planterait avec UndefinedColumnError.

Backfill : on copie submitted_at vers created_at pour preserver
l'historique des rows existantes.

Revision ID: 170_papyrus_ext_created_at
Revises: 169_ar_pumps_missing_cols
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "170_papyrus_ext_created_at"
down_revision: Union[str, None] = "169_ar_pumps_missing_cols"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("papyrus_external_submissions")}

    if "created_at" not in existing:
        # Ajoute avec server_default pour les nouvelles rows
        op.add_column(
            "papyrus_external_submissions",
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        # Backfill : recopie submitted_at pour ne pas perdre l'historique
        op.execute(
            "UPDATE papyrus_external_submissions "
            "SET created_at = submitted_at WHERE submitted_at IS NOT NULL"
        )


def downgrade() -> None:
    op.drop_column("papyrus_external_submissions", "created_at")
