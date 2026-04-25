"""Add PID/PFD module tables — process diagrams, equipment, DCS tags, library.

Revision ID: 020_add_pid_pfd_module
Revises: 019_add_report_editor_module
Create Date: 2026-03-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "020_add_pid_pfd_module"
down_revision: Union[str, None] = "019_add_report_editor_module"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. pid_documents (created first — many tables reference it) ──────
    op.create_table(
        "pid_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("document_id", UUID(as_uuid=True), nullable=True),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("bu_id", UUID(as_uuid=True), nullable=True),
        sa.Column("number", sa.String(100), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("pid_type", sa.String(30), nullable=False),
        sa.Column("xml_content", sa.Text, nullable=True),
        sa.Column("revision", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ifd"),
        sa.Column("sheet_format", sa.String(5), nullable=True),
        sa.Column("scale", sa.String(20), nullable=True),
        sa.Column("drawing_number", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entity_id", "number", name="uq_pid_documents_entity_number"),
        sa.CheckConstraint(
            "pid_type IN ('process','utility','instrumentation','electrical',"
            "'demolition','modification','as_built')",
            name="ck_pid_documents_pid_type",
        ),
        sa.CheckConstraint(
            "status IN ('ifc','ifd','afc','as_built','obsolete','superseded')",
            name="ck_pid_documents_status",
        ),
        sa.CheckConstraint(
            "sheet_format IS NULL OR sheet_format IN ('A0','A1','A2','A3')",
            name="ck_pid_documents_sheet_format",
        ),
    )
    op.create_index("idx_pid_documents_project_status", "pid_documents", ["project_id", "status"])
    op.create_index("idx_pid_documents_entity", "pid_documents", ["entity_id"])

    # ── 2. pid_revisions ─────────────────────────────────────────────────
    op.create_table(
        "pid_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "pid_document_id", UUID(as_uuid=True),
            sa.ForeignKey("pid_documents.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("revision_code", sa.String(20), nullable=False),
        sa.Column("xml_content", sa.Text, nullable=False),
        sa.Column("change_description", sa.Text, nullable=True),
        sa.Column("change_type", sa.String(20), nullable=False, server_default="initial"),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "change_type IN ('initial','modification','demolition','as_built','correction')",
            name="ck_pid_revisions_change_type",
        ),
    )
    op.create_index("idx_pid_revisions_document", "pid_revisions", ["pid_document_id"])

    # ── 3. equipment (created before dcs_tags which references it) ───────
    op.create_table(
        "equipment",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("pid_document_id", UUID(as_uuid=True), sa.ForeignKey("pid_documents.id"), nullable=True),
        sa.Column("asset_id", UUID(as_uuid=True), sa.ForeignKey("assets.id"), nullable=True),
        sa.Column("tag", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("equipment_type", sa.String(30), nullable=False),
        sa.Column("service", sa.String(200), nullable=True),
        sa.Column("fluid", sa.String(100), nullable=True),
        sa.Column("fluid_phase", sa.String(10), nullable=True),
        sa.Column("design_pressure_barg", sa.Numeric, nullable=True),
        sa.Column("design_temperature_c", sa.Numeric, nullable=True),
        sa.Column("operating_pressure_barg", sa.Numeric, nullable=True),
        sa.Column("operating_temperature_c", sa.Numeric, nullable=True),
        sa.Column("material_of_construction", sa.String(100), nullable=True),
        sa.Column("capacity_value", sa.Numeric, nullable=True),
        sa.Column("capacity_unit", sa.String(30), nullable=True),
        sa.Column("lat", sa.Numeric(10, 7), nullable=True),
        sa.Column("lng", sa.Numeric(10, 7), nullable=True),
        sa.Column("mxgraph_cell_id", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("removed_from_pid", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entity_id", "project_id", "tag", name="uq_equipment_entity_project_tag"),
        sa.CheckConstraint(
            "equipment_type IN ('vessel','pump','compressor','heat_exchanger','valve',"
            "'filter','separator','column','tank','instrument','motor','generator','other')",
            name="ck_equipment_type",
        ),
        sa.CheckConstraint(
            "fluid_phase IS NULL OR fluid_phase IN ('liquid','gas','mixed','steam')",
            name="ck_equipment_fluid_phase",
        ),
    )
    op.create_index("idx_equipment_entity_tag", "equipment", ["entity_id", "tag"])
    op.create_index("idx_equipment_pid_document", "equipment", ["pid_document_id"])
    op.execute(
        "CREATE INDEX idx_equipment_asset ON equipment (asset_id) WHERE asset_id IS NOT NULL"
    )

    # ── 4. process_lines ─────────────────────────────────────────────────
    op.create_table(
        "process_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("line_number", sa.String(100), nullable=False),
        sa.Column("nominal_diameter_inch", sa.Numeric, nullable=True),
        sa.Column("nominal_diameter_mm", sa.Integer, nullable=True),
        sa.Column("pipe_schedule", sa.String(30), nullable=True),
        sa.Column("spec_class", sa.String(50), nullable=True),
        sa.Column("spec_code", sa.String(50), nullable=True),
        sa.Column("fluid", sa.String(100), nullable=True),
        sa.Column("fluid_full_name", sa.String(200), nullable=True),
        sa.Column("insulation_type", sa.String(20), nullable=True),
        sa.Column("insulation_thickness_mm", sa.Numeric, nullable=True),
        sa.Column("heat_tracing", sa.Boolean, nullable=True),
        sa.Column("heat_tracing_type", sa.String(10), nullable=True),
        sa.Column("design_pressure_barg", sa.Numeric, nullable=True),
        sa.Column("design_temperature_c", sa.Numeric, nullable=True),
        sa.Column("material_of_construction", sa.String(100), nullable=True),
        sa.Column("length_m", sa.Numeric, nullable=True),
        sa.Column("mxgraph_cell_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entity_id", "project_id", "line_number", name="uq_process_lines_entity_project_line"),
        sa.CheckConstraint(
            "insulation_type IS NULL OR insulation_type IN ('none','thermal','acoustic','fire_proofing')",
            name="ck_process_lines_insulation_type",
        ),
        sa.CheckConstraint(
            "heat_tracing_type IS NULL OR heat_tracing_type IN ('electric','steam','none')",
            name="ck_process_lines_heat_tracing_type",
        ),
    )
    op.create_index("idx_process_lines_entity", "process_lines", ["entity_id"])

    # ── 5. pid_connections ───────────────────────────────────────────────
    op.create_table(
        "pid_connections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column(
            "pid_document_id", UUID(as_uuid=True),
            sa.ForeignKey("pid_documents.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("from_entity_type", sa.String(30), nullable=False),
        sa.Column("from_entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("from_connection_point", sa.String(50), nullable=True),
        sa.Column("to_entity_type", sa.String(30), nullable=False),
        sa.Column("to_entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("to_connection_point", sa.String(50), nullable=True),
        sa.Column("connection_type", sa.String(20), nullable=False, server_default="process"),
        sa.Column("continuation_ref", sa.String(100), nullable=True),
        sa.Column("flow_direction", sa.String(20), nullable=False, server_default="forward"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "connection_type IN ('process','instrument','utility','drain','vent')",
            name="ck_pid_connections_type",
        ),
        sa.CheckConstraint(
            "flow_direction IN ('forward','reverse','bidirectional')",
            name="ck_pid_connections_flow_direction",
        ),
    )
    op.create_index("idx_pid_connections_from", "pid_connections", ["entity_id", "from_entity_type", "from_entity_id"])
    op.create_index("idx_pid_connections_document", "pid_connections", ["pid_document_id"])

    # ── 6. dcs_tags (after equipment — references equipment.id) ──────────
    op.create_table(
        "dcs_tags",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("tag_name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("tag_type", sa.String(10), nullable=False),
        sa.Column("area", sa.String(50), nullable=True),
        sa.Column("equipment_id", UUID(as_uuid=True), sa.ForeignKey("equipment.id"), nullable=True),
        sa.Column("pid_document_id", UUID(as_uuid=True), sa.ForeignKey("pid_documents.id"), nullable=True),
        sa.Column("dcs_address", sa.String(100), nullable=True),
        sa.Column("range_min", sa.Numeric, nullable=True),
        sa.Column("range_max", sa.Numeric, nullable=True),
        sa.Column("engineering_unit", sa.String(30), nullable=True),
        sa.Column("alarm_lo", sa.Numeric, nullable=True),
        sa.Column("alarm_hi", sa.Numeric, nullable=True),
        sa.Column("trip_lo", sa.Numeric, nullable=True),
        sa.Column("trip_hi", sa.Numeric, nullable=True),
        sa.Column("source", sa.String(10), nullable=False, server_default="manual"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("entity_id", "project_id", "tag_name", name="uq_dcs_tags_entity_project_tag"),
        sa.CheckConstraint(
            "tag_type IN ('PT','TT','FT','LT','PDT','AT','XV','FV','LV','PV','HS','ZT','other')",
            name="ck_dcs_tags_tag_type",
        ),
        sa.CheckConstraint(
            "source IN ('csv','manual','suggested')",
            name="ck_dcs_tags_source",
        ),
    )
    op.create_index("idx_dcs_tags_entity_type_area", "dcs_tags", ["entity_id", "tag_type", "area"])
    op.execute(
        "CREATE INDEX idx_dcs_tags_equipment ON dcs_tags (equipment_id) WHERE equipment_id IS NOT NULL"
    )
    op.create_index("idx_dcs_tags_pid_document", "dcs_tags", ["pid_document_id"])

    # ── 7. tag_naming_rules ──────────────────────────────────────────────
    op.create_table(
        "tag_naming_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("pattern", sa.Text, nullable=False),
        sa.Column("segments", JSONB, nullable=False),
        sa.Column("separator", sa.String(5), nullable=True),
        sa.Column("applies_to_types", JSONB, nullable=False, server_default="[]"),
        sa.Column("is_default", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_tag_naming_rules_entity", "tag_naming_rules", ["entity_id"])

    # ── 8. process_lib_items ─────────────────────────────────────────────
    op.create_table(
        "process_lib_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("subcategory", sa.String(50), nullable=True),
        sa.Column("svg_template", sa.Text, nullable=True),
        sa.Column("mxgraph_style", sa.Text, nullable=True),
        sa.Column("properties_schema", JSONB, nullable=True),
        sa.Column("connection_points", JSONB, nullable=True),
        sa.Column("equipment_type_mapping", sa.String(30), nullable=True),
        sa.Column("autocad_block_name", sa.String(100), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default=sa.text("1")),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("is_predefined", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint(
            "category IN ('vessel','pump','compressor','valve','heat_exchanger',"
            "'separator','instrument','line','fitting','other')",
            name="ck_process_lib_items_category",
        ),
    )
    op.create_index("idx_process_lib_items_entity_category", "process_lib_items", ["entity_id", "category", "is_active"])

    # ── 9. pid_locks ─────────────────────────────────────────────────────
    op.create_table(
        "pid_locks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "pid_document_id", UUID(as_uuid=True),
            sa.ForeignKey("pid_documents.id", ondelete="CASCADE"), nullable=False, unique=True,
        ),
        sa.Column("locked_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("pid_document_id", name="uq_pid_locks_document"),
    )


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("pid_locks")
    op.drop_table("process_lib_items")
    op.drop_table("tag_naming_rules")
    op.drop_table("dcs_tags")
    op.drop_table("pid_connections")
    op.drop_table("process_lines")
    op.drop_table("equipment")
    op.drop_table("pid_revisions")
    op.drop_table("pid_documents")
