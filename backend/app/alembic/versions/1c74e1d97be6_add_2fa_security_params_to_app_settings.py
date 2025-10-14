"""add_2fa_security_params_to_app_settings

Revision ID: 1c74e1d97be6
Revises: h6i7j8k9l0m1
Create Date: 2025-10-14 22:09:52.646820

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = '1c74e1d97be6'
down_revision = 'h6i7j8k9l0m1'
branch_labels = None
depends_on = None


def upgrade():
    # Ajout des paramètres de sécurité 2FA
    op.add_column('app_settings', sa.Column('twofa_max_attempts', sa.Integer(), nullable=True, server_default='5'))
    op.add_column('app_settings', sa.Column('twofa_sms_timeout_minutes', sa.Integer(), nullable=True, server_default='10'))
    op.add_column('app_settings', sa.Column('twofa_sms_rate_limit', sa.Integer(), nullable=True, server_default='5'))

    # Ajout de la configuration SMS Provider
    op.add_column('app_settings', sa.Column('sms_provider', sa.String(length=50), nullable=True, server_default='twilio'))
    op.add_column('app_settings', sa.Column('sms_provider_account_sid', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('sms_provider_auth_token', sa.String(length=255), nullable=True))
    op.add_column('app_settings', sa.Column('sms_provider_phone_number', sa.String(length=50), nullable=True))


def downgrade():
    # Suppression des colonnes ajoutées
    op.drop_column('app_settings', 'sms_provider_phone_number')
    op.drop_column('app_settings', 'sms_provider_auth_token')
    op.drop_column('app_settings', 'sms_provider_account_sid')
    op.drop_column('app_settings', 'sms_provider')
    op.drop_column('app_settings', 'twofa_sms_rate_limit')
    op.drop_column('app_settings', 'twofa_sms_timeout_minutes')
    op.drop_column('app_settings', 'twofa_max_attempts')
