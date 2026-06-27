"""mto module tables — catalogue/stock SAP, besoins, consolidation, validation

Revision ID: 197_mto_module_tables
Revises: 196_ai_provider_integration_connection

Migration ecrite a la main (alembic --autogenerate echoue sur un FK pre-existant
cost_centers.department_id -> departments hors metadata). Cree les 7 tables du
module MTO. Multi-tenant : entity_id FK entities.id.
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "197_mto_module_tables"
down_revision = "196_ai_provider_integration_connection"
branch_labels = None
depends_on = None


def _id():
    return sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()"))


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    ]


def _soft():
    return [
        sa.Column("archived", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    ]


def _entity():
    return sa.Column("entity_id", UUID(as_uuid=True), sa.ForeignKey("entities.id"), nullable=False)


def upgrade() -> None:
    # 1. catalogue SAP
    op.create_table(
        "mto_sap_catalog_items",
        _id(), *_ts(), *_soft(), _entity(),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("designation", sa.String(500), nullable=False, server_default=""),
        sa.Column("designation_long", sa.Text()),
        sa.Column("unite_base", sa.String(20)),
        sa.Column("groupe", sa.String(100)),
        sa.Column("hier_pdt_desc", sa.String(200)),
        sa.Column("fabricant", sa.String(200)),
        sa.Column("ref_fabricant", sa.String(200)),
        sa.Column("subst_ca", sa.String(50)),
        sa.Column("famille", sa.String(30)),
        sa.Column("diametre", sa.String(50)),
        sa.UniqueConstraint("entity_id", "code", name="uq_mto_catalog_entity_code"),
    )
    op.create_index("idx_mto_catalog_entity", "mto_sap_catalog_items", ["entity_id"])
    op.create_index("idx_mto_catalog_famille", "mto_sap_catalog_items", ["famille"])

    # 2. stock SAP
    op.create_table(
        "mto_sap_inventory",
        _id(), *_ts(), _entity(),
        sa.Column("sap_item_id", UUID(as_uuid=True), sa.ForeignKey("mto_sap_catalog_items.id", ondelete="SET NULL")),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("label", sa.String(50), nullable=False, server_default=""),
        sa.Column("dispo", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cde", sa.Float(), nullable=False, server_default="0"),
        sa.Column("transit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cq", sa.Float(), nullable=False, server_default="0"),
        sa.Column("bloque", sa.Float(), nullable=False, server_default="0"),
        sa.Column("magasin", sa.String(50)),
        sa.Column("emplacement", sa.String(50)),
    )
    op.create_index("idx_mto_inv_entity_code", "mto_sap_inventory", ["entity_id", "code"])
    op.create_index("idx_mto_inv_label", "mto_sap_inventory", ["label"])

    # 3. alias / synonymes
    op.create_table(
        "mto_sap_item_aliases",
        _id(), *_ts(), _entity(),
        sa.Column("source_term", sa.String(200), nullable=False),
        sa.Column("target_term", sa.String(200), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.UniqueConstraint("entity_id", "source_term", name="uq_mto_alias_entity_source"),
    )

    # 4. import batch (rattache a un projet)
    op.create_table(
        "mto_import_batches",
        _id(), *_ts(), *_soft(), _entity(),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("updated_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("filename", sa.String(300)),
        sa.Column("label", sa.String(100)),
        sa.Column("status", sa.String(20), nullable=False, server_default="imported"),
    )
    op.create_index("idx_mto_batch_entity", "mto_import_batches", ["entity_id"])
    op.create_index("idx_mto_batch_project", "mto_import_batches", ["project_id"])

    # 5. lignes MTO brutes
    op.create_table(
        "mto_requirements",
        _id(), *_ts(), _entity(),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("mto_import_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("row", sa.Integer()),
        sa.Column("line_num", sa.String(50)),
        sa.Column("mark", sa.String(100)),
        sa.Column("tag", sa.String(100)),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("diameter", sa.String(50)),
        sa.Column("spec", sa.String(100)),
        sa.Column("code_article", sa.String(50)),
        sa.Column("total_qty", sa.Float(), nullable=False, server_default="0"),
        sa.Column("length", sa.Float(), nullable=False, server_default="0"),
    )
    op.create_index("idx_mto_req_batch", "mto_requirements", ["batch_id"])
    op.create_index("idx_mto_req_entity", "mto_requirements", ["entity_id"])

    # 6. groupes consolides (+ VerifiableMixin pour la validation)
    op.create_table(
        "mto_consolidated_groups",
        _id(), *_ts(), _entity(),
        sa.Column("verification_status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("verified_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.Column("rejection_reason", sa.String(500)),
        sa.Column("batch_id", UUID(as_uuid=True), sa.ForeignKey("mto_import_batches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mto_key", sa.String(500), nullable=False, server_default=""),
        sa.Column("sap_item_id", UUID(as_uuid=True), sa.ForeignKey("mto_sap_catalog_items.id", ondelete="SET NULL")),
        sa.Column("article_code", sa.String(50)),
        sa.Column("designation_sap", sa.String(500)),
        sa.Column("source", sa.String(20)),
        sa.Column("score", sa.Float(), nullable=False, server_default="0"),
        sa.Column("confidence", sa.String(20)),
        sa.Column("found", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("famille", sa.String(30)),
        sa.Column("diameter", sa.String(50)),
        sa.Column("sum_qty", sa.Float(), nullable=False, server_default="0"),
        sa.Column("sum_length", sa.Float(), nullable=False, server_default="0"),
        sa.Column("besoin", sa.Float(), nullable=False, server_default="0"),
        sa.Column("unite", sa.String(20)),
        sa.Column("unit_check", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("unit_detail", sa.String(200)),
        sa.Column("dispo", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cde", sa.Float(), nullable=False, server_default="0"),
        sa.Column("transit", sa.Float(), nullable=False, server_default="0"),
        sa.Column("cq", sa.Float(), nullable=False, server_default="0"),
        sa.Column("bloque", sa.Float(), nullable=False, server_default="0"),
        sa.Column("emplacements", sa.String(200)),
        sa.Column("statut", sa.String(20)),
        sa.Column("nb_lignes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("children", JSONB(), server_default="[]"),
    )
    op.create_index("idx_mto_grp_batch", "mto_consolidated_groups", ["batch_id"])
    op.create_index("idx_mto_grp_entity", "mto_consolidated_groups", ["entity_id"])
    op.create_index("idx_mto_grp_statut", "mto_consolidated_groups", ["statut"])

    # 7. memoire de validation (apprentissage cross-import)
    op.create_table(
        "mto_validation_records",
        _id(), *_ts(), _entity(),
        sa.Column("mto_key", sa.String(500), nullable=False),
        sa.Column("article_code", sa.String(50), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="user"),
        sa.Column("validated_by", UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.UniqueConstraint("entity_id", "mto_key", name="uq_mto_valrec_entity_key"),
    )
    op.create_index("idx_mto_valrec_entity", "mto_validation_records", ["entity_id"])


def downgrade() -> None:
    op.drop_table("mto_validation_records")
    op.drop_table("mto_consolidated_groups")
    op.drop_table("mto_requirements")
    op.drop_table("mto_import_batches")
    op.drop_table("mto_sap_item_aliases")
    op.drop_table("mto_sap_inventory")
    op.drop_table("mto_sap_catalog_items")
