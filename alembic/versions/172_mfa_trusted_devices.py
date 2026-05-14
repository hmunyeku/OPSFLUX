"""MFA trusted devices : permet de se souvenir d'un appareil pour skip MFA.

Suite #6 MFA admin config — Bastien demande la possibilite d'eviter
le saisie OTP a chaque connexion. Pattern classique "remember this
device for X days".

Comment ca marche :
- Apres MFA verify reussi, si le user a coche "se souvenir", on cree
  une row dans mfa_trusted_devices avec un token hash + expires_at.
- Le clear-text token est envoye au browser dans un cookie HTTP-only
  longue duration (jusqu'a expires_at).
- Au prochain login, si le cookie est present et match une row valide,
  on skip le MFA challenge.

La duree max est controlee par settings.auth.mfa_trust_device_max_days
(scope=tenant). L'utilisateur peut choisir une duree <= max.

Revision ID: 172_mfa_trusted_devices
Revises: 171_announcement_targets_group_page
Create Date: 2026-05-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "172_mfa_trusted_devices"
down_revision: Union[str, None] = "171_announcement_targets_group_page"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mfa_trusted_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        # SHA-256 hash du token clear-text (jamais stocke en clair en BDD)
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "last_used_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        # Metadata pour audit/affichage
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("browser", sa.String(length=100), nullable=True),
        sa.Column("os", sa.String(length=100), nullable=True),
        sa.Column("label", sa.String(length=200), nullable=True),  # nom optionnel
        # Revocation : un user peut revoker un device specifique
        sa.Column(
            "revoked",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "idx_mfa_trusted_devices_user",
        "mfa_trusted_devices",
        ["user_id"],
    )
    op.create_index(
        "idx_mfa_trusted_devices_expires",
        "mfa_trusted_devices",
        ["expires_at"],
    )
    op.create_index(
        "idx_mfa_trusted_devices_token",
        "mfa_trusted_devices",
        ["token_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("idx_mfa_trusted_devices_token", table_name="mfa_trusted_devices")
    op.drop_index("idx_mfa_trusted_devices_expires", table_name="mfa_trusted_devices")
    op.drop_index("idx_mfa_trusted_devices_user", table_name="mfa_trusted_devices")
    op.drop_table("mfa_trusted_devices")
