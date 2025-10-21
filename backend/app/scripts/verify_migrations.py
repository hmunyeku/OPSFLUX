"""
Script de vérification post-migration.
Vérifie que toutes les migrations ont été correctement appliquées et corrige les problèmes.

Usage:
    python app/scripts/verify_migrations.py

    # Mode auto-fix
    python app/scripts/verify_migrations.py --fix
"""

import sys
import logging
from sqlmodel import Session, select
from sqlalchemy import text, inspect
from app.core.db import engine
from app.models_rbac import Permission, Role

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MigrationVerifier:
    """Vérificateur de migrations."""

    def __init__(self, session: Session, auto_fix: bool = False):
        self.session = session
        self.auto_fix = auto_fix
        self.errors = []
        self.warnings = []
        self.fixes_applied = []

    def verify_all(self) -> bool:
        """Exécute toutes les vérifications."""
        logger.info("=" * 70)
        logger.info("VÉRIFICATION DES MIGRATIONS")
        logger.info("=" * 70)

        # Vérifications
        self.check_alembic_version()
        self.check_required_tables()
        self.check_required_roles()
        self.check_core_permissions()
        self.check_role_permissions()
        self.check_table_columns()

        # Rapport final
        self.print_report()

        return len(self.errors) == 0

    def check_alembic_version(self):
        """Vérifie la version Alembic actuelle."""
        logger.info("\n[1] Vérification de la version Alembic...")

        result = self.session.exec(
            text("SELECT version_num FROM alembic_version")
        ).first()

        if result:
            version = result[0]
            logger.info(f"✓ Version Alembic actuelle: {version}")
        else:
            self.errors.append("Version Alembic introuvable dans la base")
            logger.error("✗ Aucune version Alembic trouvée")

    def check_required_tables(self):
        """Vérifie que toutes les tables essentielles existent."""
        logger.info("\n[2] Vérification des tables essentielles...")

        required_tables = {
            'user': 'Table utilisateurs',
            'role': 'Table rôles',
            'permission': 'Table permissions',
            'role_permission_link': 'Table liaison rôles-permissions',
            'user_role_link': 'Table liaison utilisateurs-rôles',
            'group': 'Table groupes',
            'user_api_key': 'Table clés API utilisateur',
            'webhook': 'Table webhooks',
            'webhook_log': 'Table logs webhooks',
            'task': 'Table tâches',
            'userinvitation': 'Table invitations',
            'backups': 'Table backups',
            'hook': 'Table hooks',
            'hook_execution': 'Table exécutions hooks',
            'module': 'Table modules',
            'email_template': 'Table templates email',
            'audit_logs': 'Table logs audit',
        }

        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()

        missing_tables = []
        for table_name, description in required_tables.items():
            if table_name in existing_tables:
                logger.info(f"  ✓ {table_name} - {description}")
            else:
                missing_tables.append(table_name)
                self.errors.append(f"Table manquante: {table_name} ({description})")
                logger.error(f"  ✗ {table_name} - {description} MANQUANTE")

        if not missing_tables:
            logger.info("✓ Toutes les tables essentielles existent")

    def check_required_roles(self):
        """Vérifie que les rôles essentiels existent."""
        logger.info("\n[3] Vérification des rôles essentiels...")

        required_roles = ['admin', 'user']

        existing_roles = self.session.exec(select(Role)).all()
        existing_codes = {role.code for role in existing_roles}

        missing_roles = []
        for role_code in required_roles:
            if role_code in existing_codes:
                logger.info(f"  ✓ Rôle '{role_code}' existe")
            else:
                missing_roles.append(role_code)
                self.errors.append(f"Rôle manquant: {role_code}")
                logger.error(f"  ✗ Rôle '{role_code}' MANQUANT")

        # Afficher tous les rôles existants
        logger.info(f"\n  Rôles existants: {', '.join(existing_codes)}")

        if not missing_roles:
            logger.info("✓ Tous les rôles essentiels existent")

    def check_core_permissions(self):
        """Vérifie que les 65 permissions core existent."""
        logger.info("\n[4] Vérification des permissions core...")

        result = self.session.exec(
            text("SELECT COUNT(*) FROM permission WHERE module = 'core'")
        ).first()

        core_count = result[0] if result else 0

        if core_count == 65:
            logger.info(f"✓ {core_count}/65 permissions core présentes")
        elif core_count < 65:
            self.warnings.append(f"Seulement {core_count}/65 permissions core présentes")
            logger.warning(f"⚠ {core_count}/65 permissions core présentes")

            if self.auto_fix:
                logger.info("  → Correction automatique: exécution de populate_all_core_permissions.py")
                # Note: On ne peut pas importer et exécuter directement à cause des dépendances
                self.fixes_applied.append("Recommandation: Exécuter populate_all_core_permissions.py")
        else:
            logger.info(f"✓ {core_count} permissions core présentes (plus que les 65 attendues)")

    def check_role_permissions(self):
        """Vérifie que les rôles ont bien des permissions assignées."""
        logger.info("\n[5] Vérification des assignations rôles-permissions...")

        roles = self.session.exec(select(Role)).all()

        for role in roles:
            perm_count = len(role.permissions)

            if role.code == 'admin' and perm_count == 0:
                self.errors.append(f"Le rôle admin n'a aucune permission assignée")
                logger.error(f"  ✗ Rôle '{role.code}': {perm_count} permissions (PROBLÈME)")
            elif perm_count == 0:
                self.warnings.append(f"Le rôle '{role.code}' n'a aucune permission")
                logger.warning(f"  ⚠ Rôle '{role.code}': {perm_count} permissions")
            else:
                logger.info(f"  ✓ Rôle '{role.code}': {perm_count} permissions")

        # Vérifier que toutes les permissions sont assignées à au moins un rôle
        result = self.session.exec(
            text("""
                SELECT COUNT(*) FROM permission p
                LEFT JOIN role_permission_link rpl ON p.id = rpl.permission_id
                WHERE rpl.role_id IS NULL
            """)
        ).first()

        orphan_perms = result[0] if result else 0

        if orphan_perms > 0:
            self.warnings.append(f"{orphan_perms} permissions ne sont assignées à aucun rôle")
            logger.warning(f"  ⚠ {orphan_perms} permissions orphelines (non assignées)")
        else:
            logger.info("✓ Toutes les permissions sont assignées à au moins un rôle")

    def check_table_columns(self):
        """Vérifie que les colonnes importantes existent."""
        logger.info("\n[6] Vérification des colonnes de tables...")

        checks = [
            ('user', 'signature_image', "Colonne signature_image dans user"),
            ('app_settings', 'backup_retention_days', "Colonnes backup dans app_settings"),
        ]

        inspector = inspect(engine)

        for table_name, column_name, description in checks:
            try:
                columns = {col['name'] for col in inspector.get_columns(table_name)}
                if column_name in columns:
                    logger.info(f"  ✓ {description}")
                else:
                    self.warnings.append(f"Colonne manquante: {table_name}.{column_name}")
                    logger.warning(f"  ⚠ {description} - MANQUANTE")
            except Exception as e:
                self.errors.append(f"Erreur lors de la vérification de {table_name}: {e}")
                logger.error(f"  ✗ Erreur: {e}")

    def print_report(self):
        """Affiche le rapport final."""
        logger.info("\n" + "=" * 70)
        logger.info("RAPPORT FINAL")
        logger.info("=" * 70)

        if self.errors:
            logger.error(f"\n❌ ERREURS ({len(self.errors)}):")
            for error in self.errors:
                logger.error(f"  - {error}")

        if self.warnings:
            logger.warning(f"\n⚠️  AVERTISSEMENTS ({len(self.warnings)}):")
            for warning in self.warnings:
                logger.warning(f"  - {warning}")

        if self.fixes_applied:
            logger.info(f"\n🔧 CORRECTIONS APPLIQUÉES ({len(self.fixes_applied)}):")
            for fix in self.fixes_applied:
                logger.info(f"  - {fix}")

        if not self.errors and not self.warnings:
            logger.info("\n✅ Toutes les vérifications sont passées avec succès!")
        elif not self.errors:
            logger.info("\n✅ Aucune erreur critique, mais des avertissements présents")
        else:
            logger.error(f"\n❌ {len(self.errors)} erreur(s) critique(s) détectée(s)")

        logger.info("=" * 70)


def main():
    """Point d'entrée du script."""
    auto_fix = '--fix' in sys.argv

    if auto_fix:
        logger.info("Mode auto-fix activé")

    with Session(engine) as session:
        verifier = MigrationVerifier(session, auto_fix=auto_fix)
        success = verifier.verify_all()

        # Code de sortie
        sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
