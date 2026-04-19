"""MOC — DO/DG execution accords + process_engineer role + metier_name + site assignments.

Revision ID: 136_moc_exec_accord_process_engineer
Revises: 135_moc_fix_soft_delete

Adds the missing pieces from the Perenco paper MOC form (page 5):
* "Réalisation du MOC" table — DO + DG must each give Accord/Refus
  before execution can start. Modelled as 4 columns on `mocs` for a
  cheap and explicit look-up.
* Process Engineer as a validation matrix role (the paper form lists
  him in the parallel validation matrix, distinct from his earlier
  "responsable MOC" role at the study phase).
* A free-text `metier_name` on moc_validations so admins can tag
  entries like "Électricité", "Instrumentation", "Piping" without
  a rigid metier_code vocabulary (CDC §5 "Métiers — Maintenance…").
* A new `moc_site_assignments` table so chef-de-site / director-of-zone
  notifications can be filtered to the right people per site, instead
  of blasting everyone with `moc.site_chief.approve` on the entity.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "136_moc_exec_accord_process_engineer"
down_revision = "135_moc_fix_soft_delete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── mocs: DO/DG execution accords ────────────────────────────────
    op.add_column("mocs", sa.Column("do_execution_accord", sa.Boolean(), nullable=True))
    op.add_column("mocs", sa.Column("dg_execution_accord", sa.Boolean(), nullable=True))
    op.add_column(
        "mocs",
        sa.Column("do_execution_accord_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "mocs",
        sa.Column("dg_execution_accord_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "mocs",
        sa.Column("do_execution_accord_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column(
        "mocs",
        sa.Column("dg_execution_accord_by", UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=True),
    )
    op.add_column("mocs", sa.Column("do_execution_comment", sa.Text(), nullable=True))
    op.add_column("mocs", sa.Column("dg_execution_comment", sa.Text(), nullable=True))

    # ── moc_validations: add process_engineer role + free-text metier_name ──
    op.drop_constraint("ck_moc_validation_role", "moc_validations", type_="check")
    op.create_check_constraint(
        "ck_moc_validation_role",
        "moc_validations",
        "role IN ('hse','lead_process','production_manager','gas_manager',"
        "'maintenance_manager','metier','process_engineer')",
    )
    op.add_column(
        "moc_validations",
        sa.Column("metier_name", sa.String(length=120), nullable=True),
    )

    # ── moc_site_assignments: per-site person directory ─────────────
    op.create_table(
        "moc_site_assignments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("site_label", sa.String(length=100), nullable=False),
        sa.Column(
            "role",
            sa.String(length=30),
            nullable=False,
            comment="site_chief | director | lead_process | hse | …",
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("active", sa.Boolean(), server_default="true", nullable=False),
        sa.CheckConstraint(
            "role IN ('site_chief','director','lead_process','hse',"
            "'production_manager','gas_manager','maintenance_manager')",
            name="ck_moc_site_assignment_role",
        ),
        sa.UniqueConstraint(
            "entity_id", "site_label", "role", "user_id",
            name="uq_moc_site_assignment",
        ),
    )
    op.create_index(
        "idx_moc_site_assignments_entity_site",
        "moc_site_assignments",
        ["entity_id", "site_label"],
    )


def downgrade() -> None:
    op.drop_index("idx_moc_site_assignments_entity_site", table_name="moc_site_assignments")
    op.drop_table("moc_site_assignments")
    op.drop_column("moc_validations", "metier_name")
    op.drop_constraint("ck_moc_validation_role", "moc_validations", type_="check")
    op.create_check_constraint(
        "ck_moc_validation_role",
        "moc_validations",
        "role IN ('hse','lead_process','production_manager','gas_manager',"
        "'maintenance_manager','metier')",
    )
    for col in (
        "dg_execution_comment", "do_execution_comment",
        "dg_execution_accord_by", "do_execution_accord_by",
        "dg_execution_accord_at", "do_execution_accord_at",
        "dg_execution_accord", "do_execution_accord",
    ):
        op.drop_column("mocs", col)
