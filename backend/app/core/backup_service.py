"""
Service de backup et restore pour la base de données, les fichiers et la configuration.
"""
import os
import json
import shutil
import subprocess
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional
from uuid import UUID

from sqlmodel import Session, select

from app.core.config import settings
from app.models_backup import Backup


logger = logging.getLogger(__name__)


class BackupService:
    """Service pour gérer les backups et restaurations."""

    def __init__(self):
        self.backup_dir = Path("/app/backups")
        self.backup_dir.mkdir(exist_ok=True)

    def create_backup(
        self,
        backup_id: UUID,
        includes_database: bool = True,
        includes_storage: bool = True,
        includes_config: bool = True,
        db_session: Optional[Session] = None,
    ) -> tuple[bool, Optional[str], Optional[dict]]:
        """
        Crée un backup complet du système.

        Returns:
            tuple: (success, file_path, stats)
        """
        try:
            backup_path = self.backup_dir / str(backup_id)
            backup_path.mkdir(exist_ok=True)

            stats = {
                "database_size": 0,
                "storage_size": 0,
                "config_size": 0,
            }

            # 1. Backup de la base de données
            if includes_database:
                db_success, db_size = self._backup_database(backup_path)
                if not db_success:
                    return False, None, None
                stats["database_size"] = db_size

            # 2. Backup du storage
            if includes_storage:
                storage_success, storage_size = self._backup_storage(backup_path)
                if not storage_success:
                    return False, None, None
                stats["storage_size"] = storage_size

            # 3. Backup de la configuration
            if includes_config:
                config_success, config_size = self._backup_config(backup_path, db_session)
                if not config_success:
                    return False, None, None
                stats["config_size"] = config_size

            # 4. Créer une archive compressée
            archive_path = self._create_archive(backup_path, backup_id)

            # 5. Nettoyer le dossier temporaire
            shutil.rmtree(backup_path)

            return True, str(archive_path), stats

        except Exception as e:
            logger.error(f"Error creating backup: {e}")
            return False, None, None

    def _backup_database(self, backup_path: Path) -> tuple[bool, int]:
        """Backup de la base de données PostgreSQL avec pg_dump."""
        try:
            db_file = backup_path / "database.sql"

            # Construire la commande pg_dump
            env = os.environ.copy()
            env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

            cmd = [
                "pg_dump",
                "-h", settings.POSTGRES_SERVER,
                "-p", str(settings.POSTGRES_PORT),
                "-U", settings.POSTGRES_USER,
                "-d", settings.POSTGRES_DB,
                "-F", "c",  # Format custom (compressé)
                "-f", str(db_file),
            ]

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes max
            )

            if result.returncode != 0:
                logger.error(f"pg_dump failed: {result.stderr}")
                return False, 0

            file_size = db_file.stat().st_size
            logger.info(f"Database backup created: {file_size} bytes")
            return True, file_size

        except Exception as e:
            logger.error(f"Database backup failed: {e}")
            return False, 0

    def _backup_storage(self, backup_path: Path) -> tuple[bool, int]:
        """Backup des fichiers uploadés."""
        try:
            storage_dir = Path("/app/storage")
            if not storage_dir.exists():
                logger.warning("Storage directory does not exist")
                return True, 0

            storage_backup = backup_path / "storage"
            shutil.copytree(storage_dir, storage_backup)

            total_size = sum(f.stat().st_size for f in storage_backup.rglob("*") if f.is_file())
            logger.info(f"Storage backup created: {total_size} bytes")
            return True, total_size

        except Exception as e:
            logger.error(f"Storage backup failed: {e}")
            return False, 0

    def _backup_config(self, backup_path: Path, db_session: Optional[Session]) -> tuple[bool, int]:
        """Backup de la configuration depuis la base de données."""
        try:
            if not db_session:
                logger.warning("No database session provided for config backup")
                return True, 0

            from app.models import AppSettings

            # Récupérer les settings
            statement = select(AppSettings)
            settings_obj = db_session.exec(statement).first()

            if settings_obj:
                config_file = backup_path / "config.json"
                config_data = {
                    "app_name": settings_obj.app_name,
                    "environment": settings_obj.environment,
                    "redis_host": settings_obj.redis_host,
                    "redis_port": settings_obj.redis_port,
                    "redis_db": settings_obj.redis_db,
                    "storage_backend": settings_obj.storage_backend,
                    "invitation_expiry_days": settings_obj.invitation_expiry_days,
                    # Ajouter d'autres settings selon les besoins
                }

                with open(config_file, "w") as f:
                    json.dump(config_data, f, indent=2)

                file_size = config_file.stat().st_size
                logger.info(f"Config backup created: {file_size} bytes")
                return True, file_size

            return True, 0

        except Exception as e:
            logger.error(f"Config backup failed: {e}")
            return False, 0

    def _create_archive(self, backup_path: Path, backup_id: UUID) -> Path:
        """Crée une archive tar.gz du backup."""
        archive_path = self.backup_dir / f"{backup_id}.tar.gz"

        shutil.make_archive(
            str(archive_path).replace(".tar.gz", ""),
            "gztar",
            backup_path,
        )

        logger.info(f"Archive created: {archive_path}")
        return archive_path

    def restore_backup(
        self,
        backup_id: UUID,
        restore_database: bool = True,
        restore_storage: bool = True,
        restore_config: bool = True,
        db_session: Optional[Session] = None,
    ) -> tuple[bool, Optional[str]]:
        """
        Restaure un backup.

        Returns:
            tuple: (success, error_message)
        """
        try:
            archive_path = self.backup_dir / f"{backup_id}.tar.gz"
            if not archive_path.exists():
                return False, "Backup file not found"

            # Extraire l'archive
            extract_path = self.backup_dir / f"{backup_id}_restore"
            extract_path.mkdir(exist_ok=True)

            shutil.unpack_archive(archive_path, extract_path)

            # Restaurer selon les options
            if restore_database:
                db_success, db_error = self._restore_database(extract_path)
                if not db_success:
                    shutil.rmtree(extract_path)
                    return False, f"Database restore failed: {db_error}"

            if restore_storage:
                storage_success, storage_error = self._restore_storage(extract_path)
                if not storage_success:
                    shutil.rmtree(extract_path)
                    return False, f"Storage restore failed: {storage_error}"

            if restore_config and db_session:
                config_success, config_error = self._restore_config(extract_path, db_session)
                if not config_success:
                    shutil.rmtree(extract_path)
                    return False, f"Config restore failed: {config_error}"

            # Nettoyer
            shutil.rmtree(extract_path)

            logger.info(f"Backup {backup_id} restored successfully")
            return True, None

        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return False, str(e)

    def _restore_database(self, extract_path: Path) -> tuple[bool, Optional[str]]:
        """Restaure la base de données depuis un backup."""
        try:
            db_file = extract_path / "database.sql"
            if not db_file.exists():
                return True, None  # Pas de DB dans ce backup

            env = os.environ.copy()
            env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

            cmd = [
                "pg_restore",
                "-h", settings.POSTGRES_SERVER,
                "-p", str(settings.POSTGRES_PORT),
                "-U", settings.POSTGRES_USER,
                "-d", settings.POSTGRES_DB,
                "-c",  # Clean (drop) avant restore
                str(db_file),
            ]

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=300,
            )

            if result.returncode != 0:
                logger.error(f"pg_restore failed: {result.stderr}")
                return False, result.stderr

            logger.info("Database restored successfully")
            return True, None

        except Exception as e:
            logger.error(f"Database restore failed: {e}")
            return False, str(e)

    def _restore_storage(self, extract_path: Path) -> tuple[bool, Optional[str]]:
        """Restaure les fichiers storage."""
        try:
            storage_backup = extract_path / "storage"
            if not storage_backup.exists():
                return True, None

            storage_dir = Path("/app/storage")
            if storage_dir.exists():
                shutil.rmtree(storage_dir)

            shutil.copytree(storage_backup, storage_dir)
            logger.info("Storage restored successfully")
            return True, None

        except Exception as e:
            logger.error(f"Storage restore failed: {e}")
            return False, str(e)

    def _restore_config(self, extract_path: Path, db_session: Session) -> tuple[bool, Optional[str]]:
        """Restaure la configuration."""
        try:
            config_file = extract_path / "config.json"
            if not config_file.exists():
                return True, None

            with open(config_file, "r") as f:
                config_data = json.load(f)

            from app.models import AppSettings

            statement = select(AppSettings)
            settings_obj = db_session.exec(statement).first()

            if settings_obj:
                for key, value in config_data.items():
                    if hasattr(settings_obj, key):
                        setattr(settings_obj, key, value)

                db_session.add(settings_obj)
                db_session.commit()

            logger.info("Config restored successfully")
            return True, None

        except Exception as e:
            logger.error(f"Config restore failed: {e}")
            return False, str(e)

    def delete_backup(self, backup_id: UUID) -> bool:
        """Supprime un fichier de backup."""
        try:
            archive_path = self.backup_dir / f"{backup_id}.tar.gz"
            if archive_path.exists():
                archive_path.unlink()
                logger.info(f"Backup {backup_id} deleted")
                return True
            return False

        except Exception as e:
            logger.error(f"Failed to delete backup: {e}")
            return False

    def get_backup_file_size(self, backup_id: UUID) -> Optional[int]:
        """Récupère la taille d'un fichier de backup."""
        try:
            archive_path = self.backup_dir / f"{backup_id}.tar.gz"
            if archive_path.exists():
                return archive_path.stat().st_size
            return None

        except Exception as e:
            logger.error(f"Failed to get backup size: {e}")
            return None

    def estimate_backup_size(
        self,
        includes_database: bool = True,
        includes_storage: bool = True,
        includes_config: bool = True,
    ) -> int:
        """
        Estime la taille d'un backup avant sa création.

        Returns:
            int: Taille estimée en octets
        """
        try:
            total_size = 0

            # 1. Estimer la taille de la base de données
            if includes_database:
                db_size = self._estimate_database_size()
                total_size += db_size
                logger.info(f"Estimated database size: {db_size} bytes")

            # 2. Estimer la taille du storage
            if includes_storage:
                storage_size = self._estimate_storage_size()
                total_size += storage_size
                logger.info(f"Estimated storage size: {storage_size} bytes")

            # 3. Estimer la taille de la configuration (négligeable)
            if includes_config:
                config_size = 1024 * 100  # ~100 KB pour la config
                total_size += config_size
                logger.info(f"Estimated config size: {config_size} bytes")

            # Ajouter 20% de marge pour la compression et les métadonnées
            estimated_size = int(total_size * 1.2)

            logger.info(f"Total estimated backup size: {estimated_size} bytes")
            return estimated_size

        except Exception as e:
            logger.error(f"Error estimating backup size: {e}")
            raise

    def _estimate_database_size(self) -> int:
        """Estime la taille de la base de données."""
        try:
            env = os.environ.copy()
            env["PGPASSWORD"] = settings.POSTGRES_PASSWORD

            # Requête SQL pour obtenir la taille de la base
            query = f"SELECT pg_database_size('{settings.POSTGRES_DB}');"

            cmd = [
                "psql",
                "-h", settings.POSTGRES_SERVER,
                "-p", str(settings.POSTGRES_PORT),
                "-U", settings.POSTGRES_USER,
                "-d", settings.POSTGRES_DB,
                "-t",  # Tuple only (no headers)
                "-c", query
            ]

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True
            )

            # Extraire la taille en octets
            size_str = result.stdout.strip()
            db_size = int(size_str)

            return db_size

        except Exception as e:
            logger.error(f"Error estimating database size: {e}")
            # En cas d'erreur, retourner une estimation par défaut de 100 MB
            return 100 * 1024 * 1024

    def _estimate_storage_size(self) -> int:
        """Estime la taille du dossier storage."""
        try:
            storage_path = Path("/app/storage")
            if not storage_path.exists():
                return 0

            total_size = 0
            for path in storage_path.rglob("*"):
                if path.is_file():
                    total_size += path.stat().st_size

            return total_size

        except Exception as e:
            logger.error(f"Error estimating storage size: {e}")
            return 0

    def get_disk_space(self) -> dict:
        """
        Récupère les informations sur l'espace disque disponible.

        Returns:
            dict: {
                "total": int,  # Total space in bytes
                "used": int,   # Used space in bytes
                "available": int,  # Available space in bytes
                "percent": float  # Percentage used
            }
        """
        try:
            import shutil
            stat = shutil.disk_usage(self.backup_dir)

            return {
                "total": stat.total,
                "used": stat.used,
                "available": stat.free,
                "percent": (stat.used / stat.total) * 100 if stat.total > 0 else 0
            }

        except Exception as e:
            logger.error(f"Error getting disk space: {e}")
            raise


# Instance singleton
backup_service = BackupService()
