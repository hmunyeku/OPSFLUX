"""
Script to create missing tables directly from models.
This bypasses migrations and creates tables using SQLModel metadata.
"""

import logging
from sqlalchemy import text, inspect
from sqlmodel import SQLModel
from app.core.db import engine

# Import all models to register them with SQLModel
from app.models import *  # noqa
from app.models_api_keys import *  # noqa
from app.models_auth import *  # noqa
from app.models_hooks import *  # noqa
from app.models_rbac import *  # noqa
from app.models_modules import *  # noqa
from app.models_i18n import *  # noqa
from app.models_preferences import *  # noqa
from app.models_notifications import *  # noqa
from app.models_audit import *  # noqa
from app.models_backup import *  # noqa
from app.models_bookmarks import *  # noqa
from app.models_email_templates import *  # noqa
from app.models_2fa import *  # noqa
from app.models_address import *  # noqa

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def create_missing_tables() -> None:
    """Create only the missing tables."""
    logger.info("Checking for missing tables...")

    missing_tables = []
    expected_tables = {
        'api_key': 'API Keys table',
        'user_api_key': 'User API Keys table',
        'task': 'Tasks table',
        'userinvitation': 'User Invitations table',
        'webhook': 'Webhooks table',
        'webhook_log': 'Webhook Logs table'
    }

    for table_name, description in expected_tables.items():
        if not check_table_exists(table_name):
            logger.warning(f"Table '{table_name}' ({description}) is MISSING!")
            missing_tables.append(table_name)
        else:
            logger.info(f"Table '{table_name}' exists ✓")

    if missing_tables:
        logger.info(f"\nCreating {len(missing_tables)} missing tables...")

        # Create only the missing tables
        # This will create tables based on the registered SQLModel metadata
        with engine.begin() as connection:
            for table_name in missing_tables:
                for table in SQLModel.metadata.sorted_tables:
                    if table.name == table_name:
                        logger.info(f"Creating table: {table_name}")
                        table.create(connection, checkfirst=True)
                        logger.info(f"✓ Table '{table_name}' created successfully")
                        break
                else:
                    logger.error(f"✗ Table '{table_name}' not found in models!")

        logger.info("\n✓ All missing tables have been created!")
    else:
        logger.info("\n✓ All expected tables already exist!")


def main() -> None:
    try:
        create_missing_tables()
    except Exception as e:
        logger.error(f"Error creating tables: {e}")
        raise


if __name__ == "__main__":
    main()
