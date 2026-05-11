"""Add per-stop PAX/cargo flow + departure timing to voyage_stops.

Bastien (PO) wanted to model a real multi-stop voyage A→B→C→D→E where
each stop can have PAX boarding/disembarking and cargo being loaded/
unloaded. Previously, a VoyageStop only carried an asset_id +
stop_order + scheduled_arrival — there was no way to express "à B, 3
PAX descendent et 2 nouveaux montent". Voyage-level totals existed
(in trip_kpis after closure) but nothing per-stop.

New columns on ``voyage_stops``:

  * scheduled_departure (TIMESTAMPTZ, nullable)
  * actual_departure   (TIMESTAMPTZ, nullable)
        Quand le vecteur quitte cette étape. NULL = pas d'escale
        modélisée — l'arrivée à la prochaine étape part directement de
        l'arrivée à celle-ci.

  * pax_boarded_count       (INTEGER NOT NULL DEFAULT 0)
  * pax_disembarked_count   (INTEGER NOT NULL DEFAULT 0)
        Nombre de PAX qui montent / descendent À CETTE étape.
        L'occupation cumulée du vecteur en transit après l'étape N
        vaut Σ(boarded[1..N]) − Σ(disembarked[1..N]).

  * cargo_loaded_kg   (DOUBLE PRECISION NOT NULL DEFAULT 0)
  * cargo_unloaded_kg (DOUBLE PRECISION NOT NULL DEFAULT 0)
        Cargo chargé / déchargé à cette étape (en kg). Même logique
        cumulative que les PAX.

  * notes (TEXT, nullable)
        Notes libres pour l'étape (raison du long stop, contact local,
        instruction du capitaine, etc.).

Toutes les colonnes sont initialisées à 0 / NULL pour les lignes
existantes — comportement inchangé pour les voyages déjà saisis avant
cette migration. La migration est entièrement réversible.
"""

from alembic import op
import sqlalchemy as sa


revision = "160_voyage_stop_pax_cargo_flow"
down_revision = "159_transport_vector_deck_plan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "voyage_stops",
        sa.Column("scheduled_departure", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "voyage_stops",
        sa.Column("actual_departure", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "voyage_stops",
        sa.Column(
            "pax_boarded_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "voyage_stops",
        sa.Column(
            "pax_disembarked_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "voyage_stops",
        sa.Column(
            "cargo_loaded_kg",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "voyage_stops",
        sa.Column(
            "cargo_unloaded_kg",
            sa.Float(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "voyage_stops",
        sa.Column("notes", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("voyage_stops", "notes")
    op.drop_column("voyage_stops", "cargo_unloaded_kg")
    op.drop_column("voyage_stops", "cargo_loaded_kg")
    op.drop_column("voyage_stops", "pax_disembarked_count")
    op.drop_column("voyage_stops", "pax_boarded_count")
    op.drop_column("voyage_stops", "actual_departure")
    op.drop_column("voyage_stops", "scheduled_departure")
