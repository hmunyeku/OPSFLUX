"""add external_id column to all tables

Revision ID: 20251104_add_external_id
Revises: 21fa56201f3d
Create Date: 2025-11-04 16:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251104_add_external_id'
down_revision = '21fa56201f3d'
branch_labels = None
depends_on = None


def upgrade():
    """Add external_id column to all existing tables that don't have it yet"""

    # Add external_id to all existing tables in public schema
    op.execute("""
        DO $$
        DECLARE
            table_record RECORD;
            has_column BOOLEAN;
        BEGIN
            FOR table_record IN
                SELECT t.table_name
                FROM information_schema.tables t
                WHERE t.table_schema = 'public'
                AND t.table_type = 'BASE TABLE'
                AND t.table_name NOT LIKE 'alembic_version'
                AND t.table_name NOT LIKE '%_link'  -- Skip link tables
            LOOP
                -- Check if column already exists
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns c
                    WHERE c.table_schema = 'public'
                    AND c.table_name = table_record.table_name
                    AND c.column_name = 'external_id'
                ) INTO has_column;

                -- Only add if doesn't exist
                IF NOT has_column THEN
                    EXECUTE format('ALTER TABLE %I ADD COLUMN external_id VARCHAR(255) NULL', table_record.table_name);
                    EXECUTE format('CREATE UNIQUE INDEX ix_%I_external_id ON %I (external_id) WHERE external_id IS NOT NULL', table_record.table_name, table_record.table_name);
                END IF;
            END LOOP;
        END $$;
    """)


def downgrade():
    """Remove external_id column from all tables"""

    # Remove external_id from all tables that have it
    op.execute("""
        DO $$
        DECLARE
            table_record RECORD;
        BEGIN
            FOR table_record IN
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_type = 'BASE TABLE'
                AND table_name NOT LIKE 'alembic_version'
                AND EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = table_record.table_name
                    AND column_name = 'external_id'
                )
            LOOP
                EXECUTE format('DROP INDEX IF EXISTS ix_%I_external_id', table_record.table_name);
                EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS external_id', table_record.table_name);
            END LOOP;
        END $$;
    """)
