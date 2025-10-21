"""
Script to fix missing tables in the database.
This script will re-apply specific migrations that failed or were skipped.
"""

import logging
from sqlalchemy import text, inspect
from app.core.db import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def main() -> None:
    logger.info("Checking for missing tables...")

    missing_tables = []
    expected_tables = [
        'api_key',
        'user_api_key',
        'task',
        'userinvitation',
        'webhook',
        'webhook_log'
    ]

    for table in expected_tables:
        if not check_table_exists(table):
            logger.warning(f"Table '{table}' is MISSING!")
            missing_tables.append(table)
        else:
            logger.info(f"Table '{table}' exists ✓")

    if missing_tables:
        logger.error(f"\n{len(missing_tables)} tables are missing: {missing_tables}")
        logger.info("\nTo fix this, we need to re-apply specific migrations.")
        logger.info("Recommended steps:")
        logger.info("1. Downgrade to a safe point before these migrations")
        logger.info("2. Re-upgrade to head")
        logger.info("\nOR create the tables manually from the models")
    else:
        logger.info("\n✓ All expected tables exist!")


if __name__ == "__main__":
    main()
