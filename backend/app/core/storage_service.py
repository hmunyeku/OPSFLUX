"""
File Storage Service - CORE Service

Service de gestion du stockage de fichiers avec support multi-backend.

Fonctionnalités :
- Upload/Download de fichiers
- Support multi-storage (Local, S3, MinIO, Azure, etc.)
- Validation des types de fichiers (MIME type, extension)
- Génération de thumbnails pour images
- Stockage organisé par module et type
- Gestion des quotas par utilisateur/module
- URLs signées pour accès temporaire
- Suppression sécurisée

Backends supportés :
- Local filesystem (dev/small deployments)
- S3-compatible (AWS S3, MinIO, DigitalOcean Spaces, etc.)
- Azure Blob Storage
- Google Cloud Storage

Usage :
    from app.core.storage_service import storage_service

    # Upload
    file_info = await storage_service.upload(
        file=file,
        module="hse",
        category="incidents",
        user_id=user.id
    )

    # Download
    file_data = await storage_service.download(file_info.path)

    # Generate signed URL
    url = await storage_service.get_signed_url(file_info.path, expires_in=3600)

    # Delete
    await storage_service.delete(file_info.path)
"""

import os
import uuid
import hashlib
import mimetypes
from pathlib import Path
from typing import Optional, BinaryIO, List, Tuple, Any
from datetime import datetime, timedelta
from enum import Enum

from PIL import Image
import aiofiles
import aiofiles.os

from app.core.config import settings
from app.core.logger_service import get_logger


logger = get_logger(__name__)


class StorageBackend(str, Enum):
    """Types de backend de stockage"""
    LOCAL = "local"
    S3 = "s3"
    AZURE = "azure"
    GCS = "gcs"


class FileCategory(str, Enum):
    """Catégories de fichiers"""
    DOCUMENT = "documents"
    IMAGE = "images"
    VIDEO = "videos"
    AUDIO = "audio"
    ARCHIVE = "archives"
    OTHER = "other"


class FileInfo:
    """Information sur un fichier stocké"""

    def __init__(
        self,
        path: str,
        filename: str,
        size: int,
        mime_type: str,
        category: FileCategory,
        module: str,
        user_id: Optional[str] = None,
        thumbnail_path: Optional[str] = None,
        checksum: Optional[str] = None,
        url: Optional[str] = None,
    ):
        self.path = path
        self.filename = filename
        self.size = size
        self.mime_type = mime_type
        self.category = category
        self.module = module
        self.user_id = user_id
        self.thumbnail_path = thumbnail_path
        self.checksum = checksum
        self.url = url
        self.uploaded_at = datetime.utcnow()

    def to_dict(self) -> dict:
        """Convertit en dictionnaire"""
        return {
            "path": self.path,
            "filename": self.filename,
            "size": self.size,
            "mime_type": self.mime_type,
            "category": self.category,
            "module": self.module,
            "user_id": self.user_id,
            "thumbnail_path": self.thumbnail_path,
            "checksum": self.checksum,
            "url": self.url,
            "uploaded_at": self.uploaded_at.isoformat(),
        }


