"""MOC — full parity with the Daxium reference form (title, nature, métiers,
external initiator, production mise-en-étude, renvoi + motif à chaque étape,
signatures électroniques en base64, study_conclusion).

Revision ID: 140_moc_full_daxium_parity
Revises: 139_attachment_category

One-shot migration that closes the gap between the v1 OpsFlux MOC module and
the full Perenco / Daxium reference form (rev. 06 / octobre 2025). All
additions are backward-compatible:
  * new columns are nullable (string/text/bool-with-default)
  * no existing column is renamed or dropped
  * CHECK constraint for `nature` only fires when the column is non-NULL

Fields added (see CDC + Daxium export for rationale):
  * Request core extras: title (nom_moc), nature (OPTIMISATION/SECURITE),
    metiers (JSONB array), initiator_email, external_name, external_function.
  * Study phase: study_conclusion (distinct from description).
  * Production mise-en-étude (tab 3 of the Daxium form): validation flag +
    validator + timestamp + comment + signature.
  * Renvoi + motif at each decision point (CDS, Production, DO, DG) and
    per validator row (HSE, Lead, Prod, Gaz, Maintenance, Métier, invités).
  * Electronic signatures — base64 PNG data URLs, stored inline. Signatures
    complete a record but are not authoritative crypto proof; they mirror the
    paper form's ink signature block.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "140_moc_full_daxium_parity"
down_revision = "139_attachment_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Request-core extras ─────────────────────────────────────
    op.add_column("mocs", sa.Column("title", sa.String(length=200), nullable=True,
        comment="Short MOC title (nom_moc) — distinct from objectives."))
    op.add_column("mocs", sa.Column("nature", sa.String(length=20), nullable=True,
        comment="MOC nature: OPTIMISATION or SECURITE."))
    op.add_column("mocs", sa.Column("metiers", JSONB, nullable=True,
        comment="Array of métier codes that will intervene on this MOC."))
    op.add_column("mocs", sa.Column("initiator_email", sa.String(length=200), nullable=True))
    op.add_column("mocs", sa.Column("initiator_external_name", sa.String(length=200), nullable=True,
        comment="Name of an external initiator when they don't have a Perenco account."))
    op.add_column("mocs", sa.Column("initiator_external_function", sa.String(length=200), nullable=True))
    op.add_column("mocs", sa.Column("study_conclusion", sa.Text(), nullable=True,
        comment="Process engineer's final conclusion — distinct from the description."))

    # ── Production mise-en-étude (Daxium tab 3) ─────────────────
    op.add_column("mocs", sa.Column("production_validated", sa.Boolean(), nullable=True))
    op.add_column("mocs", sa.Column(
        "production_validated_by",
        UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True,
    ))
    op.add_column("mocs", sa.Column("production_validated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("mocs", sa.Column("production_comment", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("production_signature", sa.Text(), nullable=True))

    # ── Renvoi (request modifications) at each decision point ───
    op.add_column("mocs", sa.Column("site_chief_return_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mocs", sa.Column("site_chief_return_reason", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("production_return_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mocs", sa.Column("production_return_reason", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("do_return_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mocs", sa.Column("do_return_reason", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("dg_return_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.add_column("mocs", sa.Column("dg_return_reason", sa.Text(), nullable=True))

    # ── Electronic signatures (base64 PNG data URL, stored inline) ──
    op.add_column("mocs", sa.Column("initiator_signature", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("site_chief_signature", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("director_signature", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("process_engineer_signature", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("do_signature", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("dg_signature", sa.Text(), nullable=True))

    op.create_check_constraint(
        "ck_moc_nature",
        "mocs",
        "nature IS NULL OR nature IN ('OPTIMISATION', 'SECURITE')",
    )

    # ── moc_validations — signature + return per validator ──────
    op.add_column("moc_validations", sa.Column("signature", sa.Text(), nullable=True))
    op.add_column("moc_validations", sa.Column(
        "return_requested", sa.Boolean(), server_default=sa.text("false"), nullable=False,
    ))
    op.add_column("moc_validations", sa.Column("return_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("moc_validations", "return_reason")
    op.drop_column("moc_validations", "return_requested")
    op.drop_column("moc_validations", "signature")

    op.drop_constraint("ck_moc_nature", "mocs", type_="check")

    for col in (
        "initiator_signature", "site_chief_signature", "director_signature",
        "process_engineer_signature", "do_signature", "dg_signature",
        "dg_return_reason", "dg_return_requested",
        "do_return_reason", "do_return_requested",
        "production_return_reason", "production_return_requested",
        "site_chief_return_reason", "site_chief_return_requested",
        "production_signature", "production_comment",
        "production_validated_at", "production_validated_by", "production_validated",
        "study_conclusion",
        "initiator_external_function", "initiator_external_name", "initiator_email",
        "metiers", "nature", "title",
    ):
        op.drop_column("mocs", col)
