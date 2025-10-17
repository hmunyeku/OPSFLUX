"""add_module_management_permissions

Revision ID: ab7cd30d0b00
Revises: 077a8f06f301
Create Date: 2025-10-17 08:12:03.935972

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid
from datetime import datetime


# revision identifiers, used by Alembic.
revision = 'ab7cd30d0b00'
down_revision = '077a8f06f301'
branch_labels = None
depends_on = None


def upgrade():
    # Créer les permissions pour la gestion des modules
    permissions_data = [
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.view',
            'name': 'Voir les modules',
            'description': 'Permet de consulter la liste des modules installés',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.install',
            'name': 'Installer des modules',
            'description': 'Permet d\'installer de nouveaux modules',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.uninstall',
            'name': 'Désinstaller des modules',
            'description': 'Permet de désinstaller des modules existants',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.activate',
            'name': 'Activer/Désactiver des modules',
            'description': 'Permet d\'activer ou désactiver des modules installés',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.configure',
            'name': 'Configurer des modules',
            'description': 'Permet de modifier les paramètres des modules',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
        {
            'id': str(uuid.uuid4()),
            'code': 'modules.update',
            'name': 'Mettre à jour des modules',
            'description': 'Permet de mettre à jour les modules vers de nouvelles versions',
            'module': 'modules',
            'is_default': False,
            'is_active': True,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
        },
    ]

    # Insérer les permissions une par une
    conn = op.get_bind()
    for perm in permissions_data:
        conn.execute(
            sa.text("""
                INSERT INTO permission (id, code, name, description, module, is_default, is_active, created_at, updated_at)
                VALUES (:id, :code, :name, :description, :module, :is_default, :is_active, :created_at, :updated_at)
            """),
            perm
        )


def downgrade():
    # Supprimer les permissions de gestion des modules
    op.execute(
        sa.text("""
            DELETE FROM permission
            WHERE code IN (
                'modules.view',
                'modules.install',
                'modules.uninstall',
                'modules.activate',
                'modules.configure',
                'modules.update'
            )
        """)
    )
