"""add travelwiz tables

Revision ID: 20250103_000000
Revises:
Create Date: 2025-01-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250103_000000'
down_revision = '20251102_tiers'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enum types
    op.execute("""
        CREATE TYPE packagingtypeenum AS ENUM (
            'Conteneur', 'Porte-futs', 'Skid', 'Rack gaz', 'Tool box',
            'Panier', 'Caisson', 'Porte-cuves', 'Bac déchet'
        );
    """)

    op.execute("""
        CREATE TYPE destinationtypeenum AS ENUM (
            'Massongo', 'La Lobe', 'Wouri', 'RDR', 'Hili', 'ADN 130'
        );
    """)

    op.execute("""
        CREATE TYPE vesseltypeenum AS ENUM (
            'Bourbon Liberty 234', 'Skoul Gwen', 'Coastal Fighter',
            'SURFER', 'VEDETE', 'Wouri'
        );
    """)

    op.execute("""
        CREATE TYPE sourcetypeenum AS ENUM (
            'Magasin', 'Yard', 'Prestataire externe'
        );
    """)

    op.execute("""
        CREATE TYPE manifeststatusenum AS ENUM (
            'Brouillon', 'En attente validation', 'Validé', 'Signé capitaine',
            'Chargé', 'En transit', 'Arrivé', 'Déchargé', 'Dispatché',
            'Livré', 'Annulé'
        );
    """)

    op.execute("""
        CREATE TYPE backcargotypeenum AS ENUM (
            'Déchets DIS', 'Déchets DIB', 'Déchets DMET',
            'Matériel sous-traitant', 'Réintégration stock',
            'À rebuter', 'À ferrailler', 'Stockage Yard'
        );
    """)

    op.execute("""
        CREATE TYPE validationstatusenum AS ENUM (
            'En attente', 'Validé', 'Refusé'
        );
    """)

    op.execute("""
        CREATE TYPE discrepancytypeenum AS ENUM (
            'Colis manquant', 'Colis endommagé', 'Colis non manifesté',
            'Écart de poids', 'Marquage incorrect', 'Document manquant',
            'Élingage défectueux'
        );
    """)

    op.execute("""
        CREATE TYPE vesselarrivalstatusenum AS ENUM (
            'Attendu', 'En approche', 'Amarré', 'En cours inspection',
            'Inspecté', 'Déchargé', 'Dispatché', 'Parti'
        );
    """)

    op.execute("""
        CREATE TYPE yarddispatchstatusenum AS ENUM (
            'En attente réception', 'Réceptionné', 'Vérifié', 'Notifié',
            'En attente retrait', 'Retiré', 'Dispatché', 'En anomalie'
        );
    """)

    op.execute("""
        CREATE TYPE severityenum AS ENUM (
            'Basse', 'Moyenne', 'Haute', 'Critique'
        );
    """)

    op.execute("""
        CREATE TYPE destinationareaenum AS ENUM (
            'Magasin', 'Zone déchets', 'Zone ferraille', 'Yard', 'Sous-traitant'
        );
    """)

    # Create loading_manifests table
    op.create_table(
        'travelwiz_loading_manifests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('manifest_number', sa.String(length=50), nullable=False),
        sa.Column('status', postgresql.ENUM(name='manifeststatusenum', create_type=False), nullable=False),
        sa.Column('pickup_location', sa.String(length=200), nullable=False),
        sa.Column('availability_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('requested_delivery_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('vessel', postgresql.ENUM(name='vesseltypeenum', create_type=False), nullable=False),
        sa.Column('destination', postgresql.ENUM(name='destinationtypeenum', create_type=False), nullable=False),
        sa.Column('destination_code', sa.String(length=50), nullable=False),
        sa.Column('service', sa.String(length=200), nullable=False),
        sa.Column('recipient_name', sa.String(length=200), nullable=False),
        sa.Column('recipient_contact', sa.String(length=200), nullable=True),
        sa.Column('source', postgresql.ENUM(name='sourcetypeenum', create_type=False), nullable=False),
        sa.Column('external_provider', sa.String(length=200), nullable=True),
        sa.Column('total_weight', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_packages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('emitter_service', sa.String(length=200), nullable=False),
        sa.Column('emitter_name', sa.String(length=200), nullable=False),
        sa.Column('emitter_contact', sa.String(length=200), nullable=True),
        sa.Column('emitter_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('emitter_signature', sa.String(length=500), nullable=True),
        sa.Column('loading_validation', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('vessel_validation', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('unloading_validation', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('loading_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('departure_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('arrival_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('unloading_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('distribution_list', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('notes', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('manifest_number')
    )
    op.create_index('ix_travelwiz_loading_manifests_manifest_number', 'travelwiz_loading_manifests', ['manifest_number'])

    # Create back_cargo_manifests table
    op.create_table(
        'travelwiz_back_cargo_manifests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('back_cargo_number', sa.String(length=50), nullable=False),
        sa.Column('type', postgresql.ENUM(name='backcargotypeenum', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM(name='manifeststatusenum', create_type=False), nullable=False),
        sa.Column('origin_site', postgresql.ENUM(name='destinationtypeenum', create_type=False), nullable=False),
        sa.Column('origin_rig', sa.String(length=100), nullable=True),
        sa.Column('vessel', postgresql.ENUM(name='vesseltypeenum', create_type=False), nullable=False),
        sa.Column('arrival_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('total_weight', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total_packages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('company_man', sa.String(length=200), nullable=True),
        sa.Column('company_man_signature', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('omaa_delegate', sa.String(length=200), nullable=True),
        sa.Column('omaa_delegate_signature', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('captain_signature', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('subcontractor_name', sa.String(length=200), nullable=True),
        sa.Column('subcontractor_signature', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('yard_officer_signature', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('compliance_rules', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('has_inventory', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_exit_pass', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('marked_bins', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_scrap_mention', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('has_yard_storage_mention', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('destination_service', sa.String(length=200), nullable=True),
        sa.Column('destination_area', postgresql.ENUM(name='destinationareaenum', create_type=False), nullable=True),
        sa.Column('storage_reason', sa.String(length=1000), nullable=True),
        sa.Column('discrepancies', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('discrepancy_photos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('pending_approval', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('approval_reason', sa.String(length=1000), nullable=True),
        sa.Column('yard_reception_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('yard_reception_by', sa.String(length=200), nullable=True),
        sa.Column('yard_location', sa.String(length=200), nullable=True),
        sa.Column('notes', sa.String(length=2000), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('back_cargo_number')
    )
    op.create_index('ix_travelwiz_back_cargo_manifests_back_cargo_number', 'travelwiz_back_cargo_manifests', ['back_cargo_number'])

    # Create cargo_items table
    op.create_table(
        'travelwiz_cargo_items',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('item_number', sa.String(length=50), nullable=False),
        sa.Column('packaging', postgresql.ENUM(name='packagingtypeenum', create_type=False), nullable=False),
        sa.Column('packaging_number', sa.String(length=50), nullable=True),
        sa.Column('quantity', sa.Integer(), nullable=False),
        sa.Column('designation', sa.String(length=500), nullable=False),
        sa.Column('weight', sa.Float(), nullable=False),
        sa.Column('observations', sa.String(length=1000), nullable=True),
        sa.Column('cargo_win_number', sa.String(length=50), nullable=True),
        sa.Column('cargo_nature', sa.String(length=200), nullable=True),
        sa.Column('sap_code', sa.String(length=50), nullable=True),
        sa.Column('sender', sa.String(length=200), nullable=True),
        sa.Column('recipient', sa.String(length=200), nullable=True),
        sa.Column('cargo_owner', sa.String(length=200), nullable=True),
        sa.Column('slip_number', sa.String(length=50), nullable=True),
        sa.Column('cost_imputation', sa.String(length=200), nullable=True),
        sa.Column('picture_urls', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('qr_code', sa.String(length=500), nullable=True),
        sa.Column('label_printed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('scanned_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('loading_manifest_id', sa.UUID(), nullable=True),
        sa.Column('back_cargo_manifest_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(['loading_manifest_id'], ['travelwiz_loading_manifests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['back_cargo_manifest_id'], ['travelwiz_back_cargo_manifests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create vessel_arrivals table
    op.create_table(
        'travelwiz_vessel_arrivals',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('vessel', postgresql.ENUM(name='vesseltypeenum', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM(name='vesselarrivalstatusenum', create_type=False), nullable=False),
        sa.Column('eta', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ata', sa.DateTime(timezone=True), nullable=True),
        sa.Column('etd', sa.DateTime(timezone=True), nullable=True),
        sa.Column('atd', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expected_manifests', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('received_manifests', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expected_packages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('received_packages', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expected_weight', sa.Float(), nullable=False, server_default='0'),
        sa.Column('received_weight', sa.Float(), nullable=False, server_default='0'),
        sa.Column('physical_check_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('slips_recovered', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('weights_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('riggings_verified', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('manifest_compared', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('inspector_name', sa.String(length=200), nullable=True),
        sa.Column('inspection_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('inspection_notes', sa.String(length=2000), nullable=True),
        sa.Column('unloading_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('unloading_notes', sa.String(length=2000), nullable=True),
        sa.Column('report_generated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('report_url', sa.String(length=500), nullable=True),
        sa.Column('report_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('report_recipients', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # Create unloading_discrepancies table
    op.create_table(
        'travelwiz_unloading_discrepancies',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('type', postgresql.ENUM(name='discrepancytypeenum', create_type=False), nullable=False),
        sa.Column('manifest_id', sa.String(length=50), nullable=True),
        sa.Column('package_number', sa.String(length=50), nullable=True),
        sa.Column('description', sa.String(length=2000), nullable=False),
        sa.Column('expected_value', sa.String(length=200), nullable=True),
        sa.Column('actual_value', sa.String(length=200), nullable=True),
        sa.Column('severity', postgresql.ENUM(name='severityenum', create_type=False), nullable=False),
        sa.Column('photos', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('detected_by', sa.String(length=200), nullable=False),
        sa.Column('detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('resolved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('resolution_note', sa.String(length=2000), nullable=True),
        sa.Column('resolution_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('vessel_arrival_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(['vessel_arrival_id'], ['travelwiz_vessel_arrivals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create yard_dispatches table
    op.create_table(
        'travelwiz_yard_dispatches',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('status', postgresql.ENUM(name='yarddispatchstatusenum', create_type=False), nullable=False),
        sa.Column('back_cargo_id', sa.UUID(), nullable=False),
        sa.Column('reception_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('yard_officer', sa.String(length=200), nullable=True),
        sa.Column('verification_completed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verification_notes', sa.String(length=2000), nullable=True),
        sa.Column('verification_anomalies', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('is_compliant', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('notification_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('notification_method', sa.String(length=50), nullable=True),
        sa.Column('notification_message', sa.String(length=2000), nullable=True),
        sa.Column('notification_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('exit_pass_number', sa.String(length=50), nullable=True),
        sa.Column('exit_pass_generated', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('exit_pass_url', sa.String(length=500), nullable=True),
        sa.Column('blue_copy_sent', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('dispatch_location', sa.String(length=200), nullable=True),
        sa.Column('dispatch_zone', sa.String(length=200), nullable=True),
        sa.Column('dispatch_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dispatch_notes', sa.String(length=2000), nullable=True),
        sa.Column('withdrawn', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('withdrawn_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('withdrawn_by', sa.String(length=200), nullable=True),
        sa.Column('withdrawn_signature', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(length=200), nullable=True),
        sa.Column('updated_by', sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(['back_cargo_id'], ['travelwiz_back_cargo_manifests.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    # Drop tables
    op.drop_table('travelwiz_yard_dispatches')
    op.drop_table('travelwiz_unloading_discrepancies')
    op.drop_table('travelwiz_vessel_arrivals')
    op.drop_table('travelwiz_cargo_items')
    op.drop_table('travelwiz_back_cargo_manifests')
    op.drop_table('travelwiz_loading_manifests')

    # Drop enum types
    op.execute('DROP TYPE IF EXISTS destinationareaenum')
    op.execute('DROP TYPE IF EXISTS severityenum')
    op.execute('DROP TYPE IF EXISTS yarddispatchstatusenum')
    op.execute('DROP TYPE IF EXISTS vesselarrivalstatusenum')
    op.execute('DROP TYPE IF EXISTS discrepancytypeenum')
    op.execute('DROP TYPE IF EXISTS validationstatusenum')
    op.execute('DROP TYPE IF EXISTS backcargotypeenum')
    op.execute('DROP TYPE IF EXISTS manifeststatusenum')
    op.execute('DROP TYPE IF EXISTS sourcetypeenum')
    op.execute('DROP TYPE IF EXISTS vesseltypeenum')
    op.execute('DROP TYPE IF EXISTS destinationtypeenum')
    op.execute('DROP TYPE IF EXISTS packagingtypeenum')
