"""add_rbac_tables

Revision ID: d2e3f4g5h6i7
Revises: c1d2e3f4g5h6
Create Date: 2025-01-13 11:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd2e3f4g5h6i7'
down_revision: Union[str, None] = 'c1d2e3f4g5h6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create permission table
    op.create_table('permission',
        sa.Column('code', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('module', sa.String(length=50), nullable=False),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_permission_code'),
        sa.UniqueConstraint('external_id')
    )

    op.create_index('ix_permission_code', 'permission', ['code'])
    op.create_index('ix_permission_module', 'permission', ['module'])
    op.create_index('ix_permission_is_default', 'permission', ['is_default'])
    op.create_index(op.f('ix_permission_id'), 'permission', ['id'])
    op.create_index(op.f('ix_permission_external_id'), 'permission', ['external_id'])

    # Create role table
    op.create_table('role',
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('is_system', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_role_code'),
        sa.UniqueConstraint('external_id')
    )

    op.create_index('ix_role_code', 'role', ['code'])
    op.create_index('ix_role_priority', 'role', ['priority'])
    op.create_index('ix_role_is_system', 'role', ['is_system'])
    op.create_index(op.f('ix_role_id'), 'role', ['id'])
    op.create_index(op.f('ix_role_external_id'), 'role', ['external_id'])

    # Create group table
    op.create_table('group',
        sa.Column('code', sa.String(length=50), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.String(length=1000), nullable=True),
        sa.Column('parent_id', sa.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('external_id', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_by_id', sa.UUID(), nullable=True),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('deleted_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['parent_id'], ['group.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code', name='uq_group_code'),
        sa.UniqueConstraint('external_id')
    )

    op.create_index('ix_group_code', 'group', ['code'])
    op.create_index('ix_group_parent_id', 'group', ['parent_id'])
    op.create_index(op.f('ix_group_id'), 'group', ['id'])
    op.create_index(op.f('ix_group_external_id'), 'group', ['external_id'])

    # Create association tables
    op.create_table('user_role_link',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['role_id'], ['role.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('user_id', 'role_id')
    )

    op.create_table('user_permission_link',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['permission_id'], ['permission.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('user_id', 'permission_id')
    )

    op.create_table('role_permission_link',
        sa.Column('role_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['permission_id'], ['permission.id'], ),
        sa.ForeignKeyConstraint(['role_id'], ['role.id'], ),
        sa.PrimaryKeyConstraint('role_id', 'permission_id')
    )

    op.create_table('group_permission_link',
        sa.Column('group_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['group.id'], ),
        sa.ForeignKeyConstraint(['permission_id'], ['permission.id'], ),
        sa.PrimaryKeyConstraint('group_id', 'permission_id')
    )

    op.create_table('user_group_link',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('group_id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['group.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('user_id', 'group_id')
    )

    # Insert default permissions
    op.execute("""
        INSERT INTO permission (id, code, name, description, module, is_default, is_active, created_at, updated_at)
        VALUES
            -- Users module
            (gen_random_uuid(), 'users.read', 'Voir les utilisateurs', 'Permet de consulter la liste des utilisateurs', 'users', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'users.create', 'Créer des utilisateurs', 'Permet de créer de nouveaux utilisateurs', 'users', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'users.update', 'Modifier des utilisateurs', 'Permet de modifier les informations des utilisateurs', 'users', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'users.delete', 'Supprimer des utilisateurs', 'Permet de supprimer des utilisateurs', 'users', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

            -- Settings module
            (gen_random_uuid(), 'settings.read', 'Voir les paramètres', 'Permet de consulter les paramètres de l''application', 'settings', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'settings.update', 'Modifier les paramètres', 'Permet de modifier les paramètres de l''application', 'settings', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

            -- Addresses module
            (gen_random_uuid(), 'addresses.read', 'Voir les adresses', 'Permet de consulter les adresses', 'addresses', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'addresses.create', 'Créer des adresses', 'Permet de créer de nouvelles adresses', 'addresses', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'addresses.update', 'Modifier des adresses', 'Permet de modifier des adresses', 'addresses', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'addresses.delete', 'Supprimer des adresses', 'Permet de supprimer des adresses', 'addresses', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),

            -- RBAC module
            (gen_random_uuid(), 'rbac.read', 'Voir les permissions', 'Permet de consulter les permissions, rôles et groupes', 'rbac', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'rbac.manage', 'Gérer les permissions', 'Permet de créer/modifier/supprimer les permissions, rôles et groupes', 'rbac', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """)

    # Insert default roles
    op.execute("""
        INSERT INTO role (id, code, name, description, is_system, priority, is_active, created_at, updated_at)
        VALUES
            (gen_random_uuid(), 'admin', 'Administrateur', 'Accès complet à toutes les fonctionnalités', true, 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'user', 'Utilisateur', 'Accès de base à l''application', true, 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
            (gen_random_uuid(), 'manager', 'Manager', 'Accès étendu pour la gestion d''équipe', true, 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    """)

    # Assign all permissions to admin role
    op.execute("""
        INSERT INTO role_permission_link (role_id, permission_id, created_at)
        SELECT r.id, p.id, CURRENT_TIMESTAMP
        FROM role r
        CROSS JOIN permission p
        WHERE r.code = 'admin'
    """)

    # Assign default permissions to user role
    op.execute("""
        INSERT INTO role_permission_link (role_id, permission_id, created_at)
        SELECT r.id, p.id, CURRENT_TIMESTAMP
        FROM role r
        CROSS JOIN permission p
        WHERE r.code = 'user' AND p.is_default = true
    """)


def downgrade() -> None:
    op.drop_table('user_group_link')
    op.drop_table('group_permission_link')
    op.drop_table('role_permission_link')
    op.drop_table('user_permission_link')
    op.drop_table('user_role_link')

    op.drop_index(op.f('ix_group_external_id'), table_name='group')
    op.drop_index(op.f('ix_group_id'), table_name='group')
    op.drop_index('ix_group_parent_id', table_name='group')
    op.drop_index('ix_group_code', table_name='group')
    op.drop_table('group')

    op.drop_index(op.f('ix_role_external_id'), table_name='role')
    op.drop_index(op.f('ix_role_id'), table_name='role')
    op.drop_index('ix_role_is_system', table_name='role')
    op.drop_index('ix_role_priority', table_name='role')
    op.drop_index('ix_role_code', table_name='role')
    op.drop_table('role')

    op.drop_index(op.f('ix_permission_external_id'), table_name='permission')
    op.drop_index(op.f('ix_permission_id'), table_name='permission')
    op.drop_index('ix_permission_is_default', table_name='permission')
    op.drop_index('ix_permission_module', table_name='permission')
    op.drop_index('ix_permission_code', table_name='permission')
    op.drop_table('permission')
