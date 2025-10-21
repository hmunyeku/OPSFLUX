"""
Script de vérification au démarrage de l'application.
Exécuté automatiquement au lancement du backend.

Vérifie:
- État des migrations Alembic
- Présence des tables essentielles
- Présence des rôles de base
- Présence des permissions core
"""

import sys
import logging
from sqlmodel import Session, select
from sqlalchemy import text, inspect
from app.core.db import engine
from app.models_rbac import Role

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def check_database_connection() -> bool:
    """Vérifie que la connexion à la base de données fonctionne."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("✓ Connexion à la base de données OK")
        return True
    except Exception as e:
        logger.error(f"✗ Échec de connexion à la base de données: {e}")
        return False


def check_alembic_version() -> bool:
    """Vérifie qu'une version Alembic est présente."""
    try:
        with Session(engine) as session:
            result = session.exec(text("SELECT version_num FROM alembic_version")).first()
            if result:
                version = result[0]
                logger.info(f"✓ Version Alembic: {version}")
                return True
            else:
                logger.error("✗ Aucune version Alembic trouvée")
                return False
    except Exception as e:
        logger.error(f"✗ Erreur lors de la vérification Alembic: {e}")
        return False


def check_essential_tables() -> bool:
    """Vérifie que les tables essentielles existent."""
    essential_tables = [
        'user',
        'role',
        'permission',
        'role_permission_link',
        'user_role_link'
    ]

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    missing = [table for table in essential_tables if table not in existing_tables]

    if missing:
        logger.error(f"✗ Tables manquantes: {', '.join(missing)}")
        return False

    logger.info(f"✓ Toutes les tables essentielles présentes ({len(essential_tables)})")
    return True


def check_essential_roles() -> bool:
    """Vérifie que les rôles essentiels existent."""
    try:
        with Session(engine) as session:
            roles = session.exec(select(Role)).all()
            role_codes = {role.code for role in roles}

            if 'admin' not in role_codes or 'user' not in role_codes:
                logger.error(f"✗ Rôles manquants. Présents: {role_codes}")
                return False

            logger.info(f"✓ Rôles essentiels présents: {', '.join(sorted(role_codes))}")
            return True
    except Exception as e:
        logger.error(f"✗ Erreur lors de la vérification des rôles: {e}")
        return False


def check_core_permissions() -> bool:
    """Vérifie qu'il y a des permissions core."""
    try:
        with Session(engine) as session:
            result = session.exec(
                text("SELECT COUNT(*) FROM permission WHERE module = 'core'")
            ).first()

            core_count = result[0] if result else 0

            if core_count == 0:
                logger.error("✗ Aucune permission core trouvée")
                return False
            elif core_count < 65:
                logger.warning(f"⚠ Seulement {core_count}/65 permissions core présentes")
                logger.warning("  → Exécuter: python app/scripts/populate_all_core_permissions.py")
                # On considère ça comme non-bloquant
                return True
            else:
                logger.info(f"✓ {core_count} permissions core présentes")
                return True
    except Exception as e:
        logger.error(f"✗ Erreur lors de la vérification des permissions: {e}")
        return False


def run_startup_checks() -> bool:
    """Exécute toutes les vérifications de démarrage."""
    logger.info("="*70)
    logger.info("VÉRIFICATIONS DE DÉMARRAGE")
    logger.info("="*70)

    checks = [
        ("Connexion base de données", check_database_connection),
        ("Version Alembic", check_alembic_version),
        ("Tables essentielles", check_essential_tables),
        ("Rôles essentiels", check_essential_roles),
        ("Permissions core", check_core_permissions),
    ]

    all_passed = True
    for check_name, check_func in checks:
        try:
            if not check_func():
                all_passed = False
        except Exception as e:
            logger.error(f"✗ Erreur lors de '{check_name}': {e}")
            all_passed = False

    logger.info("="*70)

    if all_passed:
        logger.info("✅ Toutes les vérifications de démarrage sont passées")
        logger.info("="*70)
        return True
    else:
        logger.error("❌ Certaines vérifications ont échoué")
        logger.error("   L'application peut ne pas fonctionner correctement")
        logger.error("   Exécutez: python app/scripts/verify_migrations.py")
        logger.info("="*70)
        # On ne bloque pas le démarrage, on log juste
        return True


def main():
    """Point d'entrée du script."""
    try:
        success = run_startup_checks()
        sys.exit(0 if success else 1)
    except Exception as e:
        logger.error(f"Erreur fatale lors des vérifications: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
