"""add_search_index_table

Revision ID: de354b4e000e
Revises: 706bec489af5
Create Date: 2025-10-18 19:03:12.582394

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel.sql.sqltypes


# revision identifiers, used by Alembic.
revision = 'de354b4e000e'
down_revision = '706bec489af5'
branch_labels = None
depends_on = None


def upgrade():
    # Activer les extensions PostgreSQL nécessaires pour la recherche full-text
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")

    # Créer la table search_index
    op.create_table(
        'search_index',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('collection', sa.String(length=100), nullable=False),
        sa.Column('doc_id', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('ts_vector', sa.Text(), nullable=True),  # TSVECTOR stocké comme TEXT
        sa.Column('document', sa.JSON(), nullable=True),
        sa.Column('indexed_at', sa.DateTime(), server_default=sa.text('NOW()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('collection', 'doc_id', name='uq_search_index_collection_doc_id')
    )

    # Créer les indexes pour optimiser les recherches
    op.create_index('idx_search_collection', 'search_index', ['collection'])

    # Index GIN pour ts_vector (recherche full-text)
    op.execute("CREATE INDEX idx_search_ts_vector ON search_index USING GIN(to_tsvector('french', content))")

    # Index GIN pour recherche trigram (fuzzy search)
    op.execute("CREATE INDEX idx_search_content_trgm ON search_index USING GIN(content gin_trgm_ops)")


def downgrade():
    # Supprimer les indexes
    op.execute("DROP INDEX IF EXISTS idx_search_content_trgm")
    op.execute("DROP INDEX IF EXISTS idx_search_ts_vector")
    op.drop_index('idx_search_collection', table_name='search_index')

    # Supprimer la table
    op.drop_table('search_index')

    # Note: On ne supprime pas les extensions car d'autres tables pourraient les utiliser
    # op.execute("DROP EXTENSION IF EXISTS unaccent")
    # op.execute("DROP EXTENSION IF EXISTS pg_trgm")