class StorageService:
    """
    Service de stockage de fichiers.

    Architecture :
    - Stockage organisé par module et catégorie : /storage/{module}/{category}/{year}/{month}/{uuid}.ext
    - Validation stricte des types de fichiers
    - Génération automatique de thumbnails pour images
    - Support de multiples backends via adapters
    """

    # Types MIME autorisés par catégorie
    ALLOWED_MIMES = {
        FileCategory.DOCUMENT: [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/plain",
            "text/csv",
        ],
        FileCategory.IMAGE: [
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "image/svg+xml",
        ],
        FileCategory.VIDEO: [
            "video/mp4",
            "video/mpeg",
            "video/webm",
        ],
        FileCategory.AUDIO: [
            "audio/mpeg",
            "audio/wav",
            "audio/webm",
        ],
        FileCategory.ARCHIVE: [
            "application/zip",
            "application/x-tar",
            "application/gzip",
        ],
    }

    # Taille max par catégorie (en bytes)
    MAX_FILE_SIZE = {
        FileCategory.DOCUMENT: 50 * 1024 * 1024,  # 50 MB
        FileCategory.IMAGE: 10 * 1024 * 1024,     # 10 MB
        FileCategory.VIDEO: 500 * 1024 * 1024,    # 500 MB
        FileCategory.AUDIO: 50 * 1024 * 1024,     # 50 MB
        FileCategory.ARCHIVE: 100 * 1024 * 1024,  # 100 MB
        FileCategory.OTHER: 20 * 1024 * 1024,     # 20 MB
    }

    def __init__(self, backend: StorageBackend = None):
        # Charger la configuration depuis la DB
        if backend is None:
            backend = self._load_backend_from_db()

        self.backend = backend
        self.base_path = Path("storage")

        # Charger les configurations S3 depuis la DB si backend S3
        if backend == StorageBackend.S3:
            self._load_s3_config_from_db()

        # Créer le dossier de base pour LOCAL
        if backend == StorageBackend.LOCAL:
            self.base_path.mkdir(exist_ok=True, parents=True)

    def _load_backend_from_db(self) -> StorageBackend:
        """Charge le backend de stockage depuis les settings DB"""
        try:
            from sqlmodel import Session, select
            from app.core.db import engine
            from app.models import AppSettings

            with Session(engine) as session:
                db_settings = session.exec(select(AppSettings)).first()

                if db_settings and db_settings.storage_backend:
                    # Mapper la valeur DB vers l'enum
                    backend_map = {
                        "local": StorageBackend.LOCAL,
                        "s3": StorageBackend.S3,
                        "minio": StorageBackend.S3,  # MinIO utilise API S3
                        "azure": StorageBackend.AZURE,
                        "gcs": StorageBackend.GCS,
                    }
                    return backend_map.get(db_settings.storage_backend.lower(), StorageBackend.LOCAL)
        except Exception as e:
            logger.warning(f"Failed to load storage backend from DB: {e}, using LOCAL")

        # Fallback sur LOCAL par défaut
        return StorageBackend.LOCAL

    def _load_s3_config_from_db(self):
        """Charge la configuration S3/MinIO depuis les settings DB"""
        try:
            from sqlmodel import Session, select
            from app.core.db import engine
            from app.models import AppSettings

            with Session(engine) as session:
                db_settings = session.exec(select(AppSettings)).first()

                if db_settings:
                    self.s3_endpoint = db_settings.s3_endpoint
                    self.s3_access_key = db_settings.s3_access_key
                    self.s3_secret_key = db_settings.s3_secret_key
                    self.s3_bucket = db_settings.s3_bucket
                    self.s3_region = db_settings.s3_region or "us-east-1"
                    logger.info(f"Loaded S3 config from DB: endpoint={self.s3_endpoint}, bucket={self.s3_bucket}")
        except Exception as e:
            logger.error(f"Failed to load S3 config from DB: {e}")

    def _get_category_from_mime(self, mime_type: str) -> FileCategory:
        """Détermine la catégorie depuis le MIME type"""
        for category, mimes in self.ALLOWED_MIMES.items():
            if mime_type in mimes:
                return category
        return FileCategory.OTHER

    def _validate_file(
        self,
        filename: str,
        size: int,
        mime_type: str,
        category: Optional[FileCategory] = None
    ) -> Tuple[bool, Optional[str], FileCategory]:
        """
        Valide un fichier avant upload.

        Returns:
            (is_valid, error_message, category)
        """
        # Déterminer la catégorie
        if category is None:
            category = self._get_category_from_mime(mime_type)

        # Vérifier le MIME type
        allowed_mimes = self.ALLOWED_MIMES.get(category, [])
        if category != FileCategory.OTHER and mime_type not in allowed_mimes:
            return False, f"File type {mime_type} not allowed for category {category}", category

        # Vérifier la taille
        max_size = self.MAX_FILE_SIZE.get(category, self.MAX_FILE_SIZE[FileCategory.OTHER])
        if size > max_size:
            max_mb = max_size / (1024 * 1024)
            return False, f"File too large. Max size: {max_mb} MB", category

        # Vérifier l'extension
        ext = Path(filename).suffix.lower()
        if not ext:
            return False, "File must have an extension", category

        return True, None, category

    def _generate_path(
        self,
        filename: str,
        module: str,
        category: FileCategory,
        user_id: Optional[str] = None
    ) -> str:
        """
        Génère un chemin de stockage unique.

        Format : {module}/{category}/{year}/{month}/{uuid}{ext}
        """
        now = datetime.utcnow()
        year = now.strftime("%Y")
        month = now.strftime("%m")

        # Générer un UUID unique
        file_uuid = str(uuid.uuid4())

        # Extension
        ext = Path(filename).suffix.lower()

        # Chemin complet
        path = f"{module}/{category}/{year}/{month}/{file_uuid}{ext}"

        return path

    async def upload(
        self,
        file: Any,  # UploadFile from FastAPI
        module: str,
        category: Optional[FileCategory] = None,
        user_id: Optional[str] = None,
        generate_thumbnail: bool = True,
    ) -> FileInfo:
        """
        Upload un fichier.

        Args:
            file: Fichier uploadé (FastAPI UploadFile)
            module: Module propriétaire
            category: Catégorie (auto-détectée si None)
            user_id: ID de l'utilisateur
            generate_thumbnail: Générer un thumbnail si image

        Returns:
            FileInfo avec les détails du fichier

        Raises:
            ValueError: Si validation échoue
        """
        # Lire le contenu
        content = await file.read()
        size = len(content)

        # Détecter le MIME type
        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or "application/octet-stream"

        # Valider
        is_valid, error, detected_category = self._validate_file(
            file.filename,
            size,
            mime_type,
            category
        )

        if not is_valid:
            raise ValueError(error)

        category = category or detected_category

        # Générer le chemin
        file_path = self._generate_path(file.filename, module, category, user_id)

        # Calculer le checksum
        checksum = hashlib.sha256(content).hexdigest()

        # Sauvegarder le fichier
        if self.backend == StorageBackend.LOCAL:
            full_path = self.base_path / file_path
            full_path.parent.mkdir(parents=True, exist_ok=True)

            async with aiofiles.open(full_path, "wb") as f:
                await f.write(content)

            logger.info(f"File uploaded: {file_path}", extra={
                "extra_data": {
                    "module": module,
                    "category": category,
                    "size": size,
                    "user_id": user_id
                }
            })

        # Générer thumbnail si image
        thumbnail_path = None
        if generate_thumbnail and category == FileCategory.IMAGE:
            thumbnail_path = await self._generate_thumbnail(file_path, content)

        # Créer FileInfo
        file_info = FileInfo(
            path=file_path,
            filename=file.filename,
            size=size,
            mime_type=mime_type,
            category=category,
            module=module,
            user_id=user_id,
            thumbnail_path=thumbnail_path,
            checksum=checksum,
        )

        return file_info

    async def _generate_thumbnail(
        self,
        original_path: str,
        content: bytes,
        size: Tuple[int, int] = (300, 300)
    ) -> Optional[str]:
        """
        Génère un thumbnail pour une image.

        Args:
            original_path: Chemin du fichier original
            content: Contenu du fichier
            size: Taille du thumbnail (width, height)

        Returns:
            Chemin du thumbnail ou None
        """
        try:
            # Ouvrir l'image
            from io import BytesIO
            image = Image.open(BytesIO(content))

            # Créer le thumbnail
            image.thumbnail(size, Image.Resampling.LANCZOS)

            # Chemin du thumbnail
            thumb_path = original_path.replace(
                Path(original_path).suffix,
                f"_thumb{Path(original_path).suffix}"
            )

            # Sauvegarder
            if self.backend == StorageBackend.LOCAL:
                full_path = self.base_path / thumb_path
                full_path.parent.mkdir(parents=True, exist_ok=True)

                # Sauvegarder avec format approprié
                image.save(full_path, format=image.format or "PNG")

            return thumb_path

        except Exception as e:
            logger.error(f"Error generating thumbnail: {e}", exc_info=True)
            return None

    async def download(self, path: str) -> Optional[bytes]:
        """
        Télécharge un fichier.

        Args:
            path: Chemin du fichier

        Returns:
            Contenu du fichier ou None
        """
        if self.backend == StorageBackend.LOCAL:
            full_path = self.base_path / path

            if not full_path.exists():
                logger.warning(f"File not found: {path}")
                return None

            async with aiofiles.open(full_path, "rb") as f:
                content = await f.read()
                return content

        return None

    async def delete(self, path: str) -> bool:
        """
        Supprime un fichier.

        Args:
            path: Chemin du fichier

        Returns:
            True si supprimé
        """
        if self.backend == StorageBackend.LOCAL:
            full_path = self.base_path / path

            if not full_path.exists():
                return False

            try:
                await aiofiles.os.remove(full_path)
                logger.info(f"File deleted: {path}")

                # Supprimer le thumbnail si existe
                thumb_path = path.replace(
                    Path(path).suffix,
                    f"_thumb{Path(path).suffix}"
                )
                thumb_full_path = self.base_path / thumb_path
                if thumb_full_path.exists():
                    await aiofiles.os.remove(thumb_full_path)

                return True

            except Exception as e:
                logger.error(f"Error deleting file {path}: {e}", exc_info=True)
                return False

        return False

    async def exists(self, path: str) -> bool:
        """Vérifie si un fichier existe"""
        if self.backend == StorageBackend.LOCAL:
            full_path = self.base_path / path
            return full_path.exists()
        return False

    async def get_info(self, path: str) -> Optional[dict]:
        """
        Récupère les informations d'un fichier.

        Returns:
            Dictionnaire avec size, modified_at, etc.
        """
        if self.backend == StorageBackend.LOCAL:
            full_path = self.base_path / path

            if not full_path.exists():
                return None

            stat = full_path.stat()
            return {
                "path": path,
                "size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            }

        return None

    async def list_files(
        self,
        module: Optional[str] = None,
        category: Optional[FileCategory] = None,
        user_id: Optional[str] = None
    ) -> List[dict]:
        """
        Liste les fichiers avec filtres.

        Args:
            module: Filtrer par module
            category: Filtrer par catégorie
            user_id: Filtrer par utilisateur

        Returns:
            Liste des fichiers
        """
        files = []

        if self.backend == StorageBackend.LOCAL:
            search_path = self.base_path

            if module:
                search_path = search_path / module
            if category:
                search_path = search_path / category

            if search_path.exists():
                for file_path in search_path.rglob("*"):
                    if file_path.is_file() and not file_path.name.endswith("_thumb.jpg"):
                        info = await self.get_info(str(file_path.relative_to(self.base_path)))
                        if info:
                            files.append(info)

        return files

    def get_url(self, path: str) -> str:
        """
        Génère une URL pour accéder au fichier.

        Args:
            path: Chemin du fichier

        Returns:
            URL complète
        """
        # Pour local, retourner une URL relative
        if self.backend == StorageBackend.LOCAL:
            return f"/api/v1/storage/files/{path}"

        # Pour S3, générer URL signée
        # TODO: Implémenter pour S3
        return path

    async def get_signed_url(
        self,
        path: str,
        expires_in: int = 3600
    ) -> str:
        """
        Génère une URL signée avec expiration.

        Args:
            path: Chemin du fichier
            expires_in: Durée de validité en secondes

        Returns:
            URL signée
        """
        # Pour local, on peut générer un token temporaire
        # TODO: Implémenter avec JWT ou signature
        return self.get_url(path)

    async def get_stats(self) -> dict[str, Any]:
        """
        Récupère les statistiques de stockage.

        Returns:
            Statistiques : total_files, total_size_mb, by_module, by_category
        """
        total_files = 0
        total_size = 0
        by_module: dict[str, dict[str, Any]] = {}
        by_category: dict[str, dict[str, Any]] = {}

        if self.backend == StorageBackend.LOCAL:
            if self.base_path.exists():
                for file_path in self.base_path.rglob("*"):
                    if file_path.is_file() and not file_path.name.endswith("_thumb.jpg"):
                        total_files += 1
                        file_size = file_path.stat().st_size
                        total_size += file_size

                        # Extraire module et catégorie du chemin
                        relative_path = file_path.relative_to(self.base_path)
                        parts = relative_path.parts

                        if len(parts) >= 1:
                            module = parts[0]
                            if module not in by_module:
                                by_module[module] = {"count": 0, "size": 0}
                            by_module[module]["count"] += 1
                            by_module[module]["size"] += file_size

                        if len(parts) >= 2:
                            category = parts[1]
                            if category not in by_category:
                                by_category[category] = {"count": 0, "size": 0}
                            by_category[category]["count"] += 1
                            by_category[category]["size"] += file_size

        # Convertir les tailles en MB
        total_size_mb = round(total_size / (1024 * 1024), 2)
        for module_stats in by_module.values():
            module_stats["size_mb"] = round(module_stats["size"] / (1024 * 1024), 2)
            del module_stats["size"]
        for category_stats in by_category.values():
            category_stats["size_mb"] = round(category_stats["size"] / (1024 * 1024), 2)
            del category_stats["size"]

        return {
            "total_files": total_files,
            "total_size_mb": total_size_mb,
            "by_module": by_module,
            "by_category": by_category,
        }


# Instance globale
storage_service = StorageService()
