"""Add columns introduced during technical debt audit session.

- assets.status (operational, maintenance, retired, etc.)
- process_lines.is_active (soft delete support)
- mission_notices.pax_quota (capacity validation)

Revision ID: 034
Create Date: 2026-03-20
"""
from alembic import op
import sqlalchemy as sa

revision = "034"
down_revision = "033"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # -- assets.status --
    op.add_column(
        "assets",
        sa.Column(
            "status",
            sa.String(30),
            nullable=False,
            server_default="operational",
        ),
    )

    # -- process_lines.is_active --
    op.add_column(
        "process_lines",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )

    # -- mission_notices.pax_quota --
    op.add_column(
        "mission_notices",
        sa.Column(
            "pax_quota",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )

    # -- project_task_dependencies table --
    op.create_table(
        "project_task_dependencies",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("from_task_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_task_id", sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("project_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dependency_type", sa.String(30), nullable=False, server_default="finish_to_start"),
        sa.Column("lag_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_ptd_from_task", "project_task_dependencies", ["from_task_id"])
    op.create_index("ix_ptd_to_task", "project_task_dependencies", ["to_task_id"])

    # -- Update PID check constraints to match new enum values --
    # pid_documents.status
    op.execute("ALTER TABLE pid_documents DROP CONSTRAINT IF EXISTS ck_pid_documents_status")
    op.execute("""
        ALTER TABLE pid_documents ADD CONSTRAINT ck_pid_documents_status
        CHECK (status IN ('draft','in_review','ifd','afc','approved','issued','as_built','obsolete','superseded','cancelled'))
    """)

    # pid_documents.pid_type
    op.execute("ALTER TABLE pid_documents DROP CONSTRAINT IF EXISTS ck_pid_documents_pid_type")
    op.execute("""
        ALTER TABLE pid_documents ADD CONSTRAINT ck_pid_documents_pid_type
        CHECK (pid_type IN ('pid','pfd','uid','ufd','cause_effect','sld','layout','tie_in'))
    """)

    # equipment.equipment_type
    op.execute("ALTER TABLE equipment DROP CONSTRAINT IF EXISTS ck_equipment_equipment_type")
    op.execute("""
        ALTER TABLE equipment ADD CONSTRAINT ck_equipment_equipment_type
        CHECK (equipment_type IN (
            'vessel','heat_exchanger','pump','compressor','turbine','column','reactor',
            'tank','filter','valve','instrument','mixer','dryer','boiler','furnace',
            'conveyor','centrifuge','ejector','flare','separator','pig_launcher',
            'pig_receiver','manifold','wellhead','christmas_tree','choke',
            'safety_valve','control_valve','motor','generator','other'
        ))
    """)

    # dcs_tags.tag_type - expand to all ISA types
    op.execute("ALTER TABLE dcs_tags DROP CONSTRAINT IF EXISTS ck_dcs_tags_tag_type")
    op.execute("""
        ALTER TABLE dcs_tags ADD CONSTRAINT ck_dcs_tags_tag_type
        CHECK (tag_type IN (
            'AI','AO','DI','DO','PI','TI','FI','LI','WI','SI','ZI','NI','MI','XI','YI',
            'PIC','TIC','FIC','LIC','WIC','SIC','AIC',
            'PCV','TCV','FCV','LCV',
            'PAH','PAL','PAHH','PALL','TAH','TAL','TAHH','TALL',
            'FAH','FAL','FAHH','FALL','LAH','LAL','LAHH','LALL',
            'PSV','TSE','FSE','LSE',
            'PT','TT','FT','LT','PDT','AT','XV','FV','LV','PV','HS','ZT',
            'other'
        ))
    """)

    # process_lines.insulation_type
    op.execute("ALTER TABLE process_lines DROP CONSTRAINT IF EXISTS ck_process_lines_insulation_type")
    op.execute("""
        ALTER TABLE process_lines ADD CONSTRAINT ck_process_lines_insulation_type
        CHECK (insulation_type IN ('none','hot','cold','acoustic','personnel_protection','anti_condensation'))
    """)

    # process_lines.heat_tracing_type
    op.execute("ALTER TABLE process_lines DROP CONSTRAINT IF EXISTS ck_process_lines_heat_tracing_type")
    op.execute("""
        ALTER TABLE process_lines ADD CONSTRAINT ck_process_lines_heat_tracing_type
        CHECK (heat_tracing_type IN ('electric','steam','hot_water','glycol'))
    """)

    # pid_revisions.change_type
    op.execute("ALTER TABLE pid_revisions DROP CONSTRAINT IF EXISTS ck_pid_revisions_change_type")
    op.execute("""
        ALTER TABLE pid_revisions ADD CONSTRAINT ck_pid_revisions_change_type
        CHECK (change_type IN ('creation','modification','correction','addition','deletion','reissue'))
    """)

    # Widen columns that were too short
    op.alter_column("equipment", "fluid_phase", type_=sa.String(20), existing_type=sa.String(10))
    op.alter_column("dcs_tags", "tag_type", type_=sa.String(20), existing_type=sa.String(10))
    op.alter_column("process_lines", "insulation_type", type_=sa.String(30), existing_type=sa.String(20))
    op.alter_column("process_lines", "heat_tracing_type", type_=sa.String(20), existing_type=sa.String(10))


def downgrade() -> None:
    op.drop_column("assets", "status")
    op.drop_column("process_lines", "is_active")
    op.drop_column("mission_notices", "pax_quota")
    op.drop_table("project_task_dependencies")
